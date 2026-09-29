/**
 * Terrain streaming for the Pixi scene: paints chunks around the camera into
 * one texture each (a couple per frame, nearest first), puts each chunk's
 * props into the y-sorted actor layer so you walk behind trees, and drops
 * chunks well out of view.
 *
 * Ground comes from the generated terrain alone; props come from the live
 * world (terrain plus `cell_delta` mutations), so a felled pine turns into a
 * stump and a built campfire appears without repainting the ground.
 * Multi-frame props (the campfire) animate. Props with a `light` glow, and
 * cut a flickering hole of their radius in the night's darkness.
 */
import type { Picture } from '@bastion/art'
import type { LiveWorld, Terrain } from '@bastion/core'
import { Container, Sprite, Texture } from 'pixi.js'
import { rasterize } from '../raster.ts'
import { chunkId, chunksAround } from './chunks.ts'
import { paintChunk, TILE, type PaintArt } from './paint.ts'

export interface TerrainLayerOptions {
  readonly ground: Container
  readonly actors: Container
  /** Additive layer above everything for light glows. */
  readonly glow: Container
  readonly terrain: Terrain
  readonly world: LiveWorld
  readonly chunkSize: number
  readonly seed: number
  readonly art: PaintArt
  readonly props: Readonly<Record<string, Picture>>
  /** A soft ellipse, scaled under standing props. */
  readonly shadow: Texture
  readonly shadowWidthPx: number
  /** A soft round light, drawn additively around light sources. */
  readonly light: Texture
  /** Where light sources cut holes in the night (drawn into the darkness mask with `erase`). */
  readonly holes: Container
  /** A soft white disc: the hole a light cuts. */
  readonly hole: Texture
}

export interface TerrainLayer {
  /** Stream chunks for a view centred on (cx, cy) art px, half-size (halfW, halfH). */
  update(cx: number, cy: number, halfW: number, halfH: number, nowMs: number): void
  /** A cell's delta changed: rebuild the props of its chunk. */
  refresh(cx: number, cy: number): void
  /** The prop drawn on (cx, cy), if its chunk is loaded. */
  propAt(cx: number, cy: number): Container | undefined
  /** Chunks currently painted. */
  readonly loaded: number
  destroy(): void
}

/** Chunks painted per frame at most: one 512 px chunk costs a few ms. */
const PAINT_PER_FRAME = 2
/** Props that cast no ground shadow (they lie on the ground already). */
const NO_SHADOW = new Set(['wreck', 'stump', 'campfire'])
/** Frame rate of animated props (CLAUDE.md 3.5.9). */
const PROP_FPS = 8

interface PropView {
  readonly root: Container
  readonly body: Sprite
  readonly frames: readonly Texture[]
  readonly glow: Sprite | undefined
  readonly hole: Sprite | undefined
  readonly radiusPx: number
  readonly phase: number
}

interface Chunk {
  readonly ccx: number
  readonly ccy: number
  readonly ground: Sprite
  props: Map<string, PropView>
}

function canvasTexture(width: number, height: number, data: Uint8ClampedArray<ArrayBuffer>): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.putImageData(new ImageData(data, width, height), 0, 0)
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

export function createTerrainLayer(o: TerrainLayerOptions): TerrainLayer {
  const n = o.chunkSize
  const chunkPx = n * TILE
  const chunks = new Map<string, Chunk>()
  const propTextures = new Map<string, Texture[]>()
  const framesOf = (id: string): Texture[] => {
    let t = propTextures.get(id)
    if (t === undefined) {
      const pic = o.props[id]
      if (pic === undefined) throw new Error(`no prop art "${id}"`)
      t = pic.frames.map((f) => {
        const img = rasterize(f, pic.palette)
        return canvasTexture(img.width, img.height, img.data)
      })
      propTextures.set(id, t)
    }
    return t
  }

  function propView(sprite: string, cx: number, cy: number, w: number, h: number, lightCells: number | undefined): PropView {
    const root = new Container()
    const frames = framesOf(sprite)
    const first = frames[0]!
    if (!NO_SHADOW.has(sprite)) {
      const s = new Sprite(o.shadow)
      s.anchor.set(0.5, 0.5)
      s.scale.set((first.width * 0.7) / o.shadowWidthPx, 1.3)
      s.y = -2
      root.addChild(s)
    }
    const body = new Sprite(first)
    body.anchor.set(0.5, 1)
    root.addChild(body)
    const x = (cx + w / 2) * TILE
    const y = (cy + h) * TILE - 1
    root.position.set(x, y)
    root.zIndex = y
    o.actors.addChild(root)
    let glow: Sprite | undefined
    let hole: Sprite | undefined
    const radiusPx = (lightCells ?? 0) * TILE
    if (lightCells !== undefined) {
      glow = new Sprite(o.light)
      glow.anchor.set(0.5, 0.5)
      glow.blendMode = 'add'
      glow.scale.set((radiusPx * 2) / o.light.width)
      glow.position.set(x, y - TILE / 2)
      o.glow.addChild(glow)
      hole = new Sprite(o.hole)
      hole.anchor.set(0.5, 0.5)
      hole.blendMode = 'erase'
      hole.position.set(x, y - TILE / 2)
      o.holes.addChild(hole)
    }
    return { root, body, frames, glow, hole, radiusPx, phase: (cx * 7 + cy * 13) % 5 }
  }

  function buildProps(c: Chunk): void {
    for (const p of c.props.values()) destroyProp(p)
    c.props = new Map()
    const x0 = c.ccx * n
    const y0 = c.ccy * n
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const cell = o.world.cell(x0 + i, y0 + j)
        if (cell.prop === undefined) continue
        const [w, h] = cell.prop.footprint
        c.props.set(`${x0 + i},${y0 + j}`, propView(cell.prop.sprite, x0 + i, y0 + j, w, h, cell.prop.light?.radius))
      }
  }

  function destroyProp(p: PropView): void {
    p.root.destroy({ children: true })
    p.glow?.destroy()
    p.hole?.destroy()
  }

  function build(ccx: number, ccy: number): Chunk {
    const paint = paintChunk(o.terrain, o.art, ccx, ccy, n, o.seed)
    const ground = new Sprite(canvasTexture(paint.width, paint.height, paint.data))
    ground.position.set(ccx * chunkPx, ccy * chunkPx)
    o.ground.addChild(ground)
    const c: Chunk = { ccx, ccy, ground, props: new Map() }
    buildProps(c)
    return c
  }

  function drop(id: string, c: Chunk): void {
    c.ground.destroy({ texture: true, textureSource: true })
    for (const p of c.props.values()) destroyProp(p)
    chunks.delete(id)
  }

  const chunkOfCell = (cx: number, cy: number): Chunk | undefined =>
    chunks.get(chunkId({ ccx: Math.floor(cx / n), ccy: Math.floor(cy / n) }))

  return {
    get loaded() {
      return chunks.size
    },
    update(cx, cy, halfW, halfH, nowMs) {
      let budget = PAINT_PER_FRAME
      for (const k of chunksAround(cx, cy, halfW, halfH, TILE * 2, chunkPx)) {
        const id = chunkId(k)
        if (chunks.has(id)) continue
        // Always fill the visible area on the first frames; then spread the work.
        if (budget-- <= 0 && chunks.size > 0) break
        chunks.set(id, build(k.ccx, k.ccy))
      }
      const keep = new Set(chunksAround(cx, cy, halfW, halfH, chunkPx, chunkPx).map(chunkId))
      for (const [id, c] of chunks) if (!keep.has(id)) drop(id, c)
      // Animate multi-frame props and flicker their light.
      const frame = Math.floor((nowMs / 1000) * PROP_FPS)
      for (const c of chunks.values())
        for (const p of c.props.values()) {
          if (p.frames.length > 1) {
            const t = p.frames[(frame + p.phase) % p.frames.length]!
            if (p.body.texture !== t) p.body.texture = t
          }
          const flicker = 0.12 * Math.sin(nowMs / 90 + p.phase) + 0.06 * Math.sin(nowMs / 37 + p.phase * 2)
          if (p.glow) p.glow.alpha = 0.55 + flicker
          if (p.hole) p.hole.scale.set(((p.radiusPx * 2) / o.hole.width) * (1 + flicker * 0.25))
        }
    },
    refresh(cx, cy) {
      const c = chunkOfCell(cx, cy)
      if (c !== undefined) buildProps(c)
    },
    propAt(cx, cy) {
      return chunkOfCell(cx, cy)?.props.get(`${cx},${cy}`)?.root
    },
    destroy() {
      for (const [id, c] of chunks) drop(id, c)
      for (const ts of propTextures.values()) for (const t of ts) t.destroy(true)
    },
  }
}
