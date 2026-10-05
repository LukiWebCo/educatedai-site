// Owner-only: add people (invite shown once), reissue, remove, and the kill switch.
import { del, get, post } from '../api.js';
import { ago, avatar, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { normalizePhone } from './auth.js';
import { statusLabel } from './films.js';
import { busy, confirmBox, errText, errorBox, go, state, toast } from '../ui.js';

function inviteBox(member, url, expires) {
  const field = h('input', { class: 'input invite-url', readonly: true, value: url, 'aria-label': t('family.admin.invite_link') });
  const msg = t('family.admin.sms_body', { name: member.display_name, url });
  const copy = h('button', {
    class: 'btn btn-primary', type: 'button', 'data-test': 'copy-invite',
    onclick: async () => {
      try { await navigator.clipboard.writeText(url); toast(t('family.admin.copied')); } catch { field.select(); document.execCommand && document.execCommand('copy'); toast(t('family.admin.copied')); }
    },
  }, icon('copy'), h('span', null, t('family.admin.copy')));
  const share = navigator.share ? h('button', {
    class: 'btn btn-quiet', type: 'button',
    onclick: async () => { try { await navigator.share({ text: msg }); } catch { /* cancelled */ } },
  }, icon('share'), h('span', null, t('family.admin.share'))) : null;
  const sms = h('a', { class: 'btn btn-quiet', href: 'sms:' + encodeURIComponent(member.phone_e164 || '') + '?&body=' + encodeURIComponent(msg) }, icon('sms'), h('span', null, t('family.admin.text_it')));
  return h('div', { class: 'card invite-box', role: 'status' },
    h('h3', { text: t('family.admin.invite_for', { name: member.display_name }) }),
    h('p', { class: 'muted small', text: t('family.admin.invite_once') }),
    field,
    h('div', { class: 'row gap wrap' }, copy, share, sms),
    h('p', { class: 'muted small', text: t('family.admin.invite_expires', { when: new Date(expires).toLocaleDateString(currentLang() === 'es' ? 'es-MX' : 'en-US', { month: 'long', day: 'numeric' }) }) }));
}

function memberStatus(m) {
  if (m.removed_at) return t('family.admin.status_removed');
  if (m.passkeys && m.has_pin) return t('family.admin.status_passkey_pin');
  if (m.passkeys) return t('family.admin.status_passkey');
  if (m.has_pin) return t('family.admin.status_pin');
  if (m.invite_open) return t('family.admin.status_invited');
  return t('family.admin.status_no_invite');
}

export async function adminView() {
  let members, films, takedowns;
  try {
    [members, films, takedowns] = await Promise.all([get('/api/admin/members'), get('/api/films'), get('/api/admin/takedowns')]);
  } catch (e) { return errorBox(e, () => go('#/admin')); }
  const root = h('section', { class: 'page admin' },
    h('p', { class: 'eyebrow', text: t('family.admin.eyebrow') }),
    h('h1', { text: t('family.admin.title') }));

  // Add someone
  const slot = h('div');
  const name = h('input', { id: 'm-name', class: 'input', maxlength: 60, required: true, autocomplete: 'off' });
  const phone = h('input', { id: 'm-phone', class: 'input', type: 'tel', inputmode: 'tel', required: true, placeholder: '+1 555 555 0123', autocomplete: 'off' });
  const lang = h('select', { id: 'm-lang', class: 'input' }, h('option', { value: 'en' }, 'English'), h('option', { value: 'es' }, 'Español'));
  const role = h('select', { id: 'm-role', class: 'input' }, h('option', { value: 'member' }, t('family.admin.role_member')), h('option', { value: 'admin' }, t('family.admin.role_admin')));
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const form = h('form', { class: 'card stack', novalidate: true },
    h('h2', { text: t('family.admin.add_title') }),
    h('label', { class: 'field', for: 'm-name' }, h('span', { class: 'field-label' }, t('family.admin.name_label')), name),
    h('label', { class: 'field', for: 'm-phone' }, h('span', { class: 'field-label' }, t('family.admin.phone_label')), phone, h('span', { class: 'field-hint' }, t('family.login.phone_hint'))),
    h('div', { class: 'row gap' },
      h('label', { class: 'field grow', for: 'm-lang' }, h('span', { class: 'field-label' }, t('family.admin.lang_label')), lang),
      h('label', { class: 'field grow', for: 'm-role' }, h('span', { class: 'field-label' }, t('family.admin.role_label')), role)),
    msg,
    h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, icon('plus'), h('span', null, t('family.admin.add_submit'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.textContent = '';
    const p = normalizePhone(phone.value);
    if (!name.value.trim()) { msg.textContent = t('family.errors.bad_name'); return; }
    if (!p) { msg.textContent = t('family.errors.bad_phone'); return; }
    const btn = form.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      const r = await post('/api/admin/members', { display_name: name.value.trim(), phone_e164: p, lang: lang.value, role: role.value });
      slot.replaceChildren(inviteBox(r.member, r.invite_url, r.expires_at));
      form.reset();
      refreshMembers();
      slot.scrollIntoView({ block: 'center' });
    } catch (e) { msg.textContent = errText(e); } finally { busy(btn, false); }
  });
  root.append(form, slot);

  // Members
  const list = h('div', { class: 'stack' });
  const drawMembers = (ms) => {
    list.replaceChildren(...ms.map((m) => h('div', { class: 'card member' + (m.removed_at ? ' removed' : '') },
      h('div', { class: 'row gap' }, avatar(m),
        h('div', { class: 'grow' },
          h('p', { class: 'member-name', text: m.display_name + (m.role === 'admin' ? ' · ' + t('family.admin.role_admin') : '') }),
          h('p', { class: 'muted small', text: (m.phone_e164 || '') + ' · ' + memberStatus(m) + (m.last_seen ? ' · ' + t('family.admin.last_seen', { when: ago(m.last_seen, currentLang()) }) : '') }))),
      m.removed_at ? null : h('div', { class: 'row gap wrap' },
        h('button', {
          class: 'btn btn-quiet btn-small', type: 'button',
          onclick: async (ev) => {
            if (!(await confirmBox(t('family.admin.reinvite_confirm', { name: m.display_name }), t('family.admin.reinvite')))) return;
            busy(ev.currentTarget, true);
            try { const r = await post(`/api/admin/members/${m.id}/reinvite`); slot.replaceChildren(inviteBox(r.member, r.invite_url, r.expires_at)); slot.scrollIntoView({ block: 'center' }); refreshMembers(); } catch (e) { toast(errText(e), 'error'); }
          },
        }, t('family.admin.reinvite')),
        m.id === state.me.id ? null : h('button', {
          class: 'btn btn-danger-quiet btn-small', type: 'button',
          onclick: async () => {
            if (!(await confirmBox(t('family.admin.remove_confirm', { name: m.display_name }), t('family.admin.remove'), true))) return;
            try { await del(`/api/admin/members/${m.id}`); toast(t('family.admin.removed')); refreshMembers(); } catch (e) { toast(errText(e), 'error'); }
          },
        }, t('family.admin.remove'))))));
  };
  const refreshMembers = async () => { try { drawMembers(await get('/api/admin/members')); } catch (e) { toast(errText(e), 'error'); } };
  drawMembers(members);
  root.append(h('h2', { class: 'section-title', text: t('family.admin.members_title') }), list);

  // Kill switch
  const pending = new Set(takedowns.filter((x) => x.status === 'pending').map((x) => x.kind + ':' + x.ref));
  const kill = h('div', { class: 'card kill' },
    h('h2', { text: t('family.admin.kill_title') }),
    h('p', { class: 'muted', text: t('family.admin.kill_lede') }));
  const live = films.filter((f) => f.status === 'published');
  if (!live.length) kill.append(h('p', { class: 'muted', text: t('family.admin.kill_empty') }));
  const pick = (o) => (o && (o[currentLang()] || o.en)) || '';
  for (const f of live) {
    const asked = pending.has('film:' + f.id) || f.takedown === 'pending';
    const btn = h('button', {
      class: 'btn btn-danger', type: 'button', disabled: asked, 'data-test': 'takedown-film',
      onclick: async () => {
        if (!(await confirmBox(t('family.admin.takedown_film_confirm', { title: pick(f.title) || f.id }), t('family.admin.takedown_yes'), true))) return;
        busy(btn, true);
        try { await post('/api/admin/takedowns', { kind: 'film', ref: f.id }); btn.textContent = t('family.admin.takedown_requested'); toast(t('family.admin.takedown_done')); } catch (e) { toast(errText(e), 'error'); busy(btn, false); return; }
        btn.disabled = true;
      },
    }, asked ? t('family.admin.takedown_requested') : t('family.admin.takedown'));
    kill.append(h('div', { class: 'row gap kill-row' }, h('div', { class: 'grow' },
      h('p', { class: 'member-name', text: pick(f.title) || f.id }),
      h('p', { class: 'muted small', text: (f.date || '') + ' · ' + statusLabel(f.status) })), btn));
  }
  kill.append(h('p', { class: 'muted small', text: t('family.admin.kill_posts_hint') }));
  if (takedowns.length) {
    kill.append(h('h3', { text: t('family.admin.recent_takedowns') }),
      h('ul', { class: 'plain' }, takedowns.slice(0, 10).map((x) => h('li', { class: 'small' },
        (x.kind === 'film' ? t('family.admin.kind_film') : t('family.admin.kind_post')) + ' ' + x.ref + ' · ' +
        (x.status === 'done' ? t('family.admin.td_done') : x.status === 'failed' ? t('family.admin.td_failed') : t('family.admin.td_pending')) + ' · ' + ago(x.requested_at, currentLang())))));
  }
  root.append(kill);
  return root;
}
