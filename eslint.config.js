// Root ESLint flat config (CLAUDE.md 3.2). `pnpm lint` runs it over the whole
// repo. The architecture police live in tools/eslint-plugin.
import bastion from '@bastion/eslint-plugin'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**'],
  },
  tseslint.configs.recommended,
  {
    plugins: { '@bastion': bastion },
    rules: {
      '@bastion/max-file-lines': 'error',
      // Registries (TuningRegistry, ContentRegistry, ...) are empty interfaces
      // that systems extend by declaration merging; that is the contract.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
    },
  },
  {
    files: ['packages/core/**'],
    rules: {
      '@bastion/layering': 'error',
    },
  },
  {
    files: ['packages/client/**', 'packages/content/**'],
    rules: {
      '@bastion/no-emoji': 'error',
    },
  },
)
