// items tables (CLAUDE.md 3.5.4). One row per (owner, item) with a count:
// weight-free stacks. Public for now so the client can read its own counts
// without a view; row-level visibility arrives with accounts (P6).

import { z } from 'zod'
import { defineTable, registerTables } from '../store/tables.ts'

export const inventory = defineTable({
  name: 'inventory',
  row: z.object({
    /** `"owner|item"`. */
    key: z.string(),
    owner: z.string(),
    item: z.string(),
    count: z.int().nonnegative(),
  }),
  pk: 'key',
  indexes: [{ name: 'by_owner', columns: ['owner'] }],
  public: true,
})

export const ITEM_TABLES = [inventory] as const
registerTables(...ITEM_TABLES)

declare module '../store/tables.ts' {
  interface TableRegistry {
    inventory: typeof inventory
  }
}
