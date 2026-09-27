<!-- Seeded from docs/MASTER-PROMPT.md (Section 3 onward). Sections 0–2 of that file hold the
     maintainer decisions and the 1.0 wound list; read them when you need the "why".
     Amended by docs/DECISIONS/0003-task-ledger-protocol.md. -->

# 3. BASTION 2.0 — Agent guide (the prompt proper)

You are building **Bastion 2.0**, a sandbox survival-crafting RPG with base
building, roguelike-inspired combat, and a large procedural world, played on
a shared persistent SpacetimeDB server. **There is no offline mode.** It runs
in the browser, phone-first, and is built almost entirely by LLM agents. **The
architecture exists to make agent work safe, local, and testable.** When a
choice trades a little runtime elegance for a lot of agent legibility, take
legibility.

**Player-facing title: Jarlmaker** (subtitle: *A Longship Saga*). The
codename `bastion` stays in every identifier (package names, table names,
save keys, the module); "Jarlmaker" appears only where a player reads it.

## 3.0 Story spine (the premise every system serves)

You are a Viking whose voyage went wrong. The longship is wrecked on a far
shore, the crew is scattered, and home is across the sea. You survive the
first nights, raise a camp, find your crew one by one, gather followers, and
grow the camp into a hold. The name you earn at the end is **Jarl**.

How the premise maps onto the framework, so no system invents its own story:

- **Rank ladder = the progression tree's spine** (3.5.6). Player titles are
  milestone rewards in order: *Castaway → Hearthkeeper → Chieftain → Jarl*.
  The final node is the goal every quest points at.
- **The lost crew = the followers system.** Each crew member is a chapter
  of the main saga: find them, earn them back, they join the camp with a
  role. One chapter per crew member gives the main saga its structure.
- **The longship = the endgame structure and the run loop.** Rebuilding it
  is the late progression sink; each voyage from it is an instanced
  roguelike run (3.5.5). "Going home" is the hook, not the end.
- **The Book, Sagas, and tasks** (ADR 0007). Player-facing, the story is a
  **Book** filled by **Sagas**. A Saga is a traditional main quest line (the
  lost crew, the longship). Sagas are built from **tasks and achievements**
  (ordinary quests and objectives). Seasons are *not* Sagas; player-facing
  they are **Seasons** (the Harvest Season) until the maintainer names them.
- **Tone:** grounded Norse frontier, not mythic fantasy on the cover.
  Myth arrives through the seasons and the deep rings, never on night one.

Branding, for the client and store pages: a pixel longship prow beached on
a grey shore, broken mast, torn sail with the raven sigil intact. Palette of
sea grey, pine green, and one ember orange for the camp fire. Chunky pixel
rune-serif wordmark. Tagline: *"Lost your crew. Build a home. Earn the name
Jarl."*

## 3.1 Pillars (use these to break ties)

1. **One world, one truth.** Every rule runs from `packages/core`. The server
   is the only host; the client renders and predicts with the same code.
2. **Data before code.** A new structure, enemy, item, recipe, quest, or biome
   is a data file. Code changes only when a new *kind of behavior* is needed.
3. **Every number has a formula.** Tunables live in `packages/content/tuning`
   and derive from level, tier, and a power budget. No magic constants in
   rules.
4. **Everything is a test.** Pure rules get unit tests; combat gets the balance
   harness; worldgen gets golden seeds; command scripts get replay goldens.
5. **Commute-friendly.** 5-minute sessions must be rewarding; a connection
   drop must recover silently; a phone at 60fps is the performance target.
6. **Small and same-shaped.** Every system folder has the same layout, so an
   agent that has added one structure can add an enemy or a quest.

## 3.2 Tech stack (pinned, do not substitute without a decision record)

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess` | One `tsconfig.base.json`. |
| Monorepo | pnpm workspaces + Turborepo | `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm balance`. |
| Server | SpacetimeDB 2.x (current stable, pinned), TypeScript module | Tables + reducers are thin glue over `core`. |
| Test host | `MemoryStore` under Vitest | The same `core` over an in-memory store: unit tests, replay tests, the balance harness, the quest solver. Never shipped. |
| Client | PixiJS v8 (WebGL2/WebGPU), Vite, no UI framework for HUD (lit-html for panels) | The renderer is a *view* of a snapshot. |
| Schemas | Zod | Every content file and every network payload is validated at load. |
| Tests | Vitest (unit), Playwright (smoke), custom balance harness | All run in CI on every PR; merge is gated. |
| Art | Agent-authored text pixel sources (palette-indexed grids) → `tools/atlas` → packed atlases + JSON | 16px tiles, locked 64-colour palette. The agents draw the art (ADR 0007). PNG/Aseprite input stays supported for later hand art. No Pixel Lab. |
| Audio | Howler.js | Sound banks are content files. |
| Lint | ESLint + custom rules (`no-tick-scan`, `no-tunable-literal`, `max-file-lines`) | The custom rules are the architecture police. |

## 3.3 Repository layout

```
jarlmaker/                      # repo root (codename bastion)
  CLAUDE.md                     # this file
  packages/
    core/                       # THE GAME. Pure TS. No PixiJS, no spacetimedb imports.
      src/
        store/                  # Store interface + in-memory impl + query helpers
        events/                 # GameEvent union (the only way systems talk)
        world/                  # worldgen, chunks, biomes, POIs
        entity/                 # player, movement, stats, status effects
        structures/             # structure framework + behaviors
        combat/                 # damage, targeting, brains, affixes
        items/                  # items, inventory, crafting, loot
        survival/               # food, warmth, light
        quests/                 # quest graph, objectives, progression tree
        economy/                # resources, trade, caps
        liveops/                # daily quests, seasons/events, reward tracks
        cosmetics/              # cosmetic defs, entitlements, loadouts, shop offers
        tick.ts                 # the one tick function (calls each system's tick)
        index.ts
    content/                    # DATA. Validated by core's schemas at load and in CI.
      structures/*.ts  enemies/*.ts  items/*.ts  recipes/*.ts  quests/*.ts
      biomes/*.ts  species/*.ts  brains/*.ts  affixes/*.ts  progression/*.ts
      dailies/*.ts  seasons/*.ts  cosmetics/*.ts  shop/*.ts
      tuning/*.ts               # every curve and knob, with a comment on intent
    server/                     # SpacetimeDB module. Thin.
      src/tables.ts             # table schema — mirrors core store shapes 1:1
      src/reducers/*.ts         # one file per reducer; each calls one core command
      src/tick.ts               # scheduled reducer → core.tick()
      src/store.ts              # Store implementation over ctx.db
    commerce/                   # Trusted sidecar: Stripe webhook → grantPurchase reducer. No game logic.
    client/                     # View + input + net.
      src/net/                  # STDB connection, subscriptions, reconnect + command replay
      src/render/               # PixiJS scene, camera, chunk renderer, sprites
      src/ui/                   # HUD, panels (declarative, from core panel schemas)
      src/input/                # touch + keyboard + gamepad → Commands
      src/app.ts
  tools/                        # repo-root workspace packages (ADR 0003)
    balance/                    # headless fight simulator + report + CI gate
    atlas/                      # Aseprite → atlas packer
    worldview/                  # renders a seed to PNG for golden tests / review
    contentlint/                # schema validation + cross-reference checks
    tasks/                      # ledger tooling: validate, board, next, claim (Section 4)
  tasks/                        # THE TASK LEDGER — one file per task (Section 4)
    P0/  P1/  …  P7/
  docs/
    BOARD.md                  # generated from tasks/ by CI on main; never hand-edited
    STATUS.md                 # generated per-phase progress + burndown
    DECISIONS/                  # ADR-style: one file per architectural decision
    FEEDBACK.md                 # maintainer playtest notes, phase by phase
  .github/workflows/ci.yml     # build, lint, test, balance, contentlint, smoke
```

**Hard layout rules**

- `core` imports nothing from `server` or `client`. ESLint enforces.
- No file over **600 lines**. The linter fails the build at 601. Split by
  concept, not by line count.
- Every system folder under `core/src/` contains: `README.md` (the design doc),
  `schema.ts` (Zod types for its content), `rules.ts` (pure functions),
  `tick.ts` (if it has per-tick work), `commands.ts` (player intents it
  accepts), `*.test.ts`, and `HOWTO.md` (the "add one of these" checklist).
- Content files export a typed array and nothing else. No functions in content.

## 3.4 The core model

### Store

```ts
interface Store {
  get<T extends TableName>(t: T, id: Id): Row<T> | undefined
  byIndex<T extends TableName, K extends IndexOf<T>>(t: T, k: K, v: IndexVal<T,K>): Iterable<Row<T>>
  insert<T extends TableName>(t: T, row: Row<T>): void
  update<T extends TableName>(t: T, row: Row<T>): void
  delete<T extends TableName>(t: T, id: Id): void
  now(): Timestamp          // ctx.timestamp on the server; a fixed clock in tests
  rng(): Rng                // ctx.random on the server; a seeded PRNG in tests
  emit(e: GameEvent): void  // append to the event log (see Events)
}
```

- **There is no `scan(table)`.** Every read is by primary key or a declared
  index. If a rule needs a scan, the data is shaped wrong; add an index or a
  denormalized column. This is the single rule that keeps the tick cheap.
- Table shapes are declared **once** in `core/src/store/tables.ts` as Zod
  schemas with declared indexes. `server/src/tables.ts` and the memory store
  are generated from them (`pnpm gen:tables`), and a test fails if the
  generated files drift.
- Tables are **append-only with defaults** from the first published version.
  Never rename, never repurpose a column.

### Commands and events

- A **Command** is a player intent: `{kind: 'build', def: 'wall', at: Cell}`.
  Commands are validated as hostile (bounds, ownership, cost, cooldown, cap)
  by `core`; hosts never validate.
- A **GameEvent** is a fact that happened: `{kind: 'structure.built', by, def,
  at, tick}`. Every system that needs to *react* (quests, progression, stats,
  telemetry, tutorial hints) subscribes to events. Systems never call each
  other directly; they read the store and emit events.
- The event union is the contract that lets quests, achievements, and the
  tutorial be pure data: an objective is "count events matching this shape".

### The tick

`core.tick(store, dt)` calls each system's `tick` in a fixed order documented
in `core/src/tick.ts`. Budget: **≤ 2 ms per tick for 200 online players at
10 Hz** on the server. Each system's tick has a `budget.test.ts` that runs it
against a synthetic 200-player world and asserts wall time. Positions move on
a narrow `entity_pos` table; the wide `entity` row updates only on state
change.

### Hosts

- **Server host** (`packages/server`): every reducer is 5–15 lines: parse
  args with the command schema, build a `StdbStore` over `ctx`, call
  `core.execute(store, sender, cmd)`, throw on rejection so the transaction
  rolls back. A scheduled reducer calls `core.tick`. Authority is always
  `ctx.sender`, never an argument.
- **Test host** (`core/src/store/memory.ts`): the same `core.execute`/
  `core.tick` over `MemoryStore`. Every rule test, the balance harness, the
  quest solver and the replay suite run here at thousands of ticks per second
  with no server. It is a fixture, not a product.
- **Replay test**: recorded command scripts run through `MemoryStore` and
  assert the resulting store and event sequence against a committed golden.
  The same script runs against a throwaway SpacetimeDB in the smoke suite and
  the two stores are diffed, which catches host-glue bugs in `server/`.

### Client

The client never computes rules. It (1) turns input into Commands, (2) sends
them to the server through the STDB connection, (3) renders the latest
snapshot with interpolation, and (4) predicts only movement, using the *same*
`core.entity.step` function for prediction so the prediction cannot diverge
in logic. HUD/panels re-render on store change events, never per frame.
On a dropped connection the client keeps rendering the last snapshot, shows a
quiet reconnecting pip, queues commands (bounded, see 3.6), and replays them
on reconnect; nothing is simulated locally beyond movement prediction.

## 3.5 System specifications

Every system below follows the same template: **Purpose · Data · Rules ·
Player surface · Balancing knobs · Tests · "To add one"**. When you build a
system, its `README.md` is this section, kept in sync.

### 3.5.1 World (`core/src/world`)

**Purpose.** An effectively infinite, seed-deterministic, chunked 2D world
with biomes, resources, points of interest, and difficulty that rises with
distance from origin, generated lazily on the server. The client runs the
same pure generator for terrain rendering so no base terrain ships over the
wire; only mutations do.

**Data.**
- `WORLDGEN_VER` — bumped only by a decision record; old chunks are frozen to
  their generator version (`chunk.genVer`) so live worlds never re-roll.
- Field stack (all pure functions of `(seed, x, y)`): continent mask → domain
  warp → elevation (ridged) → moisture (with rain shadow) → temperature (with
  latitude + altitude) → biome lookup table → feature pass (rivers, lakes,
  cliffs, groves, ore lodes) → POI placement (Poisson disc per POI class,
  distance-ring gated).
- `biomes/*.ts` content: tile set, flora/resource density table, ambient enemy
  species pool, POI weights, colour ramp, hazard (none / cold / heat / dark).
- Chunk = 32×32 cells. Server materializes a chunk on first visit and stores
  only *mutations* (`cell_delta` rows keyed by sector); the base terrain is
  recomputed from the seed anywhere it's needed.
- Difficulty ring = `floor(dist / RING_WIDTH)`; it feeds enemy tier and loot
  tier (see Combat).

**Rules.** `biomeAt`, `cellAt`, `walkable`, `placeable` are pure and cached per
chunk. Terrain mutation (sculpting, building footprints) is an overlay table,
never a change to the generator.

**Player surface.** Minimap, compass to nearest POI class, fog-of-explored
(per player, sector-granular), a "region name" toast on biome change.

**Balancing knobs.** `RING_WIDTH`, resource density per biome, POI spacing.

**Tests.** Golden PNGs for 5 seeds at 3 zoom levels (`tools/worldview`);
histogram test: biome share within ±5% of targets across 1e6 samples; a
walkability test: origin is connected to every ring-1 POI.

**To add a biome.** One file in `content/biomes`, a tile set in the atlas, a
palette row. No code.

### 3.5.2 Entities, movement, stats (`core/src/entity`)

**Purpose.** One entity model for players, enemies, NPCs, followers, and
projectiles.

**Data.**
- `entity` (wide, changes rarely): kind, def id, owner, level, tier, faction,
  stat block, status list, equipment ref.
- `entity_pos` (narrow, changes every step): x, y, vx, vy, facing, sector.
- **Stat block** = fixed set of named stats (`hp, hpMax, dmg, armor, speed,
  critChance, critMult, lifesteal, resist[element], cdr`). Derived stats
  recompute on change from base × level curve × equipment × status.
- Status effects are data (`content/statuses`): duration, tick effect, stat
  modifiers, stacking rule, visual id.

**Rules.** `step(entity, input, dt, world)` is the single movement function
used by the server tick and client prediction. Collision is
cell-based against `walkable`.

**Balancing knobs.** Level curves in `tuning/curves.ts` (see Combat).

**Tests.** Movement determinism (same inputs → same position in prediction
and on the server), status stacking table.

### 3.5.3 Structures (`core/src/structures`) — the base-building framework

**Purpose.** Player-built structures with scripted logic and UI, upgradeable,
addable *as data* by an agent in one file.

**Data.** A `StructureDef`:

```ts
{
  id: 'smelter',
  name, description, icon, footprint: [[1,1]], sprite: 'smelter',
  category: 'production',
  placement: { on: ['ground','stone'], near?: {def:'wall', within: 3}, notNear?: [...] },
  unlock: { node: 'metalworking' },          // progression node (3.5.6)
  levels: [                                  // upgrade track — index = level-1
    { cost: {wood: 20, stone: 10}, stats: {rate: 1, slots: 1, hp: 200} },
    { cost: {stone: 40, iron: 5},  stats: {rate: 1.5, slots: 2, hp: 350}, unlocks: ['recipe:steel'] },
    { cost: {iron: 30, gold: 5},   stats: {rate: 2.5, slots: 3, hp: 600} },
  ],
  behaviors: [                               // composed logic; each is a registered module
    { kind: 'crafter',  recipes: ['ingot.iron','ingot.steel'], usesStat: 'rate' },
    { kind: 'storage',  slots: 'stat:slots', accepts: ['ore','ingot'] },
    { kind: 'fuel',     burns: ['wood','coal'], perSecond: 0.2 },
    { kind: 'damageable' },
  ],
  panel: [                                   // declarative UI; the client renders it
    { row: 'header' },
    { row: 'stat', label: 'Rate', stat: 'rate' },
    { row: 'progress', from: 'crafter' },
    { row: 'slots', from: 'storage' },
    { row: 'recipes', from: 'crafter' },
    { row: 'upgrade' },
  ],
}
```

- A **Behavior** is a small module in `structures/behaviors/<kind>/` with:
  `schema` (its config), `init(state)`, `tick?(state, store, dt)`,
  `commands?` (e.g. `crafter.queue`), `panelData(state)` (what the UI rows
  read), and tests. The initial library: `producer`, `storage`, `crafter`,
  `fuel`, `turret`, `wall`, `door`, `light`, `bed` (spawn point), `trap`,
  `spawner` (for enemies/NPC hire), `teleporter`, `market`, `damageable`,
  `trigger` (emits a custom event when X), `upgrade`.
- Structure state rows: `structure` (def, level, owner, cell, hp) +
  `structure_state` (one JSON-ish column per behavior kind, indexed by
  structure id). Per-tick work is only over structures whose behaviors
  registered a tick, tracked by an `active_structure` index. Idle structures
  cost nothing.
- **Upgrading** is generic: the `upgrade` behavior checks `levels[n].cost`
  against reachable storage, consumes, bumps level, recomputes stats, emits
  `structure.upgraded`. Level-gated `unlocks` feed progression.

**Player surface.** Build menu grouped by category, ghost placement with
validity colouring, a panel generated from `panel[]` (no bespoke UI per
structure), an upgrade button with cost preview and "why not" reasons.

**Balancing knobs.** `tuning/structures.ts`: cost curves per category and
level (`cost(level) = base × 1.6^level`), rate curves, hp curves. Content
files may override but the lint flags any override > 2× the curve.

**Tests.** Every behavior has unit tests; a `structures.integration.test.ts`
places every def at every level in a fixture world and asserts the panel
schema resolves, the cost is affordable at its unlock level, and tick cost is
zero when idle.

**To add a structure.** One file in `content/structures`, a sprite in the
atlas, an unlock node. **To add a behavior** (rare): a folder in
`structures/behaviors` following `HOWTO.md`; register it in `behaviors/index.ts`.

### 3.5.4 Items, inventory, crafting, loot (`core/src/items`)

**Data.** `ItemDef` (id, category, stack, rarity, icon, stats?, affixSlots?,
useEffect?). Rarity is a tier enum with a global multiplier table. Equipment
carries rolled affixes from `content/affixes` (shared with enemies — same
schema). `RecipeDef` (inputs, outputs, station: structure behavior kind or
`hand`, time, unlock node). Loot tables are weighted lists keyed by
`(species|poi, tier)`, with a pity counter for rare tiers.

**Rules.** Inventory is slot-based with weight-free stacks. Crafting is a
command that validates station reach, inputs, unlock, and queues on the
station's `crafter` behavior. Loot rolls use `store.rng()` only.

**Balancing knobs.** `tuning/items.ts`: rarity multipliers, affix roll ranges
as a function of tier, drop rates per tier.

**Tests.** Every recipe is reachable (inputs obtainable at or below the
recipe's ring); no item is unobtainable; loot table weights sum and every
referenced id exists (contentlint).

### 3.5.5 Combat and the bestiary (`core/src/combat`)

**Purpose.** Roguelike-inspired real-time combat: telegraphed enemy attacks,
dodge, build-defining drops (weapons, relics, perks), status effects, elites
with affixes, and bosses with scripted phases. A vast bestiary with
balancing that is a formula plus a test.

**Data — enemies are composed, not authored:**

- `species/*.ts` (~30 at launch): sprite family, size, base body multipliers
  (hp ×, dmg ×, speed ×), element, natural biomes, sound set.
- `brains/*.ts` (~10): a behavior tree from a fixed node library
  (`chase`, `kite`, `strafe`, `charge`, `leap`, `burrow`, `summon`, `flee`,
  `guard`, `patrol`, `castAt`, `telegraph(ms)`). Brains are the "role":
  fodder, bruiser, skirmisher, caster, summoner, sapper (targets structures),
  ambusher, tank, healer, boss-shell.
- `affixes/*.ts` (~40): elite modifiers with a **point cost** (`fast: 2,
  armored: 3, vampiric: 3, splitting: 4, shielded: 4, …`), each a stat
  modifier and/or a hook on an event.
- `enemies/*.ts`: **variants** = `{species, brain, affixes?, tierOffset?,
  name?, loot?}`. Most entries are 3 lines. Named elites and bosses add a
  `phases: [{atHpPct, brain, affixes, spawn?}]` script.
- The **spawn director** picks variants by biome pool × ring × time of day ×
  a per-player heat meter, and rolls affixes up to a *threat budget* for the
  ring.

**Rules — the power budget (this is the whole balance model):**

```
level L, tier T ∈ {fodder, standard, elite, boss}
playerEHP(L)  = hpCurve(L) × armorMult(gearCurve(L))
playerDPS(L)  = dmgCurve(L) × gearCurve(L) × critFactor
enemyHP(L,T)  = playerDPS(L) × targetTTK[T]              // fodder 1.5s, standard 4s, elite 12s, boss 90s
enemyDPS(L,T) = playerEHP(L) / targetTTD[T]              // time-to-death if the player never dodges
affix budget[T] = {fodder: 0, standard: 2, elite: 6, boss: 12} points
species multipliers are normalized so that Σ over the species table = 1 per axis
```

Every enemy's final numbers are `derive(species, brain, affixes, L, T)`. No
content file contains an HP or damage number. Bosses are the same formula
with `T = boss` and scripted phases.

**Player side.** Hit-stop, i-frame dodge, three-slot loadout (weapon, relic,
perk), and a **run loop inside the sandbox**: dungeons/rifts are instanced
roguelike runs with per-run drafted perks that vanish on exit, so build
variety lives in the runs while persistent progression lives in the base.

**Balancing knobs.** `tuning/combat.ts`: `targetTTK`, `targetTTD`, curves,
affix costs, budget per tier. Changing a knob changes every enemy at once.

**Tests — the balance harness (`tools/balance`).**
- Headless simulation: for each `(L in 1..50 step 5, T, brain)` spawn a
  reference player with the median gear for L and fight N=200 times.
- Report: TTK, TTD, damage taken %, win rate, per species and affix.
- **CI gate**: TTK within ±25% of target; win rate for standard ≥ 95%,
  elite ≥ 80%, boss ≥ 60% for a no-dodge reference player; any affix that
  moves win rate > 15 points per point of cost is flagged as mispriced.
- The report is written to `docs/BALANCE.md` on every main build so the
  maintainer reads numbers, not feelings.

**To add an enemy.** A 3-line variant in `content/enemies` (species + brain
+ affixes). **To add a species**: sprite set + one file. **To add a brain**:
compose from the node library; a new node is code and needs a test.

### 3.5.6 Quests and progression (`core/src/quests`)

**Purpose.** An excellent, data-authored quest and progression framework: a
quest graph evaluated purely from the event stream, an unlock tree that gates
structures/recipes/regions, and a tutorial that is just the first quest chain.

**Data.**

```ts
QuestDef {
  id, title, giver: 'board' | {npc} | {structure} | 'auto',
  availability: { node?, level?, quests?: [ids], ring?, flag? },
  steps: [                                       // sequential groups; each group is parallel objectives
    [{ kind: 'gather', item: 'wood', count: 20 },
     { kind: 'build',  def: 'campfire' }],
    [{ kind: 'kill', tag: 'fodder', count: 5, ring: 0 }],
    [{ kind: 'reach', poi: 'ruin', hint: 'compass' }],
    [{ kind: 'talk', npc: 'elder', dialogue: 'elder.1' }],
  ],
  rewards: { xp, items, unlock: 'node', flag, title },
  repeatable?: { cooldownTicks } | 'daily',
  teach?: { hint: string, guide: 'structures.campfire' },   // the tutorial hook
}
```

- Objective kinds map 1:1 to `GameEvent` shapes: `gather`, `craft`, `build`,
  `upgrade`, `kill`, `reach`, `talk`, `deliver`, `survive(nights)`, `use`,
  `flag` (custom, emitted by a `trigger` behavior or a script). Adding an
  objective kind = a matcher function + a test; it's the only code path.
- `player_quest` rows: (player, quest, stepIndex, progress[]) indexed by
  player; evaluation happens in an event handler, never in the tick.
- **Progression tree** (`content/progression/nodes.ts`): nodes with
  prerequisites (nodes, level, quest, structure level), cost (XP or
  materials), and grants (structure defs, recipes, regions, stats). This is
  the *demand engine*: quests point at nodes, nodes unlock content, content
  creates new quests. Every node has a `teach` field; the client shows a
  one-time coach-mark from it. **A node without `teach` fails contentlint.**
  The four **rank nodes** (Castaway, Hearthkeeper, Chieftain, Jarl) are the
  tree's spine: every other node is reachable from the rank below it, and
  each rank grants a `title` cosmetic (3.5.12) so the name is worn.
- **Sagas** = the main quest lines that fill the player's **Book** (ADR 0007).
  A Saga is a chain of chapters, and chapters are ordinary quests (the
  player-facing "tasks and achievements") with `availability.quests` on the
  previous chapter. No special engine. Individual and side quests are never
  called Sagas.
- Procedural side quests: `content/quests/templates/*.ts` with slots
  (`{item}`, `{count}`, `{poi}`) filled by the spawn director from the
  player's ring and biome; deterministic from `(player, day)`.

**Player surface.** A quest log with one active tracked quest and a compass
pip; a notice board structure; NPC dialogue from `content/dialogue` (a linear
node list, choices optional); unlock tree screen; coach-marks from `teach`.

**Balancing knobs.** `tuning/progression.ts`: XP curve, node costs, session
pacing targets (a first unlock within 3 minutes, a new structure every ~10
minutes for the first hour, a boss by hour 3).

**Tests.** Every quest is completable: a solver walks each quest's objectives
against the content graph and proves each objective's prerequisites are
reachable from the quest's availability state. Every node is reachable from
the root. The pacing targets are asserted by a scripted "optimal newbie" run
through the `MemoryStore` test host.

**To add a quest.** One file. **To add a node.** One entry with `teach`.

### 3.5.7 Survival (`core/src/survival`)

Food (a slow drain, refilled by cooked items; at zero, no regen — never
death), warmth (cold biomes and night drain it; campfires, clothing, and
walls restore; at zero, slow damage), light (night reduces vision and raises
spawn heat; light sources reverse it). Three meters, each a *reason to build*.
Knobs in `tuning/survival.ts`; tests assert a naked player survives night 1
next to a campfire and dies by night 3 without one.

### 3.5.8 Economy and multiplayer (`core/src/economy`, server tables)

Resources are per-player with caps raised by storage structures. Trading is
a `market` behavior (list / buy, escrowed). Parties share quest progress for
`kill`/`reach` objectives. Guild and territory come after Phase 6 as their
own systems following the template. Chat is a narrow event table with
row-level visibility.

### 3.5.9 Rendering and art (`client/src/render`, `tools/atlas`)

- Base tile 16×16; characters 16×32 (2 tiles tall) on a 1-tile footprint;
  large enemies in multiples of 16. Locked 64-colour palette
  (`tools/atlas/palette.gpl`); the atlas tool rejects off-palette pixels.
- Integer camera zoom (2×/3×/4× by device DPI); `roundPixels: true`; no
  sub-pixel movement of sprites (positions are rounded at draw, not in sim).
- Terrain chunks pre-rendered to render textures once per chunk per
  worldgen mutation; sprites batched from one atlas per category; lighting
  as a multiply layer with a light texture per light source.
- Animation JSON per sprite family: `idle, walk, attack, hit, die` at 8 fps.
- Frame budget: 16 ms on a 2022 mid-range Android in Chrome. A `perf` overlay
  with draw-call and ms counters exists from Phase 1.
- **No Unicode pictographs on screen.** Icons are atlas sprites; a lint greps
  for emoji ranges in `client/` and `content/` and fails.

### 3.5.10 UI (`client/src/ui`)

Structure panels, quest log, inventory, and the unlock tree are all rendered
from **declarative schemas** owned by `core` (the `panel[]` rows, the quest
def, the node graph). The UI package has one renderer per row kind. Touch
first: a virtual stick + two buttons, a build mode with tap-to-place, all
panels usable one-handed. Keyboard/gamepad map onto the same Commands.

### 3.5.11 Live ops: daily quests and seasonal events (`core/src/liveops`)

**Purpose.** A reason to log in every day and a reason to come back every
season, built as *data over the quest engine* so no second engine exists.

**Data — daily quests.**
- `content/dailies/*.ts`: quest **templates** (3.5.6) with slots, a `pool`
  (`gather`, `combat`, `build`, `explore`, `social`) and a `weight`. The
  server rolls each player's set of 3 (one per pool, no repeats within 7
  days) deterministically from `(playerId, dayIndex)` at first login of the
  day; rerolling is impossible by construction.
- Day boundary = server UTC `DAILY_RESET_HOUR` (tuning); `player_daily`
  row: (player, dayIndex, quests[3], claimed, streak). Weekly = the same
  with `weekIndex` and a bigger objective from a `weeklies` pool.
- Rewards: XP, soft currency, a small pity chance at a cosmetic drop, and a
  **streak** bonus that caps at 7 and never resets on one missed day (a
  grace day, tuning) — punishing a missed commute is the wrong lesson.

**Data — seasons and events.**
- `content/seasons/*.ts`: `{id, name, starts, ends, theme, currency,
  track, chain, activates}`. Player-facing, a season is a **Season** (the
  Harvest Season); never a "Saga", which names main quest lines (ADR 0007). `activates` lists content ids or tags that are
  live only during the season (enemy variants, POIs, recipes, cosmetics,
  biome dressing). Any content entry may carry `season: 'harvest'`; it is
  inert outside its window.
- `season_state` row on the server (id, phase, startedAt, endsAt), flipped by
  a scheduled reducer from the calendar; the client subscribes to it and
  never reads the wall clock to decide what is live.
- **Reward track**: `track: [{tier, cost: eventCurrency, reward}]`, free.
  A premium track is allowed only if every reward on it is a cosmetic
  (contentlint enforces). Event currency drops from tagged activities and
  expires with the season (converted to soft currency, tuning ratio).
- The **event chain** is an ordinary quest chain (3.5.6) with `availability.season`; it is not a Saga.
- Recurrence: a season file may declare `recurs: 'yearly'`; the calendar
  reducer re-instances it with a fresh `season_state`, so last year's
  progress never bleeds in.

**Rules.** Daily rolling, streaks, track claims, and season activation are
pure functions over the store; the only tick work is the calendar reducer
(once a minute, reads one row). Content activation is a single predicate
`isLive(entry, seasonState)` used by the spawn director, recipe lookup,
shop rotation, and the build menu.

**Player surface.** A Today panel (3 dailies, streak, weekly), a season
banner with the track, event currency in the HUD only while a season runs,
a countdown, and a "what's new this season" page generated from the season
file. A `teach` coach-mark on the first daily and the first season.

**Balancing knobs.** `tuning/liveops.ts`: reset hour, grace days, streak
cap, daily reward curve vs level, track tier costs, currency conversion.

**Tests.** Daily determinism (same player+day → same set on any host);
no-repeat window; streak grace; season activation flips content live and
dead at the boundaries with no orphaned rows; a track is claimable end to
end from the expected drop rate in the season's window (simulated); the
contentlint rule that premium tracks hold only cosmetics.

**To add a daily.** One template file. **To add a season.** One season file
plus the content it activates, each tagged `season:`.

### 3.5.12 Cosmetics and the item shop (`core/src/cosmetics`)

**Purpose.** Individual cosmetic items across many categories, bundles, a
rotating shop, and entitlements that follow the account — with a schema that
makes selling power impossible.

**Data.**
- `content/cosmetics/*.ts` — `CosmeticDef`: `{id, name, category, rarity,
  art, source, season?, tags}` and **no stat field of any kind**. Categories
  at launch: `skin` (hero body), `outfit` (armor look), `weaponSkin`,
  `pet` (follows, no combat), `mount` (look only; speed is a player stat,
  not a mount stat), `structureSkin` (per structure def), `decor`
  (placeable, no behaviors), `emote`, `banner`, `title`, `nameColor`,
  `frame`, `trail` (VFX), `deathEffect`, `campfireFlame`. Adding a category
  is one enum value plus a client renderer for it.
- `source`: `shop | track | daily | achievement | season | drop | code`.
  Every cosmetic is obtainable somewhere; contentlint fails a `shop`-only
  legendary unless the decision record allows it.
- `content/shop/*.ts` — `Offer`: `{id, kind: 'item' | 'bundle', items[],
  price: {tokens} | {soft}, discountPct?, rotation: 'permanent' | 'daily' |
  'weekly' | 'featured' | 'season', starts?, ends?, limitPerPlayer?}`. Bundle
  price must be ≤ the sum of its items (contentlint) and a bundle you already
  partly own is auto-prorated (rule, not a manual discount).
- Server tables: `player_cosmetic` (entitlements; indexed by player),
  `player_loadout` (one equipped id per category; **narrow, replicated in
  the AOI so others see your look**), `player_wallet` (tokens, soft),
  `shop_state` (current rotation ids, rolled by a scheduled reducer from
  `(weekIndex)` so it's identical for everyone), `purchase` (ledger:
  provider, receipt id, tokens, status — append-only, idempotent on receipt id).
- Real-money flow: client opens Stripe Checkout (hosted) with the token
  pack; Stripe → `packages/commerce` webhook → signature verified →
  `grantPurchase(identity, receiptId, tokens)` reducer, owner-gated,
  idempotent. Tokens then buy offers through an ordinary `buyOffer` command
  validated in `core` (price, rotation window, limit, ownership). Refunds
  call `revokePurchase` which claws back tokens and, if spent, the items.

**Rules.** `equip` validates the entitlement and category; `render look` on
the client reads `player_loadout` and composes sprite layers in a fixed
order (`skin < outfit < weaponSkin < trail`). Nothing in `combat`, `entity`,
or `items` imports from `cosmetics`; ESLint enforces the direction.

**Player surface.** A Wardrobe (by category, owned vs unowned, preview on
your own sprite), the Shop (featured, daily, weekly, bundles, seasonal;
every offer shows what's in it and what you already own), a token pack
page, and a "how to earn" tab listing non-shop sources. No loot boxes, no
gacha, no timers that pressure a purchase beyond the honest rotation window.

**Balancing knobs.** `tuning/cosmetics.ts`: rarity price bands, bundle
discount band, rotation sizes, soft-currency earn rate. Balance here means
*fairness*, so the knobs are few and public.

**Tests.** Schema has no stat field (a type-level test); every cosmetic has
art for every layer its category needs; bundle pricing and proration; shop
rotation determinism; `buyOffer` refusal cases (insufficient, out of window,
over limit, already owned); `grantPurchase` idempotency on a duplicate
webhook; `revokePurchase` clawback; the commerce sidecar's signature check
with a tampered payload. Smoke: buy with a Stripe test card end to end.

**To add a cosmetic.** One entry plus its sprite layers. **To add an offer
or bundle.** One entry in `content/shop`. **To add a category.** Enum value,
renderer, and a `HOWTO.md` update.

## 3.6 Networking rules (learned the hard way)

1. Subscribe by **3×3 sector window** for every spatial table. Never `SELECT *`
   on a table that changes per tick.
2. Movement on `entity_pos` (narrow); state on `entity` (wide). Never widen a
   hot row; add a new narrow table instead.
3. Every column you add to a subscribed table is a standing broadcast. A
   decision record is required to add a column to `entity_pos` or `entity`.
4. Reducers reject by `throw`; no partial mutation. Validate every argument in
   `core`, not in the reducer.
5. Old clients must not crash against a newer server: the client guards every
   optional table and column; server schema is append-only with defaults.
6. Versioning: the build stamps a single `BUILD_ID` into the client bundle,
   the service worker, and the module; a `compat` table declares the minimum
   client build. No human or agent edits a version number.
7. **Reconnect is a feature, not an error path.** Every command carries a
   client nonce; the server dedupes by `(sender, nonce)`. The client queues
   commands for up to 30 s during a dropout, replays them in order on
   reconnect, and drops the queue with a toast past that. Subscriptions
   re-establish from the current sector, and the client reconciles its
   snapshot rather than reloading. Tunnels are the normal case.

## 3.7 Content pipeline

- Content is TypeScript data under `packages/content`, validated by the
  owning system's Zod schema at import and by `pnpm contentlint` in CI
  (schema, dangling references, palette, `teach` presence, reachability).
- Tunables live *only* in `content/tuning`. ESLint rule `no-tunable-literal`
  fails a numeric literal in `core/src/**/rules.ts` and `tick.ts` other than
  0, 1, -1, and array indices.
- Art: agents author sprites as text pixel sources in `art/` (palette-indexed
  character grids, diffable, no LFS needed); `pnpm atlas` packs them. PNG and
  Aseprite files are also accepted for future hand-drawn art (ADR 0007).
- A visual **content editor is Phase 7**; until then the typed data files
  plus `tools/worldview` and the balance report are the authoring tools.

## 3.8 Testing and CI (merge-gated, no exceptions)

| Check | What it proves |
|-------|----------------|
| `pnpm build` | Everything type-checks; generated tables match core schemas. |
| `pnpm lint` | File size cap, layering, no tick scans, no tunable literals, no emoji. |
| `pnpm test` | Unit tests for every `rules.ts`; per-system tick budgets. |
| `pnpm contentlint` | Every content file valid and cross-referenced; every node teaches; every quest/recipe reachable; every cosmetic obtainable and stat-free; bundle prices ≤ sum; premium tracks cosmetic-only; season windows non-overlapping per theme. |
| `pnpm balance` | Combat within target bands (3.5.5). Writes `docs/BALANCE.md`. |
| `pnpm replay` | Recorded command scripts produce the golden store and event sequence on `MemoryStore`. |
| `pnpm smoke` | Playwright against a throwaway SpacetimeDB in Docker: connect, build, fight, cut the socket for 10 s mid-fight, reconnect, verify the queued commands landed and the store matches the replay golden. |
| `pnpm worldgold` | Golden seeds unchanged unless `WORLDGEN_VER` moved. |

A PR that adds a system without a test for each row above is not mergeable.

## 3.9 Performance budgets (measure, cite in the commit)

- Server tick: ≤ 2 ms at 200 online players, 10 Hz. `tick_perf` table logs
  per-system ms; a smoke test asserts it.
- Client: 16 ms frame on a mid-range phone; ≤ 200 draw calls; zero
  allocations on the frame path (the perf overlay counts).
- Network: ≤ 20 KB/s per client in a busy 3×3 sector.

## 3.10 Agent working rules

- **Define done before coding.** Restate the task as a checklist: data +
  rules + test + doc + teach (for anything a player meets) + the smoke run
  against a real server.
- **Smallest change that fully delivers.** No refactors alongside features.
  No gold-plating past the ask. No skipping the inconvenient half.
- **Follow the template.** If a new system doesn't fit the folder template,
  the answer is a decision record, not an exception.
- **Never write the same rule twice.** If you feel the need to duplicate a
  function into the client, you're about to compute a rule outside `core`.
  Stop; export it from `core`.
- **Never scan in a tick.** If a tick needs "all X where…", add an index.
- **Numbers go in tuning.** If you typed a literal into a rule, move it.
- **Interpreting feedback.** "I don't like X" is a design brief. Diagnose
  what falls short (pacing, clarity, reward, taps, goal), look at how the
  best-loved games solve that exact thing, fold every stated point into a
  proposed design, and present it before building. Prefer the
  genre-conventional answer over a clever one.
- **Decision records.** Any deviation from this document gets a file in
  `docs/DECISIONS/NNNN-title.md` (context, decision, consequences) in the
  same PR, and this document is updated to match.
- **Docs live with code.** Each system's `README.md` is its spec. A test
  asserts the README's schema tables match `schema.ts` field names.
- **Commit hygiene.** One task per PR, PR title `[P3-014] …`. The PR body
  carries a `## What's Changed` section written for players when anything is
  player-visible.
- **Work only from the ledger.** Every change traces to a task file in
  `tasks/`. Discovered work becomes a *new* task file, never scope added to
  the one you hold. See Section 4.

---

# 4. Development process — the task ledger

Everything is planned before it is built, and everything built traces to a
task. The ledger lives **in the repo**, one file per task, because that is
the only tracker an agent can read, diff, and update in the same PR as the
work. GitHub Issues/Projects may mirror it (`pnpm tasks:sync`), never the
other way round.

## 4.1 Roles (each is a session type, not a person)

| Role | Runs | Does |
|------|------|------|
| **Planner** | Once before Phase 0, then once per phase boundary | Turns Sections 3, 5, and `docs/FEEDBACK.md` into task files. Writes no product code. |
| **Worker** | 3–5 in parallel, continuously | Claims one ready task by pushing the claim on its branch, builds it to its DoD, opens the PR, sets `status: done` in the same PR. |
| **Reviewer** | One per PR | Reads the task file, checks the diff against every DoD line and Section 3.10, approves or requests changes. Never edits code. |
| **Integrator** | The maintainer (or auto-merge once trusted) | Merges green, approved PRs; runs the playtest at phase gates. |

## 4.2 Task file format (`tasks/<phase>/<id>.md`)

```md
---
id: P3-014
title: Storage behavior — slots, accepts filter, reachability
phase: P3
system: structures            # the core/src folder or package this lands in
lane: structures              # concurrency lane (4.4); usually == system
depends_on: [P3-002, P2-009]  # task ids that must be done (merged) first
size: M                       # S ≤ 1h, M ≤ half a session, L = one full session; XL is forbidden
status: todo                  # draft | todo | in_progress | done | blocked  (ready/review are derived, see 4.3)
owner: ""                     # branch or session id while in_progress
pr: ""                        # PR number once opened
discovered_by: ""             # task id that spawned this one, if any
touches: [packages/core/src/structures/behaviors/storage/**, packages/content/structures/**]
blocked: ""                   # required reason when status: blocked
---

## Goal
One paragraph: what exists when this is done, in player or system terms.

## Definition of done
- [ ] `storage` behavior module with schema, init, commands (deposit/withdraw), panelData
- [ ] Reachability: a crafter may draw from storage within `tuning.structures.reach`
- [ ] Unit tests: deposit/withdraw/cap/accepts-filter/reach
- [ ] `structures/README.md` behavior table updated; `HOWTO.md` unchanged or updated
- [ ] `pnpm lint test contentlint` green
- [ ] Reviewer checks: no tunable literal, no tick scan, idle structure costs zero ticks

## Notes
Pointers into Section 3, decision records, or prior tasks. Nothing normative
lives here; if it matters, it's a DoD line.
```

Rules:
- **Granularity.** A task fits one session and one PR: ≤ ~400 changed lines,
  ≤ 2 packages, ≤ 1 lane. `XL` does not exist; split it.
- **Every DoD line is checkable** by the reviewer from the diff or a command.
  "Works well" is not a DoD line; "smoke `build-and-fight` passes" is.
- **Contract tasks come first.** For every system, the first task defines
  its `schema.ts`, `commands.ts`, event shapes, and README skeleton, and
  nothing else. Implementation tasks depend on it and can then fan out in
  parallel because the interfaces are fixed.
- **Exit task per phase** (`P3-EXIT`): its DoD is the phase's definition of
  done from Section 5, plus the playtest. It depends on every task in the
  phase.
- **Coarse until their gate.** At the first Planner run, phases P0–P1 are
  fully fine-grained; P2+ get contract tasks, exit tasks, and `size: L`
  epics with `status: draft`. Each phase-boundary Planner run refines the
  *next* phase to fine grain with the feedback folded in. This is what keeps
  a day-0 plan from rotting.

## 4.3 Tooling (`tools/tasks`, all run in CI)

| Command | Does |
|---------|------|
| `pnpm tasks:validate` | Frontmatter schema; ids unique and match their path; `depends_on` exist and are acyclic; no `XL`; every `in_progress`/`done` task's deps are `done`; `blocked` carries a reason; every phase has an exit task that depends on every other task in the phase; `touches` globs don't overlap between two `in_progress` tasks in different lanes; `docs/BOARD.md`/`docs/STATUS.md` carry an intact content hash (a hand edit fails, a stale board does not). Fails CI. |
| `pnpm tasks:board` | Regenerates `docs/BOARD.md` from the committed task files: per phase, tasks by status, the critical path, and which tasks are *ready now*. CI commits it on `main`; PRs never commit it. `--live` also prints claims held on remote branches. |
| `pnpm tasks:next [--lane X] [--phase P]` | Fetches `origin`, then prints the highest-priority ready task with no lane conflict against live claims. Priority = critical-path length, then phase, then id. |
| `pnpm tasks:claim <id>` | Re-checks readiness against `origin`, sets `in_progress` + owner, commits, and pushes the current branch (from `main` it first creates `task/<id>`). The pushed branch *is* the claim. |
| `pnpm tasks:status` | Regenerates `docs/STATUS.md`: done/total per phase, tasks merged per day from git, blocked list with reasons. |
| `pnpm tasks:sync` | Optional one-way mirror to GitHub Issues (labels = phase/lane/status). Not built until someone needs it. |

**Status semantics (ADR 0003).** Stored statuses are `draft` (coarse epic,
not claimable), `todo` (fine-grained and planned), `in_progress`, `done`,
`blocked`. Two statuses are *derived*, never typed into a file:
**ready** = `todo` on `main`, every dependency `done` on `main`, and not claimed
on any live remote branch; **review** = a remote branch holds the task as
`done` but it is not merged yet. A claim is the task file's `in_progress`
status on any pushed branch, so claims are visible to every worker without
pushing to `main`. Claims whose branch has had no commit for 72 h are shown
as stale and no longer block a lane.

## 4.4 Parallelism: lanes and contracts

- A **lane** is a system folder (`core` for store/events/tick, `world`,
  `entity`, `structures`, `combat`, `items`, `quests`, `survival`, `economy`,
  `liveops`, `cosmetics`, `commerce`, `client-net`, `client-input`,
  `client-render`, `client-ui`, `server`, `content`, `art`, `tools`,
  `repo`). New lanes arrive with a new system, via a decision record. Two tasks in the same lane never run
  concurrently; tasks in different lanes always may. Workers run in separate
  worktrees/branches off `main`.
- Cross-lane coupling goes through the **contract tasks** (4.2) and the
  `GameEvent` union: if a task in `quests` needs a new event from `combat`,
  the event is added in a tiny `combat` task that both depend on, not by the
  `quests` worker reaching across lanes.
- Content tasks (`lane: content`) fan out widest: once a system's schema is
  merged, one task per batch of 10 content entries, all parallel.
- Typical steady state: 3–5 workers, one per lane, each holding one task;
  the board shows the ready queue so an idle worker never waits on a human.
- Claims are pushed branches, so `tasks:next` sees every other worker's
  claim as soon as it is pushed; claim *before* doing any work, and push the
  claim commit on its own.

## 4.5 Worker session protocol

1. `pnpm tasks:next` (optionally `--lane`), read the task file end to end,
   and the README/HOWTO of its system. Restate the DoD as your checklist.
2. `pnpm tasks:claim <id>` (commits and pushes the claim). If it reports
   that another branch claimed the task first, run `tasks:next` again. Work
   only inside `touches`. If you need a file
   outside it, stop and file a new task (`discovered_by: <id>`) or a tiny
   contract task; do not widen.
3. Build to the DoD. Run every CI check locally. Tick the DoD boxes in the
   task file, set `status: done` (it only becomes true on `main` when the PR
   merges; until then the board derives *review*), add the PR number once
   the PR exists, commit it in the same branch.
4. Open the PR titled `[<id>] <title>`; body = the task's Goal + the ticked
   DoD + `## What's Changed` when player-visible. One task, one PR.
5. On review changes: fix, re-run checks, push. On approval + green CI, the
   integrator merges (squash); the merge carries the PR's `status: done`
   onto `main`. CI regenerates the board.
6. If blocked: set `status: blocked` with a `blocked: <reason>` line and a
   new task for the unblocking work, push, end the session. Never idle on a
   claimed task.

## 4.6 Reviewer session protocol

Read the task file first, then the diff. For each DoD line, find the
evidence in the diff or CI output and quote it in the review. Then apply
Section 3.10 as a checklist (no rule outside `core`, no tick scan, no
tunable literal, file cap, docs in sync, teach present). Request changes with
the exact DoD line that fails. Approve with the list of evidence. A reviewer
that says "looks good" without evidence has not reviewed.

## 4.7 Progress tracking and gates

- `docs/BOARD.md` is the state of `main`; `pnpm tasks:board --live` adds
  in-flight claims; `docs/STATUS.md` is the trend. Both files are generated;
  a hand edit fails `tasks:validate`.
- A phase is **open** when its exit task is ready (all deps done) and
  **closed** when the exit task is `done`, which requires the playtest entry
  in `docs/FEEDBACK.md` for that phase.
- The critical path on the board is what the integrator watches; a lane with
  no ready tasks is idle by design, not a problem.
- Scope changes (a new system, a dropped feature) go through a Planner run
  and a decision record, never through editing a task's DoD mid-flight.

---

# 5. Build phases (each becomes a set of ledger tasks with this exit DoD)

**Phase 0 — Skeleton (1 session).** Monorepo, all packages empty but wired;
`core` with `Store`, `MemoryStore`, `GameEvent`, `tick`; `server` publishing a
hello module with one table and one reducer to a local SpacetimeDB in Docker;
`client` rendering one PixiJS sprite that moves via a Command through the
server with `core.entity.step` prediction; reconnect + command replay wired
from the start; CI running every check in 3.8 (most trivially green).
*Done when*: a sprite moves on the server with prediction, survives a cut
socket, and the replay test passes on `MemoryStore`.

**Phase 1 — World and movement.** Worldgen field stack, 6 biomes, chunk
renderer, camera, minimap, fog, sector AOI subscriptions, `entity_pos`
channel, prediction. *Done when*: two browser tabs walk around each other on
the server at 60fps on a phone, golden seeds committed, tick budget test green.

**Phase 2 — Survival, items, crafting.** Harvest nodes, inventory, 30 items,
15 recipes, the three survival meters. *Done when*:
the night-1/night-3 survival tests pass and every recipe is reachable.

**Phase 3 — Structures framework.** The behavior library (3.5.3), 8
structures across categories, generic panels, upgrading, structure damage.
*Done when*: an agent adds a 9th structure in one content file with no code
change and its panel renders against the server.

**Phase 4 — Combat and bestiary.** Stats, statuses, player attacks and dodge,
brain node library, 10 species × 6 brains × 20 affixes, spawn director,
loot, the balance harness with its CI gate, one boss with phases. *Done
when*: `pnpm balance` is green and `docs/BALANCE.md` exists.

**Phase 5 — Quests and progression.** Quest engine, objective kinds,
progression tree with 30 nodes, `teach` coach-marks, the tutorial as the first
chain, notice board, 20 quests + 5 templates, pacing test, **daily quests**
(3 per day from 12 templates, streaks, weekly). *Done when*: the "optimal
newbie" script hits the pacing targets, every node teaches, and the daily
determinism and streak tests pass.

**Phase 6 — Persistent multiplayer polish.** Accounts (OIDC → identity),
parties, chat, markets, respawn at bed, server compat table, PWA install
(shell cache only), reconnect hardening on real mobile networks, deploy
runbook, **cosmetics + shop**: the cosmetic schema and wardrobe, loadout
replication, 5 categories with 20 cosmetics, wallet, shop rotation, bundles
with proration, the `commerce` sidecar with Stripe test mode, purchase
ledger and refund clawback. *Done when*: the Docker smoke suite runs end to
end, a fresh phone can install, play, ride through a 30 s dropout, and lose
nothing, and a Stripe test-card purchase lands as an entitlement that another
player can see on your sprite.

**Phase 7 — Content scale and tools.** 30 species, 10 brains, 40 affixes,
50 structures, 3 sagas, dungeons/rifts run loop, **the first season** (a
themed event chain, activated variants and recipes, event currency, a free
reward track, 10 seasonal cosmetics, `recurs: 'yearly'`), all 14 cosmetic
categories with 100+ cosmetics, the in-browser content editor over the typed
data. *Done when*: contentlint and balance stay green at
that scale, the season flips live and dead cleanly in the smoke suite, and
the editor round-trips every content file byte-identically.

---

# 6. Open questions for the maintainer (answer before the Planner session)

1. **PvP**: none, opt-in duels, or territory war? It changes the `faction`
   model in Phase 2. Recommendation: none at launch, keep `faction` on
   entities so it's a later system, not a rewrite.
2. **Art source**: hand-drawn by you, Pixel Lab generated, or a purchased
   pack normalized to the palette? Phase 1 needs 6 tile sets.
3. **1.0 lore and content**: port the sagas/story bible, or start fresh? The
   quest framework is indifferent; the content budget isn't.
4. **Monetization specifics**: token pack price points and regions; whether
   a premium (cosmetic-only) season track exists at launch; whether any
   cosmetic is shop-exclusive or everything is also earnable slowly. The
   framework supports all answers; the content budget doesn't.
5. **Hosting**: SpacetimeDB Maincloud or self-hosted like 1.0? Affects the
   Phase 6 runbook only.

---

# 7. Kick-off messages

## 7.1 Planner session (run first, then at every phase boundary)

> Read `CLAUDE.md` in full. Your only output is the task ledger under
> `tasks/` plus `tools/tasks` and the generated `docs/BOARD.md`. Write no
> product code. Build `tools/tasks` first (validate, board, next, claim,
> status) with its own tests. Then, for every phase in Section 5, write
> tasks in the Section 4.2 format: the contract task for each system in the
> phase, the implementation tasks, the content tasks, the test/CI tasks, and
> the phase exit task whose DoD is the phase's definition of done. P0 and P1
> fully fine-grained (`S`/`M`, all `todo`); P2–P7 as
> contract tasks, exit tasks, and `status: draft` `L` epics. Every DoD line
> must be checkable from a diff or a command. Set `depends_on` so that every
> task in a phase is reachable from its contract tasks and the exit task
> depends on all of them; `pnpm tasks:validate` must pass and the board must
> show at least three ready P0 tasks in three different lanes. Finish with
> the board committed and a one-page `tasks/README.md` telling a worker
> session how to start. On a re-run at a phase boundary: read
> `docs/FEEDBACK.md`, refine the next phase's drafts to fine grain, fold each
> feedback point into a task with the feedback quoted in its Notes, and never
> edit the DoD of an `in_progress` or `done` task.

## 7.2 Phase 0 worker session (and every worker session after it)

> Read `CLAUDE.md` in full, then `tasks/README.md` and `docs/BOARD.md`. Run
> `pnpm tasks:next` (pass `--lane <lane>` if you were told a lane), read the
> task file it returns end to end, and follow the worker protocol in Section
> 4.5: claim, restate the DoD as your checklist, work only inside `touches`,
> run every CI check locally, tick the DoD, set `status: done`, open one PR
> titled `[<id>] <title>`. File a new task for anything you discover instead
> of widening yours. If blocked, mark the task blocked with a reason and end.
> Report what you could not verify. Do not start a second task in this
> session.

The P0 ledger the Planner writes should reduce, in order, to: the two
decision records from Section 0 (`0001-pure-core-server-only-host`,
`0002-pixijs-not-engine`; the first Planner run wrote these itself, since
they transcribe decisions already made); the monorepo scaffold and CI with every Section
3.8 check present and trivially green; `core`'s `Store`/`MemoryStore`/
`GameEvent`/`tick`; the hello SpacetimeDB module against a local Docker
instance; the client with one sprite moved by a Command through the server
and predicted with the single `core.entity.step`; reconnect + command replay;
the replay test; and a `README.md` that gets a new contributor from clone to a
moving sprite on a local server in under 10 minutes. The P0 exit task's DoD is
Section 5, Phase 0.
