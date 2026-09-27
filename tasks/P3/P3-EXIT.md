---
id: P3-EXIT
title: "P3 exit — Structures framework"
phase: P3
system: repo
lane: repo
depends_on: [P3-001, P3-010, P3-011, P3-012, P3-013, P3-014, P3-015, P3-016, P3-017]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 3 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] An agent adds a 9th structure in one content file with no code change (the PR diff touches only `packages/content/structures/` and art)
- [ ] Its panel renders against the server (smoke scenario or screenshot from a real local server)
- [ ] Every other P3 task is `done` on `main` (`pnpm tasks:board` shows P3 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P3` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
