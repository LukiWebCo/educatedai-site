// Games lobby (#/games), the New game flow (#/games/new), Join with a code (#/games/join), and the
// room's waiting room (a room in status "lobby", mounted by index.js inside #/games/r/:id).
import { ago, avatar, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { errText, go, state, toast } from '../ui.js';
import { games } from './net.js';
import { dotArt, seatAvatar } from './market.js';
import { openRules, rulesButton, rulesSeen } from './rules_card.js';
import { modeLabel, wordmark } from './tv.js';

const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789';

function head(title, lede, withRules = true) {
  return h('header', { class: 'ghead' },
    h('div', { class: 'ghead-row' },
      h('div', { class: 'grow' },
        h('p', { class: 'eyebrow', text: t('family.games.lobby.eyebrow') }),
        h('h1', { class: 'ghead-title', text: title })),
      withRules ? rulesButton() : null),
    lede ? h('p', { class: 'lede ghead-lede', text: lede }) : null);
}

function back(hash, label) {
  return h('a', { class: 'back gback', href: hash }, icon('back'), h('span', null, label));
}

// ---- room options, said plainly (room cards, the waiting room) ----------------------------------------
export function optionTags(st) {
  st = st || {};
  const tags = [];
  if (st.practice) tags.push(t('family.games.lobby.tag_practice'));
  else {
    tags.push(st.simple_table ? t('family.games.lobby.tag_simple') : t('family.games.lobby.tag_free'));
    tags.push(st.hints === false ? t('family.games.lobby.tag_nohints') : t('family.games.lobby.tag_hints'));
    if (st.turn_seconds) tags.push(t('family.games.lobby.tag_timer', { s: st.turn_seconds }));
    if (st.stack_adj < 0) tags.push(t('family.games.lobby.tag_short'));
    if (st.stack_adj > 0) tags.push(t('family.games.lobby.tag_long'));
    if (st.match_to) tags.push(t('family.games.lobby.tag_match', { n: st.match_to }));
  }
  return h('span', { class: 'gopt-tags' }, tags.map((x) => h('span', { class: 'gtag gtag-opt', text: x })));
}

async function startPractice(btn) {
  btn.disabled = true;
  try {
    const r = await games.practice();
    go('#/games/r/' + r.room_id);
  } catch (e) { toast(errText(e), 'error'); btn.disabled = false; }
}

// ---- lobby ------------------------------------------------------------------------------------------
function roomRow(card, kind) {
  const names = card.seats.map((s) => s.name);
  let status;
  if (card.status === 'lobby') status = t('family.games.lobby.status_lobby', { code: card.code });
  else if (card.status === 'finished') status = t('family.games.lobby.status_over');
  else if (card.my_turn) status = t('family.games.common.your_turn');
  else status = t('family.games.lobby.status_playing');
  const go2 = kind === 'invite' || kind === 'open' ? null : '#/games/r/' + card.id;
  const inner = [
    h('span', { class: 'groom-faces' }, card.seats.slice(0, 4).map((s) => avatar({ display_name: s.name, claude: s.bot }, 's')),
      card.seats.length > 4 ? h('span', { class: 'groom-more', text: '+' + (card.seats.length - 4) }) : null),
    h('span', { class: 'groom-text' },
      h('span', { class: 'groom-title', text: names.length ? names.join(', ') : card.host_name }),
      h('span', { class: 'groom-sub' },
        h('span', { class: 'gtag gtag-mode gtag-' + card.mode, text: modeLabel(card.mode) }),
        h('span', { class: 'groom-status' + (card.my_turn ? ' is-turn' : ''), text: status }),
        card.updated_at ? h('span', { class: 'groom-ago', text: ago(card.updated_at, currentLang()) }) : null),
      optionTags(card.settings)),
  ];
  if (go2) return h('a', { class: 'groom' + (card.my_turn ? ' is-turn' : ''), href: go2 }, inner, icon('next', 'icon groom-go'));
  const joinBtn = h('button', { class: 'btn btn-primary groom-join', type: 'button' }, kind === 'invite' ? t('family.games.lobby.accept') : t('family.games.lobby.join_btn'));
  joinBtn.addEventListener('click', async () => {
    joinBtn.disabled = true;
    try {
      const r = await games.join(card.code, 'player');
      go('#/games/r/' + r.room_id);
    } catch (e) { toast(errText(e), 'error'); joinBtn.disabled = false; }
  });
  return h('div', { class: 'groom' }, inner, joinBtn);
}

function section(cls, title, count, rows, emptyText) {
  return h('section', { class: 'gcard ' + cls },
    h('h2', { class: 'gcard-title' }, h('span', { text: title }), count ? h('span', { class: 'gcount', text: String(count) }) : null),
    rows.length ? h('div', { class: 'groom-list' }, rows) : h('p', { class: 'gcard-empty', text: emptyText }));
}

// Practice with Claude: up top and loud for someone who hasn't finished a game yet, a quiet row after that.
function practiceCard(first) {
  const btn = h('button', { class: 'btn btn-big ' + (first ? 'btn-primary' : 'btn-quiet') + ' gpractice-btn', type: 'button' },
    h('span', { text: t('family.games.lobby.practice') }));
  btn.addEventListener('click', () => startPractice(btn));
  return h('section', { class: 'gpractice' + (first ? ' is-first' : '') },
    first ? h('p', { class: 'gpractice-k', text: t('family.games.lobby.practice_new') }) : null,
    btn,
    h('p', { class: 'gpractice-sub', text: t('family.games.lobby.practice_sub') }));
}

export async function lobbyView() {
  const data = await games.rooms();
  const root = h('section', { class: 'page globby' });
  function draw(d) {
    const mine = d.mine || [];
    const turn = mine.filter((c) => c.my_turn);
    const rest = mine.filter((c) => !c.my_turn);
    root.replaceChildren(...[   // (replaceChildren would print a null as the text "null")
      h('header', { class: 'ghead globby-head' },
        h('div', { class: 'ghead-row' },
          h('p', { class: 'eyebrow grow', text: t('family.games.lobby.eyebrow') }),
          rulesButton()),
        h('h1', { class: 'sr-only', text: t('family.games.common.game_name') }),
        wordmark('globby-wm'),
        h('p', { class: 'lede ghead-lede', text: t('family.games.lobby.tagline') })),
      d.me_new ? practiceCard(true) : null,
      h('div', { class: 'ghero' },
        h('a', { class: 'btn btn-primary btn-big ghero-new', href: '#/games/new' }, icon('plus'), h('span', { text: t('family.games.lobby.new_game') })),
        h('a', { class: 'btn btn-quiet btn-big ghero-join', href: '#/games/join' }, h('span', { text: t('family.games.lobby.join_code') }))),
      d.me_new ? null : practiceCard(false),
      section('gcard-turn' + (turn.length ? ' is-hot' : ''), turn.length ? t('family.games.lobby.your_turn_n', { n: d.my_turn || turn.length }) : t('family.games.lobby.your_turn'), 0,
        turn.map((c) => roomRow(c, 'mine')), t('family.games.lobby.your_turn_none')),
      section('gcard-invites', t('family.games.lobby.invites'), (d.invites || []).length, (d.invites || []).map((c) => roomRow(c, 'invite')), t('family.games.lobby.invites_none')),
      ...(rest.length ? [section('gcard-mine', t('family.games.lobby.your_games'), 0, rest.map((c) => roomRow(c, 'mine')), '')] : []),
      section('gcard-open', t('family.games.lobby.open_rooms'), (d.open || []).length, (d.open || []).map((c) => roomRow(c, 'open')), t('family.games.lobby.open_none'))].filter(Boolean));
  }
  draw(data);
  // Keep "Your turn" fresh while the lobby is on screen (leisure games move while you're away).
  let seen = false;
  const refresh = async () => {
    if (root.isConnected) seen = true;
    else if (seen) { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); return; }
    if (document.hidden) return;
    try { draw(await games.rooms()); } catch { /* keep what we have */ }
  };
  const iv = setInterval(refresh, 20000);
  const onVis = () => { if (!document.hidden && root.isConnected) refresh(); };
  document.addEventListener('visibilitychange', onVis);
  if (!rulesSeen()) setTimeout(() => { if (root.isConnected) openRules(); }, 400);
  return root;
}

// ---- New game -----------------------------------------------------------------------------------
function stepper(i, n) {
  const kids = [];
  for (let k = 0; k < n; k++) {
    if (k) kids.push(h('i', { class: 'gstep-line' + (k <= i ? ' is-on' : '') }));
    kids.push(h('span', { class: 'gstep-dot' + (k < i ? ' is-done' : k === i ? ' is-on' : '') }, String(k + 1)));
  }
  return h('div', { class: 'gstep', role: 'img', 'aria-label': t('family.games.lobby.step_of', { n: i + 1, total: n }) }, kids);
}

function bigChoice({ title, desc, art, onclick, cls = '', badge = null }) {
  return h('button', { class: 'gchoice ' + cls, type: 'button', onclick },
    art ? h('span', { class: 'gchoice-art', 'aria-hidden': 'true' }, art) : null,
    h('span', { class: 'gchoice-text' },
      badge ? h('span', { class: 'gtag gtag-best', text: badge }) : null,
      h('span', { class: 'gchoice-title', text: title }), desc ? h('span', { class: 'gchoice-desc', text: desc }) : null),
    icon('next', 'icon gchoice-go'));
}

function modeArt(mode) {
  if (mode === 'together') return [dotArt({ c: 'r', n: 1 }, 's'), dotArt({ c: 'b', n: 2 }, 's'), dotArt({ c: 'g', n: 3 }, 's')];
  if (mode === 'live') return [dotArt({ c: 'p', n: 7 }, 's'), h('i', { class: 'gchoice-zap' }), dotArt({ c: 'r', n: 7 }, 's')];
  return [dotArt({ c: 'g', n: 9 }, 's'), h('i', { class: 'gchoice-moon' })];
}

function seg(label, options, value, onChange) {
  const wrap = h('div', { class: 'gopt' }, h('span', { class: 'gopt-label', text: label }));
  const row = h('div', { class: 'gseg', role: 'group', 'aria-label': label });
  for (const [v, text] of options) {
    row.append(h('button', { type: 'button', class: 'gseg-btn' + (v === value ? ' on' : ''), 'aria-pressed': String(v === value),
      onclick: () => { onChange(v); row.querySelectorAll('.gseg-btn').forEach((b, i) => { const on = options[i][0] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); } }, text));
  }
  wrap.append(row);
  return wrap;
}

export async function newGameView() {
  const s = { step: 0, mode: null, invite: new Set(), claude: null, simple_table: null, hints: true, turn_seconds: 0, leisure_hours: 24, stack_adj: 0, match_to: 0 };
  let people = null;
  let meNew = true;
  games.rooms().then((d) => { meNew = !!(d && d.me_new); }).catch(() => {});
  // Simple table is preselected while anyone in the room (you, or someone you invite) hasn't finished a game.
  const firstTimers = () => meNew || [...s.invite].some((id) => (people || []).some((p) => p.id === id && p.new));
  const simple = () => (s.simple_table === null ? firstTimers() : s.simple_table);
  const root = h('section', { class: 'page gnew' });
  const N = 4;

  const nav = (title) => [
    h('div', { class: 'gnew-top' },
      s.step ? h('button', { class: 'back gback', type: 'button', onclick: () => { s.step -= 1; draw(); } }, icon('back'), h('span', { text: t('family.games.common.back') }))
        : back('#/games', t('family.games.common.games')),
      stepper(s.step, N)),
    h('h1', { class: 'gnew-title', text: title }),
  ];

  async function create(btn) {
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      const settings = { simple_table: simple(), hints: s.hints, stack_adj: s.stack_adj, match_to: s.match_to };
      if (s.mode === 'leisure') settings.leisure_hours = s.leisure_hours;
      else settings.turn_seconds = s.turn_seconds;
      const card = await games.create(s.mode, settings);
      if (s.invite.size) await games.invite(card.id, [...s.invite]).catch((e) => toast(errText(e), 'error'));
      if (s.claude) await games.seats(card.id, { op: 'add_bot', level: s.claude }).catch((e) => toast(errText(e), 'error'));
      go('#/games/r/' + card.id);
    } catch (e) {
      toast(errText(e), 'error');
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }

  function draw() {
    if (s.step === 0) {
      root.replaceChildren(...nav(t('family.games.lobby.new_mode')),
        h('div', { class: 'gchoices' },
          ['together', 'live', 'leisure'].map((m) => bigChoice({
            cls: 'gchoice-' + m, art: modeArt(m),
            title: modeLabel(m),
            desc: { together: t('family.games.lobby.mode_together_desc'), live: t('family.games.lobby.mode_live_desc'), leisure: t('family.games.lobby.mode_leisure_desc') }[m],
            onclick: () => { s.mode = m; s.step = 1; draw(); },
          }))));
    } else if (s.step === 1) {
      const list = h('div', { class: 'gpeople' });
      const fill = () => {
        if (!people) { list.replaceChildren(h('p', { class: 'gcard-empty', text: t('family.games.common.loading') })); return; }
        const me = state.me && state.me.id;
        const folks = people.filter((p) => p.id !== me && !/^claude$/i.test(p.display_name || ''));
        if (!folks.length) { list.replaceChildren(h('p', { class: 'gcard-empty', text: t('family.games.lobby.people_none') })); return; }
        list.replaceChildren(...folks.map((p) => {
          const on = s.invite.has(p.id);
          return h('button', { type: 'button', class: 'gperson' + (on ? ' on' : ''), 'aria-pressed': String(on),
            onclick: () => { if (s.invite.has(p.id)) s.invite.delete(p.id); else s.invite.add(p.id); draw(); } },
          avatar(p, 'm'), h('span', { class: 'grow gperson-name', text: p.display_name }),
          h('span', { class: 'gcheck', 'aria-hidden': 'true' }, on ? '✓' : ''));
        }));
      };
      fill();
      if (!people) games.people().then((p) => { people = p || []; if (s.step === 1) draw(); }).catch(() => { people = []; if (s.step === 1) draw(); });
      const n = s.invite.size;
      root.replaceChildren(...nav(t('family.games.lobby.new_invite')),
        h('p', { class: 'lede', text: s.mode === 'together' ? t('family.games.lobby.invite_hint_together') : t('family.games.lobby.invite_hint') }),
        list,
        h('div', { class: 'gnew-foot' },
          h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => { s.step = 2; draw(); } },
            n ? (n === 1 ? t('family.games.lobby.next_invite.one') : t('family.games.lobby.next_invite.other', { n })) : t('family.games.lobby.next_skip'))));
    } else if (s.step === 2) {
      const claudeArt = () => h('img', { class: 'avatar avatar-m avatar-claude', src: 'claude-avatar.svg', alt: '' });
      root.replaceChildren(...nav(t('family.games.lobby.new_claude')),
        h('div', { class: 'gchoices' },
          bigChoice({ cls: 'gchoice-claude gchoice-best', art: claudeArt(), title: t('family.games.common.claude_easy'), badge: t('family.games.lobby.recommended'), desc: t('family.games.lobby.claude_easy_desc'), onclick: () => { s.claude = 'easy'; s.step = 3; draw(); } }),
          bigChoice({ cls: 'gchoice-claude', art: claudeArt(), title: t('family.games.common.claude_sharp'), desc: t('family.games.lobby.claude_sharp_desc'), onclick: () => { s.claude = 'sharp'; s.step = 3; draw(); } }),
          bigChoice({ cls: 'gchoice-none', title: t('family.games.lobby.claude_none'), desc: t('family.games.lobby.claude_none_desc'), onclick: () => { s.claude = null; s.step = 3; draw(); } })));
    } else {
      const opts = h('details', { class: 'gopts', open: s.optsOpen || null, ontoggle: (e) => { s.optsOpen = e.target.open; } },
        h('summary', { class: 'gopts-sum' }, h('span', { text: t('family.games.lobby.options') }), h('span', { class: 'gopts-hint', text: t('family.games.lobby.options_hint') })),
        h('div', { class: 'gopts-body' },
          seg(t('family.games.lobby.opt_table'), [[true, t('family.games.lobby.opt_table_simple')], [false, t('family.games.lobby.opt_table_free')]], simple(), (v) => { s.simple_table = v; draw(); }),
          seg(t('family.games.lobby.opt_hints'), [[true, t('family.games.lobby.hints_on')], [false, t('family.games.lobby.hints_off')]], s.hints, (v) => { s.hints = v; draw(); }),
          s.mode === 'leisure'
            ? seg(t('family.games.lobby.opt_leisure'), [[4, t('family.games.lobby.hours_4')], [12, t('family.games.lobby.hours_12')], [24, t('family.games.lobby.hours_24')], [48, t('family.games.lobby.hours_48')]], s.leisure_hours, (v) => { s.leisure_hours = v; })
            : seg(t('family.games.lobby.opt_timer'), [[0, t('family.games.lobby.timer_off')], [60, t('family.games.lobby.timer_60')], [90, t('family.games.lobby.timer_90')]], s.turn_seconds, (v) => { s.turn_seconds = v; }),
          seg(t('family.games.lobby.opt_stack'), [[-2, t('family.games.lobby.stack_short')], [0, t('family.games.lobby.stack_normal')], [2, t('family.games.lobby.stack_long')]], s.stack_adj, (v) => { s.stack_adj = v; }),
          seg(t('family.games.lobby.opt_length'), [[0, t('family.games.lobby.length_one')], [100, t('family.games.lobby.length_match')]], s.match_to, (v) => { s.match_to = v; })));
      const go3 = h('button', { class: 'btn btn-primary btn-big gnew-create', type: 'button' }, t('family.games.lobby.create'));
      go3.addEventListener('click', () => create(go3));
      const n = s.invite.size;
      root.replaceChildren(...nav(t('family.games.lobby.new_ready')),
        h('ul', { class: 'gsummary' },
          h('li', null, h('span', { class: 'gsummary-k', text: t('family.games.lobby.sum_mode') }), h('span', { text: modeLabel(s.mode) })),
          h('li', null, h('span', { class: 'gsummary-k', text: t('family.games.lobby.sum_invited') }),
            h('span', { text: n ? (n === 1 ? t('family.games.lobby.sum_people.one') : t('family.games.lobby.sum_people.other', { n })) : t('family.games.lobby.sum_nobody') })),
          h('li', null, h('span', { class: 'gsummary-k', text: t('family.games.lobby.sum_claude') }),
            h('span', { text: s.claude === 'easy' ? t('family.games.common.claude_easy') : s.claude === 'sharp' ? t('family.games.common.claude_sharp') : t('family.games.lobby.claude_none') })),
          h('li', null, h('span', { class: 'gsummary-k', text: t('family.games.lobby.opt_table') }),
            h('span', { text: simple() ? t('family.games.lobby.opt_table_simple') : t('family.games.lobby.opt_table_free') })),
          h('li', null, h('span', { class: 'gsummary-k', text: t('family.games.lobby.opt_hints') }),
            h('span', { text: s.hints ? t('family.games.lobby.hints_on') : t('family.games.lobby.hints_off') }))),
        opts,
        h('div', { class: 'gnew-foot' }, go3));
    }
    if (!s.optsOpen) window.scrollTo(0, 0);
  }
  draw();
  return root;
}

// ---- Join with a code ---------------------------------------------------------------------------
export async function joinView(prefill) {
  const boxes = [];
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const joinBtn = h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: true }, t('family.games.lobby.join_play'));
  const watchBtn = h('button', { class: 'btn btn-quiet btn-big', type: 'button', disabled: true }, t('family.games.lobby.join_watch'));
  const code = () => boxes.map((b) => b.value).join('');
  const sync = () => { const ok = code().length === 4; joinBtn.disabled = !ok; watchBtn.disabled = !ok; };
  const clean = (v) => v.toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('');

  for (let i = 0; i < 4; i++) {
    const b = h('input', { class: 'gbox', type: 'text', inputmode: 'text', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', enterkeyhint: i === 3 ? 'go' : 'next', 'aria-label': t('family.games.lobby.box_n', { n: i + 1 }) });
    b.addEventListener('input', () => {
      const raw = b.value;
      const v = clean(raw);
      msg.textContent = raw && !v ? t('family.games.lobby.code_chars') : '';
      if (v.length > 1) { // pasted or typed fast: spread across the boxes
        for (let k = 0; k < v.length && i + k < 4; k++) boxes[i + k].value = v[k];
        boxes[Math.min(3, i + v.length)].focus();
      } else {
        b.value = v;
        if (v && i < 3) boxes[i + 1].focus();
      }
      b.classList.toggle('filled', !!b.value);
      boxes.forEach((x) => x.classList.toggle('filled', !!x.value));
      sync();
    });
    b.addEventListener('keydown', (ev) => {
      if (ev.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); boxes[i - 1].focus(); sync(); ev.preventDefault(); }
      if (ev.key === 'Enter' && code().length === 4) join('player');
    });
    b.addEventListener('focus', () => b.select());
    boxes.push(b);
  }
  if (prefill) { clean(prefill).slice(0, 4).split('').forEach((c, k) => { boxes[k].value = c; boxes[k].classList.add('filled'); }); sync(); }

  async function join(as) {
    if (code().length !== 4) return;
    joinBtn.disabled = true; watchBtn.disabled = true;
    msg.textContent = '';
    try {
      const r = await games.join(code(), as);
      go('#/games/r/' + r.room_id);
    } catch (e) {
      msg.textContent = e && e.code === 'not_found' ? t('family.games.lobby.code_unknown') : errText(e);
      boxRow.classList.remove('is-wrong'); void boxRow.offsetWidth; boxRow.classList.add('is-wrong');
      sync();
    }
  }
  joinBtn.addEventListener('click', () => join('player'));
  watchBtn.addEventListener('click', () => join('spectator'));
  const boxRow = h('div', { class: 'gboxes' }, boxes);
  const root = h('section', { class: 'page gjoin' },
    back('#/games', t('family.games.common.games')),
    head(t('family.games.lobby.join_title'), t('family.games.lobby.join_lede'), false),
    boxRow, msg,
    h('div', { class: 'gjoin-actions' }, joinBtn, watchBtn));
  setTimeout(() => { const first = boxes.find((b) => !b.value) || boxes[3]; first.focus({ preventScroll: true }); }, 60);
  return root;
}

// ---- the waiting room -----------------------------------------------------------------------------
export function mySeat(view) {
  if (view.me && typeof view.me.seat === 'number') return view.me.seat;
  const me = state.me;
  if (!me) return null;
  const st = (view.seats || []).find((s) => !s.bot && (s.member_id === me.id || (s.member_id === undefined && s.name === me.display_name)));
  return st ? st.seat : null;
}

export function roomLobbyView(ctx) {
  const el = h('section', { class: 'page gwait' });
  let busy = false;
  let picking = false;
  let seatsSeen = (ctx.getView().seats || []).length;
  const popped = new Set();   // seats already drawn: only a newcomer pops in, not every row on every update

  async function op(fn, after) {
    if (busy) return;
    busy = true; draw();
    try { await fn(); ctx.refresh && ctx.refresh(); if (after) after(); } catch (e) { toast(errText(e), 'error'); }
    busy = false; draw();
  }

  function draw() {
    const view = ctx.getView();
    const room = view.room;
    const seats = view.seats || [];
    const me = state.me || {};
    const isHost = room.host === me.id;
    const mine = mySeat(view);
    const hostSeat = seats.find((s) => s.seat === room.host_seat);
    const humans = seats.filter((s) => !s.bot).length;
    const canStart = seats.length >= 2;
    if (seats.length > seatsSeen) { try { ctx.sfx && ctx.sfx.play('join'); } catch { /* no sound */ } }
    seatsSeen = seats.length;

    const seatRows = seats.map((st) => h('li', { class: 'gwait-seat' + (st.seat === mine ? ' is-me' : '') + (popped.has(st.seat + ':' + st.name) ? '' : ' is-new') },
      seatAvatar(st, 'l'),
      h('span', { class: 'grow gwait-name' },
        h('span', { text: st.seat === mine ? t('family.games.lobby.you_name', { name: st.name }) : st.name }),
        h('span', { class: 'gwait-badges' },
          st.seat === room.host_seat ? h('span', { class: 'gtag gtag-host', text: t('family.games.lobby.host') }) : null,
          st.bot ? h('span', { class: 'gtag gtag-bot', text: st.bot_level === 'easy' ? t('family.games.common.claude_easy') : t('family.games.common.claude_sharp') }) : null)),
      isHost && st.seat !== mine ? h('button', { class: 'gwait-x', type: 'button', disabled: busy, 'aria-label': t('family.games.lobby.remove', { name: st.name }),
        onclick: () => op(() => games.seats(room.id, st.bot ? { op: 'remove_bot', seat: st.seat } : { op: 'kick', seat: st.seat })) }, '×') : null));

    // Add Claude: an extra "seat" row under the players (host only).
    let adder = null;
    if (isHost) {
      adder = picking
        ? h('div', { class: 'gwait-pick' },
          h('p', { class: 'gwait-pick-q', text: t('family.games.lobby.which_claude') }),
          h('div', { class: 'gwait-pick-row' },
            h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: busy, onclick: () => op(() => games.seats(room.id, { op: 'add_bot', level: 'easy' }), () => { picking = false; }) }, t('family.games.common.claude_easy')),
            h('button', { class: 'btn btn-quiet btn-big', type: 'button', disabled: busy, onclick: () => op(() => games.seats(room.id, { op: 'add_bot', level: 'sharp' }), () => { picking = false; }) }, t('family.games.common.claude_sharp'))))
        : h('button', { class: 'gwait-claude', type: 'button', disabled: busy, onclick: () => { picking = true; draw(); } },
          h('img', { class: 'avatar avatar-l avatar-claude', src: 'claude-avatar.svg', alt: '' }), h('span', { class: 'grow', text: t('family.games.lobby.add_claude') }), h('span', { class: 'gwait-plus', 'aria-hidden': 'true', text: '+' }));
    }

    // The room's options in plain words; the host can still flip Simple table and Hints here.
    const st0 = room.settings || {};
    const newbies = seats.filter((x) => !x.bot && x.first_game).map((x) => (x.seat === mine ? t('family.games.lobby.you') : x.name));
    const setOpt = (k, v) => op(() => games.options(room.id, { [k]: v }));
    const options = h('section', { class: 'gwait-opts' },
      h('h2', { class: 'gwait-h2' }, h('span', { text: t('family.games.lobby.options_on') })),
      optionTags(st0),
      isHost ? h('div', { class: 'gwait-opts-edit' },
        seg(t('family.games.lobby.opt_table'), [[true, t('family.games.lobby.opt_table_simple')], [false, t('family.games.lobby.opt_table_free')]], !!st0.simple_table, (v) => setOpt('simple_table', v)),
        seg(t('family.games.lobby.opt_hints'), [[true, t('family.games.lobby.hints_on')], [false, t('family.games.lobby.hints_off')]], st0.hints !== false, (v) => setOpt('hints', v))) : null,
      newbies.length && !st0.simple_table ? h('p', { class: 'gwait-hint gwait-newbie', text: t('family.games.lobby.first_game_note', { names: newbies.join(', ') }) }) : null);

    // The sticky footer: Start (host), Sit down (watcher), or "waiting for the host".
    const foot = [];
    if (isHost) {
      foot.push(h('button', { class: 'btn btn-primary btn-big gwait-start', type: 'button', disabled: busy || !canStart,
        onclick: () => op(() => games.start(room.id)) }, t('family.games.lobby.start')));
      if (!canStart) foot.push(h('p', { class: 'gwait-hint', text: t('family.games.lobby.need_two') }));
    } else if (mine == null) {
      foot.push(h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: busy, onclick: () => op(() => games.seats(room.id, { op: 'sit' })) }, t('family.games.lobby.sit')));
      foot.push(h('p', { class: 'gwait-hint', text: t('family.games.lobby.watching') }));
    } else {
      foot.push(h('p', { class: 'gwait-waiting' }, h('span', { text: t('family.games.lobby.waiting_host', { name: hostSeat ? hostSeat.name : '' }) }),
        h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))));
    }

    el.replaceChildren(...[   // (replaceChildren would print a null as the text "null")
      h('div', { class: 'gwait-top' },
        h('span', { class: 'gtag gtag-mode gtag-' + room.mode, text: modeLabel(room.mode) }),
        h('a', { class: 'gwait-tv', href: '#/games/tv/' + room.id }, t('family.games.lobby.show_tv'))),
      h('h1', { class: 'gwait-title', text: t('family.games.lobby.wait_title') }),
      h('div', { class: 'gwait-code' },
        h('p', { class: 'gwait-code-k', text: t('family.games.lobby.code_label') }),
        h('div', { class: 'gcode gcode-xl', role: 'img', 'aria-label': t('family.games.common.code_aria', { code: room.code.split('').join(' ') }) },
          room.code.split('').map((c) => h('span', { class: 'gcode-ch', text: c }))),
        h('p', { class: 'gwait-code-hint', text: t('family.games.lobby.code_hint') })),
      h('h2', { class: 'gwait-h2' }, h('span', { text: t('family.games.lobby.players') }), h('span', { class: 'gcount', text: String(seats.length) })),
      h('ul', { class: 'gwait-seats' }, seatRows),
      adder,
      options,
      humans < 2 && !seats.some((s) => s.bot) ? h('p', { class: 'gwait-hint gwait-alone', text: t('family.games.lobby.alone') }) : null,
      mine != null && !isHost ? h('button', { class: 'btn btn-quiet gwait-leave', type: 'button', disabled: busy, onclick: () => op(() => games.seats(room.id, { op: 'leave' })) }, t('family.games.lobby.leave')) : null,
      h('div', { class: 'gwait-foot' }, foot)].filter(Boolean));
    for (const st of seats) popped.add(st.seat + ':' + st.name);
  }
  draw();
  return { el, update: draw };
}
