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
