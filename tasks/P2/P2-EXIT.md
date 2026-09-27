---
id: P2-EXIT
title: "P2 exit — Survival, items, crafting"
phase: P2
system: repo
lane: repo
depends_on: [P2-001, P2-002, P2-003, P2-010, P2-011, P2-012, P2-013, P2-014, P2-015, P2-016]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 2 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] The night-1/night-3 survival tests pass in `pnpm test`
- [ ] Every recipe is reachable: `pnpm contentlint` green with the reachability check on
- [ ] Every other P2 task is `done` on `main` (`pnpm tasks:board` shows P2 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P2` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
