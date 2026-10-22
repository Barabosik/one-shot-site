#!/usr/bin/env node
// film: record how the site moves. Plays the first seconds after load, then scrolls through the page slowly, keeps
// every frame the browser paints, and lays them out as filmstrips you can read: what moves, in what order, for how
// long, and whether it ever stops.
//
//   node film.mjs [dist | http://localhost:5173 | https://site.com] [--page /] [--width 1440] [--seconds 2.4]
//                 [--steps 6] [--video] [--reduced] [--scheme light|dark] [--headed] [--out .one-shot/film]
//
// film-load.jpg    the first seconds, 16 frames, each labelled with its time
// film-scroll.jpg  one row per scroll step: just after the step, and once it has settled
// film.md          every animation, transition and scripted move, when it starts and how long it takes
// film.webm        (--video) the same frames as a video, to show the person
//
// --reduced plays it with reduced motion on (out: .one-shot/film-reduced): anything that still slides, grows or
// loops is a fault. --scheme dark plays it as a visitor with a dark system setting sees it (out: …-dark, on a
// folder given with --out too).
// Exit code 1 = at least one fault marked "fix".
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from './lib/chrome.mjs';
import { open, serve, siteTarget } from './lib/serve.mjs';
import { args, colorScheme, num, pagePath, problem, report, schemed, write, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const { scheme, suffix } = colorScheme(a);
const W = num(a.width, '--width', { def: 1440, min: 200, max: 4000, int: true });
const H = W < 600 ? 844 : W < 1100 ? 1024 : 900;
const SECONDS = num(a.seconds, '--seconds', { def: 2.4, min: 0.5, max: 30 });
const STEPS = num(a.steps, '--steps', { def: 6, min: 1, max: 30, int: true });
const target = await siteTarget(a._[0], import.meta.url);
const path = pagePath(a.page || '/');
const out = resolve(schemed(a.out || (a.reduced ? '.one-shot/film-reduced' : '.one-shot/film'), suffix));
const MOVES = /transform|translate|scale|rotate|^(top|left|right|bottom|inset|margin|padding|width|height|offset)/i;

// Runs in the page before its own scripts. Notes every CSS animation, transition, animate() call and scripted
// style change with its time, every layout shift, when the h1 becomes readable, and how often scripts ask for frames.
function recorder() {
  if (window.__film) return;
  const raf = window.requestAnimationFrame.bind(window);
  const film = (window.__film = { moves: [], shifts: [], readable: null, raf: 0, gaps: [], watching: false });
  const name = (e) => (!e || !e.tagName ? '?' : e.tagName.toLowerCase() + (e.id ? '#' + e.id : typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : ''));
  const keys = (frames) => [...new Set(frames.flatMap((k) => Object.keys(k)))].filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p));
  // the duration from the computed style, for when the animation object can't be found (::before, ::after)
  const seconds = (s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) || 0;
  const styleMs = (e, names, durations, delays, which) => {
    const cs = getComputedStyle(e.target, e.pseudoElement || null);
    const list = cs[names].split(',').map((x) => x.trim());
    const i = Math.max(0, list.indexOf(which));
    const pick = (k) => { const v = cs[k].split(','); return seconds(v[i % v.length].trim()); };
    return pick(durations) + (delays ? Math.max(0, pick(delays)) : 0);
  };
  // "at" is when it was noticed and "ms" how long from then: animationstart fires after the delay, transitionrun
  // and animate() before it, so only those two count the delay in
  const add = (kind, el, label, anim, props, fallback = 0) => {
    let ms = fallback, forever = false;
    try { const t = anim.effect.getComputedTiming(); ms = (Number.isFinite(+t.activeDuration) ? +t.activeDuration : +t.duration || 0) + (kind === 'css animation' ? 0 : Math.max(0, +t.delay || 0)); forever = t.iterations === Infinity; } catch {}
    try { props ||= keys(anim.effect.getKeyframes()); } catch { props = []; }
    film.moves.push({ at: Math.round(performance.now()), kind, el: name(el), label, ms: Math.round(ms * 100) / 100, forever, props });
  };
  document.addEventListener('animationstart', (e) => add('css animation', e.target, e.animationName,
    e.target.getAnimations?.({ subtree: !!e.pseudoElement }).find((x) => x.animationName === e.animationName), undefined,
    styleMs(e, 'animationName', 'animationDuration', null, e.animationName)), true);
  document.addEventListener('transitionrun', (e) => add('transition', e.target, e.propertyName,
    e.target.getAnimations?.({ subtree: !!e.pseudoElement }).find((x) => x.transitionProperty === e.propertyName), [e.propertyName],
    styleMs(e, 'transitionProperty', 'transitionDuration', 'transitionDelay', e.propertyName)), true);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const anim = animate.apply(this, args);
    add('animate()', this, '', anim);
    return anim;
  };
  window.requestAnimationFrame = (cb) => { film.raf++; return raf(cb); };
  // scripts that move things by rewriting style="" every frame (GSAP and friends). Only values that really change
  // count: a library writing "transform: translate(0px, 0px)" again and again moves nothing.
  const styled = new Map();
  const parse = (s) => new Map((s || '').split(';').map((p) => [p.slice(0, p.indexOf(':')).trim(), p.slice(p.indexOf(':') + 1).trim()]).filter(([k]) => k));
  const RESTING = /^(none|auto|0(px|%|deg)?|1|translate\(0(px|%)?(, ?0(px|%)?)?\)|translate3d\(0(px)?, ?0(px)?, ?0(px)?\)|matrix\(1, 0, 0, 1, 0, 0\)|scale\(1\)|rotate\(0deg\))$/;
  new MutationObserver((list) => {
    const now = performance.now();
    for (const m of list) {
      const r = styled.get(m.target) || { el: name(m.target), n: 0, first: now, last: now, props: new Set(), prev: parse(m.oldValue) };
      const next = parse(m.target.getAttribute('style'));
      let changed = false;
      for (const [k, v] of next) {
        const was = r.prev.get(k);
        if (was === v || (RESTING.test(v) && (was === undefined || RESTING.test(was)))) continue;
        r.props.add(k); changed = true;
      }
      r.prev = next;
      if (changed) { if (!r.n) r.first = now; r.n++; r.last = now; }
      styled.set(m.target, r);
    }
  }).observe(document, { attributes: true, attributeOldValue: true, attributeFilter: ['style'], subtree: true });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) film.shifts.push({ at: Math.round(e.startTime), value: e.value, from: (e.sources || []).map((s) => name(s.node)).filter((n) => n !== '?') });
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') film.painted = Math.round(e.startTime);
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  // the h1 counts as readable once all of it is opaque and nothing on it is still animating
  // shown: opaque, not clipped away by clip-path, and at least half inside every box that clips it (split text
  // rising out of a clipped line, a wipe)
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (+s.opacity < 0.98 || s.visibility === 'hidden' || /inset\([^)]*100%/.test(s.clipPath)) return false;
      if (e !== el && s.overflow !== 'visible') {
        const b = e.getBoundingClientRect();
        if (Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) < r.height / 2) return false;
      }
    }
    return true;
  };
  const poll = () => {
    const now = performance.now();
    if (film.readable !== null || now > 12000) return;
    const h = document.querySelector('h1');
    const r = h?.getBoundingClientRect();
    if (h && r.width && r.bottom > 0 && r.top < innerHeight) {
      const still = !h.getAnimations({ subtree: true }).some((x) => x.playState === 'running' && x.effect?.getComputedTiming().iterations !== Infinity)
        && ![...styled].some(([el, s]) => h.contains(el) && now - s.last < 120);
      if (still && [h, ...h.querySelectorAll('*')].filter((e) => e.textContent.trim()).every(shown)) film.readable = Math.round(now);
    }
    raf(poll);
  };
  raf(poll);
  // every canvas that draws (2D or WebGL), so a drawing loop left running off screen can be named
  const draws = new Map();
  const mark = (canvas) => { if (canvas) draws.set(canvas, (draws.get(canvas) || 0) + 1); };
  for (const [proto, methods] of [[window.CanvasRenderingContext2D?.prototype, ['clearRect', 'fillRect', 'drawImage', 'putImageData']],
    [window.WebGLRenderingContext?.prototype, ['clear', 'drawArrays', 'drawElements']], [window.WebGL2RenderingContext?.prototype, ['clear', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']]]) {
    for (const m of proto ? methods : []) {
      const orig = proto[m];
      if (typeof orig === 'function') proto[m] = function (...args) { mark(this.canvas); return orig.apply(this, args); };
    }
  }
  film.draws = () => [...draws].map(([c, n]) => { const b = c.getBoundingClientRect?.() || { bottom: 0, top: 0, width: 0 }; return { el: name(c), n, onScreen: b.width > 0 && b.bottom > 0 && b.top < innerHeight }; });
  film.name = name;
  film.frame = raf;
  film.watch = (on) => {
    film.watching = on;
    if (!on) return;
    let last = performance.now();
    const tick = (t) => { if (!film.watching) return; film.gaps.push(Math.round(t - last)); last = t; raf(tick); };
    raf(tick);
  };
  film.dump = () => ({
    moves: film.moves, shifts: film.shifts, readable: film.readable, painted: film.painted ?? null, gaps: film.gaps,
    scripted: [...styled.values()].filter((s) => s.n >= 6).map((s) => ({ el: s.el, n: s.n, first: Math.round(s.first), last: Math.round(s.last), props: [...s.props] })),
  });
}

// what is looping right now, and where
const LOOPING = `__film && document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.getComputedTiming().iterations === Infinity && +x.effect.getComputedTiming().duration > 1).map((x) => {
  const t = x.effect.target, r = t?.getBoundingClientRect?.();
  const area = t?.closest('section, article, aside, header, footer, main, body') || document.body;
  const pause = [...area.querySelectorAll('button, [role=button]')].some((b) => b.hasAttribute('aria-pressed') || /pause|stop|anhalten|play/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')));
  return { el: __film.name(t), label: x.animationName || x.transitionProperty || 'animate()', big: !!r && r.width * r.height >= 32 * 32, onScreen: !!r && r.bottom > 0 && r.top < innerHeight, pause };
})`;

const site = await open(target, { index: !a.page });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^(load-\d+|scroll-\d+-[ab])\.jpg$|^film(-load|-scroll)?\.(jpg|html|webm|md)$|^report\.(md|json)$/.test(f)) rmSync(join(out, f));

const browser = await launch({ headed: !!a.headed });
const findings = [];
const notes = [];
const frames = []; // { t: epoch ms, data: base64 jpeg }
let film, timeOrigin, loadEnd, steps = [], loops = new Map(), rafAtBottom = null, offscreen = [], video = null;

try {
  const page = await browser.newPage({ width: W, height: H, mobile: W < 600, scale: 1, reducedMotion: !!a.reduced, colorScheme: scheme });
  await page.beforeLoad(`(${recorder})()`);
  page.on('Page.screencastFrame', (p) => {
    frames.push({ t: (p.metadata?.timestamp ? p.metadata.timestamp * 1000 : Date.now()), data: p.data });
    page.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await page.goto(site.url + path);
  // the first screen gets SECONDS from its first paint, the clock the headline is timed on: a machine that paints
  // late would otherwise start scrolling as the page appears, and a jump a person at the top would see then comes
  // while scrolled, where scroll anchoring hides it. A page that paints no text or picture within 10 s of loading
  // goes on.
  const loaded = Date.now();
  let paintedAt = null;
  while ((paintedAt = await page.eval('window.__film?.painted ?? null')) === null && Date.now() - loaded < 10000) await sleep(100);
  await sleep(paintedAt === null ? 0 : Math.max(0, paintedAt + SECONDS * 1000 + 250 - await page.eval('performance.now()')));
  timeOrigin = await page.eval('performance.timeOrigin');
  loadEnd = await page.eval('performance.now()');
  for (const l of await page.eval(LOOPING) || []) loops.set(l.el + '|' + l.label, l);

  // scroll in steps of three quarters of a screen, the way a person reads down a page
  const total = await page.eval('document.documentElement.scrollHeight');
  const n = Math.min(STEPS, Math.ceil(Math.max(0, total - H) / (H * 0.75)));
  if (n) {
    await page.eval('__film.watch(true)');
    for (let i = 0; i < n; i++) {
      const end = await page.eval(`new Promise((done) => { const y0 = scrollY, by = ${Math.round(H * 0.75)}, t0 = performance.now();
        const tick = (t) => { const k = Math.min(1, (t - t0) / 450), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          scrollTo({ top: y0 + by * e, behavior: 'instant' }); k < 1 ? __film.frame(tick) : done(performance.now()); };
        __film.frame(tick); })`);
      steps.push({ end, y: await page.eval('scrollY') });
      await sleep(1100);
      for (const l of await page.eval(LOOPING) || []) if (!loops.has(l.el + '|' + l.label)) loops.set(l.el + '|' + l.label, l);
    }
    await page.eval('__film.watch(false)');
    // scrolled to the end and given time to calm down: does a canvas still redraw though it is off screen?
    await sleep(1500);
    const r0 = await page.eval('__film.raf');
    const d0 = new Map((await page.eval('__film.draws()')).map((d, i) => [i, d.n]));
    await sleep(1000);
    rafAtBottom = (await page.eval('__film.raf')) - r0;
    offscreen = (await page.eval('__film.draws()')).map((d, i) => ({ ...d, rate: d.n - (d0.get(i) || 0) })).filter((d) => !d.onScreen && d.rate > 10);
  }
  await page.send('Page.stopScreencast');
  film = await page.eval('__film.dump()');
  for (const p of page.problems) findings.push(problem(p, path));
  await page.close();

  // frames, relative to the start of navigation
  for (const f of frames) f.t -= timeOrigin;
  frames.sort((x, y) => x.t - y.t);
  // frames from before the first paint are the browser's empty (often black) surface, not the page
  const from = Math.max(0, (film.painted || 0) - 20);
  const at = (t) => { let pick = -1; for (let i = 0; i < frames.length && frames[i].t <= t; i++) if (frames[i].t >= from) pick = i; return pick; };
  const save = (i, file) => { if (i >= 0) writeFileSync(join(out, file), Buffer.from(frames[i].data, 'base64')); return i >= 0 ? file : null; };

  const shots = await serve(out);
  const STYLE = `body{margin:0;padding:24px;background:#222;font:600 15px system-ui;color:#ddd}
    h1{font-size:17px;margin:0 0 16px} .g{display:grid;gap:14px;align-items:start} figure{margin:0}
    img,.blank{width:100%;display:block;outline:1px solid #444;aspect-ratio:${W}/${H}} .blank{background:#fff}
    figcaption{margin-top:6px;color:#999;font-weight:500} .same figcaption{color:#666}`;
  const render = async (name, body) => {
    write(join(out, name + '.html'), `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${body}`);
    const sheet = await browser.newPage({ width: 1600, height: 900 });
    await sheet.goto(`${shots.url}/${name}.html`);
    const height = await sheet.eval('document.documentElement.scrollHeight');
    await sheet.shot(join(out, name + '.jpg'), { quality: 80, clip: { x: 0, y: 0, width: 1600, height: Math.min(height, 7000) } });
    await sheet.close();
  };
  const fig = (file, caption, cls = '') => `<figure class="${cls}">${file ? `<img src="${file}">` : '<div class="blank"></div>'}<figcaption>${caption}</figcaption></figure>`;

  // load strip: 16 moments from 0 to SECONDS
  const slots = Array.from({ length: 16 }, (_, i) => Math.round((i * SECONDS * 1000) / 15));
  let prev = null;
  const load = slots.map((t, i) => {
    const pick = at(t);
    const same = pick === prev;
    prev = pick;
    return fig(save(pick, `load-${String(i).padStart(2, '0')}.jpg`), `${(t / 1000).toFixed(2)} s${pick < 0 ? ' · nothing painted yet' : same && i ? ' · no change' : ''}`, same && i ? 'same' : '');
  });
  const cols = W < 600 ? 8 : 4;
  await render('film-load', `<h1>${path} · ${W}px${a.reduced ? ' · reduced motion' : ''} · the first ${SECONDS} s</h1><div class="g" style="grid-template-columns:repeat(${cols},1fr)">${load.join('')}</div>`);

  // scroll strip: per step, just after the scroll stops, and settled
  if (steps.length) {
    const rows = steps.map((s, i) => {
      const just = at(s.end + 150), settled = at(s.end + 1000);
      return fig(save(just, `scroll-${i}-a.jpg`), `step ${i + 1} · just stopped`) + fig(save(settled, `scroll-${i}-b.jpg`), `step ${i + 1} · settled${just === settled ? ' · no change' : ''}`, just === settled ? 'same' : '');
    });
    await render('film-scroll', `<h1>${path} · ${W}px · scrolling ${Math.round(H * 0.75)}px at a time</h1><div class="g" style="grid-template-columns:repeat(${W < 600 ? 6 : 4},1fr)">${rows.join('')}</div>`);
  }

  // --video: play the frames into a canvas and record it, in the browser, so nothing needs installing
  if (a.video) {
    const list = frames.filter((f) => f.t >= 0).slice(0, 900);
    mkdirSync(join(out, 'frames'), { recursive: true });
    list.forEach((f, i) => writeFileSync(join(out, 'frames', `${i}.jpg`), Buffer.from(f.data, 'base64')));
    write(join(out, 'frames', 'make.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas>`);
    const rec = await browser.newPage({ width: 800, height: 600 });
    await rec.goto(`${shots.url}/frames/make.html`);
    video = await rec.eval(`(async () => {
      if (!window.MediaRecorder) return null;
      const times = ${JSON.stringify(list.map((f) => Math.round(f.t)))};
      const imgs = await Promise.all(times.map((_, i) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = i + '.jpg'; })));
      const c = document.getElementById('c'), ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      const type = ['video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type) return null;
      const r = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
      const chunks = []; r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((ok) => (r.onstop = ok));
      r.start(); const t0 = performance.now();
      for (let i = 0; i < imgs.length; i++) {
        const wait = times[i] - (performance.now() - t0);
        if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
        if (imgs[i]) ctx.drawImage(imgs[i], 0, 0, c.width, c.height);
      }
      await new Promise((ok) => setTimeout(ok, 600));
      r.stop(); await stopped;
      const blob = new Blob(chunks, { type: 'video/webm' });
      return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    })()`);
    await rec.close();
    rmSync(join(out, 'frames'), { recursive: true, force: true });
    if (video) writeFileSync(join(out, 'film.webm'), Buffer.from(video, 'base64'));
    else notes.push('This browser cannot record video; the strips hold the same frames.');
  }
  await shots.close();
} finally {
  await browser.close();
  await site.close();
}

// --- what the recording says ---
const moves = film.moves.filter((m) => !(m.kind === 'transition' && m.ms <= 1));
const kinds = (k) => moves.filter((m) => m.kind === k).length;
// When the first screen settles: the end of the last move that began while loading, from the page's own clock and
// counted from the first paint, like the headline. Screencast frames arrive unevenly under load, so they only
// draw the strips.
const painted = film.painted || 0;
const loadMoves = [
  ...moves.filter((m) => !m.forever && m.at <= loadEnd).map((m) => m.at + m.ms),
  ...film.scripted.filter((s) => s.first <= loadEnd).map((s) => Math.min(s.last, loadEnd)),
];
const settledAt = loadMoves.length ? Math.max(painted, ...loadMoves) : painted;
const stillMoving = settledAt > loadEnd - 50;
const settle = Math.max(0, settledAt - painted) / 1000;

if (!a.reduced) {
  // counted from the first paint, so a slow server or a cold cache doesn't count against the design
  const wait = film.readable === null ? null : Math.max(0, film.readable - (film.painted || 0)) / 1000;
  if (wait === null) notes.push('The h1 never counted as readable (no h1 on the first screen, or it never stops moving).');
  else if (wait > 2) findings.push({ level: 'fail', rule: 'slow-headline', text: `The headline is readable only ${wait.toFixed(1)} s after the page appears. People read first: start it visible, or make its entrance much shorter.` });
  else if (wait > 1) findings.push({ level: 'warn', rule: 'slow-headline', text: `The headline is readable ${wait.toFixed(1)} s after the page appears. Over a second feels like waiting; shorten the entrance unless the brief chose a showpiece.` });
  else notes.push(`Headline readable ${wait.toFixed(2)} s after the page appears.`);
}

const cls = film.shifts.reduce((s, x) => s + x.value, 0);
const shiftFrom = [...new Set(film.shifts.flatMap((s) => s.from))].slice(0, 4).join(', ');
if (cls > 0.1) findings.push({ level: 'fail', rule: 'layout-shift', text: `Things jump while the page loads or scrolls (layout shift ${cls.toFixed(3)}, over 0.1). Give images, embeds and late content their size up front.`, where: shiftFrom });
else if (cls > 0.02) findings.push({ level: 'warn', rule: 'layout-shift', text: `Small jumps while loading or scrolling (layout shift ${cls.toFixed(3)}).`, where: shiftFrom });

for (const l of loops.values()) {
  if (!l.big) continue;
  if (a.reduced) findings.push({ level: 'fail', rule: 'reduced-loops', text: `Keeps looping with reduced motion on (${l.label}). Stop it under prefers-reduced-motion.`, where: l.el });
  else if (l.pause) notes.push(`Loops forever, with a pause button next to it: ${l.label} on ${l.el}.`);
  else findings.push({ level: 'warn', rule: 'forever', text: `Moves forever (${l.label}). Anything that moves for more than 5 s beside text needs a pause control, or must stop on its own (WCAG 2.2.2).`, where: l.el });
}

if (a.reduced) {
  const slid = new Map();
  for (const m of moves) if (m.ms > 1 && !m.forever && m.props.some((p) => MOVES.test(p))) slid.set(m.el + '|' + m.label, m);
  for (const s of film.scripted) if (s.props.some((p) => MOVES.test(p))) slid.set(s.el + '|script', { el: s.el, label: `a script changed it ${s.n} times`, props: s.props, ms: s.last - s.first });
  for (const m of slid.values()) findings.push({ level: 'fail', rule: 'reduced-moves', text: `Still moves with reduced motion on: ${m.label || m.kind} (${m.props.filter((p) => MOVES.test(p)).join(', ')}, ${Math.round(m.ms)} ms). Keep fades; drop the sliding, growing and turning.`, where: m.el });
}

for (const d of offscreen) findings.push({ level: 'warn', rule: 'offscreen-loop', text: `Still redraws ${d.rate} times a second while scrolled out of sight. Pause the drawing loop when it leaves the screen (IntersectionObserver) to save battery.`, where: d.el });
if (rafAtBottom > 20 && !offscreen.length) notes.push(`At the bottom of the page scripts still ask for ${rafAtBottom} frames a second, but no canvas off screen is drawing (often an animation library's clock).`);

const long = film.gaps.filter((g) => g > 50).length;
if (film.gaps.length) {
  const share = long / film.gaps.length;
  if (share > 0.25) findings.push({ level: 'warn', rule: 'janky', text: `${long} of ${film.gaps.length} frames while scrolling took over 50 ms: scrolling stutters. Look for heavy scroll handlers, big blurs or filters, and canvases that redraw everything.` });
  notes.push(`Smoothness while scrolling: ${long} of ${film.gaps.length} frames slower than 50 ms.`);
}
if (stillMoving) notes.push(`The first screen is still moving ${SECONDS} s after the page starts loading (a long intro, or something that keeps starting new moves).`);
else notes.push(`The first screen settles ${settle.toFixed(2)} s after it appears.`);
if (!a.reduced && settle > 1.5) findings.push({ level: 'warn', rule: 'slow-entrance', text: `The first screen keeps moving for ${stillMoving ? `over ${settle.toFixed(1)}` : settle.toFixed(1)} s after it appears. Keep the hero's entrance under 1.5 s (motion.md), unless the brief chose a showpiece.` });
notes.push(`Moved: ${kinds('css animation')} CSS animations, ${kinds('transition')} transitions, ${kinds('animate()')} animate() calls, ${film.scripted.length} things moved by script.`);

// the timeline, grouped: one line per kind of move on one kind of element
const groups = new Map();
for (const m of moves) {
  const k = `${m.kind}|${m.label}|${m.el}`;
  const g = groups.get(k) || { ...m, count: 0 };
  g.count++;
  groups.set(k, g);
}
for (const s of film.scripted) groups.set(`script|${s.el}`, { at: s.first, kind: 'script', el: s.el, label: `${s.n} style changes`, ms: s.last - s.first, props: s.props, count: 1 });
const timeline = [...groups.values()].sort((x, y) => x.at - y.at).slice(0, 60);
const row = (g) => `| ${(g.at / 1000).toFixed(2)} s | ${g.kind} | ${g.el}${g.count > 1 ? ` ×${g.count}` : ''} | ${g.label || ''} | ${g.forever ? 'forever' : `${Math.round(g.ms)} ms`} | ${g.props.slice(0, 4).join(', ')} |`;
const outputs = ['film-load.jpg', ...(steps.length ? ['film-scroll.jpg'] : []), ...(video ? ['film.webm'] : [])].map((f) => join(out, f));
write(join(out, 'film.md'), [
  `# How ${path} moves at ${W}px${a.reduced ? ', reduced motion' : ''}`,
  '',
  outputs.map((f) => `- ${f}`).join('\n'),
  '',
  '| starts | kind | on | what | lasts | changes |',
  '|---|---|---|---|---|---|',
  ...timeline.map(row),
  ...(groups.size > timeline.length ? ['', `…and ${groups.size - timeline.length} more.`] : []),
  '',
].join('\n'));

const md = report(`Film: ${target}${path}`, findings, [`Strips: ${outputs.join(', ')}`, `Timeline: ${join(out, 'film.md')}`, ...notes]);
write(join(out, 'report.md'), md);
write(join(out, 'report.json'), { target, path, width: W, reduced: !!a.reduced, painted: film.painted, readable: film.readable, settle, stillMoving, layoutShift: cls, shifts: film.shifts, findings, timeline });
process.exit(findings.some((f) => f.level === 'fail') ? 1 : 0);
