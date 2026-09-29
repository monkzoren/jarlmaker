// Shared fixtures for the entity tests: the Game (tuning mirrors
// packages/content/tuning, which core cannot import) and a store with the
// kernel's and this system's tables.

import { createGame } from '../game.ts'
import { worldClock } from '../kernel/clock.ts'
import { commandNonce } from '../kernel/nonce.ts'
import { MemoryStore } from '../store/memory.ts'
import { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from '../world/fixture.ts'
import { WORLD_TABLES } from '../world/tables.ts'
import { ITEM_TABLES } from '../items/tables.ts'
import { SURVIVAL_TABLES } from '../survival/tables.ts'
import '../survival/schema.ts'
import type { StepKnobs } from './schema.ts'
import { ENTITY_TABLES } from './tables.ts'
import { stepKnobs } from './tick.ts'
import './commands.ts'

export const TUNING = {
  movement: { speed: 4, accel: 32, maxStepMs: 100 },
  world: FLAT_WORLD_TUNING,
  survival: {
    dayTicks: 3600,
    startPhase: 0.05,
    duskPhase: 0.66,
    dawnPhase: 0.94,
    twilight: 0.06,
    meterMax: 100,
    vitalsBuckets: 10,
    nightWarmthPerSec: -1.5,
    dayWarmthPerSec: 0.3,
    coldDamagePerSec: 2,
    healPerSec: 0.1,
    foodPerSec: 0.15,
    respawnWarmth: 0.5,
  },
  net: {
    tickHz: 10,
    reconnectQueueSeconds: 30,
    reconnectQueueMax: 300,
    reconnectBackoffMinMs: 500,
    reconnectBackoffMaxMs: 5000,
    reconnectSilenceMs: 3000,
    reconnectConnectTimeoutMs: 8000,
    offlineMoveGraceMs: 500,
  },
}

export const game = createGame({ tuning: TUNING, ...FLAT_WORLD_SECTIONS })
export const KNOBS: StepKnobs = stepKnobs(game)

export function newStore(seed = 0): MemoryStore {
  return new MemoryStore({ seed, tables: [commandNonce, worldClock, ...ENTITY_TABLES, ...WORLD_TABLES, ...ITEM_TABLES, ...SURVIVAL_TABLES] })
}
