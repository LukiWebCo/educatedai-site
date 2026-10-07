// Conquián card sounds, synthesized on the spot with Web Audio (no files, nothing to license): a card snap, a
// flip, a deal riffle, the "¡Te obligo!" stamp thump and a little win flourish. They follow the phone's sound
// setting from sfx.js (ctx.sfx.mode): only when sound is fully on. "Your turn" and the haptics stay sfx.js's.
//
//   const s = cardSound(ctx.sfx);  s.play('snap' | 'flip' | 'deal' | 'stamp' | 'win' | 'bad')

let ac = null;
function audio() {
  if (ac) return ac;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ac = new AC({ latencyHint: 'interactive' }); } catch { ac = null; }
  return ac;
}

function noise(c, dur) {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
}

function burst(c, at, { dur = 0.05, freq = 2400, q = 0.9, gain = 0.5, type = 'bandpass' } = {}) {
  const s = noise(c, dur);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f); f.connect(g); g.connect(c.destination);
  s.start(at); s.stop(at + dur + 0.02);
}

function tone(c, at, { freq = 440, dur = 0.18, gain = 0.18, type = 'triangle', slide = 0 } = {}) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

const RECIPES = {
  snap(c, t0) { burst(c, t0, { dur: 0.035, freq: 3200, q: 1.4, gain: 0.7 }); burst(c, t0 + 0.012, { dur: 0.06, freq: 900, q: 0.7, gain: 0.35 }); },
  flip(c, t0) { burst(c, t0, { dur: 0.14, freq: 1800, q: 0.5, gain: 0.25, type: 'highpass' }); burst(c, t0 + 0.11, { dur: 0.04, freq: 2600, q: 1.2, gain: 0.5 }); },
  deal(c, t0) { for (let i = 0; i < 6; i++) burst(c, t0 + i * 0.07, { dur: 0.03, freq: 2600 + (i % 2) * 500, q: 1.2, gain: 0.4 }); },
  stamp(c, t0) { tone(c, t0, { freq: 140, dur: 0.22, gain: 0.5, type: 'sine', slide: 0.5 }); burst(c, t0, { dur: 0.09, freq: 400, q: 0.6, gain: 0.8, type: 'lowpass' }); },
  win(c, t0) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t0 + i * 0.11, { freq: f, dur: 0.32, gain: 0.16 })); },
  bad(c, t0) { tone(c, t0, { freq: 220, dur: 0.16, gain: 0.14, type: 'square', slide: 0.8 }); },
};

export function cardSound(sfx) {
  return {
    play(name) {
      try {
        if (!sfx || sfx.mode !== 'on' || !RECIPES[name]) return;
        const c = audio();
        if (!c) return;
        if (c.state === 'suspended') c.resume();
        RECIPES[name](c, c.currentTime + 0.01);
      } catch { /* sound never breaks the game */ }
    },
  };
}
