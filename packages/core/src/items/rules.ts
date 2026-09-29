// items rules (CLAUDE.md 3.5.4): counting and moving stacks. Pure over the store.

import type { Store } from '../store/types.ts'
import './tables.ts'

export const inventoryKey = (owner: string, item: string): string => `${owner}|${item}`

/** How many of `item` `owner` holds. */
export function countOf(store: Store, owner: string, item: string): number {
  return store.get('inventory', inventoryKey(owner, item))?.count ?? 0
}

/** Add `n` (may be negative) of `item` to `owner`. Throws if that would go below zero. */
export function addItem(store: Store, owner: string, item: string, n: number): void {
  const key = inventoryKey(owner, item)
  const row = store.get('inventory', key)
  const count = (row?.count ?? 0) + n
  if (count < 0) throw new Error(`inventory ${key} would go negative`)
  if (row === undefined) store.insert('inventory', { key, owner, item, count })
  else store.update('inventory', { ...row, count })
}

/** Whether counts from `have` cover `cost` (the client passes its mirrored counts). */
export function affords(have: (item: string) => number, cost: Readonly<Record<string, number>>): boolean {
  return Object.entries(cost).every(([item, n]) => have(item) >= n)
}

/** Whether `owner` holds at least `cost` of every item in it. */
export function canAfford(store: Store, owner: string, cost: Readonly<Record<string, number>>): boolean {
  return affords((item) => countOf(store, owner, item), cost)
}
