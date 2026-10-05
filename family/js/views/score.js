// Joke court: the weekly scoreboard. Claude is on it, no mercy.
import { get } from '../api.js';
import { avatar, h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { errorBox, go } from '../ui.js';

function isoWeek(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((x - y0) / 86400000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

function shift(week, by) {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (w - 1) * 7 * 86400000);
  return isoWeek(new Date(monday.getTime() + by * 7 * 86400000));
}

export async function scoreView(week) {
  const now = isoWeek(new Date());
  week = /^\d{4}-W\d{2}$/.test(week || '') ? week : now;
  let sb;
  try { sb = await get('/api/scoreboard?week=' + week); } catch (e) { return errorBox(e, () => go('#/score')); }
  const root = h('section', { class: 'page' },
    h('p', { class: 'eyebrow', text: t('family.score.eyebrow') }),
    h('h1', { text: t('family.score.title') }),
    h('p', { class: 'lede', text: t('family.score.lede') }),
    h('div', { class: 'row space week-nav' },
      h('a', { class: 'btn btn-quiet btn-small', href: '#/score/' + shift(week, -1), 'aria-label': t('family.score.prev') }, icon('back')),
      h('span', { class: 'week-label', text: week === now ? t('family.score.this_week') : t('family.score.week_of', { week }) }),
      week === now ? h('span', { class: 'spacer' }) : h('a', { class: 'btn btn-quiet btn-small', href: '#/score/' + shift(week, 1), 'aria-label': t('family.score.next') }, icon('next'))));
  if (!sb.rows.length) {
    root.append(h('p', { class: 'card empty', text: t('family.score.empty') }));
    return root;
  }
  const table = h('ol', { class: 'card scoreboard' });
  sb.rows.forEach((r, i) => table.append(h('li', { class: 'score-row' + (r.member.role === 'claude' ? ' is-claude' : '') },
    h('span', { class: 'rank', text: String(i + 1) }),
    avatar(r.member, 's'),
    h('div', { class: 'grow' },
      h('span', { class: 'score-name', text: r.member.display_name }),
      r.best_post ? h('a', { class: 'best', href: '#/t/' + r.best_post.thread_id, text: '“' + r.best_post.excerpt + '”' }) : null),
    h('span', { class: 'tally' }, h('span', { class: 'hit' }, icon('target', 'icon icon-inline'), String(r.hits)), h('span', { class: 'miss' }, icon('puff', 'icon icon-inline'), String(r.misses))),
    h('span', { class: 'score', text: (r.score > 0 ? '+' : '') + r.score }))));
  root.append(table);
  return root;
}
