import { byId, criticalPath } from './graph.ts'
import { touchesOverlap } from './overlap.ts'
import { PHASE_IDS, type Status, type Task } from './schema.ts'

/** A task held on a remote branch (ADR 0003). */
export interface Claim {
  id: string
  branch: string
  /** Status of the task file on that branch. */
  status: Status
  owner: string
  /** Unix seconds of the first commit on the branch that touched the task file. */
  since: number
  /** Unix seconds of the branch tip. */
  tip: number
}

/** Hours after which a claim with no new commits stops blocking (ADR 0003). */
export const STALE_HOURS = 72

export type Derived = Status | 'ready' | 'review'

export interface View {
  tasks: Task[]
  /** Winning live claim per task id (earliest claim; ties by branch name). */
  claims: Map<string, Claim>
  /** Claims that lost a race or went stale; shown, never blocking. */
  ignored: { claim: Claim; reason: 'stale' | 'duplicate' }[]
  derived: Map<string, Derived>
  cp: Map<string, number>
}

const claimOrder = (a: Claim, b: Claim): number => a.since - b.since || a.branch.localeCompare(b.branch)

/**
 * Combine the tasks on `main` with claims read from remote branches.
 * `nowSec` is injected so the result is deterministic in tests.
 */
export function view(tasks: Task[], rawClaims: Claim[], nowSec: number): View {
  const ids = byId(tasks)
  const claims = new Map<string, Claim>()
  const ignored: View['ignored'] = []
  for (const c of [...rawClaims].sort(claimOrder)) {
    const t = ids.get(c.id)
    if (!t || t.status === 'done') continue // merged, or unknown to main
    if (!['in_progress', 'done', 'blocked'].includes(c.status)) continue
    if (nowSec - c.tip > STALE_HOURS * 3600) {
      ignored.push({ claim: c, reason: 'stale' })
      continue
    }
    if (claims.has(c.id)) {
      ignored.push({ claim: c, reason: 'duplicate' })
      continue
    }
    claims.set(c.id, c)
  }

  const derived = new Map<string, Derived>()
  for (const t of tasks) {
    const c = claims.get(t.id)
    let d: Derived = t.status
    if (c) d = c.status === 'done' ? 'review' : c.status
    else if (t.status === 'todo' && t.depends_on.every((x) => ids.get(x)?.status === 'done')) d = 'ready'
    derived.set(t.id, d)
  }
  const cp = criticalPath(tasks, (t) => t.status !== 'done')
  return { tasks, claims, ignored, derived, cp }
}

/** Priority order (CLAUDE.md 4.3): critical-path length desc, then phase, then id. */
export function byPriority(v: View): (a: Task, b: Task) => number {
  return (a, b) =>
    (v.cp.get(b.id) ?? 0) - (v.cp.get(a.id) ?? 0) ||
    PHASE_IDS.indexOf(a.phase) - PHASE_IDS.indexOf(b.phase) ||
    a.id.localeCompare(b.id)
}

export interface NextResult {
  task?: Task
  /** Ready tasks skipped because their lane or touches collide with a live claim. */
  skipped: { task: Task; reason: string }[]
}

/**
 * The highest-priority ready task with no conflict against an in-progress claim.
 * Only `in_progress` claims hold a lane; finished work under review does not.
 */
export function next(v: View, filter: { lane?: string; phase?: string } = {}): NextResult {
  const ids = byId(v.tasks)
  const active = [...v.claims.values()]
    .filter((c) => c.status === 'in_progress')
    .map((c) => ids.get(c.id))
    .filter((t): t is Task => t !== undefined)
  const skipped: NextResult['skipped'] = []
  const ready = v.tasks
    .filter((t) => v.derived.get(t.id) === 'ready')
    .filter((t) => (filter.lane ? t.lane === filter.lane : true))
    .filter((t) => (filter.phase ? t.phase === filter.phase : true))
    .sort(byPriority(v))
  for (const t of ready) {
    const laneHeld = active.find((a) => a.lane === t.lane)
    if (laneHeld) {
      skipped.push({ task: t, reason: `lane ${t.lane} held by ${laneHeld.id} (${v.claims.get(laneHeld.id)?.branch})` })
      continue
    }
    const clash = active.map((a) => [a, touchesOverlap(t.touches, a.touches)] as const).find(([, o]) => o)
    if (clash) {
      skipped.push({ task: t, reason: `touches ${clash[1]?.[0]} overlaps ${clash[0].id}'s ${clash[1]?.[1]}` })
      continue
    }
    return { task: t, skipped }
  }
  return { skipped }
}
