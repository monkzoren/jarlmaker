// Networking knobs, read by the server tick and the client's reconnect queue
// (P0-016) through the Game context.

export const net = {
  // Server simulation rate (CLAUDE.md 3.4): the 2 ms tick budget is sized for
  // 200 players at this rate.
  tickHz: 10,
  // How long the client keeps queued commands during a dropout before
  // dropping them with a toast (CLAUDE.md 3.6 rule 7). Tunnels are the normal case.
  reconnectQueueSeconds: 30,
  // Hard cap on queued commands, so a long dropout can't grow the queue without
  // bound. 30 s of input at the tick rate.
  reconnectQueueMax: 300,
  // Reconnect backoff (P0-016). The first retry comes quickly: most drops are
  // a tunnel or a network handoff that is already over. Doubling stops at the
  // ceiling, so a long outage still retries every few seconds and the player
  // is back within one interval of the network returning.
  reconnectBackoffMinMs: 500,
  reconnectBackoffMaxMs: 5000,
  // The server updates `world_clock` every tick. This long with no traffic
  // means the socket is dead even if the browser has not closed it.
  reconnectSilenceMs: 3000,
  // A connect attempt not ready by now is abandoned and retried: a connect
  // into a dead network can hang far longer than the backoff. Generous, so a
  // slow phone handshake plus the first subscription fits.
  reconnectConnectTimeoutMs: 8000,
  // With no server traffic for this long (or this long after a drop), the own
  // player stops predicting and holds still until the server is heard again
  // (ADR 0008, P0-046). It counts from the last traffic, not from drop
  // detection, so a tunnel walks the sprite at most this long before the
  // freeze: 300 ms is about 1 cell at full speed, so the snap-back on reconnect
  // stays small. Three missed `world_clock` ticks, so ordinary jitter on a
  // live link does not freeze the sprite.
  offlineMoveGraceMs: 300,
  // Client view (P0-015). Remote entities are drawn this many ticks in the
  // past and interpolated between server updates: two ticks hides one late
  // update without making other players feel laggy.
  remoteDelayTicks: 2,
  // When the server corrects the local player's prediction, the visible
  // error decays with this time constant instead of snapping. Short enough
  // that a correction never reads as drift, long enough to hide the jump.
  correctionSmoothMs: 100,
  // A correction larger than this (a teleport, a respawn, a long dropout)
  // snaps instead of sliding across the map.
  correctionSnapCells: 2,
}
