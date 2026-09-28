// CLAUDE.md 3.6 rule 6: the module carries the BUILD_ID that tools/build-id
// stamps into the git-ignored `src/build-id.ts`, and serves it from the public
// `build_info` view. Publishing from this package must stamp a fresh id too, so
// a module never goes out with a stale or missing one (P0-037).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const index = read('../src/index.ts');
const pkg = JSON.parse(read('../package.json')) as { scripts: Record<string, string> };
const STAMP = 'node ../../tools/build-id/src/cli.ts -- ';

describe('build_info', () => {
  it('src/index.ts imports BUILD_ID from ./build-id.ts', () => {
    expect(index).toMatch(/^import \{ BUILD_ID \} from '\.\/build-id\.ts'$/m);
  });

  it('src/index.ts exports the public build_info view serving BUILD_ID', () => {
    expect(index).toMatch(/^export const build_info = spacetimedb\.anonymousView\(/m);
    expect(index).toContain("name: 'build_info', public: true");
    expect(index).toContain('build_id: BUILD_ID');
  });

  it('src/build-id.ts is git-ignored', () => {
    expect(read('../../../.gitignore')).toContain('packages/server/src/build-id.ts');
  });
});

describe('package scripts stamp BUILD_ID', () => {
  for (const name of ['server:publish', 'server:bindings']) {
    it(`${name} runs under tools/build-id`, () => {
      expect(pkg.scripts[name]?.startsWith(`${STAMP}sh scripts/spacetime.sh `)).toBe(true);
    });
  }
});
