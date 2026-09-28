# @bastion/template-check

Runs in `pnpm test` (CLAUDE.md 3.1 pillar 6 "small and same-shaped", 3.10
"docs live with code"). Walks every folder under `packages/core/src`.

| Check | Since |
|---|---|
| A system folder holds `README.md`, `HOWTO.md`, `schema.ts`, `rules.ts`, `commands.ts` and at least one `*.test.ts` (`tick.ts` optional) | P0-020 |
| The README's `## Data` tables list exactly the fields of the system's Zod objects, both directions, one error per field | P0-020 |

**Exempt folders** (`EXEMPT_FOLDERS`): `store`, `events`, `kernel`: the
`core` lane's infrastructure (ADR 0003), not systems.

**What counts as a field.**

- *README side:* inside `## Data` (up to the next `#`/`##` heading), every
  identifier in a code span of a table column headed `Shape`, `Fields`,
  `Field`, `Columns` or `Knobs`. One span may hold several: `` `id, kind` ``.
  Other columns (`Table`, `Index`, `Notes`) are prose and are not read.
- *Schema side:* the top-level keys of every exported Zod object, and of every
  exported table's `row` (`defineTable`), in the folder's non-test `.ts`
  modules, except `index.ts` (re-exports), `commands.ts` and `events.ts`
  (their payloads belong to the README's `## Commands` and `## Events`).
  This covers `schema.ts` plus `tables.ts` and any concept file split out of
  it under the 600-line cap.

Add a new check in `src/check.ts` with a fixture folder under
`test/fixtures/core-src` and an exact-message assertion.
