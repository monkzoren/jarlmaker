// MemoryStore: the test host (CLAUDE.md 3.4, ADR 0001). The same `Store`
// contract the server implements over `ctx.db`, kept in maps, with a seeded
// Rng, a settable clock and an inspectable event log. Unit tests, replay, the
// balance harness and the quest solver run on it. It is a fixture, never
// shipped, and it may do nothing the server cannot also do: there is no scan
// and no transaction API.
//
// Secondary indexes are real: each declared index is a map from key to the
// set of primary keys holding it, maintained on insert/update/delete, so
// `byIndex` never filters all rows.

import type { GameEvent } from '../events/index.ts'
import { createRng } from './rng.ts'
import { TABLES, type TableDef, type TableRegistry } from './tables.ts'
import type { Id, IndexOfIn, IndexValIn, PkIn, Rng, RowIn, StoreOf, TableNameIn, Timestamp } from './types.ts'

export interface MemoryStoreOptions {
  /** Seed of the store's PRNG. Default 0. */
  readonly seed?: number
  /** Initial clock, integer ms since epoch. Default 0. */
  readonly now?: Timestamp
  /** Table declarations to host. Default: every table in the runtime registry (`TABLES`). */
  readonly tables?: Iterable<TableDef>
}

type AnyRow = Readonly<Record<string, unknown>>

interface Index {
  readonly columns: readonly string[]
  /** encoded key -> primary keys of the rows holding it */
  readonly keys: Map<string, Set<Id>>
}

interface Table {
  readonly def: TableDef
  readonly rows: Map<Id, AnyRow>
  readonly indexes: Map<string, Index>
}

/**
 * Encode one column value for an index key. Type-tagged so that `1`, `1n`
 * and `'1'` stay distinct, as they are distinct in the server's btree.
 */
function encodeValue(v: unknown): string {
  switch (typeof v) {
    case 'string':
      // Length-prefixed: unambiguous without escaping, and far cheaper than JSON.
      return `s${v.length}:${v}`
    case 'number':
      return Object.is(v, -0) ? 'n0' : `n${v}`
    case 'bigint':
      return `b${v}`
    case 'boolean':
      return v ? 't' : 'f'
    case 'undefined':
      return 'u'
    default:
      if (v === null) return 'z'
      throw new Error(`MemoryStore: cannot index a ${typeof v} value`)
  }
}

const SEP = '|'

function rowKey(index: Index, row: AnyRow): string {
  const [only] = index.columns
  if (index.columns.length === 1 && only !== undefined) return encodeValue(row[only])
  return index.columns.map((c) => encodeValue(row[c])).join(SEP)
}

function lookupKey(index: Index, v: unknown): string {
  if (index.columns.length === 1) return encodeValue(v)
  if (!Array.isArray(v) || v.length !== index.columns.length) {
    throw new Error(`MemoryStore: compound index expects a ${index.columns.length}-tuple`)
  }
  return v.map(encodeValue).join(SEP)
}

export class MemoryStore<R = TableRegistry> implements StoreOf<R> {
  private readonly tables = new Map<string, Table>()
  private readonly log: GameEvent[] = []
  private readonly random: Rng
  private clock: Timestamp = 0

  constructor(options: MemoryStoreOptions = {}) {
    for (const def of options.tables ?? TABLES.values()) {
      if (this.tables.has(def.name)) throw new Error(`MemoryStore: table "${def.name}" given twice`)
      const indexes = new Map<string, Index>()
      for (const decl of def.indexes) indexes.set(decl.name, { columns: decl.columns, keys: new Map() })
      this.tables.set(def.name, { def, rows: new Map(), indexes })
    }
    this.random = createRng(options.seed ?? 0)
    this.setNow(options.now ?? 0)
  }

  // --- Store ---------------------------------------------------------------

  get<T extends TableNameIn<R>>(t: T, id: PkIn<R, T>): Readonly<RowIn<R, T>> | undefined {
    return this.table(t).rows.get(id as Id) as Readonly<RowIn<R, T>> | undefined
  }

  byIndex<T extends TableNameIn<R>, K extends IndexOfIn<R, T>>(
    t: T,
    k: K,
    v: IndexValIn<R, T, K>,
  ): Iterable<Readonly<RowIn<R, T>>> {
    const table = this.table(t)
    const index = table.indexes.get(k)
    if (index === undefined) throw new Error(`MemoryStore: table "${t}" has no index "${String(k)}"`)
    const pks = index.keys.get(lookupKey(index, v))
    if (pks === undefined) return []
    // A snapshot, so callers may insert/update/delete while iterating.
    const out: AnyRow[] = []
    for (const pk of pks) out.push(table.rows.get(pk) as AnyRow)
    return out as Readonly<RowIn<R, T>>[]
  }

  insert<T extends TableNameIn<R>>(t: T, row: RowIn<R, T>): void {
    const table = this.table(t)
    const stored = freeze(row)
    const pk = this.pkOf(table, stored)
    if (table.rows.has(pk)) throw new Error(`MemoryStore: insert into "${t}": pk ${String(pk)} exists`)
    table.rows.set(pk, stored)
    for (const index of table.indexes.values()) addKey(index, rowKey(index, stored), pk)
  }

  update<T extends TableNameIn<R>>(t: T, row: RowIn<R, T>): void {
    const table = this.table(t)
    const stored = freeze(row)
    const pk = this.pkOf(table, stored)
    const old = table.rows.get(pk)
    if (old === undefined) throw new Error(`MemoryStore: update "${t}": no row with pk ${String(pk)}`)
    table.rows.set(pk, stored)
    for (const index of table.indexes.values()) {
      const before = rowKey(index, old)
      const after = rowKey(index, stored)
      if (before === after) continue
      removeKey(index, before, pk)
      addKey(index, after, pk)
    }
  }

  delete<T extends TableNameIn<R>>(t: T, id: PkIn<R, T>): void {
    const table = this.table(t)
    const pk = id as Id
    const old = table.rows.get(pk)
    if (old === undefined) throw new Error(`MemoryStore: delete from "${t}": no row with pk ${String(pk)}`)
    table.rows.delete(pk)
    for (const index of table.indexes.values()) removeKey(index, rowKey(index, old), pk)
  }

  now(): Timestamp {
    return this.clock
  }

  rng(): Rng {
    return this.random
  }

  emit(e: GameEvent): void {
    this.log.push(e)
  }

  // --- Test-host controls (not part of Store) ------------------------------

  /** Set the clock to an integer ms timestamp. */
  setNow(t: Timestamp): void {
    if (!Number.isSafeInteger(t)) throw new Error(`MemoryStore: clock must be an integer ms, got ${t}`)
    this.clock = t
  }

  /** Move the clock forward by `ms` (a non-negative integer). */
  advance(ms: number): void {
    if (!Number.isSafeInteger(ms) || ms < 0) throw new Error(`MemoryStore: advance needs ms >= 0, got ${ms}`)
    this.setNow(this.clock + ms)
  }

  /** The events emitted so far, oldest first (a copy). */
  events(): readonly GameEvent[] {
    return [...this.log]
  }

  /** Empty the event log. */
  clearEvents(): void {
    this.log.length = 0
  }

  // --- internals -----------------------------------------------------------

  private table(t: string): Table {
    const table = this.tables.get(t)
    if (table === undefined) throw new Error(`MemoryStore: unknown table "${t}"`)
    return table
  }

  private pkOf(table: Table, row: AnyRow): Id {
    const pk = row[table.def.pk]
    if (typeof pk !== 'string' && typeof pk !== 'number' && typeof pk !== 'bigint') {
      throw new Error(`MemoryStore: "${table.def.name}" row has no ${table.def.pk} pk`)
    }
    return pk
  }
}

/** Store a frozen shallow copy, so a caller mutating its own object cannot desync the indexes. */
function freeze(row: unknown): AnyRow {
  return Object.freeze({ ...(row as AnyRow) })
}

function addKey(index: Index, key: string, pk: Id): void {
  const pks = index.keys.get(key)
  if (pks === undefined) index.keys.set(key, new Set([pk]))
  else pks.add(pk)
}

function removeKey(index: Index, key: string, pk: Id): void {
  const pks = index.keys.get(key)
  if (pks === undefined) return
  pks.delete(pk)
  if (pks.size === 0) index.keys.delete(key)
}
