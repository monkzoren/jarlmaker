// Hello module (P0-010): proves the toolchain end to end — build, publish to
// the local Docker SpacetimeDB, call a reducer, query a table. P0-011 replaces
// it with StdbStore and the real reducers; nothing may depend on `hello`.
import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  hello: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      name: t.string(),
      sender: t.identity(),
      at: t.timestamp(),
    },
  ),
});
export default spacetimedb;

export const say_hello = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  if (name.length === 0) throw new Error('name must not be empty');
  ctx.db.hello.insert({ id: 0n, name, sender: ctx.sender, at: ctx.timestamp });
});
