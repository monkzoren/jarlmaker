import { describe, expect, it } from 'vitest'
import { createGame, ContentError } from '../game.ts'
import { execute } from '../execute.ts'
import { playerOf } from './commands.ts'
import { game, newStore, TUNING } from './fixture.test-util.ts'

let nonce = 0
const send = (store: ReturnType<typeof newStore>, sender: string, cmd: object) =>
  execute(game, store, sender, { nonce: (nonce += 1), cmd })

describe('player.join', () => {
  it('creates one player entity and its position at the origin', () => {
    const store = newStore()
    expect(send(store, 'alice', { kind: 'player.join' })).toBeUndefined()
    const player = playerOf(store, 'alice')
    expect(player).toMatchObject({ kind: 'player', owner: 'alice', level: 1 })
    expect(store.get('entity_pos', player!.id)).toEqual({ id: player!.id, x: 0, y: 0, vx: 0, vy: 0, facing: 0, sector: '0,0' })
  })

  it('is idempotent per sender and gives each sender its own entity', () => {
    const store = newStore()
    send(store, 'alice', { kind: 'player.join' })
    const first = playerOf(store, 'alice')!.id
    expect(send(store, 'alice', { kind: 'player.join' })).toBeUndefined()
    expect([...store.byIndex('entity', 'by_owner', 'alice')]).toHaveLength(1)
    expect(playerOf(store, 'alice')!.id).toBe(first)
    send(store, 'bob', { kind: 'player.join' })
    expect(playerOf(store, 'bob')!.id).not.toBe(first)
  })

  it('refuses extra payload fields', () => {
    expect(send(newStore(), 'alice', { kind: 'player.join', id: 7 })?.code).toBe('bad_payload')
  })
})

describe('entity.move', () => {
  it('refuses a sender that has not joined', () => {
    expect(send(newStore(), 'mallory', { kind: 'entity.move', ix: 1, iy: 0 })?.code).toBe('not_joined')
  })

  it('refuses non-numeric, non-finite and missing axes', () => {
    const store = newStore()
    send(store, 'alice', { kind: 'player.join' })
    for (const bad of [{ ix: '1', iy: 0 }, { ix: Number.NaN, iy: 0 }, { ix: Number.POSITIVE_INFINITY, iy: 0 }, { ix: 1 }]) {
      expect(send(store, 'alice', { kind: 'entity.move', ...bad })?.code).toBe('bad_payload')
    }
  })

  it('refuses naming another entity: authority is the sender', () => {
    const store = newStore()
    send(store, 'alice', { kind: 'player.join' })
    expect(send(store, 'alice', { kind: 'entity.move', ix: 1, iy: 0, id: 2n })?.code).toBe('bad_payload')
  })

  it('stores the clamped stick and marks the entity moving', () => {
    const store = newStore()
    send(store, 'alice', { kind: 'player.join' })
    const id = playerOf(store, 'alice')!.id
    expect(send(store, 'alice', { kind: 'entity.move', ix: 3, iy: 4 })).toBeUndefined()
    const input = store.get('entity_input', id)!
    expect(input.ix).toBeCloseTo(0.6)
    expect(input.iy).toBeCloseTo(0.8)
    expect(input.moving).toBe(true)
    expect([...store.byIndex('entity_input', 'by_moving', true)]).toHaveLength(1)
  })
})

describe('movement tuning', () => {
  it('rejects knobs that would let a step skip a cell', () => {
    const tunnelling = { ...TUNING, movement: { speed: 20, accel: 32, maxStepMs: 100 } }
    expect(() => createGame({ tuning: tunnelling })).toThrow(ContentError)
  })
})
