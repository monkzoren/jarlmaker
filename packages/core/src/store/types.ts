// The Store contract (CLAUDE.md 3.4). Every rule in `core` reads and writes
// game state only through this interface. The server implements it over
// `ctx.db` (StdbStore); tests implement it in memory (MemoryStore).
//
// There is deliberately no scan / iterate-all method. Every read is by
// primary key or by a declared index; if a rule needs a scan, the data is
// shaped wrong: add an index or a denormalized column.

import type { z } from 'zod'
import type { GameEvent } from '../events/index.ts'
import type { IndexDecl, TableRegistry } from './tables.ts'

/** Primary-key values. A table's pk column must have one of these types. */
export type Id = string | number | bigint

/** Milliseconds since the Unix epoch, an integer. `ctx.timestamp` on the server. */
export type Timestamp = number

/** Deterministic randomness. `ctx.random` on the server; a seeded PRNG in tests. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [lo, hi], both inclusive. */
  int(lo: number, hi: number): number
  /** One element of a non-empty list; throws on an empty one. */
  pick<T>(items: readonly T[]): T
}

// Registry-generic forms. `R` is a table registry; the exported names below
// fix it to `TableRegistry`. Tests use `StoreOf<LocalRegistry>` to exercise
// the typing without adding fixture tables to the real registry.

export type TableNameIn<R> = keyof R & string

export type RowIn<R, T extends keyof R> = R[T] extends { readonly row: infer S extends z.ZodType }
  ? z.output<S>
  : never

export type PkIn<R, T extends keyof R> = R[T] extends { readonly pk: infer P extends string }
  ? RowIn<R, T>[P & keyof RowIn<R, T>]
  : never

type IndexDeclsIn<R, T extends keyof R> = R[T] extends { readonly indexes: infer I extends readonly IndexDecl[] }
  ? I[number]
  : never

export type IndexOfIn<R, T extends keyof R> = IndexDeclsIn<R, T>['name']

type ColumnValues<Row, C> = { -readonly [P in keyof C]: C[P] extends keyof Row ? Row[C[P]] : never }

/** A single-column index is keyed by the column value; a compound one by a tuple, in column order. */
export type IndexValIn<R, T extends keyof R, K> = Extract<IndexDeclsIn<R, T>, { readonly name: K }>['columns'] extends infer C
  ? C extends readonly [infer Only]
    ? Only extends keyof RowIn<R, T>
      ? RowIn<R, T>[Only]
      : never
    : ColumnValues<RowIn<R, T>, C>
  : never

export interface StoreOf<R> {
  get<T extends TableNameIn<R>>(t: T, id: PkIn<R, T>): Readonly<RowIn<R, T>> | undefined
  byIndex<T extends TableNameIn<R>, K extends IndexOfIn<R, T>>(
    t: T,
    k: K,
    v: IndexValIn<R, T, K>,
  ): Iterable<Readonly<RowIn<R, T>>>
  /** Throws if a row with the same primary key exists. */
  insert<T extends TableNameIn<R>>(t: T, row: RowIn<R, T>): void
  /** Replaces the row with the same primary key; throws if there is none. */
  update<T extends TableNameIn<R>>(t: T, row: RowIn<R, T>): void
  /** Throws if there is no row with this primary key. */
  delete<T extends TableNameIn<R>>(t: T, id: PkIn<R, T>): void
  now(): Timestamp
  rng(): Rng
  /** Append to the event log; handlers run after the current step (see events/README.md). */
  emit(e: GameEvent): void
}

// The names used everywhere else, fixed to the real registry.

export type TableName = TableNameIn<TableRegistry>
export type Row<T extends TableName> = RowIn<TableRegistry, T>
export type IndexOf<T extends TableName> = IndexOfIn<TableRegistry, T>
export type IndexVal<T extends TableName, K extends IndexOf<T>> = IndexValIn<TableRegistry, T, K>
/** The primary-key type of table `T` (always a subtype of `Id`). */
export type PkOf<T extends TableName> = PkIn<TableRegistry, T>
export type Store = StoreOf<TableRegistry>
