/**
 * The render contract: what net code hands the renderer. Net and input code
 * build these; only `render/` touches Pixi.
 */

export interface RenderEntity {
  /** Stable id; the renderer keeps one sprite per id across snapshots. */
  readonly id: string
  /** World position in art pixels (the sprite's feet). Rounded at draw, not in sim. */
  readonly x: number
  readonly y: number
}

export interface RenderSnapshot {
  readonly entities: readonly RenderEntity[]
  /** Where the camera looks, art pixels (the local player once joined). */
  readonly focus?: { readonly x: number; readonly y: number }
}

export interface EntityDiff {
  readonly added: readonly RenderEntity[]
  readonly moved: readonly RenderEntity[]
  readonly removed: readonly string[]
}

/** Which sprites to create, move, and destroy to show `next`. Pure. */
export function diffEntities(current: ReadonlySet<string>, next: RenderSnapshot): EntityDiff {
  const added: RenderEntity[] = []
  const moved: RenderEntity[] = []
  const seen = new Set<string>()
  for (const e of next.entities) {
    seen.add(e.id)
    if (current.has(e.id)) moved.push(e)
    else added.push(e)
  }
  const removed: string[] = []
  for (const id of current) if (!seen.has(id)) removed.push(id)
  return { added, moved, removed }
}
