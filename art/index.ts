import { CAMP_ART } from './props/camp.ts'
import { PROP_ART as WORLD_PROPS } from './props/props.ts'
import type { Picture } from './types.ts'

export type { AnimName, Facing, Frame, Picture, SpriteSheet } from './types.ts'
export { CASTAWAY } from './characters/castaway.ts'
export { WORLD_PALETTE } from './palette.ts'
export { TILES } from './terrain/tiles.ts'
export { DECALS } from './terrain/decals.ts'
export { ICONS } from './items/icons.ts'

/** Every prop picture by sprite id: the world's own and the ones players make. */
export const PROP_ART: Readonly<Record<string, Picture>> = { ...WORLD_PROPS, ...CAMP_ART }
