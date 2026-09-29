import { content } from '@bastion/content'
import { bucketOf, createGame, MS_PER_SECOND, TABLES } from '@bastion/core'
import { contentHash } from '@bastion/replay/format'
import { describe, expect, it } from 'vitest'
import { compareHosts } from './compare.ts'
import { Recording } from './recorder.ts'

// Lines exactly as `spacetime subscribe` 2.10.1 prints them.
const ALICE = 'c200aa'
const clock = (from: number | undefined, to: number) =>
  JSON.stringify({ world_clock: { deletes: from === undefined ? [] : [{ id: 'world', tick: from }], inserts: [{ id: 'world', tick: to }] } })
const nonce = (prev: number | undefined, n: number) => ({
  deletes: prev === undefined ? [] : [{ sender: ALICE, nonce: prev }],
  inserts: [{ sender: ALICE, nonce: n }],
})
const JOIN = JSON.stringify({
  entity_pos: { deletes: [], inserts: [{ id: 1, x: 0.0, y: 0.0, vx: 0.0, vy: 0.0, facing: 0.0, sector: '0,0' }] },
  command_nonce: nonce(undefined, 1),
  entity_seq: { deletes: [], inserts: [{ name: 'entity', next: 2 }] },
  entity: { deletes: [], inserts: [{ id: 1, kind: 'player', def: 'player', owner: ALICE, level: 1.0, faction: 'players' }] },
  // The survival system gives the newcomer full meters (player.joined).
  player_vitals: { deletes: [], inserts: [{ owner: ALICE, bucket: bucketOf(ALICE, 10), hp: 100.0, warmth: 100.0, food: 100.0 }] },
})
const MOVE = JSON.stringify({ command_nonce: nonce(1, 2), entity_input: { deletes: [], inserts: [{ id: 1, ix: 1.0, iy: 0.0, moving: true }] } })
const REJOIN = JSON.stringify({ command_nonce: nonce(2, 3) })

function recorded(...lines: string[]): Recording {
  const r = new Recording(TABLES)
  for (const l of lines) r.push(l)
  return r
}

describe('Recording', () => {
  it('skips the CLI banner, takes the first JSON line as the initial state, and tracks the clock', () => {
    const r = recorded('WARNING: This command is UNSTABLE and subject to breaking changes.', '', clock(undefined, 64), clock(64, 65))
    expect(r.transactions).toBe(2)
    expect(r.tick).toBe(65)
    expect(r.commands).toEqual([])
    expect(r.dump()).toEqual({ world_clock: [{ id: 'world', tick: 65 }] })
  })

  it('classifies command transactions and stamps them with the tick they committed after', () => {
    const r = recorded(clock(undefined, 4), JOIN, MOVE, clock(4, 5), REJOIN)
    expect(r.commands).toEqual([
      { atTick: 4, sender: ALICE, envelope: { nonce: 1, cmd: { kind: 'player.join' } } },
      { atTick: 4, sender: ALICE, envelope: { nonce: 2, cmd: { kind: 'entity.move', ix: 1, iy: 0 } } },
      { atTick: 5, sender: ALICE, envelope: { nonce: 3, cmd: { kind: 'player.join' } } },
    ])
  })

  it('holds rows as core does (i64 as bigint) and dumps them canonical, sorted by pk', () => {
    const r = recorded(clock(undefined, 4), JOIN)
    expect(r.get('entity', 1n)?.['id']).toBe(1n)
    expect(r.dump()['entity_seq']).toEqual([{ name: 'entity', next: '2n' }])
  })

  it('refuses a stream that did not start empty, a row core would reject, and an unknown transaction', () => {
    expect(() => recorded(JOIN)).toThrow(/already had game rows/)
    const bad = JSON.stringify({ command_nonce: nonce(undefined, 1), entity: { deletes: [], inserts: [{ id: 1, kind: 'dragon', def: 'x', owner: ALICE, level: 1, faction: 'f' }] } })
    expect(() => recorded(clock(undefined, 1), bad)).toThrow()
    expect(() => recorded(clock(undefined, 1), JSON.stringify({ entity_seq: { deletes: [], inserts: [] } }))).toThrow(/neither a tick nor a command/)
  })

  it('reports a failure to listeners once and keeps it', () => {
    const r = new Recording(TABLES)
    let calls = 0
    r.onChange(() => (calls += 1))
    r.fail(new Error('subscriber died'))
    r.fail(new Error('second'))
    expect(r.failure?.message).toBe('subscriber died')
    expect(calls).toBe(2)
  })
})

describe('compareHosts', () => {
  const game = createGame(content)
  const opts = { dtMs: MS_PER_SECOND / game.content.tuning.net.tickHz, contentHash: contentHash(content) }
  // What the server holds after JOIN + MOVE at tick 4 and one tick more.
  type Pos = { x: number; y: number; vx: number; vy: number; facing: number; sector: string }
  const serverAt = (pos: Pos) =>
    recorded(
      clock(undefined, 4),
      JOIN,
      MOVE,
      JSON.stringify({
        world_clock: { deletes: [{ id: 'world', tick: 4 }], inserts: [{ id: 'world', tick: 5 }] },
        entity_pos: {
          deletes: [{ id: 1, x: 0.0, y: 0.0, vx: 0.0, vy: 0.0, facing: 0.0, sector: '0,0' }],
          inserts: [{ id: 1, ...pos }],
        },
      }),
    )
  const snap = (r: Recording) => ({ commands: r.commands, tables: r.dump(), tick: r.tick })

  const wrong: Pos = { x: 123, y: 0, vx: 4, vy: 0, facing: 0, sector: '0,0' }
  // Core's own answer for one tick of walking right, read from a MemoryStore run.
  const truth = (): Pos => {
    const line = compareHosts(game, snap(serverAt(wrong)), opts).memory.split('\n').find((l) => l.includes('"sector"'))
    const { id: _id, ...pos } = JSON.parse((line ?? '').trim().replace(/,$/, '')) as Pos & { id: string }
    return pos
  }

  it('replays the recorded commands on MemoryStore and matches a server that agrees with core', () => {
    const cmp = compareHosts(game, snap(serverAt(truth())), opts)
    expect(cmp.script.endTick).toBe(5)
    expect(cmp.script.commands).toHaveLength(2)
    expect(truth().x).toBeGreaterThan(0)
    expect(cmp.ok, cmp.diff).toBe(true)
    expect(cmp.diff).toBe('')
  })

  it('shows a server that integrated differently as a - server / + MemoryStore diff', () => {
    const cmp = compareHosts(game, snap(serverAt(wrong)), opts)
    expect(cmp.ok).toBe(false)
    expect(cmp.diff).toMatch(/^- .*"x":123/m)
    expect(cmp.diff).toMatch(/^\+ .*"entity_pos"|^\+ .*"x":/m)
  })

  it('flags a command the server accepted but MemoryStore refuses', () => {
    const r = serverAt(truth())
    const cmds = [...r.commands, { ...r.commands[1]!, atTick: 5 }]
    const cmp = compareHosts(game, { ...snap(r), commands: cmds }, opts)
    expect(cmp.ok).toBe(false)
    expect(cmp.diff).toMatch(/\+ .*"code":"duplicate"/)
  })
})
