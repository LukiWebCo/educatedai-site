// The MARKET: the full-screen sheet every seat sees at once (live), the leisure card, the bell moment.
// Also the shared art the W3a screens draw with: W5's pieces (games-assets/dots.svg + dots.json, contracts/
// games-art.md), the countdown ring, number words. Classes gm-* are W5's (games-theme.css); gmk-* are ours.
import { avatar, h } from '../dom.js';
import { t } from '../i18n.js';
import { errText, toast } from '../ui.js';

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const k of kids) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

// ---- W5's art, loaded once ------------------------------------------------------------------------------
// The sprite is parsed (DOMParser, never innerHTML) and each piece is a clone of its <symbol>'s children, so no
// external <use> reference is needed. Until it loads (or if it fails) pieces fall back to a plain suit shape.
let ART = null;
let artLoading = null;
const FALLBACK_NUM = { r: { x: 50, y: 62, size: 50, size_two_digits: 44 }, b: { x: 50, y: 63, size: 52, size_two_digits: 46 }, g: { x: 50, y: 77, size: 46, size_two_digits: 38 }, p: { x: 50, y: 63, size: 48, size_two_digits: 40 } };
export function loadArt() {
  if (ART) return Promise.resolve(ART);
  if (!artLoading) {
    artLoading = Promise.all([
      fetch('games-assets/dots.svg', { cache: 'force-cache' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
      fetch('games-assets/dots.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ]).then(([svg, json]) => {
      // Drop style attributes first: parsing one trips the page's CSP (style-src 'self') for nothing.
      const doc = new DOMParser().parseFromString(svg.replace(/\sstyle="[^"]*"/g, ''), 'image/svg+xml');
      const sym = {};
      doc.querySelectorAll('symbol[id]').forEach((el) => { sym[el.id] = el; });
      const num = {};
      for (const su of json.suits || []) num[su.key] = su.number;
      ART = { sym, num };
      return ART;
    }).catch(() => { artLoading = null; return null; });
  }
  return artLoading;
}

function symbolInto(svg, id) {
  const src = ART && ART.sym[id];
  if (!src) return false;
  for (const k of src.childNodes) svg.append(document.importNode(k, true));
  return true;
}

const FALLBACK_SHAPE = {
  r: () => s('circle', { cx: 50, cy: 47, r: 43 }),
  b: () => s('rect', { x: 9, y: 6, width: 82, height: 82, rx: 16 }),
  g: () => s('path', { d: 'M50 12L89 82H11Z', 'stroke-width': 13, 'stroke-linejoin': 'round' }),
  p: () => s('path', { d: 'M50 9L89 47L50 85L11 47Z', 'stroke-width': 12, 'stroke-linejoin': 'round' }),
  s: () => s('circle', { cx: 50, cy: 47, r: 43 }),
};

function tokenSvg(c, n) {
  const svg = s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  if (!symbolInto(svg, 'gm-token-' + c)) {
    const sh = FALLBACK_SHAPE[c] ? FALLBACK_SHAPE[c]() : FALLBACK_SHAPE.r();
    sh.setAttribute('class', 'gmk-fallback');
    svg.append(sh);
  }
  if (n != null) {
    const g = (ART && ART.num[c]) || FALLBACK_NUM[c] || FALLBACK_NUM.r;
    const two = String(n).length > 1;
    svg.append(s('text', { x: g.x, y: g.y, 'font-size': two ? g.size_two_digits : g.size, 'text-anchor': 'middle', 'font-weight': 800,
      'font-stretch': '75%', 'letter-spacing': two ? -1.5 : 0, fill: '#10201a', class: 'gmk-num' }, String(n)));
  }
  return svg;
}

export function suitName(c) {
  return { r: t('family.games.common.suit_r'), b: t('family.games.common.suit_b'), g: t('family.games.common.suit_g'), p: t('family.games.common.suit_p') }[c] || '';
}

export function dotLabel(d) {
  if (!d) return '';
  if (d.s) return d.as ? t('family.games.common.spark_as', { suit: suitName(d.as.c), n: d.as.n }) : t('family.games.common.spark');
  return t('family.games.common.dot_label', { suit: suitName(d.c), n: d.n });
}

// A piece: <span class="gm-dot gm-dot--r"> with its SVG. size: s | m | l | xl (sets --gm-dot); extra: state classes.
export function dotArt(d, size = 'm', extra = '') {
  const cls = 'gm-dot gmk-' + size + (extra ? ' ' + extra : '');
  if (!d) {
    return h('span', { class: cls + ' gmk-empty', role: 'img', 'aria-label': t('family.games.common.empty_stack') },
      s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' }, s('circle', { cx: 50, cy: 47, r: 40, class: 'gmk-hole' })));
  }
  const c = d.s ? 's' : d.c;
  const el = h('span', { class: cls + ' gm-dot--' + c + (d.s && d.as ? ' gm-dot--as' : ''), role: 'img', 'aria-label': dotLabel(d) }, tokenSvg(c, d.s ? null : d.n));
  if (d.s && d.as) el.append(h('span', { class: 'gm-as', 'aria-hidden': 'true' }, tokenSvg(d.as.c, d.as.n)));
  return el;
}

// ---- words ------------------------------------------------------------------------------------------
export function countWord(n) {
  return { 1: t('family.games.common.count_1'), 2: t('family.games.common.count_2'), 3: t('family.games.common.count_3') }[n] || String(n);
}

export function seatName(view, seat) {
  const me = view && view.me;
  if (me && me.seat === seat) return t('family.games.common.you');
  const st = view && (view.seats || []).find((x) => x.seat === seat);
  return st ? st.name : '?';
}

export function seatAvatar(st, size = 'm') {
  return avatar({ display_name: (st && st.name) || '?', claude: !!(st && st.bot) }, size);
}

// ---- countdown ring (W5's .gm-ring, driven by --gm-p) -------------------------------------------------
// Server-clock aware: skew = server_now - local now, measured when a view arrives.
export function serverClock(view) {
  const sn = view && Date.parse(view.server_now);
  const skew = Number.isFinite(sn) ? sn - Date.now() : 0;
  return () => Date.now() + skew;
}

export function ring(cls = '', sfx = null, big = true) {
  const num = h('span', { class: 'gm-ring-num' });
  const el = h('div', { class: 'gm-ring ' + (big ? 'gm-ring--big ' : '') + cls, role: 'timer', 'aria-live': 'off' }, num);
  let last = null;
  return {
    el,
    set(secondsLeft, total) {
      const left = Math.max(0, Math.ceil(secondsLeft));
      const frac = total > 0 ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
      el.style.setProperty('--gm-p', frac.toFixed(3));
      if (left !== last) {
        num.textContent = String(left);
        el.setAttribute('aria-label', t('family.games.market.seconds_left', { n: left }));
        el.classList.toggle('is-urgent', left <= 5);
        if (sfx && last !== null && left > 0 && left <= 5) { try { sfx.play('tick'); } catch { /* no sound */ } }
        last = left;
      }
    },
  };
}

// Run fn every 250 ms while el is in the page.
export function ticker(el, fn) {
  let id = 0;
  let seen = false;
  const t0 = Date.now();
  const run = () => {
    if (el.isConnected) seen = true;
    else if (seen || Date.now() - t0 > 15000) { clearInterval(id); return; }
    fn();
  };
  id = setInterval(run, 250);
  run();
  return () => clearInterval(id);
}

// ---- the bell -------------------------------------------------------------------------------------
export function bellIcon(cls = 'gm-bell') {
  const svg = s('svg', { viewBox: '0 0 100 100', class: cls, 'aria-hidden': 'true', focusable: 'false' });
  if (!symbolInto(svg, 'gm-bell')) {
    svg.append(s('path', { d: 'M22 70a28 28 0 0 1 56 0M14 72h72M18 80h64M50 42v-6', fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  }
  return svg;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The MARKET BELL: the bell sound, a full-screen tangerine flash, one screen shake, the banner slams in again and
// the bell swings. W5's classes; one-shot classes come off on timers (animationend never fires under reduce).
export function bellMoment(sfx, root) {
  try { sfx && sfx.play('bell'); } catch { /* no sound */ }
  const flash = h('div', { class: 'gm-flash is-on', 'aria-hidden': 'true' });
  document.body.append(flash);
  setTimeout(() => flash.remove(), 700);
  if (!root) return;
  const shake = root.querySelector('.gmk-panel, .gtv') || root;
  shake.classList.remove('gm-shake'); void shake.offsetWidth; shake.classList.add('gm-shake');
  setTimeout(() => shake.classList.remove('gm-shake'), 460);
  const market = root.querySelector('.gm-market');
  if (market) { market.classList.remove('is-open'); void market.offsetWidth; market.classList.add('is-open'); }
  root.querySelectorAll('.gm-market .gm-bell').forEach((b) => {
    b.classList.remove('is-ringing'); void b.getBoundingClientRect(); b.classList.add('is-ringing');
    setTimeout(() => b.classList.remove('is-ringing'), reduced() ? 0 : 950);
  });
}

// The banner: bell + MARKET! (W5's .gm-market-banner).
export function marketBanner(extra = null) {
  return h('div', { class: 'gm-market-banner' }, bellIcon('gm-bell is-ringing'), h('span', { class: 'gm-market-title', text: t('family.games.market.bell') }), extra);
}

function timeOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(document.documentElement.lang || undefined, { hour: 'numeric', minute: '2-digit' });
}

// ---- leisure card ---------------------------------------------------------------------------------
export function marketCard(view, onOpen) {
  const m = view.market;
  const n = m.offers.length;
  return h('div', { class: 'gmk-card', role: 'region', 'aria-label': t('family.games.market.title') },
    h('span', { class: 'gmk-card-bell' }, bellIcon('gm-bell')),
    h('div', { class: 'grow' },
      h('p', { class: 'gmk-card-title', text: t('family.games.market.leisure_title', { time: timeOf(m.closes_at) }) }),
      h('p', { class: 'gmk-card-sub', text: n === 1 ? t('family.games.market.offers.one') : t('family.games.market.offers.other', { n }) })),
    onOpen ? h('button', { class: 'btn btn-primary gmk-card-go', type: 'button', onclick: onOpen }, t('family.games.market.open_btn')) : null);
}

// ---- the sheet ------------------------------------------------------------------------------------
// ctx: {act(action), sfx, getView()}. opts: {leisure, onClose}. Returns {el, update(view), destroy()}.
export function marketSheet(ctx, opts = {}) {
  const leisure = !!opts.leisure;
  let view = ctx.getView();
  let picked = new Set();
  let sending = false;
  let seenFresh = new Set((view.me && view.me.fresh) || []);
  let seenOffers = new Set(((view.market && view.market.offers) || []).map((o) => o.id));
  let clock = serverClock(view);

  const sub = h('p', { class: 'gm-market-sub gmk-sub' });
  const timer = ring('gmk-ring', ctx.sfx, false); // in the banner, as on the style board: the hand gets the room
  const until = h('p', { class: 'gmk-until' });
  const board = h('ul', { class: 'gm-offers gmk-board', 'aria-live': 'polite' });
  const mineRow = h('div', { class: 'gmk-mine' });
  const handHead = h('h3', { class: 'gmk-h3' });
  const hand = h('div', { class: 'gmk-hand', role: 'group' });
  const trade = h('button', { class: 'btn btn-big gm-btn gm-btn--trade gmk-trade', type: 'button', onclick: onTrade });
  const done = h('button', { class: 'btn btn-big gm-btn gmk-done', type: 'button', onclick: onDone });
  const close = h('button', { class: 'btn btn-big gm-btn gmk-close', type: 'button', onclick: () => opts.onClose && opts.onClose() }, t('family.games.market.close'));
  const doneRow = h('div', { class: 'gmk-donerow' });
  const panel = h('div', { class: 'gmk-panel' },
    h('header', { class: 'gm-market is-open gmk-head', id: 'gmk-title' }, marketBanner(leisure ? null : timer.el), sub, leisure ? until : null),
    h('section', { class: 'gmk-sec' }, h('h3', { class: 'gmk-h3', text: t('family.games.market.board') }), board, mineRow, doneRow),
    h('section', { class: 'gmk-sec gmk-sec-hand' }, handHead, hand),
    h('div', { class: 'gmk-actions gm-tray' }, trade, leisure ? close : done));
  const el = h('div', { class: 'gmk-sheet gm-felt' + (leisure ? ' is-leisure' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gmk-title' }, panel);
  setTimeout(() => el.querySelectorAll('.gm-bell.is-ringing').forEach((b) => b.classList.remove('is-ringing')), 950);

  const stopTick = leisure ? () => {} : ticker(el, () => {
    const m = view.market;
    if (!m) return;
    const total = (Date.parse(m.closes_at) - Date.parse(m.opened_at)) / 1000;
    timer.set((Date.parse(m.closes_at) - clock()) / 1000, total);
  });

  async function send(action, okMsg) {
    if (sending) return;
    sending = true;
    render();
    try {
      await ctx.act(action);
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(errText(e), 'error');
    } finally {
      sending = false;
      render();
    }
  }

  function onTrade() {
    const ids = [...picked];
    if (!ids.length || ids.length > 3) return;
    picked = new Set();
    send({ type: 'offer', dots: ids }, leisure ? t('family.games.market.offered_leisure', { n: ids.length })
      : t('family.games.market.offered', { word: countWord(ids.length) }));
  }
  function onDone() { send({ type: 'market_done' }); }

  function render() {
    const m = view.market || { offers: [], done: [] };
    const me = view.me;
    const iAmDone = me && (m.done || []).includes(me.seat);
    sub.textContent = !me ? t('family.games.market.watching') : leisure ? t('family.games.market.how_leisure') : t('family.games.market.how');
    if (leisure) until.textContent = t('family.games.market.leisure_title', { time: timeOf(m.closes_at) });

    // offer board: "Ana · 2"
    const offers = m.offers || [];
    board.replaceChildren(...(offers.length ? offers.map((o) => {
      const mine = me && o.seat === me.seat;
      return h('li', { class: 'gm-offer gmk-offer' + (mine ? ' is-mine' : '') + (seenOffers.has(o.id) ? '' : ' is-new') },
        seatName(view, o.seat) + ' · ' + o.count);
    }) : [h('li', { class: 'gmk-offer-none', text: t('family.games.market.no_offers') })]));
    seenOffers = new Set(offers.map((o) => o.id));
    const myOffers = me ? offers.filter((o) => o.seat === me.seat) : [];
    mineRow.replaceChildren(...myOffers.map((o) => h('button', { class: 'btn btn-quiet gmk-withdraw', type: 'button', disabled: sending,
      onclick: () => send({ type: 'withdraw', offer_id: o.id }) }, t('family.games.market.withdraw_n', { n: o.count }))));

    doneRow.replaceChildren(...(m.done && m.done.length && !leisure ? [
      h('span', { class: 'gmk-done-label', text: t('family.games.market.done_label') }),
      ...m.done.map((seat) => h('span', { class: 'gmk-done-who' }, seatAvatar((view.seats || []).find((x) => x.seat === seat), 's'), h('span', { text: seatName(view, seat) })))] : []));

    // your hand
    handHead.hidden = !me;
    hand.hidden = !me;
    trade.hidden = !me;
    done.hidden = !me || leisure;
    if (me) {
      const locked = new Set(me.locked || []);
      const fresh = new Set(me.fresh || []);
      const ids = new Set(me.hand.map((d) => d.id));
      picked = new Set([...picked].filter((id) => ids.has(id) && !locked.has(id)));
      handHead.textContent = t('family.games.market.your_hand');
      hand.setAttribute('aria-label', t('family.games.market.your_hand'));
      if ([...fresh].some((id) => !seenFresh.has(id))) { try { ctx.sfx && ctx.sfx.play('trade'); } catch { /* no sound */ } }
      hand.replaceChildren(...me.hand.map((d) => {
        const isLocked = locked.has(d.id);
        const on = picked.has(d.id);
        const isFresh = fresh.has(d.id);
        const piece = dotArt(d, 'l', (on ? 'is-picked' : '') + (isLocked ? ' is-locked' : '') + (isFresh ? ' is-new' : ''));
        if (isFresh) piece.append(h('span', { class: 'gm-new', text: t('family.games.market.new') }));
        return h('button', {
          type: 'button',
          class: 'gmk-cell' + (on ? ' is-picked' : '') + (isLocked ? ' is-locked' : '') + (isFresh ? ' is-fresh' : ''),
          'aria-pressed': String(on), disabled: isLocked || iAmDone,
          onclick: () => {
            if (picked.has(d.id)) picked.delete(d.id);
            else if (picked.size < 3) picked.add(d.id);
            else { el.classList.remove('is-full'); void el.offsetWidth; el.classList.add('is-full'); toast(t('family.games.market.max3')); }
            render();
          },
        }, piece,
        isLocked ? h('span', { class: 'gmk-tag', text: t('family.games.market.in_market') }) : null);
      }));
      seenFresh = new Set([...seenFresh, ...fresh]);
      const n = picked.size;
      trade.disabled = !n || sending || iAmDone;
      trade.textContent = n ? t('family.games.market.trade_n', { n }) : t('family.games.market.pick');
      trade.classList.toggle('is-ready', n > 0);
      done.disabled = iAmDone || sending;
      done.textContent = iAmDone ? t('family.games.market.waiting') : t('family.games.market.done');
    }
  }

  render();
  return {
    el,
    update(v) { view = v; clock = serverClock(v); render(); },
    destroy() { stopTick(); el.remove(); },
  };
}
