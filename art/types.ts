/**
 * A sprite family as text pixel source (ADR 0007). Each frame is a grid of
 * `height` strings of `width` characters; '.' is transparent and every other
 * character is a key into `palette`. Feet sit on the bottom rows, centred.
 */
export type Facing = 'down' | 'up' | 'side'
export type AnimName = 'idle' | 'walk'
export type Frame = readonly string[]

export interface SpriteSheet {
  readonly id: string
  readonly width: number
  readonly height: number
  /** Art pixels walked per walk frame, so feet stay planted at any speed. */
  readonly pxPerFrame: number
  /** Grid character to '#rrggbb'. */
  readonly palette: Readonly<Record<string, string>>
  /** `side` faces right; the renderer mirrors it for left. */
  readonly anims: Readonly<Record<AnimName, Readonly<Record<Facing, readonly Frame[]>>>>
}
