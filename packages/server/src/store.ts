// StdbStore: core's `Store` over a SpacetimeDB reducer context (CLAUDE.md
// 3.4 Hosts, ADR 0001). The generated tables (`tables.ts`) mirror core's
// declarations 1:1 (same table, column and index names), so every method is a
// straight call on the table handle: `get` by the pk column's unique index,
// `byIndex` by the declared btree index. There is no scan here either.
//
// `now()` is `ctx.timestamp` in ms and `rng()` wraps `ctx.random`, which
// SpacetimeDB seeds from the timestamp, so a reducer is deterministic.
// `emit` is the host's event log: events are dispatched in-transaction by
// core (`dispatch`) before they reach it, and there is no event table yet,
// so the log is dropped at the end of the reducer.

import { TABLES, type GameEvent, type IndexOf, type IndexVal, type PkOf, type Rng, type Row, type Store, type TableName, type Timestamp } from '@bastion/core'

/** The table-handle surface StdbStore uses; generated handles satisfy it. */
interface UniqueIndex {
  find(key: unknown): unknown
  update(row: unknown): unknown
  delete(key: unknown): boolean
}
interface BtreeIndex {
  filter(key: unknown): Iterable<unknown>
}
type TableHandle = { insert(row: unknown): unknown } & Record<string, unknown>

/** What StdbStore reads from a reducer context; `db` is indexed by table name at runtime. */
export interface HostCtx {
  readonly db: object
  readonly timestamp: { readonly microsSinceUnixEpoch: bigint }
  readonly random: { (): number; integerInRange(min: number, max: number): number }
}

const MICROS_PER_MS = 1000n

export class StdbStore implements Store {
  constructor(private readonly ctx: HostCtx) {}

  private handle(t: TableName): TableHandle {
    const h = (this.ctx.db as unknown as Record<string, TableHandle | undefined>)[t]
    if (h === undefined) throw new Error(`StdbStore: table "${t}" is not in the module schema`)
    return h
  }

  private pk(t: TableName): UniqueIndex {
    const def = TABLES.get(t)
    if (def === undefined) throw new Error(`StdbStore: table "${t}" is not registered in core`)
    return this.handle(t)[def.pk] as UniqueIndex
  }

  get<T extends TableName>(t: T, id: PkOf<T>): Readonly<Row<T>> | undefined {
    return (this.pk(t).find(id) ?? undefined) as Row<T> | undefined
  }

  byIndex<T extends TableName, K extends IndexOf<T>>(t: T, k: K, v: IndexVal<T, K>): Iterable<Readonly<Row<T>>> {
    return (this.handle(t)[k] as BtreeIndex).filter(v) as Iterable<Row<T>>
  }

  /** Throws (unique violation) if the pk exists. */
  insert<T extends TableName>(t: T, row: Row<T>): void {
    this.handle(t).insert(row)
  }

  /** Throws if no row has this pk. */
  update<T extends TableName>(t: T, row: Row<T>): void {
    this.pk(t).update(row)
  }

  delete<T extends TableName>(t: T, id: PkOf<T>): void {
    if (!this.pk(t).delete(id)) throw new Error(`StdbStore.delete: no ${t} row with pk ${String(id)}`)
  }

  now(): Timestamp {
    return Number(this.ctx.timestamp.microsSinceUnixEpoch / MICROS_PER_MS)
  }

  rng(): Rng {
    return stdbRng(this.ctx.random)
  }

  emit(_e: GameEvent): void {
    // No event table yet (P0-011): events were already dispatched by core.
  }
}

/** core's `Rng` over `ctx.random`, with the same argument checks as `createRng`. */
export function stdbRng(random: HostCtx['random']): Rng {
  return {
    next: () => random(),
    int(lo, hi) {
      if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) throw new Error(`rng.int bounds must be safe integers, got [${lo}, ${hi}]`)
      if (lo > hi) throw new Error(`rng.int: lo ${lo} > hi ${hi}`)
      return random.integerInRange(lo, hi)
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty list')
      return items[random.integerInRange(0, items.length - 1)] as T
    },
  }
}
