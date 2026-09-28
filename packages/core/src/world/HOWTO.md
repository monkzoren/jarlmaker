# world — how to add one of these

## A biome

1. One entry in `packages/content/biomes/index.ts`: a `role`, and a
   `moisture` band if it is a lowland. Lowland bands must tile [0, 1).
2. A tile set in `art/terrain/tiles.ts` under the biome's `tile` id, plus any
   decals it rolls in `art/terrain/decals.ts`.
3. Update the golden map in `packages/content/world.test.ts`
   (`vitest -u`) and look at the diff.

## A prop

1. One entry in `packages/content/props/index.ts` (flora props are 1×1).
2. A sprite in `art/props/` under its `sprite` id.
3. List it in a biome's `flora`, or place it with a `landmarks` entry.

## A world knob

Add it to `worldTuning` in `schema.ts`, add the value with an intent comment
to `packages/content/tuning/world.ts`, and read it in `rules.ts`. No literals
in `rules.ts`.
