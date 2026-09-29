import { describe, expect, it } from 'vitest'
import { newStore, TUNING } from '../entity/fixture.test-util.ts'
import type { Command } from '../commands.ts'
import { execute } from '../execute.ts'
import { createGame } from '../game.ts'
import { countOf } from '../items/rules.ts'
import { tick } from '../tick.ts'
import type { Store } from '../store/types.ts'
import { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from './fixture.ts'
import { liveWorld, storeDeltas, terrainOf } from './rules.ts'
import '../items/index.ts'
import '../structures/index.ts'
import './commands.ts'

// A flat world with a pine at (1, 0), a rock at (0, 2) and a boulder at (-1, 0).
const game = createGame({
  tuning: { ...TUNING, world: FLAT_WORLD_TUNING },
  ...FLAT_WORLD_SECTIONS,
  props: [
    { id: 'pine', sprite: 'pine', blocks: true, footprint: [1, 1], harvest: { item: 'wood', hits: 3, leaves: 'stump' } },
    { id: 'stump', sprite: 'stump', blocks: false, footprint: [1, 1] },
    { id: 'rock', sprite: 'rock', blocks: true, footprint: [1, 1], harvest: { item: 'stone', hits: 2, leaves: '' } },
    { id: 'fire', sprite: 'fire', blocks: true, footprint: [1, 1] },
  ],
  landmarks: [
    { id: 'p', prop: 'pine', cx: 1, cy: 0 },
    { id: 'r', prop: 'rock', cx: 0, cy: 2 },
  ],
  items: [
    { id: 'wood', name: 'Wood', icon: 'wood' },
    { id: 'stone', name: 'Stone', icon: 'stone' },
  ],
  structures: [{ id: 'campfire', name: 'Campfire', prop: 'fire', cost: { wood: 2, stone: 1 } }],
})

let nonce = 0
function run(store: Store, sender: string, cmd: Command) {
  return execute(game, store, sender, { nonce: ++nonce, cmd })
}
function wait(store: Store, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(game, store, 100)
}
const live = (store: Store) => liveWorld(terrainOf(game), storeDeltas(store))

/** A joined player standing in cell (0, 0). */
function setup(): Store {
  const store = newStore()
  run(store, 'ann', { kind: 'player.join' })
  const pos = store.get('entity_pos', 1n)!
  store.update('entity_pos', { ...pos, x: 0.5, y: 0.5 })
  return store
}

// Landmarks mark their cells as covered, so for harvest tests the props are
// planted as deltas instead (a natural prop, as flora would be).
function plant(store: Store, cx: number, cy: number, prop: string): void {
  store.insert('cell_delta', { key: `${cx},${cy}`, cx, cy, sector: '0,0', prop, hits: 0, owner: '' })
}

describe('world.harvest', () => {
  it('fells a pine in three hits for three wood, leaving a walkable stump', () => {
    const store = setup()
    plant(store, 1, 1, 'pine')
    expect(live(store).walkable(1, 1)).toBe(false)
    for (let i = 0; i < 3; i++) {
      expect(run(store, 'ann', { kind: 'world.harvest', cx: 1, cy: 1 })).toBeUndefined()
      wait(store, 3)
    }
    expect(countOf(store, 'ann', 'wood')).toBe(3)
    expect(live(store).cell(1, 1).prop?.id).toBe('stump')
    expect(live(store).walkable(1, 1)).toBe(true)
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 1, cy: 1 })?.code).toBe('nothing_to_harvest')
  })

  it('breaks a rock to nothing', () => {
    const store = setup()
    plant(store, -1, 0, 'rock')
    run(store, 'ann', { kind: 'world.harvest', cx: -1, cy: 0 })
    wait(store, 3)
    run(store, 'ann', { kind: 'world.harvest', cx: -1, cy: 0 })
    expect(countOf(store, 'ann', 'stone')).toBe(2)
    expect(live(store).cell(-1, 0).prop).toBeUndefined()
  })

  it('refuses hits too far away, too fast, before joining, or on nothing', () => {
    const store = setup()
    plant(store, 1, 1, 'pine')
    plant(store, 5, 5, 'pine')
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 5, cy: 5 })?.code).toBe('out_of_reach')
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 1, cy: 1 })).toBeUndefined()
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 1, cy: 1 })?.code).toBe('cooldown')
    expect(run(store, 'bob', { kind: 'world.harvest', cx: 1, cy: 1 })?.code).toBe('not_joined')
    wait(store, 3)
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 0, cy: 1 })?.code).toBe('nothing_to_harvest')
    expect(countOf(store, 'ann', 'wood')).toBe(1)
  })

  it('never harvests a landmark', () => {
    const store = setup()
    expect(run(store, 'ann', { kind: 'world.harvest', cx: 1, cy: 0 })?.code).toBe('nothing_to_harvest')
  })
})

describe('structure.build', () => {
  function rich(): Store {
    const store = setup()
    store.insert('inventory', { key: 'ann|wood', owner: 'ann', item: 'wood', count: 3 })
    store.insert('inventory', { key: 'ann|stone', owner: 'ann', item: 'stone', count: 1 })
    return store
  }

  it('builds a campfire for its cost, and the fire blocks its cell', () => {
    const store = rich()
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: 0, cy: 1 })).toBeUndefined()
    expect(countOf(store, 'ann', 'wood')).toBe(1)
    expect(countOf(store, 'ann', 'stone')).toBe(0)
    const c = live(store).cell(0, 1)
    expect([c.prop?.id, c.owner, c.walkable]).toEqual(['fire', 'ann', false])
  })

  it('refuses an unknown def, the cell you stand on, an occupied cell, far away, or when poor', () => {
    const store = rich()
    plant(store, 1, 1, 'pine')
    expect(run(store, 'ann', { kind: 'structure.build', def: 'castle', cx: 0, cy: 1 })?.code).toBe('unknown_structure')
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: 0, cy: 0 })?.code).toBe('occupied')
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: 1, cy: 1 })?.code).toBe('blocked')
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: 4, cy: 0 })?.code).toBe('out_of_reach')
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: 0, cy: 1 })).toBeUndefined()
    expect(run(store, 'ann', { kind: 'structure.build', def: 'campfire', cx: -1, cy: 1 })?.code).toBe('cannot_afford')
  })

  it('lets a player walk out of a cell something was built on', () => {
    const store = rich()
    // Put the fire under ann directly: movement must still let her out.
    store.insert('cell_delta', { key: '0,0', cx: 0, cy: 0, sector: '0,0', prop: 'fire', hits: 0, owner: 'bob' })
    run(store, 'ann', { kind: 'entity.move', ix: -1, iy: 0 })
    wait(store, 10)
    expect(store.get('entity_pos', 1n)!.x).toBeLessThan(0)
  })
})
