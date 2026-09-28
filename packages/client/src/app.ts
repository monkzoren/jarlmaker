/**
 * Client wiring point (ADR 0001: the client renders, it computes no rules).
 * Net (P0-013) and input (P0-014) plug in here; for now one placeholder
 * entity stands at the world origin.
 */
import { createRenderer } from './render/index.ts'

const host = document.getElementById('game')
if (!host) throw new Error('#game host element missing')

const renderer = await createRenderer(host)
renderer.setEntities({ entities: [{ id: 'local', x: 0, y: 0 }] })
