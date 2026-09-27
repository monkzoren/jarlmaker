---
id: P7-EXIT
title: "P7 exit — Content scale and tools"
phase: P7
system: repo
lane: repo
depends_on: [P7-001, P7-002, P7-003, P7-004, P7-010, P7-011, P7-012, P7-013, P7-014, P7-015, P7-016, P7-017, P7-018, P7-019]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 7 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] contentlint and balance stay green at P7 content scale
- [ ] The season flips live and dead cleanly in the smoke suite
- [ ] The editor round-trips every content file byte-identically (test)
- [ ] Every other P7 task is `done` on `main` (`pnpm tasks:board` shows P7 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P7` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
