// world tables (CLAUDE.md 3.5.1): the mutation overlay. Base terrain is never
// stored; a `cell_delta` row records how one cell differs from what the
// generator says: a prop felled, damaged, replaced (a stump) or placed (a
// campfire). Public: every client overlays the deltas it receives on the same
// generated terrain. `sector` is indexed for sector-window subscriptions (3.6).
// `player_action` holds each player's hit cooldown (server-only).

import { z } from 'zod'
import { defineTable, registerTables } from '../store/tables.ts'

export const cellDelta = defineTable({
  name: 'cell_delta',
  row: z.object({
    /** `"cx,cy"`. */
    key: z.string(),
    cx: z.int(),
    cy: z.int(),
    sector: z.string(),
    /** The prop standing here now; `''` means none (felled, broken). */
    prop: z.string(),
    /** Hits already taken by that prop. */
    hits: z.int().nonnegative(),
    /** Identity that placed it (`''` for a natural prop). */
    owner: z.string(),
  }),
  pk: 'key',
  indexes: [{ name: 'by_sector', columns: ['sector'] }],
  public: true,
})

export const playerAction = defineTable({
  name: 'player_action',
  row: z.object({
    /** The player's identity. */
    owner: z.string(),
    /** Tick at which the next hit is allowed. */
    readyTick: z.number(),
  }),
  pk: 'owner',
})

export const WORLD_TABLES = [cellDelta, playerAction] as const
registerTables(...WORLD_TABLES)

declare module '../store/tables.ts' {
  interface TableRegistry {
    cell_delta: typeof cellDelta
    player_action: typeof playerAction
  }
}
