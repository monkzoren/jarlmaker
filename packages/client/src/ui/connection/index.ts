/**
 * The quiet reconnect pip and the queue-dropped toast (CLAUDE.md 3.4 Client,
 * 3.6 rule 7). A dropout is the normal case on a commute, so the pip is small,
 * top-right, and says only "reconnecting"; the game keeps rendering under it.
 * The toast appears once, when the dropout outlived the command queue. Text
 * and CSS only: no icons, no emoji (3.5.9).
 */
import type { ConnState } from '../../net/status.ts'

/** Pure: whether the pip shows for this state. */
export function pipVisible(s: ConnState): boolean {
  return s.kind === 'dropped' || s.kind === 'reconnecting'
}

export const PIP_TEXT = 'reconnecting'

/** Pure: the toast for a dropped queue of `dropped` moves. */
export function dropToastText(dropped: number): string {
  return dropped === 1 ? 'Connection lost too long: 1 move was not sent' : `Connection lost too long: ${dropped} moves were not sent`
}

// How long the toast stays up. A UI timing, not a game rule.
const TOAST_MS = 4000

const STYLE = `
#conn-pip{position:fixed;right:8px;top:8px;z-index:2;display:none;align-items:center;gap:6px;
  font:11px/1 monospace;color:#d8dcd6;background:#0008;padding:4px 7px;border-radius:9px;pointer-events:none}
#conn-pip[data-on]{display:flex}
#conn-pip::before{content:'';width:6px;height:6px;border-radius:50%;background:#e07b39;animation:conn-pulse 1s ease-in-out infinite alternate}
#conn-toast{position:fixed;left:50%;bottom:24px;z-index:2;transform:translateX(-50%);display:none;
  font:12px/1.3 monospace;color:#d8dcd6;background:#000c;padding:6px 10px;border-radius:4px;pointer-events:none}
#conn-toast[data-on]{display:block}
@keyframes conn-pulse{from{opacity:.3}to{opacity:1}}
`

export interface ConnectionHud {
  /** Show or hide the pip for the current connection state. */
  update(s: ConnState): void
  /** The reconnect queue was dropped. */
  queueDropped(dropped: number): void
}

export function createConnectionHud(doc: Document = document): ConnectionHud {
  const style = doc.createElement('style')
  style.textContent = STYLE
  doc.head.appendChild(style)

  const pip = doc.createElement('div')
  pip.id = 'conn-pip'
  pip.textContent = PIP_TEXT
  pip.setAttribute('role', 'status')
  doc.body.appendChild(pip)

  const toast = doc.createElement('div')
  toast.id = 'conn-toast'
  toast.setAttribute('role', 'alert')
  doc.body.appendChild(toast)
  let hideToast: ReturnType<typeof setTimeout> | undefined

  return {
    update(s) {
      pip.toggleAttribute('data-on', pipVisible(s))
    },
    queueDropped(dropped) {
      toast.textContent = dropToastText(dropped)
      toast.setAttribute('data-on', '')
      clearTimeout(hideToast)
      hideToast = setTimeout(() => toast.removeAttribute('data-on'), TOAST_MS)
    },
  }
}
