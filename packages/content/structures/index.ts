// Structures (CLAUDE.md 3.5.3), validated by `core/src/structures/schema.ts`.

import type { StructureDef } from '@bastion/core'

export const structures: StructureDef[] = [
  // The first thing you build on the beach: two pines and a few rocks'
  // worth, reachable in the first minute.
  { id: 'campfire', name: 'Campfire', prop: 'campfire', cost: { wood: 5, stone: 3 } },
]
