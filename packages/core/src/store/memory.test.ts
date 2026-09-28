import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { GameEvent } from '../events/index.ts'
import { MemoryStore } from './memory.ts'
import { createRng } from './rng.ts'
import { defineTable } from './tables.ts'

// A local registry, as in tables.test.ts: fixture tables stay out of the real
// `TableRegistry` and `TABLES`.
const widget = defineTable({
  name: 'widget',
  row: z.object({ id: z.string(), owner: z.string(), sector: z.int(), hp: z.number() }),
  pk: 'id',
  indexes: [
    { name: 'by_owner', columns: ['owner'] },
    { name: 'by_owner_sector', columns: ['owner', 'sector'] },
  ],
})
const counter = defineTable({
  name: 'counter',
  row: z.object({ n: z.bigint(), tag: z.string() }),
  pk: 'n',
  indexes: [{ name: 'by_tag', columns: ['tag'] }],
})
interface Local {
  widget: typeof widget
  counter: typeof counter
}

const fresh = (): MemoryStore<Local> => new MemoryStore<Local>({ tables: [widget, counter], seed: 42, now: 1000 })
const ids = (rows: Iterable<{ id: string }>): string[] => [...rows].map((r) => r.id).sort()
const w = (id: string, owner: string, sector = 0, hp = 10) => ({ id, owner, sector, hp })
// The contract's GameEvent union is empty until systems add kinds.
const ev = (kind: string, tick: number): GameEvent => ({ kind, tick }) as unknown as GameEvent

describe('MemoryStore rows', () => {
  it('get, insert, update, delete by pk', () => {
    const s = fresh()
    expect(s.get('widget', 'a')).toBeUndefined()
    s.insert('widget', w('a', 'p1'))
    expect(s.get('widget', 'a')).toEqual(w('a', 'p1'))
    s.update('widget', w('a', 'p1', 0, 5))
    expect(s.get('widget', 'a')?.hp).toBe(5)
    s.delete('widget', 'a')
    expect(s.get('widget', 'a')).toBeUndefined()
  })

  it('throws on insert of an existing pk and on update/delete of a missing one', () => {
    const s = fresh()
    s.insert('widget', w('a', 'p1'))
    expect(() => s.insert('widget', w('a', 'p2'))).toThrow(/pk a exists/)
    expect(s.get('widget', 'a')?.owner).toBe('p1')
    expect(() => s.update('widget', w('b', 'p1'))).toThrow(/no row with pk b/)
    expect(() => s.delete('widget', 'b')).toThrow(/no row with pk b/)
    expect(s.get('widget', 'b')).toBeUndefined()
  })

  it('keeps bigint pks distinct from other types', () => {
    const s = fresh()
    s.insert('counter', { n: 1n, tag: 'x' })
    expect(s.get('counter', 1n)?.tag).toBe('x')
    expect(() => s.insert('counter', { n: 1n, tag: 'y' })).toThrow(/exists/)
  })

  it('stores a copy: mutating the inserted object changes nothing', () => {
    const s = fresh()
    const row = w('a', 'p1')
    s.insert('widget', row)
    row.owner = 'p2'
    expect(s.get('widget', 'a')?.owner).toBe('p1')
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual(['a'])
    expect(Object.isFrozen(s.get('widget', 'a'))).toBe(true)
  })

  it('rejects unknown tables and undeclared indexes at runtime too', () => {
    const s = fresh()
    expect(() => s.get('nope' as 'widget', 'a')).toThrow(/unknown table "nope"/)
    expect(() => s.byIndex('widget', 'by_hp' as 'by_owner', 'x')).toThrow(/no index "by_hp"/)
    expect(() => s.byIndex('widget', 'by_owner_sector', ['p1'] as unknown as [string, number])).toThrow(/2-tuple/)
  })
})

describe('MemoryStore indexes', () => {
  it('serves single-column and compound lookups', () => {
    const s = fresh()
    s.insert('widget', w('a', 'p1', 1))
    s.insert('widget', w('b', 'p1', 2))
    s.insert('widget', w('c', 'p2', 1))
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual(['a', 'b'])
    expect(ids(s.byIndex('widget', 'by_owner', 'p3'))).toEqual([])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p1', 1]))).toEqual(['a'])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p2', 1]))).toEqual(['c'])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p2', 2]))).toEqual([])
  })

  it('moves a row between keys when update changes an indexed column', () => {
    const s = fresh()
    s.insert('widget', w('a', 'p1', 1))
    s.insert('widget', w('b', 'p1', 1))
    s.update('widget', w('a', 'p2', 1))
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual(['b'])
    expect(ids(s.byIndex('widget', 'by_owner', 'p2'))).toEqual(['a'])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p2', 1]))).toEqual(['a'])
    // Changing only the second column of a compound index.
    s.update('widget', w('b', 'p1', 9))
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p1', 1]))).toEqual([])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p1', 9]))).toEqual(['b'])
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual(['b'])
  })

  it('leaves index keys alone when update changes only unindexed columns', () => {
    const s = fresh()
    s.insert('widget', w('a', 'p1', 1, 10))
    s.update('widget', w('a', 'p1', 1, 3))
    const [row] = [...s.byIndex('widget', 'by_owner', 'p1')]
    expect(row?.hp).toBe(3)
  })

  it('drops a deleted row from every index', () => {
    const s = fresh()
    s.insert('widget', w('a', 'p1', 1))
    s.insert('widget', w('b', 'p1', 1))
    s.delete('widget', 'a')
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual(['b'])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['p1', 1]))).toEqual(['b'])
    s.delete('widget', 'b')
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual([])
    // Reinsert after delete lands in the index again.
    s.insert('widget', w('a', 'p3', 1))
    expect(ids(s.byIndex('widget', 'by_owner', 'p3'))).toEqual(['a'])
  })

  it('does not confuse values of different types or that contain the separator', () => {
    const s = fresh()
    s.insert('widget', w('a', 'x|n1', 2))
    s.insert('widget', w('b', 'x', 1))
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['x', 1]))).toEqual(['b'])
    expect(ids(s.byIndex('widget', 'by_owner_sector', ['x|n1', 2]))).toEqual(['a'])
    s.insert('counter', { n: 1n, tag: '1' })
    expect([...s.byIndex('counter', 'by_tag', '1')].map((r) => r.n)).toEqual([1n])
  })

  it('returns a snapshot, so the caller may mutate while iterating', () => {
    const s = fresh()
    for (const id of ['a', 'b', 'c']) s.insert('widget', w(id, 'p1'))
    for (const row of s.byIndex('widget', 'by_owner', 'p1')) s.update('widget', { ...row, owner: 'p2' })
    expect(ids(s.byIndex('widget', 'by_owner', 'p1'))).toEqual([])
    expect(ids(s.byIndex('widget', 'by_owner', 'p2'))).toEqual(['a', 'b', 'c'])
  })
})

describe('MemoryStore clock, rng, events', () => {
  it('has a settable clock with advance', () => {
    const s = fresh()
    expect(s.now()).toBe(1000)
    s.advance(250)
    expect(s.now()).toBe(1250)
    s.setNow(5)
    expect(s.now()).toBe(5)
    expect(() => s.advance(-1)).toThrow(/ms >= 0/)
    expect(() => s.setNow(1.5)).toThrow(/integer/)
    expect(new MemoryStore<Local>({ tables: [] }).now()).toBe(0)
  })

  it('rng is the seeded PRNG and keeps its sequence across calls', () => {
    const s = fresh()
    const ref = createRng(42)
    expect([s.rng().next(), s.rng().next()]).toEqual([ref.next(), ref.next()])
  })

  it('logs emitted events in order, as a copy, and clears', () => {
    const s = fresh()
    s.emit(ev('test.a', 1))
    s.emit(ev('test.b', 2))
    const log = s.events()
    expect(log).toEqual([ev('test.a', 1), ev('test.b', 2)])
    s.emit(ev('test.c', 3))
    expect(log).toHaveLength(2)
    s.clearEvents()
    expect(s.events()).toEqual([])
  })

  it('hosts the runtime registry by default and refuses duplicate tables', () => {
    expect(() => new MemoryStore()).not.toThrow()
    expect(() => new MemoryStore<Local>({ tables: [widget, widget] })).toThrow(/given twice/)
  })
})
