// Tick budget (CLAUDE.md 3.4): movement plus survival for 200 walking
// players, a campfire every few players, within 2 ms per tick.

import { describe, expect, it } from 'vitest'
import { fastestTickMs } from '../budget.test-util.ts'
import { entityTick } from '../entity/tick.ts'
import { execute } from '../execute.ts'
import { game, newStore } from '../entity/fixture.test-util.ts'
import { tick } from '../tick.ts'
import { survivalTick } from './tick.ts'
import './index.ts'

const PLAYERS = 200
const BUDGET_MS = 2

describe('survival tick budget', () => {
  it(`updates ${PLAYERS} players' meters alongside movement within ${BUDGET_MS} ms per tick`, () => {
    const store = newStore()
    for (let p = 0; p < PLAYERS; p++) {
      const sender = `player-${p}`
      execute(game, store, sender, { nonce: 1, cmd: { kind: 'player.join' } })
      const a = (p / PLAYERS) * 2 * Math.PI
      execute(game, store, sender, { nonce: 2, cmd: { kind: 'entity.move', ix: Math.cos(a), iy: Math.sin(a) } })
      if (p % 4 === 0) store.insert('cell_delta', { key: `${p},1`, cx: p, cy: 1, sector: '0,0', prop: 'campfire', hits: 0, owner: sender })
    }
    expect([...store.byIndex('player_vitals', 'by_bucket', 0)].length).toBeGreaterThan(0)
    const systems = [entityTick, survivalTick]
    for (let i = 0; i < 20; i++) tick(game, store, 100, { systems })
    const perTick = fastestTickMs(() => tick(game, store, 100, { systems }))
    expect(perTick).toBeLessThan(BUDGET_MS)
  })
})
