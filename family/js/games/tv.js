// The TV / table screen (#/games/tv/:id): no chrome, readable from the couch, 1280x720 and 1920x1080.
// Table lines in columns, giant Stack-top chips per seat, whose turn, the join code in the corner,
// and a full takeover when the MARKET opens ("Two! · Ana").
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { countWord, dotArt, marketBanner, ring, seatAvatar, seatName, serverClock, ticker } from './market.js';

// W5's wordmark: real text in three parts so it translates ("Dots & Lines" / "Puntos y Rayas").
export function wordmark(cls = '') {
  return h('span', { class: 'gm-wordmark ' + cls, 'aria-hidden': 'true' },
    h('span', { class: 'gm-wm-word', text: t('family.games.common.wm_1') }), ' ',
    h('span', { class: 'gm-wm-amp', text: t('family.games.common.wm_amp') }), ' ',
    h('span', { class: 'gm-wm-word', text: t('family.games.common.wm_2') }));
}

export function modeLabel(mode) {
  return { together: t('family.games.common.mode_together'), live: t('family.games.common.mode_live'), leisure: t('family.games.common.mode_leisure') }[mode] || '';
}

// A translated event line, or '' if the key isn't known yet.
export function eventText(ev) {
  if (!ev || !ev.key) return '';
  const s = t(ev.key, ev.vars || {});
  return s === ev.key ? '' : s;
}

export function turnText(view) {
  const turn = view.turn || {};
  if (view.result || turn.phase === 'over') return t('family.games.common.game_over');
  if (turn.phase === 'market') return t('family.games.tv.market_on');
  if (view.me && turn.seat === view.me.seat) return t('family.games.common.your_turn');
  return t('family.games.common.is_playing', { name: seatName(view, turn.seat) });
}

// The table: one row per line, laid out in columns.
// The table: one W5 chalk line per Raya (groups get the dotted chalk). Lines not in `seen` draw themselves in.
export function tableBoard(view, cls = '', seen = null) {
  const lines = view.table || [];
  const el = h('div', { class: 'gtable ' + cls, role: 'list', 'aria-label': t('family.games.tv.table') });
  if (!lines.length) el.append(h('p', { class: 'gtable-empty', text: t('family.games.tv.table_empty') }));
  for (const line of lines) {
    const fresh = seen && !seen.has(line.id);
    el.append(h('div', { class: 'gm-line gline' + (line.kind === 'group' ? ' gm-line--group' : '') + (line.full ? ' is-full' : '') + (fresh ? ' is-drawn' : ''), role: 'listitem' },
      h('div', { class: 'gm-line-dots' }, line.dots.map((d) => dotArt(d, 'm', fresh ? 'is-enter' : '')))));
  }
  if (seen) { seen.clear(); for (const line of lines) seen.add(line.id); }
  return el;
}

// One card per seat: avatar, name, the giant Stack-top chip and how many are left.
export function seatCard(view, st) {
  const turn = view.turn || {};
  const playing = turn.seat === st.seat && turn.phase !== 'over' && !view.result;
  const isMe = view.me && view.me.seat === st.seat;
  return h('div', { class: 'gseat' + (playing ? ' is-turn' : '') + (st.away ? ' is-away' : '') + (isMe ? ' is-me' : '') },
    h('div', { class: 'gseat-who' },
      seatAvatar(st, 'm'),
      h('span', { class: 'gseat-name', text: isMe ? t('family.games.common.you') : st.name }),
      st.bot ? h('span', { class: 'gtag gtag-bot', text: st.bot_level === 'easy' ? t('family.games.common.claude_easy') : t('family.games.common.claude_sharp') }) : null,
      st.covering_bot ? h('span', { class: 'gtag', text: t('family.games.common.covering') }) : null,
      st.catchup ? h('span', { class: 'gtag gtag-plus', title: t('family.games.common.catchup'), text: '+1' }) : null),
    h('div', { class: 'gseat-stack' },
      dotArt(st.stack_top, 'xl', 'gseat-top'),
      h('div', { class: 'gseat-left' },
        h('span', { class: 'gseat-left-n', text: String(st.stack_left) }),
        h('span', { class: 'gseat-left-l', text: t('family.games.common.stack_left') }))),
    playing ? h('span', { class: 'gseat-now', text: t('family.games.tv.now_playing') }) : null);
}

export function seatRail(view, cls = '') {
  const seats = view.seats || [];
  const two = seats.length > 4; // more than 4 seats: two columns, so every Stack top stays big
  const rows = Math.max(1, two ? Math.ceil(seats.length / 2) : seats.length);
  return h('div', { class: 'grail ' + cls + (two ? ' is-two' : ''), style: { '--n': String(rows) } }, seats.map((st) => seatCard(view, st)));
}

function codeTiles(code, cls = '') {
  return h('div', { class: 'gcode ' + cls, role: 'img', 'aria-label': t('family.games.common.code_aria', { code: (code || '').split('').join(' ') }) },
    (code || '????').split('').map((ch) => h('span', { class: 'gcode-ch', text: ch })));
}

function lobbyBoard(view, popped = new Set()) {
  const seats = view.seats || [];
  const fresh = (st) => { const k = st.seat + ':' + st.name; const f = !popped.has(k); popped.add(k); return f; };
  return h('div', { class: 'gtv-lobby' },
    h('p', { class: 'gtv-lobby-k', text: t('family.games.tv.join_how') }),
    codeTiles(view.room.code, 'gcode-tv'),
    h('div', { class: 'gtv-lobby-seats' }, seats.map((st) => h('span', { class: 'gtv-lobby-seat' + (fresh(st) ? ' is-new' : '') }, seatAvatar(st, 'l'), h('span', { text: st.name })))),
    h('p', { class: 'gtv-lobby-wait', text: t('family.games.tv.waiting_start') }));
}

// The Market takeover: built once per Market, then updated in place (so the banner slams only once).
function marketTakeover(first, sfx) {
  let view = first;
  let clock = serverClock(view);
  let seen = new Set();
  const timer = ring('gtv-ring', sfx);
  const offersEl = h('ul', { class: 'gtv-offers' });
  const doneEl = h('p', { class: 'gtv-done' });
  const el = h('div', { class: 'gtv-market', role: 'region', 'aria-label': t('family.games.market.title') },
    h('div', { class: 'gtv-market-left' },
      h('div', { class: 'gm-market is-open gtv-market-head' }, marketBanner()),
      timer.el,
      h('p', { class: 'gtv-market-how', text: t('family.games.tv.market_how') })),
    h('div', { class: 'gtv-market-right' },
      h('h3', { class: 'gtv-market-board', text: t('family.games.market.board') }),
      offersEl, doneEl));
  function draw() {
    const m = view.market;
    const offers = m.offers || [];
    offersEl.replaceChildren(...(offers.length ? offers.map((o) => h('li', { class: 'gtv-offer' + (seen.has(o.id) ? '' : ' is-new') },
      h('span', { class: 'gtv-offer-n', text: countWord(o.count) }),
      h('span', { class: 'gtv-offer-sep', 'aria-hidden': 'true', text: '·' }),
      h('span', { class: 'gtv-offer-who', text: seatName(view, o.seat) }))) : [h('li', { class: 'gtv-offer-none', text: t('family.games.market.no_offers') })]));
    seen = new Set(offers.map((o) => o.id));
    doneEl.textContent = m.done && m.done.length ? t('family.games.tv.done_list', { names: m.done.map((x) => seatName(view, x)).join(', ') }) : '';
  }
  draw();
  setTimeout(() => el.querySelectorAll('.gm-bell.is-ringing').forEach((b) => b.classList.remove('is-ringing')), 950);
  ticker(el, () => {
    const m = view.market;
    if (!m) return;
    timer.set((Date.parse(m.closes_at) - clock()) / 1000, (Date.parse(m.closes_at) - Date.parse(m.opened_at)) / 1000);
  });
  return { el, update(v) { view = v; clock = serverClock(v); draw(); } };
}

export function resultBoard(view) {
  const r = view.result;
  const seats = view.seats || [];
  const names = (r.winners || []).map((s) => seatName(view, s)).join(' & ');
  const rows = seats.map((st) => ({ st, pts: (r.points || [])[st.seat] || 0 })).sort((a, b) => b.pts - a.pts || a.st.stack_left - b.st.stack_left);
  const mine = view.me && (r.points || [])[view.me.seat];
  return h('div', { class: 'gm-win gresult' },
    h('div', { class: 'gm-burst', 'aria-hidden': 'true' }),
    h('p', { class: 'gm-win-kicker', text: r.reason === 'stalemate' ? t('family.games.common.stalemate') : t('family.games.common.round_over') }),
    h('h2', { class: 'gm-win-title', text: t('family.games.common.wins', { name: names }) }),
    h('div', { class: 'gm-win-dots', 'aria-hidden': 'true' }, dotArt({ c: 'r', n: 1 }), dotArt({ c: 'b', n: 1 }), dotArt({ s: true }), dotArt({ c: 'p', n: 1 })),
    mine ? h('p', { class: 'gm-win-points' }, h('b', { text: '+' + mine }), ' ', t('family.games.common.points_word')) : null,
    h('ol', { class: 'gresult-rows' }, rows.map(({ st, pts }) => h('li', { class: (r.winners || []).includes(st.seat) ? 'is-win' : '' },
      seatAvatar(st, 's'), h('span', { class: 'grow', text: st.name }),
      st.stack_left ? h('span', { class: 'gresult-left', text: st.stack_left === 1 ? t('family.games.common.left.one', { n: 1 }) : t('family.games.common.left.other', { n: st.stack_left }) }) : null,
      h('span', { class: 'gresult-pts', text: t('family.games.common.points', { n: pts }) })))));
}

// The biggest piece size at which every line fits the table area (6 pieces per line at most).
function fitTable(screen, n) {
  const box = screen.querySelector('.gtv-table');
  if (!box || !n) return;
  const W = box.clientWidth;
  const H = box.clientHeight;
  const vh = window.innerHeight / 100;
  const vw = window.innerWidth / 100;
  for (let d = 11 * vh; d >= 3 * vh; d -= 0.25 * vh) {
    const lw = 6.4 * d + 1.6 * vw + 8;
    const lh = d + 16 + 1.2 * vh;
    const cols = Math.max(1, Math.floor((W + vw) / (lw + vw)));
    if (Math.ceil(n / cols) * lh <= H) {
      screen.style.setProperty('--tvdot', d.toFixed(1) + 'px');
      screen.style.setProperty('--tvcol', lw.toFixed(1) + 'px');
      return;
    }
  }
  screen.style.setProperty('--tvdot', (3 * vh).toFixed(1) + 'px');
}

// Mount into root; returns {update(view)}.
export function tvScreen(root, ctx) {
  let view = ctx.getView();
  let marketWasOpen = !!(view.market && view.market.open && view.market.live);
  const head = h('header', { class: 'gtv-head' });
  const body = h('div', { class: 'gtv-body' });
  const foot = h('footer', { class: 'gtv-foot', 'aria-live': 'polite' });
  const layer = h('div', { class: 'gtv-layer' });
  const screen = h('div', { class: 'gtv gm-felt gm-tv' }, head, body, foot, layer);
  let seatsSeen = (view.seats || []).length;
  let resultShown = false;
  let takeover = null;
  const lobbyPopped = new Set();
  const linesSeen = new Set((view.table || []).map((l) => l.id));
  // Browsers keep sound off until someone touches the page; the TV says so once, in the corner.
  if (ctx.sfx && ctx.sfx.mode === 'on') {
    const btn = h('button', { class: 'gtv-sound', type: 'button' }, t('family.games.tv.tap_sound'));
    const off = () => { try { ctx.sfx.unlock(); } catch { /* ignore */ } btn.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', off, true); };
    btn.addEventListener('click', off);
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', off, true);
    screen.append(btn);
  }
  root.replaceChildren(screen);

  function render() {
    const room = view.room;
    const lobby = room.status === 'lobby';
    head.replaceChildren(
      h('div', { class: 'gtv-brand' },
        h('img', { class: 'gtv-logo', src: 'games-assets/logo-mark.svg', alt: '' }),
        h('span', null, wordmark('gtv-wm'), h('span', { class: 'sr-only', text: t('family.games.common.game_name') }), h('span', { class: 'gtv-mode', text: modeLabel(room.mode) }))),
      lobby ? h('span') : h('h1', { class: 'gtv-turn' + (view.turn && view.turn.phase === 'market' ? ' is-market' : ''), text: turnText(view) }),
      room.code ? h('div', { class: 'gtv-corner' },
        h('span', { class: 'gtv-corner-k', text: t('family.games.tv.join_code') }),
        codeTiles(room.code, 'gcode-s')) : h('span'));
    const nSeats = (view.seats || []).length;
    if (nSeats > seatsSeen && ctx.sfx) { try { ctx.sfx.play('join'); } catch { /* no sound */ } }
    seatsSeen = nSeats;
    if (lobby) {
      body.replaceChildren(lobbyBoard(view, lobbyPopped));
      foot.replaceChildren();
      layer.replaceChildren();
      takeover = null;
      return;
    }
    const lines = (view.table || []).length;
    body.classList.toggle('is-many', (view.seats || []).length > 4);
    body.replaceChildren(
      h('section', { class: 'gtv-table' }, tableBoard(view, 'gtable-tv', linesSeen)),
      h('aside', { class: 'gtv-seats' }, seatRail(view, 'grail-tv')));
    requestAnimationFrame(() => fitTable(screen, lines));
    const ev = (view.events || []).slice(-1)[0];
    foot.replaceChildren(
      h('span', { class: 'gtv-bag' }, h('span', { class: 'gtv-bag-n', text: String(view.bag_left ?? '') }), h('span', { text: t('family.games.common.bag_left') })),
      h('span', { class: 'gtv-ev', text: eventText(ev) }));

    const m = view.market;
    const open = !!(m && m.open && m.live);
    if (view.result) {
      takeover = null;
      if (!resultShown) {
        layer.replaceChildren(h('div', { class: 'gtv-over' }, resultBoard(view)));
        try { ctx.sfx && ctx.sfx.play('win'); } catch { /* no sound */ }
      }
      resultShown = true;
      marketWasOpen = false;
      return;
    }
    resultShown = false;
    if (open) {
      if (!takeover) {
        takeover = marketTakeover(view, ctx.sfx);
        layer.replaceChildren(takeover.el);
      } else takeover.update(view);
      if (!marketWasOpen) ctx.bell && ctx.bell(screen);
    } else {
      takeover = null;
      layer.replaceChildren();
    }
    marketWasOpen = open;
  }

  render();
  window.addEventListener('resize', function onResize() {
    if (!screen.isConnected) { window.removeEventListener('resize', onResize); return; }
    fitTable(screen, (view.table || []).length);
  });
  return { update(v) { view = v; render(); } };
}
