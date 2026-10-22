import '@fontsource-variable/schibsted-grotesk';
import './tokens.css';
import './base.css';
import './style.css';
import { initTheme } from './addons/theme.js';
import { initEffects } from './addons/effects.js';

document.documentElement.setAttribute('data-ready', ''); // tells the safety timer in index.html that scripts run

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 600px)');
const touch = matchMedia('(pointer: coarse)');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// one polite voice for screen readers: "Copied", "Question 2 of 4"
const say = (() => {
  const el = document.createElement('p');
  el.className = 'visually-hidden';
  el.setAttribute('aria-live', 'polite');
  document.body.append(el);
  return (text) => { el.textContent = ''; setTimeout(() => (el.textContent = text), 60); };
})();

// [data-reveal] blocks arrive once as they scroll into view
const reveals = $$('[data-reveal]');
if (reduced || !('IntersectionObserver' in window)) reveals.forEach((el) => el.classList.add('is-in'));
else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  reveals.forEach((el) => io.observe(el));
}

$('.skip')?.addEventListener('click', () => $('#main')?.focus());
initTheme($('.theme-toggle'));
initEffects();

// ---------- the film: once the page has loaded it plays muted while it is on screen and pauses off screen, once
// through (nothing loops). With reduced motion or Save-Data it waits on its poster for a press. ----------
const film = $('[data-film]');
if (film) initFilm(film);

function initFilm(f) {
  const video = $('video', f), play = $('.film-play', f), playLabel = $('.film-play-label', f);
  const controls = $('.film-controls', f), pause = $('[data-film-pause]', f), sound = $('[data-film-sound]', f);
  const sources = $$('source', video), poster = video.getAttribute('poster');
  const net = navigator.connection || {};
  const auto = !reduced && !net.saveData && !/2g$/.test(net.effectiveType || '');
  let wanted = false, seen = !('IntersectionObserver' in window), chosen = null;

  const sync = () => {
    const go = wanted && seen && !document.hidden;
    if (go && video.paused) video.play().catch(() => { wanted = false; play.hidden = false; });
    else if (!go && !video.paused) video.pause();
  };
  // the copy for this screen, by the same media queries as the CSS (so it also works where <source media> doesn't)
  const pick = () => {
    const s = sources.find((x) => !x.media || matchMedia(x.media).matches);
    if (!s || s === chosen) return;
    const at = chosen ? video.currentTime : 0;
    chosen = s;
    video.poster = s.dataset.poster || poster;
    video.src = s.src;
    if (at) video.addEventListener('loadedmetadata', () => { video.currentTime = at; sync(); }, { once: true });
  };
  pick();
  for (const s of sources) if (s.media) matchMedia(s.media).addEventListener('change', pick);

  video.controls = false;
  play.hidden = auto;
  video.addEventListener('play', () => { play.hidden = true; controls.hidden = false; pause.textContent = 'Pause'; });
  video.addEventListener('pause', () => { if (!video.ended) pause.textContent = 'Play'; });
  video.addEventListener('ended', () => {
    wanted = false;
    controls.hidden = true;
    playLabel.textContent = 'Play again';
    play.hidden = false;
  });
  play.addEventListener('click', () => {
    wanted = true;
    if (video.ended) video.currentTime = 0;
    video.play().then(() => pause.focus(), () => {});
  });
  pause.addEventListener('click', () => { wanted = video.paused; sync(); });
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    sound.setAttribute('aria-pressed', String(!video.muted));
  });
  document.addEventListener('visibilitychange', sync);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { seen = e.intersectionRatio >= 0.24; sync(); }, { threshold: [0, 0.25] }).observe(video);
  }
  // after the page's own pictures and fonts, so the film never holds up the first screen
  const start = () => { if (auto) { wanted = true; sync(); } };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

// ---------- the three looks in Why: each picture becomes a button; pressing one keeps it in front (the CSS brings
// a card forward on hover and keyboard focus too), pressing it again lets it back into the stack ----------
for (const fan of $$('.looks-fan')) {
  const cards = $$('img', fan).map((img) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fan-card';
    b.setAttribute('aria-pressed', 'false');
    img.replaceWith(b);
    b.append(img);
    return b;
  });
  fan.setAttribute('role', 'group');
  fan.setAttribute('aria-label', 'The three looks: press one to bring it to the front');
  for (const b of cards) b.addEventListener('click', () => {
    const front = b.getAttribute('aria-pressed') !== 'true';
    cards.forEach((c) => c.setAttribute('aria-pressed', String(front && c === b)));
  });
}

// ---------- the six sites: tabs beside one window, the real site running in it ----------
const gallery = $('[data-gallery]');
const showRun = gallery ? initGallery(gallery) : () => {};

function initGallery(g) {
  const tablist = $('.runs-tabs', g), runs = $$('.run', g), tabs = $$('[role="tab"]', tablist);
  const viewSwitch = $('.view-switch');
  if (!tablist || !runs.length) return () => {};
  g.classList.add('is-tabs');
  tablist.hidden = false;
  viewSwitch.hidden = false;
  runs.forEach((r) => { r.setAttribute('role', 'tabpanel'); r.tabIndex = -1; });
  // a tap on a live site that the page scrolls past lets you scroll inside it
  runs.forEach((r) => $('.stage', r).addEventListener('click', (e) => {
    const stage = e.currentTarget;
    if (!touch.matches || !frame || !r.contains(frame) || stage.classList.contains('is-held') || e.target.closest('.live-state')) return;
    stage.classList.add('is-held');
    state(r);
  }));

  let current = 0, view = narrow.matches ? 'phone' : 'desktop', visible = false, wantLive = !reduced, frame = null;
  const size = () => (view === 'phone' ? [390, 844] : [1440, 900]);

  const fit = () => {
    if (!frame) return;
    const screen = frame.parentElement;
    frame.style.setProperty('--k', String(screen.clientWidth / size()[0]));
  };
  const resize = new ResizeObserver(fit);

  // the pill in the corner: live or a still, and the way to switch
  const state = (run) => {
    let pill = $('.live-state', run);
    if (!pill) { pill = document.createElement('p'); pill.className = 'live-state'; $('.stage', run).append(pill); }
    const stage = $('.stage', run);
    if (frame && frame.isConnected && run.contains(frame)) {
      if (!touch.matches) { pill.textContent = 'The live site: scroll inside it'; return; }
      // a finger on a live site would scroll it instead of the page, so the page scrolls past until you ask
      const held = stage.classList.contains('is-held');
      pill.textContent = held ? 'Scrolling the site. ' : 'The live site. ';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = held ? 'Done' : 'Scroll inside it';
      b.addEventListener('click', () => { stage.classList.toggle('is-held'); state(run); });
      pill.append(b);
    } else {
      pill.textContent = 'A still picture. ';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Load the live site';
      b.addEventListener('click', () => { wantLive = true; mount(); b.closest('.stage')?.querySelector('iframe')?.focus(); });
      pill.append(b);
    }
  };

  function unmount() {
    if (!frame) return;
    resize.disconnect();
    const run = frame.closest('.run');
    run?.querySelector('.stage')?.classList.remove('is-held');
    frame.remove();
    frame = null;
    if (run) state(run);
  }
  function mount() {
    const run = runs[current];
    unmount();
    if (!wantLive || !visible) return state(run);
    const [w, h] = size();
    const screen = $('.screen', run);
    frame = document.createElement('iframe');
    frame.className = 'live';
    frame.src = run.dataset.src;
    frame.title = `${$('h3', run).textContent}, the live site`;
    frame.width = w;
    frame.height = h;
    frame.addEventListener('load', () => {
      // a phone draws its scrollbar over the page, so the window does too
      try { frame.contentDocument.documentElement.style.scrollbarWidth = 'none'; } catch { /* another origin: leave it */ }
      frame?.classList.add('is-on');
    }, { once: true });
    screen.append(frame);
    resize.observe(screen);
    fit();
    state(run);
  }

  function select(i, { focus = false } = {}) {
    current = (i + runs.length) % runs.length;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === current)); t.tabIndex = k === current ? 0 : -1; });
    runs.forEach((r, k) => { r.hidden = k !== current; });
    if (focus) tabs[current].focus();
    // on a phone the tabs are one row that scrolls sideways: bring the chosen one into it, never move the page
    if (tablist.scrollWidth > tablist.clientWidth) {
      const t = tabs[current];
      tablist.scrollTo({ left: t.offsetLeft - (tablist.clientWidth - t.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
    }
    mount();
  }
  tabs.forEach((t, k) => t.addEventListener('click', () => select(k)));
  tablist.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); select(current + step, { focus: true }); }
    if (e.key === 'Home') { e.preventDefault(); select(0, { focus: true }); }
    if (e.key === 'End') { e.preventDefault(); select(runs.length - 1, { focus: true }); }
  });

  const setView = (v) => {
    view = v;
    g.classList.toggle('is-phone', v === 'phone');
    $$('button', viewSwitch).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    mount();
  };
  $$('button', viewSwitch).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // the live site only runs while the window is on screen; it starts again (entrance and all) when it comes back
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !frame) mount();
    else if (!visible) unmount();
  }, { rootMargin: '120px 0px' }).observe($('.runs', g));

  setView(view);
  select(0);
  return (name, { instant = false } = {}) => {
    const i = runs.findIndex((r) => r.dataset.name === name);
    if (i < 0) return;
    select(i);
    g.scrollIntoView({ behavior: reduced || instant ? 'auto' : 'smooth', block: 'start' });
    tabs[i].focus({ preventScroll: true });
  };
}

// "Show it running" elsewhere on the page opens that site in the gallery
for (const b of $$('[data-show-run]')) {
  if (!gallery) continue;
  b.hidden = false;
  b.addEventListener('click', () => showRun(b.dataset.showRun));
}

// a link to #run-<name> (the README's "See the run") opens that site's tab; any other hash, or none, moves nothing
if (gallery) {
  const fromHash = (instant) => {
    const m = /^#run-([a-z0-9-]+)$/.exec(location.hash);
    if (m) showRun(m[1], { instant });
    return !!m;
  };
  if (fromHash(true)) {
    // the browser's own jump to the fragment, or a reload's remembered place, can land after this: the gallery has
    // the last word at load, unless the visitor has scrolled or typed by then
    history.scrollRestoration = 'manual';
    let moved = false;
    for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, () => { moved = true; }, { once: true, passive: true });
    addEventListener('load', () => { if (!moved) gallery.scrollIntoView({ block: 'start' }); }, { once: true });
  }
  addEventListener('hashchange', () => fromHash(false));
}

// ---------- try the first four questions ----------
const quiz = $('[data-quiz]');
if (quiz && gallery) initQuiz(quiz);

function initQuiz(q) {
  const steps = $$('.q', q), result = $('[data-result]', q), bar = $('[data-quiz-bar]', q);
  const picks = [];
  let now = 0;
  q.classList.add('is-live');

  // what each example's answers say, read from its address bar
  const read = (text) => {
    const t = text.toLowerCase();
    return {
      purpose: /me and my work/.test(t) ? 'me' : /small business/.test(t) ? 'business' : /redesign/.test(t) ? 'redesign'
        : /product|\bapp\b/.test(t) ? 'product' : /event|launch/.test(t) ? 'event' : '',
      feel: (t.match(/\b(quiet|bold|warm|night)\b/) || [])[1] || '',
      colour: /pick colours for me|pick them/.test(t) ? 'pick' : /black and white/.test(t) ? 'bw' : /palettes/.test(t) ? 'show'
        : /colour|color|logo|keep our/.test(t) ? 'brand' : '',
      motion: /no motion|\bstill\b/.test(t) ? 'still' : /showpiece/.test(t) ? 'showpiece' : /lively/.test(t) ? 'lively' : /gentle/.test(t) ? 'gentle' : '',
    };
  };
  const LEVEL = { still: 0, gentle: 1, lively: 2, showpiece: 3 };
  const examples = $$('.run', gallery).map((r) => ({
    name: r.dataset.name, title: $('h3', r).textContent, answers: $('.address', r).textContent.replace(/^Answers:\s*/, '').trim(),
    shot: $('img.desk', r)?.getAttribute('src'), ...read($('.address', r).textContent),
  }));

  const show = (n) => {
    now = n;
    steps.forEach((s, k) => s.classList.toggle('is-now', k === n));
    result.classList.toggle('is-now', n === steps.length);
  };
  const paint = () => {
    bar.classList.toggle('is-empty', !picks.length);
    if (!picks.length) { bar.textContent = 'Your answers go here'; return; }
    bar.replaceChildren(...picks.map((p, k) => {
      const s = document.createElement('span');
      s.className = 'ans' + (k === picks.length - 1 ? ' is-new' : '');
      s.textContent = p.label;
      return s;
    }));
  };

  for (const [k, step] of steps.entries()) {
    for (const b of $$('button', step)) {
      b.addEventListener('click', () => {
        $$('button', step).forEach((x) => x.classList.toggle('is-picked', x === b));
        picks[k] = { key: step.dataset.q, v: b.dataset.v, label: b.firstChild.textContent.trim() };
        picks.length = k + 1;
        paint();
        setTimeout(() => {
          if (k + 1 < steps.length) {
            show(k + 1);
            say(`Question ${k + 2} of ${steps.length}: ${$('legend', steps[k + 1]).lastChild.textContent.trim()}`);
            $('button', steps[k + 1]).focus({ preventScroll: true });
          } else finish();
        }, reduced ? 0 : 200);
      });
    }
  }

  function finish() {
    const mine = Object.fromEntries(picks.map((p) => [p.key, p.v]));
    const score = (e) => {
      let s = 0;
      const shared = [];
      if (e.purpose === mine.purpose) { s += 4; shared.push('what it’s for'); }
      else if (mine.purpose === 'business' && e.purpose === 'redesign') { s += 3; shared.push('what it’s for'); }
      if (e.feel && e.feel === mine.feel) { s += 3; shared.push('the feel'); }
      if (e.motion === mine.motion) { s += 2; shared.push('the motion'); }
      else if (e.motion && Math.abs(LEVEL[e.motion] - LEVEL[mine.motion]) === 1) s += 1;
      if (e.colour === mine.colour) { s += 1; shared.push('the colours'); }
      return { s, shared };
    };
    const ranked = examples.map((e) => ({ e, ...score(e) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
    $('[data-result-name]', q).textContent = best.e.title;
    $('[data-result-why]', q).textContent = (mine.purpose === 'product' ? 'None of the six is a product page yet. Nearest by the rest of your answers. ' : '')
      + `Its answers: ${best.e.answers}. `
      + (best.shared.length === 4 ? 'All four match yours.' : best.shared.length ? `It shares ${list(best.shared)} with yours.` : 'It shares no answer with yours; it’s the nearest of the six.');
    const img = $('[data-result-shot]', q);
    if (best.e.shot) { img.src = best.e.shot; img.alt = `${best.e.title} at desktop width`; img.hidden = false; }
    $('[data-result-open]', q).onclick = () => showRun(best.e.name);
    show(steps.length);
    result.focus({ preventScroll: true });
    say(`Closest of the six: ${best.e.title}`);
  }

  $('[data-restart]', q).addEventListener('click', () => {
    picks.length = 0;
    $$('.is-picked', q).forEach((b) => b.classList.remove('is-picked'));
    paint();
    show(0);
    $('button', steps[0]).focus();
  });
  paint();
  show(0);
}

// ---------- before and after: drag the line ----------
const compare = $('[data-compare]');
if (compare) {
  const range = $('.compare-range', compare);
  range.hidden = false;
  const set = (v) => compare.style.setProperty('--cut', `${v}%`);
  range.addEventListener('input', () => set(range.value));
  // once, when it first comes into view, the line sweeps across so it's clear it moves
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), from = 88, to = 50, ms = 1100;
      const ease = (x) => 1 - (1 - x) ** 3;
      const tick = (t) => {
        const x = Math.min(1, (t - t0) / ms);
        const v = from + (to - from) * ease(x);
        set(v.toFixed(2));
        range.value = Math.round(v);
        if (x < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(compare);
  }
}

// ---------- copy buttons ----------
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
for (const b of $$('[data-copy]')) {
  b.hidden = false;
  const label = $('span', b);
  b.addEventListener('click', async () => {
    const code = b.parentElement.querySelector('code');
    const text = code.textContent.trim();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* no clipboard: select it instead */ }
    if (!ok) {
      const range = document.createRange();
      range.selectNodeContents(code);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
    label.textContent = ok ? 'Copied' : isMac ? 'Press ⌘C' : 'Press Ctrl+C';
    b.classList.toggle('is-done', ok);
    say(ok ? `Copied: ${text}` : 'Selected. Copy it with your keyboard.');
    clearTimeout(b.timer);
    b.timer = setTimeout(() => { label.textContent = 'Copy'; b.classList.remove('is-done'); }, 2200);
    // in the Install panel: point at what to do next
    const next = b.closest('.routes') && $('[data-next] li');
    if (ok && next) next.classList.add('is-next');
  });
}

// ---------- Install: one button opens every route ----------
const routes = $('#routes');
if (routes && typeof HTMLDialogElement === 'function') initInstall(routes);

function initInstall(panel) {
  const dlg = document.createElement('dialog');
  dlg.className = 'install-dialog';
  dlg.setAttribute('aria-labelledby', 'routes-h');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dialog-close';
  close.textContent = 'Close';
  dlg.append(close, panel);
  document.body.append(dlg);

  // the four routes become tabs
  const list = [...panel.querySelectorAll('.route')];
  const tabs = document.createElement('div');
  tabs.className = 'route-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Ways to install');
  const buttons = list.map((r, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = `${r.id}-tab`;
    b.setAttribute('aria-controls', r.id);
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = $('h4', r).firstChild.textContent.trim();
    const what = document.createElement('span');
    what.className = 'tab-what';
    what.textContent = $('.route-for', r).textContent.replace(/[:.]$/, '');
    b.append(name, what);
    r.setAttribute('role', 'tabpanel');
    r.setAttribute('aria-labelledby', b.id);
    b.addEventListener('click', () => pick(k));
    return b;
  });
  tabs.append(...buttons);
  $('.routes-head', panel).after(tabs);
  let now = 0;
  function pick(k, focus = false) {
    now = (k + list.length) % list.length;
    buttons.forEach((b, i) => { b.setAttribute('aria-selected', String(i === now)); b.tabIndex = i === now ? 0 : -1; });
    list.forEach((r, i) => { r.hidden = i !== now; });
    if (focus) buttons[now].focus();
  }
  tabs.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); pick(now + step, true); }
  });
  pick(0);

  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  function open(from) {
    if (dlg.open) return;
    dlg.showModal();
    if (reduced || !dlg.animate) { dlg.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
    // the panel grows out of the button that was pressed: the pink button becomes the panel's pink head
    const d = dlg.getBoundingClientRect();
    const r = from?.getBoundingClientRect?.() || { left: d.left + d.width / 2 - 60, top: d.top + d.height / 2 - 24, width: 120, height: 48 };
    const dx = r.left + r.width / 2 - (d.left + d.width / 2), dy = r.top + r.height / 2 - (d.top + d.height / 2);
    dlg.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${r.width / d.width}, ${r.height / d.height})`, borderRadius: '40px', backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent') },
      { transform: 'none', borderRadius: '20px' },
    ], { duration: 520, easing: ease });
    try { dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, pseudoElement: '::backdrop' }); } catch { /* older browsers: no fade */ }
    [close, ...panel.children].forEach((el, k) => el.animate(
      [{ opacity: 0, translate: '0 14px' }, { opacity: 1, translate: '0 0' }],
      { duration: 420, delay: 200 + k * 55, easing: ease, fill: 'backwards' },
    ));
  }
  function shut() {
    if (!dlg.open) return;
    if (reduced || !dlg.animate) return dlg.close();
    dlg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 170, easing: 'ease-out' }).finished.then(() => dlg.close());
  }
  close.addEventListener('click', shut);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) shut(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); shut(); });

  for (const el of $$('[data-install]')) {
    el.addEventListener('click', (e) => { e.preventDefault(); open(el); });
  }
  // a link straight to the panel: …/#install
  if (/^#(install|routes)$/.test(location.hash)) open(null);
}
