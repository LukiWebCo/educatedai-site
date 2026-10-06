// Dots & Lines sound + haptics (W5). Sounds are ours: synthesized by tools/games_assets.py, CC0.
//
//   import { createSfx } from './sfx.js';
//   const sfx = createSfx({ screen: 'phone' });   // or { screen: 'tv' }
//   sfx.play('snap');  sfx.setMuted(true);  sfx.muted;  sfx.music(true);
//
// Names: place snap invalid flip clear your_turn win (play screen) · bell trade tick join (Market, lobby, TV).
//
// Defaults (contracts/games-art.md, "Sound"):
// - Phone, no stored choice: QUIET. Only the "your turn" chime sounds (plus haptics), so a room of 12 phones isn't
//   a slot machine. `muted` reads true. setMuted(false) turns every sound on; setMuted(true) silences everything.
// - TV, no stored choice: ON. The TV is the table's speaker: the bell, the ticks, the win.
// - The choice is stored per screen kind: localStorage 'eai.games.muted' (phones) / 'eai.games.muted.tv' (TV),
//   '1' = muted, '0' = sound on.
// Web Audio first (fetch + decodeAudioData: covered by connect-src 'self'); if that fails, an HTMLAudio element on a
// blob: URL (CSP media-src allows blob:). Audio unlocks on the first tap/key (iOS needs a gesture). Every call is a
// no-op when anything is missing: no AudioContext, no network, no localStorage, no vibrate.

const BASE = new URL('../../games-assets/', import.meta.url);
export const SOUNDS = ['place', 'snap', 'invalid', 'flip', 'clear', 'your_turn', 'win', 'bell', 'trade', 'tick', 'join'];
const QUIET_OK = new Set(['your_turn']);
// haptic patterns (ms); phones only
const BUZZ = { your_turn: [30, 60, 30], bell: [60, 40, 60], invalid: [24], snap: [8], place: [6], trade: [14, 30, 14],
  win: [40, 30, 40, 30, 120], clear: [12, 20, 12] };
const MIN_GAP_MS = 60; // the same sound at most this often
const MASTER = 0.9;
const MUSIC_GAIN = 0.55;

function store(key, v) {
  try {
    if (v === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, v);
  } catch { /* private mode, blocked storage */ }
  return null;
}

export function createSfx({ screen = 'phone', base = BASE } = {}) {
  const tv = screen === 'tv';
  const key = tv ? 'eai.games.muted.tv' : 'eai.games.muted';
  const saved = store(key);
  // mode: 'on' | 'quiet' | 'off'
  let mode = saved === '1' ? 'off' : saved === '0' ? 'on' : (tv ? 'on' : 'quiet');
  let ctx = null;
  let master = null;
  let unlocked = false;
  let webAudioOk = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  const buffers = new Map(); // name -> Promise<AudioBuffer|null>
  const blobs = new Map(); // name -> Promise<string|null> (object URL, fallback path)
  const last = new Map();
  let musicNode = null;
  let musicGain = null;
  let musicWanted = false;

  function url(rel) { return new URL(rel, base).href; }

  function ensureCtx() {
    if (ctx || !webAudioOk) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    } catch { webAudioOk = false; ctx = null; }
    return ctx;
  }

  function decode(ab) {
    return new Promise((resolve) => {
      try {
        const p = ctx.decodeAudioData(ab, resolve, () => resolve(null)); // callback form for old Safari
        if (p && p.then) p.then(resolve, () => resolve(null));
      } catch { resolve(null); }
    });
  }

  function load(name, rel) {
    if (!buffers.has(name)) {
      buffers.set(name, (async () => {
        if (!ensureCtx()) return null;
        try {
          const r = await fetch(url(rel), { credentials: 'same-origin' });
          if (!r.ok) return null;
          return await decode(await r.arrayBuffer());
        } catch { return null; }
      })());
    }
    return buffers.get(name);
  }

  function blobUrl(name) {
    if (!blobs.has(name)) {
      blobs.set(name, (async () => {
        try {
          const r = await fetch(url(`sfx/${name}.mp3`), { credentials: 'same-origin' });
          if (!r.ok) return null;
          return URL.createObjectURL(await r.blob());
        } catch { return null; }
      })());
    }
    return blobs.get(name);
  }

  async function playFallback(name) {
    const u = await blobUrl(name);
    if (!u) return;
    try {
      const a = new Audio(u);
      a.volume = MASTER;
      await a.play();
    } catch { /* autoplay refused or no audio: stay quiet */ }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const c = ensureCtx();
    if (c) {
      try {
        if (c.state === 'suspended') c.resume();
        const b = c.createBuffer(1, 1, 22050); // a silent sample: iOS opens the audio route on a gesture
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start(0);
      } catch { /* ignore */ }
    }
    if (mode !== 'off') preload();
    if (musicWanted) startMusic();
  }

  function preload() {
    const names = mode === 'quiet' ? ['your_turn'] : SOUNDS;
    for (const n of names) load(n, `sfx/${n}.mp3`);
  }

  function onGesture() {
    unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(ev, onGesture, true);
  }
  if (typeof document !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, onGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      try { document.hidden ? ctx.suspend() : (unlocked && ctx.resume()); } catch { /* ignore */ }
    });
  }

  function buzz(name) {
    if (tv || mode === 'off' || !BUZZ[name]) return;
    try { if (navigator.vibrate) navigator.vibrate(BUZZ[name]); } catch { /* ignore */ }
  }

  async function play(name) {
    if (!SOUNDS.includes(name)) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - (last.get(name) || -1e9) < MIN_GAP_MS) return;
    last.set(name, now);
    buzz(name);
    if (mode === 'off' || (mode === 'quiet' && !QUIET_OK.has(name))) return;
    if (!unlocked) return; // browsers would refuse anyway; haptics already fired
    const c = ensureCtx();
    if (c) {
      const b = await load(name, `sfx/${name}.mp3`);
      if (b) {
        try {
          if (c.state === 'suspended') await c.resume();
          const s = c.createBufferSource();
          s.buffer = b;
          s.connect(master);
          s.start();
          return;
        } catch { /* fall through */ }
      }
    }
    playFallback(name);
  }

  async function startMusic() {
    if (musicNode || mode !== 'on' || !unlocked) return;
    const c = ensureCtx();
    if (!c) return;
    let info = { file: 'music/loop.mp3', loop_seconds: 0, encoder_delay_samples: 1105, sample_rate: 44100 };
    try {
      const r = await fetch(url('sounds.json'));
      if (r.ok) { const j = await r.json(); info = { ...info, ...j.music, sample_rate: j.sample_rate }; }
    } catch { /* defaults */ }
    const b = await load('music', info.file);
    if (!b || !musicWanted || musicNode || mode !== 'on') return;
    const s = c.createBufferSource();
    s.buffer = b;
    s.loop = true;
    const L = info.loop_seconds;
    // Decoders differ: some strip the MP3 encoder delay/padding (duration == loop), some don't (skip the delay).
    if (L > 0 && Math.abs(b.duration - L) > 0.01) {
      s.loopStart = info.encoder_delay_samples / info.sample_rate;
      s.loopEnd = s.loopStart + L;
    } else if (L > 0) {
      s.loopStart = 0;
      s.loopEnd = L;
    }
    musicGain = c.createGain();
    musicGain.gain.setValueAtTime(0, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(MUSIC_GAIN, c.currentTime + 1.5);
    s.connect(musicGain);
    musicGain.connect(master);
    s.start(0, s.loopStart || 0);
    musicNode = s;
  }

  function stopMusic() {
    if (!musicNode || !ctx) { musicNode = null; return; }
    const s = musicNode;
    const g = musicGain;
    musicNode = null;
    try {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      s.stop(ctx.currentTime + 0.65);
    } catch { /* ignore */ }
  }

  return {
    play,
    unlock,
    /** true unless every sound is on (quiet mode counts as muted) */
    get muted() { return mode !== 'on'; },
    /** 'on' | 'quiet' | 'off' */
    get mode() { return mode; },
    setMuted(on) {
      mode = on ? 'off' : 'on';
      store(key, on ? '1' : '0');
      if (on) stopMusic();
      else {
        if (unlocked) preload();
        if (musicWanted) startMusic();
      }
    },
    /** background loop for the lobby / TV; plays only when sound is fully on */
    music(on) {
      musicWanted = !!on;
      if (on) startMusic(); else stopMusic();
    },
  };
}
