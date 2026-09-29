/**
 * The survival HUD (CLAUDE.md 3.5.10), plain DOM over the canvas:
 * - an inventory bar (bottom centre): each held item's icon and count;
 * - two thumb buttons (bottom right): Act (hit what you face, or place in
 *   build mode) and Build (toggle build mode for the campfire, showing its cost
 *   and greyed out while you cannot afford it).
 * Icons are the art package's pixel sources, rasterized once to data URLs.
 * The HUD re-renders on mirror changes, never per frame.
 */
import { ICONS, PROP_ART, type Picture } from '@bastion/art'
import type { ItemDef, StructureDef } from '@bastion/core'
import { rasterize } from '../../render/raster.ts'

export interface HudOptions {
  readonly items: readonly ItemDef[]
  readonly structure: StructureDef
  /** Pointer handlers for the thumb buttons. */
  readonly onActDown: () => void
  readonly onActUp: () => void
  readonly onBuild: () => void
}

export interface Hud {
  /** Redraw the bar and the build button from these counts. */
  setItems(items: readonly { readonly item: string; readonly count: number }[], canBuild: boolean): void
  /** Build mode on or off (the Build button lights up). */
  setBuildMode(on: boolean): void
  /** A short message above the bar (e.g. why a build was refused). */
  say(text: string): void
  dispose(): void
}

const SCALE = 3

function iconUrl(pic: Picture | undefined): string {
  if (pic === undefined) return ''
  const img = rasterize(pic.frames[0]!, pic.palette)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')?.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
  return canvas.toDataURL()
}

const CSS = `
#hud-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none;z-index:2}
.hud-slot{position:relative;width:${16 * SCALE + 8}px;height:${16 * SCALE + 8}px;background:#1b1f22cc;border:2px solid #6b5e4e;border-radius:4px;display:flex;align-items:center;justify-content:center}
.hud-slot img{width:${16 * SCALE}px;height:${16 * SCALE}px;image-rendering:pixelated}
.hud-slot b{position:absolute;right:3px;bottom:1px;font:bold 13px monospace;color:#f4ead2;text-shadow:1px 1px 0 #1b1f22}
.hud-slot.bump{animation:hud-bump .25s}
@keyframes hud-bump{50%{transform:scale(1.18)}}
#hud-say{position:fixed;left:50%;bottom:${16 * SCALE + 30}px;transform:translateX(-50%);font:bold 13px monospace;color:#f4ead2;text-shadow:1px 1px 0 #1b1f22;pointer-events:none;opacity:0;transition:opacity .3s;z-index:2}
.hud-btn{position:fixed;width:68px;height:68px;border-radius:50%;background:#1b1f22bb;border:2px solid #9a8a74;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none;z-index:2;cursor:pointer}
.hud-btn img{width:${16 * SCALE}px;height:${16 * SCALE}px;image-rendering:pixelated;pointer-events:none}
.hud-btn span{font:bold 9px monospace;color:#f4ead2;margin-top:-4px;pointer-events:none;white-space:nowrap}
.hud-btn.on{border-color:#9fe07a;box-shadow:0 0 10px #9fe07a88}
.hud-btn.off{opacity:.45}
#hud-act{right:18px;bottom:18px}
#hud-build{right:96px;bottom:42px;width:56px;height:56px}
#hud-build img{width:32px;height:32px}
`

export function createHud(o: HudOptions): Hud {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  const bar = document.createElement('div')
  bar.id = 'hud-bar'
  const say = document.createElement('div')
  say.id = 'hud-say'
  const icons = new Map(o.items.map((i) => [i.id, iconUrl(ICONS[i.icon])]))
  const names = new Map(o.items.map((i) => [i.id, i.name]))
  const slots = new Map<string, HTMLElement>()
  const counts = new Map<string, number>()

  const button = (id: string, icon: string, label: string): HTMLElement => {
    const b = document.createElement('div')
    b.id = id
    b.className = 'hud-btn'
    b.innerHTML = `<img alt="" src="${icon}"><span>${label}</span>`
    // Buttons swallow their pointer so the floating stick never starts under them.
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) b.addEventListener(ev, (e) => e.stopPropagation())
    return b
  }
  const act = button('hud-act', iconUrl(ICONS['axe']), '')
  const cost = Object.entries(o.structure.cost)
    .map(([item, n]) => `${n}${(names.get(item) ?? item).slice(0, 1).toLowerCase()}`)
    .join(' ')
  const build = button('hud-build', iconUrl(PROP_ART[o.structure.prop]), cost)
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    act.setPointerCapture(e.pointerId)
    o.onActDown()
  })
  const up = (): void => o.onActUp()
  act.addEventListener('pointerup', up)
  act.addEventListener('pointercancel', up)
  build.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    o.onBuild()
  })
  document.body.append(bar, say, act, build)
  let sayTimer: ReturnType<typeof setTimeout> | undefined

  return {
    setItems(items, canBuild) {
      for (const { item, count } of items) {
        let slot = slots.get(item)
        if (slot === undefined) {
          slot = document.createElement('div')
          slot.className = 'hud-slot'
          slot.title = names.get(item) ?? item
          slot.innerHTML = `<img alt="" src="${icons.get(item) ?? ''}"><b></b>`
          bar.appendChild(slot)
          slots.set(item, slot)
        }
        const label = slot.querySelector('b')
        if (label) label.textContent = String(count)
        slot.style.display = count > 0 ? '' : 'none'
        if ((counts.get(item) ?? 0) < count) {
          slot.classList.remove('bump')
          void slot.offsetWidth
          slot.classList.add('bump')
        }
        counts.set(item, count)
      }
      build.classList.toggle('off', !canBuild)
    },
    setBuildMode(on) {
      build.classList.toggle('on', on)
    },
    say(text) {
      say.textContent = text
      say.style.opacity = '1'
      if (sayTimer) clearTimeout(sayTimer)
      sayTimer = setTimeout(() => (say.style.opacity = '0'), 1600)
    },
    dispose() {
      style.remove()
      bar.remove()
      say.remove()
      act.remove()
      build.remove()
    },
  }
}
