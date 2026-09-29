import { describe, expect, it } from 'vitest'
import type { LiveCell } from '../world/rules.ts'
import { buildable } from './rules.ts'

const biome = (role: LiveCell['biome']['role'], walkable = role !== 'water') => ({
  id: role,
  name: role,
  role,
  walkable,
  tile: role,
  layer: 0,
  flora: [],
  decals: [],
})
const cell = (over: Partial<LiveCell>): LiveCell => ({
  biome: biome('shore'),
  prop: undefined,
  decal: undefined,
  walkable: true,
  variant: 0,
  covered: false,
  hits: 0,
  owner: '',
  ...over,
})

describe('buildable', () => {
  it('accepts open ground, decals included', () => {
    expect(buildable(cell({}))).toBe(true)
    expect(buildable(cell({ decal: 'decal.shells' }))).toBe(true)
  })

  it('refuses a prop, a landmark, water, or blocked ground', () => {
    expect(buildable(cell({ prop: { id: 'stump', sprite: 'stump', blocks: false, footprint: [1, 1] } }))).toBe(false)
    expect(buildable(cell({ covered: true }))).toBe(false)
    expect(buildable(cell({ biome: biome('water'), walkable: false }))).toBe(false)
    expect(buildable(cell({ walkable: false }))).toBe(false)
  })
})
