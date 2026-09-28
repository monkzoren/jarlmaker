// Tick budget (CLAUDE.md 3.4): the whole tick gets <= 2 ms for 200 online
// players at 10 Hz. Movement is the only per-tick work in P0, so it must fit
// the whole budget with every player walking.

import { describe, expect, it } from 'vitest'
import { execute } from '../execute.ts'
import { tick } from '../tick.ts'
import { game, newStore } from './fixture.test-util.ts'
import { entityTick } from './tick.ts'

const PLAYERS = 200
const DT = 100
const BUDGET_MS = 2
const WARMUP = 20
// Measured over many ticks: Date.now() is ms-resolution (core has no DOM/node types).
const TICKS = 200
// The budget is checked against the fastest of several batches. Scheduler noise
// on a shared runner only ever adds time, so the minimum is the closest reading
// of the tick's real cost; a genuinely slow tick is slow in every batch.
const BATCHES = 5

describe('entity tick budget', () => {
  it(`moves ${PLAYERS} walking players within ${BUDGET_MS} ms per tick`, () => {
    const store = newStore()
    for (let p = 0; p < PLAYERS; p += 1) {
      const sender = `player-${p}`
      execute(game, store, sender, { nonce: 1, cmd: { kind: 'player.join' } })
      const a = (p / PLAYERS) * 2 * Math.PI
      execute(game, store, sender, { nonce: 2, cmd: { kind: 'entity.move', ix: Math.cos(a), iy: Math.sin(a) } })
    }
    const systems = [entityTick]
    for (let i = 0; i < WARMUP; i += 1) tick(game, store, DT, { systems })
    let perTick = Infinity
    for (let b = 0; b < BATCHES; b += 1) {
      const start = Date.now()
      for (let i = 0; i < TICKS; i += 1) tick(game, store, DT, { systems })
      perTick = Math.min(perTick, (Date.now() - start) / TICKS)
    }
    expect([...store.byIndex('entity_input', 'by_moving', true)]).toHaveLength(PLAYERS)
    expect(perTick).toBeLessThan(BUDGET_MS)
  })
})
