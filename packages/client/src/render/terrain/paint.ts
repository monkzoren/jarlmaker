/**
 * Paint one terrain chunk to RGBA pixels from core's world cells and the
 * art package's tiles and decals. Pure (no DOM, no Pixi), so it is
 * unit-tested and could move to a worker.
 *
 * - Each cell draws its biome's tile (variant picked by the cell's hash).
 * - At a border, the biome with the higher `layer` reaches a few pixels into
 *   its neighbour, with an edge that wobbles by low-frequency noise, so
 *   coasts and forest edges read as shapes instead of a grid.
 * - Water gets surf: foam on the pixel touching land, lighter water a pixel
 *   further out, and damp sand on the land side.
 * - Decals (driftwood, flowers, heather...) are drawn over their cell.
 */
import type { Picture } from '@bastion/art'
import { valueNoise, type Cell, type Terrain } from '@bastion/core'

export const TILE = 16

export interface PaintArt {
  readonly tiles: Readonly<Record<string, Picture>>
  readonly decals: Readonly<Record<string, Picture>>
}

/** Presentation knobs for borders and surf. */
export const PAINT = {
  /** Border reach into the lower biome, px: min and max as the noise wobbles. */
  blendMinPx: 2,
  blendMaxPx: 7,
  /** Feature size of the border wobble, px. */
  wobblePx: 6,
  /** Noise seed offset for the wobble, so it differs from worldgen fields. */
  wobbleSalt: 9091,
  foam: '#d8e6e8',
  surf: '#7fa6b3',
  dampSand: '#b09872',
} as const

export interface ChunkPaint {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray<ArrayBuffer>
  /** Props anchored in this chunk, by cell. */
  readonly props: readonly { readonly sprite: string; readonly cx: number; readonly cy: number; readonly w: number; readonly h: number }[]
}

type Rgb = readonly [number, number, number]

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Parsed tiles: per tile id, per variant, TILE*TILE rgb triples (flat). */
function parseTiles(tiles: Readonly<Record<string, Picture>>): Map<string, Uint8Array[]> {
  const out = new Map<string, Uint8Array[]>()
  for (const [id, pic] of Object.entries(tiles)) {
    out.set(
      id,
      pic.frames.map((f) => {
        const buf = new Uint8Array(TILE * TILE * 3)
        f.forEach((row, y) => {
          for (let x = 0; x < TILE; x++) {
            const hex = pic.palette[row[x] ?? '.']
            if (hex !== undefined) buf.set(rgb(hex), (y * TILE + x) * 3)
          }
        })
        return buf
      }),
    )
  }
  return out
}

const parsedCache = new WeakMap<PaintArt, Map<string, Uint8Array[]>>()

/**
 * Paint chunk (ccx, ccy) of `chunkSize` cells. `seed` feeds the border
 * wobble. Throws if a biome's tile is missing from the art.
 */
export function paintChunk(terrain: Terrain, art: PaintArt, ccx: number, ccy: number, chunkSize: number, seed: number): ChunkPaint {
  let tiles = parsedCache.get(art)
  if (tiles === undefined) {
    tiles = parseTiles(art.tiles)
    parsedCache.set(art, tiles)
  }
  const n = chunkSize
  const size = n * TILE
  const x0 = ccx * n
  const y0 = ccy * n
  // Cells with a 2-cell margin, so borders and surf read their neighbours.
  const M = 2
  const span = n + M * 2
  const cells: Cell[] = new Array(span * span)
  for (let j = 0; j < span; j++) for (let i = 0; i < span; i++) cells[j * span + i] = terrain.cell(x0 + i - M, y0 + j - M)
  const cellAt = (i: number, j: number): Cell => cells[(j + M) * span + (i + M)]!

  // Per cell: does any neighbour draw over it, and does it touch the waterline?
  const overlapped = new Uint8Array(span * span)
  const shoreline = new Uint8Array(span * span)
  for (let j = -M + 1; j < n + M - 1; j++)
    for (let i = -M + 1; i < n + M - 1; i++) {
      const self = cellAt(i, j)
      const wet = self.biome.role === 'water'
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const nb = cellAt(i + di, j + dj)
          if (nb.biome.layer > self.biome.layer) overlapped[(j + M) * span + (i + M)] = 1
          if ((nb.biome.role === 'water') !== wet) shoreline[(j + M) * span + (i + M)] = 1
        }
    }

  /** Index into `cells` of the cell whose tile pixel (px, py) shows. */
  const ownerOf = (px: number, py: number): number => {
    const i = Math.floor(px / TILE)
    const j = Math.floor(py / TILE)
    const selfIdx = (j + M) * span + (i + M)
    if (overlapped[selfIdx] === 0) return selfIdx
    const lx = px - i * TILE
    const ly = py - j * TILE
    const gx = x0 * TILE + px
    const gy = y0 * TILE + py
    const reach = PAINT.blendMinPx + (PAINT.blendMaxPx - PAINT.blendMinPx) * valueNoise(seed + PAINT.wobbleSalt, gx / PAINT.wobblePx, gy / PAINT.wobblePx)
    let best = selfIdx
    let bestLayer = cells[selfIdx]!.biome.layer
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const idx = (j + dj + M) * span + (i + di + M)
        const layer = cells[idx]!.biome.layer
        if (layer <= bestLayer) continue
        const dx = di < 0 ? lx : di > 0 ? TILE - 1 - lx : 0
        const dy = dj < 0 ? ly : dj > 0 ? TILE - 1 - ly : 0
        const d = di !== 0 && dj !== 0 ? Math.max(dx, dy) : di !== 0 ? dx : dy
        if (d < reach) {
          best = idx
          bestLayer = layer
        }
      }
    return best
  }

  // Pixel owners with a 2 px margin for the surf pass.
  const P = 2
  const pspan = size + P * 2
  const owner = new Int32Array(pspan * pspan)
  const water = new Uint8Array(pspan * pspan)
  for (let py = -P; py < size + P; py++)
    for (let px = -P; px < size + P; px++) {
      const k = (py + P) * pspan + (px + P)
      const o = ownerOf(px, py)
      owner[k] = o
      water[k] = cells[o]!.biome.role === 'water' ? 1 : 0
    }

  const foam = rgb(PAINT.foam)
  const surf = rgb(PAINT.surf)
  const damp = rgb(PAINT.dampSand)
  const data = new Uint8ClampedArray(size * size * 4)
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const k = (py + P) * pspan + (px + P)
      const cell = cells[owner[k]!]!
      const variants = tiles.get(cell.biome.tile)
      if (variants === undefined) throw new Error(`no tile art "${cell.biome.tile}" for biome "${cell.biome.id}"`)
      const tile = variants[cell.variant % variants.length]!
      const t = ((py % TILE) * TILE + (px % TILE)) * 3
      let c: Rgb = [tile[t]!, tile[t + 1]!, tile[t + 2]!]
      // Surf: distance (Chebyshev, up to 2 px) to the other side of the waterline.
      let near = 3
      const home = (Math.floor(py / TILE) + M) * span + (Math.floor(px / TILE) + M)
      if (shoreline[home] === 1)
        for (let dy = -2; dy <= 2 && near > 1; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (water[k + dy * pspan + dx] !== water[k]) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)))
          }
      if (water[k] === 1 && near === 1) c = foam
      else if (water[k] === 1 && near === 2) c = surf
      else if (water[k] === 0 && near === 1 && cell.biome.role === 'shore') c = damp
      data.set([c[0], c[1], c[2], 0xff], (py * size + px) * 4)
    }

  // Decals over their own cell, where the cell still shows its own biome.
  const props: { sprite: string; cx: number; cy: number; w: number; h: number }[] = []
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const cell = cellAt(i, j)
      if (cell.prop !== undefined) props.push({ sprite: cell.prop.sprite, cx: x0 + i, cy: y0 + j, w: cell.prop.footprint[0], h: cell.prop.footprint[1] })
      if (cell.decal === undefined) continue
      const pic = art.decals[cell.decal]
      if (pic === undefined) throw new Error(`no decal art "${cell.decal}"`)
      const frame = pic.frames[cell.variant % pic.frames.length]!
      frame.forEach((row, ly) => {
        for (let lx = 0; lx < TILE; lx++) {
          const hex = pic.palette[row[lx] ?? '.']
          if (hex === undefined) continue
          const px = i * TILE + lx
          const py = j * TILE + ly
          if (owner[(py + P) * pspan + (px + P)] !== (j + M) * span + (i + M)) continue // a neighbour's edge covers it
          const [r, g, b] = rgb(hex)
          data.set([r, g, b, 0xff], (py * size + px) * 4)
        }
      })
    }
  return { width: size, height: size, data, props }
}
