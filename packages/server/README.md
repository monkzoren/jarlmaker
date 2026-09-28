# @bastion/server

The SpacetimeDB module: the only game host (ADR 0001). Tables and reducers
are thin glue over `@bastion/core`. The SpacetimeDB version is pinned to
`2.10.1` everywhere (ADR 0006).

Right now it holds only the P0-010 hello module (`hello` table, `say_hello`
reducer), which P0-011 replaces.

## Run it locally

Needs Docker and Node 22. From `packages/server`:

```sh
pnpm server:up         # docker compose: SpacetimeDB on http://127.0.0.1:3000, named volume bastion-stdb
pnpm server:publish    # build + publish as database `bastion`, wiping its data
pnpm server:bindings   # generate TypeScript client bindings into packages/client/src/net/bindings
pnpm server:cli call --server local bastion say_hello '"Ragnhild"'
pnpm server:cli sql  --server local bastion "SELECT id, name FROM hello"
pnpm server:down
```

`server:cli` is the pinned `spacetime` CLI (`scripts/spacetime.sh`). On Linux
it is copied out of the Docker image on first use into `.spacetime/`
(gitignored). On macOS/Windows install CLI `2.10.1` or set `SPACETIME_BIN`.

Reducers reject with `throw new SenderError(...)`; a plain `Error` is reported
as a fatal instance error.
