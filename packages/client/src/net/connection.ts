/**
 * The one SpacetimeDB connection. Connects with the stored token (same
 * identity across reloads), subscribes to the public entity tables, mirrors
 * their rows into a `SnapshotStore`, and calls `join` once the first
 * subscription has applied. Reconnect and command replay are P0-015; this
 * module reports a drop and stops.
 */
import { DbConnection, type ErrorContext } from './bindings/index.ts'
import type { NetConfig } from './config.ts'
import type { NonceSource } from './nonce.ts'
import type { SnapshotStore } from './snapshot.ts'
import type { ConnState } from './status.ts'
import { loadToken, saveToken, type TokenStorage } from './token.ts'

// TODO(P1-017): whole tables are fine for P0; replace with the 3x3 sector
// window (CLAUDE.md 3.6 rule 1) before anything else subscribes here.
export const SUBSCRIPTIONS = ['SELECT * FROM entity', 'SELECT * FROM entity_pos'] as const

export interface NetDeps {
  readonly config: NetConfig
  readonly snapshot: SnapshotStore
  readonly nonces: NonceSource
  readonly storage: TokenStorage | undefined
  readonly onState: (s: ConnState) => void
}

export interface Net {
  readonly conn: DbConnection
  disconnect(): void
}

export function connect(deps: NetDeps): Net {
  const { config, snapshot, nonces, storage, onState } = deps
  let identity = ''
  const report = (): void => {
    if (identity !== '') onState({ kind: 'joined', identity, entities: snapshot.size })
  }
  let joined = false

  onState({ kind: 'connecting', uri: config.uri })
  const conn = DbConnection.builder()
    .withUri(config.uri)
    .withDatabaseName(config.moduleName)
    .withToken(loadToken(storage, config.tokenKey))
    .onConnect((c, id, token) => {
      saveToken(storage, config.tokenKey, token)
      identity = id.toHexString()
      onState({ kind: 'connected', identity })
      c.subscriptionBuilder()
        .onApplied(() => {
          if (joined) return
          joined = true
          c.reducers.join({ nonce: nonces.next() }).then(report, (e: unknown) => {
            onState({ kind: 'error', reason: `join refused: ${message(e)}` })
          })
          report()
        })
        .onError((ctx: ErrorContext) => onState({ kind: 'error', reason: `subscription: ${message(ctx.event)}` }))
        .subscribe([...SUBSCRIPTIONS])
    })
    .onConnectError((_ctx, err) => onState({ kind: 'error', reason: message(err) }))
    .onDisconnect((_ctx, err) => onState({ kind: 'disconnected', reason: err === undefined ? undefined : message(err) }))
    .build()

  conn.db.entity.onInsert((_ctx, row) => snapshot.upsertEntity(row))
  conn.db.entity.onUpdate((_ctx, _old, row) => snapshot.upsertEntity(row))
  conn.db.entity.onDelete((_ctx, row) => snapshot.deleteEntity(row.id))
  conn.db.entityPos.onInsert((_ctx, row) => snapshot.upsertPos(row))
  conn.db.entityPos.onUpdate((_ctx, _old, row) => snapshot.upsertPos(row))
  conn.db.entityPos.onDelete((_ctx, row) => snapshot.deletePos(row.id))
  snapshot.onChange(report)

  return { conn, disconnect: () => conn.disconnect() }
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
