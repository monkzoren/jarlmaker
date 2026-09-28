// Commands: player intents (CLAUDE.md 3.4). Every command is validated as
// hostile by `core` (bounds, ownership, cost, cooldown, cap); hosts never
// validate. The kernel (P0-006) owns the runtime registry of handlers; this
// file owns the shapes.
//
// A system adds its commands by declaration merging, from its own folder.
// The key is the command `kind` (`<system>.<verb>`); the value is the payload
// without `kind`:
//
//   declare module '../commands.ts' {
//     interface CommandRegistry {
//       'entity.move': { dx: number; dy: number }
//     }
//   }

import { z } from 'zod'

/** kind -> payload. Empty in the contract; systems add members. */
export interface CommandRegistry {}

export type CommandKind = keyof CommandRegistry & string

export type Command = {
  [K in CommandKind]: { readonly kind: K } & Readonly<CommandRegistry[K]>
}[CommandKind]

/**
 * What a client sends. `nonce` increases per sender; the server rejects a
 * nonce at or below the last one it accepted, which makes reconnect replay
 * safe (3.6 rule 7).
 */
export interface CommandEnvelope<C = Command> {
  readonly nonce: number
  readonly cmd: C
}

/**
 * Wire shape of an envelope. Only the envelope is checked here; the payload
 * is checked by the schema its command kind registers with the kernel.
 */
export const commandEnvelopeSchema = z.object({
  nonce: z.int().nonnegative(),
  cmd: z.looseObject({ kind: z.string().min(1) }),
})

/**
 * Why a command was refused. `core` returns rejections as values so tests can
 * assert them; hosts throw on one so the reducer transaction rolls back.
 * `code` is a stable snake_case identifier; `message` is for humans.
 */
export interface Rejection {
  readonly code: string
  readonly message: string
}

export function reject(code: string, message: string): Rejection {
  return { code, message }
}
