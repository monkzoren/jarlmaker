import { defineConfig } from 'vitest/config'

// test/fixtures holds fake system folders whose `*.test.ts` files are data for the check, not tests.
export default defineConfig({
  test: { include: ['test/*.test.ts'] },
})
