// The `net` tuning section (CLAUDE.md 3.4 The tick, 3.6 rule 7). The kernel
// owns it because the server's tick rate and the client's reconnect queue
// are host concerns, not any one system's. Values live in
// `packages/content/tuning/net.ts`; hosts read them as
// `game.content.tuning.net` (ADR 0005).

import { z } from 'zod'
import { registerTuning } from '../game.ts'

export const netTuning = z
  .object({
    /** Server simulation rate, ticks per second. `dtMs = 1000 / tickHz`. */
    tickHz: z.number().positive(),
    /** Seconds the client keeps queued commands during a dropout before dropping them. */
    reconnectQueueSeconds: z.int().positive(),
    /** Hard cap on queued commands during a dropout. */
    reconnectQueueMax: z.int().positive(),
    /** Delay before the first reconnect attempt, ms; each failed attempt doubles it. */
    reconnectBackoffMinMs: z.int().positive(),
    /** Ceiling the doubling backoff stops at, ms. Must be >= `reconnectBackoffMinMs`. */
    reconnectBackoffMaxMs: z.int().positive(),
    /** Ms with no server traffic after which the client treats the socket as dropped. */
    reconnectSilenceMs: z.int().positive(),
    /** Ms a connect attempt may take to become ready before it is abandoned and retried. */
    reconnectConnectTimeoutMs: z.int().positive(),
  })
  .refine((t) => t.reconnectBackoffMaxMs >= t.reconnectBackoffMinMs, {
    message: 'reconnectBackoffMaxMs must be >= reconnectBackoffMinMs',
    path: ['reconnectBackoffMaxMs'],
  })
registerTuning('net', netTuning)

declare module '../game.ts' {
  interface TuningRegistry {
    net: z.output<typeof netTuning>
  }
}
