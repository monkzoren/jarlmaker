// items — shapes (CLAUDE.md 3.5.4). This first cut is resources: stackable
// items counted per player. Equipment, rarity, affixes and loot come later.

import { z } from 'zod'
import { registerContent } from '../game.ts'

export const itemDef = z.object({
  id: z.string().min(1),
  /** Player-facing name. */
  name: z.string().min(1),
  /** Art id of its icon (`art/items`). */
  icon: z.string().min(1),
})
registerContent('items', itemDef)

export type ItemDef = z.output<typeof itemDef>

declare module '../game.ts' {
  interface ContentRegistry {
    items: ItemDef
  }
}
