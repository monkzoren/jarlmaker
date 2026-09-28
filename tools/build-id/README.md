# @bastion/build-id

The one `BUILD_ID` (CLAUDE.md 3.6 rule 6): `<git short sha>-<UTC yyyymmddThhmmssZ>`,
e.g. `2ad089b-20260928T141503Z` (`nogit-…` outside a checkout). The build
computes it once and stamps it into the client bundle and the server module, so
no human or agent ever edits a version number.

```sh
node tools/build-id/src/cli.ts [-- <command> [args...]]
```

The CLI resolves the id (an inherited `BUILD_ID` wins, otherwise a fresh one),
writes `packages/server/src/build-id.ts` (git-ignored), prints the id, then runs
the command with `BUILD_ID` in its environment. It runs on plain Node (>= 22.18
strips the types), so it needs no install.

| Root script | Wrapped so that |
|---|---|
| `pnpm build`, `pnpm typecheck`, `pnpm test` | The server const exists before `tsc`/Vitest, and Vite (via turbo, which lists `BUILD_ID` in the `build` task's `env`) gets the same id. |
| `pnpm server:publish`, `pnpm server:bindings` | The module published or compiled carries a fresh id. |

| Reader | How |
|---|---|
| Client | `import.meta.env.BUILD_ID` (Vite `define` in `packages/client/vite.config.ts`), and the `#build-id` debug corner injected into `index.html`. A bare `vite` dev server says `dev`. |
| Server | `import { BUILD_ID } from './build-id.ts'`; the public `build_info` view returns it: `pnpm server:cli sql --server local bastion "SELECT * FROM build_info"`. |

The `compat` table (minimum client build) and the service worker stamp arrive
in P6.
