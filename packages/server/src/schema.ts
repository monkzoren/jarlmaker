// The module schema: core's tables (generated into `tables.ts`, never edited
// by hand) plus `tick_schedule`, the host-only row that drives the scheduled
// tick (`tick.ts`). `tick_schedule` holds no game state, so it is not a core
// table and never reaches `MemoryStore`.

import { schema, table, t } from 'spacetimedb/server'
import { tables } from './tables.ts'

export const tickSchedule = table(
  { name: 'tick_schedule' },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
)

const spacetimedb = schema({ ...tables, tick_schedule: tickSchedule })
export default spacetimedb
