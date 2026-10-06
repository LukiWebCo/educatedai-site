// Me: language, text size, how-to, passkey/PIN, sign out.
import { ApiErr, get, post } from '../api.js';
import { avatar, h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { openHowto } from '../howto.js';
import * as passkey from '../passkey.js';
import { busy, errText, state, toast } from '../ui.js';
import { notifyCard } from '../notify.js';

export async function meView(actions) {
  const me = await get('/api/me').catch(() => state.me);
  const root = h('section', { class: 'page me' },
    h('div', { class: 'row gap me-head' }, avatar(me, 'l'), h('div', null,
      h('p', { class: 'eyebrow', text: t('family.me.eyebrow') }),
      h('h1', { text: me.display_name }))));

  const langRow = h('div', { class: 'seg seg-big', role: 'group', 'aria-label': t('family.header.language') },
    ['en', 'es'].map((l) => h('button', { class: 'seg-btn' + (me.lang === l ? ' on' : ''), type: 'button', 'aria-pressed': String(me.lang === l), onclick: () => actions.setLang(l) }, l === 'en' ? 'English' : 'Español')));
  const sizeRow = h('div', { class: 'seg seg-big', role: 'group', 'aria-label': t('family.header.text_size') },
    [1, 2, 3, 4].map((n) => h('button', { class: 'seg-btn size-' + n + (me.text_size === n ? ' on' : ''), type: 'button', 'aria-pressed': String(me.text_size === n), 'aria-label': t('family.me.size_n', { n }), onclick: () => actions.setSize(n) }, 'A')));

  const pkMsg = h('p', { class: 'form-msg', role: 'alert' });
  let regOpts = null;
  const pkBtn = h('button', { class: 'btn btn-quiet btn-big', type: 'button' }, icon('finger'), h('span', null, t('family.me.add_passkey')));
  pkBtn.addEventListener('click', async () => {
    pkMsg.textContent = '';
    if (!passkey.supported() || !regOpts) { pkMsg.textContent = t('family.join.passkey_unavailable'); return; }
    busy(pkBtn, true);
    try {
      const cred = await passkey.create(regOpts);
      const res = await post('/api/webauthn/register/verify', { credential: cred });
      actions.swapToken(res.token);
      toast(t('family.me.passkey_added'));
    } catch (e) { pkMsg.textContent = e instanceof ApiErr ? errText(e) : t('family.join.passkey_cancelled'); }
    finally { busy(pkBtn, false); regOpts = await post('/api/webauthn/register/options').catch(() => null); }
  });
  if (passkey.supported()) regOpts = await post('/api/webauthn/register/options').catch(() => null);

  const p1 = h('input', { id: 'np1', class: 'input input-pin', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password' });
  const p2 = h('input', { id: 'np2', class: 'input input-pin', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'new-password' });
  const pinMsg = h('p', { class: 'form-msg', role: 'alert' });
  const pinForm = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'row gap' },
      h('label', { class: 'field grow', for: 'np1' }, h('span', { class: 'field-label' }, t('family.join.pin_label')), p1),
      h('label', { class: 'field grow', for: 'np2' }, h('span', { class: 'field-label' }, t('family.join.pin_again')), p2)),
    pinMsg,
    h('button', { class: 'btn btn-quiet btn-big', type: 'submit' }, icon('key'), h('span', null, me.has_pin ? t('family.me.change_pin') : t('family.me.set_pin'))));
  pinForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(p1.value)) { pinMsg.textContent = t('family.errors.bad_pin'); return; }
    if (p1.value !== p2.value) { pinMsg.textContent = t('family.join.pin_mismatch'); return; }
    try { const res = await post('/api/pin/set', { pin: p1.value }); actions.swapToken(res.token); pinForm.reset(); toast(t('family.me.pin_saved')); } catch (e) { pinMsg.textContent = errText(e); }
  });

  root.append(
    h('div', { class: 'card stack' }, h('h2', { text: t('family.header.language') }), langRow),
    h('div', { class: 'card stack' }, h('h2', { text: t('family.header.text_size') }), sizeRow, h('p', { class: 'sample', text: t('family.me.size_sample') })),
    await notifyCard(),
    h('div', { class: 'card stack' }, h('h2', { text: t('family.me.help_title') }),
      h('button', { class: 'btn btn-quiet btn-big', type: 'button', onclick: () => openHowto({ autoplay: true }) }, icon('play'), h('span', null, t('family.me.watch_howto')))),
    h('div', { class: 'card stack' }, h('h2', { text: t('family.me.security_title') }),
      h('p', { class: 'muted small', text: me.has_passkey ? t('family.me.has_passkey') : t('family.me.no_passkey') }),
      pkBtn, pkMsg, pinForm),
    h('button', { class: 'btn btn-danger-quiet btn-big', type: 'button', 'data-test': 'logout', onclick: () => actions.logout() }, icon('out'), h('span', null, t('family.me.logout'))));
  return root;
}
