// `move`: set the sender's move stick (core `entity.move`); the tick integrates it.
import { t } from 'spacetimedb/server'
import { runCommand } from '../host.ts'
import spacetimedb from '../schema.ts'

export const move = spacetimedb.reducer({ nonce: t.f64(), ix: t.f64(), iy: t.f64() }, (ctx, { nonce, ix, iy }) => {
  runCommand(ctx, { nonce, cmd: { kind: 'entity.move', ix, iy } })
})
