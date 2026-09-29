// survival commands and reactions (CLAUDE.md 3.4):
//
//   player.eat {item}   eat one of `item` (it must be food and in your pack)
//
// Reactions: `player.joined` gives the new player their meters.

import { z } from 'zod'
import { reject } from '../commands.ts'
import '../entity/events.ts'
import { countOf } from '../items/rules.ts'
import '../items/schema.ts'
import { onEvent, registerCommand } from '../registry.ts'
import './events.ts'
import { bucketOf, freshVitals } from './rules.ts'
import './schema.ts'
import './tables.ts'

declare module '../commands.ts' {
  interface CommandRegistry {
    'player.eat': { item: string }
  }
}

onEvent('player.joined', (ctx, e) => {
  const t = ctx.game.content.tuning.survival
  if (ctx.store.get('player_vitals', e.owner) !== undefined) return
  // A newcomer arrives warm, whatever the hour.
  ctx.store.insert('player_vitals', { owner: e.owner, bucket: bucketOf(e.owner, t.vitalsBuckets), ...freshVitals(t), warmth: t.meterMax })
})

registerCommand({
  kind: 'player.eat',
  schema: z.object({ item: z.string().min(1).max(64) }).strict(),
  handle: (ctx, cmd) => {
    const { store, game, sender, tick } = ctx
    const def = game.content.items.find((i) => i.id === cmd.item)
    if (def?.food === undefined) return reject('not_food', `${cmd.item} is not food`)
    const vitals = store.get('player_vitals', sender)
    if (vitals === undefined) return reject('not_joined', 'send player.join first')
    if (countOf(store, sender, cmd.item) < 1) return reject('none_left', `no ${def.name} left`)
    if (vitals.food >= game.content.tuning.survival.meterMax) return reject('full', 'you are full')
    store.update('player_vitals', { ...vitals, food: Math.min(game.content.tuning.survival.meterMax, vitals.food + def.food) })
    store.emit({ kind: 'player.ate', tick, owner: sender, item: cmd.item })
    return undefined
  },
})
