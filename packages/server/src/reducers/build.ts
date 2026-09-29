// `build`: build a structure on a cell (core `structure.build`).
import { t } from 'spacetimedb/server'
import { runCommand } from '../host.ts'
import spacetimedb from '../schema.ts'

export const build = spacetimedb.reducer({ nonce: t.f64(), def: t.string(), cx: t.i32(), cy: t.i32() }, (ctx, { nonce, def, cx, cy }) => {
  runCommand(ctx, { nonce, cmd: { kind: 'structure.build', def, cx, cy } })
})
