---
id: P1-EXIT
title: "P1 exit — World and movement"
phase: P1
system: repo
lane: repo
depends_on: [P1-001, P1-002, P1-003, P1-004, P1-005, P1-006, P1-007, P1-008, P1-009, P1-010, P1-011, P1-012, P1-013, P1-014, P1-015, P1-016, P1-017, P1-018, P1-019, P1-020, P1-021, P1-022, P1-023, P1-024, P1-025]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 1 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] Two browser tabs walk around each other on the server: smoke `two-players` green on `main`
- [ ] 60 fps on a phone: smoke `frame-budget` green, and the maintainer confirms on a real phone in the playtest note
- [ ] Golden seeds committed: `pnpm worldgold` green with 5 seeds × 3 zooms
- [ ] Tick budget test green: `pnpm test` includes `entity/budget.test.ts`
- [ ] Every other P1 task is `done` on `main` (`pnpm tasks:board` shows P1 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P1` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
