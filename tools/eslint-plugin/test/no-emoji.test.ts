import { describe, expect, it } from 'vitest'
import { findPictograph, noEmoji } from '../src/rules/no-emoji.ts'
import { tsRuleTester } from './setup.ts'

// Pictographs are written as escapes here so this test file itself stays plain.
const FIRE = '\u{1F525}'
const SWORDS = '⚔️'
const FLAG_NO = '\u{1F1F3}\u{1F1F4}'

describe('findPictograph', () => {
  it('finds emoji, dingbats, flags and the presentation selector', () => {
    expect(findPictograph(`a${FIRE}`)).toEqual({ codePoint: 'U+1F525', index: 1, length: 2 })
    expect(findPictograph(SWORDS)?.codePoint).toBe('U+2694')
    expect(findPictograph(FLAG_NO)?.codePoint).toBe('U+1F1F3')
    expect(findPictograph('1️⃣')?.codePoint).toBe('U+FE0F')
  })

  it('passes plain text, runes, accents and the typographic marks', () => {
    expect(findPictograph('Jarlmaker: A Longship Saga')).toBeUndefined()
    expect(findPictograph('ᚠᚢᚦ æøå — →')).toBeUndefined()
    expect(findPictograph('© ® ™')).toBeUndefined()
  })
})

tsRuleTester().run('no-emoji', noEmoji, {
  valid: [
    { name: 'a plain string', code: "const s = 'Lost your crew. Build a home.'" },
    { name: 'a plain template', code: 'const s = `Night ${n} falls`' },
    { name: 'a plain comment', code: '// Earn the name Jarl\nconst x = 1' },
    { name: 'runes are letters, not pictographs', code: "const s = 'ᚱᚢᚾ'" },
    { name: 'a trade mark in a legal line', code: "const s = 'Jarlmaker™ © 2026'" },
    { name: 'identifiers and numbers are not checked', code: 'const fire = 0x1f525' },
  ],
  invalid: [
    {
      name: 'a pictograph in a string, located at the character',
      code: `const s = 'camp ${FIRE}'`,
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+1F525', where: 'string' }, line: 1, column: 17, endColumn: 19 }],
    },
    {
      name: 'an escaped pictograph in a string still renders',
      code: "const s = 'camp \\u{1F525}'",
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+1F525', where: 'string (escaped)' } }],
    },
    {
      name: 'a pictograph in a template',
      code: `const s = \`raid \${n} ${SWORDS}\``,
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+2694', where: 'template' } }],
    },
    {
      name: 'an escaped pictograph in a template',
      code: 'const s = `flag \\u{1F1F3}\\u{1F1F4}`',
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+1F1F3', where: 'template (escaped)' } }],
    },
    {
      name: 'a pictograph in a line comment',
      code: `// TODO ${FIRE}\nconst x = 1`,
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+1F525', where: 'comment' }, line: 1, column: 9 }],
    },
    {
      name: 'a pictograph in a block comment on a later line',
      code: `/**\n * Campfire ${FIRE}\n */\nconst x = 1`,
      errors: [{ messageId: 'pictograph', data: { codePoint: 'U+1F525', where: 'comment' }, line: 2, column: 13 }],
    },
    {
      name: 'one report per node, several nodes',
      code: `const a = '${FIRE}${FIRE}'\nconst b = '${FLAG_NO}'`,
      errors: [{ messageId: 'pictograph', line: 1 }, { messageId: 'pictograph', line: 2 }],
    },
  ],
})
