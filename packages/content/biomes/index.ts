// Biomes (CLAUDE.md 3.5.1), validated by `core/src/world/schema.ts`. One
// entry per biome: add a biome by adding an entry (and its tile set in art/).
// Lowland moisture bands must tile [0, 1).

import type { BiomeDef } from '@bastion/core'

export const biomes: BiomeDef[] = [
  {
    id: 'sea',
    name: 'The Grey Sea',
    role: 'water',
    walkable: false,
    tile: 'sea',
    layer: 0,
    flora: [],
    decals: [],
  },
  {
    id: 'shore',
    name: 'Wreck Strand',
    role: 'shore',
    walkable: true,
    tile: 'sand',
    layer: 1,
    flora: [{ id: 'rock.small', chance: 0.02 }],
    decals: [
      { id: 'decal.driftwood', chance: 0.03 },
      { id: 'decal.shells', chance: 0.05 },
      { id: 'decal.pebbles', chance: 0.06 },
    ],
  },
  {
    id: 'moor',
    name: 'Heather Moor',
    role: 'lowland',
    moisture: [0, 0.42],
    walkable: true,
    tile: 'heath',
    layer: 2,
    flora: [
      { id: 'rock.small', chance: 0.02 },
      { id: 'bush.juniper', chance: 0.04 },
    ],
    decals: [
      { id: 'decal.heather', chance: 0.18 },
      { id: 'decal.pebbles', chance: 0.03 },
    ],
  },
  {
    id: 'meadow',
    name: 'Green Meadow',
    role: 'lowland',
    moisture: [0.42, 0.55],
    walkable: true,
    tile: 'grass',
    layer: 3,
    flora: [
      { id: 'pine', chance: 0.02 },
      { id: 'bush.juniper', chance: 0.02 },
      { id: 'rock.small', chance: 0.01 },
    ],
    decals: [
      { id: 'decal.flowers', chance: 0.08 },
      { id: 'decal.tuft', chance: 0.14 },
    ],
  },
  {
    id: 'pinewood',
    name: 'Pinewood',
    role: 'lowland',
    moisture: [0.55, 1],
    walkable: true,
    tile: 'forest',
    layer: 4,
    flora: [
      { id: 'pine', chance: 0.26 },
      { id: 'rock.small', chance: 0.01 },
    ],
    decals: [
      { id: 'decal.needles', chance: 0.16 },
      { id: 'decal.mushroom', chance: 0.03 },
    ],
  },
  {
    id: 'fell',
    name: 'The Fells',
    role: 'upland',
    walkable: true,
    tile: 'stone',
    layer: 5,
    flora: [
      { id: 'boulder', chance: 0.07 },
      { id: 'rock.small', chance: 0.05 },
      { id: 'pine', chance: 0.02 },
    ],
    decals: [
      { id: 'decal.lichen', chance: 0.12 },
      { id: 'decal.pebbles', chance: 0.08 },
    ],
  },
]
