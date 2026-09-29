// survival rules (CLAUDE.md 3.5.7): the day, and one step of a player's
// meters. Pure; the tick and the client both call these.
//
//   daylight: 1 by day, 0 by night, eased through dusk and dawn.
//   warmth:   the sun or the night moves it (by daylight), heat sources near
//             you add theirs; clamped to [0, max].
//   food:     drains always; never kills.
//   health:   lost while warmth is zero; regained while warm and fed.

import { smooth } from './ease.ts'
import type { SurvivalTuning } from './schema.ts'

/** Where in the day `tick` falls, in [0, 1). */
export function dayPhase(tick: number, t: SurvivalTuning): number {
  const p = t.startPhase + tick / t.dayTicks
  return p - Math.floor(p)
}

/** How light it is at `tick`: 1 full day, 0 full night. */
export function daylight(tick: number, t: SurvivalTuning): number {
  const p = dayPhase(tick, t)
  const half = t.twilight / (1 + 1)
  if (p < t.duskPhase - half || p >= t.dawnPhase + half) return 1
  if (p < t.duskPhase + half) return 1 - smooth((p - (t.duskPhase - half)) / t.twilight)
  if (p < t.dawnPhase - half) return 0
  return smooth((p - (t.dawnPhase - half)) / t.twilight)
}

/** The day number `tick` falls in (the first day is 1). */
export function dayNumber(tick: number, t: SurvivalTuning): number {
  return Math.floor(t.startPhase + tick / t.dayTicks) + 1
}

export interface Vitals {
  readonly hp: number
  readonly warmth: number
  readonly food: number
}

/**
 * One step of `dt` seconds. `light` is the daylight, `heat` the warmth per
 * second from sources in range (a campfire). Returns the new meters and
 * whether the player died this step (health reached zero).
 */
export function stepVitals(v: Vitals, dt: number, light: number, heat: number, t: SurvivalTuning): { vitals: Vitals; died: boolean } {
  const clamp = (x: number): number => Math.min(t.meterMax, Math.max(0, x))
  const weather = t.nightWarmthPerSec + (t.dayWarmthPerSec - t.nightWarmthPerSec) * light
  const warmth = clamp(v.warmth + (weather + heat) * dt)
  const food = clamp(v.food - t.foodPerSec * dt)
  let hp = v.hp
  if (warmth <= 0) hp -= t.coldDamagePerSec * dt
  else if (food > 0) hp += t.healPerSec * dt
  hp = clamp(hp)
  return { vitals: { hp, warmth, food }, died: hp <= 0 }
}

/** A fresh (or respawned) player's meters; `food` carries over on respawn. */
export function freshVitals(t: SurvivalTuning, food: number = t.meterMax): Vitals {
  return { hp: t.meterMax, warmth: t.meterMax * t.respawnWarmth, food }
}

/** A stable bucket for `owner` in [0, buckets). */
export function bucketOf(owner: string, buckets: number): number {
  let h = 0
  // tunable-ok: 31 is the string-hash multiplier, not a knob
  for (let i = 0; i < owner.length; i++) h = (Math.imul(h, 31) + owner.charCodeAt(i)) | 0
  return Math.abs(h) % buckets
}
