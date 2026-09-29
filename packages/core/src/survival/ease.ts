// Easing for daylight: smoothstep, clamped. Kept out of rules.ts because its
// constants are the curve's definition, not tunables.

export function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}
