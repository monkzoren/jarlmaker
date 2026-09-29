/**
 * The client's copy of the world's mutable rows: `cell_delta` (felled trees,
 * placed campfires) and the local player's `inventory`. Pure bookkeeping, like
 * the snapshot: the live world is core's `liveWorld` over these deltas, so the
 * client draws, collides and targets with the server's own rules.
 */
import { deltaKey, type Delta, type DeltaLookup } from '@bastion/core'

export interface DeltaRow extends Delta {
  readonly key: string
  readonly cx: number
  readonly cy: number
}

export interface InventoryRow {
  readonly owner: string
  readonly item: string
  readonly count: number
}

export interface WorldChange {
  /** A delta row changed: `prev` is its last value (undefined when new). */
  readonly kind: 'delta'
  readonly row: DeltaRow
  readonly prev: Delta | undefined
  /** Part of a (re)subscription's catch-up, not something happening now: no effects. */
  readonly quiet: boolean
}

export interface ItemChange {
  readonly kind: 'item'
  readonly item: string
  readonly count: number
  readonly prev: number
  readonly quiet: boolean
}

export interface VitalsRow {
  readonly owner: string
  readonly hp: number
  readonly warmth: number
  readonly food: number
}

export interface VitalsChange {
  readonly kind: 'vitals'
  readonly vitals: VitalsRow
  readonly prev: VitalsRow | undefined
  readonly quiet: boolean
}

export interface WorldMirror {
  readonly lookup: DeltaLookup
  upsertDelta(row: DeltaRow): void
  deleteDelta(key: string): void
  /** Only the local player's rows are kept; set the owner once known. */
  setOwner(owner: string): void
  upsertItem(row: InventoryRow): void
  count(item: string): number
  /** Every held item, in the order they were first seen. */
  items(): readonly { readonly item: string; readonly count: number }[]
  /** The local player's meters, once their row has arrived. */
  upsertVitals(row: VitalsRow): void
  readonly vitals: VitalsRow | undefined
  /** Make the rows exactly these (a fresh subscription). Changes found are reported. */
  replace(deltas: Iterable<DeltaRow>, inventory: Iterable<InventoryRow>, vitals?: Iterable<VitalsRow>): void
  /** Called for every change; returns an unsubscribe. */
  onChange(cb: (c: MirrorChange) => void): () => void
}

export type MirrorChange = WorldChange | ItemChange | VitalsChange

export function createWorldMirror(): WorldMirror {
  const deltas = new Map<string, Delta>()
  const counts = new Map<string, number>()
  const listeners = new Set<(c: MirrorChange) => void>()
  let owner = ''
  let quiet = false
  let vitals: VitalsRow | undefined
  const emit = (c: MirrorChange): void => {
    for (const cb of listeners) cb(c)
  }
  const upsertDelta = (row: DeltaRow): void => {
    const prev = deltas.get(row.key)
    if (prev !== undefined && prev.prop === row.prop && prev.hits === row.hits && prev.owner === row.owner) return
    deltas.set(row.key, { prop: row.prop, hits: row.hits, owner: row.owner })
    emit({ kind: 'delta', row, prev, quiet })
  }
  const upsertItem = (row: InventoryRow): void => {
    if (owner === '' || row.owner !== owner) return
    const prev = counts.get(row.item) ?? 0
    if (prev === row.count && counts.has(row.item)) return
    counts.set(row.item, row.count)
    emit({ kind: 'item', item: row.item, count: row.count, prev, quiet })
  }
  const upsertVitals = (row: VitalsRow): void => {
    if (owner === '' || row.owner !== owner) return
    const prev = vitals
    vitals = row
    emit({ kind: 'vitals', vitals: row, prev, quiet })
  }
  return {
    lookup: (cx, cy) => deltas.get(deltaKey(cx, cy)),
    upsertVitals,
    get vitals() {
      return vitals
    },
    upsertDelta,
    deleteDelta(key) {
      deltas.delete(key)
    },
    setOwner(o) {
      if (o === owner) return
      owner = o
      counts.clear()
      vitals = undefined
    },
    upsertItem,
    count: (item) => counts.get(item) ?? 0,
    items: () => [...counts].map(([item, count]) => ({ item, count })),
    replace(ds, inv, vs = []) {
      quiet = true
      try {
        for (const d of ds) upsertDelta(d)
        for (const i of inv) upsertItem(i)
        for (const v of vs) upsertVitals(v)
      } finally {
        quiet = false
      }
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
