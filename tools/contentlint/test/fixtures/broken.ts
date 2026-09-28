// A deliberately broken content set: the real content plus exactly two
// problems, a function value and an invalid knob. Building on the real set
// keeps every section core registers present and valid, so this fixture does
// not break when a system registers a new tuning section.

import { content as real } from '@bastion/content'

export const content = {
  ...real,
  tuning: {
    ...real.tuning,
    lintFixture: { speed: -1 },
    lintFunctions: { pick: () => 32 },
  },
}
