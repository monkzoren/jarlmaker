// Run one script through `core.execute` / `core.tick` on MemoryStore and
// compare it with its golden. Pure apart from the files the CLI reads and
// writes, so the tests call it with a changed rule and read the diff.

import { currentTick, execute, TABLES, tick, type DispatchTable, type Game, type SystemTick } from '@bastion/core'
import { MemoryStore } from '@bastion/core/testing'
import { lineDiff } from './diff.ts'
import { canonical, formatResult, type Result, type Script } from './format.ts'
import { REPLAY_SYSTEMS } from './systems.ts'
import { TrackingStore } from './tracking-store.ts'

export interface RunOptions {
  /** Default: core's REGISTRY. */
  readonly registry?: DispatchTable
  /** Default: `REPLAY_SYSTEMS` (core's SYSTEM_TICKS). Tests pass a changed rule here. */
  readonly systems?: readonly SystemTick[]
}

export function runScript(game: Game, script: Script, options: RunOptions = {}): Result {
  const memory = new MemoryStore({ seed: script.seed, now: script.now })
  const host = new TrackingStore(memory, TABLES)
  const store = host.store
  const systems = options.systems ?? REPLAY_SYSTEMS
  const advanceTo = (target: number) => {
    while (currentTick(store) < target) {
      memory.advance(script.dtMs)
      tick(game, store, script.dtMs, { systems, ...(options.registry && { registry: options.registry }) })
    }
  }

  const rejections: { command: number; code: string; message: string }[] = []
  script.commands.forEach((c, i) => {
    advanceTo(c.atTick)
    const rejection = execute(game, store, c.sender, c.envelope, options.registry ? { registry: options.registry } : {})
    if (rejection !== undefined) rejections.push({ command: i, ...rejection })
  })
  advanceTo(script.endTick)

  return { tables: host.dump(), events: memory.events().map(canonical), rejections }
}

export interface Comparison {
  readonly ok: boolean
  /** The golden text this run produced. */
  readonly actual: string
  /** A unified-style line diff, `''` when equal. */
  readonly diff: string
}

export function compare(result: Result, golden: string | undefined): Comparison {
  const actual = formatResult(result)
  if (golden === actual) return { ok: true, actual, diff: '' }
  return { ok: false, actual, diff: lineDiff(golden ?? '', actual) }
}
