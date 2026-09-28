import { describe, expect, it } from 'vitest'
import { createGame } from '../game.ts'
import { fbm, hash3, unit, valueNoise } from './noise.ts'
import { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from './fixture.ts'
import { createTerrain, terrainOf } from './rules.ts'
import type { BiomeDef, PropDef } from './schema.ts'

const biome = (id: string, role: BiomeDef['role'], extra: Partial<BiomeDef> = {}): BiomeDef => ({
  id,
  name: id,
  role,
  ...(role === 'lowland' ? { moisture: [0, 1] as [number, number] } : {}),
  walkable: role !== 'water',
  tile: id,
  layer: 0,
  flora: [],
  decals: [],
  ...extra,
})

const PROPS: PropDef[] = [
  { id: 'tree', sprite: 'tree', blocks: true, footprint: [1, 1] },
  { id: 'bush', sprite: 'bush', blocks: false, footprint: [1, 1] },
  { id: 'ship', sprite: 'ship', blocks: true, footprint: [3, 2] },
]

const WORLD = {
  tuning: { world: { ...FLAT_WORLD_TUNING, seed: 7, coastWiggleCells: 10, elevationNoise: 0.5, octaves: 3, spawnClearCells: 4 } },
  biomes: [
    biome('sea', 'water'),
    biome('beach', 'shore'),
    biome('wood', 'lowland', { flora: [{ id: 'tree', chance: 0.5 }, { id: 'bush', chance: 0.2 }], decals: [{ id: 'moss', chance: 0.5 }] }),
    biome('fell', 'upland'),
  ],
  props: PROPS,
  landmarks: [{ id: 'wreck', prop: 'ship', cx: -3, cy: 2 }],
}

describe('noise', () => {
  it('is deterministic and in range', () => {
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3))
    expect(hash3(1, 2, 3)).not.toBe(hash3(2, 2, 3))
    for (let i = 0; i < 200; i++) {
      const u = unit(9, i, -i)
      const v = valueNoise(9, i * 0.37, i * -0.61)
      const f = fbm(9, i * 0.13, i * 0.29, 4)
      for (const n of [u, v, f]) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThan(1)
      }
    }
  })

  it('is continuous: neighbouring samples differ by little', () => {
    for (let i = 0; i < 100; i++) expect(Math.abs(valueNoise(3, i / 10, 0) - valueNoise(3, (i + 1) / 10, 0))).toBeLessThan(0.3)
  })
})

describe('terrain', () => {
  const t = createTerrain(WORLD)

  it('puts the origin on the beach, walkable', () => {
    expect(t.cell(0, 0).biome.id).toBe('beach')
    expect(t.elevation(0, 0)).toBeCloseTo(WORLD.tuning.world.originLevel)
    expect(t.walkable(0, 0)).toBe(true)
  })

  it('has open sea far to the west and land far to the east', () => {
    expect(t.cell(-500, 0).biome.id).toBe('sea')
    expect(t.walkable(-500, 0)).toBe(false)
    expect(t.cell(60, 0).biome.role).not.toBe('water')
  })

  it('is a pure function of the seed', () => {
    const again = createTerrain(WORLD)
    const other = createTerrain({ ...WORLD, tuning: { world: { ...WORLD.tuning.world, seed: 8 } } })
    let differs = 0
    for (let x = 0; x < 40; x++)
      for (let y = 0; y < 40; y++) {
        expect(again.cell(x, y)).toEqual(t.cell(x, y))
        if (other.cell(x, y).prop?.id !== t.cell(x, y).prop?.id) differs++
      }
    expect(differs).toBeGreaterThan(0)
  })

  it('keeps blocking flora away from the spawn', () => {
    for (let x = -4; x <= 4; x++)
      for (let y = -4; y <= 4; y++) {
        const prop = t.cell(x, y).prop
        if (x * x + y * y >= 16 || prop?.id === 'ship') continue // the landmark is placed by hand
        expect(prop?.blocks ?? false, `${x},${y}`).toBe(false)
      }
  })

  it('grows blocking props that stop movement, and walk-through ones that do not', () => {
    let trees = 0
    let bushes = 0
    for (let x = 20; x < 60; x++)
      for (let y = 0; y < 40; y++) {
        const c = t.cell(x, y)
        if (c.biome.id !== 'wood') continue
        if (c.prop?.id === 'tree') {
          trees++
          expect(c.walkable).toBe(false)
        }
        if (c.prop?.id === 'bush') {
          bushes++
          expect(c.walkable).toBe(true)
        }
        if (c.prop !== undefined) expect(c.decal).toBeUndefined()
      }
    expect(trees).toBeGreaterThan(0)
    expect(bushes).toBeGreaterThan(0)
  })

  it('anchors a landmark on one cell and blocks its whole footprint', () => {
    expect(t.cell(-3, 2).prop?.id).toBe('ship')
    for (let dx = 0; dx < 3; dx++)
      for (let dy = 0; dy < 2; dy++) {
        expect(t.walkable(-3 + dx, 2 + dy), `${dx},${dy}`).toBe(false)
        if (dx + dy > 0) expect(t.cell(-3 + dx, 2 + dy).prop).toBeUndefined()
      }
  })

  it('refuses content with a missing role, an unknown prop, or a large flora prop', () => {
    expect(() => createTerrain({ ...WORLD, biomes: WORLD.biomes.filter((b) => b.role !== 'shore') })).toThrow(/role "shore"/)
    expect(() => createTerrain({ ...WORLD, landmarks: [{ id: 'x', prop: 'nope', cx: 0, cy: 0 }] })).toThrow(/unknown prop/)
    const big = WORLD.biomes.map((b) => (b.id === 'wood' ? { ...b, flora: [{ id: 'ship', chance: 0.1 }] } : b))
    expect(() => createTerrain({ ...WORLD, biomes: big })).toThrow(/must be 1x1/)
  })

  it('builds one terrain per Game', () => {
    const game = createGame({ tuning: { movement: { speed: 4, accel: 32, maxStepMs: 100 }, world: FLAT_WORLD_TUNING }, ...FLAT_WORLD_SECTIONS })
    expect(terrainOf(game)).toBe(terrainOf(game))
  })
})
