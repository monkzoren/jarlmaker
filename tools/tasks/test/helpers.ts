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
