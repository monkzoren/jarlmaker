import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { reject } from '../commands.ts'
import type { GameEvent } from '../events/index.ts'
import { MAX_EVENTS_PER_STEP } from '../dispatch.ts'
import { execute } from '../execute.ts'
import { createGame } from '../game.ts'
import { Registry } from '../registry.ts'
import { MemoryStore } from '../store/memory.ts'
import { worldClock } from './clock.ts'
import { commandNonce } from './nonce.ts'

// Fixture commands and events live in a local Registry, so the real
// CommandRegistry / EventRegistry stay empty.
type TestCommand =
  | { readonly kind: 'test.add'; readonly n: number }
  | { readonly kind: 'test.refuse' }
  | { readonly kind: 'test.loop' }
type TestEvent =
  | { readonly kind: 'test.added'; readonly tick: number; readonly n: number }
  | { readonly kind: 'test.noted'; readonly tick: number; readonly by: string }
  | { readonly kind: 'test.looped'; readonly tick: number }

// The contract's GameEvent union is empty until systems add kinds.
const ev = (e: TestEvent): GameEvent => e as unknown as GameEvent

const NET = {
  tickHz: 10,
  reconnectQueueSeconds: 30,
  reconnectQueueMax: 300,
  reconnectBackoffMinMs: 500,
  reconnectBackoffMaxMs: 5000,
  reconnectSilenceMs: 3000,
  reconnectConnectTimeoutMs: 8000,
  offlineMoveGraceMs: 500,
}
const game = createGame({ tuning: { net: NET } })
const SENDER = 'alice'

function setup() {
  const store = new MemoryStore({ tables: [commandNonce, worldClock] })
  const registry = new Registry<TestCommand, TestEvent>()
  const seen: string[] = []
  registry.command({
    kind: 'test.add',
    schema: z.object({ n: z.int().positive() }),
    handle: (ctx, cmd) => {
      seen.push(`add ${cmd.n} by ${ctx.sender}`)
      ctx.store.emit(ev({ kind: 'test.added', tick: 0, n: cmd.n }))
    },
  })
  registry.command({
    kind: 'test.refuse',
    schema: z.object({}),
    handle: (ctx) => {
      ctx.store.emit(ev({ kind: 'test.added', tick: 0, n: 1 }))
      return reject('not_allowed', 'never')
    },
  })
  registry.command({
    kind: 'test.loop',
    schema: z.object({}),
    handle: (ctx) => ctx.store.emit(ev({ kind: 'test.looped', tick: 0 })),
  })
  registry.on('test.looped', (ctx) => ctx.store.emit(ev({ kind: 'test.looped', tick: 0 })))
  const run = (nonce: number, cmd: unknown, sender = SENDER) => execute(game, store, sender, { nonce, cmd }, { registry })
  return { store, registry, seen, run }
}

describe('execute: validation returns Rejections, never throws', () => {
  it('accepts a valid command, runs its handler and records the nonce', () => {
    const { store, seen, run } = setup()
    expect(run(1, { kind: 'test.add', n: 3 })).toBeUndefined()
    expect(seen).toEqual(['add 3 by alice'])
    expect(store.get('command_nonce', SENDER)).toEqual({ sender: SENDER, nonce: 1 })
    expect(store.events()).toEqual([{ kind: 'test.added', tick: 0, n: 3 }])
  })

  it('rejects an unknown command kind', () => {
    const { store, seen, run } = setup()
    expect(run(1, { kind: 'test.nope' })).toMatchObject({ code: 'unknown_command' })
    expect(seen).toEqual([])
    expect(store.get('command_nonce', SENDER)).toBeUndefined()
  })

  it('rejects a bad payload with the failing path', () => {
    const { seen, run } = setup()
    const r = run(1, { kind: 'test.add', n: -2 })
    expect(r?.code).toBe('bad_payload')
    expect(r?.message).toMatch(/^test\.add: n:/)
    expect(run(2, { kind: 'test.add', n: 'three' })?.code).toBe('bad_payload')
    expect(run(3, { kind: 'test.add' })?.code).toBe('bad_payload')
    expect(seen).toEqual([])
  })

  it('rejects a malformed envelope', () => {
    const { store } = setup()
    const registry = new Registry<TestCommand, TestEvent>()
    for (const envelope of [null, 'x', {}, { nonce: -1, cmd: { kind: 'test.add' } }, { nonce: 1.5, cmd: { kind: 'a' } }, { nonce: 1, cmd: {} }]) {
      expect(execute(game, store, SENDER, envelope, { registry })?.code).toBe('bad_envelope')
    }
  })

  it('passes a handler Rejection through, records no nonce and dispatches nothing', () => {
    const { store, run } = setup()
    expect(run(1, { kind: 'test.refuse' })).toEqual({ code: 'not_allowed', message: 'never' })
    expect(store.get('command_nonce', SENDER)).toBeUndefined()
    expect(store.events()).toEqual([])
    // The same nonce may be sent again after a rejection (the server rolled it back).
    expect(run(1, { kind: 'test.add', n: 1 })).toBeUndefined()
  })
})

describe('execute: nonce dedupe (3.6 rule 7)', () => {
  it('rejects a duplicate nonce as `duplicate`', () => {
    const { seen, run } = setup()
    expect(run(5, { kind: 'test.add', n: 1 })).toBeUndefined()
    expect(run(5, { kind: 'test.add', n: 1 })).toMatchObject({ code: 'duplicate' })
    expect(seen).toEqual(['add 1 by alice'])
  })

  it('rejects an out-of-order (lower) nonce and accepts gaps upward', () => {
    const { store, seen, run } = setup()
    expect(run(2, { kind: 'test.add', n: 2 })).toBeUndefined()
    expect(run(1, { kind: 'test.add', n: 1 })).toMatchObject({ code: 'duplicate' })
    expect(run(7, { kind: 'test.add', n: 7 })).toBeUndefined()
    expect(seen).toEqual(['add 2 by alice', 'add 7 by alice'])
    expect(store.get('command_nonce', SENDER)?.nonce).toBe(7)
  })

  it('checks the nonce before the kind, so a replayed unknown command is a duplicate', () => {
    const { run } = setup()
    expect(run(3, { kind: 'test.add', n: 1 })).toBeUndefined()
    expect(run(3, { kind: 'test.nope' })).toMatchObject({ code: 'duplicate' })
  })

  it('keeps nonces per sender', () => {
    const { run } = setup()
    expect(run(4, { kind: 'test.add', n: 1 }, 'alice')).toBeUndefined()
    expect(run(1, { kind: 'test.add', n: 1 }, 'bob')).toBeUndefined()
    expect(run(4, { kind: 'test.add', n: 1 }, 'alice')).toMatchObject({ code: 'duplicate' })
  })
})

describe('event dispatch', () => {
  it('runs handlers after the handler step, in registration order, breadth-first', () => {
    const { store, registry, seen, run } = setup()
    registry.on('test.added', (ctx, e) => {
      seen.push(`first saw ${e.n}`)
      ctx.store.emit(ev({ kind: 'test.noted', tick: 0, by: 'first' }))
    })
    registry.on('test.added', (ctx, e) => {
      seen.push(`second saw ${e.n}`)
      ctx.store.emit(ev({ kind: 'test.noted', tick: 0, by: 'second' }))
    })
    registry.on('test.noted', (_ctx, e) => seen.push(`noted by ${e.by}`))
    expect(run(1, { kind: 'test.add', n: 9 })).toBeUndefined()
    expect(seen).toEqual(['add 9 by alice', 'first saw 9', 'second saw 9', 'noted by first', 'noted by second'])
    expect(store.events().map((e) => (e as unknown as TestEvent).kind)).toEqual(['test.added', 'test.noted', 'test.noted'])
  })

  it('throws (a bug, not a Rejection) when handlers loop past the cap', () => {
    const { store, run } = setup()
    expect(() => run(1, { kind: 'test.loop' })).toThrow(/more than 10000 events/)
    expect(store.events()).toHaveLength(MAX_EVENTS_PER_STEP)
  })

  it('registers each command kind once', () => {
    const { registry } = setup()
    expect(() => registry.command({ kind: 'test.refuse', schema: z.object({}), handle: () => undefined })).toThrow(
      /already registered/,
    )
  })
})
