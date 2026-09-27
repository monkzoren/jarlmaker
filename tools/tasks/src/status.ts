import type { Git } from './git.ts'
import { tryGit } from './git.ts'
import { withHash } from './hash.ts'
import { PHASE_IDS, PHASES, type Task } from './schema.ts'

/** Days on which task files flipped to `status: done`, from `git log -p` on the current branch. */
export function doneByDay(git: Git): Map<string, string[]> {
  const log = tryGit(git, ['log', '--reverse', '-p', '--format=@@ %cs', '--', 'tasks/']) ?? ''
  const out = new Map<string, string[]>()
  let day = ''
  let file = ''
  for (const line of log.split('\n')) {
    if (line.startsWith('@@ ')) day = line.slice(3).trim()
    else if (line.startsWith('+++ b/')) file = line.slice(6)
    else if (/^\+status:\s*done\s*$/.test(line) && day) {
      const id = file.replace(/^.*\//, '').replace(/\.md$/, '')
      out.set(day, [...(out.get(day) ?? []), id])
    }
  }
  return out
}

const bar = (done: number, total: number): string => {
  const n = total ? Math.round((done / total) * 20) : 0
  return `\`${'#'.repeat(n)}${'.'.repeat(20 - n)}\``
}

/** Render docs/STATUS.md: per-phase progress, merges per day, burndown, blocked list. */
export function renderStatus(tasks: Task[], perDay: Map<string, string[]>): string {
  const lines: string[] = ['# Status', '']
  lines.push('| Phase | done / total | progress |', '|---|---:|---|')
  for (const p of PHASE_IDS) {
    const inP = tasks.filter((t) => t.phase === p)
    if (!inP.length) continue
    const done = inP.filter((t) => t.status === 'done').length
    lines.push(`| ${p} ${PHASES[p]} | ${done} / ${inP.length} | ${bar(done, inP.length)} |`)
  }
  const total = tasks.length
  const days = [...perDay.keys()].sort()
  lines.push('', '## Merged per day and burndown', '')
  if (!days.length) lines.push('_No task has been merged as done yet._')
  else {
    lines.push('| day | done that day | open after |', '|---|---:|---:|')
    let cum = 0
    for (const d of days) {
      const n = perDay.get(d)?.length ?? 0
      cum += n
      lines.push(`| ${d} | ${n} | ${Math.max(total - cum, 0)} |`)
    }
  }
  const blocked = tasks.filter((t) => t.status === 'blocked')
  lines.push('', '## Blocked', '')
  if (!blocked.length) lines.push('_Nothing is blocked._')
  for (const t of blocked) lines.push(`- **${t.id}** ${t.title}: ${t.blocked}`)
  return withHash('status', `${lines.join('\n')}\n`)
}
