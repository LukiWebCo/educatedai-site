// Line validator for Dots & Lines (contracts/games.md section 4). Mirrors family/api/games/dots/lines.py
// exactly; both run tests/family/games/vectors.json. Pure, no DOM.
//   check(dots, sparkAs) -> {valid:false, why} | {valid:true, kind:'run'|'group', full, order:[ids], as:{id:{c,n}}}
// dots: {id,c,n} or {id,s:true} (any "as" on a dot is ignored; hints come only from sparkAs).

export const SUITS = ['r', 'b', 'g', 'p'];
export const RUN_FULL = 6;
export const GROUP_FULL = 4;
export const WHY = ['short', 'long', 'gap', 'dup', 'mixed', 'suit_twice', 'spark_as', 'all_sparks'];

const bad = (why) => ({ valid: false, why });
const numOk = (n) => Number.isInteger(n) && n >= 1 && n <= 12;

export function check(dots, sparkAs) {
  const hintsIn = sparkAs || {};
  if (dots.length < 3) return bad('short');
  const plain = dots.filter((d) => !d.s);
  const sparks = dots.filter((d) => d.s).sort((a, b) => a.id - b.id);
  if (!plain.length) return bad('all_sparks');
  const sparkIds = new Set(sparks.map((d) => String(d.id)));
  const hints = {};
  for (const [k, v] of Object.entries(hintsIn)) {
    if (!sparkIds.has(String(k)) || !v || typeof v !== 'object' || !SUITS.includes(v.c) || !numOk(v.n)) return bad('spark_as');
    hints[String(k)] = { c: v.c, n: v.n };
  }
  const known = plain.map((d) => [d.id, d.c, d.n]);
  for (const d of sparks) { const h = hints[String(d.id)]; if (h) known.push([d.id, h.c, h.n]); }
  const free = sparks.filter((d) => !hints[String(d.id)]).map((d) => d.id);
  const suits = new Set(known.map((k) => k[1]));
  const nums = known.map((k) => k[2]);
  const total = dots.length;
  const asOf = (placed) => {
    const out = {};
    for (const [i, c, n] of placed) if (sparkIds.has(String(i))) out[String(i)] = { c, n };
    return out;
  };
  if (suits.size === 1) {
    const suit = known[0][1];
    if (new Set(nums).size !== nums.length) return bad('dup');
    if (total > RUN_FULL) return bad('long');
    const lo = Math.min(...nums), hi = Math.max(...nums);
    const have = new Set(nums);
    const missing = [];
    for (let n = lo; n <= hi; n++) if (!have.has(n)) missing.push(n);
    if (missing.length > free.length) return bad('gap');
    const placed = known.slice();
    let fi = 0;
    for (const n of missing) placed.push([free[fi++], suit, n]);
    let top = hi, bottom = lo;
    while (fi < free.length && top < 12) placed.push([free[fi++], suit, ++top]);
    while (fi < free.length) placed.push([free[fi++], suit, --bottom]);
    placed.sort((a, b) => a[2] - b[2]);
    return { valid: true, kind: 'run', full: total === RUN_FULL, order: placed.map((p) => p[0]), as: asOf(placed) };
  }
  if (new Set(nums).size === 1) {
    const num = nums[0];
    if (total > GROUP_FULL) return bad('long');
    if (suits.size !== known.length) return bad('suit_twice');
    const placed = known.slice();
    const spare = SUITS.filter((c) => !suits.has(c));
    free.forEach((i, fi) => placed.push([i, spare[fi], num]));
    placed.sort((a, b) => SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));
    return { valid: true, kind: 'group', full: total === GROUP_FULL, order: placed.map((p) => p[0]), as: asOf(placed) };
  }
  return bad('mixed');
}

// Which lines of a staged table fail, for the "N Lines need fixing" label: [{index, why}].
export function badLines(lines) {
  const out = [];
  lines.forEach((l, index) => {
    const r = check(l.dots, l.spark_as);
    if (!r.valid) out.push({ index, why: r.why });
  });
  return out;
}
