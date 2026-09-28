// The systems a replay runs: exactly what the server runs, `core`'s REGISTRY
// and SYSTEM_TICKS.
//
// Shim until P0-029 lands: the entity system is not yet exported from
// `@bastion/core` nor listed in SYSTEM_TICKS, so this file imports it by path
// (which registers its tables, tuning and commands in the same module
// instance the barrel uses) and puts `entityTick` first, the slot tick.ts
// reserves for it. Once SYSTEM_TICKS carries it the override is a no-op and
// the goldens do not change. Remove the shim in the follow-up task.

import { SYSTEM_TICKS, type SystemTick } from '@bastion/core'
import { entityTick } from '../../../packages/core/src/entity/index.ts'

export const REPLAY_SYSTEMS: readonly SystemTick[] = SYSTEM_TICKS.some((s) => s.system === entityTick.system)
  ? SYSTEM_TICKS
  : [entityTick, ...SYSTEM_TICKS]
