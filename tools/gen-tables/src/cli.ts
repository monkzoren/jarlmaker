// `pnpm --filter @bastion/gen-tables gen`: write packages/server/src/tables.ts
// from the tables registered in @bastion/core.
//   --check            fail if the committed file differs (run by `pnpm build`)
//   --allow-breaking   skip the append-only check (needs a decision record)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tableList } from '@bastion/core'
import { checkAppendOnly, GenError, generate, parseManifest } from './generate.ts'

const TARGET = fileURLToPath(new URL('../../../packages/server/src/tables.ts', import.meta.url))

const args = new Set(process.argv.slice(2))
const readTarget = (): string => {
  try {
    return readFileSync(TARGET, 'utf8')
  } catch {
    return ''
  }
}

try {
  const { source, manifest } = generate(tableList())
  const committed = readTarget()
  if (args.has('--check')) {
    if (committed !== source) {
      console.error('gen:tables: packages/server/src/tables.ts is out of date with the core table declarations.')
      console.error('gen:tables: run `pnpm --filter @bastion/gen-tables gen` and commit the result.')
      process.exit(1)
    }
    console.log(`gen:tables: ok (${Object.keys(manifest).length} table(s), up to date)`)
  } else {
    const errors = args.has('--allow-breaking') ? [] : checkAppendOnly(parseManifest(committed), manifest)
    if (errors.length > 0) {
      for (const e of errors) console.error(`gen:tables: error: ${e}`)
      console.error('gen:tables: tables are append-only (CLAUDE.md 3.4); nothing was written.')
      process.exit(1)
    }
    if (committed === source) console.log('gen:tables: unchanged')
    else {
      writeFileSync(TARGET, source)
      console.log(`gen:tables: wrote ${Object.keys(manifest).length} table(s) to packages/server/src/tables.ts`)
    }
  }
} catch (e) {
  if (!(e instanceof GenError)) throw e
  console.error(`gen:tables: error: ${e.message}`)
  process.exit(1)
}
