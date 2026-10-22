#!/usr/bin/env node
// audit: the gate before shipping. Checks the built site the way search engines, social previews,
// screen readers, keyboards, phones and slow connections will meet it.
//
//   node audit.mjs [dist] [--site .] [--draft] [--external] [--lighthouse] [--scheme light|dark] [--headed] [--out .one-shot/audit.md]
//
// dist     the built folder (run the build first)
// --site   the project folder, for the source lint (default: the folder above dist)
// --draft  the address isn't known yet: skip the checks that need it (canonical, link-preview URLs, sitemap), and
//          let the facts that come later through: the host, and the owner's legal name, listed as waiting on them
// --headed  a real browser window (off-screen), when 3D renders black headless
// --scheme dark  check the site as a visitor with a dark system setting sees it (out: .one-shot/audit-dark.md; a file
//          given with --out gets the "-dark" before its .md); with the theme addon, run the audit once per scheme,
//          since contrast can pass in one and fail in the other
// Exit code 1 = at least one "fix"; 2 = bad input. Measured findings come from the browser; lint findings from source.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { launch, sleep } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';
import { clashingText, coveredText, layoutFaults, pageFacts, scrollThrough, settle, settledFaults } from './lib/probes.mjs';
import { args, colorScheme, EVENT, forwardsOnly, imageSize, NOT_LOCAL, problem, report, schemed, write, stopOnError, usage } from './lib/cli.mjs';
import { lintCopy, madeUp, namesIn, titleCase, vagueAction, wordsIn } from './lib/words.mjs';
import { recordSite } from './lib/history.mjs';
import { lint, readAllow } from './lint.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const { scheme, suffix } = colorScheme(a);
// the last report goes first: a run that stops leaves no old "Ready to ship." to read
const outMd = resolve(schemed(a.out || '.one-shot/audit.md', suffix, true)), outJson = outMd.replace(/\.md$/, '.json');
for (const f of [outMd, outJson]) rmSync(f, { force: true });
const dist = resolve(a._[0] || 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No index.html in ${dist}. Build first (npm run build), then run the audit on the output folder.`);
  process.exit(2);
}
const siteDir = resolve(a.site || dirname(dist));
const findings = [];
const notes = [];
const add = (level, rule, text, at = '') => findings.push({ level, rule, text, at });

// ---------- files on disk ----------
const walk = (d, list = []) => {
  for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, list) : list.push(p); }
  return list;
};
const all = walk(dist);
const rel = (p) => '/' + relative(dist, p).replace(/\\/g, '/');
// og.html is only there to be photographed; a page at an old address only forwards to its new place
const htmlPages = all.filter((f) => f.endsWith('.html') && rel(f) !== '/og.html' && !forwardsOnly(readFileSync(f, 'utf8')));

for (const f of ['robots.txt', 'sitemap.xml', '404.html']) if (!existsSync(join(dist, f))) add(f === '404.html' ? 'fail' : 'warn', 'site-file', `${f} is missing.`);
if (existsSync(join(dist, 'robots.txt')) && !/sitemap:/i.test(readFileSync(join(dist, 'robots.txt'), 'utf8'))) add('warn', 'site-file', 'robots.txt does not point to the sitemap (Sitemap: https://…/sitemap.xml).');
const sitemapLocs = existsSync(join(dist, 'sitemap.xml')) ? [...readFileSync(join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]) : [];
// placeholders left in the other text files (favicon, manifest…); {{URL}} has its own finding below
for (const f of all.filter((x) => /\.(svg|txt|xml|json|webmanifest)$/.test(x))) {
  const left = [...new Set(readFileSync(f, 'utf8').match(/\{\{[A-Z_]+\}\}/g) || [])].filter((x) => x !== '{{URL}}');
  if (left.length) add('fail', 'placeholder', `${rel(f)} still has ${left.join(', ')}`);
}
if (all.some((f) => f.endsWith('.map'))) add('warn', 'source-maps', 'Source maps are in the build. Fine for debugging, but they publish your source.');

const gz = (f) => gzipSync(readFileSync(f)).length;
const kb = (n) => `${Math.round(n / 1024)} KB`;

for (const f of all) {
  const ext = extname(f).toLowerCase();
  const size = statSync(f).size;
  if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(ext)) {
    if (size > 1024 * 1024) add('fail', 'image-weight', `${rel(f)} is ${kb(size)}. Resize and compress it (WebP/AVIF, under 300 KB for most photos).`);
    else if (size > 400 * 1024) add('warn', 'image-weight', `${rel(f)} is ${kb(size)}; most photos look the same under 300 KB.`);
  }
  if (['.mp4', '.webm'].includes(ext) && size > 8 * 1024 * 1024) add('warn', 'video-weight', `${rel(f)} is ${kb(size)}. Shorter loop, lower bitrate, or a poster image with click-to-play.`);
}

// ---------- the pages in a browser ----------
// Between the fixed widths: a layout made for 1440 and one for a phone can both pass while a laptop width squeezes
// the first into a jumble (a tag hung beside the headline drops onto the button at 1170). The desktop page is
// resized through these widths, narrowest first, and only the cheap geometry rules run on each screen: text into
// text (collide), out of its box (spill), on a picture's edge (on-picture), drawn over (covered), or past the screen
// (overflow-x, headline-overflow). A fault is told once, at the narrowest width it shows at, at its rule's level;
// one the fixed widths found already isn't told again.
// (steps of 60 to 100px, with the common laptop widths 1024, 1280 and 1366, and 1180, a tablet held sideways)
const SWEEP = [900, 960, 1024, 1100, 1180, 1280, 1366, 1400];
const SWEPT = new Set(['overflow-x', 'headline-overflow', 'collide', 'spill', 'on-picture', 'covered']);
// one fault at every width: its rule and what it names (overflow-x names nothing, only the widest box in its text)
const faultKey = (f) => `${f.rule}|${f.where || f.text.replace(/\d+/g, '#')}`;
const atWidth = (w, s, f) => (/^At \d+px/.test(f.text) || f.rule === 'overflow-x' ? f.text
  : f.rule === 'covered' && f.by ? `At ${w}px on screen ${s} ${f.by} is drawn over ${f.where}: a width between the phone and desktop checks. Give each its own room there (a breakpoint, or let the row wrap)`
  : `At ${w}px${s ? ` on screen ${s}` : ''}: ${f.text}`);
const swept = { pages: 0, ms: 0 };
async function sweep(p, path, known) {
  const t0 = Date.now();
  const told = new Set(known);
  for (const w of SWEEP) {
    await p.viewport({ width: w, height: 900 });
    // a box that eases to its new size (transition: all) arrives first
    await p.call(settle, 1500);
    const found = (await p.call(layoutFaults, w)).map((f) => [0, f]);
    const screens = Math.ceil((await p.eval('document.documentElement.scrollHeight')) / 900);
    // each screen in one call: scrolled to, settled, then both per-screen probes
    for (let s = 1; s <= screens; s++) {
      const here = await p.eval(`(async () => { scrollTo({ top: ${(s - 1) * 900}, behavior: 'instant' }); await (${settle})(1000);
        return [...(${coveredText})(), ...(${clashingText})(${w}, ${s})]; })()`);
      for (const f of here) found.push([s, f]);
    }
    for (const [s, f] of found) {
      if (!SWEPT.has(f.rule) || told.has(faultKey(f))) continue;
      told.add(faultKey(f));
      const { by, ...rest } = f;
      findings.push({ ...rest, text: atWidth(w, s, f), at: `${path} ${w}px` });
    }
  }
  swept.pages++;
  swept.ms += Date.now() - t0;
}

const site = await serve(dist);
const browser = await launch({ headed: !!a.headed });
const facts = [];
const firstLoad = new Map(); // page -> bytes
try {
  for (const file of htmlPages) {
    const path = rel(file).replace(/\/index\.html$/, '/');
    const page = await browser.newPage({ width: 1440, height: 900, colorScheme: scheme });
    await page.goto(site.url + path);
    await sleep(600);
    const f = await page.call(pageFacts);
    f.path = path;
    facts.push(f);
    let bytes = 0, js = 0, css = 0, fonts = 0;
    for (const [u, n] of page.bytes) {
      bytes += n;
      const local = u.startsWith(site.url) ? join(dist, decodeURIComponent(new URL(u).pathname)) : null;
      const g = local && existsSync(local) && statSync(local).isFile() ? gz(local) : n;
      if (/\.m?js(\?|$)/.test(u)) js += g;
      else if (/\.css(\?|$)/.test(u)) css += g;
      else if (/\.(woff2?|ttf|otf)(\?|$)/.test(u)) fonts += g;
    }
    firstLoad.set(path, { bytes, js, css, fonts });
    // other servers the page talks to before anyone clicks (fonts, maps, video, trackers)
    f.thirdParty = [...new Set([...page.bytes.keys()].filter((u) => /^https?:/.test(u) && !u.startsWith(site.url)).map((u) => new URL(u).host))];
    // the 404 page answers with 404 by design, and it links home and to its icon by the live address (hosts serve it
    // at any depth), which this local copy can't reach before the first publish: its requests are not judged here
    for (const p of page.problems) if (!(path.endsWith('404.html') && (p.kind === 'http' || p.kind === 'network'))) findings.push(problem(p, path));

    // keyboard: the first few Tab presses must land somewhere visible, with a visible ring
    if (!path.endsWith('404.html')) {
      const stops = [];
      for (let i = 0; i < 4; i++) {
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await sleep(120);
        stops.push(await page.eval(`(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const s = getComputedStyle(e); const r = e.getBoundingClientRect();
          const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return { name: (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30), ring, shown: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight };
        })()`));
      }
      const first = stops.find(Boolean);
      if (!first) add('fail', 'keyboard', 'Tab does not reach anything on the page.', path);
      else {
        const noRing = stops.filter((s) => s && !s.ring);
        if (noRing.length) add('warn', 'focus-ring', `No visible focus ring on: ${noRing.map((s) => s.name).join(', ')} (checked outline and box-shadow).`, path);
        const unseen = stops.filter((s) => s && !s.shown);
        if (unseen.length) add('warn', 'focus-hidden', `Keyboard focus lands on something off-screen: ${unseen.map((s) => s.name).join(', ')}.`, path);
      }
    }
    await page.close();

    // phone and desktop layout, then a reduced-motion pass: content must still show up; the desktop page then goes
    // through the widths between
    if (!path.endsWith('404.html')) {
      const known = new Set();
      for (const [w, h, reduced] of [[390, 844, false], [1440, 900, false], [390, 844, true]]) {
        const p = await browser.newPage({ width: w, height: h, mobile: w < 600, reducedMotion: reduced, colorScheme: scheme });
        await p.goto(site.url + path);
        await sleep(700);
        await p.call(scrollThrough, 140);
        await sleep(300);
        for (const x of await settledFaults(p, w)) {
          if (reduced && x.rule !== 'never-shown') continue;
          if (!reduced) known.add(faultKey(x));
          findings.push({ ...x, level: reduced ? 'fail' : x.level, rule: reduced ? 'reduced-motion-hidden' : x.rule, text: reduced ? `With reduced motion on, this never appears: ${x.where}` : x.text, at: `${path} ${w}px` });
        }
        if (w === 1440) await sweep(p, path, known);
        await p.close();
      }
    }
  }

  // axe-core, when the site has it installed: the broadest accessibility rule set there is
  let axePath = null;
  try { axePath = createRequire(join(siteDir, 'package.json')).resolve('axe-core/axe.min.js'); } catch {}
  if (axePath) {
    const src = readFileSync(axePath, 'utf8');
    for (const f of facts.filter((x) => !x.path.endsWith('404.html'))) {
      const p = await browser.newPage({ width: 1440, height: 900, colorScheme: scheme });
      await p.goto(site.url + f.path);
      // let entrances finish first: half-faded text would read as a contrast failure
      await sleep(1200);
      await p.call(scrollThrough, 120);
      await p.eval(`new Promise((done) => { const t0 = performance.now(); (function wait() {
        const busy = document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getTiming().iterations !== Infinity);
        if (!busy || performance.now() - t0 > 4000) setTimeout(done, 400); else setTimeout(wait, 50); })(); })`);
      await p.eval(src + ';1');
      const res = await p.eval(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, where: v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ') })))`);
      notes.push(`axe-core on ${f.path}: ${res.length ? `${res.length} rule${res.length > 1 ? 's' : ''} broken, listed above` : 'no violations'}.`);
      for (const v of res) add(['critical', 'serious'].includes(v.impact) ? 'fail' : 'warn', `axe:${v.id}`, `${v.help} (${v.n}×: ${v.where})`, f.path);
      await p.close();
    }
  } else notes.push('axe-core is not installed in the site, so only the built-in accessibility checks ran. For the full rule set: npm i -D axe-core');

  // links between pages, and anchors
  const checked = new Set();
  for (const f of facts) {
    for (const u of f.links) {
      const url = new URL(u);
      if (url.origin !== site.url) continue;
      const key = url.pathname;
      if (checked.has(key)) continue;
      checked.add(key);
      const r = await fetch(site.url + key, { method: 'HEAD' });
      if (r.status >= 400) add('fail', 'broken-link', `Link to ${key} is broken (${r.status}).`, f.path);
    }
    for (const id of f.anchors) add('fail', 'broken-anchor', `Link to #${id}, but nothing on the page has that id.`, f.path);
  }
  if (a.external) {
    const ext = [...new Set(facts.flatMap((f) => f.links).filter((u) => /^https?:/.test(u) && !u.startsWith(site.url)))];
    await Promise.all(ext.map(async (u) => {
      try {
        let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
        if (r.status === 405 || r.status === 403) r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
        if (r.status >= 400 && r.status !== 429 && r.status !== 999) add('warn', 'external-link', `${u} answered ${r.status}.`);
      } catch (e) {
        // Node says only "fetch failed"; the reason is in e.cause. A refused certificate is not "offline".
        const c = e.cause?.code || e.cause?.errors?.[0]?.code || ''; // several addresses tried: an AggregateError
        const why = e.name === 'TimeoutError' ? 'nothing in 10 s'
          : /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT)$/.test(c) ? 'no connection: offline, or the address is wrong'
          : /CERT|SSL|TLS|VERIFY/.test(c) ? `its secure connection failed: ${c}`
          : c || e.cause?.message || e.message;
        add('warn', 'external-link', `${u} did not answer (${why}).`);
      }
    }));
  } else notes.push('External links were not checked (add --external).');
} finally {
  await browser.close();
  await site.close();
}
if (swept.pages) notes.push(`Layout between the phone and desktop widths: ${SWEEP.length} widths from ${SWEEP[0]} to ${SWEEP.at(-1)}px on ${swept.pages} page${swept.pages > 1 ? 's' : ''} (${(swept.ms / 1000).toFixed(1)} s).`);

// ---------- judging the facts ----------
// No address yet ({{URL}} still in the page): one clear finding instead of a dozen confusing ones.
// where each starter placeholder goes, so the finding says what to do
const HINTS = {
  '{{ABOUT}}': 'write the about text in the page',
  '{{SCHEMA_TYPE}}': 'the JSON-LD @type: Person, Organization, LocalBusiness, Event…',
  '{{DESCRIPTION}}': 'the meta description, 120 to 160 characters',
  '{{EMAIL}}': 'the contact email',
  '{{THEME_COLOR}}': 'the brand colour as #hex',
  '{{ICON_INK}}': 'the favicon letter colour',
  '{{OWNER_NAME}}': "the owner's full name for the Impressum and privacy page (owner.name), required by law. Ask for it; both pages stay, with this mark, until it's in site.json",
  '{{HOST}}': 'the hosting provider, "host" in site.json; set-url.mjs fills it for GitHub Pages, Vercel, Netlify and Cloudflare',
};
const URL_HOLE = /\{\{URL\}\}|%7B%7BURL%7D%7D/;
const noAddress = facts.some((f) => URL_HOLE.test([f.canonical, f.og.url, f.og.image].join(' ')));
if (noAddress) {
  if (a.draft) notes.push('Draft: the site has no address yet, so canonical, link-preview URLs and the sitemap were not checked. Set the URL before shipping.');
  else add('fail', 'address', 'The site has no address yet ({{URL}} is still in the page, robots.txt and sitemap.xml). Once the URL is known, replace {{URL}} everywhere with it (ending in /). Until then, run the audit with --draft.');
}
// photos the brief plans ("The pictures, planned": their own, or free ones from photos.mjs), not "no photos"
const briefText = (() => { try { return readFileSync(join(siteDir, '.one-shot/brief.md'), 'utf8'); } catch { return ''; } })();
const planned = (briefText
  .match(/\*\*The pictures, planned:?\*\*:?([\s\S]*?)(?=\n[ \t]*(?:- \*\*|#)|\n[ \t]*\n|$)/i) || [])[1] || '';
const photosPlanned = /\bphotos?\b|\bphotograph|\bfotos?\b/i.test(planned.replace(/\b(no|not|never|without|instead of)\s+(free\s+|stock\s+|any\s+)?(photos?|fotos?)\b/gi, ''));
// a draft lets the facts that come later through (facts.md, "|later"): the host, which set-url.mjs fills in, and the
// owner's legal name, listed under the notes as waiting on them. The final audit stops on both.
const later = (x) => a.draft && (x === '{{HOST}}' || x === '{{OWNER_NAME}}');
const waitingOn = new Set();
for (const f of facts) {
  const at = f.path;
  const is404 = at.endsWith('404.html');
  const home = at === '/';
  if (is404) {
    if (!/noindex/.test(f.robots || '')) add('warn', '404', '404.html should carry <meta name="robots" content="noindex">.', at);
    if (!f.links.length) add('warn', '404', 'The 404 page should link back home.', at);
    continue;
  }
  const hidden = /noindex/.test(f.robots || ''); // legal pages and the like: not meant for search or sharing
  if (!f.lang) add('fail', 'lang', '<html> has no lang attribute; screen readers guess the language wrong.', at);
  if (!f.charsetFirst) add('warn', 'charset', '<meta charset="utf-8"> should be the first thing in <head>.', at);
  if (!f.title) add('fail', 'title', 'No <title>.', at);
  else if (f.title.length < 15 || f.title.length > 65) add('warn', 'title', `Title is ${f.title.length} characters ("${f.title}"); 30 to 60 shows best in search results.`, at);
  if (!hidden && !f.description) add('fail', 'description', 'No meta description; search results will show a random snippet.', at);
  else if (!hidden && f.description && (f.description.length < 70 || f.description.length > 170)) add('warn', 'description', `Description is ${f.description.length} characters; 120 to 160 is the sweet spot.`, at);
  if (!f.viewport) add('fail', 'viewport', 'No viewport meta; phones will show a zoomed-out desktop page.', at);
  else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(f.viewport)) add('fail', 'viewport', 'The viewport blocks zoom. Remove user-scalable/maximum-scale.', at);
  if (!hidden && !f.canonical) add('warn', 'canonical', 'No canonical link.', at);
  for (const k of ['title', 'description', 'image']) if (!hidden && !f.og[k]) add(home ? 'fail' : 'warn', 'social-preview', `No og:${k}; links shared in chats and social posts will look bare.`, at);
  if (!noAddress && f.og.image && !/^https?:\/\//.test(f.og.image)) add('fail', 'social-preview', `og:image must be a full URL (https://…), not "${f.og.image}".`, at);
  if (!hidden && !f.twitterCard) add('warn', 'social-preview', 'No twitter:card (use summary_large_image).', at);
  if (!f.icon) add('fail', 'icon', 'No favicon link.', at);
  for (const [k, u] of [['favicon', f.icon], ['apple-touch-icon', f.appleIcon]]) {
    if (u && u.startsWith(new URL(f.url).origin) && !existsSync(join(dist, decodeURIComponent(new URL(u).pathname)))) add('fail', 'icon', `The ${k} link points to ${new URL(u).pathname}, which is not in the build${k === 'apple-touch-icon' ? ' (make it with: images.mjs icon)' : ''}.`, at);
  }
  if (!f.appleIcon) add('warn', 'icon', 'No apple-touch-icon (180×180 PNG) for home-screen bookmarks.', at);
  if (!f.themeColor) add('warn', 'theme-color', 'No theme-color; phone browser bars will not match the page.', at);
  f.jsonld.filter((j) => j !== 'ok').forEach((e) => add('fail', 'json-ld', `Structured data does not parse: ${e}`, at));
  if (home && !f.jsonld.length) add('warn', 'json-ld', 'No structured data. Add JSON-LD for the Person, Organization, LocalBusiness, Event or Product the site is about.', at);
  if (!f.h1.length) add('fail', 'h1', 'No visible <h1>.', at);
  else if (f.h1.length > 1) add('warn', 'h1', `${f.h1.length} <h1> elements; one per page is clearer.`, at);
  for (let i = 1; i < f.headings.length; i++) if (f.headings[i] > f.headings[i - 1] + 1) { add('warn', 'headings', `Heading levels skip from h${f.headings[i - 1]} to h${f.headings[i]}.`, at); break; }
  if (f.imgNoAlt.length) add('fail', 'alt', `Images without alt: ${f.imgNoAlt.slice(0, 4).join(', ')}`, at);
  if (f.imgNoSize.length) add('warn', 'img-size', `Images without width/height (the page jumps as they load): ${f.imgNoSize.slice(0, 4).join(', ')}`, at);
  if (f.linksNoName.length) add('fail', 'link-name', `Links with no text or label: ${f.linksNoName.slice(0, 4).join(', ')}`, at);
  if (f.buttonsNoName.length) add('fail', 'button-name', `Buttons with no text or label: ${f.buttonsNoName.slice(0, 3).join(' | ')}`, at);
  if (f.inputsNoLabel.length) add('fail', 'label', `Form fields without a label: ${f.inputsNoLabel.join(', ')}`, at);
  if (f.deadHrefs.length) add('warn', 'dead-link', `Links that go nowhere: ${f.deadHrefs.slice(0, 4).join(', ')}`, at);
  if (!f.skipLink) add('warn', 'skip-link', 'No "skip to content" link for keyboard users.', at);
  if (!f.main) add('warn', 'landmarks', 'No <main> element.', at);
  const out = f.outsideMain || [];
  if (out.length) add('warn', 'outside-main', `${out.join(', ')} ${out.length > 1 ? 'are' : 'is'} outside <main>, so skip links and screen readers miss ${out.length > 1 ? 'them' : 'it'}. Move ${out.length > 1 ? 'them' : 'it'} into <main> (or into the header, footer or an aside, if that is what ${out.length > 1 ? 'they are' : 'it is'}).`, at);
  if (f.animates && !f.reducedRule) add('fail', 'reduced-motion', 'The page animates but has no prefers-reduced-motion rule.', at);
  if (a.draft && f.leftovers.includes('{{OWNER_NAME}}')) waitingOn.add(at);
  const left = [...new Set(f.leftovers)].filter((x) => !URL_HOLE.test(x) && !later(x));
  if (left.length) add('fail', 'placeholder', `Placeholder text in the page: ${left.map((x) => (HINTS[x] ? `${x} (${HINTS[x]})` : x)).join(', ')}`, at);
  const fake = madeUp(f.text + ' ' + (f.refs || ''));
  if (fake.length) add('fail', 'made-up-address', `Made-up addresses that can't work: ${fake.join(', ')}. Put in the real email, link or profile, or take it out. (Fictional demo sites: allow "made-up-address" in .one-shot/allow.json.)`, at);
  for (const c of lintCopy(f.text)) if (c.rule !== 'placeholder') findings.push({ ...c, at }); // leftovers are checked on the whole HTML above
  const vague = f.text.split('\n').map((s) => s.trim()).filter((s) => s.length < 20 && vagueAction(s));
  if (vague.length) add('warn', 'vague-action', `Buttons or links that don't say where they go: ${[...new Set(vague)].join(', ')}. Name the action ("See the menu", "Book a table").`, at);
  // Title Case is an English habit; German capitalises every noun, so the check only reads English pages. Names the
  // page's own sentences capitalise ("on Universal Credit") don't count, nor a book's title in <cite> or <i>.
  const names = namesIn(f.text, f.headingTexts);
  const works = (i) => (f.headingWorks?.[i] ? new Set([...names, ...wordsIn(f.headingWorks[i])]) : names);
  const titled = /^en\b/i.test(f.lang || 'en') ? (f.headingTexts || []).filter((h, i) => titleCase(h, works(i))) : [];
  if (titled.length) add('warn', 'title-case', `Headings in Title Case read as corporate or generated: "${titled.slice(0, 3).join('", "')}". Use sentence case.`, at);
  if (f.inlineHeaders >= 3) add('warn', 'bold-labels', `${f.inlineHeaders} list items open with a bold label and a colon, the layout of a chat answer. Write them as plain items or real headings.`, at);
  if (f.boldInText > Math.max(4, f.paragraphs)) add('warn', 'bold', `${f.boldInText} bold phrases inside running text. Bold one thing per section at most.`, at);
  // Full and doing: something to look at, and on the home page something to try (pages with no
  // photos at all, or sparse and static, read as unfinished)
  if (!hidden && f.pictures && !f.pictures.photos && !f.pictures.drawings) {
    if (home && photosPlanned) add('fail', 'no-pictures', 'The brief plans photos ("The pictures, planned"), but the page has none: no photo, and no drawing 300px wide or more. Fetch them (photos.mjs; when the services are down, run it again before the audit), or draw the subject at full size until they come.', at);
    else add('warn', 'no-pictures', 'No pictures on this page: no photo, and no drawing 300px wide or more. Show the thing itself: their own photos, free photos of the subject (photos.mjs), or a drawing of it at full size (brief.md, "The pictures, planned").', at);
  }
  if (home && f.tryThings === 0) add('warn', 'nothing-to-try', 'Nothing on the home page to try: no open-now line, no hours with today marked, no form, details, sound or canvas, no button that does something. One live thing from the facts gives a visitor something to do (layout.md, "One live thing"): open now over the week\'s hours, a price calculator, a sound to play.', at);
  if (!noAddress && !hidden && sitemapLocs.length && f.canonical && !sitemapLocs.includes(f.canonical)) add('warn', 'sitemap', `${f.canonical} is not in sitemap.xml.`, at);
}

// ---------- local business, events, privacy and legal ----------
const facts0 = (() => { try { return JSON.parse(readFileSync(join(siteDir, 'site.json'), 'utf8')); } catch { return null; } })();

// Four real pictures for a business, an event or a place (brief.md, "The pictures, planned"): photos across the
// site, each counted once whatever its size ("oven-800.webp" and "oven-1600.webp" are one), logos and drawings left
// out. Who it's for comes from the home page's structured data (a shop, a practice, a club, an event) or the hours in
// site.json; a person's page or a piece of software isn't asked. A warning only, and none when they said no to photos
// (site.json "photos": false, or the brief's "No pictures at all"): then no photo should come in to fill the count.
const noPhotos = facts0?.photos === false || /^(no|none|false|off)$/i.test(String(facts0?.photos ?? '')) || /\*\*No (pictures|photos)\b/i.test(briefText);
if (!noPhotos) {
  const typesHome = (facts.find((f) => f.path === '/')?.ldData || []).flatMap((d) => [d['@type']].flat()).filter(Boolean);
  const place = typesHome.some((t) => !NOT_LOCAL.test(t) || /^(Organization|Corporation|NGO)$|Event$|^Festival$/.test(t)) || Boolean(facts0?.hours);
  const one = (u) => (/^data:/i.test(u) ? u : decodeURIComponent(String(u).split(/[?#]/)[0].split('/').pop() || '').toLowerCase()
    .replace(/\.(avif|webp|jpe?g|png|gif)$/, '').replace(/[-_@](\d{2,4}w?|\dx)$/, ''));
  const seen = new Set(facts.filter((f) => !f.path.endsWith('404.html')).flatMap((f) => f.pictures?.srcs || []).map(one));
  if (place && seen.size < 4) add('warn', 'few-pictures', `${seen.size ? `Only ${seen.size}` : 'No'} real picture${seen.size === 1 ? '' : 's'} across the site, where a business, an event or a place shows at least four: their own photos, free photos of the subject (photos.mjs), archive pictures of their world (an old postcard of the street, a map), credited. Drawings and logos don't count (brief.md, "The pictures, planned"). A site meant to have fewer lists few-pictures in .one-shot/allow.json, with the reason in the brief.`, '/');
}
const COOKIELESS = /(^|\.)(gc\.zgo\.at|goatcounter\.com|cloudflareinsights\.com|plausible\.io|cloud\.umami\.is)$/;
for (const f of facts.filter((x) => !x.path.endsWith('404.html'))) {
  const at = f.path;
  for (const d of f.ldData || []) {
    const types = [d['@type']].flat().filter(Boolean);
    if (types.length && !types.some((x) => NOT_LOCAL.test(x)) && at === '/') {
      if (!d.address) add('warn', 'local-data', `The ${types[0]} has no address in its structured data; Google Maps and local search lean on it (site.json "address").`, at);
      if (!d.openingHoursSpecification && !d.openingHours) add('warn', 'local-data', `No opening hours in the structured data (site.json "hours"), so search results can't show "open now".`, at);
    }
    if (types.some((x) => EVENT.test(x)) && (!d.startDate || !d.location)) add('warn', 'event-data', `The event "${d.name || '?'}" needs a startDate and a location to appear in Google's event results.`, at);
  }
  const menus = (f.pdfLinks || []).filter((x) => /men[uü]|karte|price|preis|speise|tarif/i.test(x));
  if (menus.length) add('warn', 'pdf-menu', `A menu or price list as a PDF (${menus.slice(0, 2).join(', ')}) is hard to read on a phone and goes stale. Put it in the page with <!-- site:menu -->.`, at);
  const others = (f.thirdParty || []).filter((h) => !COOKIELESS.test(h));
  const counters = (f.thirdParty || []).filter((h) => COOKIELESS.test(h));
  if (others.length) add('warn', 'third-party', `Loads from other servers before any click: ${others.join(', ')}. That sends visitors' addresses there; in the EU it needs consent. Self-host fonts (Fontsource), load maps and video on click (embed addon), or remove it.`, at);
  if (counters.length && at === '/') notes.push(`Cookieless visitor counting (${counters.join(', ')}): name it in the privacy page.`);
}
// ---------- languages: hreflang links only count in pairs ----------
// Each page that names its other-language versions must name itself too, and each version must name it back.
// The addresses may be absolute (after set-url) or still {{URL}}…: the page's own link tells where the site starts.
for (const f of facts.filter((x) => x.alternates?.length)) {
  const at = f.path;
  const lang = (x) => String(x || '').toLowerCase();
  const path = (href) => { try { return new URL(href.replace('{{URL}}', '/'), 'http://site' + at).pathname.replace(/\/index\.html$/, '/'); } catch { return null; } };
  const own = f.alternates.find((x) => lang(x.lang) === lang(f.lang));
  if (!own) { add('warn', 'hreflang', `This page lists its other languages (hreflang) but not itself: add <link rel="alternate" hreflang="${f.lang || '…'}"> to its own address.`, at); continue; }
  const ownPath = path(own.href);
  if (!ownPath?.endsWith(at)) continue; // can't tell where the site starts: nothing to compare
  const base = ownPath.slice(0, ownPath.length - at.length);
  const local = (href) => { const p = path(href); return p?.startsWith(base) ? p.slice(base.length) || '/' : null; };
  for (const alt of f.alternates.filter((x) => x !== own && lang(x.lang) !== 'x-default')) {
    const to = local(alt.href);
    if (!to) continue;
    const other = facts.find((x) => x.path === to);
    if (!other) { add('warn', 'hreflang', `Names ${to} as its ${alt.lang} version, but the site has no such page.`, at); continue; }
    if (!(other.alternates || []).some((x) => local(x.href) === at)) add('warn', 'hreflang', `${to} (${alt.lang}) doesn't name ${at} back. Search engines ignore hreflang links that aren't in pairs.`, at);
    if (other.lang && lang(other.lang).split('-')[0] !== lang(alt.lang).split('-')[0]) add('warn', 'hreflang', `Names ${to} as ${alt.lang}, but that page says lang="${other.lang}".`, at);
  }
}

const home0 = facts.find((f) => f.path === '/');
const country = String(facts0?.address?.country || '').toUpperCase();
if (home0 && (/^de\b/i.test(home0.lang || '') || ['DE', 'AT', 'CH', 'LI'].includes(country))) {
  const hrefs = home0.links.join(' ');
  if (!/impressum|imprint|legal/i.test(hrefs)) add('warn', 'impressum', 'German-speaking sites with any business purpose need an Impressum, one click from every page (Germany: § 5 DDG). See legal.md.', '/');
  if (!/datenschutz|privacy/i.test(hrefs)) add('warn', 'privacy-page', 'No link to a privacy page (Datenschutzerklärung). Every site that is not purely private needs one, since the host sees visitor IP addresses. See legal.md.', '/');
}
// CC BY photos from photos.mjs: the license asks for the credit where the photo is seen
// (as text: the line photos.mjs printed writes "Tom &amp; Jerry", CREDITS.md "Tom & Jerry")
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const char = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ');
const pageText = htmlPages.map((f) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, ' ')).join(' ')
  .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, x, n) => (d ? char(+d) : x ? char(parseInt(x, 16)) : ENTITY[n.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ').toLowerCase();
for (const f of all.filter((x) => x.endsWith('CREDITS.md'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/^- `([^`]+)`: "(.*?)" by (.+?) \([^)]*\), CC BY /gm)) {
    if (!pageText.includes(m[3].toLowerCase())) add('fail', 'photo-credit', `The CC BY photo ${m[1]} ("${m[2]}") needs its credit on the page: its creator ${m[3]}, the source and the license. photos.mjs get printed the line.`, rel(f));
  }
}
if ((facts0?.links?.booking || facts0?.links?.payment) && home0 && (/^de\b/i.test(home0.lang || '') || ['DE', 'AT'].includes(country))) notes.push('Bookings or payments go through this site: in the EU the accessibility act (Germany: BFSG) may apply, unless the business has under 10 staff and under €2M turnover. Keep the axe-core check at zero.');

// social preview image
const home = facts.find((f) => f.path === '/');
if (home?.og.image) {
  // with no address yet og:image is "{{URL}}og.jpg"; the file name still says what to look for
  // a project page lives under a path (user.github.io/site/): the build root is that path, not the domain root
  const base = !noAddress && /^https?:/.test(home.canonical || '') ? new URL(home.canonical).pathname.replace(/[^/]*$/, '') : '/';
  const ogPath = new URL(home.og.image.replace(URL_HOLE, '/'), 'https://x').pathname;
  const local = join(dist, decodeURIComponent(ogPath.startsWith(base) ? '/' + ogPath.slice(base.length) : ogPath));
  const shown = new URL(home.og.image.replace(URL_HOLE, '/'), 'https://x').pathname;
  if (!existsSync(local)) add('fail', 'social-preview', `og:image points to ${shown}, which is not in the build. Make it with: images.mjs og dist (or design og.html first).`);
  else {
    const s = imageSize(local);
    if (s && (Math.abs(s[0] / s[1] - 1.91) > 0.05 || s[0] < 1200)) add('warn', 'social-preview', `og:image is ${s[0]}×${s[1]}; 1200×630 fits every platform.`);
    if (statSync(local).size > 600 * 1024) add('warn', 'social-preview', `og:image is ${kb(statSync(local).size)}; keep it under 600 KB so chat apps don't skip it.`);
  }
}

// weight of the first visit (gzipped)
for (const [path, b] of firstLoad) {
  if (path.endsWith('404.html')) continue;
  if (b.js > 500 * 1024) add('fail', 'budget', `First visit loads ${kb(b.js)} of JavaScript (gzipped). Load heavy parts (3D, sound) later, on demand.`, path);
  else if (b.js > 300 * 1024) add('warn', 'budget', `First visit loads ${kb(b.js)} of JavaScript (gzipped); under 300 KB keeps phones quick.`, path);
  if (b.css > 100 * 1024) add('warn', 'budget', `${kb(b.css)} of CSS (gzipped); something is pulling in far too much.`, path);
  if (b.fonts > 200 * 1024) add('warn', 'budget', `${kb(b.fonts)} of fonts. Subset to the characters you use, or drop a weight.`, path);
  if (b.bytes > 3 * 1024 * 1024) add('fail', 'budget', `First visit transfers ${kb(b.bytes)}. Aim for under 1.5 MB.`, path);
  else if (b.bytes > 1.5 * 1024 * 1024) add('warn', 'budget', `First visit transfers ${kb(b.bytes)}. Aim for under 1.5 MB.`, path);
  notes.push(`${path}: first visit ${kb(b.bytes)} (JS ${kb(b.js)}, CSS ${kb(b.css)}, fonts ${kb(b.fonts)} gzipped)`);
}

// source habits
if (existsSync(join(siteDir, 'package.json'))) for (const f of lint(siteDir)) findings.push({ ...f, rule: `lint:${f.rule}`, at: 'source' });

// Lighthouse, if asked and installed
if (a.lighthouse) {
  let bin = null;
  try { bin = createRequire(join(siteDir, 'package.json')).resolve('lighthouse/cli/index.js'); } catch {}
  if (!bin) notes.push('Lighthouse is not installed in the site (npm i -D lighthouse), so it was skipped.');
  else {
    const s = await serve(dist);
    const { findBrowser } = await import('./lib/chrome.mjs');
    for (const preset of ['mobile', 'desktop']) {
      const r = spawnSync(process.execPath, [bin, s.url + '/', '--quiet', '--output=json', '--output-path=stdout', '--chrome-flags=--headless=new',
        '--only-categories=performance,accessibility,best-practices,seo', ...(preset === 'desktop' ? ['--preset=desktop'] : [])],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CHROME_PATH: findBrowser() } });
      try {
        const j = JSON.parse(r.stdout);
        const scores = Object.values(j.categories).map((c) => [c.title, Math.round(c.score * 100)]);
        notes.push(`Lighthouse ${preset} (local server, so treat performance as a rough guide): ${scores.map(([t, v]) => `${t} ${v}`).join(', ')}`);
        for (const [t, v] of scores) if (v < 90) add(v < 50 ? 'fail' : 'warn', 'lighthouse', `${t} scores ${v} on ${preset}.`);
      } catch { notes.push(`Lighthouse ${preset} did not finish: ${(r.stderr || '').split('\n').slice(-3).join(' ')}`); }
    }
    await s.close();
  }
}

if (waitingOn.size) notes.push(`Waiting on you: {{OWNER_NAME}} on ${[...waitingOn].join(', ')}, ${HINTS['{{OWNER_NAME}}']}. A draft lets it through; the final audit stops on it.`);

// deliberate exceptions, each with its reason in the brief
const allowFile = join(siteDir, '.one-shot/allow.json');
if (existsSync(allowFile)) {
  const allow = new Set(readAllow(allowFile));
  const allowed = (f) => allow.has(f.rule) || allow.has(f.rule.replace(/^lint:/, ''));
  // only the rules that matched: "1 finding(s) allowed (made-up-address, theme-color)" read as two
  const hit = findings.filter(allowed);
  findings.splice(0, findings.length, ...findings.filter((f) => !allowed(f)));
  if (hit.length) notes.push(`${hit.length} finding(s) allowed on purpose by .one-shot/allow.json (${[...new Set(hit.map((f) => f.rule))].join(', ')}).`);
}

const verdict = findings.some((f) => f.level === 'fail') ? 'Not ready to ship.' : 'Ready to ship.';
const md = report(`Audit${scheme ? ` (${scheme})` : ''}: ${verdict}`, findings, notes);
write(outMd, md);
// the same, for tools (the evals scorer reads it)
write(outJson, { verdict, findings, notes, firstLoad: Object.fromEntries(firstLoad), axe: notes.filter((n) => n.startsWith('axe-core')) });
// a finished site joins the short list of recent looks, so the next site's concepts don't repeat it
if (verdict === 'Ready to ship.') recordSite(siteDir);
process.exit(findings.some((f) => f.level === 'fail') ? 1 : 0);
