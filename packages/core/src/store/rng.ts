// A small seeded PRNG for the test host (CLAUDE.md 3.4): the `Rng` that
// `MemoryStore.rng()` returns. The server uses `ctx.random` instead, so
// nothing may depend on this exact sequence except the golden test, which
// exists so that replay goldens stay stable across refactors.
//
// sfc32 (Chris Doty-Humphrey's Small Fast Counter), seeded by splitmix32.
// 128 bits of state, period at least 2^32, passes PractRand; plenty for tests.

import type { Rng } from './types.ts'

const U32 = 0x1_0000_0000

/** splitmix32: expands one 32-bit seed into well-mixed state words. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

/** A deterministic `Rng`: the same integer seed always gives the same sequence. */
export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) throw new Error(`rng seed must be an integer, got ${seed}`)
  const mix = splitmix32(seed)
  let a = mix()
  let b = mix()
  let c = mix()
  let d = mix()

  const nextU32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0
    d = (d + 1) >>> 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) >>> 0
    c = ((c << 21) | (c >>> 11)) >>> 0
    c = (c + t) >>> 0
    return t
  }
  // Warm up so that nearby seeds decorrelate before the first output.
  for (let i = 0; i < 12; i++) nextU32()

  const next = (): number => nextU32() / U32

  return {
    next,
    int(lo, hi) {
      if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
        throw new Error(`rng.int bounds must be safe integers, got [${lo}, ${hi}]`)
      }
      if (lo > hi) throw new Error(`rng.int: lo ${lo} > hi ${hi}`)
      // `next()` carries 32 bits, so wider ranges could not reach every value.
      if (hi - lo + 1 > U32) throw new Error(`rng.int: range [${lo}, ${hi}] is wider than 2^32`)
      return lo + Math.floor(next() * (hi - lo + 1))
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty list')
      return items[Math.floor(next() * items.length)] as T
    },
  }
}
