/**
 * Client wiring point (ADR 0001: the client renders, it computes no rules).
 * Net (P0-013) mirrors server rows into a snapshot the renderer draws; input
 * (P0-014) and reconnect (P0-015) plug in here.
 */
import { connect, createNonceSource, createSnapshotStore, readNetConfig, statusText } from './net/index.ts'
import { createRenderer } from './render/index.ts'

const host = document.getElementById('game')
if (!host) throw new Error('#game host element missing')

const hud = document.createElement('div')
hud.id = 'net-status'
hud.style.cssText =
  'position:fixed;left:8px;top:8px;font:12px monospace;color:#d8dcd6;background:#0008;padding:2px 6px;pointer-events:none'
document.body.appendChild(hud)

const renderer = await createRenderer(host)
const snapshot = createSnapshotStore()

// Coalesce row callbacks (a subscription applies many rows at once) into one
// setEntities per frame.
let queued = false
snapshot.onChange(() => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    renderer.setEntities(snapshot.toRenderSnapshot())
  })
})

connect({
  config: readNetConfig(import.meta.env, window.location),
  snapshot,
  nonces: createNonceSource(),
  storage: safeLocalStorage(),
  onState: (s) => {
    hud.textContent = statusText(s)
    hud.dataset['state'] = s.kind
  },
})

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
