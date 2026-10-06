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

function howtoPoster() {
  const p = window.EAI && window.EAI.howtoPoster;
  if (!p) return null;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const url = p[portrait ? '9x16' : '16x9'] || p['9x16'] || p['16x9'];
  return typeof url === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(url) ? url : null;
}

// The phone-friendly player: plays inline (playsinline), starts muted with a big "tap for sound", uses
// <source type="video/mp4"> (GitHub serves the file as application/octet-stream from an address with no .mp4 in
// it; the type is how Safari knows it's a video), and if it can't play, offers the same file in the phone's own player.
function howtoPlayer(src, autoplay) {
  const video = h('video', { class: 'howto-video', playsinline: true, 'webkit-playsinline': true, preload: 'metadata',
    poster: howtoPoster() }, h('source', { src, type: 'video/mp4' }));
  const sound = h('button', { class: 'btn btn-primary howto-sound', type: 'button', hidden: true },
    icon('play'), h('span', null, t('family.howto.tap_for_sound')));
  const open = h('a', { class: 'btn btn-quiet btn-big howto-open', href: src, target: '_blank', rel: 'noopener noreferrer' },
    t('family.howto.open_video'));
  const fail = h('div', { class: 'howto-fail', role: 'status', hidden: true },
    h('p', { text: t('family.howto.cant_play') }), open);
  let watchdog = null;
  const showFail = () => { clearTimeout(watchdog); fail.hidden = false; sound.hidden = true; };
  const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => { if (video.readyState < 2) showFail(); }, 12000); };
  const soundOn = () => {
    sound.hidden = true;
    video.muted = false;
    video.controls = true;
    video.currentTime = 0;
    arm();
    video.play().catch((e) => { if (e && e.name === 'NotSupportedError') showFail(); });
  };
  sound.addEventListener('click', soundOn);
  video.addEventListener('click', () => { if (video.muted && !video.controls) soundOn(); });
  video.addEventListener('error', showFail, true);   // capture: a failed <source> reports on the source element
  video.addEventListener('loadeddata', () => clearTimeout(watchdog));
  video.addEventListener('playing', () => { clearTimeout(watchdog); fail.hidden = true; });
  if (autoplay) {
    // muted autoplay is the only kind phones allow; the big button turns the sound on
    video.muted = true;
    video.controls = false;
    sound.hidden = false;
    arm();
    video.play().catch((e) => {
      if (e && e.name === 'NotSupportedError') { showFail(); return; }
      clearTimeout(watchdog);          // autoplay refused (Low Power Mode): native controls instead
      sound.hidden = true;
      video.controls = true;
    });
  } else {
    video.controls = true;
  }
  return h('div', { class: 'howto-frame' }, video, sound, fail);
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
    dlg.append(head, howtoPlayer(src, autoplay), h('p', { class: 'muted small', text: t('family.howto.caption_note') }),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: close }, t('family.howto.got_it')));
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
