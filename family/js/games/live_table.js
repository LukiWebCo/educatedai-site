import { h } from '../dom.js';
import { t } from '../i18n.js';

export function liveBanner(view, peek, toggle) {
  const name = (view.seats || []).find((seat) => seat.seat === view.draft.seat)?.name || '';
  return h('div', { class: 'glive-banner' },
    h('span', { role: 'status', text: t('family.games.live.moving', { name }) }),
    h('button', { type: 'button', 'aria-pressed': String(peek), onclick: toggle,
      text: peek ? t('family.games.live.now') : t('family.games.live.before') }));
}

export function draftMarks(view) {
  const base = new Map();
  for (const line of view.table || []) for (const dot of line.dots) base.set(dot.id, line.dots.map((d) => d.id).join(','));
  const added = new Set(), moved = new Set();
  for (const line of view.draft.lines) {
    const ids = line.dots.map((d) => d.id).join(',');
    for (const dot of line.dots) {
      if (!base.has(dot.id)) added.add(dot.id);
      else if (base.get(dot.id) !== ids) moved.add(dot.id);
    }
  }
  return { added, moved };
}

export function changeMarks(previous, view) {
  if (!previous) return null;
  const added = new Set(), moved = new Set();
  let changed = false;
  for (const seat of view.seats || []) {
    const last = seat.last;
    const old = (previous.seats || []).find((s) => s.seat === seat.seat)?.last;
    if (last?.change_seq && last.change_seq !== old?.change_seq) {
      changed = true;
      for (const dot of last.placed || []) added.add(dot.id);
      for (const id of last.moved || []) moved.add(id);
    }
  }
  return changed ? { added, moved } : null;
}
