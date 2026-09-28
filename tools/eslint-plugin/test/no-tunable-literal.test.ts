import { noTunableLiteral } from '../src/rules/no-tunable-literal.ts'
import { tsRuleTester } from './setup.ts'

tsRuleTester().run('no-tunable-literal', noTunableLiteral, {
  valid: [
    { name: '0, 1 and -1', code: 'const a = 0; const b = 1; const c = -1; const d = 0.0' },
    { name: 'bigint 0n and 1n', code: 'const a = 0n + 1n' },
    { name: 'array index access', code: 'const x = xs[2]; xs[3] = 4 // tunable-ok: fixture' },
    { name: 'tuple and literal types', code: 'type Pair = [2, 3]; type Third = T[2]; let n: 5 = 5 as 5 // tunable-ok: type test' },
    { name: 'escape on the same line', code: 'const g = 9.81 // tunable-ok: physical constant' },
    { name: 'escape on the line above', code: '// tunable-ok: bit width\nconst mask = 0xff' },
    { name: 'escape in a block comment', code: '/* tunable-ok: hex radix */ const s = n.toString(16)' },
    { name: 'numbers in strings are not literals', code: "const s = 'wall-3'" },
  ],
  invalid: [
    { name: 'a plain constant', code: 'const speed = 4', errors: [{ messageId: 'literal', data: { raw: '4' } }] },
    { name: 'a negative constant', code: 'const lo = -2', errors: [{ messageId: 'literal', data: { raw: '2' } }] },
    { name: 'a fraction', code: 'const half = x * 0.5', errors: [{ messageId: 'literal', data: { raw: '0.5' } }] },
    { name: 'a bigint', code: 'const us = ms * 1000n', errors: [{ messageId: 'literal', data: { raw: '1000n' } }] },
    { name: 'an index expression is not an index', code: 'const x = xs[i + 2]', errors: [{ messageId: 'literal', data: { raw: '2' } }] },
    { name: 'a default parameter', code: 'function f(n = 3) { return n }', errors: [{ messageId: 'literal', data: { raw: '3' } }] },
    {
      name: 'an escape two lines up does not count',
      code: '// tunable-ok: too far\n\nconst x = 7',
      errors: [{ messageId: 'literal', line: 3 }],
    },
    {
      name: 'an escape without a reason fails and does not exempt',
      code: 'const x = 7 // tunable-ok:',
      errors: [{ messageId: 'literal' }, { messageId: 'noReason' }],
    },
    {
      name: 'an escape covers only its own line',
      code: 'const a = 2 // tunable-ok: fixture\nconst b = 3\nconst c = 4',
      errors: [{ messageId: 'literal', line: 3 }],
    },
  ],
})
