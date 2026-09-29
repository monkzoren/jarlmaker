// entity tick (CLAUDE.md 3.4): integrate every moving entity's input with
// `step`. The work list is the `entity_input.by_moving` index, so entities at
// rest cost nothing. `entity_pos` is written only when motion changed, and
// `entity` (the wide row) is never touched here.

import type { Game } from '../game.ts'
import type { Store } from '../store/types.ts'
import type { SystemTick, TickContext } from '../tick.ts'
import { atRest, step } from './rules.ts'
import type { StepKnobs } from './schema.ts'
import './events.ts'
import './tables.ts'
import '../world/schema.ts'
import { liveWorld, storeDeltas, terrainOf } from '../world/rules.ts'
import type { WorldView } from './world-view.ts'

export function stepKnobs(game: Game): StepKnobs {
  const { movement, world } = game.content.tuning
  return { ...movement, sectorSize: world.sectorSize }
}

/**
 * Move every entity with input or velocity by `dtMs`. `tick` (the world
 * clock's current tick, P0-025) stamps the events.
 */
export function moveEntities(store: Store, game: Game, dtMs: number, tick: number, world: WorldView = liveWorld(terrainOf(game), storeDeltas(store))): void {
  const knobs = stepKnobs(game)
  // Materialized first: the loop flips rows out of the index it iterates.
  for (const input of [...store.byIndex('entity_input', 'by_moving', true)]) {
    const pos = store.get('entity_pos', input.id)
    if (pos === undefined) {
      store.update('entity_input', { ...input, moving: false })
      continue
    }
    const next = step(pos, input, dtMs, world, knobs)
    if (next.x !== pos.x || next.y !== pos.y || next.vx !== pos.vx || next.vy !== pos.vy || next.facing !== pos.facing) {
      store.update('entity_pos', { id: pos.id, ...next })
    }
    if (next.sector !== pos.sector) {
      store.emit({ kind: 'entity.sector_changed', tick, entity: pos.id, from: pos.sector, to: next.sector })
    }
    if (atRest(next, input)) store.update('entity_input', { ...input, moving: false })
  }
}

/**
 * The `SYSTEM_TICKS` entry. The kernel passes the current tick in the context.
 */
export const entityTick: SystemTick = {
  system: 'entity',
  run: (ctx: TickContext) => moveEntities(ctx.store, ctx.game, ctx.dtMs, ctx.tick),
}
