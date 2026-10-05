// The film log: what Claude made and why. "Sparked by" is private and only ever shown here.
import { get } from '../api.js';
import { dateLong, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { errorBox, go } from '../ui.js';

export function statusLabel(s) {
  switch (s) {
    case 'published': return t('family.films.status_published');
    case 'taken_down': return t('family.films.status_taken_down');
    case 'review_pass': case 'review_fail': case 'rendered': return t('family.films.status_review');
    case 'rendering': case 'spec_ready': return t('family.films.status_making');
    case 'render_failed': return t('family.films.status_failed');
    default: return t('family.films.status_other');
  }
}

export async function filmsView() {
  let films;
  try { films = await get('/api/films'); } catch (e) { return errorBox(e, () => go('#/films')); }
  const lang = currentLang();
  const root = h('section', { class: 'page' },
    h('p', { class: 'eyebrow', text: t('family.films.eyebrow') }),
    h('h1', { text: t('family.films.title') }),
    h('p', { class: 'lede', text: t('family.films.lede') }));
  if (!films.length) {
    root.append(h('div', { class: 'card empty' }, icon('film', 'icon icon-big'), h('p', { text: t('family.films.empty') })));
    return root;
  }
  const pick = (o) => (o && (o[lang] || o.en)) || '';
  for (const f of films) {
    const watch = f.watch[lang] || f.watch.en;
    root.append(h('article', { class: 'card film film-' + f.status },
      h('div', { class: 'row space' },
        h('span', { class: 'eyebrow', text: f.date ? dateLong(f.date, lang) : f.id }),
        h('span', { class: 'pill status-' + f.status, text: statusLabel(f.status) })),
      h('h2', { class: 'film-title', text: pick(f.title) || f.id }),
      pick(f.hook) ? h('p', { class: 'film-hook', text: pick(f.hook) }) : null,
      pick(f.pitch) ? h('div', { class: 'film-why' }, h('h3', { text: t('family.films.pitch') }), h('p', { text: pick(f.pitch) })) : null,
      pick(f.why) ? h('div', { class: 'film-why' }, h('h3', { text: t('family.films.why') }), h('p', { text: pick(f.why) })) : null,
      f.sparked_by_thread ? h('p', { class: 'sparked' }, h('span', { text: t('family.films.sparked_by') + ' ' }),
        h('a', { class: 'link', href: '#/t/' + f.sparked_by_thread.id, text: f.sparked_by_thread.title }),
        h('span', { class: 'muted small', text: ' ' + t('family.films.private_note') })) : null,
      f.takedown ? h('p', { class: 'muted small', text: t('family.films.takedown_requested') }) : null,
      watch && f.status === 'published' ? h('a', { class: 'btn btn-quiet', href: watch, target: '_blank', rel: 'noopener noreferrer' }, icon('play'), h('span', null, t('family.films.watch'))) : null));
  }
  return root;
}
