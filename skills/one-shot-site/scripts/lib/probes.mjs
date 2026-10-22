// Measurements that run inside the page. Each function is sent to the browser as source text,
// so it must not use anything from this module's scope.
import { inflateSync } from 'node:zlib';

// Before the page's own scripts, in every page the checks open (chrome.mjs, safari.mjs): a link, form, script or
// new window that would hand mailto:, tel: or another app's address to the system is stopped, so a check never
// opens the person's mail program, phone app or chat. Chrome passes mailto: on without asking, and no setting
// stops it. Web addresses, file:, data:, blob: and about: go on as usual.
export function appLinkGuard() {
  if (window.__oneShotGuard) return;
  window.__oneShotGuard = true;
  const ok = (u) => { try { return /^(https?|file|data|blob|about|javascript):$/.test(new URL(String(u), location.href).protocol); } catch { return true; } };
  const note = (u) => console.info(`one-shot: not opened, it would start another program: ${String(u).slice(0, 80)}`);
  // this frame's own navigations: links, forms, location.href, meta refresh
  try { navigation.addEventListener('navigate', (e) => { if (!ok(e.destination.url) && e.cancelable) { e.preventDefault(); note(e.destination.url); } }); } catch {}
  // and the ones that would open a new window, which that doesn't see
  addEventListener('click', (e) => {
    const a = e.composedPath().find((n) => n.localName === 'a' || n.localName === 'area');
    if (a?.href && !ok(a.href)) { e.preventDefault(); note(a.href); }
  }, true);
  addEventListener('submit', (e) => {
    const u = e.submitter?.hasAttribute?.('formaction') ? e.submitter.formAction : e.target.action;
    if (!ok(u)) { e.preventDefault(); note(u); }
  }, true);
  const open = window.open;
  window.open = function (u, ...rest) { if (u && !ok(u)) { note(u); return null; } return open.call(this, u, ...rest); };
}

// Scroll through the whole page once, the way a visitor would, so scroll-triggered reveals and lazy
// images fire. Ends back at the top.
export function scrollThrough(stepMs) {
  return new Promise(async (done) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // two frames: the page has really drawn this scroll position, so its observers saw it, even on a busy CPU. At
    // most a second: a machine drawing in software (macOS on CI) went seconds between frames, every step
    const drawn = () => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 1000); });
    const h = innerHeight * 0.7;
    for (let y = 0; y < document.documentElement.scrollHeight - innerHeight + h; y += h) {
      scrollTo({ top: y, behavior: 'instant' });
      await drawn();
      await wait(stepMs);
    }
    scrollTo({ top: 0, behavior: 'instant' });
    await drawn();
    await wait(stepMs * 2);
    done(document.documentElement.scrollHeight);
  });
}

// Wait until what moves on this screen has arrived: CSS animations and transitions that end are done, the effects
// addon's pieces in view are marked .is-in, and its counting numbers show their final value. Endless loops and
// scroll-driven animations don't count. Gives up after capMs. Resolves with the time it waited.
// It looks every 50 ms, not once a frame: a machine that draws in software under load (a CI runner) can go seconds
// between frames, and then the frames alone outlasted the cap with everything long arrived.
export function settle(capMs) {
  return new Promise((done) => {
    const t0 = performance.now();
    const inView = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight * 0.9; };
    const busy = () => document.getAnimations().some((a) => a.playState === 'running' && a.timeline === document.timeline && a.effect?.getTiming().iterations !== Infinity)
      || [...document.querySelectorAll('[data-split], [data-count], [data-draw], [data-mask]')].some((e) => inView(e) && !e.classList.contains('is-in'))
      || [...document.querySelectorAll('[data-count] .fx-ghost')].some((g) => inView(g) && g.nextElementSibling && g.nextElementSibling.textContent !== g.textContent);
    const look = () => {
      if (!busy() || performance.now() - t0 > capMs) done(Math.round(performance.now() - t0));
      else setTimeout(look, 50);
    };
    // two frames first: the page sees where it is scrolled to, its observers fire and the entrances start. When
    // frames are slow in coming, a second is enough of a head start.
    let started = false;
    const go = () => { if (!started) { started = true; look(); } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, Math.min(1000, capMs));
  });
}

// The page's one action, as a visitor meets it on the first screen: a link to the site's own booking or tickets
// address (prefer, from site.json), else the first screen's button, else a phone link there. Run at the top of the
// page. Returns { href, words } or null.
export function firstAction(prefer) {
  const inView = (a) => {
    const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && !a.closest('[hidden], [inert]');
  };
  const words = (a) => (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const links = [...document.querySelectorAll('a[href]')].filter((a) => !/^#?$/.test(a.getAttribute('href').trim()));
  // one address however it is written: a phone number's digits, a mail address without its subject line
  const key = (h) => (/^tel:/i.test(h) ? 'tel:' + h.replace(/[^\d+]/g, '') : /^mailto:/i.test(h) ? h.split('?')[0].toLowerCase() : h.replace(/\/$/, ''));
  for (const p of prefer || []) {
    const a = links.find((x) => key(x.href) === key(new URL(p, location.href).href) && inView(x)) || links.find((x) => key(x.href) === key(new URL(p, location.href).href));
    if (a) return { href: a.href, words: words(a) };
  }
  // (the page's own button before the header's, which often says the same in fewer words)
  const button = (a) => a.matches('.button, .btn, [class*="button"], [class*="btn"], [role="button"]') && inView(a) && !a.closest('nav[aria-label*="skip" i]');
  const b = links.find((a) => button(a) && !a.closest('header, nav, [role="banner"], [role="navigation"]')) || links.find(button)
    || links.find((a) => /^tel:/i.test(a.getAttribute('href')) && inView(a));
  return b ? { href: b.href, words: words(b) } : null;
}

// Whether a link to href is on this screen where a visitor can tap it: its middle in view and nothing drawn over
// it (hit-testing switched on for everything, as in coveredText). For a link to a part of this page (#tickets), the
// screens that show that part count too: the visitor is there.
export function actionInView(href) {
  const key = (h) => (/^tel:/i.test(h) ? 'tel:' + h.replace(/[^\d+]/g, '') : /^mailto:/i.test(h) ? h.split('?')[0].toLowerCase() : h.replace(/\/$/, ''));
  const u = /^https?:/i.test(href) ? new URL(href) : null;
  if (u && u.hash && u.origin + u.pathname === location.origin + location.pathname) {
    const t = document.getElementById(decodeURIComponent(u.hash.slice(1)));
    const r = t?.getBoundingClientRect();
    if (r && r.height > 1 && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= Math.min(r.height, innerHeight) * 0.5) return true;
  }
  const st = document.createElement('style');
  st.textContent = '*{pointer-events:auto!important}';
  document.head.append(st);
  let seen = false;
  for (const a of document.querySelectorAll('a[href]')) {
    if (key(a.href) !== key(href)) continue;
    const r = a.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) continue;
    let o = 1;
    for (let e = a; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    if (o < 0.3 || getComputedStyle(a).visibility === 'hidden') continue;
    // (not look --numbers' badges, nor a full-screen layer such as grain or a backdrop, as in coveredText)
    const hit = document.elementsFromPoint(x, y).find((e) => {
      if (e.closest('[data-oss-numbers]')) return false;
      const b = e.getBoundingClientRect();
      return e === a || a.contains(e) || !(b.width >= innerWidth * 0.9 && b.height >= innerHeight * 0.9 && !e.contains(a));
    });
    if (hit && (hit === a || a.contains(hit))) { seen = true; break; }
  }
  st.remove();
  return seen;
}

// layoutFaults, but "never shown" only counts if it is still true after a slower second pass: on a busy CPU a
// reveal can still be on its way in. Runs in Node, with a page from chrome.mjs.
export async function settledFaults(page, width) {
  const first = await page.call(layoutFaults, width);
  if (!first.some((f) => f.rule === 'never-shown')) return [...first, ...await mediaContrast(page)];
  await page.call(scrollThrough, 450);
  await new Promise((r) => setTimeout(r, 1200));
  const still = new Set((await page.call(layoutFaults, width)).filter((f) => f.rule === 'never-shown').map((f) => f.where));
  return [...first.filter((f) => f.rule !== 'never-shown' || still.has(f.where)), ...await mediaContrast(page)];
}

// A PNG from Chrome (8 bits, RGB or RGBA, not interlaced) -> { w, h, px: RGBA bytes }
export function readPng(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), type = buf[25];
  if (buf[24] !== 8 || ![2, 6].includes(type) || buf[28] !== 0) throw new Error('unexpected PNG');
  const parts = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), kind = buf.toString('latin1', o + 4, o + 8);
    if (kind === 'IDAT') parts.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const rows = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, at = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[at + x - bpp] : 0, b = y ? rows[at - stride + x] : 0, c = x >= bpp && y ? rows[at - stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      rows[at + x] = (raw[src + x] + pred) & 255;
    }
  }
  const px = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < w * h; i++) rows.copy(px, i * 4, i * bpp, i * bpp + 3);
  return { w, h, px };
}

// Text over a still picture (a photo, a drawing, a picture set as a background), measured from the pixels instead
// of left to the eye. layoutFaults marks each such text; here the text is made transparent, the spot behind it is
// shot, and its lines are cut into squares a line tall: the weakest square against the text colour must reach 4.5:1,
// or 3:1 for large text (24px, or 18.66px bold). One finding per picture, the worst text on it. Text over video, a
// canvas or a frame moves, so it stays a note to check by eye. Runs in Node, with a page from chrome.mjs.
export async function mediaContrast(page) {
  // a page that can only run functions (WebKit through Playwright) gets the notes, one per picture
  if (typeof page.shot !== 'function') {
    const notes = await page.call(() => (window.__ossMc || []).map((m) => ({ level: 'warn', rule: 'over-media', text: m.fallback, where: m.where })));
    return notes.filter((f, i) => notes.findIndex((g) => g.text === f.text) === i);
  }
  const marked = await page.eval(`(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    return (window.__ossMc || []).slice(0, 24).map((m) => {
      const el = document.querySelector('[data-oss-mc="' + m.i + '"]');
      if (!el) return null;
      const cs = getComputedStyle(el), size = parseFloat(cs.fontSize);
      return { ...m, color: rgba(cs.color), large: size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700), top: el.getBoundingClientRect().top + scrollY };
    }).filter(Boolean);
  })()`);
  if (!marked.length) return [];
  const out = [];
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const back = await page.eval('scrollY');
  await page.eval(`document.head.insertAdjacentHTML('beforeend', '<style id="oss-mc">[data-oss-mc], [data-oss-mc] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; transition: none !important; }</style>')`);
  const worst = new Map(); // picture -> { r, need, where }
  try {
    for (const m of marked) {
      // the text in the middle of the screen, clear of a sticky header; then its lines as the screen shows them
      const lines = await page.eval(`(async () => {
        const el = document.querySelector('[data-oss-mc="${m.i}"]');
        scrollTo({ top: Math.max(0, ${m.top} - innerHeight / 3), behavior: 'instant' });
        await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 1000); });
        const rects = [];
        for (const n of el.childNodes) {
          if (n.nodeType !== 3 || !n.data.trim()) continue;
          const g = document.createRange(); g.selectNodeContents(n);
          for (const r of g.getClientRects()) {
            const x = Math.max(0, r.left), y = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
            if (right - x >= 4 && bottom - y >= 4) rects.push({ x, y, w: right - x, h: bottom - y });
          }
        }
        return { rects, sy: scrollY };
      })()`);
      if (!lines.rects.length) { if (!out.some((f) => f.text === m.fallback)) out.push({ level: 'warn', rule: 'over-media', text: m.fallback, where: m.where }); continue; }
      const x0 = Math.floor(Math.min(...lines.rects.map((r) => r.x))), y0 = Math.floor(Math.min(...lines.rects.map((r) => r.y)));
      const x1 = Math.ceil(Math.max(...lines.rects.map((r) => r.x + r.w))), y1 = Math.ceil(Math.max(...lines.rects.map((r) => r.y + r.h)));
      const img = readPng(Buffer.from(await page.shot(null, { type: 'png', clip: { x: x0, y: lines.sy + y0, width: x1 - x0, height: y1 - y0 }, beyond: false }), 'base64'));
      let low = Infinity;
      for (const r of lines.rects) {
        const side = Math.max(6, Math.round(r.h));
        for (let px = r.x; px < r.x + r.w; px += side) {
          let sum = [0, 0, 0], n = 0;
          for (let y = Math.floor(r.y - y0); y < Math.min(img.h, r.y - y0 + r.h); y++) {
            for (let x = Math.floor(px - x0); x < Math.min(img.w, px - x0 + side, r.x + r.w - x0); x++) {
              const o = (y * img.w + x) * 4;
              sum = [sum[0] + img.px[o], sum[1] + img.px[o + 1], sum[2] + img.px[o + 2]]; n++;
            }
          }
          if (n < 12) continue;
          const under = sum.map((v) => v / n), a = m.color[3];
          low = Math.min(low, ratio(m.color.slice(0, 3).map((v, i) => v * a + under[i] * (1 - a)), under));
        }
      }
      const need = m.large ? 3 : 4.5;
      if (low < need && (!worst.has(m.media) || low < worst.get(m.media).r)) worst.set(m.media, { r: low, need, where: m.where, large: m.large });
    }
  } finally {
    await page.eval(`document.getElementById('oss-mc')?.remove(); for (const e of document.querySelectorAll('[data-oss-mc]')) e.removeAttribute('data-oss-mc'); scrollTo({ top: ${back}, behavior: 'instant' })`);
  }
  for (const [media, w] of worst) {
    out.push({ level: 'fail', rule: 'over-media', where: w.where, text: `Text on a picture (${media}) measures ${w.r.toFixed(1)}:1 against the picture at its weakest spot, behind ${w.where} (it needs ${w.need}:1${w.large ? ' as large text' : ''}). Give the words a scrim or a solid panel, or move them to a calm part of the picture` });
  }
  return out;
}

// Layout faults a visitor would notice. Returns [{ level: 'fail' | 'warn', rule, text, where }].
// width: the screen width being tested. On an emulated phone, Chrome widens its layout to fit content that is
// too wide (as phones zoom out), so innerWidth would hide exactly the overflow we look for.
export function layoutFaults(width) {
  const out = [];
  const add = (level, rule, text, el) => out.push({ level, rule, text, where: el ? name(el) : '' });
  const W = width || innerWidth;
  const phone = W < 600;

  function name(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const t = (el.innerText || el.getAttribute('aria-label') || el.alt || '').trim().replace(/\s+/g, ' ');
    return t ? `${s} "${t.slice(0, 40)}${t.length > 40 ? '…' : ''}"` : s;
  }

  // any CSS colour (oklch, color-mix, named…) -> [r, g, b, a] in sRGB, via a 1px canvas
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function rgba(c) {
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(c, v);
    return v;
  }
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  // pictures, video and canvases: text drawn over them has no CSS colour behind it, so its contrast
  // can only be judged by eye. Full-screen layers (a 3D stage, a video backdrop) are noted once;
  // smaller ones per piece of text.
  const sy = scrollY;
  const media = [...document.querySelectorAll('canvas, video, img, picture, iframe, svg')].map((m) => {
    const r = m.getBoundingClientRect();
    // something pinned to the screen sits behind every part of the page as it scrolls past
    let pinned = false;
    for (let e = m; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) { pinned = true; break; }
    return { m, top: pinned ? -Infinity : r.top + sy, bottom: pinned ? Infinity : r.bottom + sy, left: r.left, right: r.right, full: r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 };
  }).filter((x) => x.right - x.left > 40 && x.bottom - x.top > 40);
  let fullNoted = false;
  function underMedia(el, r) {
    for (const x of media) {
      if (x.m.contains(el) || el.contains(x.m)) continue;
      if (r.right > x.left && r.left < x.right && r.bottom + sy > x.top && r.top + sy < x.bottom) return x;
    }
    return null;
  }

  // the solid colour behind an element, or null when an image, gradient or video is in the way.
  // A picture set as a CSS background counts as media. A texture on the whole page (body or html) doesn't stop the
  // check: the text is measured on the page's colour under it (on body, or on html when body has none), and the
  // texture is noted once, to be checked by eye. A page image with no colour under it at all can't be measured.
  // text over a still picture is marked here and measured from the pixels afterwards (mediaContrast); the note is
  // what to say when it can't be measured
  for (const e of document.querySelectorAll('[data-oss-mc]')) e.removeAttribute('data-oss-mc');
  const mediaText = [];
  const stillPicture = (m) => ['IMG', 'PICTURE', 'svg'].includes(m.tagName);
  let textureNoted = false, bareNoted = false;
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function backdrop(el, r) {
    const layers = [];
    let solid = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (['VIDEO', 'CANVAS', 'IMG'].includes(e.tagName)) return null;
      if (cs.backgroundImage !== 'none') {
        const page = e === document.body || e === document.documentElement;
        const ground = page && [e, document.documentElement].map((x) => rgba(getComputedStyle(x).backgroundColor)).find((c) => c[3] >= 1);
        if (ground) {
          if (!textureNoted) { textureNoted = true; add('warn', 'over-media', `The whole page has a background image (a texture?) over its colour ${hex(ground)}. Text contrast is measured on ${hex(ground)} as if the image weren't there, so keep the image faint and look at it on a phone`, e); }
        } else if (page) {
          if (!bareNoted) { bareNoted = true; add('warn', 'over-media', 'The whole page has a background image with no background colour under it, so the contrast of its text is not measured. Give html or body a background colour close to the image (it also shows while the image loads), and check every screen by eye', e); }
          return null;
        } else if (/url\(/.test(cs.backgroundImage)) {
          // a small box with a picture is an icon (an arrow on a link, a bullet): the text sits beside it
          const b = e.getBoundingClientRect();
          if (b.width >= 240 && b.height >= 120) {
            mediaText.push({ el, media: e, note: `Text sits on a background picture (${name(e)}); make sure it reads everywhere on it (a scrim or a solid panel helps)` });
            return null;
          }
        } else return null; // a gradient: no single colour to measure against
      }
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) { solid = e !== document.body && e !== document.documentElement; break; } }
    }
    if (!solid) {
      const x = underMedia(el, r);
      if (x && stillPicture(x.m)) { mediaText.push({ el, media: x.m, note: `Text overlaps ${name(x.m)}; make sure it still reads there (move it, or give it a solid or scrim background)` }); return null; }
      if (x && x.full) {
        if (!fullNoted) { fullNoted = true; add('warn', 'over-media', 'Text sits over a full-screen video or canvas, so its contrast can only be checked by eye: look at every screen', x.m); }
        return null;
      }
      if (x) { add('warn', 'over-media', `Text overlaps ${name(x.m)}; make sure it still reads there (move it, or give it a solid or scrim background)`, el); return null; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  function opacity(el) {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    return o;
  }
  // screen-reader-only text, whatever its class name: a box of 1px or less that clips its content
  const srOnly = (el) => {
    for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) {
      const s = getComputedStyle(e);
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || (e.offsetWidth <= 1 && e.offsetHeight <= 1 && s.overflow !== 'visible')) return true;
    }
    return false;
  };
  const hiddenByDesign = (el) => el.closest('[aria-hidden="true"], [hidden], [inert], dialog:not([open]), details:not([open]) > :not(summary), [popover]:not(:popover-open), noscript, .visually-hidden, .sr-only') || srOnly(el);
  // the part of a box that can be seen: cut by every ancestor that clips (a marquee, a carousel)
  const seenPart = (el, r) => {
    let { left, right } = r;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue;
      const b = p.getBoundingClientRect();
      left = Math.max(left, b.left); right = Math.min(right, b.right);
    }
    return { left, right };
  };

  // page wider than the screen
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || (r.right <= W + 1 && r.left >= -1)) return false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o !== 'visible') return false;
      }
      return getComputedStyle(e).position !== 'fixed';
    });
    const outer = wide.filter((e) => !wide.some((o) => o !== e && o.contains(e)));
    // A parent that clips doesn't always hold its child in: a positioned card escapes to a containing block further
    // up. Then the box that reaches furthest out is named, parents or not (the outer one when several reach as far).
    let widest = outer.slice(0, 3).map(name).join(', ');
    if (!widest) {
      let most = 1;
      for (const e of document.body.querySelectorAll('*')) {
        const r = e.getBoundingClientRect();
        const out = Math.max(r.right - W, -r.left);
        if (r.width > 0 && out > most && getComputedStyle(e).position !== 'fixed') { most = out; widest = `${name(e)} at ${Math.round(r.right > W + 1 ? r.right : r.left)}px`; }
      }
    }
    widest ||= 'unknown';
    add('fail', 'overflow-x', `The page is ${sw}px wide on a ${W}px screen, so it scrolls sideways. Widest: ${widest}`);
  }

  // text: contrast, size, edges, things that never appear
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let checked = 0;
  for (let n = walker.nextNode(); n && checked < 600; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.data.trim() || !el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || hiddenByDesign(el)) continue;
    // a script that hides with visibility (GSAP autoAlpha) and never shows again counts as invisible
    const scriptHidden = cs.visibility === 'hidden' && el.closest('[style*="visibility: hidden"]');
    if (cs.visibility === 'hidden' && !scriptHidden) continue;
    checked++;
    const op = scriptHidden ? 0 : opacity(el);
    const size = parseFloat(cs.fontSize);
    if (op < 0.05) {
      if (n.data.trim().length > 3) add('fail', 'never-shown', 'Text that stays invisible after scrolling the whole page (a reveal that never fires?)', el);
      continue;
    }
    if (size < 12) add('fail', 'tiny-text', `${size}px text is too small to read`, el);
    else if (phone && size < 15 && /^(P|LI|DD|TD|BLOCKQUOTE)$/.test(el.tagName) && n.data.trim().length > 60) add('warn', 'small-body', `Body text is ${size}px on a phone; 16px or more reads better`, el);
    if (phone) {
      const v = seenPart(el, r);
      if ((v.left < 8 || v.right > W - 8) && v.right > v.left && v.right > 0 && v.left < W) add('warn', 'edge', 'Text touches the screen edge; it needs a side margin', el);
    }

    const bg = backdrop(el, r);
    if (bg) {
      const fg = over([...rgba(cs.color).slice(0, 3), rgba(cs.color)[3] * op], bg);
      const c = ratio(fg, bg);
      const large = size >= 24 || (size >= 18.6 && +cs.fontWeight >= 700);
      const need = large ? 3 : 4.5;
      if (c < need) add(c < need - 1 ? 'fail' : 'warn', 'contrast', `Contrast ${c.toFixed(2)}:1, needs ${need}:1`, el);
    }
  }

  // headlines that run long, paragraphs that run wide
  for (const h of document.querySelectorAll('h1, h2')) {
    const r = h.getBoundingClientRect();
    if (!r.height || hiddenByDesign(h)) continue;
    // count the lines the text actually sits on, not height ÷ line-height: padding, "line-height: normal" and
    // spans in other sizes made that guess wrong both ways
    const tops = [];
    const walk = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (t.parentElement && srOnly(t.parentElement)) continue; // the copy kept for screen readers (split text)
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const q of range.getClientRects()) if (q.width > 1 && q.height > 1) tops.push(q);
    }
    tops.sort((x, y) => x.top - y.top);
    let lines = 0, bottom = -Infinity;
    for (const q of tops) {
      if (q.top >= bottom - q.height * 0.4) { lines++; bottom = q.bottom; } else bottom = Math.max(bottom, q.bottom);
    }
    if (!tops.length) { const cs = getComputedStyle(h); lines = Math.round(r.height / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2)); }
    // two lines on a desktop, three on a phone or tablet (type-and-colour.md)
    const max = W >= 1100 ? 2 : 3;
    if (lines > max) add('warn', 'long-headline', `At ${W}px the ${h.tagName.toLowerCase()} runs to ${lines} lines; ${max} at most reads as a headline at this width (shorten it, or lower the size)`, h);
    if (r.width > W + 1) add('fail', 'headline-overflow', `${h.tagName} is wider than the screen`, h);
  }

  // fake bold or italic: the font has no such weight or style, so the browser smears one together. The font is the
  // first in the stack with a loaded face, as the browser picks it: a name that never loads ("Caprasimo Variable"
  // with only the static package installed) is passed over, and the check used to stop there and say nothing.
  const faces = new Map(); // family -> [{ lo, hi, italic }]
  if (document.fonts) for (const f of document.fonts) {
    if (f.status !== 'loaded') continue;
    // a hand-written @font-face may say font-weight: normal or bold
    const w2n = (x) => (x === 'normal' ? 400 : x === 'bold' ? 700 : Number(x));
    const [lo, hi = lo] = String(f.weight).split(/\s+/).map(w2n);
    const fam = f.family.replace(/["']/g, '').toLowerCase();
    if (!faces.has(fam)) faces.set(fam, []);
    faces.get(fam).push({ lo, hi, italic: /italic|oblique/.test(f.style) });
  }
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|emoji|math|fangsong|-apple-system|blinkmacsystemfont)$/;
  const usedFont = (stack) => {
    for (const raw of stack.split(',')) {
      const name = raw.replace(/["']/g, '').trim();
      if (GENERIC.test(name.toLowerCase())) return null;
      if (faces.has(name.toLowerCase())) return name;
    }
    return null;
  };
  const KIND = { H1: 'headings', H2: 'headings', H3: 'headings', H4: 'headings', STRONG: 'bold text', B: 'bold text', EM: 'italic text', I: 'italic text', TH: 'table headings' };
  const fakes = new Set();
  for (const el of document.querySelectorAll('h1, h2, h3, h4, strong, b, em, i, th, button, .button')) {
    if (!el.textContent.trim() || hiddenByDesign(el)) continue;
    const cs = getComputedStyle(el);
    const font = usedFont(cs.fontFamily);
    if (!font) continue;
    const list = faces.get(font.toLowerCase());
    const w = +cs.fontWeight;
    const italic = cs.fontStyle !== 'normal';
    const near = (x) => w >= x.lo - 100 && w <= x.hi + 100;
    const key = `${font} ${w}${italic ? ' italic' : ''}`;
    if (fakes.has(key)) continue;
    const kind = KIND[el.tagName] || 'buttons';
    const has = [...new Set(list.map((x) => (x.lo === x.hi ? `${x.lo}` : `${x.lo} to ${x.hi}`)))].join(' and ');
    if (!list.some(near)) {
      fakes.add(key);
      const to = list.map((x) => Math.min(Math.max(w, x.lo), x.hi)).sort((p, q) => Math.abs(p - w) - Math.abs(q - w))[0];
      add('warn', 'fake-bold', `${font} is drawn at ${w} but the font has only ${has}, so the browser fakes the weight; import that weight or set the ${kind} to ${to}`, el);
    } else if (italic && !list.some((x) => near(x) && x.italic)) {
      fakes.add(key);
      add('warn', 'fake-bold', `${font} is drawn in italic but the font has no italic face, so the browser slants the upright one; import the italic or set the ${kind} upright`, el);
    }
  }
  // line length, measured on the boxes that hold the lines: a list item or paragraph that holds blocks (a card in a
  // list, a flex row) is not one line of text, so the text boxes inside it are measured instead
  const boxed = (e) => !/^(inline|contents|none)/.test(getComputedStyle(e).display);
  const lineBoxes = (e) => ([...e.children].some(boxed) ? [...e.children].filter(boxed).flatMap(lineBoxes) : [e]);
  for (const p of [...document.querySelectorAll('p, li')].flatMap(lineBoxes)) {
    if ((p.innerText || '').length < 180) continue;
    const cs = getComputedStyle(p);
    const cpl = p.getBoundingClientRect().width / (parseFloat(cs.fontSize) * 0.5);
    if (cpl > 95) { add('warn', 'measure', `About ${Math.round(cpl)} characters per line; 60 to 75 is easier to read`, p); break; }
  }

  // tap targets on touch screens
  if (phone) {
    for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary')) {
      const r = el.getBoundingClientRect();
      if (!r.width || hiddenByDesign(el) || getComputedStyle(el).visibility === 'hidden') continue;
      const inText = getComputedStyle(el).display === 'inline' && (el.parentElement?.innerText || '').length > (el.innerText || '').length + 30;
      if (inText) continue;
      if (r.width < 24 || r.height < 24) add('warn', 'tap-target', `${Math.round(r.width)}×${Math.round(r.height)}px is hard to tap; make it at least 24px (44px is comfortable)`, el);
    }
  }

  // broken images and fonts
  for (const img of document.images) {
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) add('fail', 'broken-image', `Image failed to load: ${img.currentSrc}`, img);
  }
  const families = new Set();
  if (document.fonts) for (const f of document.fonts) {
    if (f.status === 'error') add('fail', 'font', `Font failed to load: ${f.family} ${f.weight}`);
    if (f.status === 'loaded') families.add(f.family.replace(/["']/g, ''));
  }
  if (families.size > 3) add('warn', 'fonts', `${families.size} font families load (${[...families].join(', ')}); two or three is plenty`);

  // what the eye can't see; aria-hidden decoration (a giant number, a drawing) is seen, so it counts in the frame checks
  const unseen = (el) => el.closest('[hidden], dialog:not([open]), details:not([open]) > :not(summary), [popover]:not(:popover-open), noscript, .visually-hidden, .sr-only') || srOnly(el);

  // wide screens: a part of the page that leaves most of a desktop screen empty, as phone-first layouts do. Text
  // in the left half with nothing on the right, a small drawing far from its text, a screen of empty ground.
  if (W >= 1200) {
    const skip = (e) => /^(HEADER|FOOTER|NAV|SCRIPT|STYLE|TEMPLATE|DIALOG)$/.test(e.tagName) || /banner|contentinfo|navigation/.test(e.getAttribute('role') || '') || unseen(e);
    const blocks = [];
    // the page's full-width parts: split a wrapper that holds two or more of them, keep the rest
    (function split(e) {
      for (const c of e.children) {
        const r = c.getBoundingClientRect();
        if (r.width < W * 0.9 || r.height < 1 || skip(c) || /fixed|sticky|absolute/.test(getComputedStyle(c).position)) continue;
        // a layer laid over the part (a drawn scene at inset 0) is part of it, not a part of its own, and parts that
        // overlap are seen together: judged alone, the scene would look empty beside the words over it
        const parts = [...c.children].filter((k) => { const b = k.getBoundingClientRect(); return b.width >= W * 0.9 && b.height >= 120 && !/fixed|sticky|absolute/.test(getComputedStyle(k).position); })
          .map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top);
        if (parts.length >= 2 && parts.every((b, i) => !i || b.top >= parts[i - 1].bottom - 1)) split(c);
        else if (r.height >= 160) blocks.push(c);
      }
    })(document.body);
    // a part with a picture as its background is filled by it
    const pictureBack = (blk) => [blk, ...blk.querySelectorAll('*')].some((e) => {
      if (!/url\(/.test(getComputedStyle(e).backgroundImage)) return false;
      const b = e.getBoundingClientRect();
      return b.width >= W * 0.6;
    });
    for (const blk of blocks) {
      const R = blk.getBoundingClientRect();
      if (pictureBack(blk)) continue;
      const bx = [];
      const keep = (q, media, panel = false) => {
        const l = Math.max(q.left, 0, R.left), r = Math.min(q.right, W, R.right);
        if (r - l > 1 && q.bottom - q.top > 1) bx.push({ l, r, t: q.top, b: q.bottom, media, panel });
      };
      const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        if (!t.data.trim() || !t.parentElement || unseen(t.parentElement) || t.parentElement.closest('svg')) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const q of range.getClientRects()) keep(q, null);
      }
      for (const m of blk.querySelectorAll('img, svg, video, canvas, iframe, input, select, textarea')) {
        if (m.parentElement?.closest('svg') || unseen(m)) continue;
        const q = m.getBoundingClientRect();
        if (q.width >= 32 && q.height >= 32) keep(q, m);
      }
      // painted panels (a card, a price tag, a coloured box) fill the screen too
      for (const e of blk.querySelectorAll('*')) {
        if (e.closest('svg') || unseen(e)) continue;
        const cs = getComputedStyle(e);
        if (rgba(cs.backgroundColor)[3] < 0.5 && cs.backgroundImage === 'none') continue;
        const q = e.getBoundingClientRect();
        if (q.width >= 64 && q.height >= 64 && q.width < W * 0.9) keep(q, e, true);
      }
      if (!bx.length) continue;
      const left = Math.min(...bx.map((x) => x.l)), right = Math.max(...bx.map((x) => x.r));
      const texts = bx.filter((x) => !x.media);
      // a small picture with a wide empty field between it and the text beside it
      let far = null;
      // (a drawing on its own: not a thin line, not part of a panel or a group of pictures)
      const touching = (a, b) => a.l - 48 < b.r && b.l - 48 < a.r && a.t - 48 < b.b && b.t - 48 < a.b;
      for (const m of bx.filter((x) => x.media && !x.panel && x.r - x.l < W * 0.3 && x.r - x.l >= 64 && x.b - x.t >= 64)) {
        if (bx.some((o) => o !== m && o.media && touching(m, o))) continue;
        const beside = texts.filter((t) => t.b > m.t - 40 && t.t < m.b + 40 && (t.r <= m.l || t.l >= m.r));
        if (!beside.length || texts.some((t) => t.b > m.t - 40 && t.t < m.b + 40 && t.r > m.l && t.l < m.r)) continue;
        const gap = Math.min(...beside.map((t) => (t.r <= m.l ? m.l - t.r : t.l - m.r)));
        if (gap >= W * 0.33 && (!far || gap > far.gap)) far = { gap, m };
      }
      const side = right <= W * 0.64 ? 'left' : left >= W * 0.36 ? 'right' : null;
      const area = bx.reduce((s, x) => s + (x.r - x.l) * (x.b - x.t), 0) / (W * R.height);
      if (far) add('warn', 'wide-empty', `At ${W}px there are ${Math.round(far.gap)}px of empty screen between ${name(far.m.media)} and the text beside it. Bring them together, or make the picture much bigger`, blk);
      else if (side && R.height >= innerHeight * 0.3) add('warn', 'wide-empty', `At ${W}px this part only uses the ${side} ${Math.round((side === 'left' ? right : W - left) / W * 100)}% of the screen; the rest is empty. Set it bigger or wider, or give it a second column (a picture, the hours, a quote)`, blk);
      else if (R.height >= innerHeight * 0.6 && area < 0.04) add('warn', 'wide-empty', `At ${W}px this part is mostly empty ground (its words and pictures cover ${Math.round(area * 100)}% of it). Fill it or make it shorter`, blk);
    }
  }

  // The frame: what a visitor sees where, top to bottom, in page coordinates. Words, pictures and controls count; so
  // does a painted box that stands out from what it sits on, and a picture set as a background. A plain band of
  // colour the width of the screen is ground, not content.
  const H = innerHeight;
  const under = (e) => {
    const layers = [];
    for (let x = e; x; x = x.parentElement) { const c = rgba(getComputedStyle(x).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  // 'fixed' for a box fixed to the screen; for one that rides along a part (sticky, or pinned by a scroll library)
  // the stretch of page it rides over; else null. A sticky bar along the top is a bar, not a rider.
  const pins = new Map();
  function pin(e) {
    if (!e || e === document.body || e === document.documentElement) return null;
    if (pins.has(e)) return pins.get(e);
    const cs = getComputedStyle(e);
    let v;
    if (cs.position === 'fixed') v = 'fixed';
    else if (cs.position === 'sticky' || e.parentElement?.classList.contains('pin-spacer')) {
      const host = e.parentElement;
      const bar = /^(HEADER|NAV)$/.test(e.tagName) || /banner|navigation/.test(e.getAttribute('role') || '') || host === document.body || host === document.documentElement;
      const r = host.getBoundingClientRect();
      v = bar ? pin(host) : { t: r.top + sy, b: r.bottom + sy };
    } else v = pin(e.parentElement);
    pins.set(e, v);
    return v;
  }
  const seenBoxes = [];
  {
    // (off the screen to the side: a closed drawer, a carousel's next slides)
    const keep = (q, kind, el) => { if (q.width > 1 && q.height > 1 && q.right > 0 && q.left < W) seenBoxes.push({ l: q.left, r: q.right, t: q.top + sy, b: q.bottom + sy, kind, el }); };
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const p = t.parentElement;
      if (!t.data.trim() || !p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || p.closest('svg') || unseen(p) || getComputedStyle(p).visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const q of range.getClientRects()) keep(q, 'text', p);
    }
    for (const m of document.body.querySelectorAll('img, svg, video, canvas, iframe, object, embed, input, select, textarea, button')) {
      if (m.parentElement?.closest('svg') || unseen(m)) continue;
      const q = m.getBoundingClientRect();
      if (q.width >= 24 && q.height >= 24) keep(q, 'media', m);
    }
    for (const e of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(e);
      const pic = /url\(/.test(cs.backgroundImage), paint = rgba(cs.backgroundColor)[3] >= 0.5;
      if (!pic && !paint && cs.backgroundImage === 'none') continue;
      if (e.closest('svg') || unseen(e)) continue;
      const q = e.getBoundingClientRect();
      if (q.width < 48 || q.height < 24) continue;
      // a sheet the page is laid on (as wide as the screen, or half a screen of area) is ground
      const sheet = q.width >= W * 0.9 || q.width * q.height >= W * H * 0.5;
      if (pic) keep(q, 'picture', e);
      else if (!sheet && (!paint || Math.max(...[0, 1, 2].map((i) => Math.abs(under(e)[i] - under(e.parentElement)[i]))) > 8)) keep(q, 'panel', e);
    }
  }
  const content = seenBoxes.flatMap((x) => { const p = pin(x.el); return p === 'fixed' ? [] : p ? [{ ...x, t: Math.min(x.t, p.t), b: Math.max(x.b, p.b) }] : [x]; });
  // a picture, video or 3D stage fixed behind the whole page fills every screen
  const backdropLayer = seenBoxes.some((x) => x.kind !== 'text' && x.kind !== 'panel' && pin(x.el) === 'fixed' && (x.r - x.l) * (x.b - x.t) >= W * H * 0.6 && opacity(x.el) >= 0.3);
  const say = (x) => {
    if (!x) return 'the top of the page';
    const t = (x.el.innerText || x.el.getAttribute('aria-label') || x.el.alt || '').trim().replace(/\s+/g, ' ');
    return t ? `"${t.slice(0, 30)}${t.length > 30 ? '…' : ''}"` : x.el.tagName.toLowerCase();
  };

  // hero-void: a desktop first screen that is mostly empty around a small headline. Lines of text count as the
  // patch they make together (a paragraph fills its column, not only its letters). A page with nothing below its
  // first screen (an Impressum, a short note) is short, not hollow.
  if (W >= 1200 && !backdropLayer && content.some((x) => x.t >= H)) {
    const cell = 16, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), grid = new Uint8Array(cols * rows);
    const blockOf = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (!/^(inline|contents)$/.test(getComputedStyle(a).display)) return a; return e; };
    const patches = new Map(), marks = [];
    let biggest = 0, big = null;
    for (const x of seenBoxes) {
      if (x.t >= H || x.b <= 0) continue;
      if (x.kind !== 'text') { marks.push(x); continue; }
      const k = blockOf(x.el), p = patches.get(k);
      if (p) { p.l = Math.min(p.l, x.l); p.r = Math.max(p.r, x.r); p.t = Math.min(p.t, x.t); p.b = Math.max(p.b, x.b); } else patches.set(k, { ...x });
      const size = parseFloat(getComputedStyle(x.el).fontSize);
      if (size > biggest) { biggest = size; big = x.el; }
    }
    for (const x of [...marks, ...patches.values()]) {
      for (let i = Math.max(0, Math.ceil(x.t / cell - 0.5)); i <= Math.min(rows - 1, Math.floor(x.b / cell - 0.5)); i++) {
        for (let j = Math.max(0, Math.ceil(x.l / cell - 0.5)); j <= Math.min(cols - 1, Math.floor(x.r / cell - 0.5)); j++) grid[i * cols + j] = 1;
      }
    }
    const cover = grid.reduce((s, v) => s + v, 0) / grid.length;
    // and an empty band across the screen, a third of its height or more: a column of text running down the screen
    // (an Impressum, an article) is sparse but not hollow
    let run = 0, band = 0;
    for (let i = 0; i < rows; i++) { run = grid.subarray(i * cols, (i + 1) * cols).some((v) => v) ? 0 : run + 1; band = Math.max(band, run); }
    band = (band * cell) / H;
    const h1 = [...document.querySelectorAll('h1')].find((h) => { const r = h.getBoundingClientRect(); return r.height > 1 && r.top + sy < H && !unseen(h); });
    if (big && cover < 0.12 && band >= 0.3 && biggest < W * 0.05) add('warn', 'hero-void', `At ${W}px the first screen is mostly empty: what is on it covers ${Math.round(cover * 100)}% of it, and its largest text is ${Math.round(biggest)}px. Set the headline much larger, or bring a picture or the next part up into the first screen`, h1 || big);
  }

  // blank: a stretch of page over half a screen tall with nothing on it, at any width. The first screen is the
  // hero's business (hero-void), and a page of one screen has no stretch to speak of.
  const pageH = document.documentElement.scrollHeight;
  if (!backdropLayer && pageH > H * 1.05 && content.length) {
    const gaps = [];
    let end = 0, before = null;
    for (const x of content.slice().sort((a, b) => a.t - b.t)) {
      if (x.t - end > H * 0.5) gaps.push({ t: end, b: x.t, before, after: x });
      if (x.b > end) { end = x.b; before = x; }
    }
    if (pageH - end > H * 0.5) gaps.push({ t: end, b: pageH, before, after: null });
    for (const g of gaps.filter((x) => x.b > H)) {
      // named by the smallest part that spans the gap, else by the part (before or after it) that holds more of it
      const partOf = (e) => { while (e.parentElement && e.parentElement !== document.body && e.parentElement.tagName !== 'MAIN' && e.parentElement.getBoundingClientRect().height < pageH * 0.6) e = e.parentElement; return e; };
      const share = (e) => { const r = e.getBoundingClientRect(); return Math.min(r.bottom + sy, g.b) - Math.max(r.top + sy, g.t); };
      let host = null;
      for (let a = (g.after || g.before).el; a && a !== document.body; a = a.parentElement) {
        const r = a.getBoundingClientRect();
        if (r.top + sy <= g.t + 1 && r.bottom + sy >= g.b - 1) { host = r.height < pageH * 0.6 && a.tagName !== 'MAIN' ? a : null; break; }
      }
      if (!host) host = [g.before, g.after].filter(Boolean).map((x) => partOf(x.el)).sort((a, b) => share(b) - share(a))[0];
      const px = Math.round(g.b - g.t);
      add('warn', 'blank', g.after
        ? `At ${W}px there are ${px}px of blank page between ${say(g.before)} and ${say(g.after)}: over half a screen with nothing on it. Close the gap (less padding, a smaller min-height), or put something there that belongs`
        : `At ${W}px the page ends with ${px}px of blank space after ${say(g.before)}: over half a screen with nothing on it. Take out the extra height`, host);
    }
  }

  // The page's parts: main's children (the body's without a main), looking through a single wrapper
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !unseen(e) && getComputedStyle(e).visibility !== 'hidden'; };
  let root = document.querySelector('main') || document.body;
  while (root.children.length === 1 && !/^(SECTION|ARTICLE)$/.test(root.firstElementChild.tagName)) root = root.firstElementChild;
  const notPart = (e) => /^(HEADER|FOOTER|NAV|ASIDE|SCRIPT|STYLE|TEMPLATE|DIALOG|LINK|META)$/.test(e.tagName) || /banner|contentinfo|navigation/.test(e.getAttribute('role') || '') || !shown(e);

  // margins: on a desktop screen the left and right margins of the page differ by a lot (an off-centre wrapper).
  // Measured per part on the columns its words keep to, its pictures and boxes. A part that uses one side only is
  // wide-empty's business, and anything running to the screen's edge has no margin to measure.
  if (W >= 1200) {
    const columns = new Map();
    const column = (e) => {
      for (let a = e; a && a !== document.body; a = a.parentElement) {
        if (columns.has(a)) return columns.get(a);
        const cs = getComputedStyle(a);
        if (/^(inline|contents)$/.test(cs.display)) continue;
        const r = a.getBoundingClientRect();
        const v = { l: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
        columns.set(a, v);
        return v;
      }
      return null;
    };
    const parts = [...root.children].filter((e) => !notPart(e)).flatMap((e) => { const subs = [...e.children].filter((c) => /^(SECTION|ARTICLE)$/.test(c.tagName) && !notPart(c)); return subs.length >= 2 ? subs : [e]; });
    const sides = [];
    for (const part of parts) {
      const xs = [];
      for (const x of seenBoxes) {
        if (!part.contains(x.el) || pin(x.el) || x.el.closest('[aria-hidden="true"]')) continue;
        const c = x.kind === 'text' ? column(x.el) : x;
        if (c && c.l >= 2 && c.r <= W - 2 && c.r - c.l > 1) xs.push(c);
      }
      if (xs.length < 2) continue;
      const l = Math.min(...xs.map((c) => c.l)), r = Math.max(...xs.map((c) => c.r));
      if (r - l >= W * 0.5) sides.push({ part, l, r: W - r });
    }
    // off-centre when most parts lean the same way (one part set to one side on purpose is a layout, not a wrapper)
    const mid = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const off = Math.max(64, W * 0.05);
    if (sides.length >= 2) {
      const L = mid(sides.map((s) => s.l)), R = mid(sides.map((s) => s.r));
      const odd = sides.filter((s) => Math.abs(s.l - s.r) >= off && (s.l < s.r) === (L < R));
      if (odd.length > sides.length / 2 && Math.abs(L - R) >= off && Math.min(L, R) < Math.max(L, R) * 0.65) add('warn', 'margins', `At ${W}px the page sits off-centre: about ${Math.round(L)}px of margin on the left and ${Math.round(R)}px on the right (${odd.length} of ${sides.length} parts). Centre the wrapper (margin-inline: auto) or give both sides the same padding`, (odd[0] || sides[0]).part);
    }
  }

  // untitled: a part of the page with real text and no heading, so a visitor skimming can't tell what it is
  {
    const heading = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
    const titled = (e) => [...e.querySelectorAll(heading)].some(shown) || (e.matches(heading) && shown(e));
    const check = (part) => {
      if (notPart(part) || /^(FORM|FIGURE|BLOCKQUOTE|H[1-6])$/.test(part.tagName)) return;
      // a wrapper of several sections, with no heading of its own: each section is a part
      const subs = [...part.children].filter((c) => /^(SECTION|ARTICLE)$/.test(c.tagName));
      if (subs.length >= 2 && ![...part.children].some((c) => !subs.includes(c) && titled(c))) { subs.forEach(check); return; }
      if (titled(part)) return;
      // a heading just before it, on its own or in a small heading block, titles it too
      const prev = part.previousElementSibling;
      if (prev && titled(prev) && (prev.innerText || '').length < 200) return;
      for (let s = prev; s; s = s.previousElementSibling) {
        if (s.matches(heading) && shown(s)) return;
        if (/^(SECTION|ARTICLE|DIV|ASIDE|HEADER|FOOTER)$/.test(s.tagName)) break;
      }
      const runs = [...part.querySelectorAll('p, li, dd')].filter((e) => !e.parentElement.closest('p, li, dd') && !e.closest('figure, blockquote, nav, header, footer, form, button, aside') && shown(e));
      const n = runs.reduce((s, e) => s + (e.innerText || '').trim().length, 0);
      if (n >= 400) add('warn', 'untitled', `This part has ${n} characters of text and no heading, so a visitor skimming the page can't tell what it is. Give it a short heading (an h2) that says what it holds; if it shows a title already, make that title the h2`, part);
    };
    [...root.children].forEach(check);
  }

  // first-h1: the page's h1 on the first screen, where it names the page (no h1 at all is audit's "h1")
  {
    const h1s = [...document.querySelectorAll('h1')];
    const seen1 = h1s.filter(shown);
    const words = (h) => (h.innerText || h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (h1s.length && !seen1.length) add('warn', 'first-h1', `The h1 ("${words(h1s[0])}") is hidden at ${W}px, so no headline on the first screen names the page. Show it, or make the first screen's big line the h1`, h1s[0]);
    else if (seen1.length && !seen1.some((h) => { const r = h.getBoundingClientRect(); return r.top + sy + Math.min(r.height, parseFloat(getComputedStyle(h).fontSize) * 1.2) <= H; })) {
      const top = Math.min(...seen1.map((h) => h.getBoundingClientRect().top + sy));
      add('warn', 'first-h1', `At ${W}px the h1 starts ${Math.round(top)}px down, below the first screen (${H}px), so nothing there names the page. Move it up, or make the first screen's big line the h1`, seen1[0]);
    }
  }

  // Full, on a desktop screen: what reads as sparse, thin, empty and tiny. The page's parts, as margins has them.
  // Pages kept out of search (an Impressum, a privacy page) are a column of small print by nature.
  if (W >= 1200 && !/noindex/i.test(document.querySelector('meta[name="robots"]')?.content || '')) {
    const parts = [...root.children].filter((e) => !notPart(e)).flatMap((e) => { const subs = [...e.children].filter((c) => /^(SECTION|ARTICLE)$/.test(c.tagName) && !notPart(c)); return subs.length >= 2 ? subs : [e]; });
    const words = (e) => {
      let n = 0;
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const p = t.parentElement;
        if (!t.data.trim() || !p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || unseen(p) || getComputedStyle(p).visibility === 'hidden' || opacity(p) < 0.05) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        if (range.getClientRects().length) n += t.data.trim().split(/\s+/).length;
      }
      return n;
    };

    // thin-section: a part with little to read and nothing to look at: under 40 words, no list or row of 3 or more,
    // no table, no form, no picture a quarter of its width. The hero is exempt, and so is one rest: a band at most
    // half a screen tall (layout.md).
    const hero = parts.find((p) => [...p.querySelectorAll('h1')].some(shown)) || parts[0];
    let rest = false;
    for (const part of parts) {
      if (part === hero || part === parts[0]) continue;
      const R = part.getBoundingClientRect();
      if (R.height < 120) continue; // a divider, a strip
      const n = words(part);
      if (n >= 40) continue;
      const list = [...part.querySelectorAll('ul, ol')].some((l) => shown(l) && [...l.children].filter((c) => c.tagName === 'LI' && shown(c)).length >= 3)
        || [...part.querySelectorAll('dl')].some((d) => shown(d) && d.querySelectorAll('dt').length >= 3)
        // a row of three or more cards side by side
        || [part, ...part.querySelectorAll('*')].some((e) => { const ks = [...e.children].filter((k) => shown(k) && getComputedStyle(k).display !== 'inline' && k.getBoundingClientRect().width < R.width * 0.6); return ks.length >= 3 && ks.filter((k) => ks.some((o) => o !== k && Math.abs(o.getBoundingClientRect().top - k.getBoundingClientRect().top) < 8)).length >= 3; });
      const table = [...part.querySelectorAll('table')].some(shown);
      const form = [...part.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(shown).length >= 2;
      const pic = [...part.querySelectorAll('img, picture, video, canvas, svg, iframe')].some((m) => !m.parentElement.closest('svg') && shown(m) && m.getBoundingClientRect().width >= R.width / 4)
        || [part, ...part.querySelectorAll('*')].some((e) => /url\(/.test(getComputedStyle(e).backgroundImage) && e.getBoundingClientRect().width >= R.width / 4);
      if (list || table || form || pic) continue;
      if (!rest && R.height <= H / 2) { rest = true; continue; }
      add('warn', 'thin-section', `At ${W}px this part holds ${n} word${n === 1 ? '' : 's'} and nothing else to look at (no list, table or picture), ${Math.round(R.height)}px tall: a visitor finds it thin. Give it its substance (the menu, the hours, the steps, a picture of the thing), or fold it into the part beside it`, part);
    }

    // sparse-screen: screens of the page that are mostly empty. What fills a screen: lines of text (as tall as their
    // line height), pictures, drawings, video, controls, boxes that stand out, and bands of a colour other than the
    // page's ground. Under 30% filled is sparse and under 15% empty; two sparse screens on a page are worth a look,
    // two empty ones a fault (wide-empty and hero-void name the parts).
    if (!backdropLayer && pageH > H * 1.2) {
      const sheets = [...document.body.querySelectorAll('*')].flatMap((e) => {
        if (rgba(getComputedStyle(e).backgroundColor)[3] < 0.5 || unseen(e) || pin(e) === 'fixed') return [];
        const r = e.getBoundingClientRect();
        return r.width >= W * 0.9 && r.height > 0 ? [{ e, l: r.left, r: r.right, t: r.top + sy, b: r.bottom + sy }] : [];
      });
      const tally = new Map();
      for (let y = 0; y < pageH; y += 100) {
        let at = document.body;
        for (const s of sheets) if (s.t <= y && s.b > y && at.contains(s.e)) at = s.e;
        const k = hex(under(at));
        tally.set(k, (tally.get(k) || 0) + 1);
      }
      const ground = rgba([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || '#fff');
      const differs = (c) => Math.max(...[0, 1, 2].map((i) => Math.abs(c[i] - ground[i]))) > 8;
      // and cards drawn with a line or a shadow (a frame on a dark page is often only that)
      const framed = [...document.body.querySelectorAll('*')].flatMap((e) => {
        if (e.closest('svg') || unseen(e) || pin(e)) return [];
        const r = e.getBoundingClientRect();
        if (r.width < 64 || r.height < 48 || r.width >= W * 0.9) return [];
        const cs = getComputedStyle(e), edge = under(e.parentElement || e);
        const ring = ['Left', 'Right', 'Top', 'Bottom'].filter((s) => cs[`border${s}Style`] !== 'none' && parseFloat(cs[`border${s}Width`]) >= 1
          && Math.max(...[0, 1, 2].map((i) => Math.abs(over(rgba(cs[`border${s}Color`]), edge)[i] - edge[i]))) > 8).length >= 3;
        const raised = cs.boxShadow !== 'none' && !/inset/.test(cs.boxShadow) && /\d+px \d+px [1-9]/.test(cs.boxShadow.replace(/-/g, ''));
        return ring || raised ? [{ l: r.left, r: r.right, t: r.top + sy, b: r.bottom + sy }] : [];
      });
      const fill = content.map((x) => {
        if (x.kind !== 'text') return x;
        const cs = getComputedStyle(x.el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const mid = (x.t + x.b) / 2, half = Math.max(x.b - x.t, lh) / 2;
        return { ...x, t: mid - half, b: mid + half };
      }).concat(sheets.filter((s) => differs(under(s.e))), framed);
      const cell = 16, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
      const screens = Math.ceil(pageH / H);
      const sparse = [];
      for (let i = 0; i < screens; i++) {
        const top = Math.min(i * H, pageH - H);
        if (i && top - (i - 1) * H < H * 0.5) continue; // the last screen, mostly the one before it again
        const grid = new Uint8Array(cols * rows);
        for (const x of fill) {
          if (x.b <= top || x.t >= top + H) continue;
          for (let r = Math.max(0, Math.ceil((x.t - top) / cell - 0.5)); r <= Math.min(rows - 1, Math.floor((x.b - top) / cell - 0.5)); r++) {
            for (let c = Math.max(0, Math.ceil(x.l / cell - 0.5)); c <= Math.min(cols - 1, Math.floor(x.r / cell - 0.5)); c++) grid[r * cols + c] = 1;
          }
        }
        const cover = grid.reduce((s, v) => s + v, 0) / grid.length;
        if (cover < 0.3) sparse.push({ i: i + 1, cover, top });
      }
      if (sparse.length >= 2) {
        // two screens under 15% are empty (fix); under 30% can be a finished two-column list or a prose column alone
        // in its measure (consider)
        const empty = sparse.filter((s) => s.cover < 0.15).length >= 2;
        const at = (s) => { const e = document.elementFromPoint(W / 2, s.top + H / 2 - sy); return e ? parts.find((p) => p.contains(e)) || e : null; };
        add(empty ? 'fail' : 'warn', 'sparse-screen', `At ${W}px ${sparse.length} of the page's ${screens} screens are ${empty ? 'mostly empty' : 'sparse'} (screen ${sparse.map((s) => `${s.i}: ${Math.round(s.cover * 100)}% filled`).join(', screen ')}; under 15% reads as empty, under 30% as sparse). Fill them: set the type and pictures bigger, give a part its pictures or a band of its own, or make the parts shorter. A prose column alone in its measure leaves its sides empty on purpose (layout.md, "column"): if that is what these screens hold, leave them`, at(sparse[0]) || undefined);
      }
    }

    // small-text: on a desktop screen running text under 17px reads small (15px looks tiny there), and labels
    // and notes of more than three words under 15px too. The footer's small print may be smaller.
    const smallPrint = (e) => e.closest('footer, [role="contentinfo"], svg, sup, sub, [aria-hidden="true"]');
    const paras = [...document.querySelectorAll('p')].filter((p) => shown(p) && !smallPrint(p) && !p.closest('nav, button, figcaption, label, form')
      && (p.innerText || '').trim().length >= 60 && parseFloat(getComputedStyle(p).fontSize) < 16.9 && opacity(p) >= 0.05);
    const small = [];
    {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const p = t.parentElement;
        if (!p || t.data.trim().split(/\s+/).length <= 3 || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || smallPrint(p) || unseen(p) || getComputedStyle(p).visibility === 'hidden' || opacity(p) < 0.05) continue;
        const s = parseFloat(getComputedStyle(p).fontSize);
        const range = document.createRange();
        range.selectNodeContents(t);
        if (s >= 12 && s < 15 && range.getClientRects().length) small.push({ p, s, t: t.data.trim().replace(/\s+/g, ' ') });
      }
    }
    const said = (s) => `"${s.length > 40 ? s.slice(0, 39) + '…' : s}"`;
    if (paras.length >= 2) {
      const sizes = [...new Set(paras.map((p) => Math.round(parseFloat(getComputedStyle(p).fontSize) * 10) / 10))].sort((a, b) => a - b);
      add('fail', 'small-text', `At ${W}px ${paras.length} paragraphs are set at ${sizes.join(' and ')}px, like ${said(paras[0].innerText.trim())}: running text on a desktop screen reads small under 17px (15px looks tiny there). Set the body at 17 to 19px there (type-and-colour.md)`, paras[0]);
    } else if (paras.length || small.length >= 2) {
      const x = paras.length ? { p: paras[0], s: parseFloat(getComputedStyle(paras[0]).fontSize), t: paras[0].innerText.trim() } : small[0];
      add('warn', 'small-text', `At ${W}px ${paras.length ? 'a paragraph' : `${small.length} pieces of text`} ${paras.length ? 'is' : 'are'} under ${paras.length ? 17 : 15}px, like ${said(x.t)} (${Math.round(x.s * 10) / 10}px): small to read on a desktop screen. Set notes and labels at 15px or more, running text at 17px or more; only the footer's small print goes smaller`, x.p);
    }

    // repeated-line: the same sentence of five words or more seen twice on the page (outside the nav and buttons):
    // a call to action or a closing line said twice reads as filler. Facts with numbers in them (hours, prices) may
    // come back.
    const blockOf = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (!/^(inline|contents)$/.test(getComputedStyle(a).display)) return a; return e; };
    const texts = new Map();
    {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const p = t.parentElement;
        if (!p || !t.data.trim() || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || p.closest('nav, button, [role="button"], .button, .btn, a[class*="button"], a[class*="btn"], [aria-hidden="true"], svg, select, option') || unseen(p) || getComputedStyle(p).visibility === 'hidden' || opacity(p) < 0.05) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        if (!range.getClientRects().length) continue;
        const b = blockOf(p);
        texts.set(b, (texts.get(b) || '') + (t.previousSibling?.nodeName === 'BR' ? '\n' : '') + t.data);
      }
    }
    const lines = new Map(); // sentence -> blocks
    for (const [b, text] of texts) {
      for (const s of text.split(/(?<=[.!?…])\s+|\n+/)) {
        const k = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (k.split(' ').length < 5 || /\d|@/.test(s)) continue;
        if (!lines.has(k)) lines.set(k, { s: s.trim(), at: [] });
        if (!lines.get(k).at.includes(b)) lines.get(k).at.push(b);
      }
    }
    let told = 0;
    for (const { s, at } of lines.values()) {
      if (at.length < 2 || told >= 2) continue;
      told++;
      add('warn', 'repeated-line', `"${s.length > 80 ? s.slice(0, 79) + '…' : s}" is on the page ${at.length} times (${name(at[0])} and ${name(at[1])}): a line said twice reads as filler. Keep it where it does the most, and let the other place say something new`, at[1]);
    }
  }

  // the text on still pictures, for mediaContrast to measure
  window.__ossMc = mediaText.map((x, i) => { x.el.setAttribute('data-oss-mc', i); return { i, media: name(x.media), where: name(x.el), fallback: x.note }; });

  // one entry per rule + element is enough
  const key = new Set();
  return out.filter((f) => { const k = f.rule + f.where; if (key.has(k)) return false; key.add(k); return true; });
}

// Habits of generated pages, measured in the rendered page whatever the class names are (lint reads the class
// names): small tracked capitals over the headings, cream and terracotta with a serif headline, glows and heavy
// shadows on boxes at rest, thick stripes down one side of a card, boxes in boxes, type sizes too close together, and
// a Warm brief (mood, from .one-shot/brief.md) that came out cool. Taste hints, so warnings, and only where the habit
// repeats. look runs it once per page, at the widest screen. Returns [{ level, rule, text, where }].
export function pageTells(width, mood) {
  const out = [];
  const add = (level, rule, text, el) => out.push({ level, rule, text, where: el ? name(el) : '' });
  const W = width || innerWidth;
  function name(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    return t ? `${s} "${t.slice(0, 40)}${t.length > 40 ? '…' : ''}"` : s;
  }
  const short = (el) => { const t = (el.innerText || '').trim().replace(/\s+/g, ' '); return t.length > 30 ? t.slice(0, 29) + '…' : t; };

  // colours: any CSS colour -> [r, g, b, a] through a 1px canvas; OKLCH for judging them
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function rgba(c) {
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(c, v);
    return v;
  }
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  function lch([r, g, b]) {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [R, G, B] = [f(r), f(g), f(b)];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
  }
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const differs = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i]))) > 8;
  // the solid colour something sits on
  const under = (e) => {
    const layers = [];
    for (let x = e; x; x = x.parentElement) { const c = rgba(getComputedStyle(x).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const srOnly = (el) => {
    for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) {
      const s = getComputedStyle(e);
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || (e.offsetWidth <= 1 && e.offsetHeight <= 1 && s.overflow !== 'visible')) return true;
    }
    return false;
  };
  const unseen = (el) => el.closest('[hidden], dialog:not([open]), details:not([open]) > :not(summary), [popover]:not(:popover-open), noscript, .visually-hidden, .sr-only') || srOnly(el);
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !unseen(e) && getComputedStyle(e).visibility !== 'hidden'; };
  // computed box-shadow, text-shadow or drop-shadow() -> [{ c, x, y, blur, spread, inset }]
  const split = (s, sep) => { const parts = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === sep && !depth) { parts.push(cur); cur = ''; } else cur += ch; } return parts.concat(cur).map((p) => p.trim()).filter(Boolean); };
  const shadows = (v) => (!v || v === 'none' ? [] : split(v, ',').map((one) => {
    const toks = split(one, ' ');
    const len = (t) => /^-?[\d.]+(px)?$/.test(t);
    const n = toks.filter(len).map(parseFloat);
    return { c: rgba(toks.filter((t) => !len(t) && t !== 'inset').join(' ') || '#000'), x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, inset: toks.includes('inset') };
  }));
  const drops = (f) => { const list = []; for (const m of (f || '').matchAll(/drop-shadow\(/g)) { let d = 0, j = m.index + 12; for (; j < f.length; j++) { if (f[j] === '(') d++; else if (f[j] === ')') { if (!d) break; d--; } } list.push(f.slice(m.index + 12, j)); } return list.flatMap(shadows); };

  // the ground: the colour behind most of the page, sampled every 100px down it
  const sy = scrollY, pageH = document.documentElement.scrollHeight;
  const sheets = [...document.body.querySelectorAll('*')].flatMap((e) => {
    if (rgba(getComputedStyle(e).backgroundColor)[3] < 0.5) return [];
    const r = e.getBoundingClientRect();
    return r.width >= W * 0.9 && r.height > 0 ? [{ e, t: r.top + sy, b: r.bottom + sy }] : [];
  });
  const grounds = new Map();
  for (let y = 0; y < pageH; y += 100) {
    let at = document.body;
    for (const s of sheets) if (s.t <= y && s.b > y && at.contains(s.e)) at = s.e;
    const c = under(at), k = hex(c);
    grounds.set(k, { c, n: (grounds.get(k)?.n || 0) + 1 });
  }
  const ground = [...grounds.values()].sort((a, b) => b.n - a.n)[0]?.c || under(document.body);

  const accents = [];
  const note = (c, w) => { if (c[3] >= 0.5) { const o = lch(c); if (o.C >= 0.06) accents.push({ c, o, w }); } };
  const glows = [], heavy = [], stripes = [], boxes = new Set();
  const shapes = new Map(); // svg -> how many of its shapes were noted
  for (const e of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) continue;
    const svg = e.closest('svg');
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || unseen(e)) continue;
    if (svg && svg !== e) {
      // a drawing's lines and fills say what the accent is too, a little
      if ((shapes.get(svg) || 0) < 4 && /^(path|circle|rect|line|polyline|polygon|ellipse)$/.test(e.tagName)) {
        shapes.set(svg, (shapes.get(svg) || 0) + 1);
        for (const p of [cs.fill, cs.stroke]) if (p && !/^(none|url)/.test(p)) note(rgba(p), 0.25);
      }
      continue;
    }
    const link = /^(A|BUTTON)$/.test(e.tagName) || e.getAttribute('role') === 'button';
    const bg = rgba(cs.backgroundColor);
    if (/^(A|BUTTON|H1|H2|H3|EM|STRONG|I|B|MARK)$/.test(e.tagName) || link) note(rgba(cs.color), 1);
    if (bg[3] >= 0.5 && r.width >= 24 && r.height >= 16) note(bg, link ? 2 : r.width >= W * 0.9 ? 2 : 1);
    const side = (s) => (cs[`border${s}Style`] !== 'none' && rgba(cs[`border${s}Color`])[3] >= 0.3 ? parseFloat(cs[`border${s}Width`]) || 0 : 0);
    const [bl, br, bt, bb] = ['Left', 'Right', 'Top', 'Bottom'].map(side);
    if (Math.max(bl, br, bt, bb) >= 2) note(rgba(cs[`border${bl >= 2 ? 'Left' : br >= 2 ? 'Right' : bt >= 2 ? 'Top' : 'Bottom'}Color`]), 1);
    if (cs.position === 'fixed') continue; // overlays and bars: not boxes on the page

    const box = cs.boxShadow !== 'none' ? shadows(cs.boxShadow) : [];
    const textGlow = cs.textShadow !== 'none' && cs.textShadow !== getComputedStyle(e.parentElement).textShadow ? shadows(cs.textShadow) : [];
    const lit = [...box, ...textGlow, ...drops(cs.filter)];
    if (lit.length) {
      const base = lch(under(e.parentElement));
      // a glow: no offset, a wide blur, a coloured or bright light (bright only shows on a dark ground)
      if (lit.some((s) => { const o = lch(s.c); return !s.inset && s.blur >= 12 && Math.abs(s.x) <= s.blur * 0.25 && Math.abs(s.y) <= s.blur * 0.25 && s.c[3] >= 0.2 && (o.C >= 0.08 || (o.L >= 0.8 && base.L <= 0.35)); })) glows.push(e);
      // a heavy shadow: dark, wide and strong, on a light ground where it shows
      const dark = box.filter((s) => !s.inset && s.blur >= 24 && lch(s.c).L < 0.5);
      if (base.L >= 0.5 && r.width >= 100 && r.height >= 60 && dark.reduce((t, s) => t + s.c[3] * s.blur, 0) >= 6) heavy.push(e);
    }
    if (r.width < 120 || r.height < 48 || r.width >= W * 0.9 || /^(INPUT|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|IFRAME|PICTURE|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|PRE|CODE|BUTTON|HR)$/.test(e.tagName) || svg) continue;
    // a box: a frame you can see (a painted ground that stands out, a border all round, a shadow), not a picture
    const edge = under(e.parentElement);
    const painted = (bg[3] >= 0.5 && differs(over(bg, edge), edge)) || (cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage));
    const ring = [bl, br, bt, bb].filter((w, i) => w >= 1 && differs(over(rgba(cs[`border${['Left', 'Right', 'Top', 'Bottom'][i]}Color`]), edge), edge)).length >= 3;
    const raised = box.some((s) => !s.inset && s.c[3] >= 0.05 && (s.blur >= 2 || s.spread >= 1));
    const framed = !/url\(/.test(cs.backgroundImage) && (painted || ring || raised);
    // a thick stripe down one side of a card (a border, or an inset shadow drawn as one)
    let stripe = Math.max(bl, br);
    for (const s of box) if (s.inset && !s.blur && !s.y && Math.abs(s.x) >= 3) stripe = Math.max(stripe, Math.abs(s.x));
    if (stripe >= 3 && Math.max(Math.min(bl, br), bt, bb) <= 1 && (painted || raised || parseFloat(cs.borderTopLeftRadius) >= 4 || parseFloat(cs.borderBottomRightRadius) >= 4)) stripes.push(e);
    // (a drawing built of boxes, a phone with its screen, is one picture: role="img" or aria-hidden)
    if (framed && r.height >= 72 && !e.closest('[role="img"], [aria-hidden="true"]')) boxes.add(e);
  }

  // kicker: a small label in tracked capitals right above a heading, whatever its class
  const kickers = [];
  const heads = [...document.querySelectorAll('h1, h2')].filter((h) => shown(h) && !h.closest('nav'));
  for (const h of heads) {
    let prev = null;
    for (let e = h, up = 0; e && e !== document.body && up < 3 && !prev; e = e.parentElement, up++) {
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (shown(s)) { prev = s; break; }
    }
    if (!prev || prev.matches('a, button, nav, header, footer, [role="navigation"], [role="banner"]') || prev.querySelector('a, button, input, img, svg, video, canvas, h1, h2, h3')) continue;
    // (as written in the source, before text-transform)
    const t = (prev.textContent || '').trim().replace(/\s+/g, ' ');
    // a date, a time, a price over a heading is a fact, not furniture
    if (!t || t.length > 40 || t.split(' ').length > 6 || /\d/.test(t)) continue;
    const pr = prev.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const hs = parseFloat(getComputedStyle(h).fontSize);
    const gap = hr.top - pr.bottom;
    if (gap < -4 || gap > Math.max(32, hs * 0.75) || pr.right < hr.left || pr.left > hr.right) continue;
    let te = prev;
    while (te.children.length === 1 && te.textContent.trim() === te.firstElementChild.textContent.trim()) te = te.firstElementChild;
    const cs = getComputedStyle(te), size = parseFloat(cs.fontSize);
    const caps = cs.textTransform === 'uppercase' || /small-caps/.test(cs.fontVariantCaps || '') || (t === t.toUpperCase() && /\p{Lu}{3}/u.test(t));
    const tracked = (parseFloat(cs.letterSpacing) || 0) / size >= 0.05;
    if (caps && tracked && size <= Math.min(16, hs * 0.75)) kickers.push({ h, label: te, t });
  }
  const h2s = heads.filter((h) => h.tagName === 'H2').length;
  if (kickers.length >= 3 || (kickers.length >= 2 && kickers.length >= h2s / 2)) add('warn', 'kicker', `${kickers.length} headings have a small label in tracked capitals right above them ("${kickers[0].t}" over "${short(kickers[0].h)}"): the eyebrow habit, whatever the class is called. Let the headings speak: drop the labels, or put the word in the heading`, kickers[0].label);

  // cream-accent: the generated trio, from the colours and type as drawn: a cream ground with a terracotta or violet
  // accent, a serif display face, and an italic word in the headline or a pill-shaped button. Cream and terracotta
  // alone is a warm palette, and Warm briefs need one: flagging it pushed warm sites cool.
  const g = lch(ground);
  const h1 = [...document.querySelectorAll('h1')].find(shown);
  const SERIFS = /fraunces|playfair|cormorant|instrument serif|dm serif|lora\b|merriweather|baskerville|garamond|gloock|newsreader|literata|source serif|crimson|spectral|young serif|bodoni|recoleta|georgia|times|caslon|noto serif|pt serif|roboto serif|plex serif|bitter|zilla slab|vollkorn|alegreya(?! sans)|cardo|prata|abril|marcellus|gelasio|piazzolla|libre bodoni|besley|fanwood|sorts mill|gambetta|erode|zodiak|sentient|boska/i;
  const serifFace = (e) => {
    const stack = getComputedStyle(e).fontFamily.split(',').map((s) => s.trim().replace(/["']/g, ''));
    const generic = stack.find((s) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+)$/i.test(s));
    return SERIFS.test(stack[0]) || (generic || '').toLowerCase() === 'serif';
  };
  const italicWord = (e) => getComputedStyle(e).fontStyle === 'normal' && [...e.querySelectorAll('*')].some((k) => k.textContent.trim() && getComputedStyle(k).fontStyle !== 'normal' && shown(k));
  const pill = [...document.querySelectorAll('a[href], button')].find((e) => {
    if (!shown(e) || e.closest('nav')) return false;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    const framed = rgba(cs.backgroundColor)[3] >= 0.5 || (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none');
    const round = (v) => (/%$/.test(v) ? parseFloat(v) >= 50 : parseFloat(v) >= r.height / 2 - 1);
    return framed && r.height >= 28 && r.width >= r.height * 1.8 && round(cs.borderTopLeftRadius) && round(cs.borderBottomRightRadius);
  });
  if (g.L >= 0.88 && g.L <= 0.99 && g.C >= 0.006 && g.C <= 0.07 && g.h >= 45 && g.h <= 105 && h1 && serifFace(h1) && (italicWord(h1) || pill)) {
    const kind = (o) => (o.h >= 20 && o.h <= 62 && o.C <= 0.17 && o.L >= 0.35 && o.L <= 0.75 ? 'terracotta' : o.h >= 265 && o.h <= 320 && o.C >= 0.08 ? 'violet' : 'other');
    const weight = new Map();
    for (const a of accents) weight.set(kind(a.o), (weight.get(kind(a.o)) || 0) + a.w);
    const top = [...weight].sort((a, b) => b[1] - a[1])[0];
    if (top && top[0] !== 'other') {
      const pick = accents.filter((a) => kind(a.o) === top[0]).sort((a, b) => b.w - a.w)[0];
      add('warn', 'cream-accent', `A cream ground (${hex(ground)}) with a ${top[0]} accent (${hex(pick.c)}), a serif headline and ${italicWord(h1) ? 'an italic word in it' : `a pill-shaped button (${name(pill)})`}: the trio generated pages reach for first. Keep the warmth and change one of the three: the accent from the subject (a material, a sign, the product), a sans or slab headline, or square buttons and no italic`, h1);
    }
  }

  // cold-warm: the brief asked for Warm and the page came out cool: a cool or green ground (oklch hue 100 to 290,
  // more than a trace of colour: sage reads cold too), a cool accent on a cool or colourless ground, or a cool
  // accent that carries most of the page's colour whatever the ground (blue ink on kraft). A Warm site with it
  // reads as cold.
  const green = (o) => o.h >= 100 && o.h < 150;
  const coldGround = /^warm/i.test(mood || '') && g.C > 0.01 && (green(g) || (g.h >= 150 && g.h <= 290));
  if (/^warm/i.test(mood || '')) {
    const cool = (o) => o.h >= 150 && o.h <= 290;
    const byColour = new Map();
    for (const a of accents) { const k = hex(a.c); byColour.set(k, { ...a, w: (byColour.get(k)?.w || 0) + a.w }); }
    const accent = [...byColour.values()].sort((a, b) => b.w - a.w)[0];
    const total = accents.reduce((s, a) => s + a.w, 0), coolShare = accents.filter((a) => cool(a.o)).reduce((s, a) => s + a.w, 0) / (total || 1);
    if (coldGround) add('warn', 'cold-warm', `The brief asks for Warm, but the ground (${hex(ground)}) is a ${green(g) ? 'green' : 'cool'} colour (oklch hue ${Math.round(g.h)}), so the page reads cold. Warm the ground (a hue from about 40 to 100: cream, sand, kraft, a warm brown) or the light it sits in`);
    else if (accent && cool(accent.o) && (g.C < 0.004 || (g.C <= 0.01 && cool(g)) || coolShare >= 0.6)) add('warn', 'cold-warm', `The brief asks for Warm, but the accent (${hex(accent.c)}, oklch hue ${Math.round(accent.o.h)}) is cool ${coolShare >= 0.6 && g.C >= 0.004 && !(g.C <= 0.01 && cool(g)) ? `and carries ${Math.round(coolShare * 100)}% of the page's colour` : `on a ${g.C < 0.004 ? 'colourless' : 'cool grey'} ground (${hex(ground)})`}, so the page reads cold. Take a warm accent from the subject (crust, wood, brick, a roast) or tint the ground warm`);
  }

  // tinted-ground: a calm brief (Quiet, Warm, Editorial) on a light ground that carries a colour (sage, mint, peach,
  // a strong sand) where warm white or cream was the start. Cream and sand themselves pass.
  if (/^(quiet|warm|editorial)/i.test(mood || '') && !coldGround && g.L >= 0.85
    && (g.C > 0.05 || (g.C > 0.03 && (g.h < 60 || g.h > 95)) || (g.C > 0.012 && green(g))))
    add('warn', 'tinted-ground', `The brief asks for ${mood}, and the ground (${hex(ground)}, oklch chroma ${g.C.toFixed(3)}, hue ${Math.round(g.h)}) carries a colour, where a calm page starts on warm white or cream (palette.mjs --mood ${mood.toLowerCase()}) and the brand colour goes on the actions. If the person chose this ground, list tinted-ground in .one-shot/allow.json with the reason in the brief`);

  if (glows.length >= 3) add('warn', 'glow', `${glows.length} things glow (a coloured or bright shadow with no offset), like ${name(glows[0])}: neon glows read as generated. Keep one light where the idea needs it, if any, and let the rest sit flat`, glows[0]);
  if (heavy.length >= 3) add('warn', 'heavy-shadow', `${heavy.length} boxes at rest carry a big soft shadow, like ${name(heavy[0])}: boxes floating over the page are a generated habit. Use a small, tight shadow, a hairline, or none`, heavy[0]);
  if (stripes.length >= 2) add('warn', 'side-stripe', `${stripes.length} cards have a thick coloured stripe down one side, like ${name(stripes[0])}: a generated habit. Drop the stripe; if the box needs marking, use its ground or a heading`, stripes[0]);
  const nested = [...boxes].filter((b) => { for (let a = b.parentElement; a; a = a.parentElement) if (boxes.has(a)) return true; return false; });
  if (nested.length >= 2) {
    let outer = nested[0].parentElement;
    while (!boxes.has(outer)) outer = outer.parentElement;
    add('warn', 'nested-boxes', `${nested.length} boxes sit inside other boxes (cards inside a card), like ${name(nested[0])} inside ${name(outer)}: one frame is enough. Drop the outer box, or the inner ones' borders and grounds, and let space group them`, outer);
  }

  // flat-type: the type sizes on a desktop screen too close together for a clear first, second and third thing
  if (W >= 1100) {
    const tally = new Map();
    for (const p of document.querySelectorAll('p, li, dd')) {
      if (p.closest('nav, header, footer, figure, blockquote, button, a') || !shown(p)) continue;
      const n = (p.innerText || '').trim().length;
      if (n < 40) continue;
      const s = Math.round(parseFloat(getComputedStyle(p).fontSize));
      tally.set(s, (tally.get(s) || 0) + n);
    }
    const body = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
    // a heading's size is the largest size its words are set in; the largest on the page counts every text
    const sizeIn = (e) => {
      let max = parseFloat(getComputedStyle(e).fontSize);
      for (const k of e.querySelectorAll('*')) if (k.textContent.trim() && shown(k)) max = Math.max(max, parseFloat(getComputedStyle(k).fontSize));
      return max;
    };
    let top = 0, topEl = null;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const p = t.parentElement;
      if (!t.data.trim() || !p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !shown(p)) continue;
      const s = parseFloat(getComputedStyle(p).fontSize);
      if (s > top) { top = s; topEl = p; }
    }
    // section headings in the page's own parts; one set smaller than the body is a label, not a step of the scale
    const h2 = [...document.querySelectorAll('h2')].filter((h) => shown(h) && !h.closest('header, footer, nav, aside')).map((h) => ({ h, s: sizeIn(h) })).sort((a, b) => a.s - b.s);
    const mid = h2.length >= 2 ? h2[Math.floor(h2.length / 2)] : null;
    if (body && topEl && top / body < 1.5) add('warn', 'flat-type', `The largest text on the page is ${Math.round(top)}px over ${body}px body text (${(top / body).toFixed(2)}×): the sizes are too close for a clear first thing to read. Set the headline at least twice the body size`, topEl);
    else if (body && mid && mid.s >= body && mid.s / body < 1.15) add('warn', 'flat-type', `Section headings are ${Math.round(mid.s)}px over ${body}px body text (${(mid.s / body).toFixed(2)}×), so they barely stand out. Set them clearly larger (1.5× or more), or the steps blur together`, mid.h);
  }
  return out;
}

// Everything the ship gate wants to know about one page.
export function pageFacts() {
  const $ = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const meta = (k) => ($(`meta[name="${k}"]`) || $(`meta[property="${k}"]`))?.getAttribute('content') ?? null;
  // display: contents has no box of its own, so measure what's inside
  const visible = (el) => { const range = document.createRange(); range.selectNodeContents(el); const r = getComputedStyle(el).display === 'contents' ? range.getBoundingClientRect() : el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText || el.innerText || el.getAttribute('title') || el.querySelector('img[alt]')?.alt || el.querySelector('svg title')?.textContent || '').trim();
  const sheets = [];
  let reducedRule = false, animates = false;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) reducedRule = true;
      if (r.style && (r.style.animationName && r.style.animationName !== 'none' || r.style.transitionDuration && !/^0s?$/.test(r.style.transitionDuration))) animates = true;
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const s of document.styleSheets) { try { walk(s.cssRules); sheets.push(s.href || 'inline'); } catch {} }
  const scripts = all('script[src]').map((s) => s.src).join(' ');
  if (/gsap|motion|anime|lenis/i.test(scripts)) animates = true;
  // a heading's words once: split-text effects keep a copy for screen readers next to the animated, aria-hidden one
  const said = (el) => {
    if (!el.querySelector('[aria-hidden="true"]')) return el.innerText.trim().replace(/\s+/g, ' ');
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    c.querySelectorAll('br').forEach((b) => b.replaceWith(' '));
    return c.textContent.trim().replace(/\s+/g, ' ');
  };
  const heads = all('h1, h2, h3').filter(visible);

  return {
    url: location.href,
    lang: document.documentElement.lang,
    charsetFirst: document.head.firstElementChild?.matches('meta[charset]') ?? false,
    title: document.title,
    description: meta('description'),
    viewport: meta('viewport'),
    canonical: $('link[rel="canonical"]')?.href ?? null,
    robots: meta('robots'),
    themeColor: meta('theme-color'),
    og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image'), url: meta('og:url'), type: meta('og:type') },
    twitterCard: meta('twitter:card'),
    icon: $('link[rel~="icon"]')?.href ?? null,
    appleIcon: $('link[rel="apple-touch-icon"]')?.href ?? null,
    jsonld: all('script[type="application/ld+json"]').map((s) => { try { JSON.parse(s.textContent); return 'ok'; } catch (e) { return e.message; } }),
    ldData: all('script[type="application/ld+json"]').flatMap((s) => { try { const j = JSON.parse(s.textContent); return [j['@graph'] || j].flat(); } catch { return []; } }),
    alternates: all('link[rel="alternate"][hreflang]').map((l) => ({ lang: l.getAttribute('hreflang'), href: l.getAttribute('href') || '' })),
    pdfLinks: all('a[href]').filter((a) => /\.pdf(\?|#|$)/i.test(a.getAttribute('href'))).map((a) => (a.innerText || a.getAttribute('href')).trim()),
    h1: all('h1').filter(visible).map(said),
    headingTexts: heads.map(said),
    // the titles of books and works in each one (<cite>, <i>), which keep their capitals
    headingWorks: heads.map((h) => [...h.querySelectorAll('cite, i')].map(said).join(' ')),
    // list items that open with a bold label and a colon ("**Speed:** …"), the chat-answer list style
    inlineHeaders: all('li').filter((li) => {
      const f = li.firstElementChild;
      return f && /^(STRONG|B)$/.test(f.tagName) && li.textContent.trim().startsWith(f.textContent.trim()) && /^\s*:|:\s*$/.test(f.textContent.slice(-1) + (f.nextSibling?.textContent || '').slice(0, 2));
    }).length,
    boldInText: all('p strong, p b, li strong, li b').filter(visible).length,
    paragraphs: all('p').filter(visible).length,
    headings: all('h1,h2,h3,h4,h5,h6').filter((h) => !h.closest('[hidden]')).map((h) => +h.tagName[1]),
    imgNoAlt: all('img:not([alt])').map((i) => i.currentSrc || i.src),
    imgNoSize: all('img').filter((i) => !i.getAttribute('width') && !i.getAttribute('height') && getComputedStyle(i).aspectRatio === 'auto').map((i) => i.currentSrc || i.src),
    linksNoName: all('a[href]').filter((a) => visible(a) && !label(a)).map((a) => a.getAttribute('href')),
    buttonsNoName: all('button, [role="button"]').filter((b) => visible(b) && !label(b)).map((b) => b.outerHTML.slice(0, 80)),
    inputsNoLabel: all('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').filter((i) => !(i.labels?.length || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.title)).map((i) => i.name || i.id || i.type),
    blankTargets: all('a[target="_blank"]').filter((a) => !/noopener|noreferrer/.test(a.rel)).length,
    deadHrefs: all('a[href="#"], a[href=""], a[href^="javascript:"]').filter(visible).map((a) => label(a) || a.outerHTML.slice(0, 60)),
    links: [...new Set(all('a[href]').map((a) => a.href))],
    anchors: all('a[href^="#"]').map((a) => a.getAttribute('href').slice(1)).filter(Boolean).filter((id) => !document.getElementById(decodeURIComponent(id))),
    skipLink: !!all('a[href^="#"]').slice(0, 3).find((a) => /skip|main|content/i.test(a.innerText + a.getAttribute('href'))),
    main: !!$('main, [role="main"]'),
    // sections built after </main> (or before it): the skip link jumps past them and readers' landmark lists skip them
    outsideMain: $('main, [role="main"]') ? (() => {
      const free = all('section, article, h2').filter((e) => visible(e) && !e.closest('main, [role="main"], header, footer, nav, aside, dialog, [role="banner"], [role="contentinfo"], [role="navigation"], [role="complementary"], [role="dialog"]'));
      return free.filter((e) => !free.some((o) => o !== e && o.contains(e))).slice(0, 4).map((e) => {
        const t = ((e.matches('h2') ? e : e.querySelector('h1, h2, h3')) || e).innerText.trim().replace(/\s+/g, ' ');
        return `${e.localName}${t ? ` "${t.slice(0, 40)}${t.length > 40 ? '…' : ''}"` : ''}`;
      });
    })() : [],
    reducedRule,
    animates,
    // pictures a visitor sees: photos (an image, a video, a picture set as a background) and drawings at least 300px
    // wide (an SVG, a canvas; a thin rule or a wave between parts is not a picture). srcs: the photos' addresses,
    // logos left out, for the audit's count of real pictures across the site
    pictures: (() => {
      let photos = 0, drawings = 0;
      const srcs = [];
      const svgUrl = (u) => /\.svg(\?|#|$)|^data:image\/svg/i.test(u);
      const box = (e) => (e.closest('[hidden], template, noscript') ? null : e.getBoundingClientRect());
      const logo = (e, u) => /logo|wordmark/i.test([u, e.getAttribute('alt'), e.getAttribute('class'), e.id, e.closest('a')?.getAttribute('class')].join(' '));
      for (const m of all('img, video')) {
        const r = box(m);
        if (!r || r.width < 1) continue;
        if (m.tagName === 'IMG' && svgUrl(m.currentSrc || m.src)) { if (r.width >= 300 && r.height >= 100) drawings++; }
        else if (r.width >= 100 && (r.height >= 80 || (m.tagName === 'IMG' && !m.complete))) { // (a lazy one not in yet)
          photos++;
          const u = m.tagName === 'IMG' ? m.currentSrc || m.src : m.poster || m.currentSrc || m.src;
          if (u && !logo(m, u)) srcs.push(u);
        }
      }
      for (const m of all('svg, canvas')) {
        if (m.parentElement?.closest('svg')) continue;
        const r = box(m);
        if (r && r.width >= 300 && r.height >= 100) drawings++;
      }
      for (const e of all('body *')) {
        const u = (getComputedStyle(e).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1];
        if (!u) continue;
        const r = box(e);
        if (!r || r.width < 200 || r.height < 120) continue;
        if (!svgUrl(u)) { photos++; if (!logo(e, u)) srcs.push(new URL(u, location.href).href); }
        else if (r.width >= 300) drawings++;
      }
      return { photos, drawings, srcs };
    })(),
    // things on the page a visitor can try: today's hours, a form, a control, a sound, a canvas (a menu or theme
    // button in the header doesn't count)
    tryThings: all('.open-now, .hours [data-days], input:not([type="hidden"]), select, textarea, button[type="button"], details, audio, canvas')
      .filter((e) => !e.closest('template, noscript') && !(e.matches('button') && e.closest('header, nav, [role="banner"], [role="navigation"]'))).length,
    text: document.body.innerText,
    html: document.documentElement.outerHTML.length,
    // template leftovers: exact, case-sensitive and whole words, so "write with your name" is fine
    leftovers: [
      ...(document.documentElement.outerHTML.match(/\{\{[A-Z_ ]+\}\}|\bTODO\b|\bFIXME\b|(?<![\w.-])example\.com\b|\bYour Name\b|\bCompany Name\b|\bJohn Doe\b|\bJane Doe\b/g) || []),
      ...(document.body.innerText.match(/\blorem ipsum\b/gi) || []),
    ].slice(0, 8),
    // where an address can hide outside the text: links, sources, meta tags, forms (audit looks for made-up ones)
    refs: all('[href], [src], [content], [action]').map((e) => ['href', 'src', 'content', 'action'].map((n) => e.getAttribute(n) || '').join(' ')).join(' ').slice(0, 200000),
  };
}

// Text on this screen that something else is drawn over: a picture, a canvas, a card. Runs per screen.
// Decorative layers often ignore the pointer, so hit-testing is switched on for everything while it looks.
export function coveredText() {
  const out = [];
  const st = document.createElement('style');
  st.textContent = '*{pointer-events:auto!important}';
  document.head.append(st);
  const name = (el) => {
    let s = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ([...el.classList].slice(0, 2).map((c) => '.' + c).join(''));
    const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
    return t ? `${s} "${t.slice(0, 32)}${t.length > 32 ? '…' : ''}"` : s;
  };
  // screen-reader-only text (a 1px box that clips it, as the effects addon keeps a split headline): nobody sees it,
  // so nothing covers it. The same test as layoutFaults' srOnly; each probe is sent to the page on its own.
  const srOnly = (el) => {
    for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) {
      const s = getComputedStyle(e);
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || (e.offsetWidth <= 1 && e.offsetHeight <= 1 && s.overflow !== 'visible')) return true;
    }
    return false;
  };
  const solid = (e) => {
    if (/^(CANVAS|IMG|VIDEO|SVG|PICTURE|IFRAME)$/i.test(e.tagName)) return true;
    const cs = getComputedStyle(e);
    // clear: alpha 0 ("rgba(…, 0)", "… / 0)"), not a colour with no blue in it ("rgb(255, 204, 0)", a yellow)
    return cs.backgroundImage !== 'none' || !/^rgba\(.*,\s*0\)$|\/\s*0\)$|^transparent$/.test(cs.backgroundColor);
  };
  // a sticky or fixed bar along the top or bottom edge (a header, the phone's action bar): text scrolls under it by
  // design. Returns the bar, or null.
  const bar = (e) => {
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      if (!/^(fixed|sticky)$/.test(getComputedStyle(a).position)) continue;
      const b = a.getBoundingClientRect();
      return b.height < innerHeight * 0.3 && (b.top <= 1 || b.bottom >= innerHeight - 1) ? a : null;
    }
    return null;
  };
  const atBottom = (b) => b.getBoundingClientRect().bottom >= innerHeight - 1;
  // scrolled to the end, nothing can bring text out from under a bar at the bottom: that is an overlap
  const end = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
  const seen = new Set();
  let underNoted = false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.data.trim() || !el || seen.has(el) || el.closest('[aria-hidden="true"], script, style, noscript') || srOnly(el)) continue;
    // the bar's own words (the action, the phone number) are never covered: the bar is on top by design
    const own = bar(el);
    if (own && atBottom(own) && getComputedStyle(own).position === 'fixed') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    // the first line, and at the end of the page the last one too (the line a bar fixed to the bottom hides)
    const rects = range.getClientRects();
    const lines = end && rects.length > 1 ? [rects[0], rects[rects.length - 1]] : [rects[0]];
    let done = false;
    for (const r of lines) {
      if (done || !r || r.width < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const y = r.top + r.height / 2;
      for (const x of [r.left + 3, r.left + r.width / 2, r.right - 3]) {
        if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === el || el.contains(hit) || hit.contains(el) || hit.closest('[data-oss-numbers]')) continue;
        if (getComputedStyle(el).opacity === '0') continue;
        const hr = hit.getBoundingClientRect();
        if (hr.width >= innerWidth * 0.9 && hr.height >= innerHeight * 0.9) continue; // a full-screen layer (grain, backdrop, 3D stage), not something in the way
        const over = bar(hit);
        if (over && !own) {
          if (end && atBottom(over) && !underNoted && solid(hit)) {
            underNoted = true;
            seen.add(el);
            out.push({ level: 'fail', rule: 'under-bar', text: `At the end of the page this text stays under the bar fixed to the bottom (${name(over)}), where no scrolling brings it out. Give the page room at its end as tall as the bar: body padding-bottom (layout.md, "The action stays in reach")`, where: name(el) });
            done = true;
            break;
          }
          continue;
        }
        if (solid(hit)) { seen.add(el); out.push({ level: 'warn', rule: 'covered', text: `Text is drawn over by ${name(hit)}; check this screen`, where: name(el), by: name(hit) }); done = true; break; }
      }
    }
  }
  st.remove();
  return out;
}

// Text on this screen that runs into other text (collide), or out of the box drawn around it (spill): a label
// pushed into the next one, a word wider than its chip, button or card. On a phone also a control or text set partly
// on a picture, or squeezed beside it (on-picture, below). Runs per screen, as coveredText.
// Letters are measured, not line boxes: each line from its baseline up to the capitals and a little below, so tight
// leading and the dots on a Ü don't count. Left out: aria-hidden decoration, screen-reader-only text, anything in an
// SVG, text faded to nothing or nearly (an outline word behind a headline), look --numbers' badges. Two texts only
// collide where both show: nothing solid is drawn between them (that is covered's business). width, screen: for the
// messages. Returns [{ level, rule, text, where }].
export function clashingText(width, screen) {
  const out = [];
  const W = width || innerWidth, H = innerHeight;
  const at = `At ${W}px on screen ${screen}`;
  const st = document.createElement('style');
  st.textContent = '*{pointer-events:auto!important}';
  document.head.append(st);
  const css = new Map();
  const cs = (e) => { if (!css.has(e)) css.set(e, getComputedStyle(e)); return css.get(e); };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map((c) => '.' + c).join('');
  const quote = (t) => { t = t.trim().replace(/\s+/g, ' '); return `"${t.length > 30 ? t.slice(0, 29) + '…' : t}"`; };
  // screen-reader-only text, as layoutFaults' srOnly (each probe is sent to the page on its own)
  const srOnly = (el) => {
    for (let e = el, i = 0; e && i < 3; e = e.parentElement, i++) {
      const s = cs(e);
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || (e.offsetWidth <= 1 && e.offsetHeight <= 1 && s.overflow !== 'visible')) return true;
    }
    return false;
  };
  const fade = new Map();
  const opacity = (e) => {
    if (!e || e.nodeType !== 1) return 1;
    if (!fade.has(e)) fade.set(e, +cs(e).opacity * opacity(e.parentElement));
    return fade.get(e);
  };
  // any CSS colour -> [r, g, b, a], and the text's metrics, via a canvas
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const colours = new Map();
  const rgba = (c) => {
    if (!colours.has(c)) {
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      colours.set(c, [d[0], d[1], d[2], d[3] / 255]);
    }
    return colours.get(c);
  };
  // the line's letters: from the baseline up to the capitals (or less: "sold out" has no capitals) and 60% of the
  // way down its descenders. A text range's box is the font's ascent to descent, so the baseline sits the font's
  // ascent below its top.
  const fonts = new Map();
  const letters = (s, text) => {
    const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    cx.font = font;
    if (!fonts.has(font)) { const h = cx.measureText('H'); fonts.set(font, { up: h.fontBoundingBoxAscent, down: h.fontBoundingBoxDescent, cap: h.actualBoundingBoxAscent }); }
    const f = fonts.get(font);
    const m = cx.measureText(s.textTransform === 'uppercase' ? text.toUpperCase() : text);
    return { ...f, top: Math.min(m.actualBoundingBoxAscent, f.cap), low: Math.max(0, m.actualBoundingBoxDescent) * 0.6 };
  };
  // a quarter turn (vertical writing, rotate(90deg)) is measured across; other turns are left to the eye
  const turn = (el) => {
    if (/^(vertical|sideways)/.test(cs(el).writingMode)) return 'across';
    let deg = 0;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (s.rotate && s.rotate !== 'none') { const m = s.rotate.match(/(-?[\d.]+)deg/); if (!m) return 'odd'; deg += +m[1]; }
      if (!s.transform || s.transform === 'none') continue;
      const m = s.transform.match(/^matrix\(([^,]+),\s*([^,]+)/);
      if (!m) return 'odd';
      deg += (Math.atan2(+m[2], +m[1]) * 180) / Math.PI;
    }
    const q = ((deg % 180) + 180) % 180;
    return q < 2 || q > 178 ? 'flat' : Math.abs(q - 90) < 2 ? 'across' : 'odd';
  };
  // the part of the screen an element's text can show in: cut by every box around it that hides its overflow (a box
  // placed with position: absolute only by its containing block and what holds that, a fixed one by none)
  const windows = new Map();
  const windowOf = (el) => {
    if (windows.has(el)) return windows.get(el);
    const v = { l: -Infinity, r: Infinity, t: -Infinity, b: Infinity };
    let wait = false; // looking for an absolutely placed box's containing block
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = cs(e);
      if (wait && s.position !== 'static') wait = false;
      if (!wait && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
        const b = e.getBoundingClientRect();
        if (s.overflowX !== 'visible') { v.l = Math.max(v.l, b.left + parseFloat(s.borderLeftWidth)); v.r = Math.min(v.r, b.right - parseFloat(s.borderRightWidth)); }
        if (s.overflowY !== 'visible') { v.t = Math.max(v.t, b.top + parseFloat(s.borderTopWidth)); v.b = Math.min(v.b, b.bottom - parseFloat(s.borderBottomWidth)); }
      }
      if (s.position === 'fixed') break;
      if (s.position === 'absolute') wait = true;
    }
    windows.set(el, v);
    return v;
  };

  // every line of visible text on this screen, as the box of its letters. A closed <details> still lays out its folded
  // part, under its summary but taking no room, so that text has boxes on the next question (14 false collides on an FAQ)
  const runs = [];
  const SKIP = 'script, style, noscript, template, svg, select, option, textarea, [aria-hidden="true"], [hidden], [inert], dialog:not([open]), details:not([open]) > :not(summary), [data-oss-numbers], .visually-hidden, .sr-only';
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement;
    if (!el || !/\S/.test(n.data) || el.closest(SKIP) || srOnly(el)) continue;
    const s = cs(el);
    if (s.visibility !== 'visible' || opacity(el) < 0.05) continue;
    const range = document.createRange();
    range.setStart(n, n.data.search(/\S/));
    range.setEnd(n, n.data.trimEnd().length);
    const lines = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W);
    if (!lines.length) continue;
    const way = turn(el);
    if (way === 'odd') continue;
    const text = n.data.trim().replace(/\s+/g, ' ');
    const m = letters(s, text);
    // faint: an outline word, or text faded far back (decoration behind a headline)
    const ink = rgba(s.getPropertyValue('-webkit-text-fill-color') || s.color);
    const faint = ink[3] * opacity(el) < 0.35;
    for (const r of lines) {
      let box;
      if (way === 'across') { const c = (r.left + r.right) / 2; box = { l: c - m.cap / 2, r: c + m.cap / 2, t: r.top, b: r.bottom }; }
      else {
        const k = m.up + m.down > 0 ? r.height / (m.up + m.down) : 1;
        const base = r.top + m.up * k;
        box = { l: r.left, r: r.right, t: base - m.top * k, b: base + m.low * k };
      }
      if (box.r - box.l < 1 || box.b - box.t < 1) continue;
      // and the part of it that shows (spill wants the whole line: what is cut off is its business)
      const w = windowOf(el);
      const seen = { l: Math.max(box.l, w.l), r: Math.min(box.r, w.r), t: Math.max(box.t, w.t), b: Math.min(box.b, w.b) };
      runs.push({ el, text, faint, ...box, seen: seen.r - seen.l >= 1 && seen.b - seen.t >= 1 ? seen : null });
    }
  }

  // collide: two texts from different elements whose letters overlap by more than a few pixels, both in sight
  const solid = (e) => {
    if (/^(img|video|canvas|picture|iframe|svg|object|embed)$/i.test(e.tagName)) return true;
    const s = cs(e);
    return s.backgroundImage !== 'none' || rgba(s.backgroundColor)[3] >= 0.5 || (!!s.backdropFilter && s.backdropFilter !== 'none');
  };
  const inside = (e, x) => x === e || x.contains(e);
  const told = new Set();
  const sorted = runs.filter((x) => x.seen && !x.faint).sort((a, b) => a.seen.t - b.seen.t);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], A = a.seen;
    for (let j = i + 1; j < sorted.length && sorted[j].seen.t < A.b; j++) {
      const b = sorted[j], B = b.seen;
      if (a.el === b.el) continue;
      const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l), oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
      if (ox <= 3 || oy <= 3) continue;
      const x = (Math.max(A.l, B.l) + Math.min(A.r, B.r)) / 2, y = (Math.max(A.t, B.t) + Math.min(A.b, B.b)) / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= H) continue;
      // hidden: something solid drawn over it there, not a box it sits in. Text overflowing its own box isn't listed
      // where it overflows, so it counts as hidden under anything solid at that point.
      const stack = document.elementsFromPoint(x, y).filter((e) => !e.closest('[data-oss-numbers]'));
      const hidden = (run) => {
        const k = stack.findIndex((e) => inside(e, run.el));
        return (k < 0 ? stack : stack.slice(0, k)).some((e) => !e.contains(run.el) && solid(e) && opacity(e) >= 0.5 && cs(e).visibility === 'visible');
      };
      if (hidden(a) || hidden(b)) continue;
      // named in reading order, so the pair is one finding on every line, screen and width
      const [p, q] = a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? [a, b] : [b, a];
      const where = `${name(p.el)} ${quote(p.text)} and ${name(q.el)} ${quote(q.text)}`;
      if (told.has(where)) continue;
      told.add(where);
      out.push({ level: 'fail', rule: 'collide', text: `${at} ${quote(p.text)} collides with ${quote(q.text)}: their letters overlap (${Math.round(ox)}×${Math.round(oy)}px). Give each its own room: let the row wrap or grow, shorten one, or set one under the other`, where });
    }
  }

  // spill: text whose letters go past the padding box of the nearest box drawn around it (a background that stands
  // out, a border on three sides or more, a shadow), or that the box cuts off. A band across the whole screen is
  // ground, not a box (overflow-x is its business); an ellipsis set on purpose, a line clamp, a box that scrolls, a
  // label positioned on the box's edge and a ticker running through it are meant. So is a legend on its fieldset.
  const grounds = new Map();
  const ground = (e) => {
    if (!e || e.nodeType !== 1) return [255, 255, 255, 1];
    if (!grounds.has(e)) {
      const c = rgba(cs(e).backgroundColor), g = c[3] >= 1 ? c : ground(e.parentElement);
      grounds.set(e, c[3] > 0 && c[3] < 1 ? [0, 1, 2].map((i) => c[i] * c[3] + g[i] * (1 - c[3])).concat(1) : g);
    }
    return grounds.get(e);
  };
  const shadow = (v) => v && v !== 'none' && v.split(/,(?![^(]*\))/).some((x) => {
    const c = x.match(/rgba?\([^)]*\)|#[\da-f]+/i);
    return (!c || rgba(c[0])[3] > 0.05) && /(^|\s)-?(\d*\.)?[1-9][\d.]*px/.test(x.replace(/rgba?\([^)]*\)/, ''));
  });
  // a colour that stands out from the one under it (a faint line on a dark page does)
  const stands = (c, under) => Math.max(...[0, 1, 2].map((i) => Math.abs(c[i] * c[3] + under[i] * (1 - c[3]) - under[i]))) > 8;
  const draws = new Map();
  const drawsBox = (e) => {
    if (draws.has(e)) return draws.get(e);
    const s = cs(e), r = e.getBoundingClientRect();
    let v = false;
    if (!/^(contents|none)$/.test(s.display) && r.width >= 8 && r.height >= 8 && r.width < W - 2) {
      const under = ground(e.parentElement), mine = ground(e);
      v = s.backgroundImage !== 'none' || stands(rgba(s.backgroundColor), under)
        || ['Top', 'Right', 'Bottom', 'Left'].filter((k) => !/^(none|hidden)$/.test(s[`border${k}Style`]) && parseFloat(s[`border${k}Width`]) >= 1 && stands(rgba(s[`border${k}Color`]), mine)).length >= 3
        || shadow(s.boxShadow);
    }
    draws.set(e, v);
    return v;
  };
  const spilt = new Set();
  for (const run of runs) {
    if (run.faint || run.el.closest('legend')) continue;
    let box = null;
    const between = [];
    for (let e = run.el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (drawsBox(e)) { box = e; break; }
      between.push(e);
    }
    if (!box || spilt.has(run.el)) continue;
    const r = box.getBoundingClientRect(), s = cs(box);
    const pb = { l: r.left + parseFloat(s.borderLeftWidth), r: r.right - parseFloat(s.borderRightWidth), t: r.top + parseFloat(s.borderTopWidth), b: r.bottom - parseFloat(s.borderBottomWidth) };
    const sides = { left: pb.l - run.l, right: run.r - pb.r, top: pb.t - run.t, bottom: run.b - pb.b };
    const [side, by] = Object.entries(sides).sort((p, q) => q[1] - p[1])[0];
    if (by <= 3) continue;
    // placed on purpose: a label set on the box's border (position: absolute), a ticker running past its edges
    if (between.some((e) => /^(absolute|fixed)$/.test(cs(e).position) || e.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations === Infinity))) continue;
    const across = side === 'left' || side === 'right';
    const clips = [...between, box].filter((e) => cs(e)[across ? 'overflowX' : 'overflowY'] !== 'visible');
    if (clips.some((e) => /auto|scroll/.test(cs(e)[across ? 'overflowX' : 'overflowY']))) continue;
    // a line the box cuts shows a sliver at least; text set beside its box rather than in it (a caption hung under a
    // card) is placed, not spilt
    const iw = Math.min(run.r, pb.r) - Math.max(run.l, pb.l), ih = Math.min(run.b, pb.b) - Math.max(run.t, pb.t);
    if (iw < 2 || ih < 2 || (!clips.length && (iw * ih) / ((run.r - run.l) * (run.b - run.t)) < 0.3)) continue;
    if ([...between, box].some((e) => cs(e).textOverflow === 'ellipsis' || (cs(e).webkitLineClamp && cs(e).webkitLineClamp !== 'none'))) continue;
    // the part in the box is in sight (not under something else)
    const x = Math.max(0, Math.min(innerWidth - 1, Math.max(run.l, pb.l) + iw / 2)), y = Math.max(0, Math.min(H - 1, Math.max(run.t, pb.t) + ih / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === run.el || run.el.contains(hit) || hit.contains(run.el))) continue;
    spilt.add(run.el);
    const px = Math.round(by);
    // the text it runs up against out there, if any: what a visitor reads as one jumble
    const gap = ({ seen: o }) => (side === 'right' ? o.l - run.r : side === 'left' ? run.l - o.r : side === 'bottom' ? o.t - run.b : run.t - o.b);
    const cross = ({ seen: o }) => (across ? Math.min(o.b, run.b) - Math.max(o.t, run.t) : Math.min(o.r, run.r) - Math.max(o.l, run.l)) > 0;
    const near = runs.filter((o) => o.seen && o.el !== run.el && !o.faint && !box.contains(o.el) && cross(o) && gap(o) > -(run.r - run.l + run.b - run.t) && gap(o) < 12)
      .sort((p, q) => gap(p) - gap(q))[0];
    const into = near ? (gap(near) <= 0 ? `, over ${quote(near.text)}` : `, up against ${quote(near.text)}`) : '';
    const fix = across ? 'Give the box room for its longest word: let it grow with its text, allow a second line, or set the text smaller there'
      : 'Let the box grow with its text (no fixed height), or say it in fewer words';
    out.push(clips.length
      ? { level: 'fail', rule: 'spill', text: `${at} ${quote(run.text)} is cut off by its box (${name(box)}): ${px}px of its letters are hidden on the ${side}. ${fix}; overflow: hidden only hides it`, where: `${name(run.el)} ${quote(run.text)} in ${name(box)}` }
      : { level: 'fail', rule: 'spill', text: `${at} ${quote(run.text)} runs ${px}px out of its box (${name(box)}) on the ${side}${into}. ${fix}`, where: `${name(run.el)} ${quote(run.text)} in ${name(box)}` });
  }

  // on-picture, on a phone: a control or a block of text set partly on a picture it isn't part of, straddling its
  // edge (fail); or a control laid over the picture's frame (placed with position: absolute) and squeezed in beside
  // it, under 24px away, which reads as overlapping it too (warn). A play button wholly on its video, a caption
  // wholly beside its photo, and a card that sits over a photo's edge with the words on the card are placed on
  // purpose. Pictures: img, video, canvas, iframe, a drawing (svg or role="img" with a name), and what a figure shows
  // besides its caption (a phone drawn in HTML). Bars fixed or stuck to the screen pass over everything by design.
  if (W < 600) {
    const seenEl = (e) => cs(e).visibility === 'visible' && opacity(e) >= 0.3 && !e.closest('[aria-hidden="true"], [hidden], [inert], [data-oss-numbers]') && !srOnly(e);
    const pinned = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (/^(fixed|sticky)$/.test(cs(a).position)) return true; return false; };
    const inView = (b) => b.width >= 1 && b.height >= 1 && b.bottom > 0 && b.top < H && b.right > 0 && b.left < W;
    const WORDY = /^(BLOCKQUOTE|P|PRE|TABLE|UL|OL|DL|H[1-6]|FIGCAPTION|CITE|FOOTER)$/;
    const pics = [...document.querySelectorAll('img, video, canvas, iframe, svg, [role="img"], figure > *')].filter((p) => {
      if (p.parentElement?.closest('svg, [role="img"]') || !seenEl(p) || pinned(p)) return false;
      if (p.parentElement?.tagName === 'FIGURE' && !/^(IMG|VIDEO|CANVAS|IFRAME|SVG|PICTURE)$/i.test(p.tagName) && p.getAttribute('role') !== 'img') {
        // a figure's own drawing: not its caption or quote, and drawn (a picture in it, or a ground of its own)
        if (WORDY.test(p.tagName) || !(p.querySelector('img, video, canvas, svg') || drawsBox(p))) return false;
      }
      if (p.tagName.toLowerCase() === 'svg' && p.getAttribute('role') !== 'img' && !p.getAttribute('aria-label') && !p.querySelector('title')) return false;
      const b = p.getBoundingClientRect();
      return b.width >= 64 && b.height >= 64 && inView(b) && !(b.width >= W * 0.9 && b.height >= H * 0.9);
    }).filter((p, _, all) => !all.some((o) => o !== p && o.contains(p) && o.parentElement?.tagName === 'FIGURE'));
    const CONTROL = 'button, input:not([type="hidden"]), select, textarea, [role="button"], [role="group"], [role="radiogroup"], [role="tablist"], a.button, a.btn, a[class*="button"], a[class*="btn"]';
    const things = [];
    for (const c of document.querySelectorAll(CONTROL)) {
      if (c.parentElement?.closest(CONTROL) || !seenEl(c) || pinned(c)) continue;
      const b = c.getBoundingClientRect();
      if (inView(b)) things.push({ el: c, kind: 'control', l: b.left, r: b.right, t: b.top, b: b.bottom, words: (c.innerText || c.getAttribute('aria-label') || c.value || '').trim().replace(/\s+/g, ' ') });
    }
    // blocks of text, as the box of their letters on this screen
    const blocks = new Map();
    for (const run of runs) {
      if (!run.seen || run.faint || pinned(run.el) || run.el.closest(CONTROL)) continue;
      const k = run.el.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd');
      if (!k) continue;
      const v = blocks.get(k), s = run.seen;
      if (v) { v.l = Math.min(v.l, s.l); v.r = Math.max(v.r, s.r); v.t = Math.min(v.t, s.t); v.b = Math.max(v.b, s.b); v.words += ' ' + run.text; }
      else blocks.set(k, { el: k, kind: 'text', ...s, words: run.text });
    }
    things.push(...blocks.values());
    const said = new Set();
    for (const t of things) {
      for (const p of pics) {
        if (p.contains(t.el) || t.el.contains(p)) continue;
        // the part of the picture that shows (a phone set low in a band that cuts it off shows its top only)
        const pr = p.getBoundingClientRect(), pw = windowOf(p);
        const q = { left: Math.max(pr.left, pw.l), right: Math.min(pr.right, pw.r), top: Math.max(pr.top, pw.t), bottom: Math.min(pr.bottom, pw.b) };
        if (q.right - q.left < 1 || q.bottom - q.top < 1) continue;
        const ox = Math.min(t.r, q.right) - Math.max(t.l, q.left), oy = Math.min(t.b, q.bottom) - Math.max(t.t, q.top);
        const area = (t.r - t.l) * (t.b - t.t);
        // what holds both: the stage the picture and this sit on
        let stage = t.el.parentElement;
        while (stage && !stage.contains(p)) stage = stage.parentElement;
        const path = [];
        for (let e = t.el; e && e !== stage; e = e.parentElement) path.push(e);
        // the words sit on a card of their own that sits over the picture: the card is placed, the words are on it
        if (path.slice(t.kind === 'control' ? 1 : 0).some((e) => drawsBox(e))) continue;
        const what = `${t.kind === 'control' ? 'the control' : 'the text'} ${quote(t.words || name(t.el))} (${name(t.el)})`;
        const where = `${name(t.el)} ${quote(t.words || '')} on ${name(p)}`;
        if (said.has(where)) continue;
        if (ox > 3 && oy > 3) {
          const share = (ox * oy) / area;
          if (share < 0.1 || share > 0.9) continue;
          // drawn over the picture, not under it (that is covered's business)
          const stack = document.elementsFromPoint(Math.max(t.l, q.left) + ox / 2, Math.max(t.t, q.top) + oy / 2);
          const it = stack.findIndex((e) => inside(e, t.el)), ip = stack.findIndex((e) => inside(e, p));
          if (it < 0 || (ip >= 0 && ip < it)) continue;
          said.add(where);
          out.push({ level: 'fail', rule: 'on-picture', text: `${at} ${what} sits partly on the picture ${name(p)}: ${Math.round(share * 100)}% of it on, the rest off its edge. On a phone give it its own place above or below the picture (or set it wholly on the picture, on purpose)`, where });
        } else if (t.kind === 'control' && path.some((e) => cs(e).position === 'absolute')) {
          const gap = Math.max(Math.max(t.l, q.left) - Math.min(t.r, q.right), Math.max(t.t, q.top) - Math.min(t.b, q.bottom));
          const beside = ox > 3 ? ox >= (t.r - t.l) * 0.5 : oy >= (t.b - t.t) * 0.5;
          if (gap >= 24 || !beside) continue;
          said.add(where);
          out.push({ level: 'warn', rule: 'on-picture', text: `${at} ${what} is laid over the picture's frame and squeezed in ${Math.max(0, Math.round(gap))}px from the picture ${name(p)}, so it reads as overlapping it. On a phone give it its own row above or below the picture`, where });
        }
      }
    }
  }
  st.remove();
  return out;
}

// Numbers on the page, so a person can point without design words: "make 2a bigger", "swap 3 and 4".
// Blocks (header, each part of main, footer) get 1, 2, 3…; the headline, picture and button inside a block get
// 2a, 2b… Numbering follows the document, so it is the same at every width. Returns the legend.
export function markParts() {
  const blocks = [];
  const header = document.querySelector('body > header, .site-header');
  const main = document.querySelector('main');
  const footer = document.querySelector('body > footer, .site-footer');
  if (header) blocks.push(header);
  if (main) blocks.push(...[...main.children].filter((e) => !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(e.tagName)));
  if (footer) blocks.push(footer);
  const short = (s) => (s || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.classList[0] ? '.' + e.classList[0] : '');
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.ossNumbers = ''; // coveredText skips these
  layer.style.cssText = 'position:absolute;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;pointer-events:none';
  const size = Math.max(18, Math.round(innerWidth / 48)); // the sheets shrink wide screens, so wide screens get bigger badges
  const badge = (el, text, big) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;outline:${big ? 3 : 2}px ${big ? 'solid' : 'dashed'} #ff2d75;outline-offset:-2px`;
    const tag = document.createElement('span');
    tag.textContent = text;
    // a block's number sits inside its corner (blocks have room); a part's sits just above it, so it never hides
    // the first letter of a headline, unless there is no room above
    const px = big ? size : Math.round(size * 0.8);
    const above = !big && r.top + scrollY > px * 1.8;
    tag.style.cssText = `position:absolute;left:${above ? -2 : 0}px;${above ? 'bottom:100%' : 'top:0'};background:#ff2d75;color:#fff;font:700 ${px}px/1 system-ui,sans-serif;padding:0.3em 0.45em;border-radius:${above ? '6px 6px 0 0' : '0 0 6px 0'}`;
    box.append(tag);
    layer.append(box);
  };
  const legend = [];
  blocks.forEach((b, i) => {
    const n = String(i + 1);
    const heading = b.querySelector('h1, h2, h3');
    legend.push({ id: n, what: name(b), text: short(heading?.innerText || b.getAttribute('aria-label') || b.innerText) });
    badge(b, n, true);
    const inside = [b.querySelector('h1, h2'), b.querySelector('img, picture, video, canvas, svg:not([aria-hidden="true"])'), b.querySelector('a.button, .btn, button, a[class*="button"]')]
      .filter((e, j, all) => e && all.indexOf(e) === j);
    inside.forEach((e, j) => {
      const id = n + 'abc'[j];
      legend.push({ id, what: name(e), text: short(e.innerText || e.getAttribute('alt') || e.getAttribute('aria-label') || '') });
      badge(e, id, false);
    });
  });
  document.documentElement.append(layer); // outside body, so body styles can't shift it
  return legend;
}

// Before a picture that outlives the minute (images.mjs og): skip links hidden, and "Open now · until 17:30" back to
// the plain hours that site-data.js keeps in data-hours, as a copy the minute's tick no longer reaches.
export function forPicture() {
  document.querySelectorAll('.skip, [data-og-hide]').forEach((e) => { e.style.visibility = 'hidden'; });
  // and no day of the week marked as today: the picture outlives the day
  document.querySelectorAll('.hours [aria-current]').forEach((e) => e.removeAttribute('aria-current'));
  document.querySelectorAll('[data-hours]').forEach((e) => {
    const c = e.cloneNode(true);
    c.textContent = e.dataset.hours;
    delete c.dataset.state;
    e.replaceWith(c);
  });
  return 1;
}
