// A small, escaped markdown renderer: it builds DOM nodes and only ever sets textContent.
// Supports headings, paragraphs, lists, blockquotes, code fences, tables, rules, **bold**, *em*,
// `code`, and [links](https://...) (http/https only). Raw HTML in the source shows up as text.
import { h } from './dom.js';

const INLINE = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/;

export function inline(text) {
  const out = [];
  let s = text;
  while (s) {
    const m = INLINE.exec(s);
    if (!m) { out.push(s); break; }
    if (m.index) out.push(s.slice(0, m.index));
    if (m[2] || m[3]) out.push(h('strong', null, inline(m[2] || m[3])));
    else if (m[4] || m[5]) out.push(h('em', null, inline(m[4] || m[5])));
    else if (m[6]) out.push(h('code', { text: m[6] }));
    else if (m[7]) {
      const href = m[8];
      if (/^https?:\/\//i.test(href)) out.push(h('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow' }, inline(m[7])));
      else out.push(m[7]);
    }
    s = s.slice(m.index + m[0].length);
  }
  return out;
}

function splitRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function render(md) {
  const root = h('div', { class: 'md' });
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^```/.exec(line))) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      root.append(h('pre', null, h('code', { text: buf.join('\n') })));
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      const level = Math.min(m[1].length + 1, 6); // the page owns <h1>
      root.append(h('h' + level, null, inline(m[2].replace(/\s+#+\s*$/, ''))));
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { root.append(h('hr')); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      const q = render(buf.join('\n'));
      root.append(h('blockquote', null, [...q.childNodes]));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      root.append(h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, head.map((c) => h('th', null, inline(c))))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, inline(c)))))))));
      continue;
    }
    if ((m = /^\s*([-*+]|\d+[.)])\s+/.exec(line))) {
      const ordered = /\d/.test(m[1]);
      const list = h(ordered ? 'ol' : 'ul');
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const depth = /^\s*/.exec(lines[i])[0].length;
        const text = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        list.append(h('li', { class: depth >= 2 ? 'nested' : null }, inline(text)));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          list.lastChild.append(' ', ...inline(lines[i].trim()));
          i++;
        }
      }
      root.append(list);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|.*\|\s*$)/.test(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++].trim()); }
    root.append(h('p', null, inline(buf.join(' '))));
  }
  return root;
}
