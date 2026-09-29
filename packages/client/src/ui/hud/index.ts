/**
 * The survival HUD (CLAUDE.md 3.5.10), plain DOM over the canvas:
 * - an inventory bar (bottom centre): each held item's icon and count;
 * - two thumb buttons (bottom right): Act (hit what you face, or place in
 *   build mode) and Build (toggle build mode for the campfire, showing its cost
 *   and greyed out while you cannot afford it).
 * - three meters (top centre): health, warmth, food, pulsing when low;
 * - a banner for moments that matter (night falls, you froze).
 * Food slots are tappable (eat). Icons are the art package's pixel sources,
 * rasterized once to data URLs.
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
  /** Tapping an item's slot (eat it, if it is food). */
  readonly onSlot: (item: string) => void
  /** `tuning.survival.meterMax`. */
  readonly meterMax: number
}

export interface Hud {
  /** Redraw the bar and the build button from these counts. */
  setItems(items: readonly { readonly item: string; readonly count: number }[], canBuild: boolean): void
  /** Build mode on or off (the Build button lights up). */
  setBuildMode(on: boolean): void
  /** A short message above the bar (e.g. why a build was refused). */
  say(text: string): void
  /** The three meters. */
  setVitals(v: { readonly hp: number; readonly warmth: number; readonly food: number }): void
  /** A big line at the top of the screen for a moment ("Night falls"). */
  announce(title: string, sub?: string): void
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
#hud-meters{position:fixed;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:10px;pointer-events:none;z-index:2}
.hud-meter{display:flex;align-items:center;gap:3px}
.hud-meter img{width:24px;height:24px;image-rendering:pixelated}
.hud-meter .bar{width:64px;height:10px;background:#1b1f22cc;border:2px solid #1b1f22;border-radius:2px;overflow:hidden}
.hud-meter .fill{height:100%;transition:width .4s}
.hud-meter.low .bar{animation:hud-pulse .8s infinite alternate}
@keyframes hud-pulse{to{border-color:#e0702a;box-shadow:0 0 6px #e0702a}}
#hud-announce{position:fixed;left:50%;top:18%;transform:translateX(-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity .6s;z-index:2;font-family:Georgia,serif;color:#f4ead2;text-shadow:2px 2px 0 #1b1f22}
#hud-announce b{display:block;font-size:30px;letter-spacing:2px}
#hud-announce span{font:bold 13px monospace}
.hud-slot.food{pointer-events:auto;cursor:pointer}
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
  const food = new Set(o.items.filter((i) => i.food !== undefined).map((i) => i.id))
  const meters = document.createElement('div')
  meters.id = 'hud-meters'
  const meter = (icon: string, color: string): { el: HTMLElement; fill: HTMLElement } => {
    const el = document.createElement('div')
    el.className = 'hud-meter'
    el.innerHTML = `<img alt="" src="${iconUrl(ICONS[icon])}"><div class="bar"><div class="fill" style="background:${color}"></div></div>`
    meters.appendChild(el)
    return { el, fill: el.querySelector('.fill') as HTMLElement }
  }
  const hpMeter = meter('heart', '#c23b3b')
  const warmMeter = meter('warmth', '#f08a2c')
  const foodMeter = meter('berries', '#7d9bd0')
  const banner = document.createElement('div')
  banner.id = 'hud-announce'
  let bannerTimer: ReturnType<typeof setTimeout> | undefined
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
  document.body.append(bar, say, act, build, meters, banner)
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
          if (food.has(item)) {
            slot.classList.add('food')
            slot.title = `${names.get(item) ?? item}: tap or press F to eat`
            slot.addEventListener('pointerdown', (e) => {
              e.stopPropagation()
              e.preventDefault()
              o.onSlot(item)
            })
          }
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
    setVitals(v) {
      const set = (m: { el: HTMLElement; fill: HTMLElement }, x: number): void => {
        const pct = Math.max(0, Math.min(100, (x / o.meterMax) * 100))
        m.fill.style.width = `${pct}%`
        m.el.classList.toggle('low', pct < 25)
      }
      set(hpMeter, v.hp)
      set(warmMeter, v.warmth)
      set(foodMeter, v.food)
    },
    announce(title, sub) {
      banner.innerHTML = `<b></b><span></span>`
      const b = banner.querySelector('b')
      const s = banner.querySelector('span')
      if (b) b.textContent = title
      if (s) s.textContent = sub ?? ''
      banner.style.opacity = '1'
      if (bannerTimer) clearTimeout(bannerTimer)
      bannerTimer = setTimeout(() => (banner.style.opacity = '0'), 3200)
    },
    dispose() {
      meters.remove()
      banner.remove()
      style.remove()
      bar.remove()
      say.remove()
      act.remove()
      build.remove()
    },
  }
}
