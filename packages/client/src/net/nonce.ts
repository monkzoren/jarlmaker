/**
 * Command nonces (CLAUDE.md 3.6 rule 7). Core refuses any nonce at or below
 * the last one accepted from this identity, and the identity survives reloads
 * (token.ts), so a counter from 1 would be refused after a reload. Wall-clock
 * milliseconds, bumped to stay strictly increasing, are always above what an
 * earlier session sent. Integers well inside f64's exact range.
 */

export interface NonceSource {
  next(): number
}

export function createNonceSource(now: () => number = Date.now): NonceSource {
  let last = 0
  return {
    next() {
      last = Math.max(last + 1, Math.floor(now()))
      return last
    },
  }
}
