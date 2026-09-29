// Props: things standing on the ground (CLAUDE.md 3.5.1), validated by
// `core/src/world/schema.ts`. Flora props are 1x1; landmarks may be larger.

import type { PropDef } from '@bastion/core'

export const props: PropDef[] = [
  // Three chops fell a pine for three wood, leaving a stump you can walk over.
  { id: 'pine', sprite: 'pine', blocks: true, footprint: [1, 1], harvest: { item: 'wood', hits: 3, leaves: 'stump' } },
  { id: 'stump', sprite: 'stump', blocks: false, footprint: [1, 1] },
  // A boulder breaks down to a small rock, and the rock to nothing: 6 stone in all.
  { id: 'boulder', sprite: 'boulder', blocks: true, footprint: [1, 1], harvest: { item: 'stone', hits: 4, leaves: 'rock.small' } },
  { id: 'rock.small', sprite: 'rock', blocks: true, footprint: [1, 1], harvest: { item: 'stone', hits: 2, leaves: '' } },
  { id: 'bush.juniper', sprite: 'bush', blocks: false, footprint: [1, 1] },
  // Built by players (structures).
  { id: 'campfire', sprite: 'campfire', blocks: true, footprint: [1, 1] },
  // The longship you came ashore in, broken on the beach.
  { id: 'wreck', sprite: 'wreck', blocks: true, footprint: [4, 2] },
]
