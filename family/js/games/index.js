// Games sub-router: #/games (lobby), #/games/new, #/games/join[/CODE], #/games/r/:id (room), #/games/tv/:id (TV).
// main.js calls gamesView(parts) with the hash parts after "games" and puts the returned node in #view.
// The room and TV screens own a poller (net.js) that long-polls /wait, falls back to 3 s polling, refetches
// when the tab comes back, and stops itself once its root leaves the page.
import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { errorBox, state, toast } from '../ui.js';
import { createPoller, games } from './net.js';
import { joinView, lobbyView, newGameView, roomLobbyView } from './lobby.js';
import { bellMoment, loadArt, marketCard, marketSheet } from './market.js';
import { openRules, rulesButton, rulesSeen } from './rules_card.js';
import { resultBoard, seatRail, tableBoard, turnText, tvScreen } from './tv.js';

// ---- styles (CSP style-src 'self': same-origin <link>s only) ---------------------------------------
export function ensureCss() {
  for (const href of ['games-theme.css', 'games.css', 'games-play.css']) {
    if (!document.querySelector(`link[data-games-css="${href}"]`)) {
      document.head.append(h('link', { rel: 'stylesheet', href, 'data-games-css': href }));
    }
  }
}

// ---- sound (W5's sfx.js: phones quiet by default except "your turn", the TV on) ---------------------------
// One instance per screen kind, made lazily; a stub until sfx.js loads, and if it never does.
const sfxReal = { phone: null, tv: null };
let sfxMod = null;
function loadSfx() {
  if (!sfxMod) sfxMod = import('./sfx.js').catch(() => null);
  return sfxMod;
}
function sfxFor(screen) {
  const get = () => sfxReal[screen];
  loadSfx().then((m) => { if (m && !sfxReal[screen]) { try { sfxReal[screen] = m.createSfx({ screen }); } catch { /* no sound */ } } });
  return {
    play(name) { try { get() && get().play(name); } catch { /* never let sound break the game */ } },
    unlock() { try { get() && get().unlock(); } catch { /* ignore */ } },
    music(on) { try { get() && get().music(on); } catch { /* ignore */ } },
    get muted() { return get() ? get().muted : true; },
    get mode() { return get() ? get().mode : (screen === 'tv' ? 'on' : 'quiet'); },
    setMuted(m) { try { get() && get().setMuted(m); } catch { /* ignore */ } },
  };
}
export const sfx = sfxFor('phone');
const sfxTv = sfxFor('tv');

// ---- router ---------------------------------------------------------------------------------------
const ID = /^\d{1,12}$/;

export async function gamesView(parts = []) {
  ensureCss();
  loadSfx();
  await loadArt();
  const [a, b] = parts;
  if (a !== 'tv') document.body.classList.remove('games-tv');
  switch (a) {
    case undefined: return lobbyView();
    case 'new': return newGameView();
    case 'join': return joinView(b);
    case 'r': return ID.test(b || '') ? roomView(b) : errorBox({ key: 'family.errors.not_found' });
    case 'tv': return ID.test(b || '') ? tvView(b) : errorBox({ key: 'family.errors.not_found' });
    default: return errorBox({ key: 'family.errors.not_found' });
  }
}

// ---- the live room controller (shared by the phone room and the TV) ------------------------------------
function liveRoom(root, id, first, onStop) {
  let view = first;
  const listeners = new Set();
  const waiters = [];
  let seen = false;
  const t0 = Date.now();
  const alive = () => {
    if (root.isConnected) { seen = true; return true; }
    return !seen && Date.now() - t0 < 15000; // not mounted yet: main.js attaches the node after we return
  };

  function apply(v) {
    view = v;
    for (const cb of [...listeners]) { try { cb(v); } catch (e) { console.error(e); } }
    for (let i = waiters.length - 1; i >= 0; i--) if (v.v >= waiters[i].v) { waiters[i].res(); waiters.splice(i, 1); }
  }

  const poller = createPoller({
    wait: (v, signal) => games.wait(id, v, signal),
    view: (signal) => games.room(id, signal),
    onView: apply,
    alive,
    onStop: (out) => { cleanup(); onStop && onStop(out); },
  }, first.v);

  const onVis = () => { if (!document.hidden) poller.kick(); };
  const onHash = () => setTimeout(() => { if (!root.isConnected) { poller.stop(); cleanup(); } }, 0);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('hashchange', onHash);
  function cleanup() {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('hashchange', onHash);
  }
  poller.done.then(cleanup);

  return {
    getView: () => view,
    onView(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    refresh: () => poller.kick(),
    poller,
    // Post an action; resolves once the new view has arrived (or after 4 s).
    async act(action) {
      const r = await games.act(id, action);
      if (r && typeof r.v === 'number' && r.v > view.v) {
        const got = new Promise((res) => waiters.push({ v: r.v, res }));
        poller.kick();
        await Promise.race([got, new Promise((res) => setTimeout(res, 4000))]);
      }
      return r;
    },
  };
}

// ---- #/games/r/:id ----------------------------------------------------------------------------------
async function roomView(id) {
  const first = await games.room(id);
  const root = h('section', { class: 'groomv' });
  const bar = h('div', { class: 'groomv-bar' });
  const lane = h('div', { class: 'groomv-lane' });   // the leisure Market card
  const main = h('div', { class: 'groomv-main' });
  const banner = h('div', { class: 'groomv-banner', role: 'status', hidden: true });
  root.append(bar, banner, lane, main);

  const live = liveRoom(root, id, first, () => {
    banner.hidden = false;
    banner.textContent = t('family.games.common.lost');
  });
  const ctx = {
    roomId: Number(id),
    getView: live.getView,
    act: live.act,
    onView: live.onView,
    refresh: live.refresh,
    sfx,
    me: state.me,
    bell: (el) => bellMoment(sfx, el),
    hideBack: true,   // the room bar above already has "Games" and the "?"
    // Take your seat back from Claude (it covered you after missed turns).
    reclaim: async () => { await games.seats(id, { op: 'reclaim' }); live.refresh(); },
    // The Smart Hint (read-only): the best move the server sees for your own dots.
    hint: () => games.hint(id),
    // The leisure Market: play.js shows the strip with this button (the live Market opens by itself).
    openMarket: () => { const m = live.getView().market; if (m && m.open) openSheet(!m.live); },
  };

  let mode = null;        // 'lobby' | 'play'
  let playMounted = false; // play.js is up (it draws the leisure Market strip itself)
  let lobbyUi = null;
  let sheet = null;
  let sheetLeisure = false;
  let marketWasOpen = !!(first.market && first.market.open && first.market.live);

  function drawBar(view) {
    bar.replaceChildren(
      h('a', { class: 'back gback', href: '#/games', 'aria-label': t('family.games.common.games') }, icon('back'), h('span', { class: 'gback-l', text: t('family.games.common.games') })),
      view.room.code ? h('span', { class: 'groomv-code', 'aria-label': t('family.games.common.code_aria', { code: view.room.code.split('').join(' ') }) },
        h('span', { class: 'groomv-code-k', 'aria-hidden': 'true', text: t('family.games.common.code_short') }), h('span', { 'aria-hidden': 'true', text: view.room.code })) : h('span', { class: 'grow' }),
      h('a', { class: 'groomv-tv', href: '#/games/tv/' + view.room.id, 'aria-label': t('family.games.lobby.show_tv') }, tvIcon()),
      soundButton(),
      rulesButton('grules-btn-s'));
  }

  async function mountPlay() {
    let mod = null;
    try { mod = await import('./play.js'); } catch { mod = null; }
    if (mod && typeof mod.playView === 'function') {
      playMounted = true;
      try { await mod.playView(main, ctx); } catch (e) { console.error(e); playMounted = false; main.replaceChildren(errorBox(e)); }
    } else {
      placeholderPlay(main, ctx);
    }
  }

  function closeSheet() { if (sheet) { sheet.destroy(); sheet = null; document.body.classList.remove('games-sheet-open'); } }
  function openSheet(leisure) {
    if (sheet && sheetLeisure === leisure) return;
    closeSheet();
    sheetLeisure = leisure;
    sheet = marketSheet(ctx, { leisure, onClose: closeSheet });
    document.body.append(sheet.el);
    document.body.classList.add('games-sheet-open');
  }

  function render(view) {
    drawBar(view);
    const want = view.room.status === 'lobby' ? 'lobby' : 'play';
    if (want !== mode) {
      mode = want;
      root.classList.toggle('is-play', want === 'play');   // one slim bar above the play screen
      if (want === 'lobby') { lobbyUi = roomLobbyView(ctx); main.replaceChildren(lobbyUi.el); }
      else { lobbyUi = null; main.replaceChildren(); mountPlay(); }
    } else if (lobbyUi) lobbyUi.update();

    // The Market: live = the full sheet for everyone; leisure = a card that opens the sheet.
    const m = view.market;
    const liveOpen = !!(m && m.open && m.live);
    const leisureOpen = !!(m && m.open && !m.live);
    if (liveOpen) {
      openSheet(false);
      sheet.update(view);
      if (!marketWasOpen) ctx.bell(sheet.el);
    } else if (sheet && !sheetLeisure) {
      closeSheet();
    }
    if (leisureOpen && view.me) {
      // The play screen has its own Market strip + button; the card is for the read-only fallback.
      if (playMounted) lane.replaceChildren(); else lane.replaceChildren(marketCard(view, () => { openSheet(true); }));
      if (sheet && sheetLeisure) sheet.update(view);
    } else {
      lane.replaceChildren();
      if (sheet && sheetLeisure) closeSheet();
    }
    marketWasOpen = liveOpen;
  }

  live.onView(render);
  render(first);
  // Someone who came in by a code (never saw the lobby) gets the one-screen rules before their first game.
  if (!rulesSeen() && first.me) setTimeout(() => { if (root.isConnected && !document.querySelector('dialog.grules-sheet')) openRules(); }, 400);
  // the sheet lives on <body>; take it down when the room leaves the page
  live.poller.done.then(closeSheet);
  window.addEventListener('hashchange', function off() {
    setTimeout(() => { if (!root.isConnected) { closeSheet(); window.removeEventListener('hashchange', off); } }, 0);
  });
  return root;
}

// Sound on/off for this phone (quiet = only the "your turn" chime, the default).
function soundButton() {
  const label = () => (sfx.mode === 'on' ? t('family.games.common.sound_on') : t('family.games.common.sound_off'));
  const btn = h('button', { class: 'groomv-sound' + (sfx.mode === 'on' ? ' is-on' : ''), type: 'button', 'aria-pressed': String(sfx.mode === 'on'), 'aria-label': label(), title: label() }, speakerIcon());
  btn.addEventListener('click', () => {
    sfx.setMuted(sfx.mode === 'on');
    sfx.unlock();
    btn.classList.toggle('is-on', sfx.mode === 'on');
    btn.setAttribute('aria-pressed', String(sfx.mode === 'on'));
    btn.setAttribute('aria-label', label());
    btn.title = label();
    toast(label());
  });
  return btn;
}

function speakerIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', d.startsWith('M4') ? 'spk-body' : 'spk-wave');
    svg.append(p);
  }
  return svg;
}

function tvIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M3 5h18v12H3zM8 21h8M12 17v4');
  svg.append(p);
  return svg;
}

// Until the play screen (W3b's play.js) is in: a read-only table so the room still works.
function placeholderPlay(main, ctx) {
  const draw = (view) => {
    main.replaceChildren(h('div', { class: 'gph' },
      h('p', { class: 'gph-turn', text: turnText(view) }),
      view.result ? resultBoard(view) : null,
      seatRail(view, 'grail-phone'),
      tableBoard(view, 'gtable-phone'),
      h('p', { class: 'gph-note', text: t('family.games.common.play_soon') })));
  };
  draw(ctx.getView());
  ctx.onView(draw);
}

// ---- #/games/tv/:id ---------------------------------------------------------------------------------
async function tvView(id) {
  const first = await games.room(id);
  document.body.classList.add('games-tv');
  const root = h('section', { class: 'gtv-root' });
  const live = liveRoom(root, id, first, () => {
    root.append(h('p', { class: 'gtv-lost', role: 'status', text: t('family.games.common.lost') }));
  });
  const screen = tvScreen(root, { getView: live.getView, sfx: sfxTv, bell: (el) => bellMoment(sfxTv, el) });
  live.onView((v) => screen.update(v));
  // Leaving the TV restores the chrome (main.js also clears it on every route).
  live.poller.done.then(() => { if (!document.querySelector('.gtv-root')) document.body.classList.remove('games-tv'); });
  window.addEventListener('hashchange', function off() {
    setTimeout(() => { if (!root.isConnected) { if (!document.querySelector('.gtv-root')) document.body.classList.remove('games-tv'); window.removeEventListener('hashchange', off); } }, 0);
  });
  return root;
}
