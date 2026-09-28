/**
 * What the renderer draws each frame, from the local prediction and the
 * server rows. Presentation only (ADR 0001): nothing here feeds back into
 * the sim, and the only numbers it touches are positions being blended.
 *
 * - The local player is drawn between its last two predicted ticks. A server
 *   correction is not applied to the drawing at once: it becomes an offset
 *   that decays over `smoothMs`, so the sprite eases onto the corrected path
 *   (a correction over `snapCells` snaps).
 * - Remote entities are drawn `remoteDelayMs` in the past, interpolated
 *   between the positions sampled at each server tick.
 */
import type { RenderEntity, RenderSnapshot } from '../render/index.ts'
import { TILE_PX } from '../render/zoom.ts'
import type { Prediction } from './predict.ts'
import type { EntityPosRow } from './snapshot.ts'

export interface ViewKnobs {
  /** One tick, ms. */
  readonly dtMs: number
  /** How far in the past remote entities are drawn, ms. */
  readonly remoteDelayMs: number
  /** Time constant of the correction decay, ms. */
  readonly smoothMs: number
  /** Corrections longer than this, in cells, snap. */
  readonly snapCells: number
}

export interface View {
  /** A local tick ran at `nowMs` and produced `p` for the player `id`. */
  local(id: string, p: Prediction, nowMs: number): void
  /** A server tick landed at `nowMs`; sample every entity but the local player. */
  server(rows: Iterable<EntityPosRow>, ownId: string | undefined, nowMs: number): void
  /** Positions to draw at `nowMs`, in art pixels. */
  frame(nowMs: number): RenderSnapshot
}

interface Point {
  readonly x: number
  readonly y: number
}

interface Sample extends Point {
  readonly t: number
}

interface Own {
  readonly id: string
  from: Point
  to: Point
  at: number
  offset: Point
}

export function createView(knobs: ViewKnobs): View {
  const { dtMs, remoteDelayMs, smoothMs, snapCells } = knobs
  const remotes = new Map<string, Sample[]>()
  let own: Own | undefined
  let lastFrame: number | undefined

  return {
    local(id, p, nowMs) {
      const to = p.motion
      if (own === undefined || own.id !== id) {
        own = { id, from: to, to, at: nowMs, offset: { x: 0, y: 0 } }
        return
      }
      const ex = p.continuation.x - to.x
      const ey = p.continuation.y - to.y
      let offset = { x: own.offset.x + ex, y: own.offset.y + ey }
      let from = { x: own.to.x - ex, y: own.to.y - ey }
      if (Math.hypot(offset.x, offset.y) > snapCells) {
        offset = { x: 0, y: 0 }
        from = to
      }
      own.from = from
      own.to = to
      own.at = nowMs
      own.offset = offset
    },

    server(rows, ownId, nowMs) {
      const seen = new Set<string>()
      for (const row of rows) {
        const id = String(row.id)
        if (id === ownId) continue
        seen.add(id)
        const list = remotes.get(id) ?? []
        list.push({ t: nowMs, x: row.x, y: row.y })
        remotes.set(id, list)
      }
      for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id)
    },

    frame(nowMs) {
      const out: RenderEntity[] = []
      let focus: RenderEntity | undefined
      if (own !== undefined) {
        const decay = lastFrame === undefined ? 1 : Math.exp(-(nowMs - lastFrame) / smoothMs)
        own.offset = { x: own.offset.x * decay, y: own.offset.y * decay }
        const a = clamp01((nowMs - own.at) / dtMs)
        focus = pixels(own.id, lerp(own.from, own.to, a), own.offset)
        out.push(focus)
      }
      lastFrame = nowMs
      const renderAt = nowMs - remoteDelayMs
      for (const [id, list] of remotes) {
        out.push(pixels(id, sampleAt(list, renderAt), { x: 0, y: 0 }))
      }
      return focus === undefined ? { entities: out } : { entities: out, focus: { x: focus.x, y: focus.y } }
    },
  }
}

/** Interpolate `list` (oldest first, non-empty) at time `t`; drops samples no longer needed. */
export function sampleAt(list: Sample[], t: number): Point {
  while (list.length > 2 && (list[1]?.t ?? Infinity) <= t) list.shift()
  const a = list[0]
  const b = list[1]
  if (a === undefined) return { x: 0, y: 0 }
  if (b === undefined || t <= a.t) return a
  if (t >= b.t) return b
  return lerp(a, b, (t - a.t) / (b.t - a.t))
}

function lerp(a: Point, b: Point, k: number): Point {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function pixels(id: string, p: Point, offset: Point): RenderEntity {
  return { id, x: (p.x + offset.x) * TILE_PX, y: (p.y + offset.y) * TILE_PX }
}
