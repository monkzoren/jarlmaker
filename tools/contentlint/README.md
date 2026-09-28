# @bastion/contentlint

`pnpm contentlint` (CLAUDE.md 3.7, 3.8). Loads `@bastion/content` and fails
with a dotted path per problem.

| Check | Since |
|---|---|
| No function values anywhere in content | P0-007 |
| Every registered section validates through `core`'s `loadContent` | P0-007 |
| Sections with no registered schema are listed as warnings (ADR 0005) | P0-007 |

Cross-reference, reachability, `teach` and palette checks join as their
systems land. Put each new check in `src/lint.ts` with a broken-fixture test.
