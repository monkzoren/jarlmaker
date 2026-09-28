/**
 * The PixiJS stage. Owns the canvas, the integer zoom, the camera (which
 * follows the snapshot's `focus`), the streamed terrain, and one animated
 * castaway per entity. Props and characters share one y-sorted layer, so
 * you walk behind a pine and in front of it.
 * Everything outside `render/` talks to it through `GameRenderer`.
 */
import { CASTAWAY, DECALS, PROP_ART, TILES, type Frame, type SpriteSheet } from '@bastion/art'
import type { Terrain } from '@bastion/core'
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { createTerrainLayer } from './terrain/layer.ts'
import { advanceAnim, ANIM_TIMING, initialAnim, pickFrame, type AnimKnobs, type AnimState } from './animation.ts'
import { rasterize } from './raster.ts'
import { diffEntities, type RenderSnapshot } from './snapshot.ts'
import { pickZoom, type Zoom } from './zoom.ts'

export interface GameRenderer {
  /** Show exactly the entities in `snapshot`. Cheap to call every frame. */
  setEntities(snapshot: RenderSnapshot): void
  /** Current integer zoom (device pixels per art pixel). */
  readonly zoom: Zoom
  destroy(): void
}

const BACKGROUND = 0x223a48 // deep sea, behind chunks still streaming in

export interface WorldArt {
  readonly terrain: Terrain
  readonly chunkSize: number
  readonly seed: number
}

/** Shadow under the feet: art pixels wide/high, and its opacity. */
const SHADOW = { w: 12, h: 4, alpha: 0.28 } as const

function frameTexture(frame: Frame, sheet: SpriteSheet): Texture {
  const { width, height, data } = rasterize(frame, sheet.palette)
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

export async function createRenderer(host: HTMLElement, worldArt: WorldArt): Promise<GameRenderer> {
  const app = new Application()
  // resolution 1 + a canvas sized in device pixels: we own the DPR maths so
  // the zoom is an exact integer number of device pixels per art pixel.
  await app.init({
    background: BACKGROUND,
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false,
    width: 1,
    height: 1,
  })
  host.appendChild(app.canvas)

  // `world` is the camera; `ground` holds chunk textures, `actors` the y-sorted props and characters.
  const world = new Container()
  const ground = new Container()
  const actors = new Container()
  actors.sortableChildren = true
  world.addChild(ground, actors)
  app.stage.addChild(world)
  const sheet = CASTAWAY
  const textures = new Map<string, Texture>()
  for (const [anim, byFacing] of Object.entries(sheet.anims))
    for (const [facing, frames] of Object.entries(byFacing))
      frames.forEach((f, i) => textures.set(`${anim}.${facing}.${i}`, frameTexture(f, sheet)))
  const knobs: AnimKnobs = { ...ANIM_TIMING, pxPerFrame: sheet.pxPerFrame, walkFrames: sheet.anims.walk.down.length }
  const shadow = new Graphics().ellipse(0, 0, SHADOW.w / 2, SHADOW.h / 2).fill({ color: 0x000000, alpha: SHADOW.alpha })
  const shadowTexture = app.renderer.generateTexture(shadow)
  shadowTexture.source.scaleMode = 'nearest'
  const terrainLayer = createTerrainLayer({
    ground,
    actors,
    terrain: worldArt.terrain,
    chunkSize: worldArt.chunkSize,
    seed: worldArt.seed,
    art: { tiles: TILES, decals: DECALS },
    props: PROP_ART,
    shadow: shadowTexture,
    shadowWidthPx: SHADOW.w,
  })
  let view = { w: 1, h: 1 }
  let focus = { x: 0, y: 0 }

  interface Actor {
    readonly root: Container
    readonly body: Sprite
    anim: AnimState
  }
  const sprites = new Map<string, Actor>()
  let lastFrameAt: number | undefined
  let zoom: Zoom = 2

  function layout(): void {
    const dpr = window.devicePixelRatio || 1
    const cssW = host.clientWidth
    const cssH = host.clientHeight
    const devW = Math.max(1, Math.floor(cssW * dpr))
    const devH = Math.max(1, Math.floor(cssH * dpr))
    zoom = pickZoom({ width: cssW, height: cssH, dpr })
    app.renderer.resize(devW, devH)
    app.canvas.style.width = `${devW / dpr}px`
    app.canvas.style.height = `${devH / dpr}px`
    app.stage.scale.set(zoom)
    view = { w: devW / zoom, h: devH / zoom }
    aim()
  }

  /** Put `focus` at the screen centre, on a whole art pixel (no sub-pixel shimmer). */
  function aim(): void {
    world.position.set(Math.round(view.w / 2 - focus.x), Math.round(view.h / 2 - focus.y))
  }

  layout()
  window.addEventListener('resize', layout)

  return {
    get zoom() {
      return zoom
    },
    setEntities(snapshot) {
      const now = performance.now()
      const dtMs = lastFrameAt === undefined ? 0 : now - lastFrameAt
      lastFrameAt = now
      const diff = diffEntities(new Set(sprites.keys()), snapshot)
      for (const id of diff.removed) {
        sprites.get(id)?.root.destroy({ children: true })
        sprites.delete(id)
      }
      for (const e of diff.added) {
        const root = new Container()
        const foot = new Sprite(shadowTexture)
        foot.anchor.set(0.5, 0.5)
        foot.y = -1
        const body = new Sprite(textures.get('idle.down.0'))
        body.anchor.set(0.5, 1)
        root.addChild(foot, body)
        actors.addChild(root)
        sprites.set(e.id, { root, body, anim: initialAnim(e.x, e.y) })
      }
      for (const e of diff.moved) {
        const a = sprites.get(e.id)
        if (a) a.anim = advanceAnim(a.anim, e.x, e.y, dtMs, knobs)
      }
      for (const e of [...diff.added, ...diff.moved]) {
        const a = sprites.get(e.id)
        if (!a) continue
        const pick = pickFrame(a.anim, knobs)
        const tex = textures.get(`${pick.anim}.${pick.facing}.${pick.index}`)
        if (tex && a.body.texture !== tex) a.body.texture = tex
        a.body.scale.x = pick.flip ? -1 : 1
        const x = Math.round(e.x)
        const y = Math.round(e.y)
        a.root.position.set(x, y)
        if (a.root.zIndex !== y) a.root.zIndex = y
      }
      if (snapshot.focus) focus = snapshot.focus
      aim()
      terrainLayer.update(focus.x, focus.y, view.w / 2, view.h / 2)
    },
    destroy() {
      window.removeEventListener('resize', layout)
      terrainLayer.destroy()
      for (const t of textures.values()) t.destroy(true)
      shadowTexture.destroy(true)
      app.destroy(true, { children: true })
    },
  }
}
