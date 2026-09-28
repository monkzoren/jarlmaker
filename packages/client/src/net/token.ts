/**
 * The SpacetimeDB auth token, kept so a reload (or a reconnect) is the same
 * identity and therefore the same player. Storage can be missing or throw
 * (private mode, blocked site data); then every load is a fresh identity.
 */

export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

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
