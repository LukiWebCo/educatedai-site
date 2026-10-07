// Conquián melds (contracts/conquian.md §2). The twin of family/api/games/conquian/melds.py: same answers for
// the same cards. No DOM here, so node tests import it directly (tests/e2e/conquian.melds.mjs).
//
//   classify(faces) -> 'set' | 'run' | null      fits(meldFaces, face) -> bool      why(faces) -> plain reason
//
// A face can be [s, r], {s, r} (a public card) or a face string like "c7" / "e10".
//   set: 3 or 4 cards, same rank, all different suits
//   run: 3+ cards, same suit, consecutive in 1 2 3 4 5 6 7 10 11 12 (7 and 10 are neighbours), no repeats,
//        ace low only, no wrapping

export const SUITS = ['o', 'c', 'e', 'b'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const IDX = new Map(RANKS.map((r, i) => [r, i]));

export function face(x) {
  if (Array.isArray(x)) return { s: x[0], r: Number(x[1]) };
  if (typeof x === 'string') {
    const m = /^([oceb])(\d{1,2})$/.exec(x);
    return m ? { s: m[1], r: Number(m[2]) } : { s: '?', r: 0 };
  }
  return { s: x && x.s, r: Number(x && x.r) };
}

export function faceStr(x) {
  const f = face(x);
  return f.s + f.r;
}

function valid(f) { return SUITS.includes(f.s) && IDX.has(f.r); }

export function classify(faces) {
  const fs = (faces || []).map(face);
  if (fs.length < 3 || !fs.every(valid)) return null;
  const r0 = fs[0].r;
  if (fs.every((f) => f.r === r0)) {
    return fs.length <= 4 && new Set(fs.map((f) => f.s)).size === fs.length ? 'set' : null;
  }
  const s0 = fs[0].s;
  if (!fs.every((f) => f.s === s0)) return null;
  const ix = fs.map((f) => IDX.get(f.r)).sort((a, b) => a - b);
  for (let i = 1; i < ix.length; i++) if (ix[i] !== ix[i - 1] + 1) return null;
  return 'run';
}

export function fits(meld, f) {
  return classify([...(meld || []), f]) !== null;
}

// Why a group isn't a meld yet, in one word the UI turns into a plain sentence
// (family.games.cq.why.*): short | mixed | suit_twice | too_many | gap | dup | ok.
export function why(faces) {
  const fs = (faces || []).map(face);
  if (classify(fs)) return 'ok';
  if (fs.length < 3) return 'short';
  const sameRank = fs.every((f) => f.r === fs[0].r);
  if (sameRank) return fs.length > 4 ? 'too_many' : 'suit_twice';
  if (!fs.every((f) => f.s === fs[0].s)) return 'mixed';
  const ranks = fs.map((f) => f.r);
  if (new Set(ranks).size !== ranks.length) return 'dup';
  return 'gap';
}

// Cards in the order a person reads them: runs low to high, sets by suit.
export function sortMeld(cards) {
  const fs = cards.slice();
  const kind = classify(fs);
  if (kind === 'set') return fs.sort((a, b) => SUITS.indexOf(face(a).s) - SUITS.indexOf(face(b).s));
  return fs.sort((a, b) => (IDX.get(face(a).r) ?? 99) - (IDX.get(face(b).r) ?? 99) || SUITS.indexOf(face(a).s) - SUITS.indexOf(face(b).s));
}

// The hand, sorted for display: by suit (then rank) or by rank (then suit).
export function sortHand(cards, by = 'suit') {
  const si = (c) => SUITS.indexOf(face(c).s);
  const ri = (c) => IDX.get(face(c).r) ?? 99;
  return cards.slice().sort(by === 'rank'
    ? (a, b) => ri(a) - ri(b) || si(a) - si(b) || a.id - b.id
    : (a, b) => si(a) - si(b) || ri(a) - ri(b) || a.id - b.id);
}
