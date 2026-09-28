// @bastion/content — DATA only (CLAUDE.md 3.3, 3.7). Hosts pass `content` to
// core's `createGame` (ADR 0005); core never imports this package. Imports
// from core are `import type` only, and no value here may be a function
// (contentlint rejects it).

import type { Content } from '@bastion/core'
import * as tuning from './tuning/index.ts'

export const content = { tuning: { ...tuning } } satisfies Content
