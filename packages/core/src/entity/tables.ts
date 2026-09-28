// entity tables (CLAUDE.md 3.4, 3.5.2, 3.6 rule 2). `entity` is wide and
// changes rarely; `entity_pos` is narrow and changes every step. Never widen
// `entity_pos` (a decision record is required to add a column to either).
// `entity_input` holds each entity's last move stick and whether it is still
// moving, so the tick visits only moving entities (by index, never a scan).

import { z } from 'zod'
import { defineTable, registerTables } from '../store/tables.ts'
import { ENTITY_KINDS } from './schema.ts'

export const entity = defineTable({
  name: 'entity',
  row: z.object({
    id: z.bigint(),
    kind: z.enum(ENTITY_KINDS),
    /** Content def id (species variant, structure-less NPC def, `player`). */
    def: z.string(),
    /** Owning identity (`ctx.sender`); `''` for unowned entities. */
    owner: z.string(),
    level: z.int().positive(),
    faction: z.string(),
  }),
  pk: 'id',
  indexes: [{ name: 'by_owner', columns: ['owner'] }],
})

export const entityPos = defineTable({
  name: 'entity_pos',
  row: z.object({
    id: z.bigint(),
    x: z.number(),
    y: z.number(),
    vx: z.number(),
    vy: z.number(),
    facing: z.number(),
    sector: z.string(),
  }),
  pk: 'id',
  indexes: [{ name: 'by_sector', columns: ['sector'] }],
})

export const entityInput = defineTable({
  name: 'entity_input',
  row: z.object({
    id: z.bigint(),
    ix: z.number(),
    iy: z.number(),
    /** True while the entity has input or velocity; the tick's work list. */
    moving: z.boolean(),
  }),
  pk: 'id',
  indexes: [{ name: 'by_moving', columns: ['moving'] }],
})

/** Id allocation: one row per sequence name, holding the next id to hand out. */
export const entitySeq = defineTable({
  name: 'entity_seq',
  row: z.object({ name: z.string(), next: z.bigint() }),
  pk: 'name',
})

export const ENTITY_TABLES = [entity, entityPos, entityInput, entitySeq] as const
registerTables(...ENTITY_TABLES)

declare module '../store/tables.ts' {
  interface TableRegistry {
    entity: typeof entity
    entity_pos: typeof entityPos
    entity_input: typeof entityInput
    entity_seq: typeof entitySeq
  }
}
