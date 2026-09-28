import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { registerTuning } from '@bastion/core'
import { content } from '@bastion/content'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { findFunctions, lintContent } from '../src/lint.ts'
import { content as broken } from './fixtures/broken.ts'

// Registries are module state and vitest isolates each test file, so this
// fixture section exists only here.
registerTuning('lintFixture', z.object({ speed: z.number().positive() }))

describe('lintContent', () => {
  it('rejects the broken fixture with a readable path for each problem', () => {
    const { errors } = lintContent(broken)
    expect(errors).toEqual([
      'tuning.world.pick: functions are not allowed in content',
      'tuning.lintFixture.speed: Too small: expected number to be >0',
    ])
  })

  it('warns about sections no system has registered', () => {
    const { errors, warnings } = lintContent({ tuning: { lintFixture: { speed: 1 }, net: { tickHz: 10 } } })
    expect(errors).toEqual([])
    expect(warnings).toEqual(['tuning.net: no system has registered a schema for this section'])
  })

  it('finds functions at any depth, including in arrays', () => {
    expect(findFunctions({ a: [{ b: 1 }, { c: () => 0 }] })).toEqual(['a.1.c: functions are not allowed in content'])
    expect(findFunctions(() => 0)).toEqual(['(root): functions are not allowed in content'])
  })

  it('finds no functions in the real content set', () => {
    expect(findFunctions(content)).toEqual([])
  })
})

describe('cli', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const run = (...args: string[]) => spawnSync('pnpm', ['exec', 'tsx', 'src/cli.ts', ...args], { cwd, encoding: 'utf8' })

  it('passes on the real content set', () => {
    const { status, stdout } = run()
    expect(status).toBe(0)
    expect(stdout).toMatch(/^contentlint: ok/m)
  })

  it('exits non-zero on the broken fixture and names the path', () => {
    const { status, stderr } = run('test/fixtures/broken.ts')
    expect(status).toBe(1)
    expect(stderr).toContain('contentlint: error: tuning.world.pick: functions are not allowed in content')
  })
})
