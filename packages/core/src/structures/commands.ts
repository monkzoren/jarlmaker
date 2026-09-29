// structures commands (CLAUDE.md 3.4):
//
//   structure.build {def, cx, cy}   build `def` on that cell, paying its cost

import { z } from 'zod'
import { reject } from '../commands.ts'
import { playerOf } from '../entity/commands.ts'
import { canAfford } from '../items/rules.ts'
import { registerCommand } from '../registry.ts'
import { liveWorld, reachSq, storeDeltas, terrainOf } from '../world/rules.ts'
import './events.ts'
import { buildable } from './rules.ts'

declare module '../commands.ts' {
  interface CommandRegistry {
    'structure.build': { def: string; cx: number; cy: number }
  }
}

registerCommand({
  kind: 'structure.build',
  schema: z.object({ def: z.string().min(1).max(64), cx: z.int(), cy: z.int() }).strict(),
  handle: (ctx, cmd) => {
    const { store, game, sender, tick } = ctx
    const def = game.content.structures.find((s) => s.id === cmd.def)
    if (def === undefined) return reject('unknown_structure', `no structure "${cmd.def}"`)
    const player = playerOf(store, sender)
    if (player === undefined) return reject('not_joined', 'send player.join first')
    const pos = store.get('entity_pos', player.id)
    if (pos === undefined) return reject('not_joined', 'player has no position')
    const { reachCells } = game.content.tuning.world
    if (reachSq(pos.x, pos.y, cmd.cx, cmd.cy) > reachCells * reachCells) return reject('out_of_reach', 'that cell is too far away')
    if (Math.floor(pos.x) === cmd.cx && Math.floor(pos.y) === cmd.cy) return reject('occupied', 'you are standing there')
    if (!buildable(liveWorld(terrainOf(game), storeDeltas(store)).cell(cmd.cx, cmd.cy))) return reject('blocked', 'cannot build there')
    if (!canAfford(store, sender, def.cost)) return reject('cannot_afford', `not enough materials for ${def.name}`)
    store.emit({ kind: 'structure.built', tick, by: sender, def: def.id, cx: cmd.cx, cy: cmd.cy })
    return undefined
  },
})
