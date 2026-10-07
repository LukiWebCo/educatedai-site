// Conquián cards on screen: W2's SVG art (games-assets/conquian/, contracts/conquian.md §11) when it's there,
// and a card drawn in CSS (rank + a small suit drawn here) when it isn't, so the game plays either way.
//
//   cardNode(card, {size:'s'|'m'|'l'|'xl', tag:'button'|'span', back, reina, cls, label, onclick, attrs})
//   cardName(card) -> "7 of Cups" / "7 de Copas"        suitName(s)        faceName('c7')
//   probeArt() -> Promise<bool>   (fetches cards.json once; until it says yes we draw cards ourselves)
import { h } from '../../dom.js';
import { t } from '../../i18n.js';
import { face } from './melds.js';

export const ART = 'games-assets/conquian/';
let art = false;
let probe = null;

export function probeArt() {
  if (!probe) {
    probe = fetch(ART + 'cards.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { art = !!(j && Array.isArray(j.files)); return art; })
      .catch(() => false);
  }
  return probe;
}
export function hasArt() { return art; }
export function artUrl(name) { return ART + name; }

export function suitName(s) {
  switch (s) {
    case 'o': return t('family.games.cq.suit.o');
    case 'c': return t('family.games.cq.suit.c');
    case 'e': return t('family.games.cq.suit.e');
    default: return t('family.games.cq.suit.b');
  }
}

export function rankName(r) {
  switch (Number(r)) {
    case 1: return t('family.games.cq.rank.r1');
    case 10: return t('family.games.cq.rank.r10');
    case 11: return t('family.games.cq.rank.r11');
    case 12: return t('family.games.cq.rank.r12');
    default: return String(r);
  }
}

export function cardName(c) {
  if (!c) return '';
  const f = face(c);
  return t('family.games.cq.card', { rank: rankName(f.r), suit: suitName(f.s) });
}
export const faceName = (str) => cardName(face(str));

// Small suit marks for the drawn card (simple shapes, ours): a coin, a cup, a sword, a club.
const NS = 'http://www.w3.org/2000/svg';
const SUIT_PATHS = {
  o: ['M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 1 0 0-19z', 'M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10z'],
  c: ['M5 3h14c0 5-2.5 8.5-6 9.3V17h3.5v3h-9v-3H11v-4.7C7.5 11.5 5 8 5 3z'],
  e: ['M12 1.5l2 3v11h-4v-11z', 'M6.5 15.5h11v2.2h-11z', 'M10.9 17.7h2.2v3.3h-2.2z'],
  b: ['M9 2.5c3-1 6.5.5 6.5 4 0 1.6-.6 2.6-.6 4.2l1.6 9.8c-1.6 1-6.4 1-8 0l1.6-9.8C9.6 9 8 8 8 6 8 4.4 8 3 9 2.5z'],
};
export function suitIcon(s, cls = 'cq-suit') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls + ' cq-suit-' + s);
  svg.setAttribute('aria-hidden', 'true');
  (SUIT_PATHS[s] || SUIT_PATHS.o).forEach((d, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (s === 'o' && i === 1) p.setAttribute('class', 'cq-suit-in');
    svg.append(p);
  });
  return svg;
}

function crownIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'cq-crown-mark');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5z');
  svg.append(p);
  return svg;
}

// The drawn card (always present under the art; it shows when the art is missing or fails to load).
function drawnFace(f) {
  const r = String(f.r);
  return h('span', { class: 'cq-fb', 'aria-hidden': 'true' },
    h('span', { class: 'cq-fb-i' }, h('b', null, r), suitIcon(f.s, 'cq-suit cq-suit-sm')),
    suitIcon(f.s, 'cq-suit cq-suit-big'),
    f.r >= 10 ? h('span', { class: 'cq-fb-court' }, rankName(f.r)) : null,
    h('span', { class: 'cq-fb-i cq-fb-i2' }, h('b', null, r), suitIcon(f.s, 'cq-suit cq-suit-sm')));
}

function img(src, onfail) {
  const el = h('img', { class: 'cq-art', src, alt: '', draggable: 'false', decoding: 'async' });
  el.addEventListener('error', () => { el.remove(); onfail && onfail(); });
  return el;
}

export function cardNode(card, o = {}) {
  const size = o.size || 'm';
  const cls = ['cq-card', 'cq-' + size];
  let kids;
  let label = o.label;
  if (o.back || !card) {
    cls.push('cq-back');
    if (o.reina) cls.push('cq-back-reina');
    kids = [h('span', { class: 'cq-fb cq-fb-back', 'aria-hidden': 'true' }, o.reina ? crownIcon() : null),
      hasArt() ? img(artUrl(o.reina ? 'back-reina.svg' : 'back.svg')) : null];
    if (label === undefined) label = '';
  } else if (o.queen) {
    cls.push('cq-queen');
    kids = [h('span', { class: 'cq-fb cq-fb-queen', 'aria-hidden': 'true' }, crownIcon(), h('span', { class: 'cq-fb-heart' })),
      hasArt() ? img(artUrl('reina.svg')) : null];
  } else {
    const f = face(card);
    cls.push('cq-s-' + f.s);
    if (f.r >= 10) cls.push('cq-court');
    kids = [drawnFace(f), hasArt() ? img(artUrl(`cards/${f.s}${f.r}.svg`)) : null];
    if (label === undefined) label = cardName(card);
  }
  if (o.cls) cls.push(o.cls);
  const attrs = { class: cls.join(' '), ...(o.attrs || {}) };
  if (card && card.id !== undefined) attrs['data-id'] = card.id;
  if (card && !o.back) attrs['data-face'] = face(card).s + face(card).r;
  if (o.tag === 'button') {
    attrs.type = 'button';
    if (label) attrs['aria-label'] = label;
    if (o.onclick) attrs.onclick = o.onclick;
    return h('button', attrs, kids);
  }
  if (label) { attrs.role = 'img'; attrs['aria-label'] = label; } else attrs['aria-hidden'] = 'true';
  return h('span', attrs, kids);
}

// A small pile of backs with a count (stock, someone's hand).
export function backPile(n, { reina = false, size = 's', label = '', cls = '' } = {}) {
  return h('span', { class: 'cq-pile cq-pile-' + size + ' ' + cls, role: label ? 'img' : null, 'aria-label': label || null },
    h('span', { class: 'cq-pile-stack', 'aria-hidden': 'true' },
      n > 2 ? cardNode(null, { back: true, reina, size, cls: 'cq-pile-c3' }) : null,
      n > 1 ? cardNode(null, { back: true, reina, size, cls: 'cq-pile-c2' }) : null,
      n > 0 ? cardNode(null, { back: true, reina, size, cls: 'cq-pile-c1' }) : h('span', { class: 'cq-card cq-' + size + ' cq-empty' })),
    h('b', { class: 'cq-pile-n', 'aria-hidden': 'true' }, String(n)));
}

// A meld, cards overlapping (small for other players, medium for yours).
export function meldNode(cards, { size = 's', cls = '', label = '', fresh = null } = {}) {
  return h('span', { class: 'cq-meld cq-meld-' + size + ' ' + cls, role: 'img', 'aria-label': label || cards.map(cardName).join(', ') },
    cards.map((c, i) => {
      const n = cardNode(c, { size, label: '', cls: fresh && fresh.has(c.id) ? 'is-enter' : '' });
      n.style.setProperty('--i', String(i));
      return n;
    }));
}

export function logo(cls = '') {
  // W2's wordmark when it's there; our own type otherwise (real text, so it reads in both languages).
  const word = h('span', { class: 'cq-wordmark ' + cls },
    h('span', { class: 'cq-wm-main', text: t('family.games.cq.name') }),
    h('span', { class: 'cq-wm-sub', text: t('family.games.cq.name_sub') }));
  if (!hasArt()) return word;
  const im = h('img', { class: 'cq-logo ' + cls, src: artUrl('logo.svg'), alt: t('family.games.cq.name') });
  im.addEventListener('error', () => im.replaceWith(word));
  return im;
}
