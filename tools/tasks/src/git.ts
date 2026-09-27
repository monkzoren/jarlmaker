import { execFileSync } from 'node:child_process'
import type { Claim } from './derive.ts'
import { parseAll, parseTask, type Loaded } from './load.ts'

export type Git = (args: string[]) => string

/** A git runner bound to a repo directory. Throws on non-zero exit. */
export function gitIn(cwd: string): Git {
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export const tryGit = (git: Git, args: string[]): string | undefined => {
  try {
    return git(args)
  } catch {
    return undefined
  }
}

/** The remote default-branch ref (`origin/main`), if the remote has one. */
export function baseRef(git: Git): string | undefined {
  const head = tryGit(git, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head
  for (const r of ['origin/main', 'origin/master']) if (tryGit(git, ['rev-parse', '--verify', '--quiet', r])) return r
  return undefined
}

/** Task files as they exist at a git ref. */
export function loadAtRef(git: Git, ref: string): Loaded {
  const list = tryGit(git, ['ls-tree', '-r', '--name-only', ref, '--', 'tasks/'])
  const paths = (list ?? '').split('\n').filter((p) => /^tasks\/P\d\/[^/]+\.md$/.test(p))
  return parseAll(paths.map((path) => ({ path, text: git(['show', `${ref}:${path}`]) })))
}

/** Remote branches other than the base, as `origin/<name>` refs. */
export function remoteBranches(git: Git, base: string | undefined): string[] {
  const out = tryGit(git, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/']) ?? ''
  return out
    .split('\n')
    .filter((r) => r && r !== base && r !== 'origin/HEAD' && r !== 'origin')
}

/**
 * Claims held on remote branches (ADR 0003): any task file a branch changed
 * relative to its merge-base with `base`, whose status there is in_progress,
 * done or blocked.
 */
export function readClaims(git: Git, base: string | undefined): Claim[] {
  const claims: Claim[] = []
  for (const ref of remoteBranches(git, base)) {
    const range = base ? `${base}...${ref}` : ref
    const changed = base
      ? tryGit(git, ['diff', '--name-only', range, '--', 'tasks/'])
      : tryGit(git, ['ls-tree', '-r', '--name-only', ref, '--', 'tasks/'])
    const tip = Number(tryGit(git, ['log', '-1', '--format=%ct', ref]) ?? 0)
    for (const path of (changed ?? '').split('\n')) {
      if (!/^tasks\/P\d\/[^/]+\.md$/.test(path)) continue
      const text = tryGit(git, ['show', `${ref}:${path}`])
      if (text === undefined) continue // deleted on the branch
      const t = parseTask(path, text)
      if ('message' in t) continue
      if (!['in_progress', 'done', 'blocked'].includes(t.status)) continue
      const logRange = base ? `${base}..${ref}` : ref
      const first = (tryGit(git, ['log', '--reverse', '--format=%ct', logRange, '--', path]) ?? '').split('\n')[0]
      claims.push({
        id: t.id,
        branch: ref.replace(/^origin\//, ''),
        status: t.status,
        owner: t.owner,
        since: Number(first || tip),
        tip,
      })
    }
  }
  return claims
}

export const currentBranch = (git: Git): string => git(['rev-parse', '--abbrev-ref', 'HEAD'])
