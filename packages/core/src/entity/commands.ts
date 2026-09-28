// entity commands (CLAUDE.md 3.4): player intents, validated as hostile.
// Authority is always `ctx.sender`; no command names an entity id, so a
// client can only ever move its own player.
//
//   player.join   {}          create this sender's player (idempotent)
//   entity.move   {ix, iy}    set this sender's move stick (clamped to |v| <= 1)

import { z } from 'zod'
import { reject } from '../commands.ts'
import { registerCommand, type CommandContext } from '../registry.ts'
import type { Row, Store } from '../store/types.ts'
import { clampInput, sectorOf } from './rules.ts'
import './tables.ts'

declare module '../commands.ts' {
  interface CommandRegistry {
    'player.join': Record<never, never>
    'entity.move': { ix: number; iy: number }
  }
}

/** The def id every player entity carries. */
export const PLAYER_DEF = 'player'
/** Faction of player entities (PvP is not a launch feature; ADR 0004). */
export const PLAYER_FACTION = 'players'
/** New players start at the origin. */
const SPAWN = { x: 0, y: 0 } as const
const ENTITY_SEQ = 'entity'

/** The sender's player entity, via the `owner` index. */
export function playerOf(store: Store, sender: string): Readonly<Row<'entity'>> | undefined {
  for (const row of store.byIndex('entity', 'by_owner', sender)) {
    if (row.kind === 'player') return row
  }
  return undefined
}

/** Hand out the next entity id (ids start at 1; 0 is never an entity). */
export function nextEntityId(store: Store): bigint {
  const seq = store.get('entity_seq', ENTITY_SEQ)
  const id = seq === undefined ? 1n : seq.next
  const row = { name: ENTITY_SEQ, next: id + 1n }
  if (seq === undefined) store.insert('entity_seq', row)
  else store.update('entity_seq', row)
  return id
}

export function joinPlayer(ctx: CommandContext): void {
  const { store, sender, game } = ctx
  if (playerOf(store, sender) !== undefined) return
  const id = nextEntityId(store)
  store.insert('entity', { id, kind: 'player', def: PLAYER_DEF, owner: sender, level: 1, faction: PLAYER_FACTION })
  store.insert('entity_pos', {
    id,
    ...SPAWN,
    vx: 0,
    vy: 0,
    facing: 0,
    sector: sectorOf(SPAWN.x, SPAWN.y, game.content.tuning.world.sectorSize),
  })
}

registerCommand({
  kind: 'player.join',
  schema: z.object({}).strict() as unknown as z.ZodType<Record<never, never>>,
  handle: (ctx) => joinPlayer(ctx),
})

registerCommand({
  kind: 'entity.move',
  // z.number() refuses NaN and ±Infinity; the magnitude is clamped, not refused.
  schema: z.object({ ix: z.number(), iy: z.number() }).strict(),
  handle: (ctx, cmd) => {
    const player = playerOf(ctx.store, ctx.sender)
    if (player === undefined) return reject('not_joined', 'send player.join before entity.move')
    const { ix, iy } = clampInput(cmd)
    const row = { id: player.id, ix, iy, moving: true }
    if (ctx.store.get('entity_input', player.id) === undefined) ctx.store.insert('entity_input', row)
    else ctx.store.update('entity_input', row)
    return undefined
  },
})
