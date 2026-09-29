# Jarlmaker

*A Longship Saga.* Lost your crew. Build a home. Earn the name Jarl.

Jarlmaker is a survival-crafting RPG with base building, roguelike combat and
a large procedural world, played in the browser (phone first) on one shared
SpacetimeDB server. There is no offline mode. The codename is **bastion**:
you will see it in package names (`@bastion/*`), table names, storage keys
and the database name. "Jarlmaker" only appears where a player reads it.

You wash up on a generated shore beside your wrecked longship. Chop pines
and break rocks for wood and stone, and build a campfire. Everything runs
through the server, with client-side prediction and silent reconnect. The
design and every rule are in [`CLAUDE.md`](CLAUDE.md).

**Controls:** WASD or arrows to walk; **Space** (or E) to chop what you face,
hold to keep swinging; **B** to toggle build mode, then Space to place a
campfire (5 wood, 3 stone); Esc leaves build mode. On a phone: drag anywhere
to walk, and use the axe and campfire buttons.

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Git | any recent | `git --version` |
| Node.js | **22.18 or newer** (root `package.json` `engines`) | `node --version` |
| pnpm | **10.33.0** (pinned in `packageManager`; `corepack enable` picks it up) | `pnpm --version` |
| Docker Engine + Compose v2 | Docker 24+ with `docker compose` | `docker compose version` |
| A browser | any current Chromium, Firefox or Safari | |

You do **not** install SpacetimeDB yourself. The server runs from the pinned
image `clockworklabs/spacetime:v2.10.1` ([ADR 0006](docs/DECISIONS/0006-spacetimedb-version.md)),
and on Linux the matching `spacetime` CLI is copied out of that image on
first use. On macOS or Windows, install the CLI at exactly `2.10.1`
(`spacetime version install 2.10.1`) or point `SPACETIME_BIN` at it.

Ports used on your machine: **3000** (SpacetimeDB, bound to `127.0.0.1`) and
**5173** (the Vite dev server).

## Quickstart: clone to a moving sprite

```sh
git clone https://github.com/monkzoren/jarlmaker.git
cd jarlmaker
pnpm install                              # ~5 s with a warm network
pnpm server:up                            # pulls the image once (~45 s), waits for http://127.0.0.1:3000
pnpm server:publish                       # builds the module, publishes database `bastion` (wipes its data)
pnpm --filter @bastion/client dev         # Vite on http://localhost:5173
```

Open <http://localhost:5173/?profile=a>, click the page, and walk with
**WASD** or the arrow keys (see Controls above). The pip in the top-left says
`online as <identity> | 1 in view`.

To see multiplayer, open <http://localhost:5173/?profile=b> in a second tab.
Each `?profile=` keeps its own auth token, so the two tabs are two players:
both pips read `2 in view`, and moving in one tab moves that player in the
other. (Two tabs *without* `?profile=` share one token and are the same
player.)

Measured on a fresh clone in a clean container with empty Docker and pnpm
caches: about **2 minutes** from `git clone` to a sprite moving in two tabs,
most of it the one-time image pull.

When you are done: `Ctrl+C` the dev server, then `pnpm server:down` (the data
volume is kept).

### Poke the server directly

`pnpm server:cli` is the pinned `spacetime` CLI:

```sh
pnpm server:cli sql --server local bastion "SELECT * FROM entity_pos"
pnpm server:cli sql --server local bastion "SELECT * FROM build_info"
```

More in [`packages/server/README.md`](packages/server/README.md).

## Checks (the CI gate)

Every PR must pass these, and you can run them all at once:
`pnpm build lint test contentlint balance replay worldgold tasks:validate`.

| Command | What it proves |
|---|---|
| `pnpm build` | Everything type-checks and builds; generated tables match core's schemas. |
| `pnpm lint` | File size cap, layering, no tick scans, no tunable literals, no emoji. |
| `pnpm test` | Unit tests for every package. |
| `pnpm contentlint` | Content files are valid and cross-referenced. |
| `pnpm replay` | Recorded command scripts reproduce their golden store and events on `MemoryStore`. |
| `pnpm balance` / `pnpm smoke` / `pnpm worldgold` | Present and trivially green in Phase 0; they fill in later phases. |
| `pnpm tasks:validate` | The task ledger's rules. |

`pnpm gen:tables` regenerates the server and memory-store tables from
`packages/core/src/store/tables.ts`; `pnpm server:bindings` regenerates the
client's SpacetimeDB bindings after a module change.

## How the work is organised

- [`CLAUDE.md`](CLAUDE.md) is the spec: pillars, tech stack, repository
  layout, every system, and the rules agents and humans follow.
- Everything built traces to a task file under [`tasks/`](tasks/), one task
  per PR. [`tasks/README.md`](tasks/README.md) tells a worker session how to
  find, claim and finish a task; [`docs/BOARD.md`](docs/BOARD.md) shows what
  is ready now.
- Architectural decisions live in [`docs/DECISIONS/`](docs/DECISIONS/).
- Layout: `packages/core` is the game (pure TypeScript, all rules),
  `packages/content` is data, `packages/server` is the SpacetimeDB module
  (thin glue over core), `packages/client` is the PixiJS view, `tools/` holds
  the build, lint and ledger tooling.

## Troubleshooting

**Docker is not running.** `pnpm server:up` fails with:

```
unable to get image 'clockworklabs/spacetime:v2.10.1': failed to connect to the docker API at unix:///var/run/docker.sock ...
```

Start Docker Desktop, or the daemon on Linux (`sudo systemctl start docker`),
check `docker info` answers, and run `pnpm server:up` again.

**Image pull fails with `429 Too Many Requests`.** Docker Hub rate-limits
anonymous pulls, which bites on shared networks and CI. Retry after a few
seconds, or `docker login` to get a higher limit.

**Port 3000 is in use.** `pnpm server:up` fails with:

```
failed to bind host port 127.0.0.1:3000/tcp: address already in use
```

Find the process (`lsof -i :3000`, or `docker ps` for a SpacetimeDB container
left from another checkout) and stop it. The client, the CLI's `local`
server and `docker-compose.yml` all expect 3000, so free the port rather than
moving it. If **5173** is taken, Vite quietly picks the next free port: use
the `Local:` URL it prints.

**Stale auth token.** Tokens are signed by the local server's key, which
lives in the `bastion_bastion-stdb` volume (`/stdb/keys`). `pnpm server:down`
then `pnpm server:up` keeps it, so every identity stays valid. Only removing
the volume (`docker compose down -v`, `docker volume rm`, a Docker reset)
generates a new key, and every token issued before that stops working:

- `pnpm server:publish` fails with `Error: Invalid token: InvalidSignature`
  (`401 Unauthorized`). Run `pnpm server:cli logout`, then publish again.
- The browser needs nothing: the pip briefly shows
  `dropped: Failed to verify token: Unauthorized`, the client forgets the
  rejected token, and it reconnects as a new player within a second.

`pnpm server:publish` alone does not invalidate tokens: it wipes the
database's rows, not the server's key.

**Publish says `not authorized to perform action on database … reset database`.**
This happens once if your `bastion_bastion-stdb` volume was created before the
signing key moved into it (P0-044). The key changed on upgrade, so the
`bastion` database belongs to an identity nobody can sign as any more, and
`pnpm server:cli logout` alone does not fix it. Recreate the volume. This
wipes local game data, which a publish wipes anyway:

```sh
pnpm server:down
docker volume rm bastion_bastion-stdb
pnpm server:up
pnpm server:cli logout
pnpm server:publish
```

**The pip says `dropped: WebSocket error` with a 404.** The server is up but
the `bastion` database is not published. Run `pnpm server:publish`.
