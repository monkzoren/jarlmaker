/**
 * Short-lived feedback in the world: chips flying off a hit, a pine toppling,
 * a prop shaking, "+1 Wood" rising from the player, and the lunge of a swing.
 * Presentation only; every effect is driven by a server row changing (or, for
 * the swing, by the local button press) and dies on its own.
 */
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'

interface Effect {
  readonly until: number
  step(nowMs: number): void
  destroy(): void
}

export interface Fx {
  /** Chips of `color` burst from the centre of cell (cx, cy) (px of the cell's centre). */
  chips(x: number, y: number, color: number, nowMs: number): void
  /** Shake a prop for a moment. */
  shake(target: Container, nowMs: number): void
  /** A copy of `texture` topples to the side and fades (a felled pine). */
  topple(texture: Texture, x: number, y: number, leftward: boolean, nowMs: number): void
  /** Text rising and fading from (x, y). */
  float(text: string, x: number, y: number, color: number, nowMs: number): void
  /** Lunge `target` 2 px towards (dx, dy) and back. */
  lunge(target: Container, dx: number, dy: number, nowMs: number): void
  update(nowMs: number): void
  destroy(): void
}

export function createFx(layer: Container, overlay: Container): Fx {
  const live: Effect[] = []
  /** Floating labels still rising, so a new one starts above the last instead of on top of it. */
  const rising: { until: number; y: number }[] = []
  const add = (e: Effect): void => {
    live.push(e)
  }
  return {
    chips(x, y, color, now) {
      const parts: { g: Graphics; vx: number; vy: number }[] = []
      for (let i = 0; i < 6; i++) {
        const g = new Graphics().rect(0, 0, 2, 2).fill(color)
        g.position.set(x, y)
        overlay.addChild(g)
        const a = (i / 6) * Math.PI * 2 + Math.random()
        parts.push({ g, vx: Math.cos(a) * (18 + Math.random() * 16), vy: -30 - Math.random() * 20 })
      }
      const start = now
      add({
        until: now + 450,
        step(t) {
          const s = (t - start) / 1000
          for (const p of parts) {
            p.g.position.set(Math.round(x + p.vx * s), Math.round(y + p.vy * s + 140 * s * s))
            p.g.alpha = 1 - (t - start) / 450
          }
        },
        destroy: () => parts.forEach((p) => p.g.destroy()),
      })
    },
    shake(target, now) {
      const x0 = target.x
      add({
        until: now + 180,
        step(t) {
          const k = (t - now) / 180
          target.x = x0 + Math.round(Math.sin(k * Math.PI * 6) * 2 * (1 - k))
        },
        destroy: () => {
          if (!target.destroyed) target.x = x0
        },
      })
    },
    topple(texture, x, y, leftward, now) {
      const s = new Sprite(texture)
      s.anchor.set(0.5, 1)
      s.position.set(x, y)
      s.zIndex = y
      layer.addChild(s)
      const dir = leftward ? -1 : 1
      add({
        until: now + 700,
        step(t) {
          const k = Math.min(1, (t - now) / 500)
          s.rotation = dir * (Math.PI / 2) * k * k
          s.alpha = t - now < 500 ? 1 : 1 - (t - now - 500) / 200
        },
        destroy: () => s.destroy(),
      })
    },
    float(text, x, y0, color, now) {
      for (let i = rising.length - 1; i >= 0; i--) if (rising[i]!.until < now) rising.splice(i, 1)
      const y = y0 - rising.length * 9
      rising.push({ until: now + 450, y })
      const label = new Text({
        text,
        style: { fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold', fill: color, stroke: { color: 0x1b1f22, width: 2 } },
        resolution: 4,
      })
      label.anchor.set(0.5, 1)
      label.position.set(x, y)
      overlay.addChild(label)
      add({
        until: now + 900,
        step(t) {
          const k = (t - now) / 900
          label.y = Math.round(y - 14 * k)
          label.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
        },
        destroy: () => label.destroy(),
      })
    },
    lunge(target, dx, dy, now) {
      const len = Math.hypot(dx, dy) || 1
      const ox = (dx / len) * 2
      const oy = (dy / len) * 2
      add({
        until: now + 160,
        step(t) {
          const k = Math.sin(((t - now) / 160) * Math.PI)
          target.pivot.set(-Math.round(ox * k), -Math.round(oy * k))
        },
        destroy: () => {
          if (!target.destroyed) target.pivot.set(0, 0)
        },
      })
    },
    update(now) {
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i]!
        if (now >= e.until) {
          e.destroy()
          live.splice(i, 1)
        } else e.step(now)
      }
    },
    destroy() {
      for (const e of live) e.destroy()
      live.length = 0
    },
  }
}
