// Bad input to the scripts: each case stops with one line saying what is wrong and exit code 2, before a browser
// starts, and changes nothing. No Chrome is needed for any of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const SCRIPTS = resolve('skills/one-shot-site/scripts');
const script = (name, args, cwd) => spawnSync(process.execPath, [join(SCRIPTS, name), ...args], { cwd, encoding: 'utf8', timeout: 30000 });
const temp = (name) => mkdtempSync(join(tmpdir(), name));

// The site's own 404 page answers a page that isn't there; its picture replaced the real link preview.
test('images og --page with no such page writes nothing', () => {
  const dir = temp('oss-og-');
  try {
    mkdirSync(join(dir, 'dist'));
    mkdirSync(join(dir, 'public'));
    writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><title>Home</title>');
    writeFileSync(join(dir, 'dist/404.html'), '<!doctype html><title>Not found</title>');
    writeFileSync(join(dir, 'public/og.jpg'), 'the real preview');
    const r = script('images.mjs', ['og', 'dist', '--page', 'nope'], dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /No page at \/nope\.html in the site\. Nothing was written\./);
    assert.equal(readFileSync(join(dir, 'public/og.jpg'), 'utf8'), 'the real preview');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mockup --concepts names what is wrong with the file, not a JavaScript error', () => {
  const dir = temp('oss-concepts-bad-');
  try {
    writeFileSync(join(dir, 'broken.json'), '{ "concepts": [');
    writeFileSync(join(dir, 'empty.json'), '{ "client": "Kleiner Kaffee" }');
    for (const [file, want] of [['nope.json', /No file at .+nope\.json/], ['broken.json', /broken\.json is not valid JSON/], ['empty.json', /needs a "concepts" list/]]) {
      const r = script('mockup.mjs', ['--concepts', file, '--check'], dir);
      assert.equal(r.status, 2, file + r.stdout + r.stderr);
      assert.match(r.stderr, want, file);
      assert.doesNotMatch(r.stderr, /Cannot read properties/, file);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// CHROME_PATH pointing at something that is not a browser: the message names it, and nothing is left in public/
test('CHROME_PATH at another program or a text file is named; at a folder it is passed over', async () => {
  const dir = temp('oss-chrome-path-');
  try {
    writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
    writeFileSync(join(dir, 'notes.txt'), 'not a browser');
    const icon = (path) => spawnSync(process.execPath, [join(SCRIPTS, 'images.mjs'), 'icon', '--svg', 'icon.svg', '--out', 'icon.png'], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, CHROME_PATH: path } });
    const node = icon(process.execPath);
    assert.equal(node.status, 2, node.stderr);
    assert.match(node.stderr, /The browser exited early \(code \d+\)\. Is CHROME_PATH \(.+\) a Chrome, Edge, Brave or Chromium program\?/);
    const text = icon(join(dir, 'notes.txt'));
    assert.equal(text.status, 2, text.stderr);
    assert.match(text.stderr, /Could not start .+notes\.txt \(\w+\)\. Is CHROME_PATH a Chrome, Edge, Brave or Chromium program\?|The browser exited early/);
    const { findBrowser } = await import('../skills/one-shot-site/scripts/lib/chrome.mjs');
    const was = process.env.CHROME_PATH;
    try {
      process.env.CHROME_PATH = dir;
      assert.notEqual(findBrowser(), dir, 'a folder is not a browser');
      process.env.CHROME_PATH = process.execPath;
      assert.equal(findBrowser(), process.execPath);
    } finally { if (was === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = was; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// launch() removes browser profiles older than 3 h (a killed run leaves one), past one it cannot remove, and its own
// when the start fails. The child gets a temp folder of its own: the real one is never touched.
test('a launch removes old browser profiles only, past a locked one, and says what the program printed', async () => {
  const dir = temp('oss-sweep-');
  const tmp = join(dir, 'tmp');
  let holder;
  try {
    mkdirSync(tmp);
    writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
    for (const [name, age] of [['oss-chrome-aaa-locked', 4], ['oss-chrome-old', 4], ['oss-chrome-new', 2], ['oss-other-old', 4]]) {
      mkdirSync(join(tmp, name));
      utimesSync(join(tmp, name), new Date(Date.now() - age * 36e5), new Date(Date.now() - age * 36e5));
    }
    // on Windows a process whose working folder is in there keeps it from being removed (an orphaned Chrome does)
    holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: join(tmp, 'oss-chrome-aaa-locked'), stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 500));
    const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp, CHROME_PATH: process.execPath };
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'images.mjs'), 'icon', '--svg', 'icon.svg', '--out', 'icon.png'], { cwd: dir, encoding: 'utf8', timeout: 30000, env });
    assert.equal(r.status, 2, r.stderr); // node is not a browser: the start fails, after the sweep
    assert.match(r.stderr, /The browser exited early \(code \d+\)\..* It printed: .*bad option/, 'node\'s own complaint is passed on');
    const left = readdirSync(tmp).filter((d) => d !== 'oss-chrome-aaa-locked').sort();
    assert.deepEqual(left, ['oss-chrome-new', 'oss-other-old'], 'the old profile and the failed start\'s own are gone');
  } finally { holder?.kill(); await new Promise((r) => setTimeout(r, 300)); rmSync(dir, { recursive: true, force: true }); }
});

test('photos offline says so in plain words, not "fetch failed"', async () => {
  const dir = temp('oss-photos-offline-');
  try {
    // a port nothing listens on
    const { createServer } = await import('node:net');
    const s = createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const port = s.address().port;
    await new Promise((r) => s.close(r));
    const env = { ...process.env, OPENVERSE_API: 'http://no-such-host.invalid/v1/images/', COMMONS_API: `http://127.0.0.1:${port}/w/api.php` };
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'photos.mjs'), 'search', 'bread'], { cwd: dir, env, encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /Openverse didn't answer \((no internet connection\?|no answer in 30 s)\): trying Wikimedia Commons/);
    assert.match(r.stderr, /Couldn't reach 127\.0\.0\.1:\d+ \(connection refused\)/);
    assert.doesNotMatch(r.stderr, /fetch failed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// photos get saved any answer as .jpg: an error page, a "no hotlinking" page, a file of any size. Each stops before
// images.mjs (and so before a browser) starts.
test('photos get takes only a picture, from a web address, under 40 MB', async () => {
  const dir = temp('oss-photos-bad-');
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    if (req.url === '/huge.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(50 * 2 ** 20) }); return res.end(); }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end('<!doctype html><title>Access denied</title><p>No hotlinking.</p>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    mkdirSync(join(dir, '.one-shot/photos'), { recursive: true });
    const photo = (n, url) => ({ n, id: 'x' + n, title: 'Bread', creator: 'A', source: 'flickr', license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', landing: 'https://example.org/', url, width: 2000, height: 1300 });
    writeFileSync(join(dir, '.one-shot/photos/photos.json'), JSON.stringify({ q: 'bread', list: [photo(1, base + '/page.jpg'), photo(2, 'file:///etc/passwd'), photo(3, base + '/huge.jpg')] }));
    const get = (n) => new Promise((ok) => { // not spawnSync: this process serves the answers
      const p = spawn(process.execPath, [join(SCRIPTS, 'photos.mjs'), 'get', String(n)], { cwd: dir });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (status) => ok({ status, err }));
    });
    for (const [n, want] of [[1, /Photo 1 came back as something that is not a picture/], [2, /Photo 2 has no web address to fetch/], [3, /is over 40 MB, too big for a photo on a web page/]]) {
      const r = await get(n);
      assert.equal(r.status, 2, n + r.err);
      assert.match(r.err, want, String(n));
    }
    assert.doesNotMatch(readFileSync(join(dir, 'public/img/CREDITS.md'), 'utf8'), /Bread/, 'no credit for a photo that was not made');
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

// a run that stopped left yesterday's "All clear." and "Ready to ship." for the agent to read
test('look and audit remove their last report before they start, so a run that stops leaves none', () => {
  const dir = temp('oss-stale-');
  try {
    mkdirSync(join(dir, '.one-shot/look'), { recursive: true });
    mkdirSync(join(dir, 'site'));
    writeFileSync(join(dir, 'site/index.html'), '<!doctype html><title>x</title><h1>x</h1>');
    for (const f of ['audit.md', 'audit.json', 'look/report.md', 'look/report.json']) writeFileSync(join(dir, '.one-shot', f), 'Ready to ship. All clear.');
    const audit = script('audit.mjs', ['nowhere'], dir);
    assert.equal(audit.status, 2, audit.stdout + audit.stderr);
    // node stands in for the browser: the run stops where Chrome would start
    const look = spawnSync(process.execPath, [join(SCRIPTS, 'look.mjs'), 'site', '--widths', '390'], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, CHROME_PATH: process.execPath } });
    assert.equal(look.status, 2, look.stdout + look.stderr);
    for (const f of ['audit.md', 'audit.json', 'look/report.md', 'look/report.json']) assert.ok(!existsSync(join(dir, '.one-shot', f)), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a proxy or antivirus that inspects https, or a broken certificate, was called "no internet connection?"
test('photos says a failed secure connection is one, not "no internet"', async () => {
  const dir = temp('oss-photos-tls-');
  const { createServer } = await import('node:http');
  const plain = createServer((q, r) => r.end('{}')); // https:// to a plain http port: the handshake fails
  await new Promise((r) => plain.listen(0, '127.0.0.1', r));
  try {
    const base = `https://127.0.0.1:${plain.address().port}/`;
    const env = { ...process.env, OPENVERSE_API: base + 'v1/images/', COMMONS_API: base + 'w/api.php' };
    const r = await new Promise((ok) => { // not spawnSync: this process serves the answers
      const p = spawn(process.execPath, [join(SCRIPTS, 'photos.mjs'), 'search', 'bread', '--dir', join(dir, 'out')], { cwd: dir, env });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (status) => ok({ status, err }));
    });
    assert.equal(r.status, 2, r.err);
    assert.match(r.err, /the secure connection failed: ERR_SSL_\w+; a proxy or antivirus that checks traffic\?/);
    assert.doesNotMatch(r.err, /no internet/);
  } finally { plain.closeAllConnections(); plain.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('study, new-site and redesign say what is missing on the first line', () => {
  const dir = temp('oss-first-line-');
  try {
    for (const [name, args, want] of [
      ['study.mjs', [], /^study needs the address of the site they like\./],
      ['study.mjs', ['http://'], /^"http:\/\/" is not a full address\. Start it with https:\/\//],
      ['study.mjs', ['notaurl'], /^"notaurl" is not a full address/],
      ['new-site.mjs', [], /^new-site needs a folder for the site: /],
      ['new-site.mjs', ['my-site'], /^new-site needs the name: node new-site\.mjs my-site --name/],
      ['new-site.mjs', ['my-site', '--name', 'X', '--url', 'notaurl'], /^--url takes a full address, like https:\/\/rosas\.example\/ \(got "notaurl"\)/],
      ['redesign.mjs', [], /^redesign needs their site: its address/],
      ['redesign.mjs', ['compare'], /^redesign compare needs the old site and the new folder/],
    ]) {
      const r = script(name, args, dir);
      assert.equal(r.status, 2, `${name} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, want, `${name} ${args.join(' ')}`);
    }
    assert.ok(!readdirSync(dir).length, 'nothing written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const newSite = (dir, name, ...args) => {
  const r = script('new-site.mjs', [join(dir, name), '--name', name, '--no-install', ...args], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { out: r.stdout, facts: JSON.parse(readFileSync(join(dir, name, 'site.json'), 'utf8')), file: (f) => readFileSync(join(dir, name, f), 'utf8') };
};

// A failed npm install was said on stderr only, then "Run: npm run dev" and exit 0. On Windows cmd.exe ran an
// npm.cmd in the site's own folder before the real one. A link already in the folder was written through.
test('new-site: a failed install is said, an npm in the site folder is not run, a link there is replaced', () => {
  const dir = temp('oss-install-');
  try {
    const bin = join(dir, 'bin'), site = join(dir, 'site');
    mkdirSync(bin);
    mkdirSync(site);
    writeFileSync(join(bin, 'npm.cmd'), '@exit /b 1\r\n'); // an npm that fails, first on PATH
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(site, 'npm.cmd'), `@echo planted> "${join(dir, 'planted.txt')}"\r\n`);
    writeFileSync(join(dir, 'outside.txt'), 'not the site\'s');
    linkSync(join(dir, 'outside.txt'), join(site, '.gitignore'));
    // as a fresh Windows shell has it: the setting unset (some terminals set it)
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^NoDefaultCurrentDirectoryInExePath$/i.test(k)));
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    env[key] = bin + delimiter + env[key];
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'new-site.mjs'), site, '--name', 'Fails', '--force'], { cwd: dir, encoding: 'utf8', timeout: 60000, env });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /npm install FAILED \(its message is above\)/);
    assert.doesNotMatch(r.stdout, /Run: npm run dev/);
    assert.ok(!existsSync(join(dir, 'planted.txt')), 'the npm.cmd in the site folder ran');
    assert.equal(readFileSync(join(dir, 'outside.txt'), 'utf8'), 'not the site\'s', 'written through the link');
    assert.match(readFileSync(join(site, '.gitignore'), 'utf8'), /node_modules/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A folder link in the target (a junction) had the starter's and the tools' files written into what it points at;
// with no git on PATH the site got no history and nothing said so.
test('new-site replaces a folder link in the target, and says when git is missing', () => {
  const dir = temp('oss-linked-');
  try {
    const site = join(dir, 'site'), src = join(dir, 'src-out'), tools = join(dir, 'tools-out'), empty = join(dir, 'empty');
    for (const d of [site, src, tools, empty]) mkdirSync(d);
    symlinkSync(src, join(site, 'src'), 'junction');
    symlinkSync(tools, join(site, 'tools'), 'junction');
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'new-site.mjs'), site, '--name', 'Linked', '--force', '--no-install'], { cwd: dir, encoding: 'utf8', timeout: 60000, env: { ...process.env, PATH: empty, Path: empty } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /git was not found, so the site has no history yet\. Install it from https:\/\/git-scm\.com\//);
    assert.deepEqual(readdirSync(src), [], 'written through the src link');
    assert.deepEqual(readdirSync(tools), [], 'written through the tools link');
    assert.ok(existsSync(join(site, 'src', 'main.js')) && existsSync(join(site, 'tools', 'one-shot', 'audit.mjs')), 'the files are in the site');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site copies the starter\'s dotfiles, .gitattributes as it is', () => {
  const dir = temp('oss-dotfiles-');
  try {
    const site = newSite(dir, 'real');
    assert.equal(site.file('.gitattributes'), readFileSync(join(SCRIPTS, '../assets/starter/.gitattributes'), 'utf8'));
    assert.ok(site.file('.gitignore').includes('node_modules'));
    // a starter of its own: every dotfile in it comes along, whatever its name
    const skill = join(dir, 'skill');
    cpSync(SCRIPTS, join(skill, 'scripts'), { recursive: true });
    cpSync(join(SCRIPTS, '../LICENSE.txt'), join(skill, 'LICENSE.txt'));
    mkdirSync(join(skill, 'assets/starter/.config'), { recursive: true });
    writeFileSync(join(skill, 'assets/starter/index.html'), '<!doctype html><title>{{TITLE}}</title>');
    writeFileSync(join(skill, 'assets/starter/package.json'), '{ "name": "{{SLUG}}" }');
    writeFileSync(join(skill, 'assets/starter/.gitattributes'), '* text=auto eol=lf\r\n*.png binary\r\n');
    writeFileSync(join(skill, 'assets/starter/.editorconfig'), 'root = true\n');
    writeFileSync(join(skill, 'assets/starter/.config/tool.json'), '{}');
    const r = spawnSync(process.execPath, [join(skill, 'scripts/new-site.mjs'), join(dir, 'own'), '--name', 'Own', '--no-install'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(readFileSync(join(dir, 'own/.gitattributes'), 'utf8'), '* text=auto eol=lf\r\n*.png binary\r\n', 'byte for byte');
    assert.equal(readFileSync(join(dir, 'own/.editorconfig'), 'utf8'), 'root = true\n');
    assert.equal(readFileSync(join(dir, 'own/.config/tool.json'), 'utf8'), '{}');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site lists every empty site.json field, seeds software fields, and gives no currency to who sells nothing', () => {
  const dir = temp('oss-facts-');
  try {
    const shop = newSite(dir, 'shop', '--schema', 'Bakery', '--lang', 'de');
    assert.match(shop.out, /site\.json, empty: description, url \(set-url\.mjs\), phone, address\.street, address\.postcode, address\.city, address\.country, links\.booking/);
    assert.match(shop.out, /site\.json, empty lists: hours, closed, menu, events/);
    assert.equal(shop.facts.currency, 'EUR');

    const tool = newSite(dir, 'tool', '--schema', 'SoftwareApplication', '--country', 'PL');
    assert.ok(!('currency' in tool.facts), 'a free tool has no currency');
    for (const k of ['version', 'download', 'license', 'price']) assert.equal(tool.facts[k], '', k);
    assert.match(tool.out, /site\.json, empty: .*version, download, license, price/);
    assert.deepEqual(tool.facts.address, { country: 'PL' }, 'a country, no street');
    assert.equal(newSite(dir, 'paid', '--schema', 'SoftwareApplication', '--currency', 'pln').facts.currency, 'PLN');
    assert.ok(!('version' in shop.facts), 'a bakery has no version');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site --ground: the browser bar on every page is the chosen ground, and the theme addon\'s script is on each', async () => {
  const { hex, hexToRgb, palette, rgbToOklch } = await import('../skills/one-shot-site/scripts/palette.mjs');
  const dir = temp('oss-ground-');
  try {
    const brand = rgbToOklch(hexToRgb('#5a7d3a'));
    const bars = (html) => [...html.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})"(?: media="\(prefers-color-scheme: (\w+)\)")?>/g)].map((m) => [m[2] || 'any', m[1]]);
    const plain = newSite(dir, 'plain', '--theme', '#5a7d3a', '--ground', 'neutral', '--legal', 'de', '--lang', 'de');
    for (const f of ['index.html', 'impressum.html', 'datenschutz.html']) {
      assert.deepEqual(bars(plain.file(f)), [['any', hex(palette(brand, { ground: 'neutral' }).ground)]], f);
      assert.doesNotMatch(plain.file(f), /getItem\('site-theme'\)/, `${f}: no theme addon, no theme script`);
    }
    const themed = newSite(dir, 'themed', '--theme', '#5a7d3a', '--ground', 'warm', '--addons', 'theme', '--legal', 'de');
    const want = [['light', hex(palette(brand, { mode: 'light', ground: 'warm' }).ground)], ['dark', hex(palette(brand, { mode: 'dark', ground: 'warm' }).ground)]];
    for (const f of ['index.html', 'impressum.html', 'datenschutz.html']) {
      assert.deepEqual(bars(themed.file(f)), want, f);
      assert.equal(themed.file(f).match(/getItem\('site-theme'\)/g)?.length, 1, `${f}: the saved theme is set before the first paint`);
    }
    // a ground given as a colour sets its own scheme; the other keeps the palette's
    const exact = newSite(dir, 'exact', '--theme', '#5a7d3a', '--ground', '#efe6d8', '--addons', 'theme');
    assert.deepEqual(bars(exact.file('index.html')), [['light', '#efe6d8'], ['dark', hex(palette(brand, { mode: 'dark' }).ground)]]);
    // --mood warm without --ground: the cream a Warm site starts on, in the tokens and the browser bar
    const warm = newSite(dir, 'warm', '--theme', '#5a7d3a', '--mood', 'warm');
    const cream = hex(palette(brand, { strategy: 'committed', ground: 'warm' }).ground);
    assert.deepEqual(bars(warm.file('index.html')), [['any', cream]], 'the browser bar is the cream ground');
    assert.match(warm.file('src/tokens.css'), /--ground: oklch\(95\.0% 0\.019 80\.0\)/, 'tokens.css starts on cream');
    for (const [args, want] of [[['--ground', 'warm'], /--ground goes with --theme/], [['--theme', '#5a7d3a', '--ground', 'purple'], /--ground takes warm, cool, neutral, brand or a colour/], [['--theme', '#5a7d3a', '--mood', 'cosy'], /--mood takes quiet, bold, warm/]]) {
      const r = script('new-site.mjs', [join(dir, 'bad'), '--name', 'Bad', '--no-install', ...args], dir);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, want);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Git Bash rewrites an argument that starts with "/": --pages "/,/menu.html=/#menu" arrives as
// "C:/Program Files/Git/,/menu.html=/#menu". redesign repairs it as look does.
test('redesign --pages survives Git Bash: the install folder in front of the first path is cut off', async () => {
  const { typed, pairOf } = await import('../skills/one-shot-site/scripts/redesign.mjs');
  const { pagePath } = await import('../skills/one-shot-site/scripts/lib/cli.mjs');
  for (const [given, want] of [
    ['C:/Program Files/Git/', '/'], ['C:/Program Files/Git/menu.html', '/menu.html'], [String.raw`C:\Users\x\scoop\apps\git\current\de\about.html`, '/de/about.html'],
    ['D:/PortableGit/team/', '/team/'], ['/menu.html', '/menu.html'], ['menu.html', '/menu.html'], ['/index.php?page=menu', '/index.php?page=menu'],
  ]) assert.equal(typed(given), want, given);
  assert.equal(pagePath(String.raw`C:\Users\x\scoop\apps\git\current\de\about`), '/de/about.html', 'look\'s pages the same way');
  assert.deepEqual(pairOf('C:/Program Files/Git/speisekarte.html=/#kuchen').map(typed), ['/speisekarte.html', '/#kuchen']);

  const dir = temp('oss-gitbash-');
  try {
    mkdirSync(join(dir, 'public'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="de"><title>Café</title><main><section id="kuchen"><h2>Kuchen</h2></section></main>');
    const r = script('redesign.mjs', ['redirects', dir, '--pages', 'C:/Program Files/Git/speisekarte.html=/#kuchen,/team/=/'], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(dir, 'public/speisekarte.html')), r.stdout);
    assert.ok(existsSync(join(dir, 'public/team/index.html')), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A check going through a site must never start the person's mail program, phone or chat app.
test('the browser profile marks every app link scheme as never handed on', async () => {
  const { APP_SCHEMES, appLinkPrefs } = await import('../skills/one-shot-site/scripts/lib/chrome.mjs');
  const dir = temp('oss-prefs-');
  try {
    appLinkPrefs(dir);
    const got = JSON.parse(readFileSync(join(dir, 'Default/Preferences'), 'utf8')).protocol_handler.excluded_schemes;
    for (const s of ['mailto', 'tel', 'sms', 'callto', 'skype', 'whatsapp', 'tg', 'ms-outlook', 'msteams', 'zoommtg', 'facetime', 'market', 'itms-apps', 'intent']) {
      assert.ok(APP_SCHEMES.includes(s), s);
      assert.equal(got[s], true, s);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the page guard stops app links and lets web links through', async () => {
  const { appLinkGuard } = await import('../skills/one-shot-site/scripts/lib/probes.mjs');
  const vm = await import('node:vm');
  const on = {};
  const nav = {};
  const opened = [];
  const notes = [];
  const ctx = {
    location: { href: 'https://example.com/' }, URL, String,
    console: { info: (m) => notes.push(m) },
    navigation: { addEventListener: (t, f) => { nav[t] = f; } },
    addEventListener: (t, f) => { on[t] = f; },
    open: (u) => { opened.push(u); return {}; },
  };
  ctx.window = ctx;
  vm.runInNewContext(`(${appLinkGuard})(); (${appLinkGuard})();`, ctx);
  const event = (extra) => { const e = { cancelable: true, stopped: false, preventDefault() { this.stopped = true; }, ...extra }; return e; };
  for (const [url, stop] of [['mailto:x@y.example', true], ['tel:+491234', true], ['msteams:/l/x', true], ['https://example.com/about', false], ['/about', false], ['#top', false]]) {
    const e = event({ destination: { url } });
    nav.navigate(e);
    assert.equal(e.stopped, stop, url);
  }
  const link = event({ composedPath: () => [{ localName: 'span' }, { localName: 'a', href: 'whatsapp://send?text=hi' }] });
  on.click(link);
  assert.ok(link.stopped, 'a click on an app link');
  const form = event({ target: { action: 'mailto:x@y.example' } });
  on.submit(form);
  assert.ok(form.stopped, 'a form sent to mailto:');
  assert.equal(ctx.window.open('sms:123'), null);
  assert.ok(ctx.window.open('https://example.com/'));
  assert.deepEqual(opened, ['https://example.com/'], 'only the web address opened');
  assert.match(notes[0], /^one-shot: not opened, it would start another program: mailto:x@y\.example/);
});

// "get" had its own list called nums, so the --widths check said "nums is not a function"
test('photos get checks --widths before downloading anything', () => {
  const dir = temp('oss-photos-get-');
  try {
    mkdirSync(join(dir, '.one-shot/photos'), { recursive: true });
    writeFileSync(join(dir, '.one-shot/photos/photos.json'), JSON.stringify({ q: 'bread', list: [{ n: 1, url: 'http://127.0.0.1:9/never.jpg', width: 2000, height: 1300 }] }));
    const r = script('photos.mjs', ['get', '1', '--widths', 'abc'], dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /--widths takes whole numbers from 16 to 8000, like 800,1600 \(got "abc"\)/);
    assert.ok(!existsSync(join(dir, 'public')), 'nothing written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A folder of variant pages has no index.html; named pages are what is looked at, so they are enough. Node stands in
// for the browser here: getting as far as starting it means the folder was accepted, and no Chrome opens.
test('look, film and images og take a folder without index.html when its pages are named', () => {
  const dir = temp('oss-variants-');
  try {
    writeFileSync(join(dir, 'variant-a.html'), '<!doctype html><title>A</title><h1>A</h1>');
    for (const s of [['look.mjs', dir, '--pages', 'variant-a', '--widths', '1440', '--frames', '1'], ['film.mjs', dir, '--page', 'variant-a'], ['images.mjs', 'og', dir, '--page', 'variant-a']]) {
      const r = spawnSync(process.execPath, [join(SCRIPTS, s[0]), ...s.slice(1), '--out', join(dir, 'out', s[0])], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, CHROME_PATH: process.execPath } });
      assert.equal(r.status, 2, s[0] + r.stdout + r.stderr);
      assert.doesNotMatch(r.stderr, /No index\.html/, s[0]);
      assert.match(r.stderr, /The browser exited early/, s[0] + r.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// "--schema Person --country PT --currency GBP" printed "Country not set (from --country), prices in GBP"
test('new-site keeps the country for a person and says what it set, prices only when there are some', () => {
  const dir = temp('oss-country-');
  try {
    const both = newSite(dir, 'both', '--schema', 'Person', '--country', 'PT', '--currency', 'GBP');
    assert.deepEqual(both.facts.address, { country: 'PT' });
    assert.equal(both.facts.currency, 'GBP');
    assert.match(both.out, /^Country PT \(from --country\), prices in GBP\. Elsewhere\? --country and --currency, or edit site\.json\.$/m);
    const plain = newSite(dir, 'plain', '--schema', 'Person', '--country', 'PT');
    assert.ok(!('currency' in plain.facts));
    assert.match(plain.out, /^Country PT \(from --country\)\. Elsewhere\? --country, or edit site\.json\.$/m);
    assert.doesNotMatch(plain.out, /prices|not set/);
    const none = newSite(dir, 'none', '--schema', 'Person');
    assert.match(none.out, /^Country not set\. Give it with --country/m);
    assert.match(none.out, /site\.json, empty: .*address\.country/);
    const shop = newSite(dir, 'shop', '--schema', 'Bakery', '--phone', '+351 21 123 4567');
    assert.match(shop.out, /^Country PT \(from the phone number\), prices in EUR\./m);
    assert.deepEqual(Object.keys(shop.facts.address), ['street', 'postcode', 'city', 'country']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The 404 page has its own :root (hosts serve it as it is) and kept the first palette's colours
test('palette run in the site folder gives public/404.html the new colours; the theme addon\'s dark set leaves it', () => {
  const dir = temp('oss-404-');
  try {
    mkdirSync(join(dir, 'public'));
    cpSync(join(SCRIPTS, '../assets/starter/public/404.html'), join(dir, 'public/404.html'));
    const before = readFileSync(join(dir, 'public/404.html'), 'utf8');
    let r = script('palette.mjs', ['--brand', '#2f6f4e'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /public\/404\.html has these colours now/);
    const ground = r.stdout.match(/--ground: (oklch\([^)]*\))/)[1];
    const after = readFileSync(join(dir, 'public/404.html'), 'utf8');
    assert.ok(after.includes(`--ground: ${ground}`), after.match(/:root[^}]*\}/)[0]);
    assert.equal(after.replace(/:root[^}]*\}/, ''), before.replace(/:root[^}]*\}/, ''), 'only the :root changes');
    r = script('palette.mjs', ['--brand', '#2f6f4e', '--mode', 'dark'], dir);
    assert.match(r.stdout, /public\/404\.html stays light: this is the dark set/);
    assert.equal(readFileSync(join(dir, 'public/404.html'), 'utf8'), after);
    r = script('palette.mjs', ['--brand', '#2f6f4e', '--ground', '#16264a'], dir);
    assert.match(readFileSync(join(dir, 'public/404.html'), 'utf8'), /color-scheme: dark;/, 'a dark ground makes it dark');
    // the same set again writes nothing; a :root edited to hex colours is left as it is, and the note says so
    assert.match(script('palette.mjs', ['--brand', '#2f6f4e', '--ground', '#16264a'], dir).stdout, /public\/404\.html has these colours already/);
    const hexed = readFileSync(join(dir, 'public/404.html'), 'utf8').replace(/oklch\([^)]*\)/g, '#16264a');
    writeFileSync(join(dir, 'public/404.html'), hexed);
    r = script('palette.mjs', ['--brand', '#2f6f4e'], dir);
    assert.match(r.stdout, /no oklch\(\) colours to replace: give it this ground, ink and link colour by hand/);
    assert.equal(readFileSync(join(dir, 'public/404.html'), 'utf8'), hexed, 'not even its color-scheme');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site --facts fills site.json from redesign\'s confirmed draft; a flag wins over the file', () => {
  const dir = temp('oss-facts-file-');
  try {
    const draft = {
      name: "Tillet's Bakery", type: 'Bakery', description: 'Bread from the same oven since 1962.', email: 'orders@tillets.example', phone: '+44 1632 960123',
      fax: '+44 1632 960124', address: { street: '4 Mill Lane', postcode: 'LS1 2CD', city: 'Leeds', country: 'GB' },
      hours: [{ days: 'Tue-Sat', opens: '07:00', closes: '17:30' }], currency: 'GBP',
      menu: [{ section: 'Bread', items: [{ name: 'Tin loaf', price: '2.40' }] }], links: { facebook: 'https://facebook.com/tillets' },
    };
    writeFileSync(join(dir, 'facts.json'), JSON.stringify({ note: 'A draft for site.json', draft, check: ['ask about the fax'], found: {} }));
    // no --name: it comes from the file too
    const make = (name, ...extra) => {
      const r = script('new-site.mjs', [join(dir, name), '--facts', join(dir, 'facts.json'), '--no-install', ...extra], dir);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return { out: r.stdout, facts: JSON.parse(readFileSync(join(dir, name, 'site.json'), 'utf8')) };
    };
    const one = make('one');
    for (const k of ['name', 'type', 'description', 'email', 'phone', 'fax', 'currency']) assert.equal(one.facts[k], draft[k], k);
    assert.deepEqual(one.facts.address, draft.address);
    assert.deepEqual(one.facts.hours, draft.hours);
    assert.deepEqual(one.facts.menu, draft.menu);
    assert.equal(one.facts.links.facebook, draft.links.facebook);
    assert.equal(one.facts.links.booking, '', 'the empty ones stay to fill in');
    assert.match(one.out, /into site\.json: name, description, email, phone, type, currency, address, hours, menu, fax, links\./);
    assert.match(one.out, /^Country GB \(from --facts\), prices in GBP\./m);
    assert.doesNotMatch(one.out, /site\.json, empty: [^\n]*address/);
    assert.match(readFileSync(join(dir, 'one/index.html'), 'utf8'), /Tillet's Bakery|Tillet&#39;s Bakery|Tillet’s Bakery/);
    const two = make('two', '--name', 'Tillets', '--schema', 'Store');
    assert.equal(two.facts.name, 'Tillets');
    assert.equal(two.facts.type, 'Store');
    writeFileSync(join(dir, 'broken.json'), '{"draft": ');
    for (const [file, want] of [['broken.json', /broken\.json is not valid JSON/], ['none.json', /No file at .*none\.json/]]) {
      const r = script('new-site.mjs', [join(dir, 'x'), '--facts', join(dir, file), '--no-install'], dir);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stderr, want);
      assert.ok(!existsSync(join(dir, 'x')), 'nothing written');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new-site --facts reads what redesign writes, as it writes it', async () => {
  const { findFacts } = await import('../skills/one-shot-site/scripts/redesign.mjs');
  const pages = [{ path: '/', title: 'Café Lindenblatt – Startseite', lang: 'de-DE', description: 'Kuchen und Kaffee.', ld: [], pictures: [],
    blocks: [
      { tag: 'p', text: 'Öffnungszeiten:\nDi–Fr 8–18 Uhr\nSa 8–14 Uhr', region: 'main' },
      { tag: 'td', text: 'Café Lindenblatt · Lindenstraße 14 · 12345 Musterstadt\nTelefon: 030 / 123 45 67', region: 'footer' },
    ],
    links: [{ text: 'Facebook', href: 'https://www.facebook.example/cafelindenblatt', region: 'footer' }, { text: 'info@cafe-lindenblatt.example', href: 'mailto:info@cafe-lindenblatt.example', region: 'main' }] }];
  const facts = findFacts(pages, { host: 'cafe-lindenblatt.example' });
  const dir = temp('oss-facts-round-');
  try {
    // the file as redesign.mjs writes it
    writeFileSync(join(dir, 'facts.json'), JSON.stringify({ note: 'A draft for site.json', draft: facts.draft, check: facts.check, found: facts.found }, null, 2));
    const r = script('new-site.mjs', [join(dir, 'cafe'), '--facts', join(dir, 'facts.json'), '--lang', 'de', '--no-install'], dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const site = JSON.parse(readFileSync(join(dir, 'cafe/site.json'), 'utf8'));
    for (const [k, v] of Object.entries(facts.draft)) {
      if (k === 'links') for (const [l, u] of Object.entries(v)) assert.equal(site.links[l], u, `links.${l}`);
      else assert.deepEqual(site[k], v, k);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a source tripwire until a browser test covers it: no test that runs code sees this line, and without it a page's
// download link (redesign on an old site's download.php) saves into the person's own Downloads folder
test('the browser saves no download', () => {
  assert.match(readFileSync(join(SCRIPTS, 'lib/chrome.mjs'), 'utf8'), /await b\.send\('Browser\.setDownloadBehavior', \{ behavior: 'deny' \}\)/);
});
