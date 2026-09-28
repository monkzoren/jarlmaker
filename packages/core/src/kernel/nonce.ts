// Command nonce dedupe (CLAUDE.md 3.6 rule 7). Every envelope carries a
// per-sender nonce that only goes up. On reconnect the client replays its
// queue; anything the server already accepted comes back with a nonce at or
// below the last accepted one and is rejected as `duplicate`. The row is
// written only when a command is accepted, so a rejected command (rolled back
// on the server) may be sent again with the same nonce.

import { z } from 'zod'
import type { Store } from '../store/types.ts'
import { defineTable, registerTables } from '../store/tables.ts'

export const commandNonce = defineTable({
  name: 'command_nonce',
  row: z.object({ sender: z.string(), nonce: z.int().nonnegative() }),
  pk: 'sender',
})
registerTables(commandNonce)

declare module '../store/tables.ts' {
  interface TableRegistry {
    command_nonce: typeof commandNonce
  }
}

/** True when `nonce` is not above the last nonce accepted from `sender`. */
export function isDuplicate(store: Store, sender: string, nonce: number): boolean {
  const last = store.get('command_nonce', sender)
  return last !== undefined && nonce <= last.nonce
}

export function recordNonce(store: Store, sender: string, nonce: number): void {
  const row = { sender, nonce }
  if (store.get('command_nonce', sender) === undefined) store.insert('command_nonce', row)
  else store.update('command_nonce', row)
}
