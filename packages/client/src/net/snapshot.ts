/**
 * The client's copy of the server rows it is subscribed to, turned into what
 * the renderer draws. Pure bookkeeping: no rule runs here (ADR 0001). Server
 * positions are in cells (core entity README); the renderer takes art pixels.
 */
import type { RenderSnapshot } from '../render/index.ts'
import { TILE_PX } from '../render/zoom.ts'

/** The `entity` columns the view needs. Ids are i64 on the wire (bigint). */
export interface EntityRow {
  readonly id: bigint
  readonly kind: string
  readonly owner: string
}

/** The `entity_pos` columns the view needs. */
export interface EntityPosRow {
  readonly id: bigint
  readonly x: number
  readonly y: number
}

export interface SnapshotStore {
  upsertEntity(row: EntityRow): void
  deleteEntity(id: bigint): void
  upsertPos(row: EntityPosRow): void
  deletePos(id: bigint): void
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
    clear() {
      entities.clear()
      positions.clear()
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
