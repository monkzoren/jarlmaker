// `harvest`: hit the harvestable prop on a cell (core `world.harvest`).
import { t } from 'spacetimedb/server'
import { runCommand } from '../host.ts'
import spacetimedb from '../schema.ts'

export const harvest = spacetimedb.reducer({ nonce: t.f64(), cx: t.i32(), cy: t.i32() }, (ctx, { nonce, cx, cy }) => {
  runCommand(ctx, { nonce, cmd: { kind: 'world.harvest', cx, cy } })
})
