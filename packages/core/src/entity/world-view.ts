// The entity system's view of the world: the one adapter P1-006 swaps for
// real terrain (only this file changes in `entity/`). In P0 the world is flat
// and every cell is walkable.
//
// The `world` tuning section (sector size) has no owning system until the
// world contract (P1-001) lands, so it is registered here for now; P1-024
// moves the registration to `core/src/world`.

import { z } from 'zod'
import { registerTuning } from '../game.ts'

export const worldTuning = z.object({
  /** Terrain chunk edge, cells. */
  chunkSize: z.int().positive(),
  /** Subscription sector edge, cells (3.6). */
  sectorSize: z.int().positive(),
})
registerTuning('world', worldTuning)

declare module '../game.ts' {
  interface TuningRegistry {
    world: z.output<typeof worldTuning>
  }
}

/** What movement asks the world. Cell (cx, cy) spans [cx, cx + 1) on each axis. */
export interface WorldView {
  walkable(cx: number, cy: number): boolean
}

/** P0's world: flat, endless, walkable everywhere. */
export const FLAT_WORLD: WorldView = {
  walkable: () => true,
}
