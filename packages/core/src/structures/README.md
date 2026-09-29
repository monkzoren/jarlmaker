# structures — things players build

Spec: CLAUDE.md 3.5.3. This first cut builds a structure as a prop on one
cell for a cost: the campfire. Levels, behaviors, panels and upgrading (the
full framework) arrive in Phase 3.

## Purpose

The first reason to gather: turn wood and stone into something in the world.

## Data

| Section | Fields | Notes |
|---|---|---|
| `structures` | `id, name, prop, cost` | `prop` is placed on the cell (its sprite, and whether it blocks). `cost` is items by id. |

No table of its own yet: a built structure is a `cell_delta` row whose `owner`
is the builder.

## Commands

| Kind | Payload | Rules |
|---|---|---|
| `structure.build` | `{def, cx, cy}` | The def must exist; the sender's player within `reachCells` of the cell, not standing on it; the live cell `buildable` (walkable, no prop, not a landmark, not water); the sender able to afford `cost`. Emits `structure.built`: items takes the cost, the world places the prop. Refusals: `unknown_structure`, `not_joined`, `out_of_reach`, `occupied`, `blocked`, `cannot_afford`. |

## Rules

`buildable(cell)`: open, walkable ground with nothing on it. Movement lets an
entity walk out of a cell something was built on, so nothing can be trapped.

## Player surface

The Build button (B): toggles build mode, shows the cost, greys out while you
cannot afford it. In build mode a ghost of the structure sits on the target
cell; Act places it.

## Tests

`structures.test.ts`: `buildable`. `world/harvest.test.ts` covers the build
command end to end with its refusals.
