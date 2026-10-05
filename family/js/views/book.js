// The Book: chapters read from the job clone, rendered with the escaped markdown renderer.
import { get } from '../api.js';
import { ago, avatar, h } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { render } from '../md.js';
import { backLink, errorBox, go } from '../ui.js';

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

export async function bookView() {
  let data;
  try { data = await get('/api/book'); } catch (e) { return errorBox(e, () => go('#/book')); }
  const root = h('section', { class: 'page' },
    h('p', { class: 'eyebrow', text: t('family.book.eyebrow') }),
    h('h1', { text: t('family.book.title') }),
    h('p', { class: 'lede', text: t('family.book.lede') }));
  if (data.pending_requests) {
    root.append(h('p', { class: 'card note' }, (data.pending_requests === 1 ? t('family.book.pending_count.one', { n: data.pending_requests }) : t('family.book.pending_count.other', { n: data.pending_requests }))));
  }
  const list = h('div', { class: 'book-list' });
  for (const c of data.chapters) {
    list.append(h('a', { class: 'card chapter chapter-' + c.kind, href: '#/book/' + c.slug },
      h('span', { class: 'chapter-kind', text: kindLabel(c.kind) }),
      h('span', { class: 'chapter-title', text: chapterTitle(c) }),
      c.drafts ? h('span', { class: 'pill', text: (c.drafts === 1 ? t('family.book.drafts_count.one', { n: c.drafts }) : t('family.book.drafts_count.other', { n: c.drafts })) }) : null));
  }
  if (!data.chapters.length) list.append(h('p', { class: 'muted', text: t('family.book.empty') }));
  root.append(list);
  return root;
}

export async function chapterView(slug) {
  let c;
  try { c = await get('/api/book/' + encodeURIComponent(slug)); } catch (e) { return errorBox(e, () => go('#/book')); }
  const lang = currentLang();
  const md = (lang === 'es' && c.md.es) || c.md.en;
  const root = h('section', { class: 'page chapter-page' },
    backLink('#/book', t('family.book.title')),
    h('p', { class: 'eyebrow', text: kindLabel(c.kind) }),
    h('h1', { text: chapterTitle(c) }));
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
