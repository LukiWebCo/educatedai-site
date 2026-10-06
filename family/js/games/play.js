// Dots & Lines: the phone play screen (#/games/r/:id). contracts/games.md §1, §6, §7; GAMES-PLAN.md C "Phone play".
//
//   import { playView } from './play.js';
//   const stop = await playView(root, ctx);   // fills `root`; call stop() (or remove root) to tear down
//
// ctx (from index.js, W3a):
//   roomId            number
//   getView()         -> the current view (§7), or a promise of it
//   act(action)       -> Promise<{v, ok}>; rejects with an error carrying .key (and .code) on a 409/4xx.
//                        play.js sets action.cid itself (a retry of the same action reuses it).
//   onView(cb)        -> subscribe to new views (cb(view)); may return an unsubscribe function
//   sfx?              {play(name)}: 'snap'|'place'|'invalid'|'flip'|'clear'|'your_turn'|'win' (W5's sfx.js)
//   openMarket?()     shows the Market sheet;  openRules?() shows the one-screen rules;  backHash? ('#/games')
//   hideBack?         true when the room bar above already has the way back (index.js)
//   reclaim?()        take the seat back from Claude after missed turns (the "I'm back!" banner)
//   hint?()           -> Promise<{v, hint}>: the Smart Hint (GET /hint, read-only); the lamp walks you through it
//
// Rendering is a full rebuild with h() on every change (cheap at this size); animation classes are added only to
// the elements that just changed, so nothing replays. Motion lives in games-play.css under
// prefers-reduced-motion: no-preference.
import { h, icon, clear } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import * as Lines from './lines.js';
import { Staging } from './staging.js';
import { applyArt, dotName, dotNode } from './dots.js';
import { Coach } from './coach.js';

const check = Lines.check || Lines.checkLine || Lines.default;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));
let artTried = false;

export async function playView(root, ctx) {
  const screen = new PlayScreen(root, ctx);
  await screen.start();
  return () => screen.destroy();
}

function whyText(why) {
  switch (why) {
    case 'short': return t('family.games.play.why.short');
    case 'long': return t('family.games.play.why.long');
    case 'gap': return t('family.games.play.why.gap');
    case 'dup': return t('family.games.play.why.dup');
    case 'suit_twice': return t('family.games.play.why.suit_twice');
    case 'spark_as': return t('family.games.play.why.spark_as');
    case 'all_sparks': return t('family.games.play.why.all_sparks');
    default: return t('family.games.play.why.mixed');
  }
}

function guideWhy(why) {
  switch (why) {
    case 'fits': return t('family.games.play.guide.why.fits');
    case 'with_hand': return t('family.games.play.guide.why.with_hand');
    case 'new_line': return t('family.games.play.guide.why.new_line');
    case 'move': return t('family.games.play.guide.why.move');
    case 'hand': return t('family.games.play.guide.why.hand');
    case 'swap': return t('family.games.play.guide.why.swap');
    case 'swapped': return t('family.games.play.guide.why.swapped');
    default: return t('family.games.play.guide.why.done');
  }
}

function guideStepText(step) {
  switch (step.op) {
    case 'pick':
      if (step.from === 'stack') return t('family.games.play.guide.step.pick_stack');
      if (step.from === 'table') return t('family.games.play.guide.step.pick_table');
      return t('family.games.play.guide.step.pick_hand');
    case 'put': return t('family.games.play.guide.step.put');
    case 'new': return t('family.games.play.guide.step.new');
    case 'place': return t('family.games.play.guide.step.place');
    case 'swap': return t('family.games.play.guide.step.swap');
    case 'swap_dot': return t('family.games.play.guide.step.swap_dot');
    default: return t('family.games.play.guide.step.done');
  }
}

function stageErrText(code) {
  switch (code) {
    case 'locked': return t('family.games.play.msg.locked');
    case 'simple': return t('family.games.play.msg.simple');
    case 'table_to_hand': return t('family.games.play.msg.table_to_hand');
    case 'not_turn': return t('family.games.play.msg.not_turn');
    default: return '';
  }
}

function cid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return 'p' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function clock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(currentLang() === 'es' ? 'es-MX' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

class PlayScreen {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.view = null;
    this.st = null;
    this.mode = 'stage';          // 'stage' | 'swap'
    this.splitKey = null;
    this.guide = null;            // the Smart Hint being followed: {kind, why, clears, steps, i}
    this.guideBusy = false;
    this.guideSpot = null;        // the step last scrolled to
    this.coach = null;            // Practice: the 6-step coach (coach.js)
    this.check = check;
    this.busy = false;
    this.clearing = false;        // a cleared line is bursting: the table on screen is stale, hands off
    this.msg = null;              // {text, kind} transient status line
    this.msgTimer = null;
    this.fx = {};                 // one-render animation flags
    this.shake = false;
    this.tick = null;
    this.title0 = document.title;
    this.unsub = null;
    this.alive = true;
    this.queue = Promise.resolve();
  }

  sfx(name) { try { this.ctx.sfx && this.ctx.sfx.play(name); } catch { /* sound is optional */ } }

  async start() {
    document.body.classList.add('games-play');
    this.root.classList.add('gp-root');
    // Leaving the room (any hash outside #/games/r/<id>) tears down, even before the router swaps the view.
    this.hash0 = location.hash;
    this.onHash = () => { if (!this.root.isConnected || !location.hash.startsWith(this.hash0.split('/').slice(0, 4).join('/'))) this.destroy(); };
    window.addEventListener('hashchange', this.onHash);
    if (!artTried) {
      artTried = true;
      fetch('games-assets/dots.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).then(applyArt).catch(() => {});
    }
    const v = await this.ctx.getView();
    if (v.room && v.room.settings && v.room.settings.coach && v.me) this.coach = new Coach(this, this.ctx.roomId);
    this.setView(v, true);
    const un = this.ctx.onView && this.ctx.onView((nv) => { this.queue = this.queue.then(() => this.receive(nv)); });
    this.unsub = typeof un === 'function' ? un : null;
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.measureTray()) : null;
    this.tick = setInterval(() => this.updateClock(), 1000);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    document.body.classList.remove('games-play');
    document.title = this.title0;
    window.removeEventListener('hashchange', this.onHash);
    clearInterval(this.tick);
    clearTimeout(this.msgTimer);
    if (this.ro) this.ro.disconnect();
    if (this.unsub) this.unsub();
  }

  storeKey(v) { return `eai.games.${this.ctx.roomId}:${v}`; }

  save() {
    try {
      if (this.st && this.st.dirty()) sessionStorage.setItem(this.storeKey(this.view.v), JSON.stringify(this.st.snapshot()));
      else sessionStorage.removeItem(this.storeKey(this.view.v));
    } catch { /* private mode */ }
  }

  setView(v, first) {
    const prev = this.view;
    if (prev && prev.v !== v.v) { try { sessionStorage.removeItem(this.storeKey(prev.v)); } catch { /* ignore */ } }
    let snap = null;
    try { snap = JSON.parse(sessionStorage.getItem(this.storeKey(v.v)) || 'null'); } catch { /* ignore */ }
    // A new version that changed nothing under your hands (someone's Market offer, a seat joining, a spectator)
    // keeps what you're arranging; anything that touched the table, your hand or your Stack drops it.
    const carry = !snap && prev && this.st && this.st.dirty() && baseSig(prev) === baseSig(v);
    if (carry) snap = { ...this.st.snapshot(), v: v.v };
    this.view = v;
    this.st = Staging.restore(v, check, snap);
    if (carry) { this.save(); } else {
      if (prev && prev.v !== v.v && this.msg && this.msg.kind !== 'warn') { this.msg = null; clearTimeout(this.msgTimer); }   // "tap Place…" is old news
      this.mode = 'stage';
      this.splitKey = null;
      if (!prev || prev.v !== v.v) this.guide = null;   // the hint was for the table that just changed
    }
    if (!first && prev) this.diffFx(prev, v);
    if (this.coach) this.coach.onView(v, prev);
    this.render();
  }

  async receive(v) {
    if (!this.alive) return;
    if (!this.root.isConnected) { this.destroy(); return; }
    if (this.view && v.v === this.view.v) return;
    // Lines whose dots all left the table just cleared: let them burst before the new table replaces them.
    if (this.view) {
      const now = new Set((v.table || []).flatMap((L) => L.dots.map((d) => d.id)));
      const gone = [...this.root.querySelectorAll('.gp-line[data-ids]')].filter((el) => {
        const ids = el.dataset.ids.split(',').filter(Boolean).map(Number);
        return ids.length >= 3 && ids.every((id) => !now.has(id));
      });
      if (gone.length) {
        // Hands off while it bursts: the table on screen is already old, so a tap now would build a stale Place.
        this.clearing = true;
        this.root.querySelectorAll('.gp-tray button, .gp-table button').forEach((b) => { b.disabled = true; });
        gone.forEach((el) => el.classList.add('is-clearing', 'gp-clearing'));
        this.sfx('clear');
        await wait(720);
        this.clearing = false;
      }
    }
    this.setView(v, false);
  }

  diffFx(prev, v) {
    const fx = {};
    const before = new Set((prev.table || []).flatMap((L) => L.dots.map((d) => d.id)));
    const lineIds = new Set((prev.table || []).map((L) => L.id));
    fx.newDots = new Set((v.table || []).flatMap((L) => L.dots.map((d) => d.id)).filter((id) => !before.has(id)));
    fx.newLines = new Set((v.table || []).filter((L) => !lineIds.has(L.id)).map((L) => L.id));
    const pt = prev.me && prev.me.stack_top;
    const nt = v.me && v.me.stack_top;
    if (nt && (!pt || pt.id !== nt.id)) { fx.flip = true; this.sfx('flip'); }
    const wasMine = isMyTurn(prev);
    const mine = isMyTurn(v);
    if (mine && !wasMine) {
      fx.yourTurn = true;
      this.sfx('your_turn');   // sfx.js buzzes too (its pattern; muted phones stay still)
    }
    if (v.result && !prev.result && v.me && v.result.winners.includes(v.me.seat)) this.sfx('win');
    fx.ticker = (v.events || []).length && (prev.events || []).slice(-1)[0]?.v !== v.events.slice(-1)[0].v;
    this.fx = fx;
  }

  // ---- interactions -----------------------------------------------------------------------------------------
  flash(text, kind = 'info', ms = 3200) {
    this.msg = { text, kind };
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.msg = null; if (this.alive) this.render(); }, ms);
  }

  apply(res, okSound) {
    if (res.ok) {
      if (okSound) this.sfx(okSound);
      this.save();
      this.render();
      return;
    }
    const text = stageErrText(res.err);
    if (text) { this.flash(text, 'warn'); this.sfx('invalid'); }
    this.render();
  }

  tapDot(id) {
    if (this.busy || this.clearing) return;
    if (this.mode === 'swap') { this.swapWith(id); return; }
    this.splitKey = null;
    const fromAir = this.st.air.some((a) => a.dot.id === id);
    const res = this.st.pick(id);
    if (res.ok) this.follow(fromAir ? 'unpick' : 'pick', id);
    if (res.ok && !fromAir) this.fx = { lift: id };
    if (res.ok && fromAir) this.fx = { back: id };
    if (res.ok && this.view.me && this.view.me.stack_top && id === this.view.me.stack_top.id && !fromAir) this.flash(t('family.games.play.msg.stack_picked'), 'info');
    this.apply(res, null);   // picking up is silent; the piece lifts
  }

  putOn(key) {
    if (this.clearing) return;
    const res = this.st.putOn(key);
    if (res.ok) this.follow('put', key);
    this.afterPut(res);
  }

  putNew() {
    if (this.clearing) return;
    const res = this.st.putNew();
    if (res.ok) this.follow('new');
    this.afterPut(res);
  }

  // The Smart Hint: one tap done. The right one moves the guide along; anything else quietly ends it.
  follow(op, arg) {
    const g = this.guide;
    if (!g) return;
    const step = g.steps[g.i];
    const ok = step && step.op === op && (op === 'pick' || op === 'swap_dot' ? step.dot === arg : op === 'put' ? step.line === arg : true);
    if (ok) g.i += 1;
    else { this.guide = null; this.flash(t('family.games.play.guide.off'), 'info', 3600); }
  }

  guideStep() {
    const g = this.guide;
    return g && this.st.myTurn ? g.steps[g.i] || null : null;
  }

  afterPut(res) {
    let sound = 'place';
    if (res.ok) {
      const line = this.st.findLine(res.key);
      const fresh = !line.orig && line.dots.every((d) => this.st.lastPut.includes(d.id));
      this.fx = { put: new Set(this.st.lastPut), newLines: new Set(fresh ? [res.key] : []) };
      const top = this.view.me && this.view.me.stack_top;
      const info = this.st.lineInfo(line);
      if (info.valid) sound = 'snap';   // W5: snap = joins a good line, place = put down
      if (info.full) this.flash(t('family.games.play.msg.full'), 'good', 4200);
      else if (top && this.st.lastPut.includes(top.id)) this.flash(t('family.games.play.msg.flip_next'), 'info', 4200);
      else this.msg = null;   // a bad line explains itself on the table; the status line counts them
    }
    this.apply(res, sound);
  }

  toggleSplit(key) {
    this.splitKey = this.splitKey === key ? null : key;
    this.render();
  }

  splitAt(key, at) {
    const res = this.st.split(key, at);
    this.splitKey = null;
    if (res.ok) this.fx = { newLines: new Set([res.key]), cut: true };
    this.apply(res, 'snap');
  }

  reset() {
    this.st.reset();
    this.splitKey = null;
    this.guide = null;
    this.msg = null;
    this.save();
    this.render();
  }

  // The lamp: ask the server for the best move it sees for your own dots (read-only), then show it as taps.
  async toggleHint() {
    if (this.guide) { this.guide = null; this.render(); return; }
    if (this.guideBusy || this.busy || this.clearing || !this.ctx.hint || !this.st.myTurn) return;
    if (this.st.dirty()) { this.st.reset(); this.save(); }   // the hint starts from the table as it is
    this.mode = 'stage';
    this.splitKey = null;
    this.msg = null;
    this.guideBusy = true;
    this.render();
    const v0 = this.view.v;
    let res = null;
    try { res = await this.ctx.hint(); } catch { res = null; }
    this.guideBusy = false;
    if (!this.alive) return;
    if (!res || !res.hint) this.flash(t('family.games.play.msg.refused'), 'warn');
    else if (res.v === this.view.v && v0 === this.view.v && res.hint.steps && res.hint.steps.length) {
      this.guide = { ...res.hint, i: 0 };
      this.guideSpot = null;
    }
    this.render();
  }

  refuse() {
    // Tapping a not-ready Place: show what's wrong instead of doing nothing.
    const s = this.st.status();
    this.sfx('invalid');
    if (s.reason === 'holding') this.flash(t('family.games.play.msg.put_down_first'), 'warn');
    else if (s.reason === 'bad') { this.shake = true; }
    this.render();
    if (s.reason === 'bad') {
      const el = this.root.querySelector('.gp-line.is-bad');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  async send(action, okMsg) {
    if (this.busy || this.clearing) return false;
    this.busy = true;
    this.render();
    action.cid = action.cid || cid();
    try {
      await this.ctx.act(action);
      this.busy = false;
      if (okMsg) this.flash(okMsg, 'good', 2400);
      return true;
    } catch (e) {
      this.busy = false;
      this.sfx('invalid');
      const key = e && e.key;
      let text = key ? t(key, { why: e.vars && e.vars.why ? whyText(e.vars.why) : '' }) : '';
      if (!text || text === key) text = t('family.games.play.msg.refused');
      this.flash(text, 'warn', 5200);
      this.render();
      return false;
    }
  }

  async place() {
    const s = this.st.status();
    if (!s.canPlace) { this.refuse(); return; }
    this.follow('place');
    const ok = await this.send(this.st.action());
    if (ok) {
      this.sfx('place');
      try { sessionStorage.removeItem(this.storeKey(this.view.v)); } catch { /* ignore */ }
      this.render();
    }
  }

  async done() {
    if (this.st.dirty()) return;
    this.follow('done');
    await this.send({ type: 'done' });
  }

  startSwap() {
    this.mode = this.mode === 'swap' ? 'stage' : 'swap';
    if (this.mode === 'swap') this.follow('swap');
    else this.guide = null;
    this.render();
  }

  async swapWith(id) {
    const d = this.view.me.hand.find((x) => x.id === id);
    if (!d || this.st.locked.has(id)) { this.flash(t('family.games.play.msg.locked'), 'warn'); this.render(); return; }
    this.mode = 'stage';
    this.follow('swap_dot', id);
    const ok = await this.send({ type: 'swap_pass', hand_dot: id });
    if (ok) this.sfx('flip');
    this.render();
  }

  async rematch() { await this.send({ type: 'rematch' }); }

  // ---- render -------------------------------------------------------------------------------------------------
  render() {
    if (!this.alive || this.clearing) return;   // the burst finishes first; setView() renders right after
    const v = this.view;
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    const st = this.st.status();
    const node = h('div', { class: 'gp' + (v.room.settings.simple_table ? ' gp-simple' : '') + (st.holding ? ' gp-holding' : '') + (this.busy ? ' gp-busy' : '') },
      this.renderStrip(v),
      this.coach ? this.coach.node() : null,
      this.renderMarket(v),
      this.renderTable(v, st),
      v.me ? this.renderTray(v, st) : h('p', { class: 'gp-watch' }, icon('help', 'icon icon-inline'), t('family.games.play.watching')),
      v.result ? this.renderResult(v) : null);
    clear(this.root).append(node);
    this.decorateGuide();
    if (this.coach) this.coach.decorate(this.root);
    this.fx = {};
    this.shake = false;
    this.updateTitle();
    if (fk) {
      const again = this.root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (again) again.focus({ preventScroll: true });
    }
    this.measureTray();
  }

  // Mark the one thing to tap next (a glowing ring and the step number), and bring it into view once.
  decorateGuide() {
    const step = this.guideStep();
    if (!step) return;
    const r = this.root;
    let el = null;
    if (step.op === 'pick') {
      el = step.from === 'stack' ? r.querySelector(`.gp-stack-dot[data-id="${step.dot}"]`)
        : step.from === 'table' ? r.querySelector(`.gp-table [data-id="${step.dot}"]`)
          : r.querySelector(`.gp-hand [data-id="${step.dot}"]`);
    } else if (step.op === 'put') el = r.querySelector(`.gp-line[data-key="${CSS.escape(step.line)}"] .gp-put`);
    else if (step.op === 'new') el = r.querySelector('.gp-newline');
    else if (step.op === 'place') el = r.querySelector('.gp-place');
    else if (step.op === 'swap') el = r.querySelector('[data-fk="swap"]');
    else if (step.op === 'swap_dot') el = r.querySelector(`.gp-hand [data-id="${step.dot}"]`);
    else if (step.op === 'done') el = r.querySelector('.gp-done');
    if (!el) return;
    el.classList.add('gp-target');
    el.append(h('span', { class: 'gp-target-n', 'aria-hidden': 'true' }, String(this.guide.i + 1)));
    const spot = `${this.view.v}:${this.guide.i}`;
    if (this.guideSpot !== spot && el.closest('.gp-table') && el.scrollIntoView) {
      this.guideSpot = spot;
      const box = el.getBoundingClientRect();
      const trayH = parseFloat(this.root.style.getPropertyValue('--gp-tray-h')) || 0;
      if (box.top < 60 || box.bottom > window.innerHeight - trayH - 8) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  measureTray() {
    const tray = this.root.querySelector('.gp-tray');
    if (this.ro) { this.ro.disconnect(); if (tray) this.ro.observe(tray); }
    this.root.style.setProperty('--gp-tray-h', (tray ? Math.ceil(tray.getBoundingClientRect().height) : 0) + 'px');
  }

  updateTitle() {
    document.title = isMyTurn(this.view) ? '● ' + t('family.games.play.turn.you') : this.title0;
  }

  updateClock() {
    const el = this.root.querySelector('.gp-clock');
    if (el) el.textContent = this.clockText();
  }

  clockText() {
    const tn = this.view.turn;
    if (!tn || !tn.deadline || this.view.result) return '';
    const left = Math.round((Date.parse(tn.deadline) - Date.now()) / 1000);
    if (this.view.room.mode === 'leisure' || left > 3600) return t('family.games.play.turn.by', { time: clock(tn.deadline) });
    return t('family.games.play.turn.seconds', { s: Math.max(0, left) });
  }

  turnText(v) {
    if (v.result) return t('family.games.play.turn.over');
    if (v.turn.phase === 'market') return t('family.games.play.turn.market');
    if (isMyTurn(v)) return t('family.games.play.turn.you');
    const s = v.seats.find((x) => x.seat === v.turn.seat);
    return t('family.games.play.turn.other', { name: s ? s.name : '?' });
  }

  renderStrip(v) {
    const mine = isMyTurn(v);
    const back = this.ctx.hideBack ? null : h('a', { class: 'gp-back', href: this.ctx.backHash || '#/games', 'aria-label': t('family.games.play.back'), 'data-fk': 'back' }, icon('back'));
    const rules = this.ctx.openRules
      ? h('button', { class: 'gp-round-btn', type: 'button', 'aria-label': t('family.games.play.rules'), 'data-fk': 'rules', onclick: () => this.ctx.openRules() }, '?')
      : null;
    const turn = h('div', { class: 'gp-turn' + (mine ? ' gp-turn-mine' : '') + (this.fx.yourTurn ? ' gp-turn-pop' : ''), role: 'status', 'aria-live': 'polite' },
      mine ? h('span', { class: 'gp-ball', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'gp-turn-lines' },
        h('span', { class: 'gp-turn-text' }, this.turnText(v)),
        h('span', { class: 'gp-clock' }, this.clockText())));
    const bag = h('li', { class: 'gp-bag', 'aria-label': t('family.games.play.bag_aria', { n: v.bag_left }) },
      bagIcon(), h('b', { 'aria-hidden': 'true' }, String(v.bag_left)));
    const chips = h('ul', { class: 'gp-seats', 'aria-label': t('family.games.play.seats') },
      v.seats.map((s) => this.seatChip(v, s)), bag);
    return h('header', { class: 'gp-strip' },
      h('div', { class: 'gp-strip-row' }, back, turn, rules),
      this.renderCovered(v),
      chips,
      this.renderTicker(v));
  }

  // Claude took over your seat after you missed turns: one big "I'm back".
  renderCovered(v) {
    const mine = v.me && v.seats.find((s) => s.seat === v.me.seat);
    if (!mine || !mine.covering_bot || v.result || !this.ctx.reclaim) return null;
    return h('div', { class: 'gp-covered', role: 'status' },
      h('span', { class: 'gp-covered-text' }, t('family.games.play.covered')),
      h('button', {
        class: 'gm-btn gm-btn--go gp-btn gp-takeback', type: 'button', 'data-fk': 'takeback', disabled: this.busy,
        onclick: async () => {
          if (this.busy) return;
          this.busy = true; this.render();
          try { await this.ctx.reclaim(); } catch { this.flash(t('family.games.play.msg.refused'), 'warn'); }
          this.busy = false; this.render();
        },
      }, t('family.games.play.take_back')));
  }

  seatChip(v, s) {
    const me = v.me && v.me.seat === s.seat;
    const playing = v.turn && v.turn.seat === s.seat && !v.result && v.turn.phase === 'play';
    const name = me ? t('family.games.play.you') : s.name;
    const aria = s.stack_top
      ? t('family.games.play.seat_aria', { name, dot: dotName(s.stack_top), n: s.stack_left })
      : t('family.games.play.seat_aria_empty', { name });
    return h('li', { class: 'gp-seat' + (me ? ' gp-seat-me' : '') + (playing ? ' gp-seat-on' : '') + (s.away ? ' gp-seat-away' : ''), 'aria-label': aria },
      s.stack_top ? dotNode(s.stack_top, { cls: 'gp-dot-mini', label: '' }) : h('span', { class: 'gp-dot gp-dot-mini gp-dot-none', 'aria-hidden': 'true' }),
      h('span', { class: 'gp-seat-name', 'aria-hidden': 'true' }, name, s.bot || s.covering_bot ? h('span', { class: 'gp-bot' }, ' ✦') : null),
      h('span', { class: 'gp-seat-n', 'aria-hidden': 'true' }, String(s.stack_left)),
      s.catchup ? h('span', { class: 'gp-plus1', 'aria-hidden': 'true' }, '+1') : null);
  }

  renderTicker(v) {
    const ev = (v.events || []).slice(-1)[0];
    if (!ev) return null;
    const text = t(ev.key, ev.vars || {});
    if (!text || text === ev.key) return null;
    return h('p', { class: 'gp-ticker' + (this.fx.ticker ? ' gp-ticker-new' : ''), 'aria-live': 'polite' }, h('span', { class: 'gp-tick-dot', 'aria-hidden': 'true' }), text);
  }

  renderMarket(v) {
    const m = v.market;
    if (!m || !m.open) return null;
    const text = m.live
      ? t('family.games.play.market.live')
      : m.offers.length === 1 ? t('family.games.play.market.leisure.one', { time: clock(m.closes_at), n: 1 })
        : t('family.games.play.market.leisure.other', { time: clock(m.closes_at), n: m.offers.length });
    return h('div', { class: 'gp-market' + (m.live ? ' gp-market-live' : '') },
      h('span', { class: 'gp-market-text' }, text),
      this.ctx.openMarket ? h('button', { class: 'gm-btn gm-btn--go gp-market-btn', type: 'button', 'data-fk': 'market', onclick: () => this.ctx.openMarket() }, t('family.games.play.market.go')) : null);
  }

  renderTable(v, st) {
    const canAct = this.st.myTurn && !this.busy && !this.clearing;
    const gs = this.guideStep();
    const hints = new Set(gs && gs.op === 'put' ? [gs.line] : []);
    const sec = h('section', { class: 'gp-table gm-felt', 'aria-label': t('family.games.play.table') });
    if (canAct && st.holding) {
      sec.append(h('button', { class: 'gp-newline gm-target', type: 'button', 'data-fk': 'newline', onclick: () => this.putNew() },
        h('span', { class: 'gp-plus', 'aria-hidden': 'true' }, '+'), t('family.games.play.new_line')));
    }
    if (!st.infos.length) sec.append(h('p', { class: 'gp-empty' }, t('family.games.play.table_empty')));
    st.infos.forEach((info, i) => sec.append(this.renderLine(info, i, canAct, hints, st)));
    return sec;
  }

  renderLine(info, idx, canAct, hints, st) {
    const fx = this.fx;
    const splitting = this.splitKey === info.key;
    const placedBy = this.st.origin;
    const cls = ['gp-line', 'gm-line'];
    if (info.kind === 'group') cls.push('gm-line--group');
    if (!info.valid) cls.push('is-bad');
    if (!info.valid && this.shake) cls.push('gp-shake');
    if (info.full) cls.push('is-full');
    if (hints.has(info.key)) cls.push('is-hint');
    if (info.changed && this.st.myTurn) cls.push('gp-changed');
    if (fx.newLines && fx.newLines.has(info.key)) cls.push('is-drawn');
    if (splitting) cls.push('gp-splitting');
    const row = h('div', { class: 'gm-line-dots gp-line-dots gp-n' + Math.min(6, info.dots.length) });
    info.dots.forEach((d, i) => {
      if (splitting && i > 0) {
        row.append(h('span', { class: 'gp-cut-slot' },
          h('button', { class: 'gp-cut', type: 'button', 'data-fk': `cut-${info.key}-${i}`, 'aria-label': t('family.games.play.split_here', { n: i }), onclick: () => this.splitAt(info.key, i) },
            h('span', { 'aria-hidden': 'true' }, '✂'))));
      }
      const mineDot = placedBy.get(d.id) !== 'table';
      const dcls = ['gp-tdot'];
      if (mineDot && this.st.myTurn) dcls.push('gp-mine');
      if (fx.put && fx.put.has(d.id)) dcls.push('is-snap');
      if (fx.newDots && fx.newDots.has(d.id)) dcls.push('is-enter');
      if (!info.valid && fx.put && fx.put.has(d.id)) dcls.push('is-invalid');
      const pickable = canAct && !splitting && this.st.canPickFromTable(d.id);
      const node = dotNode(d, pickable
        ? { tag: 'button', cls: dcls.join(' '), onclick: () => this.tapDot(d.id), attrs: { 'data-fk': 'd' + d.id, 'data-id': d.id } }
        : { cls: dcls.join(' '), attrs: { 'data-id': d.id } });
      if (!pickable) node.setAttribute('role', 'img');
      node.style.setProperty('--i', String(i));
      row.append(node);
    });
    const canSplit = canAct && !st.holding && !this.st.simple && info.dots.length >= 3;
    const scissors = canSplit
      ? h('button', {
        class: 'gp-scissors' + (splitting ? ' on' : ''), type: 'button', 'data-fk': 'scis-' + info.key, 'aria-pressed': String(splitting),
        'aria-label': splitting ? t('family.games.play.split_cancel') : t('family.games.play.split'), onclick: () => this.toggleSplit(info.key),
      }, h('span', { 'aria-hidden': 'true' }, splitting ? '×' : '✂'))
      : null;
    const foot = [];
    if (!info.valid) foot.push(h('span', { class: 'gm-line-why gp-why' }, whyText(info.why)));
    else if (info.full && this.st.myTurn) foot.push(h('span', { class: 'gp-full-tag' }, '✦ ', t('family.games.play.full_tag')));
    else if (hints.has(info.key)) foot.push(h('span', { class: 'gp-fits-tag' }, t('family.games.play.guide.here')));
    if (splitting) foot.push(h('span', { class: 'gp-split-tip' }, t('family.games.play.split_tip')));
    const lab = info.valid
      ? (info.kind === 'run' ? t('family.games.play.line_run', { n: info.dots.length }) : t('family.games.play.line_group', { n: info.dots.length }))
      : whyText(info.why);
    const card = h('div', { class: cls.join(' '), role: 'group', 'aria-label': lab, 'data-key': info.key, 'data-ids': info.dots.map((d) => d.id).join(','), style: { '--n': String(idx) } },
      row,
      scissors,
      foot.length ? h('div', { class: 'gp-line-foot' }, foot) : null,
      canAct && st.holding ? h('button', { class: 'gp-put gm-target', type: 'button', 'data-fk': 'put-' + info.key, onclick: () => this.putOn(info.key) },
        h('span', { class: 'gp-put-arrow', 'aria-hidden': 'true' }, '↓'), t('family.games.play.put_here')) : null);
    return card;
  }

  renderTray(v, st) {
    const me = v.me;
    const canAct = this.st.myTurn && !this.busy && !this.clearing;
    const fx = this.fx;
    const parts = [];

    // In the air: the dots you're holding, lifted.
    if (this.st.air.length) {
      parts.push(h('div', { class: 'gp-air', role: 'group', 'aria-label': t('family.games.play.air') },
        h('span', { class: 'gp-air-label' }, t('family.games.play.air')),
        h('div', { class: 'gp-air-dots' }, this.st.air.map((a) => dotNode(a.dot, {
          tag: 'button', cls: 'gp-held is-picked' + (fx.lift === a.dot.id ? ' is-enter' : '') + (a.from === 'table' ? ' gp-held-table' : ''),
          onclick: () => this.tapDot(a.dot.id), attrs: { 'data-fk': 'd' + a.dot.id, 'data-id': a.dot.id },
          label: a.from === 'table' ? t('family.games.play.held_table', { dot: dotName(a.dot) }) : t('family.games.play.held_back', { dot: dotName(a.dot) }),
        })))));
    }

    // Status line: one plain sentence about what to do next (it sits beside the Stack).
    const status = h('p', { class: 'gp-status gp-status-' + this.statusKind(st), role: 'status', 'aria-live': 'polite' }, this.statusText(v, st));

    // Stack (outlined in the accent) · status · Hint lamp; then the hand, full width.
    const top = me.stack_top;
    const stackOut = top && !this.st.stack;
    const leftNow = me.stack_left - (stackOut ? 1 : 0);
    let stackNode;
    if (top && this.st.stack) {
      const scls = 'is-stack gp-stack-dot' + (fx.flip ? ' is-flip' : '') + (this.mode === 'swap' ? ' is-hint' : '');
      stackNode = dotNode(top, canAct || this.mode === 'swap'
        ? { tag: 'button', cls: scls, onclick: () => (this.mode === 'swap' ? this.startSwap() : this.tapDot(top.id)), attrs: { 'data-fk': 'd' + top.id, 'data-id': top.id } }
        : { cls: scls });
    } else if (top) {
      stackNode = dotNode(null, { back: true, cls: 'is-stack gp-stack-dot gp-stack-next', label: t('family.games.play.stack_next') });
    } else {
      stackNode = h('span', { class: 'gm-dot gp-dot gp-stack-dot gp-dot-none', 'aria-label': t('family.games.play.stack_empty') });
    }
    const stack = h('div', { class: 'gp-stack' + (leftNow <= 1 ? ' gp-stack-last' : '') },
      h('div', { class: 'gm-stack gp-stack-slot' }, stackNode,
        h('span', { class: 'gm-stack-count', 'aria-label': t('family.games.play.stack_left', { n: leftNow }) }, String(leftNow))),
      h('span', { class: 'gp-rack-label', 'aria-hidden': 'true' }, t('family.games.play.stack')));
    const hintsOn = v.room.settings.hints !== false && !!this.ctx.hint;
    const ready = !this.guide && !st.dirty && this.st.stack && this.st.hintKeys().length;
    const hintBtn = canAct && hintsOn && this.mode === 'stage'
      ? h('button', {
        class: 'gp-hint-btn' + (this.guide ? ' on' : ready ? ' is-ready' : '') + (this.guideBusy ? ' is-busy' : ''), type: 'button', 'data-fk': 'hint',
        'aria-pressed': String(!!this.guide), 'aria-label': this.guide ? t('family.games.play.guide.close') : t('family.games.play.hint'), onclick: () => this.toggleHint(),
      }, icon('lamp', 'icon gp-hint-bulb'), h('span', { class: 'gp-hint-word', 'aria-hidden': 'true' }, t('family.games.play.hint_btn')))
      : null;
    if (this.st.myTurn && (this.guide || this.guideBusy)) parts.push(this.renderGuide());
    const hand = h('div', { class: 'gp-hand', role: 'group', 'aria-label': t('family.games.play.hand') },
      this.st.hand.map((d) => this.handDot(d, canAct)));
    if (!this.st.hand.length) hand.append(h('span', { class: 'gp-hand-empty' }, t('family.games.play.hand_empty')));
    parts.push(h('div', { class: 'gp-rack' }, stack, status, hintBtn), hand);

    // Actions: Reset + Place while something is staged; Swap & pass + Done otherwise.
    const acts = h('div', { class: 'gp-actions' });
    if (this.st.myTurn) {
      if (this.mode === 'swap') {
        acts.append(h('button', { class: 'gm-btn gp-btn', type: 'button', 'data-fk': 'swapcancel', onclick: () => this.startSwap() }, t('family.games.play.cancel')));
      } else if (st.dirty) {
        acts.append(
          h('button', { class: 'gm-btn gp-btn gp-btn-quiet gp-btn-reset', type: 'button', 'data-fk': 'reset', disabled: this.busy, onclick: () => this.reset() }, t('family.games.play.reset')),
          h('button', {
            class: 'gm-btn gm-btn--go gp-btn gp-btn-main gp-place' + (st.canPlace ? ' ready' : ''), type: 'button', 'data-fk': 'place',
            'aria-disabled': String(!st.canPlace || this.busy), onclick: () => this.place(),
          }, this.busy ? t('family.games.play.placing') : t('family.games.play.place')));
      } else {
        // After Swap & pass you get one more Place (then the turn ends), not a second swap.
        if (top && !(v.turn && v.turn.swapped)) acts.append(h('button', { class: 'gm-btn gp-btn gp-btn-quiet', type: 'button', 'data-fk': 'swap', disabled: this.busy || !me.hand.length, onclick: () => this.startSwap() }, t('family.games.play.swap_pass')));
        acts.append(h('button', { class: 'gm-btn gm-btn--go gp-btn gp-btn-main gp-done', type: 'button', 'data-fk': 'done', disabled: this.busy, onclick: () => this.done() },
          this.busy ? t('family.games.play.sending') : t('family.games.play.done')));
      }
      parts.push(acts);
    }
    return h('footer', { class: 'gp-tray gm-tray' + (this.st.myTurn ? ' gp-tray-mine' : '') + (this.mode === 'swap' ? ' gp-tray-swap' : '') }, h('div', { class: 'gp-tray-in' }, parts));
  }

  renderGuide() {
    const g = this.guide;
    if (!g) return h('div', { class: 'gp-guide', role: 'status', 'aria-live': 'polite' }, icon('lamp', 'icon gp-guide-bulb'), h('b', { class: 'gp-guide-why' }, t('family.games.play.guide.thinking')));
    const step = g.steps[g.i];
    return h('div', { class: 'gp-guide', role: 'status', 'aria-live': 'polite' },
      icon('lamp', 'icon gp-guide-bulb'),
      h('div', { class: 'gp-guide-text' },
        h('b', { class: 'gp-guide-why' }, guideWhy(g.why), g.clears ? ' ' + t('family.games.play.guide.clears') : ''),
        step ? h('span', { class: 'gp-guide-step' }, h('span', { class: 'gp-guide-n' }, t('family.games.play.guide.count', { n: g.i + 1, total: g.steps.length })), ' ', guideStepText(step)) : null),
      h('button', { class: 'gp-guide-x', type: 'button', 'data-fk': 'guide-x', 'aria-label': t('family.games.play.guide.close'), onclick: () => { this.guide = null; this.render(); } }, '×'));
  }

  handDot(d, canAct) {
    const me = this.view.me;
    const locked = this.st.locked.has(d.id);
    const fresh = (me.fresh || []).includes(d.id);
    const cls = ['gp-hdot'];
    if (locked) cls.push('is-locked');
    if (fresh) cls.push('is-new');
    if (this.fx.back === d.id) cls.push('is-snap');
    if (this.mode === 'swap' && !locked) cls.push('gp-swap-pick');
    let label = dotName(d);
    if (locked) label = t('family.games.play.locked_dot', { dot: label });
    else if (this.mode === 'swap') label = t('family.games.play.swap_dot', { dot: label });
    const node = canAct || this.mode === 'swap'
      ? dotNode(d, { tag: 'button', cls: cls.join(' '), label, onclick: () => this.tapDot(d.id), attrs: { 'data-fk': 'd' + d.id, 'data-id': d.id, 'aria-disabled': locked ? 'true' : null } })
      : dotNode(d, { cls: cls.join(' '), label, attrs: { 'data-id': d.id, role: 'img' } });
    if (fresh) node.append(h('span', { class: 'gm-new', 'aria-hidden': 'true' }, t('family.games.play.new_tag')));
    if (locked) node.append(h('span', { class: 'gp-lock-tag', 'aria-hidden': 'true' }, t('family.games.play.locked_tag')));
    return node;
  }

  statusKind(st) {
    if (this.msg) return this.msg.kind;
    if (this.st.myTurn && st.reason === 'bad') return 'warn';
    if (this.st.myTurn && st.canPlace) return 'good';
    return 'info';
  }

  statusText(v, st) {
    if (this.busy) return t('family.games.play.sending');
    if ((this.guide || this.guideBusy) && this.st.myTurn && !this.msg) return '';
    if (this.msg) return this.msg.text;
    if (v.result) return t('family.games.play.turn.over');
    if (!this.st.myTurn) {
      if (v.turn.phase === 'market') return t('family.games.play.msg.market_wait');
      return t('family.games.play.msg.wait');
    }
    if (this.mode === 'swap') return t('family.games.play.msg.swap_pick');
    if (st.reason === 'holding') return t('family.games.play.msg.holding');
    if (st.reason === 'bad') return st.bad.length === 1 ? t('family.games.play.fix.one', { n: 1 }) : t('family.games.play.fix.other', { n: st.bad.length });
    if (st.canPlace && st.full.length) return t('family.games.play.msg.full');
    if (st.canPlace && st.stackUsed) return t('family.games.play.msg.flip_next');
    if (st.canPlace) return t('family.games.play.msg.ready');
    if (v.turn && v.turn.swapped) return t('family.games.play.msg.swapped');
    if (this.view.me.refill_bonus) return t('family.games.play.msg.bonus');
    const hintsOn = v.room.settings.hints !== false && !!this.ctx.hint;
    if (this.st.stack && this.st.hintKeys().length) return hintsOn ? t('family.games.play.msg.top_fits') : t('family.games.play.msg.top_fits_nohint');
    return hintsOn ? t('family.games.play.msg.start_hint') : t('family.games.play.msg.start');
  }

  renderResult(v) {
    const r = v.result;
    const meWon = v.me && r.winners.includes(v.me.seat);
    const names = r.winners.map((s) => (v.seats.find((x) => x.seat === s) || {}).name).filter(Boolean).join(' · ');
    const title = meWon ? t('family.games.play.result.you_win') : t('family.games.play.result.wins', { name: names });
    const mine = v.me ? r.points[v.me.seat] || 0 : 0;
    const best = Math.max(0, ...r.points);
    const pieces = [{ c: 'r', n: 1 }, { c: 'b', n: 1 }, { s: true }, { c: 'p', n: 1 }].map((d) => dotNode(d, { label: '' }));
    return h('div', { class: 'gp-result', role: 'dialog', 'aria-modal': 'false', 'aria-label': title },
      h('div', { class: 'gm-win gp-win' },
        h('span', { class: 'gm-burst', 'aria-hidden': 'true' }),
        h('p', { class: 'gm-win-kicker' }, r.reason === 'stalemate' ? t('family.games.play.result.stalemate') : t('family.games.play.result.empty')),
        h('h2', { class: 'gm-win-title' }, title),
        h('div', { class: 'gm-win-dots', 'aria-hidden': 'true' }, pieces),
        h('p', { class: 'gm-win-points' }, h('b', null, '+' + (meWon ? mine : best)), ' ', t('family.games.play.result.points_word')),
        v.room.settings.practice ? h('p', { class: 'gp-practice-note' }, t('family.games.play.result.practice')) : null,
        h('ul', { class: 'gp-points' }, v.seats.map((s) => h('li', { class: r.winners.includes(s.seat) ? 'gp-winner' : '' },
          h('span', { class: 'gp-points-who' }, v.me && v.me.seat === s.seat ? t('family.games.play.you') : s.name,
            s.stack_left ? h('small', { class: 'gp-points-left' }, s.stack_left === 1 ? t('family.games.play.result.left.one', { n: 1 }) : t('family.games.play.result.left.other', { n: s.stack_left })) : null),
          h('b', null, t('family.games.play.result.points', { n: r.points[s.seat] || 0 }))))),
        h('div', { class: 'gp-result-acts' },
          v.me ? h('button', { class: 'gm-btn gm-btn--go gp-btn', type: 'button', 'data-fk': 'rematch', disabled: this.busy, onclick: () => this.rematch() }, t('family.games.play.result.again')) : null,
          h('a', { class: 'gm-btn gp-btn gp-btn-quiet', href: this.ctx.backHash || '#/games', 'data-fk': 'back2' }, t('family.games.play.back')))));
  }
}

// What a staged arrangement depends on: whose turn, the table, your hand, locks and your Stack top.
function baseSig(v) {
  const me = v.me || {};
  return JSON.stringify([isMyTurn(v), (v.table || []).map((L) => [L.id, L.dots.map((d) => [d.id, d.as ? d.as.c + d.as.n : ''])]),
    (me.hand || []).map((d) => d.id), me.locked || [], me.stack_top ? me.stack_top.id : null, v.room && v.room.settings && v.room.settings.simple_table]);
}

function isMyTurn(v) {
  return !!(v && v.me && v.turn && v.turn.seat === v.me.seat && v.turn.phase === 'play' && !v.result);
}

function bagIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon gp-bag-icon');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M8 7c0-2 1.8-3.5 4-3.5S16 5 16 7M5 8h14l-1.4 11.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 8z');
  s.append(p);
  return s;
}
