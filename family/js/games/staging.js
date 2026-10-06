// Dots & Lines: the "Pick up / Put down" staging model for one commit (contracts/games.md §1 Turn, §4, §6 place).
// Pure: no DOM, no fetch, no i18n. The line checker is injected (lines.js `check`, the same rules as the server),
// so tests run it under node (tests/e2e/games.staging.mjs).
//
//   const s = new Staging(view, check);
//   s.pick(id) / s.unpick(id) / s.putOn(key) / s.putNew() / s.split(key, at) / s.reset()
//   s.lineInfo(line) · s.status() · s.hintKeys() · s.action() · s.snapshot() / Staging.restore(view, check, snap)
//
// Every mutator returns {ok:true} or {ok:false, err:<code>}. Codes: not_turn, locked, simple, no_dot,
// table_to_hand, empty_air, no_line, bad_split. play.js maps them to plain words.

const SUITS = 'rbgp';

function faceKey(d) {
  // Sorting key for a line that doesn't check out yet: number, then suit; Sparks last.
  if (d.s) return 1000;
  return d.n * 4 + SUITS.indexOf(d.c);
}

function sortLoose(dots) {
  return dots.slice().sort((a, b) => faceKey(a) - faceKey(b) || a.id - b.id);
}

export class Staging {
  constructor(view, check) {
    this.check = check;
    this.view = view;
    const me = view.me;
    this.simple = !!(view.room && view.room.settings && view.room.settings.simple_table);
    this.myTurn = !!(me && view.turn && view.turn.seat === me.seat && view.turn.phase === 'play' && !view.result);
    this.locked = new Set(me ? me.locked || [] : []);
    this.origin = new Map();       // id -> 'table' | 'hand' | 'stack'
    this.baseLine = new Map();     // table dot id -> base line id
    this.baseAs = new Map();       // table Spark id -> {c,n} it stood for
    this.handOrder = new Map();    // hand dot id -> index in the dealt hand
    for (const L of view.table || []) {
      for (const d of L.dots) {
        this.origin.set(d.id, 'table');
        this.baseLine.set(d.id, L.id);
        if (d.s && d.as) this.baseAs.set(d.id, { c: d.as.c, n: d.as.n });
      }
    }
    if (me) {
      me.hand.forEach((d, i) => { this.origin.set(d.id, 'hand'); this.handOrder.set(d.id, i); });
      if (me.stack_top) this.origin.set(me.stack_top.id, 'stack');
    }
    this.reset();
  }

  // ---- state -------------------------------------------------------------------------------------------------
  reset() {
    const me = this.view.me;
    this.seq = 0;
    this.lines = (this.view.table || []).map((L) => ({ key: L.id, orig: L.id, dots: L.dots.map(plain) }));
    this.hand = me ? me.hand.map(plain) : [];
    this.stack = me && me.stack_top ? plain(me.stack_top) : null;   // null: empty Stack, or its top is out
    this.air = [];                                                  // [{dot, from}]
    this.lastPut = [];
    return { ok: true };
  }

  get stackTop() { return this.view.me ? this.view.me.stack_top : null; }

  findLine(key) { return this.lines.find((l) => l.key === key) || null; }

  where(id) {
    if (this.air.some((a) => a.dot.id === id)) return { at: 'air' };
    if (this.hand.some((d) => d.id === id)) return { at: 'hand' };
    if (this.stack && this.stack.id === id) return { at: 'stack' };
    for (const l of this.lines) if (l.dots.some((d) => d.id === id)) return { at: 'line', key: l.key };
    return null;
  }

  canPickFromTable(id) {
    // Simple table: dots that were on the table at the start of the commit stay put. Your own new dots move freely.
    return !(this.simple && this.origin.get(id) === 'table');
  }

  // ---- mutators ---------------------------------------------------------------------------------------------
  pick(id) {
    if (!this.myTurn) return { ok: false, err: 'not_turn' };
    if (this.locked.has(id)) return { ok: false, err: 'locked' };
    const w = this.where(id);
    if (!w) return { ok: false, err: 'no_dot' };
    if (w.at === 'air') return this.unpick(id);
    let dot;
    if (w.at === 'hand') {
      dot = this.hand.find((d) => d.id === id);
      this.hand = this.hand.filter((d) => d.id !== id);
    } else if (w.at === 'stack') {
      dot = this.stack;
      this.stack = null;
    } else {
      if (!this.canPickFromTable(id)) return { ok: false, err: 'simple' };
      const l = this.findLine(w.key);
      dot = l.dots.find((d) => d.id === id);
      l.dots = l.dots.filter((d) => d.id !== id);
      if (!l.dots.length) this.lines = this.lines.filter((x) => x !== l);
    }
    this.air.push({ dot, from: this.origin.get(id) });
    this.lastPut = [];
    return { ok: true };
  }

  unpick(id) {
    const i = this.air.findIndex((a) => a.dot.id === id);
    if (i < 0) return { ok: false, err: 'no_dot' };
    const a = this.air[i];
    if (a.from === 'table') return { ok: false, err: 'table_to_hand' };
    this.air.splice(i, 1);
    if (a.from === 'stack') this.stack = a.dot;
    else {
      this.hand.push(a.dot);
      this.hand.sort((x, y) => this.handOrder.get(x.id) - this.handOrder.get(y.id));
    }
    return { ok: true };
  }

  // Back to where it came from: the hand/Stack dots in the air. Table dots stay in the air (no target offered).
  dropAirHome() {
    for (const a of this.air.slice()) if (a.from !== 'table') this.unpick(a.dot.id);
    return { ok: true };
  }

  putOn(key) {
    if (!this.air.length) return { ok: false, err: 'empty_air' };
    const l = this.findLine(key);
    if (!l) return { ok: false, err: 'no_line' };
    const moved = this.air.map((a) => a.dot);
    this.air = [];
    l.dots = this.arrange(l, l.dots.concat(moved));
    this.lastPut = moved.map((d) => d.id);
    return { ok: true, key };
  }

  putNew() {
    if (!this.air.length) return { ok: false, err: 'empty_air' };
    const moved = this.air.map((a) => a.dot);
    this.air = [];
    const l = { key: 'n' + (++this.seq), orig: null, dots: [] };
    l.dots = this.arrange(l, moved);
    this.lines.unshift(l);           // the "+ New line" bar sits at the top, so the new line appears there
    this.lastPut = moved.map((d) => d.id);
    return { ok: true, key: l.key };
  }

  split(key, at) {
    if (!this.myTurn) return { ok: false, err: 'not_turn' };
    if (this.simple) return { ok: false, err: 'simple' };
    if (this.air.length) return { ok: false, err: 'bad_split' };
    const i = this.lines.findIndex((x) => x.key === key);
    if (i < 0) return { ok: false, err: 'no_line' };
    const l = this.lines[i];
    if (!(at > 0 && at < l.dots.length)) return { ok: false, err: 'bad_split' };
    const b = { key: 'n' + (++this.seq), orig: null, dots: l.dots.slice(at) };
    l.dots = l.dots.slice(0, at);
    this.lines.splice(i + 1, 0, b);
    this.lastPut = [];
    return { ok: true, key: b.key };
  }

  // ---- checking ---------------------------------------------------------------------------------------------
  // The Spark hints a line keeps: a table Spark that is still in the line it started in keeps what it stood for.
  hintsFor(l) {
    const out = {};
    for (const d of l.dots) {
      if (d.s && l.orig && this.baseLine.get(d.id) === l.orig && this.baseAs.has(d.id)) out[String(d.id)] = this.baseAs.get(d.id);
    }
    return out;
  }

  evaluate(l, dots = l.dots) {
    const hints = this.hintsFor({ orig: l.orig, dots });
    let r = this.check(dots, hints);
    let used = hints;
    if (!r.valid && Object.keys(hints).length) {
      const r2 = this.check(dots, {});
      if (r2.valid) { r = r2; used = {}; }
    }
    return { r, sparkAs: used };
  }

  arrange(l, dots) {
    const { r } = this.evaluate(l, dots);
    if (r.valid && r.order) {
      const byId = new Map(dots.map((d) => [d.id, d]));
      return r.order.map((id) => byId.get(id));
    }
    return sortLoose(dots);
  }

  // Everything the screen needs about one line.
  lineInfo(l) {
    const { r, sparkAs } = this.evaluate(l);
    const as = r.valid ? r.as || {} : {};
    const dots = l.dots.map((d) => (d.s ? { ...d, as: as[String(d.id)] || null } : d));
    const changed = !l.orig || !this.sameAsBase(l);
    return {
      key: l.key, orig: l.orig, dots, changed,
      valid: !!r.valid, why: r.valid ? null : r.why, kind: r.valid ? r.kind : null, full: !!(r.valid && r.full),
      sparkAs,
    };
  }

  sameAsBase(l) {
    const base = (this.view.table || []).find((L) => L.id === l.orig);
    if (!base || base.dots.length !== l.dots.length) return false;
    const ids = new Set(base.dots.map((d) => d.id));
    return l.dots.every((d) => ids.has(d.id));
  }

  // Dots of mine (hand or Stack) on the table now.
  placedIds() {
    const out = [];
    for (const l of this.lines) for (const d of l.dots) if (this.origin.get(d.id) !== 'table') out.push(d.id);
    return out;
  }

  stackUsed() {
    const top = this.stackTop;
    return !!(top && this.lines.some((l) => l.dots.some((d) => d.id === top.id)));
  }

  dirty() {
    if (this.air.length || this.placedIds().length) return true;
    const base = this.view.table || [];
    if (this.lines.length !== base.length) return true;
    return this.lines.some((l) => !l.orig || !this.sameAsBase(l));
  }

  status() {
    const infos = this.lines.map((l) => this.lineInfo(l));
    const bad = infos.filter((i) => !i.valid).map((i) => i.key);
    const full = infos.filter((i) => i.full).map((i) => i.key);
    const dirty = this.dirty();
    let reason = null;
    if (!this.myTurn) reason = 'not_turn';
    else if (this.air.length) reason = 'holding';
    else if (bad.length) reason = 'bad';
    else if (!dirty) reason = 'nothing';
    return {
      infos, bad, full, dirty, reason, canPlace: reason === null,
      holding: this.air.length, placed: this.placedIds().length, stackUsed: this.stackUsed(),
    };
  }

  // Lines your Stack top fits straight into (the Hint lamp). Works while the dot is on the Stack or in the air.
  hintKeys() {
    const top = this.stackTop;
    if (!top || this.stackUsed()) return [];
    const out = [];
    for (const l of this.lines) {
      if (l.dots.some((d) => d.id === top.id)) continue;
      if (this.evaluate(l, l.dots.concat([plain(top)])).r.valid) out.push(l.key);
    }
    return out;
  }

  // The `place` action body (without cid): the whole new table.
  action() {
    const lines = this.lines.map((l) => {
      const { sparkAs } = this.evaluate(l);
      const o = { dots: l.dots.map((d) => d.id) };
      if (Object.keys(sparkAs).length) o.spark_as = sparkAs;
      return o;
    });
    const a = { type: 'place', lines };
    if (this.stackUsed()) a.stack = true;
    return a;
  }

  // ---- persistence (sessionStorage "eai.games.<room>:<v>", dropped when the version moves) -----------------
  snapshot() {
    return {
      v: this.view.v, seq: this.seq,
      lines: this.lines.map((l) => ({ key: l.key, orig: l.orig, ids: l.dots.map((d) => d.id) })),
      air: this.air.map((a) => a.dot.id),
      stack: !!this.stack,
    };
  }

  static restore(view, check, snap) {
    const s = new Staging(view, check);
    if (!snap || snap.v !== view.v || !s.myTurn) return s;
    try {
      const all = new Map();
      for (const L of view.table || []) for (const d of L.dots) all.set(d.id, plain(d));
      for (const d of view.me.hand) all.set(d.id, plain(d));
      if (view.me.stack_top) all.set(view.me.stack_top.id, plain(view.me.stack_top));
      const seen = new Set();
      const take = (id) => {
        if (!all.has(id) || seen.has(id)) throw new Error('bad snapshot');
        seen.add(id);
        return all.get(id);
      };
      const lines = snap.lines.map((l) => ({ key: String(l.key), orig: l.orig, dots: l.ids.map(take) }));
      const air = snap.air.map((id) => ({ dot: take(id), from: s.origin.get(id) }));
      const stackOnTable = view.me.stack_top && seen.has(view.me.stack_top.id);
      // Every table dot must still be somewhere on the table or in the air (the table rule).
      for (const id of s.baseLine.keys()) if (!seen.has(id)) throw new Error('table dot lost');
      for (const id of seen) if (s.locked.has(id)) throw new Error('locked dot used');
      s.lines = lines.filter((l) => l.dots.length);
      s.air = air;
      s.hand = view.me.hand.filter((d) => !seen.has(d.id)).map(plain);
      s.stack = view.me.stack_top && !stackOnTable && snap.stack ? plain(view.me.stack_top) : null;
      if (view.me.stack_top && !s.stack && !seen.has(view.me.stack_top.id)) s.stack = plain(view.me.stack_top);
      s.seq = snap.seq || 0;
    } catch {
      s.reset();
    }
    return s;
  }
}

function plain(d) {
  return d.s ? { id: d.id, s: true } : { id: d.id, c: d.c, n: d.n };
}
