import { longestChain } from './graph.ts'
import { byPriority, type Derived, type View } from './derive.ts'
import { withHash } from './hash.ts'
import { PHASE_IDS, PHASES, type Task } from './schema.ts'

const COLUMNS: Derived[] = ['draft', 'todo', 'ready', 'in_progress', 'review', 'blocked', 'done']

const esc = (s: string): string => s.replace(/\|/g, '\\|')

function row(v: View, t: Task, extra: string): string {
  return `| ${t.id} | ${esc(t.title)} | ${t.lane} | ${t.size} | ${extra} |`
}

function waitingOn(v: View, t: Task): string {
  const byIdMap = new Map(v.tasks.map((x) => [x.id, x]))
  const open = t.depends_on.filter((d) => byIdMap.get(d)?.status !== 'done')
  return open.length ? `waits on ${open.join(', ')}` : ''
}

function detail(v: View, t: Task): string {
  const d = v.derived.get(t.id) ?? t.status
  const c = v.claims.get(t.id)
  if (c) return `${d} on \`${c.branch}\``
  if (d === 'todo') return `todo — ${waitingOn(v, t)}`
  if (d === 'blocked') return `blocked — ${esc(t.blocked)}`
  if (d === 'done' && t.pr) return `done (#${t.pr})`
  return d
}

/** Render docs/BOARD.md. Deterministic for a given task set and claim set. */
export function renderBoard(v: View, opts: { live: boolean }): string {
  const lines: string[] = []
  const count = (p: string, s: Derived): number =>
    v.tasks.filter((t) => t.phase === p && (v.derived.get(t.id) ?? t.status) === s).length
  const phases = PHASE_IDS.filter((p) => v.tasks.some((t) => t.phase === p))

  lines.push('# Board', '')
  lines.push(
    opts.live
      ? '_Live view: `main` plus claims pushed on remote branches._'
      : '_State of `main`. Claims in flight on branches: `pnpm tasks:board --live`. Protocol: [ADR 0003](DECISIONS/0003-task-ledger-protocol.md)._',
    '',
  )
  lines.push(`| Phase | ${COLUMNS.join(' | ')} | total |`, `|---|${COLUMNS.map(() => '---:').join('|')}|---:|`)
  for (const p of phases) {
    const total = v.tasks.filter((t) => t.phase === p).length
    lines.push(`| ${p} ${PHASES[p]} | ${COLUMNS.map((s) => count(p, s) || '·').join(' | ')} | ${total} |`)
  }

  const ready = v.tasks.filter((t) => v.derived.get(t.id) === 'ready').sort(byPriority(v))
  lines.push('', '## Ready now', '')
  if (ready.length === 0) lines.push('_Nothing is ready._')
  else {
    lines.push('| id | title | lane | size | critical path |', '|---|---|---|---|---:|')
    for (const t of ready) lines.push(row(v, t, String(v.cp.get(t.id) ?? 0)))
  }

  const chain = longestChain(v.tasks, (t) => t.status !== 'done')
  lines.push('', '## Critical path', '')
  lines.push(chain.length ? `${chain.length} tasks: ${chain.join(' → ')}` : '_Everything is done._')

  if (opts.live && v.ignored.length) {
    lines.push('', '## Ignored claims', '')
    for (const { claim, reason } of v.ignored) lines.push(`- ${claim.id} on \`${claim.branch}\`: ${reason}`)
  }

  for (const p of phases) {
    lines.push('', `## ${p} — ${PHASES[p]}`, '')
    lines.push('| id | title | lane | size | status |', '|---|---|---|---|---|')
    for (const t of v.tasks.filter((x) => x.phase === p)) lines.push(row(v, t, detail(v, t)))
  }
  return withHash('board', `${lines.join('\n')}\n`)
}
