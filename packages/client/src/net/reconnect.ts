/**
 * Reconnect is a feature, not an error path (CLAUDE.md 3.6 rule 7). This is
 * the connection state machine and the command queue, over an abstract
 * `Transport` so tests drive it with a fake server:
 *
 *   connecting -> online -> dropped -> reconnecting -> online
 *                             ^            |
 *                             +------------+  (attempt failed: back off, retry)
 *
 * Every move stays in the outbox from the moment it is issued until the
 * server acks or refuses it, so a move that was in flight when the socket
 * died is replayed too. On reconnect the outbox is replayed oldest-first with
 * the nonces it was first sent with, then `join` is sent with a fresh (higher)
 * nonce. Core refuses a nonce at or below the last one it accepted
 * (`kernel/nonce.ts`), so a move whose ack was lost in the drop comes back as
 * `duplicate` and is not applied twice.
 *
 * While not online, moves queue. The queue holds at most `queueMax` moves
 * (the oldest is dropped first) and lives at most `queueMs`: past that the
 * whole queue is refused and `onExpired` fires (the toast).
 */
import type { NonceSource } from './nonce.ts'

// TODO(P0-040): move these into `tuning.net`; the schema is core's.
export const RECONNECT_TIMING = {
  // First retry comes quickly: most drops are a tunnel or a network handoff
  // that is already over.
  backoffMinMs: 500,
  // Doubling stops here, so a long outage still retries every few seconds and
  // the player is back within one interval of the network returning.
  backoffMaxMs: 5000,
  // The server updates `world_clock` every tick. This long with no traffic
  // means the socket is dead even if the browser has not closed it.
  silenceMs: 3000,
  // An attempt that has not reached `ready` by now is abandoned and retried:
  // a connect into a dead network can hang far longer than the backoff.
  // Generous, so a slow phone handshake plus the first subscription fits.
  connectTimeoutMs: 8000,
} as const

/** One live socket to the server, as the reconnector needs it. */
export interface Link {
  move(nonce: number, ix: number, iy: number): Promise<void>
  join(nonce: number): Promise<void>
  close(): void
}

export interface LinkHandlers {
  /** Connected, subscribed, and the snapshot reconciled with the server. */
  ready(identity: string): void
  /** The socket closed, or never opened. */
  lost(reason: string | undefined): void
  /** Any server traffic; resets the silence timer. */
  alive(): void
}

/** Opens a new link. Called once per connection attempt. */
export type Transport = (handlers: LinkHandlers) => Link

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface ReconnectKnobs {
  readonly queueMs: number
  readonly queueMax: number
  readonly backoffMinMs: number
  readonly backoffMaxMs: number
  readonly silenceMs: number
  readonly connectTimeoutMs: number
}

export type Phase = 'connecting' | 'online' | 'dropped' | 'reconnecting' | 'closed'

export interface PhaseInfo {
  readonly phase: Phase
  /** Moves waiting for the server (queued, or in flight when it dropped). */
  readonly queued: number
  /** Reconnect attempts since the drop (0 while online). */
  readonly attempt: number
  readonly reason?: string | undefined
}

export interface ReconnectDeps {
  readonly transport: Transport
  readonly nonces: NonceSource
  readonly knobs: ReconnectKnobs
  readonly timers: Timers
  readonly onPhase: (info: PhaseInfo) => void
  /** `join` committed: moves are accepted. Fires after every (re)connect. */
  readonly onJoined: (identity: string) => void
  /** The queue outlived `queueMs`; `dropped` moves were refused locally. */
  readonly onExpired: (dropped: number) => void
  readonly onError: (reason: string) => void
}

export interface Reconnector {
  /** Resolves when the server commits the move, rejects when it (or the queue) refuses it. */
  move(nonce: number, ix: number, iy: number): Promise<void>
  readonly phase: Phase
  readonly queued: number
  /**
   * The network is probably back (the browser went online, the tab came to the
   * front): skip the rest of the backoff and retry now.
   */
  nudge(): void
  close(): void
}

/** Why a queued move was refused without reaching the server. */
export class QueueDropped extends Error {}

interface Entry {
  readonly nonce: number
  readonly ix: number
  readonly iy: number
  readonly resolve: () => void
  readonly reject: (e: unknown) => void
}

/** Pure: the wait before retry `attempt` (0-based), doubling from the floor to the ceiling. */
export function backoffMs(knobs: Pick<ReconnectKnobs, 'backoffMinMs' | 'backoffMaxMs'>, attempt: number): number {
  return Math.min(knobs.backoffMinMs * 2 ** attempt, knobs.backoffMaxMs)
}

export function createReconnector(deps: ReconnectDeps): Reconnector {
  const { transport, nonces, knobs, timers, onPhase, onJoined, onExpired, onError } = deps
  const outbox: Entry[] = []
  let phase: Phase = 'connecting'
  let link: Link | undefined
  /** Bumped whenever a link is abandoned, so its late callbacks are ignored. */
  let gen = 0
  let attempt = 0
  let everOnline = false
  let retry: unknown
  let expiry: unknown
  let silence: unknown

  const setPhase = (next: Phase, reason?: string): void => {
    phase = next
    onPhase({ phase, queued: outbox.length, attempt, reason })
  }
  const clearTimer = (h: unknown): undefined => {
    if (h !== undefined) timers.clear(h)
    return undefined
  }
  const remove = (e: Entry): boolean => {
    const i = outbox.indexOf(e)
    if (i < 0) return false
    outbox.splice(i, 1)
    return true
  }

  function send(e: Entry): void {
    const l = link
    if (l === undefined) return
    const my = gen
    l.move(e.nonce, e.ix, e.iy).then(
      () => {
        if (my === gen && remove(e)) e.resolve()
      },
      (err: unknown) => {
        if (my === gen && remove(e)) e.reject(err)
      },
    )
  }

  function armSilence(): void {
    silence = clearTimer(silence)
    if (phase === 'online') silence = timers.set(() => drop('no server traffic'), knobs.silenceMs)
  }

  function armExpiry(): void {
    if (expiry !== undefined || outbox.length === 0 || phase === 'online' || phase === 'closed') return
    expiry = timers.set(() => {
      expiry = undefined
      if (phase === 'online') return
      const dropped = outbox.splice(0)
      for (const e of dropped) e.reject(new QueueDropped('dropout outlived the reconnect queue'))
      onExpired(dropped.length)
      setPhase(phase)
    }, knobs.queueMs)
  }

  function open(): void {
    retry = undefined
    const my = ++gen
    setPhase(everOnline ? 'reconnecting' : 'connecting')
    silence = clearTimer(silence)
    silence = timers.set(() => drop('connect timed out'), knobs.connectTimeoutMs)
    link = transport({
      ready: (identity) => {
        if (my === gen) ready(identity)
      },
      lost: (reason) => {
        if (my === gen) drop(reason)
      },
      alive: () => {
        if (my === gen && phase === 'online') armSilence()
      },
    })
  }

  function ready(identity: string): void {
    const l = link
    if (l === undefined) return
    const my = gen
    // Oldest first, with their original nonces, then `join` above them all.
    for (const e of outbox) send(e)
    l.join(nonces.next()).then(
      () => {
        if (my === gen) onJoined(identity)
      },
      (err: unknown) => {
        if (my === gen) onError(`join refused: ${message(err)}`)
      },
    )
    everOnline = true
    attempt = 0
    expiry = clearTimer(expiry)
    setPhase('online')
    armSilence()
  }

  function drop(reason: string | undefined): void {
    if (phase === 'closed') return
    gen++
    silence = clearTimer(silence)
    link?.close()
    link = undefined
    const wait = backoffMs(knobs, attempt)
    attempt++
    setPhase('dropped', reason)
    armExpiry()
    retry = timers.set(open, wait)
  }

  open()

  return {
    move(nonce, ix, iy) {
      return new Promise<void>((resolve, reject) => {
        const e: Entry = { nonce, ix, iy, resolve, reject }
        if (phase === 'closed') {
          reject(new QueueDropped('connection closed'))
          return
        }
        outbox.push(e)
        if (phase === 'online') {
          send(e)
          return
        }
        if (outbox.length > knobs.queueMax) outbox.shift()?.reject(new QueueDropped('reconnect queue full'))
        armExpiry()
        onPhase({ phase, queued: outbox.length, attempt })
      })
    },
    get phase() {
      return phase
    },
    get queued() {
      return outbox.length
    },
    nudge() {
      if (phase !== 'dropped') return
      retry = clearTimer(retry)
      attempt = 0
      open()
    },
    close() {
      gen++
      retry = clearTimer(retry)
      expiry = clearTimer(expiry)
      silence = clearTimer(silence)
      link?.close()
      link = undefined
      for (const e of outbox.splice(0)) e.reject(new QueueDropped('connection closed'))
      setPhase('closed')
    },
  }
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
