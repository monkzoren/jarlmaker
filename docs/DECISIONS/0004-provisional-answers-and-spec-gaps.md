# 0004 — Provisional answers to the open questions, and known spec gaps

- **Status:** provisional. Each item is marked with the phase that needs a
  final answer. The maintainer overrules any line by editing it and
  re-running the Planner.
- **Date:** 2026-09-27

MASTER-PROMPT Section 6 asks for answers "before the Planner session". None
of them blocks Phase 0, so the first Planner run went ahead with the defaults
below and wrote the ledger so that the affected tasks stay `draft`, or carry
the assumption in their Notes.

## Open questions (Section 6)

| # | Question | Provisional answer | Needed by |
|---|----------|--------------------|-----------|
| 1 | PvP | None at launch. `faction` stays on `entity` so PvP can be a later system, not a rewrite. | P4 contract (combat targeting) |
| 2 | Art source | **Answered (ADR 0007): the agents draw the pixel art**, as text pixel sources packed by `tools/atlas`. No Pixel Lab. | — |
| 3 | 1.0 lore/content | **Answered (ADR 0007): start fresh** from the story spine (3.0). | — |
| 4 | Monetization specifics | No premium track at launch. Every cosmetic is also earnable. Price points are TBD. | P6 contract (cosmetics, commerce) |
| 5 | Hosting | Self-hosted SpacetimeDB like 1.0 (Docker). Maincloud stays an option in the runbook. | P6 deploy runbook |

## Gaps found in the spec (need a maintainer decision before their phase)

1. **The followers system has no spec.** The story spine (3.0) says "the
   lost crew = the followers system" and that each crew member is a saga
   chapter. But Section 3.5 has no followers system, Section 5 schedules it
   in no phase, and `talk` objectives need NPCs that nothing defines. The
   ledger has a P5 **draft** task, `P5-020 Followers/crew + NPC system spec`
   (lane `quests`), that must produce a Section 3.5.x spec and a decision
   record before P5 is refined.
2. **Resolved by ADR 0007.** **"Saga" meant two things.** Seasons are player-facing "Sagas" (3.0,
   3.5.11), and long quest chains are also "Sagas" (3.5.6, P7 "3 sagas",
   "the main saga"). Players will see "the Frost Saga" (a season) next to
   "the saga of the lost crew" (a quest chain). One of the two needs a
   different player-facing word before P5 content is written. Suggestion:
   quest chains are **Sagas**, and seasons become **Moons** or **Winters**
   ("the Harvest Moon").
3. **Survival needs a warmth source before structures exist.** P2's exit
   test ("naked player survives night 1 next to a campfire") comes before
   the P3 structures framework. The resolution is baked into the P2
   contract: survival reads a narrow `warmth_source` table (indexed by
   sector) that it owns. P2 tests insert fixture rows. P3's `light`/`fuel`
   behaviors write real rows. This is one interface, not a twin.
4. **The day/night clock has no owner.** Survival, the spawn director, and
   light all read "night". The ledger assigns `timeOfDay(now)` to `world`
   (P2 epic P2-013).
5. **Content cannot be imported by `core`.** `content` is validated by
   `core`'s schemas, so `content` depends on `core`, and `core` therefore
   cannot import `content` without a cycle. The P0 core contract (P0-004)
   makes content an *injected* argument: hosts load and validate content and
   pass a `Game` context into `execute`/`tick`. `content` imports `core` for
   types only.
6. **TypeScript version.** npm `typescript` latest is 7.x (the native port),
   but `typescript-eslint` supports `<6.1`. P0 pins TypeScript 5.9.x until
   the lint stack supports 7.
7. **Rifts/dungeons have no system folder.** The run loop (3.5.5, P7) is
   listed as a combat feature, but it needs its own instancing tables.
   P7-004 is a contract task that decides its home with a decision record.
