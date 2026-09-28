/**
 * Integer camera zoom (CLAUDE.md 3.5.9): one art pixel is drawn as exactly
 * `zoom` device pixels, so pixel art never smears. The zoom starts from the
 * device pixel ratio and steps down when the viewport would show too little
 * of the world.
 *
 * These are presentation constants, not game rules, so they live with the
 * renderer rather than in content/tuning.
 */

/** Base tile size in art pixels. */
export const TILE_PX = 16

/** Allowed zoom levels, largest first. */
export const ZOOM_LEVELS = [4, 3, 2] as const
export type Zoom = (typeof ZOOM_LEVELS)[number]

/** The short side of the viewport should show at least this many tiles. */
export const MIN_TILES_SHORT_SIDE = 10

export interface Viewport {
  /** CSS pixels. */
  readonly width: number
  readonly height: number
  /** window.devicePixelRatio (may be fractional, e.g. 2.625). */
  readonly dpr: number
}

/** Zoom preferred by pixel density alone: ~1x DPR → 2, ~2x → 3, ≥3x → 4. */
export function zoomForDpr(dpr: number): Zoom {
  const safe = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const wanted = Math.round(safe) + 1
  for (const z of ZOOM_LEVELS) if (z <= wanted) return z
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
}

/**
 * The largest allowed zoom that is no more than the density preference and
 * still shows MIN_TILES_SHORT_SIDE tiles across the short side of the
 * viewport (in device pixels). Never below the smallest zoom level.
 */
export function pickZoom(v: Viewport): Zoom {
  const preferred = zoomForDpr(v.dpr)
  const dpr = Number.isFinite(v.dpr) && v.dpr > 0 ? v.dpr : 1
  const shortDevicePx = Math.min(v.width, v.height) * dpr
  for (const z of ZOOM_LEVELS) {
    if (z > preferred) continue
    if (shortDevicePx / (TILE_PX * z) >= MIN_TILES_SHORT_SIDE) return z
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
}
