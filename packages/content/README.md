# @bastion/content

Game data, and nothing else (CLAUDE.md 3.3, 3.7). Hosts import `content` and
pass it to `createGame` from `@bastion/core`, which validates every section
a system has registered (ADR 0005).

| Path | Holds |
|---|---|
| `tuning/<name>.ts` | One object of knobs for `content.tuning.<name>`, each with an intent comment |
| `<section>/*.ts` | Arrays of entries for `content.<section>` (structures, enemies, items, ...) |
| `index.ts` | The one `content` export |

Rules:

- No functions, anywhere. `pnpm contentlint` fails on a function value.
- Import from `@bastion/core` with `import type` only.
- Add a new tuning file to `tuning/index.ts`; add a new data section to `index.ts`.
- Run `pnpm contentlint` after every change. It lists sections that no
  system has registered a schema for yet as warnings.
