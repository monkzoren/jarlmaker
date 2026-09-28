# entity — players, enemies, NPCs, followers, projectiles

Spec: CLAUDE.md 3.5.2. P0 builds movement for players; stats, statuses and
the other kinds arrive with their systems (P2, P4).

## Purpose

One entity model for every moving thing, and one pure movement function,
`step`, that the server tick and the client's prediction both call so
prediction cannot diverge in logic.

## Data

| Table | Shape | Index | Notes |
|---|---|---|---|
| `entity` | `id, kind, def, owner, level, faction` | `by_owner (owner)` | Wide; changes rarely. Never written by the tick. |
| `entity_pos` | `id, x, y, vx, vy, facing, sector` | `by_sector (sector)` | Narrow; written every step while moving. A column here is a standing broadcast (3.6 rule 3). |
| `entity_input` | `id, ix, iy, moving` | `by_moving (moving)` | The last move stick. `moving` is the tick's work list. |
| `entity_seq` | `name, next` | — | Id allocation: row `entity` holds the next entity id. |

Units: cells and seconds. Cell `(cx, cy)` spans `[cx, cx+1)`. `facing` is
radians, `atan2(iy, ix)` of the last non-zero stick. `sector` is `"sx,sy"`,
`floor(x / sectorSize)` per axis.

Tuning sections (validated at `createGame`):

| Section | Knobs | Owner |
|---|---|---|
| `movement` | `speed` (cells/s), `accel` (cells/s²), `maxStepMs` | this system (`schema.ts`) |
| `world` | `chunkSize`, `sectorSize` | registered in `world-view.ts` until the world system takes it (P1-024) |

`speed × maxStepMs` must stay under one cell, or a step could tunnel through
a one-cell wall; the schema refuses content that breaks it.

## Commands

| Kind | Payload | Rules |
|---|---|---|
| `player.join` | `{}` | Creates the sender's `player` entity at the origin. Idempotent: a second join is accepted and changes nothing. |
| `entity.move` | `{ix, iy}` | Sets the sender's stick. Non-finite or missing axes are refused (`bad_payload`); magnitude is clamped to 1. `not_joined` before a join. No command names an entity id: authority is `ctx.sender`. |

## Events

| Kind | Payload | When |
|---|---|---|
| `entity.sector_changed` | `{entity, from, to}` | A tick step moved the entity into another sector. `tick` is 0 until the kernel's tick counter (P0-025) reaches the tick context. |

## Rules

- `step(pos, input, dtMs, world, knobs)` — pure. Clamps the stick, splits
  `dtMs` into steps of at most `maxStepMs`, accelerates velocity toward
  `stick × speed` at `accel`, moves, and collides per axis against
  `world.walkable(cx, cy)` (the blocked axis stops, the other slides).
  Returns the new motion with `sector` recomputed.
- `clampInput`, `sectorOf`, `cellOf`, `atRest` — its helpers.
- `WorldView` (`world-view.ts`) is the only thing movement asks the world.
  P0 uses `FLAT_WORLD` (all walkable); P1-006 swaps in real terrain by
  changing that file only.

## Tick

`entityTick` (`tick.ts`) visits `entity_input.by_moving = true`, steps each
entity by `dtMs`, writes `entity_pos` only when motion changed, emits
`entity.sector_changed`, and clears `moving` once the stick and velocity are
both zero. Entities at rest cost nothing.

## Player surface

Walking. The client sends `entity.move` from the stick and predicts with the
same `step` (P0-014).

## Balancing knobs

`content/tuning/movement.ts`.

## Tests

- `rules.test.ts`: acceleration, speed cap, clamping, stopping, dt
  splitting, wall sliding, no tunnelling, sector recompute, purity.
- `commands.test.ts`: join idempotence, hostile move payloads, not joined.
- `tick.test.ts`: determinism (two MemoryStores and a direct `step` loop,
  bit for bit), sector events, idle entities leave the work list.
- `budget.test.ts`: 200 walking players under the 2 ms tick budget.
