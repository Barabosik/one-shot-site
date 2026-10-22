import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SET_URL = resolve('skills/one-shot-site/scripts/set-url.mjs');
const run = (...args) => spawnSync(process.execPath, [SET_URL, ...args], { encoding: 'utf8' });

test('set-url fills the address, moves it, and lists only indexable pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-url-'));
  mkdirSync(join(dir, 'public'));
  writeFileSync(join(dir, 'index.html'), '<link rel="canonical" href="{{URL}}"><meta property="og:image" content="{{URL}}og.jpg">');
  writeFileSync(join(dir, 'about.html'), '<title>About</title>');
  writeFileSync(join(dir, 'variant-a.html'), '<title>A</title>');
  writeFileSync(join(dir, 'private.html'), '<meta name="robots" content="noindex">');
  writeFileSync(join(dir, 'public/robots.txt'), 'Sitemap: {{URL}}sitemap.xml\n');

  assert.equal(run(dir, 'https://first.example').status, 0);
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /href="https:\/\/first\.example\/".*https:\/\/first\.example\/og\.jpg/);
  assert.equal(readFileSync(join(dir, 'public/robots.txt'), 'utf8'), 'Sitemap: https://first.example/sitemap.xml\n');
  const locs = [...readFileSync(join(dir, 'public/sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['https://first.example/', 'https://first.example/about.html']);

  assert.equal(run(dir, 'https://second.example/').status, 0);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('https://second.example/og.jpg') && !html.includes('first.example'));

  assert.equal(run(dir, 'not-an-address').status, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('set-url takes only a web address, says which input is wrong, and checks site.json before writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-url-bad-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<link rel="canonical" href="{{URL}}">');
    for (const bad of ['javascript:alert(1)', 'ftp://files.example/', 'file:///C:/site/', 'not-an-address', 'https://']) {
      const r = run(dir, bad);
      assert.equal(r.status, 2, bad);
      assert.match(r.stderr, /is not a full address\. Start it with https:\/\//, bad);
    }
    assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), '<link rel="canonical" href="{{URL}}">', 'nothing written');
    const missing = run(dir);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /^set-url needs the site's folder and its address\./);
    const nosite = run(join(dir, 'nowhere'), 'https://x.example/');
    assert.equal(nosite.status, 2);
    assert.match(nosite.stderr, /^No index\.html in .+nowhere: pass the site's own folder\./);

    // a broken site.json is named, and the pages are left as they were
    writeFileSync(join(dir, 'site.json'), '{ "name": "Kleiner Kaffee", ');
    const broken = run(dir, 'https://kleiner-kaffee.example');
    assert.equal(broken.status, 2);
    assert.match(broken.stderr, /site\.json is not valid JSON .+nothing was changed/);
    assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), '<link rel="canonical" href="{{URL}}">');
    writeFileSync(join(dir, 'site.json'), '{ "name": "Kleiner Kaffee" }');
    assert.equal(run(dir, 'http://localhost:8080').status, 0, 'http works too');
    assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /href="http:\/\/localhost:8080\/"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// site.json read at the start was written back at the end, undoing the rewrite of its other fields; a canonical
// written href-first was not found; a junction out of the folder had files outside the site rewritten
test('set-url moves every field of site.json, finds canonical in any order, and stays inside the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-url-move-'));
  try {
    const site = join(dir, 'site');
    mkdirSync(site);
    mkdirSync(join(dir, 'outside'));
    writeFileSync(join(site, 'index.html'), `<link href='https://old.example/' rel=canonical><a href="https://old.example/menu.html">Menu</a>`);
    writeFileSync(join(site, 'site.json'), JSON.stringify({ name: 'K', url: 'https://old.example/', events: [{ name: 'Open day', link: 'https://old.example/events.html' }] }));
    writeFileSync(join(dir, 'outside/other.html'), '<a href="https://old.example/">not this site</a>');
    symlinkSync(join(dir, 'outside'), join(site, 'linked'), 'junction');
    const r = run(site, 'https://new.example/');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /in 2 file\(s\); no public\/ folder, so no sitemap was written/);
    const facts = JSON.parse(readFileSync(join(site, 'site.json'), 'utf8'));
    assert.equal(facts.url, 'https://new.example/');
    assert.equal(facts.events[0].link, 'https://new.example/events.html');
    assert.match(readFileSync(join(site, 'index.html'), 'utf8'), /href='https:\/\/new\.example\/' rel=canonical.*https:\/\/new\.example\/menu\.html/);
    assert.equal(readFileSync(join(dir, 'outside/other.html'), 'utf8'), '<a href="https://old.example/">not this site</a>', 'a file outside the site');
    // refused by its own message before anything is written (a broken guard also exits 2, from a crash halfway)
    const kept = readFileSync(join(site, 'index.html'), 'utf8');
    const quote = run(site, 'https://x".example/');
    assert.equal(quote.status, 2, 'a host name with a quote');
    assert.match(quote.stderr, /"https:\/\/x"\.example\/" is not a full address/);
    assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), kept, 'nothing written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('set-url writes a "$&" in the address as it is, not as the text it replaces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-url-dollar-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<link rel="canonical" href="{{URL}}">');
    assert.equal(run(dir, 'https://x.example/a$&b/').status, 0);
    assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), '<link rel="canonical" href="https://x.example/a$&b/">');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a canonical that isn't a full address ("/") had every "/" in every page swapped; a linked public/ had the sitemap
// written outside the site
test('set-url stops on a canonical that is not an address, and on a linked public/, before writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-url-guard-'));
  try {
    const site = join(dir, 'site');
    mkdirSync(site);
    const page = '<link rel="canonical" href="/"><a href="/menu.html">Menu</a>';
    writeFileSync(join(site, 'index.html'), page);
    const slash = run(site, 'https://new.example/');
    assert.equal(slash.status, 2, slash.stdout);
    assert.match(slash.stderr, /is "\/", not a full address\. Write \{\{URL\}\} in its href, then run this again; nothing was changed\./);
    assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), page);

    const fresh = '<link rel="canonical" href="{{URL}}">';
    writeFileSync(join(site, 'index.html'), fresh);
    mkdirSync(join(dir, 'outside'));
    symlinkSync(join(dir, 'outside'), join(site, 'public'), 'junction');
    const linked = run(site, 'https://new.example/');
    assert.equal(linked.status, 2, linked.stdout);
    assert.match(linked.stderr, /public is a link \(junction or symlink\): set-url writes only inside the site folder\..*nothing was changed\./);
    assert.deepEqual(readdirSync(join(dir, 'outside')), [], 'no sitemap outside the site');
    assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), fresh);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
