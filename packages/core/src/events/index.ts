// GameEvent: facts that happened (CLAUDE.md 3.4). The union is the contract
// between systems: quests, progression, stats and the tutorial react to
// events and never call each other.
//
// A system adds its events by declaration merging, from its own folder.
// The key is the event `kind` (`<system>.<past_tense>`); the value is the
// payload without `kind` and `tick`:
//
//   declare module '../events/index.ts' {
//     interface EventRegistry {
//       'structure.built': { by: string; def: string; at: { x: number; y: number } }
//     }
//   }

/** Every event carries its kind and the tick it happened on. */
export interface EventBase {
  readonly kind: string
  readonly tick: number
}

/** kind -> payload. Empty in the contract; systems add members. */
export interface EventRegistry {}

export type EventKind = keyof EventRegistry & string

export type GameEvent = {
  [K in EventKind]: { readonly kind: K; readonly tick: number } & Readonly<EventRegistry[K]>
}[EventKind]

/** The event with kind `K`. */
export type EventOf<K extends EventKind> = Extract<GameEvent, { readonly kind: K }>
