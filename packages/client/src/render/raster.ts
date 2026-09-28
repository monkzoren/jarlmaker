/**
 * Rasterize the art package's text pixel sources (ADR 0007) to RGBA bytes.
 * Pure; Pixi only sees the result. The atlas packer (P1-010) replaces this
 * at build time.
 */

/** Parse '#rrggbb' to [r, g, b, 255]. */
function rgba(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0xff]
}

/**
 * Rasterize a palette-indexed grid to RGBA bytes (row-major). Throws on a
 * ragged row or an unknown palette key, so a bad grid fails loudly.
 */
export function rasterize(
  grid: readonly string[],
  palette: Readonly<Record<string, string>>,
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * height * 4)
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`grid row ${y} has ${row.length} columns, expected ${width}`)
    for (let x = 0; x < width; x++) {
      const ch = row[x]!
      if (ch === '.') continue
      const hex = palette[ch]
      if (hex === undefined) throw new Error(`grid row ${y} col ${x}: unknown palette key '${ch}'`)
      data.set(rgba(hex), (y * width + x) * 4)
    }
  })
  return { width, height, data }
}
