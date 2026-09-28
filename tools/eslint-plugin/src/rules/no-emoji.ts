import type { AST, Rule } from 'eslint'
import type { Node } from 'estree'

/**
 * CLAUDE.md 3.5.9: no Unicode pictographs on screen; icons are atlas sprites.
 * Matches every Extended_Pictographic code point, regional indicators (flags),
 * the emoji presentation selector and the keycap combiner.
 */
const PICTOGRAPH = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/gu

/** Typographic marks that are Extended_Pictographic but render as text: copyright, registered, trade mark. */
const TEXT_MARKS = new Set(['\u00A9', '\u00AE', '\u2122'])

/** The first pictograph in `text` as `U+XXXX`, or undefined. */
export function findPictograph(text: string): { codePoint: string; index: number; length: number } | undefined {
  for (const match of text.matchAll(PICTOGRAPH)) {
    if (TEXT_MARKS.has(match[0])) continue
    const cp = match[0].codePointAt(0) ?? 0
    return { codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, index: match.index, length: match[0].length }
  }
  return undefined
}

export const noEmoji: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'No Unicode pictographs in strings, templates or comments (CLAUDE.md 3.5.9). Icons are atlas sprites.' },
    schema: [],
    messages: {
      pictograph: 'Unicode pictograph {{codePoint}} in a {{where}}. Icons are atlas sprites (CLAUDE.md 3.5.9).',
    },
  },
  create(context) {
    const { sourceCode } = context

    function reportAt(range: AST.Range | undefined, text: string, offset: number, where: string, fallback: Node): void {
      const hit = findPictograph(text)
      if (!hit) return
      const data = { codePoint: hit.codePoint, where }
      if (!range) {
        context.report({ node: fallback, messageId: 'pictograph', data })
        return
      }
      const at = range[0] + offset + hit.index
      const start = sourceCode.getLocFromIndex(at)
      const end = sourceCode.getLocFromIndex(at + hit.length)
      context.report({ loc: { start, end }, messageId: 'pictograph', data })
    }

    return {
      Program(node) {
        for (const comment of sourceCode.getAllComments()) {
          // The comment's value starts after its opening `//` or `/*`.
          reportAt(comment.range, comment.value, 2, 'comment', node)
        }
      },
      Literal(node) {
        if (typeof node.value !== 'string') return
        const raw = sourceCode.getText(node)
        // Written literally: point at it. Written as an escape: the cooked value still shows on screen.
        if (findPictograph(raw)) reportAt(node.range, raw, 0, 'string', node)
        else if (findPictograph(node.value)) reportAt(undefined, node.value, 0, 'string (escaped)', node)
      },
      TemplateElement(node) {
        const raw = sourceCode.getText(node)
        if (findPictograph(raw)) reportAt(node.range, raw, 0, 'template', node)
        else if (node.value.cooked && findPictograph(node.value.cooked)) reportAt(undefined, node.value.cooked, 0, 'template (escaped)', node)
      },
    }
  },
}
