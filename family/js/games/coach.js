// Dots & Lines: the Practice coach (contracts/games.md §10a). Six short steps over the fixed practice deal
// (family/api/games/dots/practice.py); each one waits for the player to actually do it, and every step can be
// skipped. play.js owns it: coach.node() is drawn under the top strip, coach.decorate(root) marks what to tap,
// coach.onView(view, prev) moves it along.
//
//   1 stack  your Stack (Got it)          2 line   red 2 3 4 + New line + Place
//   3 top    blue 6 onto the blue Line (the Smart Hint shows the taps)
//   4 move   green 6 needs a dot moved: tap Hint and follow it
//   5 market purple 6 clears the 6s; Done opens the Market; trade or Done trading
//   6 win    how you win (Let's play!)
import { h } from '../dom.js';
import { t } from '../i18n.js';

const STEPS = ['stack', 'line', 'top', 'move', 'market', 'win'];

function title(step) {
  switch (step) {
    case 'stack': return t('family.games.coach.stack.title');
    case 'line': return t('family.games.coach.line.title');
    case 'top': return t('family.games.coach.top.title');
    case 'move': return t('family.games.coach.move.title');
    case 'market': return t('family.games.coach.market.title');
    default: return t('family.games.coach.win.title');
  }
}

export class Coach {
  constructor(screen, roomId) {
    this.screen = screen;
    this.key = `eai.games.coach.${roomId}`;
    this.i = 0;
    this.done = false;
    this.marketSeen = false;
    try {
      const saved = localStorage.getItem(this.key);
      if (saved === 'done') this.done = true;
      else if (saved && /^[0-5]$/.test(saved)) this.i = Number(saved);
    } catch { /* private mode: start at the top */ }
    this.base = null;     // what the current step started from: {hand:Set, left}
  }

  get step() { return this.done ? null : STEPS[this.i]; }

  save() {
    try { localStorage.setItem(this.key, this.done ? 'done' : String(this.i)); } catch { /* fine */ }
  }

  snapshot(v) {
    const me = v.me || {};
    this.base = { hand: new Set((me.hand || []).map((d) => d.id)), left: me.stack_left };
  }

  next() {
    if (this.i >= STEPS.length - 1) { this.finish(); return; }
    this.i += 1;
    this.marketSeen = false;
    this.snapshot(this.screen.view);
    this.save();
    this.enter();
  }

  finish() {
    this.done = true;
    this.save();
    this.screen.render();
  }

  // Steps 3 and 5 open the Smart Hint for you; step 4 asks you to tap it yourself.
  enter() {
    const s = this.step;
    const sc = this.screen;
    if ((s === 'top' || s === 'market') && sc.st && sc.st.myTurn && !sc.guide && sc.view.me && sc.view.me.stack_top) {
      setTimeout(() => { if (this.step === s && !sc.guide) sc.toggleHint(); }, 350);
    }
    sc.render();
  }

  // A new committed view: did the player do this step?
  onView(v) {
    if (this.done) return;
    if (!this.base) this.snapshot(v);
    if (v.result) { this.done = true; this.save(); return; }
    const me = v.me || {};
    const s = this.step;
    let did = false;
    if (s === 'line') did = (v.table || []).some((L) => L.dots.length >= 3 && L.dots.every((d) => this.base.hand.has(d.id)));
    else if (s === 'top' || s === 'move') did = me.stack_left < this.base.left;
    else if (s === 'market') {
      if (v.market && v.market.open) this.marketSeen = true;
      did = this.marketSeen && !(v.market && v.market.open);
    }
    if (did) setTimeout(() => { if (this.step === s) this.next(); }, 0);
  }

  // The red Line in step 2: the hand dots that make a 3-dot Line together.
  lineIds() {
    const sc = this.screen;
    if (this.lineFor && this.lineFor.v === sc.view.v) return this.lineFor.ids;
    this.lineFor = { v: sc.view.v, ids: this.findLine((sc.view.me && sc.view.me.hand) || [], sc.check) };
    return this.lineFor.ids;
  }

  findLine(hand, check) {
    for (let a = 0; a < hand.length; a++) {
      for (let b = a + 1; b < hand.length; b++) {
        for (let c = b + 1; c < hand.length; c++) {
          const r = check([hand[a], hand[b], hand[c]], {});
          if (r.valid) return [hand[a].id, hand[b].id, hand[c].id];
        }
      }
    }
    return [];
  }

  bodyText() {
    const s = this.step;
    const v = this.screen.view;
    switch (s) {
      case 'stack': return t('family.games.coach.stack.body');
      case 'line': return t('family.games.coach.line.body');
      case 'top': return t('family.games.coach.top.body');
      case 'move': return t('family.games.coach.move.body');
      case 'market':
        return v.market && v.market.open ? t('family.games.coach.market.open') : t('family.games.coach.market.body');
      default: {
        const me = v.me || {};
        const claude = (v.seats || []).find((x) => x.bot);
        return t('family.games.coach.win.body', { n: me.stack_left || 0, m: claude ? claude.stack_left : 0 });
      }
    }
  }

  node() {
    const s = this.step;
    if (!s) return null;
    const manual = s === 'stack' || s === 'win';
    const floating = s === 'market' && this.screen.view.market && this.screen.view.market.open;
    // Compact: the table has to stay in sight under it. "Skip" sits in the corner (56 px), Got it only where
    // there's nothing to do but read.
    return h('section', { class: 'gp-coach' + (floating ? ' gp-coach-float' : ''), role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'gp-coach-head' },
        h('div', { class: 'gp-coach-titles' },
          h('p', { class: 'gp-coach-kicker' }, t('family.games.coach.kicker', { n: this.i + 1, total: STEPS.length })),
          h('h2', { class: 'gp-coach-title' }, title(s))),
        h('button', { class: 'gp-coach-skip', type: 'button', 'data-fk': 'coach-skip', 'aria-label': t('family.games.coach.skip'), onclick: () => this.finish() },
          t('family.games.coach.skip_short'))),
      h('p', { class: 'gp-coach-body' }, this.bodyText()),
      manual ? h('button', { class: 'gm-btn gm-btn--go gp-btn gp-coach-ok', type: 'button', 'data-fk': 'coach-ok', onclick: () => this.next() },
        s === 'win' ? t('family.games.coach.play') : t('family.games.coach.ok')) : null);
  }

  // What to tap now (only where the Smart Hint isn't already showing the way).
  decorate(root) {
    const s = this.step;
    const sc = this.screen;
    if (!s || sc.guide) return;
    const mark = (el) => { if (el) el.classList.add('gp-coach-target'); };
    if (s === 'stack') mark(root.querySelector('.gp-stack-slot'));
    else if (s === 'line' && sc.st && sc.st.myTurn) {
      const status = sc.st.status();
      const ids = this.lineIds().filter((id) => sc.st.hand.some((d) => d.id === id));
      if (ids.length) ids.forEach((id) => mark(root.querySelector(`.gp-hand [data-id="${id}"]`)));
      else if (status.holding) mark(root.querySelector('.gp-newline'));
      else if (status.canPlace) mark(root.querySelector('.gp-place'));
    } else if (s === 'move' && sc.st && sc.st.myTurn && !sc.st.dirty()) mark(root.querySelector('.gp-hint-btn'));
    else if (s === 'market' && sc.st && sc.st.myTurn && !sc.st.dirty()) mark(root.querySelector('.gp-done'));
  }
}
