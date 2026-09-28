// Typecheck only, never run (`spacetimedb/server` loads only inside the
// SpacetimeDB host): `pnpm typecheck` proves the generated fixture tables are
// valid `table()` calls that `schema()` accepts, against the pinned version.
import { schema } from 'spacetimedb/server'
import { tables } from './fixture.generated.ts'

export const fixtureSchema = schema(tables)
