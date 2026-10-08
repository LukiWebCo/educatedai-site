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

function postEl(p, byId) {
  const lang = currentLang();
  const el = h('article', { class: 'msg' + (p.mine ? ' mine' : '') + (p.claude ? ' claude' : '') + (p.mentions_me ? ' mentions-me' : ''), id: 'p' + p.id, 'data-post': p.id });
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
      parent ? h('blockquote', { class: 'msg-quote', text: (parent.claude ? 'Claude' : parent.author.display_name) + ': ' + parent.body.slice(0, 120) }) : null,
      body, actions));
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
  if (data.has_more) {
    const more = h('button', { class: 'btn btn-quiet btn-small more', type: 'button' }, t('family.thread.older'));
    more.addEventListener('click', async () => {
      busy(more, true);
      try {
        const older = await get(`/api/threads/${th.id}/posts?limit=50&before=${oldest}`);
        older.posts.forEach((p) => byId.set(p.id, p));
        more.after(...older.posts.map((p) => postEl(p, byId)));
        oldest = older.posts.length ? older.posts[0].id : oldest;
        if (!older.has_more) more.remove();
      } catch (e) { toast(errText(e), 'error'); } finally { busy(more, false); }
    });
    list.append(more);
  }
  for (const p of data.posts) list.append(postEl(p, byId));
  const thinkingSlot = h('div', { class: 'thinking-slot' }, th.claude_state === 'queued' ? thinking() : null);
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
    let added = false;
    for (const p of upd.posts) {
      const old = byId.get(p.id);
      byId.set(p.id, p);
      if (!old) { list.append(postEl(p, byId)); added = true; continue; }
      // a translation arrived for a post shown in its original language: show the reader's language now
      if (!old.alt && p.alt && p.alt.lang === lang && p.lang !== lang) {
        const n = list.querySelector(`.msg[data-post="${p.id}"]`);
        if (n) n.replaceWith(postEl(p, byId));
      }
    }
    if (upd.thread) {
      if (upd.thread.claude_state !== 'queued') clear(thinkingSlot);
      else if (!thinkingSlot.firstChild) thinkingSlot.append(thinking());
    }
    if (added) thinkingSlot.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, 4000);

  const ta = h('textarea', { id: 'composer', class: 'input composer-input', rows: 2, maxlength: 4000, 'data-i18n-attr': 'placeholder:family.composer.placeholder', placeholder: t('family.composer.placeholder'), 'aria-label': t('family.composer.label') });
  // A half-written message keeps the composer open; an empty one shrinks to a slim bar when not focused (see .composer CSS).
  const grow = () => {
    ta.closest('.composer')?.classList.toggle('has-text', !!ta.value.trim());
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
  const form = h('form', { class: 'composer', novalidate: true },
    picker.box,
    h('div', { class: 'composer-row' }, ta, send),
    h('div', { class: 'composer-tools' }, tag, at,
      h('span', { class: 'voice-hint' }, icon('mic', 'icon icon-inline'), t('family.composer.voice_hint'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    busy(send, true);
    try {
      const p = await post(`/api/threads/${th.id}/posts`, { body: text, lang });
      byId.set(p.id, p);
      list.append(postEl(p, byId));
      ta.value = '';
      grow();
      if (/(^|[^\w@])@claude\b/i.test(text)) { clear(thinkingSlot).append(thinking()); toast(t('family.thread.claude_called')); }
      thinkingSlot.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } catch (e) { toast(errText(e), 'error'); } finally { busy(send, false); }
  });
  const [hitShort, missShort] = hitLabel();
  const root = h('section', { class: 'page thread-page' },
    backLink(shelf ? '#/shelf/' + shelf.id : '#/', shelf ? shelfTitle(shelf) : t('family.nav.table')),
    h('h1', { class: 'thread-h1', text: titleOf(th) }),
    h('p', { class: 'muted small legend' }, t('family.thread.legend', { hit: hitShort, miss: missShort })),
    list, thinkingSlot, form);
  requestAnimationFrame(() => { const last = list.lastElementChild; if (last && data.posts.length > 3) last.scrollIntoView({ block: 'end' }); });
  return root;
}
