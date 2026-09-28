// The throwaway SpacetimeDB: a fresh container of the pinned image on a random
// local port and a server-issued owner identity in a private CLI config.
// `publish` (re)creates the module's database with no data; `record` runs
// `spacetime subscribe` as the owner into a Recording. `stop()` removes the
// container and the config.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Recording } from './recorder.ts'

export interface Server {
  /** `http://127.0.0.1:<port>` */
  readonly url: string
  /** `ws://127.0.0.1:<port>`, for the client's `VITE_STDB_URI`. */
  readonly wsUri: string
  /** Publish the module as `database`, wiping any data it had. */
  publish(database: string): void
  /** Stream every committed transaction of `database` into `recording`; resolves on the initial update. Returns a stop function. */
  record(database: string, recording: Recording): Promise<() => void>
  /** The container's log, for a failure report. */
  logs(): string
  stop(): void
}

const READY_TIMEOUT_MS = 60_000
const POLL_MS = 500

function run(cmd: string, args: readonly string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status ?? r.signal}):\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function startServer(opts: { root: string; log: (s: string) => void }): Promise<Server> {
  const { root, log } = opts
  const serverDir = join(root, 'packages', 'server')
  const pkg = JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const image = `clockworklabs/spacetime:v${pkg.dependencies['spacetimedb']}`
  const name = `bastion-smoke-${process.pid}-${Date.now()}`
  const cliRoot = mkdtempSync(join(tmpdir(), 'bastion-smoke-cli-'))
  const subscribers = new Set<ChildProcess>()

  log(`starting ${image} as ${name}`)
  // Root, like docker-compose.yml: the image's default user cannot write a fresh data dir.
  run('docker', ['run', '-d', '--name', name, '--user', 'root', '-p', '127.0.0.1::3000', image, 'start', '--listen-addr', '0.0.0.0:3000', '--data-dir', '/stdb/data', '--non-interactive'])
  const stop = () => {
    for (const child of subscribers) child.kill()
    spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' })
    rmSync(cliRoot, { recursive: true, force: true })
  }

  try {
    const port = run('docker', ['port', name, '3000/tcp']).trim().split('\n')[0]?.split(':').pop()
    if (port === undefined || port === '') throw new Error(`no host port for ${name}`)
    const url = `http://127.0.0.1:${port}`
    const deadline = Date.now() + READY_TIMEOUT_MS
    for (;;) {
      const ok = await fetch(`${url}/v1/ping`).then((r) => r.ok, () => false)
      if (ok) break
      if (Date.now() > deadline) throw new Error(`SpacetimeDB did not answer on ${url} within ${READY_TIMEOUT_MS / 1000} s`)
      await sleep(POLL_MS)
    }

    const spacetime = join(serverDir, 'scripts', 'spacetime.sh')
    const cli = (args: readonly string[]) => run('sh', [spacetime, '--root-dir', cliRoot, ...args], { cwd: serverDir })
    // A local server issues identities itself; that identity publishes, so it owns the database.
    const issued = (await (await fetch(`${url}/v1/identity`, { method: 'POST' })).json()) as { identity: string; token: string }
    cli(['login', '--token', issued.token])
    log(`SpacetimeDB up on ${url}; owner identity ${issued.identity.slice(0, 8)}`)

    return {
      url,
      wsUri: `ws://127.0.0.1:${port}`,
      publish(database) {
        log(`publishing the module as ${database}`)
        cli(['publish', '--server', url, '--module-path', '.', '--delete-data=always', '--yes', database])
      },
      logs: () => spawnSync('docker', ['logs', name], { encoding: 'utf8' }).stdout ?? '',
      stop,
      record(database, recording) {
        const args = ['--root-dir', cliRoot, 'subscribe', '--server', url, '--print-initial-update', '--yes', database, ...recording.queries]
        const child = spawn('sh', [spacetime, ...args], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] })
        subscribers.add(child)
        const end = () => {
          subscribers.delete(child)
          child.kill()
        }
        let stderr = ''
        child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
        const lines = createInterface({ input: child.stdout })
        return new Promise<() => void>((resolve, reject) => {
          lines.on('line', (line) => {
            if (recording.failure !== undefined) return
            try {
              recording.push(line)
              if (recording.transactions === 1) resolve(end)
            } catch (e) {
              recording.fail(e)
              reject(recording.failure)
              end()
            }
          })
          child.on('exit', (code, signal) => {
            if (!subscribers.has(child)) return
            subscribers.delete(child)
            recording.fail(new Error(`spacetime subscribe exited (${code ?? signal}):\n${stderr}`))
            reject(recording.failure)
          })
        })
      },
    }
  } catch (e) {
    const tail = spawnSync('docker', ['logs', '--tail', '50', name], { encoding: 'utf8' })
    stop()
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n--- container log ---\n${tail.stdout}${tail.stderr}`)
  }
}
