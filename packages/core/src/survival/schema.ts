// survival — knobs (CLAUDE.md 3.5.7). Values live in
// `packages/content/tuning/survival.ts`; units are seconds and meter points.

import { z } from 'zod'
import { registerTuning } from '../game.ts'

export const survivalTuning = z
  .object({
    /** A full day, in ticks. */
    dayTicks: z.int().positive(),
    /** Day phase (0..1) at tick 0: where a fresh world's first day starts. */
    startPhase: z.number().min(0).max(1),
    /** Phase of dusk's midpoint and dawn's midpoint; night lies between them. */
    duskPhase: z.number().min(0).max(1),
    dawnPhase: z.number().min(0).max(1),
    /** Length of each twilight, as a share of the day. */
    twilight: z.number().positive(),
    /** Every meter's maximum. */
    meterMax: z.number().positive(),
    /** Players are updated in this many buckets, one per tick: each player once per `vitalsBuckets` ticks. */
    vitalsBuckets: z.int().positive(),
    /** Warmth change per second at full night (negative) and at full day (positive: the sun). */
    nightWarmthPerSec: z.number().max(0),
    dayWarmthPerSec: z.number().min(0),
    /** Health lost per second while warmth is zero. */
    coldDamagePerSec: z.number().positive(),
    /** Health regained per second while warm and fed. */
    healPerSec: z.number().min(0),
    /** Food lost per second. */
    foodPerSec: z.number().min(0),
    /** A new or respawned player's warmth (share of the max). */
    respawnWarmth: z.number().min(0).max(1),
  })
  .refine((t) => t.duskPhase < t.dawnPhase, { message: 'dusk must come before dawn within the day' })
registerTuning('survival', survivalTuning)

export type SurvivalTuning = z.output<typeof survivalTuning>

declare module '../game.ts' {
  interface TuningRegistry {
    survival: SurvivalTuning
  }
}
