// `eat`: eat one food item from the pack (core `player.eat`).
import { t } from 'spacetimedb/server'
import { runCommand } from '../host.ts'
import spacetimedb from '../schema.ts'

export const eat = spacetimedb.reducer({ nonce: t.f64(), item: t.string() }, (ctx, { nonce, item }) => {
  runCommand(ctx, { nonce, cmd: { kind: 'player.eat', item } })
})
