// `node tools/build-id/src/cli.ts [--root <dir>] [-- <command> [args...]]`
//
// Resolves the build id once, writes the server const, prints the id, then
// (when given a command) runs it with `BUILD_ID` in its environment so every
// package the command builds reads the same id. Exits with the command's code.
// Runs on plain Node (>= 22.18 strips the types), so it needs no install step.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILD_ID_ENV, SERVER_BUILD_ID_FILE, resolveBuildId, serverModuleSource } from './index.ts'

const sep = process.argv.indexOf('--')
const own = sep === -1 ? process.argv.slice(2) : process.argv.slice(2, sep)
const [cmd, ...args] = sep === -1 ? [] : process.argv.slice(sep + 1)
const rootFlag = own.indexOf('--root')
// `--root` exists for the tests; a real build always writes into this repo.
const root = rootFlag === -1 ? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..') : own[rootFlag + 1]
if (root === undefined) throw new Error('--root needs a directory')

function gitSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

function writeIfChanged(path: string, text: string): void {
  let old: string | undefined
  try {
    old = readFileSync(path, 'utf8')
  } catch {
    old = undefined
  }
  if (old === text) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const id = resolveBuildId(process.env, gitSha, () => new Date())
writeIfChanged(join(root, SERVER_BUILD_ID_FILE), serverModuleSource(id))
console.log(`build-id: ${id}`)

if (cmd !== undefined) {
  const run = spawnSync(cmd, args, { cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, [BUILD_ID_ENV]: id } })
  if (run.error) throw run.error
  process.exit(run.status ?? 1)
}
