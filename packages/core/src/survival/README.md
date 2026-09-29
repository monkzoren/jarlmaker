# survival — day and night, warmth, food, health

Spec: CLAUDE.md 3.5.7. Three meters, each a reason to build. This slice has
the day-night cycle, warmth (the night takes it, the sun and campfires give it
back), food (drains, berries refill it), health (lost to cold, regained while
warm and fed) and death by cold with a respawn on the beach. Light (vision,
spawn heat) and clothing come with combat and items.

## Purpose

Make the first night the first goal: gather, build a fire, get through it.

## Data

Tuning section `survival` (`packages/content/tuning/survival.ts`):

| Knobs | Meaning |
|---|---|
| `dayTicks`, `startPhase` | Length of a day; where tick 0 falls in it. |
| `duskPhase`, `dawnPhase`, `twilight` | Night lies between dusk and dawn; each twilight eases over `twilight` of the day. |
| `meterMax`, `vitalsBuckets` | Meter ceiling; players are updated once per `vitalsBuckets` ticks, one bucket per tick. |
| `nightWarmthPerSec`, `dayWarmthPerSec` | Warmth per second at full night (negative) and full day, blended by daylight. |
| `coldDamagePerSec`, `healPerSec`, `foodPerSec` | Health lost at zero warmth; health regained while warm and fed; food drain. |
| `respawnWarmth` | Warmth share after dying. |

| Table | Shape | Index | Notes |
|---|---|---|---|
| `player_vitals` | `owner, bucket, hp, warmth, food` | `by_bucket (bucket)` | Public; the client subscribes to its own row. |

Heat comes from placed props with a `light` (`radius`, `warmthPerSec`; see
the world README): a campfire.

## Commands

| Kind | Payload | Rules |
|---|---|---|
| `player.eat` | `{item}` | The item must have `food`, be held, and the sender not already full. Adds its `food`, emits `player.ate` (items takes one). Refusals: `not_food`, `not_joined`, `none_left`, `full`. |

Reactions: `player.joined` gives the newcomer full meters. `player.died` is
emitted here; the entity system moves the player back to the spawn.

## Rules

- `daylight(tick)`: 1 by day, 0 by night, smoothstepped through dusk and dawn.
  The client draws the night with the same function.
- `stepVitals(v, dt, light, heat)`: warmth moves by the weather (blended by
  daylight) plus heat; food drains; health falls at zero warmth, else rises
  while fed. Death at zero health: fresh meters (food kept), `player.died`.
- `heatAt` (world) sums `warmthPerSec` of placed lights within their radius:
  lookups on `cell_delta`, never terrain generation.

## Tick

`survivalTick` runs after movement. Each tick it reads one bucket of
`player_vitals` by index, so each player is stepped once a second with a
one-second `dt`. `budget.test.ts` holds it, with movement, under 2 ms for
200 players.

## Player surface

Health, warmth and food bars (top centre, pulsing when low). The night
darkens the world except around fires and a small light you carry. Dusk
announces the coming night; the cold warns you; death says so and you wake
on the beach. F (or tapping berries) eats.

## Balancing knobs

All in `tuning.survival`; the campfire's radius and heat are on its prop.

## Tests

`survival.test.ts`: the day's shape, each meter rule, and the spec's targets.
A player by a campfire comes through night 1 unhurt; one with no fire
survives night 1 and dies by night 3, respawning on the beach. Also eating
and each of its refusals.
