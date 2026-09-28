# @bastion/eslint-plugin

The architecture police (CLAUDE.md 3.2). Wired in the root `eslint.config.js`;
`pnpm lint` runs it over the whole repo.

| Rule | Scope | Fails on |
|---|---|---|
| `max-file-lines` | every file ESLint lints | line 601 and beyond (CLAUDE.md 3.3). Option `max`. |
| `layering` | `packages/core/**` | imports of `pixi.js`, `spacetimedb`, `@bastion/server`, `@bastion/client` (and their subpaths), and relative paths that leave `packages/core`. Checks `import`, `export ... from`, `import()` and `require()`. Options `root`, `forbidden`. |
| `no-emoji` | `packages/client/**`, `packages/content/**` | Unicode pictographs (`Extended_Pictographic`, flags, U+FE0F, U+20E3) in strings, templates and comments, escaped or literal (CLAUDE.md 3.5.9). The text marks (c), (R) and TM are allowed. |

`no-tunable-literal` and `no-tick-scan` arrive in P0-021; the cosmetics
import-direction rule arrives with the P6 cosmetics contract.

The plugin is plain TypeScript with no build step: Node (22.18+) strips the
types when `eslint.config.js` imports it. Keep it to erasable syntax (no
`enum`, no parameter properties) and import with `.ts` extensions.

`pnpm --filter @bastion/eslint-plugin test` runs the RuleTester suites.
