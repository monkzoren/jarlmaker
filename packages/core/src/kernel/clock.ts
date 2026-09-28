// The world clock (CLAUDE.md 3.4 The tick). One row holds the number of the
// current tick; every GameEvent's `tick` is read from it. `tick()` advances it
// once per call, before any system runs, so systems see the tick they are in.
// Commands between ticks see the last tick's number. A fresh store has no row
// yet and reads as tick 0, the tick before the first `tick()`.
//
// Hosts count the same way: a replay script's Nth `tick` step (P0-017) runs
// tick N.

import { z } from 'zod'
import type { Store } from '../store/types.ts'
import { defineTable, registerTables } from '../store/tables.ts'
// The clock's rate lives in the `net` tuning section; every host that ticks
// loads this module, so this import registers `net` for all of them.
import './net.ts'

/** The singleton row's primary key. */
const CLOCK_ID = 'world'

export const worldClock = defineTable({
  name: 'world_clock',
  row: z.object({ id: z.string(), tick: z.int().nonnegative() }),
  pk: 'id',
})
registerTables(worldClock)

declare module '../store/tables.ts' {
  interface TableRegistry {
    world_clock: typeof worldClock
  }
}

/** The current tick number: 0 on a fresh store, then the number of `tick()` calls so far. */
export function currentTick(store: Store): number {
  return store.get('world_clock', CLOCK_ID)?.tick ?? 0
}

/** Advance the clock by one tick and return the new tick number. */
export function advanceTick(store: Store): number {
  const current = store.get('world_clock', CLOCK_ID)
  const row = { id: CLOCK_ID, tick: (current?.tick ?? 0) + 1 }
  if (current === undefined) store.insert('world_clock', row)
  else store.update('world_clock', row)
  return row.tick
}
