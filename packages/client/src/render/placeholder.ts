/**
 * The placeholder character: a 16x32 palette-indexed grid, the same shape
 * the art pipeline will use for real sprites (ADR 0007), so no image asset
 * ships yet. Pure data plus a pure rasterizer; Pixi only sees the result.
 */

/** Hex colours by grid character. '.' is transparent. */
export const PLACEHOLDER_PALETTE: Readonly<Record<string, string>> = {
  k: '#1b1f22', // outline
  h: '#8a5a32', // hair / beard
  s: '#d9a57a', // skin
  g: '#2f5a3e', // pine-green tunic
  b: '#5b4632', // belt / boots
  e: '#e0702a', // ember-orange cloak pin
  p: '#6b7479', // sea-grey trousers
}

/** 16 columns x 32 rows; feet on the bottom row (the 1-tile footprint). */
export const PLACEHOLDER_GRID: readonly string[] = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '....khhhhhhk....',
  '....ksssssshk...',
  '....ksksskshk...',
  '....ksssssshk...',
  '....khsssshhk...',
  '....khhhhhhk....',
  '.....khhhhk.....',
  '...kkkggggkkk...',
  '..kgggggggggek..',
  '..kggggggggggk..',
  '..ksgggggggggsk.',
  '..ksgggggggggsk.',
  '..ksgggggggggsk.',
  '..kskbbbbbbbksk.',
  '...kkgggggggkk..',
  '....kgggggggk...',
  '....kpppkpppk...',
  '....kpppkpppk...',
  '....kpppkpppk...',
  '....kpppkpppk...',
  '....kpppkpppk...',
  '....kbbbkbbbk...',
  '...kbbbbkbbbbk..',
  '...kkkkkkkkkkk..',
  '................',
]

export const PLACEHOLDER_W = 16
export const PLACEHOLDER_H = 32

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
