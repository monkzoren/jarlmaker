// World-grid knobs, read by `core/src/world` (P1-001) through the Game context.

export const world = {
  // Terrain chunk edge in cells (CLAUDE.md 3.5.1): the unit of generation,
  // caching and pre-rendered chunk textures.
  chunkSize: 32,
  // Subscription sector edge in cells (CLAUDE.md 3.6): the AOI is a 3x3
  // window of sectors. One sector per chunk keeps the two grids aligned.
  sectorSize: 32,
}
