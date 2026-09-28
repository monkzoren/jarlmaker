/**
 * The client's copy of the server rows it is subscribed to, turned into what
 * the renderer draws. Pure bookkeeping: no rule runs here (ADR 0001). Server
 * positions are in cells (core entity README); the renderer takes art pixels.
 */
import type { Motion } from '@bastion/core'
import type { RenderSnapshot } from '../render/index.ts'
import { TILE_PX } from '../render/zoom.ts'

/** The `entity` columns the view needs. Ids are i64 on the wire (bigint). */
export interface EntityRow {
  readonly id: bigint
  readonly kind: string
  readonly owner: string
}

/** An `entity_pos` row: the motion `step` reads, plus the id. */
export interface EntityPosRow extends Motion {
  readonly id: bigint
}

export interface SnapshotStore {
  upsertEntity(row: EntityRow): void
  deleteEntity(id: bigint): void
  upsertPos(row: EntityPosRow): void
  deletePos(id: bigint): void
  /** The server's `world_clock` tick (0 until the first row arrives). */
  setClock(tick: number): void
  readonly clock: number
  /** The `entity_pos` row of `owner`'s player, if both rows are in view. */
  playerPos(owner: string): EntityPosRow | undefined
  /** Every entity with both rows, as raw rows. */
  positions(): Iterable<EntityPosRow>
  /** Drop every row (a fresh subscription replaces the whole view). */
  clear(): void
  /** Entities with both an `entity` and an `entity_pos` row, in pixels. */
  toRenderSnapshot(): RenderSnapshot
  readonly size: number
  /** Called after every change; returns an unsubscribe. */
  onChange(cb: () => void): () => void
}

export function createSnapshotStore(): SnapshotStore {
  const entities = new Map<string, EntityRow>()
  const positions = new Map<string, EntityPosRow>()
  const listeners = new Set<() => void>()
  let clock = 0
  const changed = (): void => {
    for (const cb of listeners) cb()
  }

  return {
    upsertEntity(row) {
      entities.set(String(row.id), row)
      changed()
    },
    deleteEntity(id) {
      if (entities.delete(String(id))) changed()
    },
    upsertPos(row) {
      positions.set(String(row.id), row)
      changed()
    },
    deletePos(id) {
      if (positions.delete(String(id))) changed()
    },
    setClock(tick) {
      clock = tick
    },
    get clock() {
      return clock
    },
    playerPos(owner) {
      for (const [id, e] of entities) {
        if (e.kind === 'player' && e.owner === owner) return positions.get(id)
      }
      return undefined
    },
    *positions() {
      for (const [id, pos] of positions) if (entities.has(id)) yield pos
    },
    clear() {
      entities.clear()
      positions.clear()
      clock = 0
      changed()
    },
    toRenderSnapshot() {
      const out: { id: string; x: number; y: number }[] = []
      for (const [id, pos] of positions) {
        if (!entities.has(id)) continue
        out.push({ id, x: pos.x * TILE_PX, y: pos.y * TILE_PX })
      }
      return { entities: out }
    },
    get size() {
      let n = 0
      for (const id of positions.keys()) if (entities.has(id)) n++
      return n
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
