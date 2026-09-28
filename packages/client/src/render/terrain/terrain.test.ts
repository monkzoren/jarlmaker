import { DECALS, PROP_ART, TILES } from '@bastion/art'
import { content } from '@bastion/content'
import { createGame, terrainOf } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { chunkId, chunksAround } from './chunks.ts'
import { paintChunk, PAINT, TILE } from './paint.ts'

const game = createGame(content)
const terrain = terrainOf(game)
const { chunkSize, seed } = content.tuning.world
const ART = { tiles: TILES, decals: DECALS }

describe('art coverage', () => {
  it('has a tile for every biome, a picture for every decal and prop', () => {
    for (const b of content.biomes) {
      expect(TILES[b.tile], `tile ${b.tile}`).toBeDefined()
      for (const d of b.decals) expect(DECALS[d.id], `decal ${d.id}`).toBeDefined()
    }
    for (const p of content.props) expect(PROP_ART[p.sprite], `prop ${p.sprite}`).toBeDefined()
  })

  it('has tiles and decals of exactly one cell', () => {
    for (const pic of [...Object.values(TILES), ...Object.values(DECALS)]) expect([pic.width, pic.height]).toEqual([TILE, TILE])
  })
})

describe('chunksAround', () => {
  it('covers the view plus margin, nearest chunk first', () => {
    const keys = chunksAround(300, 300, 100, 60, 0, 512)
    expect(keys.map(chunkId)).toEqual(['0,0'])
    const wide = chunksAround(0, 0, 600, 300, 0, 512)
    expect(wide.map(chunkId).sort()).toEqual(['-1,-1', '-1,0', '-2,-1', '-2,0', '0,-1', '0,0', '1,-1', '1,0'].sort())
    expect(['-1,-1', '-1,0', '0,-1', '0,0']).toContain(chunkId(wide[0]!))
  })
})

describe('paintChunk', () => {
  const home = paintChunk(terrain, ART, -1, -1, chunkSize, seed)

  it('paints every pixel of the chunk opaque', () => {
    expect([home.width, home.height]).toEqual([chunkSize * TILE, chunkSize * TILE])
    for (let i = 3; i < home.data.length; i += 4) if (home.data[i] !== 0xff) throw new Error(`transparent pixel ${(i - 3) / 4}`)
  })

  it('is deterministic', () => {
    const again = paintChunk(terrain, ART, -1, -1, chunkSize, seed)
    expect(Buffer.from(again.data).equals(Buffer.from(home.data))).toBe(true)
  })

  it('draws surf along the coast', () => {
    const [r, g, b] = [0xd8, 0xe6, 0xe8]
    expect(PAINT.foam).toBe('#d8e6e8')
    let foam = 0
    for (let i = 0; i < home.data.length; i += 4) if (home.data[i] === r && home.data[i + 1] === g && home.data[i + 2] === b) foam++
    expect(foam).toBeGreaterThan(50)
  })

  it('lists the wreck among the props of the spawn chunk', () => {
    const wreck = content.landmarks.find((l) => l.id === 'wreck')!
    expect(home.props).toContainEqual({ sprite: 'wreck', cx: wreck.cx, cy: wreck.cy, w: 4, h: 2 })
  })
})
