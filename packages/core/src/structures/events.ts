// structures events (CLAUDE.md 3.4).

declare module '../events/index.ts' {
  interface EventRegistry {
    /** `by` built `def` on cell (cx, cy). Items pay its cost; the world places its prop. */
    'structure.built': { by: string; def: string; cx: number; cy: number }
  }
}

export {}
