// Shared fixtures for the entity tests: the Game (tuning mirrors
// packages/content/tuning, which core cannot import) and a store with the
// kernel's and this system's tables.

import { createGame } from '../game.ts'
import { worldClock } from '../kernel/clock.ts'
import { commandNonce } from '../kernel/nonce.ts'
import { MemoryStore } from '../store/memory.ts'
import type { StepKnobs } from './schema.ts'
import { ENTITY_TABLES } from './tables.ts'
import { stepKnobs } from './tick.ts'
import './commands.ts'

export const TUNING = {
  movement: { speed: 4, accel: 32, maxStepMs: 100 },
  world: { chunkSize: 32, sectorSize: 32 },
}

export const game = createGame({ tuning: TUNING })
export const KNOBS: StepKnobs = stepKnobs(game)

export function newStore(seed = 0): MemoryStore {
  return new MemoryStore({ seed, tables: [commandNonce, worldClock, ...ENTITY_TABLES] })
}
