import type { ESLint } from 'eslint'
import { layering } from './rules/layering.ts'
import { maxFileLines } from './rules/max-file-lines.ts'
import { noEmoji } from './rules/no-emoji.ts'
import { noTickScan } from './rules/no-tick-scan.ts'
import { noTunableLiteral } from './rules/no-tunable-literal.ts'

/** `@bastion/eslint-plugin`: the architecture police (CLAUDE.md 3.2). Wired in the root `eslint.config.js`. */
const plugin: ESLint.Plugin = {
  meta: { name: '@bastion/eslint-plugin' },
  rules: {
    'max-file-lines': maxFileLines,
    layering,
    'no-emoji': noEmoji,
    'no-tunable-literal': noTunableLiteral,
    'no-tick-scan': noTickScan,
  },
}

export default plugin
