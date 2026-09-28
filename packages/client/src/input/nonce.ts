// Command nonces (CLAUDE.md 3.6 rule 7). The server drops any nonce at or
// below the last one it accepted from this sender, so nonces must only go up:
// within a page, across a reconnect, and across a reload.
//
// The counter lives in sessionStorage, so a reload or reconnect continues it.
// A new tab starts with empty sessionStorage but the same identity, so the
// counter is also floored at the wall clock in ms: input emits at most one
// command per tick, far slower than the clock advances, so a fresh session
// always starts above anything an earlier one sent. (The column is f64.)

import type { NonceStorage } from './types.ts'

export const NONCE_KEY = 'bastion.input.nonce'

export interface NonceSource {
  next(): number
}

export function createNonceSource(storage: NonceStorage, now: () => number): NonceSource {
  let last = readStored(storage)
  return {
    next() {
      last = Math.max(last + 1, Math.floor(now()))
      try {
        storage.setItem(NONCE_KEY, String(last))
      } catch {
        // Storage full or blocked: the in-memory counter and the clock floor still hold.
      }
      return last
    },
  }
}

function readStored(storage: NonceStorage): number {
  let raw: string | null = null
  try {
    raw = storage.getItem(NONCE_KEY)
  } catch {
    return -1
  }
  const n = raw === null ? Number.NaN : Number(raw)
  return Number.isSafeInteger(n) && n >= 0 ? n : -1
}
