// Event dispatch (CLAUDE.md 3.4). After each step (one command, or one
// system's tick) the kernel drains that step's queued events, oldest first.
// Each event is appended to the host's event log, then every handler for its
// kind runs, in registration order. Events a handler emits join the back of
// the same queue, so dispatch is breadth-first and all of it happens inside
// the step's transaction.

import type { EventBase } from './events/index.ts'
import type { StepStore } from './kernel/step-store.ts'
import type { DispatchTable, EventContext } from './registry.ts'

/**
 * A guard against handlers that feed each other forever. Hitting it is a
 * content or code bug, so it throws (the host rolls the transaction back)
 * rather than returning a Rejection.
 */
export const MAX_EVENTS_PER_STEP = 10_000

export function dispatch(registry: DispatchTable, ctx: EventContext, step: StepStore): void {
  let count = 0
  for (let e = step.take(); e !== undefined; e = step.take()) {
    // `GameEvent` is `never` until a system adds a kind; every event has a kind.
    const { kind }: EventBase = e
    count += 1
    if (count > MAX_EVENTS_PER_STEP) {
      throw new Error(`dispatch: more than ${MAX_EVENTS_PER_STEP} events in one step (a handler loop?), last "${kind}"`)
    }
    step.base.emit(e)
    for (const handler of registry.handlersFor(kind)) handler(ctx, e)
  }
}
