// The scheduled tick (CLAUDE.md 3.4 The tick). `init` inserts one
// `tick_schedule` row repeating every 1/tickHz s (`content.tuning.net`,
// read from the content package because core registers no `net` schema yet);
// SpacetimeDB then calls `tick`, which runs `core.tick` with the fixed step
// `dtMs = 1000 / tickHz`, so the server integrates exactly like MemoryStore
// and the replay goldens. Only the scheduler may call it: a client call has
// `ctx.sender` != the module's own identity and is refused.

import { content } from '@bastion/content'
import { tick as coreTick } from '@bastion/core'
import { ScheduleAt } from 'spacetimedb'
import { SenderError } from 'spacetimedb/server'
import { game } from './host.ts'
import spacetimedb, { tickSchedule } from './schema.ts'
import { StdbStore } from './store.ts'

const MS_PER_S = 1000
const MICROS_PER_MS = 1000
const { tickHz } = content.tuning.net
if (!(Number.isFinite(tickHz) && tickHz > 0)) throw new Error(`tuning.net.tickHz must be > 0, got ${tickHz}`)
const dtMs = MS_PER_S / tickHz

export const init = spacetimedb.init((ctx) => {
  const every = BigInt(Math.round(dtMs * MICROS_PER_MS))
  ctx.db.tick_schedule.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(every) })
})

export const tick = spacetimedb.reducer({ onSchedule: tickSchedule }, { row: tickSchedule.rowType }, (ctx) => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('tick is called by the scheduler only')
  coreTick(game, new StdbStore(ctx), dtMs)
})
