import { describe, expect, it } from 'vitest'
import { newStore } from '../entity/fixture.test-util.ts'
import { addItem, affords, canAfford, countOf } from './rules.ts'

describe('inventory', () => {
  it('counts, adds and takes away stacks per owner', () => {
    const store = newStore()
    expect(countOf(store, 'ann', 'wood')).toBe(0)
    addItem(store, 'ann', 'wood', 3)
    addItem(store, 'ann', 'wood', 2)
    addItem(store, 'bob', 'wood', 1)
    addItem(store, 'ann', 'wood', -4)
    expect(countOf(store, 'ann', 'wood')).toBe(1)
    expect(countOf(store, 'bob', 'wood')).toBe(1)
    expect([...store.byIndex('inventory', 'by_owner', 'ann')].map((r) => r.item)).toEqual(['wood'])
  })

  it('never goes below zero', () => {
    const store = newStore()
    addItem(store, 'ann', 'stone', 1)
    expect(() => addItem(store, 'ann', 'stone', -2)).toThrow(/negative/)
    expect(countOf(store, 'ann', 'stone')).toBe(1)
  })

  it('knows what a cost is covered by', () => {
    const store = newStore()
    addItem(store, 'ann', 'wood', 5)
    addItem(store, 'ann', 'stone', 2)
    expect(canAfford(store, 'ann', { wood: 5, stone: 2 })).toBe(true)
    expect(canAfford(store, 'ann', { wood: 5, stone: 3 })).toBe(false)
    expect(affords(() => 0, {})).toBe(true)
    expect(affords((i) => (i === 'wood' ? 9 : 0), { wood: 1, stone: 1 })).toBe(false)
  })
})
