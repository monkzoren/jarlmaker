// world commands (CLAUDE.md 3.4): player intents, validated as hostile.
//
//   world.harvest {cx, cy}   hit the harvestable prop on that cell
//
// Terrain itself is generated; every change is a `cell_delta` row.

import { z } from 'zod'
import { reject } from '../commands.ts'
import { playerOf } from '../entity/commands.ts'
import { sectorOf } from '../entity/rules.ts'
import { onEvent, registerCommand } from '../registry.ts'
import type { Store } from '../store/types.ts'
import '../structures/events.ts'
import '../structures/schema.ts'
import './events.ts'
import { deltaKey, liveWorld, reachSq, storeDeltas, terrainOf } from './rules.ts'
import './tables.ts'

declare module '../commands.ts' {
  interface CommandRegistry {
    'world.harvest': { cx: number; cy: number }
  }
}

/** Write the delta for (cx, cy). */
export function putDelta(store: Store, sectorSize: number, cx: number, cy: number, prop: string, hits: number, owner: string): void {
  const key = deltaKey(cx, cy)
  const row = { key, cx, cy, sector: sectorOf(cx, cy, sectorSize), prop, hits, owner }
  if (store.get('cell_delta', key) === undefined) store.insert('cell_delta', row)
  else store.update('cell_delta', row)
}

const cellSchema = z.object({ cx: z.int(), cy: z.int() }).strict()

registerCommand({
  kind: 'world.harvest',
  schema: cellSchema,
  handle: (ctx, cmd) => {
    const { store, game, sender, tick } = ctx
    const t = game.content.tuning.world
    const player = playerOf(store, sender)
    if (player === undefined) return reject('not_joined', 'send player.join first')
    const pos = store.get('entity_pos', player.id)
    if (pos === undefined) return reject('not_joined', 'player has no position')
    if (reachSq(pos.x, pos.y, cmd.cx, cmd.cy) > t.reachCells * t.reachCells) return reject('out_of_reach', 'that cell is too far away')
    const action = store.get('player_action', sender)
    if (action !== undefined && action.readyTick > tick) return reject('cooldown', 'still swinging')
    const cell = liveWorld(terrainOf(game), storeDeltas(store)).cell(cmd.cx, cmd.cy)
    const harvest = cell.prop?.harvest
    if (cell.prop === undefined || harvest === undefined || cell.covered) return reject('nothing_to_harvest', 'nothing to harvest there')

    const hits = cell.hits + 1
    const felled = hits >= harvest.hits
    putDelta(store, t.sectorSize, cmd.cx, cmd.cy, felled ? harvest.leaves : cell.prop.id, felled ? 0 : hits, cell.owner)
    const ready = { owner: sender, readyTick: tick + t.hitCooldownTicks }
    if (action === undefined) store.insert('player_action', ready)
    else store.update('player_action', ready)
    store.emit({ kind: 'world.harvested', tick, by: sender, prop: cell.prop.id, item: harvest.item, cx: cmd.cx, cy: cmd.cy, felled })
    return undefined
  },
})

// A structure occupies its cell: its prop is placed as a delta (structures/README).
onEvent('structure.built', (ctx, e) => {
  const def = ctx.game.content.structures.find((s) => s.id === e.def)
  if (def === undefined) return
  putDelta(ctx.store, ctx.game.content.tuning.world.sectorSize, e.cx, e.cy, def.prop, 0, e.by)
})
