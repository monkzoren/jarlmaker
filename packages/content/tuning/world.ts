// World knobs, read by `core/src/world` through the Game context
// (CLAUDE.md 3.5.1). Units are cells unless noted.

export const world = {
  // Terrain chunk edge in cells: the unit of generation, caching and
  // pre-rendered chunk textures.
  chunkSize: 32,
  // Subscription sector edge in cells (3.6): the AOI is a 3x3 window of
  // sectors. One sector per chunk keeps the two grids aligned.
  sectorSize: 32,
  // The one shared world. Changing it re-rolls every chunk, so it moves only
  // with a decision record.
  seed: 1377,
  // The coast: open sea to the west, land rising to the east. 18 cells per
  // elevation unit puts the uplands (below) about 60 cells inland, a short
  // walk that still feels like leaving the beach behind.
  coastCellsPerLevel: 18,
  // The coastline wanders up to 14 cells east-west with a bend every ~60
  // cells, so walking the beach turns up coves and headlands.
  coastWiggleCells: 22,
  coastWiggleScale: 70,
  // Hills and hollows on top of the slope: blobs about 20 cells across, strong
  // enough to cut small inlets and raise knolls near the shore.
  elevationScale: 30,
  elevationNoise: 1.1,
  octaves: 4,
  // Beach: 0 to 0.35 elevation, about 6 cells deep on a straight stretch.
  shoreLevel: 0.35,
  // The spawn point is on the beach, two-thirds of the way down to the sea,
  // so the wreck lies in the surf beside you.
  originLevel: 0.12,
  // Fell (rocky upland) starts about 60 cells inland.
  uplandLevel: 5.2,
  // Moisture blobs about 40 cells across decide meadow, pinewood or moor.
  moistureScale: 40,
  // Occasional small lakes inland, about 25 cells apart in the noise.
  lakeScale: 25,
  lakeLevel: 0.74,
  // Nothing blocks you within 6 cells of where you wash up.
  spawnClearCells: 6,
}
