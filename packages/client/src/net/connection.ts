/**
 * The SpacetimeDB connection. Each link connects with the stored token (same
 * identity across reloads and reconnects; a token the server rejects is
 * forgotten, so the next link connects as a fresh identity), subscribes to the public entity
 * tables, and mirrors their rows into the one `SnapshotStore`. When the
 * subscription applies, the snapshot is reconciled against the server's rows
 * (rows deleted during a dropout go away; nothing is reloaded). The
 * reconnector (reconnect.ts) owns the link: it opens a new one after a drop,
 * replays queued commands, and sends `join`.
 *
 * `world_clock` is mirrored one microtask late, on purpose. The SDK applies a
 * whole websocket frame (possibly several server messages) synchronously and
 * resolves reducer promises in microtasks queued as it goes, so a `move` ack
 * handler that reads `snapshot.clock` sees the tick the server was on when
 * that move committed, not a later tick from the same frame (predict.ts).
 */
import { MS_PER_SECOND } from '@bastion/core'
import { DbConnection, type ErrorContext } from './bindings/index.ts'
import type { NetConfig } from './config.ts'
import type { NonceSource } from './nonce.ts'
import type { SnapshotStore } from './snapshot.ts'
import { createReconnector, type Link, type LinkHandlers, type PhaseInfo, type ReconnectKnobs, type Timers } from './reconnect.ts'
import type { ConnState } from './status.ts'
import { forgetRejectedToken, loadToken, saveToken, type TokenStorage } from './token.ts'

// TODO(P1-017): whole tables are fine for P0; replace with the 3x3 sector
// window (CLAUDE.md 3.6 rule 1) before anything else subscribes here.
export const SUBSCRIPTIONS = ['SELECT * FROM entity', 'SELECT * FROM entity_pos', 'SELECT * FROM world_clock'] as const

export interface NetDeps {
  readonly config: NetConfig
  readonly snapshot: SnapshotStore
  readonly nonces: NonceSource
  readonly storage: TokenStorage | undefined
  /** `tuning.net`: how long and how many commands to queue during a dropout. */
  readonly queue: { readonly seconds: number; readonly max: number }
  /** `tuning.net`: reconnect backoff, silence and connect timeouts. */
  readonly timing: Pick<ReconnectKnobs, 'backoffMinMs' | 'backoffMaxMs' | 'silenceMs' | 'connectTimeoutMs'>
  readonly onState: (s: ConnState) => void
  /** Called each time the `join` reducer commits (first connect and every reconnect). */
  readonly onJoined?: (identity: string) => void
  /** The dropout outlived the queue; `dropped` commands were discarded. */
  readonly onQueueDropped?: (dropped: number) => void
  /** Any row from the server on the live link, `world_clock` included (the play loop's silence freeze). */
  readonly onTraffic?: () => void
  readonly timers?: Timers
}

export interface Net {
  /**
   * Send `entity.move` while online; resolves when the server commits it, rejects
   * when it refuses. Never queued: refused with `MoveOffline` while dropped (ADR 0008).
   */
  move(nonce: number, ix: number, iy: number): Promise<void>
  disconnect(): void
}

export function connect(deps: NetDeps): Net {
  const { config, snapshot, nonces, queue, timing, onState, onJoined, onQueueDropped } = deps
  let identity = ''
  let phase: PhaseInfo['phase'] = 'connecting'
  const report = (): void => {
    if (phase === 'online' && identity !== '') onState({ kind: 'joined', identity, entities: snapshot.size })
  }
  snapshot.onChange(report)

  const reconnector = createReconnector({
    transport: (h) => openLink(deps, h, (id) => (identity = id)),
    nonces,
    knobs: {
      queueMs: queue.seconds * MS_PER_SECOND,
      queueMax: queue.max,
      backoffMinMs: timing.backoffMinMs,
      backoffMaxMs: timing.backoffMaxMs,
      silenceMs: timing.silenceMs,
      connectTimeoutMs: timing.connectTimeoutMs,
    },
    timers: deps.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    onPhase: (info) => {
      phase = info.phase
      switch (info.phase) {
        case 'connecting':
          onState({ kind: 'connecting', uri: config.uri })
          return
        case 'online':
          report()
          return
        case 'dropped':
          onState({ kind: 'dropped', queued: info.queued, attempt: info.attempt, reason: info.reason })
          return
        case 'reconnecting':
          onState({ kind: 'reconnecting', queued: info.queued, attempt: info.attempt })
          return
        case 'closed':
          onState({ kind: 'disconnected' })
      }
    },
    onJoined: (id) => {
      report()
      onJoined?.(id)
    },
    onExpired: (dropped) => onQueueDropped?.(dropped),
    onError: (reason) => onState({ kind: 'error', reason }),
  })

  // The browser's own hints that the network is back cut a long backoff short.
  const nudge = (): void => reconnector.nudge()
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') nudge()
  }
  if (typeof window !== 'undefined') window.addEventListener('online', nudge)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  return {
    move: (nonce, ix, iy) => reconnector.move(nonce, ix, iy),
    disconnect: () => {
      if (typeof window !== 'undefined') window.removeEventListener('online', nudge)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
      reconnector.close()
    },
  }
}

/** One socket: connect, subscribe, mirror rows, reconcile on apply. */
function openLink(deps: NetDeps, h: LinkHandlers, setIdentity: (id: string) => void): Link {
  const { config, snapshot, storage, onState } = deps
  // Row callbacks from a link the reconnector has abandoned must not touch the snapshot.
  let live = true
  const conn = DbConnection.builder()
    .withUri(config.uri)
    .withDatabaseName(config.moduleName)
    .withToken(loadToken(storage, config.tokenKey))
    .onConnect((c, id, token) => {
      if (!live) return
      saveToken(storage, config.tokenKey, token)
      const identity = id.toHexString()
      setIdentity(identity)
      onState({ kind: 'connected', identity })
      c.subscriptionBuilder()
        .onApplied(() => {
          if (!live) return
          snapshot.replace([...c.db.entity.iter()], [...c.db.entityPos.iter()])
          h.ready(identity)
        })
        .onError((ctx: ErrorContext) => {
          if (live) h.lost(`subscription: ${message(ctx.event)}`)
        })
        .subscribe([...SUBSCRIPTIONS])
    })
    .onConnectError((_ctx, err) => {
      if (!live) return
      // A rejected token is dropped here; the reconnector's next attempt then
      // loads none and the server issues a fresh identity (P0-042).
      forgetRejectedToken(storage, config.tokenKey, err)
      h.lost(message(err))
    })
    .onDisconnect((_ctx, err) => {
      if (live) h.lost(err === undefined ? undefined : message(err))
    })
    .build()

  // Every row the live link delivers is server traffic: it holds off the
  // reconnector's silence drop and the play loop's movement freeze.
  const traffic = (): void => {
    h.alive()
    deps.onTraffic?.()
  }
  conn.db.entity.onInsert((_ctx, row) => {
    if (!live) return
    traffic()
    snapshot.upsertEntity(row)
  })
  conn.db.entity.onUpdate((_ctx, _old, row) => {
    if (!live) return
    traffic()
    snapshot.upsertEntity(row)
  })
  conn.db.entity.onDelete((_ctx, row) => {
    if (!live) return
    traffic()
    snapshot.deleteEntity(row.id)
  })
  conn.db.entityPos.onInsert((_ctx, row) => {
    if (!live) return
    traffic()
    snapshot.upsertPos(row)
  })
  conn.db.entityPos.onUpdate((_ctx, _old, row) => {
    if (!live) return
    traffic()
    snapshot.upsertPos(row)
  })
  conn.db.entityPos.onDelete((_ctx, row) => {
    if (!live) return
    traffic()
    snapshot.deletePos(row.id)
  })
  const clock = (row: { tick: number }): void => {
    if (!live) return
    traffic()
    queueMicrotask(() => {
      if (live) snapshot.setClock(row.tick)
    })
  }
  conn.db.worldClock.onInsert((_ctx, row) => clock(row))
  conn.db.worldClock.onUpdate((_ctx, _old, row) => clock(row))

  return {
    move: (nonce, ix, iy) => conn.reducers.move({ nonce, ix, iy }),
    join: (nonce) => conn.reducers.join({ nonce }),
    close: () => {
      live = false
      conn.disconnect()
    },
  }
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
