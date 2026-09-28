// Deterministic noise for worldgen (CLAUDE.md 3.5.1): pure functions of
// (seed, x, y) built on integer hashing, so every host (server, client,
// tests) computes identical terrain with no shared state. The constants here
// are hash mixing constants and octave arithmetic, not tunables; the knobs
// that shape the world live in `tuning.world`.

/** A 32-bit hash of (seed, x, y), x and y integers. */
export function hash3(seed: number, x: number, y: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}

const TWO_32 = 4294967296

/** A uniform number in [0, 1) for the integer point (x, y). */
export function unit(seed: number, x: number, y: number): number {
  return hash3(seed, x, y) / TWO_32
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in [0, 1): one lattice value per integer point, interpolated. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const a = unit(seed, x0, y0)
  const b = unit(seed, x0 + 1, y0)
  const c = unit(seed, x0, y0 + 1)
  const d = unit(seed, x0 + 1, y0 + 1)
  const top = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * ty
}

/**
 * Fractal value noise in [0, 1): `octaves` layers, each at twice the
 * frequency and half the weight of the one before, normalised.
 */
export function fbm(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0
  let weight = 1
  let total = 0
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(seed + o * 1013, x * freq, y * freq) * weight
    total += weight
    weight *= 0.5
    freq *= 2
  }
  return sum / total
}

/** Seed offsets, so each field draws independent noise from the one world seed. */
export const SALT = {
  coast: 101,
  elevation: 202,
  moisture: 303,
  lake: 404,
  flora: 505,
  decal: 606,
  variant: 707,
} as const
