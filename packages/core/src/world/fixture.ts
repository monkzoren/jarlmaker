// A flat test world (exported from `@bastion/core/testing`): the real field
// stack with every biome walkable and nothing growing, so movement tests see
// an empty plane while the world sections still validate.

import type { ItemDef } from '../items/schema.ts'
import type { StructureDef } from '../structures/schema.ts'
import type { BiomeDef, LandmarkDef, PropDef, WorldTuning } from './schema.ts'

export const FLAT_WORLD_TUNING: WorldTuning = {
  chunkSize: 32,
  sectorSize: 32,
  seed: 1,
  coastCellsPerLevel: 18,
  coastWiggleCells: 0,
  coastWiggleScale: 70,
  elevationScale: 30,
  elevationNoise: 0,
  octaves: 1,
  shoreLevel: 0.35,
  originLevel: 0.12,
  uplandLevel: 5,
  moistureScale: 40,
  lakeScale: 25,
  lakeLevel: 1,
  spawnClearCells: 0,
  reachCells: 1.8,
  hitCooldownTicks: 3,
}

const flat = (id: string, role: BiomeDef['role'], layer: number): BiomeDef => ({
  id,
  name: id,
  role,
  ...(role === 'lowland' ? { moisture: [0, 1] as [number, number] } : {}),
  walkable: true,
  tile: id,
  layer,
  flora: [],
  decals: [],
})

/** Every data section a flat, walkable-everywhere Game needs, all empty but the biomes. */
export const FLAT_WORLD_SECTIONS: {
  biomes: BiomeDef[]
  props: PropDef[]
  landmarks: LandmarkDef[]
  items: ItemDef[]
  structures: StructureDef[]
} = {
  biomes: [flat('water', 'water', 0), flat('shore', 'shore', 1), flat('land', 'lowland', 2), flat('hill', 'upland', 3)],
  props: [],
  landmarks: [],
  items: [],
  structures: [],
}
