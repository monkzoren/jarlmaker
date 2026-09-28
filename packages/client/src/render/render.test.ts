import { describe, expect, it } from 'vitest'
import { CASTAWAY } from '@bastion/art'
import { rasterize } from './raster.ts'
import { diffEntities } from './snapshot.ts'
import { MIN_TILES_SHORT_SIDE, pickZoom, TILE_PX, zoomForDpr, ZOOM_LEVELS } from './zoom.ts'

describe('zoom', () => {
  it('maps pixel density to 2x/3x/4x', () => {
    expect(zoomForDpr(1)).toBe(2)
    expect(zoomForDpr(1.25)).toBe(2)
    expect(zoomForDpr(2)).toBe(3)
    expect(zoomForDpr(2.625)).toBe(4)
    expect(zoomForDpr(3)).toBe(4)
    expect(zoomForDpr(4)).toBe(4)
  })

  it('treats a bogus dpr as 1', () => {
    expect(zoomForDpr(0)).toBe(2)
    expect(zoomForDpr(Number.NaN)).toBe(2)
  })

  it('keeps the density zoom when the viewport is large enough', () => {
    expect(pickZoom({ width: 1280, height: 720, dpr: 1 })).toBe(2)
    expect(pickZoom({ width: 390, height: 844, dpr: 3 })).toBe(4) // phone portrait
  })

  it('steps down when too few tiles would fit on the short side', () => {
    // 200 css px at dpr 3 = 600 device px; 4x shows 9.4 tiles, 3x shows 12.5.
    expect(pickZoom({ width: 200, height: 800, dpr: 3 })).toBe(3)
  })

  it('never goes below the smallest zoom level', () => {
    expect(pickZoom({ width: 50, height: 50, dpr: 1 })).toBe(2)
  })

  it('always returns an allowed integer level', () => {
    for (const dpr of [0.5, 1, 1.5, 2, 2.75, 3, 3.5]) {
      for (const side of [120, 320, 768, 1920]) {
        const z = pickZoom({ width: side, height: side, dpr })
        expect(ZOOM_LEVELS).toContain(z)
        const fits = (side * dpr) / (TILE_PX * z) >= MIN_TILES_SHORT_SIDE
        expect(fits || z === 2).toBe(true)
      }
    }
  })
})

describe('rasterize', () => {
  it('rasterizes every castaway frame to width x height RGBA', () => {
    for (const byFacing of Object.values(CASTAWAY.anims))
      for (const frames of Object.values(byFacing))
        for (const f of frames) {
          const img = rasterize(f, CASTAWAY.palette)
          expect([img.width, img.height]).toEqual([CASTAWAY.width, CASTAWAY.height])
          expect(img.data.length).toBe(CASTAWAY.width * CASTAWAY.height * 4)
        }
  })

  it('writes palette colours and leaves "." transparent', () => {
    const img = rasterize(['.k'], { k: '#e0702a' })
    expect([...img.data]).toEqual([0, 0, 0, 0, 0xe0, 0x70, 0x2a, 0xff])
  })

  it('rejects ragged rows and unknown keys', () => {
    expect(() => rasterize(['..', '.'], {})).toThrow(/row 1/)
    expect(() => rasterize(['z'], {})).toThrow(/unknown palette key/)
  })
})

describe('diffEntities', () => {
  it('splits a snapshot into added, moved, and removed', () => {
    const d = diffEntities(new Set(['a', 'b']), {
      entities: [
        { id: 'b', x: 1, y: 2 },
        { id: 'c', x: 3, y: 4 },
      ],
    })
    expect(d.added.map((e) => e.id)).toEqual(['c'])
    expect(d.moved.map((e) => e.id)).toEqual(['b'])
    expect(d.removed).toEqual(['a'])
  })
})
