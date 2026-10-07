// Conquián take search and "what would Sharp Claude throw", in the browser. A port of the server's
// family/api/games/conquian/search.py (candidates, takes, simple_take, fits_any) and the Sharp parts of bot.py
// (score_layout, best_take, loosest), so ¡Me sirve! can lay the best take down in one tap and the hand can glow
// with a suggestion even when the room's hints are off. Public cards only (your view), like the server's.
// No DOM, so node tests import it (tests/e2e/conquian.search.mjs checks it against vectors made by the Python).
//
//   bestTake(view)  -> [[ids]] | null   the full layout ¡Me sirve! sends (Sharp's choice)
//   takeKind(view, layout) -> 'out' | 'fits' | 'new_meld' | 'rearrange'
//   loosest(view)   -> id | null        the card Sharp Claude would throw (or pass in the Cambio)
//   takes(table, hand, center, {cap, first}) / anyTake / simpleTake / fitsAny / scoreLayout
import { SUITS, RANKS, fits as fitsMeld } from './melds.js';

export const SEARCH_CAP = 600;   // params.SEARCH_CAP
const IDX = new Map(RANKS.map((r, i) => [r, i]));

const cmpIds = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
const sortNum = (xs) => xs.slice().sort((a, b) => a - b);
const keyOf = (ids) => sortNum(ids).join(',');

function product(lists) {
  let out = [[]];
  for (const l of lists) {
    const next = [];
    for (const pre of out) for (const x of l) next.push([...pre, x]);
    out = next;
  }
  return out;
}

function combinations(xs, k) {
  const out = [];
  const go = (start, pre) => {
    if (pre.length === k) { out.push(pre.slice()); return; }
    for (let i = start; i < xs.length; i++) { pre.push(xs[i]); go(i + 1, pre); pre.pop(); }
  };
  go(0, []);
  return out;
}

// Every valid meld inside `pool` (cards), as sorted id arrays, biggest first (then by ids, like the Python).
export function candidates(pool) {
  const byFace = new Map();
  for (const c of pool) {
    const k = c.s + c.r;
    if (!byFace.has(k)) byFace.set(k, []);
    byFace.get(k).push(c.id);
  }
  const out = new Map();
  const add = (ids) => { const s = sortNum(ids); out.set(s.join(','), s); };
  for (const r of RANKS) {
    const suits = SUITS.filter((s) => byFace.has(s + r));
    for (const k of [3, 4]) {
      for (const combo of combinations(suits, k)) for (const ids of product(combo.map((s) => byFace.get(s + r)))) add(ids);
    }
  }
  for (const s of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      let j = i;
      while (j < RANKS.length && byFace.has(s + RANKS[j])) {
        if (j - i >= 2) {
          const lists = [];
          for (let x = i; x <= j; x++) lists.push(byFace.get(s + RANKS[x]));
          for (const ids of product(lists)) add(ids);
        }
        j++;
      }
    }
  }
  return [...out.values()].sort((a, b) => b.length - a.length || cmpIds(a, b));
}

const subset = (m, set) => m.every((i) => set.has(i));

// Most cards coverable by disjoint candidates inside `free` (a Set of ids) -> list of melds.
function pack(cands, free) {
  const usable = cands.filter((m) => subset(m, free));
  let best = [];
  let bestN = 0;
  const go = (k, left, chosen, n) => {
    if (n > bestN) { bestN = n; best = chosen.slice(); }
    for (let x = k; x < usable.length; x++) {
      const m = usable[x];
      if (subset(m, left)) {
        const nl = new Set(left);
        m.forEach((i) => nl.delete(i));
        chosen.push(m);
        go(x + 1, nl, chosen, n + m.length);
        chosen.pop();
      }
    }
  };
  go(0, new Set(free), [], 0);
  return best;
}

// Layouts (lists of sorted id lists) for taking `center`. table: [[card]]; hand: [card].
export function takes(table, hand, center, { cap = SEARCH_CAP, first = false } = {}) {
  const pool = [...table.flat(), ...hand, center];
  const req = [...table.flat().map((c) => c.id), center.id];
  const handIds = hand.map((c) => c.id);
  const cands = candidates(pool);
  const byCard = new Map();
  for (const m of cands) for (const i of m) { if (!byCard.has(i)) byCard.set(i, []); byCard.get(i).push(m); }
  const out = [];
  const seen = new Set();
  const go = (used, chosen) => {
    if (out.length >= cap) return;
    const miss = req.find((i) => !used.has(i));
    if (miss === undefined) {
      const extra = first ? [] : pack(cands, new Set(handIds.filter((i) => !used.has(i))));
      const lay = [...chosen, ...extra];
      const sig = lay.map((m) => m.join(',')).sort().join('|');
      if (!seen.has(sig)) { seen.add(sig); out.push(lay.map((m) => m.slice())); }
      return;
    }
    for (const m of byCard.get(miss) || []) {
      if (!m.some((i) => used.has(i))) {
        chosen.push(m);
        const nu = new Set(used);
        m.forEach((i) => nu.add(i));
        go(nu, chosen);
        chosen.pop();
        if (first && out.length) return;
      }
    }
  };
  go(new Set(), []);
  return out;
}

export const anyTake = (table, hand, center) => takes(table, hand, center, { cap: 1, first: true }).length > 0;

export function fitsAny(table, card) {
  return (table || []).some((m) => fitsMeld(m, card));
}

export function simpleTake(table, hand, center) {
  const ids = table.map((m) => m.map((c) => c.id));
  for (let k = 0; k < table.length; k++) {
    if (fitsMeld(table[k], center)) { const lay = ids.map((x) => x.slice()); lay[k].push(center.id); return lay; }
  }
  const found = takes(table, hand, center, { cap: SEARCH_CAP, first: true });
  return found.length ? found[0] : null;
}

// ---- Sharp Claude's taste (bot.py) ------------------------------------------------------------------------------
export function tableOf(view, seat) {
  const s = seat == null ? view.me.seat : seat;
  const st = (view.seats || []).find((x) => x.seat === s);
  return ((st && st.melds) || []).map((m) => m.slice());
}
function nextSeat(view) {
  const n = (view.seats || []).length;
  const want = (view.me.seat + 1) % Math.max(1, n);
  return (view.seats || []).find((s) => s.seat === want) || null;
}

function link(a, b) {
  if (a.r === b.r) return a.s !== b.s ? 3 : 0;
  if (a.s === b.s) {
    const d = Math.abs(IDX.get(a.r) - IDX.get(b.r));
    return d === 1 ? 3 : d === 2 ? 2 : 0;
  }
  return 0;
}

function conn(c, others, table) {
  let v = 0;
  for (const o of others) if (o.id !== c.id) v += link(c, o);
  if (fitsAny(table, c)) v += 4;
  return v;
}

export function scoreLayout(view, layout) {
  const hand = new Map(view.me.hand.map((c) => [c.id, c]));
  const table = tableOf(view);
  const cards = new Map(table.flat().map((c) => [c.id, c]));
  hand.forEach((c, i) => cards.set(i, c));
  const center = view.center.card;
  cards.set(center.id, center);
  const used = new Set(layout.flat().filter((i) => hand.has(i)));
  const left = [...hand.values()].filter((c) => !used.has(c.id));
  if (!left.length) return 1e6;
  const newTable = layout.map((m) => m.map((i) => cards.get(i)));
  const sc = left.map((c) => conn(c, left, newTable));
  const keep = new Set(table.map((m) => keyOf(m.map((c) => c.id))));
  const same = layout.filter((m) => keep.has(keyOf(m))).length;
  return 100 * used.size + sc.reduce((a, b) => a + b, 0) - Math.min(...sc) + 0.01 * same;
}

// The layout ¡Me sirve! sends: Sharp's best (the most hand cards down, the best leftovers kept).
export function bestTake(view) {
  if (!view || !view.me || !view.center || !view.center.card) return null;
  const lays = takes(tableOf(view), view.me.hand || [], view.center.card);
  if (!lays.length) return null;
  let best = null;
  let bestS = -Infinity;
  for (const lay of lays) {
    const s = scoreLayout(view, lay);
    if (s > bestS) { bestS = s; best = lay; }   // Python's max(): the first of equals wins
  }
  return best;
}

// What kind of take a layout is (the words ¡Me sirve! uses): hint.py's _take_why.
export function takeKind(view, layout) {
  const hand = new Set(view.me.hand.map((c) => c.id));
  const used = new Set(layout.flat().filter((i) => hand.has(i)));
  if (used.size === hand.size) return 'out';
  const old = tableOf(view).map((m) => m.map((c) => c.id));
  const kept = old.every((o) => layout.some((m) => o.every((i) => m.includes(i))));
  if (!kept) return 'rearrange';
  const cid = view.center.card.id;
  const home = layout.find((m) => m.includes(cid)) || [];
  return old.some((o) => o.every((i) => home.includes(i))) ? 'fits' : 'new_meld';
}

// The card Sharp Claude lets go of: least connected, not feeding the next seat, higher ranks first among equals.
export function loosest(view) {
  const hand = (view && view.me && view.me.hand) || [];
  if (!hand.length) return null;
  const table = tableOf(view);
  const nxt = nextSeat(view);
  const nxtTable = nxt ? (nxt.melds || []) : [];
  const sc = new Map(hand.map((c) => [c.id, conn(c, hand, table) + (fitsAny(nxtTable, c) ? 6 : 0)]));
  const ranked = hand.slice().sort((a, b) => sc.get(a.id) - sc.get(b.id) || IDX.get(b.r) - IDX.get(a.r) || a.id - b.id);
  return ranked[0].id;
}

// Is a layout a legal take for this view (contract §4)? Used by the tests and as a last check before sending.
export function validTake(view, layout, classify) {
  const hand = new Set(view.me.hand.map((c) => c.id));
  const table = tableOf(view).flat().map((c) => c.id);
  const cards = new Map([...view.me.hand, ...tableOf(view).flat(), view.center.card].map((c) => [c.id, c]));
  const ids = layout.flat();
  if (new Set(ids).size !== ids.length) return false;
  if (!ids.includes(view.center.card.id)) return false;
  if (!table.every((i) => ids.includes(i))) return false;
  if (!ids.every((i) => hand.has(i) || table.includes(i) || i === view.center.card.id)) return false;
  return layout.every((m) => !!classify(m.map((i) => cards.get(i))));
}
