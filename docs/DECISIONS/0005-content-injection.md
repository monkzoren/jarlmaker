# 0005 — Content is injected into core as a validated `Game` context

- **Status:** accepted (P0-004)
- **Date:** 2026-09-27
- **Resolves:** ADR 0004, spec gap 5

## Context

CLAUDE.md says content is "validated by core's schemas at load" (3.7) and
that systems read tunables from `content/tuning` (3.1 pillar 3). The obvious
wiring is for `core` to `import { content } from '@bastion/content'`. But
`content` needs `core`'s schemas and types to be checked, so `content`
depends on `core`, and a `core → content` import would be a package cycle.
It would also put a real content set inside every unit test, where a test
often wants a fixture tuning value instead.

The ledger also runs systems in parallel lanes. The content, entity and world
tasks each own only their own folders (their `touches`), so no single file in
`core` can list every content section.

## Decision

1. **`core` never imports `@bastion/content`.** Hosts (the server module,
   MemoryStore tests, replay, balance, contentlint) import the content
   package and call `createGame(content)`. The resulting `Game` is passed
   into `execute` and `tick` (P0-006) and from there to every rule that
   needs data.
2. **Each system registers the schema of the sections it owns**, from its
   own folder: `registerTuning('movement', schema)` for
   `content.tuning.movement` (one object of knobs), and
   `registerContent('structures', entrySchema)` for `content.structures` (an
   array of entries). The types come from declaration merging into
   `TuningRegistry` / `ContentRegistry`, so `game.content.tuning.movement.speed`
   is fully typed.
3. **`loadContent(raw)` validates every registered section**. A missing or
   invalid section throws a `ContentError` listing each issue with its dotted
   path (`tuning.movement.speed`). Sections that no system has registered
   yet are dropped from the `Game` and reported in `unvalidated`, so the
   content package can grow ahead of the systems that read it and
   contentlint can still show what went unchecked.
4. **The `Game` is deeply frozen.** Rules cannot mutate content, which keeps
   the client's prediction and the server's tick reading the same numbers.
5. `content` imports `core` **for types only** (`import type`). It stays pure
   data (3.3: "no functions in content").

## Consequences

- Tests build a `Game` from a small fixture object and don't load the
  whole content set. Replay scripts record a content hash (P0-017) because
  the content is an input, not a constant.
- A system's section is validated only if the system module was imported
  before `loadContent` runs. `core/src/index.ts` must therefore import every
  system module, so that a host importing `@bastion/core` gets all of them.
- Contentlint should fail on a non-empty `unvalidated` list once every P0/P1
  tuning file has an owning system. Until then it is a warning (P0-007's
  choice).
- The same registry pattern (declaration merging + `register*`) is used for
  tables (`TableRegistry`), events (`EventRegistry`) and commands
  (`CommandRegistry`), so an agent that has added one kind of entry can add
  the others.
