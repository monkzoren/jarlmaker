import { describe, expect, it } from 'vitest'
import { createRng } from './rng.ts'

describe('createRng', () => {
  it('is golden: seed 42 always gives this sequence', () => {
    // If this fails, every replay golden recorded on MemoryStore changes too.
    const r = createRng(42)
    expect([r.next(), r.next(), r.next()]).toEqual([0.23955312534235418, 0.5859209857881069, 0.09323416277766228])
    expect(Array.from({ length: 8 }, () => r.int(1, 6))).toEqual([2, 3, 6, 6, 6, 3, 6, 2])
    expect(r.pick(['a', 'b', 'c', 'd'])).toBe('c')
  })

  it('same seed, same sequence; different seed, different sequence', () => {
    const draw = (seed: number): number[] => {
      const r = createRng(seed)
      return Array.from({ length: 100 }, () => r.next())
    }
    expect(draw(7)).toEqual(draw(7))
    expect(draw(7)).not.toEqual(draw(8))
  })

  it('next is in [0, 1); int is inclusive and covers its range', () => {
    const r = createRng(1)
    const seen = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const f = r.next()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = r.int(-2, 2)
      expect(n).toBeGreaterThanOrEqual(-2)
      expect(n).toBeLessThanOrEqual(2)
      seen.add(n)
    }
    expect([...seen].sort()).toEqual([-1, -2, 0, 1, 2])
    expect(r.int(5, 5)).toBe(5)
  })

  it('rejects bad arguments', () => {
    const r = createRng(1)
    expect(() => createRng(1.5)).toThrow(/integer/)
    expect(() => r.int(3, 2)).toThrow(/lo 3 > hi 2/)
    expect(() => r.int(0.5, 2)).toThrow(/safe integers/)
    expect(() => r.int(0, 2 ** 40)).toThrow(/wider than 2\^32/)
    expect(() => r.pick([])).toThrow(/empty/)
  })
})
