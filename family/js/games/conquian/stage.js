// Conquián: building a take on the phone ("¡Me sirve!"), before anything is sent. Pure logic, no DOM, so the
// node test drives it (tests/e2e/conquian.melds.mjs).
//
// The table you're building = your melds as they are + the center card in a new meld. Taps only:
//   tapHand(id)    a hand card joins the "active" meld (the glowing one); tap it again and it goes back
//   pick(id)       pick up a card that's on your table (the center card, a card you just added, or one of your
//                  melds' cards) to move it; pick it again to put it back down where it was
//   drop(key)      with a card picked up: move it to that meld. With nothing picked: make that meld active
//   newMeld()      start another meld (and move the picked card there, if any)
//   status()       {ok, why, melds:[[ids]], out, count, bad:[keys], centerIn}
//   action()       {type:'take', melds}
// Rules mirrored from contracts/conquian.md §4 "Take": every meld classifies, the center card is in it, every
// card already on your table is still in it, the rest comes from your hand, no id twice.
import { classify, why as whyOf, sortMeld } from './melds.js';

export class Take {
  constructor(view) {
    const me = view.me || {};
    const seat = (view.seats || []).find((s) => s.seat === me.seat) || {};
    this.target = view.target || 0;
    this.center = view.center ? view.center.card : null;
    this.hand = (me.hand || []).slice();
    this.table = (seat.melds || []).map((m) => m.slice());
    this.tableIds = new Set(this.table.flat().map((c) => c.id));
    this.reset();
  }

  reset() {
    this.groups = this.table.map((m, i) => ({ key: 't' + i, cards: m.slice(), orig: true }));
    this.seq = 1;
    this.groups.push({ key: 'n1', cards: this.center ? [this.center] : [], orig: false });
    this.active = 'n1';
    this.held = null;
    this.lastMoved = null;
    this.sig0 = this.sig();
  }

  group(key) { return this.groups.find((g) => g.key === key) || null; }
  where(id) { return this.groups.find((g) => g.cards.some((c) => c.id === id)) || null; }
  inHand(id) { return this.hand.some((c) => c.id === id) && !this.where(id); }
  handLeft() { return this.hand.filter((c) => !this.where(c.id)); }
  isHandCard(id) { return this.hand.some((c) => c.id === id); }

  sig() { return JSON.stringify(this.groups.filter((g) => g.cards.length).map((g) => [g.key, g.cards.map((c) => c.id)])); }
  dirty() { return this.sig() !== this.sig0 || this.held != null; }

  tapHand(id) {
    const g = this.where(id);
    if (g) { // it was put down this turn: back to the hand
      g.cards = g.cards.filter((c) => c.id !== id);
      if (this.held === id) this.held = null;
      this.lastMoved = null;
      return { ok: true, back: true };
    }
    const card = this.hand.find((c) => c.id === id);
    if (!card) return { ok: false };
    let to = this.group(this.active);
    if (!to) { this.newMeld(); to = this.group(this.active); }
    to.cards.push(card);
    this.lastMoved = id;
    return { ok: true, key: to.key };
  }

  pick(id) {
    if (this.held === id) { this.held = null; return { ok: true, dropped: true }; }
    if (!this.where(id)) return { ok: false };
    this.held = id;
    return { ok: true };
  }

  drop(key) {
    const to = this.group(key);
    if (!to) return { ok: false };
    if (this.held == null) { this.active = key; return { ok: true, active: key }; }
    const from = this.where(this.held);
    if (from && from.key !== key) {
      const card = from.cards.find((c) => c.id === this.held);
      from.cards = from.cards.filter((c) => c.id !== this.held);
      to.cards.push(card);
      this.lastMoved = card.id;
    }
    this.held = null;
    this.active = key;
    this.prune();
    return { ok: true, key };
  }

  newMeld() {
    this.seq += 1;
    const g = { key: 'n' + this.seq, cards: [], orig: false };
    this.groups.push(g);
    this.active = g.key;
    if (this.held != null) return this.drop(g.key);
    return { ok: true, key: g.key };
  }

  // Empty new melds go away (but keep the active one, so the next tap has somewhere to land).
  prune() {
    this.groups = this.groups.filter((g) => g.orig || g.cards.length || g.key === this.active);
  }

  info(g) {
    const kind = classify(g.cards);
    const w = kind ? 'ok' : (g.cards.length ? whyOf(g.cards) : 'empty');
    return { key: g.key, kind, valid: !!kind, why: w, orig: g.orig, cards: kind ? sortMeld(g.cards) : g.cards.slice(),
      changed: g.orig ? g.cards.length !== this.table[Number(g.key.slice(1))].length || g.cards.some((c) => !this.tableIds.has(c.id)) : g.cards.length > 0 };
  }

  infos() { return this.groups.map((g) => this.info(g)); }

  status() {
    const infos = this.infos().filter((i) => i.cards.length);
    const bad = infos.filter((i) => !i.valid).map((i) => i.key);
    const melds = infos.filter((i) => i.cards.length).map((i) => i.cards.map((c) => c.id));
    const count = melds.reduce((n, m) => n + m.length, 0);
    const centerIn = !!(this.center && melds.some((m) => m.includes(this.center.id)));
    const ids = melds.flat();
    let why = 'ok';
    if (!centerIn) why = 'center_missing';
    else if ([...this.tableIds].some((id) => !ids.includes(id))) why = 'table_missing';
    else if (new Set(ids).size !== ids.length) why = 'dup';
    else if (bad.length) why = 'bad';
    else if (this.held != null) why = 'holding';
    return { ok: why === 'ok', why, melds, count, out: why === 'ok' && this.target > 0 && count === this.target, bad, centerIn };
  }

  action() { return { type: 'take', melds: this.status().melds }; }

  // Lay out a suggested take (the Smart Hint's `melds`, ids) so the player only has to tap ¡Me sirve!.
  applyLayout(melds) {
    const all = new Map([...this.hand, ...this.table.flat(), ...(this.center ? [this.center] : [])].map((c) => [c.id, c]));
    if (!melds.every((m) => m.every((id) => all.has(id)))) return false;
    const used = new Set();
    const groups = [];
    // keep the meld keys of your table melds when a suggested meld still holds them
    this.table.forEach((m, i) => {
      const j = melds.findIndex((s, k) => !used.has(k) && m.every((c) => s.includes(c.id)));
      if (j >= 0) { used.add(j); groups.push({ key: 't' + i, cards: melds[j].map((id) => all.get(id)), orig: true }); }
      else groups.push({ key: 't' + i, cards: [], orig: true });
    });
    let n = 0;
    melds.forEach((s, k) => { if (!used.has(k)) groups.push({ key: 'n' + (++n), cards: s.map((id) => all.get(id)), orig: false }); });
    if (!n) groups.push({ key: 'n1', cards: [], orig: false });
    this.groups = groups;
    this.seq = Math.max(1, n);
    this.active = groups[groups.length - 1].key;
    this.held = null;
    return true;
  }
}
