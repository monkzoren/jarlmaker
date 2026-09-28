// The drift test (CLAUDE.md 3.4): the committed server table file must be
// exactly what the generator produces from core's registered tables today.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tableList } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { generate } from '../src/generate.ts'

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('packages/server/src/tables.ts', () => {
  it('matches the generator output (run `pnpm --filter @bastion/gen-tables gen` if this fails)', () => {
    expect(read('../../../packages/server/src/tables.ts')).toBe(generate(tableList()).source)
  })

  it('is generated against the same spacetimedb version the server pins (ADR 0006)', () => {
    const server = JSON.parse(read('../../../packages/server/package.json')) as { dependencies: Record<string, string> }
    const own = JSON.parse(read('../package.json')) as { devDependencies: Record<string, string> }
    expect(own.devDependencies['spacetimedb']).toBe(server.dependencies['spacetimedb'])
  })
})
