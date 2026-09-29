// A bounded per-cell memo for hot terrain queries (movement asks `walkable`
// twice per step for every moving entity; players stand in the same few
// cells tick after tick). Cleared wholesale when full: simple, allocation-free
// between clears, and the terrain is pure so a miss only costs a recompute.

/** Cells remembered before the memo is cleared. */
const MAX_CELLS = 1 << 16
/** Cells within this distance of the origin pack into one small integer key. */
const LIMIT = 1 << 15

/** `(cx, cy)` packed into one int32 (a fast Map key), for |c| < 2^15. */
export function packCell(cx: number, cy: number): number {
  return (cx << 16) | (cy & 0xffff)
}

/** In range for `packCell`. */
export const packable = (cx: number, cy: number): boolean => cx > -LIMIT && cx < LIMIT && cy > -LIMIT && cy < LIMIT

export function cellMemo<T>(compute: (cx: number, cy: number) => T): (cx: number, cy: number) => T {
  const memo = new Map<number, T>()
  return (cx, cy) => {
    if (!packable(cx, cy)) return compute(cx, cy)
    const key = packCell(cx, cy)
    let v = memo.get(key)
    if (v === undefined) {
      if (memo.size >= MAX_CELLS) memo.clear()
      v = compute(cx, cy)
      memo.set(key, v)
    }
    return v
  }
}
