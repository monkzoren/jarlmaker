/**
 * Client wiring point (ADR 0001: the client renders, it computes no rules).
 * Net (P0-013) mirrors server rows into a snapshot; input (P0-014) feeds the
 * play loop (P0-015), which sends moves, predicts the local player with
 * core's `step`, and hands the renderer one snapshot per frame. Dropouts
 * (P0-016) queue commands and reconnect behind a quiet pip; the page never reloads.
 * Movement freezes while dropped, or silent, instead of queuing (ADR 0008).
 */
import { content } from '@bastion/content'
import { createGame, FLAT_WORLD, MS_PER_SECOND, stepKnobs } from '@bastion/core'
import { createInput } from './input/index.ts'
import {
  connect,
  createNonceSource,
  createPlay,
  createPredictor,
  createSnapshotStore,
  createView,
  readNetConfig,
  statusText,
} from './net/index.ts'
import { createRenderer } from './render/index.ts'
import { createConnectionHud } from './ui/connection/index.ts'

const host = document.getElementById('game')
if (!host) throw new Error('#game host element missing')

const hud = document.createElement('div')
hud.id = 'net-status'
hud.style.cssText =
  'position:fixed;left:8px;top:8px;font:12px monospace;color:#d8dcd6;background:#0008;padding:2px 6px;pointer-events:none'
document.body.appendChild(hud)

// The same validated content the server loads, so prediction steps with the
// server's own knobs and tick length.
const game = createGame(content)
const { net, input } = content.tuning
const dtMs = MS_PER_SECOND / net.tickHz

const connHud = createConnectionHud()
const renderer = await createRenderer(host)
const snapshot = createSnapshotStore()
const nonces = createNonceSource()

const connection = connect({
  config: readNetConfig(import.meta.env, window.location),
  snapshot,
  nonces,
  storage: safeLocalStorage(),
  queue: { seconds: net.reconnectQueueSeconds, max: net.reconnectQueueMax },
  timing: {
    backoffMinMs: net.reconnectBackoffMinMs,
    backoffMaxMs: net.reconnectBackoffMaxMs,
    silenceMs: net.reconnectSilenceMs,
    connectTimeoutMs: net.reconnectConnectTimeoutMs,
  },
  onState: (s) => {
    hud.textContent = statusText(s)
    hud.dataset['state'] = s.kind
    connHud.update(s)
    if (s.kind === 'dropped') play.dropped()
  },
  onJoined: (identity) => play.joined(identity),
  onTraffic: () => play.heard(),
  onQueueDropped: (dropped) => connHud.queueDropped(dropped),
})

const play = createPlay({
  move: connection.move,
  snapshot,
  nonces,
  now: () => performance.now(),
  graceMs: net.offlineMoveGraceMs,
  predictor: createPredictor({
    knobs: stepKnobs(game),
    dtMs,
    world: FLAT_WORLD,
    maxTicks: net.reconnectQueueSeconds * net.tickHz,
  }),
  view: createView({
    dtMs,
    remoteDelayMs: net.remoteDelayTicks * dtMs,
    smoothMs: net.correctionSmoothMs,
    snapCells: net.correctionSnapCells,
  }),
})

// Read-only probe for the smoke suite (tests/smoke/offline-tap.ts): where the
// local player was last drawn. Nothing reads it per frame.
Object.assign(window, { bastionProbe: { drawn: () => play.drawn() } })

createInput(play.sink, { knobs: { tickHz: net.tickHz, deadZone: input.deadZone, stickRadiusPx: input.stickRadiusPx } })
setInterval(() => play.tick(), dtMs)

const frame = (): void => {
  renderer.setEntities(play.frame())
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}
