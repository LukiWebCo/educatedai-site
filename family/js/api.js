// API client: bearer tokens only (no cookies), JSON in and out. The base URL lives only in config.js.
const TOKEN_KEY = 'eai.token';
let onSignedOut = () => {};

export class ApiErr extends Error {
  constructor(status, key, code) { super(code || key); this.status = status; this.key = key; this.code = code; }
}

export function setSignedOutHandler(fn) { onSignedOut = fn; }

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(tok) {
  try {
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: the session lasts this tab only */ }
}

function base() {
  return ((window.EAI && window.EAI.apiBase) || '').replace(/\/+$/, '');
}

export async function api(method, path, body, opts = {}) {
  const headers = {};
  const tok = opts.token || (opts.auth === false ? null : getToken());
  if (tok) headers.Authorization = 'Bearer ' + tok;
  let data;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    data = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(base() + path, { method, headers, body: data, mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch {
    throw new ApiErr(0, 'family.errors.server', 'offline');
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const key = (json && json.error && json.error.key) || 'family.errors.server';
    const code = json && json.error && json.error.code;
    if (res.status === 401 && tok && !opts.token && code === 'unauthorized') {
      setToken(null);
      onSignedOut();
    }
    throw new ApiErr(res.status, key, code);
  }
  return json;
}

export const get = (p, o) => api('GET', p, undefined, o);
export const post = (p, b, o) => api('POST', p, b === undefined ? {} : b, o);
export const patch = (p, b, o) => api('PATCH', p, b, o);
export const del = (p, o) => api('DELETE', p, undefined, o);
