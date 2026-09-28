// entity events (CLAUDE.md 3.4). Payloads are flat facts: ids and keys.

declare module '../events/index.ts' {
  interface EventRegistry {
    /** A step moved `entity` from sector `from` into sector `to` (keys `"sx,sy"`). */
    'entity.sector_changed': { entity: bigint; from: string; to: string }
  }
}

export {}
