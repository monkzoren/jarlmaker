/**
 * The shared palette for terrain tiles, decals and props (ADR 0007): one
 * ramp per material, lit from the top left.
 */
export const WORLD_PALETTE: Readonly<Record<string, string>> = {
  K: '#1b1f22', // outline
  a: '#223a48', // sea deep
  b: '#2b4859', // sea
  c: '#3b6075', // sea crest
  d: '#7fa6b3', // sea glint
  e: '#d8e6e8', // foam
  f: '#c8b088', // sand
  g: '#b09872', // sand shadow
  h: '#dcc9a0', // sand light
  i: '#8c7658', // sand grit
  j: '#5a8a48', // grass
  k: '#4b793c', // grass shadow
  l: '#6e9f54', // grass light
  m: '#3a6430', // grass dark
  n: '#3b5632', // forest floor
  o: '#314a2a', // forest floor shadow
  p: '#48663a', // moss
  q: '#5e4a30', // pine needles
  r: '#6b5a4c', // heath
  s: '#5a4b41', // heath shadow
  t: '#7b6a56', // heath light
  u: '#7a5676', // heather
  v: '#9a6c90', // heather light
  w: '#7a7f82', // stone
  x: '#686d70', // stone shadow
  y: '#90969a', // stone light
  z: '#53575a', // stone crack
  A: '#9aa86a', // lichen
  B: '#c9b84c', // lichen gold / flower heart
  C: '#ece6d2', // shell / white petal
  E: '#e6c64a', // yellow petal
  F: '#7d9bd0', // blue petal / berry
  G: '#8a6a48', // wood
  H: '#5e4630', // wood dark
  I: '#b89468', // wood light
  L: '#b8402c', // mushroom cap
  P: '#2c5a3a', // pine
  Q: '#1f4430', // pine shadow
  R: '#3f7a4c', // pine light
  S: '#5c9a5c', // pine highlight
  T: '#4a3322', // bark
  U: '#6a4a30', // bark light
  V: '#cfc8b4', // sail
  W: '#a39c88', // sail shadow / rope
  X: '#e0702a', // ember
  Y: '#3a3530', // raven black / hole
  M: '#f4d06a', // flame core
  N: '#f08a2c', // flame
  O: '#c8421e', // flame edge
  Z: '#ffe9a8', // spark
}
