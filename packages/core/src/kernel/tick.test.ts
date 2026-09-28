import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../events/index.ts'
import { createGame } from '../game.ts'
import { Registry } from '../registry.ts'
import { MemoryStore } from '../store/memory.ts'
import { tick, type SystemTick } from '../tick.ts'
import { worldClock } from './clock.ts'
import { commandNonce } from './nonce.ts'

type TestEvent = { readonly kind: 'test.ticked'; readonly tick: number; readonly system: string }
const ev = (e: TestEvent): GameEvent => e as unknown as GameEvent

const game = createGame({ tuning: {} })

describe('tick', () => {
  it('runs systems in list order, dispatching each step before the next system', () => {
    const store = new MemoryStore({ tables: [commandNonce, worldClock] })
    const registry = new Registry<never, TestEvent>()
    const trace: string[] = []
    registry.on('test.ticked', (_ctx, e) => trace.push(`handled ${e.system}`))
    const system = (name: string): SystemTick => ({
      system: name,
      run: ({ store: s, dtMs }) => {
        trace.push(`${name} ${dtMs}`)
        s.emit(ev({ kind: 'test.ticked', tick: 0, system: name }))
      },
    })
    tick(game, store, 100, { registry, systems: [system('entity'), system('combat'), system('survival')] })
    expect(trace).toEqual(['entity 100', 'handled entity', 'combat 100', 'handled combat', 'survival 100', 'handled survival'])
    expect(store.events()).toHaveLength(3)
  })

  it('runs the default SYSTEM_TICKS list and rejects a bad dt', () => {
    const store = new MemoryStore()
    expect(() => tick(game, store, 100)).not.toThrow()
    expect(() => tick(game, store, -1)).toThrow(/dtMs/)
    expect(() => tick(game, store, Number.NaN)).toThrow(/dtMs/)
  })
})
