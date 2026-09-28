/**
 * Reconnect is a feature, not an error path (CLAUDE.md 3.6 rule 7). This is
 * the connection state machine and the command queue, over an abstract
 * `Transport` so tests drive it with a fake server:
 *
 *   connecting -> online -> dropped -> reconnecting -> online
 *                             ^            |
 *                             +------------+  (attempt failed: back off, retry)
 *
 * Movement never queues (ADR 0008). `move` sets a stick *state* the server
 * integrates over its ticks, so replaying offline stick changes back to back
 * collapses a walk into a zero-length press. A `move` issued while not online
 * is refused with `MoveOffline`, and one still in flight when the link drops
 * is refused too. The play loop sends the current stick once after `join`
 * instead (play.ts).
 *
 * Every other command stays in the outbox from the moment it is issued until
 * the server acks or refuses it, so one that was in flight when the socket
 * died is replayed too. On reconnect the outbox is replayed oldest-first with
 * the nonces it was first sent with, then `join` is sent with a fresh (higher)
 * nonce. Core refuses a nonce at or below the last one it accepted
 * (`kernel/nonce.ts`), so a command whose ack was lost in the drop comes back
 * as `duplicate` and is not applied twice.
 *
 * While not online, commands queue. The queue holds at most `queueMax`
 * (the oldest is dropped first) and lives at most `queueMs`: past that the
 * whole queue is refused and `onExpired` fires (the toast).
 */
import type { NonceSource } from './nonce.ts'

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
export type Transport<L extends Link = Link> = (handlers: LinkHandlers) => L

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
  /** Commands waiting for the server (queued, or in flight when it dropped). Never moves. */
  readonly queued: number
  /** Reconnect attempts since the drop (0 while online). */
  readonly attempt: number
  readonly reason?: string | undefined
}

export interface ReconnectDeps<L extends Link = Link> {
  readonly transport: Transport<L>
  readonly nonces: NonceSource
  readonly knobs: ReconnectKnobs
  readonly timers: Timers
  readonly onPhase: (info: PhaseInfo) => void
  /** `join` committed: commands are accepted. Fires after every (re)connect. */
  readonly onJoined: (identity: string) => void
  /** The queue outlived `queueMs`; `dropped` commands were refused locally. */
  readonly onExpired: (dropped: number) => void
  readonly onError: (reason: string) => void
}

export interface Reconnector<L extends Link = Link> {
  /**
   * Sent only while online; resolves when the server commits the move, rejects
   * when it refuses it. Refused with `MoveOffline` while not online or when the
   * link drops before the ack (ADR 0008).
   */
  move(nonce: number, ix: number, iy: number): Promise<void>
  /**
   * Any other command: `call` sends it on a link. Queued across dropouts and
   * replayed on reconnect; resolves when the server commits it, rejects when it
   * (or the queue) refuses it.
   */
  command(call: (link: L) => Promise<void>): Promise<void>
  readonly phase: Phase
  readonly queued: number
  /**
   * The network is probably back (the browser went online, the tab came to the
   * front): skip the rest of the backoff and retry now.
   */
  nudge(): void
  close(): void
}

/** Why a queued command was refused without reaching the server. */
export class QueueDropped extends Error {}

/** Why a move was discarded: the link was down, or went down before the ack. */
export class MoveOffline extends Error {}

interface Entry<L> {
  readonly call: (link: L) => Promise<void>
  readonly resolve: () => void
  readonly reject: (e: unknown) => void
}

/** Pure: the wait before retry `attempt` (0-based), doubling from the floor to the ceiling. */
export function backoffMs(knobs: Pick<ReconnectKnobs, 'backoffMinMs' | 'backoffMaxMs'>, attempt: number): number {
  return Math.min(knobs.backoffMinMs * 2 ** attempt, knobs.backoffMaxMs)
}

export function createReconnector<L extends Link>(deps: ReconnectDeps<L>): Reconnector<L> {
  const { transport, nonces, knobs, timers, onPhase, onJoined, onExpired, onError } = deps
  const outbox: Entry<L>[] = []
  /** Moves sent on the current link and not yet answered. */
  const inflight = new Set<(e: unknown) => void>()
  let phase: Phase = 'connecting'
  let link: L | undefined
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
  const remove = (e: Entry<L>): boolean => {
    const i = outbox.indexOf(e)
    if (i < 0) return false
    outbox.splice(i, 1)
    return true
  }

  function send(e: Entry<L>): void {
    const l = link
    if (l === undefined) return
    const my = gen
    e.call(l).then(
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
    refuseInflight('the link dropped before the move was acked')
    const wait = backoffMs(knobs, attempt)
    attempt++
    setPhase('dropped', reason)
    armExpiry()
    retry = timers.set(open, wait)
  }

  function refuseInflight(why: string): void {
    const rejects = [...inflight]
    inflight.clear()
    for (const reject of rejects) reject(new MoveOffline(why))
  }

  open()

  return {
    move(nonce, ix, iy) {
      return new Promise<void>((resolve, reject) => {
        const l = link
        if (phase !== 'online' || l === undefined) {
          reject(new MoveOffline(`not online (${phase})`))
          return
        }
        const my = gen
        inflight.add(reject)
        l.move(nonce, ix, iy).then(
          () => {
            if (my === gen && inflight.delete(reject)) resolve()
          },
          (err: unknown) => {
            if (my === gen && inflight.delete(reject)) reject(err)
          },
        )
      })
    },
    command(call) {
      return new Promise<void>((resolve, reject) => {
        const e: Entry<L> = { call, resolve, reject }
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
      refuseInflight('connection closed')
      for (const e of outbox.splice(0)) e.reject(new QueueDropped('connection closed'))
      setPhase('closed')
    },
  }
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
