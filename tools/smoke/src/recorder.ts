// What the server did, read from the outside. `spacetime subscribe` (as the
// database owner, so private tables are visible) prints one JSON line per
// committed transaction: `{table: {deletes: [...], inserts: [...]}}`. The
// first line is the initial state. From that stream this rebuilds:
//
// - the server's tables, in the replay golden format (rows canonical, sorted
//   by primary key), at any transaction boundary;
// - the command script the server actually ran: every transaction that moved
//   a sender's `command_nonce` is one accepted command, run at the
//   `world_clock` tick that was current when it committed (a replay command
//   `atTick` N runs after tick N, before tick N+1: the same place).
//
// A command transaction is classified by what it wrote: a new `entity` owned
// by the sender is `player.join`; a new `entity_input` row is `entity.move`
// with that (already clamped, so idempotent) stick. Anything else changed
// nothing but the nonce, which is exactly what a re-join, or a move repeating
// the stick the player already holds, does; it is recorded as `player.join`,
// which has that same effect on a joined player.
//
// Refused commands roll back, so they never appear here. Transactions that
// write `world_clock` are ticks. Nothing else writes on P0's server; an
// unknown transaction is an error, not a guess.

import type { TableDef } from '@bastion/core'
import { canonical } from '@bastion/replay/format'

type AnyRow = Record<string, unknown>

interface TableChange {
  readonly deletes: readonly AnyRow[]
  readonly inserts: readonly AnyRow[]
}

export interface RecordedCommand {
  readonly atTick: number
  readonly sender: string
  readonly envelope: { readonly nonce: number; readonly cmd: Readonly<Record<string, unknown>> }
}

const CLOCK = 'world_clock'
const NONCE = 'command_nonce'

function comparePk(a: unknown, b: unknown): number {
  if (typeof a === typeof b) return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0
  return typeof a < typeof b ? -1 : 1
}

function key(pk: unknown): string {
  return typeof pk === 'bigint' ? `${pk}n` : JSON.stringify(pk)
}

export class Recording {
  private readonly rows = new Map<string, Map<string, AnyRow>>()
  private readonly cmds: RecordedCommand[] = []
  private clock = 0
  private lines = 0
  private readonly listeners = new Set<() => void>()
  private error: Error | undefined

  constructor(private readonly tables: ReadonlyMap<string, TableDef>) {}

  /** Tables to subscribe to: every core table. */
  get queries(): string[] {
    return [...this.tables.keys()].sort().map((t) => `SELECT * FROM ${t}`)
  }

  /** The `world_clock` tick after the last transaction applied. */
  get tick(): number {
    return this.clock
  }

  /** Transactions applied, the initial state included. */
  get transactions(): number {
    return this.lines
  }

  get commands(): readonly RecordedCommand[] {
    return this.cmds
  }

  /** Set when the stream broke (bad line, subscriber died); nothing is applied after it. */
  get failure(): Error | undefined {
    return this.error
  }

  fail(e: unknown): void {
    this.error ??= e instanceof Error ? e : new Error(String(e))
    for (const fn of this.listeners) fn()
  }

  /** Called after every applied transaction, and once on failure. Returns an unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Current row by table and primary key (a bigint pk for i64 columns). */
  get(table: string, pk: unknown): Readonly<AnyRow> | undefined {
    return this.rows.get(table)?.get(key(pk))
  }

  /** Feed one line of `spacetime subscribe` output. Non-JSON lines (the CLI's banner) are ignored. */
  push(line: string): void {
    const text = line.trim()
    if (!text.startsWith('{')) return
    const tx = JSON.parse(text) as Record<string, TableChange>
    const changes = Object.entries(tx).map(([t, c]) => ({ t, deletes: c.deletes.map((r) => this.row(t, r)), inserts: c.inserts.map((r) => this.row(t, r)) }))
    const first = this.lines === 0
    const command = first ? undefined : this.classify(changes)
    if (first && changes.some((c) => c.t !== CLOCK && c.inserts.length > 0)) {
      throw new Error('smoke recorder: the database already had game rows when the recording started')
    }
    for (const c of changes) {
      const table = this.table(c.t)
      const def = this.def(c.t)
      for (const r of c.deletes) table.delete(key(r[def.pk]))
      for (const r of c.inserts) table.set(key(r[def.pk]), r)
    }
    const clock = this.rows.get(CLOCK)?.values().next().value
    if (clock !== undefined) this.clock = clock['tick'] as number
    if (command !== undefined) this.cmds.push({ atTick: this.clock, ...command })
    this.lines += 1
    for (const fn of this.listeners) fn()
  }

  /** Every non-empty table, canonical and sorted by primary key: the golden's `tables`. */
  dump(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {}
    for (const t of [...this.rows.keys()].sort()) {
      const pk = this.def(t).pk
      const rows = [...(this.rows.get(t)?.values() ?? [])].sort((a, b) => comparePk(a[pk], b[pk]))
      if (rows.length > 0) out[t] = rows.map(canonical)
    }
    return out
  }

  private classify(changes: readonly { t: string; deletes: readonly AnyRow[]; inserts: readonly AnyRow[] }[]): Omit<RecordedCommand, 'atTick'> | undefined {
    const by = (t: string) => changes.find((c) => c.t === t)
    if (by(CLOCK) !== undefined) return undefined
    const nonceRow = by(NONCE)?.inserts[0]
    if (nonceRow === undefined) throw new Error(`smoke recorder: a transaction that is neither a tick nor a command: ${changes.map((c) => c.t).join(', ')}`)
    const sender = nonceRow['sender'] as string
    const nonce = nonceRow['nonce'] as number
    if (by('entity')?.inserts.some((r) => r['owner'] === sender)) return { sender, envelope: { nonce, cmd: { kind: 'player.join' } } }
    const input = by('entity_input')?.inserts[0]
    if (input !== undefined) return { sender, envelope: { nonce, cmd: { kind: 'entity.move', ix: input['ix'], iy: input['iy'] } } }
    return { sender, envelope: { nonce, cmd: { kind: 'player.join' } } }
  }

  /** The CLI prints i64 as a JSON number; core's rows hold a bigint there. Validated by core's row schema. */
  private row(t: string, raw: AnyRow): AnyRow {
    const def = this.def(t)
    const out: AnyRow = {}
    for (const [col, v] of Object.entries(raw)) {
      const column = def.row.shape[col] as { def?: { type?: string } } | undefined
      out[col] = column?.def?.type === 'bigint' && typeof v === 'number' ? BigInt(v) : v
    }
    return def.row.strict().parse(out) as AnyRow
  }

  private def(t: string): TableDef {
    const def = this.tables.get(t)
    if (def === undefined) throw new Error(`smoke recorder: unknown table "${t}"`)
    return def
  }

  private table(t: string): Map<string, AnyRow> {
    let m = this.rows.get(t)
    if (m === undefined) this.rows.set(t, (m = new Map()))
    return m
  }
}
