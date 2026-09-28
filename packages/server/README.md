# @bastion/server

The SpacetimeDB module: the only game host (ADR 0001). Tables and reducers
are thin glue over `@bastion/core`. The SpacetimeDB version is pinned to
`2.10.1` everywhere (ADR 0006).

| File | What it is |
|---|---|
| `src/tables.ts` | GENERATED from core's table declarations (`pnpm gen:tables`). Never edit. |
| `src/schema.ts` | The module schema: the generated tables plus `tick_schedule` (host-only). |
| `src/store.ts` | `StdbStore`: core's `Store` over `ctx.db`. `now()` = `ctx.timestamp` (ms), `rng()` = `ctx.random`. `emit` drops events: core has already dispatched them in-transaction, and there is no event table yet. |
| `src/host.ts` | `runCommand`: `core.execute(game, StdbStore, ctx.sender, envelope)`, throws `SenderError` on a rejection. |
| `src/reducers/*.ts` | One reducer per core command: `join(nonce)` -> `player.join`, `move(nonce, ix, iy)` -> `entity.move`. |
| `src/tick.ts` | `init` schedules `tick` every `1000 / tuning.net.tickHz` ms; `tick` runs `core.tick` with that fixed `dtMs`. Clients calling `tick` are refused (`ctx.sender` must be the module identity). |

Authority is always `ctx.sender` (as its hex string). Reducers take the
command envelope's `nonce` plus the payload; core validates everything.

## Run it locally

Needs Docker and Node 22. From `packages/server`:

```sh
pnpm server:up         # docker compose: SpacetimeDB on http://127.0.0.1:3000, named volume bastion-stdb
pnpm server:publish    # build + publish as database `bastion`, wiping its data
pnpm server:bindings   # generate TypeScript client bindings into packages/client/src/net/bindings
pnpm server:cli call --server local bastion join 1          # nonce 1
pnpm server:cli call --server local bastion move 2 1 0      # nonce 2, stick (1, 0)
pnpm server:cli sql  --server local bastion "SELECT * FROM entity_pos"
pnpm server:down
```

`server:cli` is the pinned `spacetime` CLI (`scripts/spacetime.sh`). On Linux
it is copied out of the Docker image on first use into `.spacetime/`
(gitignored). On macOS/Windows install CLI `2.10.1` or set `SPACETIME_BIN`.

Reducers reject with `throw new SenderError(...)`; a plain `Error` is reported
as a fatal instance error.
