import type { Rule } from 'eslint'

/** CLAUDE.md 3.3: no file over 600 lines; the build fails at 601. */
export const DEFAULT_MAX_LINES = 600

/** Lines in the file, not counting the empty "line" after a final newline. */
export function countLines(lines: readonly string[]): number {
  return lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
}

export const maxFileLines: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Fail any file over the repo line cap (CLAUDE.md 3.3). Split by concept, not by line count.' },
    schema: [
      {
        type: 'object',
        properties: { max: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong: 'File has {{count}} lines; the cap is {{max}} (CLAUDE.md 3.3). Split it by concept, not by line count.',
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as { max?: number }
    const max = options.max ?? DEFAULT_MAX_LINES
    const count = countLines(context.sourceCode.lines)
    if (count <= max) return {}
    return {
      Program() {
        context.report({
          loc: { start: { line: max + 1, column: 0 }, end: { line: count, column: 0 } },
          messageId: 'tooLong',
          data: { count: String(count), max: String(max) },
        })
      },
    }
  },
}
