# store — the Store contract and table declarations

Every rule in `core` reads and writes game state through one interface,
`Store` (`types.ts`, CLAUDE.md 3.4). The server implements it over `ctx.db`
(`StdbStore`, P0-011); tests, replay and the balance harness implement it in
memory (`MemoryStore`, P0-005). Rules cannot tell the two apart.

| Method | Contract |
|---|---|
| `get(t, id)` | Row by primary key, or `undefined`. `id` has the table's pk type. |
| `byIndex(t, k, v)` | Rows whose declared index `k` equals `v`. Single-column index: `v` is the value. Compound: a tuple in column order. |
| `insert(t, row)` | Throws if the pk exists. |
| `update(t, row)` | Replaces by pk; throws if missing. |
| `delete(t, id)` | Throws if missing. |
| `now()` | `Timestamp`: integer ms since epoch. `ctx.timestamp` / a fixed clock. |
| `rng()` | `Rng` (`next`, `int` inclusive, `pick`). `ctx.random` / a seeded PRNG. |
| `emit(e)` | Append a `GameEvent` (see `../events/README.md`). |

**There is no scan.** Every read is by pk or a declared index. If a rule
needs "all X where …", add an index or a denormalized column. Rows come back
`Readonly`: to change one, spread it and call `update`.

## Declaring a table

Tables are plain data (`tables.ts`), so `pnpm gen:tables` (P0-009) can turn
them into the SpacetimeDB schema. A system declares its tables in its own
folder:

```ts
export const entityPos = defineTable({
  name: 'entity_pos',                                  // snake_case
  row: z.object({ id: z.bigint(), x: z.number(), y: z.number(), sector: z.string() }),
  pk: 'id',                                            // a string/number/bigint column
  indexes: [{ name: 'by_sector', columns: ['sector'] }],
  public: true,                                        // clients may subscribe; omit => private
})
registerTables(entityPos)                              // runtime: TABLES, tableList()
declare module '../store/tables.ts' {                  // types: TableName, Row, IndexOf, ...
  interface TableRegistry { entity_pos: typeof entityPos }
}
```

`public` defaults to `false`: a table is server-only unless its declaration
opts in, so wallets, the purchase ledger and other private state are never
exposed to clients by accident. Set `public: true` on tables clients subscribe
to (e.g. `entity_pos`, by sector window, CLAUDE.md 3.6). Visibility is not part
of the stored row layout, so changing it is not an append-only violation.
Row-level visibility (chat) is a separate, later mechanism.

`byIndex` only accepts index names the declaration lists, and only values of
the indexed columns' types; `tables.test.ts` proves it with `@ts-expect-error`.
Tables are append-only once published: never rename or repurpose a column.

`Id` is the bound on pk types. `get` and `delete` take the specific table's
pk type (`PkOf<T>`), which is a subtype of `Id`.
