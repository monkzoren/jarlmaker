/**
 * Which terrain chunks the camera needs. Pure; the scene streams chunks in
 * nearest-first and drops them once they are well out of view (the margin
 * between `load` and `keep` stops a chunk thrashing on a border).
 */

export interface ChunkKey {
  readonly ccx: number
  readonly ccy: number
}

export const chunkId = (k: ChunkKey): string => `${k.ccx},${k.ccy}`

/** Chunks overlapping the view rectangle grown by `marginPx`, nearest to the centre first. */
export function chunksAround(cx: number, cy: number, halfW: number, halfH: number, marginPx: number, chunkPx: number): ChunkKey[] {
  const x0 = Math.floor((cx - halfW - marginPx) / chunkPx)
  const x1 = Math.floor((cx + halfW + marginPx) / chunkPx)
  const y0 = Math.floor((cy - halfH - marginPx) / chunkPx)
  const y1 = Math.floor((cy + halfH + marginPx) / chunkPx)
  const out: ChunkKey[] = []
  for (let ccy = y0; ccy <= y1; ccy++) for (let ccx = x0; ccx <= x1; ccx++) out.push({ ccx, ccy })
  const dist = (k: ChunkKey) => Math.hypot((k.ccx + 0.5) * chunkPx - cx, (k.ccy + 0.5) * chunkPx - cy)
  return out.sort((a, b) => dist(a) - dist(b))
}
