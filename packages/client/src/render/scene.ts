/**
 * The PixiJS stage. Owns the canvas, the integer zoom, and one sprite per
 * entity. Everything outside `render/` talks to it through `GameRenderer`.
 */
import { Application, Container, Sprite, Texture } from 'pixi.js'
import { PLACEHOLDER_GRID, PLACEHOLDER_PALETTE, rasterize } from './placeholder.ts'
import { diffEntities, type RenderSnapshot } from './snapshot.ts'
import { pickZoom, type Zoom } from './zoom.ts'

export interface GameRenderer {
  /** Show exactly the entities in `snapshot`. Cheap to call every frame. */
  setEntities(snapshot: RenderSnapshot): void
  /** Current integer zoom (device pixels per art pixel). */
  readonly zoom: Zoom
  destroy(): void
}

const BACKGROUND = 0x3b4448 // sea grey

function placeholderTexture(): Texture {
  const { width, height, data } = rasterize(PLACEHOLDER_GRID, PLACEHOLDER_PALETTE)
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

export async function createRenderer(host: HTMLElement): Promise<GameRenderer> {
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

  const world = new Container()
  app.stage.addChild(world)
  const texture = placeholderTexture()
  const sprites = new Map<string, Sprite>()
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
    // Placeholder camera: world origin at screen centre, on a whole art pixel.
    // The real camera (follow, clamps) is P1-013.
    world.position.set(Math.floor(devW / zoom / 2), Math.floor(devH / zoom / 2))
  }

  layout()
  window.addEventListener('resize', layout)

  return {
    get zoom() {
      return zoom
    },
    setEntities(snapshot) {
      const diff = diffEntities(new Set(sprites.keys()), snapshot)
      for (const id of diff.removed) {
        sprites.get(id)?.destroy()
        sprites.delete(id)
      }
      for (const e of diff.added) {
        const s = new Sprite(texture)
        s.anchor.set(0.5, 1)
        world.addChild(s)
        sprites.set(e.id, s)
      }
      for (const e of [...diff.added, ...diff.moved]) {
        sprites.get(e.id)?.position.set(Math.round(e.x), Math.round(e.y))
      }
    },
    destroy() {
      window.removeEventListener('resize', layout)
      app.destroy(true, { children: true, texture: true })
    },
  }
}
