# @bastion/smoke

`pnpm smoke` (CLAUDE.md 3.8): the real stack, end to end. It needs Docker and
Node 22, nothing else running.

1. Starts a throwaway container of the pinned SpacetimeDB image on a free
   local port, with a server-issued owner identity in a temporary CLI config
   (your `~/.config/spacetime` is never touched).
2. Builds the client against it (`VITE_STDB_URI`, `VITE_STDB_MODULE`) and
   serves the bundle on a free port.
3. For each scenario in `tests/smoke/*.ts`: publishes the module as a fresh
   database, records every committed transaction with `spacetime subscribe`
   as the owner (private tables included), and drives headless Chromium
   through the scenario.
4. Rebuilds the command script the server actually ran from the recording
   and runs it through core on `MemoryStore` (`@bastion/replay`). Both
   stores are written in the replay golden format and diffed. A difference
   is a host-glue bug in `packages/server` (CLAUDE.md 3.4 Replay test).
5. Removes the container, the CLI config and the bundle, pass or fail.

| Command | Does |
|---|---|
| `pnpm smoke` | Every scenario. Exit 1 on any failure. |
| `pnpm smoke walk-and-drop` | The named scenarios only. |

## Output (`tools/smoke/out/`, git-ignored)

| File | What |
|---|---|
| `<name>.script.json` | The commands the server accepted, as a replay script (`atTick` = the server tick each one committed after). Copy it to `tests/replay/` to keep it as a regression. |
| `<name>.server.json` | The server's tables at the end, golden format. |
| `<name>.memory.json` | The same script on MemoryStore, golden format. |
| `<name>.diff` | Only on a mismatch: `-` server, `+` MemoryStore. |
| `<name>.trace.zip` | Only on failure: the Playwright trace. `pnpm --filter @bastion/smoke exec playwright-core show-trace <file>`. |
| `<name>.server.log` | Only on failure: the container log. |

CI uploads the folder as the `smoke` artifact when the job fails.

## Why the golden is recomputed, not committed

The server ticks on the wall clock, so the tick a command lands on differs
run to run by a tick or two. The recording pins down exactly which tick each
command committed after, and the replay runner puts a command `atTick` N at
the same place (after tick N, before tick N+1), so the two hosts must agree
exactly. `events` are not compared: the server host has no event log yet
(`packages/server/src/store.ts`). `rejections` are: a refused reducer rolls
back and never reaches the recording, so any MemoryStore refusal is a
divergence.

How a transaction becomes a command (`src/recorder.ts`): a new `entity` owned
by the sender is `player.join`; a new `entity_input` row is `entity.move`
with that stick; one that only moved the sender's nonce is recorded as
`player.join`, which, like a re-join or a repeated stick, changes nothing
else. Transactions that write `world_clock` are ticks.

## Chromium

playwright-core is pinned to `1.56.1`, whose Chromium build (1194) is the one
pre-installed in cloud sessions (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`),
so nothing is downloaded there. Never run `playwright install` in a cloud
session. CI installs it with `playwright-core install --with-deps chromium`.
Set `SMOKE_CHROMIUM=/path/to/chrome` to use another executable.

## Add a scenario

Write `tests/smoke/<name>.ts` exporting a default `Scenario`
(`src/scenario.ts`): drive `page`, and wait on server facts with
`until(what, pred)` / `ticks(n)` over `recording` instead of sleeping.
Fail with `expect(ok, message)`. The table diff runs after every scenario.
