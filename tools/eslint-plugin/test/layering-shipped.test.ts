import { layering, shippedLayeringConfigs } from '../src/rules/layering.ts'
import { tsRuleTester } from './setup.ts'

// The exact blocks eslint.config.js spreads in: one per shipped package.
for (const config of shippedLayeringConfigs()) {
  const ruleOptions = config.rules['@bastion/layering'][1]
  const options = [ruleOptions]
  const root = { root: ruleOptions.root ?? '' }
  const file = `${root.root}/src/app.ts`

  tsRuleTester().run(`layering (shipped: ${root.root})`, layering, {
    valid: [
      { name: 'the core main entry', code: "import { tick } from '@bastion/core'", filename: file, options },
      { name: 'a core subpath that is not a test entry', code: "import type { Store } from '@bastion/core/store'", filename: file, options },
      { name: 'a name that only starts like the test entry', code: "import x from '@bastion/core/testing-extra'", filename: file, options },
    ],
    invalid: [
      {
        name: 'MemoryStore from the testing entry',
        code: "import { MemoryStore } from '@bastion/core/testing'",
        filename: file,
        options,
        errors: [{ messageId: 'forbiddenModule', data: { spec: '@bastion/core/testing', root: root.root } }],
      },
      {
        name: 'the testing entry through a dynamic import',
        code: "await import('@bastion/core/testing')",
        filename: file,
        options,
        errors: [{ messageId: 'forbiddenModule' }],
      },
    ],
  })
}
