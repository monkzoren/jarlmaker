import { content } from '@bastion/content'
import { describe, expect, it, vi } from 'vitest'
import type { NetConfig } from './config.ts'
import { connect } from './connection.ts'
import { createNonceSource } from './nonce.ts'
import { createSnapshotStore } from './snapshot.ts'
import { forgetRejectedToken, isTokenRejection, loadToken, type TokenStorage } from './token.ts'

/**
 * A stand-in for the generated SpacetimeDB bindings. Each `build()` is one
 * connect attempt: it records the token the attempt was given and fails with
 * the next scripted error (or stays pending once the script runs out).
 */
const sdk = vi.hoisted(() => {
  const attempts: (string | undefined)[] = []
  const errors: Error[] = []
  const table = () => ({ onInsert: () => {}, onUpdate: () => {}, onDelete: () => {}, iter: () => [] })
  class Builder {
    token: string | undefined
    connectError: ((ctx: unknown, err: Error) => void) | undefined
    withUri() {
      return this
    }
    withDatabaseName() {
      return this
    }
    withToken(t: string | undefined) {
      this.token = t
      return this
    }
    onConnect() {
      return this
    }
    onConnectError(fn: (ctx: unknown, err: Error) => void) {
      this.connectError = fn
      return this
    }
    onDisconnect() {
      return this
    }
    build() {
      attempts.push(this.token)
      const err = errors.shift()
      if (err !== undefined) queueMicrotask(() => this.connectError?.({}, err))
      return {
        db: { entity: table(), entityPos: table(), worldClock: table() },
        reducers: { move: async () => {}, join: async () => {} },
        disconnect: () => {},
      }
    }
  }
  return { attempts, errors, DbConnection: { builder: () => new Builder() } }
})
vi.mock('./bindings/index.ts', () => ({ DbConnection: sdk.DbConnection }))

const { net } = content.tuning
const config: NetConfig = { uri: 'ws://test', moduleName: 'bastion', tokenKey: 'bastion.token.bastion.a' }
const SDK_401 = new Error('Failed to verify token: Unauthorized')

function memStorage(initial: Record<string, string>): TokenStorage & { readonly map: Map<string, string> } {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

/** Drive `connect` through one failed attempt and its retry; returns the token each attempt used. */
async function attemptsAfterFailure(storage: TokenStorage, fail: Error): Promise<(string | undefined)[]> {
  sdk.attempts.length = 0
  sdk.errors.splice(0, sdk.errors.length, fail)
  const timers: (() => void)[] = []
  const link = connect({
    config,
    snapshot: createSnapshotStore(),
    nonces: createNonceSource(),
    storage,
    queue: { seconds: net.reconnectQueueSeconds, max: net.reconnectQueueMax },
    timing: {
      backoffMinMs: net.reconnectBackoffMinMs,
      backoffMaxMs: net.reconnectBackoffMaxMs,
      silenceMs: net.reconnectSilenceMs,
      connectTimeoutMs: net.reconnectConnectTimeoutMs,
    },
    onState: () => {},
    timers: { set: (fn) => timers.push(fn), clear: () => {} },
  })
  await Promise.resolve()
  // The failed attempt scheduled its retry last; firing it opens attempt two.
  timers.at(-1)?.()
  link.disconnect()
  return [...sdk.attempts]
}

describe('isTokenRejection', () => {
  it('matches only the SDK 401 on the token exchange', () => {
    expect(isTokenRejection(SDK_401)).toBe(true)
    expect(isTokenRejection(new Error('Failed to verify token: Internal Server Error'))).toBe(false)
    expect(isTokenRejection(new Error('Failed to verify token: Bad Gateway'))).toBe(false)
    expect(isTokenRejection(new Error('WebSocket error'))).toBe(false)
    expect(isTokenRejection(new TypeError('Failed to fetch'))).toBe(false)
    expect(isTokenRejection(undefined)).toBe(false)
  })
})

describe('forgetRejectedToken', () => {
  it('clears only this key, and only on a rejection', () => {
    const s = memStorage({ [config.tokenKey]: 'old', 'bastion.token.bastion.b': 'other' })
    expect(forgetRejectedToken(s, config.tokenKey, new Error('WebSocket error'))).toBe(false)
    expect(loadToken(s, config.tokenKey)).toBe('old')
    expect(forgetRejectedToken(s, config.tokenKey, SDK_401)).toBe(true)
    expect(loadToken(s, config.tokenKey)).toBeUndefined()
    expect(loadToken(s, 'bastion.token.bastion.b')).toBe('other')
  })
})

describe('connection token handling', () => {
  it('a rejected token is dropped and the next attempt connects without one', async () => {
    const s = memStorage({ [config.tokenKey]: 'stale' })
    expect(await attemptsAfterFailure(s, SDK_401)).toEqual(['stale', undefined])
    expect(s.map.has(config.tokenKey)).toBe(false)
  })

  it('any other connect error keeps the token, so a network drop never changes identity', async () => {
    for (const err of [new Error('WebSocket error'), new TypeError('Failed to fetch'), new Error('Failed to verify token: Service Unavailable')]) {
      const s = memStorage({ [config.tokenKey]: 'mine' })
      expect(await attemptsAfterFailure(s, err)).toEqual(['mine', 'mine'])
      expect(s.map.get(config.tokenKey)).toBe('mine')
    }
  })
})
