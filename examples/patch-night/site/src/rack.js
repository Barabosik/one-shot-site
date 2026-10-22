// The house rack in the first screen: four modules (one per act) and the mixer, joined by patch cables the
// visitor can pull out and plug in again. With Sound on, every module patched into the mixer plays its own voice.
//
//   <div class="rack" data-rack> … <div class="module" data-voice="moro"> … <span class="jack" data-out></span>
//   … <div class="module module-mix"> <canvas class="scope"></canvas> <span class="jack" data-in="1"></span> …
//
// - The modules are plain HTML and CSS, so they show without scripts; the cables are drawn here, in an SVG laid
//   over the rack, from where the jacks really are (measured again on every resize).
// - Cables swing once when the page opens and when a plug is dropped; nothing moves on its own after that.
//   With reduced motion they are simply there.
// - Nothing is heard until the visitor turns Sound on (addons/sound.js); then the patch is the music.
import { audioOut, soundOn } from './addons/sound.js';

const SVG = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initRack(rack, { onPatch = () => {} } = {}) {
  if (!rack) return null;
  const modules = [...rack.querySelectorAll('.module[data-voice]')];
  const inputs = [...rack.querySelectorAll('[data-in]')];
  const scope = rack.querySelector('.scope');
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('cables');
  svg.setAttribute('aria-hidden', 'true');
  rack.append(svg);

  // one cable per act module; data-patch="2" on a module means it starts plugged into the mixer's input 2
  const cables = modules.map((m, i) => {
    const g = document.createElementNS(SVG, 'g');
    g.classList.add('cable', i % 2 ? 'cable-light' : 'cable-hot');
    const shade = document.createElementNS(SVG, 'path');
    shade.classList.add('cable-shade');
    const wire = document.createElementNS(SVG, 'path');
    wire.classList.add('cable-wire');
    const root = document.createElementNS(SVG, 'circle');
    root.classList.add('plug-cap');
    const plug = document.createElementNS(SVG, 'g');
    plug.classList.add('plug');
    const cap = document.createElementNS(SVG, 'circle');
    cap.classList.add('plug-cap');
    const tip = document.createElementNS(SVG, 'circle');
    tip.classList.add('plug-tip');
    plug.append(cap, tip);
    g.append(shade, wire, root, plug);
    svg.append(g);
    const to = m.dataset.patch ? inputs.find((j) => j.dataset.in === m.dataset.patch) : null;
    return { module: m, voice: m.dataset.voice, out: m.querySelector('[data-out]'), to, g, shade, wire, root, plug, cap, tip,
      end: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, sag: 0, sagV: 0, dragging: false };
  });

  let box = { width: 1, height: 1 }, jackR = 8, frame = 0;
  const centre = (el) => {
    const r = el.getBoundingClientRect(), b = rack.getBoundingClientRect();
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
  };
  const rest = (c) => {
    const s = centre(c.out);
    return { x: s.x + jackR * 1.6, y: Math.min(s.y + box.height * 0.24, box.height - jackR * 2) };
  };
  const target = (c) => (c.to ? centre(c.to) : rest(c));
  const sagFor = (c, e) => {
    const s = centre(c.out);
    const room = (box.height - jackR * 1.5 - Math.max(s.y, e.y)) / 0.75; // the lowest point stays inside the rack
    return c.to || c.dragging ? Math.max(12, Math.min(28 + Math.abs(e.x - s.x) * 0.3, room)) : Math.max(10, Math.min(36, room));
  };

  // sizes from the layout; with place = true every cable also goes straight where it belongs
  function measure(place = true) {
    box = rack.getBoundingClientRect();
    jackR = (rack.querySelector('.jack')?.getBoundingClientRect().width || 16) / 2;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    if (place) for (const c of cables) if (!c.dragging) { c.end = target(c); c.sag = sagFor(c, c.end); }
    draw();
  }

  function draw() {
    for (const c of cables) {
      const s = centre(c.out), e = c.end;
      // a hanging plug points down into its cable; a plugged one is seen from the front
      const d = c.to || c.dragging
        ? `M${s.x} ${s.y} C${s.x} ${s.y + c.sag} ${e.x} ${e.y + c.sag} ${e.x} ${e.y}`
        : `M${s.x} ${s.y} C${s.x} ${s.y + c.sag} ${e.x} ${e.y - c.sag * 0.8} ${e.x} ${e.y}`;
      c.wire.setAttribute('d', d);
      c.shade.setAttribute('d', d);
      c.shade.setAttribute('transform', `translate(${jackR * 0.35} ${jackR * 0.5})`);
      for (const [el, p, k] of [[c.root, s, 1.15], [c.cap, e, 1.15], [c.tip, e, 0.45]]) {
        el.setAttribute('cx', p.x);
        el.setAttribute('cy', p.y);
        el.setAttribute('r', jackR * k);
      }
      c.module.classList.toggle('is-patched', !!c.to);
    }
    for (const j of inputs) j.classList.toggle('is-used', cables.some((c) => c.to === j));
  }

  // a light spring: the plug end and the sag settle on their targets; it stops as soon as all is still
  function settle() {
    if (frame) return;
    if (reduced) { measure(); return; }
    let lastT = performance.now();
    const step = (t) => {
      const dt = Math.min(0.032, (t - lastT) / 1000);
      lastT = t;
      let moving = false;
      for (const c of cables) {
        if (c.dragging) { moving = true; continue; }
        const goal = target(c), sag = sagFor(c, goal);
        for (const k of ['x', 'y']) {
          c.vel[k] += ((goal[k] - c.end[k]) * 190 - c.vel[k] * 15) * dt;
          c.end[k] += c.vel[k] * dt;
        }
        c.sagV += ((sag - c.sag) * 120 - c.sagV * 10) * dt;
        c.sag += c.sagV * dt;
        if (Math.hypot(goal.x - c.end.x, goal.y - c.end.y, c.vel.x, c.vel.y) > 0.3 || Math.abs(sag - c.sag) + Math.abs(c.sagV) > 0.3) moving = true;
        else { c.end = goal; c.sag = sag; c.vel = { x: 0, y: 0 }; c.sagV = 0; }
      }
      draw();
      frame = moving ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  }

  // dragging a plug: out of its jack, follow the pointer, drop into the nearest free input or let it hang
  for (const c of cables) {
    // a finger on a plug moves the plug, not the page
    c.plug.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    c.plug.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.plug.setPointerCapture(e.pointerId);
      box = rack.getBoundingClientRect();
      const was = c.to;
      c.to = null;
      c.dragging = true;
      rack.classList.add('is-dragging');
      if (was) engine.patch(c.voice, false);
      onPatch();
      const move = (ev) => {
        const b = rack.getBoundingClientRect();
        c.end = { x: ev.clientX - b.left, y: ev.clientY - b.top };
        c.sag = sagFor(c, c.end);
        draw();
      };
      const up = () => {
        c.plug.removeEventListener('pointermove', move);
        c.plug.removeEventListener('pointerup', up);
        c.plug.removeEventListener('pointercancel', up);
        c.dragging = false;
        rack.classList.remove('is-dragging');
        const free = inputs.filter((j) => !cables.some((o) => o.to === j));
        const near = free.map((j) => ({ j, d: Math.hypot(centre(j).x - c.end.x, centre(j).y - c.end.y) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.d < Math.max(44, jackR * 4)) {
          c.to = near.j;
          engine.patch(c.voice, true);
          engine.click();
        }
        c.vel = { x: 0, y: 0 };
        onPatch();
        settle();
      };
      c.plug.addEventListener('pointermove', move);
      c.plug.addEventListener('pointerup', up);
      c.plug.addEventListener('pointercancel', up);
    });
  }

  const engine = makeEngine(cables, scope, rack);
  measure();
  // On load the cables hang taut until the page has its fonts and has been painted, then fall into their curves,
  // once. While they fall, a resize only measures; after that, a resize puts every cable straight where it belongs.
  let falling = !reduced;
  const taut = () => {
    for (const c of cables) { c.sag = 0; c.sagV = 0; c.end = c.to ? target(c) : { x: rest(c).x, y: centre(c.out).y + 4 }; }
    draw();
  };
  if (!reduced) {
    taut();
    const painted = new Promise((done) => {
      setTimeout(done, 2000);
      try {
        new PerformanceObserver((list, obs) => { if (list.getEntries().length) { obs.disconnect(); done(); } }).observe({ type: 'paint', buffered: true });
      } catch { done(); }
    });
    Promise.all([document.fonts?.ready, painted]).then(() => {
      measure(false);
      taut();
      setTimeout(() => { settle(); setTimeout(() => { falling = false; }, 1600); }, 350);
    });
  } else {
    document.fonts?.ready.then(() => measure());
  }
  new ResizeObserver(() => {
    if (falling) return measure(false);
    cancelAnimationFrame(frame);
    frame = 0;
    measure();
  }).observe(rack);
  return { setSound: (on) => engine.run(on), patched: () => cables.filter((c) => c.to).map((c) => c.voice) };
}

// ---------- the voices: one per act, all on one clock, heard only through the mixer ----------
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const BPM = 122, STEP = 60 / BPM / 4;

function makeEngine(cables, scope, rack) {
  let ctx = null, bus = null, analyser = null, timer = 0, raf = 0, on = false, step = 0, next = 0, noise = null, drone = null, seen = true;
  const ch = {};
  const isPatched = (v) => cables.some((c) => c.voice === v && c.to);
  const led = (v, t, len = 90) => {
    if (reduced) return;
    const m = cables.find((c) => c.voice === v)?.module;
    if (!m) return;
    setTimeout(() => { m.classList.add('is-hit'); setTimeout(() => m.classList.remove('is-hit'), len); }, Math.max(0, (t - ctx.currentTime) * 1000));
  };

  function graph() {
    if (bus) return true;
    const out = audioOut();
    if (!out) return false;
    ctx = out.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    bus = ctx.createGain();
    bus.gain.value = 0.0001;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    bus.connect(comp).connect(out.master);
    bus.connect(analyser);
    for (const v of ['moro', 'kofi', 'brandt', 'open']) {
      ch[v] = ctx.createGain();
      ch[v].gain.value = isPatched(v) ? 1 : 0.0001;
      ch[v].connect(bus);
    }
    // Brandt's sequence goes through a tape-ish echo
    const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = STEP * 3;
    fb.gain.value = 0.38;
    wet.gain.value = 0.45;
    ch.brandtDry = ctx.createGain();
    ch.brandtDry.connect(ch.brandt);
    ch.brandtDry.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(ch.brandt);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function envGain(t, peak, a, dcy) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
    return g;
  }

  // Ines Moro: slow folded tones, long attack, longer tail
  const MORO = [50, 53, 57, 60, 62, 64, 65].map((n) => n + 12);
  function moro(t) {
    const f = mtof(pick(MORO));
    const g = envGain(t, 0.16, 1.4, 5.5);
    const fold = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) curve[i] = Math.sin((i / 255.5 - 1) * 2.6);
    fold.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * 5, t + 1.6);
    lp.frequency.linearRampToValueAtTime(f * 1.2, t + 7);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    for (const [mul, type, lvl] of [[1, 'triangle', 0.9], [2.003, 'sine', 0.3]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mul;
      og.gain.value = lvl;
      o.connect(og).connect(fold);
      o.start(t);
      o.stop(t + 7.2);
    }
    fold.connect(lp).connect(g).connect(pan).connect(ch.moro);
    led('moro', t, 600);
  }

  // Kofi & the Cables: a kick on the beat, a short bass and hats off it
  function kick(t) {
    const o = ctx.createOscillator(), g = envGain(t, 0.9, 0.002, 0.32);
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
    o.connect(g).connect(ch.kofi);
    o.start(t);
    o.stop(t + 0.4);
    led('kofi', t);
  }
  function hat(t, lvl) {
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = envGain(t, lvl, 0.001, 0.045);
    s.buffer = noise;
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    s.connect(hp).connect(g).connect(ch.kofi);
    s.start(t, Math.random() * 0.4);
    s.stop(t + 0.06);
  }
  function bass(t) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = envGain(t, 0.22, 0.004, 0.16);
    o.type = 'sawtooth';
    o.frequency.value = mtof(38);
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    o.connect(lp).connect(g).connect(ch.kofi);
    o.start(t);
    o.stop(t + 0.22);
  }

  // Dr. Lisa Brandt: a random sequence through a resonant filter, as from a 1970s sample-and-hold
  const BRANDT = [62, 65, 67, 69, 72, 74, 77, 79, 81];
  function blip(t) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = envGain(t, 0.13, 0.003, 0.2);
    o.type = 'sawtooth';
    o.frequency.value = mtof(pick(BRANDT));
    lp.type = 'lowpass';
    lp.Q.value = 13;
    lp.frequency.setValueAtTime(2600 + Math.random() * 2400, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    o.connect(lp).connect(g).connect(ch.brandtDry);
    o.start(t);
    o.stop(t + 0.26);
    led('brandt', t);
  }

  // Open Patch: the house rack's drone, as long as it is plugged in
  function droneOn() {
    if (drone) return;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.value = 420;
    lfo.frequency.value = 0.07;
    depth.gain.value = 260;
    lfo.connect(depth).connect(lp.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 3);
    const oscs = [[38, -4], [38, 5], [45, 2]].map(([m, cents]) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      return o;
    });
    lp.connect(g).connect(ch.open);
    lfo.start(t);
    drone = { g, stop: [...oscs, lfo] };
  }
  function droneOff() {
    if (!drone) return;
    const t = ctx.currentTime, d = drone;
    d.g.gain.cancelScheduledValues(t);
    d.g.gain.setValueAtTime(Math.max(d.g.gain.value, 0.0001), t);
    d.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    d.stop.forEach((o) => o.stop(t + 1.6));
    drone = null;
  }

  function schedule() {
    const until = ctx.currentTime + 0.2;
    while (next < until) {
      const s = step % 64;
      if (isPatched('moro') && (s === 0 || (s === 32 && Math.random() < 0.7) || (s === 44 && Math.random() < 0.3))) moro(next);
      if (isPatched('kofi')) {
        if (s % 4 === 0) kick(next);
        if (s % 4 === 2) { hat(next, 0.12); bass(next); }
        if (s % 2 === 1 && Math.random() < 0.3) hat(next, 0.04);
      }
      if (isPatched('brandt') && Math.random() < (s % 4 === 0 ? 0.55 : 0.28)) blip(next);
      next += STEP;
      step++;
    }
  }

  // the mixer's little screen: the sound itself while it plays, a flat line when it's quiet
  const pen = scope?.getContext('2d');
  function scopeDraw(live) {
    if (!pen) return;
    const w = (scope.width = scope.clientWidth * Math.min(2, devicePixelRatio || 1));
    const h = (scope.height = scope.clientHeight * Math.min(2, devicePixelRatio || 1));
    pen.clearRect(0, 0, w, h);
    pen.lineWidth = Math.max(1.5, w / 90);
    pen.strokeStyle = getComputedStyle(scope).color;
    pen.beginPath();
    if (live && analyser) {
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w, y = h / 2 + ((data[i] - 128) / 128) * h * 0.9;
        i ? pen.lineTo(x, y) : pen.moveTo(x, y);
      }
    } else {
      pen.moveTo(0, h / 2);
      pen.lineTo(w, h / 2);
    }
    pen.stroke();
  }
  const loop = () => { scopeDraw(true); raf = on && seen && !reduced ? requestAnimationFrame(loop) : 0; };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && on && !raf && !reduced) raf = requestAnimationFrame(loop); }).observe(rack);
  }
  scopeDraw(false);
  new ResizeObserver(() => { if (!raf) scopeDraw(false); }).observe(scope || rack);

  return {
    run(want) {
      if (want === on) return;
      if (want && !graph()) return;
      on = want;
      rack.classList.toggle('is-live', on);
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
      if (on) {
        bus.gain.exponentialRampToValueAtTime(0.8, t + 0.6);
        next = t + 0.08;
        step = 0;
        if (isPatched('open')) droneOn();
        schedule();
        timer = setInterval(schedule, 40);
        if (!reduced) raf = requestAnimationFrame(loop);
      } else {
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        clearInterval(timer);
        setTimeout(droneOff, 900);
        cancelAnimationFrame(raf);
        raf = 0;
        setTimeout(() => scopeDraw(false), 120);
      }
    },
    patch(voice, plugged) {
      if (!bus) return;
      const t = ctx.currentTime, g = ch[voice].gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(plugged ? 1 : 0.0001, t + 0.06);
      if (voice === 'open' && on) (plugged ? droneOn : droneOff)();
    },
    // the plug going in: a short dull click, only when sound is on
    click() {
      if (!soundOn() || !graph()) return;
      const t = ctx.currentTime + 0.005;
      const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = envGain(t, 0.25, 0.001, 0.04);
      s.buffer = noise;
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      s.connect(bp).connect(g).connect(audioOut().master);
      s.start(t);
      s.stop(t + 0.06);
    },
  };
}
