/**
 * Client input (CLAUDE.md 3.5.10): keyboard (WASD/arrows) and a touch
 * virtual stick feed one `entity.move` stick. It is sampled at the tick rate
 * and sent to the sink only when it changes, since the server keeps the last
 * stick until told otherwise. Wiring the sink to the network is P0-015.
 */
import { createKeyboard, createTouchStick } from './devices.ts'
import { createNonceSource } from './nonce.ts'
import { combine, sameVector, ZERO } from './vector.ts'
import type { CommandSink, Input, InputOptions, MovePayload } from './types.ts'

export type { CommandSink, Input, InputKnobs, InputOptions, MoveCommand, MovePayload, NonceStorage } from './types.ts'
export { keyVector, stickVector, type HeldKeys } from './vector.ts'
export { createNonceSource, NONCE_KEY, type NonceSource } from './nonce.ts'

const MS_PER_SECOND = 1000

export function createInput(sink: CommandSink, options: InputOptions): Input {
  const { knobs } = options
  const keyTarget = options.keyTarget ?? window
  const keyboard = createKeyboard(keyTarget, window)
  const stick = createTouchStick(options.stickTarget ?? document.body, knobs)
  const nonces = createNonceSource(options.storage ?? window.sessionStorage, options.now ?? Date.now)
  let last: MovePayload = ZERO

  const sample = () => {
    const vec = combine(keyboard.read(), stick.read())
    if (sameVector(vec, last)) return
    last = vec
    sink.send({ nonce: nonces.next(), cmd: { kind: 'entity.move', ix: vec.ix, iy: vec.iy } })
  }
  const timer = setInterval(sample, MS_PER_SECOND / knobs.tickHz)

  return {
    sample,
    dispose() {
      clearInterval(timer)
      keyboard.dispose()
      stick.dispose()
    },
  }
}
