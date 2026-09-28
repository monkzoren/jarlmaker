// The contentlint checks, as a pure function over raw content so tests can
// feed it broken fixtures. `cli.ts` runs it over `@bastion/content`.

import { ContentError, loadContent } from '@bastion/core'

export interface LintResult {
  /** Each a readable `path: message`. Any error fails contentlint. */
  readonly errors: readonly string[]
  /** Sections no system has registered a schema for yet (ADR 0005: a warning until P0/P1 own them all). */
  readonly warnings: readonly string[]
}

/** Content is data (CLAUDE.md 3.3): report every function value by its dotted path. */
export function findFunctions(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path || '(root)'}: functions are not allowed in content`]
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => findFunctions(child, path ? `${path}.${key}` : key))
}

export function lintContent(raw: unknown): LintResult {
  const errors = findFunctions(raw)
  let warnings: string[] = []
  try {
    warnings = loadContent(raw).unvalidated.map((section) => `${section}: no system has registered a schema for this section`)
  } catch (e) {
    if (!(e instanceof ContentError)) throw e
    errors.push(...e.issues.map((issue) => `${issue.path}: ${issue.message}`))
  }
  return { errors, warnings }
}
