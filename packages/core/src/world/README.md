# world — terrain, biomes, props

Spec: CLAUDE.md 3.5.1. This first cut is the field stack, the biomes, flora
and landmarks, and walkability. Chunks, the mutation overlay, POIs, fog,
minimap and difficulty rings come later.

## Purpose

A seed-deterministic 2D world that the server (collision), the client
(drawing and movement prediction) and the tests all compute from the same
pure functions, so base terrain never ships over the wire.

The shape follows the story (3.0): you wash up on a beach with the wreck of
your longship in the surf. Open sea lies to the west and the land climbs
east through meadow, pinewood and moor to the fells.

## Data

Tuning section `world` (`packages/content/tuning/world.ts`):

| Knobs | Meaning |
|---|---|
| `chunkSize`, `sectorSize` | Chunk and subscription-sector edge, cells. |
| `seed` | The one shared world's seed. |
| `coastCellsPerLevel`, `coastWiggleCells`, `coastWiggleScale` | Slope width, and how far and how often the coastline wanders. |
| `elevationScale`, `elevationNoise`, `octaves` | Hills and hollows on the slope. |
| `shoreLevel`, `originLevel`, `uplandLevel` | Beach band, the spawn's elevation (always on the beach), and where upland starts. |
| `moistureScale` | Size of the moisture blobs that choose a lowland biome. |
| `lakeScale`, `lakeLevel` | Inland lakes. |
| `spawnClearCells` | No blocking flora this close to the origin. |

Content sections:

| Section | Fields | Notes |
|---|---|---|
| `biomes` | `id, name, role, moisture, walkable, tile, layer, flora, decals` | `role` is `water`, `shore`, `lowland` or `upland`; exactly the lowlands carry a `moisture` band. `layer` orders overlaps at borders. |
| flora / decal entry | `id, chance` | One roll per cell; the chances in a list add up to at most 1. |
| `props` | `id, sprite, blocks, footprint` | Flora props are 1×1. |
| `landmarks` | `id, prop, cx, cy` | A prop at a fixed cell; `(cx, cy)` is its footprint's top-left. |

## Rules

`createTerrain(content)` / `terrainOf(game)` returns a `Terrain`:
`cell(cx, cy)` gives `{biome, prop, decal, walkable, variant}`, plus
`elevation(cx, cy)` and `walkable(cx, cy)` (the entity system's `WorldView`).

1. Elevation is the distance east of a wandering coastline divided by
   `coastCellsPerLevel`, plus fractal noise. It is shifted so the origin sits
   at `originLevel`, which puts the spawn on the beach for every seed.
2. Biome: water below 0 or in a lake, shore below `shoreLevel`, upland above
   `uplandLevel`, otherwise the lowland whose moisture band holds the moisture
   field.
3. Props: a landmark's anchor cell carries its prop, and every cell in its
   footprint blocks. Other cells roll the biome's `flora`, and blocking flora
   is suppressed within `spawnClearCells` of the origin. Decals roll only on
   cells with no prop.
4. `walkable` = the biome is walkable, no landmark covers the cell, and no
   blocking prop stands on it.

Noise (`noise.ts`) is integer-hash value noise, so every host computes the
same bits.

## Player surface

The terrain, trees, rocks and the wreck are drawn by the client from these
cells (`client/src/render/terrain`). The sea and every blocking prop stop
movement, on the server and in prediction alike.

## Balancing knobs

All of them live in `tuning.world`. Flora and decal density are per biome.

## Tests

`world.test.ts` covers noise range and determinism, the origin on the beach,
the sea to the west, seed purity, the spawn clearing, blocking and
non-blocking props, the landmark footprint, and refusal of bad content.
`packages/content/world.test.ts` pins the real world: a golden ASCII map
around the spawn, and every biome present.
