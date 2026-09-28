import path from 'node:path'
import { noTickScan } from '../src/rules/no-tick-scan.ts'
import { tsRuleTester } from './setup.ts'

const cwd = process.cwd()
const inServer = path.join(cwd, 'packages/server/src/reducers/x.ts')

tsRuleTester().run('no-tick-scan', noTickScan, {
  valid: [
    { name: 'pk lookup', code: 'ctx.db.entity.id.find(1n)', filename: inServer },
    { name: 'index filter', code: 'for (const r of ctx.db.entity.byOwner.filter(o)) use(r)', filename: inServer },
    { name: 'insert, update, delete', code: 'ctx.db.entity.insert(r); ctx.db.entity.id.update(r); ctx.db.entity.id.delete(k)', filename: inServer },
    { name: 'spreading an index result', code: 'const rows = [...db.entity.byOwner.filter(o)]', filename: inServer },
    { name: 'object spread of a handle does not iterate', code: 'const o = { ...ctx.db.entity }', filename: inServer },
    { name: 'iter on something that is not a table handle', code: 'const it = list.iter(); const n = other.count()', filename: inServer },
    { name: 'iterating a non-db member', code: 'for (const x of ctx.rows) use(x)', filename: inServer },
    {
      name: 'an allowlisted file',
      code: 'for (const r of ctx.db.entity.iter()) use(r)',
      filename: inServer,
      options: [{ allow: ['packages/server/src/reducers/x.ts'] }],
    },
  ],
  invalid: [
    { name: '.iter()', code: 'for (const r of ctx.db.entity.iter()) use(r)', filename: inServer, errors: [{ messageId: 'method', data: { method: 'iter' } }] },
    { name: '.count()', code: 'const n = ctx.db.entity_pos.count()', filename: inServer, errors: [{ messageId: 'method', data: { method: 'count' } }] },
    { name: 'computed table name', code: "ctx.db['entity'].iter()", filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'dynamic table name', code: 'ctx.db[t].count()', filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'computed method name', code: "ctx.db.entity['iter']()", filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'aliased db', code: 'const { db } = ctx; db.entity.iter()', filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'this.ctx.db', code: 'this.ctx.db.entity.iter()', filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'through a cast', code: '(ctx.db.entity as Iterable<Row>)[Symbol.iterator]; (ctx.db.entity as any).iter()', filename: inServer, errors: [{ messageId: 'method' }] },
    { name: 'for...of a handle', code: 'for (const r of ctx.db.entity) use(r)', filename: inServer, errors: [{ messageId: 'iterate' }] },
    { name: 'spread a handle', code: 'const all = [...ctx.db.entity]', filename: inServer, errors: [{ messageId: 'iterate' }] },
    { name: 'spread into a call', code: 'use(...ctx.db.entity)', filename: inServer, errors: [{ messageId: 'iterate' }] },
    { name: 'Array.from a handle', code: 'const all = Array.from(ctx.db.entity)', filename: inServer, errors: [{ messageId: 'iterate' }] },
    { name: 'yield* a handle', code: 'function* g() { yield* ctx.db.entity }', filename: inServer, errors: [{ messageId: 'iterate' }] },
    { name: 'array destructuring', code: 'const [first] = ctx.db.entity', filename: inServer, errors: [{ messageId: 'iterate' }] },
    {
      name: 'the allowlist is per file',
      code: 'ctx.db.entity.iter()',
      filename: inServer,
      options: [{ allow: ['packages/server/src/tick.ts'] }],
      errors: [{ messageId: 'method' }],
    },
  ],
})
