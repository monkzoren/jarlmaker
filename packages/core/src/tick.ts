// `tick`: advance the world by `dtMs` (CLAUDE.md 3.4 The tick). The server's
// scheduled reducer calls it; tests call it on MemoryStore. Each system's tick
// is one step: it runs, then the events it emitted are dispatched, before the
// next system runs. Budget: <= 2 ms for 200 online players at 10 Hz.
//
// SYSTEM_TICKS is the one ordered list of system ticks. A system with
// per-tick work adds one entry here, with a comment saying why it sits where
// it does. Systems whose work is event-driven (quests, progression) never
// appear: they react through `onEvent`.
//
// Each call first advances the world clock (`kernel/clock.ts`) by one, so
// every system and event handler in this call sees the same tick number.

import type { Game } from './game.ts'
import { dispatch } from './dispatch.ts'
import { entityTick } from './entity/tick.ts'
import { advanceTick } from './kernel/clock.ts'
import { survivalTick } from './survival/tick.ts'
import { StepStore } from './kernel/step-store.ts'
import { REGISTRY, type DispatchTable } from './registry.ts'
import type { Store } from './store/types.ts'

export interface TickContext {
  readonly game: Game
  readonly store: Store
  /** This tick's number (`world_clock`), advanced before the first system runs. Stamp it on events. */
  readonly tick: number
  /** Milliseconds since the previous tick. */
  readonly dtMs: number
}

export interface SystemTick {
  /** The `core/src` folder that owns this tick. */
  readonly system: string
  readonly run: (ctx: TickContext) => void
}

export const SYSTEM_TICKS: readonly SystemTick[] = [
  // Movement integrates inputs first, so every later system reads this
  // tick's positions.
  entityTick,
  // Survival reads where players now stand (heat from nearby fires) and may
  // kill one, whose respawn the entity system handles in the dispatch.
  survivalTick,
]

export interface TickOptions {
  /** Default: the game's `REGISTRY`. */
  readonly registry?: DispatchTable
  /** Default: `SYSTEM_TICKS`. Tests pass their own. */
  readonly systems?: readonly SystemTick[]
}

export function tick(game: Game, store: Store, dtMs: number, options: TickOptions = {}): void {
  if (!Number.isFinite(dtMs) || dtMs < 0) throw new Error(`tick: dtMs must be a finite number >= 0, got ${dtMs}`)
  const registry = options.registry ?? REGISTRY
  const n = advanceTick(store)
  for (const system of options.systems ?? SYSTEM_TICKS) {
    const step = new StepStore(store)
    system.run({ game, store: step, tick: n, dtMs })
    dispatch(registry, { game, store: step, tick: n }, step)
  }
}
