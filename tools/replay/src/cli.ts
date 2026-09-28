// `pnpm replay [--update] [name ...]`: run every `tests/replay/*.json` script
// (or the named ones) through core on MemoryStore and compare each with its
// `*.golden.json`. Exit 1 on any mismatch, printing the diff. `--update`
// rewrites the goldens (and a script's `contentHash` when content changed)
// and prints a summary diff of what moved.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { content } from '@bastion/content'
import { createGame } from '@bastion/core'
import { diffStat } from './diff.ts'
import { contentHash, scriptSchema } from './format.ts'
import { compare, runScript } from './run.ts'
import './systems.ts' // registers the systems before createGame validates their tuning

const DIR = fileURLToPath(new URL('../../../tests/replay/', import.meta.url))
const GOLDEN = '.golden.json'

const args = process.argv.slice(2)
const update = args.includes('--update')
const only = args.filter((a) => !a.startsWith('--'))

const files = readdirSync(DIR).sort()
const names = files.filter((f) => f.endsWith('.json') && !f.endsWith(GOLDEN)).map((f) => f.slice(0, -'.json'.length))
const orphans = files.filter((f) => f.endsWith(GOLDEN) && !names.includes(f.slice(0, -GOLDEN.length)))
const selected = only.length > 0 ? only : names

const game = createGame(content)
const hash = contentHash(content)
let failed = 0

for (const o of orphans) {
  console.error(`replay: ${o} has no script`)
  failed += 1
}

for (const name of selected) {
  const scriptPath = join(DIR, `${name}.json`)
  const goldenPath = join(DIR, `${name}${GOLDEN}`)
  if (!existsSync(scriptPath)) {
    console.error(`replay: no script ${scriptPath}`)
    failed += 1
    continue
  }
  const raw = readFileSync(scriptPath, 'utf8')
  const parsed = scriptSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.error(`replay: ${name}: invalid script\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
    failed += 1
    continue
  }
  const script = parsed.data
  const golden = existsSync(goldenPath) ? readFileSync(goldenPath, 'utf8') : undefined
  const result = compare(runScript(game, script), golden)
  const stale = script.contentHash !== hash

  if (update) {
    if (stale) writeFileSync(scriptPath, raw.replace(/("contentHash"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(hash)}`))
    if (!result.ok) writeFileSync(goldenPath, result.actual)
    if (result.ok && !stale) console.log(`replay: ${name}: unchanged`)
    else {
      console.log(`replay: ${name}: updated${stale ? ' (content hash)' : ''}${result.ok ? '' : ` golden ${diffStat(result.diff)}`}`)
      if (!result.ok) console.log(result.diff)
    }
    continue
  }

  if (result.ok && !stale) {
    console.log(`replay: ${name}: ok`)
    continue
  }
  failed += 1
  if (stale) console.error(`replay: ${name}: recorded against content ${script.contentHash}, content is now ${hash}`)
  if (golden === undefined) console.error(`replay: ${name}: no golden ${goldenPath}`)
  else if (!result.ok) console.error(`replay: ${name}: differs from its golden (- golden, + this run)\n${result.diff}`)
  console.error(`replay: if the change is intended, run \`pnpm replay --update\` and commit the result`)
}

if (failed > 0) {
  console.error(`replay: ${failed} failure(s)`)
  process.exit(1)
}
console.log(`replay: ${update ? 'updated' : 'ok'} (${selected.length} script(s))`)
