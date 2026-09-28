# @bastion/eslint-plugin

The architecture police (CLAUDE.md 3.2). Wired in the root `eslint.config.js`;
`pnpm lint` runs it over the whole repo.

| Rule | Scope | Fails on |
|---|---|---|
| `max-file-lines` | every file ESLint lints | line 601 and beyond (CLAUDE.md 3.3). Option `max`. |
| `layering` | `packages/core/**` | imports of `pixi.js`, `spacetimedb`, `@bastion/server`, `@bastion/client` (and their subpaths), and relative paths that leave `packages/core`. Checks `import`, `export ... from`, `import()` and `require()`. Options `root`, `forbidden`. |
| `layering` (shipped) | `packages/{client,server,commerce}/src/**`, except `*.test.ts` | imports of `@bastion/core/testing` (`MemoryStore` never ships, CLAUDE.md 3.4) and relative paths out of the package. Blocks come from `shippedLayeringConfigs()`, which the RuleTester suite runs too. |
| `no-emoji` | `packages/client/**`, `packages/content/**` | Unicode pictographs (`Extended_Pictographic`, flags, U+FE0F, U+20E3) in strings, templates and comments, escaped or literal (CLAUDE.md 3.5.9). The text marks (c), (R) and TM are allowed. |

| `no-tunable-literal` | `packages/core/src/**/rules.ts`, `**/tick.ts` | numeric literals other than 0, 1, -1 (CLAUDE.md 3.7). Array index access (`xs[2]`) and literal types are allowed; anything else needs `// tunable-ok: <reason>` on the same line or the line above, which the reviewer checks. |
| `no-tick-scan` | `packages/server/src/**` | full-table iteration on a `ctx.db` table handle (CLAUDE.md 3.4): `.iter()`, `.count()`, `for...of`, spread, `Array.from`, `yield*`, array destructuring. Index lookups are fine. Exempt files are listed, with reasons, in `src/rules/no-tick-scan.allowlist.ts`. Option `allow` replaces the list. |

The cosmetics import-direction rule arrives with the P6 cosmetics contract.

The plugin is plain TypeScript with no build step: Node (22.18+) strips the
types when `eslint.config.js` imports it. Keep it to erasable syntax (no
`enum`, no parameter properties) and import with `.ts` extensions.

`pnpm --filter @bastion/eslint-plugin test` runs the RuleTester suites.
