// ADR 0008 end to end on the client, with no server process: the real
// reconnector, play loop, predictor and view over a fake transport whose
// "server" is core itself on MemoryStore. The link can be cut the way a
// tunnel cuts it (calls vanish, no traffic) and restored.
import { content } from '@bastion/content'
import { createGame, currentTick, execute, MS_PER_SECOND, FLAT_WORLD, playerOf, stepKnobs, tick, type Command } from '@bastion/core'
import { MemoryStore } from '@bastion/core/testing'
import { describe, expect, it } from 'vitest'
import { createNonceSource } from './nonce.ts'
import { createPlay } from './play.ts'
import { createPredictor } from './predict.ts'
import { createReconnector, type Link, type LinkHandlers, type Timers } from './reconnect.ts'
import { createSnapshotStore } from './snapshot.ts'
import { createView } from './view.ts'

const game = createGame(content)
const { net } = content.tuning
const dtMs = MS_PER_SECOND / net.tickHz
const ME = 'me'

interface Applied {
  readonly kind: string
  readonly nonce: number
  readonly ix?: number
  readonly iy?: number
}

function harness() {
  const store = new MemoryStore()
  const snapshot = createSnapshotStore()
  const applied: Applied[] = []
  let now = 0
  let seq = 0
  let network = true
  const due = new Map<number, { at: number; fn: () => void }>()
  const timers: Timers = {
    set(fn, ms) {
      due.set(++seq, { at: now + ms, fn })
      return seq
    },
    clear: (h) => void due.delete(h as number),
  }
  const advance = (ms: number): void => {
    const end = now + ms
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined
      for (const e of due) if (e[1].at <= end && (next === undefined || e[1].at < next[1].at)) next = e
      if (next === undefined) break
      due.delete(next[0])
      now = next[1].at
      next[1].fn()
    }
    now = end
  }

  class FakeLink implements Link {
    open = true
    live = false
    constructor(readonly h: LinkHandlers) {}
    /** The server commits on receipt; a cut link swallows the call and never answers. */
    run(kind: string, nonce: number, cmd: Command): Promise<void> {
      if (!this.open || !network) return new Promise(() => undefined)
      const refused = execute(game, store, ME, { nonce, cmd })
      if (refused !== undefined) return Promise.reject(new Error(JSON.stringify(refused)))
      applied.push('ix' in cmd ? { kind, nonce, ix: cmd.ix, iy: cmd.iy } : { kind, nonce })
      return Promise.resolve()
    }
    move(nonce: number, ix: number, iy: number): Promise<void> {
      return this.run('move', nonce, { kind: 'entity.move', ix, iy })
    }
    join(nonce: number): Promise<void> {
      return this.run('join', nonce, { kind: 'player.join' })
    }
    /** A non-movement command. A re-join changes nothing else, so it stands in for build or craft. */
    use(nonce: number): Promise<void> {
      return this.run('use', nonce, { kind: 'player.join' })
    }
    close(): void {
      this.open = false
    }
  }
  const links: FakeLink[] = []
  const serverPos = () => {
    const p = playerOf(store, ME)
    return p === undefined ? undefined : store.get('entity_pos', p.id)
  }
  const deliver = (l: FakeLink): void => {
    const p = playerOf(store, ME)
    const pos = serverPos()
    if (p !== undefined && pos !== undefined) {
      snapshot.upsertEntity({ id: p.id, kind: p.kind, owner: p.owner })
      snapshot.upsertPos(pos)
    }
    snapshot.setClock(currentTick(store))
    l.h.alive()
  }
  const connectLink = (l: FakeLink): void => {
    if (!l.open || !network || l.live) return
    l.live = true
    snapshot.replace([], [])
    deliver(l)
    l.h.ready(ME)
  }

  const nonces = createNonceSource(() => 1000 + applied.length)
  const reconnector = createReconnector<FakeLink>({
    transport: (h) => {
      // As connection.ts: server traffic reaches the reconnector and the play loop.
      const l = new FakeLink({
        ...h,
        alive: () => {
          h.alive()
          play.heard()
        },
      })
      links.push(l)
      timers.set(() => connectLink(l), 0)
      return l
    },
    nonces,
    knobs: {
      queueMs: net.reconnectQueueSeconds * MS_PER_SECOND,
      queueMax: net.reconnectQueueMax,
      backoffMinMs: net.reconnectBackoffMinMs,
      backoffMaxMs: net.reconnectBackoffMaxMs,
      silenceMs: net.reconnectSilenceMs,
      connectTimeoutMs: net.reconnectConnectTimeoutMs,
    },
    timers,
    onPhase: (info) => {
      if (info.phase === 'dropped') play.dropped()
    },
    onJoined: (id) => play.joined(id),
    onExpired: () => undefined,
    onError: (e) => {
      throw new Error(e)
    },
  })
  const play = createPlay({
    move: (n, ix, iy) => reconnector.move(n, ix, iy),
    snapshot,
    nonces,
    now: () => now,
    graceMs: net.offlineMoveGraceMs,
    predictor: createPredictor({ knobs: stepKnobs(game), dtMs, world: FLAT_WORLD, maxTicks: 300 }),
    view: createView({
      dtMs,
      remoteDelayMs: net.remoteDelayTicks * dtMs,
      smoothMs: net.correctionSmoothMs,
      snapCells: net.correctionSnapCells,
    }),
  })

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }
  let seqNonce = 0
  return {
    applied,
    nonces,
    reconnector,
    /** One server tick and one client tick, then a frame. */
    async step(n = 1): Promise<void> {
      for (let i = 0; i < n; i++) {
        advance(dtMs)
        await flush()
        tick(game, store, dtMs)
        const l = links.at(-1)
        if (l !== undefined && l.live && l.open && network) deliver(l)
        await flush()
        play.tick()
        play.frame()
      }
    },
    stick(ix: number, iy: number): void {
      play.sink.send({ nonce: ++seqNonce, cmd: { kind: 'entity.move', ix, iy } })
    },
    /** The network goes away: calls vanish and the server goes silent. */
    cut(): void {
      network = false
    },
    restore(): void {
      network = true
      const l = links.at(-1)
      if (l !== undefined) connectLink(l)
    },
    drawn() {
      const d = play.drawn()
      if (d === undefined) throw new Error('nothing drawn')
      return d
    },
    server() {
      const p = serverPos()
      if (p === undefined) throw new Error('no player on the server')
      return p
    },
    moving: () => {
      const p = playerOf(store, ME)
      return p === undefined ? undefined : store.get('entity_input', p.id)
    },
    phase: () => reconnector.phase,
  }
}

type Harness = ReturnType<typeof harness>

const ticksFor = (ms: number): number => Math.ceil(ms / dtMs)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** Join, walk right and stop, then cut and wait until the drop is detected and the grace period is over. */
async function walkedThenFrozen(h: Harness): Promise<void> {
  await h.step(2)
  expect(h.phase()).toBe('online')
  h.stick(1, 0)
  await h.step(10)
  h.stick(0, 0)
  await h.step(10)
  expect(h.server().vx).toBe(0)
  h.cut()
  await h.step(ticksFor(net.reconnectSilenceMs))
  expect(h.phase()).not.toBe('online')
  await h.step(ticksFor(net.offlineMoveGraceMs) + 1)
}

async function reconnect(h: Harness): Promise<void> {
  h.restore()
  for (let i = 0; i < ticksFor(net.reconnectConnectTimeoutMs + net.reconnectBackoffMaxMs) && h.phase() !== 'online'; i++) {
    await h.step()
    h.restore()
  }
  expect(h.phase()).toBe('online')
}

describe('movement while disconnected (ADR 0008)', () => {
  it('an offline press-and-release sends nothing, the sprite holds still, and it matches the server after reconnect', async () => {
    const h = harness()
    await walkedThenFrozen(h)
    const atCut = { ...h.server() }
    const sentBefore = h.applied.length
    const frozen = h.drawn()

    h.stick(0, -1)
    await h.step(10)
    expect(dist(h.drawn(), frozen)).toBe(0)
    h.stick(0, 0)
    await h.step(5)
    expect(dist(h.drawn(), frozen)).toBe(0)
    expect(h.applied.length).toBe(sentBefore)

    await reconnect(h)
    await h.step(3)
    // Exactly one move after the reconnect: the current stick, above join's nonce.
    const after = h.applied.slice(sentBefore)
    expect(after.map((a) => a.kind)).toEqual(['join', 'move'])
    expect(after[1]).toMatchObject({ ix: 0, iy: 0 })
    expect(after[1]?.nonce).toBeGreaterThan(after[0]?.nonce ?? Infinity)
    expect(h.server()).toEqual(atCut)
    expect(dist(h.drawn(), h.server())).toBeLessThan(1e-9)
  })

  it('stops walking locally after the grace period, and a key held across the reconnect walks on from the server position', async () => {
    const h = harness()
    await h.step(2)
    h.stick(1, 0)
    await h.step(10)
    h.cut()
    // Still predicting through the grace period after the last server traffic…
    const atCut = h.drawn()
    await h.step(ticksFor(net.offlineMoveGraceMs) - 1)
    expect(h.drawn().x).toBeGreaterThan(atCut.x)
    await h.step(2)
    // …then frozen, before the drop is even detected, and for the rest of the dropout.
    const frozen = h.drawn()
    expect(h.phase()).toBe('online')
    await h.step(ticksFor(net.reconnectSilenceMs) + 20)
    expect(h.phase()).not.toBe('online')
    expect(h.drawn()).toEqual(frozen)

    await reconnect(h)
    await h.step(5)
    expect(h.moving()).toMatchObject({ ix: 1, iy: 0 })
    // The server kept the stick through the dropout: the view snaps to it once
    // and walks on from there, drawn within one tick's travel of the server.
    let prev = h.drawn().x
    for (let i = 0; i < 10; i++) {
      await h.step()
      const d = h.drawn()
      expect(d.x).toBeGreaterThan(prev)
      expect(Math.abs(d.x - h.server().x)).toBeLessThanOrEqual(content.tuning.movement.speed * (dtMs / MS_PER_SECOND) + 1e-9)
      prev = d.x
    }
  })

  it('freezes after the grace period of server silence, before the drop is detected, so a tunnel tap barely moves the sprite (P0-046)', async () => {
    const h = harness()
    await h.step(2)
    h.stick(1, 0)
    await h.step(10)
    h.stick(0, 0)
    await h.step(10)
    const atCut = { ...h.server() }
    const start = h.drawn()
    let drift = 0
    const watch = async (ms: number): Promise<void> => {
      for (let i = 0; i < ticksFor(ms); i++) {
        await h.step()
        drift = Math.max(drift, dist(h.drawn(), start))
      }
    }

    h.cut()
    await watch(200)
    expect(h.phase()).toBe('online') // the drop is seconds away yet
    h.stick(0, -1)
    await watch(600)
    h.stick(0, 0)
    await watch(5_000 - 800)
    expect(h.phase()).not.toBe('online')
    const graceWalk = content.tuning.movement.speed * (net.offlineMoveGraceMs / MS_PER_SECOND)
    // At most the grace period's worth of walking (the test above shows it does walk through it).
    expect(drift).toBeLessThanOrEqual(graceWalk)

    await reconnect(h)
    await h.step(30)
    expect(h.server()).toEqual(atCut)
    expect(dist(h.drawn(), h.server())).toBeLessThan(1e-9)
  })

  it('traffic resuming on the same link unfreezes and sends the current stick once; changes while quiet are not sent', async () => {
    const h = harness()
    await h.step(2)
    h.cut()
    await h.step(ticksFor(net.offlineMoveGraceMs) + 1)
    const sentBefore = h.applied.length
    const frozen = h.drawn()
    h.stick(1, 0)
    h.stick(0, 1)
    await h.step(5)
    expect(h.drawn()).toEqual(frozen)
    expect(h.phase()).toBe('online')

    h.restore() // same link: the server was only slow
    await h.step(3)
    expect(h.phase()).toBe('online')
    const after = h.applied.slice(sentBefore)
    expect(after).toEqual([expect.objectContaining({ kind: 'move', ix: 0, iy: 1 })])
    expect(h.drawn().y).toBeGreaterThan(frozen.y) // walking again
    await h.step(30)
    h.stick(0, 0)
    await h.step(30)
    expect(dist(h.drawn(), h.server())).toBeLessThan(1e-9)
  })

  it('a non-movement command queued offline still replays, before join and before the current stick', async () => {
    const h = harness()
    await walkedThenFrozen(h)
    h.stick(0, 1) // held through the reconnect
    const sentBefore = h.applied.length
    const n = h.nonces.next()
    const queued = h.reconnector.command((l) => l.use(n))
    expect(h.reconnector.queued).toBe(1)
    await reconnect(h)
    await h.step(3)
    await expect(queued).resolves.toBeUndefined()
    const after = h.applied.slice(sentBefore)
    expect(after.map((a) => a.kind)).toEqual(['use', 'join', 'move'])
    expect(after[2]).toMatchObject({ ix: 0, iy: 1 })
  })
})
