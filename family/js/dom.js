// Tiny DOM helpers. Text always goes in as text nodes; nothing here ever touches innerHTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  add(el, kids);
  return el;
}

export function add(el, kids) {
  for (const k of [kids].flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

const SVGNS = 'http://www.w3.org/2000/svg';
// Stroke icons, 24x24. Path data is constant; never built from user text.
const ICONS = {
  table: 'M3 9h18M5 9v10M19 9v10M8 9l1-4h6l1 4M12 3v2',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12l16-8-6 16-2-7-8-1z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  text: 'M4 18l5-12 5 12M5.5 14h7M15 18l3-7 3 7M16 16h4',
  key: 'M14 10a4 4 0 1 0-3.5 3.9L9 15.5V18H6.5v2H4v-2.5l6.1-6.1M15.5 8.5h.01',
  finger: 'M12 11v3a6 6 0 0 1-1 3.5M8.5 7.5A5 5 0 0 1 17 11v2M6.5 10a6 6 0 0 0-.5 2.5V14M15 16.5c-.2 1.3-.7 2.6-1.4 3.6M9 13v1a3 3 0 0 1-1 2.3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  play: 'M7 4l13 8-13 8V4z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
  sms: 'M4 5h16v11H9l-5 4V5z',
  x: 'M6 6l12 12M18 6L6 18',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  lamp: 'M8 3h8l3 7H5l3-7zM12 10v8M8 21h8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12l7-7M16 5h3v3',
  puff: 'M3 8h9a3 3 0 1 0-3-3M3 12h14a3 3 0 1 1-3 3M3 16h6',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  thumbup: 'M7 11v9H4v-9h3zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7',
  thumbdown: 'M7 13V4H4v9h3zM7 13l4 8a2 2 0 0 0 3-2l-1-5h6a2 2 0 0 0 2-2.3l-1.3-6A2 2 0 0 0 17.7 4H7',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
};

export function icon(name, cls = 'icon') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', ICONS[name] || '');
  s.append(p);
  return s;
}

export function ago(iso, lang) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const s = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', { numeric: 'auto' });
  const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400],
    [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
  for (const [lim, unit, div] of steps) {
    if (Math.abs(s) < lim) return rtf.format(Math.round(s / (div || 1)), unit);
  }
  return '';
}

export function dateLong(iso, lang) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// A warm, stable colour per person, chosen from the design tokens.
const HUES = ['--eai-color-accent', '--eai-color-accent-2', '--eai-color-hit', '--eai-color-miss', '--eai-color-danger'];
export function avatar(person, size = 'm') {
  if (person.role === 'claude' || person.claude) {
    return h('img', { class: 'avatar avatar-' + size + ' avatar-claude', src: 'claude-avatar.svg', alt: '', width: 40, height: 40 });
  }
  const name = (person.display_name || '?').trim();
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  let n = 0;
  for (const ch of name) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return h('span', { class: 'avatar avatar-' + size, 'aria-hidden': 'true', style: { '--who': `var(${HUES[n % HUES.length]})` } }, initials);
}
