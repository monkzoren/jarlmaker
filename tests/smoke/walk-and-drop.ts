// Smoke scenario `walk-and-drop` (P0-018, the Phase 0 promise): connect and
// join, walk, lose the network for 10 s mid-walk, turn while offline, come
// back, and the turn lands on the server. The harness then diffs the server's
// tables against MemoryStore for the same commands.
//
// The socket is cut with Playwright's offline mode (CDP network emulation).
// Chromium keeps the WebSocket open while offline; the client notices by its
// silence timer (no `world_clock` update for 3 s) and queues moves.

import { expect, type Scenario } from '../../tools/smoke/src/scenario.ts'

const WALK_TICKS = 10
const OFFLINE_MS = 10_000
const UI_TIMEOUT_MS = 30_000

const scenario: Scenario = {
  name: 'walk-and-drop',
  async run({ page, context, recording, log, until, ticks }) {
    let navigations = 0
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigations += 1
    })
    const state = page.locator('#net-status')
    const joined = () => state.and(page.locator('[data-state="joined"]')).waitFor({ timeout: UI_TIMEOUT_MS })
    const input = (id: bigint) => recording.get('entity_input', id)
    const pos = (id: bigint) => recording.get('entity_pos', id)

    await joined()
    await until('player.join committed', () => recording.commands.some((c) => c.envelope.cmd['kind'] === 'player.join'))
    const sender = recording.commands[0]?.sender ?? ''
    const player = recording.dump()['entity']?.[0] as { id: string; owner: string } | undefined
    expect(player !== undefined && player.owner === sender, 'the joined player entity is owned by the page identity')
    const id = BigInt(player.id.slice(0, -1))
    log(`joined as ${sender.slice(0, 8)}, entity ${id}`)
    navigations = 0

    await page.keyboard.down('ArrowRight')
    await until('walking right on the server', () => input(id)?.['ix'] === 1)
    await ticks(WALK_TICKS)
    const beforeCut = recording.commands.length
    const xAtCut = pos(id)?.['x'] as number
    log(`walking right: x ${xAtCut.toFixed(2)}; cutting the socket`)

    await context.setOffline(true)
    const cutAt = Date.now()
    await state.and(page.locator('[data-state="dropped"], [data-state="reconnecting"]')).waitFor({ timeout: UI_TIMEOUT_MS })
    log(`client noticed after ${Date.now() - cutAt} ms: ${await state.textContent()}`)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.down('ArrowDown')
    await state.filter({ hasText: /[1-9]\d* queued/ }).waitFor({ timeout: UI_TIMEOUT_MS })
    log(`turned down while offline: ${await state.textContent()}`)
    await page.waitForTimeout(Math.max(0, OFFLINE_MS - (Date.now() - cutAt)))
    expect(recording.commands.length === beforeCut, `no command reached the server while offline (saw ${recording.commands.length - beforeCut})`)
    expect(input(id)?.['ix'] === 1 && input(id)?.['iy'] === 0, 'the server still holds the pre-cut stick')
    log(`offline ${Date.now() - cutAt} ms; server x ${(pos(id)?.['x'] as number).toFixed(2)}, still walking right`)

    await context.setOffline(false)
    const backAt = Date.now()
    await joined()
    log(`back online after ${Date.now() - backAt} ms`)
    await until('the queued turn landed', () => input(id)?.['ix'] === 0 && input(id)?.['iy'] === 1)
    const yAtTurn = pos(id)?.['y'] as number
    await ticks(WALK_TICKS)
    expect((pos(id)?.['y'] as number) > yAtTurn, 'the player walks down after the replayed turn')

    await page.keyboard.up('ArrowDown')
    await until('stopped on the server', () => input(id)?.['moving'] === false && pos(id)?.['vx'] === 0 && pos(id)?.['vy'] === 0)
    const nonces = recording.commands.map((c) => c.envelope.nonce)
    expect(
      nonces.every((n, i) => i === 0 || n > (nonces[i - 1] ?? 0)),
      `accepted nonces strictly increase: ${nonces.join(', ')}`,
    )
    expect(navigations === 0, `the page never reloaded (main-frame navigations after join: ${navigations})`)
    log(`stopped at (${(pos(id)?.['x'] as number).toFixed(2)}, ${(pos(id)?.['y'] as number).toFixed(2)}); nonces ${nonces.join(', ')}`)
  },
}

export default scenario
