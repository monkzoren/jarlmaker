import { describe, expect, it } from 'vitest'
import type { Command } from '../commands.ts'
import { newStore, TUNING } from '../entity/fixture.test-util.ts'
import { execute } from '../execute.ts'
import { createGame } from '../game.ts'
import { countOf } from '../items/rules.ts'
import type { MemoryStore } from '../store/memory.ts'
import type { Store } from '../store/types.ts'
import { tick } from '../tick.ts'
import { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from '../world/fixture.ts'
import { dayNumber, dayPhase, daylight, stepVitals } from './rules.ts'
import '../items/index.ts'
import './index.ts'

const S = TUNING.survival
const game = createGame({
  tuning: { ...TUNING, world: FLAT_WORLD_TUNING },
  ...FLAT_WORLD_SECTIONS,
  props: [{ id: 'fire', sprite: 'fire', blocks: true, footprint: [1, 1], light: { radius: 3.5, warmthPerSec: 5 } }],
  items: [
    { id: 'berries', name: 'Berries', icon: 'berries', food: 15 },
    { id: 'stone', name: 'Stone', icon: 'stone' },
  ],
})
const DT = 100

let nonce = 0
const run = (store: Store, sender: string, cmd: Command) => execute(game, store, sender, { nonce: ++nonce, cmd })
const vitals = (store: Store, owner = 'ann') => store.get('player_vitals', owner)!

/** Tick until `untilTick`, collecting the ticks of every `player.died`. */
function runUntil(store: MemoryStore, untilTick: number, deaths: number[]): void {
  while ((store.get('world_clock', 'world')?.tick ?? 0) < untilTick) {
    store.clearEvents()
    tick(game, store, DT)
    for (const e of store.events()) if (e.kind === 'player.died') deaths.push(e.tick)
  }
}

/** Tick at which night `n` ends (the dawn midpoint of day n). */
const dawnOf = (n: number) => Math.ceil((n - 1 + S.dawnPhase - S.startPhase) * S.dayTicks)

describe('the day', () => {
  it('starts bright, goes dark at dusk, comes back at dawn, and counts days', () => {
    expect(daylight(0, S)).toBe(1)
    const at = (phase: number) => Math.round((phase - S.startPhase) * S.dayTicks)
    expect(daylight(at(0.5), S)).toBe(1)
    expect(daylight(at(S.duskPhase), S)).toBeCloseTo(0.5, 5)
    expect(daylight(at(0.8), S)).toBe(0)
    expect(daylight(at(S.dawnPhase), S)).toBeCloseTo(0.5, 5)
    expect(daylight(at(0.99), S)).toBe(1)
    expect(dayPhase(at(0.8), S)).toBeCloseTo(0.8, 5)
    expect(dayNumber(0, S)).toBe(1)
    expect(dayNumber(S.dayTicks, S)).toBe(2)
  })

  it('never jumps: daylight changes little from tick to tick', () => {
    for (let t = 0; t < S.dayTicks; t++) expect(Math.abs(daylight(t + 1, S) - daylight(t, S))).toBeLessThan(0.01)
  })
})

describe('stepVitals', () => {
  const full = { hp: 100, warmth: 100, food: 100 }
  it('the night chills, the sun warms, a fire warms more', () => {
    expect(stepVitals(full, 1, 0, 0, S).vitals.warmth).toBeCloseTo(100 + S.nightWarmthPerSec)
    expect(stepVitals({ ...full, warmth: 50 }, 1, 1, 0, S).vitals.warmth).toBeCloseTo(50 + S.dayWarmthPerSec)
    expect(stepVitals({ ...full, warmth: 50 }, 1, 0, 5, S).vitals.warmth).toBeCloseTo(50 + S.nightWarmthPerSec + 5)
  })
  it('cold hurts at zero warmth; warmth and food heal; hunger alone never kills', () => {
    expect(stepVitals({ hp: 50, warmth: 0, food: 100 }, 1, 0, 0, S).vitals.hp).toBeCloseTo(50 - S.coldDamagePerSec)
    expect(stepVitals({ hp: 50, warmth: 80, food: 100 }, 1, 1, 0, S).vitals.hp).toBeCloseTo(50 + S.healPerSec)
    expect(stepVitals({ hp: 50, warmth: 80, food: 0 }, 1, 1, 0, S).vitals.hp).toBe(50)
    const r = stepVitals({ hp: 1, warmth: 0, food: 0 }, 1, 0, 0, S)
    expect([r.vitals.hp, r.died]).toEqual([0, true])
  })
})

describe('survival over the first nights (CLAUDE.md 3.5.7)', () => {
  function joined(): MemoryStore {
    const store = newStore()
    run(store, 'ann', { kind: 'player.join' })
    return store
  }

  it('gives a new player full meters', () => {
    expect(vitals(joined())).toMatchObject({ hp: 100, warmth: 100, food: 100 })
  })

  it('a player by a campfire comes through night 1 unhurt', () => {
    const store = joined()
    store.insert('cell_delta', { key: '1,0', cx: 1, cy: 0, sector: '0,0', prop: 'fire', hits: 0, owner: 'ann' })
    const deaths: number[] = []
    runUntil(store, dawnOf(1), deaths)
    expect(deaths).toEqual([])
    expect(vitals(store).hp).toBe(100)
    expect(vitals(store).warmth).toBe(100)
  })

  it('a player with no fire scrapes through night 1 and dies by night 3', () => {
    const store = joined()
    const deaths: number[] = []
    runUntil(store, dawnOf(1), deaths)
    expect(deaths).toEqual([])
    expect(vitals(store).hp).toBeLessThan(100)
    const pos = store.get('entity_pos', 1n)!
    store.update('entity_pos', { ...pos, x: 5, y: 5 }) // away from the spawn, so the respawn is visible
    runUntil(store, dawnOf(3), deaths)
    expect(deaths.length).toBeGreaterThan(0)
    expect(deaths[0]!).toBeLessThan(dawnOf(3))
    // Respawned on the beach.
    expect(store.get('entity_pos', 1n)).toMatchObject({ x: 0, y: 0 })
  })

  it('eats food from the pack, and refuses what is not food, not held, or when full', () => {
    const store = joined()
    store.insert('inventory', { key: 'ann|berries', owner: 'ann', item: 'berries', count: 1 })
    store.insert('inventory', { key: 'ann|stone', owner: 'ann', item: 'stone', count: 1 })
    expect(run(store, 'ann', { kind: 'player.eat', item: 'berries' })?.code).toBe('full')
    store.update('player_vitals', { ...vitals(store), food: 50 })
    expect(run(store, 'ann', { kind: 'player.eat', item: 'stone' })?.code).toBe('not_food')
    expect(run(store, 'ann', { kind: 'player.eat', item: 'berries' })).toBeUndefined()
    expect(vitals(store).food).toBe(65)
    expect(countOf(store, 'ann', 'berries')).toBe(0)
    expect(run(store, 'ann', { kind: 'player.eat', item: 'berries' })?.code).toBe('none_left')
    expect(run(store, 'bob', { kind: 'player.eat', item: 'berries' })?.code).toBe('not_joined')
  })
})
