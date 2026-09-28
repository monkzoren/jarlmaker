# 0009 — Work in visible vertical slices

- **Status:** accepted (maintainer, 2026-09-28)
- **Amends:** CLAUDE.md 4.1, 4.2 (granularity), 4.5, 7.1

## Context

Phase 0 ran as about 48 small tasks, each in its own worker session. Every
session re-read the spec and repeated the claim, PR and review routine, and
parallel workers collided on ids, generated files and claims. The fixed
cost per task outweighed the work. After a full day the maintainer could
play one sprite on an empty screen. Their verdict: "the amount of time and
tokens spent on so little", and "I do expect STRIDES to be made with each
commit".

## Decision

- **A task is a vertical slice a player can see.** It may span packages and
  lanes: rules, content, art, client and tests together, up to one session.
  Only foundational work invisible to a player (a CI gate, a schema
  migration) may be a slice with no visible change.
- **The integrator builds slices directly** in its own session by default.
  Separate worker sessions are for large, clearly independent slices only.
- **Every player-visible PR carries evidence**: screenshots or a clip from
  the real server, taken by whoever built it before merging.
- **Plan one slice ahead, not one phase ahead.** Existing fine-grained task
  files stay as a backlog: a slice names the ones it covers in its Notes, and
  they are closed or folded in at the next Planner run. No new fine-grained
  files are written for phases that are not being built.
- **Unchanged:** every change traces to a task file; CI gates every merge;
  rules live in `core`; tunables live in content; tests come with the code.

## Consequences

- Fewer, larger PRs, each changing what the game looks or plays like.
- Lane parallelism matters less. When several sessions do run at once, they
  take slices that touch different packages.
- The ledger (`tasks/`, the board) remains the record, but it is lighter:
  claims, `touches` and lanes only matter when two sessions run at once.
