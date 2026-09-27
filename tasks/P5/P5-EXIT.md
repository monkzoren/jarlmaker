---
id: P5-EXIT
title: "P5 exit — Quests and progression"
phase: P5
system: repo
lane: repo
depends_on: [P5-001, P5-002, P5-010, P5-011, P5-012, P5-013, P5-014, P5-015, P5-016, P5-017, P5-018, P5-019, P5-020]
size: M
status: todo
owner: ""
pr: ""
discovered_by: ""
touches: ["docs/FEEDBACK.md"]
blocked: ""
---

## Goal
Phase 5 is closed: its Section 5 definition of done holds on `main`, verified by the listed commands, and the maintainer has played the build.

## Definition of done
- [ ] The optimal-newbie script hits the pacing targets (`pnpm test` includes it)
- [ ] Every node teaches: contentlint fails a node without `teach`, and is green
- [ ] Daily determinism and streak tests pass
- [ ] The "Saga" naming collision (ADR 0004 gap 2) is resolved by a decision record before quest content ships
- [ ] Every other P5 task is `done` on `main` (`pnpm tasks:board` shows P5 complete)
- [ ] Maintainer playtest (20 min) recorded under `## P5` in `docs/FEEDBACK.md`
- [ ] Planner run for the next phase scheduled (CLAUDE.md 7.1, phase-boundary re-run)

## Notes
Section 5 of CLAUDE.md is the source for the done-when lines. Do not add scope here; anything missing becomes a new task that this exit depends on.
