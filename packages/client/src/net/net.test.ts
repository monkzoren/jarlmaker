import { describe, expect, it } from 'vitest'
import { TILE_PX } from '../render/zoom.ts'
import { SUBSCRIPTIONS } from './connection.ts'
import { DEFAULT_MODULE, DEFAULT_PORT, readNetConfig } from './config.ts'
import { createNonceSource } from './nonce.ts'
import { createSnapshotStore } from './snapshot.ts'
import { statusText } from './status.ts'
import { loadToken, saveToken, type TokenStorage } from './token.ts'

const page = { hostname: '192.168.1.5', protocol: 'http:', search: '' }

describe('readNetConfig', () => {
  it('defaults to the local server on the page host', () => {
    expect(readNetConfig({}, page)).toEqual({
      uri: `ws://192.168.1.5:${DEFAULT_PORT}`,
      moduleName: DEFAULT_MODULE,
      tokenKey: `bastion.token.${DEFAULT_MODULE}`,
    })
  })

  it('uses wss on an https page and 127.0.0.1 with no hostname', () => {
    expect(readNetConfig({}, { ...page, protocol: 'https:' }).uri).toBe(`wss://192.168.1.5:${DEFAULT_PORT}`)
    expect(readNetConfig({}, { ...page, hostname: '' }).uri).toBe(`ws://127.0.0.1:${DEFAULT_PORT}`)
  })

  it('takes Vite env over defaults, ignoring blanks', () => {
    const c = readNetConfig({ VITE_STDB_URI: 'wss://stdb.example', VITE_STDB_MODULE: 'bastion-test' }, page)
    expect(c.uri).toBe('wss://stdb.example')
    expect(c.moduleName).toBe('bastion-test')
    expect(readNetConfig({ VITE_STDB_URI: '  ', VITE_STDB_MODULE: '' }, page).moduleName).toBe(DEFAULT_MODULE)
  })

  it('keys the token by module and ?profile= so two tabs can be two players', () => {
    expect(readNetConfig({}, { ...page, search: '?profile=b' }).tokenKey).toBe(`bastion.token.${DEFAULT_MODULE}.b`)
  })
})

describe('token storage', () => {
  it('round-trips and survives missing or throwing storage', () => {
    const m = new Map<string, string>()
    const mem: TokenStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
    expect(loadToken(mem, 'k')).toBeUndefined()
    saveToken(mem, 'k', 'tok')
    expect(loadToken(mem, 'k')).toBe('tok')

    const broken: TokenStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadToken(broken, 'k')).toBeUndefined()
    expect(() => saveToken(broken, 'k', 'tok')).not.toThrow()
    expect(loadToken(undefined, 'k')).toBeUndefined()
  })
})

describe('createNonceSource', () => {
  it('is strictly increasing even when the clock stalls or goes back', () => {
    const times = [1000, 1000, 900, 2000.7]
    const src = createNonceSource(() => times.shift() ?? 0)
    expect([src.next(), src.next(), src.next(), src.next()]).toEqual([1000, 1001, 1002, 2000])
  })

  it('starts above any earlier session that used the clock', () => {
    const earlier = createNonceSource(() => 5000)
    const last = earlier.next()
    expect(createNonceSource(() => 5001).next()).toBeGreaterThan(last)
  })
})

describe('snapshot store', () => {
  const entity = (id: bigint) => ({ id, kind: 'player', owner: `owner-${id}` })

  it('renders only entities with both rows, in pixels, keyed by id', () => {
    const s = createSnapshotStore()
    s.upsertEntity(entity(1n))
    s.upsertPos({ id: 1n, x: 2, y: -0.5 })
    s.upsertPos({ id: 2n, x: 9, y: 9 }) // no entity row yet
    expect(s.toRenderSnapshot()).toEqual({ entities: [{ id: '1', x: 2 * TILE_PX, y: -0.5 * TILE_PX }] })
    expect(s.size).toBe(1)
    s.upsertEntity(entity(2n))
    expect(s.size).toBe(2)
  })

  it('updates in place and forgets deleted rows', () => {
    const s = createSnapshotStore()
    s.upsertEntity(entity(1n))
    s.upsertPos({ id: 1n, x: 0, y: 0 })
    s.upsertPos({ id: 1n, x: 1, y: 0 })
    expect(s.toRenderSnapshot().entities).toEqual([{ id: '1', x: TILE_PX, y: 0 }])
    s.deletePos(1n)
    expect(s.toRenderSnapshot().entities).toEqual([])
    s.upsertPos({ id: 1n, x: 1, y: 0 })
    s.deleteEntity(1n)
    expect(s.size).toBe(0)
  })

  it('notifies on change and stops after unsubscribe', () => {
    const s = createSnapshotStore()
    let n = 0
    const off = s.onChange(() => n++)
    s.upsertEntity(entity(1n))
    s.deleteEntity(7n) // absent: no change
    expect(n).toBe(1)
    off()
    s.clear()
    expect(n).toBe(1)
  })
})

describe('statusText', () => {
  it('names every state', () => {
    expect(statusText({ kind: 'connecting', uri: 'ws://h:3000' })).toBe('connecting to ws://h:3000')
    expect(statusText({ kind: 'connected', identity: 'abcdef0123456789' })).toBe('connected as abcdef01')
    expect(statusText({ kind: 'joined', identity: 'abcdef0123456789', entities: 2 })).toBe('online as abcdef01 | 2 in view')
    expect(statusText({ kind: 'disconnected' })).toBe('disconnected')
    expect(statusText({ kind: 'disconnected', reason: 'socket closed' })).toBe('disconnected: socket closed')
    expect(statusText({ kind: 'error', reason: 'x' })).toBe('error: x')
  })
})

describe('subscriptions', () => {
  it('cover the two public entity tables (whole tables until P1-017)', () => {
    expect(SUBSCRIPTIONS).toEqual(['SELECT * FROM entity', 'SELECT * FROM entity_pos'])
  })
})
