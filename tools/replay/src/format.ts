// The replay file formats (CLAUDE.md 3.4 Replay test). Both are JSON and
// both are meant to be read in a diff:
//
// - A **script** (`tests/replay/<name>.json`) is the recording: the store's
//   seed and start clock, the content hash it was recorded against, the tick
//   length, and the commands, each run once the world clock reads `atTick`.
//   The runner ticks the world between commands and until `endTick`.
// - A **golden** (`tests/replay/<name>.golden.json`) is the result: every
//   non-empty table's rows sorted by primary key, the event log in order, and
//   the commands core refused. The smoke test (P0-018) dumps the server in
//   this same format and diffs the two.
//
// Values are canonical so the text is stable: object keys sorted, bigints
// written as the string `"<digits>n"`. One row or event per line.

import { createHash } from 'node:crypto'
import { z } from 'zod'

export const scriptSchema = z
  .object({
    /** Seed of the MemoryStore's Rng. */
    seed: z.int(),
    /** Initial store clock, integer ms. */
    now: z.int().nonnegative().default(0),
    /** `sha256:<hex>` of the canonical `@bastion/content` the golden was recorded against. */
    contentHash: z.string(),
    /** Milliseconds per tick; the store clock advances by this much each tick. */
    dtMs: z.int().positive(),
    /** Tick the world is run to after the last command. */
    endTick: z.int().nonnegative(),
    commands: z.array(
      z.object({
        /** Run once the world clock reads this tick (0 = before the first tick). */
        atTick: z.int().nonnegative(),
        /** The authority the host would take from `ctx.sender`. */
        sender: z.string().min(1),
        /** Passed to `core.execute` as is, so it is validated as hostile there. */
        envelope: z.unknown(),
      }),
    ),
  })
  .strict()
  .superRefine((s, ctx) => {
    let last = 0
    s.commands.forEach((c, i) => {
      if (c.atTick < last) ctx.addIssue({ code: 'custom', path: ['commands', i, 'atTick'], message: 'atTick must not decrease' })
      if (c.atTick > s.endTick) ctx.addIssue({ code: 'custom', path: ['commands', i, 'atTick'], message: 'atTick is after endTick' })
      last = c.atTick
    })
  })

export type Script = z.output<typeof scriptSchema>

/** What a run produced. Rows and events are already canonical values. */
export interface Result {
  readonly tables: Readonly<Record<string, readonly unknown[]>>
  readonly events: readonly unknown[]
  readonly rejections: readonly { readonly command: number; readonly code: string; readonly message: string }[]
}

/** Canonical JSON value: keys sorted, bigints as `"<n>n"`, no undefined. */
export function canonical(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value}n`
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = canonical(v)
    }
    return out
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`replay: cannot record non-finite number ${value}`)
  return value
}

export function contentHash(content: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex')
  return `sha256:${hash}`
}

function lines(items: readonly unknown[], indent: string): string {
  if (items.length === 0) return '[]'
  return `[\n${items.map((item) => `${indent}  ${JSON.stringify(item)}`).join(',\n')}\n${indent}]`
}

/** The golden's text: one row, event or rejection per line. */
export function formatResult(result: Result): string {
  const tables = Object.keys(result.tables).sort()
  const body = tables.map((t) => `    ${JSON.stringify(t)}: ${lines(result.tables[t] ?? [], '    ')}`)
  return [
    '{',
    `  "tables": ${tables.length === 0 ? '{}' : `{\n${body.join(',\n')}\n  }`},`,
    `  "events": ${lines(result.events, '  ')},`,
    `  "rejections": ${lines(result.rejections, '  ')}`,
    '}',
    '',
  ].join('\n')
}
