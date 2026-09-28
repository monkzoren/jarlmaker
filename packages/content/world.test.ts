import { createGame, terrainOf } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { content } from './index.ts'

const terrain = terrainOf(createGame(content))

const GLYPH: Record<string, string> = { sea: '~', shore: '.', meadow: ',', pinewood: '"', moor: ';', fell: '^' }

/** The world around the spawn, one character per cell: '@' spawn, W wreck, T pine, o rock, * bush. */
function map(x0: number, y0: number, w: number, h: number): string {
  const rows: string[] = []
  for (let y = y0; y < y0 + h; y++) {
    let row = ''
    for (let x = x0; x < x0 + w; x++) {
      const c = terrain.cell(x, y)
      const prop = c.prop?.id
      row +=
        x === 0 && y === 0
          ? '@'
          : prop === 'wreck'
            ? 'W'
            : prop === 'pine'
              ? 'T'
              : prop === 'boulder' || prop === 'rock.small'
                ? 'o'
                : prop === 'bush.juniper'
                  ? '*'
                  : (GLYPH[c.biome.id] ?? '?')
    }
    rows.push(row)
  }
  return rows.join('\n')
}

describe('the world (seed ' + content.tuning.world.seed + ')', () => {
  it('matches the golden map around the spawn', () => {
    // A change here re-rolls the live world. Look at the diff before `vitest -u`.
    expect('\n' + map(-24, -12, 72, 24) + '\n').toMatchSnapshot()
  })

  it('washes you up on the beach beside the wreck, with room to move', () => {
    expect(terrain.cell(0, 0).biome.id).toBe('shore')
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) expect(terrain.walkable(x, y), `${x},${y}`).toBe(true)
    const wreck = content.landmarks.find((l) => l.id === 'wreck')!
    expect(terrain.cell(wreck.cx, wreck.cy).prop?.id).toBe('wreck')
    expect(Math.hypot(wreck.cx, wreck.cy)).toBeLessThan(10)
  })

  it('has every biome within a few minutes walk', () => {
    const seen = new Set<string>()
    for (let x = -40; x < 160; x += 2) for (let y = -100; y < 100; y += 2) seen.add(terrain.cell(x, y).biome.id)
    expect([...seen].sort()).toEqual(content.biomes.map((b) => b.id).sort())
  })

  it('references only defined props', () => {
    const props = new Set(content.props.map((p) => p.id))
    for (const b of content.biomes) for (const f of b.flora) expect(props.has(f.id), `${b.id} -> ${f.id}`).toBe(true)
  })
})
