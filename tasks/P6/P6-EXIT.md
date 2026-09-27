---
id: P6-EXIT
title: "P6 exit — Persistent multiplayer polish"
phase: P6
system: repo
lane: repo
depends_on: [P6-001, P6-002, P6-003, P6-010, P6-011, P6-012, P6-013, P6-014, P6-015, P6-016, P6-017, P6-018, P6-019, P6-020, P6-021, P6-022, P6-023, P6-024]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 6 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] The Docker smoke suite runs end to end in CI
- [ ] A fresh phone installs the PWA, plays, rides a 30 s dropout, and loses nothing (maintainer confirms in the playtest note)
- [ ] A Stripe test-card purchase lands as an entitlement that another player sees on your sprite (smoke scenario)
- [ ] Every other P6 task is `done` on `main` (`pnpm tasks:board` shows P6 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P6` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
