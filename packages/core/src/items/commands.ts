// items commands and reactions (CLAUDE.md 3.4). No player command yet; items
// arrive and leave through events:
//
//   world.harvested  -> +1 of the harvested item
//   structure.built  -> -cost of the structure

import '../structures/events.ts'
import '../world/events.ts'
import { onEvent } from '../registry.ts'
import { addItem } from './rules.ts'

onEvent('world.harvested', (ctx, e) => addItem(ctx.store, e.by, e.item, 1))

onEvent('structure.built', (ctx, e) => {
  const def = ctx.game.content.structures.find((s) => s.id === e.def)
  if (def === undefined) return
  for (const [item, n] of Object.entries(def.cost)) addItem(ctx.store, e.by, item, -n)
})
