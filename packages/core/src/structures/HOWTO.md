# structures — how to add one of these

## A structure

1. A prop for it in `packages/content/props/index.ts` (and its sprite in
   `art/props/`), usually `blocks: true`.
2. One entry in `packages/content/structures/index.ts` naming that prop and
   its cost.
3. The client's Build button builds the campfire only; a build menu comes
   with the Phase 3 framework.
