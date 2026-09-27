# @bastion/tasks

The ledger tooling from CLAUDE.md 4.3, amended by ADR 0003. See
[`tasks/README.md`](../../tasks/README.md) for how to use it.

| File | Does |
|---|---|
| `src/schema.ts` | Frontmatter schema, lanes, statuses, phases |
| `src/load.ts` | Parse task files; in-place frontmatter edits |
| `src/graph.ts` | Cycles, dependents, critical path |
| `src/derive.ts` | Derived statuses (ready/review), claim resolution, `next` |
| `src/git.ts` | Reading `origin/main` and claims on remote branches |
| `src/validate.ts` | Every ledger rule, plus the generated-file hash check |
| `src/board.ts`, `src/status.ts` | `docs/BOARD.md` and `docs/STATUS.md` renderers |
| `src/claim.ts` | `tasks:claim`: re-check, commit, push, race check |

`pnpm --filter @bastion/tasks test` runs the unit tests and a real-git
integration test (a bare origin with three clones racing for claims).
