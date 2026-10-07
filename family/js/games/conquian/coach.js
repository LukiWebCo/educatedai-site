// Conquián: the Practice coach (a first classic hand with Easy Claude; contracts/conquian.md §9 Practice).
// Six short lessons that speak through the play screen's one voice (no box of their own). The "look" lessons
// (your hand, the middle card, Pass, how you win) put their words in the voice with one button, Got it; the "do it"
// lessons (¡Me sirve!, throwing a card) just add a small "Lesson 3 of 6" above the screen's own instruction and
// move on once you've done it.
//
//   coach.say()      -> {kicker, text, ok, okLabel} | {kicker} | null      (the play screen renders it)
//   coach.next() · coach.finish() · coach.onView(view, prev) · coach.decorate(root)
import { t } from '../../i18n.js';
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

  get step() { return this.done ? null : STEPS[this.i]; }
  save() { try { localStorage.setItem(this.key, this.done ? 'done' : String(this.i)); } catch { /* fine */ } }

  next() {
    if (this.i >= STEPS.length - 1) { this.finish(); return; }
    this.i += 1;
    this.save();
    this.screen.render();
  }

  finish() { this.done = true; this.save(); this.screen.render(); }

  onView(v, prev) {
    if (this.done || !prev) return;
    if (v.result) { this.done = true; this.save(); return; }
    const s = this.step;
    const mine = (x) => ((x.seats || []).find((st) => x.me && st.seat === x.me.seat) || {}).melded || 0;
    let did = false;
    if (s === 'take') did = mine(v) > mine(prev);
    else if (s === 'throw') did = discarding(prev) && !discarding(v);
    if (did) { this.i += 1; this.save(); }
  }

  // A "look" lesson waits for Got it; a "do it" lesson waits for the move itself.
  manual() { const s = this.step; return s === 'hand' || s === 'middle' || s === 'pass' || s === 'win'; }

  say() {
    const s = this.step;
    if (!s) return null;
    const v = this.screen.view;
    const kicker = t('family.games.cq.coach.kicker', { n: this.i + 1, total: STEPS.length }) + ' · ' + title(s);
    if (!this.manual()) return { kicker };
    let text;
    if (s === 'hand') text = t('family.games.cq.coach.hand.body', { target: v.target || 11 });
    else if (s === 'middle') text = t('family.games.cq.coach.middle.body');
    else if (s === 'pass') text = t('family.games.cq.coach.pass.body');
    else text = t('family.games.cq.coach.win.body', { target: v.target || 11 });
    return { kicker, text, okLabel: s === 'win' ? t('family.games.cq.coach.play') : t('family.games.cq.coach.ok') };
  }

  decorate(root) {
    const s = this.step;
    const mark = (el) => { if (el) el.classList.add('gp-coach-target'); };
    if (s === 'hand') mark(root.querySelector('.cq-hand'));
    else if (s === 'middle') mark(root.querySelector('.cq-center-card'));
    else if (s === 'take' && deciding(this.screen.view) && this.screen.best) mark(root.querySelector('.cq-take'));
    else if (s === 'throw' && discarding(this.screen.view) && this.screen.pick != null) mark(root.querySelector('.cq-discard'));
  }
}
