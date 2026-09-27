import { z } from 'zod'

/** Phases and their titles (CLAUDE.md Section 5). */
export const PHASES = {
  P0: 'Skeleton',
  P1: 'World and movement',
  P2: 'Survival, items, crafting',
  P3: 'Structures framework',
  P4: 'Combat and bestiary',
  P5: 'Quests and progression',
  P6: 'Persistent multiplayer polish',
  P7: 'Content scale and tools',
} as const
export type Phase = keyof typeof PHASES
export const PHASE_IDS = Object.keys(PHASES) as Phase[]

/** Concurrency lanes (CLAUDE.md 4.4, ADR 0003). Adding one needs a decision record. */
export const LANES = [
  'core', 'world', 'entity', 'structures', 'combat', 'items', 'quests', 'survival',
  'economy', 'liveops', 'cosmetics', 'commerce', 'client-net', 'client-input',
  'client-render', 'client-ui', 'server', 'content', 'art', 'tools', 'repo',
] as const
export type Lane = (typeof LANES)[number]

/** Stored statuses. `ready` and `review` are derived, never stored (ADR 0003). */
export const STATUSES = ['draft', 'todo', 'in_progress', 'done', 'blocked'] as const
export type Status = (typeof STATUSES)[number]

export const SIZES = ['S', 'M', 'L'] as const

export const TASK_ID = /^P[0-7]-(\d{3}|EXIT)$/

const str = z.union([z.string(), z.number()]).transform(String)

export const Frontmatter = z
  .object({
    id: z.string().regex(TASK_ID, 'id must look like P3-014 or P3-EXIT'),
    title: z.string().min(1),
    phase: z.enum(PHASE_IDS as [Phase, ...Phase[]]),
    system: z.string().min(1),
    lane: z.enum(LANES),
    depends_on: z.array(z.string()).default([]),
    size: z.enum(SIZES, { message: 'size must be S, M or L (XL is forbidden; split it)' }),
    status: z.enum(STATUSES, { message: `status must be one of ${STATUSES.join(', ')} (ready/review are derived)` }),
    owner: str.default(''),
    pr: str.default(''),
    discovered_by: str.default(''),
    touches: z.array(z.string()).default([]),
    blocked: str.default(''),
  })
  .strict()
export type Frontmatter = z.infer<typeof Frontmatter>

export interface Task extends Frontmatter {
  /** Repo-relative path, e.g. `tasks/P0/P0-001.md`. */
  path: string
  body: string
  dod: { done: boolean; text: string }[]
}

export const isExit = (t: { id: string }): boolean => t.id.endsWith('-EXIT')
