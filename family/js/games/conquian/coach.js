// Conquián: the Practice coach (a first classic hand with Easy Claude; contracts/conquian.md §9 Practice).
// Six short steps, each skippable; the "do it" ones wait until you've actually done it. The play screen owns it:
// node() under the top strip, decorate(root) marks what to tap, onView(view, prev) moves it along.
//
//   1 hand    your 10 cards (Got it)             2 middle  the offered card (Got it)
//   3 take    tap the cards that go with it, then ¡Me sirve!  (waits for a take)
//   4 throw   pick a card and Tirar                            (waits for the discard)
//   5 pass    Paso and ¡Te obligo! (Got it)                    6 win  lay down 11 and you're out (Let's play!)
import { h } from '../../dom.js';
import { t } from '../../i18n.js';
import { classify, fits } from './melds.js';
import { deciding, discarding } from './view.js';

const STEPS = ['hand', 'middle', 'take', 'throw', 'pass', 'win'];

function title(s) {
  switch (s) {
    case 'hand': return t('family.games.cq.coach.hand.title');
    case 'middle': return t('family.games.cq.coach.middle.title');
    case 'take': return t('family.games.cq.coach.take.title');
    case 'throw': return t('family.games.cq.coach.throw.title');
    case 'pass': return t('family.games.cq.coach.pass.title');
    default: return t('family.games.cq.coach.win.title');
  }
}

export class CqCoach {
  constructor(screen, roomId) {
    this.screen = screen;
    this.key = `eai.games.cq.coach.${roomId}`;
    this.i = 0;
    this.done = false;
    try {
      const saved = localStorage.getItem(this.key);
      if (saved === 'done') this.done = true;
      else if (saved && /^[0-5]$/.test(saved)) this.i = Number(saved);
    } catch { /* start at the top */ }
  }

  watchScroll() {
    if (this.unwatch) return;
    const mark = () => { this.moved = true; };
    const evs = ['wheel', 'touchmove', 'keydown'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    this.unwatch = () => evs.forEach((e) => window.removeEventListener(e, mark));
  }

  get step() { return this.done ? null : STEPS[this.i]; }
  save() { try { localStorage.setItem(this.key, this.done ? 'done' : String(this.i)); } catch { /* fine */ } }

  next() {
    if (this.i >= STEPS.length - 1) { this.finish(); return; }
    this.i += 1;
    this.moved = false;
    this.save();
    this.screen.scrollTo = '.cq-coach';
    this.screen.render();
  }

  finish() { this.done = true; this.save(); if (this.unwatch) this.unwatch(); this.screen.render(); }

  onView(v, prev) {
    if (this.done || !prev) return;
    if (v.result) { this.done = true; this.save(); return; }
    const s = this.step;
    const mine = (x) => ((x.seats || []).find((st) => x.me && st.seat === x.me.seat) || {}).melded || 0;
    let did = false;
    if (s === 'take') did = mine(v) > mine(prev);
    else if (s === 'throw') did = discarding(prev) && !discarding(v);
    if (did) setTimeout(() => { if (this.step === s) this.next(); }, 0);
  }

  // The hand cards that make a meld with the middle card right now (two from the hand, or it joins your meld).
  helpers() {
    const v = this.screen.view;
    if (!deciding(v)) return [];
    const c = v.center.card;
    const hand = v.me.hand || [];
    const me = (v.seats || []).find((s) => s.seat === v.me.seat) || {};
    if ((me.melds || []).some((m) => fits(m, c))) return [];
    for (let a = 0; a < hand.length; a++) {
      for (let b = a + 1; b < hand.length; b++) if (classify([c, hand[a], hand[b]])) return [hand[a].id, hand[b].id];
    }
    return [];
  }

  bodyText() {
    const s = this.step;
    const v = this.screen.view;
    switch (s) {
      case 'hand': return t('family.games.cq.coach.hand.body', { n: (v.me && v.me.hand.length) || 10, target: v.target || 11 });
      case 'middle': return t('family.games.cq.coach.middle.body');
      case 'take': return deciding(v) ? t('family.games.cq.coach.take.body') : t('family.games.cq.coach.take.wait');
      case 'throw': return t('family.games.cq.coach.throw.body');
      case 'pass': return t('family.games.cq.coach.pass.body');
      default: return t('family.games.cq.coach.win.body', { target: v.target || 11 });
    }
  }

  node() {
    const s = this.step;
    if (!s) return null;
    const manual = s === 'hand' || s === 'middle' || s === 'pass' || s === 'win';
    return h('section', { class: 'gp-coach cq-coach', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'gp-coach-head' },
        h('div', { class: 'gp-coach-titles' },
          h('p', { class: 'gp-coach-kicker' }, t('family.games.cq.coach.kicker', { n: this.i + 1, total: STEPS.length })),
          h('h2', { class: 'gp-coach-title' }, title(s))),
        h('button', { class: 'gp-coach-skip', type: 'button', 'data-fk': 'coach-skip', 'aria-label': t('family.games.cq.coach.skip'), onclick: () => this.finish() },
          t('family.games.cq.coach.skip_short'))),
      h('p', { class: 'gp-coach-body' }, this.bodyText()),
      manual ? h('button', { class: 'gm-btn gm-btn--go gp-btn gp-coach-ok', type: 'button', 'data-fk': 'coach-ok', onclick: () => this.next() },
        s === 'win' ? t('family.games.cq.coach.play') : t('family.games.cq.coach.ok')) : null);
  }

  decorate(root) {
    const s = this.step;
    const sc = this.screen;
    // after the layout settles, keep the lesson (and its Got it) out from under the tray — until the reader scrolls
    // on their own (then it's theirs to move); a new lesson starts the watch again
    if (s) this.watchScroll();
    if (s && !this.moved) {
      clearTimeout(this.revealT);
      this.revealT = setTimeout(() => {
        if (this.step !== s || !sc.alive || this.moved) return;
        const el = root.querySelector('.cq-coach .gp-coach-ok') || root.querySelector('.cq-coach');
        const tray = root.querySelector('.cq-tray');
        if (el && tray && el.getBoundingClientRect().bottom > tray.getBoundingClientRect().top - 4) sc.reveal('.cq-coach');
      }, 350);
    }
    if (!s || sc.guide) return;
    const mark = (el) => { if (el) el.classList.add('gp-coach-target'); };
    if (s === 'hand') mark(root.querySelector('.cq-hand'));
    else if (s === 'middle') mark(root.querySelector('.cq-center-card'));
    else if (s === 'take' && deciding(sc.view)) {
      const st = sc.take && sc.take.status();
      if (st && st.ok) mark(root.querySelector('.cq-take'));
      else this.helpers().filter((id) => root.querySelector(`.cq-hand [data-id="${id}"]`)).forEach((id) => mark(root.querySelector(`.cq-hand [data-id="${id}"]`)));
    } else if (s === 'throw' && discarding(sc.view)) mark(root.querySelector(sc.pick != null ? '.cq-discard' : '.cq-hand'));
  }
}
