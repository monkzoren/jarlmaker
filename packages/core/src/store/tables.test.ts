import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineTable, registerTables, TABLES, tableList } from './tables.ts'
import type { IndexOfIn, IndexValIn, PkIn, RowIn, StoreOf } from './types.ts'

// A local registry, so the type test does not add fixture tables to the real
// `TableRegistry`. `Store` is `StoreOf<TableRegistry>`, the same generic body.
const widget = defineTable({
  name: 'widget',
  row: z.object({ id: z.string(), owner: z.string(), sector: z.int(), hp: z.number() }),
  pk: 'id',
  indexes: [
    { name: 'by_owner', columns: ['owner'] },
    { name: 'by_owner_sector', columns: ['owner', 'sector'] },
  ],
})
const counter = defineTable({ name: 'counter', row: z.object({ n: z.bigint() }), pk: 'n' })
interface Local {
  widget: typeof widget
  counter: typeof counter
}
declare const store: StoreOf<Local>

describe('table typing', () => {
  it('derives row, pk, index names and index values from the declaration', () => {
    expectTypeOf<RowIn<Local, 'widget'>>().toEqualTypeOf<{ id: string; owner: string; sector: number; hp: number }>()
    expectTypeOf<PkIn<Local, 'widget'>>().toEqualTypeOf<string>()
    expectTypeOf<PkIn<Local, 'counter'>>().toEqualTypeOf<bigint>()
    expectTypeOf<IndexOfIn<Local, 'widget'>>().toEqualTypeOf<'by_owner' | 'by_owner_sector'>()
    expectTypeOf<IndexOfIn<Local, 'counter'>>().toEqualTypeOf<never>()
    expectTypeOf<IndexValIn<Local, 'widget', 'by_owner'>>().toEqualTypeOf<string>()
    expectTypeOf<IndexValIn<Local, 'widget', 'by_owner_sector'>>().toEqualTypeOf<[string, number]>()
  })

  it('byIndex accepts declared indexes and rejects undeclared ones', () => {
    // Type-only: these lines are checked by `tsc` (pnpm -r typecheck), never run.
    const typeOnly = (): void => {
      expectTypeOf(store.byIndex('widget', 'by_owner', 'p1')).toEqualTypeOf<
        Iterable<Readonly<RowIn<Local, 'widget'>>>
      >()
      store.byIndex('widget', 'by_owner_sector', ['p1', 3])
      // @ts-expect-error `by_hp` is not a declared index of `widget`
      store.byIndex('widget', 'by_hp', 1)
      // @ts-expect-error a column name is not an index name
      store.byIndex('widget', 'owner', 'p1')
      // @ts-expect-error `counter` declares no indexes at all
      store.byIndex('counter', 'by_owner', 'p1')
      // @ts-expect-error the value must have the indexed column's type
      store.byIndex('widget', 'by_owner', 7)
      // @ts-expect-error `nope` is not a table
      store.get('nope', 'x')
      // @ts-expect-error the pk of `counter` is a bigint
      store.get('counter', 'x')
      // @ts-expect-error there is no scan
      store.scan('widget')
    }
    expect(typeOnly).toBeTypeOf('function')
  })

  it('defineTable rejects declarations with unknown columns at the type level', () => {
    const typeOnly = (): void => {
      defineTable({
        name: 'bad',
        row: z.object({ id: z.string() }),
        // @ts-expect-error pk must be a column
        pk: 'nope',
      })
      defineTable({
        name: 'bad',
        row: z.object({ id: z.string(), pos: z.object({ x: z.number() }) }),
        // @ts-expect-error an object column cannot be a pk
        pk: 'pos',
      })
      defineTable({
        name: 'bad',
        row: z.object({ id: z.string() }),
        pk: 'id',
        // @ts-expect-error index columns must be row columns
        indexes: [{ name: 'by_x', columns: ['x'] }],
      })
    }
    expect(typeOnly).toBeTypeOf('function')
  })
})

describe('defineTable', () => {
  const row = z.object({ id: z.string(), owner: z.string() })

  it('returns plain data with indexes defaulted to empty', () => {
    const t = defineTable({ name: 'plain', row, pk: 'id' })
    expect(t).toEqual({ name: 'plain', row, pk: 'id', indexes: [] })
  })

  it('validates the declaration at runtime too', () => {
    const cast = defineTable as (def: unknown) => unknown
    expect(() => cast({ name: 'Bad-Name', row, pk: 'id' })).toThrow(/snake_case/)
    expect(() => cast({ name: 'bad', row, pk: 'nope' })).toThrow(/pk column "nope"/)
    expect(() => cast({ name: 'bad', row, pk: 'id', indexes: [{ name: 'by_x', columns: ['x'] }] })).toThrow(
      /unknown column "x"/,
    )
    expect(() =>
      cast({
        name: 'bad',
        row,
        pk: 'id',
        indexes: [
          { name: 'by_owner', columns: ['owner'] },
          { name: 'by_owner', columns: ['owner'] },
        ],
      }),
    ).toThrow(/duplicate index/)
  })
})

describe('TABLES registry', () => {
  it('starts empty, registers once per name, and lists in name order', () => {
    expect(TABLES.size).toBe(0)
    registerTables(widget, counter)
    expect(TABLES.get('widget')).toBe(widget)
    expect(tableList().map((t) => t.name)).toEqual(['counter', 'widget'])
    expect(() => registerTables(widget)).toThrow(/already registered/)
  })
})
