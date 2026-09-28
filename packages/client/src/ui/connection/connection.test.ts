// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnState } from '../../net/status.ts'
import { createConnectionHud, dropToastText, PIP_TEXT, pipVisible } from './index.ts'

const STATES: ConnState[] = [
  { kind: 'connecting', uri: 'ws://h' },
  { kind: 'connected', identity: 'abc' },
  { kind: 'joined', identity: 'abc', entities: 1 },
  { kind: 'dropped', queued: 1, attempt: 1 },
  { kind: 'reconnecting', queued: 1, attempt: 1 },
  { kind: 'disconnected' },
  { kind: 'error', reason: 'x' },
]

// Emoji and pictograph ranges (CLAUDE.md 3.5.9): the pip and toast are text only.
const PICTOGRAPH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('pipVisible', () => {
  it('shows only while dropped or reconnecting', () => {
    expect(STATES.filter(pipVisible).map((s) => s.kind)).toEqual(['dropped', 'reconnecting'])
  })
})

describe('connection hud', () => {
  it('toggles the pip with the state and is plain text', () => {
    const hud = createConnectionHud()
    const pip = document.getElementById('conn-pip')
    expect(pip?.hasAttribute('data-on')).toBe(false)
    for (const s of STATES) {
      hud.update(s)
      expect(pip?.hasAttribute('data-on')).toBe(pipVisible(s))
    }
    expect(pip?.textContent).toBe(PIP_TEXT)
    expect(PICTOGRAPH.test(PIP_TEXT)).toBe(false)
  })

  it('shows the toast only when the queue is dropped, then hides it', () => {
    vi.useFakeTimers()
    const hud = createConnectionHud()
    const toast = document.getElementById('conn-toast')
    for (const s of STATES) hud.update(s)
    expect(toast?.hasAttribute('data-on')).toBe(false)
    hud.queueDropped(3)
    expect(toast?.hasAttribute('data-on')).toBe(true)
    expect(toast?.textContent).toBe(dropToastText(3))
    vi.advanceTimersByTime(60_000)
    expect(toast?.hasAttribute('data-on')).toBe(false)
  })

  it('words the toast for one and many, without pictographs', () => {
    expect(dropToastText(1)).toBe('Connection lost too long: 1 move was not sent')
    expect(dropToastText(4)).toBe('Connection lost too long: 4 moves were not sent')
    expect(PICTOGRAPH.test(dropToastText(4))).toBe(false)
  })
})
