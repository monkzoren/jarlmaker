// entity — shapes and knobs (CLAUDE.md 3.5.2). The `movement` tuning section
// is registered here; its values live in `packages/content/tuning/movement.ts`
// and reach rules through the Game context (ADR 0005).

import { z } from 'zod'
import { registerTuning } from '../game.ts'

/** Milliseconds per second: a unit conversion, not a knob. Tuning speaks cells and seconds. */
export const MS_PER_SECOND = 1000

export const movementTuning = z
  .object({
    /** Top walking speed, cells per second. */
    speed: z.number().positive(),
    /** Acceleration toward the input velocity, cells per second². */
    accel: z.number().positive(),
    /** Longest single integration step, ms. Longer `dt`s are split so a step never skips a cell. */
    maxStepMs: z.number().positive(),
  })
  .refine((t) => (t.speed * t.maxStepMs) / MS_PER_SECOND < 1, {
    message: 'speed × maxStepMs must stay under one cell per step, or collision can tunnel through a wall',
  })
registerTuning('movement', movementTuning)

declare module '../game.ts' {
  interface TuningRegistry {
    movement: z.output<typeof movementTuning>
  }
}

/** Entity kinds (3.5.2): one model for all of them. */
export const ENTITY_KINDS = ['player', 'enemy', 'npc', 'follower', 'projectile'] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

/** Movement state `step` reads and returns: the `entity_pos` columns without the id. */
export interface Motion {
  /** Position in cells; cell (cx, cy) spans [cx, cx + 1). */
  readonly x: number
  readonly y: number
  /** Velocity, cells per second. */
  readonly vx: number
  readonly vy: number
  /** Radians, `atan2(iy, ix)` of the last non-zero input. 0 faces +x. */
  readonly facing: number
  /** Sector key `"sx,sy"` of (x, y). */
  readonly sector: string
}

/** A move stick: each axis in [-1, 1], magnitude at most 1 once clamped. */
export interface MoveInput {
  readonly ix: number
  readonly iy: number
}

/** The knobs `step` needs, gathered from the Game context by the tick. */
export interface StepKnobs {
  readonly speed: number
  readonly accel: number
  readonly maxStepMs: number
  readonly sectorSize: number
}
