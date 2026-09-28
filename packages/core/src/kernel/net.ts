// The `net` tuning section (CLAUDE.md 3.4 The tick, 3.6 rule 7). The kernel
// owns it because the server's tick rate and the client's reconnect queue
// are host concerns, not any one system's. Values live in
// `packages/content/tuning/net.ts`; hosts read them as
// `game.content.tuning.net` (ADR 0005).

import { z } from 'zod'
import { registerTuning } from '../game.ts'

export const netTuning = z.object({
  /** Server simulation rate, ticks per second. `dtMs = 1000 / tickHz`. */
  tickHz: z.number().positive(),
  /** Seconds the client keeps queued commands during a dropout before dropping them. */
  reconnectQueueSeconds: z.int().positive(),
  /** Hard cap on queued commands during a dropout. */
  reconnectQueueMax: z.int().positive(),
})
registerTuning('net', netTuning)

declare module '../game.ts' {
  interface TuningRegistry {
    net: z.output<typeof netTuning>
  }
}
