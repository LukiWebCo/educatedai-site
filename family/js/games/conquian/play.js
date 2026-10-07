// Conquián: the phone play screen (#/games/r/:id when room.game is "conquian"). contracts/conquian.md §4–§10.
//
//   import { playView } from './conquian/play.js';
//   const stop = await playView(root, ctx);   // the same ctx index.js gives the Dots screen (getView, act, onView,
//                                             // refresh, sfx, hint, reclaim, roomId, hideBack)
//
// Layout, top to bottom (390 px first): whose turn · the other players (name, cards in hand, their melds) · the
// felt with the pile, the card in the middle and the dead pile · your melds · the tray: what to do, your hand
// (fanned) and the big buttons. Everything is a tap; building a take is "tap your cards, they join the middle
// card", with live checking from melds.js. Full rebuild on every change (cheap), with one-render animation flags
// so nothing replays. Motion lives in games-conquian.css under prefers-reduced-motion: no-preference.
import { h, icon, clear } from '../../dom.js';
import { currentLang, t } from '../../i18n.js';
import { backPile, cardName, cardNode, hasArt, meldNode, probeArt } from './cards.js';
import { fits, sortHand } from './melds.js';
import { Take } from './stage.js';
import { cambioPick, deciding, discarding, myMove, phaseOf } from './view.js';
import { cardSound } from './sound.js';
import { errMsg, evText, hintWhy, newsLine, takeWhy, whyText } from './text.js';
import { cardBurst, celebrate, crownNode, restingPetals, stamp } from './fx.js';
import { CqCoach } from './coach.js';
import { maybeFirstRules } from './rules.js';

const SORT_KEY = 'eai.games.cq.sort';

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

class CqScreen {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.view = null;
    this.take = null;          // the take being built (stage.js), only while you're deciding
    this.building = false;
    this.pick = null;          // the hand card chosen to discard / pass in the cambio
    this.guide = null;         // the Smart Hint being shown
    this.guideBusy = false;
    this.busy = false;
    this.msg = null;
    this.msgTimer = null;
    this.fx = {};
    this.sortBy = 'suit';
    try { if (localStorage.getItem(SORT_KEY) === 'rank') this.sortBy = 'rank'; } catch { /* default */ }
    this.history = false;
    this.hideResultV = null;
    this.alive = true;
    this.title0 = document.title;
    this.snd = cardSound(ctx.sfx);
    this.coach = null;
    this.queue = Promise.resolve();
  }

  sfx(name) { try { this.ctx.sfx && this.ctx.sfx.play(name); } catch { /* optional */ } }

  async start() {
    document.body.classList.add('games-play', 'games-cq');
    this.root.classList.add('gp-root', 'cq-root');
    this.hash0 = location.hash;
    this.onHash = () => { if (!this.root.isConnected || !location.hash.startsWith(this.hash0.split('/').slice(0, 4).join('/'))) this.destroy(); };
    window.addEventListener('hashchange', this.onHash);
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
    document.body.classList.remove('games-play', 'games-cq');
    document.title = this.title0;
    window.removeEventListener('hashchange', this.onHash);
    clearInterval(this.tick);
    clearTimeout(this.msgTimer);
    if (this.coach && this.coach.unwatch) this.coach.unwatch();
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
      this.building = !!(this.take && v.center && v.center.forced);
      // Forced: the card fits one of your melds as it is (that's the rule), so it's already sitting there.
      if (this.building) {
        const me = (v.seats || []).find((s) => s.seat === v.me.seat) || {};
        const i = (me.melds || []).findIndex((m) => fits(m, v.center.card));
        if (i >= 0) { this.take.pick(v.center.card.id); this.take.drop('t' + i); this.take.sig0 = this.take.sig(); }
      }
      if (!prev || prev.v !== v.v) this.guide = null;
    }
    const hand = (v.me && v.me.hand) || [];
    if (this.pick != null && !hand.some((c) => c.id === this.pick)) this.pick = null;
    if (!discarding(v) && !cambioPick(v)) this.pick = null;
    if (prev) this.diffFx(prev, v); else this.fx = { deal: true };
    if (deciding(v) && (!prev || this.fx.flip || this.fx.yourTurn)) this.scrollTo = this.building ? '.cq-mine' : '.cq-mid';
    else if (myMove(v) && (!prev || this.fx.yourTurn)) this.scrollTo = '.cq-mid';
    if (this.coach) this.coach.onView(v, prev);
    // a lesson on screen: keep its words in sight (the hand and the card on offer are in the tray anyway)
    if (this.scrollTo && this.coach && this.coach.step) this.scrollTo = '.cq-coach';
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
    if (myMove(v) && !myMove(prev)) { fx.yourTurn = true; this.sfx('your_turn'); }
    const lastEv = (x) => ((x.events || []).slice(-1)[0] || {}).v;
    fx.ticker = lastEv(prev) !== lastEv(v);
    if (v.result && (!prev.result || prev.hand_no !== v.hand_no || prev.result.reason !== v.result.reason)) {
      fx.result = true;
      if (v.result.reason === 'out' && v.me && v.result.winner === v.me.seat) { this.sfx('win'); this.snd.play('win'); }
    }
    this.fx = fx;
  }

  flash(text, kind = 'info', ms = 3600) {
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
    if (this.busy) return;
    const v = this.view;
    if (deciding(v)) {
      if (!this.take) return;
      if (!this.building) this.scrollTo = '.cq-mine';
      this.building = true;
      const res = this.take.tapHand(id);
      if (res.ok) {
        const g = res.key && this.take.info(this.take.group(res.key));
        this.fx = { put: id };
        this.snd.play(g && g.valid ? 'snap' : 'flip');
        this.followGuide(id);
      }
    } else if (discarding(v) || cambioPick(v)) {
      this.pick = this.pick === id ? null : id;
      this.fx = { lift: id };
      this.snd.play('flip');
    } else return;
    this.render();
  }

  startBuild() {
    if (!this.take) return;
    this.building = true;
    this.scrollTo = '.cq-mine';
    this.render();
  }

  cancelBuild() {
    if (!this.take) return;
    this.take.reset();
    this.building = !!(this.view.center && this.view.center.forced);
    this.render();
  }

  pickTable(id) {
    if (!this.take || this.busy) return;
    this.building = true;
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

  async meSirve() {
    if (!this.take) return;
    if (!this.building) { this.startBuild(); return; }
    const st = this.take.status();
    if (!st.ok) {
      this.snd.play('bad');
      this.flash(takeWhy(st.why) || t('family.games.cq.take.bad'), 'warn');
      this.shake = true;
      this.render();
      return;
    }
    const ok = await this.send(this.take.action());
    if (ok) this.snd.play('snap');
  }

  async pass(force) {
    if (force) await stamp(this.root.querySelector('.cq-center-card') || this.root, { sound: () => this.snd.play('stamp') });
    await this.send(force ? { type: 'pass', force: true } : { type: 'pass' });
  }

  async discard(force) {
    if (this.pick == null) { this.flash(t('family.games.cq.msg.pick_discard'), 'warn'); this.render(); return; }
    const id = this.pick;
    if (force) await stamp(this.root.querySelector(`.cq-hand [data-id="${id}"]`) || this.root, { sound: () => this.snd.play('stamp') });
    const ok = await this.send(force ? { type: 'discard', card: id, force: true } : { type: 'discard', card: id });
    if (ok) { this.pick = null; this.snd.play('flip'); }
  }

  async cambio() {
    if (this.pick == null) { this.flash(t('family.games.cq.msg.pick_cambio'), 'warn'); this.render(); return; }
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

  // ---- the Smart Hint ----------------------------------------------------------------------------------------------
  async toggleHint() {
    if (this.guide) { this.guide = null; this.render(); return; }
    if (this.guideBusy || this.busy || !this.ctx.hint || !myMove(this.view)) return;
    this.guideBusy = true;
    this.render();
    const v0 = this.view.v;
    let res = null;
    try { res = await this.ctx.hint(); } catch { res = null; }
    this.guideBusy = false;
    if (!this.alive) return;
    if (!res || !res.hint) this.flash(t('family.games.cq.msg.refused'), 'warn');
    else if (v0 === this.view.v) this.guide = { ...res.hint };
    this.render();
  }

  // Lay the suggested take out on your table (you still tap ¡Me sirve! yourself).
  showMe() {
    const g = this.guide;
    if (!g || !g.melds || !this.take) return;
    this.take.reset();
    if (this.take.applyLayout(g.melds)) { this.building = true; this.scrollTo = '.cq-mine'; this.guide = { ...g, shown: true }; this.snd.play('snap'); }
    this.render();
  }

  followGuide(id) {
    const g = this.guide;
    if (!g || g.kind !== 'take' || !g.melds) return;
    if (!g.melds.flat().includes(id)) { this.guide = null; this.flash(t('family.games.cq.hint.off'), 'info'); }
  }

  // ---- render --------------------------------------------------------------------------------------------------
  render() {
    if (!this.alive) return;
    const v = this.view;
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    const node = h('div', { class: 'gp cq' + (hasArt() ? ' cq-art-on' : '') + (this.busy ? ' gp-busy' : '') + (this.building ? ' cq-building' : '') + (v.reina ? ' cq-reina' : '') },
      this.renderStrip(v),
      this.coach ? this.coach.node() : null,
      h('section', { class: 'cq-table gm-felt cq-felt', 'aria-label': t('family.games.cq.table') },
        this.renderOpps(v),
        this.renderMiddle(v),
        this.renderForced(v)),
      this.renderMine(v),
      v.me ? this.renderTray(v) : h('p', { class: 'gp-watch' }, icon('help', 'icon icon-inline'), t('family.games.cq.watching')),
      this.renderResult(v));
    clear(this.root).append(node);
    this.decorateGuide();
    if (this.coach) this.coach.decorate(this.root);
    if (this.fx.stamp) { const el = this.root.querySelector('.cq-center-card'); if (el) stamp(el, { sound: () => this.snd.play('stamp'), stay: true }); }
    if (this.fx.result && v.result && v.result.reason === 'out') {
      const card = this.root.querySelector('.cq-win');
      if (card) celebrate(card, { queen: !!(v.reina && v.me && v.result.winner === v.me.seat) });
    }
    this.fx = {};
    this.shake = false;
    document.title = myMove(v) ? '● ' + t('family.games.cq.turn.you_short') : this.title0;
    if (fk) {
      const again = this.root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    const tray = this.root.querySelector('.cq-tray');
    this.root.style.setProperty('--gp-tray-h', (tray ? Math.ceil(tray.getBoundingClientRect().height) : 0) + 'px');
    if (this.scrollTo) { const sel = this.scrollTo; this.scrollTo = null; requestAnimationFrame(() => this.reveal(sel)); }
  }

  // Bring a part of the table into view just above the tray (it covers the bottom of the screen).
  reveal(sel) {
    const el = this.root.querySelector(sel);
    const tray = this.root.querySelector('.cq-tray');
    if (!el || !tray) return;
    const r = el.getBoundingClientRect();
    const bottom = window.innerHeight - tray.getBoundingClientRect().height - 10;
    // the app's top bar is sticky: never tuck the top of the part under it
    const bar = document.querySelector('.topbar');
    const top = (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0) + 8;
    let dy = 0;
    if (r.bottom > bottom) dy = r.bottom - bottom;
    if (r.top - dy < top) dy = r.top - top;
    if (Math.abs(dy) > 4) window.scrollBy({ top: dy, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  turnText(v) {
    const ph = phaseOf(v);
    if (ph === 'over' || (v.result && v.result.match_over)) return t('family.games.cq.turn.over');
    if (ph === 'between') return t('family.games.cq.turn.between');
    if (ph === 'cambio') return cambioPick(v) ? t('family.games.cq.turn.cambio_you', { name: nameOf(v, leftOf(v, v.me.seat)) }) : t('family.games.cq.turn.cambio_wait');
    if (ph === 'offer' && v.center) {
      if (deciding(v)) return v.center.forced ? t('family.games.cq.turn.forced') : t('family.games.cq.turn.offer_you');
      return t('family.games.cq.turn.offer_other', { name: nameOf(v, v.center.to) });
    }
    if (ph === 'discard') return discarding(v) ? t('family.games.cq.turn.discard_you') : t('family.games.cq.turn.discard_other', { name: nameOf(v, v.turn.seat) });
    return '';
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

  renderStrip(v) {
    const mine = myMove(v);
    const turn = h('div', { class: 'gp-turn' + (mine ? ' gp-turn-mine' : '') + (this.fx.yourTurn ? ' gp-turn-pop' : ''), role: 'status', 'aria-live': 'polite' },
      mine ? h('span', { class: 'gp-ball', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'gp-turn-lines' },
        h('span', { class: 'gp-turn-text' }, this.turnText(v)),
        h('span', { class: 'gp-clock' }, this.clockText())));
    const info = h('p', { class: 'cq-info' },
      h('span', null, v.variant === 'familia' ? t('family.games.cq.variant.familia') : t('family.games.cq.variant.classic')),
      h('span', null, t('family.games.cq.hand_no', { n: v.hand_no || 1 })),
      v.stake > 1 ? h('span', { class: 'cq-stake' }, t('family.games.cq.stake', { n: v.stake })) : null,
      h('span', null, t('family.games.cq.goal', { n: v.target })));
    return h('header', { class: 'gp-strip cq-strip' },
      h('div', { class: 'gp-strip-row' }, turn),
      info,
      this.renderCovered(v),
      this.renderTicker(v));
  }

  renderCovered(v) {
    const mine = v.me && seatOf(v, v.me.seat);
    if (!mine || !mine.covering_bot || !this.ctx.reclaim || phaseOf(v) === 'over') return null;
    return h('div', { class: 'gp-covered', role: 'status' },
      h('span', { class: 'gp-covered-text' }, t('family.games.cq.covered')),
      h('button', {
        class: 'gm-btn gm-btn--go gp-btn gp-takeback', type: 'button', 'data-fk': 'takeback', disabled: this.busy,
        onclick: async () => { try { await this.ctx.reclaim(); } catch { this.flash(t('family.games.cq.msg.refused'), 'warn'); this.render(); } },
      }, t('family.games.cq.take_back')));
  }

  renderTicker(v) {
    const evs = (v.events || []).map(evText).filter(Boolean);
    if (!evs.length) return null;
    const news = newsLine(v.events);
    const last = news.text;
    const btn = h('button', { class: 'cq-ticker' + (this.fx.ticker ? ' gp-ticker-new' : ''), type: 'button', 'data-fk': 'ticker', 'aria-expanded': String(this.history),
      onclick: () => { this.history = !this.history; this.render(); } },
    h('span', { class: 'gp-tick-dot', 'aria-hidden': 'true' }), h('span', { class: 'cq-ticker-text', 'aria-live': 'polite' }, last),
    h('span', { class: 'cq-ticker-more', 'aria-hidden': 'true' }, this.history ? '−' : '+'));
    return h('div', { class: 'cq-tick-wrap' }, btn,
      this.history ? h('ol', { class: 'cq-history', 'aria-label': t('family.games.cq.history') }, evs.slice(0, evs.length - news.n).slice(-7).reverse().map((x) => h('li', null, x))) : null);
  }

  // The other players: one row each, top of the felt.
  renderOpps(v) {
    const others = (v.seats || []).filter((s) => !v.me || s.seat !== v.me.seat);
    const ph = phaseOf(v);
    return h('ul', { class: 'cq-opps', 'aria-label': t('family.games.cq.players') }, others.map((s) => {
      const on = (ph === 'offer' && v.center && v.center.to === s.seat) || (ph === 'discard' && v.turn.seat === s.seat);
      const label = t('family.games.cq.opp_aria', { name: s.name, n: s.hand_count, m: s.melded || 0, target: v.target });
      return h('li', { class: 'cq-opp' + (on ? ' is-on' : '') + (s.away ? ' is-away' : ''), 'aria-label': label },
        h('div', { class: 'cq-opp-head' },
          h('span', { class: 'cq-opp-name' }, s.name, s.bot || s.covering_bot ? h('span', { class: 'gp-bot', 'aria-hidden': 'true' }, ' ✦') : null),
          v.dealer === s.seat ? h('span', { class: 'cq-chip cq-chip-dealer' }, t('family.games.cq.dealer')) : null,
          ph === 'cambio' ? h('span', { class: 'cq-chip' + (s.cambio_done ? ' is-done' : '') }, s.cambio_done ? t('family.games.cq.cambio_ready') : t('family.games.cq.cambio_choosing')) : null,
          h('span', { class: 'grow' }),
          backPile(s.hand_count, { reina: !!v.reina, size: 'xs', cls: 'cq-opp-hand' }),
          h('span', { class: 'cq-chip cq-chip-melded', 'aria-hidden': 'true' }, `${s.melded || 0}/${v.target}`),
          v.room.settings.match_to ? h('span', { class: 'cq-chip cq-chip-pts', 'aria-hidden': 'true' }, t('family.games.cq.pts', { n: s.points || 0 })) : null),
        (s.melds || []).length ? h('div', { class: 'cq-opp-melds' }, s.melds.map((m) => meldNode(m, { size: 's', fresh: this.fx.enter }))) : null);
    }));
  }

  // The pile, the card in the middle, the dead pile.
  renderMiddle(v) {
    const c = v.center;
    let centerEl;
    if (c && c.card && phaseOf(v) === 'offer') {
      const taken = this.building && this.take && this.take.where(c.card.id);
      const byMe = v.me && c.by === v.me.seat;
      const from = c.from === 'stock'
        ? (byMe ? t('family.games.cq.center.turned_you') : t('family.games.cq.center.turned', { name: nameOf(v, c.by) }))
        : (byMe ? t('family.games.cq.center.thrown_you') : t('family.games.cq.center.thrown', { name: nameOf(v, c.by) }));
      const to = v.me && c.to === v.me.seat ? t('family.games.cq.center.for_you') : t('family.games.cq.center.for', { name: nameOf(v, c.to) });
      centerEl = h('div', { class: 'cq-center' + (v.me && c.to === v.me.seat ? ' is-mine' : '') },
        taken
          ? h('span', { class: 'cq-card cq-l cq-slot cq-center-card', 'aria-label': t('family.games.cq.center.in_meld') }, h('span', { class: 'cq-slot-arrow', 'aria-hidden': 'true' }, '↓'))
          : cardNode(c.card, { size: 'l', cls: 'cq-center-card' + (this.fx.flip ? ' is-flip' : '') + (c.forced ? ' is-forced' : ''),
            tag: deciding(v) && this.building ? 'button' : 'span', onclick: () => this.pickTable(c.card.id), attrs: { 'data-fk': 'center' } }),
        h('span', { class: 'cq-center-from' }, from),
        h('span', { class: 'cq-center-to' }, to, c.step === 2 ? h('span', { class: 'cq-last' }, ' · ', t('family.games.cq.center.last')) : null));
    } else if (phaseOf(v) === 'discard' && v.turn) {
      centerEl = h('div', { class: 'cq-center' }, h('span', { class: 'cq-card cq-l cq-slot cq-center-card' }),
        h('span', { class: 'cq-center-from' }, discarding(v) ? t('family.games.cq.center.your_throw') : t('family.games.cq.center.waiting_throw', { name: nameOf(v, v.turn.seat) })));
    } else {
      centerEl = h('div', { class: 'cq-center' }, h('span', { class: 'cq-card cq-l cq-slot cq-center-card' }));
    }
    const stock = h('div', { class: 'cq-pilebox' },
      backPile(v.stock_left || 0, { reina: !!v.reina, size: 'm', label: t('family.games.cq.stock_aria', { n: v.stock_left || 0 }), cls: 'cq-stock' + ((v.stock_left || 0) <= 3 ? ' is-low' : '') }),
      h('span', { class: 'cq-pile-l', 'aria-hidden': 'true' }, t('family.games.cq.stock')));
    const dead = h('div', { class: 'cq-pilebox' },
      h('span', { class: 'cq-dead', role: 'img', 'aria-label': v.dead_top ? t('family.games.cq.dead_aria', { n: v.dead_count || 0, card: cardName(v.dead_top) }) : t('family.games.cq.dead_none') },
        v.dead_top ? cardNode(v.dead_top, { size: 'm', label: '', cls: 'cq-dead-top' }) : h('span', { class: 'cq-card cq-m cq-empty', 'aria-hidden': 'true' }),
        v.dead_count ? h('b', { class: 'cq-pile-n', 'aria-hidden': 'true' }, String(v.dead_count)) : null),
      h('span', { class: 'cq-pile-l', 'aria-hidden': 'true' }, t('family.games.cq.dead')));
    return h('div', { class: 'cq-mid' }, stock, centerEl, dead);
  }

  renderForced(v) {
    if (!v.center || !v.center.forced || phaseOf(v) !== 'offer') return null;
    const mine = deciding(v);
    return h('p', { class: 'cq-forced' + (mine ? ' is-mine' : ''), role: 'status' },
      h('b', null, t('family.games.cq.btn.force')), ' ',
      mine ? t('family.games.cq.forced.you', { name: nameOf(v, v.center.by) }) : t('family.games.cq.forced.other', { a: nameOf(v, v.center.by), b: nameOf(v, v.center.to) }));
  }

  // Your melds: as they are, or (while building a take) the groups you're arranging, each checked live.
  renderMine(v) {
    if (!v.me) return null;
    const meSeat = seatOf(v, v.me.seat) || {};
    const head = h('h2', { class: 'cq-mine-h' }, h('span', null, t('family.games.cq.your_melds')),
      h('span', { class: 'cq-count' }, t('family.games.cq.melded', { n: (this.building && this.take ? this.take.status().count : meSeat.melded) || 0, target: v.target })));
    if (!(this.building && this.take)) {
      const melds = meSeat.melds || [];
      return h('section', { class: 'cq-mine' }, head,
        melds.length ? h('div', { class: 'cq-mine-melds' }, melds.map((m) => meldNode(m, { size: 'm', fresh: this.fx.enter })))
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
            h('span', { class: 'cq-group-why' + (g.valid ? ' is-ok' : '') }, g.cards.length ? (g.valid ? '✓ ' + label : label) : ''),
            holding && tk.where(tk.held) && tk.where(tk.held).key !== g.key
              ? h('button', { class: 'cq-put gm-target', type: 'button', 'data-fk': 'put-' + g.key, onclick: () => this.dropOn(g.key) }, h('span', { 'aria-hidden': 'true' }, '↓ '), t('family.games.cq.put_here'))
              : !holding && centerLoose && g.orig && g.valid && fits(g.cards, center) ? h('button', { class: 'cq-put gm-target', type: 'button', 'data-fk': 'put-' + g.key, onclick: () => this.moveCenter(g.key) },
                h('span', { 'aria-hidden': 'true' }, '↓ '), t('family.games.cq.put_center', { card: cardName(center) }))
                : !active && !holding && tk.handLeft().length ? h('button', { class: 'cq-use', type: 'button', 'data-fk': 'use-' + g.key, onclick: () => this.dropOn(g.key) }, t('family.games.cq.add_here')) : null));
      }),
      h('button', { class: 'cq-newmeld gm-target', type: 'button', 'data-fk': 'newmeld', onclick: () => this.newMeld() },
        h('span', { class: 'gp-plus', 'aria-hidden': 'true' }, '+'), holding ? t('family.games.cq.put_new') : t('family.games.cq.new_meld'))));
  }

  // ---- the tray ------------------------------------------------------------------------------------------------
  statusText(v) {
    if (this.busy) return t('family.games.cq.msg.sending');
    if (this.msg) return this.msg.text;
    const ph = phaseOf(v);
    // what the Cambio brought (the card also wears a NEW tag) — unless there's something to do right now
    if (v.me.got && ph !== 'cambio' && !deciding(v) && !discarding(v)) return t('family.games.cq.msg.got', { card: cardName(v.me.got), name: nameOf(v, rightOf(v, v.me.seat)) });
    if (cambioPick(v)) return this.pick != null ? t('family.games.cq.msg.cambio_ready', { card: cardName(this.cardById(this.pick)), name: nameOf(v, leftOf(v, v.me.seat)) }) : t('family.games.cq.msg.cambio_pick');
    if (ph === 'cambio') return v.me.pick ? t('family.games.cq.msg.cambio_sent', { card: cardName(v.me.pick), name: nameOf(v, leftOf(v, v.me.seat)) }) : t('family.games.cq.msg.cambio_wait');
    if (deciding(v)) {
      if (!this.building) {
        if (v.me.can && v.me.can.take === false) return v.me.hand.length ? t('family.games.cq.msg.no_fit') : t('family.games.cq.msg.last_one_pass');
        return t('family.games.cq.msg.offer');
      }
      const st = this.take.status();
      if (this.take.held != null) return t('family.games.cq.take.holding');   // mid-move: finish it first
      if (st.out) return t('family.games.cq.msg.out_ready');
      if (st.ok && v.center.forced && !this.take.dirty()) return t('family.games.cq.msg.forced_ready');
      if (st.ok) return t('family.games.cq.msg.take_ready');
      if (st.why === 'holding') return t('family.games.cq.take.holding');
      if (this.take.groups.every((g) => g.orig || g.cards.length <= 1)) return t('family.games.cq.msg.build');
      return takeWhy(st.why);
    }
    if (discarding(v)) {
      if (this.pick == null) return t('family.games.cq.msg.discard');
      const fc = (v.me.can && v.me.can.force_discard) || [];
      return fc.includes(this.pick) ? t('family.games.cq.msg.discard_force', { card: cardName(this.cardById(this.pick)), name: nameOf(v, leftOf(v, v.me.seat)) })
        : t('family.games.cq.msg.discard_ready', { card: cardName(this.cardById(this.pick)) });
    }
    if (ph === 'between' || ph === 'over') return '';
    if (!(v.me.hand || []).length) return t('family.games.cq.msg.last_one');
    return t('family.games.cq.msg.wait');
  }

  cardById(id) { return ((this.view.me && this.view.me.hand) || []).find((c) => c.id === id) || null; }

  renderTray(v) {
    const me = v.me;
    const ph = phaseOf(v);
    const parts = [];
    if (this.guide || this.guideBusy) parts.push(this.renderGuide());
    const hintsOn = v.room.settings.hints !== false && !!this.ctx.hint;
    const hintBtn = hintsOn && myMove(v)
      ? h('button', { class: 'gp-hint-btn cq-hint-btn' + (this.guide ? ' on' : '') + (this.guideBusy ? ' is-busy' : ''), type: 'button', 'data-fk': 'hint',
        'aria-pressed': String(!!this.guide), 'aria-label': this.guide ? t('family.games.cq.hint.close') : t('family.games.cq.hint.open'), onclick: () => this.toggleHint() },
      icon('lamp', 'icon gp-hint-bulb'), h('span', { class: 'gp-hint-word', 'aria-hidden': 'true' }, t('family.games.cq.hint.btn')))
      : null;
    const kind = this.msg ? this.msg.kind : (deciding(v) && this.building ? (this.take.status().ok ? 'good' : 'info') : 'info');
    const sortBtn = (me.hand || []).length > 1
      ? h('button', { class: 'cq-sort-btn', type: 'button', 'data-fk': 'sort', title: t('family.games.cq.sort'),
        'aria-label': t('family.games.cq.sort') + ': ' + (this.sortBy === 'rank' ? t('family.games.cq.sort_rank') : t('family.games.cq.sort_suit')),
        onclick: () => this.setSort(this.sortBy === 'rank' ? 'suit' : 'rank') },
      h('span', { class: 'cq-sort-ico', 'aria-hidden': 'true' }, '⇅'), h('span', { 'aria-hidden': 'true' }, this.sortBy === 'rank' ? t('family.games.cq.sort_rank') : t('family.games.cq.sort_suit')))
      : null;
    // the card on offer, small, right where you decide (the big one sits on the felt above)
    const c = v.center;
    const mini = deciding(v) && c && !this.building
      ? cardNode(c.card, { size: 's', cls: 'cq-mini' + (c.forced ? ' is-forced' : '') }) : null;
    // Big text (sizes 3-4): the tray must stay low, so the Hint lamp moves into the button row and the sort
    // switch goes (the hand stays sorted by suit, or as last chosen).
    const big = Number(document.documentElement.dataset.textSize || 1) >= 3;
    parts.push(h('div', { class: 'gp-rack cq-rack' },
      mini,
      h('p', { class: 'gp-status gp-status-' + kind, role: 'status', 'aria-live': 'polite' }, this.statusText(v)),
      big ? null : h('span', { class: 'cq-tools' }, sortBtn, hintBtn)));

    // the hand, fanned
    const handCards = this.take && this.building ? this.take.handLeft() : (me.hand || []);
    const sorted = sortHand(handCards, this.sortBy);
    const canTap = !this.busy && (deciding(v) || discarding(v) || cambioPick(v));
    const fitsNext = new Set((me.can && me.can.force_discard) || []);
    const perRow = 5;
    const hand = h('div', { class: 'cq-hand' + (this.fx.deal ? ' is-dealing' : ''), role: 'group', 'aria-label': t('family.games.cq.your_hand', { n: me.hand.length }) },
      sorted.map((c, i) => {
        const col = i % perRow;
        const off = col - (Math.min(perRow, sorted.length - (i - col)) - 1) / 2;
        const cls = ['cq-hcard'];
        if (this.pick === c.id) cls.push('is-picked');
        if (this.fx.lift === c.id) cls.push('is-lift');
        if (me.got && me.got.id === c.id) cls.push('is-got');
        if (discarding(v) && fitsNext.has(c.id)) cls.push('is-fits-next');
        if (this.fx.deal) cls.push('is-deal');
        const node = cardNode(c, canTap ? { size: 'h', tag: 'button', cls: cls.join(' '), onclick: () => this.tapHand(c.id), attrs: { 'data-fk': 'h' + c.id } } : { size: 'h', cls: cls.join(' ') });
        node.style.setProperty('--i', String(i));
        node.style.setProperty('--rot', (off * 2.5).toFixed(2) + 'deg');
        node.style.setProperty('--dy', (off * off * 2).toFixed(1) + 'px');
        if (me.got && me.got.id === c.id) node.append(h('span', { class: 'gm-new', 'aria-hidden': 'true' }, t('family.games.cq.new_tag')));
        return node;
      }),
      !sorted.length ? h('span', { class: 'gp-hand-empty' }, t('family.games.cq.hand_empty')) : null);
    hand.style.setProperty('--n', String(Math.max(1, sorted.length)));   // big text: one overlapping row (CSS)
    parts.push(hand);

    // the big buttons
    const acts = h('div', { class: 'gp-actions cq-actions' });
    const can = me.can || {};
    if (cambioPick(v)) {
      acts.append(h('button', { class: 'gm-btn gm-btn--go gp-btn gp-btn-main cq-cambio-btn', type: 'button', 'data-fk': 'cambio', 'aria-disabled': String(this.pick == null), onclick: () => this.cambio() },
        t('family.games.cq.btn.cambio')));
    } else if (deciding(v)) {
      const forced = v.center.forced;
      const st = this.take ? this.take.status() : { ok: false };
      if (this.building && !forced) acts.append(h('button', { class: 'gm-btn gp-btn gp-btn-quiet cq-cancel', type: 'button', 'data-fk': 'cancel', disabled: this.busy, onclick: () => this.cancelBuild() }, t('family.games.cq.btn.cancel')));
      else if (this.building && forced && this.take.dirty()) acts.append(h('button', { class: 'gm-btn gp-btn gp-btn-quiet cq-cancel', type: 'button', 'data-fk': 'cancel', disabled: this.busy, onclick: () => this.cancelBuild() }, t('family.games.cq.btn.reset')));
      if (!this.building) {
        acts.append(h('button', { class: 'gm-btn gp-btn gp-btn-quiet cq-pass', type: 'button', 'data-fk': 'pass', disabled: this.busy || forced || can.pass === false, onclick: () => this.pass(false) }, t('family.games.cq.btn.pass')));
        if (can.force_pass && v.room.settings.forcing !== false) {
          acts.append(h('button', { class: 'gm-btn gp-btn cq-force', type: 'button', 'data-fk': 'force', disabled: this.busy, onclick: () => this.pass(true) },
            h('span', { class: 'cq-force-l' }, t('family.games.cq.btn.force')), h('small', null, t('family.games.cq.btn.force_pass_sub'))));
        }
      }
      acts.append(h('button', { class: 'gm-btn gm-btn--go gp-btn gp-btn-main cq-take' + (this.building && st.ok ? ' ready' : '') + (st.out ? ' is-out' : ''), type: 'button', 'data-fk': 'take',
        'aria-disabled': String(this.busy || (this.building && !st.ok) || can.take === false), disabled: can.take === false ? true : null, onclick: () => this.meSirve() },
      h('span', null, t('family.games.cq.btn.take')),
      this.building && st.out ? h('small', null, t('family.games.cq.btn.take_out')) : !this.building ? h('small', null, t('family.games.cq.btn.take_sub')) : null));
    } else if (discarding(v)) {
      const forceable = this.pick != null && fitsNext.has(this.pick) && v.room.settings.forcing !== false;
      acts.append(h('button', { class: 'gm-btn gm-btn--go gp-btn gp-btn-main cq-discard', type: 'button', 'data-fk': 'discard', 'aria-disabled': String(this.pick == null || this.busy), onclick: () => this.discard(false) },
        t('family.games.cq.btn.discard')));
      if (forceable) {
        acts.append(h('button', { class: 'gm-btn gp-btn cq-force', type: 'button', 'data-fk': 'discard-force', disabled: this.busy, onclick: () => this.discard(true) },
          h('span', { class: 'cq-force-l' }, t('family.games.cq.btn.force')), h('small', null, t('family.games.cq.btn.force_discard_sub'))));
      }
    } else if (ph === 'between' && this.hideResultV === v.v) {
      acts.append(h('button', { class: 'gm-btn gm-btn--go gp-btn', type: 'button', 'data-fk': 'show-result', onclick: () => { this.hideResultV = null; this.render(); } }, t('family.games.cq.result.show')));
    }
    if (big && hintBtn) acts.append(hintBtn);
    if (acts.childNodes.length) parts.push(acts);
    return h('footer', { class: 'gp-tray gm-tray cq-tray' + (myMove(v) ? ' gp-tray-mine' : '') }, h('div', { class: 'gp-tray-in' }, parts));
  }

  renderGuide() {
    const g = this.guide;
    if (!g) return h('div', { class: 'gp-guide', role: 'status', 'aria-live': 'polite' }, icon('lamp', 'icon gp-guide-bulb'), h('b', { class: 'gp-guide-why' }, t('family.games.cq.hint.thinking')));
    let step = '';
    if (g.kind === 'take') step = g.shown ? t('family.games.cq.hint.step.take_shown') : t('family.games.cq.hint.step.take');
    else if (g.kind === 'pass') step = g.force ? t('family.games.cq.hint.step.force') : t('family.games.cq.hint.step.pass');
    else if (g.kind === 'discard') {
      const card = cardName(this.cardById(g.card));
      step = g.force ? t('family.games.cq.hint.step.discard_force', { card }) : t('family.games.cq.hint.step.discard', { card });
    }
    else if (g.kind === 'cambio') step = t('family.games.cq.hint.step.cambio', { card: cardName(this.cardById(g.card)) });
    return h('div', { class: 'gp-guide', role: 'status', 'aria-live': 'polite' },
      icon('lamp', 'icon gp-guide-bulb'),
      h('div', { class: 'gp-guide-text' },
        h('b', { class: 'gp-guide-why' }, hintWhy(g)),
        step ? h('span', { class: 'gp-guide-step' }, step) : null,
        g.kind === 'take' && g.melds && !g.shown ? h('button', { class: 'gm-btn gp-btn cq-showme', type: 'button', 'data-fk': 'showme', onclick: () => this.showMe() }, t('family.games.cq.hint.show_me')) : null),
      h('button', { class: 'gp-guide-x', type: 'button', 'data-fk': 'guide-x', 'aria-label': t('family.games.cq.hint.close'), onclick: () => { this.guide = null; this.render(); } }, '×'));
  }

  decorateGuide() {
    const g = this.guide;
    if (!g || !myMove(this.view)) return;
    const r = this.root;
    const mark = (el, n) => {
      if (!el) return;
      el.classList.add('gp-target');
      if (n) el.append(h('span', { class: 'gp-target-n', 'aria-hidden': 'true' }, String(n)));
    };
    if (g.kind === 'take') {
      if (g.shown) mark(r.querySelector('.cq-take'));
      else if (g.melds) {
        let n = 0;
        const hand = new Set(((this.view.me && this.view.me.hand) || []).map((c) => c.id));
        g.melds.flat().filter((id) => hand.has(id)).forEach((id) => mark(r.querySelector(`.cq-hand [data-id="${id}"]`), ++n));
      }
    } else if (g.kind === 'pass') mark(r.querySelector(g.force ? '.cq-force' : '.cq-pass'));
    else if (g.kind === 'discard' || g.kind === 'cambio') {
      if (this.pick === g.card) mark(r.querySelector(g.kind === 'cambio' ? '.cq-cambio-btn' : g.force ? '.cq-force' : '.cq-discard'));
      else mark(r.querySelector(`.cq-hand [data-id="${g.card}"]`), 1);
    }
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
          over ? h('a', { class: 'gm-btn gp-btn gp-btn-quiet', href: '#/games', 'data-fk': 'back2' }, t('family.games.cq.back')) : null)));
  }
}

// exported for the smoke test
export { CqScreen };
