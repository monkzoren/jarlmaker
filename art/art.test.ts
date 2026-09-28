import { describe, expect, it } from 'vitest'
import { CASTAWAY, DECALS, PROP_ART, TILES } from './index.ts'
import type { AnimName, Facing, SpriteSheet } from './types.ts'

const SHEETS: readonly SpriteSheet[] = [CASTAWAY]
const FACINGS: readonly Facing[] = ['down', 'up', 'side']
const ANIMS: readonly AnimName[] = ['idle', 'walk']

describe.each(SHEETS.map((s) => [s.id, s] as const))('sprite sheet %s', (_id, sheet) => {
  it('has every animation for every facing', () => {
    for (const a of ANIMS) for (const f of FACINGS) expect(sheet.anims[a][f].length, `${a}.${f}`).toBeGreaterThan(0)
    for (const f of FACINGS) expect(sheet.anims.walk[f].length, `walk.${f}`).toBe(4)
  })

  it('has frames of exactly width x height over its own palette', () => {
    for (const a of ANIMS)
      for (const f of FACINGS)
        sheet.anims[a][f].forEach((frame, i) => {
          const at = `${a}.${f}.${i}`
          expect(frame.length, at).toBe(sheet.height)
          frame.forEach((row, y) => {
            expect(row.length, `${at} row ${y}`).toBe(sheet.width)
            for (const ch of row) if (ch !== '.') expect(sheet.palette[ch], `${at} row ${y} '${ch}'`).toMatch(/^#[0-9a-f]{6}$/)
          })
        })
  })

  it('stands on the bottom rows so the anchor is the feet', () => {
    for (const f of FACINGS) {
      const frame = sheet.anims.idle[f][0]!
      expect(frame[sheet.height - 1], `idle.${f} bottom row`).toMatch(/[^.]/)
    }
  })
})

describe('pictures (tiles, decals, props)', () => {
  const all = [...Object.values(TILES), ...Object.values(DECALS), ...Object.values(PROP_ART)]
  it.each(all.map((p) => [p.id, p] as const))('%s has frames of its size over its palette', (_id, pic) => {
    expect(pic.frames.length).toBeGreaterThan(0)
    pic.frames.forEach((frame, i) => {
      expect(frame.length, `frame ${i}`).toBe(pic.height)
      frame.forEach((row, y) => {
        expect(row.length, `frame ${i} row ${y}`).toBe(pic.width)
        for (const ch of row) if (ch !== '.') expect(pic.palette[ch], `'${ch}'`).toMatch(/^#[0-9a-f]{6}$/)
      })
    })
  })

  it('keys each picture by its own id', () => {
    for (const group of [TILES, DECALS, PROP_ART]) for (const [key, pic] of Object.entries(group)) expect(pic.id).toBe(key)
  })
})
