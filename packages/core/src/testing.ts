// @bastion/core/testing — the test host (CLAUDE.md 3.4, ADR 0001).
// `MemoryStore` and its seeded `createRng` are fixtures for unit tests,
// replay, the balance harness and the quest solver. They are never shipped,
// so they live behind this entry instead of the main barrel: the client
// imports `@bastion/core` and cannot pull them in by accident.

export { MemoryStore, type MemoryStoreOptions } from './store/memory.ts'
export { createRng } from './store/rng.ts'
export { FLAT_WORLD_SECTIONS, FLAT_WORLD_TUNING } from './world/fixture.ts'
