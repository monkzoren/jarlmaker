# entity — how to add one of these

## A movement knob

1. Add the field to `movementTuning` in `schema.ts` with a doc comment.
2. Add the value, with an intent comment, to `packages/content/tuning/movement.ts`.
3. Read it in `rules.ts` through `StepKnobs` (add it there and in
   `stepKnobs` in `tick.ts`). No literals in `rules.ts` or `tick.ts`.
4. A `rules.test.ts` case that shows the knob's effect.

## A column

`entity_pos` and `entity` are broadcast to every subscriber: adding a column
to either needs a decision record (CLAUDE.md 3.6 rule 3). Prefer a new
narrow table keyed by entity id. Tables are append-only: add columns with a
default, never rename or repurpose one. Regenerate the server schema with
`pnpm --filter @bastion/gen-tables gen`.

## A command

1. Add its payload to the `CommandRegistry` block in `commands.ts`
   (`entity.<verb>`).
2. `registerCommand` with a strict Zod payload schema and a handler that
   finds the entity through `ctx.sender` (never an id from the payload) and
   returns a `reject(...)` before its first write.
3. Tests for every refusal case in `commands.test.ts`.

## An event

Add it to `events.ts` (`entity.<past_tense>`, flat payload), emit it with
the tick number, and list it in the README's event table.

## Real terrain

Change `world-view.ts` only (P1-006): implement `WorldView.walkable` over the
world system's cells. `step` and the tick stay as they are.
