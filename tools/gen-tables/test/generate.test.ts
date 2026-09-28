import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineTable } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkAppendOnly, generate, parseManifest, type Manifest } from '../src/generate.ts'
import { FIXTURE } from './fixture.ts'

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const one = (row: z.ZodObject, extra: { pk?: string; indexes?: { name: string; columns: [string] }[] } = {}) =>
  // Cast: these fixtures are deliberately outside what the types allow.
  generate([defineTable({ name: 'bad', row, pk: (extra.pk ?? 'id') as never, indexes: extra.indexes as never })])

describe('generate', () => {
  it('renders the fixture tables exactly as committed in fixture.generated.ts', () => {
    expect(generate(FIXTURE).source).toBe(read('./fixture.generated.ts'))
  })

  it('is deterministic and independent of declaration order', () => {
    expect(generate([...FIXTURE].reverse()).source).toBe(generate(FIXTURE).source)
  })

  it('maps each Zod type to its SpacetimeDB column type', () => {
    const cols = generate(FIXTURE).manifest['every_type']!.columns
    expect(Object.fromEntries(cols.map((c) => [c.name, c.type]))).toEqual({
      id: 'string',
      flag: 'bool',
      small: 'i32',
      count: 'u32',
      big: 'i64',
      ubig: 'u64',
      ratio: 'f32',
      x: 'f64',
      whole: 'f64',
      kind: 'string',
      tag: 'string',
      note: 'option<string>',
      list: 'array<i32>',
      stats: '{hp:f64,resist:array<{element:string,pct:f64}>}',
      level: 'i32',
      label: 'string',
    })
    expect(cols.filter((c) => c.default).map((c) => c.name)).toEqual(['level', 'label'])
  })

  it('emits each table\'s declared visibility, private by default', () => {
    const { source } = generate(FIXTURE)
    expect(source).toMatch(/name: 'counter',\n\s+public: false,/)
    expect(source).toMatch(/name: 'every_type',\n\s+public: true,/)
  })

  it('does not treat a visibility change as an append-only violation', () => {
    const row = z.object({ id: z.string(), hp: z.number() })
    const priv = generate([defineTable({ name: 'vis', row, pk: 'id' })])
    const pub = generate([defineTable({ name: 'vis', row, pk: 'id', public: true })])
    expect(pub.source).not.toBe(priv.source)
    expect(pub.manifest).toEqual(priv.manifest)
    expect(checkAppendOnly(priv.manifest, pub.manifest)).toEqual([])
    expect(checkAppendOnly(pub.manifest, priv.manifest)).toEqual([])
  })

  it('round-trips its manifest through the generated source', () => {
    const { source, manifest } = generate(FIXTURE)
    expect(parseManifest(source)).toEqual(manifest)
    expect(parseManifest('')).toEqual({})
  })

  it.each([
    ['unsupported type', z.object({ id: z.string(), d: z.date() }), {}, 'bad.d: unsupported Zod type "date"'],
    ['nested unsupported type', z.object({ id: z.string(), s: z.object({ m: z.map(z.string(), z.string()) }) }), {}, 'bad.s.m: unsupported Zod type "map"'],
    ['array element', z.object({ id: z.string(), a: z.array(z.set(z.string())) }), {}, 'bad.a[]: unsupported Zod type "set"'],
    ['nullable', z.object({ id: z.string(), n: z.string().nullable() }), {}, 'bad.n: nullable columns are not supported'],
    ['numeric literal', z.object({ id: z.string(), l: z.literal(3) }), {}, 'bad.l: only string literals'],
    ['nested default', z.object({ id: z.string(), o: z.object({ v: z.string().default('x') }) }), {}, 'bad.o.v: .default() is only supported'],
    ['float pk', z.object({ id: z.number() }), {}, 'bad.id: primary key maps to f64'],
    ['optional pk', z.object({ id: z.string().optional() }), {}, 'bad.id: primary key maps to option<string>'],
    ['float index', z.object({ id: z.string(), x: z.int() }), { indexes: [{ name: 'by_x', columns: ['x'] as [string] }] }, 'bad.x: index "by_x" needs an indexable column, got f64'],
  ])('fails on %s with the column path', (_, row, extra, message) => {
    expect(() => one(row, extra)).toThrow(message)
  })

  it('fails when two tables would define the same nested type name', () => {
    const a = defineTable({ name: 'a_b', row: z.object({ id: z.string(), c: z.object({ v: z.string() }) }), pk: 'id' })
    const b = defineTable({ name: 'a', row: z.object({ id: z.string(), b_c: z.object({ v: z.string() }) }), pk: 'id' })
    expect(() => generate([a, b])).toThrow('nested type name "ABC" collides')
  })
})

describe('checkAppendOnly', () => {
  const prev: Manifest = {
    t: { pk: 'id', columns: [{ name: 'id', type: 'string' }, { name: 'hp', type: 'f64' }] },
  }
  const withCols = (...columns: Manifest[string]['columns']): Manifest => ({ t: { pk: 'id', columns } })
  const id = { name: 'id', type: 'string' }
  const hp = { name: 'hp', type: 'f64' }

  it('accepts no change, new tables, and appended optional or defaulted columns', () => {
    expect(checkAppendOnly(prev, prev)).toEqual([])
    expect(checkAppendOnly(prev, { ...prev, u: { pk: 'k', columns: [{ name: 'k', type: 'string' }] } })).toEqual([])
    expect(
      checkAppendOnly(prev, withCols(id, hp, { name: 'a', type: 'option<i32>' }, { name: 'b', type: 'i32', default: true })),
    ).toEqual([])
  })

  it.each([
    ['a removed table', {}, 't: table was removed'],
    ['a removed column', withCols(id), 't.hp: column was removed'],
    ['a renamed column', withCols(id, { name: 'health', type: 'f64' }), 't.hp: column #2 is now "health"'],
    ['a reordered column', withCols(hp, id), 't.id: column #1 is now "hp"'],
    ['a retyped column', withCols(id, { name: 'hp', type: 'i32' }), 't.hp: type changed from f64 to i32'],
    ['an appended required column', withCols(id, hp, { name: 'x', type: 'i32' }), 't.x: a column appended to an existing table'],
    ['a changed pk', { t: { pk: 'hp', columns: [id, hp] } }, 't: primary key changed from id to hp'],
  ])('rejects %s', (_, next, message) => {
    const errors = checkAppendOnly(prev, next as Manifest)
    expect(errors.join('\n')).toContain(message)
  })
})
