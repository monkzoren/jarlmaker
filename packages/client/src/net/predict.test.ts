import { content } from '@bastion/content'
import {
  createGame,
  currentTick,
  execute,
  terrainOf,
  MS_PER_SECOND,
  playerOf,
  step,
  stepKnobs,
  tick,
  type Motion,
  type MoveInput,
} from '@bastion/core'
import { MemoryStore } from '@bastion/core/testing'
import { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from '@bastion/core/testing'
import { describe, expect, it } from 'vitest'
import { createPredictor, type Prediction } from './predict.ts'

// Prediction on open ground: a flat world, so no tree stops the walk.
const game = createGame({ ...content, ...FLAT_WORLD_SECTIONS, tuning: { ...content.tuning, world: FLAT_WORLD_TUNING } })
const dtMs = MS_PER_SECOND / content.tuning.net.tickHz
const SENDER = 'client-a'

type Down =
  | { readonly kind: 'ack'; readonly nonce: number }
  | { readonly kind: 'state'; readonly tick: number; readonly motion: Motion }

/**
 * A fake link to a real core server on MemoryStore: moves reach the server
 * `up(step)` steps after they are sent, and acks and tick states reach the
 * client `down` steps after the server produced them, in order. Each step the
 * server runs one tick; the client runs one local tick.
 */
function run(script: ReadonlyMap<number, MoveInput>, steps: number, up: (step: number) => number, down: number) {
  const store = new MemoryStore()
  expect(execute(game, store, SENDER, { nonce: 1, cmd: { kind: 'player.join' } })).toBeUndefined()
  const player = playerOf(store, SENDER)
  if (player === undefined) throw new Error('no player')
  const motionAt = (): Motion => {
    const row = store.get('entity_pos', player.id)
    if (row === undefined) throw new Error('no pos')
    const { id: _id, ...motion } = row
    return motion
  }

  const predictor = createPredictor({ knobs: stepKnobs(game), dtMs, world: terrainOf(game), maxTicks: 300 })
  const upQueue: { at: number; nonce: number; stick: MoveInput }[] = []
  const downQueue: { at: number; msg: Down }[] = [
    { at: 0, msg: { kind: 'state', tick: currentTick(store), motion: motionAt() } },
  ]
  const serverMotion: Motion[] = [motionAt()]
  const predicted: Prediction[] = []
  let clientClock = 0
  let clientMotion: Motion | undefined
  let nonce = 1

  for (let k = 1; k <= steps; k++) {
    // Server: commit the moves that arrived, then tick.
    while (upQueue.length > 0 && (upQueue[0]?.at ?? Infinity) <= k) {
      const m = upQueue.shift()
      if (m === undefined) break
      const envelope = { nonce: m.nonce, cmd: { kind: 'entity.move' as const, ...m.stick } }
      expect(execute(game, store, SENDER, envelope)).toBeUndefined()
      downQueue.push({ at: k + down, msg: { kind: 'ack', nonce: m.nonce } })
    }
    tick(game, store, dtMs)
    serverMotion[currentTick(store)] = motionAt()
    downQueue.push({ at: k + down, msg: { kind: 'state', tick: currentTick(store), motion: motionAt() } })

    // Client: apply what arrived, in order, then send input and run a local tick.
    while (downQueue.length > 0 && (downQueue[0]?.at ?? Infinity) <= k) {
      const d = downQueue.shift()?.msg
      if (d?.kind === 'ack') predictor.acked(d.nonce, clientClock)
      if (d?.kind === 'state') {
        clientClock = d.tick
        clientMotion = d.motion
      }
    }
    const stick = script.get(k)
    if (stick !== undefined) {
      nonce += 1
      predictor.sent(nonce, stick)
      upQueue.push({ at: k + up(k), nonce, stick })
    }
    const p = predictor.advance(clientMotion === undefined ? undefined : { tick: clientClock, motion: clientMotion })
    if (p === undefined) throw new Error('no prediction')
    predicted[predictor.tick] = p
  }
  return { predicted, serverMotion, predictor }
}

// Walk right, turn diagonally, stop, walk up-left: changes on odd ticks, some
// shorter than the latency so several moves are in flight at once.
const SCRIPT = new Map<number, MoveInput>([
  [3, { ix: 1, iy: 0 }],
  [9, { ix: 0.6, iy: 0.8 }],
  [11, { ix: 0, iy: 0 }],
  [12, { ix: -1, iy: -1 }],
  [30, { ix: 0, iy: 0 }],
])

describe('prediction against a fake server running core', () => {
  it('matches the server with zero divergence for an identical input stream', () => {
    const up = 3
    const { predicted, serverMotion } = run(SCRIPT, 60, () => up, 4)
    let compared = 0
    for (let local = 1; local < predicted.length; local++) {
      const server = serverMotion[local + up]
      const p = predicted[local]
      if (server === undefined || p === undefined) continue
      // What the client showed at local tick L is exactly what the server
      // computes `up` ticks later, bit for bit.
      expect(p.motion).toEqual(server)
      // And no server update ever had to correct it.
      expect(p.continuation).toEqual(p.motion)
      compared++
    }
    expect(compared).toBeGreaterThan(50)
    // The walk really moved.
    expect(serverMotion.at(-1)?.x).not.toBe(0)
  })

  it('empties the pending buffer once the server has simulated every move', () => {
    const { predictor } = run(SCRIPT, 60, () => 3, 4)
    expect(predictor.pending).toBe(0)
  })

  it('reconciles back to zero divergence after the latency changes', () => {
    // Latency jumps from 2 to 5 ticks for moves sent after tick 10.
    const up = (k: number) => (k <= 10 ? 2 : 5)
    const { predicted, serverMotion } = run(SCRIPT, 60, up, 3)
    const corrected = predicted.filter((p) => p !== undefined && (p.continuation.x !== p.motion.x || p.continuation.y !== p.motion.y))
    expect(corrected.length).toBeGreaterThan(0)
    // Once the last move is acked (sent at 30, +5 up, +3 down), prediction is exact again.
    for (let local = 40; local < predicted.length; local++) {
      const server = serverMotion[local + 5]
      if (server === undefined) continue
      expect(predicted[local]?.motion).toEqual(server)
    }
  })

  it('drops a refused move from the pending buffer', () => {
    const predictor = createPredictor({ knobs: stepKnobs(game), dtMs, world: terrainOf(game), maxTicks: 300 })
    predictor.sent(5, { ix: 1, iy: 0 })
    expect(predictor.pending).toBe(1)
    predictor.refused(5)
    expect(predictor.pending).toBe(0)
  })

  it('resync forgets the old server timing, so the first move after a frozen dropout predicts at once (ADR 0008)', () => {
    const knobs = stepKnobs(game)
    const predictor = createPredictor({ knobs, dtMs, world: terrainOf(game), maxTicks: 300 })
    const rest = { x: 3, y: 4, vx: 0, vy: 0, facing: 0, sector: '0,0' }
    predictor.sent(1, { ix: 0, iy: 0 })
    predictor.acked(1, 0)
    for (let t = 0; t < 5; t++) predictor.advance({ tick: t, motion: rest })
    // Frozen while the server ran 40 more ticks; then the reconnect.
    predictor.resync()
    const up = { ix: 0, iy: -1 }
    predictor.sent(2, up)
    const p = predictor.advance({ tick: 45, motion: rest })
    expect(p?.motion).toEqual(step(rest, up, dtMs, terrainOf(game), knobs))
    expect(predictor.pending).toBe(1)
  })
})
