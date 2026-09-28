import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { claim } from '../src/claim.ts'
import type { Git } from '../src/git.ts'
import { loadFromDisk, parseTask } from '../src/load.ts'
import { addDependency, newTask, newTaskText, nextId, remoteCollisions } from '../src/new.ts'
import { validateTasks } from '../src/validate.ts'
import { gitAt, phase, task, taskText } from './helpers.ts'

describe('nextId', () => {
  it('picks one past the highest number in the phase, ignoring other phases and gaps', () => {
    expect(nextId('P0', [])).toBe('P0-001')
    expect(nextId('P0', ['P0-001', 'P0-004', 'P0-EXIT', 'P1-020'])).toBe('P0-005')
    expect(nextId('P1', ['P0-009', 'P1-009'])).toBe('P1-010')
  })

  it('refuses when the phase is full', () => {
    expect(() => nextId('P2', ['P2-999'])).toThrow(/no ids left/)
  })
})

describe('addDependency', () => {
  it('appends to empty and non-empty lists, once', () => {
    expect(addDependency('---\ndepends_on: []\n---\n', 'P0-003')).toBe('---\ndepends_on: [P0-003]\n---\n')
    const two = addDependency('---\ndepends_on: [P0-001, P0-002]\nsize: S\n---\n', 'P0-003')
    expect(two).toBe('---\ndepends_on: [P0-001, P0-002, P0-003]\nsize: S\n---\n')
    expect(addDependency(two, 'P0-003')).toBe(two)
  })
})

describe('newTaskText', () => {
  it('writes a file that parses and validates as part of its phase', () => {
    const text = newTaskText({
      id: 'P0-003', title: 'A "quoted": title', lane: 'core', system: 'core', size: 'S',
      dependsOn: ['P0-001'], touches: ['packages/core/src/x/**'], discoveredBy: 'P0-002',
    })
    const t = parseTask('tasks/P0/P0-003.md', text)
    if ('message' in t) throw new Error(t.message)
    expect(t).toMatchObject({ title: 'A "quoted": title', status: 'todo', discovered_by: 'P0-002', depends_on: ['P0-001'] })
    const others = phase([{ id: 'P0-001' }, { id: 'P0-002' }]).filter((x) => x.id !== 'P0-EXIT')
    const exit = task({ id: 'P0-EXIT', deps: ['P0-001', 'P0-002', 'P0-003'], touches: ['docs/FEEDBACK.md'] })
    expect(validateTasks({ tasks: [...others, t, exit], errors: [] }).errors).toEqual([])
  })
})

let dir = ''
let clock = Math.floor(Date.now() / 1000) - 3600
const date = (): string => `${clock} +0000`
const logs: string[] = []
const log = (s: string): void => void logs.push(s)

function cloneAs(name: string): { root: string; git: Git } {
  const root = join(dir, name)
  gitAt(dir, date)(['clone', '--quiet', join(dir, 'origin.git'), root])
  const git = gitAt(root, date)
  git(['checkout', '--quiet', '-b', `claude/${name}`])
  return { root, git }
}

const file = (root: string, title: string, remote = true): number =>
  newTask({ root, git: gitAt(root, date), phase: 'P0', lane: 'tools', title, dependsOn: [], touches: ['tools/x/**'], remote, log })

const commitAndPush = (git: Git, branch: string): void => {
  clock += 10
  git(['add', 'tasks'])
  git(['commit', '--quiet', '-m', 'file a task'])
  git(['push', '--quiet', '-u', 'origin', branch])
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tasks-new-'))
  const seed = join(dir, 'seed')
  mkdirSync(join(seed, 'tasks/P0'), { recursive: true })
  const g = gitAt(seed, date)
  g(['init', '--quiet', '-b', 'main'])
  for (const t of phase([{ id: 'P0-001', lane: 'core' }, { id: 'P0-002', lane: 'world' }])) {
    writeFileSync(join(seed, t.path), taskText({ id: t.id, deps: t.depends_on, lane: t.lane, touches: t.touches }))
  }
  g(['add', '.'])
  g(['commit', '--quiet', '-m', 'seed'])
  gitAt(dir, date)(['init', '--quiet', '--bare', '-b', 'main', 'origin.git'])
  g(['remote', 'add', 'origin', join(dir, 'origin.git')])
  g(['push', '--quiet', 'origin', 'main'])
})

describe('tasks:new (git integration)', () => {
  it('gives two concurrent branches different ids once the first has pushed', () => {
    const a = cloneAs('a')
    const b = cloneAs('b')
    clock += 10
    expect(claim({ root: a.root, git: a.git, id: 'P0-001', push: true, remote: true, nowSec: clock, log })).toBe(0)

    expect(file(a.root, 'Found by a')).toBe(0)
    const fa = parseTask('tasks/P0/P0-003.md', readFileSync(join(a.root, 'tasks/P0/P0-003.md'), 'utf8'))
    expect(fa).toMatchObject({ id: 'P0-003', discovered_by: 'P0-001', system: 'tools', lane: 'tools' })
    expect(readFileSync(join(a.root, 'tasks/P0/P0-EXIT.md'), 'utf8')).toContain('depends_on: [P0-001, P0-002, P0-003]')
    expect(validateTasks(loadFromDisk(a.root)).errors).toEqual([])
    commitAndPush(a.git, 'claude/a')

    // b's working tree has never seen P0-003, but a's pushed branch has it.
    expect(file(b.root, 'Found by b')).toBe(0)
    expect(logs.at(-2)).toMatch(/wrote tasks\/P0\/P0-004\.md and added it to P0-EXIT/)
    expect(validateTasks(loadFromDisk(b.root)).errors).toEqual([])
    commitAndPush(b.git, 'claude/b')
    expect(remoteCollisions(b.git, 'origin/main')).toEqual([])
  })

  it('--local only checks the working tree, and validate --remote catches the collision', () => {
    const c = cloneAs('c')
    expect(file(c.root, 'Found by c', false)).toBe(0)
    expect(logs).toContainEqual(expect.stringMatching(/^warning: --local/))
    expect(logs.at(-2)).toMatch(/P0-003\.md/)
    commitAndPush(c.git, 'claude/c')
    c.git(['fetch', '--quiet', 'origin'])
    const found = remoteCollisions(c.git, 'origin/main')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(/id P0-003 collides: origin\/claude\/a \("Found by a"\) vs origin\/claude\/c \("Found by c"\)/)
  })

  it('does not flag a branch whose task already merged under the same title', () => {
    const m = cloneAs('m')
    m.git(['fetch', '--quiet', 'origin'])
    m.git(['checkout', '--quiet', 'main'])
    // Squash-merge a's branch into main: main gains P0-003 with a's title.
    m.git(['merge', '--quiet', '--squash', 'origin/claude/a'])
    clock += 10
    m.git(['commit', '--quiet', '-m', 'squash a'])
    m.git(['push', '--quiet', 'origin', 'main'])
    m.git(['push', '--quiet', 'origin', '--delete', 'claude/c'])
    m.git(['fetch', '--quiet', '--prune', 'origin'])
    expect(remoteCollisions(m.git, 'origin/main')).toEqual([])
  })
})
