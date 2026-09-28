# @bastion/gen-tables

Table shapes are declared once, in `core` (`defineTable` + `registerTables`,
CLAUDE.md 3.4). This tool writes `packages/server/src/tables.ts`: one
SpacetimeDB `table()` per registered table, same columns, pk and indexes, and
`public` from the declaration (private unless it says `public: true`).
MemoryStore reads the declarations at runtime and needs no generation.

```sh
pnpm gen:tables                    # write the server file
pnpm gen:tables --check            # fail if it drifted (run by `pnpm build`)
pnpm gen:tables --allow-breaking   # skip the append-only check (needs an ADR)
```

`pnpm gen:tables` is the root alias for `pnpm --filter @bastion/gen-tables run gen`;
the long form still works and is what the generated file's header names.

`pnpm test` also fails on drift (`test/drift.test.ts`). The generated file
exports `tables`, which the module passes to `schema({...tables})`.

## Column types

| Zod | SpacetimeDB | Pk / index |
|---|---|---|
| `z.string()`, string `z.enum`, string `z.literal` | `t.string()` | yes |
| `z.boolean()` | `t.bool()` | yes |
| `z.int32()` / `z.uint32()` | `t.i32()` / `t.u32()` | yes |
| `z.bigint()` / `z.int64()` / `z.uint64()` | `t.i64()` / `t.i64()` / `t.u64()` | yes |
| `z.number()`, `z.int()`, `z.float64()` | `t.f64()` | no |
| `z.float32()` | `t.f32()` | no |
| `x.optional()` | `t.option(x)` | no |
| `z.array(x)` | `t.array(x)` | no |
| `z.object({...})` | `t.object('<Table><Path>', {...})` | no |
| `x.default(v)` on a top-level scalar column | `x.default(v)` | not on the pk |

Anything else (nullable, dates, maps, unions, numeric enums, …) fails with the
column path, e.g. `entity.stats.resist[]: unsupported Zod type "map"`. The TS
value type is identical on both sides, which is why `z.number()` is `f64`: an
integer id or indexed number column must be `z.int32()`, `z.uint32()` or a bigint.

## Append-only

Visibility (`public`) is not in the manifest: flipping it is allowed and
never trips the append-only check.

The generated file ends with a manifest of each table's pk and column types.
A run fails, writing nothing, when a committed table disappears, its pk
changes, a column is removed, renamed, retyped or moved, or a column appended
to an existing table is neither `.optional()` nor `.default(v)`.

## Tests

- `test/fixture.ts` declares every supported type; `test/fixture.generated.ts`
  is its committed output. `pnpm typecheck` compiles it against the pinned
  `spacetimedb` types (`test/fixture.schema.ts` passes it to `schema()`), and a
  test fails if the generator's output for the fixture changes.
- `@bastion/server` is a devDependency only so turbo's cache key covers the
  server file: a hand edit to it re-runs `build` instead of replaying a pass.
