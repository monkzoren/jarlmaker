// structures rules (CLAUDE.md 3.5.3): where a structure may stand.

import type { LiveCell } from '../world/rules.ts'

/** A structure may stand on open, walkable ground with nothing on it. */
export function buildable(cell: LiveCell): boolean {
  return cell.walkable && cell.prop === undefined && !cell.covered && cell.biome.role !== 'water'
}
