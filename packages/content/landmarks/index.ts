// Hand-placed props at fixed cells (CLAUDE.md 3.0, 3.5.1), validated by
// `core/src/world/schema.ts`.

import type { LandmarkDef } from '@bastion/core'

export const landmarks: LandmarkDef[] = [
  // The wrecked longship lies in the surf just west of where you wash up.
  { id: 'wreck', prop: 'wreck', cx: -6, cy: -3 },
]
