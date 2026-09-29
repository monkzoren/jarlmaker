import { describe, expect, it } from 'vitest'
import { createWorldMirror, type ItemChange, type WorldChange } from './world.ts'

const delta = (cx: number, cy: number, prop: string, hits = 0) => ({ key: `${cx},${cy}`, cx, cy, prop, hits, owner: '' })

describe('world mirror', () => {
  it('looks deltas up by cell and reports each real change once', () => {
    const m = createWorldMirror()
    const seen: (WorldChange | ItemChange)[] = []
    m.onChange((c) => seen.push(c))
    m.upsertDelta(delta(3, -2, 'pine', 1))
    m.upsertDelta(delta(3, -2, 'pine', 1))
    m.upsertDelta(delta(3, -2, 'stump'))
    expect(m.lookup(3, -2)).toEqual({ prop: 'stump', hits: 0, owner: '' })
    expect(m.lookup(0, 0)).toBeUndefined()
    expect(seen.map((c) => (c.kind === 'delta' ? [c.row.prop, c.prev?.prop, c.quiet] : []))).toEqual([
      ['pine', undefined, false],
      ['stump', 'pine', false],
    ])
  })

  it("keeps only the owner's items, and marks a resubscription's catch-up as quiet", () => {
    const m = createWorldMirror()
    const seen: (WorldChange | ItemChange)[] = []
    m.onChange((c) => seen.push(c))
    m.upsertItem({ owner: 'me', item: 'wood', count: 3 }) // owner not known yet: ignored
    m.setOwner('me')
    m.replace([delta(1, 1, 'stump')], [
      { owner: 'me', item: 'wood', count: 3 },
      { owner: 'you', item: 'stone', count: 9 },
    ])
    m.upsertItem({ owner: 'me', item: 'wood', count: 4 })
    expect(m.items()).toEqual([{ item: 'wood', count: 4 }])
    expect(m.count('stone')).toBe(0)
    expect(seen.map((c) => [c.kind, c.quiet])).toEqual([
      ['delta', true],
      ['item', true],
      ['item', false],
    ])
  })
})
