// survival tick (CLAUDE.md 3.4, 3.5.7): once a second per player, spread
// over the ticks by bucket (this tick handles bucket `tick % vitalsBuckets`,
// read by index). Each player: daylight and nearby heat step the meters; at
// zero health `player.died` fires and the entity system respawns them.

import type { Game } from '../game.ts'
import { playerOf } from '../entity/commands.ts'
import { MS_PER_SECOND } from '../entity/schema.ts'
import type { Store } from '../store/types.ts'
import type { SystemTick, TickContext } from '../tick.ts'
import { heatAt, maxLightRadius, terrainOf, type PlacedDelta } from '../world/rules.ts'
import './events.ts'
import { daylight, freshVitals, stepVitals } from './rules.ts'
import './schema.ts'
import './tables.ts'

const radii = new WeakMap<Game, number>()

export function updateVitals(store: Store, game: Game, tick: number, dtMs: number): void {
  const t = game.content.tuning.survival
  let radius = radii.get(game)
  if (radius === undefined) {
    radius = maxLightRadius(game.content.props)
    radii.set(game, radius)
  }
  const dt = (dtMs * t.vitalsBuckets) / MS_PER_SECOND
  const light = daylight(tick, t)
  const terrain = terrainOf(game)
  const { sectorSize } = game.content.tuning.world
  const bySector = (sector: string): Iterable<PlacedDelta> => store.byIndex('cell_delta', 'by_sector', sector)
  for (const row of [...store.byIndex('player_vitals', 'by_bucket', tick % t.vitalsBuckets)]) {
    const player = playerOf(store, row.owner)
    const pos = player === undefined ? undefined : store.get('entity_pos', player.id)
    if (pos === undefined) continue
    const heat = radius > 0 ? heatAt(terrain, bySector, pos.x, pos.y, radius, sectorSize) : 0
    const { vitals, died } = stepVitals(row, dt, light, heat, t)
    const next = died ? freshVitals(t, vitals.food) : vitals
    store.update('player_vitals', { ...row, ...next })
    if (died) store.emit({ kind: 'player.died', tick, owner: row.owner, cause: 'cold' })
  }
}

export const survivalTick: SystemTick = {
  system: 'survival',
  run: (ctx: TickContext) => updateVitals(ctx.store, ctx.game, ctx.tick, ctx.dtMs),
}
