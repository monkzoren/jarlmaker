import type { AST, Rule } from 'eslint'
import type { Node } from 'estree'

/**
 * CLAUDE.md 3.7: tunables live only in `content/tuning`. In `core` rules and
 * ticks the only numeric literals allowed are 0, 1 and -1, array/tuple index
 * access (`xs[2]`), and literal types. Anything else needs a
 * `// tunable-ok: <reason>` comment on the same line or the line above, which
 * the reviewer checks.
 */
const ALLOWED = new Set<number | bigint>([0, 1, 0n, 1n])

/** `// tunable-ok: <reason>`; the reason is required. */
const ESCAPE = /^\s*tunable-ok:\s*\S/

/** The numeric value of a literal, or undefined if it is not a number or bigint. */
function numericValue(node: Node): number | bigint | undefined {
  if (node.type !== 'Literal') return undefined
  if (typeof node.value === 'number' || typeof node.value === 'bigint') return node.value
  // A bigint literal parsed where BigInt is unavailable still carries `bigint`.
  if ('bigint' in node && typeof node.bigint === 'string') return BigInt(node.bigint)
  return undefined
}

export const noTunableLiteral: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'No numeric literals other than 0, 1, -1 in core rules and ticks; tunables live in content/tuning (CLAUDE.md 3.7).' },
    schema: [],
    messages: {
      literal: 'Numeric literal {{raw}} in a rule or tick. Move it to content/tuning, or add `// tunable-ok: <reason>` (CLAUDE.md 3.7).',
      noReason: '`tunable-ok` needs a reason: `// tunable-ok: <reason>`.',
    },
  },
  create(context) {
    const { sourceCode } = context
    /** Lines (1-based) whose own or preceding line carries a valid escape. */
    const escapedLines = new Set<number>()

    function isEscaped(line: number): boolean {
      return escapedLines.has(line) || escapedLines.has(line - 1)
    }

    function isArrayIndex(node: Rule.Node): boolean {
      const parent = node.parent as Node | null
      return parent?.type === 'MemberExpression' && parent.computed && parent.property === node
    }

    /** Literal types (`type Pair = [a: 1, b: 2]`, `T[2]`) are not runtime tunables. */
    function inTypePosition(node: Rule.Node): boolean {
      return (node.parent as { type: string } | null)?.type === 'TSLiteralType'
    }

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (!/^\s*tunable-ok\b/.test(comment.value)) continue
          const loc = comment.loc as AST.SourceLocation
          if (!ESCAPE.test(comment.value)) {
            context.report({ loc, messageId: 'noReason' })
            continue
          }
          escapedLines.add(loc.end.line)
        }
      },
      Literal(node) {
        const value = numericValue(node)
        if (value === undefined || ALLOWED.has(value)) return
        if (isArrayIndex(node) || inTypePosition(node)) return
        const loc = node.loc as AST.SourceLocation
        if (isEscaped(loc.start.line)) return
        context.report({ node, messageId: 'literal', data: { raw: sourceCode.getText(node) } })
      },
    }
  },
}
