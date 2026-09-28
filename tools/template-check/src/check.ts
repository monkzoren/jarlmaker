// The system folder template (CLAUDE.md 3.1 pillar 6, 3.3) and "docs live
// with code" (3.10): every system folder under packages/core/src has the
// template files, and the tables under its README's `## Data` list exactly
// the fields of the Zod objects the system declares.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Core infrastructure, not systems (ADR 0003's `core` lane: store, events,
 * and the tick/execute kernel). They keep their own README but not the
 * system template.
 */
export const EXEMPT_FOLDERS: readonly string[] = ['store', 'events', 'kernel']

/** Files every system folder must hold. `tick.ts` is optional; at least one `*.test.ts` is also required. */
export const REQUIRED_FILES: readonly string[] = ['README.md', 'HOWTO.md', 'schema.ts', 'rules.ts', 'commands.ts']

/**
 * Modules whose Zod objects are not `## Data`: command payloads and event
 * shapes have their own README sections, and `index.ts` only re-exports.
 */
const NOT_DATA_MODULES = new Set(['index.ts', 'commands.ts', 'events.ts'])

/** A `## Data` table column holding field names has one of these headers. */
const FIELD_COLUMNS = new Set(['shape', 'fields', 'field', 'columns', 'knobs'])

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Missing template files in one system folder, one message per file. */
export function checkTemplateFiles(dir: string, name: string): string[] {
  const files = new Set(readdirSync(dir))
  const errors = REQUIRED_FILES.filter((f) => !files.has(f)).map((f) => `${name}/: missing ${f}`)
  if (![...files].some((f) => f.endsWith('.test.ts'))) errors.push(`${name}/: missing a *.test.ts`)
  return errors
}

/**
 * Field names listed in the README's `## Data` section: every identifier in
 * a code span of a field column (see FIELD_COLUMNS). A span may hold several
 * (`id, kind, def`).
 */
export function readmeDataFields(markdown: string): Set<string> {
  const fields = new Set<string>()
  const lines = dataSection(markdown)
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i] ?? ''
    if (!isTableRow(header) || !isSeparator(lines[i + 1] ?? '')) continue
    const columns = cells(header).flatMap((c, n) => (FIELD_COLUMNS.has(c.toLowerCase()) ? [n] : []))
    let row = i + 2
    for (; isTableRow(lines[row] ?? ''); row++) {
      const rowCells = cells(lines[row] ?? '')
      for (const n of columns) {
        for (const span of (rowCells[n] ?? '').matchAll(/`([^`]*)`/g)) {
          for (const token of (span[1] ?? '').split(/[\s,]+/)) {
            if (IDENTIFIER.test(token)) fields.add(token)
          }
        }
      }
    }
    i = row - 1
  }
  return fields
}

/** Where a field is declared: `<module>: <export>`. */
export type FieldSources = Map<string, string[]>

/**
 * Top-level field names of every Zod object in the given module exports,
 * including table rows (`defineTable(...).row`). Duck-typed so a second copy
 * of zod still counts.
 */
export function schemaFields(modules: Record<string, Record<string, unknown>>): FieldSources {
  const sources: FieldSources = new Map()
  for (const [file, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) {
      const shape = zodShape(value) ?? zodShape(isRecord(value) ? value.row : undefined)
      if (!shape) continue
      for (const field of Object.keys(shape)) {
        const list = sources.get(field) ?? []
        list.push(`${file}: ${name}`)
        sources.set(field, list)
      }
    }
  }
  return sources
}

/** README `## Data` against the Zod fields, both directions, one message per field. */
export function compareFields(name: string, readme: Set<string>, schema: FieldSources): string[] {
  const errors: string[] = []
  for (const field of [...readme].sort()) {
    if (!schema.has(field)) {
      errors.push(`${name}/README.md: ## Data lists \`${field}\`, but no Zod object in ${name}/ declares it`)
    }
  }
  for (const [field, where] of [...schema].sort(([a], [b]) => a.localeCompare(b))) {
    if (!readme.has(field)) {
      errors.push(`${name}/README.md: ## Data is missing field \`${field}\` (declared in ${where.join(', ')})`)
    }
  }
  return errors
}

/** The data modules of a system folder: its non-test `.ts` files, minus NOT_DATA_MODULES. */
export function dataModules(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !NOT_DATA_MODULES.has(f) && !/\.test(-util)?\.ts$/.test(f))
    .sort()
}

/** README/schema sync for one system folder. Skipped (the template check reports it) without a README. */
export async function checkReadmeSync(dir: string, name: string): Promise<string[]> {
  const readmePath = join(dir, 'README.md')
  if (!existsSync(readmePath)) return []
  const modules: Record<string, Record<string, unknown>> = {}
  for (const file of dataModules(dir)) {
    modules[file] = (await import(pathToFileURL(join(dir, file)).href)) as Record<string, unknown>
  }
  return compareFields(name, readmeDataFields(readFileSync(readmePath, 'utf8')), schemaFields(modules))
}

/** Every check over every system folder under `coreSrc` (packages/core/src). */
export async function checkCoreSystems(coreSrc: string): Promise<string[]> {
  const errors: string[] = []
  const folders = readdirSync(coreSrc, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !EXEMPT_FOLDERS.includes(d.name))
    .map((d) => d.name)
    .sort()
  for (const name of folders) {
    const dir = join(coreSrc, name)
    errors.push(...checkTemplateFiles(dir, name), ...(await checkReadmeSync(dir, name)))
  }
  return errors
}

function dataSection(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s+Data\s*$/.test(l))
  if (start < 0) return []
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|')
}

function isSeparator(line: string): boolean {
  return isTableRow(line) && cells(line).every((c) => /^:?-+:?$/.test(c))
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function zodShape(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value._zod) || !isRecord(value._zod.def)) return undefined
  if (value._zod.def.type !== 'object' || !isRecord(value.shape)) return undefined
  return value.shape
}
