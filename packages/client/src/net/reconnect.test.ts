import { content } from '@bastion/content'
import { MS_PER_SECOND } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { createNonceSource } from './nonce.ts'
import {
  backoffMs,
  createReconnector,
  MoveOffline,
  QueueDropped,
  type Link,
  type LinkHandlers,
  type PhaseInfo,
  type ReconnectKnobs,
  type Timers,
} from './reconnect.ts'

// The shipped `tuning.net` values, wired the way app.ts and connection.ts wire them.
const { net } = content.tuning
const KNOBS: ReconnectKnobs = {
  queueMs: net.reconnectQueueSeconds * MS_PER_SECOND,
  queueMax: net.reconnectQueueMax,
  backoffMinMs: net.reconnectBackoffMinMs,
  backoffMaxMs: net.reconnectBackoffMaxMs,
  silenceMs: net.reconnectSilenceMs,
  connectTimeoutMs: net.reconnectConnectTimeoutMs,
}
/** The wait before retry `n`, so the tests read in retries rather than milliseconds. */
const wait = (n: number): number => backoffMs(KNOBS, n)

/** Manual clock: timers fire only when `advance` passes them. */
function fakeTimers(): Timers & { advance(ms: number): void; readonly pending: number } {
  let now = 0
  let seq = 0
  const due = new Map<number, { at: number; fn: () => void }>()
  return {
    set(fn, ms) {
      due.set(++seq, { at: now + ms, fn })
      return seq
    },
    clear(h) {
      due.delete(h as number)
    },
    advance(ms) {
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
    },
    get pending() {
      return due.size
    },
  }
}

/**
 * A fake server with core's nonce rule: a nonce at or below the last accepted
 * one is refused as duplicate (kernel/nonce.ts). `applied` is what the server
 * actually committed, in order. Links answer only when `flush` runs, so a test
 * can kill a link while its acks are still "on the wire".
 */
function fakeServer() {
  let last = 0
  const applied: { kind: string; nonce: number; ix?: number }[] = []
  const links: FakeLink[] = []
  const accept = (nonce: number): boolean => {
    if (nonce <= last) return false
    last = nonce
    return true
  }

  class FakeLink implements Link {
    open = true
    readonly wire: (() => void)[] = []
    constructor(readonly h: LinkHandlers) {}
    call(kind: string, nonce: number, ix?: number): Promise<void> {
      return new Promise((resolve, reject) => {
        // The server commits on receipt; only the ack waits for `flush`.
        const ok = this.open && accept(nonce)
        if (ok) applied.push(ix === undefined ? { kind, nonce } : { kind, nonce, ix })
        if (!this.open) return
        this.wire.push(() => (ok ? resolve() : reject(new Error(`nonce ${nonce} duplicate`))))
      })
    }
    move(nonce: number, ix: number): Promise<void> {
      return this.call('move', nonce, ix)
    }
    join(nonce: number): Promise<void> {
      return this.call('join', nonce)
    }
    /** Any non-movement command (build, craft, …); `tag` tells them apart. */
    use(nonce: number, tag?: number): Promise<void> {
      return this.call('use', nonce, tag)
    }
    close(): void {
      this.open = false
    }
    /** Deliver every pending ack. */
    async flush(): Promise<void> {
      for (const f of this.wire.splice(0)) f()
      await Promise.resolve()
      await Promise.resolve()
    }
    /** The socket dies with its acks unsent. */
    kill(): void {
      this.open = false
      this.wire.length = 0
      this.h.lost('socket closed')
    }
  }

  return {
    applied,
    links,
    transport: (h: LinkHandlers): FakeLink => {
      const l = new FakeLink(h)
      links.push(l)
      return l
    },
    latest(): FakeLink {
      const l = links.at(-1)
      if (l === undefined) throw new Error('no link')
      return l
    },
  }
}

function setup(knobs: ReconnectKnobs = KNOBS) {
  const server = fakeServer()
  const timers = fakeTimers()
  const phases: PhaseInfo[] = []
  const joined: string[] = []
  const expired: number[] = []
  const errors: string[] = []
  let t = 1000
  const r = createReconnector({
    transport: server.transport,
    nonces: createNonceSource(() => t++),
    knobs,
    timers,
    onPhase: (p) => phases.push(p),
    onJoined: (id) => joined.push(id),
    onExpired: (n) => expired.push(n),
    onError: (e) => errors.push(e),
  })
  const kinds = () => phases.map((p) => p.phase).filter((p, i, a) => p !== a[i - 1])
  return { r, server, timers, phases, kinds, joined, expired, errors, nonce: () => t++ }
}

async function online(s: ReturnType<typeof setup>) {
  s.server.latest().h.ready('me')
  await s.server.latest().flush()
}

describe('backoffMs', () => {
  it('doubles from the floor and stops at the ceiling', () => {
    const waits = [0, 1, 2, 3, 4, 10, 30].map((a) => backoffMs(KNOBS, a))
    expect(waits[0]).toBe(KNOBS.backoffMinMs)
    expect(waits[1]).toBe(2 * KNOBS.backoffMinMs)
    expect(waits[2]).toBe(4 * KNOBS.backoffMinMs)
    expect(waits.at(-1)).toBe(KNOBS.backoffMaxMs)
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1] ?? 0)
    expect(Math.max(...waits)).toBe(KNOBS.backoffMaxMs)
  })
})

describe('connection state machine', () => {
  it('goes connecting -> online -> dropped -> reconnecting -> online over a fake transport', async () => {
    const s = setup()
    expect(s.r.phase).toBe('connecting')
    await online(s)
    expect(s.r.phase).toBe('online')
    expect(s.joined).toEqual(['me'])

    s.server.latest().kill()
    expect(s.r.phase).toBe('dropped')
    s.timers.advance(KNOBS.backoffMinMs)
    expect(s.r.phase).toBe('reconnecting')
    expect(s.server.links).toHaveLength(2)
    await online(s)
    expect(s.kinds()).toEqual(['connecting', 'online', 'dropped', 'reconnecting', 'online'])
    expect(s.joined).toEqual(['me', 'me'])
  })

  it('backs off between failed attempts and resets once online', async () => {
    const s = setup()
    await online(s)
    s.server.latest().kill()
    s.timers.advance(wait(0))
    s.server.latest().kill() // attempt 1 fails
    expect(s.r.phase).toBe('dropped')
    s.timers.advance(wait(1) - 1)
    expect(s.server.links).toHaveLength(2)
    s.timers.advance(1)
    expect(s.server.links).toHaveLength(3)
    await online(s)
    s.server.latest().kill()
    s.timers.advance(wait(0)) // back to the floor
    expect(s.server.links).toHaveLength(4)
  })

  it('nudge skips the backoff while dropped and does nothing otherwise', async () => {
    const s = setup()
    await online(s)
    s.r.nudge()
    expect(s.server.links).toHaveLength(1)
    s.server.latest().kill()
    s.timers.advance(wait(0))
    s.server.latest().kill()
    s.timers.advance(wait(1))
    s.server.latest().kill() // now waiting wait(2)
    s.r.nudge()
    expect(s.r.phase).toBe('reconnecting')
    expect(s.server.links).toHaveLength(4)
    s.r.nudge() // already reconnecting: no second attempt
    expect(s.server.links).toHaveLength(4)
    await online(s)
    expect(s.r.phase).toBe('online')
    s.timers.advance(wait(2)) // the cancelled retry never fires
    expect(s.server.links).toHaveLength(4)
  })

  it('treats a silent socket as dropped', async () => {
    const s = setup()
    await online(s)
    s.timers.advance(KNOBS.silenceMs - 1)
    s.server.latest().h.alive()
    s.timers.advance(KNOBS.silenceMs - 1)
    expect(s.r.phase).toBe('online')
    s.timers.advance(1)
    expect(s.r.phase).toBe('dropped')
    expect(s.server.links[0]?.open).toBe(false)
  })

  it('abandons an attempt that hangs past the connect timeout', async () => {
    const s = setup()
    s.timers.advance(KNOBS.connectTimeoutMs - 1)
    expect(s.r.phase).toBe('connecting')
    s.timers.advance(1)
    expect(s.r.phase).toBe('dropped')
    expect(s.server.links[0]?.open).toBe(false)
    s.timers.advance(KNOBS.backoffMinMs)
    expect(s.server.links).toHaveLength(2)
    await online(s)
    // Once ready the connect timeout is gone; only the silence timer applies.
    s.timers.advance(KNOBS.silenceMs)
    expect(s.r.phase).toBe('dropped')
    expect(s.phases.map((p) => p.reason).filter((r) => r !== undefined)).toEqual(['connect timed out', 'no server traffic'])
  })

  it('ignores late callbacks from an abandoned link', async () => {
    const s = setup()
    await online(s)
    const old = s.server.latest()
    old.kill()
    s.timers.advance(wait(0))
    old.h.ready('me') // stale
    old.h.lost('stale')
    expect(s.r.phase).toBe('reconnecting')
  })

  it('close refuses everything queued and stops retrying', async () => {
    const s = setup()
    await online(s)
    s.server.latest().kill()
    const n = s.nonce()
    const p = s.r.command((l) => l.use(n))
    s.r.close()
    await expect(p).rejects.toBeInstanceOf(QueueDropped)
    s.timers.advance(60_000)
    expect(s.server.links).toHaveLength(1)
    expect(s.r.phase).toBe('closed')
  })
})

describe('movement (ADR 0008)', () => {
  it('sends a move directly while online and resolves on the ack', async () => {
    const s = setup()
    await online(s)
    const n = s.nonce()
    const p = s.r.move(n, 1, 0)
    await s.server.latest().flush()
    await expect(p).resolves.toBeUndefined()
    expect(s.server.applied.at(-1)).toEqual({ kind: 'move', nonce: n, ix: 1 })
  })

  it('refuses a move while not online and never queues or replays it', async () => {
    const s = setup()
    await expect(s.r.move(s.nonce(), 1, 0)).rejects.toBeInstanceOf(MoveOffline) // still connecting
    await online(s)
    s.server.latest().kill()
    const press = s.r.move(s.nonce(), 0, 1)
    const release = s.r.move(s.nonce(), 0, 0)
    await expect(press).rejects.toBeInstanceOf(MoveOffline)
    await expect(release).rejects.toBeInstanceOf(MoveOffline)
    expect(s.r.queued).toBe(0)
    s.timers.advance(wait(0))
    await online(s)
    expect(s.server.applied.map((a) => a.kind)).toEqual(['join', 'join'])
  })

  it('refuses a move still in flight when the link drops, and does not replay it', async () => {
    const s = setup()
    await online(s)
    const n = s.nonce()
    const p = s.r.move(n, 1, 0)
    s.server.latest().kill() // the ack dies with the socket
    await expect(p).rejects.toBeInstanceOf(MoveOffline)
    s.timers.advance(wait(0))
    await online(s)
    expect(s.server.applied.filter((a) => a.nonce === n)).toHaveLength(1)
    expect(s.server.applied.at(-1)?.kind).toBe('join')
  })
})

describe('command queue (every command but movement)', () => {
  it('sends directly while online and resolves on the ack', async () => {
    const s = setup()
    await online(s)
    const n = s.nonce()
    const p = s.r.command((l) => l.use(n, 1))
    await s.server.latest().flush()
    await expect(p).resolves.toBeUndefined()
    expect(s.r.queued).toBe(0)
    expect(s.server.applied.at(-1)).toEqual({ kind: 'use', nonce: n, ix: 1 })
  })

  it('queues during a dropout and replays oldest-first before join', async () => {
    const s = setup()
    await online(s)
    s.server.latest().kill()
    const nonces = [s.nonce(), s.nonce(), s.nonce()]
    const ps = nonces.map((n) => s.r.command((l) => l.use(n)))
    expect(s.r.queued).toBe(3)
    s.timers.advance(wait(0))
    await online(s)
    await Promise.all(ps)
    const after = s.server.applied.slice(-4)
    expect(after.map((a) => a.kind)).toEqual(['use', 'use', 'use', 'join'])
    expect(after.slice(0, 3).map((a) => a.nonce)).toEqual(nonces)
    expect(s.r.queued).toBe(0)
  })

  it('replays a command whose ack was lost, and server dedupe keeps it from applying twice', async () => {
    const s = setup()
    await online(s)
    const n = s.nonce()
    const p = s.r.command((l) => l.use(n)) // committed on the server...
    s.server.latest().kill() // ...but the ack dies with the socket
    expect(s.r.queued).toBe(1)
    s.timers.advance(wait(0))
    await online(s)
    // The replay came back `duplicate`: refused, not applied again.
    await expect(p).rejects.toThrow('duplicate')
    expect(s.server.applied.filter((a) => a.nonce === n)).toHaveLength(1)
    expect(s.r.queued).toBe(0)
  })

  it('holds at most queueMax commands, dropping the oldest', async () => {
    const s = setup({ ...KNOBS, queueMax: 2 })
    await online(s)
    s.server.latest().kill()
    const ps = [1, 2, 3].map((tag) => {
      const n = s.nonce()
      return s.r.command((l) => l.use(n, tag))
    })
    await expect(ps[0]).rejects.toBeInstanceOf(QueueDropped)
    expect(s.r.queued).toBe(2)
    s.timers.advance(wait(0))
    await online(s)
    await Promise.all(ps.slice(1))
    expect(s.server.applied.filter((a) => a.kind === 'use').map((a) => a.ix)).toEqual([2, 3])
  })

  it('drops the whole queue with one expiry past the window, and keeps reconnecting', async () => {
    const s = setup()
    await online(s)
    s.server.latest().kill()
    const [a, b] = [s.nonce(), s.nonce()]
    const ps = [s.r.command((l) => l.use(a)), s.r.command((l) => l.use(b))]
    s.timers.advance(KNOBS.queueMs - 1)
    expect(s.expired).toEqual([])
    s.timers.advance(1)
    expect(s.expired).toEqual([2])
    for (const p of ps) await expect(p).rejects.toBeInstanceOf(QueueDropped)
    expect(s.r.queued).toBe(0)
    expect(s.r.phase).not.toBe('online')
    // Still retrying: the next attempt that lands brings the player back.
    const links = s.server.links.length
    s.timers.advance(KNOBS.backoffMaxMs)
    expect(s.server.links.length).toBeGreaterThan(links)
    await online(s)
    expect(s.r.phase).toBe('online')
    expect(s.server.applied.filter((a) => a.kind === 'use')).toEqual([])
  })

  it('does not expire when the reconnect lands inside the window', async () => {
    const s = setup()
    await online(s)
    s.server.latest().kill()
    const n = s.nonce()
    const p = s.r.command((l) => l.use(n))
    s.timers.advance(10_000) // a 10 s tunnel
    s.server.latest().h.ready('me')
    await s.server.latest().flush()
    await expect(p).resolves.toBeUndefined()
    s.timers.advance(KNOBS.queueMs)
    expect(s.expired).toEqual([])
  })
})
