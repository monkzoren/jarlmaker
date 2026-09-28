// A deliberately broken content set: a function value and an invalid knob.

export const content = {
  tuning: {
    lintFixture: { speed: -1 },
    world: { chunkSize: 32, pick: () => 32 },
  },
}
