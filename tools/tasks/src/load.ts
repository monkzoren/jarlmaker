import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { Frontmatter, type Task } from './schema.ts'

export interface LoadError {
  path: string
  message: string
}

export interface Loaded {
  tasks: Task[]
  errors: LoadError[]
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Parse one task file's text. Returns a Task or an error message. */
export function parseTask(path: string, text: string): Task | LoadError {
  const m = FM.exec(text)
  if (!m) return { path, message: 'missing YAML frontmatter (--- ... ---)' }
  let raw: unknown
  try {
    raw = parseYaml(m[1] ?? '')
  } catch (e) {
    return { path, message: `invalid YAML: ${(e as Error).message}` }
  }
  const fm = Frontmatter.safeParse(raw)
  if (!fm.success) {
    const msg = fm.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { path, message: msg }
  }
  const body = m[2] ?? ''
  return { ...fm.data, path, body, dod: parseDod(body) }
}

/** The checkbox lines under `## Definition of done`. */
export function parseDod(body: string): Task['dod'] {
  const sec = section(body, 'Definition of done')
  if (sec === undefined) return []
  const out: Task['dod'] = []
  for (const line of sec.split('\n')) {
    const m = /^\s*- \[( |x|X)\] (.+)$/.exec(line)
    if (m) out.push({ done: m[1] !== ' ', text: (m[2] ?? '').trim() })
  }
  return out
}

/** Text of a `## <name>` section, or undefined when absent. */
export function section(body: string, name: string): string | undefined {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${name}`)
  if (start < 0) return undefined
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^## /.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

/** Build a task set from (path, text) pairs, collecting parse errors. */
export function parseAll(files: { path: string; text: string }[]): Loaded {
  const tasks: Task[] = []
  const errors: LoadError[] = []
  for (const f of files) {
    const r = parseTask(f.path, f.text)
    if ('message' in r) errors.push(r)
    else tasks.push(r)
  }
  tasks.sort((a, b) => a.id.localeCompare(b.id))
  return { tasks, errors }
}

/** Read every `tasks/P*\/*.md` file under the repo root from disk. */
export function loadFromDisk(root: string): Loaded {
  const dir = join(root, 'tasks')
  const files: { path: string; text: string }[] = []
  let phases: string[] = []
  try {
    phases = readdirSync(dir).filter((d) => /^P\d$/.test(d) && statSync(join(dir, d)).isDirectory())
  } catch {
    return { tasks: [], errors: [] }
  }
  for (const p of phases) {
    for (const f of readdirSync(join(dir, p))) {
      if (!f.endsWith('.md')) continue
      const abs = join(dir, p, f)
      files.push({ path: relative(root, abs).split('\\').join('/'), text: readFileSync(abs, 'utf8') })
    }
  }
  return parseAll(files)
}

/** Rewrite frontmatter keys in place, preserving the rest of the file byte for byte. */
export function setFrontmatter(text: string, values: Record<string, string>): string {
  const m = FM.exec(text)
  if (!m) throw new Error('missing frontmatter')
  let fm = m[1] ?? ''
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}: ${JSON.stringify(v).replace(/^"(.*)"$/, (_, s: string) => (/^[\w./-]+$/.test(s) ? s : `"${s}"`))}`
    const re = new RegExp(`^${k}:.*$`, 'm')
    fm = re.test(fm) ? fm.replace(re, () => line) : `${fm}\n${line}`
  }
  return text.replace(m[1] ?? '', () => fm)
}
