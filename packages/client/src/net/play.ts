/**
 * The local play loop: input's `CommandSink` over the connection, the
 * prediction tick, and the per-frame view. Every move is stamped with the
 * connection's one nonce source (so `join` and `move` share one strictly
 * increasing counter), sent as the `move` reducer, and kept in the
 * predictor's pending buffer until the server has simulated it.
 *
 * Movement freezes while disconnected (ADR 0008). Stick changes made while
 * dropped are not sent, only remembered; `graceMs` after the drop the own
 * player stops predicting and holds still. On `joined` the predictor resyncs
 * to the server and the current stick is sent once, so the walk continues
 * from the server's position and nothing snaps back.
 *
 * A tunnel is silent for seconds before the reconnector declares the drop
 * (`reconnectSilenceMs`), so the freeze also starts after `graceMs` with no
 * server traffic at all (P0-046). Moves are not sent while it is that quiet.
 * When traffic resumes on the same link, it is handled like a join: resync,
 * then the current stick once.
 */
import type { CommandSink } from '../input/index.ts'
import type { RenderSnapshot } from '../render/index.ts'
import { TILE_PX } from '../render/zoom.ts'
import type { NonceSource } from './nonce.ts'
import type { Predictor } from './predict.ts'
import type { SnapshotStore } from './snapshot.ts'
import type { View } from './view.ts'

export interface PlayDeps {
  readonly move: (nonce: number, ix: number, iy: number) => Promise<void>
  readonly snapshot: SnapshotStore
  readonly predictor: Predictor
  readonly view: View
  readonly nonces: NonceSource
  readonly now: () => number
  /** `tuning.net.offlineMoveGraceMs`: how long the own player still predicts after a drop or the last server traffic. */
  readonly graceMs: number
}

export interface Play {
  /** Give this to `createInput`. */
  readonly sink: CommandSink
  /** The server accepted `join` for `identity`: moves may flow. Fires after every (re)connect. */
  joined(identity: string): void
  /** The connection dropped: stop sending moves, and freeze after the grace period. */
  dropped(): void
  /** Any server traffic (a subscribed row, including `world_clock`): restarts the silence grace period. */
  heard(): void
  /** One prediction tick; call every `dtMs`. */
  tick(): void
  /** What to draw now. */
  frame(): RenderSnapshot
  /** Where the last frame drew the local player, in cells (the smoke suite reads it). */
  drawn(): { readonly x: number; readonly y: number } | undefined
}

interface Stick {
  readonly ix: number
  readonly iy: number
}

export function createPlay(deps: PlayDeps): Play {
  const { move, snapshot, predictor, view, nonces, now, graceMs } = deps
  let identity: string | undefined
  /** The latest stick from input, sent or not. */
  let current: Stick | undefined
  let online = false
  let droppedAt: number | undefined
  let heardAt: number | undefined
  let sampledClock = -1
  let last: RenderSnapshot | undefined

  /** No server traffic for the grace period: the link may be dead before the reconnector knows it. */
  const quiet = (): boolean => heardAt !== undefined && now() - heardAt >= graceMs
  const resume = (): void => {
    predictor.resync()
    if (current !== undefined) send(current)
  }

  const send = (stick: Stick): void => {
    const nonce = nonces.next()
    predictor.sent(nonce, stick)
    move(nonce, stick.ix, stick.iy).then(
      // Runs in the microtask the SDK queued for this ack, before any later
      // `world_clock` value from the same frame lands (connection.ts).
      () => predictor.acked(nonce, snapshot.clock),
      () => predictor.refused(nonce),
    )
  }

  return {
    sink: {
      send(envelope) {
        current = { ix: envelope.cmd.ix, iy: envelope.cmd.iy }
        if (online && !quiet()) send(current)
      },
    },
    joined(id) {
      identity = id
      online = true
      droppedAt = undefined
      heardAt = now()
      resume()
    },
    dropped() {
      if (!online) return
      online = false
      droppedAt = now()
    },
    heard() {
      const wasQuiet = quiet()
      heardAt = now()
      // After a drop, `joined` resumes; before one, the link came back by itself.
      if (wasQuiet && online) resume()
    },
    tick() {
      if (quiet() || (droppedAt !== undefined && now() - droppedAt >= graceMs)) return
      const own = identity === undefined ? undefined : snapshot.playerPos(identity)
      const p = predictor.advance(own === undefined ? undefined : { tick: snapshot.clock, motion: own })
      if (own !== undefined && p !== undefined) view.local(String(own.id), p, now())
    },
    frame() {
      const t = now()
      if (snapshot.clock !== sampledClock) {
        sampledClock = snapshot.clock
        const own = identity === undefined ? undefined : snapshot.playerPos(identity)
        view.server(snapshot.positions(), own === undefined ? undefined : String(own.id), t)
      }
      last = view.frame(t)
      return last
    },
    drawn() {
      const own = identity === undefined ? undefined : snapshot.playerPos(identity)
      const e = own === undefined ? undefined : last?.entities.find((r) => r.id === String(own.id))
      return e === undefined ? undefined : { x: e.x / TILE_PX, y: e.y / TILE_PX }
    },
  }
}
