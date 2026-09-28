import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUILD_ID_PATTERN, SERVER_BUILD_ID_FILE, formatBuildId, resolveBuildId, serverModuleSource, utcStamp } from '../src/index.ts'

const at = new Date('2026-09-28T14:15:03.120Z')

describe('build id', () => {
  it('is the short sha plus a compact UTC stamp', () => {
    expect(utcStamp(at)).toBe('20260928T141503Z')
    expect(formatBuildId('2ad089b\n', at)).toBe('2ad089b-20260928T141503Z')
  })

  it('falls back to nogit outside a checkout', () => {
    expect(formatBuildId(undefined, at)).toBe('nogit-20260928T141503Z')
    expect(formatBuildId('', at)).toBe('nogit-20260928T141503Z')
  })

  it('refuses a sha that is not hex', () => {
    expect(() => formatBuildId('not a sha', at)).toThrow(/not a build id/)
  })

  it('reuses an inherited BUILD_ID so one build stamps one id', () => {
    const never = (): never => {
      throw new Error('computed although BUILD_ID was set')
    }
    expect(resolveBuildId({ BUILD_ID: 'abcdef0-20260101T000000Z' }, never, never)).toBe('abcdef0-20260101T000000Z')
    expect(resolveBuildId({ BUILD_ID: '' }, () => 'abcdef0', () => at)).toBe('abcdef0-20260928T141503Z')
    expect(() => resolveBuildId({ BUILD_ID: '1.2.3' }, () => 'abcdef0', () => at)).toThrow(/not a build id/)
  })

  it('generates a server const the module can import', () => {
    expect(serverModuleSource('abcdef0-20260101T000000Z')).toContain("export const BUILD_ID = 'abcdef0-20260101T000000Z'")
    expect(() => serverModuleSource("x'; evil()")).toThrow()
  })
})

describe('cli', () => {
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  // A scratch root, so the tests never overwrite the id the current build stamped.
  const root = mkdtempSync(join(tmpdir(), 'build-id-'))

  it('writes the server const and hands the same id to the command it runs', () => {
    const id = 'abcdef0-20260101T000000Z'
    const out = execFileSync(process.execPath, [cli, '--root', root, '--', process.execPath, '-e', 'console.log("child:" + process.env.BUILD_ID)'], {
      encoding: 'utf8',
      env: { ...process.env, BUILD_ID: id },
    })
    expect(out).toContain(`build-id: ${id}`)
    expect(out).toContain(`child:${id}`)
    expect(readFileSync(join(root, SERVER_BUILD_ID_FILE), 'utf8')).toBe(serverModuleSource(id))
  })

  it('computes a fresh id when none is inherited', () => {
    const env: Record<string, string | undefined> = { ...process.env }
    delete env['BUILD_ID']
    const out = execFileSync(process.execPath, [cli, '--root', root], { encoding: 'utf8', env })
    const id = /build-id: (\S+)/.exec(out)?.[1] ?? ''
    expect(id).toMatch(BUILD_ID_PATTERN)
  })
})
