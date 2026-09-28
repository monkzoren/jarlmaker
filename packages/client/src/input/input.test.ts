// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInput, createNonceSource, keyVector, NONCE_KEY, stickVector } from './index.ts'
import type { CommandSink, InputKnobs, MoveCommand } from './index.ts'
import type { CommandEnvelope } from '@bastion/core'

// Test knobs, not tuning: the numbers only need to make the cases readable.
const KNOBS: InputKnobs = { tickHz: 10, deadZone: 0.2, stickRadiusPx: 50 }
const len = (v: { ix: number; iy: number }) => Math.hypot(v.ix, v.iy)

beforeEach(() => window.sessionStorage.clear())

describe('vector normalisation', () => {
  const none = { up: false, down: false, left: false, right: false }

  it('maps one key to a unit axis, up is -y', () => {
    expect(keyVector({ ...none, up: true })).toEqual({ ix: 0, iy: -1 })
    expect(keyVector({ ...none, right: true })).toEqual({ ix: 1, iy: 0 })
  })

  it('clamps a diagonal to unit length', () => {
    const v = keyVector({ ...none, down: true, left: true })
    expect(len(v)).toBeCloseTo(1, 12)
    expect(v.ix).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(v.iy).toBeCloseTo(Math.SQRT1_2, 12)
  })

  it('cancels opposite keys', () => {
    expect(keyVector({ up: true, down: true, left: true, right: true })).toEqual({ ix: 0, iy: 0 })
  })

  it('caps a stick dragged past its radius at magnitude 1, keeping direction', () => {
    const v = stickVector(300, -400, 50, 0.2)
    expect(len(v)).toBeCloseTo(1, 12)
    expect(v.ix / v.iy).toBeCloseTo(300 / -400, 12)
  })
})

describe('dead zone', () => {
  it('reads zero inside and on the dead-zone edge', () => {
    expect(stickVector(0, 0, 50, 0.2)).toEqual({ ix: 0, iy: 0 })
    expect(stickVector(6, 8, 50, 0.2)).toEqual({ ix: 0, iy: 0 }) // dist 10 = edge
    expect(stickVector(3, -4, 50, 0.2)).toEqual({ ix: 0, iy: 0 })
  })

  it('ramps from 0 at the edge to 1 at the radius', () => {
    expect(len(stickVector(10.5, 0, 50, 0.2))).toBeCloseTo(0.5 / 40, 12)
    expect(len(stickVector(0, 30, 50, 0.2))).toBeCloseTo(0.5, 12)
    expect(stickVector(0, 50, 50, 0.2)).toEqual({ ix: 0, iy: 1 })
  })

  it('treats bad readings as zero', () => {
    expect(stickVector(Number.NaN, 5, 50, 0.2)).toEqual({ ix: 0, iy: 0 })
    expect(stickVector(20, 0, 0, 0.2)).toEqual({ ix: 0, iy: 0 })
  })
})

describe('nonces', () => {
  it('increase by one per command', () => {
    const src = createNonceSource(window.sessionStorage, () => 0)
    const a = src.next()
    const b = src.next()
    const c = src.next()
    expect([b - a, c - b]).toEqual([1, 1])
  })

  it('continue from sessionStorage after a reconnect or reload', () => {
    const first = createNonceSource(window.sessionStorage, () => 0)
    first.next()
    const lastBefore = first.next()
    expect(window.sessionStorage.getItem(NONCE_KEY)).toBe(String(lastBefore))
    const again = createNonceSource(window.sessionStorage, () => 0)
    expect(again.next()).toBe(lastBefore + 1)
  })

  it('never go backwards when the clock does', () => {
    let t = 5_000
    const src = createNonceSource(window.sessionStorage, () => t)
    const a = src.next()
    t = 1_000
    expect(src.next()).toBe(a + 1)
  })

  it('start above an earlier session when sessionStorage is empty (new tab)', () => {
    const old = createNonceSource(window.sessionStorage, () => 1_000)
    const oldLast = old.next()
    window.sessionStorage.clear()
    const fresh = createNonceSource(window.sessionStorage, () => 2_000)
    expect(fresh.next()).toBeGreaterThan(oldLast)
  })

  it('ignore a corrupt stored value', () => {
    window.sessionStorage.setItem(NONCE_KEY, 'bogus')
    expect(createNonceSource(window.sessionStorage, () => 0).next()).toBe(0)
  })
})

describe('createInput', () => {
  let sent: CommandEnvelope<MoveCommand>[]
  const sink: CommandSink = { send: (e) => sent.push(e) }
  const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }))
  const pointer = (type: string, x: number, y: number, pointerType = 'touch') => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
    Object.assign(e, { pointerId: 7, pointerType })
    document.body.dispatchEvent(e)
  }

  beforeEach(() => {
    sent = []
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('samples at the tick rate and emits only on change, with rising nonces', () => {
    const input = createInput(sink, { knobs: KNOBS, now: () => 0 })
    key('keydown', 'KeyD')
    vi.advanceTimersByTime(99)
    expect(sent).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(sent.map((e) => e.cmd)).toEqual([{ kind: 'entity.move', ix: 1, iy: 0 }])
    vi.advanceTimersByTime(500) // held: nothing new
    expect(sent).toHaveLength(1)
    key('keyup', 'KeyD')
    vi.advanceTimersByTime(100)
    expect(sent.map((e) => e.cmd)).toEqual([
      { kind: 'entity.move', ix: 1, iy: 0 },
      { kind: 'entity.move', ix: 0, iy: 0 },
    ])
    expect(sent[1]!.nonce).toBe(sent[0]!.nonce + 1)
    input.dispose()
  })

  it('arrow keys and the touch stick produce the same payload shape', () => {
    const input = createInput(sink, { knobs: KNOBS, now: () => 0 })
    key('keydown', 'ArrowUp')
    input.sample()
    key('keyup', 'ArrowUp')
    input.sample()
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 100, 50) // full deflection up
    input.sample()
    pointer('pointerup', 100, 50)
    input.sample()
    expect(sent.map((e) => e.cmd)).toEqual([
      { kind: 'entity.move', ix: 0, iy: -1 },
      { kind: 'entity.move', ix: 0, iy: 0 },
      { kind: 'entity.move', ix: 0, iy: -1 },
      { kind: 'entity.move', ix: 0, iy: 0 },
    ])
    input.dispose()
  })

  it('ignores mouse pointers and stops after dispose', () => {
    const input = createInput(sink, { knobs: KNOBS, now: () => 0 })
    pointer('pointerdown', 0, 0, 'mouse')
    pointer('pointermove', 50, 0, 'mouse')
    input.sample()
    expect(sent).toHaveLength(0)
    input.dispose()
    key('keydown', 'KeyW')
    vi.advanceTimersByTime(1000)
    expect(sent).toHaveLength(0)
  })
})
