# items — resources, inventory

Spec: CLAUDE.md 3.5.4. This first cut is stackable resources counted per
player. Slots, equipment, rarity, affixes, recipes and loot come later.

## Purpose

What the player carries: every harvest adds to it and every build takes from it.

## Data

| Section | Fields | Notes |
|---|---|---|
| `items` | `id, name, icon` | `icon` is an art id in `art/items`. |

| Table | Shape | Index | Notes |
|---|---|---|---|
| `inventory` | `key, owner, item, count` | `by_owner (owner)` | One row per (owner, item), `key` = `"owner\|item"`. Public for now; the client subscribes to its own rows only. |

## Commands

None yet. Items move through events:

| Event | Effect |
|---|---|
| `world.harvested` | +1 of the harvested item for `by`. |
| `structure.built` | −cost of the structure for `by` (the build command checked it first). |

## Rules

`countOf`, `addItem` (refuses to go below zero), `affords(have, cost)` (the
client passes its mirrored counts) and `canAfford(store, owner, cost)`.

## Player surface

The inventory bar at the bottom of the screen: each item's icon and count,
bumping when it grows.

## Tests

`items.test.ts`: counting, adding, refusing negatives, affordability.
