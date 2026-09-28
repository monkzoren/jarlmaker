// `execute`: run one Command envelope from `sender` (CLAUDE.md 3.4 Hosts).
// Every input is hostile. Returns a `Rejection` as a value and never throws on
// bad input; the host throws on a rejection so the reducer transaction rolls
// back. Order: envelope shape, nonce, command kind, payload schema, handler,
// then record the nonce and dispatch the handler's events. The handler and
// the event handlers see the current tick (`world_clock`), read once.

import { commandEnvelopeSchema, reject, type Rejection } from './commands.ts'
import { dispatch } from './dispatch.ts'
import type { Game } from './game.ts'
import { currentTick } from './kernel/clock.ts'
import { isDuplicate, recordNonce } from './kernel/nonce.ts'
import { StepStore } from './kernel/step-store.ts'
import { REGISTRY, type DispatchTable } from './registry.ts'
import type { Store } from './store/types.ts'
import type { z } from 'zod'

export interface ExecuteOptions {
  /** Default: the game's `REGISTRY`. Tests pass their own. */
  readonly registry?: DispatchTable
}

function describe(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ')
}

/** `undefined` when the command was accepted, else why it was refused. */
export function execute(
  game: Game,
  store: Store,
  sender: string,
  envelope: unknown,
  options: ExecuteOptions = {},
): Rejection | undefined {
  const registry = options.registry ?? REGISTRY
  const parsed = commandEnvelopeSchema.safeParse(envelope)
  if (!parsed.success) return reject('bad_envelope', describe(parsed.error))
  const { nonce, cmd } = parsed.data

  if (isDuplicate(store, sender, nonce)) return reject('duplicate', `nonce ${nonce} was already accepted from this sender`)

  const def = registry.commandDef(cmd.kind)
  if (def === undefined) return reject('unknown_command', `unknown command kind "${cmd.kind}"`)

  const { kind, ...raw } = cmd
  const payload = def.schema.safeParse(raw)
  if (!payload.success) return reject('bad_payload', `${kind}: ${describe(payload.error)}`)

  const step = new StepStore(store)
  const tick = currentTick(store)
  const rejection = def.handle({ game, store: step, sender, tick }, { ...(payload.data as object), kind })
  if (rejection !== undefined) return rejection

  recordNonce(store, sender, nonce)
  dispatch(registry, { game, store: step, tick }, step)
  return undefined
}
