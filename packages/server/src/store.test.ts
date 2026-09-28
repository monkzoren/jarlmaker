// StdbStore over a fake `ctx.db` shaped like SpacetimeDB's generated handles
// (`insert`, a unique pk index with `find`/`update`/`delete`, btree indexes
// with `filter`). The same commands and ticks run through StdbStore and
// MemoryStore must leave identical rows. The live-server run is in the PR
// transcript (publish, join, move, SQL on `entity_pos`).
import { content } from '@bastion/content'
import { createGame, execute, TABLES, tick, type CommandEnvelope, type Store } from '@bastion/core'
import { MemoryStore } from '@bastion/core/testing'
import { describe, expect, it } from 'vitest'
import { StdbStore, stdbRng, type HostCtx } from './store.ts'

type Row = Record<string, unknown>

function fakeDb(): object {
  const db: Record<string, object> = {}
  for (const [name, def] of TABLES) {
    const rows = new Map<unknown, Row>()
    const unique = {
      find: (k: unknown) => rows.get(k) ?? null,
      update: (r: Row) => {
        if (!rows.has(r[def.pk])) throw new Error(`no row ${String(r[def.pk])}`)
        rows.set(r[def.pk], r)
        return r
      },
      delete: (k: unknown) => rows.delete(k),
    }
    const handle: Record<string, unknown> = {
      insert: (r: Row) => {
        if (rows.has(r[def.pk])) throw new Error('unique violation')
        rows.set(r[def.pk], r)
        return r
      },
      [def.pk]: unique,
    }
    for (const ix of def.indexes ?? []) {
      const [col] = ix.columns
      handle[ix.name] = { filter: (v: unknown) => [...rows.values()].filter((r) => r[col as string] === v) }
    }
    db[name] = handle
  }
  return db
}

const random = Object.assign(() => 0.5, { integerInRange: (lo: number) => lo })
const ctx: HostCtx = { db: fakeDb(), timestamp: { microsSinceUnixEpoch: 1_700_000_000_123_456n }, random }
const game = createGame(content)
const SENDER = 'c200aa'

function play(store: Store): void {
  const cmds: CommandEnvelope[] = [
    { nonce: 1, cmd: { kind: 'player.join' } },
    { nonce: 2, cmd: { kind: 'entity.move', ix: 1, iy: 0.5 } },
  ]
  for (const env of cmds) expect(execute(game, store, SENDER, env)).toBeUndefined()
  for (let i = 0; i < 20; i += 1) tick(game, store, 100)
  expect(execute(game, store, SENDER, { nonce: 2, cmd: { kind: 'entity.move', ix: 0, iy: 0 } })?.code).toBe('duplicate')
}

describe('StdbStore', () => {
  it('runs join, move and ticks exactly like MemoryStore', () => {
    const stdb = new StdbStore(ctx)
    const mem = new MemoryStore()
    play(stdb)
    play(mem)
    for (const s of [stdb, mem]) expect(s.get('entity_pos', 1n)?.x).toBeGreaterThan(0)
    expect(stdb.get('entity_pos', 1n)).toEqual(mem.get('entity_pos', 1n))
    expect(stdb.get('entity', 1n)).toEqual(mem.get('entity', 1n))
    expect(stdb.get('entity_input', 1n)).toEqual(mem.get('entity_input', 1n))
    expect(stdb.get('world_clock', 'world')).toEqual({ id: 'world', tick: 20 })
    expect([...stdb.byIndex('entity', 'by_owner', SENDER)]).toEqual([...mem.byIndex('entity', 'by_owner', SENDER)])
  })

  it('reads the clock from ctx.timestamp in whole ms', () => {
    expect(new StdbStore(ctx).now()).toBe(1_700_000_000_123)
  })

  it('throws on update or delete of a missing row, and on a duplicate insert', () => {
    const s = new StdbStore({ ...ctx, db: fakeDb() })
    expect(() => s.update('world_clock', { id: 'world', tick: 1 })).toThrow()
    expect(() => s.delete('world_clock', 'world')).toThrow(/no world_clock row/)
    s.insert('world_clock', { id: 'world', tick: 1 })
    expect(() => s.insert('world_clock', { id: 'world', tick: 2 })).toThrow()
    expect(s.get('world_clock', 'nope')).toBeUndefined()
  })

  it('wraps ctx.random with core Rng semantics', () => {
    const rng = stdbRng(random)
    expect(rng.next()).toBe(0.5)
    expect(rng.int(3, 9)).toBe(3)
    expect(rng.pick(['a', 'b'])).toBe('a')
    expect(() => rng.int(2, 1)).toThrow()
    expect(() => rng.pick([])).toThrow()
  })
})
