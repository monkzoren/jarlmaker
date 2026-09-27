import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { view, type View } from './derive.ts'
import { baseRef, currentBranch, loadAtRef, readClaims, tryGit, type Git } from './git.ts'
import { loadFromDisk, setFrontmatter } from './load.ts'
import { touchesOverlap } from './overlap.ts'

export interface ClaimOptions {
  root: string
  git: Git
  id: string
  owner?: string
  push: boolean
  remote: boolean
  nowSec: number
  log: (s: string) => void
}

/** Load main's tasks plus remote claims. Falls back to the working tree when there is no remote base. */
export function currentView(git: Git, root: string, remote: boolean, nowSec: number, log: (s: string) => void): View {
  if (remote) {
    if (tryGit(git, ['fetch', '--quiet', '--prune', 'origin']) === undefined) {
      log('warning: `git fetch origin` failed; claims may be out of date')
    }
  }
  const base = remote ? baseRef(git) : undefined
  const loaded = base ? loadAtRef(git, base) : loadFromDisk(root)
  if (remote && !base) log('note: origin has no main branch yet; using the working tree as main')
  const claims = remote ? readClaims(git, base) : []
  return view(loaded.tasks, claims, nowSec)
}

/** `pnpm tasks:claim <id>` (ADR 0003). Returns a process exit code. */
export function claim(o: ClaimOptions): number {
  const v = currentView(o.git, o.root, o.remote, o.nowSec, o.log)
  const t = v.tasks.find((x) => x.id === o.id)
  if (!t) {
    o.log(`unknown task ${o.id}`)
    return 1
  }
  const d = v.derived.get(t.id)
  if (d !== 'ready') {
    const c = v.claims.get(t.id)
    o.log(`${t.id} is ${d}${c ? ` on ${c.branch}` : ''}, not ready; run pnpm tasks:next`)
    return 1
  }
  for (const c of v.claims.values()) {
    const other = v.tasks.find((x) => x.id === c.id)
    if (!other || c.status !== 'in_progress') continue
    if (other.lane === t.lane) {
      o.log(`lane ${t.lane} is held by ${other.id} on ${c.branch}; run pnpm tasks:next`)
      return 1
    }
    const ov = touchesOverlap(t.touches, other.touches)
    if (ov) {
      o.log(`touches ${ov[0]} overlaps ${other.id} (${c.branch}) ${ov[1]}; run pnpm tasks:next`)
      return 1
    }
  }

  let branch = currentBranch(o.git)
  if (branch === 'main' || branch === 'master' || branch === 'HEAD') {
    branch = `task/${t.id}`
    o.git(['checkout', '-b', branch])
    o.log(`created branch ${branch}`)
  }
  const abs = join(o.root, t.path)
  const text = readFileSync(abs, 'utf8')
  writeFileSync(abs, setFrontmatter(text, { status: 'in_progress', owner: o.owner ?? branch }))
  o.git(['add', t.path])
  o.git(['commit', '--quiet', '-m', `chore(tasks): claim ${t.id}`])
  o.log(`claimed ${t.id} on ${branch}`)
  if (!o.push) {
    o.log('not pushed (--no-push): the claim is invisible to other workers until you push')
    return 0
  }
  o.git(['push', '--quiet', '-u', 'origin', branch])

  // Race check: the earliest claim commit wins (ADR 0003).
  const after = currentView(o.git, o.root, true, o.nowSec, o.log)
  const winner = after.claims.get(t.id)
  if (winner && winner.branch !== branch) {
    o.log(`lost the race: ${winner.branch} claimed ${t.id} first. Revert your claim commit and run pnpm tasks:next.`)
    return 3
  }
  o.log('claim pushed; other workers now see it')
  return 0
}

/** Reload after a claim to confirm the working tree still parses (used by tests). */
export const reload = (root: string): ReturnType<typeof loadFromDisk> => loadFromDisk(root)
