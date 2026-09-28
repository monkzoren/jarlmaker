import { describe, expect, it } from 'vitest'
import { execute } from '../execute.ts'
import type { MemoryStore } from '../store/memory.ts'
import { tick } from '../tick.ts'
import { playerOf } from './commands.ts'
import { game, KNOBS, newStore } from './fixture.test-util.ts'
import { step } from './rules.ts'
import type { Motion, MoveInput } from './schema.ts'
import { entityTick } from './tick.ts'
import { FLAT_WORLD } from './world-view.ts'

const DT = 100
const SYSTEMS = [entityTick]

/** A scripted session: the stick to send before each tick (`undefined` = send nothing). */
const SCRIPT: (MoveInput | undefined)[] = [
  { ix: 1, iy: 0 },
  undefined,
  { ix: 0.7, iy: -0.7 },
  ...Array.from({ length: 80 }, (_, i): MoveInput | undefined => (i % 9 === 0 ? { ix: Math.cos(i), iy: Math.sin(i) } : undefined)),
  { ix: 1, iy: 0 },
  ...Array.from({ length: 100 }, () => undefined),
  { ix: 0, iy: 0 },
  ...Array.from({ length: 5 }, () => undefined),
]

function runOnStore(store: MemoryStore): Motion[] {
  let nonce = 0
  const send = (cmd: object) => execute(game, store, 'alice', { nonce: (nonce += 1), cmd })
  expect(send({ kind: 'player.join' })).toBeUndefined()
  const id = playerOf(store, 'alice')!.id
  const trace: Motion[] = []
  for (const input of SCRIPT) {
    if (input !== undefined) expect(send({ kind: 'entity.move', ...input })).toBeUndefined()
    tick(game, store, DT, { systems: SYSTEMS })
    const { id: _id, ...motion } = store.get('entity_pos', id)!
    trace.push(motion)
  }
  return trace
}

function runDirect(): Motion[] {
  let m: Motion = { x: 0, y: 0, vx: 0, vy: 0, facing: 0, sector: '0,0' }
  let input: MoveInput = { ix: 0, iy: 0 }
  const trace: Motion[] = []
  for (const next of SCRIPT) {
    if (next !== undefined) input = next
    m = step(m, input, DT, FLAT_WORLD, KNOBS)
    trace.push(m)
  }
  return trace
}

function bits(trace: Motion[]): string[] {
  const buf = new DataView(new ArrayBuffer(8))
  const hex = (v: number) => (buf.setFloat64(0, v), buf.getBigUint64(0).toString(16))
  return trace.map((m) => [m.x, m.y, m.vx, m.vy, m.facing].map(hex).join(' ') + ` ${m.sector}`)
}

describe('entity tick', () => {
  it('is deterministic: two MemoryStores and a direct step loop agree bit for bit', () => {
    const a = bits(runOnStore(newStore(1)))
    const b = bits(runOnStore(newStore(2)))
    const direct = bits(runDirect())
    expect(a).toEqual(b)
    expect(a).toEqual(direct)
    // The script really moves the player across a sector boundary.
    expect(new Set(a.map((line) => line.split(' ').at(-1))).size).toBeGreaterThan(1)
  })

  it('emits entity.sector_changed once per boundary crossing', () => {
    const store = newStore()
    let nonce = 0
    const send = (cmd: object) => execute(game, store, 'alice', { nonce: (nonce += 1), cmd })
    send({ kind: 'player.join' })
    const id = playerOf(store, 'alice')!.id
    send({ kind: 'entity.move', ix: -1, iy: 0 })
    tick(game, store, DT, { systems: SYSTEMS })
    // Stepping from x = 0 to x < 0 leaves sector 0,0 for -1,0.
    const moved = store.events().filter((e) => e.kind === 'entity.sector_changed')
    expect(moved).toEqual([{ kind: 'entity.sector_changed', tick: 1, entity: id, from: '0,0', to: '-1,0' }])
    for (let i = 0; i < 5; i += 1) tick(game, store, DT, { systems: SYSTEMS })
    expect(store.events().filter((e) => e.kind === 'entity.sector_changed')).toHaveLength(1)
  })

  it('drops an entity from the work list once it is at rest, and idle entities cost no writes', () => {
    const store = newStore()
    let nonce = 0
    const send = (cmd: object) => execute(game, store, 'alice', { nonce: (nonce += 1), cmd })
    send({ kind: 'player.join' })
    const id = playerOf(store, 'alice')!.id
    send({ kind: 'entity.move', ix: 1, iy: 0 })
    tick(game, store, DT, { systems: SYSTEMS })
    send({ kind: 'entity.move', ix: 0, iy: 0 })
    for (let i = 0; i < 3; i += 1) tick(game, store, DT, { systems: SYSTEMS })
    expect(store.get('entity_input', id)!.moving).toBe(false)
    expect([...store.byIndex('entity_input', 'by_moving', true)]).toHaveLength(0)
    const before = store.get('entity_pos', id)
    tick(game, store, DT, { systems: SYSTEMS })
    expect(store.get('entity_pos', id)).toBe(before)
  })
})
