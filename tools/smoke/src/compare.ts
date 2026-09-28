// The host-glue check (CLAUDE.md 3.4 Replay test): the commands the server
// accepted, at the ticks it accepted them, become a replay script; the script
// runs through core on MemoryStore (@bastion/replay); the server's tables and
// MemoryStore's are both written in the golden format and diffed.
//
// Wall-clock ticks make the command timing differ run to run, so the golden
// is not a committed file here: it is the MemoryStore run of the script this
// server run recorded. Both sides are written to `out/` for review.
//
// What is compared: `tables` in full, and `rejections` (the server's are empty
// by construction, since a refused reducer rolls back and never reaches the
// recording, so any MemoryStore refusal is a divergence). `events` are left
// out: the server host drops its event log (packages/server/src/store.ts,
// no event table yet), so there is nothing to compare them with.

import type { Game } from '@bastion/core'
import { lineDiff } from '@bastion/replay/diff'
import { formatResult, scriptSchema, type Script } from '@bastion/replay/format'
import { runScript } from '@bastion/replay/run'
import type { RecordedCommand } from './recorder.ts'

export interface Snapshot {
  readonly commands: readonly RecordedCommand[]
  readonly tables: Readonly<Record<string, readonly unknown[]>>
  /** The server's `world_clock` tick when the snapshot was taken. */
  readonly tick: number
}

export interface HostComparison {
  readonly ok: boolean
  readonly script: Script
  /** Golden-format text of the server's tables. */
  readonly server: string
  /** Golden-format text of the same script on MemoryStore (events dropped, see header). */
  readonly memory: string
  /** `-` server, `+` MemoryStore; `''` when equal. */
  readonly diff: string
}

export function scriptFor(snapshot: Snapshot, opts: { dtMs: number; contentHash: string }): Script {
  return scriptSchema.parse({
    seed: 1,
    now: 0,
    contentHash: opts.contentHash,
    dtMs: opts.dtMs,
    endTick: snapshot.tick,
    commands: snapshot.commands,
  })
}

export function compareHosts(game: Game, snapshot: Snapshot, opts: { dtMs: number; contentHash: string }): HostComparison {
  const script = scriptFor(snapshot, opts)
  const replayed = runScript(game, script)
  const server = formatResult({ tables: snapshot.tables, events: [], rejections: [] })
  const memory = formatResult({ tables: replayed.tables, events: [], rejections: replayed.rejections })
  return { ok: server === memory, script, server, memory, diff: server === memory ? '' : lineDiff(server, memory) }
}
