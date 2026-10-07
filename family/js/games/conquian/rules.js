// Conquián: the one-screen rules (EN/ES), behind the "?" in a Conquián room and before your first hand.
// Credit: John McLeod, pagat.com. Easter egg 1 (contracts/conquian.md §10): tap the King of Cups three times and it
// turns into the card that isn't in any Spanish deck, the Queen, with a line for the queen of this house.
import { h } from '../../dom.js';
import { t } from '../../i18n.js';
import { cardNode, probeArt } from './cards.js';
import { cardSound } from './sound.js';
import { setViewMode, viewMode } from './view.js';

const SEEN = 'eai.games.rules_seen.conquian';
const PAGAT = 'https://www.pagat.com/rummy/conquian.html';

export function cqRulesSeen() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}
function markSeen() { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ } }

const ex = (faces) => faces.map((f, i) => ({ id: -1 - i, s: f[0], r: Number(f.slice(1)) }));

// The King of Cups that becomes the Queen. Three taps (within a few seconds of each other).
export function kingCard({ sfx = null, onQueen = null } = {}) {
  let taps = 0;
  let last = 0;
  const snd = cardSound(sfx);
  const holder = h('span', { class: 'cq-egg-holder' });
  const king = cardNode({ s: 'c', r: 12 }, { size: 'm', tag: 'button', cls: 'cq-egg-king', attrs: { 'data-fk': 'egg-king' } });
  king.addEventListener('click', () => {
    const now = Date.now();
    taps = now - last < 2500 ? taps + 1 : 1;
    last = now;
    king.classList.remove('is-nudge'); void king.offsetWidth; king.classList.add('is-nudge');
    if (taps < 3) return;
    taps = 0;
    const queen = cardNode({ s: 'c', r: 12 }, { size: 'm', queen: true, cls: 'cq-egg-queen is-flip', label: t('family.games.cq.egg.queen') });
    holder.replaceChildren(queen);
    snd.play('flip');
    onQueen && onQueen();
  });
  holder.append(king);
  return holder;
}

export function rulesBody(opts = {}) {
  const note = h('div', { class: 'cq-egg-note', hidden: true, role: 'status', 'aria-live': 'polite' },
    h('p', { class: 'cq-egg-line' }, t('family.games.cq.egg.line')),
    h('p', { class: 'cq-egg-small' }, t('family.games.cq.egg.small')));
  const kings = h('div', { class: 'cq-rx-cards' },
    cardNode({ s: 'o', r: 12 }, { size: 'm' }),
    kingCard({ ...opts, onQueen: () => { note.hidden = false; note.classList.add('is-in'); } }),
    cardNode({ s: 'b', r: 12 }, { size: 'm' }));
  const run = h('div', { class: 'cq-rx-cards' }, ex(['e6', 'e7', 'e10', 'e11']).map((c) => cardNode(c, { size: 'm' })));
  return h('div', { class: 'cq-rules' },
    h('p', { class: 'cq-rules-goal', text: t('family.games.cq.rules.goal') }),
    h('div', { class: 'cq-rx-row' },
      h('figure', { class: 'cq-rx' }, run, h('figcaption', { text: t('family.games.cq.rules.ex_run') })),
      h('figure', { class: 'cq-rx' }, kings, h('figcaption', { text: t('family.games.cq.rules.ex_set') }))),
    note,
    h('ol', { class: 'cq-rules-steps' }, [
      t('family.games.cq.rules.step_1'),
      t('family.games.cq.rules.step_2'),
      t('family.games.cq.rules.step_3'),
      t('family.games.cq.rules.step_4'),
    ].map((s, i) => h('li', null, h('span', { class: 'grules-n', 'aria-hidden': 'true', text: String(i + 1) }), h('span', { text: s })))),
    h('p', { class: 'cq-rules-extra' }, h('b', { text: t('family.games.cq.btn.force') }), ' ', h('span', { text: t('family.games.cq.rules.force') })),
    h('p', { class: 'cq-rules-extra', text: t('family.games.cq.rules.last_one') }),
    h('p', { class: 'cq-rules-extra', text: t('family.games.cq.rules.draw') }),
    h('p', { class: 'cq-rules-extra', text: t('family.games.cq.rules.familia') }),
    h('p', { class: 'cq-rules-credit' }, h('span', { text: t('family.games.cq.rules.credit') }), ' ',
      h('a', { href: PAGAT, target: '_blank', rel: 'noopener noreferrer', text: t('family.games.cq.rules.credit_link') })));
}

// "How the table looks: Simple | Full" (per device). In the "?" sheet and at the foot of the play screen.
export function viewSwitch(cls = '') {
  const mode = viewMode();
  const btn = (m, label) => h('button', { class: 'cq-vs-btn' + (mode === m ? ' on' : ''), type: 'button', 'aria-pressed': String(mode === m), 'data-fk': 'view-' + m,
    onclick: (ev) => {
      setViewMode(m);
      const box = ev.currentTarget.closest('.cq-vs');
      if (box) box.querySelectorAll('.cq-vs-btn').forEach((b) => { const on = b.dataset.fk === 'view-' + m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    } }, label);
  return h('div', { class: 'cq-vs ' + cls, role: 'group', 'aria-label': t('family.games.cq.view.label') },
    h('span', { class: 'cq-vs-l', text: t('family.games.cq.view.label') }),
    h('span', { class: 'cq-vs-btns' }, btn('simple', t('family.games.cq.view.simple')), btn('full', t('family.games.cq.view.full'))));
}

export async function openCqRules(opts = {}) {
  await probeArt();
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'sheet grules-sheet cq-rules-sheet', 'aria-labelledby': 'cq-rules-title' });
    const done = () => { markSeen(); dlg.close(); dlg.remove(); resolve(); };
    dlg.append(
      h('div', { class: 'grules-top' },
        h('div', null,
          h('p', { class: 'eyebrow', text: t('family.games.cq.rules.eyebrow') }),
          h('h2', { id: 'cq-rules-title', class: 'grules-title', text: t('family.games.cq.name') })),
        h('button', { class: 'icon-btn grules-x', type: 'button', 'aria-label': t('family.games.common.close'), onclick: done }, '×')),
      viewSwitch('cq-vs-sheet'),
      rulesBody(opts),
      h('button', { class: 'btn btn-primary btn-big grules-ok', type: 'button', onclick: done }, t('family.games.cq.rules.got_it')));
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); done(); });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) done(); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.grules-ok').focus({ preventScroll: true });
  });
}

// Before your first Conquián hand (unless the Practice coach is already teaching it).
export function maybeFirstRules() {
  if (cqRulesSeen()) return;
  setTimeout(() => { if (!document.querySelector('dialog.grules-sheet')) openCqRules(); }, 400);
}
