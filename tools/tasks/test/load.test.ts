import { describe, expect, it } from 'vitest'
import { parseTask, setFrontmatter } from '../src/load.ts'
import { pathOf, taskText } from './helpers.ts'

describe('parseTask', () => {
  it('parses a well-formed task and its DoD checkboxes', () => {
    const t = parseTask(pathOf('P0-001'), taskText({ id: 'P0-001', dod: ['- [ ] a', '- [x] b'] }))
    if ('message' in t) throw new Error(t.message)
    expect(t.id).toBe('P0-001')
    expect(t.dod).toEqual([{ done: false, text: 'a' }, { done: true, text: 'b' }])
  })

  it('rejects stored "ready" (derived only) and XL sizes', () => {
    const ready = parseTask(pathOf('P0-001'), taskText({ id: 'P0-001', status: 'ready' }))
    expect('message' in ready && ready.message).toMatch(/status/)
    const xl = parseTask(pathOf('P0-001'), taskText({ id: 'P0-001' }).replace('size: S', 'size: XL'))
    expect('message' in xl && xl.message).toMatch(/XL is forbidden/)
  })

  it('rejects unknown keys and missing frontmatter', () => {
    const extra = parseTask(pathOf('P0-001'), taskText({ id: 'P0-001' }).replace('size: S', 'size: S\npriority: 1'))
    expect('message' in extra).toBe(true)
    expect('message' in parseTask('x.md', '# nothing')).toBe(true)
  })
})

describe('setFrontmatter', () => {
  it('rewrites only the named keys and keeps the body byte for byte', () => {
    const text = taskText({ id: 'P0-001' })
    const out = setFrontmatter(text, { status: 'in_progress', owner: 'claude/some-branch' })
    expect(out).toContain('status: in_progress\n')
    expect(out).toContain('owner: claude/some-branch\n')
    expect(out.split('---').slice(2).join('---')).toBe(text.split('---').slice(2).join('---'))
    const parsed = parseTask(pathOf('P0-001'), out)
    expect('message' in parsed ? parsed.message : parsed.status).toBe('in_progress')
  })

  it('quotes values that are not plain words', () => {
    expect(setFrontmatter(taskText({ id: 'P0-001' }), { owner: 'a b: c' })).toContain('owner: "a b: c"')
    expect(setFrontmatter(taskText({ id: 'P0-001' }), { owner: '' })).toContain('owner: ""')
  })
})
