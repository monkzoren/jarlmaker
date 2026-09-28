import type { Motion } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { TILE_PX } from '../render/zoom.ts'
import { createNonceSource } from './nonce.ts'
import { createPlay } from './play.ts'
import type { Predictor } from './predict.ts'
import { createSnapshotStore } from './snapshot.ts'
import { createView, sampleAt, type ViewKnobs } from './view.ts'

const KNOBS: ViewKnobs = { dtMs: 100, remoteDelayMs: 200, smoothMs: 100, snapCells: 2 }
const at = (x: number, y = 0): Motion => ({ x, y, vx: 0, vy: 0, facing: 0, sector: '0,0' })
const px = (cells: number) => cells * TILE_PX

describe('view: local player', () => {
  it('draws between the last two predicted ticks', () => {
    const v = createView(KNOBS)
    v.local('1', { motion: at(0), continuation: at(0) }, 0)
    v.local('1', { motion: at(1), continuation: at(1) }, 100)
    expect(v.frame(150).entities).toEqual([{ id: '1', x: px(0.5), y: 0 }])
    expect(v.frame(250).entities).toEqual([{ id: '1', x: px(1), y: 0 }])
  })

  it('smooths a correction: no jump on screen, then it decays onto the server path', () => {
    const v = createView(KNOBS)
    v.local('1', { motion: at(0), continuation: at(0) }, 0)
    v.local('1', { motion: at(1), continuation: at(1) }, 100)
    const before = v.frame(200).entities[0]?.x
    // The server says we are half a cell behind where we would have been.
    v.local('1', { motion: at(1.5), continuation: at(2) }, 200)
    expect(v.frame(200).entities[0]?.x).toBeCloseTo(before ?? NaN, 9)
    // Much later the offset has decayed: the drawing sits on the corrected path.
    v.local('1', { motion: at(1.5), continuation: at(1.5) }, 300)
    expect(v.frame(2000).entities[0]?.x).toBeCloseTo(px(1.5), 3)
  })

  it('snaps a correction longer than snapCells', () => {
    const v = createView(KNOBS)
    v.local('1', { motion: at(0), continuation: at(0) }, 0)
    v.local('1', { motion: at(10), continuation: at(0) }, 100)
    expect(v.frame(100).entities).toEqual([{ id: '1', x: px(10), y: 0 }])
  })
})

describe('view: remote entities', () => {
  it('interpolates server samples with a fixed render delay', () => {
    const v = createView(KNOBS)
    v.server([{ id: 2n, ...at(0) }], undefined, 0)
    v.server([{ id: 2n, ...at(1) }], undefined, 100)
    // Drawn at now - 200 ms.
    expect(v.frame(250).entities).toEqual([{ id: '2', x: px(0.5), y: 0 }])
    expect(v.frame(400).entities).toEqual([{ id: '2', x: px(1), y: 0 }])
  })

  it('holds a remote still at its last server sample while no updates arrive (a dropout, ADR 0008)', () => {
    const v = createView(KNOBS)
    v.server([{ id: 2n, ...at(0) }], undefined, 0)
    v.server([{ id: 2n, ...at(1) }], undefined, 100)
    const held = v.frame(300).entities
    for (const t of [1_000, 5_000, 30_000]) expect(v.frame(t).entities).toEqual(held)
    expect(held).toEqual([{ id: '2', x: px(1), y: 0 }])
  })

  it('never samples the local player as a remote, and forgets entities that left', () => {
    const v = createView(KNOBS)
    v.server([{ id: 1n, ...at(0) }, { id: 2n, ...at(0) }], '1', 0)
    expect(v.frame(0).entities.map((e) => e.id)).toEqual(['2'])
    v.server([], '1', 100)
    expect(v.frame(100).entities).toEqual([])
  })

  it('sampleAt clamps outside the samples and drops the ones it no longer needs', () => {
    const list = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 1, y: 0 },
      { t: 200, x: 2, y: 2 },
    ]
    expect(sampleAt(list, -50)).toEqual({ t: 0, x: 0, y: 0 })
    expect(sampleAt(list, 150)).toEqual({ x: 1.5, y: 1 })
    expect(list).toHaveLength(2)
    expect(sampleAt(list, 999)).toEqual({ t: 200, x: 2, y: 2 })
  })
})

describe('play: the command sink', () => {
  function fakePredictor(log: string[]): Predictor {
    return {
      sent: (n, s) => void log.push(`sent ${n} ${s.ix},${s.iy}`),
      acked: (n, t) => void log.push(`acked ${n}@${t}`),
      refused: (n) => void log.push(`refused ${n}`),
      resync: () => void log.push('resync'),
      advance: () => undefined,
      pending: 0,
      tick: 0,
    }
  }

  it('holds the stick until join, restamps nonces from the shared source, and acks with the clock', async () => {
    const log: string[] = []
    const calls: string[] = []
    const snapshot = createSnapshotStore()
    const clock = [100, 101, 102]
    const play = createPlay({
      move: (n, ix, iy) => {
        calls.push(`move ${n} ${ix},${iy}`)
        return ix < 0 ? Promise.reject(new Error('refused')) : Promise.resolve()
      },
      snapshot,
      predictor: fakePredictor(log),
      view: createView(KNOBS),
      nonces: createNonceSource(() => clock.shift() ?? 0),
      now: () => 0,
      graceMs: 500,
    })
    const cmd = (ix: number, iy: number) => ({ kind: 'entity.move' as const, ix, iy })
    play.sink.send({ nonce: 9, cmd: cmd(1, 0) })
    play.sink.send({ nonce: 10, cmd: cmd(0, 1) })
    expect(calls).toEqual([])
    snapshot.setClock(7)
    play.joined('me')
    play.sink.send({ nonce: 11, cmd: cmd(-1, 0) })
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['move 100 0,1', 'move 101 -1,0'])
    expect(log).toEqual(['resync', 'sent 100 0,1', 'sent 101 -1,0', 'acked 100@7', 'refused 101'])
  })
})
