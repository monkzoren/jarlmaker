// world events (CLAUDE.md 3.4). Payloads are flat facts.

declare module '../events/index.ts' {
  interface EventRegistry {
    /** `by` hit the `prop` at (cx, cy) and got one `item`; `felled` when that was its last hit. */
    'world.harvested': { by: string; prop: string; item: string; cx: number; cy: number; felled: boolean }
  }
}

export {}
