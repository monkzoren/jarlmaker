/**
 * Terrain streaming for the Pixi scene: paints chunks around the camera into
 * one texture each (a couple per frame, nearest first), puts each chunk's
 * props into the y-sorted actor layer so you walk behind trees, and drops
 * chunks well out of view.
 */
import type { Picture } from '@bastion/art'
import type { Terrain } from '@bastion/core'
import { Container, Sprite, Texture } from 'pixi.js'
import { rasterize } from '../raster.ts'
import { chunkId, chunksAround } from './chunks.ts'
import { paintChunk, TILE, type PaintArt } from './paint.ts'

export interface TerrainLayerOptions {
  readonly ground: Container
  readonly actors: Container
  readonly terrain: Terrain
  readonly chunkSize: number
  readonly seed: number
  readonly art: PaintArt
  readonly props: Readonly<Record<string, Picture>>
  /** A soft ellipse, scaled under standing props. */
  readonly shadow: Texture
  readonly shadowWidthPx: number
}

export interface TerrainLayer {
  /** Stream chunks for a view centred on (cx, cy) art px, half-size (halfW, halfH). */
  update(cx: number, cy: number, halfW: number, halfH: number): void
  /** Chunks currently painted. */
  readonly loaded: number
  destroy(): void
}

/** Chunks painted per frame at most: one 512 px chunk costs a few ms. */
const PAINT_PER_FRAME = 2
/** Props that cast no ground shadow (they lie on the ground already). */
const NO_SHADOW = new Set(['wreck'])

interface Chunk {
  readonly ground: Sprite
  readonly props: Container[]
}

function pictureTexture(pic: Picture): Texture {
  const { width, height, data } = rasterize(pic.frames[0]!, pic.palette)
  return canvasTexture(width, height, data)
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
  const chunkPx = o.chunkSize * TILE
  const chunks = new Map<string, Chunk>()
  const propTextures = new Map<string, Texture>()
  const propTexture = (id: string): Texture => {
    let t = propTextures.get(id)
    if (t === undefined) {
      const pic = o.props[id]
      if (pic === undefined) throw new Error(`no prop art "${id}"`)
      t = pictureTexture(pic)
      propTextures.set(id, t)
    }
    return t
  }

  function build(ccx: number, ccy: number): Chunk {
    const paint = paintChunk(o.terrain, o.art, ccx, ccy, o.chunkSize, o.seed)
    const ground = new Sprite(canvasTexture(paint.width, paint.height, paint.data))
    ground.position.set(ccx * chunkPx, ccy * chunkPx)
    o.ground.addChild(ground)
    const props = paint.props.map((p) => {
      const root = new Container()
      const tex = propTexture(p.sprite)
      if (!NO_SHADOW.has(p.sprite)) {
        const s = new Sprite(o.shadow)
        s.anchor.set(0.5, 0.5)
        s.scale.set((tex.width * 0.7) / o.shadowWidthPx, 1.3)
        s.y = -2
        root.addChild(s)
      }
      const body = new Sprite(tex)
      body.anchor.set(0.5, 1)
      root.addChild(body)
      const x = (p.cx + p.w / 2) * TILE
      const y = (p.cy + p.h) * TILE - 1
      root.position.set(x, y)
      root.zIndex = y
      o.actors.addChild(root)
      return root
    })
    return { ground, props }
  }

  function drop(id: string, c: Chunk): void {
    c.ground.destroy({ texture: true, textureSource: true })
    for (const p of c.props) p.destroy({ children: true })
    chunks.delete(id)
  }

  return {
    get loaded() {
      return chunks.size
    },
    update(cx, cy, halfW, halfH) {
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
    },
    destroy() {
      for (const [id, c] of chunks) drop(id, c)
      for (const t of propTextures.values()) t.destroy(true)
    },
  }
}
