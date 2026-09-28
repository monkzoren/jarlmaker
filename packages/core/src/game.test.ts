import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { commandEnvelopeSchema, reject } from './commands.ts'
import { ContentError, createGame, loadContent, registerContent, registerTuning } from './game.ts'

// Registries are module state; vitest isolates each test file, so these
// registrations are visible only here.
registerTuning('movement', z.object({ speed: z.number().positive() }))
registerContent('items', z.object({ id: z.string(), stack: z.int().positive() }))

const valid = {
  tuning: { movement: { speed: 4 }, net: { tickHz: 10 } },
  items: [{ id: 'wood', stack: 50 }],
  structures: [],
}

describe('loadContent', () => {
  it('validates registered sections and reports unregistered ones', () => {
    const { content, unvalidated } = loadContent(valid)
    expect(content).toEqual({ tuning: { movement: { speed: 4 } }, items: [{ id: 'wood', stack: 50 }] })
    expect(unvalidated).toEqual(['structures', 'tuning.net'])
  })

  it('fails with the dotted path of every issue', () => {
    const broken = { tuning: { movement: { speed: -1 } }, items: [{ id: 'wood', stack: 0 }] }
    let error: unknown
    try {
      loadContent(broken)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ContentError)
    expect((error as ContentError).issues.map((i) => i.path)).toEqual(['tuning.movement.speed', 'items.0.stack'])
  })

  it('requires every registered section', () => {
    expect(() => loadContent({ tuning: {} })).toThrow(/tuning\.movement/)
    expect(() => loadContent(null)).toThrow(ContentError)
  })
})

describe('createGame', () => {
  it('carries frozen, validated content', () => {
    const game = createGame(valid)
    const content = game.content as unknown as { tuning: { movement: { speed: number } }; items: object[] }
    expect(content.tuning.movement.speed).toBe(4)
    expect(Object.isFrozen(game)).toBe(true)
    expect(Object.isFrozen(content.tuning.movement)).toBe(true)
    expect(Object.isFrozen(content.items[0])).toBe(true)
  })
})

describe('section registration', () => {
  it('rejects duplicates, bad names and the reserved section', () => {
    expect(() => registerTuning('movement', z.object({}))).toThrow(/already registered/)
    expect(() => registerTuning('Movement', z.object({}))).toThrow(/camelCase/)
    expect(() => registerContent('tuning', z.object({}))).toThrow(/reserved/)
  })
})

describe('commands', () => {
  it('parses an envelope and leaves the payload to the command schema', () => {
    const env = commandEnvelopeSchema.parse({ nonce: 3, cmd: { kind: 'entity.move', dx: 1 } })
    expect(env.cmd).toEqual({ kind: 'entity.move', dx: 1 })
    expect(commandEnvelopeSchema.safeParse({ nonce: -1, cmd: { kind: 'x' } }).success).toBe(false)
    expect(commandEnvelopeSchema.safeParse({ nonce: 1.5, cmd: { kind: 'x' } }).success).toBe(false)
    expect(commandEnvelopeSchema.safeParse({ nonce: 1, cmd: {} }).success).toBe(false)
  })

  it('reject builds a Rejection value', () => {
    expect(reject('duplicate', 'nonce 3 already seen')).toEqual({ code: 'duplicate', message: 'nonce 3 already seen' })
  })
})
