import { describe, expect, it } from 'vitest'
import { ContentError, createGame } from '../game.ts'
import './net.ts'

// Mirrors packages/content/tuning/net.ts, which core cannot import.
const NET = {
  tickHz: 10,
  reconnectQueueSeconds: 30,
  reconnectQueueMax: 300,
  reconnectBackoffMinMs: 500,
  reconnectBackoffMaxMs: 5000,
  reconnectSilenceMs: 3000,
  reconnectConnectTimeoutMs: 8000,
}

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

  it('keeps the reconnect timing knobs', () => {
    const net = createGame({ tuning: { net: NET } }).content.tuning.net
    expect(net.reconnectBackoffMinMs).toBe(500)
    expect(net.reconnectBackoffMaxMs).toBe(5000)
    expect(net.reconnectSilenceMs).toBe(3000)
    expect(net.reconnectConnectTimeoutMs).toBe(8000)
  })

  it.each(['reconnectBackoffMinMs', 'reconnectBackoffMaxMs', 'reconnectSilenceMs', 'reconnectConnectTimeoutMs'])(
    'rejects a non-positive, fractional, or missing %s',
    (key) => {
      for (const bad of [0, -1, 2.5, undefined]) {
        expect(() => createGame({ tuning: { net: { ...NET, [key]: bad } } })).toThrow(ContentError)
      }
    },
  )

  it('rejects a backoff ceiling below its floor', () => {
    expect(() =>
      createGame({ tuning: { net: { ...NET, reconnectBackoffMinMs: 5000, reconnectBackoffMaxMs: 500 } } }),
    ).toThrow(ContentError)
    const equal = { ...NET, reconnectBackoffMinMs: 1000, reconnectBackoffMaxMs: 1000 }
    expect(createGame({ tuning: { net: equal } }).content.tuning.net.reconnectBackoffMaxMs).toBe(1000)
  })

  it('is required', () => {
    expect(() => createGame({ tuning: {} })).toThrow(ContentError)
  })
})
