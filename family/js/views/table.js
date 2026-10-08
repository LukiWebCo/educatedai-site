// The Table: home feed, shelves, threads as group chats, and the composer.
import { get, post } from '../api.js';
import { add, ago, avatar, clear, dateLong, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { backLink, busy, confirmBox, errText, errorBox, go, loading, shelfTitle, state, thinking, titleOf, toast } from '../ui.js';

export async function loadShelves(force) {
  if (!state.shelves || force) state.shelves = await get('/api/shelves');
  return state.shelves;
}

// Post text -> text nodes and safe links. Bare https:// URLs link for everyone; [label](href) links only in Claude's
// posts, and only to https:// or a Table thread (#/t/<id>). Nothing is ever parsed as HTML.
const LINK_RE = /\[([^\]\n]{1,80})\]\((https:\/\/[^\s)]+|#\/t\/\d{1,12})\)|(https:\/\/[^\s<>"]+[^\s<>".,;:!?)])/;
function linkify(text, claude) {
  const out = [];
  let s = String(text || '');
  while (s) {
    const m = LINK_RE.exec(s);
    if (!m) { out.push(s); break; }
    if (m[1] && !claude) { out.push(s.slice(0, m.index + m[0].length)); s = s.slice(m.index + m[0].length); continue; }
    if (m.index) out.push(s.slice(0, m.index));
    const href = m[2] || m[3];
    const ext = href.startsWith('https://');
    out.push(h('a', ext ? { href, target: '_blank', rel: 'noopener noreferrer nofollow' } : { href }, m[1] || m[3]));
    s = s.slice(m.index + m[0].length);
  }
  return out;
}

// Highlight "@Name" for the members the server says this post mentions (it parsed them against member ids).
function mentionize(nodes, mentions) {
  if (!mentions || !mentions.length) return nodes;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = new Map(mentions.map((m) => [m.display_name.toLowerCase(), m]));
  const rx = new RegExp('@(' + mentions.map((m) => esc(m.display_name)).sort((a, b) => b.length - a.length).join('|') + ')', 'gi');
  const out = [];
  for (const n of nodes) {
    if (typeof n !== 'string') { out.push(n); continue; }
    let last = 0;
    for (const m of n.matchAll(rx)) {
      if (m.index > last) out.push(n.slice(last, m.index));
      const who = byName.get(m[1].toLowerCase());
      out.push(h('span', { class: 'mention' + (who && state.me && who.id === state.me.id ? ' mention-me' : ''), text: m[0] }));
      last = m.index + m[0].length;
    }
    if (last < n.length) out.push(n.slice(last));
  }
  return out;
}

// The @ picker: type "@" in the composer and a big list of the family pops up (Claude first); tap to mention.
let membersCache = null;
async function members() {
  if (!membersCache) membersCache = await get('/api/members').catch(() => []);
  return membersCache;
}

function mentionPicker(ta, grow) {
  const box = h('div', { class: 'mention-picker', role: 'listbox', 'aria-label': t('family.mention.picker_label'), hidden: true, 'data-test': 'mention-picker' });
  const token = () => {
    const upto = ta.value.slice(0, ta.selectionStart ?? ta.value.length);
    const m = /(^|[^\w@])@([^\s@]{0,30})$/u.exec(upto);
    return m ? { start: upto.length - m[2].length - 1, q: m[2].toLowerCase() } : null;
  };
  const close = () => { box.hidden = true; clear(box); };
  const pick = (mem, tk) => {
    const before = ta.value.slice(0, tk.start);
    const after = ta.value.slice(ta.selectionStart ?? ta.value.length);
    ta.value = before + '@' + mem.display_name + ' ' + after.replace(/^\s+/, '');
    const pos = (before + '@' + mem.display_name + ' ').length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    close();
    grow();
  };
  const update = async () => {
    const tk = token();
    if (!tk) { close(); return; }
    const all = await members();
    const fold = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const list = all.filter((m) => !state.me || m.id !== state.me.id).filter((m) => fold(m.display_name).split(/\s+/).some((w) => w.startsWith(fold(tk.q))) || fold(m.display_name).startsWith(fold(tk.q)));
    clear(box);
    if (!list.length) { box.hidden = true; return; }
    for (const m of list.slice(0, 8)) {
      box.append(h('button', { class: 'mention-opt', type: 'button', role: 'option', 'data-member': m.id,
        onmousedown: (ev) => ev.preventDefault(),
        onclick: () => pick(m, token() || tk) },
      m.claude ? h('img', { class: 'avatar avatar-s avatar-claude', src: 'claude-avatar.svg', alt: '' }) : avatar(m, 's'),
      h('span', { text: m.display_name })));
    }
    box.hidden = false;
  };
  ta.addEventListener('input', update);
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) close(); }, 150));
  return { box, open: () => { update(); } };
}

const MARKS = {
  mentioned: ['at', () => t('family.table.mark_mentioned')],
  replied: ['sms', () => t('family.table.mark_replied')],
  new_today: ['lamp', () => t('family.table.mark_new')],
};

function threadCard(th, queued) {
  const last = th.last_post;
  const mark = MARKS[th.mark];
  const lang = currentLang();
  const excerpt = last ? (last.alt && last.alt.lang === lang && last.lang !== lang ? last.alt.excerpt : last.excerpt) : '';
  return h('a', { class: 'card thread-card' + (mark ? ' thread-marked mark-' + th.mark : ''), href: '#/t/' + th.id, 'data-thread': th.id, 'data-mark': th.mark || null },
    mark ? h('span', { class: 'pill pill-mark', 'data-test': 'mark-' + th.mark }, icon(mark[0], 'icon icon-inline'), h('span', null, mark[1]())) : null,
    h('div', { class: 'thread-card-top' },
      h('h3', { class: 'thread-title', text: titleOf(th) }),
      h('span', { class: 'pill', text: (th.post_count === 1 ? t('family.table.posts_count.one', { n: th.post_count }) : t('family.table.posts_count.other', { n: th.post_count })) })),
    last ? h('p', { class: 'thread-last' },
      h('strong', { text: (last.claude ? 'Claude' : last.author) + ': ' }),
      h('span', { lang: last.alt && excerpt === last.alt.excerpt ? last.alt.lang : last.lang, text: last.claude ? excerpt.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') : excerpt })) : null,
    h('div', { class: 'thread-meta' },
      h('span', { text: ago(th.active_at || th.last_post_at || th.created_at, lang) }),
      queued ? h('span', { class: 'pill pill-thinking', text: t('family.table.claude_thinking_short') }) : null));
}

const threadsCount = (n) => (n === 1 ? t('family.table.threads_count.one', { n }) : t('family.table.threads_count.other', { n }));
const topicsCount = (n) => (n === 1 ? t('family.all.topics_count.one', { n }) : t('family.all.topics_count.other', { n }));

// The calm home (owner, 2026-10-06: "so many topics at once"): at most three blocks. Claude's question of the day,
// today's film (only on a film day), and "What's going on": at most three conversations, the ones that mention or
// answer me first. A quiet week gets one gentle line and the day's new starter topic. Everything else is one quiet
// link away, on All conversations.
export async function tableView() {
  const root = h('section', { class: 'page table-page' });
  let feed;
  try {
    feed = await get('/api/feed');
  } catch (e) {
    return errorBox(e, () => go('#/'));
  }
  const lang = currentLang();
  const q = feed.qotd;
  root.append(
    h('header', { class: 'page-head' },
      h('p', { class: 'eyebrow', text: dateLong(q.date, lang) }),
      h('h1', { class: 'hello', text: t('family.table.hello', { name: state.me.display_name.split(' ')[0] }) })),
    h('article', { class: 'card qotd', 'aria-labelledby': 'qotd-q' },
      h('div', { class: 'qotd-head' },
        h('img', { class: 'avatar avatar-m avatar-claude', src: 'claude-avatar.svg', alt: '' }),
        h('p', { class: 'eyebrow', text: t('family.table.qotd_label') })),
      h('p', { id: 'qotd-q', class: 'qotd-text', text: q.text[lang] || q.text.en }),
      q.why && (q.why[lang] || q.why.en) ? h('p', { class: 'qotd-why' },
        h('strong', { text: t('family.table.qotd_why') }), ' ', h('span', { text: q.why[lang] || q.why.en })) : null,
      h('a', { class: 'btn btn-primary btn-big', href: '#/t/' + q.thread_id }, t('family.table.qotd_answer'))));

  const film = feed.film_today;
  if (film) {
    const live = film.status === 'live' && film.watch;
    root.append(h('article', { class: 'card film-today', 'aria-labelledby': 'film-today-title', 'data-test': 'film-today' },
      h('p', { class: 'eyebrow' }, icon('film', 'icon icon-inline'), h('span', null, t('family.table.film_label'))),
      h('h2', { id: 'film-today-title', class: 'film-title', text: film.title[lang] || film.title.en }),
      film.hook[lang] || film.hook.en ? h('p', { class: 'film-hook', text: film.hook[lang] || film.hook.en }) : null,
      h('p', { class: 'film-when' + (live ? ' live' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', null, live ? t('family.table.film_live') : t('family.table.film_soon'))),
      h('div', { class: 'film-actions' },
        live ? h('a', { class: 'btn btn-primary btn-big', href: film.watch[lang] || film.watch.en, target: '_blank', rel: 'noopener' },
          icon('play'), h('span', null, t('family.table.film_watch'))) : null,
        film.thread_id ? h('a', { class: 'btn btn-quiet btn-big', href: '#/t/' + film.thread_id },
          icon('sms'), h('span', null, t('family.table.film_thread'))) : null)));
  }

  const queued = new Set(feed.claude_thinking);
  const convs = feed.conversations || [];
  const going = h('section', { class: 'going-on', 'aria-labelledby': 'going-on-h', 'data-test': 'going-on' },
    h('h2', { id: 'going-on-h', class: 'section-title', text: t('family.table.active') }));
  const list = h('div', { class: 'stack' });
  if (!convs.length) list.append(h('p', { class: 'quiet-line', 'data-test': 'quiet', text: feed.new_today ? t('family.table.quiet') : t('family.table.quiet_none') }));
  for (const th of convs) list.append(threadCard(th, queued.has(th.id)));
  if (feed.new_today) list.append(threadCard(feed.new_today, queued.has(feed.new_today.id)));
  going.append(list);
  root.append(going,
    h('a', { class: 'all-link', href: '#/all', 'data-test': 'all-link' }, h('span', null, t('family.table.all_link')), icon('next', 'icon icon-inline')));
  root.append(h('a', { class: 'fab', href: '#/new', 'data-i18n-attr': 'aria-label:family.table.new_thread', 'aria-label': t('family.table.new_thread') }, icon('plus')));
  return root;
}

// A collapsed group: a big summary row (title, count, "talked about this week"), the thread cards inside.
function group(title, threads, { count, active, test, lede, cls = '' } = {}) {
  return h('details', { class: 'card group ' + cls, 'data-test': test },
    h('summary', { class: 'group-sum' },
      h('span', { class: 'group-title', text: title }),
      h('span', { class: 'group-meta' },
        h('span', { class: 'group-count', text: count }),
        active ? h('span', { class: 'pill pill-active', text: t('family.all.active_week') }) : null),
      icon('next', 'icon group-chev')),
    h('div', { class: 'stack group-body' }, lede ? h('p', { class: 'muted', text: lede }) : null,
      threads.map((th) => threadCard(th, th.claude_state === 'queued'))));
}

// All conversations: every shelf collapsed with its count, the ones with talk this week first. Topics Claude hasn't
// opened yet wait under one "Coming up" group, so nothing is hidden for good.
export async function allView() {
  let data;
  try {
    [data] = await Promise.all([get('/api/conversations'), loadShelves()]);
  } catch (e) { return errorBox(e, () => go('#/all')); }
  const root = h('section', { class: 'page all-page' },
    backLink('#/', t('family.nav.table')),
    h('h1', { text: t('family.all.heading') }),
    h('p', { class: 'lede', text: t('family.all.lede') }));
  const list = h('div', { class: 'stack groups' });
  if (!data.groups.length) list.append(h('p', { class: 'muted', text: t('family.table.empty') }));
  for (const g of data.groups) {
    list.append(group(g.shelf ? shelfTitle(g.shelf) : t('family.all.other'), g.threads,
      { count: threadsCount(g.count), active: g.active > 0, test: 'group', cls: g.shelf ? 'group-' + g.shelf.source : 'group-other' }));
  }
  if (data.coming_up.length) {
    list.append(group(t('family.all.coming_up'), data.coming_up,
      { count: topicsCount(data.coming_up.length), test: 'coming-up', lede: t('family.all.coming_up_lede'), cls: 'group-coming' }));
  }
  root.append(list, h('a', { class: 'btn btn-primary btn-big', href: '#/new' }, icon('plus'), h('span', null, t('family.table.new_thread'))));
  return root;
}

export async function shelfView(id) {
  let shelves, threads;
  try {
    [shelves, threads] = await Promise.all([loadShelves(), get('/api/threads?shelf=' + encodeURIComponent(id))]);
  } catch (e) { return errorBox(e, () => go('#/shelf/' + id)); }
  const shelf = shelves.find((s) => String(s.id) === String(id));
  const root = h('section', { class: 'page' },
    backLink('#/all', t('family.all.heading')),
    h('h1', { text: shelf ? shelfTitle(shelf) : t('family.table.shelves') }));
  const list = h('div', { class: 'stack' });
  const open = threads.filter((th) => !th.dormant);
  const later = threads.filter((th) => th.dormant);
  if (!open.length) list.append(h('p', { class: 'muted', text: t('family.table.shelf_empty') }));
  for (const th of open) list.append(threadCard(th, th.claude_state === 'queued'));
  if (later.length) {
    list.append(group(t('family.all.coming_up'), later,
      { count: topicsCount(later.length), test: 'coming-up', lede: t('family.all.coming_up_lede'), cls: 'group-coming' }));
  }
  root.append(list, h('a', { class: 'btn btn-primary btn-big', href: '#/new/' + id }, icon('plus'), h('span', null, t('family.table.new_thread'))));
  return root;
}

export async function newThreadView(shelfId) {
  const shelves = await loadShelves().catch(() => []);
  const sel = h('select', { id: 'shelf', class: 'input' },
    h('option', { value: '' }, t('family.new.no_shelf')),
    shelves.filter((s) => s.source !== 'qotd').map((s) => h('option', { value: s.id, selected: String(s.id) === String(shelfId) }, shelfTitle(s))));
  const title = h('input', { id: 'title', class: 'input', maxlength: 140, required: true, autocomplete: 'off' });
  const body = h('textarea', { id: 'body', class: 'input', rows: 5, maxlength: 4000, required: true });
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const form = h('form', { class: 'stack card', novalidate: true },
    h('label', { class: 'field', for: 'title' }, h('span', { class: 'field-label' }, t('family.new.title_label')), title),
    h('label', { class: 'field', for: 'body' }, h('span', { class: 'field-label' }, t('family.new.body_label')), body,
      h('span', { class: 'field-hint' }, icon('mic', 'icon icon-inline'), t('family.composer.voice_hint'))),
    h('label', { class: 'field', for: 'shelf' }, h('span', { class: 'field-label' }, t('family.new.shelf_label')), sel),
    msg,
    h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, t('family.new.submit')));
  form.addEventListener('focusin', grow);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!title.value.trim() || !body.value.trim()) { msg.textContent = t('family.errors.empty'); return; }
    const btn = form.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      const th = await post('/api/threads', { shelf_id: sel.value ? Number(sel.value) : null, title: title.value.trim(), body: body.value.trim(), lang: currentLang() });
      state.shelves = null;
      go('#/t/' + th.id);
    } catch (e) { msg.textContent = errText(e); busy(btn, false); }
  });
  return h('section', { class: 'page' }, backLink(shelfId ? '#/shelf/' + shelfId : '#/', t('family.common.back')),
    h('h1', { text: t('family.new.heading') }), h('p', { class: 'lede', text: t('family.new.lede') }), form);
}

// ---- a thread ---------------------------------------------------------------------------

function voteButtons(p, onChange) {
  const mine = p.votes.mine;
  const own = p.mine;
  const mk = (kind, glyph, label) => {
    const pressed = mine === kind;
    return h('button', {
      class: 'vote vote-' + kind + (pressed ? ' on' : ''), type: 'button', disabled: own, 'aria-pressed': String(pressed),
      title: own ? t('family.thread.vote_own') : label, 'aria-label': label,
      onclick: async (ev) => {
        const b = ev.currentTarget;
        busy(b, true);
        try { onChange(await post(`/api/posts/${p.id}/vote`, { vote: pressed ? null : kind })); } catch (e) { toast(errText(e), 'error'); } finally { busy(b, false); }
      },
    }, icon(glyph, 'icon vote-icon'), h('span', { class: 'vote-count', text: String(p.votes[kind]) }));
  };
  return [mk('hit', 'target', t('family.thread.vote_hit')), mk('miss', 'puff', t('family.thread.vote_miss'))];
}

function hitLabel() { return [t('family.thread.vote_hit_short'), t('family.thread.vote_miss_short')]; }

// The reader's language when there is one (the post's twin or translation), else the original.
const readable = (p, lang) => (p.alt && p.alt.lang === lang && p.lang !== lang ? (p.alt.body || p.alt.excerpt || p.body) : p.body);
const whoName = (p) => (p.claude ? 'Claude' : p.author.display_name);

// nav (threadView): reply(p), jump(id), repliesTo(id) -> [ids]. Absent elsewhere: no reply/jump affordances.
function postEl(p, byId, nav) {
  const lang = currentLang();
  const el = h('article', { class: 'msg' + (p.mine ? ' mine' : '') + (p.claude ? ' claude' : '') + (p.mentions_me ? ' mentions-me' : ''), id: 'p' + p.id, 'data-post': p.id, 'data-author': p.author.id });
  const body = h('p', { class: 'msg-body' });
  const setBody = (text, l) => { clear(body); body.lang = l; body.append(...mentionize(linkify(text, p.claude), p.mentions)); };
  // Every post comes with its other-language version when there is one (Claude's twin, or Claude's translation of a
  // family post): show the reader's language first, the original one tap away (owner, 2026-10-08).
  const twin = p.alt && p.alt.lang === lang && p.lang !== lang ? p.alt : null;
  if (twin) setBody(twin.body, twin.lang); else setBody(p.body, p.lang);
  const parent = p.reply_to && byId.get(p.reply_to);
  const actions = h('div', { class: 'msg-actions' });
  const render = () => {
    clear(actions);
    if (nav) actions.append(h('button', { class: 'act act-reply', type: 'button', 'data-test': 'reply', onclick: () => nav.reply(p) },
      icon('reply', 'icon icon-inline'), h('span', null, t('family.thread.reply'))));
    add(actions, voteButtons(p, (v) => { p.votes = v; render(); }));
    actions.append(h('button', {
      class: 'act' + (p.booked ? ' on' : ''), type: 'button', 'data-test': 'book-this',
      onclick: async (ev) => {
        busy(ev.currentTarget, true);
        try { await post(`/api/posts/${p.id}/book`); p.booked = true; render(); toast(t('family.thread.booked_toast')); } catch (e) { toast(errText(e), 'error'); busy(ev.currentTarget, false); }
      },
    }, icon('book', 'icon icon-inline'), h('span', null, p.booked ? t('family.thread.booked') : t('family.thread.book_this'))));
    if (p.lang !== lang) {
      const showing = body.lang !== p.lang;
      actions.append(h('button', {
        class: 'act', type: 'button', 'data-test': 'translate', 'data-showing': showing ? '1' : null,
        onclick: async (ev) => {
          const b = ev.currentTarget;
          if (b.dataset.showing) { setBody(p.body, p.lang); delete b.dataset.showing; b.lastChild.textContent = t('family.thread.translate'); return; }
          if (twin) { setBody(twin.body, twin.lang); b.dataset.showing = '1'; b.lastChild.textContent = t('family.thread.show_original'); return; }
          busy(b, true);
          try {
            const tr = await get(`/api/posts/${p.id}/translation?lang=${lang}`);
            if (tr.status === 'ready') { setBody(tr.text, lang); b.dataset.showing = '1'; b.lastChild.textContent = t('family.thread.show_original'); } else toast(t('family.thread.translation_pending'));
          } catch (e) { toast(errText(e), 'error'); } finally { busy(b, false); }
        },
      }, icon('globe', 'icon icon-inline'), h('span', null, showing ? t('family.thread.show_original') : t('family.thread.translate'))));
    }
  };
  const flag = state.me.role !== 'admin' ? null : h('button', {
        class: 'act act-danger act-icon', type: 'button', 'aria-label': t('family.admin.takedown'), title: t('family.admin.takedown'),
        onclick: async () => {
          if (!(await confirmBox(t('family.admin.takedown_post_confirm'), t('family.admin.takedown_yes'), true))) return;
          try { await post('/api/admin/takedowns', { kind: 'post', ref: String(p.id) }); toast(t('family.admin.takedown_done')); } catch (e) { toast(errText(e), 'error'); }
        },
      }, icon('flag'));
  render();
  el.append(
    avatar(p.author),
    h('div', { class: 'bubble' },
      h('header', { class: 'msg-head' },
        h('span', { class: 'msg-author', text: p.claude ? 'Claude' : p.author.display_name }),
        p.mentions_me ? h('span', { class: 'pill pill-mention', 'data-test': 'mentioned-label' }, icon('at', 'icon icon-inline'), t('family.mention.you_were')) : null,
        h('time', { class: 'msg-time', datetime: p.created_at, text: ago(p.created_at, lang) }), flag),
      parent ? h('blockquote', { class: 'msg-quote' + (nav ? ' msg-quote-link' : ''), 'data-test': 'quote', role: nav ? 'button' : null, tabindex: nav ? 0 : null,
        onclick: nav ? () => nav.jump(parent.id) : null, text: '↩ ' + whoName(parent) + ': ' + readable(parent, lang).slice(0, 120) })
        : (p.reply_to && nav ? h('blockquote', { class: 'msg-quote msg-quote-link', role: 'button', tabindex: 0, 'data-test': 'quote',
          onclick: () => nav.jump(p.reply_to), text: '↩ ' + t('family.thread.earlier_message') }) : null),
      body, actions,
      nav ? h('button', { class: 'act act-replies', type: 'button', hidden: true, 'data-test': 'replies', 'data-replies-for': p.id,
        onclick: () => { const ids = nav.repliesTo(p.id); if (ids.length) nav.jump(ids[0]); } }) : null));
  // swipe right on a message to reply (owner, 2026-10-08; the Reply button stays for anyone who doesn't swipe)
  if (nav) {
    let x0 = null, y0 = 0, dx = 0;
    const bub = el.querySelector('.bubble');
    el.addEventListener('touchstart', (e) => { const q = e.touches[0]; x0 = q.clientX; y0 = q.clientY; dx = 0; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const q = e.touches[0], ddx = q.clientX - x0, ddy = q.clientY - y0;
      if (Math.abs(ddy) > Math.abs(ddx) || ddx < 0) { if (Math.abs(ddy) > 12) x0 = null; bub.style.transform = ''; return; }
      dx = ddx;
      bub.style.transform = `translateX(${Math.min(dx, 90)}px)`;
      el.classList.toggle('swipe-ready', dx > 64);
    }, { passive: true });
    el.addEventListener('touchend', () => {
      bub.style.transform = '';
      el.classList.remove('swipe-ready');
      if (x0 != null && dx > 64) nav.reply(p);
      x0 = null; dx = 0;
    });
  }
  return el;
}

export async function threadView(id) {
  let data;
  try { data = await get(`/api/threads/${encodeURIComponent(id)}/posts?limit=50`); } catch (e) { return errorBox(e, () => go('#/t/' + id)); }
  const th = data.thread;
  const shelves = await loadShelves().catch(() => []);
  const shelf = shelves.find((s) => s.id === th.shelf_id);
  const lang = currentLang();
  const list = h('div', { class: 'msgs', 'aria-live': 'polite' });
  const byId = new Map(data.posts.map((p) => [p.id, p]));
  let oldest = data.posts.length ? data.posts[0].id : null;
  let hasMore = data.has_more;
  const meId = state.me && state.me.id;

  // ---- navigation (owner, 2026-10-08: busy threads were hard to follow) ----------------------------------
  const msgNode = (pid) => list.querySelector(`.msg[data-post="${pid}"]`);
  const flash = (n) => { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); };
  const nav = {
    reply: (p) => setReply(p),
    repliesTo: (pid) => Array.from(byId.values()).filter((x) => x.reply_to === pid).map((x) => x.id).sort((a, b) => a - b),
    async jump(pid) {
      let n = msgNode(pid);
      for (let i = 0; !n && hasMore && i < 6; i++) { await loadOlder(); n = msgNode(pid); }   // it may be further up
      if (!n) { toast(t('family.thread.not_found')); return; }
      if (n.hidden) showAll();
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      flash(n);
    },
  };
  const refreshCounts = () => list.querySelectorAll('[data-replies-for]').forEach((b) => {
    const n = nav.repliesTo(Number(b.dataset.repliesFor)).length;
    b.hidden = !n;
    clear(b).append(icon('down', 'icon icon-inline'), h('span', null, n === 1 ? t('family.thread.replies.one') : t('family.thread.replies.other', { n })));
  });

  let more = null;
  async function loadOlder() {
    if (!hasMore || !oldest) return;
    if (more) busy(more, true);
    try {
      const older = await get(`/api/threads/${th.id}/posts?limit=50&before=${oldest}`);
      older.posts.forEach((p) => byId.set(p.id, p));
      const nodes = older.posts.map((p) => postEl(p, byId, nav));
      if (more) more.after(...nodes); else list.prepend(...nodes);
      oldest = older.posts.length ? older.posts[0].id : oldest;
      hasMore = older.has_more;
      if (!hasMore && more) { more.remove(); more = null; }
      afterChange();
    } catch (e) { toast(errText(e), 'error'); } finally { if (more) busy(more, false); }
  }
  if (hasMore) {
    more = h('button', { class: 'btn btn-quiet btn-small more', type: 'button' }, t('family.thread.older'));
    more.addEventListener('click', () => loadOlder());
    list.append(more);
  }
  for (const p of data.posts) list.append(postEl(p, byId, nav));
  const thinkingSlot = h('div', { class: 'thinking-slot' }, th.claude_state === 'queued' ? thinking() : null);

  // ---- the Table: who's spoken in this conversation, seated around a table -------------------------------
  // Only people who have spoken. The latest speaker glows. Tap someone to step through their messages (newest
  // first); hold to show just them and you. (owner, 2026-10-08)
  const strip = h('div', { class: 'table-strip', 'data-test': 'table-strip', role: 'group', 'aria-label': t('family.table.label') });
  const stepBar = h('div', { class: 'step-bar', hidden: true, 'data-test': 'step-bar' });
  const onlyBar = h('div', { class: 'only-bar', hidden: true, 'data-test': 'only-bar' });
  let step = null;      // { aid, ids (oldest->newest), i }
  let only = null;      // author id shown with mine
  const speakers = () => {
    const m = new Map();
    for (const p of Array.from(byId.values()).sort((a, b) => a.id - b.id)) {
      const k = p.author.id;
      if (!m.has(k)) m.set(k, { author: Object.assign({ claude: p.claude }, p.author), ids: [] });
      m.get(k).ids.push(p.id);
    }
    return m;
  };
  const showStep = () => {
    if (!step) { stepBar.hidden = true; return; }
    const sp = speakers().get(step.aid);
    if (!sp) { step = null; stepBar.hidden = true; return; }
    step.ids = sp.ids;
    step.i = Math.max(0, Math.min(step.i, step.ids.length - 1));
    const name = sp.author.claude ? 'Claude' : sp.author.display_name;
    clear(stepBar).append(
      avatar(sp.author, 's'),
      h('span', { class: 'step-label', 'aria-label': t('family.table.step', { name, i: step.ids.length - step.i, n: step.ids.length }) },
        h('span', { class: 'step-name', text: name }), h('span', { class: 'step-count', text: t('family.table.step_count', { i: step.ids.length - step.i, n: step.ids.length }) })),
      h('button', { class: 'btn btn-quiet btn-small', type: 'button', 'aria-label': t('family.table.older'), 'data-test': 'step-older',
        disabled: step.i === 0 ? true : null, onclick: () => { step.i -= 1; showStep(); nav.jump(step.ids[step.i]); } }, icon('up')),
      h('button', { class: 'btn btn-quiet btn-small', type: 'button', 'aria-label': t('family.table.newer'), 'data-test': 'step-newer',
        disabled: step.i === step.ids.length - 1 ? true : null, onclick: () => { step.i += 1; showStep(); nav.jump(step.ids[step.i]); } }, icon('down')),
      h('button', { class: 'btn btn-quiet btn-small', type: 'button', 'aria-label': t('family.table.close'), onclick: () => { step = null; showStep(); drawTable(); } }, icon('x')));
    stepBar.hidden = false;
  };
  function applyOnly() {
    list.querySelectorAll('.msg[data-post]').forEach((n) => { n.hidden = only != null && Number(n.dataset.author) !== only && Number(n.dataset.author) !== meId; });
    onlyBar.hidden = only == null;
    if (only != null) {
      const sp = speakers().get(only);
      const name = sp ? (sp.author.claude ? 'Claude' : sp.author.display_name) : '';
      clear(onlyBar).append(h('span', { text: t('family.table.only', { name }) }),
        h('button', { class: 'btn btn-quiet btn-small', type: 'button', 'data-test': 'show-all', onclick: showAll }, t('family.table.show_all')));
    }
  }
  function showAll() { only = null; applyOnly(); drawTable(); }
  function drawTable() {
    const sp = Array.from(speakers().values());
    clear(strip);
    if (sp.length < 2) { strip.hidden = true; return; }
    strip.hidden = false;
    const lastAuthor = (() => { const ids = Array.from(byId.keys()).sort((a, b) => b - a); return ids.length ? byId.get(ids[0]).author.id : null; })();
    const table = h('div', { class: 'table-top', 'aria-hidden': 'true' });
    strip.append(table);
    sp.forEach((s, k) => {
      // up to six sit along the far side of the table; more go all the way round
      const ang = sp.length > 6 ? (k / sp.length) * Math.PI * 2 - Math.PI / 2 : Math.PI + ((k + 0.5) / sp.length) * Math.PI;
      const x = 50 + Math.cos(ang) * 42, y = sp.length > 6 ? 50 + Math.sin(ang) * 34 : 48 + Math.sin(ang) * 30;   // seats stay inside the strip
      const name = s.author.claude ? 'Claude' : s.author.display_name;
      let held = null, longDone = false;
      const seat = h('button', {
        class: 'seat' + (s.author.id === lastAuthor ? ' seat-latest' : '') + (step && step.aid === s.author.id ? ' seat-on' : '') + (only === s.author.id ? ' seat-only' : ''),
        type: 'button', 'data-test': 'seat', 'data-author': s.author.id, 'aria-label': name + ' · ' + s.ids.length,
        style: { left: x + '%', top: y + '%' },
        onclick: () => {
          if (longDone) { longDone = false; return; }
          if (step && step.aid === s.author.id) step.i = Math.max(0, step.i - 1);    // tap again: the next older one
          else step = { aid: s.author.id, ids: s.ids, i: s.ids.length - 1 };          // first tap: their newest
          showStep(); drawTable(); nav.jump(step.ids[step.i]);
        },
      }, avatar(s.author, 's'), h('span', { class: 'seat-n', text: String(s.ids.length) }), h('span', { class: 'seat-name', text: name }));
      const hold = () => { held = setTimeout(() => { longDone = true; only = only === s.author.id ? null : s.author.id; applyOnly(); drawTable(); }, 550); };
      const unhold = () => clearTimeout(held);
      seat.addEventListener('touchstart', hold, { passive: true }); seat.addEventListener('mousedown', hold);
      ['touchend', 'touchmove', 'mouseup', 'mouseleave'].forEach((ev) => seat.addEventListener(ev, unhold, { passive: true }));
      seat.addEventListener('contextmenu', (e) => e.preventDefault());
      strip.append(seat);
    });
    strip.append(h('p', { class: 'table-hint', text: t('family.table.hint') }));
  }

  // ---- "↓ N new" when messages arrive while you're reading further up ------------------------------------
  let unseen = [];
  const newPill = h('button', { class: 'new-pill', type: 'button', hidden: true, 'data-test': 'new-pill',
    onclick: () => { const first = unseen[0]; unseen = []; newPill.hidden = true; if (first) nav.jump(first); } });
  const nearBottom = () => thinkingSlot.getBoundingClientRect().top < window.innerHeight + 60;
  window.addEventListener('scroll', () => { if (unseen.length && nearBottom()) { unseen = []; newPill.hidden = true; } }, { passive: true });

  function afterChange() { refreshCounts(); drawTable(); applyOnly(); showStep(); }

  // Live updates (owner, 2026-10-08): while this thread is open and the app is in front, ask every few seconds for
  // new posts (Claude's replies, the family's) and for translations that arrived after a post was first shown.
  const shown = () => Array.from(list.querySelectorAll('.msg[data-post]'));
  const live = setInterval(async () => {
    if (!list.isConnected) { clearInterval(live); return; }
    if (document.hidden) return;
    const ids = shown().map((n) => Number(n.dataset.post));
    const recent = ids.slice(-10);
    const after = recent.length ? recent[0] - 1 : 0;
    let upd;
    try { upd = await get(`/api/threads/${th.id}/posts?limit=50&after=${after}`); } catch (e) { return; }
    if (!list.isConnected) return;
    const fresh = [];
    const wasNear = nearBottom();
    for (const p of upd.posts) {
      const old = byId.get(p.id);
      byId.set(p.id, p);
      if (!old) { const n = postEl(p, byId, nav); if (!wasNear && unseen.length === 0 && !p.mine) { n.classList.add('msg-new'); n.dataset.newLabel = ''; } list.append(n); fresh.push(p); continue; }
      // a translation arrived for a post shown in its original language: show the reader's language now
      if (!old.alt && p.alt && p.alt.lang === lang && p.lang !== lang) {
        const n = msgNode(p.id);
        if (n) n.replaceWith(postEl(p, byId, nav));
      }
    }
    if (upd.thread) {
      if (upd.thread.claude_state !== 'queued') clear(thinkingSlot);
      else if (!thinkingSlot.firstChild) thinkingSlot.append(thinking());
    }
    if (fresh.length || upd.posts.length) afterChange();
    if (!fresh.length) return;
    if (wasNear) thinkingSlot.scrollIntoView({ block: 'end', behavior: 'smooth' });
    else {
      unseen.push(...fresh.filter((p) => !p.mine).map((p) => p.id));
      if (unseen.length) { clear(newPill).append(icon('down', 'icon icon-inline'), h('span', null, t('family.thread.new_messages', { n: unseen.length }))); newPill.hidden = false; }
    }
  }, 4000);

  const ta = h('textarea', { id: 'composer', class: 'input composer-input', rows: 2, maxlength: 4000, 'data-i18n-attr': 'placeholder:family.composer.placeholder', placeholder: t('family.composer.placeholder'), 'aria-label': t('family.composer.label') });
  // A half-written message keeps the composer open; an empty one shrinks to a slim bar when not focused (see .composer CSS).
  let replyTo = null;
  const grow = () => {
    ta.closest('.composer')?.classList.toggle('has-text', !!ta.value.trim() || !!replyTo);
    ta.style.setProperty('height', 'auto');
    if (ta.value) ta.style.setProperty('height', Math.min(ta.scrollHeight, 240) + 'px');
  };
  ta.addEventListener('input', grow);
  const send = h('button', { class: 'btn btn-primary send', type: 'submit', 'aria-label': t('family.composer.send'), onmousedown: (ev) => keepFocus(ev) }, icon('send'), h('span', { class: 'send-label' }, t('family.composer.send')));
  // Buttons in the composer keep the text field focused (mousedown preventDefault): on a phone, losing focus closes
  // the keyboard and shrinks the composer mid-tap, so the tap missed (owner, 2026-10-08: "the @claude button").
  const keepFocus = (ev) => { if (document.activeElement === ta) ev.preventDefault(); };
  const tag = h('button', {
    class: 'chip', type: 'button', title: t('family.composer.tag_claude_hint'), onmousedown: keepFocus,
    onclick: () => { if (!/@claude\b/i.test(ta.value)) ta.value = ('@claude ' + ta.value).trimEnd() + ' '; ta.focus(); grow(); },
  }, '@claude');
  const picker = mentionPicker(ta, grow);
  const at = h('button', {
    class: 'chip chip-at', type: 'button', title: t('family.mention.picker_label'), 'aria-label': t('family.mention.picker_label'), 'data-test': 'mention-someone',
    onmousedown: (ev) => ev.preventDefault(),
    onclick: () => {
      const pos = ta.selectionStart ?? ta.value.length;
      const pre = ta.value.slice(0, pos);
      const ins = (pre && !/\s$/.test(pre) ? ' ' : '') + '@';
      ta.value = pre + ins + ta.value.slice(pos);
      ta.focus();
      ta.setSelectionRange(pos + ins.length, pos + ins.length);
      grow();
      picker.open();
    },
  }, icon('at', 'icon icon-inline'), h('span', null, t('family.mention.picker_label')));
  const replyText = h('span', { class: 'reply-bar-text' });
  const replyBar = h('div', { class: 'reply-bar', hidden: true, 'data-test': 'reply-bar' },
    icon('reply', 'icon icon-inline'), replyText,
    h('button', { class: 'reply-bar-x', type: 'button', 'aria-label': t('family.thread.cancel_reply'), onmousedown: (ev) => keepFocus(ev),
      onclick: () => { setReply(null); ta.focus(); } }, icon('x')));
  function setReply(p) {
    replyTo = p;
    replyBar.hidden = !p;
    if (p) {
      replyText.textContent = t('family.thread.replying_to', { name: whoName(p) }) + ': ' + readable(p, lang).slice(0, 70) + (readable(p, lang).length > 70 ? '…' : '');
      ta.focus();
    }
    grow();
  }
  const form = h('form', { class: 'composer', novalidate: true },
    picker.box, replyBar,
    h('div', { class: 'composer-row' }, ta, send),
    h('div', { class: 'composer-tools' }, tag, at,
      h('span', { class: 'voice-hint' }, icon('mic', 'icon icon-inline'), t('family.composer.voice_hint'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    busy(send, true);
    try {
      const p = await post(`/api/threads/${th.id}/posts`, replyTo ? { body: text, lang, reply_to: replyTo.id } : { body: text, lang });
      byId.set(p.id, p);
      list.append(postEl(p, byId, nav));
      ta.value = '';
      setReply(null);
      afterChange();
      if (/(^|[^\w@])@claude\b/i.test(text)) { clear(thinkingSlot).append(thinking()); toast(t('family.thread.claude_called')); }
      thinkingSlot.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } catch (e) { toast(errText(e), 'error'); } finally { busy(send, false); }
  });
  const [hitShort, missShort] = hitLabel();
  const root = h('section', { class: 'page thread-page' },
    backLink(shelf ? '#/shelf/' + shelf.id : '#/', shelf ? shelfTitle(shelf) : t('family.nav.table')),
    h('h1', { class: 'thread-h1', text: titleOf(th) }),
    h('p', { class: 'muted small legend' }, t('family.thread.legend', { hit: hitShort, miss: missShort })),
    strip, stepBar, onlyBar, list, thinkingSlot, newPill, form);
  afterChange();
  requestAnimationFrame(() => { const last = list.lastElementChild; if (last && data.posts.length > 3) last.scrollIntoView({ block: 'end' }); });
  return root;
}
