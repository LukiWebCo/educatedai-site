// Conquián: who has to do what, read from a view (contracts/conquian.md §6). Shared by the play screen, the
// coach and the TV.
export const phaseOf = (v) => (v && v.turn ? v.turn.phase : null);
export function deciding(v) {
  return !!(v && v.me && v.center && v.center.card && phaseOf(v) === 'offer' && v.center.to === v.me.seat);
}
export function discarding(v) { return !!(v && v.me && phaseOf(v) === 'discard' && v.turn.seat === v.me.seat); }
export function cambioPick(v) { return !!(v && v.me && phaseOf(v) === 'cambio' && !v.me.cambio_done); }
export function myMove(v) { return deciding(v) || discarding(v) || cambioPick(v); }

// Simple or Full table, per device (Simple unless chosen). The play screen listens for the change.
const VIEW_KEY = 'eai.games.cq.view';
export function viewMode() {
  try { return localStorage.getItem(VIEW_KEY) === 'full' ? 'full' : 'simple'; } catch { return 'simple'; }
}
export function setViewMode(m) {
  const mode = m === 'full' ? 'full' : 'simple';
  try { localStorage.setItem(VIEW_KEY, mode); } catch { /* this visit only */ }
  window.dispatchEvent(new CustomEvent('eai-cq-view', { detail: mode }));
}
