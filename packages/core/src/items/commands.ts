// items commands and reactions (CLAUDE.md 3.4). No player command yet; items
// arrive and leave through events:
//
//   world.harvested  -> +1 of the harvested item
//   structure.built  -> -cost of the structure
//   player.ate       -> -1 of the eaten item

import '../structures/events.ts'
import '../survival/events.ts'
import '../world/events.ts'
import { onEvent } from '../registry.ts'
import { addItem } from './rules.ts'

onEvent('world.harvested', (ctx, e) => addItem(ctx.store, e.by, e.item, 1))

onEvent('structure.built', (ctx, e) => {
  const def = ctx.game.content.structures.find((s) => s.id === e.def)
  if (def === undefined) return
  for (const [item, n] of Object.entries(def.cost)) addItem(ctx.store, e.by, item, -n)
})

onEvent('player.ate', (ctx, e) => addItem(ctx.store, e.owner, e.item, -1))
