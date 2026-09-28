# @bastion/core

THE GAME. Pure TypeScript rules that the server runs (authoritative) and the
client reuses for movement prediction (CLAUDE.md 3.1, ADR 0001). It imports
nothing from `server`, `client` or `@bastion/content`, and nothing from
PixiJS or spacetimedb. Its only runtime dependency is `zod`.

## The contracts

| File | What it defines |
|---|---|
| `src/store/` | The `Store` interface (no scan) and the table declaration format. See its README. |
| `src/events/` | The `GameEvent` union, extended by each system. See its README. |
| `src/commands.ts` | The `Command` union, `CommandEnvelope {nonce, cmd}` and its wire schema, `Rejection {code, message}`. |
| `src/game.ts` | The `Game` context: content injected by the host, validated by registered section schemas, frozen (ADR 0005). |

All four are **registries**. The contract ships them empty, and each system
adds its own tables, events, commands and content sections from its own
folder by declaration merging (types) plus a `register*` call (runtime). A
system never edits another system's files to plug in.

## Hosts

```ts
import { content } from '@bastion/content'   // the host imports content, core never does
import { createGame } from '@bastion/core'
const game = createGame(content)              // throws ContentError with dotted paths
// then execute(game, store, sender, envelope) / tick(game, store, dt), P0-006
```

## Scripts

`pnpm typecheck` (tsc, including the type-level tests) and `pnpm test` (vitest).
