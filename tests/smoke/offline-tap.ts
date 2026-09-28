// Smoke scenario `offline-tap` (P0-043, ADR 0008): walk, stop, cut the
// socket, press and release a direction while offline, come back. Movement
// freezes while dropped, so the tap moves nothing: not the server's player,
// not the sprite, and there is no snap-back on reconnect.
//
// The drawn position comes from the page's read-only `bastionProbe`
// (packages/client/src/app.ts), in cells like `entity_pos`.

import { expect, type Scenario } from '../../tools/smoke/src/scenario.ts'

const WALK_TICKS = 5
const TAP_MS = 1_000
const SAMPLE_MS = 100
// Past `tuning.net.offlineMoveGraceMs`, so the freeze has started before the tap.
const SETTLE_MS = 1_000
const AFTER_RECONNECT_MS = 1_000
const MATCH_CELLS = 0.1
const UI_TIMEOUT_MS = 30_000

interface Point {
  readonly x: number
  readonly y: number
}

const scenario: Scenario = {
  name: 'offline-tap',
  async run({ page, context, recording, log, until, ticks }) {
    const state = page.locator('#net-status')
    const joined = () => state.and(page.locator('[data-state="joined"]')).waitFor({ timeout: UI_TIMEOUT_MS })
    const drawn = async (): Promise<Point> => {
      const p = await page.evaluate(
        () => (window as unknown as { bastionProbe?: { drawn(): Point | undefined } }).bastionProbe?.drawn(),
      )
      expect(p !== undefined && p !== null, 'the page draws the local player')
      return p
    }
    const pos = (id: bigint): Point => {
      const row = recording.get('entity_pos', id)
      return { x: row?.['x'] as number, y: row?.['y'] as number }
    }
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
    const fmt = (p: Point) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`

    await joined()
    await until('player.join committed', () => recording.commands.some((c) => c.envelope.cmd['kind'] === 'player.join'))
    const sender = recording.commands[0]?.sender ?? ''
    const player = recording.dump()['entity']?.[0] as { id: string; owner: string } | undefined
    expect(player !== undefined && player.owner === sender, 'the joined player entity is owned by the page identity')
    const id = BigInt(player.id.slice(0, -1))

    await page.keyboard.down('ArrowRight')
    await until('walking right on the server', () => recording.get('entity_input', id)?.['ix'] === 1)
    await ticks(WALK_TICKS)
    await page.keyboard.up('ArrowRight')
    await until('stopped on the server', () => recording.get('entity_pos', id)?.['vx'] === 0)
    await ticks(2)
    const atCut = pos(id)
    log(`walked and stopped at ${fmt(atCut)}; cutting the socket`)

    await context.setOffline(true)
    await state.and(page.locator('[data-state="dropped"], [data-state="reconnecting"]')).waitFor({ timeout: UI_TIMEOUT_MS })
    await page.waitForTimeout(SETTLE_MS)
    const frozen = await drawn()
    const beforeTap = recording.commands.length

    await page.keyboard.down('ArrowUp')
    let drift = 0
    for (let t = 0; t < TAP_MS; t += SAMPLE_MS) {
      await page.waitForTimeout(SAMPLE_MS)
      drift = Math.max(drift, dist(await drawn(), frozen))
    }
    await page.keyboard.up('ArrowUp')
    const offlineEnd = await drawn()
    log(`offline tap: drawn ${fmt(frozen)} -> ${fmt(offlineEnd)}, max drift ${drift.toFixed(3)} cells`)
    expect(recording.commands.length === beforeTap, 'no command reached the server while offline')

    await context.setOffline(false)
    await joined()
    await ticks(10)
    await page.waitForTimeout(AFTER_RECONNECT_MS)
    const server = pos(id)
    const shown = await drawn()
    const snap = dist(offlineEnd, server)
    log(`after reconnect: server ${fmt(server)}, drawn ${fmt(shown)}, snap-back ${snap.toFixed(3)} cells`)

    // Every check is reported, so the failing run shows the whole picture.
    const failures: string[] = []
    if (drift > MATCH_CELLS) failures.push(`the sprite walked ${drift.toFixed(3)} cells while offline (want <= ${MATCH_CELLS})`)
    if (dist(server, atCut) !== 0) failures.push(`the server moved from ${fmt(atCut)} to ${fmt(server)} on the offline tap`)
    if (snap > MATCH_CELLS) failures.push(`the sprite snapped back ${snap.toFixed(3)} cells on reconnect (want <= ${MATCH_CELLS})`)
    if (dist(shown, server) > MATCH_CELLS)
      failures.push(`drawn ${fmt(shown)} is ${dist(shown, server).toFixed(3)} cells from the server ${fmt(server)} 1 s after reconnect`)
    expect(failures.length === 0, failures.join('; '))
  },
}

export default scenario
