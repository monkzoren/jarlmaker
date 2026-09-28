import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { baseRef, loadAtRef, remoteBranches, tryGit, type Git } from './git.ts'
import { loadFromDisk } from './load.ts'
import { LANES, PHASE_IDS, SIZES, type Lane, type Phase } from './schema.ts'

const ID_IN_PATH = /^tasks\/(P\d)\/(P\d-\d{3})\.md$/

/** Task ids named by the task file paths at a git ref. Paths, not parsing, so a broken file still reserves its id. */
export function idsAtRef(git: Git, ref: string): string[] {
  const list = tryGit(git, ['ls-tree', '-r', '--name-only', ref, '--', 'tasks/']) ?? ''
  return list.split('\n').flatMap((p) => {
    const m = ID_IN_PATH.exec(p)
    return m?.[2] ? [m[2]] : []
  })
}

/** The next free id in a phase: one past the highest number in use anywhere. Gaps are never reused. */
export function nextId(phase: Phase, used: Iterable<string>): string {
  let max = 0
  for (const id of used) {
    const m = /^(P\d)-(\d{3})$/.exec(id)
    if (m?.[1] === phase) max = Math.max(max, Number(m[2]))
  }
  if (max >= 999) throw new Error(`phase ${phase} has no ids left`)
  return `${phase}-${String(max + 1).padStart(3, '0')}`
}

export interface NewSpec {
  id: string
  title: string
  lane: Lane
  system: string
  size: (typeof SIZES)[number]
  dependsOn: string[]
  touches: string[]
  discoveredBy: string
}

/** A task file in the Section 4.2 format with placeholder sections for the author to fill in. */
export function newTaskText(s: NewSpec): string {
  return [
    '---',
    `id: ${s.id}`,
    `title: ${JSON.stringify(s.title)}`,
    `phase: ${s.id.slice(0, 2)}`,
    `system: ${s.system}`,
    `lane: ${s.lane}`,
    `depends_on: [${s.dependsOn.join(', ')}]`,
    `size: ${s.size}`,
    'status: todo',
    'owner: ""',
    'pr: ""',
    `discovered_by: ${JSON.stringify(s.discoveredBy)}`,
    `touches: [${s.touches.map((t) => JSON.stringify(t)).join(', ')}]`,
    'blocked: ""',
    '---',
    '',
    '## Goal',
    'TODO: what exists when this is done, in player or system terms.',
    '',
    '## Definition of done',
    '- [ ] TODO: one line a reviewer can check from the diff or a command',
    '- [ ] `pnpm build lint test tasks:validate` green',
    '',
    '## Notes',
    s.discoveredBy ? `Discovered while working on ${s.discoveredBy}.` : 'TODO: pointers into CLAUDE.md, decision records, or prior tasks.',
    '',
  ].join('\n')
}

/** Append an id to a frontmatter `depends_on: [...]` flow list, preserving the rest of the file. */
export function addDependency(text: string, id: string): string {
  const re = /^depends_on:\s*\[(.*)\]\s*$/m
  const m = re.exec(text)
  if (!m) throw new Error('no single-line `depends_on: [...]` in frontmatter')
  const deps = (m[1] ?? '').split(',').map((d) => d.trim()).filter(Boolean)
  if (deps.includes(id)) return text
  return text.replace(re, () => `depends_on: [${[...deps, id].join(', ')}]`)
}

export interface NewOptions {
  root: string
  git: Git
  phase: string
  lane: string
  title: string
  system?: string
  size?: string
  dependsOn: string[]
  touches: string[]
  discoveredBy?: string
  remote: boolean
  log: (s: string) => void
}

/**
 * The task claimed on the current branch: the one `in_progress` task in the
 * working tree whose `main` copy is not already `in_progress`.
 */
export function claimedHere(git: Git, root: string, base: string | undefined): string {
  const onMain = base ? new Map(loadAtRef(git, base).tasks.map((t) => [t.id, t.status])) : new Map<string, string>()
  const mine = loadFromDisk(root).tasks.filter((t) => t.status === 'in_progress' && onMain.get(t.id) !== 'in_progress')
  const branch = tryGit(git, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const owned = mine.filter((t) => t.owner === branch)
  const pick = owned.length === 1 ? owned : mine
  return pick.length === 1 ? (pick[0]?.id ?? '') : ''
}

/** `pnpm tasks:new` (P0-028). Returns a process exit code. */
export function newTask(o: NewOptions): number {
  const fail = (m: string): number => (o.log(`error: ${m}`), 1)
  if (!PHASE_IDS.includes(o.phase as Phase)) return fail(`--phase must be one of ${PHASE_IDS.join(', ')}`)
  if (!LANES.includes(o.lane as Lane)) return fail(`--lane must be one of ${LANES.join(', ')}`)
  if (!o.title.trim()) return fail('--title is required')
  if (o.touches.length === 0) return fail('--touches is required (comma-separated globs); a todo task needs them')
  const size = o.size ?? 'S'
  if (!(SIZES as readonly string[]).includes(size)) return fail(`--size must be one of ${SIZES.join(', ')}`)
  const phase = o.phase as Phase
  const exitPath = join(o.root, 'tasks', phase, `${phase}-EXIT.md`)
  if (!existsSync(exitPath)) return fail(`tasks/${phase}/${phase}-EXIT.md does not exist`)

  const used = new Set(loadFromDisk(o.root).tasks.map((t) => t.id))
  let base: string | undefined
  if (o.remote) {
    if (tryGit(o.git, ['fetch', '--quiet', '--prune', 'origin']) === undefined) {
      return fail('`git fetch origin` failed; rerun with --local to allocate from the working tree only')
    }
    base = baseRef(o.git)
    for (const ref of [...(base ? [base] : []), ...remoteBranches(o.git, base)]) {
      for (const id of idsAtRef(o.git, ref)) used.add(id)
    }
  } else {
    o.log('warning: --local: ids are only checked against the working tree; another branch may already use this one')
  }
  for (const d of o.dependsOn) if (!used.has(d) && !d.endsWith('-EXIT')) o.log(`warning: --depends-on ${d} is not a known task`)

  const id = nextId(phase, used)
  const rel = `tasks/${phase}/${id}.md`
  const discoveredBy = o.discoveredBy ?? claimedHere(o.git, o.root, base)
  const text = newTaskText({
    id, title: o.title.trim(), lane: o.lane as Lane, system: o.system ?? o.lane,
    size: size as NewSpec['size'], dependsOn: o.dependsOn, touches: o.touches, discoveredBy,
  })
  mkdirSync(dirname(join(o.root, rel)), { recursive: true })
  writeFileSync(join(o.root, rel), text)
  writeFileSync(exitPath, addDependency(readFileSync(exitPath, 'utf8'), id))
  o.log(`wrote ${rel}${discoveredBy ? ` (discovered_by ${discoveredBy})` : ''} and added it to ${phase}-EXIT`)
  o.log(`fill in its Goal and Definition of done, then commit and push both files right away so no other branch takes ${id}`)
  return 0
}

/**
 * Ids filed independently on two refs (`tasks:validate --remote`): a task file a
 * branch added since its merge-base with `base`, whose id `base` or another
 * branch also has under a different title. Same title = the same task (e.g. a
 * squash-merged branch), not a collision.
 */
export function remoteCollisions(git: Git, base: string | undefined): string[] {
  if (!base) return []
  const titleOf = (ref: string, path: string): string | undefined => {
    const text = tryGit(git, ['show', `${ref}:${path}`])
    return text === undefined ? undefined : /^title:\s*(.*)$/m.exec(text)?.[1]?.trim()
  }
  const added = new Map<string, { ref: string; title: string | undefined }[]>()
  for (const ref of remoteBranches(git, base)) {
    const out = tryGit(git, ['diff', '--name-only', '--diff-filter=A', `${base}...${ref}`, '--', 'tasks/']) ?? ''
    for (const path of out.split('\n')) {
      if (!ID_IN_PATH.test(path)) continue
      const list = added.get(path) ?? []
      list.push({ ref, title: titleOf(ref, path) })
      added.set(path, list)
    }
  }
  const out: string[] = []
  for (const [path, list] of added) {
    const id = ID_IN_PATH.exec(path)?.[2] ?? path
    const onBase = titleOf(base, path)
    const refs = [...(onBase === undefined ? [] : [{ ref: base, title: onBase }]), ...list]
    if (new Set(refs.map((r) => r.title)).size > 1) {
      out.push(`id ${id} collides: ${refs.map((r) => `${r.ref} (${r.title})`).join(' vs ')}; renumber the unmerged one with pnpm tasks:new`)
    }
  }
  return out.sort()
}
