# events — the GameEvent union

A **GameEvent** is a fact that happened: `{kind: 'structure.built', tick,
by, def, at}` (CLAUDE.md 3.4). Systems never call each other. They read the
store and `store.emit(event)`. Anything that reacts (quests, progression,
stats, telemetry, tutorial hints) registers a handler for an event `kind`.
The kernel (P0-006) runs handlers after the command or tick step that emitted
the event, in the same transaction.

The union is the contract that makes quests and achievements pure data. An
objective is "count events matching this shape", so event payloads are flat,
serializable facts: ids, def ids, cells, counts. No functions, no store rows.

## Adding events

Each system adds its events by declaration merging, from its own folder
(usually `<system>/events.ts`). The key is the `kind`, `<system>.<past_tense>`.
The value is the payload **without** `kind` and `tick`:

```ts
declare module '../events/index.ts' {
  interface EventRegistry {
    'entity.sector_changed': { entity: bigint; from: string; to: string }
  }
}
```

`GameEvent` is then the union of `{kind, tick} & payload` over every entry,
and `EventOf<'entity.sector_changed'>` picks one member. The registry is
empty in the contract, so `GameEvent` is `never` until the first system
adds an event.

Rules:
- One kind, one owner. If a `quests` task needs a new `combat` event, a tiny
  `combat` task adds it (CLAUDE.md 4.4).
- Never change the payload of a published kind; add a new kind.
- `tick` is the tick counter the event happened on, not wall time.
