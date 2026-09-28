import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTable } from './index.ts'
import { createRng, MemoryStore, type MemoryStoreOptions } from '@bastion/core/testing'

// Imports through the package entry, as `tools/replay` and `tools/balance` do,
// so a broken `exports` map or a dropped re-export fails here.
const note = defineTable({
  name: 'note',
  row: z.object({ id: z.string(), text: z.string() }),
  pk: 'id',
  indexes: [],
})
interface Local {
  note: typeof note
}

describe('@bastion/core/testing', () => {
  it('exports a MemoryStore that round-trips a row', () => {
    const options: MemoryStoreOptions = { tables: [note], seed: 7, now: 5 }
    const store = new MemoryStore<Local>(options)
    store.insert('note', { id: 'a', text: 'hello' })
    expect(store.get('note', 'a')).toEqual({ id: 'a', text: 'hello' })
    expect(store.now()).toBe(5)
  })

  it('exports createRng, the same PRNG MemoryStore seeds', () => {
    const store = new MemoryStore<Local>({ tables: [note], seed: 7 })
    expect(store.rng().next()).toBe(createRng(7).next())
  })
})
