/**
 * Survival on screen: the day's light, the meters, eating, and the few lines
 * that tell a castaway what the night means. Presentation only; the meters and
 * the clock come from the server (`player_vitals`, `world_clock`), and the day
 * is core's own `daylight` (ADR 0001).
 */
import { dayNumber, daylight, type ItemDef, type SurvivalTuning } from '@bastion/core'
import type { MirrorChange, WorldMirror } from '../net/index.ts'
import type { GameRenderer } from '../render/index.ts'
import type { Hud } from './hud/index.ts'

export interface SurvivalUiDeps {
  readonly tuning: SurvivalTuning
  readonly items: readonly ItemDef[]
  readonly mirror: WorldMirror
  readonly renderer: GameRenderer
  readonly hud: Hud
  /** The server tick (`world_clock`). */
  readonly clock: () => number
  readonly eat: (item: string) => Promise<void>
  readonly keyTarget?: EventTarget
}

export interface SurvivalUi {
  /** Call once per frame. */
  frame(): void
  /** React to a mirror change (vitals, items). */
  changed(c: MirrorChange): void
  /** Eat one of `item` (from a slot tap), or the first food held. */
  eat(item?: string): void
}

/** Below this share of warmth at night, the castaway is told to find a fire. */
const COLD_WARNING = 0.3
/** How long between two cold warnings, ms. */
const WARN_EVERY_MS = 20000

export function createSurvivalUi(d: SurvivalUiDeps): SurvivalUi {
  const food = d.items.filter((i) => i.food !== undefined)
  let lastLight: number | undefined
  let lastWarn = -Infinity
  let hintedFood = false

  const eat = (item?: string): void => {
    const pick = item ?? food.find((f) => d.mirror.count(f.id) > 0)?.id
    if (pick === undefined) {
      d.hud.say('Nothing to eat. Juniper bushes have berries.')
      return
    }
    const v = d.mirror.vitals
    if (v !== undefined && v.food >= d.tuning.meterMax) {
      d.hud.say('You are full')
      return
    }
    d.eat(pick).catch(() => d.hud.say('You are full'))
  }

  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent
    if (k.code === 'KeyF' && !k.repeat) eat()
  }
  ;(d.keyTarget ?? window).addEventListener('keydown', onKey)

  return {
    frame() {
      const tick = d.clock()
      const light = daylight(tick, d.tuning)
      d.renderer.setDaylight(light)
      if (lastLight !== undefined) {
        if (lastLight >= 0.99 && light < 0.99) d.hud.announce(`Night ${dayNumber(tick, d.tuning)} is coming`, 'Build a fire before the cold sets in (B)')
        if (lastLight < 0.5 && light >= 0.5) d.hud.announce('Dawn', 'The sun warms you again')
      }
      lastLight = light
      const v = d.mirror.vitals
      const now = performance.now()
      if (v !== undefined && light < 0.5 && v.warmth < d.tuning.meterMax * COLD_WARNING && now - lastWarn > WARN_EVERY_MS) {
        lastWarn = now
        d.hud.say(v.warmth <= 0 ? 'You are freezing! Get to a fire' : 'The cold bites. Stay close to a fire')
      }
    },
    changed(c) {
      if (c.kind === 'vitals') {
        d.hud.setVitals(c.vitals)
        const p = c.prev
        if (!c.quiet && p !== undefined && p.hp < d.tuning.meterMax / (1 + 1) && c.vitals.hp >= d.tuning.meterMax) {
          d.hud.announce('The cold took you', 'You wake on the beach by the wreck')
        }
        return
      }
      if (c.kind === 'item' && !c.quiet && !hintedFood && c.count > c.prev && food.some((f) => f.id === c.item)) {
        hintedFood = true
        d.hud.say('Press F (or tap the berries) to eat')
      }
    },
    eat,
  }
}
