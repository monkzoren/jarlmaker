// The SpacetimeDB module (ADR 0001): the schema plus one reducer per core
// command and the scheduled tick. Every reducer is thin glue over
// `@bastion/core`; see README.md.

import spacetimedb from './schema.ts'

export default spacetimedb
export { join } from './reducers/join.ts'
export { move } from './reducers/move.ts'
export { init, tick } from './tick.ts'
