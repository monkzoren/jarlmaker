// `join`: create the sender's player entity (core `player.join`, idempotent).
import { t } from 'spacetimedb/server'
import { runCommand } from '../host.ts'
import spacetimedb from '../schema.ts'

export const join = spacetimedb.reducer({ nonce: t.f64() }, (ctx, { nonce }) => {
  runCommand(ctx, { nonce, cmd: { kind: 'player.join' } })
})
