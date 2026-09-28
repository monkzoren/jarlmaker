// Movement knobs, read by `core/src/entity` (P0-008) through the Game context.
// Units are cells and seconds, so they stay meaningful at any tick rate.

export const movement = {
  // Walking pace. 4 cells/s crosses a 32-cell chunk in 8 s: quick enough for
  // a 5-minute session, slow enough that the camera never outruns the stream.
  speed: 4,
  // Acceleration to full speed. 32 cells/s² reaches `speed` in 1/8 s, so the
  // stick feels responsive without the sprite snapping to full speed.
  accel: 32,
  // Longest single integration step, in ms. A server hiccup or a long client
  // frame is split into steps this long, so one step moves under one cell
  // (4 cells/s × 0.1 s = 0.4) and collision can never skip a wall. Equal to
  // one tick at 10 Hz, so a normal tick is exactly one step.
  maxStepMs: 100,
}
