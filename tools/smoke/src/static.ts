// A static file server for the built client on a free local port. Vite's own
// preview server would do, but it prints its port instead of returning it.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

export interface StaticSite {
  readonly url: string
  close(): Promise<void>
}

export async function serveStatic(dir: string): Promise<StaticSite> {
  const server: Server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([/\\])+/, '')
    let file = join(dir, path)
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
