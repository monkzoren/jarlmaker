# 0007 — Maintainer answers, round 1: art, Sagas, lore

- **Status:** accepted (maintainer answers, 2026-09-27)
- **Supersedes:** ADR 0004 Q2 and Q3, and gap 2
- **Numbering:** 0005 and 0006 are reserved by tasks P0-004 and P0-010.

## Decisions

1. **The agents draw the pixel art.** No Pixel Lab. Sprites are authored as
   **text pixel sources**: palette-indexed character grids with a legend,
   one frame per block, and animation tags. Agents can write them precisely,
   review them in a diff, and pack them deterministically. `tools/atlas`
   (P1-010) packs these and also still accepts PNG/Aseprite, in case hand
   art arrives later. Every art task attaches rendered previews to its PR,
   so the maintainer judges the pixels, not the text.
2. **Sagas are main quest lines.** Player-facing hierarchy:
   **Book → Sagas → tasks and achievements.** The player's Book is filled
   by Sagas (the lost crew, the longship, …). Each Saga is built from
   tasks/achievements, which are ordinary quests and objectives in code.
   Individual quests, side quests, and dailies are never called Sagas.
3. **Seasons are not Sagas.** Player-facing they are called **Seasons**
   (the Harvest Season) for now. The maintainer may pick a flavour name
   later; code already says `season`.
4. **Start fresh.** No 1.0 lore is ported. Everything grows from the
   shipwreck / lost-crew premise (CLAUDE.md 3.0).

## Consequences

- CLAUDE.md 3.0, 3.2, 3.5.6, 3.5.11, 3.7 and Section 5 are updated to match.
- P1-010 makes text pixel sources the primary atlas input. P1-011/P1-012 are
  agent-drawn art tasks. P7-018 (Pixel Lab hook) becomes agent-drawn art at
  scale.
- The P5 quest contract models the Book (a player-facing view over Saga
  chains) and needs no new engine.
- Honest expectation: agent-drawn art is clean and consistent under the
  locked palette, but simpler than a professional artist's. If it falls
  short at a playtest, the PNG path lets hand art replace it file by file.
