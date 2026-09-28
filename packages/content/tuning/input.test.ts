import { describe, expect, it } from 'vitest'
import { input } from './input.ts'

// No core system owns `tuning.input` (the stick lives in the client), so its
// ranges are checked here rather than by a registered schema.
describe('tuning.input', () => {
  it('keeps the dead zone in [0, 1)', () => {
    expect(input.deadZone).toBeGreaterThanOrEqual(0)
    expect(input.deadZone).toBeLessThan(1)
  })

  it('has a positive stick radius', () => {
    expect(input.stickRadiusPx).toBeGreaterThan(0)
  })
})
