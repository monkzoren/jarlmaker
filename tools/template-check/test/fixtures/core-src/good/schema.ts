// fixture: a tuning section and a table row, both documented in README ## Data.
import { z } from 'zod'

export const lanternTuning = z.object({ radius: z.number(), fuelPerSecond: z.number() }).refine((t) => t.radius > 0)
export const lantern = { name: 'lantern', row: z.object({ id: z.bigint(), lit: z.boolean() }), pk: 'id' }
/** Not a Zod object: ignored. */
export const LANTERN_KINDS = ['oil', 'rune'] as const
