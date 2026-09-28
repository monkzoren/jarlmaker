// The shared body of every command reducer (CLAUDE.md 3.4 Hosts): build a
// StdbStore over `ctx`, run `core.execute` with `ctx.sender` as the only
// authority, and throw a `SenderError` on a rejection so the transaction
// rolls back (ADR 0006). Hosts never validate; core does.

import { content } from '@bastion/content'
import { createGame, execute, type CommandEnvelope } from '@bastion/core'
import type { Identity } from 'spacetimedb'
import { SenderError } from 'spacetimedb/server'
import { StdbStore, type HostCtx } from './store.ts'

/** Validated, frozen content, built once per module instance (ADR 0005). */
export const game = createGame(content)

type Ctx = HostCtx & { readonly sender: Identity }

/** Run one command envelope from `ctx.sender`; throws `SenderError` on rejection. */
export function runCommand(ctx: Ctx, envelope: CommandEnvelope): void {
  const rejection = execute(game, new StdbStore(ctx), ctx.sender.toHexString(), envelope)
  if (rejection !== undefined) throw new SenderError(`${rejection.code}: ${rejection.message}`)
}
