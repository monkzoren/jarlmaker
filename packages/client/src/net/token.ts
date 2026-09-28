/**
 * The SpacetimeDB auth token, kept so a reload (or a reconnect) is the same
 * identity and therefore the same player. Storage can be missing or throw
 * (private mode, blocked site data); then every load is a fresh identity.
 *
 * A token the server refuses to verify (its signing key changed, e.g. the
 * local data volume was wiped) is forgotten, so the next attempt connects
 * without one and gets a fresh identity. Any other failure keeps the token:
 * a network drop must never change who the player is.
 */

export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * The SDK exchanges the stored token for a short-lived websocket token before
 * connecting and throws `Failed to verify token: <HTTP status text>` when that
 * exchange is not OK (spacetimedb `sdk/ws.ts`). Only a 401 means the token
 * itself is bad; a 5xx or a proxy error says nothing about the token.
 */
const TOKEN_REJECTED = /^Failed to verify token: Unauthorized\b/

export function loadToken(storage: TokenStorage | undefined, key: string): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

export function saveToken(storage: TokenStorage | undefined, key: string, token: string): void {
  try {
    storage?.setItem(key, token)
  } catch {
    // Not persisted: the next load gets a new identity. Nothing else breaks.
  }
}

export function clearToken(storage: TokenStorage | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Still stored: the next attempt is refused again and clears again.
  }
}

/** Pure: does this connect error mean the server rejected the stored token? */
export function isTokenRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return TOKEN_REJECTED.test(msg)
}

/**
 * Called on every connect error: forgets the token when the server rejected
 * it, keeps it otherwise. Returns whether it was forgotten.
 */
export function forgetRejectedToken(storage: TokenStorage | undefined, key: string, err: unknown): boolean {
  if (!isTokenRejection(err)) return false
  clearToken(storage, key)
  return true
}
