/**
 * Local-player prediction (CLAUDE.md 3.4 Client, ADR 0001). The only
 * simulation on the client, and it is core's `step`, called with the knobs
 * and tick length the server uses. This file does no movement math itself.
 *
 * The server keeps each player's last move stick and integrates it once per
 * tick. The client runs its own fixed ticks at the same rate and records the
 * stick it used for each one. A move the server has committed (the reducer
 * acked) takes effect on the server tick after the `world_clock` tick the
 * client held when the ack arrived; that pins how far the server runs behind
 * the client (`lead`, in ticks). Each local tick then:
 *
 *   predicted = the server's own motion at its clock tick T,
 *               stepped through every local tick the server has not yet run
 *               (local ticks after T - lead) with the stick used for each.
 *
 * So every server update resets prediction to the authoritative state and
 * re-applies the pending inputs on top. With a steady link the result is
 * exactly the server's future motion (the fake-server test proves it).
 */
import { clampInput, step, type Motion, type MoveInput, type StepKnobs, type WorldView } from '@bastion/core'

/** The server's view of the local player: its `entity_pos` row at clock tick `tick`. */
export interface ServerMotion {
  readonly tick: number
  readonly motion: Motion
}

export interface PredictorOptions {
  /** `stepKnobs(game)`: exactly what the server tick passes to `step`. */
  readonly knobs: StepKnobs
  /** One tick, ms: `1000 / tuning.net.tickHz`, the server's fixed `dtMs`. */
  readonly dtMs: number
  readonly world: WorldView
  /** Most local ticks kept for replay; older ones are dropped. */
  readonly maxTicks: number
}

export interface Predictor {
  /** A move was sent now; the local sim uses it from the next local tick. */
  sent(nonce: number, stick: MoveInput): void
  /** The server committed the move `nonce` while the client's world clock read `serverTick`. */
  acked(nonce: number, serverTick: number): void
  /** The server refused the move `nonce`; it never takes effect there. */
  refused(nonce: number): void
  /** Run one local tick and return the prediction, or undefined before the player has a row. */
  advance(server: ServerMotion | undefined): Prediction | undefined
  /** Sent moves the server has not yet simulated (unacked, or acked but not yet reached by its clock). */
  readonly pending: number
  /** Local tick counter; the first `advance` runs tick 1. */
  readonly tick: number
}

export interface Prediction {
  /** The reconciled prediction for this local tick. */
  readonly motion: Motion
  /**
   * Where the previous prediction would have gone this tick without the new
   * server state. `continuation - motion` is the correction the view smooths.
   */
  readonly continuation: Motion
}

interface SentMove {
  readonly nonce: number
  /** First local tick that used this stick. */
  readonly local: number
  /** First server tick that uses it, once acked. */
  from?: number
}

interface TickInput {
  readonly local: number
  readonly stick: MoveInput
}

const AT_REST: MoveInput = { ix: 0, iy: 0 }

export function createPredictor(options: PredictorOptions): Predictor {
  const { knobs, dtMs, world, maxTicks } = options
  let local = 0
  // What the server stores for this stick: `entity.move` clamps before it saves.
  let stick = AT_REST
  let history: TickInput[] = []
  let moves: SentMove[] = []
  /** Server tick minus local tick for the latest acked move. */
  let lead: number | undefined
  let serverTick = 0
  let last: Motion | undefined

  /** First local tick the server state at `t` has not simulated yet. */
  function replayFrom(t: number): number {
    if (lead !== undefined) return t - lead + 1
    const first = moves[0]
    return first === undefined ? local + 1 : first.local
  }

  return {
    sent(nonce, input) {
      stick = clampInput(input)
      moves.push({ nonce, local: local + 1 })
    },
    acked(nonce, tick) {
      const move = moves.find((m) => m.nonce === nonce)
      if (move === undefined) return
      move.from = tick + 1
      lead = move.from - move.local
    },
    refused(nonce) {
      moves = moves.filter((m) => m.nonce !== nonce)
    },
    advance(server) {
      local += 1
      history.push({ local, stick })
      if (history.length > maxTicks) history = history.slice(history.length - maxTicks)
      if (server === undefined) return undefined

      serverTick = server.tick
      const start = replayFrom(server.tick)
      history = history.filter((h) => h.local >= start)
      moves = moves.filter((m) => m.from === undefined || m.from > server.tick)

      let m = server.motion
      for (const h of history) m = step(m, h.stick, dtMs, world, knobs)
      const continuation = last === undefined ? m : step(last, stick, dtMs, world, knobs)
      last = m
      return { motion: m, continuation }
    },
    get pending() {
      return moves.filter((m) => m.from === undefined || m.from > serverTick).length
    },
    get tick() {
      return local
    },
  }
}
