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
| `reachCells`, `hitCooldownTicks` | How far from a cell's centre you can hit or build on it, and the ticks between two hits. |

Content sections:

| Section | Fields | Notes |
|---|---|---|
| `biomes` | `id, name, role, moisture, walkable, tile, layer, flora, decals` | `role` is `water`, `shore`, `lowland` or `upland`; exactly the lowlands carry a `moisture` band. `layer` orders overlaps at borders. |
| flora / decal entry | `id, chance` | One roll per cell; the chances in a list add up to at most 1. |
| `props` | `id, sprite, blocks, footprint, harvest, light` | Flora props are 1×1. `harvest` (`item, hits, leaves`): each hit yields one `item`; after `hits` hits the prop becomes `leaves` (`''` = nothing). `light` (`radius, warmthPerSec`): a placed prop that lights and warms its surroundings (survival). |
| `landmarks` | `id, prop, cx, cy` | A prop at a fixed cell; `(cx, cy)` is its footprint's top-left. |

Tables (the mutation overlay; base terrain is never stored):

| Table | Shape | Index | Notes |
|---|---|---|---|
| `cell_delta` | `key, cx, cy, sector, prop, hits, owner` | `by_sector (sector)` | Public. How one cell differs from the generator: the prop standing there now (`''` none), hits it has taken, who placed it. |
| `player_action` | `owner, readyTick` | — | Server-only. Each player's hit cooldown. |

## Commands

| Kind | Payload | Rules |
|---|---|---|
| `world.harvest` | `{cx, cy}` | The sender's player must be within `reachCells` of the cell's centre and off cooldown; the live cell must hold a harvestable prop not covered by a landmark. One hit: `hits + 1`, or on the last hit the prop becomes `leaves`. Emits `world.harvested` (items adds one `item`). Refusals: `not_joined`, `out_of_reach`, `cooldown`, `nothing_to_harvest`. |

Reactions: `structure.built` places the structure's prop as a delta owned by the builder.

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
5. The live world, `liveWorld(terrain, lookup)`, applies `cell_delta` rows on
   top: the server looks them up in the store (`storeDeltas`), the client in
   its mirrored rows. Movement collides with the live world on both, so a
   felled pine opens a path and a campfire blocks one everywhere at once.
6. `actionTarget` picks the cell a player acts on: the nearest wanted cell in
   reach, preferring cells in front. The client aims with it; the server
   re-checks reach and the cell itself.

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
