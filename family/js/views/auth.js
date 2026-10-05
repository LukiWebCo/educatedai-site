// Join (invite link → passkey or PIN) and sign-in. The PIN is always offered next to the passkey.
import { ApiErr, post, setToken } from '../api.js';
import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import * as passkey from '../passkey.js';
import { busy, errText, go } from '../ui.js';

let joinToken = null;

export function rememberJoinToken(tok) { joinToken = tok; }

function pinInput(id, labelKey) {
  return h('label', { class: 'field', for: id },
    h('span', { class: 'field-label' }, t(labelKey)),
    h('input', { id, class: 'input input-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]{6}', maxlength: 6, autocomplete: 'new-password', required: true }));
}

function msgLine() { return h('p', { class: 'form-msg', role: 'alert', 'aria-live': 'polite' }); }

function pinForm(onPin, submitLabel) {
  const msg = msgLine();
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', { class: 'muted', text: t('family.join.pin_explain') }),
    pinInput('pin1', 'family.join.pin_label'),
    pinInput('pin2', 'family.join.pin_again'),
    msg,
    h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, submitLabel));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const a = form.querySelector('#pin1').value.trim();
    const b = form.querySelector('#pin2').value.trim();
    if (!/^\d{6}$/.test(a)) { msg.textContent = t('family.errors.bad_pin'); return; }
    if (a !== b) { msg.textContent = t('family.join.pin_mismatch'); return; }
    const btn = form.querySelector('button[type=submit]');
    busy(btn, true);
    try { await onPin(a); } catch (e) { msg.textContent = errText(e); } finally { busy(btn, false); }
  });
  return form;
}

export async function joinView(onSignedIn) {
  const wrap = h('section', { class: 'auth' });
  const card = h('div', { class: 'card auth-card' });
  wrap.append(h('div', { class: 'auth-lamp', 'aria-hidden': 'true' }), card);
  if (!joinToken) {
    card.append(h('h1', { text: t('family.join.missing_title') }), h('p', { text: t('family.join.missing_body') }),
      h('a', { class: 'btn btn-quiet btn-big', href: '#/login' }, t('family.login.title')));
    return wrap;
  }
  let info;
  try {
    info = await post('/api/invite/redeem', { token: joinToken }, { auth: false });
  } catch (e) {
    card.append(h('h1', { text: t('family.join.expired_title') }), h('p', { text: e instanceof ApiErr && e.status === 410 ? t('family.join.expired_body') : errText(e) }),
      h('a', { class: 'btn btn-quiet btn-big', href: '#/login' }, t('family.join.have_account')));
    return wrap;
  }
  const enroll = info.enroll;
  const finish = async (res, offerPin) => {
    setToken(res.token);
    joinToken = null;
    if (offerPin) {
      card.replaceChildren(
        h('h1', { text: t('family.join.backup_title') }),
        h('p', { text: t('family.join.backup_body') }),
        pinForm(async (pin) => { await post('/api/pin/set', { pin }); await onSignedIn(res.member); }, t('family.join.backup_save')),
        h('button', { class: 'btn btn-quiet btn-big', type: 'button', onclick: () => onSignedIn(res.member) }, t('family.join.backup_skip')));
    } else {
      await onSignedIn(res.member);
    }
  };

  let regOpts = null;
  const msg = msgLine();
  const pkBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', 'data-test': 'join-passkey' }, icon('finger'), h('span', null, t('family.join.passkey_button')));
  const pinBtn = h('button', { class: 'btn btn-quiet btn-big', type: 'button', 'data-test': 'join-pin' }, icon('key'), h('span', null, t('family.join.pin_button')));
  pkBtn.addEventListener('click', async () => {
    msg.textContent = '';
    if (!passkey.supported() || !regOpts) { msg.textContent = t('family.join.passkey_unavailable'); return; }
    busy(pkBtn, true);
    try {
      const cred = await passkey.create(regOpts); // called straight from the tap
      const res = await post('/api/webauthn/register/verify', { credential: cred }, { token: enroll });
      await finish(res, true);
    } catch (e) {
      msg.textContent = e instanceof ApiErr ? errText(e) : t('family.join.passkey_cancelled');
      regOpts = await post('/api/webauthn/register/options', {}, { token: enroll }).catch(() => null);
    } finally { busy(pkBtn, false); }
  });
  pinBtn.addEventListener('click', () => {
    card.replaceChildren(
      h('h1', { text: t('family.join.pin_title') }),
      pinForm(async (pin) => { const res = await post('/api/pin/set', { pin }, { token: enroll }); await finish(res, false); }, t('family.join.pin_save')),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => go('#/join') }, t('family.common.back')));
  });
  card.append(
    h('p', { class: 'eyebrow', text: t('family.join.eyebrow') }),
    h('h1', { text: t('family.join.hello', { name: info.member.display_name }) }),
    h('p', { class: 'lede', text: t('family.join.lede') }),
    h('p', { class: 'muted small', text: t('family.join.adults') }),
    h('div', { class: 'choice' }, pkBtn, h('span', { class: 'or', text: t('family.common.or') }), pinBtn),
    msg,
    h('p', { class: 'muted small', text: t('family.join.passkey_hint') }));
  if (passkey.supported()) regOpts = await post('/api/webauthn/register/options', {}, { token: enroll }).catch(() => null);
  return wrap;
}

export async function loginView(onSignedIn) {
  const wrap = h('section', { class: 'auth' });
  const card = h('div', { class: 'card auth-card' });
  wrap.append(h('div', { class: 'auth-lamp', 'aria-hidden': 'true' }), card);
  const msg = msgLine();
  let opts = null;
  const fetchOpts = async () => { opts = await post('/api/login/options', {}, { auth: false }).catch(() => null); };

  const pkBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', 'data-test': 'login-passkey' }, icon('finger'), h('span', null, t('family.login.passkey_button')));
  const pinBtn = h('button', { class: 'btn btn-quiet btn-big', type: 'button', 'data-test': 'login-pin' }, icon('key'), h('span', null, t('family.login.pin_button')));
  pkBtn.addEventListener('click', async () => {
    msg.textContent = '';
    if (!passkey.supported() || !opts) { msg.textContent = t('family.join.passkey_unavailable'); await fetchOpts(); return; }
    busy(pkBtn, true);
    try {
      const cred = await passkey.get(opts.options);
      const res = await post('/api/login/verify', { challenge_id: opts.challenge_id, credential: cred }, { auth: false });
      setToken(res.token);
      await onSignedIn(res.member);
    } catch (e) {
      msg.textContent = e instanceof ApiErr ? errText(e) : t('family.login.passkey_cancelled');
      await fetchOpts();
    } finally { busy(pkBtn, false); }
  });

  const phone = h('input', { id: 'phone', class: 'input', type: 'tel', inputmode: 'tel', autocomplete: 'username', placeholder: '+1 555 555 0123', required: true });
  const pin = h('input', { id: 'pin', class: 'input input-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]{6}', maxlength: 6, autocomplete: 'current-password', required: true });
  const pinMsg = msgLine();
  const pinForm = h('form', { class: 'stack pin-login', hidden: true, novalidate: true },
    h('label', { class: 'field', for: 'phone' }, h('span', { class: 'field-label' }, t('family.login.phone_label')), phone,
      h('span', { class: 'field-hint' }, t('family.login.phone_hint'))),
    h('label', { class: 'field', for: 'pin' }, h('span', { class: 'field-label' }, t('family.login.pin_label')), pin),
    pinMsg,
    h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, t('family.login.pin_submit')));
  pinBtn.addEventListener('click', () => { pinForm.hidden = false; pinBtn.hidden = true; phone.focus(); });
  pinForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    pinMsg.textContent = '';
    const p = normalizePhone(phone.value);
    if (!p) { pinMsg.textContent = t('family.errors.bad_phone'); return; }
    if (!/^\d{6}$/.test(pin.value.trim())) { pinMsg.textContent = t('family.errors.bad_pin'); return; }
    const btn = pinForm.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      const res = await post('/api/login/pin', { phone: p, pin: pin.value.trim() }, { auth: false });
      setToken(res.token);
      await onSignedIn(res.member);
    } catch (e) { pinMsg.textContent = errText(e); } finally { busy(btn, false); }
  });

  card.append(
    h('p', { class: 'eyebrow', text: t('family.login.eyebrow') }),
    h('h1', { text: t('family.login.title') }),
    h('p', { class: 'lede', text: t('family.login.lede') }),
    h('div', { class: 'choice' }, pkBtn, h('span', { class: 'or', text: t('family.common.or') }), pinBtn),
    msg, pinForm,
    h('p', { class: 'muted small', text: t('family.login.new_here') }));
  await fetchOpts();
  return wrap;
}

export function normalizePhone(v) {
  let s = String(v || '').replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(s)) s = '+1' + s;
  if (/^1\d{10}$/.test(s)) s = '+' + s;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}
