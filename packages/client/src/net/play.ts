/**
 * The local play loop: input's `CommandSink` over the connection, the
 * prediction tick, and the per-frame view. Every move is stamped with the
 * connection's one nonce source (so `join` and `move` share one strictly
 * increasing counter), sent as the `move` reducer, and kept in the
 * predictor's pending buffer until the server has simulated it.
 */
import type { CommandSink } from '../input/index.ts'
import type { RenderSnapshot } from '../render/index.ts'
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
}

export interface Play {
  /** Give this to `createInput`. */
  readonly sink: CommandSink
  /** The server accepted `join` for `identity`: moves may flow. */
  joined(identity: string): void
  /** One prediction tick; call every `dtMs`. */
  tick(): void
  /** What to draw now. */
  frame(): RenderSnapshot
}

interface Stick {
  readonly ix: number
  readonly iy: number
}

export function createPlay(deps: PlayDeps): Play {
  const { move, snapshot, predictor, view, nonces, now } = deps
  let identity: string | undefined
  let held: Stick | undefined
  let sampledClock = -1

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
        const stick = { ix: envelope.cmd.ix, iy: envelope.cmd.iy }
        if (identity === undefined) held = stick
        else send(stick)
      },
    },
    joined(id) {
      identity = id
      if (held !== undefined) send(held)
      held = undefined
    },
    tick() {
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
      return view.frame(t)
    },
  }
}
