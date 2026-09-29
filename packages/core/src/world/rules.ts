// world rules (CLAUDE.md 3.5.1): the field stack, pure in (seed, cx, cy).
//
//   elevation = distance inland from a wandering coastline (sea to the west)
//               + fractal noise, shifted so the origin sits on the beach
//   biome     = water below 0 or in a lake, shore below `shoreLevel`, upland
//               above `uplandLevel`, otherwise the lowland whose moisture
//               band holds the moisture field
//   props     = landmarks at their fixed cells, else one roll per cell against
//               the biome's flora (no blocking prop near the spawn)
//   decals    = one roll per cell against the biome's decals (flat details)
//
// The server (collision), the client (drawing and prediction) and the tests
// all call these, so terrain never ships over the wire (only mutations will).

import type { Content, Game } from '../game.ts'
import type { Store } from '../store/types.ts'
import './tables.ts'
import type { WorldView } from '../entity/world-view.ts'
import { cellMemo } from './cache.ts'
import { fbm, SALT, unit, hash3 } from './noise.ts'
import './schema.ts'
import type { BiomeDef, BiomeRole, PropDef } from './schema.ts'

/** Everything the world says about one cell. */
export interface Cell {
  readonly biome: BiomeDef
  /** The prop anchored on this cell (drawn from here), if any. */
  readonly prop: PropDef | undefined
  /** A flat ground detail's art id, if any. */
  readonly decal: string | undefined
  readonly walkable: boolean
  /** A stable hash for picking tile variants. */
  readonly variant: number
  /** Covered by a landmark's footprint (never mutated). */
  readonly covered: boolean
}

export interface Terrain extends WorldView {
  cell(cx: number, cy: number): Cell
  /** The raw elevation field (0 = waterline). */
  elevation(cx: number, cy: number): number
  /** A prop def by id. */
  prop(id: string): PropDef | undefined
}

type WorldContent = Pick<Content, 'biomes' | 'props' | 'landmarks'> & { readonly tuning: Pick<Content['tuning'], 'world'> }

/** Noise in [0, 1) mapped to [-1, 1). */
function centered(v: number): number {
  return v + v - 1
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`
}

/** Build the terrain for `content`. Throws on dangling references or a missing biome role. */
export function createTerrain(content: WorldContent): Terrain {
  const t = content.tuning.world
  const props = new Map(content.props.map((p) => [p.id, p]))
  const byRole = (role: BiomeRole): BiomeDef[] => content.biomes.filter((b) => b.role === role)
  const one = (role: BiomeRole): BiomeDef => {
    const [b] = byRole(role)
    if (b === undefined) throw new Error(`world: no biome with role "${role}"`)
    return b
  }
  const water = one('water')
  const shore = one('shore')
  const upland = one('upland')
  const lowlands = byRole('lowland')
  const fallbackLowland = lowlands[lowlands.length - 1]
  if (fallbackLowland === undefined) throw new Error('world: no biome with role "lowland"')
  for (const b of content.biomes) {
    for (const f of b.flora) {
      const p = props.get(f.id)
      if (p === undefined) throw new Error(`world: biome "${b.id}" grows unknown prop "${f.id}"`)
      if (p.footprint[0] !== 1 || p.footprint[1] !== 1) throw new Error(`world: flora prop "${p.id}" must be 1x1`)
    }
  }

  /** Landmark cells: the anchor carries the prop; every covered cell is blocked if it blocks. */
  const anchors = new Map<string, PropDef>()
  const covered = new Set<string>()
  for (const l of content.landmarks) {
    const p = props.get(l.prop)
    if (p === undefined) throw new Error(`world: landmark "${l.id}" places unknown prop "${l.prop}"`)
    anchors.set(cellKey(l.cx, l.cy), p)
    if (!p.blocks) continue
    for (let dy = 0; dy < p.footprint[1]; dy++)
      for (let dx = 0; dx < p.footprint[0]; dx++) covered.add(cellKey(l.cx + dx, l.cy + dy))
  }

  const rawElevation = (cx: number, cy: number): number => {
    const wiggle = centered(fbm(t.seed + SALT.coast, cy / t.coastWiggleScale, 0, t.octaves)) * t.coastWiggleCells
    const noise = centered(fbm(t.seed + SALT.elevation, cx / t.elevationScale, cy / t.elevationScale, t.octaves))
    return (cx - wiggle) / t.coastCellsPerLevel + noise * t.elevationNoise
  }
  const originShift = t.originLevel - rawElevation(0, 0)
  const elevation = (cx: number, cy: number): number => rawElevation(cx, cy) + originShift

  const biomeAt = (cx: number, cy: number): BiomeDef => {
    const e = elevation(cx, cy)
    if (e < 0) return water
    if (e < t.shoreLevel) return shore
    if (fbm(t.seed + SALT.lake, cx / t.lakeScale, cy / t.lakeScale, t.octaves) > t.lakeLevel) return water
    if (e > t.uplandLevel) return upland
    const m = fbm(t.seed + SALT.moisture, cx / t.moistureScale, cy / t.moistureScale, t.octaves)
    return lowlands.find((b) => b.moisture !== undefined && m >= b.moisture[0] && m < b.moisture[1]) ?? fallbackLowland
  }

  const roll = <T extends { readonly chance: number }>(list: readonly T[], r: number): T | undefined => {
    let acc = 0
    for (const item of list) {
      acc += item.chance
      if (r < acc) return item
    }
    return undefined
  }

  const cell = (cx: number, cy: number): Cell => {
    const biome = biomeAt(cx, cy)
    const key = cellKey(cx, cy)
    const landmark = anchors.get(key)
    let prop = landmark
    if (prop === undefined && !covered.has(key)) {
      const pick = roll(biome.flora, unit(t.seed + SALT.flora, cx, cy))
      const p = pick === undefined ? undefined : props.get(pick.id)
      const nearSpawn = cx * cx + cy * cy < t.spawnClearCells * t.spawnClearCells
      prop = p !== undefined && p.blocks && nearSpawn ? undefined : p
    }
    const decal = prop === undefined && !covered.has(key) ? roll(biome.decals, unit(t.seed + SALT.decal, cx, cy))?.id : undefined
    const walkable = biome.walkable && !covered.has(key) && !(prop?.blocks ?? false)
    return { biome, prop, decal, walkable, variant: hash3(t.seed + SALT.variant, cx, cy), covered: covered.has(key) }
  }

  return {
    cell,
    elevation,
    prop: (id) => props.get(id),
    walkable: cellMemo((cx, cy) => cell(cx, cy).walkable),
  }
}

const terrains = new WeakMap<Game, Terrain>()

/** The terrain for `game`, built once per Game. */
export function terrainOf(game: Game): Terrain {
  let terrain = terrains.get(game)
  if (terrain === undefined) {
    terrain = createTerrain(game.content)
    terrains.set(game, terrain)
  }
  return terrain
}

/** How a `cell_delta` row changes a cell: the prop now standing there and its hits taken. */
export interface Delta {
  readonly prop: string
  readonly hits: number
  readonly owner: string
}

/** The delta for a cell, if any (the store on the server, the mirrored rows on the client). */
export type DeltaLookup = (cx: number, cy: number) => Delta | undefined

export const deltaKey = (cx: number, cy: number): string => `${cx},${cy}`

/** The store's `cell_delta` rows as a lookup. */
export function storeDeltas(store: Store): DeltaLookup {
  return (cx, cy) => store.get('cell_delta', deltaKey(cx, cy))
}

/** A cell with its mutation applied. */
export interface LiveCell extends Cell {
  /** Hits the standing prop has taken. */
  readonly hits: number
  /** Who placed the standing prop (`''` if it grew there). */
  readonly owner: string
}

/** The live world: generated terrain with `cell_delta` mutations on top. */
export interface LiveWorld extends WorldView {
  cell(cx: number, cy: number): LiveCell
}

/** Overlay `lookup`'s deltas on `terrain`. Cells without a delta cost one lookup. */
export function liveWorld(terrain: Terrain, lookup: DeltaLookup): LiveWorld {
  const cell = (cx: number, cy: number): LiveCell => {
    const base = terrain.cell(cx, cy)
    const d = lookup(cx, cy)
    if (d === undefined) return { ...base, hits: 0, owner: '' }
    const prop = d.prop === '' ? undefined : terrain.prop(d.prop)
    const walkable = base.biome.walkable && !base.covered && !(prop?.blocks ?? false)
    return { ...base, prop, decal: prop === undefined ? base.decal : undefined, walkable, hits: d.hits, owner: d.owner }
  }
  return {
    cell,
    walkable: (cx, cy) => (lookup(cx, cy) === undefined ? terrain.walkable(cx, cy) : cell(cx, cy).walkable),
  }
}

/** Squared distance from (x, y) to the centre of cell (cx, cy). */
export function reachSq(x: number, y: number, cx: number, cy: number): number {
  const half = 1 / (1 + 1)
  const dx = cx + half - x
  const dy = cy + half - y
  return dx * dx + dy * dy
}

/**
 * The cell a player at (x, y) facing `facing` (radians) acts on: the nearest
 * cell within `reach` that `wanted` accepts, preferring cells in front.
 * The client highlights it and sends it; the server re-checks reach and the
 * cell itself, so this is a convenience, not a rule the server trusts.
 */
export function actionTarget(
  world: LiveWorld,
  x: number,
  y: number,
  facing: number,
  reach: number,
  wanted: (c: LiveCell) => boolean,
): { readonly cx: number; readonly cy: number } | undefined {
  const fx = Math.cos(facing)
  const fy = Math.sin(facing)
  const ox = Math.floor(x)
  const oy = Math.floor(y)
  const r = Math.ceil(reach)
  let best: { cx: number; cy: number } | undefined
  let bestScore = Infinity
  for (let cy = oy - r; cy <= oy + r; cy++)
    for (let cx = ox - r; cx <= ox + r; cx++) {
      const d2 = reachSq(x, y, cx, cy)
      if (d2 > reach * reach) continue
      if (!wanted(world.cell(cx, cy))) continue
      const half = 1 / (1 + 1)
      const dot = (cx + half - x) * fx + (cy + half - y) * fy
      // Behind you costs a full cell of distance; in front is preferred.
      const score = Math.sqrt(d2) - dot
      if (score < bestScore) {
        bestScore = score
        best = { cx, cy }
      }
    }
  return best
}

/** A `cell_delta` row as `heatAt` needs it. */
export interface PlacedDelta extends Delta {
  readonly cx: number
  readonly cy: number
}

/**
 * Warmth per second at (x, y) from placed light sources (campfires) within
 * `maxRadius` cells. Reads the deltas of the one to four sectors the radius
 * touches (`bySector`, an index read on the server), so it costs a handful of
 * index lookups per player, never terrain generation or a per-cell sweep.
 */
export function heatAt(
  terrain: Terrain,
  bySector: (sector: string) => Iterable<PlacedDelta>,
  x: number,
  y: number,
  maxRadius: number,
  sectorSize: number,
): number {
  const s0x = Math.floor((x - maxRadius) / sectorSize)
  const s1x = Math.floor((x + maxRadius) / sectorSize)
  const s0y = Math.floor((y - maxRadius) / sectorSize)
  const s1y = Math.floor((y + maxRadius) / sectorSize)
  let heat = 0
  for (let sy = s0y; sy <= s1y; sy++)
    for (let sx = s0x; sx <= s1x; sx++)
      for (const d of bySector(`${sx},${sy}`)) {
        if (d.prop === '') continue
        const light = terrain.prop(d.prop)?.light
        if (light === undefined) continue
        if (reachSq(x, y, d.cx, d.cy) <= light.radius * light.radius) heat += light.warmthPerSec
      }
  return heat
}

/** The largest light radius among the content's props (how far `heatAt` must look). */
export function maxLightRadius(props: readonly PropDef[]): number {
  return props.reduce((m, p) => Math.max(m, p.light?.radius ?? 0), 0)
}
