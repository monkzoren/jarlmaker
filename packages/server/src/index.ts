// The SpacetimeDB module (ADR 0001): the schema plus one reducer per core
// command and the scheduled tick. Every reducer is thin glue over
// `@bastion/core`; see README.md.

import { t } from 'spacetimedb/server'
import { BUILD_ID } from './build-id.ts'
import spacetimedb from './schema.ts'

export default spacetimedb
export { join } from './reducers/join.ts'
export { move } from './reducers/move.ts'
export { init, tick } from './tick.ts'

// `build_info`: the module's BUILD_ID (CLAUDE.md 3.6 rule 6), stamped into
// the git-ignored `build-id.ts` by tools/build-id. One row, readable by anyone.
export const build_info = spacetimedb.anonymousView(
  { name: 'build_info', public: true },
  t.option(t.row('BuildInfoRow', { build_id: t.string() })),
  () => ({ build_id: BUILD_ID }),
)
