# survival — how to add one of these

## A food

Give an item a `food` value in `packages/content/items/index.ts`, and a
source (a prop's `harvest.item`).

## A heat source

Give a placeable prop a `light: { radius, warmthPerSec }` in
`packages/content/props/index.ts`. The client lights it and the survival tick
warms players in range. Only props placed as `cell_delta` rows count.

## A survival knob

Add it to `survivalTuning` (`schema.ts`), give it a value with an intent
comment in `packages/content/tuning/survival.ts`, and mirror it in the test
fixture (`entity/fixture.test-util.ts`). No literals in `rules.ts`/`tick.ts`.
