import { execFileSync } from 'node:child_process'
import type { Git } from '../src/git.ts'
import { parseTask } from '../src/load.ts'
import type { Task } from '../src/schema.ts'

export interface Spec {
  id: string
  deps?: string[]
  lane?: string
  status?: string
  touches?: string[]
  blocked?: string
  dod?: string[]
}

/** Task file text in the Section 4.2 format. */
export function taskText(s: Spec): string {
  const phase = s.id.slice(0, 2)
  const dod = s.dod ?? [s.status === 'done' ? '- [x] thing' : '- [ ] thing']
  return [
    '---',
    `id: ${s.id}`,
    `title: Task ${s.id}`,
    `phase: ${phase}`,
    `system: ${s.lane ?? 'core'}`,
    `lane: ${s.lane ?? 'core'}`,
    `depends_on: [${(s.deps ?? []).join(', ')}]`,
    'size: S',
    `status: ${s.status ?? 'todo'}`,
    'owner: ""',
    'pr: ""',
    'discovered_by: ""',
    `touches: [${(s.touches ?? [`packages/${s.id}/**`]).join(', ')}]`,
    `blocked: "${s.blocked ?? ''}"`,
    '---',
    '',
    '## Goal',
    'Something exists.',
    '',
    '## Definition of done',
    ...dod,
    '',
    '## Notes',
    'None.',
    '',
  ].join('\n')
}

export const pathOf = (id: string): string => `tasks/${id.slice(0, 2)}/${id}.md`

export function task(s: Spec): Task {
  const r = parseTask(pathOf(s.id), taskText(s))
  if ('message' in r) throw new Error(r.message)
  return r
}

/** A phase with an exit task depending on everything else in it. */
export function phase(specs: Spec[], exitStatus = 'todo'): Task[] {
  const p = specs[0]?.id.slice(0, 2) ?? 'P0'
  const ts = specs.map(task)
  return [...ts, task({ id: `${p}-EXIT`, deps: ts.map((t) => t.id), status: exitStatus, touches: ['docs/FEEDBACK.md'] })]
}

/** A git runner with a fixed identity and a controllable commit date. */
export function gitAt(cwd: string, date: () => string): Git {
  return (args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
        GIT_AUTHOR_DATE: date(), GIT_COMMITTER_DATE: date(),
      },
    }).trim()
}
