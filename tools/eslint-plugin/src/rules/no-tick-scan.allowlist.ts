/**
 * The explicit allowlist for `no-tick-scan`: server files (repo-relative,
 * posix paths) that may iterate a whole table, each with the reason. A new
 * entry is a reviewer-checked exception to CLAUDE.md 3.4 ("there is no
 * scan"); prefer an index or a denormalized column.
 */
export const TICK_SCAN_ALLOWLIST: readonly { readonly file: string; readonly reason: string }[] = []
