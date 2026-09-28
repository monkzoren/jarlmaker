// What a smoke scenario (`tests/smoke/*.ts`) gets. A scenario drives the page
// like a player and waits on the server through the Recording: never on a
// fixed sleep where a server fact can be awaited instead.

import type { BrowserContext, Page } from 'playwright-core'
import type { Recording } from './recorder.ts'

export interface ScenarioContext {
  readonly page: Page
  readonly context: BrowserContext
  /** The server's transactions, live. */
  readonly recording: Recording
  log(line: string): void
  /** Resolve once `pred` holds on the recording (checked after every transaction). */
  until(what: string, pred: () => boolean, timeoutMs?: number): Promise<void>
  /** Resolve once the server has ticked `n` more times. */
  ticks(n: number): Promise<void>
}

export interface Scenario {
  readonly name: string
  run(ctx: ScenarioContext): Promise<void>
}

export class ScenarioError extends Error {}

const DEFAULT_TIMEOUT_MS = 15_000

export function waiters(recording: Recording): Pick<ScenarioContext, 'until' | 'ticks'> {
  const until: ScenarioContext['until'] = (what, pred, timeoutMs = DEFAULT_TIMEOUT_MS) =>
    new Promise<void>((resolve, reject) => {
      const check = (): boolean => {
        if (recording.failure !== undefined) {
          done()
          reject(recording.failure)
          return true
        }
        if (!pred()) return false
        done()
        resolve()
        return true
      }
      const timer = setTimeout(() => {
        done()
        reject(new ScenarioError(`timed out after ${timeoutMs} ms waiting for: ${what}`))
      }, timeoutMs)
      const off = recording.onChange(() => void check())
      const done = () => {
        clearTimeout(timer)
        off()
      }
      check()
    })
  return {
    until,
    ticks(n) {
      const target = recording.tick + n
      return until(`server tick ${target}`, () => recording.tick >= target)
    },
  }
}

/** Throw a ScenarioError unless `ok`. */
export function expect(ok: boolean, message: string): asserts ok {
  if (!ok) throw new ScenarioError(message)
}
