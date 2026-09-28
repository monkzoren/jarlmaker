// @bastion/core — THE GAME (CLAUDE.md 3.3). Pure TypeScript: nothing from
// `server`, `client`, `@bastion/content`, PixiJS or spacetimedb.

export type {
  Id,
  IndexOf,
  IndexOfIn,
  IndexVal,
  IndexValIn,
  PkIn,
  PkOf,
  Rng,
  Row,
  RowIn,
  Store,
  StoreOf,
  TableName,
  TableNameIn,
  Timestamp,
} from './store/types.ts'
export {
  defineTable,
  registerTables,
  tableList,
  TABLES,
  type ColumnOf,
  type IndexDecl,
  type PkColumnOf,
  type RowSchema,
  type TableDef,
  type TableRegistry,
} from './store/tables.ts'
export type { EventBase, EventKind, EventOf, EventRegistry, GameEvent } from './events/index.ts'
export {
  commandEnvelopeSchema,
  reject,
  type Command,
  type CommandEnvelope,
  type CommandKind,
  type CommandRegistry,
  type Rejection,
} from './commands.ts'
export {
  onEvent,
  registerCommand,
  Registry,
  REGISTRY,
  type AnyCommandDef,
  type AnyEventHandler,
  type CommandContext,
  type CommandDef,
  type DispatchTable,
  type EventContext,
} from './registry.ts'
export { execute, type ExecuteOptions } from './execute.ts'
export { SYSTEM_TICKS, tick, type SystemTick, type TickContext, type TickOptions } from './tick.ts'
export { dispatch, MAX_EVENTS_PER_STEP } from './dispatch.ts'
export { commandNonce } from './kernel/nonce.ts'
export { StepStore } from './kernel/step-store.ts'
export {
  ContentError,
  createGame,
  loadContent,
  registerContent,
  registerTuning,
  type Content,
  type ContentRegistry,
  type Game,
  type LoadedContent,
  type TuningRegistry,
} from './game.ts'
