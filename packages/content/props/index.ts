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
  // Juniper berries: two picks for two handfuls, then a bare bush.
  { id: 'bush.juniper', sprite: 'bush', blocks: false, footprint: [1, 1], harvest: { item: 'berries', hits: 2, leaves: 'bush.bare' } },
  { id: 'bush.bare', sprite: 'bush.bare', blocks: false, footprint: [1, 1] },
  // Built by players (structures).
  // A campfire lights 3.5 cells around it and warms you by 5/s there: more
  // than the night takes, so sitting by it restores warmth.
  { id: 'campfire', sprite: 'campfire', blocks: true, footprint: [1, 1], light: { radius: 3.5, warmthPerSec: 5 } },
  // The longship you came ashore in, broken on the beach.
  { id: 'wreck', sprite: 'wreck', blocks: true, footprint: [4, 2] },
]
