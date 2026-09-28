# 0008 — Movement freezes while disconnected; other commands queue

- **Status:** accepted (maintainer decision, 2026-09-28)
- **Amends:** CLAUDE.md 3.6 rule 7

## Context

P0-016 queues every command during a dropout and replays the queue on
reconnect. For movement this loses the walk: `entity.move` sets a stick
*state* (pressed or released), and the server integrates it over ticks. A
press and a release made offline are replayed back to back, so the server
sees a zero-length press. Meanwhile, the client predicted the walk locally
and snaps back on reconnect. The integrator reproduced this against a local
server: 1 s of offline walking left the server position unchanged. The smoke
test missed it because it held the key across the reconnect.

The maintainer weighed three options:
- freeze and snap
- replay the walk with its timing (server re-simulates; allows "banking" up
  to 30 s of movement)
- keep the snap-back

They chose **freeze and snap**.

## Decision

- Once the client detects a drop, it stops predicting local movement for its
  own player after a short grace period (`tuning.net`, ~0.5 s). The sprite
  holds still and the reconnecting pip shows. Movement input while dropped
  is not queued: stick changes made offline are discarded, and on reconnect
  the client sends its *current* stick state once.
- Every other command (build, craft, use, …) still queues and replays in
  order under the existing 30 s / cap rules.
- On reconnect the player continues from the server's position. Nothing
  rubber-bands, because nothing moved while offline.

## Consequences

- There is no rubber-banding and no teleport-looking catch-up on a shared
  server. This is the genre-standard behaviour.
- In a tunnel, walking pauses. Tunnels are short, and the pip tells the
  player why.
- The smoke suite gains a scenario that presses **and releases** a key while
  offline, and asserts that the server position and the client's drawn
  position agree after reconnect.
