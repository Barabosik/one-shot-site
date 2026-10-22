// Sound, made in code with Web Audio: no files to download, nothing plays until the visitor asks.
//
//   <button class="sound-toggle" type="button" aria-pressed="false">Sound</button>
//   initSound(document.querySelector('.sound-toggle'), { clicks: true, onChange: (on) => … });
//
// - Off by default. The choice is remembered; someone who turned it off is never surprised by it again.
// - Clicks: a soft glass tick on links and buttons.
// - Music: on this site the music is the rack in the first screen (src/rack.js). It gets the audio context
//   from audioOut() and is told through onChange when the visitor turns sound on or off.
// - Goes quiet when the tab is hidden. Every sound has a rate limit, so fast clicking never turns to noise.
const KEY = 'site-sound';
let ctx = null, master = null, enabled = false;
const last = {};
const drift = (k) => 1 + (Math.random() - 0.5) * k;

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

// the context and the master gain, for the rack's own voices (null where Web Audio is missing)
export function audioOut() {
  return audio() ? { ctx, master } : null;
}
export const soundOn = () => enabled;

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
  // something arrives or succeeds (a plug goes in, a toggle on): a rising pair
  done: () => play((t) => { ping(t, 660, 0.08, 0.12); ping(t + 0.07, 990, 0.06, 0.16); }, 0, 'done'),
};

export function initSound(button, { clicks = true, onChange = () => {} } = {}) {
  if (!button) return sounds;
  try { enabled = localStorage.getItem(KEY) === 'on'; } catch { /* storage blocked: stay off */ }
  const show = () => { button.setAttribute('aria-pressed', String(enabled)); button.classList.toggle('is-on', enabled); };
  show();

  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    show();
    if (enabled) sounds.done();
    onChange(enabled);
  });

  // someone who left sound on last time: start again on their first click or key (browsers require one)
  if (enabled) {
    const start = (e) => {
      removeEventListener('pointerdown', start);
      removeEventListener('keydown', start);
      if (e.target.closest?.('.sound-toggle')) return; // that click turns it off instead
      audio();
      onChange(true);
    };
    addEventListener('pointerdown', start);
    addEventListener('keydown', start);
  }

  if (clicks) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.sound-toggle, .rack')) return;
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
