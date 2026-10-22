// Small effects for "Lively" and "Showpiece" sites, with no library. Put the attribute on an element; each runs
// once when it scrolls into view, and each is off (the element simply shown) with reduced motion.
//
//   <h1 data-split>Bread at seven</h1>               words rise into place one after another
//   <h2 data-split="chars">Patch Night</h2>          the same, letter by letter (short headlines only)
//   <span data-count>1,250</span>                     the number counts up from 0 (write the real number)
//   <svg data-draw>…</svg>                            the SVG's lines draw themselves
//   <img data-mask src=… alt=…>                       the picture wipes in (data-mask="down|left|right" for direction)
//   <div data-marquee><span>…</span>…</div>           an endless row (logos, words), with a pause button
//   <a class="button" data-magnetic>…</a>             leans towards the mouse
//   <article data-tilt>…</article>                    tilts towards the mouse, like a card in the hand
//
// Plus a soft cross-fade between pages (CSS, where the browser supports it) and swap(fn) for in-page changes.
// Timing: style="--fx-t: 1.2s" on any of them. Use two or three kinds on a site, not all of them.
import './effects.css';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
const WORDS = { en: { pause: 'Pause', play: 'Play' }, de: { pause: 'Anhalten', play: 'Abspielen' } };

export function initEffects(root = document) {
  if (!reduced) {
    for (const el of root.querySelectorAll('[data-split]')) split(el, el.dataset.split === 'chars');
    for (const el of root.querySelectorAll('[data-count]')) count(el);
    for (const el of root.querySelectorAll('[data-draw]')) draw(el);
    for (const el of root.querySelectorAll('[data-marquee]')) marquee(el);
  }
  if (!reduced && mouse) {
    for (const el of root.querySelectorAll('[data-magnetic]')) follow(el, 'translate', (x, y) => `${x * 0.3}px ${y * 0.3}px`);
    for (const el of root.querySelectorAll('[data-tilt]')) follow(el, 'transform', (x, y, r) => (x || y ? `perspective(900px) rotate3d(${-y / r.height}, ${x / r.width}, 0, ${Math.hypot(x / r.width, y / r.height) * 16}deg)` : ''));
  }
  const shown = root.querySelectorAll('[data-split], [data-count], [data-draw], [data-mask]');
  if (reduced || !('IntersectionObserver' in window)) return shown.forEach((el) => el.classList.add('is-in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  shown.forEach((el) => io.observe(el));
}

// A change on the page (a filter, a tab, a theme) as a cross-fade, where the browser supports it.
export function swap(change) {
  if (reduced || !document.startViewTransition) return change();
  return document.startViewTransition(change);
}

// The words go into spans for the movement; screen readers get the sentence once, whole.
function split(el, chars) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) { walk(child); continue; }
      if (child.nodeType !== 3) continue;
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(' '); continue; }
        const word = document.createElement('span');
        word.className = 'fx-w';
        for (const piece of chars ? [...part] : [part]) {
          const p = document.createElement('span');
          p.className = 'fx-p';
          p.style.setProperty('--fx-i', i++);
          p.textContent = piece;
          word.append(p);
        }
        frag.append(word);
      }
      child.replaceWith(frag);
    }
  };
  walk(el);
  if (el.querySelector('a, button, input, select, textarea, [tabindex]')) return el.classList.add('fx-ready'); // never hide what can take focus
  const seen = document.createElement('span');
  seen.setAttribute('aria-hidden', 'true');
  seen.append(...el.childNodes);
  const said = document.createElement('span');
  said.className = 'fx-sr';
  said.textContent = text;
  el.append(said, seen);
  el.classList.add('fx-ready');
}

// "1,250", "€ 4.90", "98 %": the number counts up, in the page's own number format; the rest stays.
function count(el) {
  const m = el.textContent.match(/^(\D*?)(\d[\d.,\s]*\d|\d)(.*)$/s);
  if (!m) return;
  const lang = document.documentElement.lang || 'en';
  const [, before, digits, after] = m;
  const sep = new Intl.NumberFormat(lang).format(1.5).charAt(1); // the decimal separator for this language
  const clean = digits.replace(/\s/g, '');
  const dot = clean.lastIndexOf(sep);
  const decimals = dot >= 0 && clean.length - dot - 1 < 3 ? clean.length - dot - 1 : 0;
  const value = parseFloat(decimals ? clean.slice(0, dot).replace(/\D/g, '') + '.' + clean.slice(dot + 1) : clean.replace(/\D/g, ''));
  if (!Number.isFinite(value)) return;
  const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: /[.,\s]/.test(digits.replace(sep, '')) || clean.length > 4 });
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  const said = document.createElement('span');
  said.className = 'fx-sr';
  said.textContent = el.textContent;
  shown.textContent = before + fmt.format(0) + after;
  el.replaceChildren(said, shown);
  const ms = duration(el, 1400);
  new MutationObserver((_, obs) => {
    if (!el.classList.contains('is-in')) return;
    obs.disconnect();
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      shown.textContent = before + fmt.format(value * (1 - (1 - k) ** 3)) + after;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).observe(el, { attributes: true, attributeFilter: ['class'] });
}

// --fx-t as milliseconds: "1.2s" or "800ms"
function duration(el, fallback) {
  const v = getComputedStyle(el).getPropertyValue('--fx-t').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : fallback;
}

function draw(svg) {
  let i = 0;
  for (const line of svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect')) {
    if (getComputedStyle(line).stroke === 'none') continue;
    line.setAttribute('pathLength', '1');
    line.classList.add('fx-line');
    line.style.setProperty('--fx-i', i++);
  }
}

// Two copies of the row side by side, moved by half its width: an endless loop with no seam. Moving content
// needs a way to stop it (WCAG 2.2.2), so a pause button goes right after it.
function marquee(el) {
  const items = [...el.children];
  const set = document.createElement('div');
  set.className = 'fx-set';
  set.append(...items);
  const track = document.createElement('div');
  track.className = 'fx-track';
  track.append(set);
  el.append(track);
  el.classList.add('fx-ready');
  for (let n = 0; set.scrollWidth < el.clientWidth && n < 12; n++) {
    for (const item of items) { const c = item.cloneNode(true); c.classList.add('fx-copy'); c.setAttribute('aria-hidden', 'true'); set.append(c); }
  }
  const copy = set.cloneNode(true);
  copy.classList.add('fx-copy');
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a, button, input, [tabindex]').forEach((x) => x.setAttribute('tabindex', '-1'));
  track.append(copy);
  el.style.setProperty('--fx-t', `${set.offsetWidth / (+el.dataset.speed || 60)}s`);

  const w = WORDS[(document.documentElement.lang || 'en').slice(0, 2)] || WORDS.en;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fx-pause';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = w.pause;
  button.addEventListener('click', () => {
    const paused = el.classList.toggle('fx-paused');
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? w.play : w.pause;
  });
  el.after(button);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => el.classList.toggle('fx-away', !e.isIntersecting)).observe(el);
}

// Ease towards the pointer while it is over the element, back to rest when it leaves.
// The ease runs here, frame by frame, and not as a CSS transition: a transition on the element would replace its
// own (a button's hover colour and press). It stops as soon as the element is back in place.
function follow(el, prop, value) {
  let x = 0, y = 0, tx = 0, ty = 0, r, frame = 0;
  const step = () => {
    x += (tx - x) * 0.2;
    y += (ty - y) * 0.2;
    const still = Math.abs(tx - x) < 0.2 && Math.abs(ty - y) < 0.2;
    if (still) { x = tx; y = ty; }
    el.style[prop] = x || y ? value(x, y, r) : '';
    frame = still ? 0 : requestAnimationFrame(step);
  };
  const go = () => { frame ||= requestAnimationFrame(step); };
  el.addEventListener('pointermove', (e) => {
    r = el.getBoundingClientRect();
    tx = e.clientX - r.left - r.width / 2;
    ty = e.clientY - r.top - r.height / 2;
    go();
  });
  el.addEventListener('pointerleave', () => { tx = 0; ty = 0; go(); });
}
