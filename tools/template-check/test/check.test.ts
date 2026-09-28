import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkCoreSystems, readmeDataFields } from '../src/check.ts'

const fixtures = fileURLToPath(new URL('./fixtures/core-src', import.meta.url))
const coreSrc = fileURLToPath(new URL('../../../packages/core/src', import.meta.url))

describe('checkCoreSystems on fixtures', () => {
  it('names each missing template file, each drifted field, and skips exempt folders', async () => {
    expect(await checkCoreSystems(fixtures)).toEqual([
      'bare/: missing HOWTO.md',
      'bare/: missing schema.ts',
      'bare/: missing commands.ts',
      'bare/: missing a *.test.ts',
      'drift/README.md: ## Data lists `tone`, but no Zod object in drift/ declares it',
      'drift/README.md: ## Data is missing field `pitch` (declared in schema.ts: bellTuning)',
    ])
  })
})

describe('readmeDataFields', () => {
  it('reads field columns only, splits code spans, and stops at the next section', () => {
    const md = [
      '## Data',
      '',
      '| Table | Shape | Notes |',
      '|---|---|---|',
      '| `t` | `a, b` | `notes` |',
      '',
      '| Section | Knobs |',
      '| :-- | --: |',
      '| `s` | `c` (units), `d` |',
      '',
      '## Commands',
      '',
      '| Kind | Fields |',
      '|---|---|',
      '| `k` | `e` |',
    ].join('\n')
    expect([...readmeDataFields(md)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is empty without a ## Data section', () => {
    expect(readmeDataFields('# x\n\n| Shape |\n|---|\n| `a` |\n').size).toBe(0)
  })
})

describe('packages/core/src', () => {
  it('every system folder passes (entity/ is the first)', async () => {
    expect(await checkCoreSystems(coreSrc)).toEqual([])
  })

  it('reads entity/ for real, so the pass above is not vacuous', () => {
    const readme = readFileSync(`${coreSrc}/entity/README.md`, 'utf8')
    for (const field of ['id', 'sector', 'moving', 'next', 'speed', 'maxStepMs', 'sectorSize']) {
      expect(readmeDataFields(readme).has(field)).toBe(true)
    }
  })
})
