/**
 * The act/build controller: turns the Act button (Space or E, or the thumb
 * button) and the Build toggle (B, or its button; Esc leaves) into
 * `world.harvest` and `structure.build` commands aimed at the cell core's
 * `actionTarget` picks, and tells the renderer what to highlight.
 * Holding Act keeps swinging at the cooldown's pace. The server re-checks
 * every command (reach, cooldown, cost); this only aims.
 */
import { actionTarget, affords, buildable, type LiveWorld, type StructureDef } from '@bastion/core'

export interface ActionDeps {
  readonly world: LiveWorld
  readonly structure: StructureDef
  /** Reach and swing pace from `tuning.world`. */
  readonly reachCells: number
  readonly swingMs: number
  readonly pose: () => { readonly x: number; readonly y: number; readonly facing: number } | undefined
  readonly count: (item: string) => number
  readonly harvest: (cx: number, cy: number) => Promise<void>
  readonly build: (def: string, cx: number, cy: number) => Promise<void>
  /** Feedback hooks. */
  readonly onTarget: (t: { cx: number; cy: number; mode: 'hit' | 'build'; sprite?: string } | undefined) => void
  readonly onSwing: (cx: number, cy: number) => void
  readonly onBuildMode: (on: boolean) => void
  readonly onRefused: (why: string) => void
  readonly now?: () => number
  readonly keyTarget?: EventTarget
}

export interface Actions {
  /** Recompute the target; call once per frame. */
  frame(): void
  actDown(): void
  actUp(): void
  toggleBuild(): void
  dispose(): void
}

const ACT_KEYS = new Set(['Space', 'KeyE', 'Enter'])

export function createActions(d: ActionDeps): Actions {
  const now = d.now ?? (() => performance.now())
  let building = false
  let holding = false
  let lastSwing = -Infinity
  let target: { cx: number; cy: number } | undefined

  const setBuilding = (on: boolean): void => {
    building = on
    d.onBuildMode(on)
  }
  const aim = (): void => {
    const p = d.pose()
    if (p === undefined) {
      target = undefined
      d.onTarget(undefined)
      return
    }
    const own = { cx: Math.floor(p.x), cy: Math.floor(p.y) }
    target = building
      ? actionTarget(d.world, p.x, p.y, p.facing, d.reachCells, (c) => buildable(c))
      : actionTarget(d.world, p.x, p.y, p.facing, d.reachCells, (c) => c.prop?.harvest !== undefined && !c.covered)
    if (target !== undefined && building && target.cx === own.cx && target.cy === own.cy) target = undefined
    d.onTarget(target === undefined ? undefined : { ...target, mode: building ? 'build' : 'hit', sprite: building ? d.structure.prop : undefined })
  }
  const act = (): void => {
    const t = now()
    if (t - lastSwing < d.swingMs) return
    aim()
    if (target === undefined) return
    lastSwing = t
    const { cx, cy } = target
    if (building) {
      if (!affords(d.count, d.structure.cost)) {
        d.onRefused(`Need ${Object.entries(d.structure.cost).map(([i, n]) => `${n} ${i}`).join(' and ')}`)
        return
      }
      d.onSwing(cx, cy)
      d.build(d.structure.id, cx, cy).then(
        () => setBuilding(false),
        () => d.onRefused('Cannot build there'),
      )
      return
    }
    d.onSwing(cx, cy)
    d.harvest(cx, cy).catch(() => undefined)
  }

  const keyTarget = d.keyTarget ?? window
  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent
    if (k.repeat) return
    if (ACT_KEYS.has(k.code)) {
      k.preventDefault()
      holding = e.type === 'keydown'
      if (holding) act()
    } else if (k.code === 'KeyB' && e.type === 'keydown') setBuilding(!building)
    else if (k.code === 'Escape' && e.type === 'keydown') setBuilding(false)
  }
  keyTarget.addEventListener('keydown', onKey)
  keyTarget.addEventListener('keyup', onKey)

  return {
    frame() {
      aim()
      if (holding && !building) act()
    },
    actDown() {
      holding = true
      act()
    },
    actUp() {
      holding = false
    },
    toggleBuild() {
      setBuilding(!building)
    },
    dispose() {
      keyTarget.removeEventListener('keydown', onKey)
      keyTarget.removeEventListener('keyup', onKey)
    },
  }
}
