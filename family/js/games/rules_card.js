// The one-screen rules (contracts/games.md §1), behind every "?" and before the first game.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { inline } from '../md.js';
import { bellIcon, dotArt } from './market.js';

const SEEN = 'eai.games.rules_seen';

export function rulesSeen() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
}

function example(dots, caption) {
  return h('figure', { class: 'gx' },
    h('div', { class: 'gx-line' }, dots.map((d) => dotArt(d, 's'))),
    h('figcaption', { text: caption }));
}

// The rules as a block (also used inline by the TV lobby).
export function rulesBody() {
  const steps = [
    t('family.games.rules.step_1'),
    t('family.games.rules.step_2'),
    t('family.games.rules.step_3'),
    t('family.games.rules.step_4'),
    t('family.games.rules.step_5'),
  ];
  return h('div', { class: 'grules' },
    h('p', { class: 'grules-goal' }, inline(t('family.games.rules.goal'))),
    h('p', { class: 'grules-turn', text: t('family.games.rules.on_your_turn') }),
    h('ol', { class: 'grules-steps' }, steps.map((s, i) => h('li', null,
      h('span', { class: 'grules-n', 'aria-hidden': 'true', text: String(i + 1) }),
      h('span', null, inline(s)),
      i === 1 ? h('div', { class: 'gx-row' },
        example([{ c: 'b', n: 4 }, { c: 'b', n: 5 }, { c: 'b', n: 6 }], t('family.games.rules.ex_run')),
        example([{ c: 'r', n: 8 }, { c: 'b', n: 8 }, { c: 'g', n: 8 }], t('family.games.rules.ex_group'))) : null))),
    h('div', { class: 'grules-extra' },
      h('p', { class: 'grules-spark' }, dotArt({ s: true }, 's'), h('span', null, inline(t('family.games.rules.spark')))),
      h('p', { class: 'grules-market' }, h('span', { class: 'grules-bell' }, bellIcon()), h('span', null, inline(t('family.games.rules.market')))),
      h('p', { class: 'grules-stuck' }, inline(t('family.games.rules.stuck')))));
}

// Opens the rules sheet. Resolves when closed.
export function openRules() {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'sheet grules-sheet', 'aria-labelledby': 'grules-title' });
    const done = () => { markSeen(); dlg.close(); dlg.remove(); resolve(); };
    dlg.append(
      h('div', { class: 'grules-top' },
        h('div', null,
          h('p', { class: 'eyebrow', text: t('family.games.rules.eyebrow') }),
          h('h2', { id: 'grules-title', class: 'grules-title', text: t('family.games.common.game_name') })),
        h('button', { class: 'icon-btn grules-x', type: 'button', 'aria-label': t('family.games.common.close'), onclick: done }, '×')),
      rulesBody(),
      h('button', { class: 'btn btn-primary btn-big grules-ok', type: 'button', onclick: done }, t('family.games.rules.got_it')));
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); done(); });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) done(); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.grules-ok').focus({ preventScroll: true });
  });
}

// The round "?" button that opens the rules.
export function rulesButton(cls = '') {
  return h('button', { class: 'grules-btn ' + cls, type: 'button', onclick: () => openRules() },
    h('span', { class: 'grules-q', 'aria-hidden': 'true' }, '?'), h('span', { class: 'grules-l', text: t('family.games.rules.open') }));
}
