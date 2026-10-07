// Conquián: the phone play screen (#/games/r/:id when room.game is "conquian"). contracts/conquian.md §4–§10.
//
//   import { playView } from './conquian/play.js';
//   const stop = await playView(root, ctx);   // the same ctx index.js gives the Dots screen (getView, act, onView,
//                                             // refresh, sfx, reclaim, roomId, hideBack)
//
// Made for a grandmother on a phone (owner, 2026-10-07: "everything was very crowded, real hard to use"):
// - ONE voice: at every moment one big plain sentence says what to do (or what's happening), and there are at most
//   two big buttons under your hand. Errors, the Practice lessons and the "good idea" suggestions all speak there.
// - ¡Me sirve! does the work: when the card in the middle fits, the hand cards that go with it glow, and one tap
//   lays down the best take (search.js, the server's own search ported). Arranging it by hand is a small link.
// - Throwing is two taps: tap a card (it lifts), tap "Throw this one". Sharp Claude's pick glows softly (hints on).
// - Simple view (default, per device; the switch is in the "?" sheet): no news line, no counters, no pile labels,
//   no rule captions, no sort button; the other players are one line each (tap to see what they laid down).
//   Full view adds all of that back.
// - Your hand is one row of big cards, sorted by suit; hold a card to see it full size. "Your turn!" pops up
//   (with the phone's sound setting and a buzz) when it becomes your move. On a tablet (768 px+) it's a big table.
// Full rebuild on every change (cheap), with one-render animation flags so nothing replays. Motion lives in
// games-conquian.css under prefers-reduced-motion: no-preference.
import { h, clear } from '../../dom.js';
import { currentLang, t } from '../../i18n.js';
import { backPile, cardName, cardNode, hasArt, meldNode, probeArt } from './cards.js';
import { classify, fits, sortHand, sortMeld } from './melds.js';
import { bestTake, loosest, takeKind, validTake } from './search.js';
import { Take } from './stage.js';
import { cambioPick, deciding, discarding, myMove, phaseOf, viewMode } from './view.js';
import { cardSound } from './sound.js';
import { errMsg, evText, newsLine, takeWhy, whyText } from './text.js';
import { cardBurst, celebrate, crownNode, restingPetals, stamp } from './fx.js';
import { CqCoach } from './coach.js';
import { maybeFirstRules } from './rules.js';

const SORT_KEY = 'eai.games.cq.sort';
const HOLD_MS = 450;          // tap-and-hold a card to see it big
const POP_MS = 1600;          // the "Your turn!" banner

export async function playView(root, ctx) {
  await probeArt();
  const screen = new CqScreen(root, ctx);
  await screen.start();
  return () => screen.destroy();
}

function cid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return 'q' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function clock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const loc = currentLang() === 'es' ? 'es-MX' : 'en-US';
  // leisure deadlines are often a day or two away: say which day
  if (d.getTime() - Date.now() > 18 * 3600 * 1000) return d.toLocaleString(loc, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
}

// ---- reading the view ------------------------------------------------------------------------------------------
function seatOf(v, s) { return (v.seats || []).find((x) => x.seat === s) || null; }
function nameOf(v, s) {
  if (v.me && v.me.seat === s) return t('family.games.cq.you');
  const st = seatOf(v, s);
  return st ? st.name : '?';
}
const leftOf = (v, s) => (s + 1) % Math.max(1, (v.seats || []).length);
const rightOf = (v, s) => (s - 1 + (v.seats || []).length) % Math.max(1, (v.seats || []).length);
const hintsOn = (v) => !!(v && v.room && v.room.settings && v.room.settings.hints !== false);
const forcingOn = (v) => !!(v && v.room && v.room.settings && v.room.settings.forcing !== false);
// whose move it is right now (null in the Cambio / between hands)
function moverOf(v) {
  const ph = phaseOf(v);
  if (ph === 'offer' && v.center) return v.center.to;
  if (ph === 'discard' && v.turn) return v.turn.seat;
  return null;
}

class CqScreen {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.view = null;
    this.mode = viewMode();    // 'simple' | 'full'
    this.take = null;          // the take being arranged by hand (stage.js), only while you're deciding
    this.building = false;     // "I'll arrange it myself" is open
    this.best = null;          // the layout ¡Me sirve! lays down (search.js), while you're deciding
    this.kind = null;          // out | fits | new_meld | rearrange
    this.suggest = null;       // the card Sharp Claude would throw / pass (a soft glow)
    this.pick = null;          // the hand card chosen to throw / give in the Cambio
    this.busy = false;
    this.msg = null;
    this.msgTimer = null;
    this.fx = {};
    this.sortBy = 'suit';
    try { if (localStorage.getItem(SORT_KEY) === 'rank') this.sortBy = 'rank'; } catch { /* default */ }
    this.history = false;
    this.open = new Set();     // the other players whose table is unfolded (Simple view)
    this.hideResultV = null;
    this.popAt = 0;
    this.zoom = null;
    this.alive = true;
    this.title0 = document.title;
    this.snd = cardSound(ctx.sfx);
    this.coach = null;
    this.queue = Promise.resolve();
  }

  sfx(name) { try { this.ctx.sfx && this.ctx.sfx.play(name); } catch { /* optional */ } }
  get simple() { return this.mode !== 'full'; }

  async start() {
    document.body.classList.add('games-play', 'games-cq');
    this.root.classList.add('gp-root', 'cq-root');
    this.hash0 = location.hash;
    this.onHash = () => { if (!this.root.isConnected || !location.hash.startsWith(this.hash0.split('/').slice(0, 4).join('/'))) this.destroy(); };
    window.addEventListener('hashchange', this.onHash);
    this.onMode = (e) => { this.mode = e.detail === 'full' ? 'full' : 'simple'; if (this.alive && this.view) this.render(); };
    window.addEventListener('eai-cq-view', this.onMode);
    this.onKey = (e) => { if (e.key === 'Escape' && this.zoom) { this.zoom = null; this.render(); } };
    window.addEventListener('keydown', this.onKey);
    const v = await this.ctx.getView();
    if (v.room && v.room.settings && v.room.settings.coach && v.me) this.coach = new CqCoach(this, this.ctx.roomId);
    this.setView(v, null);
    const un = this.ctx.onView && this.ctx.onView((nv) => { this.queue = this.queue.then(() => this.receive(nv)); });
    this.unsub = typeof un === 'function' ? un : null;
    this.tick = setInterval(() => this.updateClock(), 1000);
    if (v.me && !this.coach) maybeFirstRules();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    document.body.classList.remove('games-play', 'games-cq', 'cq-simple-on', 'cq-full-on');
    document.title = this.title0;
    window.removeEventListener('hashchange', this.onHash);
    window.removeEventListener('eai-cq-view', this.onMode);
    window.removeEventListener('keydown', this.onKey);
    clearInterval(this.tick);
    clearTimeout(this.msgTimer);
    clearTimeout(this.popTimer);
    clearTimeout(this.holdT);
    if (this.unsub) this.unsub();
  }

  async receive(v) {
    if (!this.alive) return;
    if (!this.root.isConnected) { this.destroy(); return; }
    if (this.view && v.v === this.view.v) return;
    this.setView(v, this.view);
  }

  setView(v, prev) {
    this.view = v;
    const ids = (x) => JSON.stringify((x.me.hand || []).map((c) => c.id));
    const table = (x) => JSON.stringify(((seatOf(x, x.me.seat) || {}).melds || []).map((m) => m.map((c) => c.id)));
    const sameDecision = prev && deciding(prev) && deciding(v) && prev.center && v.center && prev.center.card.id === v.center.card.id
      && !!prev.center.forced === !!v.center.forced && ids(prev) === ids(v) && table(prev) === table(v);
    if (!sameDecision) {
      this.take = deciding(v) ? new Take(v) : null;
      this.building = false;
      // what ¡Me sirve! will lay down (the server says whether any take exists; we find the best one)
      const may = deciding(v) && (v.center.forced || !(v.me.can && v.me.can.take === false));
      this.best = may ? bestTake(v) : null;
      if (this.best && !validTake(v, this.best, classify)) this.best = null;
      this.kind = this.best ? takeKind(v, this.best) : null;
    }
    const hand = (v.me && v.me.hand) || [];
    if (this.pick != null && !hand.some((c) => c.id === this.pick)) this.pick = null;
    if (!discarding(v) && !cambioPick(v)) this.pick = null;
    this.suggest = (discarding(v) || cambioPick(v)) && hintsOn(v) ? loosest(v) : null;
    if (prev) this.diffFx(prev, v); else this.fx = { deal: true };
    // the middle card in sight (and your melds under it, when the card goes onto one of them)
    if (myMove(v) && (!prev || this.fx.yourTurn || this.fx.flip)) this.scrollTo = deciding(v) && this.best && this.kind !== 'new_meld' ? ['.cq-mid', '.cq-mine'] : '.cq-mid';
    if (this.coach) this.coach.onView(v, prev);
    this.render();
  }

  diffFx(prev, v) {
    const fx = {};
    const pc = prev.center && prev.center.card;
    const nc = v.center && v.center.card;
    if (nc && (!pc || pc.id !== nc.id)) { fx.flip = true; this.snd.play('flip'); }
    if (v.hand_no !== prev.hand_no) { fx.deal = true; this.snd.play('deal'); }
    const before = new Set((prev.seats || []).flatMap((s) => (s.melds || []).flat().map((c) => c.id)));
    fx.enter = new Set((v.seats || []).flatMap((s) => (s.melds || []).flat().map((c) => c.id)).filter((id) => !before.has(id)));
    if (fx.enter.size) this.snd.play('snap');
    if (v.center && v.center.forced && !(prev.center && prev.center.forced && prev.center.card.id === v.center.card.id)) fx.stamp = true;
    if (myMove(v) && !myMove(prev)) {
      // the moment it becomes your move: the banner, the chime and the buzz (sfx.js follows the phone's sound setting)
      fx.yourTurn = true;
      this.popAt = Date.now();
      this.sfx('your_turn');
    }
    const lastEv = (x) => ((x.events || []).slice(-1)[0] || {}).v;
    fx.ticker = lastEv(prev) !== lastEv(v);
    if (v.result && (!prev.result || prev.hand_no !== v.hand_no || prev.result.reason !== v.result.reason)) {
      fx.result = true;
      if (v.result.reason === 'out' && v.me && v.result.winner === v.me.seat) { this.sfx('win'); this.snd.play('win'); }
    }
    this.fx = fx;
  }

  flash(text, kind = 'info', ms = 4200) {
    this.msg = { text, kind };
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.msg = null; if (this.alive) this.render(); }, ms);
  }

  // ---- actions ---------------------------------------------------------------------------------------------------
  async send(action) {
    if (this.busy) return false;
    this.busy = true;
    this.render();
    action.cid = action.cid || cid();
    try {
      await this.ctx.act(action);
      this.busy = false;
      this.render();
      return true;
    } catch (e) {
      this.busy = false;
      this.snd.play('bad');
      this.sfx('invalid');
      this.flash(errMsg(e), 'warn', 5200);
      this.render();
      return false;
    }
  }

  tapHand(id) {
    if (this.busy || this.held()) return;
    const v = this.view;
    if (deciding(v)) {
      if (!this.building) {
        // the cards glow on their own; ¡Me sirve! (or Pass) is the thing to tap. Say it again, gently.
        this.nudge = true;
        this.render();
        return;
      }
      const res = this.take.tapHand(id);
      if (res.ok) {
        const g = res.key && this.take.info(this.take.group(res.key));
        this.fx = { put: id };
        this.snd.play(g && g.valid ? 'snap' : 'flip');
      }
    } else if (discarding(v) || cambioPick(v)) {
      this.pick = this.pick === id ? null : id;
      this.fx = { lift: id };
      this.snd.play('flip');
    } else return;
    this.render();
  }

  // "I'll arrange it myself": the builder (stage.js), with the card already where it fits when you were forced.
  startBuild() {
    if (!this.take) return;
    this.take.reset();
    const v = this.view;
    if (v.center && v.center.forced) {
      const me = seatOf(v, v.me.seat) || {};
      const i = (me.melds || []).findIndex((m) => fits(m, v.center.card));
      if (i >= 0) { this.take.pick(v.center.card.id); this.take.drop('t' + i); this.take.sig0 = this.take.sig(); }
    }
    this.building = true;
    this.scrollTo = '.cq-mine';
    this.render();
  }

  cancelBuild() {
    if (!this.take) return;
    this.take.reset();
    this.building = false;
    this.render();
  }

  pickTable(id) {
    if (!this.take || this.busy || !this.building) return;
    this.take.pick(id);
    this.render();
  }

  dropOn(key) {
    if (!this.take || this.busy) return;
    const res = this.take.drop(key);
    if (res.ok && this.take.lastMoved != null) { this.fx = { put: this.take.lastMoved }; this.snd.play('snap'); }
    this.render();
  }

  moveCenter(key) {
    if (!this.take || !this.view.center) return;
    this.take.pick(this.view.center.card.id);
    this.dropOn(key);
  }

  newMeld() {
    if (!this.take) return;
    this.take.newMeld();
    this.render();
  }

  // ¡Me sirve! (and "Lay it down" when forced): one tap lays the best take down. Arranging by hand: its own button.
  async meSirve() {
    if (!this.take) return;
    if (this.building) {
      const st = this.take.status();
      if (!st.ok) {
        this.snd.play('bad');
        this.flash(takeWhy(st.why) || t('family.games.cq.take.bad'), 'warn');
        this.shake = true;
        this.render();
        return;
      }
      if (await this.send(this.take.action())) this.snd.play('snap');
      return;
    }
    if (!this.best) { this.startBuild(); return; }
    if (await this.send({ type: 'take', melds: this.best.map((m) => m.slice()) })) this.snd.play('snap');
  }

  async pass(force) {
    if (force) await stamp(this.root.querySelector('.cq-center-card') || this.root, { sound: () => this.snd.play('stamp') });
    await this.send(force ? { type: 'pass', force: true } : { type: 'pass' });
  }

  async discard(force) {
    if (this.pick == null) { this.flash(t('family.games.cq.msg.pick_discard'), 'warn'); this.nudge = true; this.render(); return; }
    const id = this.pick;
    if (force) await stamp(this.root.querySelector(`.cq-hand [data-id="${id}"]`) || this.root, { sound: () => this.snd.play('stamp') });
    const ok = await this.send(force ? { type: 'discard', card: id, force: true } : { type: 'discard', card: id });
    if (ok) { this.pick = null; this.snd.play('flip'); }
  }

  async cambio() {
    if (this.pick == null) { this.flash(t('family.games.cq.msg.pick_cambio'), 'warn'); this.nudge = true; this.render(); return; }
    const ok = await this.send({ type: 'cambio', card: this.pick });
    if (ok) this.pick = null;
  }

  async nextHand() { await this.send({ type: 'next_hand' }); }
  async rematch() { await this.send({ type: 'rematch' }); }

  setSort(by) {
    this.sortBy = by;
    try { localStorage.setItem(SORT_KEY, by); } catch { /* fine */ }
    this.render();
  }

  // ---- tap-and-hold: a card full size ------------------------------------------------------------------------------
  held() { return Date.now() - (this.holdFired || 0) < 700; }

  holdable(node, card) {
    const stop = () => clearTimeout(this.holdT);
    node.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      stop();
      const x0 = e.clientX;
      const y0 = e.clientY;
      node.__hold = { x0, y0 };
      this.holdT = setTimeout(() => { this.holdFired = Date.now(); this.zoom = { card, at: Date.now() }; this.render(); }, HOLD_MS);
    });
    node.addEventListener('pointermove', (e) => {
      const h0 = node.__hold;
      if (h0 && Math.hypot(e.clientX - h0.x0, e.clientY - h0.y0) > 10) stop();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => node.addEventListener(ev, stop));
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    return node;
  }

  renderZoom() {
    const z = this.zoom;
    if (!z) return null;
    const close = () => { if (Date.now() - z.at < 350) return; this.zoom = null; this.render(); };
    return h('div', { class: 'cq-zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': cardName(z.card), onclick: close },
      cardNode(z.card, { size: 'z', cls: 'cq-zoom-card' }),
      h('p', { class: 'cq-zoom-name' }, cardName(z.card)),
      h('button', { class: 'gm-btn gp-btn gp-btn-quiet cq-zoom-x', type: 'button', 'data-fk': 'zoom-x', onclick: (e) => { e.stopPropagation(); this.zoom = null; this.render(); } },
        t('family.games.common.close')));
  }

  // ---- render --------------------------------------------------------------------------------------------------
  render() {
    if (!this.alive) return;
    const v = this.view;
    document.body.classList.toggle('cq-simple-on', this.simple);
    document.body.classList.toggle('cq-full-on', !this.simple);
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    const cls = ['gp', 'cq', this.simple ? 'cq-simple' : 'cq-full'];
    if (hasArt()) cls.push('cq-art-on');
    if (this.busy) cls.push('gp-busy');
    if (this.building) cls.push('cq-building');
    if (v.reina) cls.push('cq-reina');
    const node = h('div', { class: cls.join(' ') },
      this.simple ? null : this.renderStrip(v),
      h('section', { class: 'cq-table gm-felt cq-felt', 'aria-label': t('family.games.cq.table') },
        this.renderOpps(v),
        this.renderMiddle(v)),
      this.renderMine(v),
      this.renderTray(v),
      this.renderResult(v),
      this.renderPop(),
      this.renderZoom());
    clear(this.root).append(node);
    if (this.coach) this.coach.decorate(this.root);
    if (this.fx.stamp) { const el = this.root.querySelector('.cq-center-card'); if (el) stamp(el, { sound: () => this.snd.play('stamp'), stay: true }); }
    if (this.fx.result && v.result && v.result.reason === 'out') {
      const card = this.root.querySelector('.cq-win');
      if (card) celebrate(card, { queen: !!(v.reina && v.me && v.result.winner === v.me.seat) });
    }
    this.fx = {};
    this.shake = false;
    this.nudge = false;
    document.title = myMove(v) ? '● ' + t('family.games.cq.turn.you_short') : this.title0;
    if (fk) {
      const again = this.root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    const tray = this.root.querySelector('.cq-tray');
    this.root.style.setProperty('--gp-tray-h', (tray ? Math.ceil(tray.getBoundingClientRect().height) : 0) + 'px');
    // the picked card (or the first glowing one) in sight in the hand's row
    const hand = this.root.querySelector('.cq-hand');
    const focusCard = hand && hand.querySelector('.is-picked, .is-goes, .is-suggest');
    if (hand && focusCard && hand.scrollWidth > hand.clientWidth) {
      const r = focusCard.getBoundingClientRect();
      const hr = hand.getBoundingClientRect();
      if (r.left < hr.left || r.right > hr.right) hand.scrollLeft += r.left - hr.left - (hr.width - r.width) / 2;
    }
    if (this.scrollTo) { const sel = this.scrollTo; this.scrollTo = null; requestAnimationFrame(() => this.reveal(sel)); }
  }

  // Bring a part of the table into view just above the tray (it covers the bottom of the screen). Two selectors:
  // from the top of the first to the bottom of the second, as much as fits (the first one's top wins).
  reveal(sel) {
    const [a, b] = Array.isArray(sel) ? sel : [sel, sel];
    const el = this.root.querySelector(a);
    const el2 = this.root.querySelector(b) || el;
    const tray = this.root.querySelector('.cq-tray');
    if (!el || !tray) return;
    const r = { top: el.getBoundingClientRect().top, bottom: el2.getBoundingClientRect().bottom };
    const bottom = window.innerHeight - tray.getBoundingClientRect().height - 10;
    // the app's top bar is sticky: never tuck the top of the part under it
    const bar = document.querySelector('.topbar');
    const top = (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0) + 8;
    let dy = 0;
    if (r.bottom > bottom) dy = r.bottom - bottom;
    if (r.top - dy < top) dy = r.top - top;
    if (Math.abs(dy) > 4) window.scrollBy({ top: dy, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  clockText() {
    const tn = this.view.turn;
    if (!tn || !tn.deadline || this.view.result) return '';
    const left = Math.round((Date.parse(tn.deadline) - Date.now()) / 1000);
    if (this.view.room.mode === 'leisure' || left > 3600) return t('family.games.cq.turn.by', { time: clock(tn.deadline) });
    return t('family.games.cq.turn.seconds', { s: Math.max(0, left) });
  }

  updateClock() {
    const el = this.root.querySelector('.gp-clock');
    if (el) el.textContent = this.clockText();
  }

  // ---- Full view only: what kind of game, and the news line -------------------------------------------------------
  renderStrip(v) {
    const info = h('p', { class: 'cq-info' },
      h('span', null, v.variant === 'familia' ? t('family.games.cq.variant.familia') : t('family.games.cq.variant.classic')),
      h('span', null, t('family.games.cq.hand_no', { n: v.hand_no || 1 })),
      v.stake > 1 ? h('span', { class: 'cq-stake' }, t('family.games.cq.stake', { n: v.stake })) : null,
      h('span', null, t('family.games.cq.goal', { n: v.target })));
    return h('header', { class: 'gp-strip cq-strip' }, info, this.renderTicker(v));
  }

  renderTicker(v) {
    const evs = (v.events || []).map(evText).filter(Boolean);
    if (!evs.length) return null;
    const news = newsLine(v.events);
    const btn = h('button', { class: 'cq-ticker' + (this.fx.ticker ? ' gp-ticker-new' : ''), type: 'button', 'data-fk': 'ticker', 'aria-expanded': String(this.history),
      onclick: () => { this.history = !this.history; this.render(); } },
    h('span', { class: 'gp-tick-dot', 'aria-hidden': 'true' }), h('span', { class: 'cq-ticker-text' }, news.text),
    h('span', { class: 'cq-ticker-more', 'aria-hidden': 'true' }, this.history ? '−' : '+'));
    return h('div', { class: 'cq-tick-wrap' }, btn,
      this.history ? h('ol', { class: 'cq-history', 'aria-label': t('family.games.cq.history') }, evs.slice(0, evs.length - news.n).slice(-7).reverse().map((x) => h('li', null, x))) : null);
  }

  // The other players. Simple: one line each ("Claude · 3 of 11 down" and a little fan of their cards); tap to see
  // what they laid down. Full: their melds always, the dealer, points.
  renderOpps(v) {
    const others = (v.seats || []).filter((s) => !v.me || s.seat !== v.me.seat);
    const ph = phaseOf(v);
    const mover = moverOf(v);
    return h('ul', { class: 'cq-opps', 'aria-label': t('family.games.cq.players') }, others.map((s) => {
      const on = mover === s.seat || (ph === 'cambio' && !s.cambio_done);
      const label = t('family.games.cq.opp_aria', { name: s.name, n: s.hand_count, m: s.melded || 0, target: v.target });
      const name = h('span', { class: 'cq-opp-name' }, s.name, s.bot || s.covering_bot ? h('span', { class: 'gp-bot', 'aria-hidden': 'true' }, ' ✦') : null);
      const melds = (s.melds || []).length ? h('div', { class: 'cq-opp-melds' }, s.melds.map((m) => this.holdMeld(meldNode(sortMeld(m), { size: 's', fresh: this.fx.enter }), m))) : null;
      const li = (kids) => h('li', { class: 'cq-opp' + (on ? ' is-on' : '') + (s.away ? ' is-away' : ''), 'data-seat': s.seat }, kids);
      if (this.simple) {
        const open = this.open.has(s.seat);
        const can = !!melds;
        const line = h(can ? 'button' : 'div', { class: 'cq-opp-line', 'aria-label': label, ...(can ? { type: 'button', 'aria-expanded': String(open), 'data-fk': 'opp-' + s.seat,
          onclick: () => { if (open) this.open.delete(s.seat); else this.open.add(s.seat); this.render(); } } : { role: 'group' }) },
        name,
        h('span', { class: 'cq-opp-down', 'aria-hidden': 'true' }, t('family.games.cq.down', { n: s.melded || 0, target: v.target })),
        h('span', { class: 'grow' }),
        this.fan(s.hand_count, !!v.reina),
        can ? h('span', { class: 'cq-opp-more', 'aria-hidden': 'true' }, open ? '−' : '+') : null);
        return li([line, open ? melds : null]);
      }
      return li([
        h('div', { class: 'cq-opp-head', 'aria-label': label, role: 'group' },
          name,
          v.dealer === s.seat ? h('span', { class: 'cq-chip cq-chip-dealer' }, t('family.games.cq.dealer')) : null,
          ph === 'cambio' ? h('span', { class: 'cq-chip' + (s.cambio_done ? ' is-done' : '') }, s.cambio_done ? t('family.games.cq.cambio_ready') : t('family.games.cq.cambio_choosing')) : null,
          h('span', { class: 'grow' }),
          backPile(s.hand_count, { reina: !!v.reina, size: 'xs', cls: 'cq-opp-hand' }),
          h('span', { class: 'cq-chip cq-chip-melded', 'aria-hidden': 'true' }, `${s.melded || 0}/${v.target}`),
          v.room.settings.match_to ? h('span', { class: 'cq-chip cq-chip-pts', 'aria-hidden': 'true' }, t('family.games.cq.pts', { n: s.points || 0 })) : null),
        melds]);
    }));
  }

  // A little fan of card backs: how many cards someone holds, without a number to read.
  fan(n, reina) {
    const k = Math.max(0, Math.min(n || 0, 10));
    return h('span', { class: 'cq-fan', 'aria-hidden': 'true', style: { '--k': String(k) } },
      Array.from({ length: k }, (_, i) => { const c = cardNode(null, { back: true, reina, size: 'xs' }); c.style.setProperty('--i', String(i - (k - 1) / 2)); return c; }));
  }

  holdMeld(node, cards) {
    node.querySelectorAll('.cq-card').forEach((el, i) => this.holdable(el, cards.find((c) => String(c.id) === el.dataset.id) || cards[i]));
    return node;
  }

  // The pile, the card in the middle, the dead pile. Simple: the piles are small pictures, no words or numbers.
  renderMiddle(v) {
    const c = v.center;
    const simple = this.simple;
    let centerEl;
    if (c && c.card && phaseOf(v) === 'offer') {
      const taken = this.building && this.take && this.take.where(c.card.id);
      const byMe = v.me && c.by === v.me.seat;
      const from = c.from === 'stock'
        ? (byMe ? t('family.games.cq.center.turned_you') : t('family.games.cq.center.turned', { name: nameOf(v, c.by) }))
        : (byMe ? t('family.games.cq.center.thrown_you') : t('family.games.cq.center.thrown', { name: nameOf(v, c.by) }));
      const to = v.me && c.to === v.me.seat ? t('family.games.cq.center.for_you') : t('family.games.cq.center.for', { name: nameOf(v, c.to) });
      const card = taken
        ? h('span', { class: 'cq-card cq-l cq-slot cq-center-card', 'aria-label': t('family.games.cq.center.in_meld') }, h('span', { class: 'cq-slot-arrow', 'aria-hidden': 'true' }, '↓'))
        : this.holdable(cardNode(c.card, { size: 'l', cls: 'cq-center-card' + (this.fx.flip ? ' is-flip' : '') + (c.forced ? ' is-forced' : '') + (deciding(v) && this.best ? ' is-goes' : ''),
          tag: deciding(v) && this.building ? 'button' : 'span', onclick: () => this.pickTable(c.card.id), attrs: { 'data-fk': 'center' } }), c.card);
      centerEl = h('div', { class: 'cq-center' + (v.me && c.to === v.me.seat ? ' is-mine' : '') },
        card,
        h('span', { class: 'cq-center-from' }, from),
        simple ? null : h('span', { class: 'cq-center-to' }, to, c.step === 2 ? h('span', { class: 'cq-last' }, ' · ', t('family.games.cq.center.last')) : null));
    } else {
      centerEl = h('div', { class: 'cq-center' }, h('span', { class: 'cq-card cq-l cq-slot cq-center-card', 'aria-hidden': 'true' }));
    }
    const small = simple ? 's' : 'm';
    const stock = h('div', { class: 'cq-pilebox' },
      simple
        ? h('span', { class: 'cq-stock-s', role: 'img', 'aria-label': t('family.games.cq.stock_aria', { n: v.stock_left || 0 }) },
          (v.stock_left || 0) > 0 ? cardNode(null, { back: true, reina: !!v.reina, size: small }) : h('span', { class: 'cq-card cq-' + small + ' cq-empty' }))
        : backPile(v.stock_left || 0, { reina: !!v.reina, size: 'm', label: t('family.games.cq.stock_aria', { n: v.stock_left || 0 }), cls: 'cq-stock' + ((v.stock_left || 0) <= 3 ? ' is-low' : '') }),
      simple ? null : h('span', { class: 'cq-pile-l', 'aria-hidden': 'true' }, t('family.games.cq.stock')));
    const dead = h('div', { class: 'cq-pilebox' },
      h('span', { class: 'cq-dead', role: 'img', 'aria-label': v.dead_top ? t('family.games.cq.dead_aria', { n: v.dead_count || 0, card: cardName(v.dead_top) }) : t('family.games.cq.dead_none') },
        v.dead_top ? this.holdable(cardNode(v.dead_top, { size: small, label: '', cls: 'cq-dead-top' }), v.dead_top) : h('span', { class: 'cq-card cq-' + small + ' cq-empty', 'aria-hidden': 'true' }),
        !simple && v.dead_count ? h('b', { class: 'cq-pile-n', 'aria-hidden': 'true' }, String(v.dead_count)) : null),
      simple ? null : h('span', { class: 'cq-pile-l', 'aria-hidden': 'true' }, t('family.games.cq.dead')));
    return h('div', { class: 'cq-mid' }, stock, centerEl, dead);
  }

  // Your melds: as they are, or (while arranging by hand) the groups you're arranging, each checked live.
  renderMine(v) {
    if (!v.me) return null;
    const meSeat = seatOf(v, v.me.seat) || {};
    const melds = meSeat.melds || [];
    const count = (this.building && this.take ? this.take.status().count : meSeat.melded) || 0;
    const head = h('h2', { class: 'cq-mine-h' }, h('span', null, t('family.games.cq.your_melds')),
      this.simple ? null : h('span', { class: 'cq-count' }, t('family.games.cq.melded', { n: count, target: v.target })));
    if (!(this.building && this.take)) {
      if (!melds.length && this.simple) return null;
      // ¡Me sirve! puts the middle card onto one of these: that one glows
      const home = deciding(v) && this.best && this.kind !== 'rearrange' ? this.best.find((m) => m.includes(v.center.card.id)) : null;
      return h('section', { class: 'cq-mine' }, head,
        melds.length ? h('div', { class: 'cq-mine-melds' }, melds.map((m) => {
          const goes = home && m.every((c) => home.includes(c.id));
          return this.holdMeld(meldNode(sortMeld(m), { size: this.simple ? 'h' : 'm', fresh: this.fx.enter, cls: goes ? 'is-goes' : '' }), m);
        }))
          : h('p', { class: 'cq-empty-note' }, t('family.games.cq.no_melds')));
    }
    const tk = this.take;
    const holding = tk.held != null;
    const groups = tk.infos().filter((g) => g.cards.length || g.key === tk.active);
    // the middle card on its own in a new meld: offer the melds it fits as they are
    const center = v.center && v.center.card;
    const cg = center && tk.where(center.id);
    const centerLoose = !!(cg && !cg.orig && cg.cards.length === 1);
    return h('section', { class: 'cq-mine is-building' }, head,
      h('div', { class: 'cq-groups' }, groups.map((g) => {
        const active = g.key === tk.active && !holding;
        const cls = ['cq-group'];
        if (g.cards.length) cls.push(g.valid ? 'is-ok' : 'is-bad');
        if (active) cls.push('is-active');
        if (g.orig && !g.changed) cls.push('is-orig');
        if (!g.valid && this.shake) cls.push('gp-shake');
        const label = g.valid ? (g.kind === 'run' ? t('family.games.cq.kind.run') : t('family.games.cq.kind.set')) : whyText(g.why);
        // Simple: a tick for a good group (no rule captions); what's wrong when it isn't
        const caption = !g.cards.length ? '' : g.valid ? (this.simple ? '✓' : '✓ ' + label) : label;
        return h('div', { class: cls.join(' '), 'data-key': g.key, role: 'group', 'aria-label': label },
          h('div', { class: 'cq-group-cards' }, g.cards.map((c) => {
            const fromHand = tk.isHandCard(c.id);
            const isCenter = v.center && c.id === v.center.card.id;
            return cardNode(c, { size: 'm', tag: 'button', cls: (tk.held === c.id ? 'is-held ' : '') + (this.fx.put === c.id ? 'is-snap ' : '') + (isCenter ? 'is-center ' : '') + (fromHand ? 'is-from-hand' : ''),
              onclick: () => (fromHand && tk.held == null ? this.tapHand(c.id) : this.pickTable(c.id)),
              attrs: { 'data-fk': 'g' + c.id }, label: fromHand && tk.held == null ? t('family.games.cq.back_to_hand', { card: cardName(c) }) : t('family.games.cq.move_card', { card: cardName(c) }) });
          }),
          !g.cards.length ? h('span', { class: 'cq-group-empty' }, t('family.games.cq.tap_cards')) : null),
          h('div', { class: 'cq-group-foot' },
            h('span', { class: 'cq-group-why' + (g.valid ? ' is-ok' : '') }, caption),
            holding && tk.where(tk.held) && tk.where(tk.held).key !== g.key
              ? h('button', { class: 'cq-put gm-target', type: 'button', 'data-fk': 'put-' + g.key, onclick: () => this.dropOn(g.key) }, h('span', { 'aria-hidden': 'true' }, '↓ '), t('family.games.cq.put_here'))
              : !holding && centerLoose && g.orig && g.valid && fits(g.cards, center) ? h('button', { class: 'cq-put gm-target', type: 'button', 'data-fk': 'put-' + g.key, onclick: () => this.moveCenter(g.key) },
                h('span', { 'aria-hidden': 'true' }, '↓ '), t('family.games.cq.put_center', { card: cardName(center) }))
                : !active && !holding && tk.handLeft().length ? h('button', { class: 'cq-use', type: 'button', 'data-fk': 'use-' + g.key, onclick: () => this.dropOn(g.key) }, t('family.games.cq.add_here')) : null));
      }),
      h('button', { class: 'cq-newmeld gm-target', type: 'button', 'data-fk': 'newmeld', onclick: () => this.newMeld() },
        h('span', { class: 'gp-plus', 'aria-hidden': 'true' }, '+'), holding ? t('family.games.cq.put_new') : t('family.games.cq.new_meld'))));
  }

  // ---- the one voice -------------------------------------------------------------------------------------------
  // {text, kicker?, kind?}: the single sentence on screen. Lessons, errors and suggestions all speak here.
  voice(v) {
    const lesson = this.coach && v.me && !v.result ? this.coach.say() : null;
    const kicker = lesson ? lesson.kicker : null;
    if (this.busy) return { text: t('family.games.cq.msg.sending'), kicker };
    if (this.msg) return { text: this.msg.text, kind: this.msg.kind, kicker };
    if (lesson && lesson.text) return { text: lesson.text, kicker, kind: 'lesson' };
    if (!v.me) return { text: t('family.games.cq.watching') };
    const ph = phaseOf(v);
    const mine = seatOf(v, v.me.seat);
    if (mine && mine.covering_bot && this.ctx.reclaim && ph !== 'over') return { text: t('family.games.cq.covered') };
    if (ph === 'over' || (v.result && v.result.match_over)) return { text: t('family.games.cq.turn.over') };
    if (ph === 'between') return { text: t('family.games.cq.turn.between') };
    const next = nameOf(v, leftOf(v, v.me.seat));
    if (cambioPick(v)) {
      if (this.pick != null) return { text: t('family.games.cq.say.cambio_ready', { card: cardName(this.cardById(this.pick)), name: next }), kicker };
      return { text: this.suggest != null ? t('family.games.cq.say.cambio_hint', { name: next }) : t('family.games.cq.say.cambio', { name: next }), kicker };
    }
    if (ph === 'cambio') return { text: v.me.pick ? t('family.games.cq.msg.cambio_sent', { card: cardName(v.me.pick), name: next }) : t('family.games.cq.msg.cambio_wait'), kicker };
    if (deciding(v)) {
      const card = cardName(v.center.card);
      if (this.building) return { ...this.buildText(v), kicker };
      if (v.center.forced) return { text: t('family.games.cq.say.forced', { name: nameOf(v, v.center.by) }), kicker, kind: 'forced' };
      if (this.best) {
        let text;
        if (this.kind === 'out') text = t('family.games.cq.say.offer_out', { card });
        else if (this.kind === 'fits') text = t('family.games.cq.say.offer_fits', { card });
        else if (this.kind === 'rearrange') text = t('family.games.cq.say.offer_move', { card });
        else text = t('family.games.cq.say.offer_goes', { card });
        return { text, kicker, kind: 'good' };
      }
      if (!(v.me.can && v.me.can.take === false)) return { text: t('family.games.cq.msg.build'), kicker };
      if (this.forcePassShown(v)) return { text: t('family.games.cq.say.no_fit_force', { card, name: next }), kicker };
      return { text: t('family.games.cq.say.no_fit', { card }), kicker };
    }
    if (discarding(v)) {
      if (this.pick == null) return { text: this.suggest != null ? t('family.games.cq.say.discard_hint') : t('family.games.cq.say.discard'), kicker };
      const card = cardName(this.cardById(this.pick));
      if (this.forceDiscardShown(v)) return { text: t('family.games.cq.msg.discard_force', { card, name: next }), kicker };
      return { text: t('family.games.cq.say.discard_ready', { card }), kicker };
    }
    // waiting: who we're waiting for, calmly
    if (v.me.got) return { text: t('family.games.cq.msg.got', { card: cardName(v.me.got), name: nameOf(v, rightOf(v, v.me.seat)) }), kicker };
    if (ph === 'offer' && v.center && v.center.forced) return { text: t('family.games.cq.forced.other', { a: nameOf(v, v.center.by), b: nameOf(v, v.center.to) }), kicker };
    const who = moverOf(v);
    const st = who == null ? null : seatOf(v, who);
    if (!st) return { text: (v.me.hand || []).length ? t('family.games.cq.msg.wait') : t('family.games.cq.msg.last_one'), kicker };
    const wait = st.bot || st.covering_bot ? t('family.games.cq.say.thinking', { name: st.name }) : t('family.games.cq.say.waiting', { name: st.name });
    return { text: wait, kicker, kind: 'wait' };
  }

  buildText(v) {
    const st = this.take.status();
    if (this.take.held != null || st.why === 'holding') return { text: t('family.games.cq.take.holding') };
    if (st.out) return { text: t('family.games.cq.msg.out_ready'), kind: 'good' };
    if (st.ok && v.center.forced && !this.take.dirty()) return { text: t('family.games.cq.msg.forced_ready'), kind: 'good' };
    if (st.ok) return { text: t('family.games.cq.msg.take_ready'), kind: 'good' };
    if (this.take.groups.every((g) => g.orig || g.cards.length <= 1)) return { text: t('family.games.cq.msg.build') };
    return { text: takeWhy(st.why) };
  }

  // ¡Te obligo! on a pass: whenever it applies and ¡Me sirve! isn't there (Simple: only then; Full adds a link).
  forcePassShown(v) { return !!(deciding(v) && !v.center.forced && v.me.can && v.me.can.force_pass && forcingOn(v) && !this.best && v.me.can.take === false); }
  // "Throw and ¡Te obligo!": Full view only.
  forceDiscardShown(v) {
    return !this.simple && forcingOn(v) && this.pick != null && ((v.me.can && v.me.can.force_discard) || []).includes(this.pick);
  }

  cardById(id) { return ((this.view.me && this.view.me.hand) || []).find((c) => c.id === id) || null; }

  // ---- the tray: the voice, your hand, two buttons at most ----------------------------------------------------------
  renderTray(v) {
    const say = this.voice(v);
    const voice = h('div', { class: 'cq-voice' + (say.kind ? ' cq-voice-' + say.kind : '') + (this.nudge ? ' is-nudge' : ''), role: 'status', 'aria-live': 'polite' },
      say.kicker ? h('p', { class: 'cq-voice-kicker' }, say.kicker) : null,
      h('p', { class: 'cq-say' }, say.text),
      v.turn && v.turn.deadline && !v.result ? h('p', { class: 'gp-clock' }, this.clockText()) : null);
    if (!v.me) return h('footer', { class: 'gp-tray gm-tray cq-tray' }, h('div', { class: 'gp-tray-in' }, voice));
    const parts = [voice, this.renderHand(v)];
    const { buttons, links } = this.controls(v);
    if (buttons.length) parts.push(h('div', { class: 'gp-actions cq-actions' }, buttons));
    if (links.length) parts.push(h('div', { class: 'cq-links' }, links));
    return h('footer', { class: 'gp-tray gm-tray cq-tray' + (myMove(v) ? ' gp-tray-mine' : '') }, h('div', { class: 'gp-tray-in' }, parts));
  }

  // Your hand: ONE row of big cards (sorted by suit; Full view may sort by number), overlapping only as much as they
  // must, the row scrolls sideways if it still doesn't fit. Tap to choose, hold to see a card big.
  renderHand(v) {
    const me = v.me;
    const handCards = this.take && this.building ? this.take.handLeft() : (me.hand || []);
    const sorted = sortHand(handCards, this.simple ? 'suit' : this.sortBy);
    const canTap = !this.busy && (deciding(v) || discarding(v) || cambioPick(v));
    const goes = new Set(deciding(v) && !this.building && this.best ? this.best.flat() : []);
    const fitsNext = new Set(!this.simple && discarding(v) ? (me.can && me.can.force_discard) || [] : []);
    const hand = h('div', { class: 'cq-hand' + (this.fx.deal ? ' is-dealing' : ''), role: 'group', 'aria-label': t('family.games.cq.your_hand', { n: me.hand.length }) },
      sorted.map((c, i) => {
        const cls = ['cq-hcard'];
        if (this.pick === c.id) cls.push('is-picked');
        if (this.fx.lift === c.id) cls.push('is-lift');
        if (goes.has(c.id)) cls.push('is-goes');
        if (this.suggest === c.id && this.pick == null) cls.push('is-suggest');
        if (me.got && me.got.id === c.id) cls.push('is-got');
        if (fitsNext.has(c.id)) cls.push('is-fits-next');
        if (this.fx.deal) cls.push('is-deal');
        const node = cardNode(c, canTap ? { size: 'h', tag: 'button', cls: cls.join(' '), onclick: () => this.tapHand(c.id), attrs: { 'data-fk': 'h' + c.id } } : { size: 'h', cls: cls.join(' ') });
        node.style.setProperty('--i', String(i));
        if (me.got && me.got.id === c.id) node.append(h('span', { class: 'gm-new', 'aria-hidden': 'true' }, t('family.games.cq.new_tag')));
        return this.holdable(node, c);
      }),
      !sorted.length ? h('span', { class: 'gp-hand-empty' }, t('family.games.cq.hand_empty')) : null);
    hand.style.setProperty('--n', String(Math.max(1, sorted.length)));
    return hand;
  }

  // The buttons (two at most) and the small links under them.
  controls(v) {
    const me = v.me;
    const can = me.can || {};
    const ph = phaseOf(v);
    const buttons = [];
    const links = [];
    const btn = (fk, label, onclick, { main = false, quiet = false, cls = '', sub = null, off = false, disabled = false } = {}) => h('button', {
      class: 'gm-btn gp-btn ' + (main ? 'gm-btn--go gp-btn-main ' : '') + (quiet ? 'gp-btn-quiet ' : '') + cls, type: 'button', 'data-fk': fk,
      'aria-disabled': off ? 'true' : null, disabled: disabled || this.busy ? true : null, onclick,
    }, h('span', { class: 'cq-btn-l' }, label), sub ? h('small', null, sub) : null);
    const link = (fk, label, onclick, cls = '') => h('button', { class: 'cq-link ' + cls, type: 'button', 'data-fk': fk, onclick, disabled: this.busy ? true : null }, label);
    const lesson = this.coach && !v.result ? this.coach.say() : null;
    const mine = seatOf(v, me.seat);
    if (lesson && lesson.text) {
      buttons.push(btn('coach-ok', lesson.okLabel, () => this.coach.next(), { main: true, cls: 'gp-coach-ok' }));
    } else if (mine && mine.covering_bot && this.ctx.reclaim && ph !== 'over') {
      buttons.push(btn('takeback', t('family.games.cq.take_back'), async () => { try { await this.ctx.reclaim(); } catch { this.flash(t('family.games.cq.msg.refused'), 'warn'); this.render(); } }, { main: true, cls: 'gp-takeback' }));
    } else if (cambioPick(v)) {
      buttons.push(btn('cambio', t('family.games.cq.btn.cambio'), () => this.cambio(), { main: true, cls: 'cq-cambio-btn', off: this.pick == null }));
    } else if (deciding(v)) {
      const forced = v.center.forced;
      if (this.building) {
        const st = this.take.status();
        if (!forced || this.take.dirty()) buttons.push(btn('cancel', forced ? t('family.games.cq.btn.reset') : t('family.games.cq.btn.cancel'), () => this.cancelBuild(), { quiet: true, cls: 'cq-cancel' }));
        buttons.push(btn('take', t('family.games.cq.btn.take'), () => this.meSirve(), { main: true, cls: 'cq-take' + (st.ok ? ' ready' : '') + (st.out ? ' is-out' : ''),
          off: !st.ok, sub: st.out ? t('family.games.cq.btn.take_out') : null }));
      } else if (forced) {
        buttons.push(btn('take', t('family.games.cq.btn.lay'), () => this.meSirve(), { main: true, cls: 'cq-take cq-lay ready' }));
      } else if (this.best || can.take !== false) {
        buttons.push(btn('pass', t('family.games.cq.btn.pass'), () => this.pass(false), { quiet: true, cls: 'cq-pass', disabled: can.pass === false }));
        buttons.push(btn('take', t('family.games.cq.btn.take'), () => this.meSirve(), { main: true, cls: 'cq-take ready' + (this.kind === 'out' ? ' is-out' : ''),
          sub: this.kind === 'out' ? t('family.games.cq.btn.take_out') : t('family.games.cq.btn.take_sub') }));
        if (!this.simple && can.force_pass && forcingOn(v)) links.push(link('force-link', t('family.games.cq.btn.force_pass_link'), () => this.pass(true), 'cq-force-link'));
      } else {
        buttons.push(btn('pass', t('family.games.cq.btn.pass'), () => this.pass(false), { main: true, cls: 'cq-pass', disabled: can.pass === false }));
        if (this.forcePassShown(v)) {
          buttons.push(btn('force', t('family.games.cq.btn.force'), () => this.pass(true), { cls: 'cq-force', sub: t('family.games.cq.btn.force_pass_sub') }));
        }
      }
      if (!this.building && this.take && (this.best || forced || can.take !== false)) links.push(link('arrange', t('family.games.cq.btn.arrange'), () => this.startBuild(), 'cq-arrange'));
    } else if (discarding(v)) {
      buttons.push(btn('discard', t('family.games.cq.btn.discard'), () => this.discard(false), { main: true, cls: 'cq-discard', off: this.pick == null }));
      if (this.forceDiscardShown(v)) {
        buttons.push(btn('discard-force', t('family.games.cq.btn.force'), () => this.discard(true), { cls: 'cq-force', sub: t('family.games.cq.btn.force_discard_sub') }));
      }
    } else if (ph === 'between' && this.hideResultV === v.v) {
      buttons.push(btn('show-result', t('family.games.cq.result.show'), () => { this.hideResultV = null; this.render(); }, { main: true }));
    }
    if (!this.simple && (me.hand || []).length > 1) {
      links.push(link('sort', t('family.games.cq.sort') + ': ' + (this.sortBy === 'rank' ? t('family.games.cq.sort_rank') : t('family.games.cq.sort_suit')),
        () => this.setSort(this.sortBy === 'rank' ? 'suit' : 'rank'), 'cq-sort-btn'));
    }
    if (this.coach && this.coach.step) links.push(link('coach-skip', t('family.games.cq.coach.skip'), () => this.coach.finish(), 'gp-coach-skip'));
    return { buttons, links };
  }

  // "Your turn!" for a moment when it becomes your move (it never blocks a tap).
  renderPop() {
    const left = POP_MS - (Date.now() - this.popAt);
    if (!this.popAt || left <= 0 || !myMove(this.view)) return null;
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => { if (this.alive) this.render(); }, left + 20);
    return h('div', { class: 'cq-turnpop', 'aria-hidden': 'true' }, h('span', { class: 'cq-turnpop-in' }, t('family.games.cq.say.your_turn')));
  }

  // ---- between hands, and the end -----------------------------------------------------------------------------
  renderResult(v) {
    const r = v.result;
    const ph = phaseOf(v);
    if (!r || (ph !== 'between' && ph !== 'over')) return null;
    if (this.hideResultV === v.v) return null;
    const over = ph === 'over' || r.match_over;
    const meWon = v.me && r.winner === v.me.seat;
    const queen = !!(v.reina && meWon && r.reason === 'out');
    let title;
    let kicker;
    if (r.reason === 'draw') { title = t('family.games.cq.result.draw'); kicker = t('family.games.cq.result.draw_sub', { n: (r.stake || 1) * 2 }); }
    else if (queen) { title = t('family.games.cq.reina.title'); kicker = t('family.games.cq.reina.line'); }
    else if (meWon) { title = t('family.games.cq.result.you_out'); kicker = t('family.games.cq.result.you_out_sub'); }
    else { title = t('family.games.cq.result.out', { name: nameOf(v, r.winner) }); kicker = t('family.games.cq.result.out_sub'); }
    let matchLine = null;
    if (over && v.room.settings.match_to) {
      const best = Math.max(...(r.points || [0]));
      const champs = (v.seats || []).filter((s) => (r.points || [])[s.seat] === best);
      matchLine = champs.length === 1 && v.me && champs[0].seat === v.me.seat ? t('family.games.cq.result.match_you') : t('family.games.cq.result.match', { name: champs.map((s) => nameOf(v, s.seat)).join(' · ') });
    }
    const seats = (v.seats || []).slice().sort((a, b) => ((r.points || [])[b.seat] || 0) - ((r.points || [])[a.seat] || 0));
    const nextOk = v.me && v.me.can && v.me.can.next_hand;
    return h('div', { class: 'gp-result cq-result', role: 'dialog', 'aria-modal': 'false', 'aria-label': title },
      h('div', { class: 'gm-win gp-win cq-win' + (queen ? ' is-queen' : '') + (r.reason === 'draw' ? ' is-draw' : '') },
        cardBurst(),
        queen ? h('span', { class: 'cq-crown-slot', 'aria-hidden': 'true' }, crownNode()) : null,
        queen ? restingPetals() : null,
        h('p', { class: 'gm-win-kicker' }, t('family.games.cq.hand_no', { n: v.hand_no || 1 })),
        h('h2', { class: 'gm-win-title cq-win-title' }, title),
        h('p', { class: 'cq-win-sub' }, kicker),
        r.reason === 'out' && r.stake ? h('p', { class: 'gm-win-points' }, h('b', null, '+' + r.stake), ' ', r.stake === 1 ? t('family.games.cq.result.point_word.one') : t('family.games.cq.result.point_word.other')) : null,
        matchLine ? h('p', { class: 'cq-match-line' }, matchLine) : null,
        v.room.settings.practice ? h('p', { class: 'gp-practice-note' }, t('family.games.cq.result.practice')) : null,
        v.room.settings.match_to ? h('ul', { class: 'gp-points' }, seats.map((s) => h('li', { class: r.winner === s.seat ? 'gp-winner' : '' },
          h('span', { class: 'gp-points-who' }, nameOf(v, s.seat)),
          h('b', null, t('family.games.cq.pts_of', { n: (r.points || [])[s.seat] || 0, m: v.room.settings.match_to }))))) : null,
        h('div', { class: 'gp-result-acts' },
          !over && nextOk ? h('button', { class: 'gm-btn gm-btn--go gp-btn cq-next', type: 'button', 'data-fk': 'next', disabled: this.busy, onclick: () => this.nextHand() }, t('family.games.cq.result.next')) : null,
          !over && !nextOk ? h('p', { class: 'cq-wait-next' }, t('family.games.cq.result.next_soon')) : null,
          !over ? h('button', { class: 'gm-btn gp-btn gp-btn-quiet', type: 'button', 'data-fk': 'see-table', onclick: () => { this.hideResultV = v.v; this.render(); } }, t('family.games.cq.result.see_table')) : null,
          over && v.me ? h('button', { class: 'gm-btn gm-btn--go gp-btn cq-rematch', type: 'button', 'data-fk': 'rematch', disabled: this.busy, onclick: () => this.rematch() }, t('family.games.cq.result.again')) : null,
          over ? h('a', { class: 'gm-btn gp-btn gp-btn-quiet', href: this.ctx.backHash || '#/games/conquian', 'data-fk': 'back2' }, t('family.games.cq.back')) : null)));
  }
}

// exported for the smoke test
export { CqScreen };
