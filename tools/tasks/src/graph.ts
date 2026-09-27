import type { Task } from './schema.ts'

export type ById = Map<string, Task>

export const byId = (tasks: Task[]): ById => new Map(tasks.map((t) => [t.id, t]))

/** Reverse edges: id → ids that depend on it. */
export function dependents(tasks: Task[]): Map<string, string[]> {
  const out = new Map<string, string[]>(tasks.map((t) => [t.id, []]))
  for (const t of tasks) for (const d of t.depends_on) out.get(d)?.push(t.id)
  for (const v of out.values()) v.sort()
  return out
}

/** Every dependency cycle, each as a list of ids (first id repeated at the end). */
export function findCycles(tasks: Task[]): string[][] {
  const ids = byId(tasks)
  const state = new Map<string, 'open' | 'closed'>()
  const stack: string[] = []
  const cycles: string[][] = []
  const visit = (id: string): void => {
    state.set(id, 'open')
    stack.push(id)
    for (const d of ids.get(id)?.depends_on ?? []) {
      if (!ids.has(d)) continue
      const s = state.get(d)
      if (s === 'open') cycles.push([...stack.slice(stack.indexOf(d)), d])
      else if (s === undefined) visit(d)
    }
    stack.pop()
    state.set(id, 'closed')
  }
  for (const t of tasks) if (!state.has(t.id)) visit(t.id)
  return cycles
}

/**
 * Critical-path length of each task: the number of tasks on the longest chain
 * that starts at it and follows dependents. Tasks for which `include` is false
 * count as zero-length (e.g. done tasks). Assumes an acyclic graph.
 */
export function criticalPath(tasks: Task[], include: (t: Task) => boolean = () => true): Map<string, number> {
  const deps = dependents(tasks)
  const ids = byId(tasks)
  const memo = new Map<string, number>()
  const len = (id: string): number => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    const t = ids.get(id)
    if (!t || !include(t)) {
      memo.set(id, 0)
      return 0
    }
    memo.set(id, 1) // guard against cycles; validate reports them separately
    let best = 0
    for (const n of deps.get(id) ?? []) best = Math.max(best, len(n))
    memo.set(id, best + 1)
    return best + 1
  }
  for (const t of tasks) len(t.id)
  return memo
}

/** The longest chain of included tasks, as ids in dependency order. */
export function longestChain(tasks: Task[], include: (t: Task) => boolean): string[] {
  const cp = criticalPath(tasks, include)
  const deps = dependents(tasks)
  const ids = byId(tasks)
  // Start: an included task with no included dependency, maximal cp, smallest id.
  const roots = tasks
    .filter((t) => include(t) && !t.depends_on.some((d) => { const x = ids.get(d); return x !== undefined && include(x) }))
    .sort((a, b) => (cp.get(b.id) ?? 0) - (cp.get(a.id) ?? 0) || a.id.localeCompare(b.id))
  const chain: string[] = []
  let cur = roots[0]?.id
  while (cur !== undefined) {
    chain.push(cur)
    const next = (deps.get(cur) ?? [])
      .filter((n) => (cp.get(n) ?? 0) > 0)
      .sort((a, b) => (cp.get(b) ?? 0) - (cp.get(a) ?? 0) || a.localeCompare(b))[0]
    cur = next
  }
  return chain
}
