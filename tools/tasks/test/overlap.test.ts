import { describe, expect, it } from 'vitest'
import { globPrefix, globsOverlap } from '../src/overlap.ts'

describe('globs', () => {
  it('takes the literal prefix', () => {
    expect(globPrefix('packages/core/src/**')).toBe('packages/core/src')
    expect(globPrefix('packages/*/package.json')).toBe('packages')
    expect(globPrefix('docs/FEEDBACK.md')).toBe('docs/FEEDBACK.md')
  })

  it('overlaps conservatively on path prefixes, not string prefixes', () => {
    expect(globsOverlap('packages/core/src/**', 'packages/core/src/entity/**')).toBe(true)
    expect(globsOverlap('packages/core/**', 'packages/client/**')).toBe(false)
    expect(globsOverlap('packages/core/**', 'packages/core-extra/**')).toBe(false)
    expect(globsOverlap('docs/A.md', 'docs/A.md')).toBe(true)
    expect(globsOverlap('docs/A.md', 'docs/B.md')).toBe(false)
    expect(globsOverlap('packages/*/package.json', 'packages/core/src/x.ts')).toBe(true)
  })
})
