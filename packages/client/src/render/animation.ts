/**
 * Which sprite frame to draw for an entity, from how its drawn position
 * moves. Presentation only: it reads the positions the view already blends
 * (predicted for the local player, interpolated for remotes), so both
 * animate the same way and nothing here touches the sim.
 *
 * - Facing follows motion. Diagonals show the side view (the genre
 *   convention), and a sprite keeps its last facing when it stops.
 * - The walk frame advances with the distance walked, not with time, so feet
 *   stay planted during the acceleration ramp and at any speed.
 * - A sprite counts as walking only above `minSpeedPxPerS`, so a correction
 *   easing in does not twitch its legs, and it goes idle only after
 *   `stopAfterMs` of stillness, so it does not flicker between ticks.
 */
import type { AnimName, Facing } from '@bastion/art'

export interface AnimKnobs {
  /** Art pixels walked per walk frame (from the sprite sheet). */
  readonly pxPerFrame: number
  /** Frames in the walk cycle. */
  readonly walkFrames: number
  /** Below this drawn speed an entity is not walking, px/s. */
  readonly minSpeedPxPerS: number
  /** Stillness before switching to idle, ms. */
  readonly stopAfterMs: number
}

/** Presentation knobs; the sheet supplies `pxPerFrame` and `walkFrames`. */
export const ANIM_TIMING = { minSpeedPxPerS: 12, stopAfterMs: 120 } as const

export interface AnimState {
  readonly x: number
  readonly y: number
  readonly facing: Facing
  /** Mirror the `side` frames (facing left). */
  readonly flip: boolean
  readonly walking: boolean
  readonly stillMs: number
  /** Distance walked since the entity appeared, px. */
  readonly walkedPx: number
}

export interface FramePick {
  readonly anim: AnimName
  readonly facing: Facing
  readonly index: number
  readonly flip: boolean
}

/** A new entity at (x, y): idle, facing the camera. */
export function initialAnim(x: number, y: number): AnimState {
  return { x, y, facing: 'down', flip: false, walking: false, stillMs: 0, walkedPx: 0 }
}

/** Advance `s` to the entity's new drawn position after `dtMs`. Pure. */
export function advanceAnim(s: AnimState, x: number, y: number, dtMs: number, k: AnimKnobs): AnimState {
  const dx = x - s.x
  const dy = y - s.y
  const dist = Math.hypot(dx, dy)
  const speed = dtMs > 0 ? (dist * 1000) / dtMs : 0
  if (speed < k.minSpeedPxPerS) {
    const stillMs = s.stillMs + dtMs
    return { ...s, x, y, stillMs, walking: s.walking && stillMs < k.stopAfterMs }
  }
  const side = Math.abs(dx) >= Math.abs(dy) * SIDE_BIAS
  const facing: Facing = side ? 'side' : dy < 0 ? 'up' : 'down'
  const flip = side ? dx < 0 : s.flip
  return { x, y, facing, flip, walking: true, stillMs: 0, walkedPx: s.walkedPx + dist }
}

/**
 * Just under 1: an exact diagonal (|dx| = |dy|) with float noise still shows
 * the side view instead of flickering between side and up/down.
 */
const SIDE_BIAS = 0.9

/** The frame to draw for `s`. Pure. */
export function pickFrame(s: AnimState, k: AnimKnobs): FramePick {
  if (!s.walking) return { anim: 'idle', facing: s.facing, index: 0, flip: s.flip }
  const index = Math.floor(s.walkedPx / k.pxPerFrame) % k.walkFrames
  return { anim: 'walk', facing: s.facing, index, flip: s.flip }
}
