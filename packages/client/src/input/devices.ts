// Device listeners. Each keeps its own state and exposes the current stick;
// sampling and emission live in `index.ts`.

import { keyVector, stickVector, ZERO, type HeldKeys } from './vector.ts'
import type { InputKnobs, MovePayload } from './types.ts'

type Dir = keyof HeldKeys

/** WASD and the arrow keys, by `KeyboardEvent.code` so layouts don't matter. */
const KEY_DIRS: Readonly<Record<string, Dir>> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

export interface Device {
  read(): MovePayload
  dispose(): void
}

export function createKeyboard(target: EventTarget, blurTarget: EventTarget): Device {
  const held = new Set<string>()
  const onDown = (e: Event) => {
    const code = (e as KeyboardEvent).code
    if (KEY_DIRS[code] === undefined) return
    held.add(code)
    e.preventDefault()
  }
  const onUp = (e: Event) => {
    held.delete((e as KeyboardEvent).code)
  }
  // A key released while the window is unfocused never fires keyup.
  const onBlur = () => held.clear()
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)
  blurTarget.addEventListener('blur', onBlur)
  return {
    read() {
      const keys = { up: false, down: false, left: false, right: false }
      for (const code of held) {
        const dir = KEY_DIRS[code]
        if (dir !== undefined) keys[dir] = true
      }
      return keyVector(keys)
    },
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      blurTarget.removeEventListener('blur', onBlur)
    },
  }
}

/**
 * A floating virtual stick: the first touch sets the origin, dragging from it
 * steers, lifting the finger centres the stick. Mouse pointers are ignored.
 */
export function createTouchStick(target: EventTarget, knobs: InputKnobs): Device {
  let active: { id: number; ox: number; oy: number } | undefined
  let vec: MovePayload = ZERO
  const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen'
  const onDown = (e: Event) => {
    const p = e as PointerEvent
    if (active !== undefined || !isTouch(p)) return
    active = { id: p.pointerId, ox: p.clientX, oy: p.clientY }
    vec = ZERO
  }
  const onMove = (e: Event) => {
    const p = e as PointerEvent
    if (active === undefined || p.pointerId !== active.id) return
    vec = stickVector(p.clientX - active.ox, p.clientY - active.oy, knobs.stickRadiusPx, knobs.deadZone)
    p.preventDefault()
  }
  const onEnd = (e: Event) => {
    if (active === undefined || (e as PointerEvent).pointerId !== active.id) return
    active = undefined
    vec = ZERO
  }
  const events: [string, (e: Event) => void][] = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onEnd],
    ['pointercancel', onEnd],
  ]
  for (const [name, fn] of events) target.addEventListener(name, fn)
  return {
    read: () => vec,
    dispose() {
      for (const [name, fn] of events) target.removeEventListener(name, fn)
    },
  }
}
