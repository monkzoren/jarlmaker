// structures — shapes (CLAUDE.md 3.5.3). This first cut places a structure
// as a prop on one cell for a cost. Levels, behaviors and panels (the full
// framework) arrive in Phase 3.

import { z } from 'zod'
import { registerContent } from '../game.ts'

export const structureDef = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The prop placed on the cell (`props`): its sprite and whether it blocks. */
  prop: z.string().min(1),
  /** Items consumed to build it. */
  cost: z.record(z.string().min(1), z.int().positive()),
})
registerContent('structures', structureDef)

export type StructureDef = z.output<typeof structureDef>

declare module '../game.ts' {
  interface ContentRegistry {
    structures: StructureDef
  }
}
