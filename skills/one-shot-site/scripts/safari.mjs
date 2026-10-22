#!/usr/bin/env node
// safari: look at the site in WebKit, the engine under Safari and under every browser on an iPhone. The other
// checks run in Chromium, and the two disagree about layout, fonts, colour and what a script may do.
//
//   node safari.mjs [dist | http://localhost:5173 | https://site.com] [--pages /,/about] [--widths 390,1440]
//                   [--frames 8] [--out .one-shot/safari] [--reduced] [--scheme light|dark]
//
// Takes the same screens as look.mjs (phone and desktop by default), runs the same layout and covered-text checks
// in the page, and lists the faults WebKit shows. Sheets and report.json go to .one-shot/safari/. Exit code 1 = at
// least one fault marked "fix", 2 = it could not run.
// (a page is named as in the address or without it: variant-a, /variant-a.html, de/ and /about all work; pages that
// only forward to another are skipped)
//
// Optional. Playwright and its WebKit are not part of this skill; with the site's folder as the current folder:
//   npm i -D playwright && npx playwright install webkit
// Without them this says so in one line and stops. Playwright's WebKit is the engine, not Safari itself, so a fault
// here is real, and a page that passes still deserves a look on a real phone.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { open, serve, siteTarget } from './lib/serve.mjs';
import { appLinkGuard, coveredText, scrollThrough, settledFaults } from './lib/probes.mjs';
import { INSTALL, loadPlaywright, webkitOf } from './lib/playwright.mjs';
import { args, colorScheme, forwardsOnly, num, nums, pagePath, problem, report, schemed, TOOL_PAGES, write, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const { scheme, suffix } = colorScheme(a);
const widths = nums(a.widths, '--widths', { def: [390, 1440], min: 200, max: 4000, int: true });
const maxFrames = num(a.frames, '--frames', { def: 8, min: 1, max: 50, int: true });
const target = await siteTarget(a._[0], import.meta.url);
const out = resolve(schemed(a.out || '.one-shot/safari', suffix));
// the last run's verdict goes first: a run that stops early (no site, no Playwright) left yesterday's "All clear."
for (const f of ['report.md', 'report.json']) rmSync(join(out, f), { force: true });
const HEIGHT = (w) => (w < 600 ? 844 : w < 1100 ? 1024 : 900);
const label = (w) => (w < 600 ? 'phone' : w < 1100 ? 'tablet' : 'desktop');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the site first: a folder without one is the input to fix, whatever is installed
const site = await open(target, { index: !a.pages }); // named pages (variants) need no home page
// and its pages, before any browser starts
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

// Playwright, then its WebKit: either one missing is a setup problem with a one-line answer
const local = /^https?:\/\//.test(target) ? [] : [resolve(target), dirname(resolve(target))];
const playwright = await loadPlaywright(local);
if (!playwright) {
  console.error(`Playwright is not installed, so there is no Safari check. To get it: ${INSTALL}`);
  process.exit(2);
}
const webkit = webkitOf(playwright);
if (!webkit) {
  console.error(`This Playwright has no WebKit. To get one that has: ${INSTALL}`);
  process.exit(2);
}
let browser;
try {
  browser = await webkit.launch();
} catch (e) {
  // Playwright's text for missing libraries says "playwright install-deps" too: that one first
  if (/missing dependencies/i.test(e.message)) {
    console.error('Playwright\'s WebKit is installed, but this system lacks libraries it needs. To get them: npx playwright install-deps webkit');
    process.exit(2);
  }
  if (/Executable doesn't exist|playwright install/i.test(e.message)) {
    console.error('Playwright is installed, but its WebKit is not. To get it: npx playwright install webkit');
    process.exit(2);
  }
  throw e;
}

// "/en/", "/en/index.html" and "en/index" are one page, so they get one name: "en"
const slug = (p) => (p === '/' || p === '/index.html' ? 'home' : p.replace(/(^|\/)index\.html$/, '$1').replace(/^\/|\.html$/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, ''));

mkdirSync(out, { recursive: true });
// clear only what this run redraws, so a quick run at one width keeps the other sheets
const mine = new Set(pages.flatMap((p) => widths.map((w) => `${slug(p)}-${w}`)));
for (const f of readdirSync(out)) {
  const m = f.match(/^(?:sheet-)?(.+?-\d+)(?:-\d+)?\.(jpg|html)$/);
  if (m && mine.has(m[1])) rmSync(join(out, f));
}

// what the page reports about itself, in the shape cli.mjs's problem() reads (the favicon is audit's business)
function watch(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push({ kind: 'exception', text: String(e?.message || e).split('\n')[0] }));
  // a failed request is reported by the response/requestfailed events below, not twice as a console line
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/i.test(m.text())) problems.push({ kind: 'console', text: m.text().slice(0, 300) }); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push({ kind: 'http', text: `${r.status()} ${r.url()}` }); });
  page.on('requestfailed', (r) => { const why = r.failure()?.errorText || ''; if (!/cancel|abort/i.test(why)) problems.push({ kind: 'network', text: `${why} ${r.url()}` }); });
  return problems;
}
// probes.mjs wants a page with call(fn, arg): a function run in the page with one argument
const probe = (page) => ({ call: (fn, arg) => page.evaluate(fn, arg) });

const findings = [];
const sheets = [];
const notes = [];

try {
  for (const path of pages) {
    for (const w of widths) {
      const h = HEIGHT(w);
      const context = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600,
        reducedMotion: a.reduced ? 'reduce' : 'no-preference', colorScheme: scheme || 'light',
        acceptDownloads: false, // as chrome.mjs denies them: a link to a file saves nothing
      });
      await context.addInitScript(appLinkGuard); // mailto:, tel: and other app links stay in the browser (see chrome.mjs)
      const page = await context.newPage();
      const problems = watch(page);
      // one line, as chrome.mjs says it, not Playwright's "page.goto: …" with its call log
      try { await page.goto(site.url + path, { waitUntil: 'load', timeout: 30000 }); } catch (e) {
        throw new Error(`Could not open ${site.url + path}: ${String(e.message).split('\n')[0].replace(/^page\.goto: /, '')}`);
      }
      await page.evaluate('document.fonts ? document.fonts.ready.then(() => 1) : 1');
      await sleep(900);
      const total = await page.evaluate(scrollThrough, 160);
      await sleep(400);
      for (const f of await settledFaults(probe(page), w)) findings.push({ ...f, at: `${slug(path)} ${w}px` });

      const n = Math.min(maxFrames, Math.ceil(total / h));
      const frames = [];
      for (let i = 0; i < n; i++) {
        await page.evaluate(`scrollTo({ top: ${i * h}, behavior: 'instant' })`);
        await sleep(i ? 450 : 200);
        for (const f of await page.evaluate(coveredText)) findings.push({ ...f, at: `${slug(path)} ${w}px, screen ${i + 1}` });
        const file = `${slug(path)}-${w}-${i}.jpg`;
        await page.screenshot({ path: join(out, file), type: 'jpeg', quality: 82 });
        frames.push(file);
      }
      if (Math.ceil(total / h) > n) notes.push(`${slug(path)} at ${w}px is ${Math.ceil(total / h)} screens tall; the sheet shows the first ${n} (use --frames to see more).`);
      for (const p of problems) if (!/\/favicon\.ico$/.test(p.text)) findings.push(problem(p, `${slug(path)} ${w}px`));
      await context.close();
      sheets.push({ name: `sheet-${slug(path)}-${w}`, path, w, h, frames });
    }
  }

  // contact sheets: every screen of one page at one width, side by side, in reading order (as look.mjs draws them)
  const shots = await serve(out);
  const STYLE = `body{margin:0;padding:24px;background:#222;font:600 15px system-ui;color:#ddd}
    h1{font-size:17px;margin:0 0 16px} .g{display:grid;gap:14px;align-items:start}
    figure{margin:0} img{width:100%;display:block;outline:1px solid #444} figcaption{margin-top:6px;color:#999;font-weight:500}`;
  const render = async (name, body) => {
    write(join(out, name + '.html'), `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${body}`);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`${shots.url}/${name}.html`, { waitUntil: 'load' });
    await page.evaluate('Promise.all([...document.images].map((i) => i.decode().catch(() => 0)))');
    const height = await page.evaluate('document.documentElement.scrollHeight');
    await page.setViewportSize({ width: 1600, height: Math.min(height, 6000) });
    await page.screenshot({ path: join(out, name + '.jpg'), type: 'jpeg', quality: 78 });
    await page.close();
  };
  for (const s of sheets) {
    const cols = s.w < 600 ? 6 : s.w < 1100 ? 4 : 3;
    await render(s.name, `<h1>${s.path} · ${label(s.w)} ${s.w}×${s.h} · WebKit · ${s.frames.length} screens</h1><div class="g" style="grid-template-columns:repeat(${cols},1fr)">${s.frames
      .map((f, i) => `<figure><img src="${f}"><figcaption>${i + 1}</figcaption></figure>`).join('')}</div>`);
  }
  await shots.close();
  notes.unshift(`Engine: WebKit ${browser.version()} through Playwright (not Safari itself).`);
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

const md = report(`Safari: ${target}${scheme ? ` (${scheme})` : ''}`, findings, [
  `Sheets: ${sheets.map((s) => join(out, s.name + '.jpg')).join(', ')}`,
  ...notes,
]);
write(join(out, 'report.md'), md);
write(join(out, 'report.json'), { target, engine: 'webkit', pages, widths, findings, sheets: sheets.map((s) => s.name + '.jpg') });
process.exit(findings.some((f) => f.level === 'fail') ? 1 : 0);
