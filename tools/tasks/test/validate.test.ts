import { describe, expect, it } from 'vitest'
import { checkHash, withHash } from '../src/hash.ts'
import type { Task } from '../src/schema.ts'
import { validateTasks } from '../src/validate.ts'
import { phase, task } from './helpers.ts'

const errs = (tasks: Task[]): string[] => validateTasks({ tasks, errors: [] }).errors

describe('validateTasks', () => {
  it('accepts a well-formed phase', () => {
    expect(errs(phase([{ id: 'P0-001' }, { id: 'P0-002', deps: ['P0-001'] }]))).toEqual([])
  })

  it('requires an exit task that depends on every task in the phase', () => {
    expect(errs([task({ id: 'P0-001' })])).toContain('phase P0 has no exit task P0-EXIT')
    const ts = [task({ id: 'P0-001' }), task({ id: 'P0-002' }), task({ id: 'P0-EXIT', deps: ['P0-001'], touches: ['x'] })]
    expect(errs(ts).join()).toMatch(/missing P0-002/)
  })

  it('finds missing dependencies and cycles', () => {
    expect(errs(phase([{ id: 'P0-001', deps: ['P0-404'] }])).join()).toMatch(/P0-404 does not exist/)
    const cyc = errs(phase([{ id: 'P0-001', deps: ['P0-002'] }, { id: 'P0-002', deps: ['P0-001'] }]))
    expect(cyc.join()).toMatch(/cycle/)
  })

  it('rejects in_progress/done tasks whose deps are not done', () => {
    const e = errs(phase([{ id: 'P0-001' }, { id: 'P0-002', deps: ['P0-001'], status: 'in_progress' }]))
    expect(e.join()).toMatch(/P0-002.*in_progress but dependency P0-001 is todo/)
  })

  it('requires a reason on blocked and ticked boxes on done', () => {
    expect(errs(phase([{ id: 'P0-001', status: 'blocked' }])).join()).toMatch(/needs a `blocked:` reason/)
    expect(errs(phase([{ id: 'P0-001', status: 'done', dod: ['- [ ] x'] }])).join()).toMatch(/unticked/)
  })

  it('flags duplicate ids and misplaced files', () => {
    const a = task({ id: 'P0-001' })
    expect(errs([...phase([{ id: 'P0-001' }]), a]).join()).toMatch(/duplicate id/)
    expect(errs(phase([{ id: 'P0-001' }]).map((t) => ({ ...t, path: `tasks/P1/${t.id}.md` }))).join()).toMatch(/must live at/)
  })

  it('rejects two in_progress tasks in one lane, or overlapping touches across lanes', () => {
    const base = { status: 'in_progress' }
    const same = phase([{ id: 'P0-001', ...base }, { id: 'P0-002', ...base }])
    expect(errs(same).join()).toMatch(/both in_progress in lane core/)
    const cross = phase([
      { id: 'P0-001', ...base, lane: 'world', touches: ['packages/core/src/**'] },
      { id: 'P0-002', ...base, lane: 'entity', touches: ['packages/core/src/entity/**'] },
    ])
    expect(errs(cross).join()).toMatch(/overlapping touches/)
  })

  it('warns when a todo task depends on a draft', () => {
    const r = validateTasks({ tasks: phase([{ id: 'P2-001', status: 'draft' }, { id: 'P2-002', deps: ['P2-001'] }]), errors: [] })
    expect(r.errors).toEqual([])
    expect(r.warnings.join()).toMatch(/depends on draft P2-001/)
  })
})

describe('generated-file hash', () => {
  it('passes untouched output and fails a hand edit', () => {
    const doc = withHash('board', '# Board\n\nbody\n')
    expect(checkHash(doc)).toBe('ok')
    expect(checkHash(doc.replace('body', 'edited'))).toMatch(/mismatch/)
    expect(checkHash('# Board\n')).toMatch(/missing/)
  })
})
