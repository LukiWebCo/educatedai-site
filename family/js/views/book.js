// The Book: chapters read from the job clone, rendered with the escaped markdown renderer.
// The family are the co-authors (owner, 2026-10-06): a thumbs up/down per member per chapter, and a
// "Finalized" badge that only admins set. Nothing here publishes anything.
import { get, post } from '../api.js';
import { ago, avatar, clear, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { render } from '../md.js';
import { backLink, busy, confirmBox, errText, errorBox, go, state, toast } from '../ui.js';

function kindLabel(kind) {
  switch (kind) {
    case 'index': return t('family.book.kind_index');
    case 'theme': return t('family.book.kind_theme');
    case 'claude': return t('family.book.kind_claude');
    case 'drafts': return t('family.book.kind_drafts');
    default: return t('family.book.kind_candidate');
  }
}

function chapterTitle(c) {
  if (c.kind === 'index') return t('family.book.index_title');
  if (c.kind === 'drafts') return t('family.book.drafts_title');
  return c.title;
}

function statusBadge(c) {
  if (!c.status) return null;
  const fin = c.status === 'finalized';
  return h('span', { class: 'badge badge-' + c.status, 'data-test': 'chapter-status' },
    fin ? '✓ ' : '', fin ? t('family.book.status_finalized') : t('family.book.status_draft'));
}

// 👍 / 👎 with counts; tap again to take your vote back.
function voteRow(c) {
  const row = h('div', { class: 'chapter-votes', role: 'group', 'aria-label': t('family.book.vote_prompt') });
  const paint = () => {
    clear(row);
    for (const [kind, glyph, label] of [['up', 'thumbup', t('family.book.vote_up')], ['down', 'thumbdown', t('family.book.vote_down')]]) {
      const on = c.votes.mine === kind;
      row.append(h('button', {
        class: 'thumb thumb-' + kind + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), 'aria-label': label, title: label,
        'data-test': 'vote-' + kind,
        onclick: async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const b = ev.currentTarget;
          busy(b, true);
          try { c.votes = await post(`/api/book/${encodeURIComponent(c.slug)}/vote`, { vote: on ? null : kind }); paint(); } catch (e) { toast(errText(e), 'error'); busy(b, false); }
        },
      }, icon(glyph, 'icon thumb-glyph'), h('span', { class: 'thumb-count', text: String(c.votes[kind]) })));
    }
  };
  paint();
  return row;
}

export async function bookView() {
  let data;
  try { data = await get('/api/book'); } catch (e) { return errorBox(e, () => go('#/book')); }
  const root = h('section', { class: 'page' },
    h('p', { class: 'eyebrow', text: t('family.book.eyebrow') }),
    h('h1', { text: t('family.book.title') }),
    h('p', { class: 'lede', text: t('family.book.lede') }),
    h('p', { class: 'card note coauthors', 'data-test': 'coauthors', text: t('family.book.coauthors') }));
  if (data.pending_requests) {
    root.append(h('p', { class: 'card note' }, (data.pending_requests === 1 ? t('family.book.pending_count.one', { n: data.pending_requests }) : t('family.book.pending_count.other', { n: data.pending_requests }))));
  }
  const list = h('div', { class: 'book-list' });
  for (const c of data.chapters) {
    list.append(h('div', { class: 'card chapter chapter-' + c.kind, 'data-slug': c.slug },
      h('a', { class: 'chapter-link', href: '#/book/' + c.slug },
        h('span', { class: 'chapter-kind' }, kindLabel(c.kind), c.status ? ' ' : null, statusBadge(c)),
        h('span', { class: 'chapter-title', text: chapterTitle(c) }),
        c.drafts ? h('span', { class: 'pill', text: (c.drafts === 1 ? t('family.book.drafts_count.one', { n: c.drafts }) : t('family.book.drafts_count.other', { n: c.drafts })) }) : null),
      c.votes ? voteRow(c) : null));
  }
  if (!data.chapters.length) list.append(h('p', { class: 'muted', text: t('family.book.empty') }));
  root.append(list);
  return root;
}

function finalizeButton(c, rerender) {
  if (!c.status || !state.me || state.me.role !== 'admin') return null;
  const fin = c.status === 'finalized';
  return h('button', {
    class: 'btn btn-quiet btn-big', type: 'button', 'data-test': 'finalize',
    onclick: async (ev) => {
      const b = ev.currentTarget;
      if (!fin && !(await confirmBox(t('family.book.finalize_confirm'), t('family.book.finalize')))) return;
      busy(b, true);
      try {
        const r = await post(`/api/admin/book/${encodeURIComponent(c.slug)}/status`, { status: fin ? 'draft' : 'finalized' });
        c.status = r.status;
        toast(fin ? t('family.book.drafted_toast') : t('family.book.finalized_toast'));
        rerender();
      } catch (e) { toast(errText(e), 'error'); busy(b, false); }
    },
  }, fin ? t('family.book.unfinalize') : t('family.book.finalize'));
}

export async function chapterView(slug) {
  let c;
  try { c = await get('/api/book/' + encodeURIComponent(slug)); } catch (e) { return errorBox(e, () => go('#/book')); }
  const lang = currentLang();
  const md = (lang === 'es' && c.md.es) || c.md.en;
  const head = h('div', { class: 'chapter-head' });
  const paintHead = () => {
    clear(head);
    head.append(statusBadge(c), c.votes ? h('p', { class: 'field-label', text: t('family.book.vote_prompt') }) : null,
      c.votes ? voteRow(c) : null, finalizeButton(c, paintHead));
  };
  paintHead();
  const root = h('section', { class: 'page chapter-page' },
    backLink('#/book', t('family.book.title')),
    h('p', { class: 'eyebrow', text: kindLabel(c.kind) }),
    h('h1', { text: chapterTitle(c) }), head);
  if (lang === 'es' && !c.md.es && c.md.en) root.append(h('p', { class: 'card note', text: t('family.book.es_soon') }));
  if (md) root.append(h('article', { class: 'card paper' }, render(md)));
  if (c.drafts.length) {
    root.append(h('h2', { class: 'section-title', text: t('family.book.from_table') }));
    for (const d of c.drafts) {
      root.append(h('article', { class: 'card paper draft' },
        render(d.draft_md),
        h('footer', { class: 'draft-foot' },
          avatar({ display_name: d.sparked_by.author }, 's'),
          h('span', null, t('family.book.sparked_by', { author: d.sparked_by.author, who: d.sparked_by.requested_by })),
          h('a', { class: 'link', href: '#/t/' + d.sparked_by.thread_id }, t('family.book.see_thread')),
          h('span', { class: 'muted', text: ago(d.created_at, lang) }))));
    }
  }
  return root;
}
