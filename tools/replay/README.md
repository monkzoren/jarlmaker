# @bastion/replay

`pnpm replay` (CLAUDE.md 3.4 Replay test, 3.8). Runs every recorded command
script in `tests/replay/*.json` through `core.execute` / `core.tick` on
`MemoryStore` and compares the resulting store and event log with the
committed `*.golden.json`. It is the regression net for every rule, and the
reference the smoke test (P0-018) diffs a real server against.

| Command | Does |
|---|---|
| `pnpm replay` | Run every script; exit 1 on a mismatch and print a line diff (`-` golden, `+` this run). |
| `pnpm replay walk-square` | Run the named scripts only. |
| `pnpm replay --update` | Rewrite the goldens (and a stale `contentHash`), printing a summary diff per script. Commit the result. |

## Script (`tests/replay/<name>.json`)

```json
{
  "seed": 1,                      // MemoryStore Rng seed
  "now": 0,                       // start clock, ms (optional, default 0)
  "contentHash": "sha256:…",      // canonical @bastion/content it was recorded against
  "dtMs": 100,                    // ms per tick; the store clock advances by this each tick
  "endTick": 50,                  // run the world to this tick after the last command
  "commands": [
    { "atTick": 0, "sender": "alice", "envelope": { "nonce": 1, "cmd": { "kind": "player.join" } } }
  ]
}
```

A command runs once the world clock reads `atTick` (0 is before the first
tick); the runner calls `tick` in between. `atTick` never decreases.
Envelopes go to `execute` untouched, so a script can record hostile input:
refused commands land in the golden's `rejections`. A content change makes
every script stale on purpose: re-record with `--update`.

## Golden (`tests/replay/<name>.golden.json`)

`tables` (every non-empty table, by name, rows sorted by primary key),
`events` (the event log, oldest first) and `rejections` (`{command, code,
message}`, `command` being the index in the script). One row per line; keys
sorted; bigints written as `"<digits>n"`. Keep this format stable: the smoke
test dumps the server in it.

`Store` has no scan, so the host tracks the primary keys it inserted
(`src/tracking-store.ts`) and reads them back with `get` to dump.

## Add a script

Write `tests/replay/<name>.json` with `"contentHash": ""`, run
`pnpm replay --update`, read the golden, commit both.
