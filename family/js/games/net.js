// Games network client: the REST calls (contracts/games.md §10) and the room poller (§11).
// The poller's decisions live in `decide()`, a pure function the node test drives directly
// (tests/e2e/games.net.mjs). Everything that touches fetch/timers is injected, so the loop runs in node too.

export const LONG_FAILS_MAX = 2;      // failed long-polls in a row before falling back
export const POLL_MS = 3000;          // plain polling period
export const FALLBACK_MS = 60000;     // how long to stay on plain polling before trying long-poll again
export const RETRY_LONG_MS = 1000;    // pause before re-trying a failed long-poll

// Outcomes: {kind:'view'} | {kind:'unchanged'} | {kind:'retry', ms} | {kind:'error', status}
// State: {mode:'long'|'poll', fails, pollUntil}. Returns {st, delay, stop?}.
export function decide(st, out, now) {
  st = { mode: 'long', fails: 0, pollUntil: 0, ...st };
  if (out.kind === 'error' && [401, 403, 404].includes(out.status)) return { st, delay: 0, stop: true };
  if (st.mode === 'poll') {
    if (now >= st.pollUntil) return { st: { mode: 'long', fails: 0, pollUntil: 0 }, delay: 0 };
    return { st, delay: POLL_MS };
  }
  if (out.kind === 'retry') {
    return { st: { mode: 'poll', fails: 0, pollUntil: now + FALLBACK_MS }, delay: Math.max(Number(out.ms) || POLL_MS, 250) };
  }
  if (out.kind === 'error') {
    const fails = st.fails + 1;
    if (fails >= LONG_FAILS_MAX) return { st: { mode: 'poll', fails: 0, pollUntil: now + FALLBACK_MS }, delay: POLL_MS };
    return { st: { ...st, fails }, delay: RETRY_LONG_MS };
  }
  return { st: { ...st, fails: 0 }, delay: 0 };
}

// Classify a wait/GET response body.
export function classify(body) {
  if (body && typeof body.retry_ms === 'number' && body.v === undefined) return { kind: 'retry', ms: body.retry_ms };
  if (body && body.unchanged) return { kind: 'unchanged' };
  if (body && typeof body.v === 'number') return { kind: 'view' };
  return { kind: 'error', status: 0 };
}

// Client-chosen action id: 8–40 chars of [A-Za-z0-9_-].
export function newCid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 24);
  let s = '';
  for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
  return s;
}

/**
 * The room poller. deps: {
 *   wait(v, signal) -> body, view(signal) -> body,        // network (throw {status} on HTTP errors)
 *   onView(view), onStop?(err), alive() -> bool,           // the screen
 *   now?(), sleep?(ms, signal)                             // injectable for tests
 * }
 * Returns {kick(), stop(), state(), v()}. kick() = immediate GET (visibilitychange, after an action).
 */
export function createPoller(deps, startV = -1) {
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || ((ms, signal) => new Promise((res) => {
    if (!ms) { res(); return; }
    const id = setTimeout(res, ms);
    signal.addEventListener('abort', () => { clearTimeout(id); res(); }, { once: true });
  }));
  let st = { mode: 'long', fails: 0, pollUntil: 0 };
  let v = startV;
  let stopped = false;
  let ctl = null;
  let kicked = false;

  function take(body) {
    if (body && typeof body.v === 'number' && !body.unchanged && body.v !== v) {
      // Versions only move forward, but a reset room (rematch) may restart lower; trust the server.
      v = body.v;
      deps.onView(body);
    }
  }

  async function once() {
    ctl = new AbortController();
    const signal = ctl.signal;
    let out;
    try {
      const useGet = kicked || st.mode === 'poll' || v < 0;
      kicked = false;
      const body = useGet ? await deps.view(signal) : await deps.wait(v, signal);
      out = classify(body);
      if (out.kind === 'view') take(body);
      if (useGet && out.kind === 'view' && st.mode === 'long') return 0; // a GET in long mode: go straight to waiting
    } catch (e) {
      if (signal.aborted) return 0;
      out = { kind: 'error', status: (e && e.status) || 0 };
    }
    const d = decide(st, out, now());
    st = d.st;
    if (d.stop) { stopped = true; deps.onStop && deps.onStop(out); return 0; }
    return d.delay;
  }

  async function loop() {
    while (!stopped) {
      if (!deps.alive()) { stop(); break; }
      const delay = await once();
      if (stopped || !deps.alive()) { stop(); break; }
      if (delay && !kicked) {
        ctl = new AbortController();
        await sleep(delay, ctl.signal);
      }
    }
  }

  function stop() { stopped = true; if (ctl) ctl.abort(); }
  function kick() { if (stopped) return; kicked = true; if (ctl) ctl.abort(); }

  const done = loop();
  return { kick, stop, done, state: () => ({ ...st }), v: () => v, setV: (n) => { if (typeof n === 'number' && n > v) v = n; } };
}

// ---- REST (browser only) ---------------------------------------------------------------------------
async function apiMod() { return import('../api.js'); }

function base() {
  return ((globalThis.window && window.EAI && window.EAI.apiBase) || '').replace(/\/+$/, '');
}

// GET with an AbortSignal (api.js has none). 401 is handed to api.js so its sign-out handler runs.
async function getSignal(path, signal) {
  const { getToken, get, ApiErr } = await apiMod();
  const headers = {};
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let res;
  try {
    res = await fetch(base() + path, { method: 'GET', headers, signal, mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    throw new ApiErr(0, 'family.errors.server', 'offline');
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401) get('/api/me').catch(() => {});
    const err = (json && json.error) || {};
    throw new ApiErr(res.status, err.key || 'family.errors.server', err.code);
  }
  return json;
}

export const games = {
  async rooms() { return (await apiMod()).get('/api/games/rooms'); },
  async people() { return (await apiMod()).get('/api/games/people'); },
  async create(mode, settings) { return (await apiMod()).post('/api/games/rooms', { mode, game: 'dots', settings }); },
  async join(code, as = 'player') { return (await apiMod()).post('/api/games/join', { code, as }); },
  async room(id, signal) { return signal ? getSignal(`/api/games/rooms/${id}`, signal) : (await apiMod()).get(`/api/games/rooms/${id}`); },
  wait(id, v, signal) { return getSignal(`/api/games/rooms/${id}/wait?v=${v}`, signal); },
  async invite(id, memberIds) { return (await apiMod()).post(`/api/games/rooms/${id}/invite`, { member_ids: memberIds }); },
  async seats(id, body) { return (await apiMod()).post(`/api/games/rooms/${id}/seats`, body); },
  async start(id) { return (await apiMod()).post(`/api/games/rooms/${id}/start`, {}); },
  async hint(id) { return (await apiMod()).get(`/api/games/rooms/${id}/hint`); },
  async practice() { return (await apiMod()).post('/api/games/practice', {}); },
  async options(id, body) { return (await apiMod()).post(`/api/games/rooms/${id}/options`, body); },
  // One action. A network failure is retried once with the same cid (the server makes a repeat harmless).
  async act(id, action) {
    const { post } = await apiMod();
    const body = { cid: newCid(), ...action };
    try {
      return await post(`/api/games/rooms/${id}/act`, body);
    } catch (e) {
      if (e && e.status === 0) return post(`/api/games/rooms/${id}/act`, body);
      throw e;
    }
  },
};
