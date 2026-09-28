// A small line diff for goldens (one row or event per line). LCS over lines,
// printed as hunks with two lines of context: `-` is the committed golden,
// `+` is this run.

const CONTEXT = 2

type Op = { readonly kind: ' ' | '-' | '+'; readonly line: string; readonly a: number; readonly b: number }

function ops(a: readonly string[], b: readonly string[]): Op[] {
  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = lcs[i]!
    const next = lcs[i + 1]!
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
    }
  }
  const out: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: ' ', line: a[i]!, a: i++, b: j++ })
    } else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      out.push({ kind: '-', line: a[i]!, a: i++, b: j })
    } else {
      out.push({ kind: '+', line: b[j]!, a: i, b: j++ })
    }
  }
  return out
}

/** Hunks of `-before` / `+after` lines with context, `@@ -a +b @@` headers (1-based). */
export function lineDiff(before: string, after: string): string {
  const all = ops(before.split('\n'), after.split('\n'))
  const changed = all.flatMap((op, k) => (op.kind === ' ' ? [] : [k]))
  const out: string[] = []
  let k = 0
  while (k < changed.length) {
    const start = Math.max(0, changed[k]! - CONTEXT)
    let end = changed[k]!
    while (k < changed.length && changed[k]! <= end + 2 * CONTEXT) end = changed[k++]!
    const hunk = all.slice(start, Math.min(all.length, end + CONTEXT + 1))
    out.push(`@@ -${hunk[0]!.a + 1} +${hunk[0]!.b + 1} @@`)
    for (const op of hunk) out.push(`${op.kind} ${op.line}`)
  }
  return out.join('\n')
}

/** `+N -M lines` for the update summary. */
export function diffStat(diff: string): string {
  const lines = diff.split('\n')
  const add = lines.filter((l) => l.startsWith('+ ')).length
  const del = lines.filter((l) => l.startsWith('- ')).length
  return `+${add} -${del} lines`
}
