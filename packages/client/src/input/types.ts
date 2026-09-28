// Input contracts (CLAUDE.md 3.4 Client, 3.5.10). Input turns devices into
// Commands and hands them to a sink; it knows nothing about the network.
// P0-015 implements the sink over the STDB connection.

import type { CommandEnvelope, CommandRegistry } from '@bastion/core'

/** The `entity.move` payload, exactly as core declares it. */
export type MovePayload = CommandRegistry['entity.move']

/** The `entity.move` command as it travels in an envelope. */
export type MoveCommand = { readonly kind: 'entity.move' } & Readonly<MovePayload>

/** Where input delivers its commands. Every envelope carries a fresh nonce. */
export interface CommandSink {
  send(envelope: CommandEnvelope<MoveCommand>): void
}

/**
 * The numbers input needs. They come from tuning (`net.tickHz` today; the
 * stick knobs arrive with P0-034), never from literals in this folder.
 */
export interface InputKnobs {
  /** Sampling rate: the server tick rate, `content/tuning/net.ts`. */
  readonly tickHz: number
  /** Fraction of the stick radius that reads as zero, in [0, 1). */
  readonly deadZone: number
  /** CSS pixels of drag for a full-strength stick. */
  readonly stickRadiusPx: number
}

/** Storage for the nonce counter; `sessionStorage` in the browser. */
export type NonceStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface InputOptions {
  readonly knobs: InputKnobs
  /** Receives key events. Default: `window`. */
  readonly keyTarget?: EventTarget
  /** Receives the touch stick's pointer events. Default: `document.body`. */
  readonly stickTarget?: EventTarget
  /** Default: `window.sessionStorage`. */
  readonly storage?: NonceStorage
  /** Wall clock in ms, seeds the nonce floor. Default: `Date.now`. */
  readonly now?: () => number
}

export interface Input {
  /** Read the devices once and emit if the stick changed. The timer calls this. */
  sample(): void
  /** Remove every listener and stop the timer. */
  dispose(): void
}
