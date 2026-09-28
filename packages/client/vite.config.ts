import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { host: true },
  build: { target: 'es2022' },
  test: {
    // Only pure render helpers are unit-tested here; Pixi itself is exercised
    // by the Playwright screenshot and, from P0-018, the smoke suite.
    // Tests run in node by default; a test that needs a DOM opts into jsdom
    // with a `// @vitest-environment jsdom` docblock at the top of its file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
