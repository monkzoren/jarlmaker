import { describe, expect, it } from 'vitest'
import { renderBoard } from '../src/board.ts'
import { checkHash } from '../src/hash.ts'
import { longestChain } from '../src/graph.ts'
import { next, STALE_HOURS, view, type Claim } from '../src/derive.ts'
import { phase } from './helpers.ts'

const NOW = 1_800_000_000
const claim = (id: string, branch: string, over: Partial<Claim> = {}): Claim => ({
  id, branch, status: 'in_progress', owner: branch, since: NOW - 60, tip: NOW - 60, ...over,
})

// P0-001 (core) ─┬─> P0-002 (core) ──> P0-004 (server)
//                └─> P0-003 (world)
// P0-005 (client-render) independent
const tasks = phase([
  { id: 'P0-001', status: 'done' },
  { id: 'P0-002', deps: ['P0-001'] },
  { id: 'P0-003', deps: ['P0-001'], lane: 'world' },
  { id: 'P0-004', deps: ['P0-002'], lane: 'server' },
  { id: 'P0-005', lane: 'client-render' },
])

describe('derived statuses', () => {
  it('is ready only when todo and every dep is done', () => {
    const v = view(tasks, [], NOW)
    expect(v.derived.get('P0-002')).toBe('ready')
    expect(v.derived.get('P0-004')).toBe('todo')
    expect(v.derived.get('P0-EXIT')).toBe('todo')
  })

  it('turns branch claims into in_progress or review', () => {
    const v = view(tasks, [claim('P0-002', 'a'), claim('P0-003', 'b', { status: 'done' })], NOW)
    expect(v.derived.get('P0-002')).toBe('in_progress')
    expect(v.derived.get('P0-003')).toBe('review')
  })

  it('ignores stale claims and merged tasks, and the earliest claim wins a race', () => {
    const stale = claim('P0-002', 'old', { tip: NOW - STALE_HOURS * 3600 - 1 })
    const v = view(tasks, [stale, claim('P0-001', 'merged', { status: 'done' })], NOW)
    expect(v.derived.get('P0-002')).toBe('ready')
    expect(v.ignored.map((i) => i.reason)).toEqual(['stale'])
    const race = view(tasks, [claim('P0-003', 'late', { since: NOW - 10 }), claim('P0-003', 'early', { since: NOW - 20 })], NOW)
    expect(race.claims.get('P0-003')?.branch).toBe('early')
    expect(race.ignored[0]?.claim.branch).toBe('late')
  })
})

describe('next', () => {
  it('picks the longest critical path first', () => {
    // P0-002 → P0-004 → EXIT is longer than P0-003 → EXIT or P0-005 → EXIT.
    expect(next(view(tasks, [], NOW)).task?.id).toBe('P0-002')
  })

  it('skips tasks whose lane is held by an in-progress claim, but not by review', () => {
    const lane = view(tasks, [claim('P0-002', 'x')], NOW)
    expect(next(lane, { lane: 'core' }).task).toBeUndefined()
    expect(next(lane).skipped).toEqual([])
    expect(next(lane).task?.id).toBe('P0-003')
    // Two ready core tasks: one held in_progress blocks the other; one in review does not.
    const two = phase([{ id: 'P0-001' }, { id: 'P0-002' }])
    const blocked = next(view(two, [claim('P0-001', 'x')], NOW))
    expect(blocked.task).toBeUndefined()
    expect(blocked.skipped[0]?.reason).toMatch(/lane core held by P0-001/)
    expect(next(view(two, [claim('P0-001', 'x', { status: 'done' })], NOW)).task?.id).toBe('P0-002')
  })

  it('skips tasks whose touches overlap an in-progress claim in another lane', () => {
    const ts = phase([
      { id: 'P0-001', lane: 'world', touches: ['packages/core/src/**'] },
      { id: 'P0-002', lane: 'entity', touches: ['packages/core/src/entity/**'] },
    ])
    const r = next(view(ts, [claim('P0-001', 'x')], NOW))
    expect(r.task).toBeUndefined()
    expect(r.skipped[0]?.reason).toMatch(/overlaps P0-001/)
  })

  it('filters by lane and phase', () => {
    expect(next(view(tasks, [], NOW), { lane: 'client-render' }).task?.id).toBe('P0-005')
    expect(next(view(tasks, [], NOW), { phase: 'P1' }).task).toBeUndefined()
  })
})

describe('board', () => {
  it('is deterministic, hashed, and shows ready work and the critical path', () => {
    const v = view(tasks, [], NOW)
    const a = renderBoard(v, { live: false })
    expect(a).toBe(renderBoard(view(tasks, [], NOW + 999), { live: false }))
    expect(checkHash(a)).toBe('ok')
    expect(a).toContain('## Ready now')
    expect(a).toMatch(/\| P0-002 \|/)
    expect(longestChain(tasks, (t) => t.status !== 'done')).toEqual(['P0-002', 'P0-004', 'P0-EXIT'])
  })
})
