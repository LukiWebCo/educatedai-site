// The Games hub (#/games) and each game's own home: Dots & Lines (#/games/dots) and Conquián (#/games/conquian).
// The hub shows both games as big tiles, then your games across both (each card tagged with its game), invites,
// and Join with a code. A game's home has its own look, its "Start here", New game (straight to that game's
// options) and only that game's rooms. One GET /api/games/rooms feeds all three; every card carries `game`.
import { ago, avatar, h, icon } from '../dom.js';
import { currentLang, t } from '../i18n.js';
import { errText, go, toast } from '../ui.js';
import { games } from './net.js';
import { gameName, optionTags } from './lobby.js';
import { openRules, rulesButton, rulesSeen } from './rules_card.js';
import { modeLabel, wordmark } from './tv.js';

const gameOf = (card) => (card && card.game === 'conquian' ? 'conquian' : 'dots');

async function startPractice(btn, game) {
  btn.disabled = true;
  try {
    const r = await games.practice(game);
    go('#/games/r/' + r.room_id);
  } catch (e) { toast(errText(e), 'error'); btn.disabled = false; }
}

// ---- room cards -------------------------------------------------------------------------------------
function roomRow(card, kind, withGame) {
  const names = card.seats.map((s) => s.name);
  const game = gameOf(card);
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
      withGame ? h('span', { class: 'gtag gtag-game gtag-game-' + game, text: gameName(game) }) : null,
      h('span', { class: 'groom-title', text: names.length ? names.join(', ') : card.host_name }),
      h('span', { class: 'groom-sub' },
        h('span', { class: 'gtag gtag-mode gtag-' + card.mode, text: modeLabel(card.mode) }),
        h('span', { class: 'groom-status' + (card.my_turn ? ' is-turn' : ''), text: status }),
        card.updated_at ? h('span', { class: 'groom-ago', text: ago(card.updated_at, currentLang()) }) : null),
      optionTags(card.settings, game)),
  ];
  const cls = 'groom groom-' + game;
  if (go2) return h('a', { class: cls + (card.my_turn ? ' is-turn' : ''), href: go2, 'data-game': game }, inner, icon('next', 'icon groom-go'));
  const joinBtn = h('button', { class: 'btn btn-primary groom-join', type: 'button' }, kind === 'invite' ? t('family.games.lobby.accept') : t('family.games.lobby.join_btn'));
  joinBtn.addEventListener('click', async () => {
    joinBtn.disabled = true;
    try {
      const r = await games.join(card.code, 'player');
      go('#/games/r/' + r.room_id);
    } catch (e) { toast(errText(e), 'error'); joinBtn.disabled = false; }
  });
  return h('div', { class: cls, 'data-game': game }, inner, joinBtn);
}

function section(cls, title, count, rows, emptyText) {
  return h('section', { class: 'gcard ' + cls },
    h('h2', { class: 'gcard-title' }, h('span', { text: title }), count ? h('span', { class: 'gcount', text: String(count) }) : null),
    rows.length ? h('div', { class: 'groom-list' }, rows) : h('p', { class: 'gcard-empty', text: emptyText }));
}

// Your turn / Invites / Your games / Open games, for the rooms given (all of them on the hub, one game's on its page).
function roomSections(d, { withGame = false, keep = () => true, openAlways = true } = {}) {
  const mine = (d.mine || []).filter(keep);
  const invites = (d.invites || []).filter(keep);
  const open = (d.open || []).filter(keep);
  const turn = mine.filter((c) => c.my_turn);
  const rest = mine.filter((c) => !c.my_turn);
  return [
    section('gcard-turn' + (turn.length ? ' is-hot' : ''), turn.length ? t('family.games.lobby.your_turn_n', { n: turn.length }) : t('family.games.lobby.your_turn'), 0,
      turn.map((c) => roomRow(c, 'mine', withGame)), t('family.games.lobby.your_turn_none')),
    section('gcard-invites', t('family.games.lobby.invites'), invites.length, invites.map((c) => roomRow(c, 'invite', withGame)), t('family.games.lobby.invites_none')),
    rest.length ? section('gcard-mine', t('family.games.lobby.your_games'), 0, rest.map((c) => roomRow(c, 'mine', withGame)), '') : null,
    open.length || openAlways ? section('gcard-open', t('family.games.lobby.open_rooms'), open.length, open.map((c) => roomRow(c, 'open', withGame)), t('family.games.lobby.open_none')) : null,
  ];
}

// Redraw from /rooms every 20 s while on screen (leisure games move while you're away), and when the tab comes back.
async function liveList(root, draw) {
  draw(await games.rooms());
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
}

const fill = (root, kids) => root.replaceChildren(...kids.filter(Boolean));   // (a null would print as "null")

function backToHub() {
  return h('a', { class: 'back gback ghome-back', href: '#/games' }, icon('back'), h('span', { text: t('family.games.common.games') }));
}

// ---- art --------------------------------------------------------------------------------------------
async function cqCards() {
  const m = await import('./conquian/cards.js');
  await m.probeArt();
  return m;
}

function cardFan(cards, faces, size, cls) {
  return h('span', { class: 'gfan ' + cls, 'aria-hidden': 'true' },
    faces.map((f, i) => {
      const n = cards.cardNode({ s: f[0], r: Number(f.slice(1)) }, { size, label: '' });
      n.style.setProperty('--i', String(i - (faces.length - 1) / 2));
      return n;
    }));
}

// ---- #/games: the hub -------------------------------------------------------------------------------
function tile(game, d, art, title) {
  const n = (d.mine || []).filter((c) => gameOf(c) === game && c.my_turn).length;
  return h('a', { class: 'ghub-tile ghub-tile-' + game, href: '#/games/' + game, 'data-game': game },
    h('span', { class: 'ghub-tile-text' },
      title,
      h('span', { class: 'ghub-tile-desc', text: game === 'conquian' ? t('family.games.cq.lobby.cq_desc') : t('family.games.cq.lobby.dots_desc') }),
      h('span', { class: 'ghub-tile-foot' },
        n ? h('span', { class: 'ghub-badge' }, h('i', { class: 'ghub-badge-dot', 'aria-hidden': 'true' }),
          h('span', { text: n === 1 ? t('family.games.hub.turn_in.one') : t('family.games.hub.turn_in.other', { n }) })) : h('span'),
        icon('next', 'icon ghub-tile-go'))),
    h('span', { class: 'ghub-tile-art', 'aria-hidden': 'true' }, art));
}

export async function hubView() {
  const cards = await cqCards();
  const root = h('section', { class: 'page ghub' });
  const dotsTitle = () => h('span', { class: 'ghub-tile-name ghub-tile-name-dots' },
    h('span', { class: 'sr-only', text: t('family.games.common.game_name') }), wordmark('ghub-wm'));
  const cqTitle = () => h('span', { class: 'ghub-tile-name ghub-tile-name-cq' }, cards.logo('ghub-cq-logo'));
  function draw(d) {
    fill(root, [
      h('header', { class: 'ghead ghub-head' },
        h('h1', { class: 'ghead-title ghub-title', text: t('family.games.lobby.eyebrow') }),
        h('p', { class: 'lede ghead-lede', text: t('family.games.hub.lede') })),
      h('nav', { class: 'ghub-tiles', 'aria-label': t('family.games.hub.pick') },
        tile('dots', d, h('img', { class: 'ghub-dots-art', src: 'games-assets/logo-mark.svg', alt: '' }), dotsTitle()),
        tile('conquian', d, cardFan(cards, ['o1', 'c12', 'e7'], 's', 'ghub-fan'), cqTitle())),
      h('a', { class: 'btn btn-quiet btn-big ghub-join', href: '#/games/join' }, h('span', { text: t('family.games.hub.join') })),
      ...roomSections(d, { withGame: true, openAlways: false }),
    ]);
  }
  await liveList(root, draw);
  return root;
}

// ---- #/games/dots -----------------------------------------------------------------------------------
// Practice with Claude: up top and loud for someone who hasn't finished a game yet, a quiet row after that.
function dotsPractice(first) {
  const btn = h('button', { class: 'btn btn-big ' + (first ? 'btn-primary' : 'btn-quiet') + ' gpractice-btn', type: 'button' },
    h('span', { text: t('family.games.lobby.practice') }));
  btn.addEventListener('click', () => startPractice(btn));
  return h('section', { class: 'gpractice' + (first ? ' is-first' : '') },
    first ? h('p', { class: 'gpractice-k', text: t('family.games.lobby.practice_new') }) : null,
    btn,
    h('p', { class: 'gpractice-sub', text: t('family.games.lobby.practice_sub') }));
}

export async function dotsView() {
  const root = h('section', { class: 'page globby ghome ghome-dots' });
  function draw(d) {
    fill(root, [
      h('header', { class: 'ghead globby-head' },
        h('div', { class: 'ghead-row' }, h('div', { class: 'grow' }, backToHub()), rulesButton()),
        h('h1', { class: 'sr-only', text: t('family.games.common.game_name') }),
        wordmark('globby-wm'),
        h('p', { class: 'lede ghead-lede', text: t('family.games.lobby.tagline') })),
      d.me_new ? dotsPractice(true) : null,
      h('div', { class: 'ghero' },
        h('a', { class: 'btn btn-primary btn-big ghero-new', href: '#/games/new?game=dots' }, icon('plus'), h('span', { text: t('family.games.lobby.new_game') })),
        h('a', { class: 'btn btn-quiet btn-big ghero-join', href: '#/games/join?game=dots' }, h('span', { text: t('family.games.lobby.join_code') }))),
      d.me_new ? null : dotsPractice(false),
      ...roomSections(d, { keep: (c) => gameOf(c) === 'dots' }),
    ]);
  }
  await liveList(root, draw);
  if (!rulesSeen()) setTimeout(() => { if (root.isConnected) openRules(); }, 400);
  return root;
}

// ---- #/games/conquian -------------------------------------------------------------------------------
function cqStart(first) {
  const btn = h('button', { class: 'btn btn-big ' + (first ? 'btn-primary' : 'btn-quiet') + ' gpractice-btn gpractice-cq', type: 'button' },
    h('span', { text: t('family.games.cq.lobby.practice') }));
  btn.addEventListener('click', () => startPractice(btn, 'conquian'));
  const rules = h('button', { class: 'btn btn-big btn-quiet gpractice-rules', type: 'button', onclick: () => openRules('conquian') },
    h('span', { class: 'grules-q', 'aria-hidden': 'true', text: '?' }), h('span', { text: t('family.games.cq.lobby.how') }));
  return h('section', { class: 'gpractice gcq-start' + (first ? ' is-first' : '') },
    first ? h('p', { class: 'gpractice-k', text: t('family.games.cq.lobby.start_here') }) : null,
    btn,
    h('p', { class: 'gpractice-sub', text: t('family.games.cq.lobby.practice_sub') }),
    rules);
}

// The two big ways in (owner, for the 70s-and-up players): Play with Claude starts a classic hand at once; Play with
// family opens a room with good defaults and lands on the waiting room (big code, invite people). Everything else is
// under More options, where the step-by-step New game lives.
const CQ_DEFAULTS = { match_to: 0, forcing: false, cambio: false, hints: true, turn_seconds: 0 };

async function quickCq(btns, withClaude) {
  btns.forEach((b) => { b.disabled = true; });
  try {
    // with Claude: Classic (exactly 2). With family: no variant yet (Classic for 2, Familia for 3-4, at the start).
    const card = await games.create('together', { ...CQ_DEFAULTS, variant: withClaude ? 'classic' : null }, 'conquian');
    if (withClaude) {
      await games.seats(card.id, { op: 'add_bot', level: 'easy' });
      await games.start(card.id).catch((e) => toast(errText(e), 'error'));
    }
    go('#/games/r/' + card.id);
  } catch (e) {
    toast(errText(e), 'error');
    btns.forEach((b) => { b.disabled = false; });
  }
}

function cqQuick() {
  const claude = h('button', { class: 'btn btn-primary btn-big gquick-btn gquick-claude', type: 'button' },
    h('img', { class: 'avatar avatar-m avatar-claude', src: 'claude-avatar.svg', alt: '' }), h('span', { text: t('family.games.cq.lobby.play_claude') }));
  const family = h('button', { class: 'btn btn-quiet btn-big gquick-btn gquick-family', type: 'button' },
    icon('user'), h('span', { text: t('family.games.cq.lobby.play_family') }));
  const btns = [claude, family];
  claude.addEventListener('click', () => quickCq(btns, true));
  family.addEventListener('click', () => quickCq(btns, false));
  return h('section', { class: 'gquick' },
    claude, h('p', { class: 'gpractice-sub', text: t('family.games.cq.lobby.play_claude_sub') }),
    family, h('p', { class: 'gpractice-sub', text: t('family.games.cq.lobby.play_family_sub') }));
}

function cqMore() {
  return h('details', { class: 'gopts gcq-more' },
    h('summary', { class: 'gopts-sum' }, h('span', { text: t('family.games.lobby.options') }), h('span', { class: 'gopts-hint', text: t('family.games.cq.lobby.more_hint') })),
    h('div', { class: 'gopts-body' },
      h('a', { class: 'btn btn-quiet btn-big gcq-wizard', href: '#/games/new?game=conquian' }, h('span', { text: t('family.games.cq.lobby.wizard') }))));
}

export async function cqView() {
  const cards = await cqCards();
  const root = h('section', { class: 'page ghome ghome-cq' });
  const hero = h('header', { class: 'gcq-hero cq-felt' + (cards.hasArt() ? ' cq-art-on' : '') },
    h('h1', { class: 'sr-only', text: t('family.games.cq.name') }),
    h('div', { class: 'gcq-hero-logo', 'aria-hidden': 'true' }, cards.logo('gcq-logo')),
    cardFan(cards, ['o1', 'c12', 'e7', 'b5'], 'l', 'gcq-fan'),
    h('p', { class: 'gcq-tagline', text: t('family.games.cq.lobby.tagline') }));
  // made once, so a refresh of the room list never closes More options or drops a tap in flight
  const quick = cqQuick();
  const join = h('a', { class: 'btn btn-quiet btn-big ghero-join', href: '#/games/join?game=conquian' }, h('span', { text: t('family.games.lobby.join_code') }));
  const more = cqMore();
  let start = null;
  let startFirst = null;
  function draw(d) {
    const first = !(d.mine || []).some((c) => gameOf(c) === 'conquian');
    if (startFirst !== first) { start = cqStart(first); startFirst = first; }
    fill(root, [
      h('div', { class: 'ghead-row ghome-top' }, h('div', { class: 'grow' }, backToHub())),
      hero,
      first ? start : null,
      quick,
      join,
      more,
      first ? null : start,
      ...roomSections(d, { keep: (c) => gameOf(c) === 'conquian' }),
    ]);
  }
  await liveList(root, draw);
  return root;
}
