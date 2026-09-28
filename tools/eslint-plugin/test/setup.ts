import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'

// RuleTester calls describe/it itself; point it at vitest's.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

/** A RuleTester that parses TypeScript, like the repo config does. */
export function tsRuleTester(): RuleTester {
  return new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' } })
}
