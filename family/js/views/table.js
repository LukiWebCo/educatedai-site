// The Table: home feed, shelves, threads as group chats, and the composer.
import { get, post } from '../api.js';
import { add, ago, avatar, clear, dateLong, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { backLink, busy, confirmBox, errText, errorBox, go, loading, shelfTitle, state, thinking, titleOf, toast } from '../ui.js';

export async function loadShelves(force) {
  if (!state.shelves || force) state.shelves = await get('/api/shelves');
  return state.shelves;
}

function threadCard(th, queued) {
  const last = th.last_post;
  return h('a', { class: 'card thread-card', href: '#/t/' + th.id },
    h('div', { class: 'thread-card-top' },
      h('h3', { class: 'thread-title', text: titleOf(th) }),
      h('span', { class: 'pill', text: (th.post_count === 1 ? t('family.table.posts_count.one', { n: th.post_count }) : t('family.table.posts_count.other', { n: th.post_count })) })),
    last ? h('p', { class: 'thread-last' },
      h('strong', { text: (last.claude ? 'Claude' : last.author) + ': ' }),
      h('span', { text: last.excerpt })) : null,
    h('div', { class: 'thread-meta' },
      h('span', { text: ago(th.last_post_at || th.created_at, currentLang()) }),
      queued ? h('span', { class: 'pill pill-thinking', text: t('family.table.claude_thinking_short') }) : null));
}

export async function tableView() {
  const root = h('section', { class: 'page table-page' });
  let feed;
  try {
    [feed] = await Promise.all([get('/api/feed'), loadShelves()]);
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
      h('a', { class: 'btn btn-primary btn-big', href: '#/t/' + q.thread_id }, t('family.table.qotd_answer'))));

  if (feed.claude_thinking.length) {
    root.append(h('a', { class: 'thinking-banner', href: '#/t/' + feed.claude_thinking[0] }, thinking()));
  }

  const queued = new Set(feed.claude_thinking);
  root.append(h('h2', { class: 'section-title', text: t('family.table.active') }));
  const list = h('div', { class: 'stack' });
  const active = feed.active_threads.filter((x) => x.id !== q.thread_id);
  if (!active.length) list.append(h('p', { class: 'muted', text: t('family.table.empty') }));
  for (const th of active.slice(0, 8)) list.append(threadCard(th, queued.has(th.id)));
  root.append(list);

  root.append(h('div', { class: 'row space' },
    h('h2', { class: 'section-title', text: t('family.table.shelves') }),
    h('a', { class: 'btn btn-quiet btn-small', href: '#/new' }, icon('plus'), h('span', null, t('family.table.new_thread')))));
  const shelves = h('div', { class: 'shelves' });
  for (const s of state.shelves) {
    shelves.append(h('a', { class: 'shelf shelf-' + s.source, href: '#/shelf/' + s.id },
      h('span', { class: 'shelf-title', text: shelfTitle(s) }),
      h('span', { class: 'shelf-count', text: (s.thread_count === 1 ? t('family.table.threads_count.one', { n: s.thread_count }) : t('family.table.threads_count.other', { n: s.thread_count })) })));
  }
  root.append(shelves);

  if (feed.scoreboard_top.length) {
    root.append(h('div', { class: 'row space' },
      h('h2', { class: 'section-title', text: t('family.table.score_title') }),
      h('a', { class: 'link', href: '#/score' }, t('family.table.score_all'))));
    const ol = h('ol', { class: 'card podium' });
    feed.scoreboard_top.forEach((r, i) => ol.append(h('li', null,
      h('span', { class: 'medal medal-' + (i + 1), text: String(i + 1) }), avatar(r.member, 's'),
      h('span', { class: 'grow', text: r.member.display_name }),
      h('span', { class: 'score', text: (r.score > 0 ? '+' : '') + r.score }))));
    root.append(ol);
  }
  root.append(h('a', { class: 'fab', href: '#/new', 'data-i18n-attr': 'aria-label:family.table.new_thread', 'aria-label': t('family.table.new_thread') }, icon('plus')));
  return root;
}

export async function shelfView(id) {
  let shelves, threads;
  try {
    [shelves, threads] = await Promise.all([loadShelves(), get('/api/threads?shelf=' + encodeURIComponent(id))]);
  } catch (e) { return errorBox(e, () => go('#/shelf/' + id)); }
  const shelf = shelves.find((s) => String(s.id) === String(id));
  const root = h('section', { class: 'page' },
    backLink('#/', t('family.nav.table')),
    h('h1', { text: shelf ? shelfTitle(shelf) : t('family.table.shelves') }));
  const list = h('div', { class: 'stack' });
  if (!threads.length) list.append(h('p', { class: 'muted', text: t('family.table.shelf_empty') }));
  for (const th of threads) list.append(threadCard(th, th.claude_state === 'queued'));
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
  const el = h('article', { class: 'msg' + (p.mine ? ' mine' : '') + (p.claude ? ' claude' : ''), id: 'p' + p.id, 'data-post': p.id });
  const body = h('p', { class: 'msg-body', text: p.body, lang: p.lang });
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
      actions.append(h('button', {
        class: 'act', type: 'button', 'data-test': 'translate',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          if (b.dataset.showing) { body.textContent = p.body; body.lang = p.lang; delete b.dataset.showing; b.lastChild.textContent = t('family.thread.translate'); return; }
          busy(b, true);
          try {
            const tr = await get(`/api/posts/${p.id}/translation?lang=${lang}`);
            if (tr.status === 'ready') { body.textContent = tr.text; body.lang = lang; b.dataset.showing = '1'; b.lastChild.textContent = t('family.thread.show_original'); } else toast(t('family.thread.translation_pending'));
          } catch (e) { toast(errText(e), 'error'); } finally { busy(b, false); }
        },
      }, icon('globe', 'icon icon-inline'), h('span', null, t('family.thread.translate'))));
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

  const ta = h('textarea', { id: 'composer', class: 'input composer-input', rows: 2, maxlength: 4000, 'data-i18n-attr': 'placeholder:family.composer.placeholder', placeholder: t('family.composer.placeholder'), 'aria-label': t('family.composer.label') });
  const grow = () => { ta.style.setProperty('height', 'auto'); ta.style.setProperty('height', Math.min(ta.scrollHeight, 240) + 'px'); };
  ta.addEventListener('input', grow);
  const send = h('button', { class: 'btn btn-primary send', type: 'submit', 'aria-label': t('family.composer.send') }, icon('send'), h('span', { class: 'send-label' }, t('family.composer.send')));
  const tag = h('button', {
    class: 'chip', type: 'button', title: t('family.composer.tag_claude_hint'),
    onclick: () => { if (!/@claude\b/i.test(ta.value)) ta.value = ('@claude ' + ta.value).trimEnd() + ' '; ta.focus(); grow(); },
  }, '@claude');
  const form = h('form', { class: 'composer', novalidate: true },
    h('div', { class: 'composer-row' }, ta, send),
    h('div', { class: 'composer-tools' }, tag,
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
