// world — shapes and knobs (CLAUDE.md 3.5.1). Registers the `world` tuning
// section and the `biomes`, `props` and `landmarks` content sections; their
// values live in `packages/content/tuning/world.ts` and
// `packages/content/{biomes,props,landmarks}/`.

import { z } from 'zod'
import { registerContent, registerTuning } from '../game.ts'

export const worldTuning = z
  .object({
    /** Terrain chunk edge, cells. */
    chunkSize: z.int().positive(),
    /** Subscription sector edge, cells (3.6). */
    sectorSize: z.int().positive(),
    /** The one shared world's seed. Changing it re-rolls every chunk (needs a decision record). */
    seed: z.int(),
    /** Cells inland per unit of elevation: the width of the coastal slope. */
    coastCellsPerLevel: z.number().positive(),
    /** How far the coastline wanders east-west, cells. */
    coastWiggleCells: z.number().nonnegative(),
    /** North-south distance between coastline bends, cells. */
    coastWiggleScale: z.number().positive(),
    /** Feature size of elevation noise, cells. */
    elevationScale: z.number().positive(),
    /** Elevation noise strength, in elevation units. */
    elevationNoise: z.number().nonnegative(),
    /** Noise octaves for every field. */
    octaves: z.int().min(1),
    /** Land below this elevation is beach. */
    shoreLevel: z.number().positive(),
    /** The origin's elevation: the spawn point always lies on the beach. */
    originLevel: z.number(),
    /** Above this elevation the land turns to upland (fell). */
    uplandLevel: z.number(),
    /** Feature size of the moisture field, cells. */
    moistureScale: z.number().positive(),
    /** Feature size of inland lakes, cells. */
    lakeScale: z.number().positive(),
    /** Lake noise above this is water. 1 disables lakes. */
    lakeLevel: z.number().min(0).max(1),
    /** No blocking prop grows within this many cells of the origin. */
    spawnClearCells: z.number().nonnegative(),
    /** How far from a cell's centre a player may hit or build on it, cells. */
    reachCells: z.number().positive(),
    /** Ticks between two hits by one player. */
    hitCooldownTicks: z.int().nonnegative(),
  })
  .refine((t) => t.originLevel >= 0 && t.originLevel < t.shoreLevel, {
    message: 'originLevel must lie on the beach, in [0, shoreLevel)',
  })
registerTuning('world', worldTuning)

/** Where a biome sits in the field stack. */
export const BIOME_ROLES = ['water', 'shore', 'lowland', 'upland'] as const
export type BiomeRole = (typeof BIOME_ROLES)[number]

export const chanceDef = z.object({
  /** Id of a prop (`props`) or a decal (an art id). */
  id: z.string().min(1),
  /** Share of this biome's cells that get it, in [0, 1]. */
  chance: z.number().min(0).max(1),
})

export const biomeDef = z
  .object({
    id: z.string().min(1),
    /** Player-facing name, for the region toast. */
    name: z.string().min(1),
    role: z.enum(BIOME_ROLES),
    /** Lowland biomes: the moisture band [min, max) they own. */
    moisture: z.tuple([z.number().min(0), z.number().max(1)]).optional(),
    walkable: z.boolean(),
    /** Art id of the ground tile set. */
    tile: z.string().min(1),
    /** Drawing order at biome borders: the higher biome's edge overlaps the lower. */
    layer: z.int().nonnegative(),
    /** Props that grow here, rolled per cell (shares add up to at most 1). */
    flora: z.array(chanceDef),
    /** Flat ground details drawn into the tile, rolled per cell. */
    decals: z.array(chanceDef),
  })
  .refine((b) => (b.role === 'lowland') === (b.moisture !== undefined), {
    message: 'lowland biomes need a moisture band; other roles must not have one',
  })
  .refine((b) => b.flora.reduce((s, f) => s + f.chance, 0) <= 1, { message: 'flora chances add up to more than 1' })
  .refine((b) => b.decals.reduce((s, f) => s + f.chance, 0) <= 1, { message: 'decal chances add up to more than 1' })
registerContent('biomes', biomeDef)

export const propDef = z.object({
  id: z.string().min(1),
  /** Art id of its sprite. */
  sprite: z.string().min(1),
  /** Blocks movement on every cell it covers. */
  blocks: z.boolean(),
  /** Cells covered, [w, h], from its anchor cell towards +x and +y. Flora props are 1×1. */
  footprint: z.tuple([z.int().positive(), z.int().positive()]),
  /** Gives off light and heat (a campfire): lit radius in cells, warmth per second within it. Placed props only. */
  light: z
    .object({
      radius: z.number().positive(),
      warmthPerSec: z.number().min(0),
    })
    .optional(),
  /** Harvestable: each hit yields one `item`; after `hits` hits the prop becomes `leaves` ('' = nothing). 1x1 props only. */
  harvest: z
    .object({
      item: z.string().min(1),
      hits: z.int().positive(),
      leaves: z.string(),
    })
    .optional(),
})
registerContent('props', propDef)

/** A hand-placed prop at a fixed cell (the wreck on the spawn beach). */
export const landmarkDef = z.object({
  id: z.string().min(1),
  prop: z.string().min(1),
  /** Anchor cell: the footprint's top-left. */
  cx: z.int(),
  cy: z.int(),
})
registerContent('landmarks', landmarkDef)

export type WorldTuning = z.output<typeof worldTuning>
export type BiomeDef = z.output<typeof biomeDef>
export type PropDef = z.output<typeof propDef>
export type LandmarkDef = z.output<typeof landmarkDef>

declare module '../game.ts' {
  interface TuningRegistry {
    world: WorldTuning
  }
  interface ContentRegistry {
    biomes: BiomeDef
    props: PropDef
    landmarks: LandmarkDef
  }
}
