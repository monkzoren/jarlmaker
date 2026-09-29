/**
 * The PixiJS stage. Owns the canvas, the integer zoom, the camera (which
 * follows the snapshot's `focus`), the streamed terrain, and one animated
 * castaway per entity. Props and characters share one y-sorted layer, so
 * you walk behind a pine and in front of it.
 * Everything outside `render/` talks to it through `GameRenderer`.
 */
import { CASTAWAY, DECALS, PROP_ART, TILES, type Frame, type SpriteSheet } from '@bastion/art'
import type { LiveWorld, Terrain } from '@bastion/core'
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { createFx } from './fx.ts'
import { createTerrainLayer } from './terrain/layer.ts'
import { TILE } from './terrain/paint.ts'
import { advanceAnim, ANIM_TIMING, initialAnim, pickFrame, type AnimKnobs, type AnimState } from './animation.ts'
import { rasterize } from './raster.ts'
import { diffEntities, type RenderSnapshot } from './snapshot.ts'
import { pickZoom, type Zoom } from './zoom.ts'

/** The cell the local player would act on, and how. */
export interface Target {
  readonly cx: number
  readonly cy: number
  /** `hit` brackets a prop; `build` shows a ghost of `sprite`. */
  readonly mode: 'hit' | 'build'
  readonly sprite?: string
}

/** A cell's delta changed on the server (from the world mirror). */
export interface CellChange {
  readonly cx: number
  readonly cy: number
  /** Prop before and after (`undefined`: none). */
  readonly before: string | undefined
  readonly after: string | undefined
  /** Hits before and after. */
  readonly hitsBefore: number
  readonly hitsAfter: number
}

export interface GameRenderer {
  /** Show exactly the entities in `snapshot`. Cheap to call every frame. */
  setEntities(snapshot: RenderSnapshot): void
  /** Highlight the cell the player would act on (or nothing). */
  setTarget(target: Target | undefined): void
  /** A cell changed: redraw its props and play the hit/fell/build feedback. */
  cellChanged(change: CellChange): void
  /** Text rising from entity `id` (e.g. "+1 Wood"). */
  floatFrom(id: string, text: string, color: number): void
  /** Entity `id` swings towards cell (cx, cy). */
  swing(id: string, cx: number, cy: number): void
  /** Current integer zoom (device pixels per art pixel). */
  readonly zoom: Zoom
  destroy(): void
}

const BACKGROUND = 0x223a48 // deep sea, behind chunks still streaming in

export interface WorldArt {
  readonly terrain: Terrain
  /** The terrain with the server's mutations on top (props come from here). */
  readonly world: LiveWorld
  readonly chunkSize: number
  readonly seed: number
}

/** Shadow under the feet: art pixels wide/high, and its opacity. */
const SHADOW = { w: 12, h: 4, alpha: 0.28 } as const

/** A soft round light: white at the centre fading to nothing, for additive glows. */
function lightTexture(): Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255, 170, 80, 0.55)')
  g.addColorStop(0.45, 'rgba(240, 120, 40, 0.22)')
  g.addColorStop(1, 'rgba(224, 112, 42, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(canvas)
}

function frameTexture(frame: Frame, sheet: Pick<SpriteSheet, 'palette'>): Texture {
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
  // Above the actors: the target marker, additive light, then floating effects.
  const marks = new Container()
  const glow = new Container()
  const overlay = new Container()
  world.addChild(ground, marks, actors, glow, overlay)
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
  const light = lightTexture()
  const terrainLayer = createTerrainLayer({
    ground,
    actors,
    glow,
    light,
    world: worldArt.world,
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
  const fx = createFx(actors, overlay)
  const bracket = new Graphics()
  marks.addChild(bracket)
  const ghost = new Sprite()
  ghost.anchor.set(0.5, 1)
  ghost.alpha = 0.55
  ghost.visible = false
  overlay.addChild(ghost)
  let target: Target | undefined
  const ghostTextures = new Map<string, Texture>()
  const ghostTexture = (id: string): Texture | undefined => {
    let t = ghostTextures.get(id)
    const pic = PROP_ART[id]
    if (t === undefined && pic !== undefined) {
      t = frameTexture(pic.frames[0]!, pic)
      ghostTextures.set(id, t)
    }
    return t
  }
  /** Chip colours by the prop that was hit. */
  const CHIP: Readonly<Record<string, number>> = { pine: 0x8a6a48, boulder: 0x90969a, 'rock.small': 0x90969a }

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

  /** Corner brackets around the hit target, or a ghost of what would be built. */
  function drawTarget(now: number): void {
    bracket.clear()
    ghost.visible = false
    if (target === undefined) return
    const x = target.cx * TILE
    const y = target.cy * TILE
    if (target.mode === 'build' && target.sprite !== undefined) {
      const t = ghostTexture(target.sprite)
      if (t) {
        ghost.texture = t
        ghost.position.set(x + TILE / 2, y + TILE - 1)
        ghost.visible = true
      }
    }
    const pulse = Math.round((Math.sin(now / 160) + 1) / 2)
    const a = -1 - pulse
    const b = TILE + pulse
    const L = 4
    const color = target.mode === 'build' ? 0x9fe07a : 0xf4d06a
    for (const [cx, cy, dx, dy] of [
      [a, a, 1, 1],
      [b, a, -1, 1],
      [a, b, 1, -1],
      [b, b, -1, -1],
    ] as const) {
      bracket.moveTo(x + cx, y + cy + dy * L).lineTo(x + cx, y + cy).lineTo(x + cx + dx * L, y + cy)
    }
    bracket.stroke({ color, width: 1, alpha: 0.95 })
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
      terrainLayer.update(focus.x, focus.y, view.w / 2, view.h / 2, now)
      drawTarget(now)
      fx.update(now)
    },
    setTarget(t) {
      target = t
    },
    cellChanged(c) {
      const now = performance.now()
      terrainLayer.refresh(c.cx, c.cy)
      const x = (c.cx + 0.5) * TILE
      const y = (c.cy + 0.5) * TILE
      const hit = c.before !== undefined && (c.hitsAfter > c.hitsBefore || c.after !== c.before)
      if (hit && c.before !== undefined) {
        fx.chips(x, y - 4, CHIP[c.before] ?? 0x8a6a48, now)
        const prop = terrainLayer.propAt(c.cx, c.cy)
        if (prop && c.after === c.before) fx.shake(prop, now)
        const felled = c.before === 'pine' && c.after !== c.before ? ghostTexture('pine') : undefined
        if (felled) fx.topple(felled, x, (c.cy + 1) * TILE - 1, (c.cx + c.cy) % 2 === 0, now)
      }
      if (c.before === undefined && c.after !== undefined) fx.chips(x, y, 0xe0702a, now)
    },
    floatFrom(id, text, color) {
      const a = sprites.get(id)
      if (a) fx.float(text, a.root.x, a.root.y - 34, color, performance.now())
    },
    swing(id, cx, cy) {
      const a = sprites.get(id)
      if (a) fx.lunge(a.body, (cx + 0.5) * TILE - a.root.x, (cy + 0.5) * TILE - (a.root.y - TILE / 2), performance.now())
    },
    destroy() {
      window.removeEventListener('resize', layout)
      terrainLayer.destroy()
      fx.destroy()
      light.destroy(true)
      for (const t of ghostTextures.values()) t.destroy(true)
      for (const t of textures.values()) t.destroy(true)
      shadowTexture.destroy(true)
      app.destroy(true, { children: true })
    },
  }
}
