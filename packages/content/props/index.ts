// Props: things standing on the ground (CLAUDE.md 3.5.1), validated by
// `core/src/world/schema.ts`. Flora props are 1x1; landmarks may be larger.

import type { PropDef } from '@bastion/core'

export const props: PropDef[] = [
  { id: 'pine', sprite: 'pine', blocks: true, footprint: [1, 1] },
  { id: 'boulder', sprite: 'boulder', blocks: true, footprint: [1, 1] },
  { id: 'rock.small', sprite: 'rock', blocks: true, footprint: [1, 1] },
  { id: 'bush.juniper', sprite: 'bush', blocks: false, footprint: [1, 1] },
  // The longship you came ashore in, broken on the beach.
  { id: 'wreck', sprite: 'wreck', blocks: true, footprint: [4, 2] },
]
