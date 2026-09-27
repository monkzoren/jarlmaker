# 0002 — PixiJS v8 renderer, no game engine

- **Status:** accepted (Planner run 1, transcribing MASTER-PROMPT Section 0, row 2)
- **Date:** 2026-09-27

## Context

The brief left the client technology open ("whatever makes an expensive game
easy to make, browser is fine"). The options were Phaser, Godot (web export),
Unity (WebGL), or a plain renderer.

## Decision

The client is TypeScript + **PixiJS v8** (WebGL2/WebGPU) built with **Vite**,
with lit-html for panels and no UI framework for the HUD. No game engine.

## Why

- Building a game cheaply with agents depends on *one language, one
  simulation, and one type-checker* across client and server, not on an
  engine. The SpacetimeDB module is TypeScript, so a TypeScript client can
  import the same `core`.
- Phaser and Godot each bring their own world model (scenes, physics, nodes)
  that fights a server-authoritative simulation. Godot's web export is heavy
  on phones, and so is Unity's.
- PixiJS is only a renderer, which is exactly the amount of opinion we want.
  The client is a *view* of a snapshot.

## Consequences

- We write the game-specific pieces ourselves: camera, chunk render-texture
  cache, sprite batching, and the animation player. Each is small and
  lives in `client/src/render`.
- Physics and collision live in `core` (cell-based, deterministic), where
  they belong in a server-authoritative game anyway.
