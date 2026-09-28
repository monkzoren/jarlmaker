---
id: P0-EXIT
title: "P0 exit — Skeleton"
phase: P0
system: repo
lane: repo
depends_on: [P0-001, P0-002, P0-003, P0-004, P0-005, P0-006, P0-007, P0-008, P0-009, P0-010, P0-011, P0-012, P0-013, P0-014, P0-015, P0-016, P0-017, P0-018, P0-019, P0-020, P0-021, P0-022, P0-023, P0-024, P0-025, P0-026, P0-027, P0-028, P0-029, P0-030, P0-031, P0-032, P0-033, P0-034, P0-035, P0-036, P0-037, P0-038, P0-039, P0-040, P0-041]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 0 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] A sprite moves on the server with prediction: `pnpm smoke` scenario `walk-and-drop` green in CI on `main`
- [ ] It survives a cut socket: the same scenario's 10 s dropout lands every queued command
- [ ] The replay test passes on `MemoryStore`: `pnpm replay` green
- [ ] Every Section 3.8 check runs in CI (`build lint test contentlint balance replay smoke worldgold`), trivially green where nothing exists yet
- [ ] Every other P0 task is `done` on `main` (`pnpm tasks:board` shows P0 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P0` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
