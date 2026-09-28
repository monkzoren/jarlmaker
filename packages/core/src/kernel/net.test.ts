import { describe, expect, it } from 'vitest'
import { ContentError, createGame } from '../game.ts'
import './net.ts'

// Mirrors packages/content/tuning/net.ts, which core cannot import.
const NET = { tickHz: 10, reconnectQueueSeconds: 30, reconnectQueueMax: 300 }

describe('net tuning', () => {
  it('keeps tuning.net on the Game', () => {
    expect(createGame({ tuning: { net: NET } }).content.tuning.net.tickHz).toBe(10)
  })

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])('rejects tickHz %s', (tickHz) => {
    expect(() => createGame({ tuning: { net: { ...NET, tickHz } } })).toThrow(ContentError)
  })

  it('rejects non-positive or fractional queue knobs', () => {
    expect(() => createGame({ tuning: { net: { ...NET, reconnectQueueSeconds: 0 } } })).toThrow(ContentError)
    expect(() => createGame({ tuning: { net: { ...NET, reconnectQueueMax: 2.5 } } })).toThrow(ContentError)
  })

  it('is required', () => {
    expect(() => createGame({ tuning: {} })).toThrow(ContentError)
  })
})
