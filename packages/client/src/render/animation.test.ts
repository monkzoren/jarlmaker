import { describe, expect, it } from 'vitest'
import { advanceAnim, initialAnim, pickFrame, type AnimKnobs, type AnimState } from './animation.ts'

const K: AnimKnobs = { pxPerFrame: 8, walkFrames: 4, minSpeedPxPerS: 12, stopAfterMs: 120 }
const FRAME_MS = 16

/** Walk from `s` by (vx, vy) px/s for `ms`, one 16 ms frame at a time. */
function walk(s: AnimState, vx: number, vy: number, ms: number): AnimState {
  for (let t = 0; t < ms; t += FRAME_MS) s = advanceAnim(s, s.x + (vx * FRAME_MS) / 1000, s.y + (vy * FRAME_MS) / 1000, FRAME_MS, K)
  return s
}

describe('castaway animation', () => {
  it('starts idle, facing the camera', () => {
    expect(pickFrame(initialAnim(0, 0), K)).toEqual({ anim: 'idle', facing: 'down', index: 0, flip: false })
  })

  it.each([
    ['down', 0, 64, 'down', false],
    ['up', 0, -64, 'up', false],
    ['right', 64, 0, 'side', false],
    ['left', -64, 0, 'side', true],
    ['down-right diagonal', 45, 45, 'side', false],
    ['up-left diagonal', -45, -45, 'side', true],
    ['mostly down', 10, 64, 'down', false],
  ] as const)('walking %s faces %s', (_name, vx, vy, facing, flip) => {
    const p = pickFrame(walk(initialAnim(0, 0), vx, vy, 200), K)
    expect(p).toMatchObject({ anim: 'walk', facing, flip })
  })

  it('advances the walk frame by distance, not time', () => {
    let s = initialAnim(0, 0)
    const seen: number[] = []
    for (let i = 0; i < 8; i++) {
      s = advanceAnim(s, s.x + 8, s.y, 100, K) // 8 px per step = one frame each
      seen.push(pickFrame(s, K).index)
    }
    expect(seen).toEqual([1, 2, 3, 0, 1, 2, 3, 0])
    // Twice as fast in wall time, same distance: same frames.
    let f = initialAnim(0, 0)
    for (let i = 0; i < 8; i++) f = advanceAnim(f, f.x + 8, f.y, 50, K)
    expect(pickFrame(f, K).index).toBe(pickFrame(s, K).index)
  })

  it('goes idle only after standing still for stopAfterMs, keeping its facing', () => {
    let s = walk(initialAnim(0, 0), -64, 0, 200)
    s = advanceAnim(s, s.x, s.y, 60, K)
    expect(pickFrame(s, K).anim).toBe('walk')
    s = advanceAnim(s, s.x, s.y, 80, K)
    expect(pickFrame(s, K)).toEqual({ anim: 'idle', facing: 'side', index: 0, flip: true })
  })

  it('does not walk for a slow correction drift', () => {
    const s = walk(initialAnim(0, 0), 5, 0, 500)
    expect(pickFrame(s, K)).toEqual({ anim: 'idle', facing: 'down', index: 0, flip: false })
  })
})
