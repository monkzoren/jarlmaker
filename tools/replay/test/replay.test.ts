import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { content } from '@bastion/content'
import { createGame, SYSTEM_TICKS, type SystemTick } from '@bastion/core'
import { describe, expect, it } from 'vitest'
import { lineDiff } from '../src/diff.ts'
import { contentHash, formatResult, scriptSchema } from '../src/format.ts'
import { compare, runScript } from '../src/run.ts'

const DIR = fileURLToPath(new URL('../../../tests/replay/', import.meta.url))
const script = scriptSchema.parse(JSON.parse(readFileSync(`${DIR}walk-square.json`, 'utf8')))
const golden = readFileSync(`${DIR}walk-square.golden.json`, 'utf8')
const game = createGame(content)

describe('walk-square', () => {
  it('was recorded against the current content', () => {
    expect(script.contentHash).toBe(contentHash(content))
  })

  it('matches its golden, and runs identically twice', () => {
    expect(compare(runScript(game, script), golden)).toEqual({ ok: true, actual: golden, diff: '' })
    expect(formatResult(runScript(game, script))).toBe(golden)
  })

  it('fails with a readable diff when a rule changes', () => {
    // The changed rule: the movement tick integrates twice the elapsed time.
    const systems: SystemTick[] = SYSTEM_TICKS.map((s) =>
      s.system === 'entity' ? { system: 'entity', run: (ctx) => s.run({ ...ctx, dtMs: ctx.dtMs * 2 }) } : s,
    )
    const result = compare(runScript(game, script, { systems }), golden)
    expect(result.ok).toBe(false)
    const changed = result.diff.split('\n').filter((l) => /^[-+] /.test(l))
    // The old and new position rows, each on its own line, golden first.
    expect(changed.find((l) => l.startsWith('- ') && l.includes('"sector":"0,0"'))).toBeDefined()
    expect(changed.findIndex((l) => l.startsWith('- '))).toBeLessThan(changed.findIndex((l) => l.startsWith('+ ')))
    expect(result.diff).toMatch(/^@@ -\d+ \+\d+ @@$/m)
    expect(changed.every((l) => l.length < 200)).toBe(true)
  })
})

describe('script schema', () => {
  it('refuses commands out of tick order or past endTick', () => {
    const base = { seed: 0, contentHash: 'x', dtMs: 100, endTick: 5 }
    const cmd = (atTick: number) => ({ atTick, sender: 'a', envelope: {} })
    expect(scriptSchema.safeParse({ ...base, commands: [cmd(3), cmd(2)] }).success).toBe(false)
    expect(scriptSchema.safeParse({ ...base, commands: [cmd(6)] }).success).toBe(false)
    expect(scriptSchema.safeParse({ ...base, commands: [cmd(2), cmd(2)] }).success).toBe(true)
  })
})

describe('lineDiff', () => {
  it('prints hunks with context, golden lines as - and new lines as +', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join('\n')
    const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n')
    expect(lineDiff(before, after)).toBe(
      ['@@ -2 +2 @@', '  b', '  c', '- d', '+ D', '  e', '  f', '@@ -8 +8 @@', '  h', '  i', '+ j'].join('\n'),
    )
  })
})

describe('pnpm replay', () => {
  it('exits 0 on the committed scripts', () => {
    const run = spawnSync('pnpm', ['exec', 'tsx', 'src/cli.ts'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
    expect(run.stdout).toContain('replay: walk-square: ok')
    expect(run.status).toBe(0)
  })
})
