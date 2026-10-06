// Opt-in notifications (Me → Notifications). Off by default. This phone subscribes to Web Push with the site's
// public VAPID key (window.EAI.vapidPublicKey, from /family/config.js); jobs/notify.py does the sending.
import { api, get, patch, post } from './api.js';
import { clear, h, icon } from './dom.js';
import { t } from './i18n.js';
import { busy, errText, toast } from './ui.js';

const KINDS = ['mention', 'claude_reply', 'film', 'digest'];
const label = (k) => ({ mention: t('family.notify.kind_mention'), claude_reply: t('family.notify.kind_claude_reply'), film: t('family.notify.kind_film'), digest: t('family.notify.kind_digest') })[k];

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function standalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

function keyBytes(b64u) {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function currentSub() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('./');
  return reg ? reg.pushManager.getSubscription() : null;
}

async function subscribe() {
  const key = (window.EAI && window.EAI.vapidPublicKey) || '';
  if (!key) throw new Error('not_ready');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const j = sub.toJSON();
  await post('/api/push/subscriptions', { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
}

async function unsubscribe() {
  const sub = await currentSub();
  if (sub) {
    await api('DELETE', '/api/push/subscriptions', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

function iosHint() {
  return h('div', { class: 'note card ios-hint', 'data-test': 'ios-hint' },
    h('h3', { text: t('family.notify.ios_title') }),
    h('ol', { class: 'steps' },
      h('li', { text: t('family.notify.ios_step1') }), h('li', { text: t('family.notify.ios_step2') }),
      h('li', { text: t('family.notify.ios_step3') }), h('li', { text: t('family.notify.ios_step4') })));
}

export async function notifyCard() {
  const card = h('div', { class: 'card stack notify-card', 'data-test': 'notify' });
  let st = await get('/api/notify').catch(() => ({ prefs: {}, devices: 0 }));
  const paint = async () => {
    clear(card);
    card.append(h('h2', null, icon('bell', 'icon icon-inline'), ' ', t('family.notify.title')),
      h('p', { class: 'muted', text: t('family.notify.lede') }));
    const ios = isIOS() && !standalone();
    if (ios) card.append(iosHint());
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const sub = await currentSub().catch(() => null);
    if (!supported()) {
      if (!ios) card.append(h('p', { class: 'muted', text: t('family.notify.unsupported') }));
    } else if (sub) {
      card.append(h('p', { class: 'ok-line', text: t('family.notify.on_here') }),
        h('button', { class: 'btn btn-quiet btn-big', type: 'button', 'data-test': 'notify-off',
          onclick: async (ev) => { busy(ev.currentTarget, true); await unsubscribe(); st = await get('/api/notify').catch(() => st); paint(); } },
        t('family.notify.turn_off')));
    } else {
      card.append(h('button', { class: 'btn btn-primary btn-big', type: 'button', 'data-test': 'notify-on',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          msg.textContent = '';
          busy(b, true);
          try {
            await subscribe();
            if (!KINDS.some((k) => st.prefs[k])) st = await patch('/api/notify', { mention: true, claude_reply: true, film: true });
            paint();
          } catch (e) {
            msg.textContent = e.message === 'denied' ? t('family.notify.denied') : e.message === 'not_ready' ? t('family.notify.not_ready') : errText(e);
            busy(b, false);
          }
        } }, icon('bell'), h('span', null, t('family.notify.turn_on'))), msg);
    }
    const list = h('div', { class: 'stack notify-kinds', role: 'group', 'aria-label': t('family.notify.choose') });
    for (const k of KINDS) {
      const box = h('input', { type: 'checkbox', id: 'nk-' + k, class: 'big-check', checked: !!st.prefs[k], 'data-kind': k });
      box.addEventListener('change', async () => {
        try { st = await patch('/api/notify', { [k]: box.checked }); toast(t('family.notify.saved')); } catch (e) { box.checked = !box.checked; toast(errText(e), 'error'); }
      });
      list.append(h('label', { class: 'check-row', for: 'nk-' + k }, box, h('span', { text: label(k) })));
    }
    card.append(h('p', { class: 'field-label', text: t('family.notify.choose') }), list);
  };
  await paint();
  return card;
}
