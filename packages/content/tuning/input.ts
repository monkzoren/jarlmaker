// Input knobs, read by the client's touch stick (`client/src/input`, P0-014)
// through its `InputKnobs` option. Keyboard and gamepad ignore them.

export const input = {
  // Fraction of the stick radius that reads as zero, in [0, 1). A resting
  // thumb drifts a few pixels; 0.15 swallows that drift without making the
  // first push feel sticky.
  deadZone: 0.15,
  // CSS pixels of drag for a full-strength stick. 48 px is about a thumb's
  // comfortable sweep on a phone, so full speed never needs a stretch.
  stickRadiusPx: 48,
}
