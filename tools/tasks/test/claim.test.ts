import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { claim, currentView } from '../src/claim.ts'
import { next } from '../src/derive.ts'
import type { Git } from '../src/git.ts'
import { gitAt, phase, taskText } from './helpers.ts'

const NOW = Math.floor(Date.now() / 1000)

let dir = ''
const logs: string[] = []
const log = (s: string): void => void logs.push(s)
let clock = NOW - 3600
const date = (): string => `${clock} +0000`

function cloneAs(name: string): { root: string; git: Git } {
  const root = join(dir, name)
  gitAt(dir, date)(['clone', '--quiet', join(dir, 'origin.git'), root])
  const git = gitAt(root, date)
  git(['checkout', '--quiet', '-b', `claude/${name}`])
  return { root, git }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tasks-claim-'))
  const seed = join(dir, 'seed')
  mkdirSync(join(seed, 'tasks/P0'), { recursive: true })
  const g = gitAt(seed, date)
  g(['init', '--quiet', '-b', 'main'])
  for (const t of phase([{ id: 'P0-001' }, { id: 'P0-002', lane: 'world' }])) {
    writeFileSync(join(seed, t.path), taskText({ id: t.id, deps: t.depends_on, lane: t.lane, touches: t.touches }))
  }
  g(['add', '.'])
  g(['commit', '--quiet', '-m', 'seed'])
  gitAt(dir, date)(['init', '--quiet', '--bare', '-b', 'main', 'origin.git'])
  g(['remote', 'add', 'origin', join(dir, 'origin.git')])
  g(['push', '--quiet', 'origin', 'main'])
})

describe('claim (git integration)', () => {
  it('pushes a claim that other workers see, and refuses a second claim', () => {
    const a = cloneAs('a')
    const b = cloneAs('b')
    clock += 10
    expect(claim({ root: a.root, git: a.git, id: 'P0-001', push: true, remote: true, nowSec: NOW, log })).toBe(0)
    expect(readFileSync(join(a.root, 'tasks/P0/P0-001.md'), 'utf8')).toContain('owner: claude/a')

    const vb = currentView(b.git, b.root, true, NOW, log)
    expect(vb.derived.get('P0-001')).toBe('in_progress')
    expect(vb.claims.get('P0-001')?.branch).toBe('claude/a')
    expect(next(vb).task?.id).toBe('P0-002')
    expect(claim({ root: b.root, git: b.git, id: 'P0-001', push: true, remote: true, nowSec: NOW, log })).toBe(1)
    expect(logs.at(-1)).toMatch(/in_progress on claude\/a/)
  })

  it('detects a lost race: the earlier claim commit wins', () => {
    const c = cloneAs('c')
    const d = cloneAs('d')
    // d claims first (earlier commit) but pushes second; c pushed without seeing it.
    clock += 10
    expect(claim({ root: d.root, git: d.git, id: 'P0-002', push: false, remote: false, nowSec: NOW, log })).toBe(0)
    clock += 10
    expect(claim({ root: c.root, git: c.git, id: 'P0-002', push: true, remote: false, nowSec: NOW, log })).toBe(0)
    d.git(['push', '--quiet', '-u', 'origin', 'claude/d'])
    const v = currentView(c.git, c.root, true, NOW, log)
    expect(v.claims.get('P0-002')?.branch).toBe('claude/d')
    expect(v.ignored.map((i) => i.claim.branch)).toContain('claude/c')
  })

  it('reports review once the branch marks the task done', () => {
    const a = gitAt(join(dir, 'a'), date)
    const file = join(dir, 'a', 'tasks/P0/P0-001.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('status: in_progress', 'status: done').replace('- [ ]', '- [x]'))
    clock += 10
    a(['commit', '--quiet', '-am', 'done'])
    a(['push', '--quiet'])
    const v = currentView(gitAt(join(dir, 'b'), date), join(dir, 'b'), true, NOW, log)
    expect(v.derived.get('P0-001')).toBe('review')
  })
})
