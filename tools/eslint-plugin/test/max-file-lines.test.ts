import { describe, expect, it } from 'vitest'
import { countLines, maxFileLines } from '../src/rules/max-file-lines.ts'
import { tsRuleTester } from './setup.ts'

function lines(n: number, trailingNewline = true): string {
  const body = Array.from({ length: n }, (_, i) => `export const v${i} = ${i}`).join('\n')
  return trailingNewline ? `${body}\n` : body
}

describe('countLines', () => {
  it('ignores the empty line after a final newline', () => {
    expect(countLines(['a', 'b', ''])).toBe(2)
    expect(countLines(['a', 'b'])).toBe(2)
    expect(countLines([''])).toBe(0)
  })
})

tsRuleTester().run('max-file-lines', maxFileLines, {
  valid: [
    { name: '600 lines with a final newline is at the cap', code: lines(600) },
    { name: '600 lines without a final newline is at the cap', code: lines(600, false) },
    { name: 'an empty file', code: '' },
    { name: 'a custom cap', code: lines(10), options: [{ max: 10 }] },
  ],
  invalid: [
    {
      name: '601 lines fails at line 601',
      code: lines(601),
      errors: [{ messageId: 'tooLong', data: { count: '601', max: '600' }, line: 601 }],
    },
    {
      name: '601 lines without a final newline fails too',
      code: lines(601, false),
      errors: [{ messageId: 'tooLong', data: { count: '601', max: '600' }, line: 601 }],
    },
    {
      name: 'a custom cap',
      code: lines(11),
      options: [{ max: 10 }],
      errors: [{ messageId: 'tooLong', data: { count: '11', max: '10' }, line: 11 }],
    },
  ],
})
