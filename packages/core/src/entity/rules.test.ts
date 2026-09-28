import { describe, expect, it } from 'vitest'
import { KNOBS } from './fixture.test-util.ts'
import { atRest, clampInput, sectorOf, step } from './rules.ts'
import type { Motion } from './schema.ts'
import { FLAT_WORLD, type WorldView } from './world-view.ts'

const REST: Motion = { x: 0.5, y: 0.5, vx: 0, vy: 0, facing: 0, sector: '0,0' }

describe('clampInput', () => {
  it('keeps sticks inside the unit circle and scales longer ones onto it', () => {
    expect(clampInput({ ix: 0.3, iy: -0.4 })).toEqual({ ix: 0.3, iy: -0.4 })
    const c = clampInput({ ix: 30, iy: 40 })
    expect(c.ix).toBeCloseTo(0.6)
    expect(c.iy).toBeCloseTo(0.8)
  })

  it('treats non-finite axes as zero', () => {
    expect(clampInput({ ix: Number.NaN, iy: Number.POSITIVE_INFINITY })).toEqual({ ix: 0, iy: 0 })
  })
})

describe('sectorOf', () => {
  it('floors toward negative infinity on both axes', () => {
    expect(sectorOf(0, 0, 32)).toBe('0,0')
    expect(sectorOf(31.99, 32, 32)).toBe('0,1')
    expect(sectorOf(-0.01, -32.01, 32)).toBe('-1,-2')
  })
})

describe('step', () => {
  it('accelerates toward the stick at accel, then holds speed', () => {
    // 32 cells/s² for 0.1 s: 3.2 cells/s, short of the 4 cells/s cap.
    const a = step(REST, { ix: 1, iy: 0 }, 100, FLAT_WORLD, KNOBS)
    expect(a.vx).toBeCloseTo(3.2)
    expect(a.x).toBeCloseTo(0.82)
    const b = step(a, { ix: 1, iy: 0 }, 100, FLAT_WORLD, KNOBS)
    expect(b.vx).toBe(KNOBS.speed)
    expect(b.x).toBeCloseTo(1.22)
    expect(b.facing).toBe(0)
  })

  it('clamps a hostile stick so diagonal and oversized input never exceed speed', () => {
    let m = REST
    for (let i = 0; i < 10; i += 1) m = step(m, { ix: 1e9, iy: 1e9 }, 100, FLAT_WORLD, KNOBS)
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(KNOBS.speed)
    expect(m.facing).toBeCloseTo(Math.PI / 4)
  })

  it('decelerates to exactly zero and keeps facing when the stick is released', () => {
    const moving: Motion = { ...REST, vx: 0, vy: -4, facing: -Math.PI / 2 }
    const m = step(moving, { ix: 0, iy: 0 }, 200, FLAT_WORLD, KNOBS)
    expect(m.vy).toBe(0)
    expect(m.vx).toBe(0)
    expect(m.facing).toBe(-Math.PI / 2)
    expect(atRest(m, { ix: 0, iy: 0 })).toBe(true)
  })

  it('splits a long dt into steps no longer than maxStepMs (same result as stepping by hand)', () => {
    const long = step(REST, { ix: 1, iy: 1 }, 350, FLAT_WORLD, KNOBS)
    let byHand = REST
    for (const ms of [100, 100, 100, 50]) byHand = step(byHand, { ix: 1, iy: 1 }, ms, FLAT_WORLD, KNOBS)
    expect(long).toEqual(byHand)
  })

  it('does nothing over a zero dt', () => {
    expect(step(REST, { ix: 1, iy: 0 }, 0, FLAT_WORLD, KNOBS)).toEqual(REST)
  })

  it('stops the blocked axis at a wall and keeps sliding along the other', () => {
    const wallAtX2: WorldView = { walkable: (cx) => cx < 2 }
    let m: Motion = { ...REST, x: 1.5 }
    for (let i = 0; i < 20; i += 1) m = step(m, { ix: 1, iy: 1 }, 100, wallAtX2, KNOBS)
    expect(m.x).toBeLessThan(2)
    expect(m.vx).toBe(0)
    expect(m.y).toBeGreaterThan(REST.y + 1)
  })

  it('never tunnels through a one-cell wall, even over a huge dt', () => {
    const wallAtX3: WorldView = { walkable: (cx) => cx !== 3 }
    const m = step({ ...REST, x: 2.5, vx: KNOBS.speed }, { ix: 1, iy: 0 }, 60_000, wallAtX3, KNOBS)
    expect(m.x).toBeLessThan(3)
  })

  it('recomputes the sector from the final position', () => {
    const edge: Motion = { ...REST, x: 31.9, vx: KNOBS.speed }
    expect(step(edge, { ix: 1, iy: 0 }, 100, FLAT_WORLD, KNOBS).sector).toBe('1,0')
  })

  it('is pure: the input position is not mutated', () => {
    const before = { ...REST }
    step(REST, { ix: 1, iy: 0 }, 100, FLAT_WORLD, KNOBS)
    expect(REST).toEqual(before)
  })
})
