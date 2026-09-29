// survival tables (CLAUDE.md 3.5.7). One narrow row per player with the three
// meters. `bucket` spreads the once-a-second update over the ticks: the tick
// reads one bucket by index, never a scan. Public: the client shows its own
// meters (and could show others' health later).

import { z } from 'zod'
import { defineTable, registerTables } from '../store/tables.ts'

export const playerVitals = defineTable({
  name: 'player_vitals',
  row: z.object({
    owner: z.string(),
    bucket: z.int32().nonnegative(),
    hp: z.number(),
    warmth: z.number(),
    food: z.number(),
  }),
  pk: 'owner',
  indexes: [{ name: 'by_bucket', columns: ['bucket'] }],
  public: true,
})

export const SURVIVAL_TABLES = [playerVitals] as const
registerTables(...SURVIVAL_TABLES)

declare module '../store/tables.ts' {
  interface TableRegistry {
    player_vitals: typeof playerVitals
  }
}
