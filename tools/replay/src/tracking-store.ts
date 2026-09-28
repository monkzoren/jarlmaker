// A Store decorator that remembers which primary keys each table holds, so
// the replay host can dump the whole store after a run. `Store` has no scan
// on purpose (CLAUDE.md 3.4) and MemoryStore keeps it that way; the dump is
// the host's job, so the host tracks what was written. Rules see an ordinary
// `Store`.

import type { GameEvent, Id, Store } from '@bastion/core'
import type { MemoryStore } from '@bastion/core/testing'
import { canonical } from './format.ts'

type AnyRow = Readonly<Record<string, unknown>>
type Pk = { readonly pk: string }

/** Minimal untyped view of a Store, so one decorator serves every table. */
interface LooseStore {
  get(t: string, id: Id): AnyRow | undefined
  byIndex(t: string, k: string, v: unknown): Iterable<AnyRow>
  insert(t: string, row: AnyRow): void
  update(t: string, row: AnyRow): void
  delete(t: string, id: Id): void
}

function comparePk(a: Id, b: Id): number {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0
  return typeof a < typeof b ? -1 : 1
}

export class TrackingStore {
  private readonly keys = new Map<string, Set<Id>>()
  private readonly inner: LooseStore

  constructor(
    readonly memory: MemoryStore,
    private readonly tables: ReadonlyMap<string, Pk>,
  ) {
    this.inner = memory as unknown as LooseStore
  }

  /** The `Store` rules run against. */
  get store(): Store {
    const inner = this.inner
    const track = (t: string, row: AnyRow) => this.pkSet(t).add(this.pkOf(t, row))
    const loose: LooseStore & Pick<Store, 'now' | 'rng' | 'emit'> = {
      get: (t, id) => inner.get(t, id),
      byIndex: (t, k, v) => inner.byIndex(t, k, v),
      insert: (t, row) => {
        inner.insert(t, row)
        track(t, row)
      },
      update: (t, row) => inner.update(t, row),
      delete: (t, id) => {
        inner.delete(t, id)
        this.pkSet(t).delete(id)
      },
      now: () => this.memory.now(),
      rng: () => this.memory.rng(),
      emit: (e: GameEvent) => this.memory.emit(e),
    }
    return loose as unknown as Store
  }

  /** Every non-empty table's rows, canonical, sorted by primary key. */
  dump(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {}
    for (const t of [...this.keys.keys()].sort()) {
      const pks = [...(this.keys.get(t) ?? [])].sort(comparePk)
      if (pks.length > 0) out[t] = pks.map((pk) => canonical(this.inner.get(t, pk)))
    }
    return out
  }

  private pkSet(t: string): Set<Id> {
    let set = this.keys.get(t)
    if (set === undefined) this.keys.set(t, (set = new Set()))
    return set
  }

  private pkOf(t: string, row: AnyRow): Id {
    const def = this.tables.get(t)
    if (def === undefined) throw new Error(`replay: unknown table "${t}"`)
    return row[def.pk] as Id
  }
}
