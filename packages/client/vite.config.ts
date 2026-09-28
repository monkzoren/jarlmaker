import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { host: true },
  build: { target: 'es2022' },
  test: {
    // Only pure render helpers are unit-tested here; Pixi itself is exercised
    // by the Playwright screenshot and, from P0-018, the smoke suite.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
