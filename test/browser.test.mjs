// End-to-end: these drive the real browser, like the skill does. Skipped when no Chrome-type browser exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findBrowser, launch } from '../skills/one-shot-site/scripts/lib/chrome.mjs';
import { settle } from '../skills/one-shot-site/scripts/lib/probes.mjs';

const SCRIPTS = resolve('skills/one-shot-site/scripts');
const skip = findBrowser() ? false : 'no Chrome, Edge, Brave or Chromium installed';
const node = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 240000 });

test('look finds faults planted in a page', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-look-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Faults</title>
    <body style="margin:0;font:18px/1.5 sans-serif;background:#fff">
      <style>@font-face { font-family: Solo; src: local("Arial"), local("Liberation Sans"), local("DejaVu Sans"); font-weight: 400; }</style>
      <h1 style="padding:0 16px">A page with problems</h1>
      <h2 style="font-family:Solo;font-weight:700;padding:0 16px">Only a regular face exists</h2>
      <div style="width:1400px;padding:0 16px">This row is far wider than a phone.</div>
      <p style="color:#c8c8c8;padding:0 16px">Pale grey text that nobody can read on white.</p>
      <p style="opacity:0;padding:0 16px">This paragraph waits for a reveal that never comes.</p>
      <p style="visibility: hidden; padding:0 16px">A script hid this one and forgot about it.</p>
      <img src="missing.png" alt="Missing picture" width="200" height="100">
      <script>notDefinedAnywhere();</script>
    </body></html>`);
  // every screen: the page is wider than a phone, so the browser zooms out and the last one has no cut to make (it
  // crashed with "Cannot take screenshot with 0 height", or hung for 120 s)
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--out', join(dir, 'out')]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(existsSync(join(dir, 'out/sheet-home-390.jpg')), r.stdout + r.stderr);
  const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
  const rules = new Set(found.map((f) => f.rule));
  assert.equal(found.filter((f) => f.rule === 'never-shown').length, 2, 'both the faded and the script-hidden paragraph');
  for (const want of ['fake-bold', 'overflow-x', 'contrast', 'never-shown', 'broken-image', 'script-error', 'request']) assert.ok(rules.has(want), `missing ${want}: got ${[...rules].join(', ')}`);
  rmSync(dir, { recursive: true, force: true });
});

// A finding the sheets show is wrong, or a deliberate exception, goes in .one-shot/allow.json with its reason in the
// brief; look read only its own rules, so a misfire kept failing every round.
test('look honours .one-shot/allow.json, as audit does', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-look-allow-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Pale words</title>
      <body style="margin:0;font:18px/1.5 sans-serif;background:#fff;color:#111"><main style="padding:16px">
        <h1>Pale words</h1><p style="color:#c8c8c8">Pale grey text that nobody can read on white.</p></main></body></html>`);
    const look = () => {
      const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--frames', '1', '--out', join(dir, 'out')]);
      return { r, out: r.stdout + r.stderr, report: JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')) };
    };
    const before = look();
    assert.equal(before.r.status, 1, before.out);
    assert.ok(before.report.findings.some((f) => f.rule === 'contrast' && f.level === 'fail'), before.out);
    mkdirSync(join(dir, '.one-shot'));
    writeFileSync(join(dir, '.one-shot/allow.json'), '["contrast"]');
    const after = look();
    assert.ok(!after.report.findings.some((f) => f.rule === 'contrast'), after.out);
    assert.match(after.r.stdout, /\d+ finding\(s\) allowed on purpose by .+allow\.json \(contrast\)\./);
    writeFileSync(join(dir, '.one-shot/allow.json'), '{"contrast": true}');
    const bad = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--frames', '1', '--out', join(dir, 'out')]);
    assert.equal(bad.status, 2, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /allow\.json should be a list of rule names/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('look --numbers labels blocks and their parts, and the labels cause no faults', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-numbers-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Numbers</title><link rel="icon" href="data:,">
    <body style="margin:0;font:18px/1.5 sans-serif;background:#fff;color:#111">
      <header class="site-header" style="padding:16px">Corner Bakery</header>
      <main>
        <section class="hero" style="padding:16px"><h1>Bread at seven</h1><a class="button" href="#visit" style="display:inline-block;padding:12px 20px">Find us</a></section>
        <section id="visit" style="padding:16px"><h2>Visit</h2><p>Market Street 4</p></section>
      </main>
      <footer style="padding:16px">© Corner Bakery</footer>
    </body></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--frames', '1', '--numbers', '--out', join(dir, 'out')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const md = readFileSync(join(dir, 'out/numbers.md'), 'utf8');
  for (const want of ['**1** header.site-header', '**2** section.hero: Bread at seven', '**2a** h1', '**2b** a.button: Find us', '**3** section#visit: Visit', '**4** footer']) assert.ok(md.includes(want), `missing ${want} in\n${md}`);
  rmSync(dir, { recursive: true, force: true });
});

test('film records motion: slow headline, endless loop, layout shift, a canvas drawing off screen, and moves left on with reduced motion', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-film-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Film</title><link rel="icon" href="data:,">
    <style>
      body { margin: 0; font: 18px/1.5 sans-serif; background: #fff; color: #111 }
      h1 { margin: 0; padding: 40px 16px; animation: in 2.4s both } /* long enough to count as slow even when a slow machine paints late */
      @keyframes in { from { opacity: 0 } }
      .spin { width: 120px; height: 120px; background: #c33; margin: 16px; animation: turn 2s linear infinite }
      @keyframes turn { to { transform: rotate(1turn) } }
      .slide { margin: 16px; padding: 16px; background: #eee; transition: transform 0.8s }
      .slide.in { transform: translateX(40px) }
      .tall { height: 2400px; background: #ddd }
    </style>
    <body><h1>Slow to arrive</h1><canvas width="60" height="60"></canvas><div class="spin"></div><p class="slide">Slides over</p><div class="tall"></div>
    <script>
      setTimeout(() => document.querySelector('.slide').classList.add('in'), 300);
      const x = document.querySelector('canvas').getContext('2d');
      (function draw() { x.clearRect(0, 0, 60, 60); x.fillRect(0, 0, Math.random() * 60, 20); requestAnimationFrame(draw); })();
      setTimeout(() => { const d = document.createElement('div'); d.style.height = '700px'; document.body.prepend(d); }, 600);
    </script></body></html>`);
  const film = (...extra) => node([join(SCRIPTS, 'film.mjs'), dir, '--seconds', '3', '--steps', '2', '--width', '800', ...extra]);
  const r = film('--video', '--out', join(dir, 'film'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const rules = new Set(JSON.parse(readFileSync(join(dir, 'film/report.json'), 'utf8')).findings.map((f) => f.rule));
  for (const want of ['slow-headline', 'forever', 'layout-shift', 'offscreen-loop']) assert.ok(rules.has(want), `missing ${want}: got ${[...rules].join(', ')}\n${r.stdout}`);
  for (const f of ['film-load.jpg', 'film-scroll.jpg', 'film.md']) assert.ok(existsSync(join(dir, 'film', f)), f);
  assert.match(readFileSync(join(dir, 'film/film.md'), 'utf8'), /css animation \| h1 \| in/);
  if (!r.stdout.includes('cannot record video')) assert.ok(existsSync(join(dir, 'film/film.webm')), 'film.webm');

  const calm = film('--reduced', '--out', join(dir, 'calm'));
  assert.equal(calm.status, 1, calm.stdout + calm.stderr);
  const found = JSON.parse(readFileSync(join(dir, 'calm/report.json'), 'utf8')).findings;
  assert.ok(found.some((f) => f.rule === 'reduced-moves' && /transform/.test(f.text)), JSON.stringify(found));
  assert.ok(found.some((f) => f.rule === 'reduced-loops'), JSON.stringify(found));
  rmSync(dir, { recursive: true, force: true });
});

test('photos: numbered sheet, web sizes, credits, and the audit wants CC BY credited on the page', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-photos-'));
  const jpg = readFileSync(resolve('examples/kleiner-kaffee/desktop.jpg'));
  // a stand-in for Openverse: two results (one repeated), both pointing at a local picture
  const server = createServer((req, res) => {
    if (req.url.startsWith('/v1/images/')) {
      const base = `http://127.0.0.1:${server.address().port}`;
      const item = (id, title, creator, license) => ({ id, title, creator, creator_url: id === 'a' ? 'javascript:alert(1)' : 'https://example.org/' + creator, source: 'flickr', license, license_version: license === 'by' ? '2.0' : '1.0',
        license_url: 'https://creativecommons.org/licenses/' + license, foreign_landing_url: 'https://example.org/p/' + id, url: base + '/photo.jpg', thumbnail: base + '/photo.jpg', width: 1440, height: 900 });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ results: [item('a', 'Café counter', 'Ana Lima & <Co>', 'by'), item('b', 'Café counter', 'Ana Lima & <Co>', 'by'), item('c', 'Oven', 'Ben Ode', 'cc0')] }));
    }
    res.setHeader('content-type', 'image/jpeg');
    res.end(jpg);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, OPENVERSE_API: `http://127.0.0.1:${server.address().port}/v1/images/` };
  const run = (args) => new Promise((ok) => {
    const p = spawn(process.execPath, [join(SCRIPTS, 'photos.mjs'), ...args], { cwd: dir, env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (status) => ok({ status, out }));
  });
  try {
    let r = await run(['search', 'cafe counter']);
    assert.equal(r.status, 0, r.out);
    const { list } = JSON.parse(readFileSync(join(dir, '.one-shot/photos/photos.json'), 'utf8'));
    assert.deepEqual(list.map((p) => p.title), ['Café counter', 'Oven'], 'the repeated shot is dropped');
    assert.ok(existsSync(join(dir, '.one-shot/photos/photos.jpg')));
    r = await run(['get', '1', '2', '--as', 'counter', '--widths', '400,800']);
    assert.equal(r.status, 0, r.out);
    for (const f of ['counter-1-400.webp', 'counter-1-800.webp', 'counter-2-800.webp']) assert.ok(existsSync(join(dir, 'public/img', f)), f);
    // what the uploader typed goes into a page: escaped, and a link only when it is a web address
    assert.match(r.out, /<small class="credit">Photo: <a href="https:\/\/example\.org\/p\/a">Café counter<\/a> by Ana Lima &amp; &lt;Co&gt;, .*CC BY 2\.0/);
    assert.doesNotMatch(r.out, /javascript:|<Co>/);
    // fetched again: each photo credited once
    assert.equal((await run(['get', '1', '2', '--as', 'counter', '--widths', '400,800'])).status, 0);
    const credits = readFileSync(join(dir, 'public/img/CREDITS.md'), 'utf8');
    assert.equal(credits.match(/`counter-1-\*`/g).length, 1, credits);
    assert.match(credits, /`counter-1-\*`: "Café counter" by Ana Lima & <Co> \(flickr\), CC BY 2\.0/);
    assert.match(credits, /`counter-2-\*`: "Oven" by Ben Ode \(flickr\), CC0/);
  } finally { server.close(); }

  // the audit reads the credits in the build: CC BY without the name on the page is a fault
  const dist = join(dir, 'dist');
  mkdirSync(join(dist, 'img'), { recursive: true });
  cpSync(join(dir, 'public/img/CREDITS.md'), join(dist, 'img/CREDITS.md'));
  const page = (extra) => writeFileSync(join(dist, 'index.html'), `<!doctype html><html lang="en"><title>Café</title><main><h1>Café</h1>${extra}</main></html>`);
  page('');
  assert.match(node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']).stdout, /\[photo-credit\].*counter-1/);
  page('<small>Photo by Ana Lima &amp; &lt;Co&gt;, CC BY 2.0</small>'); // the printed line, entities and all
  assert.doesNotMatch(node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']).stdout, /photo-credit/);
  rmSync(dir, { recursive: true, force: true });
});

test('photos: when Openverse is down or finds nothing, Wikimedia Commons answers, without share-alike, maps or logos', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-commons-'));
  const jpg = readFileSync(resolve('examples/kleiner-kaffee/desktop.jpg'));
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url.startsWith('/v1/images/')) {
      if (!req.url.includes('q=empty')) { res.statusCode = 504; return res.end('Gateway Timeout'); }
      res.setHeader('content-type', 'application/json');
      return res.end('{"results":[]}');
    }
    if (req.url.startsWith('/w/api.php')) {
      const page = (pageid, index, title, lic, width, height, { mime = 'image/jpeg', cats = 'Bicycles' } = {}) => ({ pageid, index, title, imageinfo: [{ mime, width, height,
        url: `${base}/orig/${pageid}.jpg?utm_source=x`, thumburl: `${base}/thumb/${pageid}/500px-${pageid}.jpg?utm_source=x`,
        descriptionurl: `https://commons.example/wiki/${pageid}`, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a href="#">Ana Lima</a>' }, Categories: { value: cats } } }] });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ query: { pages: { 1: page(1, 1, 'File:Shared bike.jpg', 'CC BY-SA 4.0', 1400, 900),
        2: page(2, 2, 'File:Bike workshop.jpg', 'CC0', 1400, 900), 3: page(3, 3, 'File:Big wheel.jpg', 'CC BY 4.0', 4000, 2500),
        // off topic for a page's picture, whatever the licence: a map, a logo, a flag, a coat of arms, a diagram, a scan, a drawing
        4: page(4, 4, 'File:Bicycle routes map of Saarland.jpg', 'CC0', 1400, 900), 5: page(5, 5, 'File:Hollerbach bikes.png', 'CC0', 1400, 900, { mime: 'image/png', cats: 'Logos of bicycle shops' }),
        6: page(6, 6, 'File:Flag of Velo.jpg', 'CC BY 4.0', 1400, 900), 7: page(7, 7, 'File:Wappen Fahrradstadt.jpg', 'Public domain', 1400, 900),
        8: page(8, 8, 'File:Derailleur gears.jpg', 'CC0', 1400, 900, { cats: 'Bicycle gearing diagrams|Bicycle parts' }),
        9: page(9, 9, 'File:Workshop ledger 1898.jpg', 'Public domain', 1400, 900, { cats: 'Scanned documents|History of cycling' }),
        10: page(10, 10, 'File:Bike workshop sign.png', 'CC0', 1400, 900, { mime: 'image/png', cats: 'Illustrations of bicycles' }) } } }));
    }
    res.setHeader('content-type', 'image/jpeg');
    res.end(jpg);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, OPENVERSE_API: `${base}/v1/images/`, COMMONS_API: `${base}/w/api.php` };
  const search = (q) => new Promise((ok) => {
    const p = spawn(process.execPath, [join(SCRIPTS, 'photos.mjs'), 'search', q], { cwd: dir, env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (status) => ok({ status, out }));
  });
  try {
    let r = await search('bicycle workshop');
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Openverse didn't answer \(504 Gateway Timeout\): trying Wikimedia Commons\./, 'one line says why');
    const { list } = JSON.parse(readFileSync(join(dir, '.one-shot/photos/photos.json'), 'utf8'));
    assert.deepEqual(list.map((p) => [p.title, p.license, p.creator]), [['Bike workshop', 'cc0', 'Ana Lima'], ['Big wheel', 'by', 'Ana Lima']], 'no share-alike, no maps, logos, flags, arms, diagrams, scans or drawings');
    assert.match(list[1].url, /\/1920px-3\.jpg$/, 'a large original comes as the 1920px copy');
    assert.equal(list[1].width, 1920);
    assert.match(readFileSync(join(dir, '.one-shot/photos/photos.html'), 'utf8'), /free photos from Wikimedia Commons/);
    r = await search('empty workshop');
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Openverse found nothing for "empty workshop": trying Wikimedia Commons\./);
  } finally { server.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('study measures a site it likes: ground, accent, type, corners, grid, motion level', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-study-'));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Liked</title>
    <style>
      body { margin: 0; background: #101418; color: #e8e6e3; font: 18px/1.6 system-ui, sans-serif }
      section { padding: 96px 64px } h1 { font: 400 64px/1.05 Georgia, serif; margin: 0 }
      .button { display: inline-block; background: #e8590c; color: #fff; padding: 14px 24px; border-radius: 999px; text-decoration: none }
      .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px } .g div { border-radius: 12px; background: #1b2128; padding: 24px }
    </style>
    <main><section><h1>Quiet and dark</h1><p>A serif headline over a dark ground, with one orange button.</p><a class="button" href="#">Start</a></section>
    <section><div class="g"><div>One</div><div>Two</div><div>Three</div></div></section></main>
    <script>window.gsap = {};</script></html>`;
  // a page that isn't there answers 404 with a page of its own: that is not the site they like
  const server = createServer((req, res) => { res.statusCode = req.url.startsWith('/gone') ? 404 : 200; res.setHeader('content-type', 'text/html'); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const study = (...extra) => new Promise((ok) => {
    const p = spawn(process.execPath, [join(SCRIPTS, 'study.mjs'), ...extra, '--out', join(dir, 'study')]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (status) => ok({ status, out }));
  });
  const site = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await study(`${site}/`, '--pages', '/,/work');
    assert.equal(r.status, 0, r.out);
    const gone = await study(`${site}/gone`);
    assert.equal(gone.status, 2, gone.out);
    assert.match(gone.out, /\/gone answers 404, so there is nothing to study there/);
  } finally { server.close(); }
  const md = readFileSync(join(dir, 'study/study.md'), 'utf8');
  for (const want of ['#101418', 'a dark site', '--brand "#e8590c"', '--mode dark', 'h1: Georgia (serif), 64px', 'pill/round', 'up to 3 columns', 'Level: Lively', 'Uses GSAP']) assert.ok(md.includes(want), `missing "${want}" in\n${md}`);
  for (const f of ['study-desktop.jpg', 'study-phone.jpg', 'study-sheet.jpg', 'study-work-desktop.jpg', 'study-work-phone.jpg']) assert.ok(existsSync(join(dir, 'study', f)), f);
  assert.ok(md.includes('Pictures: study-work-desktop.jpg, study-work-phone.jpg.'), 'the second page\'s pictures by their own names');
  assert.ok(!existsSync(join(dir, 'study/frame-0.jpg')), 'frames are cleaned up');
  rmSync(dir, { recursive: true, force: true });
});

test('a fresh starter site, filled in, passes its own audit', { skip, timeout: 600000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-site-'));
  const site = join(root, 'test-bakery');
  let r = node([join(SCRIPTS, 'new-site.mjs'), site, '--name', 'Test Bakery', '--schema', 'Bakery', '--theme', '#b4532a',
    '--title', 'Test Bakery: sourdough in Saarbrücken', '--url', 'https://test-bakery.example/', '--email', 'hi@test-bakery.example',
    '--description', 'Sourdough, rye and spelt from a stone oven, baked every morning from six in the old town of Saarbrücken. Closed on Mondays.',
    '--addons', 'effects']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const index = join(site, 'index.html');
  writeFileSync(index, readFileSync(index, 'utf8')
    .replace('{{ABOUT}}', 'Two bakers, one oven from 1956, and <span data-count>1,200</span> loaves a week that sell out by noon.')
    .replace(/<h1\b/, '<h1 data-split')
    .replace('</h1>', '</h1> <svg data-draw viewBox="0 0 100 4" width="240" height="10" aria-hidden="true"><path d="M0 2H100" stroke="currentColor" fill="none"/></svg>'));
  // the starter's h1 carries attributes of its own (translate="no"): the split has to land on it all the same
  assert.match(readFileSync(index, 'utf8'), /<h1 data-split\b[^>]*>/);
  const main = join(site, 'src/main.js');
  writeFileSync(main, readFileSync(main, 'utf8') + "\nimport { initEffects } from './addons/effects.js';\ninitEffects();\n");
  const build = () => spawnSync('npm run build', { cwd: site, shell: true, encoding: 'utf8' });
  assert.equal(build().status, 0);
  assert.equal(node([join(SCRIPTS, 'images.mjs'), 'og', 'dist'], site).status, 0);
  assert.equal(node([join(SCRIPTS, 'images.mjs'), 'icon', '--bg', '#b4532a'], site).status, 0);
  assert.equal(build().status, 0);
  // a test site has a made-up address and email; a demo site says so on purpose, as this one does
  mkdirSync(join(site, '.one-shot'), { recursive: true });
  // (and a skeleton with one line of about text is sparse on a desktop screen, which this test is not about)
  writeFileSync(join(site, '.one-shot/allow.json'), '["made-up-address", "sparse-screen"]');
  // a site that is ready to ship joins the looks history (a file of its own here, never the home folder's)
  const history = join(root, 'history.json');
  r = spawnSync(process.execPath, [join(SCRIPTS, 'audit.mjs'), 'dist'], { cwd: site, encoding: 'utf8', timeout: 240000, env: { ...process.env, ONE_SHOT_HISTORY: history } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Ready to ship/);
  const recorded = JSON.parse(readFileSync(history, 'utf8')).sites;
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].site, 'test-bakery');
  assert.ok(recorded[0].brand && recorded[0].ground && recorded[0].fonts.length === 2, JSON.stringify(recorded[0]));
  assert.match(r.stdout, /allowed on purpose.*made-up-address/);
  // the effects addon moves within limits, and not at all with reduced motion. A busy CI machine (macOS runners
  // especially) stretches the split headline past 2 s, so there the headline's timing doesn't count; the rest does.
  for (const extra of [[], ['--reduced']]) {
    r = node([join(SCRIPTS, 'film.mjs'), 'dist', '--steps', '1', '--seconds', '2', ...extra], site);
    assert.notEqual(r.status, 2, r.stdout + r.stderr);
    const report = JSON.parse(readFileSync(join(site, extra.length ? '.one-shot/film-reduced' : '.one-shot/film', 'report.json'), 'utf8'));
    const fails = report.findings.filter((f) => f.level === 'fail' && !(process.env.CI && f.rule === 'slow-headline'));
    assert.deepEqual(fails, [], r.stdout + r.stderr);
    // entrances already on the first screen play after the first paint, not skipped before it
    const moved = report.timeline.map((t) => t.label);
    if (!extra.length) for (const want of ['fx-rise', 'fx-draw']) assert.ok(moved.includes(want), `${want} on the first screen: ${moved}`);
  }
  // a GitHub project page: the base reaches the assets and the home link, also after Git Bash rewrote it
  r = spawnSync('npm run build', { cwd: site, shell: true, encoding: 'utf8', env: { ...process.env, BASE: 'C:/Program Files/Git/test-bakery/' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const built = readFileSync(join(site, 'dist/index.html'), 'utf8');
  assert.match(built, /class="wordmark" href="\/test-bakery\/"/);
  assert.match(built, /src="\/test-bakery\/assets\//);
  rmSync(root, { recursive: true, force: true });
});

test('mockup draws the same first screen in each look, plus a sheet', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-mock-'));
  const r = node([join(SCRIPTS, 'mockup.mjs'), '--name', 'Test Café', '--line', 'Eight seats, one roaster.', '--moods', 'quiet,bold', '--out', dir]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['mockups.jpg', 'a-quiet-desktop.jpg', 'a-quiet-phone.jpg', 'b-bold-desktop.jpg', 'b-bold-phone.jpg']) assert.ok(existsSync(join(dir, f)), `missing ${f}`);
  assert.match(readFileSync(join(dir, 'a-quiet.html'), 'utf8'), /Eight seats, one roaster\./);
  assert.equal(node([join(SCRIPTS, 'mockup.mjs'), '--name', 'X', '--moods', 'loud']).status, 2);
  rmSync(dir, { recursive: true, force: true });
});

// a face with a wrong name (or none at all offline) is drawn in the system font: the sheet named it anyway
test('mockup --concepts names a face that did not load and stops before the sheet is shown', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-mock-font-'));
  try {
    writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'Test Café', line: 'Eight seats, one roaster.', action: 'See the menu', concepts: [
      { name: 'Counter', idea: 'The counter is the page.', mood: 'warm', brand: '#9c3d1c', fonts: ['Nowhere Grotesk Qq', 'Inter'], move: 'type', bold: 'the line fills the screen' },
    ] }));
    const r = node([join(SCRIPTS, 'mockup.mjs'), '--concepts', 'concepts.json', '--out', join(dir, 'out')], dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /Did not load, so drawn in the system font: A: Nowhere Grotesk Qq.*Do not show this sheet\./);
    assert.doesNotMatch(r.stdout, /Show the sheet/);
    assert.match(readFileSync(join(dir, 'out/concepts.html'), 'utf8'), /Nowhere Grotesk Qq[^<]*did not load: drawn in the system font/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site fits site.json to the kind of site, and the browser bar to the page', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-kind-'));
  const make = (name, ...extra) => {
    const r = node([join(SCRIPTS, 'new-site.mjs'), join(root, name), '--name', name, '--no-install', ...extra]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return JSON.parse(readFileSync(join(root, name, 'site.json'), 'utf8'));
  };
  const shop = make('shop', '--schema', 'Bakery', '--lang', 'en-GB');
  assert.equal(shop.currency, 'GBP');
  assert.equal(shop.address.country, 'GB');
  assert.ok(Array.isArray(shop.hours) && Array.isArray(shop.menu));
  const person = make('person', '--schema', 'Person', '--lang', 'de-CH', '--theme', '#1d4ed8', '--addons', 'theme');
  for (const k of ['hours', 'closed', 'menu', 'currency']) assert.ok(!(k in person), `a person has no ${k}`);
  assert.deepEqual(person.address, { country: 'CH' }, 'a country, no street');
  const html = readFileSync(join(root, 'person/index.html'), 'utf8');
  const bars = [...html.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: (light|dark)\)">/g)];
  assert.equal(bars.length, 2, 'one browser-bar colour per scheme');
  assert.ok(bars.every((m) => m[1] !== '#1d4ed8'), 'the bar takes the ground, not the brand');
  assert.match(readFileSync(join(root, 'person/public/favicon.svg'), 'utf8'), /fill="#1d4ed8"/, 'the icon keeps the brand');
  assert.ok(existsSync(join(root, 'person/tools/one-shot/LICENSE.txt')), 'the licence travels with the tools');
  assert.equal(make('event', '--schema', 'Event', '--currency', 'usd').currency, 'USD');
  // the page's language is not the business's country: an English site for a café in Germany
  const cafe = make('cafe', '--schema', 'CafeOrCoffeeShop', '--lang', 'en-GB', '--phone', '+49 30 1234567');
  assert.deepEqual([cafe.address.country, cafe.currency], ['DE', 'EUR']);
  const vienna = make('vienna', '--lang', 'en-GB', '--country', 'at');
  assert.deepEqual([vienna.address.country, vienna.currency], ['AT', 'EUR']);
  const help = node([join(SCRIPTS, 'new-site.mjs')]);
  assert.equal(help.status, 2);
  assert.match(help.stderr, /--addons motion,effects/, 'no arguments prints the usage from the top of the script');
  rmSync(root, { recursive: true, force: true });
});

test('new-site --legal de adds an Impressum and a privacy page, linked from the footer', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-legal-'));
  const site = join(root, 'cafe');
  const r = node([join(SCRIPTS, 'new-site.mjs'), site, '--name', 'Café', '--lang', 'de', '--legal', 'de', '--theme', '#5a7d3a', '--no-install']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /site\.owner\.name/);
  for (const f of ['impressum.html', 'datenschutz.html']) assert.match(readFileSync(join(site, f), 'utf8'), /\{\{site\.owner\.name\|later\}\}/);
  // under the base, as a GitHub project page (/NAME/) needs: Vite fills %BASE_URL% and leaves <a href="/…"> alone
  assert.match(readFileSync(join(site, 'index.html'), 'utf8'), /href="%BASE_URL%impressum\.html".*href="%BASE_URL%datenschutz\.html"/);
  assert.match(readFileSync(join(site, 'impressum.html'), 'utf8'), /href="%BASE_URL%datenschutz\.html"/);
  assert.match(readFileSync(join(site, 'datenschutz.html'), 'utf8'), /href="%BASE_URL%impressum\.html"/);
  for (const f of ['index.html', 'impressum.html', 'datenschutz.html']) assert.doesNotMatch(readFileSync(join(site, f), 'utf8'), /<a [^>]*href="\/(?!\/)/, f);
  // the browser bar matches the page's ground, as on the home page
  const bar = (f) => readFileSync(join(site, f), 'utf8').match(/<meta name="theme-color"[^>]*>/g);
  for (const f of ['impressum.html', 'datenschutz.html']) {
    assert.deepEqual(bar(f), bar('index.html'), f);
    assert.doesNotMatch(readFileSync(join(site, f), 'utf8'), /\{\{THEME_COLOR\}\}/, 'placeholders filled in the legal pages too');
  }
  assert.equal(JSON.parse(readFileSync(join(site, 'site.json'), 'utf8')).owner.name, '');
  rmSync(root, { recursive: true, force: true });
});

test('audit finds local, privacy and legal gaps', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-local-'));
  const dist = join(dir, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), `<!doctype html><html lang="de"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Bäckerei Test in Saarbrücken</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Bäckerei Test"}</script>
    <body><main><h1>Bäckerei Test</h1><p><a href="/karte.pdf">Unsere Speisekarte</a></p></main></body></html>`);
  writeFileSync(join(dist, 'karte.pdf'), '%PDF-1.4');
  writeFileSync(join(dist, '404.html'), '<!doctype html><html lang="de"><title>Nicht gefunden</title><meta name="robots" content="noindex"><a href="/">Start</a>');
  const r = node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']);
  for (const want of ['local-data', 'pdf-menu', 'third-party', 'impressum', 'privacy-page']) assert.ok(r.stdout.includes(`[${want}]`), `missing ${want}:\n${r.stdout}`);
  rmSync(dir, { recursive: true, force: true });
});

// Text over a picture is measured from the pixels behind it: white on a pale picture fails with its ratio, white on
// a dark one passes, a big headline on a pale photo needs 3:1, and words on a scrim pass.
test('over-media measures text on a picture from its pixels', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-onphoto-'));
  try {
    const pic = (fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="${fill}"/></svg>`);
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Pictures</title>
      <body style="margin:0;font:18px/1.5 sans-serif;background:#fff;color:#222">
        <section class="pale" style="height:320px;background:url('${pic('#e8e4dc')}') center/cover;color:#fff;padding:24px"><p>White words on a pale picture</p></section>
        <section class="dark" style="height:320px;background:url('${pic('#2a2622')}') center/cover;color:#fff;padding:24px"><p>White words on a dark picture</p></section>
        <div class="hero" style="position:relative;height:360px"><img src="${pic('#f2efe8')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
          <h1 style="position:relative;margin:0;padding:24px;color:#fff;font-size:40px">A pale photo under a big headline</h1>
          <p style="position:relative;margin:0 24px;padding:8px;background:rgba(0,0,0,.6);color:#fff">On a scrim</p></div>
      </body></html>`);
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
    const media = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => f.rule === 'over-media');
    const pale = media.find((f) => /section\.pale/.test(f.text));
    assert.ok(pale && pale.level === 'fail', r.stdout + JSON.stringify(media, null, 1));
    assert.match(pale.text, /measures 1\.\d:1 against the picture at its weakest spot, behind p "White words on a pale picture" \(it needs 4\.5:1\)/);
    assert.ok(!media.some((f) => /dark picture/.test(f.text)), 'white on a dark picture passes');
    const hero = media.find((f) => /^Text on a picture \(img\)/.test(f.text));
    assert.ok(hero && hero.level === 'fail' && /behind h1 "A pale photo under a big headline" \(it needs 3:1 as large text\)/.test(hero.text), JSON.stringify(media, null, 1));
    assert.ok(!media.some((f) => /On a scrim/.test(f.text)), 'the words on a scrim pass');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a texture on the page keeps the contrast check on; a background picture behind text is measured', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-texture-'));
  const dot = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="1" height="1" fill="#000" opacity=".04"/></svg>');
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Texture</title>
    <body style="margin:0;font:18px/1.5 sans-serif;background:#fff url('${dot}')">
      <h1 style="padding:0 16px">A page on paper</h1>
      <p style="color:#c8c8c8;padding:0 16px">Pale grey text that nobody can read on white.</p>
      <section style="height:300px;background:#333 url('${dot}') center/cover;color:#fff;padding:16px"><p>Words on a photo</p></section>
      <a href="#" style="display:inline-block;padding:0 24px 0 16px;background:url('${dot}') no-repeat right center">More</a>
    </body></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--frames', '1', '--out', join(dir, 'out')]);
  const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
  assert.ok(found.some((f) => f.rule === 'contrast' && /Pale grey/.test(f.where)), 'contrast is still checked on a textured page\n' + r.stdout);
  assert.ok(found.some((f) => f.rule === 'over-media' && /whole page has a background image/.test(f.text)), 'the texture is noted once');
  assert.ok(!found.some((f) => f.rule === 'over-media' && /section/.test(f.text)), 'white words on a dark background picture are measured, and pass');
  assert.ok(!found.some((f) => /background picture \(a/.test(f.text)), 'an icon on a link is not a picture');
  rmSync(dir, { recursive: true, force: true });

  // the colour on html and the texture on body: still a texture, still measured, and the note says on what
  const dir2 = mkdtempSync(join(tmpdir(), 'oss-texture-'));
  const page = (html, body, title) => `<!doctype html><html lang="en" style="${html}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Texture</title>
    <body style="margin:0;font:18px/1.5 sans-serif;${body}"><h1 style="padding:0 16px">${title}</h1>
    <p style="color:#c8c8c8;padding:0 16px">Pale grey text that nobody can read on cream.</p></body></html>`;
  // (two headlines: look counts one fault on one element once, across pages too)
  writeFileSync(join(dir2, 'split.html'), page('background:#fbf7ef', `background-image:url('${dot}')`, 'A page on paper'));
  writeFileSync(join(dir2, 'bare.html'), page('', `background-image:url('${dot}')`, 'A page on nothing'));
  const r2 = node([join(SCRIPTS, 'look.mjs'), dir2, '--pages', 'split,bare', '--widths', '390', '--frames', '1', '--out', join(dir2, 'out')]);
  const on = (p) => JSON.parse(readFileSync(join(dir2, 'out/report.json'), 'utf8')).findings.filter((f) => f.at.startsWith(p + ' '));
  assert.ok(on('split').some((f) => f.rule === 'contrast' && /Pale grey/.test(f.where)), 'the colour on html is the one measured\n' + r2.stdout);
  assert.ok(on('split').some((f) => f.rule === 'over-media' && /background image \(a texture\?\) over its colour #fbf7ef/.test(f.text)), r2.stdout);
  assert.ok(!on('split').some((f) => /background picture \(body/.test(f.text)), 'a page texture is not a picture behind every line');
  assert.ok(on('bare').some((f) => f.rule === 'over-media' && /no background colour under it, so the contrast of its text is not measured/.test(f.text)), r2.stdout);
  rmSync(dir2, { recursive: true, force: true });
});

test('look: covered skips text only screen readers get; long-headline counts the lines seen and says at which width', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-sr-'));
  const sr = 'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Split</title>
    <body style="margin:0;font:18px/1.5 sans-serif;background:#fff;color:#111">
    <!-- a split headline as the effects addon leaves it: the words for the eye, a clipped copy for screen readers (here below it) -->
    <h1 style="position:relative;font-size:40px;line-height:1.1;margin:24px 16px"><span aria-hidden="true">Bread at seven<br>every day<br>of the week</span><span style="${sr};top:100%">Bread at seven every day of the week</span></h1>
    <span style="${sr};left:16px;top:400px;font-size:18px">Words only a screen reader hears</span><div style="position:absolute;left:0;top:380px;width:390px;height:60px;background:#c33"></div>
    <p style="position:absolute;left:16px;top:500px;margin:0">Visible words under a box</p><div style="position:absolute;left:0;top:490px;width:390px;height:60px;background:#c33"></div>
    </body></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390,1440', '--frames', '1', '--out', join(dir, 'out')]);
  const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
  const covered = found.filter((f) => f.rule === 'covered');
  assert.ok(covered.some((f) => /Visible words/.test(f.where)), 'visible text under a box is still covered\n' + r.stdout);
  assert.ok(!covered.some((f) => /screen reader/.test(f.where)), 'screen-reader-only text is never covered');
  const long = found.filter((f) => f.rule === 'long-headline');
  assert.deepEqual(long.map((f) => [f.text.split(';')[0], f.at]), [['At 1440px the h1 runs to 3 lines', 'home 1440px']], 'three lines: fine on a phone, long on a desktop; the copy below is not a line');
  rmSync(dir, { recursive: true, force: true });
});

test('settle waits for what moves on the screen: transitions, effects marked is-in, counting numbers', { skip, timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-settle-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Settle</title>
    <body style="margin:0;font:18px sans-serif">
    <div id="box" style="width:10px;height:40px;background:#c33;transition:width 1.2s linear"></div>
    <p data-count class="is-in"><span class="fx-n" aria-hidden="true"><span class="fx-ghost">1,200</span><span id="run">0</span></span></p>
    <svg data-draw id="late" width="200" height="20"></svg>
    <script>
      box.offsetWidth; box.style.width = '300px';
      setTimeout(() => late.classList.add('is-in'), 600);
      let n = 0; const t = setInterval(() => { n += 100; run.textContent = n.toLocaleString('en'); if (n >= 1200) clearInterval(t); }, 100);
    </script></body></html>`);
  const browser = await launch();
  try {
    const page = await browser.newPage({ width: 800, height: 600 });
    await page.goto('file:///' + join(dir, 'index.html').replace(/\\/g, '/'));
    const waited = await page.call(settle, 5000);
    assert.deepEqual(await page.eval(`[getComputedStyle(box).width, run.textContent, late.classList.contains('is-in')]`), ['300px', '1,200', true], `waited ${waited} ms`);
    assert.ok(waited < 5000, `gave up after ${waited} ms`);
    await page.close();
  } finally { await browser.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('theme addon: the button names the theme a click switches to, on light and dark systems, with and without a saved pick', { skip, timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-theme-'));
  cpSync(resolve('skills/one-shot-site/assets/addons/theme.js'), join(dir, 'theme.js'));
  const page = (button, css = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Theme</title><link rel="icon" href="data:,">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
    <script>try{var t=localStorage.getItem('site-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
    <style>:root { --ground: #ffffff; } @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ground: #111111; } }
      :root[data-theme="dark"] { --ground: #111111; } .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); } ${css}</style>
    <script>(() => { const start = document.startViewTransition?.bind(document); window.fades = []; if (start) document.startViewTransition = (cb) => { const t = start(cb); fades.push(t); return t; }; })();</script>
    <script type="module">import { initTheme } from './theme.js'; initTheme(document.querySelector('.theme-toggle'));</script>
    </head><body>${button}</body></html>`;
  const german = '<button class="theme-toggle" type="button" data-light="Hell" data-dark="Dunkel"><span class="visually-hidden">Wechseln zu </span><span class="theme-word">Dunkel</span></button>';
  writeFileSync(join(dir, 'index.html'), page(german));
  // a cross-fade long enough to click into
  writeFileSync(join(dir, 'fade.html'), page(german, '::view-transition-group(root) { animation-duration: 4s; }'));
  // the markup sites were built with before: a bare word and aria-pressed
  writeFileSync(join(dir, 'old.html'), page('<button class="theme-toggle" type="button" aria-pressed="false">Dark</button>'));
  const server = createServer((req, res) => {
    const f = join(dir, req.url.split('?')[0].slice(1) || 'index.html');
    if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const state = `(() => { const b = document.querySelector('.theme-toggle'), ground = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
    return { dark: ground === '#111111', word: b.querySelector('.theme-word')?.textContent, name: b.textContent.replace(/\\s+/g, ' ').trim(), pressed: b.getAttribute('aria-pressed'),
      icons: b.querySelectorAll('svg.theme-icon').length, metas: [...document.querySelectorAll('meta[name="theme-color"]')].every((m) => m.content === ground), saved: localStorage.getItem('site-theme') }; })()`;
  // the state once every cross-fade asked for has swapped the theme: that happens at the next frame drawn, which on a
  // slow machine (macOS CI) comes well after 400 ms; one that never swaps fails here after 5 s
  const settled = `(async () => { const all = Promise.all(fades.map((t) => t.updateCallbackDone.catch(() => {})));
    if (await Promise.race([all.then(() => 1), new Promise((r) => setTimeout(r, 5000, 0))])) return ${state}; throw new Error('the theme never swapped'); })()`;
  const click = (times = 1) => `(async () => { for (let i = 0; i < ${times}; i++) document.querySelector('.theme-toggle').click(); return ${settled}; })()`;
  const browser = await launch();
  try {
    for (const scheme of ['light', 'dark']) {
      for (const saved of [null, 'light', 'dark']) {
        const p = await browser.newPage({ width: 800, height: 600, colorScheme: scheme });
        await p.goto(base);
        await p.eval(saved ? `localStorage.setItem('site-theme', '${saved}')` : `localStorage.clear()`);
        await p.goto(base);
        const at = `${scheme} system, saved ${saved}`;
        const dark = saved ? saved === 'dark' : scheme === 'dark';
        const word = (d) => (d ? 'Hell' : 'Dunkel');
        const loaded = await p.eval(state);
        assert.deepEqual(loaded, { dark, word: word(dark), name: `Wechseln zu ${word(dark)}`, pressed: null, icons: 1, metas: true, saved }, `${at}: on load`);
        const once = await p.eval(click());
        assert.deepEqual([once.dark, once.word, once.saved, once.metas], [!dark, word(!dark), dark ? 'light' : 'dark', true], `${at}: one click`);
        const twice = await p.eval(click());
        assert.deepEqual([twice.dark, twice.word, twice.saved], [dark, word(dark), dark ? 'dark' : 'light'], `${at}: a second click goes back`);
        // two clicks before the cross-fade has run end where they started
        const quick = await p.eval(click(2));
        assert.deepEqual([quick.dark, quick.word], [dark, word(dark)], `${at}: a quick double click`);
        await p.close();
      }
    }
    // no pick yet: the word follows the system when it changes
    const p = await browser.newPage({ width: 800, height: 600, colorScheme: 'light' });
    await p.goto(base);
    await p.eval('localStorage.clear()');
    await p.goto(base);
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    const followed = `(async () => { for (let t = 0; t < 5000 && document.querySelector('.theme-word').textContent !== 'Hell'; t += 20) await new Promise((r) => setTimeout(r, 20)); return ${state}; })()`;
    assert.equal((await p.eval(followed)).word, 'Hell', 'the system turned dark');
    // the old markup: the bare word is wrapped, the icon added, aria-pressed dropped
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await p.goto(base + 'old.html');
    assert.deepEqual(await p.eval(state), { dark: false, word: 'Dark', name: 'Dark', pressed: null, icons: 1, metas: true, saved: null }, 'old markup on load');
    assert.equal((await p.eval(click())).word, 'Light', 'old markup after a click');
    assert.deepEqual(p.problems, []);
    // real clicks while the cross-fade runs: the browser hands them to <html>, and one on the button still counts,
    // so a second click goes back; one beside it does nothing
    await p.goto(base);
    await p.eval('localStorage.clear()');
    await p.goto(base + 'fade.html');
    const at = await p.eval(`(() => { const r = document.querySelector('.theme-toggle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const mouse = async ({ x, y }) => { for (const type of ['mousePressed', 'mouseReleased']) await p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); return p.eval(settled); };
    assert.equal((await mouse(at)).dark, true, 'a real click');
    assert.equal((await mouse({ x: at.x, y: at.y + 200 })).dark, true, 'a click beside the button, during the cross-fade');
    assert.deepEqual(await p.eval('fades.length'), 1, 'still one cross-fade');
    const back = await mouse(at);
    assert.deepEqual([back.dark, back.word, back.saved], [false, 'Dunkel', 'light'], 'a second real click during the cross-fade goes back');
    await p.close();
  } finally { await browser.close(); server.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('look --compare tells variants apart by layout, not only by type and colour', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-variants-'));
  const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Variant</title><body style="margin:0;font:18px/1.5 Georgia,serif;background:#f4efe6;color:#222">${body}</body></html>`;
  const split = page(`<main style="display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:80px 40px"><h1 style="font-size:64px;margin:0">Bread at seven, every day</h1>
    <svg viewBox="0 0 4 3" width="600" height="450" role="img" aria-label="Loaf"><rect width="4" height="3" fill="#b5651d"/></svg></main>`);
  writeFileSync(join(dir, 'variant-a.html'), split);
  writeFileSync(join(dir, 'variant-b.html'), page(`<main style="padding:200px 40px;text-align:center"><h1 style="font-size:120px;margin:0 auto;max-width:1100px">Bread at seven, every day</h1></main>`));
  writeFileSync(join(dir, 'variant-c.html'), split);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'variant-a,variant-b,variant-c', '--compare', '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
  const same = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => f.rule === 'same-variant');
  assert.equal(same.length, 1, r.stdout + r.stderr);
  assert.match(same[0].text, /variant-c.*variant-a/);
  rmSync(dir, { recursive: true, force: true });
});

test('look: a desktop screen left mostly empty is named; a full one, a giant decorative number and a drawing laid under the words are not', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-wide-'));
  const text = '<h2 style="font-size:48px;margin:0 0 16px">Bread at seven</h2><p style="margin:0">Rye with sourdough, spelt and pretzels from the oven in the lane.</p>';
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wide</title><body style="margin:0;font:18px/1.5 Georgia,serif;background:#f4efe6;color:#222"><main>
    <section id="left-only" style="padding:120px 40px;min-height:400px"><div style="max-width:560px">${text}</div></section>
    <section id="far-drawing" style="padding:80px 40px;display:flex;justify-content:space-between;align-items:center"><div style="max-width:420px">${text}</div>
      <svg width="200" height="160" viewBox="0 0 5 4"><ellipse cx="2.5" cy="2" rx="2.4" ry="1.8" fill="#b5651d"/></svg></section>
    <section id="two-columns" style="padding:80px 40px;display:grid;grid-template-columns:1fr 1fr;gap:40px;min-height:400px"><div>${text}</div>
      <svg width="100%" height="380" viewBox="0 0 4 3" role="img" aria-label="Loaf"><rect width="4" height="3" fill="#b5651d"/></svg></section>
    <section id="big-number" style="padding:80px 40px;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;min-height:400px">
      <span aria-hidden="true" style="font-size:300px;line-height:1">12</span><div>${text}</div></section>
    <section id="layered" style="position:relative;min-height:500px"><div style="position:absolute;inset:0;display:flex;justify-content:flex-end;align-items:center;padding-right:80px">
      <svg width="400" height="400" viewBox="0 0 4 4" aria-hidden="true"><circle cx="2" cy="2" r="2" fill="#b5651d"/></svg></div>
      <div style="position:relative;padding:120px 40px"><div style="max-width:560px">${text}</div></div></section>
    </main></body></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
  const wide = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => f.rule === 'wide-empty');
  assert.deepEqual(wide.map((f) => f.where.match(/#[\w-]+/)[0]).sort(), ['#far-drawing', '#left-only'], r.stdout + r.stderr);
  assert.match(wide.find((f) => f.where.includes('#far-drawing')).text, /px of empty screen between svg/);
  assert.match(wide.find((f) => f.where.includes('#left-only')).text, /only uses the left \d+%/);
  rmSync(dir, { recursive: true, force: true });
});

test('look: the frame. A hollow first screen, an off-centre page, a part without a heading, the h1 out of sight and a blank stretch are named; a full page is not', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-frame-'));
  const text = 'Rye with sourdough, spelt and pretzels from the stone oven in the lane, baked every morning from six. The dough rests overnight in the cold room, so the crumb is open and the crust is dark. We sell until it is gone, which on a Saturday is about eleven. Bring a bag: we wrap in paper.';
  const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Frame</title>
    <body style="margin:0;font:18px/1.5 Georgia,serif;background:#fff;color:#222"><header style="padding:16px 40px">Corner Bakery</header>${body}</body></html>`;
  // everything at once: a small line in an empty first screen, the h1 two screens down, a wrapper stuck to the left,
  // two paragraphs without a heading, 700px of padding
  writeFileSync(join(dir, 'bad.html'), page(`<main style="margin-left:40px;max-width:1060px">
    <section id="hero" style="min-height:100vh;display:grid;place-items:center"><p style="font-size:40px;margin:0">Bread at seven</p></section>
    <section id="story" style="padding:40px 0;display:grid;grid-template-columns:1fr 1fr;gap:40px"><p>${text}</p><p>${text}</p></section>
    <section id="gap" style="padding:40px 0 700px"><h1 style="margin:0">Corner Bakery in the old lane</h1><p>${text}</p></section>
    <section id="visit" style="padding:40px 0;display:grid;grid-template-columns:1fr 1fr;gap:40px"><h2>Visit</h2><p>Market Street 4, open from six until the bread is gone.</p></section></main>`));
  writeFileSync(join(dir, 'good.html'), page(`<main style="margin:0 auto;max-width:1200px;padding:0 24px">
    <section style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;padding:40px 0"><h1 style="font-size:96px;line-height:1;margin:0">Bread at seven</h1>
      <svg viewBox="0 0 4 3" width="100%" height="520" role="img" aria-label="Loaf"><rect width="4" height="3" fill="#b5651d"/></svg></section>
    <section style="padding:80px 0;display:grid;grid-template-columns:1fr 1fr;gap:40px"><h2 style="font-size:48px;margin:0">How we bake</h2><div><p>${text}</p><p>${text}</p></div></section>
    <section style="padding:80px 0;display:grid;grid-template-columns:1fr 1fr;gap:40px"><h2 style="font-size:48px;margin:0">Visit</h2><p>Market Street 4, open from six until the bread is gone.</p></section></main>
    <footer style="padding:40px 24px;max-width:1200px;margin:0 auto">© Corner Bakery</footer>`));
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'bad,good', '--widths', '390,1440', '--frames', '1', '--out', join(dir, 'out')]);
  const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
  const rules = ['hero-void', 'margins', 'untitled', 'first-h1', 'blank'];
  const on = (p) => found.filter((f) => rules.includes(f.rule) && f.at.startsWith(p + ' '));
  assert.deepEqual([...new Set(on('bad').map((f) => f.rule))].sort(), [...rules].sort(), r.stdout + r.stderr);
  assert.deepEqual(on('good'), [], r.stdout);
  const bad = (rule) => on('bad').find((f) => f.rule === rule);
  assert.match(bad('hero-void').text, /^At 1440px the first screen is mostly empty: what is on it covers \d+% of it, and its largest text is 40px/);
  assert.match(bad('margins').text, /about 40px of margin on the left and 340px on the right/);
  assert.match(bad('untitled').where, /section#story/);
  assert.match(bad('first-h1').text, /the h1 starts \d+px down, below the first screen/);
  const gap = on('bad').find((f) => f.rule === 'blank' && /section#gap/.test(f.where));
  assert.match(gap?.text || '', /^At \d+px there are \d+px of blank page between "Rye with/, JSON.stringify(on('bad')));
  rmSync(dir, { recursive: true, force: true });
});

test('look: habits of generated pages are measured in the page, whatever the class names', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-tells-'));
  const text = 'Rye with sourdough, spelt and pretzels from the stone oven in the lane, baked every morning from six.';
  // labels called "label", a cream ground and a terracotta accent, floating and glowing boxes, side stripes, cards in
  // a card, and three type sizes within a third of each other
  writeFileSync(join(dir, 'bad.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tells</title>
    <style>
      body { margin: 0; font: 18px/1.5 Georgia, serif; background: #f4efe6; color: #2b2118 } main { max-width: 1100px; margin: 0 auto; padding: 0 24px }
      h1 { font-size: 24px; color: #b4532a } h2 { font-size: 20px; margin: 0 0 12px } section { padding: 48px 0 }
      .label { font: 600 13px/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .14em; color: #b4532a; margin: 0 0 8px }
      a.cta { display: inline-block; background: #b4532a; color: #fff; padding: 12px 20px; border-radius: 999px; text-decoration: none }
      .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px }
      .float { background: #fff; padding: 24px; border-radius: 16px; box-shadow: 0 30px 60px rgba(0,0,0,.18) }
      .glow { display: inline-block; padding: 8px 16px; border-radius: 999px; background: #2b2118; color: #fff; box-shadow: 0 0 28px rgba(180,83,42,.7); margin-right: 16px }
      .note { background: #fff; border-left: 6px solid #b4532a; border-radius: 8px; padding: 20px; margin: 16px 0 }
      .panel { background: #fff; border: 1px solid #d9cfc0; border-radius: 16px; padding: 24px }
      .panel .card { background: #f4efe6; border: 1px solid #d9cfc0; border-radius: 12px; padding: 20px; min-height: 100px }
    </style><main>
    <section><p class="label">Since 1956</p><h1>Bread at seven</h1><p>${text}</p><a class="cta" href="#visit">Find us</a></section>
    <section><p class="label">The oven</p><h2>Stone and fire</h2><div class="row"><div class="float">Rye</div><div class="float">Spelt</div><div class="float">Pretzels</div></div></section>
    <section><p class="label">The people</p><h2>Two bakers</h2><span class="glow">Rye</span><span class="glow">Spelt</span><span class="glow">Pretzels</span>
      <div class="note">Closed on Mondays, and in August for two weeks.</div><div class="note">Orders for Saturday until Thursday noon.</div></section>
    <section id="visit"><p class="label">Visit</p><h2>Market Street 4</h2><div class="panel"><div class="row"><div class="card">Monday closed</div><div class="card">Tuesday to Friday 6 to 18</div><div class="card">Saturday 6 to 13</div></div></div></section>
    </main></html>`);
  // the same page without the habits: a date over a heading is a fact, a ruled quote is not a card
  writeFileSync(join(dir, 'good.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No tells</title>
    <style>
      body { margin: 0; font: 18px/1.5 Georgia, serif; background: #fff; color: #1f2a1f } main { max-width: 1100px; margin: 0 auto; padding: 0 24px }
      h1 { font-size: 88px; line-height: 1; margin: 0 0 24px } h2 { font-size: 40px; margin: 0 0 16px } section { padding: 48px 0 }
      .date { font: 600 13px/1.2 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .14em; margin: 0 0 8px }
      a.cta { display: inline-block; background: #2f5d3a; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none }
      .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px }
      .card { border: 1px solid #d5dccf; border-radius: 6px; padding: 24px; box-shadow: 0 1px 2px rgba(0,0,0,.06) }
      blockquote { border-left: 4px solid #2f5d3a; margin: 24px 0; padding: 0 20px }
    </style><main>
    <section><h1>Bread at seven</h1><p>${text}</p><a class="cta" href="#visit">Find us</a></section>
    <section><p class="date">12 March</p><h2>Stone and fire</h2><div class="row"><div class="card">Rye</div><div class="card">Spelt</div><div class="card">Pretzels</div></div></section>
    <section><h2>Two bakers</h2><blockquote>Closed on Mondays, and in August for two weeks.</blockquote><blockquote>Orders for Saturday until Thursday noon.</blockquote></section>
    <section id="visit"><h2>Market Street 4</h2><p>Monday closed. Tuesday to Friday 6 to 18. Saturday 6 to 13.</p></section>
    </main></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'bad,good', '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
  const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
  const rules = ['kicker', 'cream-accent', 'glow', 'heavy-shadow', 'side-stripe', 'nested-boxes', 'flat-type'];
  const on = (p) => found.filter((f) => rules.includes(f.rule) && f.at.startsWith(p + ' '));
  assert.deepEqual(on('bad').map((f) => f.rule).sort(), [...rules].sort(), r.stdout + r.stderr);
  assert.ok(on('bad').every((f) => f.level === 'warn'), 'taste hints are warnings');
  assert.deepEqual(on('good'), [], r.stdout);
  const bad = (rule) => on('bad').find((f) => f.rule === rule);
  assert.match(bad('kicker').text, /^3 headings have a small label in tracked capitals right above them \("The oven" over "Stone and fire"\)/);
  assert.match(bad('cream-accent').text, /^A cream ground \(#f4efe6\) with a terracotta accent \(#b4532a\)/);
  assert.match(bad('nested-boxes').where, /div\.panel/);
  assert.match(bad('flat-type').text, /24px over 18px body text/);
  rmSync(dir, { recursive: true, force: true });
});

test('look measures line length on the boxes that hold the lines, not on a list item laid out as a card', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-measure-'));
  const text = 'Rye with sourdough, spelt and pretzels from the stone oven in the lane, baked every morning from six. The dough rests overnight in the cold room, so the crumb is open and the crust is dark.';
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Measure</title>
    <body style="margin:0;font:18px/1.5 Georgia,serif;background:#fff;color:#222"><main style="padding:40px"><h1>Breads</h1>
    <ul style="list-style:none;padding:0"><li id="card" style="display:grid;grid-template-columns:1fr 1fr;gap:40px"><div><h3>Rye</h3><p style="max-width:34em">${text}</p></div><p style="max-width:34em">${text}</p></li></ul>
    <p id="wide">${text} ${text}</p></main></body></html>`);
  const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
  const measure = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => f.rule === 'measure');
  assert.deepEqual(measure.map((f) => f.where.split(' ')[0]), ['p#wide'], r.stdout + r.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('audit wants hreflang links in pairs, pointing at pages that exist', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-hreflang-'));
  const dist = join(dir, 'dist');
  mkdirSync(join(dist, 'de'), { recursive: true });
  const page = (lang, links) => `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Kleiner Kaffee</title>${links.map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="{{URL}}${h}">`).join('')}<body><main><h1>Kleiner Kaffee</h1></main></body></html>`;
  writeFileSync(join(dist, 'index.html'), page('en', [['en', ''], ['de', 'de/'], ['fr', 'fr/']]));
  writeFileSync(join(dist, 'de', 'index.html'), page('de', [['de', 'de/']]));
  const out = node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']).stdout;
  assert.match(out, /\[hreflang\] \/de\/ \(de\) doesn't name \/ back/);
  assert.match(out, /\[hreflang\] Names \/fr\/ as its fr version, but the site has no such page/);
  writeFileSync(join(dist, 'de', 'index.html'), page('de', [['de', 'de/'], ['en', '']]));
  writeFileSync(join(dist, 'index.html'), page('en', [['en', ''], ['de', 'de/']]));
  assert.doesNotMatch(node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']).stdout, /hreflang/);
  rmSync(dir, { recursive: true, force: true });
});

test('audit reads a split-text heading once, as a screen reader does', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-split-'));
  const dist = join(dir, 'dist');
  mkdirSync(dist);
  // what effects.js leaves behind: a copy for screen readers, and the animated words hidden from them
  writeFileSync(join(dist, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Moth Orchestra</title>
    <style>.fx-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }</style>
    <body><main><h1 data-split><span class="fx-sr">Moth Orchestra</span><span aria-hidden="true"><span>Moth</span> <span>Orchestra</span></span></h1>
    <h2>Winter Tour Dates Announced Today</h2></main></body></html>`);
  const r = node([join(SCRIPTS, 'audit.mjs'), dist, '--draft']);
  assert.match(r.stdout, /\[title-case\].*Winter Tour Dates/);
  assert.doesNotMatch(r.stdout, /Moth Orchestra Moth Orchestra/);
  rmSync(dir, { recursive: true, force: true });
});

// From a server, a page that isn't there comes back as the 404 page: it must not become the link preview.
test('images og from a URL: a page answered 404 writes nothing, a real one is photographed', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-og-url-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Home</title><h1>Home</h1>');
  writeFileSync(join(dir, 'dist/404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><h1>Not found</h1>');
  const { serve } = await import('../skills/one-shot-site/scripts/lib/serve.mjs');
  const s = await serve(join(dir, 'dist'));
  const og = (page) => new Promise((ok) => {
    const p = spawn(process.execPath, [join(SCRIPTS, 'images.mjs'), 'og', s.url, '--page', page, '--wait', '0', '--out', join(dir, 'og.jpg')], { cwd: dir });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (status) => ok({ status, out }));
  });
  try {
    const missing = await og('nope');
    assert.equal(missing.status, 2, missing.out);
    assert.match(missing.out, /No page at \/nope\.html/);
    assert.ok(!existsSync(join(dir, 'og.jpg')), 'nothing written');
    const home = await og('/');
    assert.equal(home.status, 0, home.out);
    assert.ok(existsSync(join(dir, 'og.jpg')));
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

// an address that doesn't resolve and a link nothing answers: said in the person's words, not Chrome's or Node's
test('no connection is said in plain words: look on an unknown host, audit --external on a dead link', { skip, timeout: 240000 }, async (t) => {
  // a resolver that answers unknown names (some providers do) loads a page there; offline, Chrome says DISCONNECTED
  try { await (await import('node:dns/promises')).lookup('no-such-host.invalid'); return t.skip('this resolver answers unknown names'); } catch {}
  const r = node([join(SCRIPTS, 'look.mjs'), 'http://no-such-host.invalid/', '--widths', '390', '--frames', '1', '--out', join(tmpdir(), 'oss-look-nohost')]);
  rmSync(join(tmpdir(), 'oss-look-nohost'), { recursive: true, force: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /Could not open http:\/\/no-such-host\.invalid\/: net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED) \(no internet connection, or a typo in the address\?\)/);

  const free = createServer();
  await new Promise((ok) => free.listen(0, '127.0.0.1', ok));
  const port = free.address().port;
  await new Promise((ok) => free.close(ok));
  const dir = mkdtempSync(join(tmpdir(), 'oss-external-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Links</title><main><h1>Links</h1><a href="http://127.0.0.1:${port}/gone">Gone</a></main></html>`);
  const audit = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft', '--external', '--out', join(dir, 'audit.md')]);
  assert.match(audit.stdout, new RegExp(String.raw`127\.0\.0\.1:${port}/gone did not answer \(no connection: offline, or the address is wrong\)`), audit.stdout + audit.stderr);
  rmSync(dir, { recursive: true, force: true });
});

// A server that takes the connection and never answers held a run for 120 s and then blamed the browser; a page
// still loading when the wait runs out was checked half-loaded without a word; a font that never arrives held it too.
test('a server that never answers fails in 30 s; a page still loading and a stuck font are said, not waited for', { skip, timeout: 240000 }, async () => {
  const server = createServer((req, res) => {
    if (req.url === '/hang' || req.url.startsWith('/never')) return; // takes the request, never answers
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/font'
      ? '<!doctype html><title>t</title><style>@font-face { font-family: Stuck; src: url(/never.woff2); } body { font-family: Stuck }</style><p>Hello</p>'
      : '<!doctype html><title>t</title><img src="/never.png" alt="">');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  try {
    let page = await b.newPage();
    await assert.rejects(page.goto(base + 'hang', { navigate: 2000 }), /Could not open .+\/hang: no answer within 2 s/);
    page = await b.newPage();
    await page.goto(base + 'slow', { timeout: 2000 });
    assert.ok(page.problems.some((p) => /\/slow was still loading after 2 s; the checks ran on what had arrived/.test(p.text)), JSON.stringify(page.problems));
    page = await b.newPage();
    const t0 = Date.now();
    await page.goto(base + 'font', { timeout: 1000 });
    assert.ok(Date.now() - t0 < 15000, `a stuck font held goto for ${Date.now() - t0} ms`);
  } finally { await b.close(); server.closeAllConnections(); server.close(); }
  // and a script run says it in about 30 s, in those words
  const hang = createServer(() => {});
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  const t0 = Date.now();
  const r = await new Promise((ok) => {
    const p = spawn(process.execPath, [join(SCRIPTS, 'look.mjs'), `http://127.0.0.1:${hang.address().port}/`, '--widths', '390', '--frames', '1', '--out', join(tmpdir(), 'oss-look-hang')]);
    let out = '';
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (status) => ok({ status, out }));
  });
  hang.closeAllConnections(); hang.close();
  rmSync(join(tmpdir(), 'oss-look-hang'), { recursive: true, force: true });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /Could not open http:\/\/127\.0\.0\.1:\d+\/: no answer within 30 s/);
  assert.ok(Date.now() - t0 < 60000, `took ${Date.now() - t0} ms`);
});

// a reduced-motion look has its own folder, as film's does, so the numbered sheets of a plain run stay
test('look --reduced writes to .one-shot/look-reduced', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-look-reduced-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Calm</title><link rel="icon" href="data:,"><h1>Calm</h1>');
  const r = node([join(SCRIPTS, 'look.mjs'), 'dist', '--reduced', '--widths', '390', '--frames', '1'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(dir, '.one-shot/look-reduced/sheet-home-390.jpg')));
  assert.ok(!existsSync(join(dir, '.one-shot/look')), 'the plain run\'s folder is left alone');
  rmSync(dir, { recursive: true, force: true });
});

// An unregistered scheme stands in for mailto: Chrome says in the console when it hands an address to the system
// ("Failed to launch … no registered handler"), and with none registered nothing starts either way.
test('app links never leave the browser: script, refresh, link, form, popup and a server redirect', { skip, timeout: 240000 }, async () => {
  const { launch, sleep } = await import('../skills/one-shot-site/scripts/lib/chrome.mjs');
  const S = 'oss-none-test';
  const body = {
    script: `<script>setTimeout(() => location.href = '${S}:a', 50)</script>`,
    meta: `<meta http-equiv="refresh" content="0;url=${S}:b">`,
    link: `<a href="${S}:c" style="display:block;height:60px">link</a>`,
    form: `<form action="${S}:d"><button style="width:100%;height:60px">Send</button></form>`,
    popup: `<a target="_blank" href="${S}:e" style="display:block;height:60px">link</a>`,
    open: `<button style="width:100%;height:60px" onclick="window.open('${S}:f')">open</button>`,
    frame: `<iframe src="/go"></iframe>`,
  };
  const server = createServer((req, res) => {
    if (req.url === '/go') { res.writeHead(302, { location: `${S}:g` }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>t</title><body style="margin:0">${body[req.url.slice(1)] || ''}</body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  try {
    for (const name of Object.keys(body)) {
      const page = await b.newPage({ width: 800, height: 600 });
      const said = [];
      page.on('Log.entryAdded', (p) => said.push(p.entry.text));
      page.on('Runtime.consoleAPICalled', (p) => said.push(p.args.map((x) => x.value).join(' ')));
      await page.goto(base + name);
      await sleep(300);
      if (!['script', 'meta', 'frame'].includes(name)) {
        for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 40, y: 20, button: 'left', clickCount: 1 });
      }
      await sleep(1200);
      assert.ok(!said.some((t) => /launch/i.test(t)), `${name}: ${said.join(' | ')}`);
      if (name !== 'frame') assert.ok(said.some((t) => t.startsWith('one-shot: not opened')), `${name}: ${said.join(' | ')}`);
      assert.deepEqual(page.problems, [], name);
      await page.close();
    }
    const page = await b.newPage();
    await assert.rejects(page.goto(base + 'go'), /Not opened: .*\/go forwards to oss-none-test:g, which would start another program/);
    await assert.rejects(page.goto('mailto:x@y.example'), /Not opened: mailto:x@y\.example would start another program/);
  } finally { await b.close(); server.close(); }
});

// facts.md: a fact that comes later passes --draft and stops the real audit. The band's draft audit stopped on the
// missing legal name instead, so a builder took the pages out to pass.
test('audit: {{OWNER_NAME}} is waiting on them in a draft, and a stop in the final audit, with what goes there', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-owner-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="de"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Impressum</title>
      <body><main><h1>Impressum</h1><p>Angaben gemäß § 5 DDG: {{OWNER_NAME}}</p></main></body></html>`);
    const hint = "the owner's full name for the Impressum and privacy page \\(owner\\.name\\), required by law\\. Ask for it; both pages stay, with this mark, until it's in site\\.json";
    const draft = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft', '--out', join(dir, 'draft.md')]);
    const d = JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8'));
    assert.deepEqual(d.findings.filter((f) => f.rule === 'placeholder'), [], draft.stdout + draft.stderr);
    assert.ok(d.notes.some((n) => new RegExp(`^Waiting on you: \\{\\{OWNER_NAME\\}\\} on /, ${hint}\\. A draft lets it through; the final audit stops on it\\.$`).test(n)), d.notes.join('\n'));
    const final = node([join(SCRIPTS, 'audit.mjs'), dir, '--out', join(dir, 'final.md')]);
    assert.match(final.stdout, new RegExp(`\\[placeholder\\] Placeholder text in the page: \\{\\{OWNER_NAME\\}\\} \\(${hint}\\)`), final.stdout + final.stderr);
    assert.equal(JSON.parse(readFileSync(join(dir, 'final.json'), 'utf8')).verdict, 'Not ready to ship.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The card is positioned against main, so the clipping parent doesn't hold it in, and the filter that skips clipped
// boxes found nothing: "Widest: unknown".
test('look names a tilted card that sticks out past a parent with overflow on one axis', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-tilt-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>A tilted card that sticks out</title>
      <body style="margin:0;font:18px/1.5 sans-serif;background:#fff;color:#222"><main style="position:relative">
        <div style="overflow-y:hidden;height:300px"><div class="card" style="position:absolute;left:40px;width:360px;height:200px;background:#eee;transform:rotate(-8deg)">Card</div></div>
      </main></body></html>`);
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '390', '--frames', '1', '--out', join(dir, 'out')]);
    const f = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.find((x) => x.rule === 'overflow-x');
    assert.ok(f, r.stdout + r.stderr);
    assert.match(f.text, /Widest: div\.card "Card" at 4\d\dpx/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('audit title-case passes days, months and names the page writes mid-sentence, and still finds Title Case', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-title-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Evening classes in Leeds</title>
      <body><main><h1>Evening classes</h1>
        <h2>Free on Universal Credit</h2><p>If you are on Universal Credit, every course here costs nothing at all.</p>
        <h2>Open Wednesday and Saturday</h2><p>We teach from six until nine in the evening.</p>
        <h2>Our Story And Our Mission</h2><p>We started with one room and a kettle.</p>
      </main></body></html>`);
    const r = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft']);
    const line = r.stdout.split('\n').find((l) => l.includes('[title-case]')) || '';
    assert.match(line, /Our Story And Our Mission/, r.stdout + r.stderr);
    assert.doesNotMatch(line, /Universal Credit|Wednesday/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('audit title-case leaves book and work titles in <cite> and <i> their capitals', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-cite-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>The book club at the corner shop</title>
      <body><main><h1>Book club</h1>
        <h2>Reading <cite>Wolf Hall</cite> Together</h2><p>We meet on the first Thursday of the month.</p>
        <h2>Then <i>Bring Up The Bodies</i> In Spring</h2><p>The second book follows in the new year.</p>
        <h2>Snacks And Drinks Provided Free</h2><p>There is always tea.</p>
      </main></body></html>`);
    const r = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft']);
    const line = r.stdout.split('\n').find((l) => l.includes('[title-case]')) || '';
    assert.match(line, /Snacks And Drinks Provided Free/, r.stdout + r.stderr);
    assert.doesNotMatch(line, /Wolf Hall|Bodies/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// "Open now · until 17:30" is true for a minute; a link preview lasts
test('images og puts the plain hours back before the picture', { skip, timeout: 240000 }, async () => {
  const { launch } = await import('../skills/one-shot-site/scripts/lib/chrome.mjs');
  const { forPicture } = await import('../skills/one-shot-site/scripts/lib/probes.mjs');
  const b = await launch();
  try {
    const p = await b.newPage({ width: 1200, height: 630 });
    await p.goto(`data:text/html,${encodeURIComponent('<meta charset="utf-8"><a class="skip" href="#m">Skip</a><p class="open-now" data-hours="Tue–Sat 07:00–17:30" data-state="open">Open now · until 17:30</p>')}`);
    await p.call(forPicture);
    assert.deepEqual(await p.eval(`(() => { const e = document.querySelector('.open-now'); return [e.textContent, 'state' in e.dataset, getComputedStyle(document.querySelector('.skip')).visibility]; })()`),
      ['Tue–Sat 07:00–17:30', false, 'hidden']);
  } finally { await b.close(); }
});

test('audit: a section after </main> is named; header, footer and aside parts are not', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-outside-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Bakery on the corner of Mill Lane</title>
      <body><header><section><h2>Opening hours</h2></section></header><main><h1>Bakery</h1><section><h2>Bread</h2><p>Every morning.</p></section></main>
      <section class="cakes"><h2>Cakes to order</h2><p>Three days ahead.</p></section><h2>Find us</h2>
      <aside><section><h2>Also nearby</h2></section></aside><footer><section><h2>Contact</h2></section></footer></body></html>`);
    const r = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft']);
    const line = r.stdout.split('\n').find((l) => l.includes('[outside-main]')) || '';
    assert.match(line, /section "Cakes to order", h2 "Find us" are outside <main>, so skip links and screen readers miss them/, r.stdout + r.stderr);
    assert.doesNotMatch(line, /Opening hours|Bread|Also nearby|Contact/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The stack named a font that never loads ("Caprasimo Variable" with only the static package installed): the
// browser passed over it to the 400-only face and faked the 700, and the check stopped at the first name.
test('look finds a faked bold behind a font name that never loads', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-faux-'));
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Faux bold</title>
      <style>@font-face { font-family: Solo; src: local("Arial"), local("Liberation Sans"), local("DejaVu Sans"); font-weight: 400; }
        body { margin: 0; font: 18px/1.5 sans-serif; background: #fff; color: #222 } h2 { font-family: "Solo Variable", Solo, serif; font-weight: 700; padding: 0 16px }</style>
      <body><main><h1 style="padding:0 16px">A page</h1><h2>Drawn at seven hundred</h2></main></body></html>`);
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
    const f = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.find((x) => x.rule === 'fake-bold');
    assert.ok(f, r.stdout + r.stderr);
    assert.match(f.text, /^Solo is drawn at 700 but the font has only 400, so the browser fakes the weight; import that weight or set the headings to 400/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('study never offers the browser\'s default link blue as the brand', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-study-blue-'));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plain</title>
    <body style="margin:0;background:#fff;color:#111;font:18px/1.6 Georgia,serif"><main><h1>An old plain page</h1><p>With <a href="/a">links</a> and <a href="/b">more links</a> in the default colours.</p></main></body></html>`;
  const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await new Promise((ok) => {
      const p = spawn(process.execPath, [join(SCRIPTS, 'study.mjs'), `http://127.0.0.1:${server.address().port}/`, '--out', join(dir, 'study')]);
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (status) => ok({ status, out }));
    });
    assert.equal(r.status, 0, r.out);
    const md = readFileSync(join(dir, 'study/study.md'), 'utf8');
    assert.match(md, /#0000ee \(the browser's default link colour\)/);
    assert.doesNotMatch(md, /--brand "#0000ee"/);
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('audit names only the allowed rules that matched', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-allow-'));
  try {
    mkdirSync(join(dir, '.one-shot'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, '.one-shot/allow.json'), JSON.stringify(['made-up-address', 'theme-color', 'hreflang']));
    writeFileSync(join(dir, 'dist/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#ffffff"><title>A demo site for a made-up bakery</title>
      <body style="background:#ffffff"><main><h1>Demo</h1><p>Write to <a href="mailto:hi@bakery.example">hi@bakery.example</a>.</p></main></body></html>`);
    const r = node([join(SCRIPTS, 'audit.mjs'), join(dir, 'dist'), '--draft']); // allow.json is read from the folder above dist
    assert.match(r.stdout, /\d+ finding\(s\) allowed on purpose by \.one-shot\/allow\.json \(made-up-address\)\./, r.stdout + r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A band site: "SOLD OUT" crammed into the next date, "Kaiserslautern" wider than its chip. Text into text
// is collide, text out of its box (or cut off by it) is spill; layering on purpose is neither.
test('look: text that runs into other text or out of its chip is named; decoration, an ellipsis and a clean page are not', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-clash-'));
  try {
    const page = (title, faults) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <style>body{margin:0;font:18px/1.5 sans-serif;background:#fff;color:#111} main{padding:24px 16px}
        .chip{display:inline-block;padding:4px 10px;border-radius:999px;background:#ffe2c4;white-space:nowrap}
        .card{width:220px;padding:8px;background:#eee;margin:16px 0;font:20px/30px sans-serif}
        .short{display:inline-block;width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top;border:1px solid #888;padding:4px 8px}</style>
      <body><main>
        <div style="position:relative"><p aria-hidden="true" style="position:absolute;left:0;top:0;margin:0;font:900 110px/1 sans-serif;color:#ddd">TOUR</p>
          <h1 style="position:relative;margin:0;padding-top:30px">Five nights</h1></div>
        <p class="when"><span>Sat 20.03</span><span style="margin-left:${faults ? -28 : 8}px">Sold out</span></p>
        <!-- two columns too narrow for lines that may not wrap: the first runs on under the second -->
        <div style="display:flex;max-width:320px;white-space:${faults ? 'nowrap' : 'normal'}"><span style="flex:1 1 0;min-width:0">Saturday, 20 March 2027</span><span style="flex:1 1 0;min-width:0">Weberei Nord</span></div>
        <p><span class="chip" style="${faults ? 'width:70px' : ''}">Kaiserslautern</span></p>
        <p><span class="short">Weberei Nord, Kaiserslautern</span></p>
        <!-- the box cuts the second line through its letters -->
        <div class="card" style="${faults ? 'height:36px;overflow:hidden' : ''}">Doors at eight<br>Support from Salt Flats<br>Last train at one</div>
        <p style="position:relative">Tickets at the door<span style="position:absolute;left:0;top:0;opacity:0">A hint that waits for a hover</span></p>
        <svg width="200" height="40" style="display:block"><text x="0" y="20">Map</text><text x="8" y="22">Label</text></svg>
        <!-- closed questions: the browser still lays each folded answer out, over the next question, where nobody sees it -->
        <details><summary>Is there a cloakroom?</summary><p style="margin:0">Yes, by the door, until one.</p></details>
        <details><summary>Can I bring a pram?</summary><p style="margin:0">There is a lift at the side.</p></details>
        <details><summary>Is it all ages?</summary><p style="margin:0">Under sixteens with an adult.</p></details>
      </main></body></html>`;
    writeFileSync(join(dir, 'clash.html'), page('Clash', true));
    writeFileSync(join(dir, 'clean.html'), page('Clean', false));
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'clash,clean', '--widths', '390,1440', '--frames', '1', '--out', join(dir, 'out')]);
    const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => /^(collide|spill)$/.test(f.rule));
    const on = (p) => found.filter((f) => f.at.startsWith(p + ' '));
    assert.deepEqual(on('clean'), [], 'the same page without the faults: decoration, an ellipsis, faded and SVG text and folded answers are fine\n' + r.stdout);
    const clash = on('clash');
    const collide = clash.filter((f) => f.rule === 'collide');
    assert.equal(collide.length, 2, r.stdout);
    assert.ok(collide.every((f) => f.level === 'fail'));
    const sold = collide.find((f) => /Sold out/.test(f.where));
    assert.match(sold.text, /^At 390px on screen 1 "Sat 20\.03" collides with "Sold out": their letters overlap \(\d+×\d+px\)\. Give each its own room/);
    assert.match(sold.at, /clash 390px, screen 1, 1440px, screen 1/, 'at every width');
    assert.ok(collide.some((f) => /"Saturday, 20 March 2027" collides with "Weberei Nord"/.test(f.text)), 'text running on under the next column');
    const spill = clash.filter((f) => f.rule === 'spill');
    assert.equal(spill.length, 2, r.stdout);
    assert.match(spill.find((f) => /Kaiserslautern/.test(f.where)).text, /^At 390px on screen 1 "Kaiserslautern" runs \d+px out of its box \(span\.chip\) on the right\. Give the box room for its longest word/);
    assert.match(spill.find((f) => /div\.card/.test(f.where)).text, /"Support from Salt Flats" is cut off by its box \(div\.card\): \d+px of its letters are hidden on the bottom\. Let the box grow with its text \(no fixed height\)/);
    assert.ok(!found.some((f) => /TOUR|span\.short|hover|Map|Label|by the door|lift at the side|Under sixteens/.test(f.where)), 'aria-hidden decoration, an ellipsis, faded text, SVG text and the answers in closed <details> are left out');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Fahrrad Hollerbach: fine at 390 and 1440, but at a laptop width the price tag hung beside the headline dropped onto
// the button. audit resizes the desktop page through the widths between and tells each fault once, at the narrowest.
test('audit: a layout that breaks only between 1000 and 1300px fails, at the narrowest width; one clean at every width passes', { skip, timeout: 240000 }, () => {
  const dirs = [];
  try {
    const site = (faults) => {
      const dir = mkdtempSync(join(tmpdir(), 'oss-sweep-'));
      dirs.push(dir);
      const head = (title) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex"><title>${title}</title><link rel="icon" href="data:,">`;
      writeFileSync(join(dir, 'index.html'), `${head('Hollow Lane bike workshop')}
        <style>body{margin:0;font:18px/1.5 sans-serif;background:#fff;color:#222} main{padding:32px 24px}
          .hero{position:relative} h1{margin:0 0 16px;font-size:40px;line-height:1.1} .lead{max-width:34ch;margin:0}
          .actions{position:relative;margin:24px 0 0} .button{display:inline-block;padding:14px 22px;background:#1d4d2b;color:#fff;text-decoration:none}
          .tag{display:inline-block;margin:12px 0 0 16px;padding:10px 16px;background:#ffcc00;color:#111;font-weight:700}
          .stamp{margin:16px 0 0;font-weight:700;color:#7a3419}
          ${faults ? '@media (min-width: 1001px) and (max-width: 1299px) { .tag{position:absolute;left:8px;top:4px;margin:0} .stamp{position:absolute;left:60px;top:64px;margin:0} }' : ''}</style>
        <body><main><section class="hero">
          <h1>Bikes mended while you wait</h1>
          <p class="lead">Bring your bike in on any weekday morning: most repairs are done the same day.</p>
          <p class="actions"><a class="button" href="#visit">Find the workshop</a><span class="tag">Repairs from 12 euros</span></p>
          <p class="stamp">Mending bikes since 1958</p>
        </section><section id="visit"><h2>Visit us</h2><p>Hollow Lane 4, open Monday to Friday from eight in the morning to six.</p></section></main></body></html>`);
      writeFileSync(join(dir, '404.html'), `${head('This page is not here')}<body><main><h1>Not found</h1><p><a href="/">Back to the workshop</a></p></main></body></html>`);
      const r = node([join(SCRIPTS, 'audit.mjs'), dir, '--draft', '--out', join(dir, 'audit.md')]);
      return { r, out: r.stdout + r.stderr, ...JSON.parse(readFileSync(join(dir, 'audit.json'), 'utf8')) };
    };
    const SWEPT = /^(overflow-x|headline-overflow|collide|spill|on-picture|covered)$/;
    const clean = site(false);
    assert.equal(clean.r.status, 0, clean.out);
    assert.equal(clean.verdict, 'Ready to ship.');
    assert.deepEqual(clean.findings.filter((f) => SWEPT.test(f.rule)), [], clean.out);
    assert.ok(clean.notes.some((n) => /^Layout between the phone and desktop widths: 8 widths from 900 to 1400px on 1 page \(\d+\.\d s\)\.$/.test(n)), clean.out);

    const broken = site(true);
    assert.equal(broken.r.status, 1, broken.out);
    assert.equal(broken.verdict, 'Not ready to ship.');
    const found = broken.findings.filter((f) => SWEPT.test(f.rule));
    // each once, at 1024px: the first width past 1000 the sweep looks at; never at 390 or 1440
    assert.deepEqual(found.map((f) => [f.rule, f.level, f.at]).sort(), [['collide', 'fail', '/ 1024px'], ['covered', 'warn', '/ 1024px']], broken.out);
    assert.match(found.find((f) => f.rule === 'collide').text, /^At 1024px on screen 1 "Bring your bike in on any wee…" collides with "Mending bikes since 1958": their letters overlap/);
    assert.equal(found.find((f) => f.rule === 'covered').text.split(':')[0], 'At 1024px on screen 1 span.tag "Repairs from 12 euros" is drawn over a.button "Find the workshop"');
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
});

// An app site: on a phone the Day/Night switch, laid over the hero's field, sat squeezed beside the phone
// drawn in HTML, and it read as overlapping. A button half on a photo is the plain case.
test('look: on a phone, a control partly on a picture, or squeezed beside it over its frame, is named; placed ones are not', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-pic-'));
  try {
    const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#688"/></svg>');
    const page = (title, faults) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <style>body{margin:0;font:18px/1.5 sans-serif;background:#f3f4ee;color:#111} main{padding:16px}
        .field{position:relative;background:#2f6f5e;padding:24px 16px}
        .phone{margin:0;display:grid;justify-items:center} .body{width:170px;height:300px;background:#200;border-radius:24px}
        .switch{display:inline-flex;flex-direction:column;width:64px;border:1px solid #fff;border-radius:8px;overflow:hidden;${faults ? 'position:absolute;right:16px;bottom:24px' : 'margin-top:12px'}}
        .switch button{min-height:44px;background:none;border:0;color:#fff;padding:0 4px;font:14px sans-serif}</style>
      <body><main>
        <div class="field"><figure class="phone"><div class="body"></div>
          <figcaption><span class="switch" role="group" aria-label="Screen"><button>Day</button><button>Night</button></span></figcaption></figure></div>
        <div style="position:relative;max-width:300px;margin:24px 0 48px"><img src="${photo}" alt="The hall" width="400" height="300" style="display:block;width:100%;height:auto">
          <button style="position:absolute;padding:12px 18px;${faults ? 'right:-30px;bottom:-22px' : 'left:50%;top:50%;transform:translate(-50%,-50%)'}">Play</button></div>
      </main></body></html>`;
    writeFileSync(join(dir, 'squeezed.html'), page('Squeezed', true));
    writeFileSync(join(dir, 'placed.html'), page('Placed', false));
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'squeezed,placed', '--widths', '390,1440', '--frames', '2', '--out', join(dir, 'out')]);
    const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings.filter((f) => f.rule === 'on-picture');
    assert.deepEqual(found.filter((f) => f.at.startsWith('placed ')), [], 'the switch in its own row, the play button wholly on its picture\n' + r.stdout);
    assert.ok(found.every((f) => !/1440px/.test(f.at)), 'a phone check');
    const squeezed = found.find((f) => /span\.switch/.test(f.where));
    assert.equal(squeezed?.level, 'warn', r.stdout);
    assert.match(squeezed.text, /^At 390px on screen 1 the control "Day Night" \(span\.switch\) is laid over the picture's frame and squeezed in \d+px from the picture div\.body/);
    const half = found.find((f) => /Play/.test(f.where));
    assert.equal(half?.level, 'fail', r.stdout);
    assert.match(half.text, /the control "Play" \(button\) sits partly on the picture img: \d+% of it on, the rest off its edge\. On a phone give it its own place/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// layout.md, "The action stays in reach": a café's phone link on every screen, as a bar fixed to the bottom of a
// phone and a sticky header on a desktop. The bar's own words are never covered; at the end of the page the footer
// must clear it.
test('look: the action stays in reach on every screen; a bar fixed to the bottom is on top, and the footer clears it', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-reach-'));
  try {
    const story = (n) => `<section style="padding:60px 24px;min-height:700px"><h2>Part ${n} of the day</h2><p>The roaster runs from seven, the cups go out from eight, and the last beans are weighed at five. Part ${n}.</p></section>`;
    const page = (title, css, extra, footer) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"CafeOrCoffeeShop","name":"${title}"}</script>
      <style>body{margin:0;font:18px/1.5 sans-serif;background:#fff;color:#222} header{display:flex;justify-content:space-between;padding:12px 24px;background:#fff}
        .button{display:inline-block;padding:12px 20px;background:#7a3419;color:#fff;text-decoration:none} ${css}</style>
      <body><header><b>${title}</b><a class="button head" href="tel:+49 30 123 45 67">Call us</a></header>
      <main><section style="padding:80px 24px;min-height:500px"><h1>${title} on the lane</h1><a class="button" href="tel:+49301234567">Call 030 123 45 67</a></section>
      ${[1, 2, 3].map(story).join('')}</main>${extra}<footer style="${footer}"><p>${title}, Market Street 4, open Tuesday to Saturday.</p></footer></body></html>`;
    // no way back to the action once the first screen is gone
    writeFileSync(join(dir, 'gone.html'), page('Gone Coffee', '', '', 'padding:24px'));
    // the recipe: the header sticks on a desktop, a bar holds the action on a phone, the footer clears the bar
    const bar = '<nav class="bar" aria-label="Call"><a class="button" href="tel:+49301234567">Call Kept Coffee</a></nav>';
    const recipe = `header{position:sticky;top:0} .bar{position:fixed;inset:auto 0 0;padding:10px 16px;background:#fff;box-shadow:0 -1px 0 #ddd}
      .bar .button{display:block;text-align:center} @media (max-width:719px){.head{display:none}} @media (min-width:720px){.bar{display:none}}`;
    writeFileSync(join(dir, 'kept.html'), page('Kept Coffee', recipe, bar, 'padding:24px 24px 6rem'));
    // the same, and the footer forgot the bar's height
    writeFileSync(join(dir, 'under.html'), page('Under Coffee', recipe, bar.replace('Kept', 'Under'), 'padding:24px'));
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'gone,kept,under', '--widths', '390,1440', '--out', join(dir, 'out')]);
    const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
    const on = (p, rule) => found.filter((f) => f.rule === rule && f.at.split(', ').some((a) => a.startsWith(p + ' ')));
    const reach = on('gone', 'action-out-of-reach');
    assert.deepEqual(reach.map((f) => f.at).sort(), ['gone 1440px', 'gone 390px'], r.stdout + r.stderr);
    assert.ok(reach.every((f) => f.level === 'fail'));
    assert.match(reach.find((f) => f.at === 'gone 390px').text, /^At 390px the action \("Call 030 123 45 67", tel:\+49301234567\) is out of reach on screens 2, 3, 4 of \d+/);
    assert.deepEqual([...on('kept', 'action-out-of-reach'), ...on('under', 'action-out-of-reach')], [], 'the bar and the sticky header keep it in reach');
    assert.deepEqual(found.filter((f) => f.rule === 'covered' && /Kept|Under|Market Street/.test(f.where + f.text)), [], 'text in the bar, or scrolling under it, is not covered');
    assert.deepEqual(on('kept', 'under-bar'), [], 'the footer clears the bar');
    const under = on('under', 'under-bar');
    assert.equal(under.length, 1, JSON.stringify(found.filter((f) => /bar|covered/.test(f.rule))));
    assert.match(under[0].where, /Under Coffee, Market Street 4/);
    assert.match(under[0].text, /Give the page room at its end as tall as the bar: body padding-bottom/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// checks.md, "Full and doing": what reads as thin, sparse, tiny and repetitive, measured on a desktop screen
test('look: thin parts, mostly empty screens, small text and a line said twice are named on a desktop; a full page has none', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-full-'));
  try {
    const loaf = (h) => `<svg viewBox="0 0 4 3" width="100%" height="${h}" role="img" aria-label="A rye loaf"><rect width="4" height="3" fill="#b5651d"/></svg>`;
    const text = 'Rye with sourdough, spelt and pretzels from the stone oven in the lane, baked every morning from six. The dough rests overnight in the cold room, so the crumb is open and the crust is dark. We sell until it is gone, which on a Saturday is about eleven.';
    const visit = 'The shop is on Market Street, a short walk from the station and the river. Knock twice if the door sticks in the rain. There is a bench outside for those who cannot wait to taste the first slice.';
    const more = 'Spelt takes longer to rise and gives a nutty, softer loaf that keeps for days. We grind it ourselves once a week, slowly, so the flour stays cool and the taste stays in the grain.';
    writeFileSync(join(dir, 'sparse.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sparse</title>
      <body style="margin:0;font:16px/1.5 sans-serif;background:#fff;color:#222"><main>
      <section style="min-height:900px;padding:80px 120px"><h1 style="font-size:96px;line-height:1.1;margin:0 0 24px">Sparse Bakery</h1><p>${text}</p><p>Come early on Saturday, the rye sells out quickly.</p></section>
      <section id="rest" style="padding:60px 120px;min-height:200px"><h2>A small shop</h2><p>Four shelves, one counter, one oven.</p></section>
      <section id="thin" style="padding:80px 120px;min-height:900px"><h2>Our oven</h2><p>Stone, wood and patience since the old days.</p></section>
      <section style="padding:80px 120px;min-height:900px"><h2>Visit us</h2><p>${visit}</p><p style="font-size:13px">Prices change with the price of flour each spring.</p><p style="font-size:13px">Cards and cash are both welcome at the till.</p></section>
      </main><footer style="padding:24px 120px;font-size:13px"><p>Come early on Saturday, the rye sells out quickly.</p></footer></body></html>`);
    writeFileSync(join(dir, 'full.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Full</title>
      <body style="margin:0;font:19px/1.5 sans-serif;background:#fff;color:#222"><main style="max-width:1300px;margin:0 auto;padding:0 40px">
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;padding:40px 0"><div><h1 style="font-size:96px;line-height:1;margin:0 0 24px">Full Bakery</h1><p>${text}</p></div>${loaf(700)}</section>
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:60px 0"><div><h2 style="font-size:48px;margin:0">The breads</h2><ul><li>Rye, dark and sour</li><li>Spelt, light and nutty</li><li>Pretzels, salted by hand</li><li>Seeded rolls, every morning</li></ul></div>${loaf(600)}</section>
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:60px 0">${loaf(600)}<div><h2 style="font-size:48px;margin:0">How we bake</h2><p>${visit}</p><p>${more}</p></div></section>
      </main><footer style="padding:24px 40px;font-size:13px"><p>Full Bakery, Market Street 4. Prices include VAT, cards welcome.</p></footer></body></html>`);
    // the story as a prose column alone in its measure (layout.md, "column"): sparse by design, so only worth a look
    const said = (i, j) => `On day ${i * 4 + j + 1} the dough rested ${j + 2} hours longer than the batch before it, and the crust came out a shade darker than on day ${i * 4 + j}.`;
    writeFileSync(join(dir, 'column.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Column</title>
      <body style="margin:0;font:18px/1.6 sans-serif;background:#fff;color:#222"><main style="max-width:28rem;margin:0 auto;padding:80px 0">
      <h1 style="font-size:56px;line-height:1.1;margin:0 0 32px">The bakery's year</h1>
      ${Array.from({ length: 16 }, (_, i) => `<p style="margin:0 0 1.2em">${[0, 1, 2, 3].map((j) => said(i, j)).join(' ')}</p>`).join('')}
      </main></body></html>`);
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'sparse,full,column', '--widths', '1440', '--out', join(dir, 'out')]);
    const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
    const rules = ['thin-section', 'sparse-screen', 'small-text', 'repeated-line'];
    const on = (p) => found.filter((f) => rules.includes(f.rule) && f.at.startsWith(p + ' '));
    assert.deepEqual([...new Set(on('sparse').map((f) => f.rule))].sort(), [...rules].sort(), r.stdout + r.stderr);
    assert.deepEqual(on('full'), [], r.stdout);
    const bad = (rule) => on('sparse').filter((f) => f.rule === rule);
    assert.deepEqual(bad('thin-section').map((f) => f.where.split(' ')[0]), ['section#thin'], 'the hero and one short band are exempt');
    assert.equal(bad('sparse-screen')[0].level, 'fail', 'two screens under 15%');
    assert.match(bad('sparse-screen')[0].text, /^At 1440px \d of the page's \d screens are mostly empty \(screen \d: \d+% filled.*; under 15% reads as empty, under 30% as sparse\)/);
    assert.doesNotMatch(bad('sparse-screen')[0].text, /second column/, 'layout.md keeps prose in one column');
    const column = on('column').filter((f) => f.rule === 'sparse-screen');
    assert.equal(column.length, 1, r.stdout);
    assert.equal(column[0].level, 'warn', column[0].text);
    assert.match(column[0].text, /^At 1440px \d of the page's \d screens are sparse \(screen \d: (1[5-9]|2\d)% filled/);
    assert.equal(bad('small-text')[0].level, 'fail');
    assert.match(bad('small-text')[0].text, /^At 1440px \d paragraphs are set at 16px/);
    assert.match(bad('repeated-line')[0].text, /^"Come early on Saturday, the rye sells out quickly\." is on the page 2 times/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// cream and terracotta alone are a warm palette; the trio (with a serif headline and an italic word or a pill) is the
// tell. A Warm brief that came out cool is named.
test('look: cream-accent wants the whole trio; a Warm brief with a cool ground or a cool accent on white is cold-warm', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-warm-'));
  try {
    mkdirSync(join(dir, '.one-shot'));
    writeFileSync(join(dir, '.one-shot/brief.md'), '# Brief\n\n## The look\n\n- **Mood:** Warm. Crust and wood.\n');
    const page = (title, ground, accent, h1css, button) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
      <body style="margin:0;font:19px/1.5 system-ui,sans-serif;background:${ground};color:#2b2118"><main style="max-width:1100px;margin:0 auto;padding:40px">
      <h1 style="font-size:88px;line-height:1;color:${accent};${h1css}">${title} <em>today</em></h1><p>Rye with sourdough from the stone oven in the lane.</p>
      <a href="#visit" style="display:inline-block;padding:12px 20px;background:${accent};color:#fff;text-decoration:none;${button}">Find ${title}</a>
      <h2 id="visit" style="color:${accent}">Market Street 4</h2><p style="border-top:3px solid ${accent}">Open from six.</p></main></body></html>`;
    writeFileSync(join(dir, 'trio.html'), page('Trio', '#f4efe6', '#b4532a', 'font-family:Georgia,serif', 'border-radius:999px'));
    writeFileSync(join(dir, 'warm.html'), page('Warm', '#f4efe6', '#b4532a', 'font-family:system-ui,sans-serif', 'border-radius:4px').replace('<em>today</em>', 'today'));
    writeFileSync(join(dir, 'icy.html'), page('Icy', '#e4eef5', '#b4532a', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'blue.html'), page('Blue', '#ffffff', '#1f5fbf', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'sage.html'), page('Sage', '#e6ead9', '#b4532a', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'sand.html'), page('Sand', '#f3e6cf', '#b4532a', '', 'border-radius:4px'));
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'trio,warm,icy,blue,sage,sand', '--widths', '1440', '--frames', '1', '--out', join(dir, 'out')]);
    const found = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')).findings;
    const rules = (p) => found.filter((f) => ['cream-accent', 'cold-warm', 'tinted-ground'].includes(f.rule) && f.at.startsWith(p + ' ')).map((f) => f.rule);
    assert.deepEqual(rules('trio'), ['cream-accent'], r.stdout + r.stderr);
    assert.deepEqual(rules('warm'), [], 'cream and terracotta with a sans headline and square buttons is warm, not a tell');
    assert.deepEqual(rules('icy'), ['cold-warm'], r.stdout);
    assert.deepEqual(rules('blue'), ['cold-warm'], r.stdout);
    assert.match(found.find((f) => f.rule === 'cold-warm' && f.at.startsWith('icy')).text, /^The brief asks for Warm, but the ground \(#e4eef5\) is a cool colour/);
    assert.match(found.find((f) => f.rule === 'cold-warm' && f.at.startsWith('blue')).text, /the accent \(#1f5fbf, oklch hue \d+\) is cool on a colourless ground/);
    assert.deepEqual(rules('sage'), ['cold-warm'], 'a sage ground on a Warm brief reads cold');
    assert.match(found.find((f) => f.rule === 'cold-warm' && f.at.startsWith('sage')).text, /the ground \(#e6ead9\) is a green colour/);
    assert.deepEqual(rules('sand'), [], 'sand is a warm ground, not a tint');
    // a Quiet brief starts on warm white: a peach or mint ground is flagged, warm white and cream pass
    writeFileSync(join(dir, '.one-shot/brief.md'), '# Brief\n\n## The look\n\n- **Mood:** Quiet.\n');
    writeFileSync(join(dir, 'peach.html'), page('Peach', '#fbd9c4', '#2b2118', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'mint.html'), page('Mint', '#e6ead9', '#2b2118', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'white.html'), page('White', '#fcfaf7', '#2b2118', '', 'border-radius:4px'));
    writeFileSync(join(dir, 'cream.html'), page('Cream', '#f5ede0', '#2b2118', '', 'border-radius:4px'));
    const q = node([join(SCRIPTS, 'look.mjs'), dir, '--pages', 'peach,mint,white,cream', '--widths', '1440', '--frames', '1', '--out', join(dir, 'quiet')]);
    const quiet = JSON.parse(readFileSync(join(dir, 'quiet/report.json'), 'utf8')).findings;
    const tinted = (p) => quiet.filter((f) => f.rule === 'tinted-ground' && f.at.startsWith(p + ' ')).length;
    assert.deepEqual(['peach', 'mint', 'white', 'cream'].map(tinted), [1, 1, 0, 0], q.stdout + q.stderr);
    assert.match(quiet.find((f) => f.rule === 'tinted-ground').text, /^The brief asks for Quiet, and the ground \(#[0-9a-f]{6}, oklch chroma/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('audit: a page with no pictures, a fix when the brief plans photos; a home page with nothing to try', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-pictures-'));
  try {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const page = (title, body, head = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} at the bakery in the lane</title>${head}
      <body><main><h1>${title}</h1>${body}</main></body></html>`;
    for (const [site, plan] of [['planned', '- **The pictures, planned:** the hero: free photos of rye bread (photos.mjs); the oven: drawn.\n'], ['unplanned', '- **No photos:** the type carries the page.\n']]) {
      mkdirSync(join(dir, site, 'dist'), { recursive: true });
      mkdirSync(join(dir, site, '.one-shot'));
      writeFileSync(join(dir, site, '.one-shot/brief.md'), `# Brief\n\n${plan}`);
      writeFileSync(join(dir, site, 'dist/index.html'), page('Bread', '<p>Rye, spelt and pretzels.</p>'));
      writeFileSync(join(dir, site, 'dist/oven.html'), page('Oven', `<img src="${png}" alt="The oven" width="400" height="300"><details><summary>Hours</summary><p>From six.</p></details>`));
      writeFileSync(join(dir, site, 'dist/impressum.html'), page('Impressum', '<p>Owner and address.</p>', '<meta name="robots" content="noindex">'));
    }
    const run = (site) => {
      const r = node([join(SCRIPTS, 'audit.mjs'), join(dir, site, 'dist'), '--draft', '--out', join(dir, site, 'audit.md')]);
      assert.ok(existsSync(join(dir, site, 'audit.json')), r.stdout + r.stderr);
      return JSON.parse(readFileSync(join(dir, site, 'audit.json'), 'utf8')).findings.filter((f) => ['no-pictures', 'nothing-to-try'].includes(f.rule)).map((f) => `${f.level} ${f.rule} ${f.at}`).sort();
    };
    assert.deepEqual(run('planned'), ['fail no-pictures /', 'warn nothing-to-try /']);
    assert.deepEqual(run('unplanned'), ['warn no-pictures /', 'warn nothing-to-try /'], 'a picture and a details element on another page count there; a noindex page needs neither');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// v0.5: a business, an event or a place shows at least four real pictures. The bakery has three: one photo in two
// sizes, one more on the home page and one on the oven page; its logo and its drawing don't count. A fourth, set as a
// background, clears it, and a person's page with one photo isn't asked.
test('audit: few-pictures for a business with under four real pictures, logos, drawings and sizes of one photo left out', { skip, timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-few-'));
  try {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const ld = (type) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${type}","name":"Rosa"}</script>`;
    const page = (title, body, head = '') => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} at the bakery in the lane</title>${head}
      <body><header><a class="brand" href="/"><img src="/img/logo.png" alt="Rosa" width="160" height="100"></a></header><main><h1>${title}</h1>${body}</main></body></html>`;
    const img = (f, alt) => `<img src="/img/${f}" alt="${alt}" width="400" height="300">`;
    const build = (site, type, extra = '') => {
      mkdirSync(join(dir, site, 'dist/img'), { recursive: true });
      for (const f of ['logo.png', 'rye-800.png', 'rye-1600.png', 'spelt.png', 'oven.png', 'pretzel.png']) writeFileSync(join(dir, site, 'dist/img', f), png);
      writeFileSync(join(dir, site, 'dist/index.html'), page('Bread', `${img('rye-800.png', 'Rye')}${img('spelt.png', 'Spelt')}<svg viewBox="0 0 400 200" width="400" height="200" aria-hidden="true"><rect width="400" height="200" fill="#c96"/></svg>`, ld(type)));
      writeFileSync(join(dir, site, 'dist/oven.html'), page('Oven', `${img('rye-1600.png', 'Rye, close')}${img('oven.png', 'The oven')}${extra}`));
    };
    const few = (site) => {
      const r = node([join(SCRIPTS, 'audit.mjs'), join(dir, site, 'dist'), '--draft', '--out', join(dir, site, 'audit.md')]);
      assert.ok(existsSync(join(dir, site, 'audit.json')), r.stdout + r.stderr);
      return JSON.parse(readFileSync(join(dir, site, 'audit.json'), 'utf8')).findings.filter((f) => f.rule === 'few-pictures');
    };
    build('three', 'Bakery');
    const f = few('three');
    assert.deepEqual(f.map((x) => `${x.level} ${x.at}`), ['warn /'], 'three pictures: rye in two sizes is one, the logo and the drawing are none');
    assert.match(f[0].text, /^Only 3 real pictures across the site, where a business, an event or a place shows at least four/);
    build('four', 'Bakery', '<div role="img" aria-label="Pretzels" style="width:400px;height:300px;background:url(/img/pretzel.png) center/cover"></div>');
    assert.deepEqual(few('four'), [], 'a fourth, as a background picture');
    build('person', 'Person');
    assert.deepEqual(few('person'), [], 'a person\'s page is not asked');
    mkdirSync(join(dir, 'three/.one-shot'), { recursive: true });
    writeFileSync(join(dir, 'three/.one-shot/allow.json'), '["few-pictures"]');
    assert.deepEqual(few('three'), [], 'allow.json turns it off');
    // they said no to photos: no floor, in site.json or in the brief
    build('refused', 'Bakery');
    writeFileSync(join(dir, 'refused/site.json'), JSON.stringify({ name: 'Rosa', type: 'Bakery', photos: false }));
    assert.deepEqual(few('refused'), [], 'site.json "photos": false');
    build('briefed', 'Bakery');
    mkdirSync(join(dir, 'briefed/.one-shot'), { recursive: true });
    writeFileSync(join(dir, 'briefed/.one-shot/brief.md'), '# Brief\n\n## 5. The look\n\n- **No pictures at all:** they said no to photos; the oven drawn, the lists set large.\n');
    assert.deepEqual(few('briefed'), [], 'the brief\'s "No pictures at all"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The last screen can't scroll a whole screen on, so its shot used to repeat the bottom of the screen before (read
// as a bug in the site on the vote page). Now the screens tile the page: the last one keeps the bar at the top and
// shows only what the one before didn't.
test('look: the screens tile the page; the last one is shorter, keeps the header and repeats nothing', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-tile-'));
  try {
    // 2.5 screens at 1440×900, a sticky header 60px tall, and one red line 1700px down: in the second screen only
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tiles</title>
      <body style="margin:0;font:19px/1.5 sans-serif;background:#fff;color:#222">
      <header style="position:sticky;top:0;height:60px;background:#222;color:#fff;z-index:1">Tiles</header>
      <main style="height:1640px"><h1 style="margin:0;padding:40px">Tiles</h1></main>
      <p style="margin:0;height:60px;background:#f00;color:#fff">The one red line</p>
      <footer style="height:490px;background:#eee">The end</footer></body></html>`);
    const r = node([join(SCRIPTS, 'look.mjs'), dir, '--widths', '1440', '--out', join(dir, 'out')]);
    const report = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8'));
    const frames = report.frames.filter((f) => f.page === '/' && f.width === 1440);
    assert.deepEqual(frames.map((f) => [f.top, f.height]), [[0, 900], [900, 900], [1800, 450]], r.stdout + r.stderr);
    assert.equal(frames[2].bar, 60, 'the sticky header stays on the last screen');
    const { imageSize } = await import('../skills/one-shot-site/scripts/lib/cli.mjs');
    assert.deepEqual(imageSize(join(dir, 'out', frames[2].file)), [1440, 510]);
    assert.ok(existsSync(join(dir, 'out/sheet-home-1440.jpg')), 'the contact sheet lays out the shorter frame');
    // the red line is in one shot only, and the last shot opens with the header
    const browser = await launch();
    try {
      const page = await browser.newPage({ width: 400, height: 300 });
      const scan = (file) => page.eval(`new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
        const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, i.width, i.height).data; let red = 0;
        for (let p = 0; p < d.length; p += 4 * 97) if (d[p] > 200 && d[p + 1] < 60 && d[p + 2] < 60) red++;
        ok({ red, top: [...x.getImageData(700, 30, 1, 1).data].slice(0, 3) }); }; i.src = 'data:image/jpeg;base64,${readFileSync(join(dir, 'out', file)).toString('base64')}'; })`);
      const seen = [];
      for (const f of frames) seen.push(await scan(f.file));
      assert.deepEqual(seen.map((s) => s.red > 0), [false, true, false], JSON.stringify(seen));
      assert.ok(seen[2].top.every((v) => v < 60), `the last shot opens with the dark header: ${seen[2].top}`);
      await page.close();
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
