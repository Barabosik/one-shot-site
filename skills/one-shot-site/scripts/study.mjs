#!/usr/bin/env node
// study: "I like this site". Opens a site the person likes and measures what makes it feel that way: colours,
// fonts and sizes, spacing, corners, layout, how it moves. In this skill's own terms, so it can go straight into
// the brief.
//
//   node study.mjs https://site.com [--pages /,/work] [--out .one-shot/study] [--headed]
//
// study.md: the measurements and what to take from them. study-desktop.jpg and study-phone.jpg: the first
// screens (study-work-desktop.jpg… for a page other than /). study-sheet.jpg: the first page's screens, scrolling
// down, at desktop width.
//
// Take the feel: the palette's mood, the type's kind and scale, the spacing, the corners, the motion level.
// Never their words, logo, photos, illustrations or icons, and nothing that makes the new site look like theirs.
// Exit code 2 = bad input or the site didn't load.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from './lib/chrome.mjs';
import { args, pagePath, write, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const url = a._[0];
const stop = (line) => { console.error(`${line}\nUsage: node study.mjs https://site-they-like.com [--pages /,/about] [--out .one-shot/study]`); process.exit(2); };
if (!url) stop('study needs the address of the site they like.');
try { const u = new URL(url); if (!/^https?:$/.test(u.protocol) || !u.hostname) throw 0; } catch { stop(`"${url}" is not a full address. Start it with https://`); }
const origin = new URL(url).origin;
const pages = a.pages ? String(a.pages).split(',').map(pagePath) : [new URL(url).pathname || '/'];
const out = resolve(a.out || '.one-shot/study');
mkdirSync(out, { recursive: true });

// Runs in the page. Samples the page the way a visitor sees it and returns plain numbers.
function measure() {
  const W = innerWidth, H = innerHeight;
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  // any CSS colour (rgb, oklch, color()…) to [r, g, b, alpha] through the canvas
  const rgba = (c) => {
    if (!cache.has(c)) {
      cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1);
      cache.set(c, [...cv.getImageData(0, 0, 1, 1).data].map((v, i) => (i === 3 ? v / 255 : v)));
    }
    return cache.get(c);
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  const tally = (map, key, n) => map.set(key, (map.get(key) || 0) + n);
  const top = (map, n) => [...map].sort((x, y) => y[1] - x[1]).slice(0, n);
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && +s.opacity > 0.05; };

  // grounds: what colour is behind each point of a grid, over the whole page (pictures counted apart)
  const grounds = new Map();
  let pictures = 0, samples = 0;
  const pageH = Math.min(document.documentElement.scrollHeight, H * 8);
  for (let y = 0; y < pageH; y += H) {
    scrollTo(0, y);
    for (let gy = 0.05; gy < 1; gy += 0.1) for (let gx = 0.05; gx < 1; gx += 0.1) {
      let el = document.elementFromPoint(W * gx, H * gy);
      if (!el) continue;
      samples++;
      if (el.closest('img, picture, video, canvas') || getComputedStyle(el).backgroundImage.includes('url(')) { pictures++; continue; }
      for (; el; el = el.parentElement) {
        const c = rgba(getComputedStyle(el).backgroundColor);
        if (c[3] > 0.5) { tally(grounds, hex(c), 1); break; }
      }
      if (!el) tally(grounds, hex(rgba(getComputedStyle(document.documentElement).backgroundColor)[3] > 0.5 ? rgba(getComputedStyle(document.documentElement).backgroundColor) : [255, 255, 255, 1]), 1);
    }
  }
  scrollTo(0, 0);

  // ink: text colours by amount of text; accents: the colours of links and buttons
  const inks = new Map(), accents = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(), i = 0; n && i < 3000; n = walker.nextNode(), i++) {
    const el = n.parentElement;
    if (!el || !n.data.trim() || !visible(el)) continue;
    tally(inks, hex(rgba(getComputedStyle(el).color)), n.data.trim().length);
  }
  for (const el of document.querySelectorAll('a, button, [class*="btn"], [class*="button"]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    for (const c of [s.backgroundColor, s.color, s.borderTopColor]) {
      const v = rgba(c);
      if (v[3] < 0.5) continue;
      const chroma = Math.max(...v.slice(0, 3)) - Math.min(...v.slice(0, 3));
      if (chroma > 40) tally(accents, hex(v), chroma);
    }
  }

  // type: the first of each role
  const role = (sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && e.textContent.trim());
    if (!el) return null;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    return {
      family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), stack: s.fontFamily, size, weight: s.fontWeight, style: s.fontStyle,
      lineHeight: s.lineHeight === 'normal' ? 1.2 : Math.round((parseFloat(s.lineHeight) / size) * 100) / 100,
      tracking: s.letterSpacing === 'normal' ? 0 : Math.round((parseFloat(s.letterSpacing) / size) * 1000) / 1000,
      upper: s.textTransform === 'uppercase', measure: el.tagName === 'P' ? Math.round(el.getBoundingClientRect().width / (size * 0.5)) : null,
    };
  };
  const type = { h1: role('h1'), h2: role('h2'), h3: role('h3'), body: role('main p, article p, p'), button: role('a.button, button, [class*="btn"], [class*="button"]'), label: null };
  const small = [...document.querySelectorAll('span, p, div, li, small')].find((e) => visible(e) && e.children.length === 0 && e.textContent.trim().length > 2 && getComputedStyle(e).textTransform === 'uppercase' && parseFloat(getComputedStyle(e).fontSize) < 15);
  if (small) type.label = { size: parseFloat(getComputedStyle(small).fontSize), tracking: Math.round((parseFloat(getComputedStyle(small).letterSpacing) || 0) / parseFloat(getComputedStyle(small).fontSize) * 1000) / 1000 };
  const webfonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))];

  // spacing: section padding and the gaps between sections; where text starts and how wide it runs
  const sections = [...document.querySelectorAll('main > *, body > section, main section')].filter((e) => visible(e) && e.getBoundingClientRect().height > 80);
  const pads = sections.map((e) => parseFloat(getComputedStyle(e).paddingTop) + parseFloat(getComputedStyle(e).paddingBottom)).filter((x) => x > 0);
  const median = (xs) => (xs.length ? [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] : null);
  const lefts = new Map(), rights = [];
  for (const el of document.querySelectorAll('h2, p')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    tally(lefts, Math.round(r.left / 8) * 8, 1);
    rights.push(r.right);
  }

  // shapes: corners, shadows, hairlines
  const radii = new Map();
  for (const el of document.querySelectorAll('a, button, img, picture, video, article, li, div, input')) {
    if (!visible(el)) continue;
    const r = getComputedStyle(el).borderTopLeftRadius;
    if (r && r !== '0px') tally(radii, r.includes('%') || parseFloat(r) > 200 ? 'pill/round' : `${Math.round(parseFloat(r))}px`, 1);
  }
  let shadows = 0, hairlines = 0, grids = 0, maxCols = 1;
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.boxShadow !== 'none') shadows++;
    if (parseFloat(s.borderTopWidth) === 1 || parseFloat(s.borderBottomWidth) === 1) hairlines++;
    if (s.display === 'grid' || s.display === 'inline-grid') { grids++; maxCols = Math.max(maxCols, s.gridTemplateColumns.split(' ').filter(Boolean).length); }
  }

  // motion: libraries on the page, animations running, things waiting to be revealed
  const has = (sel) => !!document.querySelector(sel);
  const libs = [
    window.gsap && 'GSAP', window.ScrollTrigger && 'ScrollTrigger', (window.Lenis || window.lenis || document.documentElement.classList.contains('lenis')) && 'Lenis (smooth scroll)',
    has('[data-framer-name], [data-framer-component-type]') && 'Framer', has('[data-aos]') && 'AOS', has('[data-scroll-container]') && 'Locomotive Scroll',
    (window.THREE || window.__THREE__) && 'three.js', has('lottie-player, dotlottie-player') && 'Lottie', (window.Swiper || has('.swiper')) && 'Swiper',
    has('.w-webflow-badge, html[data-wf-site]') && 'Webflow interactions', (window.barba) && 'Barba (page transitions)',
  ].filter(Boolean);
  const webgl = [...document.querySelectorAll('canvas')].some((c) => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } });
  const waiting = [...document.querySelectorAll('main *, section *')].filter((e) => e.getBoundingClientRect().top > H && +getComputedStyle(e).opacity < 0.05 && e.textContent.trim()).length;

  // the first screen: the block around the h1, if it is a block and not the whole page
  const hero = document.querySelector('h1')?.closest('section, header, [class*="hero"]')?.getBoundingClientRect();
  return {
    width: W, grounds: top(grounds, 4).map(([c, n]) => [c, Math.round((n / Math.max(1, samples - pictures)) * 100)]), pictures: Math.round((pictures / Math.max(1, samples)) * 100),
    inks: top(inks, 3).map(([c]) => c), accents: top(accents, 3).map(([c]) => c),
    type, webfonts, sectionPad: median(pads), sectionCount: sections.length, firstScreen: hero && hero.height < H * 3 ? Math.round((hero.height / H) * 100) : null,
    left: top(lefts, 1)[0]?.[0] ?? null, right: Math.round(median(rights) || 0), radii: top(radii, 3).map(([r]) => r), shadows, hairlines, grids, maxCols,
    libs, webgl, waiting, animations: document.getAnimations().length,
    media: { img: document.images.length, video: document.querySelectorAll('video').length, canvas: document.querySelectorAll('canvas').length },
  };
}

const browser = await launch({ headed: !!a.headed });
const results = [];
try {
  for (const path of pages) {
    const got = {};
    const slug = path === '/' ? '' : '-' + path.replace(/^\/|\.html$/g, '').replace(/[^\w-]+/g, '-');
    for (const [label, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
      const page = await browser.newPage({ width: w, height: h, mobile: w < 600, scale: 1 });
      await page.goto(origin + path);
      // a 404, a 403 or a bot wall is a page too: measured, it would describe the error page (0: Chrome before 109)
      const status = await page.eval("performance.getEntriesByType('navigation')[0]?.responseStatus || 0");
      if (status >= 400) throw new Error(`${origin}${path} answers ${status}, so there is nothing to study there (a wrong --pages path, or the site turns away automated browsers).`);
      await sleep(2500); // entrances, fonts, late scripts
      await page.shot(join(out, `study${slug}-${label}.jpg`), { quality: 80 });
      got[label] = await page.call(measure);
      if (label === 'desktop' && path === pages[0]) {
        const frames = [];
        for (let i = 0; i < 6; i++) {
          if (i && (await page.eval('scrollY + innerHeight >= document.documentElement.scrollHeight - 2'))) break;
          await page.eval(`scrollTo({ top: ${i * h}, behavior: 'instant' })`);
          await sleep(900);
          const f = `frame-${i}.jpg`;
          await page.shot(join(out, f), { quality: 72 });
          frames.push(f);
        }
        write(join(out, 'sheet.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#222;font:600 15px system-ui;color:#ddd}
          h1{font-size:17px;margin:0 0 16px} .g{display:grid;grid-template-columns:repeat(3,1fr);gap:14px} img{width:100%;display:block;outline:1px solid #444}</style>
          <h1>${origin}${path} · desktop, scrolling down</h1><div class="g">${frames.map((f) => `<img src="${f}">`).join('')}</div>`);
        const sheet = await browser.newPage({ width: 1600, height: 900 });
        await sheet.goto('file:///' + join(out, 'sheet.html').replace(/\\/g, '/'));
        const sh = await sheet.eval('document.documentElement.scrollHeight');
        await sheet.shot(join(out, 'study-sheet.jpg'), { quality: 80, clip: { x: 0, y: 0, width: 1600, height: sh } });
        await sheet.close();
        for (const f of [...frames, 'sheet.html']) rmSync(join(out, f));
      }
      await page.close();
    }
    results.push({ path, slug, ...got });
  }
} finally {
  await browser.close();
}

// --- in this skill's terms ---
const lum = (h) => { const [r, g, b] = h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const chroma = (h) => { const v = h.slice(1).match(/../g).map((x) => parseInt(x, 16)); return Math.max(...v) - Math.min(...v); };
const kind = (stack = '') => (/mono|code|courier/i.test(stack) ? 'monospace' : /serif/i.test(stack.replace(/sans-serif/gi, '')) ? 'serif' : /cursive|script|hand/i.test(stack) ? 'script' : 'sans-serif');
const px = (x) => (x == null ? '?' : `${Math.round(x)}px`);
// the browser's own link colours (blue, visited purple): an unstyled link, not a brand
const BROWSER_LINK = new Set(['#0000ee', '#551a8b', '#0000ff', '#800080']);
const said = (c) => (BROWSER_LINK.has(c) ? `${c} (the browser's default link colour)` : c);
const lines = [];
for (const r of results) {
  const d = r.desktop, p = r.phone;
  const ground = d.grounds[0]?.[0] || '#ffffff';
  const dark = lum(ground) < 0.2;
  const accent = d.accents.find((c) => !BROWSER_LINK.has(c)) || null;
  const strategy = accent && chroma(ground) > 60 && Math.abs(lum(ground) - lum(accent)) < 0.15 ? 'drenched' : chroma(ground) > 12 ? 'committed' : 'quiet';
  const warmth = (() => { const [rr, , bb] = ground.slice(1).match(/../g).map((x) => parseInt(x, 16)); return rr - bb > 8 ? 'warm' : bb - rr > 8 ? 'cool' : 'neutral'; })();
  const t = d.type;
  const ratio = t.h1 && t.body ? (t.h1.size / t.body.size).toFixed(1) : '?';
  const level = d.webgl || d.libs.includes('three.js') ? 'Showpiece' : d.libs.some((l) => /GSAP|ScrollTrigger|Framer|Locomotive|Lenis|Webflow|AOS|Barba/.test(l)) ? 'Lively' : d.waiting || d.animations ? 'Gentle' : 'Still';
  lines.push(
    `## ${origin}${r.path}`,
    '',
    `Pictures: study${r.slug}-desktop.jpg, study${r.slug}-phone.jpg${r.path === pages[0] ? ', study-sheet.jpg (scrolling down)' : ''}.`,
    '',
    '### Colour',
    `- Ground: ${d.grounds.map(([c, n]) => `${c} (${n}%)`).join(', ')}${dark ? ', a dark site' : ''}. Pictures cover about ${d.pictures}% of the page.`,
    `- Text: ${d.inks.join(', ')}. Links and buttons: ${d.accents.map(said).join(', ') || 'no strong colour'}.`,
    `- In palette.mjs terms: ${accent ? `--brand "${accent}" ` : ''}--strategy ${strategy}${dark ? ' --mode dark' : ''} --ground ${warmth}. Use the mood, then pick the person's own colour.`,
    '',
    '### Type',
    ...['h1', 'h2', 'body', 'button'].filter((k) => t[k]).map((k) => `- ${k}: ${t[k].family} (${kind(t[k].stack)}), ${px(t[k].size)} on desktop / ${px(p.type[k]?.size)} on a phone, weight ${t[k].weight}${t[k].style === 'italic' ? ' italic' : ''}, line height ${t[k].lineHeight}${t[k].tracking ? `, tracking ${t[k].tracking}em` : ''}${t[k].upper ? ', capitals' : ''}${t[k].measure ? `, about ${t[k].measure} characters a line` : ''}`),
    ...(t.label ? [`- Small capital labels: ${px(t.label.size)}, tracking ${t.label.tracking}em.`] : []),
    `- Headline to body: ${ratio}× on desktop${p.type.h1 && p.type.body ? `, ${(p.type.h1.size / p.type.body.size).toFixed(1)}× on a phone` : ''}. Web fonts: ${d.webfonts.join(', ') || 'none (system fonts)'}.`,
    '- Take the kind (a condensed grotesk, a soft serif…), the weight and the scale. Find a free face of that kind on Fontsource; never copy their font files.',
    '',
    '### Space and shape',
    `- ${d.sectionCount} sections${d.firstScreen ? `; the one with the headline fills ${d.firstScreen}% of the screen` : ''}.${d.sectionPad ? ` Section padding about ${px(d.sectionPad)} on desktop${p.sectionPad ? `, ${px(p.sectionPad)} on a phone` : ''}.` : ''}`,
    `- Text starts ${px(d.left)} from the left at 1440 and runs to about ${px(d.right)}; phone side margin ${px(p.left)}.`,
    `- Corners: ${d.radii.join(', ') || 'square'}. Shadows on ${d.shadows} elements, hairline borders on ${d.hairlines}. Grids: ${d.grids}, up to ${d.maxCols} columns.`,
    '',
    '### Motion',
    `- Level: ${level}. ${d.libs.length ? `Uses ${d.libs.join(', ')}.` : 'No motion library.'}${d.webgl ? ' WebGL on the page.' : ''} ${d.waiting} blocks wait below the fold for a reveal; ${d.animations} animations running at load.`,
    `- To see it move: node SKILL_DIR/scripts/film.mjs ${origin}${r.path}`,
    '',
  );
}
write(join(out, 'study.md'), [
  `# What makes ${origin} feel the way it does`,
  '',
  'Take the feel: palette mood, kind and scale of type, spacing, corners, motion level. Never their words, logo,',
  'photos, illustrations, icons or font files, and nothing that makes the new site look like theirs.',
  '',
  ...lines,
].join('\n'));
console.log(`Study: ${join(out, 'study.md')}\n`);
console.log(lines.slice(0, 18).join('\n'));
