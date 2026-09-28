// The kernel's runtime registry (CLAUDE.md 3.4): which handler runs each
// Command kind, and which handlers react to each GameEvent kind. The types
// live in `commands.ts` and `events/`; this file holds the functions.
//
// A system registers from its own folder, at module load:
//
//   registerCommand({
//     kind: 'entity.move',
//     schema: z.object({ dx: z.number(), dy: z.number() }),  // payload, without `kind`
//     handle: (ctx, cmd) => { ...validate as hostile, return reject(...) or write },
//   })
//   onEvent('structure.built', (ctx, e) => { ...react, may emit more events })
//
// Tests build their own `Registry<TestCommand, TestEvent>` so fixture kinds
// never reach the real one.

import type { z } from 'zod'
import type { Command, CommandKind, Rejection } from './commands.ts'
import type { EventKind, GameEvent } from './events/index.ts'
import type { Game } from './game.ts'
import type { Store } from './store/types.ts'

/** What a command handler sees. `sender` is the host's authority (`ctx.sender`), never an argument. */
export interface CommandContext {
  readonly game: Game
  readonly store: Store
  readonly sender: string
}

/** What an event handler sees. Its `store.emit` queues events for this same dispatch. */
export interface EventContext {
  readonly game: Game
  readonly store: Store
}

interface Kinded {
  readonly kind: string
}

type Member<U extends Kinded, K> = Extract<U, { readonly kind: K }>

/**
 * One command kind. `schema` checks the payload **without** `kind`; `handle`
 * validates the rest as hostile (ownership, cost, cooldown, cap) and returns
 * a `Rejection` before its first write or emit, or nothing on success.
 */
export interface CommandDef<C extends Kinded, K extends C['kind']> {
  readonly kind: K
  readonly schema: z.ZodType<Omit<Member<C, K>, 'kind'>>
  readonly handle: (ctx: CommandContext, cmd: Member<C, K>) => Rejection | void
}

/** The kind-erased forms the kernel runs; `Registry` is the typed way in. */
export interface AnyCommandDef {
  readonly kind: string
  readonly schema: z.ZodType
  readonly handle: (ctx: CommandContext, cmd: Kinded) => Rejection | void
}
export type AnyEventHandler = (ctx: EventContext, e: Kinded) => void

/** The lookups `execute` and `tick` need. */
export interface DispatchTable {
  commandDef(kind: string): AnyCommandDef | undefined
  /** Handlers for `kind`, in registration order. */
  handlersFor(kind: string): readonly AnyEventHandler[]
}

export class Registry<C extends Kinded = Command, E extends Kinded = GameEvent> implements DispatchTable {
  private readonly commands = new Map<string, AnyCommandDef>()
  private readonly handlers = new Map<string, AnyEventHandler[]>()

  /** Register the one handler for a command kind; a kind may be registered once. */
  command<K extends C['kind']>(def: CommandDef<C, K>): void {
    if (this.commands.has(def.kind)) throw new Error(`command "${def.kind}" is already registered`)
    this.commands.set(def.kind, def as unknown as AnyCommandDef)
  }

  /** Add a handler for an event kind. Handlers run in registration order. */
  on<K extends E['kind']>(kind: K, handler: (ctx: EventContext, e: Member<E, K>) => void): void {
    const list = this.handlers.get(kind)
    const erased = handler as AnyEventHandler
    if (list === undefined) this.handlers.set(kind, [erased])
    else list.push(erased)
  }

  commandDef(kind: string): AnyCommandDef | undefined {
    return this.commands.get(kind)
  }

  handlersFor(kind: string): readonly AnyEventHandler[] {
    return this.handlers.get(kind) ?? []
  }
}

/** The game's registry: what the server and every host-level test run. */
export const REGISTRY = new Registry()

export function registerCommand<K extends CommandKind>(def: CommandDef<Command, K>): void {
  REGISTRY.command(def)
}

export function onEvent<K extends EventKind>(kind: K, handler: (ctx: EventContext, e: Member<GameEvent, K>) => void): void {
  REGISTRY.on(kind, handler)
}
