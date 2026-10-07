// Conquián moments: the "¡Te obligo!" rubber stamp, the going-out celebration, and the Queen's crown and rose
// petals (contracts/conquian.md §10, egg 2). W2's art when it's there (stamp-obligo.svg, crown.svg, petal.svg),
// CSS shapes when it isn't. Under prefers-reduced-motion everything still shows, it just doesn't fly.
import { h } from '../../dom.js';
import { t } from '../../i18n.js';
import { artUrl, hasArt, suitIcon } from './cards.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

function artOr(name, cls, fallback) {
  if (!hasArt()) return fallback();
  const im = h('img', { class: cls, src: artUrl(name), alt: '', draggable: 'false' });
  im.addEventListener('error', () => im.replaceWith(fallback()));
  return im;
}

// Slam the stamp onto a card (or any box). Resolves when it has landed; `stay` leaves it there.
export async function stamp(el, { sound, stay = false } = {}) {
  if (!el || !el.isConnected) return;
  const mark = h('span', { class: 'cq-stamp' + (hasArt() ? ' has-art' : ''), 'aria-hidden': 'true' },
    artOr('stamp-obligo.svg', 'cq-stamp-img', () => h('span', { class: 'cq-stamp-fb' }, t('family.games.cq.btn.force'))));
  el.classList.add('cq-stamped');
  el.append(mark);
  await sleep(180);
  try { sound && sound(); } catch { /* fine */ }
  try { if (navigator.vibrate) navigator.vibrate([40]); } catch { /* fine */ }
  await sleep(420);
  if (!stay) { mark.classList.add('is-gone'); await sleep(250); mark.remove(); el.classList.remove('cq-stamped'); }
}

function crownFallback() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 48');
  svg.setAttribute('class', 'cq-crown-fb');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M4 14l14 12L32 4l14 22 14-12-6 30H10z');
  svg.append(p);
  for (const [cx, cy] of [[4, 14], [32, 4], [60, 14]]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '4');
    svg.append(c);
  }
  return svg;
}

function petal(i, still) {
  const el = artOr('petal.svg', 'cq-petal-img', () => h('span', { class: 'cq-petal-fb' }));
  const wrap = h('span', { class: 'cq-petal' + (still ? ' is-still' : '') }, el);
  const r = (n) => ((Math.sin((i + 1) * 9301 + n * 49297) + 1) / 2);   // steady "random": same petals every time
  wrap.style.setProperty('--x', (r(1) * 100).toFixed(1) + 'vw');
  wrap.style.setProperty('--y', (r(5) * 70 + 10).toFixed(1) + '%');
  wrap.style.setProperty('--d', (3.2 + r(2) * 3).toFixed(2) + 's');
  wrap.style.setProperty('--delay', (r(3) * 2.4).toFixed(2) + 's');
  wrap.style.setProperty('--sway', ((r(4) - 0.5) * 120).toFixed(0) + 'px');
  wrap.style.setProperty('--spin', ((r(6) - 0.5) * 720).toFixed(0) + 'deg');
  wrap.style.setProperty('--s', (0.7 + r(7) * 0.6).toFixed(2));
  return wrap;
}

// The Queen's crown and a few resting petals: part of her win card on every render.
export function crownNode() {
  return h('span', { class: 'cq-crown' }, artOr('crown.svg', 'cq-crown-img', crownFallback));
}
export function restingPetals() {
  return h('span', { class: 'cq-petals-still', 'aria-hidden': 'true' }, Array.from({ length: 8 }, (_, i) => petal(i, true)));
}

// Someone went out: the win card pops. For the Queen the crown drops onto her card and rose petals fall over
// everything (once, when it happens).
export function celebrate(card, { queen = false } = {}) {
  if (!card) return;
  card.classList.add('is-pop');
  if (!queen || reduced()) return;
  const crown = card.querySelector('.cq-crown');
  if (crown) crown.classList.add('is-drop');
  const rain = h('div', { class: 'cq-petals', 'aria-hidden': 'true' }, Array.from({ length: 30 }, (_, i) => petal(i, false)));
  document.body.append(rain);
  setTimeout(() => rain.remove(), 9000);
}

// Behind a win card: a fan of little cards in the four suit colours bursting out from the middle (Conquián's own,
// not the Dots chalk burst). Still and faint under reduced motion; the burst lives in games-conquian.css.
export function cardBurst() {
  const suits = ['o', 'c', 'e', 'b'];
  const n = 16;
  return h('span', { class: 'cq-burst', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => {
    const r = (k) => ((Math.sin((i + 1) * 7919 + k * 104729) + 1) / 2);   // steady "random"
    const s = suits[i % 4];
    const el = h('span', { class: 'cq-bcard cq-bcard-' + s }, suitIcon(s, 'cq-suit cq-bsuit'));
    el.style.setProperty('--a', (i * 360 / n + (r(1) - 0.5) * 14).toFixed(1) + 'deg');
    el.style.setProperty('--r', (0.36 + r(2) * 0.14).toFixed(3));
    el.style.setProperty('--t', ((r(3) - 0.5) * 70).toFixed(0) + 'deg');
    el.style.setProperty('--i', String(i));
    return el;
  }));
}
