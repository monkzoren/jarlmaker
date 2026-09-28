import { layering } from '../src/rules/layering.ts'
import { tsRuleTester } from './setup.ts'

const root = '/repo/packages/core'
const file = '/repo/packages/core/src/world/rules.ts'
const options = [{ root }]

tsRuleTester().run('layering', layering, {
  valid: [
    { name: 'a relative import inside core', code: "import { x } from '../store/types.ts'", filename: file, options },
    { name: 'a relative import up to the core root', code: "import { x } from '../../index.ts'", filename: file, options },
    { name: 'an allowed package', code: "import { z } from 'zod'", filename: file, options },
    { name: 'a node builtin', code: "import path from 'node:path'", filename: file, options },
    { name: 'a name that only starts like a forbidden one', code: "import x from 'spacetimedb-extra'", filename: file, options },
    { name: 'a re-export inside core', code: "export * from './schema.ts'", filename: file, options },
    { name: 'a dynamic import inside core', code: "await import('./schema.ts')", filename: file, options },
    { name: 'a require of an allowed package', code: "require('zod')", filename: file, options },
    { name: 'a non-literal dynamic import is not judged', code: 'await import(name)', filename: file, options },
    {
      name: 'a custom forbidden list replaces the default',
      code: "import { Application } from 'pixi.js'",
      filename: file,
      options: [{ root, forbidden: ['howler'] }],
    },
  ],
  invalid: [
    {
      name: 'pixi.js',
      code: "import { Application } from 'pixi.js'",
      filename: file,
      options,
      errors: [{ messageId: 'forbiddenModule', data: { spec: 'pixi.js', root } }],
    },
    {
      name: 'spacetimedb and its subpaths, type-only included',
      code: "import type { Table } from 'spacetimedb/server'",
      filename: file,
      options,
      errors: [{ messageId: 'forbiddenModule' }],
    },
    {
      name: '@bastion/server',
      code: "export { tables } from '@bastion/server'",
      filename: file,
      options,
      errors: [{ messageId: 'forbiddenModule' }],
    },
    {
      name: '@bastion/client through a dynamic import',
      code: "await import('@bastion/client')",
      filename: file,
      options,
      errors: [{ messageId: 'forbiddenModule' }],
    },
    {
      name: 'spacetimedb through require',
      code: "require('spacetimedb')",
      filename: file,
      options,
      errors: [{ messageId: 'forbiddenModule' }],
    },
    {
      name: 'a relative path out of core',
      code: "import { render } from '../../../client/src/render/scene.ts'",
      filename: file,
      options,
      errors: [{ messageId: 'escapesRoot' }],
    },
    {
      name: 'a relative path to a sibling whose name starts with the root',
      code: "export * from '../../../core-extra/index.ts'",
      filename: file,
      options,
      errors: [{ messageId: 'escapesRoot' }],
    },
    {
      name: 'the default root and forbidden list',
      code: "import { x } from '../../server/src/tables.ts'\nimport { Sprite } from 'pixi.js'",
      filename: 'packages/core/src/a.ts',
      errors: [{ messageId: 'escapesRoot' }, { messageId: 'forbiddenModule' }],
    },
  ],
})
