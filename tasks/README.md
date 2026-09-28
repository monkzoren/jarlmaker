# The task ledger — how a worker session starts

Every change traces to a file in this folder: one task per file, at
`tasks/<phase>/<id>.md`. The rules are in CLAUDE.md Section 4, as amended by
[ADR 0003](../docs/DECISIONS/0003-task-ledger-protocol.md). This page is the
short version.

## Start a worker session

1. Read `CLAUDE.md` in full, then [`docs/BOARD.md`](../docs/BOARD.md).
2. Find work: `pnpm tasks:next` (add `--lane <lane>` if you were given one).
   It fetches `origin`, so it sees claims pushed by other workers.
3. Read the task file end to end, plus the `README.md`/`HOWTO.md` of its
   system. Restate its Definition of done as your checklist.
4. Claim it **before writing any code**: `pnpm tasks:claim <id>`. This sets
   `status: in_progress` and `owner`, commits, and pushes your current branch.
   The pushed branch *is* the claim. If you are on `main`, it creates
   `task/<id>` first. If it says another branch won the race, revert the
   claim commit and run `tasks:next` again.
5. Work only inside the task's `touches`. Anything else you find becomes a
   **new** task file. Never hand-pick its id: run
   `pnpm tasks:new --phase P0 --lane core --title "…" --touches "a/**,b.ts"`.
   It picks an id unused on `main` and on every remote branch, fills in
   `discovered_by` with the task claimed on your branch, and adds the id to
   the phase's exit task. Fill in its Goal and Definition of done, then
   **commit and push it right away**: until you push, another worker can
   still take the same id. Do not widen your task.
6. Run every check locally (`pnpm build lint test contentlint balance replay
   worldgold tasks:validate`, plus `smoke` when you touched net/server/client).
7. Tick the DoD boxes, set `status: done`, and push. Open one PR titled
   `[<id>] <title>`. The body is the Goal + the ticked DoD + `## What's Changed`
   when players can see the change. Then add `pr: <number>` to the task file
   and push again.
8. Blocked? Set `status: blocked`, write the reason in `blocked:`, file a
   task for the unblocking work, push, and end the session.

One task per session and one task per PR. Report what you could not verify.

## Statuses

| Stored in the file | Meaning |
|---|---|
| `draft` | Coarse epic for a later phase (`size: L`). Not claimable. The Planner refines it at the phase gate. |
| `todo` | Fine-grained and planned. |
| `in_progress` | Claimed on a pushed branch. On `main` this only appears after a merge mistake. |
| `done` | Set in the task's own PR, so it becomes true on `main` exactly when the PR merges. |
| `blocked` | Needs a `blocked:` reason and a linked unblocking task. |

**Derived by the tools, never typed into a file:** *ready* (`todo`, all
`depends_on` done on `main`, unclaimed) and *review* (a branch has it as
`done`, not merged yet).

## Commands

| Command | Use |
|---|---|
| `pnpm tasks:next [--lane X] [--phase P] [--local]` | Highest-priority ready task with no lane/touches conflict |
| `pnpm tasks:claim <id> [--owner name] [--no-push]` | Claim it (commit + push) |
| `pnpm tasks:new --phase P --lane L --title T --touches G [--system s] [--size S] [--depends-on ids] [--discovered-by id] [--local]` | File a new task with a collision-free id |
| `pnpm tasks:validate [--remote]` | Ledger rules. Runs in CI. `--remote` also reports ids filed twice across `main` and remote branches |
| `pnpm tasks:board [--live]` | Regenerate `docs/BOARD.md` (`--live` prints main + branch claims instead) |
| `pnpm tasks:status` | Regenerate `docs/STATUS.md` |

Never hand-edit `docs/BOARD.md` or `docs/STATUS.md`. They carry a content
hash, and CI regenerates them on `main`. PRs don't commit them.

## Writing a task (Planner, or a worker filing discovered work)

Use `pnpm tasks:new` (step 5 above), or copy any P0 file as a template
when planning a whole phase. The frontmatter keys are fixed (unknown keys
fail validation). Two rules:

- **Granularity:** ≤ ~400 changed lines, ≤ 2 packages, 1 lane.
- **Checkable DoD:** every Definition of done line must be verifiable from
  the diff or a command. `pnpm-lock.yaml` never goes in `touches`.

Lanes: `core world entity structures combat items quests survival economy
liveops cosmetics commerce client-net client-input client-render client-ui
server content art tools repo`.
