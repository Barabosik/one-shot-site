// The history of what was made (lib/history.mjs): off under tests unless a file is named, one entry per site,
// the newest 24, never throwing; and mockup --concepts --check naming a concept that repeats a recent site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { groundTone, historyFile, hueFamily, readHistory, recordSite, repeats, sayRepeat, siteEntry } from '../skills/one-shot-site/scripts/lib/history.mjs';

const SCRIPTS = resolve('skills/one-shot-site/scripts');

// a finished site as the starter leaves it: tokens.css with a palette and two faces, a brief with a kept idea
function site(root, name, { display = 'Calistoga', accent = 'oklch(42.0% 0.120 38.0)', ground = 'oklch(96.0% 0.020 80.0)', move = 'object', mood = 'warm' } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, '.one-shot'), { recursive: true });
  writeFileSync(join(dir, 'src', 'tokens.css'), `:root {\n  --ground: ${ground};       /* page background */\n  --accent: ${accent};\n  --font-display: '${display} Variable', '${display}', serif;\n  --font-text: 'Karla Variable', 'Karla', sans-serif;\n}\n`);
  writeFileSync(join(dir, '.one-shot', 'brief.md'), `## 3. Three ideas, one kept\n\n\`\`\`\nIdea A · Eight seats (kept)\n  idea:   the room\n  move:   ${move}\n  mood:   ${mood}\n\nIdea B · Four lines\n  move:   rows\n  mood:   editorial\n\`\`\`\n`);
  return dir;
}

test('history: off under node --test unless a file is named, and off when asked', () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'node --test sets it');
  assert.equal(historyFile(), null, 'the test suite never writes to the home folder');
  assert.equal(historyFile({ ONE_SHOT_HISTORY: 'off' }), null);
  assert.equal(historyFile({ ONE_SHOT_HISTORY: 'off', NODE_TEST_CONTEXT: '' }), null);
  assert.equal(historyFile({ ONE_SHOT_HISTORY: 'h.json', NODE_TEST_CONTEXT: 'child' }), resolve('h.json'));
  assert.match(historyFile({}), /[\\/]\.one-shot-site[\\/]history\.json$/);
  assert.equal(recordSite('.', { file: null }), null, 'off: nothing recorded');
});

test('history: colour families and grounds as a visitor would name them', () => {
  for (const [c, want] of [['#4a2416', 'red'], ['#e2b13c', 'yellow'], ['#2e5c2e', 'green'], ['#28408f', 'blue'], ['#777777', 'neutral'], ['oklch(55.7% 0.137 41.9)', 'red'], ['oklch(60% 0.15 200)', 'cyan']]) {
    assert.equal(hueFamily(c), want, c);
  }
  assert.equal(groundTone('#dfe2c6'), 'light warm');
  assert.equal(groundTone('#4a2416'), 'dark warm');
  assert.equal(groundTone('oklch(17% 0.02 250)'), 'dark cool');
  assert.equal(groundTone('#fafafa'), 'light neutral');
  assert.equal(groundTone([0.97, 0.004, 80]), 'light neutral');
  assert.equal(hueFamily('nonsense'), null);
});

test('history: a site is recorded once, newest first, 24 at most, and a broken file never throws', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-history-'));
  const file = join(root, 'home', '.one-shot-site', 'history.json');
  const kk = site(root, 'kleiner-kaffee');
  const e = recordSite(kk, { file });
  assert.deepEqual({ ...e, at: 'x' }, { site: 'kleiner-kaffee', dir: resolve(kk), at: 'x', mood: 'warm', move: 'object', fonts: ['Calistoga', 'Karla'], ground: 'oklch(96.0% 0.020 80.0)', brand: 'oklch(42.0% 0.120 38.0)', hue: 'red' });
  assert.equal(siteEntry(kk).site, 'kleiner-kaffee');
  assert.equal(siteEntry(site(join(root, 'patch-night'), 'site')).site, 'patch-night', 'a folder called "site" goes by its parent');

  for (let i = 0; i < 25; i++) assert.ok(recordSite(site(root, `s${i}`, { display: `Face${i}` }), { file }));
  let sites = readHistory(file);
  assert.equal(sites.length, 24, 'the newest 24');
  assert.equal(sites[0].site, 's24');
  assert.ok(!sites.some((s) => s.site === 'kleiner-kaffee'), 'the oldest dropped out');
  recordSite(site(root, 's3'), { file });
  sites = readHistory(file);
  assert.equal(sites[0].site, 's3', 'recorded again: moved to the front');
  assert.equal(sites.filter((s) => s.site === 's3').length, 1, 'one entry per folder');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, 1);

  writeFileSync(file, '{ not json');
  assert.deepEqual(readHistory(file), []);
  assert.ok(recordSite(kk, { file }), 'a broken file is started again');
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), '{ not json', 'after it is kept aside');
  assert.equal(readHistory(file).length, 1);
  assert.equal(recordSite(join(root, 'no-such-site'), { file }), null, 'no tokens.css: nothing, no throw');
  assert.equal(recordSite(kk, { file: join(root, 'home') }), null, 'a folder where the file should be: nothing, no throw');
  rmSync(root, { recursive: true, force: true });
});

// the starter's own tokens.css is what audit records from: renaming --accent there left every test green
test('history: the starter\'s tokens.css reads as an entry', () => {
  const e = siteEntry(resolve('skills/one-shot-site/assets/starter'));
  assert.ok(e.brand && e.ground && e.hue && e.fonts.length === 2, JSON.stringify(e));
});

// Each mood starts from four type systems, and Warm and Editorial from cream: with the display face alone as a
// repeat, about seven new sites in ten were warned. A repeat is the same system, colours and move, all three.
test('history: a repeat is the same type system, colours and first-screen move; one or two alike is normal', () => {
  const sites = [{ site: 'kleiner-kaffee', dir: resolve('a'), at: '2026-10-20', move: 'object', fonts: ['Bitter', 'Work Sans'], brand: '#7a3419', ground: '#f5ede0' }];
  const look = (o) => ({ fonts: ['bitter', 'work sans'], move: 'object', brand: '#a0401c', ground: '#f3e9d9', ...o });
  const r = repeats(look(), { sites });
  assert.deepEqual(r[0].same, ['fonts', 'colours', 'move']);
  assert.equal(sayRepeat(r[0], { fonts: ['Bitter', 'Work Sans'] }), 'same fonts (Bitter + Work Sans), colours and first-screen move as kleiner-kaffee (2026-10-20)');
  assert.deepEqual(repeats(look({ fonts: ['Bitter', 'Commissioner'] }), { sites }), [], 'the display face alone');
  assert.deepEqual(repeats(look({ move: 'rows' }), { sites }), [], 'another first screen');
  assert.deepEqual(repeats(look({ brand: '#2a6fdb' }), { sites }), [], 'another colour family');
  assert.deepEqual(repeats(look({ ground: '#1d1a17' }), { sites }), [], 'a dark ground');
  assert.deepEqual(repeats(look(), { sites, dir: 'a' }), [], 'the site itself is left out');
});

test('mockup --concepts --check names a concept that repeats a recent site, and writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-history-mockup-'));
  const file = join(root, 'history.json');
  writeFileSync(file, JSON.stringify({ version: 1, sites: [
    { site: 'kleiner-kaffee', dir: join(root, 'kleiner-kaffee'), at: '2026-10-20', move: 'rows', fonts: ['Gloock', 'Figtree'], brand: '#9c3d1c', ground: '#f5ede0' },
  ] }));
  const before = readFileSync(file, 'utf8');
  const dir = join(root, 'cafe', '.one-shot');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'Café Lindenblatt', lang: 'de', concepts: [
    { name: 'Die Kuchentheke', idea: 'i', mood: 'warm', brand: '#9c3d1c', fonts: 'Gloock, Figtree', move: 'rows', rows: 'Käsekuchen | 3,10 €\nApfelkuchen | 2,90 €' },
    { name: 'Offen ab acht', idea: 'i', mood: 'bold', brand: '#2a6fdb', move: 'field', line: 'Di–Fr ab 8' },
  ] }));
  const check = (env) => spawnSync(process.execPath, [join(SCRIPTS, 'mockup.mjs'), '--concepts', join(dir, 'concepts.json'), '--check'], { encoding: 'utf8', env: { ...process.env, ...env } });
  let r = check({ ONE_SHOT_HISTORY: file });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /A · Die Kuchentheke repeats a recent site: same fonts \(Gloock \+ Figtree\), colours and first-screen move as kleiner-kaffee \(2026-10-20\)/);
  assert.doesNotMatch(r.stdout, /B · Offen ab acht repeats/);
  assert.equal(readFileSync(file, 'utf8'), before, '--check records nothing');
  r = check({ ONE_SHOT_HISTORY: '' });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /repeats a recent site/, 'under node --test, no file named: no history');
  assert.ok(!existsSync(join(root, 'cafe', '.one-shot', 'history.json')));
  rmSync(root, { recursive: true, force: true });
});

// the site is the folder concepts.json is in (its .one-shot), not the folder mockup runs from: run from elsewhere, its
// own earlier record was named as a repeat
test('mockup --concepts --check leaves out the site\'s own record, wherever it is run from', () => {
  const root = mkdtempSync(join(tmpdir(), 'oss-history-own-'));
  try {
    const file = join(root, 'history.json');
    writeFileSync(file, JSON.stringify({ version: 1, sites: [{ site: 'cafe', dir: join(root, 'cafe'), at: '2026-10-21', move: 'rows', fonts: ['Gloock', 'Figtree'], brand: '#9c3d1c', ground: '#f6efe6' }] }));
    mkdirSync(join(root, 'cafe', '.one-shot'), { recursive: true });
    writeFileSync(join(root, 'cafe', '.one-shot', 'concepts.json'), JSON.stringify({ client: 'Cafe', concepts: [{ name: 'Die Theke', idea: 'i', mood: 'warm', brand: '#9c3d1c', fonts: 'Gloock, Figtree', move: 'rows', rows: 'Kuchen | 3,10' }] }));
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'mockup.mjs'), '--concepts', join(root, 'cafe', '.one-shot', 'concepts.json'), '--check'], { cwd: root, encoding: 'utf8', env: { ...process.env, ONE_SHOT_HISTORY: file } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /repeats a recent site/, 'its own earlier look is no repeat');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
