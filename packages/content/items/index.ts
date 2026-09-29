// Items (CLAUDE.md 3.5.4), validated by `core/src/items/schema.ts`.

import type { ItemDef } from '@bastion/core'

export const items: ItemDef[] = [
  { id: 'wood', name: 'Wood', icon: 'wood' },
  { id: 'stone', name: 'Stone', icon: 'stone' },
  // A handful of juniper berries: 15 food, so a bush (two handfuls) is a third of a day.
  { id: 'berries', name: 'Berries', icon: 'berries', food: 15 },
]
