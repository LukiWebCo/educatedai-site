// The how-to film: plays on first sign-in and stays one tap away (the "?" button).
// URLs come from window.EAI.howto (generated /family/config.js). Missing → a friendly "coming soon".
import { h, icon } from './dom.js';
import { currentLang, t } from './i18n.js';

export function howtoSource(lang) {
  const ht = window.EAI && window.EAI.howto;
  const set = ht && (ht[lang] || ht.en);
  if (!set) return null;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const url = set[portrait ? '9x16' : '16x9'] || set['9x16'] || set['16x9'];
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
}

export function openHowto({ autoplay = false, onClose } = {}) {
  const lang = currentLang();
  const src = howtoSource(lang);
  const dlg = h('dialog', { class: 'sheet howto', 'aria-labelledby': 'howto-title' });
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  const head = h('div', { class: 'row space' },
    h('h2', { id: 'howto-title', text: t('family.howto.title') }),
    h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': t('family.common.close') }, icon('x')));
  if (src) {
    const video = h('video', { class: 'howto-video', src, controls: true, playsinline: true, preload: 'metadata' });
    dlg.append(head, video, h('p', { class: 'muted small', text: t('family.howto.caption_note') }),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: close }, t('family.howto.got_it')));
    if (autoplay) {
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    }
  } else {
    dlg.append(head,
      h('div', { class: 'howto-soon' },
        h('img', { class: 'avatar avatar-l avatar-claude', src: 'claude-avatar.svg', alt: '' }),
        h('p', { class: 'howto-soon-title', text: t('family.howto.soon_title') }),
        h('p', { text: t('family.howto.soon_body') }),
        h('ul', { class: 'howto-tips' },
          h('li', { text: t('family.howto.tip_post') }),
          h('li', { text: t('family.howto.tip_claude') }),
          h('li', { text: t('family.howto.tip_vote') }),
          h('li', { text: t('family.howto.tip_book') }),
          h('li', { text: t('family.howto.tip_lang') }))),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: close }, t('family.howto.got_it')));
  }
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
