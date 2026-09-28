// The Game context: validated, frozen content, injected by the host
// (ADR 0005). `core` never imports `@bastion/content`; the host (server,
// MemoryStore tests, contentlint) loads the content package and calls
// `createGame(content)`, then passes the `Game` to `execute` and `tick`.
//
// Content is split into sections, each owned by exactly one system:
// - tuning sections (`content.tuning.<name>`): one object of knobs each,
//   from `packages/content/tuning/<name>.ts`;
// - data sections (`content.<name>`): an array of entries each, from
//   `packages/content/<name>/*.ts` (structures, enemies, items, ...).
//
// A system registers its section's schema and type from its own folder:
//
//   export const movementTuning = z.object({ speed: z.number().positive() })
//   registerTuning('movement', movementTuning)
//   declare module '../game.ts' {
//     interface TuningRegistry { movement: z.output<typeof movementTuning> }
//   }
//
// and reads it as `game.content.tuning.movement.speed`.

import { z } from 'zod'

/** tuning section name -> knob object. Empty in the contract; systems add members. */
export interface TuningRegistry {}

/** data section name -> entry. Empty in the contract; systems add members. */
export interface ContentRegistry {}

export type Content = {
  readonly tuning: Readonly<TuningRegistry>
} & {
  readonly [K in keyof ContentRegistry]: readonly ContentRegistry[K][]
}

export interface Game {
  readonly content: Content
}

const TUNING = 'tuning'
const NAME = /^[a-z][a-zA-Z0-9]*$/
const tuningSchemas = new Map<string, z.ZodType>()
const contentSchemas = new Map<string, z.ZodType>()

function register(kind: string, into: Map<string, z.ZodType>, name: string, schema: z.ZodType): void {
  if (!NAME.test(name)) throw new Error(`${kind} section "${name}" must be camelCase`)
  if (into.has(name)) throw new Error(`${kind} section "${name}" is already registered`)
  into.set(name, schema)
}

/** Register the schema of `content.tuning.<name>` (one knob object). */
export function registerTuning(name: string, schema: z.ZodType): void {
  register('tuning', tuningSchemas, name, schema)
}

/** Register the schema of one entry of `content.<name>` (the section is an array of them). */
export function registerContent(name: string, entry: z.ZodType): void {
  if (name === TUNING) throw new Error(`content section "${TUNING}" is reserved`)
  register('content', contentSchemas, name, entry)
}

/** Thrown by `loadContent`; `issues` carry the dotted path of every failure. */
export class ContentError extends Error {
  readonly issues: readonly { readonly path: string; readonly message: string }[]

  constructor(issues: readonly z.core.$ZodIssue[]) {
    const list = issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    }))
    super(`invalid content:\n${list.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`)
    this.name = 'ContentError'
    this.issues = list
  }
}

export interface LoadedContent {
  readonly content: Content
  /** Sections present in the input that no system registered a schema for (dropped, listed for contentlint). */
  readonly unvalidated: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate raw content against every registered section schema. Registered
 * sections are required; unregistered ones are dropped and reported. Throws
 * `ContentError` on the first invalid input, with every issue's path.
 */
export function loadContent(raw: unknown): LoadedContent {
  const tuningShape = Object.fromEntries(tuningSchemas)
  const contentShape = Object.fromEntries([...contentSchemas].map(([name, entry]) => [name, z.array(entry)]))
  const schema = z.object({ [TUNING]: z.object(tuningShape), ...contentShape })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new ContentError(parsed.error.issues)

  const unvalidated: string[] = []
  if (isRecord(raw)) {
    for (const key of Object.keys(raw)) {
      if (key !== TUNING && !contentSchemas.has(key)) unvalidated.push(key)
    }
    const tuning = raw[TUNING]
    if (isRecord(tuning)) {
      for (const key of Object.keys(tuning)) {
        if (!tuningSchemas.has(key)) unvalidated.push(`${TUNING}.${key}`)
      }
    }
  }
  return { content: deepFreeze(parsed.data) as unknown as Content, unvalidated: unvalidated.sort() }
}

/** Build the Game context from raw content (the `@bastion/content` export). */
export function createGame(content: unknown): Game {
  return Object.freeze({ content: loadContent(content).content })
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
