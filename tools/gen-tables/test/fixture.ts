// Fixture declarations covering every column type the generator maps. They are
// never registered, so the real registry (and the committed server file) stay
// untouched. `fixture.generated.ts` is their output; tsc checks it against the
// pinned spacetimedb types and generate.test.ts checks it is current.

import { defineTable } from '@bastion/core'
import { z } from 'zod'

export const every = defineTable({
  name: 'every_type',
  row: z.object({
    id: z.string(),
    flag: z.boolean(),
    small: z.int32(),
    count: z.uint32(),
    big: z.bigint(),
    ubig: z.uint64(),
    ratio: z.float32(),
    x: z.number(),
    whole: z.int(),
    kind: z.enum(['wall', 'door']),
    tag: z.literal('fixed'),
    note: z.string().optional(),
    list: z.array(z.int32()),
    stats: z.object({ hp: z.number(), resist: z.array(z.object({ element: z.string(), pct: z.number() })) }),
    level: z.int32().default(1),
    label: z.string().default("it's"),
  }),
  pk: 'id',
  indexes: [
    { name: 'by_kind', columns: ['kind'] },
    { name: 'by_small_count', columns: ['small', 'count'] },
  ],
})

export const counter = defineTable({ name: 'counter', row: z.object({ n: z.uint64(), at: z.number() }), pk: 'n' })

export const FIXTURE = [every, counter]
