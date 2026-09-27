# 0003 — Task ledger protocol: derived statuses, branch claims, hashed board

- **Status:** accepted (Planner run 1)
- **Date:** 2026-09-27
- **Amends:** CLAUDE.md Sections 3.3 (layout), 4.1–4.5, 4.7, 7.1

## Context

Taken literally, Section 4 of the master prompt contradicts itself in four
ways, and each one would break parallel workers on the first day:

1. **`ready` with unfinished dependencies.** `tasks:validate` requires every
   `ready` task's dependencies to be `done`. The Planner kick-off also asks
   for P0/P1 tasks to be "all `ready` or dependency-blocked", but the status
   enum has no value for "planned, waiting on dependencies". `blocked` means
   a real obstacle with a reason.
2. **Claims are invisible.** `tasks:claim` flipped the status to
   `in_progress` *on the worker's branch*. Other workers read `main`, so they
   never saw the claim, and lane-conflict detection could not work.
   Committing the claim to `main` instead is also not an option: `main` is
   merge-gated, and agent sessions are often restricted to a designated
   branch name (so a `task/<id>` branch cannot be required either).
3. **`review` vs `done` on merge.** Worker step 3 set `status: review`, but
   step 5 says the merge "flips `status: done` via the PR's own change". Both
   cannot be true.
4. **A CI-committed board vs "a hand edit fails validate".** If validate
   compares `BOARD.md` to a regenerated board, every PR that changes a task
   status fails, because PRs are not supposed to commit the board. If PRs do
   commit it, every parallel PR conflicts on it.

The layout tree also nested `tools/` under `packages/`, while every other
reference says `tools/<name>` at the repo root.

## Decision

- **Stored statuses:** `draft | todo | in_progress | done | blocked`.
  - `draft`: coarse epic for a later phase, not claimable.
  - `todo`: fine-grained and planned.
  - `blocked`: requires a `blocked:` reason in the frontmatter.
- **Derived statuses** (computed by the tools, never written into a file):
  - **ready** = `todo` on `main`, every `depends_on` is `done` on `main`, and
    no live claim exists for it.
  - **review** = a remote branch holds the task as `done`, but `main` doesn't
    yet.
- **A claim is a pushed branch.** `tasks:claim <id>` fetches `origin`,
  re-checks readiness, sets `status: in_progress` and `owner`, commits
  `chore(tasks): claim <id>`, and pushes the current branch (from `main` it
  first creates `task/<id>`). `tasks:next` and `tasks:board --live` read the
  version of every task file on every remote branch (`git show
  origin/<b>:tasks/...`). Any branch where a task is `in_progress` or `done`
  while `main` has it as `todo` is a live claim.
  - **Races:** if two branches claim the same id, the earlier claim commit
    wins (ties go to the lexically smaller branch name). The loser's
    `tasks:claim` detects this after pushing and tells it to pick again.
  - **Staleness:** a claim whose branch tip is more than 72 h old is shown
    as stale and no longer blocks its lane or task.
- **Lanes are held by `in_progress` claims only.** A task in review does not
  block its lane (the work is finished; any conflict is a normal merge).
  `tasks:next` also skips a ready task whose `touches` overlap a live
  `in_progress` claim in another lane.
- **Lockfile exemption.** `pnpm-lock.yaml` is never listed in `touches`.
  Every task that adds a dependency edits it, and a conflict there is
  resolved by re-running `pnpm install` after merging `main`.
- **Finishing:** the worker sets `status: done` (+ `pr:`) in its PR. On
  `main` this becomes true exactly when the PR merges.
- **Board and status files** carry a `content-hash` of their body in an HTML
  comment. `tasks:validate` fails if the hash doesn't match (a hand edit),
  not if the board is stale. CI regenerates both on `main`; PRs don't commit
  them. The Planner commits them on planning runs.
- **Lanes added:** `core` (store/events/tick/execute kernel), `client-net`,
  `client-input`, `art`. The lane list lives in `tools/tasks/src/schema.ts`
  and in CLAUDE.md 4.4. Adding one takes a decision record.
- **Layout:** `tools/` sits at the repo root and is a set of workspace
  packages alongside `packages/*`.
- **Touches overlap** is checked conservatively: two globs overlap if the
  literal prefix before the first wildcard of one is a path-prefix of the
  other's.

## Consequences

- A worker never needs push access to `main` and works on whatever branch
  its session was given.
- `tasks:next` needs network access to `origin`. Offline, `--local` skips
  remote claims and says so.
- The board on GitHub shows `main` only. In-flight work is shown by
  `pnpm tasks:board --live`.
