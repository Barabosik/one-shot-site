#!/usr/bin/env node
// look: open the site at phone, tablet and desktop widths, photograph every screen, put the photos on one
// contact sheet per width, and list the layout faults a visitor would notice.
//
//   node look.mjs [dist | http://localhost:5173 | https://site.com] [--pages /,/about] [--widths 390,768,1440]
//                 [--frames 8] [--out .one-shot/look] [--reduced] [--scheme light|dark] [--headed] [--compare] [--numbers]
//
// --scheme dark shows the site as a visitor whose system is set to dark sees it (out: .one-shot/look-dark; a folder
// given with --out gets the "-dark" too). With the theme addon, run look once per scheme. --reduced looks with reduced
// motion on (out: .one-shot/look-reduced), so the sheets of a plain run stay.
//
// --compare adds sheet-compare.jpg: the first screen of each page at each width, one page per row.
// Use it to show variants: --pages variant-a,variant-b,variant-c --widths 1440,390 --frames 1 --compare
// (a page is named as in the address or without it: variant-a, /variant-a.html, de/ and /about all work)
//
// --numbers puts 1, 2, 2a… on every block and its headline, picture and button, and writes numbers.md, so the
// person can point: "make 2a bigger", "swap 3 and 4". Use it when showing sheets to the person.
//
// Read the sheets (sheet-*.jpg), not every frame. Exit code 1 = at least one fault marked "fix". Rules named in
// .one-shot/allow.json are left out, as in audit.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { launch, sleep } from './lib/chrome.mjs';
import { open, serve, siteTarget } from './lib/serve.mjs';
import { actionInView, clashingText, coveredText, firstAction, markParts, pageTells, scrollThrough, settle, settledFaults } from './lib/probes.mjs';
import { args, colorScheme, EVENT, forwardsOnly, NOT_LOCAL, num, nums, pagePath, problem, report, schemed, TOOL_PAGES, write, stopOnError, usage } from './lib/cli.mjs';
import { readAllow } from './lint.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const { scheme, suffix } = colorScheme(a);
const widths = nums(a.widths, '--widths', { def: [390, 768, 1440], min: 200, max: 4000, int: true });
const maxFrames = num(a.frames, '--frames', { def: 8, min: 1, max: 50, int: true });
const out = resolve(schemed(a.out || (a.reduced ? '.one-shot/look-reduced' : '.one-shot/look'), suffix));
// the last report goes first, so a run that stops (a bad target, a site that won't open) leaves no old "All clear."
for (const f of ['report.md', 'report.json']) rmSync(join(out, f), { force: true });
const target = await siteTarget(a._[0], import.meta.url);
const HEIGHT = (w) => (w < 600 ? 844 : w < 1100 ? 1024 : 900);
const label = (w) => (w < 600 ? 'phone' : w < 1100 ? 'tablet' : 'desktop');

const site = await open(target, { index: !a.pages }); // named pages (variants) need no home page
let pages = a.pages ? String(a.pages).split(',').map(pagePath) : ['/'];
if (!a.pages && site.root) {
  const found = (d, pre = '') => readdirSync(join(site.root, d)).flatMap((f) => {
    const rel = pre + f;
    if (statSync(join(site.root, rel)).isDirectory()) return f === 'assets' ? [] : found(rel, rel + '/');
    return f.endsWith('.html') && !TOOL_PAGES.has('/' + rel) && !forwardsOnly(readFileSync(join(site.root, rel), 'utf8'))
      ? ['/' + rel.replace(/(^|\/)index\.html$/, '$1')] : [];
  });
  pages = found('');
  pages.sort((x, y) => (x === '/' ? -1 : y === '/' ? 1 : x.localeCompare(y)));
  // none left: "All clear." on no page at all
  if (!pages.length) throw new Error(`No page to check in ${site.root}: every .html file only forwards. Name one with --pages.`);
}
// the project around the build, when look checks a folder: its facts (site.json) and the brief
const project = site.root && [site.root, dirname(site.root)].find((d) => existsSync(join(d, 'site.json')) || existsSync(join(d, '.one-shot/brief.md')));
const read = (f) => { try { return readFileSync(join(project, f), 'utf8'); } catch { return ''; } };
// deliberate exceptions and findings the sheets show are wrong, each with its reason in the brief, as audit reads
// them: from the project around the build (for an address, the folder look runs in). Read before any browser starts.
const allowFile = (site.root ? [site.root, dirname(site.root)] : [process.cwd()]).map((d) => join(d, '.one-shot/allow.json')).find((f) => existsSync(f));
const allow = allowFile ? new Set(readAllow(allowFile)) : null;
const facts = (() => { try { return (project && JSON.parse(read('site.json'))) || {}; } catch { return {}; } })();
// the look the brief settled on ("- **Mood:** Warm." or "- Mood: Warm"), for cold-warm
const mood = project ? (read('.one-shot/brief.md').match(/^[ \t]*[-*][ \t]+(?:\*\*)?Mood:?(?:\*\*)?:?[ \t]*([A-Za-z]+)/mi) || [])[1] || '' : '';
// The action, for whoever has one to keep in reach (a business with a door, an event, a person to hire): its
// address as site.json names it, else as the first screen's button has it
const links = facts.links && typeof facts.links === 'object' ? facts.links : {};
const prefer = ['booking', 'tickets', 'ticket', 'hire'].map((k) => links[k]).filter((v) => typeof v === 'string' && v.trim());
const ASIDE = /^(BreadcrumbList|FAQPage|ItemList|ListItem|Offer|OfferCatalog|AggregateOffer|ImageObject|VideoObject|Menu|MenuSection|MenuItem|PostalAddress|GeoCoordinates|Place|Review|AggregateRating|Question|Answer|SearchAction|ContactPoint|OpeningHoursSpecification|Thing)$/;
const wantsAction = (types, action) => types.some((t) => EVENT.test(t) || (!NOT_LOCAL.test(t) && !ASIDE.test(t)))
  || (types.includes('Person') && !!(prefer.length || /hire|book|contact|kontakt|anfrage|termin|^mailto:/i.test(`${action.href} ${action.words}`)));
const homeAction = new Map(); // width -> the home page's action, for a page whose first screen has none
const shortHref = (h) => decodeURIComponent(h.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, '').replace(/^mailto:([^?]+).*/, 'mailto:$1')).slice(0, 60);

// "/en/", "/en/index.html" and "en/index" are one page, so they get one name: "en"
const slug = (p) => (p === '/' || p === '/index.html' ? 'home' : p.replace(/(^|\/)index\.html$/, '$1').replace(/^\/|\.html$/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, ''));

mkdirSync(out, { recursive: true });
// clear only what this run redraws, so a quick run at one width keeps the other sheets; and the last report, so a
// run that stops leaves no old "All clear." to read
const mine = new Set(pages.flatMap((p) => widths.map((w) => `${slug(p)}-${w}`)));
for (const f of readdirSync(out)) {
  const m = f.match(/^(?:sheet-)?(.+?-\d+)(?:-\d+)?\.(jpg|html)$/);
  if ((m && mine.has(m[1])) || /^(sheet-compare\.|report\.(md|json)$)/.test(f)) rmSync(join(out, f));
}
const browser = await launch({ headed: !!a.headed });
const findings = [];
const sheets = [];
const looks = new Map(); // page -> what its first screen is made of, to tell variants apart
const notes = [];
const legends = new Map(); // page -> numbered parts (--numbers)

try {
  for (const path of pages) {
    for (const w of widths) {
      const h = HEIGHT(w);
      const page = await browser.newPage({ width: w, height: h, mobile: w < 600, scale: 1, reducedMotion: !!a.reduced, colorScheme: scheme });
      await page.goto(site.url + path);
      await sleep(900);
      const total = await page.call(scrollThrough, 160);
      await sleep(400);
      // the first screen's entrances have arrived (a split headline in place) before anything is measured
      await page.call(settle, 3000);
      for (const f of await settledFaults(page, w)) findings.push({ ...f, at: `${slug(path)} ${w}px` });
      // habits of generated pages (kicker labels, cream and terracotta, glows, boxes in boxes…): once per page
      if (w === Math.max(...widths)) for (const f of await page.call(pageTells, w, mood)) findings.push({ ...f, at: `${slug(path)} ${w}px` });
      // the action on the first screen, followed down the phone and desktop sheets (not legal pages: noindex)
      let action = null;
      if (w < 600 || w >= 1100) {
        const here = await page.eval(`(() => ({ noindex: /noindex/i.test(document.querySelector('meta[name="robots"]')?.content || ''),
          types: [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => { try { const j = JSON.parse(s.textContent); return [j['@graph'] || j].flat().flatMap((d) => [d && d['@type']].flat()); } catch { return []; } }).filter((t) => typeof t === 'string') }))()`);
        const found = (await page.call(firstAction, prefer)) || homeAction.get(w);
        if (found && path === pages[0]) homeAction.set(w, found);
        if (found && !here.noindex && wantsAction([facts.type, ...here.types].filter((t) => typeof t === 'string'), found)) action = found;
      }
      const away = [];
      // variants of one idea share type and colours on purpose, so the layout counts too: the headline's size and
      // place, and the first big picture's (in 40px steps, so a pixel of drift doesn't make two pages "different")
      if (a.compare && w === Math.max(...widths)) looks.set(path, await page.eval(`(() => {
        const h = document.querySelector('h1') || document.body, s = getComputedStyle(h), r = h.getBoundingClientRect();
        const q = (n) => Math.round(n / 40);
        const pic = [...document.querySelectorAll('img, picture, video, canvas, svg')].map((e) => e.getBoundingClientRect())
          .find((b) => b.width * b.height > innerWidth * innerHeight * 0.05 && b.top < innerHeight);
        return [s.fontFamily, s.color, getComputedStyle(document.body).backgroundColor, Math.round(parseFloat(s.fontSize) / 4),
          q(r.left), q(r.top), q(r.width), pic ? [q(pic.left), q(pic.top), q(pic.width), q(pic.height)].join(',') : 'no picture'].join(' | ');
      })()`));

      if (a.numbers) { await page.eval('scrollTo(0, 0)'); const legend = await page.call(markParts); if (!legends.has(path)) legends.set(path, legend); }
      const n = Math.min(maxFrames, Math.ceil(total / h));
      const frames = [];
      for (let i = 0; i < n; i++) {
        await page.eval(`scrollTo({ top: ${i * h}, behavior: 'instant' })`);
        await sleep(i ? 450 : 200);
        // and on every screen before its shot: lines drawn, numbers counted, entrances done (at most 3 s more)
        await page.call(settle, 3000);
        for (const f of await page.call(coveredText)) findings.push({ ...f, at: `${slug(path)} ${w}px, screen ${i + 1}` });
        // text that runs into other text, or out of its chip, button or card
        for (const f of await page.call(clashingText, w, i + 1)) findings.push({ ...f, at: `${slug(path)} ${w}px, screen ${i + 1}` });
        if (action && !(await page.call(actionInView, action.href))) away.push(i + 1);
        const file = `${slug(path)}-${w}-${i}.jpg`;
        // The last screen can't scroll a whole screen on: the browser stops at the end of the page, so the top of
        // this screen is the bottom of the one before. Its shot keeps the bar at the top (a visitor sees it on every
        // screen) and then only what the screen before didn't show, so the screens tile the page.
        // (A page wider than a phone makes the browser zoom out, as phones do: the screen then shows more than h of the
        // page, so there is no cut to make. A plain shot, and overflow-x names the cause.)
        const [y, vh] = await page.eval('[Math.round(scrollY), innerHeight]');
        const cut = i * h - y;
        const head = cut > 0 && vh === h ? await page.eval(`(() => { let b = 0; for (const e of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(e); if (!/^(fixed|sticky)$/.test(cs.position) || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
          const r = e.getBoundingClientRect(); if (r.top <= 1 && r.bottom > 0 && r.height < innerHeight * 0.3 && r.width >= innerWidth * 0.5) b = Math.max(b, r.bottom); }
          return Math.round(b); })()`) : 0;
        if (vh === h && cut > head && cut < h) {
          const strip = (top, height) => page.shot(null, { type: 'png', clip: { x: 0, y: y + top, width: w, height }, beyond: false });
          const parts = [...(head ? [await strip(0, head)] : []), await strip(cut, h - cut)];
          const sheet = await browser.newPage({ width: w, height: head + h - cut });
          await sheet.eval(`new Promise((ok) => { document.body.style.margin = 0; let n = ${parts.length};
            for (const d of ${JSON.stringify(parts)}) { const im = new Image(); im.style.display = 'block'; im.onload = () => --n || ok(1); im.src = 'data:image/png;base64,' + d; document.body.append(im); } })`);
          await sheet.shot(join(out, file));
          await sheet.close();
          frames.push({ file, top: i * h, height: h - cut, bar: head });
        } else {
          await page.shot(join(out, file));
          frames.push({ file, top: y, height: vh });
        }
      }
      if (away.length) findings.push({ level: 'fail', rule: 'action-out-of-reach', at: `${slug(path)} ${w}px`,
        text: `At ${w}px the action ("${action.words}", ${shortHref(action.href)}) is out of reach on ${away.length === n ? `all ${n} screens` : `screen${away.length > 1 ? 's' : ''} ${away.join(', ')} of ${n}`}: no link to it in view there. Keep it in reach on every screen: the header with the action, sticky on a desktop, and a bar fixed to the bottom of a phone screen (layout.md, "The action stays in reach")` });
      if (Math.ceil(total / h) > n) notes.push(`${slug(path)} at ${w}px is ${Math.ceil(total / h)} screens tall; the sheet shows the first ${n} (use --frames to see more).`);
      // the browser asks for /favicon.ico by itself when a page has no icon link; audit checks the icon properly
      for (const p of page.problems) if (!/\/favicon\.ico$/.test(p.text)) findings.push(problem(p, `${slug(path)} ${w}px`));
      await page.close();
      sheets.push({ name: `sheet-${slug(path)}-${w}`, path, w, h, frames });
    }
  }

  // contact sheets: every screen of one page at one width, side by side, in reading order
  const shots = await serve(out);
  const STYLE = `body{margin:0;padding:24px;background:#222;font:600 15px system-ui;color:#ddd}
    h1{font-size:17px;margin:0 0 16px} h2{font-size:15px;margin:22px 0 10px;color:#bbb} .g{display:grid;gap:14px;align-items:start}
    figure{margin:0} img{width:100%;display:block;outline:1px solid #444} figcaption{margin-top:6px;color:#999;font-weight:500}`;
  const render = async (name, body) => {
    write(join(out, name + '.html'), `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${body}`);
    const page = await browser.newPage({ width: 1600, height: 900 });
    await page.goto(`${shots.url}/${name}.html`);
    const height = await page.eval('document.documentElement.scrollHeight');
    await page.shot(join(out, name + '.jpg'), { quality: 78, clip: { x: 0, y: 0, width: 1600, height: Math.min(height, 6000) } });
    await page.close();
  };
  for (const s of sheets) {
    const cols = s.w < 600 ? 6 : s.w < 1100 ? 4 : 3;
    await render(s.name, `<h1>${s.path} · ${label(s.w)} ${s.w}×${s.h} · ${s.frames.length} screens</h1><div class="g" style="grid-template-columns:repeat(${cols},1fr)">${s.frames
      .map((f, i) => `<figure><img src="${f.file}"><figcaption>${i + 1}</figcaption></figure>`).join('')}</div>`);
  }
  // --compare: the first screen of every page at every width, one page per row (for picking a variant)
  if (a.compare) {
    const cols = widths.map((w) => `${(w / HEIGHT(w)).toFixed(3)}fr`).join(' ');
    await render('sheet-compare', `<h1>First screens, side by side</h1>${pages.map((p) => `<h2>${p}</h2><div class="g" style="grid-template-columns:${cols}">${widths
      .map((w) => `<figure><img src="${slug(p)}-${w}-0.jpg"><figcaption>${label(w)}</figcaption></figure>`).join('')}</div>`).join('')}`);
    sheets.unshift({ name: 'sheet-compare' });
    const seen = new Map();
    for (const [p, sig] of looks) {
      if (seen.has(sig)) findings.push({ level: 'warn', rule: 'same-variant', text: `${p} looks like ${seen.get(sig)}: the same headline font, size, colour and place, the same background and first picture. If it was meant to differ, its styles may have lost to tokens.css: put variant overrides under html:root { … }`, at: p });
      else seen.set(sig, p);
    }
  }
  await shots.close();
} finally {
  await browser.close();
  await site.close();
}

// the same fault on several screens or widths is one fault
const once = new Map();
for (const f of findings) {
  const k = f.rule + '|' + (f.where || f.text);
  if (once.has(k)) { const o = once.get(k); if (!o.at.includes(f.at.split(' ')[1])) o.at += ', ' + f.at.split(' ').slice(1).join(' '); }
  else once.set(k, { ...f });
}
findings.length = 0;
findings.push(...once.values());

if (allow) {
  const hit = findings.filter((f) => allow.has(f.rule));
  findings.splice(0, findings.length, ...findings.filter((f) => !allow.has(f.rule)));
  if (hit.length) notes.push(`${hit.length} finding(s) allowed on purpose by ${allowFile} (${[...new Set(hit.map((f) => f.rule))].join(', ')}).`);
}

if (legends.size) {
  const item = (x) => `- **${x.id}** ${x.what}${x.text ? `: ${x.text}` : ''}`;
  write(join(out, 'numbers.md'), [...legends].map(([p, list]) => `## ${p}\n\n${list.map(item).join('\n')}`).join('\n\n') + '\n');
  notes.push(`Numbers on the screens: ${join(out, 'numbers.md')}`);
}

const md = report(`Look: ${target}${scheme ? ` (${scheme})` : ''}`, findings, [
  `Sheets: ${sheets.map((s) => join(out, s.name + '.jpg')).join(', ')}`,
  ...notes,
]);
write(join(out, 'report.md'), md);
// each screen's shot and where it starts on the page (the last one, cut to what the one before didn't show, is shorter)
write(join(out, 'report.json'), { target, pages, widths, findings, sheets: sheets.map((s) => s.name + '.jpg'),
  frames: sheets.filter((s) => s.frames).flatMap((s) => s.frames.map((f) => ({ page: s.path, width: s.w, ...f }))) });
process.exit(findings.some((f) => f.level === 'fail') ? 1 : 0);
