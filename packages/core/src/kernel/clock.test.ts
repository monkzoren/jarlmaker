import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { GameEvent } from '../events/index.ts'
import { execute } from '../execute.ts'
import { createGame } from '../game.ts'
import { Registry } from '../registry.ts'
import { MemoryStore } from '../store/memory.ts'
import { tick, type SystemTick } from '../tick.ts'
import { currentTick, worldClock } from './clock.ts'
import { commandNonce } from './nonce.ts'

type TestCommand = { readonly kind: 'test.stamp' }
type TestEvent =
  | { readonly kind: 'test.stamped'; readonly tick: number; readonly by: string }
  | { readonly kind: 'test.echoed'; readonly tick: number; readonly by: string }
const ev = (e: TestEvent): GameEvent => e as unknown as GameEvent

const game = createGame({ tuning: {} })

function setup() {
  const store = new MemoryStore({ tables: [commandNonce, worldClock] })
  const registry = new Registry<TestCommand, TestEvent>()
  registry.command({
    kind: 'test.stamp',
    schema: z.object({}),
    handle: (ctx) => ctx.store.emit(ev({ kind: 'test.stamped', tick: ctx.tick, by: 'command' })),
  })
  // A handler stamps the tick it was dispatched on, so both paths are checked.
  registry.on('test.stamped', (ctx, e) => ctx.store.emit(ev({ kind: 'test.echoed', tick: ctx.tick, by: e.by })))
  const system: SystemTick = {
    system: 'test',
    run: (ctx) => ctx.store.emit(ev({ kind: 'test.stamped', tick: ctx.tick, by: 'system' })),
  }
  let nonce = 0
  const run = () => {
    nonce += 1
    return execute(game, store, 'alice', { nonce, cmd: { kind: 'test.stamp' } }, { registry })
  }
  const step = () => tick(game, store, 100, { registry, systems: [system] })
  const ticks = () =>
    store.events().map((e) => {
      const t = e as unknown as TestEvent
      return `${t.by}@${t.tick}`
    })
  return { store, run, step, ticks }
}

describe('world clock', () => {
  it('starts at 0 on a fresh store', () => {
    const { store } = setup()
    expect(currentTick(store)).toBe(0)
    expect(store.get('world_clock', 'world')).toBeUndefined()
  })

  it('increments once per tick(), before systems run', () => {
    const { store, step, ticks } = setup()
    step()
    expect(currentTick(store)).toBe(1)
    step()
    step()
    expect(currentTick(store)).toBe(3)
    expect(ticks()).toEqual(['system@1', 'system@1', 'system@2', 'system@2', 'system@3', 'system@3'])
  })

  it('increments once per tick() even with no systems', () => {
    const store = new MemoryStore({ tables: [worldClock] })
    tick(game, store, 100, { systems: [] })
    tick(game, store, 100, { systems: [] })
    expect(currentTick(store)).toBe(2)
  })

  it('a command between ticks sees the last tick number, and does not advance it', () => {
    const { store, run, step, ticks } = setup()
    expect(run()).toBeUndefined()
    step()
    step()
    expect(run()).toBeUndefined()
    expect(run()).toBeUndefined()
    expect(currentTick(store)).toBe(2)
    expect(ticks()).toEqual([
      'command@0',
      'command@0',
      'system@1',
      'system@1',
      'system@2',
      'system@2',
      'command@2',
      'command@2',
      'command@2',
      'command@2',
    ])
  })
})
