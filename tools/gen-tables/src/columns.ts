// Zod column schema -> SpacetimeDB 2.x column type (CLAUDE.md 3.4).
//
// The mapping is deliberately small: every Zod type a core table may use is
// listed here, and anything else fails generation with the column path, so a
// table can never reach the server with a shape the module cannot store.
// The TypeScript value type must match on both sides (the server hands rows to
// `core` as-is), which is why `z.number()` is `f64` and not an integer type.

/** The column type, as the generator sees it. */
export type ColType =
  | { readonly kind: 'string' | 'bool' | 'i32' | 'u32' | 'i64' | 'u64' | 'f32' | 'f64' }
  | { readonly kind: 'option' | 'array'; readonly of: ColType }
  | { readonly kind: 'object'; readonly name: string; readonly fields: readonly Field[] }

export interface Field {
  readonly name: string
  readonly type: ColType
}

export interface Column extends Field {
  /** A literal default from `.default(v)`; lets a column be appended to a live table. */
  readonly default?: string | number | boolean | bigint
}

/** Thrown for a column the generator cannot map; the message leads with the column path. */
export class GenError extends Error {}

/** Scalars SpacetimeDB can index and use as a primary key (floats cannot). */
export const INDEXABLE = new Set(['string', 'bool', 'i32', 'u32', 'i64', 'u64'])

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

const NUMBER_FORMATS: Record<string, ColType['kind']> = {
  int32: 'i32',
  uint32: 'u32',
  float32: 'f32',
  float64: 'f64',
  safeint: 'f64',
}

const BIGINT_FORMATS: Record<string, ColType['kind']> = { int64: 'i64', uint64: 'u64' }

// Zod 4 keeps a schema's definition on `_zod.def`. Only the fields read below.
interface ZodDef {
  type: string
  format?: string
  checks?: readonly { _zod: { def: { format?: string } } }[]
  innerType?: ZodLike
  element?: ZodLike
  shape?: Record<string, ZodLike>
  entries?: Record<string, unknown>
  values?: readonly unknown[]
  defaultValue?: unknown
}
interface ZodLike {
  _zod: { def: ZodDef }
}

const pascal = (s: string): string =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')

function format(def: ZodDef): string | undefined {
  return def.format ?? def.checks?.map((c) => c._zod.def.format).find((f) => f !== undefined)
}

function allStrings(values: readonly unknown[]): boolean {
  return values.length > 0 && values.every((v) => typeof v === 'string')
}

/**
 * Map one Zod schema to a column type. `path` is `table.column[.field][]`,
 * used in error messages and to name nested object types.
 */
export function mapType(schema: ZodLike, path: string): ColType {
  const def = schema._zod.def
  const fail = (why: string): never => {
    throw new GenError(`${path}: ${why}`)
  }
  switch (def.type) {
    case 'string':
      return { kind: 'string' }
    case 'boolean':
      return { kind: 'bool' }
    case 'number': {
      const f = format(def)
      const kind = f === undefined ? 'f64' : NUMBER_FORMATS[f]
      return kind ? ({ kind } as ColType) : fail(`unsupported number format "${f}"`)
    }
    case 'bigint': {
      const f = format(def)
      const kind = f === undefined ? 'i64' : BIGINT_FORMATS[f]
      return kind ? ({ kind } as ColType) : fail(`unsupported bigint format "${f}"`)
    }
    case 'enum':
      return allStrings(Object.values(def.entries ?? {}))
        ? { kind: 'string' }
        : fail('only string enums are supported')
    case 'literal':
      return allStrings(def.values ?? []) ? { kind: 'string' } : fail('only string literals are supported')
    case 'optional':
      return { kind: 'option', of: mapType(def.innerType!, path) }
    case 'nullable':
      return fail('nullable columns are not supported; use .optional() (stored as an option)')
    case 'default':
      return fail('.default() is only supported on a top-level scalar column')
    case 'array':
      return { kind: 'array', of: mapType(def.element!, `${path}[]`) }
    case 'object': {
      const fields = Object.entries(def.shape ?? {}).map(([name, s]): Field => {
        if (!IDENT.test(name)) fail(`field name "${name}" is not an identifier`)
        return { name, type: mapType(s, `${path}.${name}`) }
      })
      return { kind: 'object', name: pascal(path.replace(/\[\]/g, '_item')), fields }
    }
    default:
      return fail(`unsupported Zod type "${def.type}"`)
  }
}

/** Map a top-level column, unwrapping a literal `.default(v)`. */
export function mapColumn(table: string, name: string, schema: ZodLike): Column {
  const path = `${table}.${name}`
  if (!IDENT.test(name)) throw new GenError(`${path}: column name is not an identifier`)
  const def = schema._zod.def
  if (def.type !== 'default') return { name, type: mapType(schema, path) }
  const type = mapType(def.innerType!, path)
  const value = def.defaultValue
  const scalar = type.kind !== 'option' && type.kind !== 'array' && type.kind !== 'object'
  if (!scalar || !['string', 'number', 'boolean', 'bigint'].includes(typeof value)) throw new GenError(`${path}: .default() needs a scalar column and a literal value`)
  return { name, type, default: value as Column['default'] }
}

/** A stable, name-free description of a type, used by the append-only check. */
export function typeKey(type: ColType): string {
  switch (type.kind) {
    case 'option':
    case 'array':
      return `${type.kind}<${typeKey(type.of)}>`
    case 'object':
      return `{${type.fields.map((f) => `${f.name}:${typeKey(f.type)}`).join(',')}}`
    default:
      return type.kind
  }
}

/** The `t.*` builder expression for a type. */
export function renderType(type: ColType): string {
  switch (type.kind) {
    case 'option':
    case 'array':
      return `t.${type.kind}(${renderType(type.of)})`
    case 'object': {
      const fields = type.fields.map((f) => `${f.name}: ${renderType(f.type)}`).join(', ')
      return `t.object('${type.name}', { ${fields} })`
    }
    default:
      return `t.${type.kind}()`
  }
}

/** Every nested object type name in a type, for the collision check. */
export function objectNames(type: ColType): string[] {
  switch (type.kind) {
    case 'option':
    case 'array':
      return objectNames(type.of)
    case 'object':
      return [type.name, ...type.fields.flatMap((f) => objectNames(f.type))]
    default:
      return []
  }
}

export function renderLiteral(value: NonNullable<Column['default']>): string {
  return typeof value === 'bigint' ? `${value}n` : typeof value === 'string' ? quote(value) : String(value)
}

/** A single-quoted TS string literal. */
export function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}
