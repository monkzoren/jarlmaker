// `pnpm contentlint`: lint the whole content set, exit 1 on any error.
// `tsx src/cli.ts <module>` lints that module's `content` export instead
// (the tests use it on a broken fixture).

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lintContent } from './lint.ts'

const target = process.argv[2]
const { content } = (await import(target ? pathToFileURL(resolve(target)).href : '@bastion/content')) as {
  content: unknown
}

const { errors, warnings } = lintContent(content)
for (const w of warnings) console.warn(`contentlint: warning: ${w}`)
for (const e of errors) console.error(`contentlint: error: ${e}`)
if (errors.length > 0) {
  console.error(`contentlint: ${errors.length} error(s)`)
  process.exit(1)
}
console.log(`contentlint: ok (${warnings.length} warning(s))`)
