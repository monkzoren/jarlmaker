// survival events (CLAUDE.md 3.4).

declare module '../events/index.ts' {
  interface EventRegistry {
    /** `owner` ran out of health (`cause`: what took it). The entity system respawns them. */
    'player.died': { owner: string; cause: 'cold' }
    /** `owner` ate one `item`. */
    'player.ate': { owner: string; item: string }
  }
}

export {}
