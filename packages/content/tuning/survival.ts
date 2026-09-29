// Survival knobs, read by `core/src/survival` (CLAUDE.md 3.5.7). Meters run
// 0..meterMax; rates are per second. The targets these serve (asserted in
// survival.test.ts): a player by a campfire comes through night 1 untouched;
// one with no fire scrapes through night 1 and dies in night 2.

export const survival = {
  // A 6-minute day (3600 ticks at 10 Hz): a commute sees a whole day, and the
  // first night comes about 4 minutes in, after a first campfire is easy.
  dayTicks: 3600,
  // A fresh world starts just after dawn.
  startPhase: 0.05,
  // Dusk at 66% of the day, dawn at 94%: about 100 s of night.
  duskPhase: 0.66,
  dawnPhase: 0.94,
  // Each twilight takes 6% of the day (~22 s), long enough to notice and act.
  twilight: 0.06,
  meterMax: 100,
  // Meters update once a second: 10 buckets at 10 Hz.
  vitalsBuckets: 10,
  // Night takes 1.5 warmth/s (full to empty in ~67 s); the sun gives back
  // 0.3/s, so a whole day restores about three quarters.
  nightWarmthPerSec: -1.5,
  dayWarmthPerSec: 0.3,
  // At zero warmth you lose 2 health a second: ~35 s of a first night alone
  // costs most of your health, and the next night finishes the job.
  coldDamagePerSec: 2,
  // Warm and fed, you heal 25 health over a day.
  healPerSec: 0.1,
  // Food runs out in ~11 minutes (almost two days): a berry bush or two a day.
  foodPerSec: 0.15,
  // You wake from death half-warm, so the next fire still matters.
  respawnWarmth: 0.5,
}
