import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { byId, findCycles } from './graph.ts'
import { checkHash } from './hash.ts'
import type { Loaded } from './load.ts'
import { section } from './load.ts'
import { touchesOverlap } from './overlap.ts'
import { isExit, type Task } from './schema.ts'

export interface Report {
  errors: string[]
  warnings: string[]
}

/** Every structural rule from CLAUDE.md 4.3 (as amended by ADR 0003). Pure over the task set. */
export function validateTasks(loaded: Loaded): Report {
  const errors: string[] = loaded.errors.map((e) => `${e.path}: ${e.message}`)
  const warnings: string[] = []
  const { tasks } = loaded
  const err = (t: Task, m: string): void => void errors.push(`${t.path}: ${m}`)

  const seen = new Map<string, string>()
  for (const t of tasks) {
    const prev = seen.get(t.id)
    if (prev) err(t, `duplicate id ${t.id} (also ${prev})`)
    seen.set(t.id, t.path)
    if (t.path !== `tasks/${t.phase}/${t.id}.md`) err(t, `must live at tasks/${t.phase}/${t.id}.md`)
    if (!t.id.startsWith(`${t.phase}-`)) err(t, `id ${t.id} does not match phase ${t.phase}`)
    for (const s of ['Goal', 'Definition of done', 'Notes']) {
      if (section(t.body, s) === undefined) err(t, `missing "## ${s}" section`)
    }
    if (t.dod.length === 0) err(t, 'Definition of done has no "- [ ] ..." lines')
    if (t.status !== 'draft' && t.touches.length === 0) err(t, 'touches is empty (only draft tasks may omit it)')
    if (t.status === 'blocked' && !t.blocked.trim()) err(t, 'status blocked needs a `blocked:` reason')
    if (t.status !== 'blocked' && t.blocked.trim()) err(t, '`blocked:` reason set but status is not blocked')
    if (t.status === 'done' && t.dod.some((d) => !d.done)) err(t, 'status done but some DoD boxes are unticked')
    if (t.depends_on.includes(t.id)) err(t, 'depends on itself')
  }

  const ids = byId(tasks)
  for (const t of tasks) {
    for (const d of t.depends_on) {
      const dep = ids.get(d)
      if (!dep) {
        err(t, `depends_on ${d} does not exist`)
        continue
      }
      if ((t.status === 'in_progress' || t.status === 'done') && dep.status !== 'done') {
        err(t, `is ${t.status} but dependency ${d} is ${dep.status}`)
      }
      if (t.status === 'todo' && !isExit(t) && dep.status === 'draft') {
        warnings.push(`${t.path}: todo task depends on draft ${d}; it cannot become ready until ${d} is refined`)
      }
    }
  }
  for (const c of findCycles(tasks)) errors.push(`dependency cycle: ${c.join(' → ')}`)

  const phases = [...new Set(tasks.map((t) => t.phase))].sort()
  for (const p of phases) {
    const inPhase = tasks.filter((t) => t.phase === p)
    const exit = ids.get(`${p}-EXIT`)
    if (!exit) {
      errors.push(`phase ${p} has no exit task ${p}-EXIT`)
      continue
    }
    const missing = inPhase.filter((t) => t !== exit && !exit.depends_on.includes(t.id)).map((t) => t.id)
    if (missing.length) err(exit, `exit task must depend on every task in ${p}; missing ${missing.join(', ')}`)
  }

  const active = tasks.filter((t) => t.status === 'in_progress')
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      if (!a || !b) continue
      if (a.lane === b.lane) errors.push(`${a.id} and ${b.id} are both in_progress in lane ${a.lane}`)
      else {
        const o = touchesOverlap(a.touches, b.touches)
        if (o) errors.push(`${a.id} and ${b.id} are in_progress in different lanes with overlapping touches (${o[0]} / ${o[1]})`)
      }
    }
  }
  return { errors, warnings }
}

/** Generated docs must carry an intact content hash (a hand edit fails; staleness does not). */
export function validateGenerated(root: string): string[] {
  const out: string[] = []
  for (const f of ['docs/BOARD.md', 'docs/STATUS.md']) {
    const abs = join(root, f)
    if (!existsSync(abs)) continue
    const r = checkHash(readFileSync(abs, 'utf8'))
    if (r !== 'ok') out.push(`${f}: ${r} — regenerate it with pnpm tasks:${f.includes('BOARD') ? 'board' : 'status'}; never edit it by hand`)
  }
  return out
}
