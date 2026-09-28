// Table declarations (CLAUDE.md 3.4). Every table is declared once, here in
// `core`, as plain data: a Zod row schema, a primary-key column, and a list of
// secondary indexes. MemoryStore reads the declarations at runtime and
// `pnpm gen:tables` turns them into the SpacetimeDB schema, so keep them data.
//
// A system declares its tables in its own folder and registers them:
//
//   export const entityPos = defineTable({
//     name: 'entity_pos',
//     row: z.object({ id: z.string(), x: z.number(), y: z.number(), sector: z.string() }),
//     pk: 'id',
//     indexes: [{ name: 'by_sector', columns: ['sector'] }],
//   })
//   registerTables(entityPos)
//   declare module '../store/tables.ts' {
//     interface TableRegistry { entity_pos: typeof entityPos }
//   }

import type { z } from 'zod'
import type { Id } from './types.ts'

/** A table's row: a Zod object schema. */
export type RowSchema = z.ZodObject

/** Column names of a row schema. */
export type ColumnOf<S extends RowSchema> = keyof z.output<S> & string

/** Columns whose type can serve as a primary key (see `Id`). */
export type PkColumnOf<S extends RowSchema> = {
  [C in ColumnOf<S>]: z.output<S>[C] extends Id ? C : never
}[ColumnOf<S>]

/** A secondary index: a name and one or more columns, in key order. */
export interface IndexDecl<C extends string = string> {
  readonly name: string
  readonly columns: readonly [C, ...C[]]
}

export interface TableDef<
  N extends string = string,
  S extends RowSchema = RowSchema,
  P extends string = string,
  I extends readonly IndexDecl[] = readonly IndexDecl[],
> {
  readonly name: N
  readonly row: S
  readonly pk: P
  readonly indexes: I
}

const NAME = /^[a-z][a-z0-9_]*$/

/**
 * Declare a table. Pure: it validates the declaration and returns it; call
 * `registerTables` to make it visible to hosts.
 */
export function defineTable<
  const N extends string,
  S extends RowSchema,
  const P extends PkColumnOf<S>,
  const I extends readonly IndexDecl<ColumnOf<S>>[] = readonly [],
>(def: { name: N; row: S; pk: P; indexes?: I }): TableDef<N, S, P, I> {
  const indexes = (def.indexes ?? []) as I
  const columns = new Set(Object.keys(def.row.shape))
  const fail = (why: string): never => {
    throw new Error(`defineTable(${def.name}): ${why}`)
  }
  if (!NAME.test(def.name)) fail('table name must be snake_case')
  if (!columns.has(def.pk)) fail(`pk column "${def.pk}" is not in the row`)
  const seen = new Set<string>()
  for (const index of indexes) {
    if (!NAME.test(index.name)) fail(`index name "${index.name}" must be snake_case`)
    if (seen.has(index.name)) fail(`duplicate index name "${index.name}"`)
    seen.add(index.name)
    for (const column of index.columns) {
      if (!columns.has(column)) fail(`index "${index.name}" names unknown column "${column}"`)
    }
  }
  return { name: def.name, row: def.row, pk: def.pk, indexes }
}

/**
 * The type-level table registry. Empty in the contract; each system adds its
 * tables by declaration merging (see the header). `TableName`, `Row`,
 * `IndexOf` and `IndexVal` in `types.ts` all read from it.
 */
export interface TableRegistry {}

const registry = new Map<string, TableDef>()

/** The runtime table registry, keyed by table name. Initially empty. */
export const TABLES: ReadonlyMap<string, TableDef> = registry

/** Make tables visible to hosts. A name may be registered only once. */
export function registerTables(...defs: readonly TableDef[]): void {
  for (const def of defs) {
    if (registry.has(def.name)) throw new Error(`table "${def.name}" is already registered`)
    registry.set(def.name, def)
  }
}

/** Every registered table, sorted by name, for generators that need a stable order. */
export function tableList(): readonly TableDef[] {
  return [...registry.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
