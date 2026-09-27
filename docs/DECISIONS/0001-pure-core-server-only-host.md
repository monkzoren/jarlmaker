# 0001 — Pure `core`, SpacetimeDB is the only game host

- **Status:** accepted (Planner run 1, transcribing MASTER-PROMPT Section 0, rows 1, 3, 8)
- **Date:** 2026-09-27

## Context

Bastion 1.0 had an offline simulation (`ts/*.ts`) and a SpacetimeDB module
that each implemented the same rules, plus seven `shared/*.ts` mirror
fragments stamped into both sides by `tools/mirrors.py`. Fixes on one side
regressed on the other ("the twin-implementation trap"), and the client often
predicted a different world from the one the server computed.

## Decision

1. Every game rule lives once, in `packages/core`, as pure functions over an
   abstract `Store` (`get`, `byIndex`, `insert`, `update`, `delete`, `now`,
   `rng`, `emit`). There is no `scan`.
2. The SpacetimeDB 2.x TypeScript module (`packages/server`) is the **only**
   host that runs the game for players. Reducers are thin glue: parse args,
   wrap `ctx` in a `StdbStore`, call `core.execute`, throw on rejection.
3. `MemoryStore` is a test host (unit tests, replay, balance harness, quest
   solver). It never ships to players.
4. The client computes no rules. It predicts movement only, with the same
   `core.entity.step` function the server runs.
5. There is no offline mode and no `file://` build. The PWA caches the shell only.
6. SpacetimeDB is pinned to an exact 2.x version (npm `spacetimedb` is
   2.10.1 on the day this record was written). The Phase 0 worker pins the
   version that is current when the server task starts, in the lockfile and
   the Docker image tag, and upgrades happen only with a decision record.

## Consequences

- There cannot be a second implementation of a rule, because only one
  package may contain rules and ESLint forbids `core` from importing
  `server`, `client`, `pixi.js`, or `spacetimedb`.
- Playing needs a server. Solo play means one player alone on a server.
  Reconnect and command replay (3.6.7) become features we must build and
  test, not error paths.
- Everything that simulates the game without a server (tests, balance,
  quest solving) runs on `MemoryStore` at thousands of ticks per second.
