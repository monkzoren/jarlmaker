// The entity system's view of the world: movement only asks whether a cell
// is walkable. The world system (`core/src/world`) provides the real terrain
// through `terrainOf(game)`; `FLAT_WORLD` remains for tests that want an
// empty plane.

/** What movement asks the world. Cell (cx, cy) spans [cx, cx + 1) on each axis. */
export interface WorldView {
  walkable(cx: number, cy: number): boolean
}

/** A flat, endless world, walkable everywhere (tests). */
export const FLAT_WORLD: WorldView = {
  walkable: () => true,
}
