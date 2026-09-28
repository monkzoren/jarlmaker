// Smoke scenario `offline-tap-early` (P0-046, ADR 0008): as `offline-tap`, but
// the key goes down 200 ms after the socket is cut. The client needs
// `tuning.net.reconnectSilenceMs` of silence to declare a drop, so this tap
// lands before it has. Movement must still freeze after
// `tuning.net.offlineMoveGraceMs` of server silence, which bounds both the
// offline walk and the snap-back on reconnect.

import { offlineTap } from './offline-tap.ts'

export default offlineTap({ name: 'offline-tap-early', pressAfterMs: 200, maxDriftCells: 0.6 })
