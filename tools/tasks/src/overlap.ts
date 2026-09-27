/** Literal path prefix of a glob: everything before the first segment containing a wildcard. */
export function globPrefix(glob: string): string {
  const segs = glob.replace(/^\.\//, '').split('/')
  const out: string[] = []
  for (const s of segs) {
    if (/[*?[\]{}!]/.test(s)) break
    out.push(s)
  }
  return out.join('/')
}

const isPathPrefix = (a: string, b: string): boolean => a === '' || b === a || b.startsWith(`${a}/`)

/**
 * Conservative overlap test (ADR 0003): two globs may match a common file if the
 * literal prefix of one is a path-prefix of the other's. False positives are fine;
 * false negatives are not.
 */
export function globsOverlap(a: string, b: string): boolean {
  const pa = globPrefix(a)
  const pb = globPrefix(b)
  const aLiteral = pa === a.replace(/^\.\//, '')
  const bLiteral = pb === b.replace(/^\.\//, '')
  if (aLiteral && bLiteral) return pa === pb || isPathPrefix(pa, pb) || isPathPrefix(pb, pa)
  return isPathPrefix(pa, pb) || isPathPrefix(pb, pa)
}

/** The first overlapping pair between two touch lists, if any. */
export function touchesOverlap(a: string[], b: string[]): [string, string] | undefined {
  for (const x of a) for (const y of b) if (globsOverlap(x, y)) return [x, y]
  return undefined
}
