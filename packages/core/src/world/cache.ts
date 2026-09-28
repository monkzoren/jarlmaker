// A bounded per-cell memo for hot terrain queries (movement asks `walkable`
// twice per step for every moving entity; players stand in the same few
// cells tick after tick). Cleared wholesale when full: simple, allocation-free
// between clears, and the terrain is pure so a miss only costs a recompute.

/** Cells remembered before the memo is cleared. */
const MAX_CELLS = 1 << 16
/** Offset and span that pack a cell into one number while |c| < 2^20. */
const OFFSET = 1 << 20
const SPAN = 1 << 21

export function cellMemo<T>(compute: (cx: number, cy: number) => T): (cx: number, cy: number) => T {
  const memo = new Map<number, T>()
  return (cx, cy) => {
    if (cx <= -OFFSET || cx >= OFFSET || cy <= -OFFSET || cy >= OFFSET) return compute(cx, cy)
    const key = (cx + OFFSET) * SPAN + (cy + OFFSET)
    let v = memo.get(key)
    if (v === undefined) {
      if (memo.size >= MAX_CELLS) memo.clear()
      v = compute(cx, cy)
      memo.set(key, v)
    }
    return v
  }
}
