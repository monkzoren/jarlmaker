---
id: P4-EXIT
title: "P4 exit — Combat and bestiary"
phase: P4
system: repo
lane: repo
depends_on: [P4-001, P4-010, P4-011, P4-012, P4-013, P4-014, P4-015, P4-016, P4-017, P4-018, P4-019, P4-020]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 4 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] `pnpm balance` is green in CI with the gate on
- [ ] `docs/BALANCE.md` exists on `main` and was written by CI
- [ ] Every other P4 task is `done` on `main` (`pnpm tasks:board` shows P4 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P4` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
