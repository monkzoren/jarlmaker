// ADR 0006: the `spacetimedb` npm package, the Docker image, and the decision
// record name one exact 2.x version. A bump that misses one of them fails here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const pkg = JSON.parse(read('../package.json')) as { dependencies: Record<string, string> };
const pinned = pkg.dependencies['spacetimedb'] ?? '';

describe('SpacetimeDB version pin', () => {
  it('npm package is an exact 2.x version', () => {
    expect(pinned).toMatch(/^2\.\d+\.\d+$/);
  });

  it('docker-compose image tag matches the npm package', () => {
    const tags = [...read('../../../docker-compose.yml').matchAll(/image:\s*clockworklabs\/spacetime:v(\S+)/g)];
    expect(tags.map((m) => m[1])).toEqual([pinned]);
  });

  it('ADR 0006 records the pinned version', () => {
    expect(read('../../../docs/DECISIONS/0006-spacetimedb-version.md')).toContain(`\`${pinned}\``);
  });
});
