/** Connection state as the HUD shows it. The reconnect pip is P0-015. */

export type ConnState =
  | { readonly kind: 'connecting'; readonly uri: string }
  | { readonly kind: 'connected'; readonly identity: string }
  | { readonly kind: 'joined'; readonly identity: string; readonly entities: number }
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
    case 'disconnected':
      return s.reason === undefined ? 'disconnected' : `disconnected: ${s.reason}`
    case 'error':
      return `error: ${s.reason}`
  }
}

function short(identity: string): string {
  return identity.slice(0, 8)
}
