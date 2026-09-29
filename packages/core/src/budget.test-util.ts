// Shared timing for the per-system tick budget tests (CLAUDE.md 3.4).
//
// CI runs every package's tests at once, so a budget test shares the CPU
// with other test processes. Contention only ever adds time, so the fastest
// of many short batches is the closest reading of the tick's own cost; a
// genuinely slow tick is slow in every batch. The budget itself is unchanged.

/** Batches measured, and ticks per batch (long enough for ms resolution to be ~0.05 ms). */
const BATCHES = 60
const TICKS_PER_BATCH = 20

/** The fastest per-tick time over many short batches of `runTick`, ms. */
export function fastestTickMs(runTick: () => void): number {
  let best = Infinity
  for (let b = 0; b < BATCHES; b++) {
    const start = Date.now()
    for (let i = 0; i < TICKS_PER_BATCH; i++) runTick()
    best = Math.min(best, (Date.now() - start) / TICKS_PER_BATCH)
  }
  return best
}
