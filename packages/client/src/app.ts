/**
 * Client wiring point (ADR 0001: the client renders, it computes no rules).
 * Net (P0-013) mirrors server rows into a snapshot; input (P0-014) feeds the
 * play loop (P0-015), which sends moves, predicts the local player with
 * core's `step`, and hands the renderer one snapshot per frame. Dropouts
 * (P0-016) queue commands and reconnect behind a quiet pip; the page never reloads.
 * Movement freezes while dropped, or silent, instead of queuing (ADR 0008).
 * The world is computed here from the same seed and rules as the server
 * (`terrainOf`), so it is drawn and collided locally with nothing on the wire.
 */
import { content } from '@bastion/content'
import { createGame, liveWorld, MS_PER_SECOND, stepKnobs, terrainOf } from '@bastion/core'
import { createActions } from './input/actions.ts'
import { createInput } from './input/index.ts'
import {
  connect,
  createNonceSource,
  createPlay,
  createPredictor,
  createSnapshotStore,
  createView,
  createWorldMirror,
  readNetConfig,
  statusText,
} from './net/index.ts'
import { createRenderer } from './render/index.ts'
import { createConnectionHud } from './ui/connection/index.ts'
import { createHud } from './ui/hud/index.ts'
import { createSurvivalUi } from './ui/survival.ts'

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
const terrain = terrainOf(game)
// The server's mutations (felled pines, campfires) on top of the generated
// terrain: drawn, collided and targeted with core's own rules.
const mirror = createWorldMirror()
const world = liveWorld(terrain, mirror.lookup)
const renderer = await createRenderer(host, { terrain, world, chunkSize: content.tuning.world.chunkSize, seed: content.tuning.world.seed })
const snapshot = createSnapshotStore()
const nonces = createNonceSource()

const connection = connect({
  config: readNetConfig(import.meta.env, window.location),
  snapshot,
  world: mirror,
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
    world,
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
// local player was last drawn, and the server tick. Nothing reads it per frame.
Object.assign(window, { bastionProbe: { drawn: () => play.drawn(), clock: () => snapshot.clock } })

createInput(play.sink, { knobs: { tickHz: net.tickHz, deadZone: input.deadZone, stickRadiusPx: input.stickRadiusPx } })

// The survival loop: hit pines, rocks and bushes; build a campfire; get through the night.
const campfire = content.structures.find((s) => s.id === 'campfire')
if (campfire === undefined) throw new Error('content has no campfire structure')
const itemName = new Map(content.items.map((i) => [i.id, i.name]))
const actions = createActions({
  world,
  structure: campfire,
  reachCells: content.tuning.world.reachCells,
  swingMs: content.tuning.world.hitCooldownTicks * dtMs + dtMs / 2,
  pose: () => play.pose(),
  count: (item) => mirror.count(item),
  harvest: (cx, cy) => connection.harvest(cx, cy),
  build: (def, cx, cy) => connection.build(def, cx, cy),
  onTarget: (t) => renderer.setTarget(t),
  onSwing: (cx, cy) => {
    const id = play.ownId()
    if (id !== undefined) renderer.swing(id, cx, cy)
  },
  onBuildMode: (on) => survivalHud.setBuildMode(on),
  onRefused: (why) => survivalHud.say(why),
})
const survivalHud = createHud({
  items: content.items,
  structure: campfire,
  onActDown: () => actions.actDown(),
  onActUp: () => actions.actUp(),
  onBuild: () => actions.toggleBuild(),
  onSlot: (item) => survival.eat(item),
  meterMax: content.tuning.survival.meterMax,
})
// Day and night, warmth and food.
const survival = createSurvivalUi({
  tuning: content.tuning.survival,
  items: content.items,
  mirror,
  renderer,
  hud: survivalHud,
  clock: () => snapshot.clock,
  eat: (item) => connection.eat(item),
})
const refreshHud = (): void => survivalHud.setItems(mirror.items(), Object.entries(campfire.cost).every(([i, n]) => mirror.count(i) >= n))
mirror.onChange((c) => {
  survival.changed(c)
  if (c.kind === 'vitals') return
  if (c.kind === 'delta') {
    const base = terrain.cell(c.row.cx, c.row.cy).prop?.id
    renderer.cellChanged({
      cx: c.row.cx,
      cy: c.row.cy,
      before: c.quiet ? c.row.prop || undefined : c.prev === undefined ? base : c.prev.prop || undefined,
      after: c.row.prop || undefined,
      hitsBefore: c.quiet ? c.row.hits : (c.prev?.hits ?? 0),
      hitsAfter: c.row.hits,
    })
    return
  }
  refreshHud()
  const id = play.ownId()
  if (!c.quiet && c.count > c.prev && id !== undefined) renderer.floatFrom(id, `+${c.count - c.prev} ${itemName.get(c.item) ?? c.item}`, 0xf4ead2)
})
refreshHud()
setInterval(() => play.tick(), dtMs)

const frame = (): void => {
  renderer.setEntities(play.frame())
  actions.frame()
  survival.frame()
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
