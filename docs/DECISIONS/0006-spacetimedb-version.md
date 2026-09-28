# 0006 — SpacetimeDB pinned to 2.10.1, one version everywhere

- **Status:** accepted (task P0-010)
- **Date:** 2026-09-28

## Context

CLAUDE.md 3.2 pins "SpacetimeDB 2.x (current stable, pinned)". Three things
carry a SpacetimeDB version: the `spacetimedb` npm package the module and the
client SDK import, the Docker image that runs the local server, and the
`spacetime` CLI that builds, publishes and generates bindings. If they drift,
the module ABI, the generated bindings and the host can disagree in ways
that show up only at runtime.

On 2026-09-28 the current stable release on npm and Docker Hub was
**`2.10.1`** (npm `latest`, published 2026-09-15; image
`clockworklabs/spacetime:v2.10.1`, CLI commit `3d76070`).

## Decision

- `packages/server/package.json` depends on `spacetimedb` at exactly
  `2.10.1` (no range).
- `docker-compose.yml` runs `clockworklabs/spacetime:v2.10.1`.
- The CLI is the same version: `packages/server/scripts/spacetime.sh` uses
  `$SPACETIME_BIN`, else a `spacetime` on `PATH` that reports `2.10.1`, else
  it copies the CLI binary out of the pinned image (Linux hosts). The CLI runs
  on the host, not in the container, because building a TypeScript module
  shells out to `node`, which the image does not ship.
- `packages/server/test/pin.test.ts` fails if the npm version, the image tag
  and this record disagree. Any package that later adds `spacetimedb` (the
  client SDK) pins the same exact version.

## Upgrade rule

1. An upgrade is its own task (lane `server`), never part of a feature task.
2. Move to a newer **2.x** release by changing the npm pin, the image tag,
   and the version in this record in one PR. Update the "Context" paragraph
   with the new version and date. `pin.test.ts` must pass.
3. The PR regenerates client bindings (`pnpm server:bindings`), republishes
   to a local server, and includes the transcript of publish, one reducer
   call and one SQL query, as P0-010 did.
4. A **3.x** (major) upgrade needs a new decision record that supersedes this
   one, because the module ABI and table migration rules may change and live
   worlds depend on append-only tables (CLAUDE.md 3.4).
5. Nobody upgrades mid-phase for its own sake. Upgrade for a fix or feature
   the game needs, or at a phase boundary.

## Consequences

- One number to grep and one test that keeps the three copies honest.
- macOS and Windows developers install the CLI themselves
  (`spacetime version install 2.10.1`) or set `SPACETIME_BIN`; the image only
  carries a Linux binary.
- Throwing a plain `Error` in a reducer is reported by 2.10.1 as a fatal
  instance error (HTTP 530); rejections should throw `SenderError` from
  `spacetimedb/server`. P0-011 builds reducers on that.
