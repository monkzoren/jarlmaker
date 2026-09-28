import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The one BUILD_ID (CLAUDE.md 3.6 rule 6). `pnpm build` runs Vite under
// tools/build-id, which computes it once and passes it in the environment;
// the server module gets the same id. A bare `vite` dev server has none and
// says `dev`. Read it as `import.meta.env.BUILD_ID`; never type a version.
const buildId = process.env['BUILD_ID'] || 'dev'

// The debug corner: the id, bottom-left over the canvas, so a screenshot or
// bug report always says which build it came from. The perf overlay (P1)
// takes this corner over.
const debugCorner: Plugin = {
  name: 'bastion-build-id',
  transformIndexHtml: () => [
    {
      tag: 'div',
      attrs: {
        id: 'build-id',
        style:
          'position:fixed;left:4px;bottom:4px;z-index:1;font:10px/1 monospace;color:#fff;opacity:.5;pointer-events:none;user-select:none',
      },
      children: buildId,
      injectTo: 'body',
    },
  ],
}

export default defineConfig({
  server: { host: true },
  build: { target: 'es2022' },
  define: { 'import.meta.env.BUILD_ID': JSON.stringify(buildId) },
  plugins: [debugCorner],
  test: {
    // Only pure render helpers are unit-tested here; Pixi itself is exercised
    // by the Playwright screenshot and, from P0-018, the smoke suite.
    // Tests run in node by default; a test that needs a DOM opts into jsdom
    // with a `// @vitest-environment jsdom` docblock at the top of its file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
