/**
 * Where the client connects. Values come from Vite env (`VITE_STDB_URI`,
 * `VITE_STDB_MODULE`); a dev server with neither set talks to the local
 * SpacetimeDB from `pnpm server:up` on the page's own host, so a phone on the
 * LAN reaches the laptop's server without extra config.
 */

export interface NetConfig {
  /** WebSocket base URI of the SpacetimeDB host, e.g. `ws://127.0.0.1:3000`. */
  readonly uri: string
  /** Database name the module is published as (`pnpm server:publish`). */
  readonly moduleName: string
  /**
   * Storage key for the auth token. Includes an optional `?profile=` so two
   * tabs in one browser can be two players.
   */
  readonly tokenKey: string
}

export interface NetEnv {
  readonly VITE_STDB_URI?: string | undefined
  readonly VITE_STDB_MODULE?: string | undefined
}

export const DEFAULT_MODULE = 'bastion'
export const DEFAULT_PORT = 3000

/** Pure: build the config from env and the page location. */
export function readNetConfig(env: NetEnv, location: Pick<Location, 'hostname' | 'protocol' | 'search'>): NetConfig {
  const moduleName = nonEmpty(env.VITE_STDB_MODULE) ?? DEFAULT_MODULE
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const host = location.hostname === '' ? '127.0.0.1' : location.hostname
  const uri = nonEmpty(env.VITE_STDB_URI) ?? `${scheme}://${host}:${DEFAULT_PORT}`
  const profile = nonEmpty(new URLSearchParams(location.search).get('profile') ?? undefined)
  const tokenKey = `bastion.token.${moduleName}${profile === undefined ? '' : `.${profile}`}`
  return { uri, moduleName, tokenKey }
}

function nonEmpty(v: string | undefined): string | undefined {
  const t = v?.trim()
  return t === undefined || t === '' ? undefined : t
}
