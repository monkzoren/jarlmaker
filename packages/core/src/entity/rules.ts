// entity rules (CLAUDE.md 3.5.2): pure functions. `step` is THE movement
// function: the server tick and the client's prediction both call it, so
// prediction cannot diverge in logic. Only `+ - * /`, `Math.sqrt`, `Math.min`,
// `Math.floor` and `Math.atan2` touch the numbers, and in a fixed order, so
// the same inputs give bit-identical outputs on every host running the same
// engine.

import { MS_PER_SECOND, type Motion, type MoveInput, type StepKnobs } from './schema.ts'
import type { WorldView } from './world-view.ts'

/** The cell containing coordinate `v`. */
export function cellOf(v: number): number {
  return Math.floor(v)
}

/** Sector key `"sx,sy"` of the point (x, y). */
export function sectorOf(x: number, y: number, sectorSize: number): string {
  return `${Math.floor(x / sectorSize)},${Math.floor(y / sectorSize)}`
}

/** Clamp a hostile stick to magnitude <= 1; non-finite axes count as 0. */
export function clampInput(input: MoveInput): MoveInput {
  const ix = Number.isFinite(input.ix) ? input.ix : 0
  const iy = Number.isFinite(input.iy) ? input.iy : 0
  const len = Math.sqrt(ix * ix + iy * iy)
  if (len <= 1) return { ix, iy }
  return { ix: ix / len, iy: iy / len }
}

/** True when the input and the velocity are both zero: the entity is at rest. */
export function atRest(motion: Motion, input: MoveInput): boolean {
  return motion.vx === 0 && motion.vy === 0 && input.ix === 0 && input.iy === 0
}

/** One integration step of `dt` seconds; `dt * speed` is under one cell. */
function integrate(m: Motion, input: MoveInput, dt: number, world: WorldView, knobs: StepKnobs): Motion {
  // Velocity approaches the stick's target velocity at `accel`.
  const tvx = input.ix * knobs.speed
  const tvy = input.iy * knobs.speed
  const dvx = tvx - m.vx
  const dvy = tvy - m.vy
  const gap = Math.sqrt(dvx * dvx + dvy * dvy)
  const reach = knobs.accel * dt
  let vx = tvx
  let vy = tvy
  if (gap > reach) {
    vx = m.vx + (dvx / gap) * reach
    vy = m.vy + (dvy / gap) * reach
  }

  // Cell collision, one axis at a time, so a wall stops only the axis that hits it.
  // An entity already inside a blocked cell (something was built on it) may
  // move freely until it is out, so nothing can trap it.
  const trapped = !world.walkable(cellOf(m.x), cellOf(m.y))
  let x = m.x + vx * dt
  if (!trapped && !world.walkable(cellOf(x), cellOf(m.y))) {
    x = m.x
    vx = 0
  }
  let y = m.y + vy * dt
  if (!trapped && !world.walkable(cellOf(x), cellOf(y))) {
    y = m.y
    vy = 0
  }

  const facing = input.ix === 0 && input.iy === 0 ? m.facing : Math.atan2(input.iy, input.ix)
  return { x, y, vx, vy, facing, sector: m.sector }
}

/**
 * Advance `pos` by `dtMs` under `input`. Pure. The input is clamped first, the
 * interval is split into steps of at most `knobs.maxStepMs`, and the returned
 * `sector` is recomputed from the final position.
 */
export function step(pos: Motion, input: MoveInput, dtMs: number, world: WorldView, knobs: StepKnobs): Motion {
  const stick = clampInput(input)
  let m = pos
  let left = dtMs
  while (left > 0) {
    const ms = Math.min(left, knobs.maxStepMs)
    m = integrate(m, stick, ms / MS_PER_SECOND, world, knobs)
    left -= ms
  }
  return { ...m, sector: sectorOf(m.x, m.y, knobs.sectorSize) }
}
