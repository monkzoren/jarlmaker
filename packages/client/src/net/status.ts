/** Connection state as the debug line shows it; the reconnect pip reads it too (ui/connection). */

export type ConnState =
  | { readonly kind: 'connecting'; readonly uri: string }
  | { readonly kind: 'connected'; readonly identity: string }
  | { readonly kind: 'joined'; readonly identity: string; readonly entities: number }
  | { readonly kind: 'dropped'; readonly queued: number; readonly attempt: number; readonly reason?: string | undefined }
  | { readonly kind: 'reconnecting'; readonly queued: number; readonly attempt: number }
  | { readonly kind: 'disconnected'; readonly reason?: string | undefined }
  | { readonly kind: 'error'; readonly reason: string }

/** Pure: one line of HUD text. */
export function statusText(s: ConnState): string {
  switch (s.kind) {
    case 'connecting':
      return `connecting to ${s.uri}`
    case 'connected':
      return `connected as ${short(s.identity)}`
    case 'joined':
      return `online as ${short(s.identity)} | ${s.entities} in view`
    case 'dropped':
      return `dropped${s.reason === undefined ? '' : `: ${s.reason}`} | ${s.queued} queued`
    case 'reconnecting':
      return `reconnecting (attempt ${s.attempt}) | ${s.queued} queued`
    case 'disconnected':
      return s.reason === undefined ? 'disconnected' : `disconnected: ${s.reason}`
    case 'error':
      return `error: ${s.reason}`
  }
}

function short(identity: string): string {
  return identity.slice(0, 8)
}
