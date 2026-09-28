// Device readings -> the `entity.move` stick. Magnitude clamping is core's
// `clampInput`, the same function the server applies; this file only turns
// raw key state and drag offsets into a vector for it.

import { clampInput } from '@bastion/core'
import type { MovePayload } from './types.ts'

export const ZERO: MovePayload = { ix: 0, iy: 0 }

/** Held directions. Screen and world y both point down, so up is -y. */
export interface HeldKeys {
  readonly up: boolean
  readonly down: boolean
  readonly left: boolean
  readonly right: boolean
}

/** Opposite keys cancel; a diagonal is clamped to unit length by core. */
export function keyVector(keys: HeldKeys): MovePayload {
  const ix = Number(keys.right) - Number(keys.left)
  const iy = Number(keys.down) - Number(keys.up)
  return clampInput({ ix, iy })
}

/**
 * A drag of (dx, dy) CSS px from the stick origin. Inside the dead zone the
 * stick reads zero; beyond it the strength ramps from 0 at the dead-zone edge
 * to 1 at `radius`, so there is no jump when the thumb leaves the dead zone.
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone: number): MovePayload {
  const dist = Math.hypot(dx, dy)
  const edge = radius * deadZone
  if (!(dist > edge) || !(radius > edge)) return ZERO
  const strength = (dist - edge) / (radius - edge)
  return clampInput({ ix: (dx / dist) * strength, iy: (dy / dist) * strength })
}

/** Keyboard and stick feed the same stick; both at once add, then clamp. */
export function combine(a: MovePayload, b: MovePayload): MovePayload {
  return clampInput({ ix: a.ix + b.ix, iy: a.iy + b.iy })
}

export function sameVector(a: MovePayload, b: MovePayload): boolean {
  return a.ix === b.ix && a.iy === b.iy
}
