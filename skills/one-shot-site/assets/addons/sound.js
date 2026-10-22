// Sound, made in code with Web Audio: no files to download, nothing plays until the visitor asks.
//
//   <button class="sound-toggle" type="button" aria-pressed="false">Sound</button>
//   initSound(document.querySelector('.sound-toggle'), { music: true, clicks: true });
//
// - Off by default. The choice is remembered; someone who turned it off is never surprised by it again.
// - Clicks: a soft glass tick on links and buttons. Music: a slow felt-piano bed, six short phrases that
//   repeat at different odd lengths so they never line up the same way twice (it never audibly loops).
// - Goes quiet when the tab is hidden. Every sound has a rate limit, so fast clicking never turns to noise.
const KEY = 'site-sound';
let ctx = null, master = null, enabled = false, noiseBuf = null;
const last = {};
const drift = (k) => 1 + (Math.random() - 0.5) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function ping(t, freq, peak, decay, type = 'sine', out = master) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  env(g, t, peak, 0.0015, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// each kind of sound has its own rate limit
function play(fn, gap, kind) {
  if (!enabled) return;
  const now = performance.now();
  if (now - (last[kind] || 0) < gap) return;
  last[kind] = now;
  if (audio()) fn(ctx.currentTime + 0.005);
}

export const sounds = {
  // a click anywhere: a short high glass tick with a faint octave
  tap: () => play((t) => { const f = 2637 * drift(0.06); ping(t, f, 0.035, 0.045); ping(t, f * 2, 0.006, 0.02); }, 55, 'tap'),
  // links and buttons: two glass notes a fifth apart
  press: () => play((t) => { ping(t, 1318.5, 0.06, 0.12, 'triangle'); ping(t + 0.045, 1975.5, 0.05, 0.18, 'triangle'); }, 40, 'press'),
  // something arrives or succeeds (a form sent, a toggle on): a rising pair
  done: () => play((t) => { ping(t, 660, 0.08, 0.12); ping(t + 0.07, 990, 0.06, 0.16); }, 0, 'done'),
};

// ---------- music ----------
// Scales by mood. Each loop: [period in seconds, pan, [[offset, step in the scale, velocity], …]]
const SCALES = { calm: [0, 2, 3, 5, 7, 9, 10], bright: [0, 2, 4, 7, 9], deep: [0, 2, 3, 5, 7, 8, 10] };
const LOOPS = [
  [19.7, -0.3, [[0, 7, 0.5], [2.3, 11, 0.38]]],
  [23.3, 0.35, [[1.1, 9, 0.42], [3.6, 13, 0.3], [5.4, 15, 0.24]]],
  [29.9, -0.1, [[0.4, 4, 0.45], [4.4, 10, 0.32]]],
  [31.1, 0.15, [[2.0, 6, 0.36], [2.9, 8, 0.3]]],
  [37.7, 0, [[0, 0, 0.5]]],
  [17.1, 0.5, [[6.2, 18, 0.16]]],
];
let bus = null, timer = 0, musicOn = false, droneAt = 0, loops = [], root = 50, scale = SCALES.calm;
const note = (step) => root + 12 * Math.floor(step / scale.length) + scale[step % scale.length];

function graph() {
  if (bus) return;
  bus = ctx.createGain();
  bus.gain.value = 0.0001;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 4200;
  // a large soft room from decaying noise
  const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.2; }
  const room = ctx.createConvolver();
  room.buffer = buf;
  const dry = ctx.createGain(), wet = ctx.createGain();
  dry.gain.value = wet.gain.value = 0.55;
  bus.connect(soft);
  soft.connect(dry).connect(master);
  soft.connect(room).connect(wet).connect(master);
}

// felt piano: slightly stretched partials and a soft hammer; low notes ring longer
function piano(t, midi, vel, pan) {
  const f = mtof(midi);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(bus);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * (2 + vel * 6) * 0.75, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 200), t + 2.5);
  lp.connect(p);
  const out = ctx.createGain();
  const dec = Math.max(1.6, 7 - (midi - 48) * 0.09);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vel * 0.09, t + 0.012);
  out.gain.exponentialRampToValueAtTime(vel * 0.034, t + 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  out.connect(lp);
  [[1, 1], [2, 0.42], [3, 0.16], [4, 0.07], [5, 0.03]].forEach(([n, a]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * n * (1 + 0.0004 * n * n);
    const g = ctx.createGain();
    g.gain.value = a;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.1);
  });
  const n = noise(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
  nf.type = 'bandpass';
  nf.frequency.value = f * 3;
  env(ng, t, vel * 0.008, 0.001, 0.025);
  n.connect(nf).connect(ng).connect(p);
  n.start(t, Math.random() * 0.4);
  n.stop(t + 0.04);
}

function drone(t, midi, level, len) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 6);
  g.gain.setValueAtTime(level, t + len);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 8);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + len + 8.1);
}

function schedule() {
  const now = ctx.currentTime, until = now + 1.5;
  for (const L of loops) {
    while (L.next < until) {
      for (const [dt, step, v] of L.notes) {
        const t = L.next + dt + rnd(-0.03, 0.03);
        if (t > now) piano(t, note(step), v * rnd(0.85, 1.1), L.pan);
      }
      L.next += L.period;
    }
  }
  while (droneAt < until) {
    drone(droneAt, root - 12, 0.014, 12);
    drone(droneAt + 3, root - 5, 0.007, 10);
    droneAt += 22;
  }
}

function setMusic(on) {
  if (!audio()) return;
  graph();
  const t = ctx.currentTime;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
  if (on && !musicOn) {
    musicOn = true;
    for (const L of loops) L.next = Math.max(L.next, t + 0.3 + rnd(0, 6));
    droneAt = Math.max(droneAt, t + 0.3);
    schedule();
    timer = setInterval(schedule, 300);
    bus.gain.exponentialRampToValueAtTime(0.3, t + 4);
  } else if (!on && musicOn) {
    musicOn = false;
    clearInterval(timer);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  }
}

// mood: 'calm' (dorian), 'bright' (major pentatonic) or 'deep' (minor); key: the lowest note, as MIDI
export function initSound(button, { music = true, clicks = true, mood = 'calm', key = 50 } = {}) {
  if (!button) return sounds;
  root = key;
  scale = SCALES[mood] || SCALES.calm;
  loops = LOOPS.map(([period, pan, notes]) => ({ period, pan, notes, next: 0 }));
  try { enabled = localStorage.getItem(KEY) === 'on'; } catch { /* storage blocked: stay off */ }
  const show = () => { button.setAttribute('aria-pressed', String(enabled)); button.classList.toggle('is-on', enabled); };
  show();

  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    show();
    if (enabled) sounds.done();
    if (music) setMusic(enabled);
  });

  // someone who left sound on last time: start again on their first click or key (browsers require one)
  if (enabled && music) {
    const start = () => { setMusic(true); removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start);
    addEventListener('keydown', start);
  }

  if (clicks) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.sound-toggle')) return;
      if (e.target.closest('a, button, [role="button"], summary, label')) sounds.press();
      else sounds.tap();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
  });
  return sounds;
}
