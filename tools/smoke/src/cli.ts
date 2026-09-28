// `pnpm smoke [name ...]` (CLAUDE.md 3.8): a throwaway SpacetimeDB in Docker,
// the module published to it, the client built against it and served, then
// every scenario in `tests/smoke/*.ts` (or the named ones) in headless
// Chromium. After each scenario the server's tables are diffed against the
// same commands replayed on MemoryStore (compare.ts). Everything is torn down
// in `finally`. Traces, dumps and diffs land in `tools/smoke/out/`.
//
// Chromium: playwright-core's own (`PLAYWRIGHT_BROWSERS_PATH`); set
// `SMOKE_CHROMIUM` to an executable to use another one.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { content } from '@bastion/content'
import { createGame, MS_PER_SECOND, TABLES } from '@bastion/core'
import { contentHash } from '@bastion/replay/format'
import { chromium, type Browser } from 'playwright-core'
import { compareHosts } from './compare.ts'
import { Recording } from './recorder.ts'
import { waiters, type Scenario } from './scenario.ts'
import { startServer, type Server } from './server.ts'
import { serveStatic, type StaticSite } from './static.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const OUT = join(HERE, '..', 'out')
const SCENARIOS = join(ROOT, 'tests', 'smoke')
const DATABASE = 'bastion-smoke'

const t0 = Date.now()
const log = (line: string) => console.log(`smoke ${((Date.now() - t0) / MS_PER_SECOND).toFixed(1).padStart(6)}s  ${line}`)

async function loadScenarios(only: readonly string[]): Promise<Scenario[]> {
  const files = readdirSync(SCENARIOS).filter((f) => f.endsWith('.ts')).sort()
  const all = await Promise.all(files.map(async (f) => (await import(pathToFileURL(join(SCENARIOS, f)).href) as { default: Scenario }).default))
  const unknown = only.filter((n) => !all.some((s) => s.name === n))
  if (unknown.length > 0) throw new Error(`no smoke scenario named ${unknown.join(', ')}`)
  return only.length === 0 ? all : all.filter((s) => only.includes(s.name))
}

function buildClient(server: Server, outDir: string): void {
  log('building the client against it')
  const r = spawnSync('pnpm', ['--filter', '@bastion/client', 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VITE_STDB_URI: server.wsUri, VITE_STDB_MODULE: DATABASE },
  })
  if (r.status !== 0) throw new Error(`client build failed:\n${r.stdout}\n${r.stderr}`)
}

async function runScenario(scenario: Scenario, server: Server, site: StaticSite, browser: Browser): Promise<boolean> {
  const game = createGame(content)
  const dtMs = MS_PER_SECOND / game.content.tuning.net.tickHz
  log(`[${scenario.name}] start`)
  server.publish(DATABASE)
  const recording = new Recording(TABLES)
  const stopRecording = await server.record(DATABASE, recording)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.tracing.start({ screenshots: true, snapshots: true })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') log(`[${scenario.name}] page ${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => log(`[${scenario.name}] page error: ${e.message}`))
  const trace = join(OUT, `${scenario.name}.trace.zip`)
  let ok = false
  try {
    await page.goto(site.url)
    await scenario.run({ page, context, recording, log: (l) => log(`[${scenario.name}] ${l}`), ...waiters(recording) })
    if (recording.failure !== undefined) throw recording.failure
    // One synchronous read: tables, commands and tick all belong to one transaction boundary.
    const snapshot = { commands: [...recording.commands], tables: recording.dump(), tick: recording.tick }
    stopRecording()
    const cmp = compareHosts(game, snapshot, { dtMs, contentHash: contentHash(content) })
    writeFileSync(join(OUT, `${scenario.name}.script.json`), `${JSON.stringify(cmp.script, null, 2)}\n`)
    writeFileSync(join(OUT, `${scenario.name}.server.json`), cmp.server)
    writeFileSync(join(OUT, `${scenario.name}.memory.json`), cmp.memory)
    log(`[${scenario.name}] server dump at tick ${snapshot.tick}, ${snapshot.commands.length} accepted commands`)
    if (!cmp.ok) {
      writeFileSync(join(OUT, `${scenario.name}.diff`), `${cmp.diff}\n`)
      log(`[${scenario.name}] FAIL: server tables differ from MemoryStore (- server, + MemoryStore):\n${cmp.diff}`)
    } else {
      log(`[${scenario.name}] server tables match MemoryStore for the same ${cmp.script.commands.length} commands`)
      ok = true
    }
  } catch (e) {
    log(`[${scenario.name}] FAIL: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
  } finally {
    stopRecording()
    await context.tracing.stop(ok ? {} : { path: trace })
    await context.close()
  }
  if (!ok) writeFileSync(join(OUT, `${scenario.name}.server.log`), server.logs())
  if (!ok) log(`[${scenario.name}] trace: ${trace} (open with: pnpm --filter @bastion/smoke exec playwright-core show-trace <file>)`)
  return ok
}

async function main(): Promise<number> {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const scenarios = await loadScenarios(process.argv.slice(2).filter((a) => !a.startsWith('-')))
  let server: Server | undefined
  let site: StaticSite | undefined
  let browser: Browser | undefined
  try {
    server = await startServer({ root: ROOT, log })
    const clientDir = join(OUT, 'client')
    buildClient(server, clientDir)
    site = await serveStatic(clientDir)
    log(`client on ${site.url}`)
    const executablePath = process.env['SMOKE_CHROMIUM'] || undefined
    browser = await chromium.launch({ headless: true, ...(executablePath && { executablePath }) })
    let failed = 0
    for (const s of scenarios) if (!(await runScenario(s, server, site, browser))) failed += 1
    log(failed === 0 ? `all ${scenarios.length} scenario(s) passed` : `${failed} of ${scenarios.length} scenario(s) failed`)
    return failed === 0 ? 0 : 1
  } finally {
    await browser?.close()
    await site?.close()
    server?.stop()
    rmSync(join(OUT, 'client'), { recursive: true, force: true })
    log('torn down')
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`smoke: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
    process.exit(1)
  },
)
