import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args as parse, forwardsOnly, num, nums, schemed } from '../skills/one-shot-site/scripts/lib/cli.mjs';

const SCRIPTS = resolve('skills/one-shot-site/scripts');
const script = (name, args, cwd) => spawnSync(process.execPath, [join(SCRIPTS, name), ...args], { cwd, encoding: 'utf8', timeout: 30000 });

// look and audit skip pages that only forward, so a redirect stub doesn't repeat its target's findings
test('a page that only forwards is told apart from a page', () => {
  assert.ok(forwardsOnly('<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=../#menu">'));
  assert.ok(forwardsOnly("<META HTTP-EQUIV='Refresh' CONTENT='0;URL=/'>"));
  assert.ok(!forwardsOnly('<meta name="description" content="Refresh your bike for spring"><h1>Fahrrad Hollerbach</h1>'));
  // a refresh for visitors without JavaScript, in a comment or written by a script: the page itself is real
  for (const html of ['<noscript><meta http-equiv="refresh" content="0; url=/basic/"></noscript><h1>Shop</h1>', '<!-- <meta http-equiv="refresh" content="0;url=/"> --><h1>Home</h1>',
    '<script>document.write(\'<meta http-equiv="refresh" content="5">\')</script><h1>Live</h1>']) assert.ok(!forwardsOnly(html), html);
});

// with every page a forward, look checked nothing and said "All clear."
test('look and safari stop when every page only forwards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-forwards-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<meta http-equiv="refresh" content="0; url=https://elsewhere.example/">');
    for (const s of ['look.mjs', 'safari.mjs']) {
      const r = script(s, [dir, '--out', join(dir, 'out')], dir);
      assert.equal(r.status, 2, s + r.stdout + r.stderr);
      assert.match(r.stderr, /No page to check in .+: every \.html file only forwards\. Name one with --pages\./, s);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Skill managers link a skill into place. Through the link, the scripts that can also be imported must still run.
test('the scripts run through a symlink or junction to their folder', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-link-'));
  const link = join(dir, 'scripts');
  try {
    try { symlinkSync(SCRIPTS, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { return t.skip(`this system refuses links (${e.code})`); }
    const run = (...args) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 30000 });
    for (const [file, want] of [['lint.mjs', /^lint: read the site's source/m], ['palette.mjs', /^palette: one brand colour in/m], ['redesign.mjs', /^redesign: read the site a person already has/m]]) {
      const r = run(join(link, file), '--help');
      assert.equal(r.status, 0, file + r.stderr);
      assert.match(r.stdout, want, file);
    }
    const p = run(join(link, 'palette.mjs'), '--brand', '#d9480f');
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /--accent: oklch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('number flags: the default when absent, a range, and one clear line otherwise', () => {
  assert.equal(num(undefined, '--seconds', { def: 2.4, min: 0.5, max: 30 }), 2.4);
  assert.equal(num('3', '--seconds', { def: 2.4, min: 0.5, max: 30 }), 3);
  assert.deepEqual(nums('1440,390', '--widths', { def: [390], min: 200, max: 4000, int: true }), [1440, 390]);
  assert.throws(() => num('abc', '--seconds', { def: 2.4, min: 0.5, max: 30 }), /^Error: --seconds takes a number from 0\.5 to 30, like 2\.4 \(got "abc"\)$/);
  assert.throws(() => num(true, '--steps', { def: 6, min: 1, max: 30, int: true }), /--steps takes a whole number .*\(got nothing\)/);
  assert.throws(() => num('2.5', '--steps', { def: 6, min: 1, max: 30, int: true }), /whole number/);
  for (const bad of ['abc', '0', '-5', '390,', '390,abc']) {
    assert.throws(() => nums(bad, '--widths', { def: [390, 1440], min: 200, max: 4000, int: true }), /^Error: --widths takes whole numbers from 200 to 4000, like 390,1440 \(got "/, bad);
  }
});

// A dark run with the same --out as the light one wrote over the light sheets: the scheme goes on a given name too
test('--scheme puts its suffix on a folder or file given with --out, as on the default names', () => {
  assert.equal(schemed('.one-shot/look', ''), '.one-shot/look');
  assert.equal(schemed('.one-shot/look', '-dark'), '.one-shot/look-dark');
  assert.equal(schemed('C:\\runs\\out\\', '-dark'), 'C:\\runs\\out-dark');
  assert.equal(schemed('/runs/out/look-dark', '-dark'), '/runs/out/look-dark', 'a name that has it keeps it once');
  assert.equal(schemed('.one-shot/audit.md', '-dark', true), '.one-shot/audit-dark.md');
  assert.equal(schemed('reports/v1.2/audit', '-light', true), 'reports/v1.2/audit-light');
  assert.equal(schemed('reports/audit-dark.md', '-dark', true), 'reports/audit-dark.md');
  // and every script with --scheme and --out goes through it
  for (const s of ['look.mjs', 'film.mjs', 'safari.mjs', 'audit.mjs']) assert.match(readFileSync(join(SCRIPTS, s), 'utf8'), /schemed\(a\.out \|\|/, s);
});

// Each one stops before a browser starts: no Chrome is needed to see the message.
test('a bad number stops every script that takes one, with exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-num-'));
  try {
    writeFileSync(join(dir, 'a.jpg'), 'not really a photo');
    writeFileSync(join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
    const cases = [
      ['look.mjs', 'dist', '--widths', 'abc'], ['look.mjs', 'dist', '--widths', '0'], ['look.mjs', 'dist', '--widths', '-5'], ['look.mjs', 'dist', '--frames', 'x'],
      ['film.mjs', 'dist', '--seconds', 'abc'], ['film.mjs', 'dist', '--seconds', '0'], ['film.mjs', 'dist', '--seconds', '-3'], ['film.mjs', 'dist', '--steps', '0'], ['film.mjs', 'dist', '--width', 'abc'],
      ['images.mjs', 'og', 'dist', '--wait', 'abc'], ['images.mjs', 'photo', 'a.jpg', '--widths', 'abc'], ['images.mjs', 'photo', 'a.jpg', '--quality', '80'],
      ['images.mjs', 'photo', 'a.jpg', '--format', 'png'], ['images.mjs', 'icon', '--svg', 'icon.svg', '--pad', '99'],
      ['photos.mjs', 'search', 'bread', '--count', 'abc'], ['photos.mjs', 'search', 'bread', '--page', '0'], ['photos.mjs', 'search', 'bread', '--shape', 'round'], ['photos.mjs', 'search', 'bread', '--from', 'google'],
      ['redesign.mjs', 'https://old.example', '--max', 'abc'], ['redesign.mjs', 'https://old.example', '--wait', '-1'], ['redesign.mjs', 'compare', 'https://old.example', 'dist', '--wait', 'soon'],
      ['safari.mjs', 'dist', '--widths', 'abc'], ['safari.mjs', 'dist', '--frames', 'abc'],
    ];
    for (const [name, ...args] of cases) {
      const r = script(name, args, dir);
      assert.equal(r.status, 2, `${name} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /--(widths|frames|seconds|steps|width|wait|quality|format|pad|count|page|shape|from|max) takes /, `${name} ${args.join(' ')}: ${r.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const ALL = ['audit', 'film', 'images', 'lint', 'look', 'mockup', 'new-site', 'palette', 'photos', 'publish', 'redesign', 'safari', 'set-url', 'study'];

test('-h, --help and a first "help" print the help and exit 0, in every script', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-help-'));
  try {
    for (const s of ALL) {
      for (const flag of ['-h', '--help', 'help']) {
        const r = script(`${s}.mjs`, [flag], dir);
        assert.equal(r.status, 0, `${s} ${flag}: ${r.stderr}`);
        assert.match(r.stdout, new RegExp(`^${s}: `, 'm'), `${s} ${flag}`);
      }
    }
    // after a subcommand or a folder, too
    assert.equal(script('redesign.mjs', ['compare', '-h'], dir).status, 0);
    assert.equal(script('lint.mjs', ['.', '-h'], dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a typo in a flag ran the defaults and reported on pages or widths nobody asked about
test('an unknown flag stops with the nearest real one, before anything runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-flags-'));
  try {
    for (const [s, args, want] of [
      ['look', ['dist', '--pagess', '/about'], /^Unknown option --pagess \(did you mean --pages\?\)\. node look\.mjs --help lists them\.$/],
      ['look', ['dist', '--width', '390'], /--width \(did you mean --widths\?\)/],
      ['look', ['dist', '--widthz=390'], /--widthz \(did you mean --widths\?\)/],
      ['audit', ['dist', '--nope'], /^Unknown option --nope\. node audit\.mjs --help lists them\.$/],
      ['film', ['dist', '--second', '2'], /did you mean --seconds/],
      ['publish', ['branch', '--repo', 'x', '--dyr'], /did you mean --dry/],
      ['palette', ['--brand', '#d9480f', '--strategie', 'quiet'], /did you mean --strategy/],
      ['mockup', ['--name', 'X', '--mood', 'warm'], /^Unknown option --mood \(did you mean --moods\?\)/],
      ['set-url', ['.', 'https://x.example', '--force'], /Unknown option --force/],
      ['lint', ['--fix'], /Unknown option --fix/],
      ['new-site', ['x', '--name', 'X', '--adons', 'motion'], /did you mean --addons/],
    ]) {
      const r = script(`${s}.mjs`, args, dir);
      assert.equal(r.status, 2, `${s} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr.trim(), want, `${s} ${args.join(' ')}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a flag with nothing after it was taken as true: a folder called "true", a page called "true", "--name true"
test('a flag that needs a value stops without one, with the header\'s example; switches and --sheet need none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-bare-flag-'));
  try {
    for (const [s, args, want] of [
      ['look', ['dist', '--out'], /^--out needs a value after it, for example: --out \.one-shot\/look$/],
      ['look', ['dist', '--pages', '--headed'], /^--pages needs a value after it, for example: --pages \/,\/about$/],
      ['publish', ['vercel', '--name', '--dry'], /^--name needs a value after it, for example: --name my-site$/],
      ['new-site', ['x', '--name'], /^--name needs a value after it, for example: --name "Rosa's Bakery"$/],
      ['photos', ['search', 'bread', '--dir'], /^--dir needs a value after it\.$/],
      ['audit', ['dist', '--site'], /^--site needs a value after it, for example: --site \.$/],
    ]) {
      const r = script(`${s}.mjs`, args, dir);
      assert.equal(r.status, 2, `${s} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr.trim(), want, `${s} ${args.join(' ')}`);
    }
    // parsed only: drawing the sheet would start a browser
    assert.deepEqual(parse(pathToFileURL(join(SCRIPTS, 'palette.mjs')).href, ['--brand', '#d9480f', '--sheet']), { _: [], brand: '#d9480f', sheet: true }, 'palette --sheet alone');
    assert.doesNotMatch(script('mockup.mjs', ['--concepts', 'nope.json', '--check'], dir).stderr, /needs a value/, 'mockup --check is a switch');
    assert.ok(!existsSync(join(dir, 'true')), 'no folder called "true"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('palette takes only the documented modes, strategies, grounds and colours', () => {
  for (const [args, want] of [
    [['--brand', '#d9480f', '--mode', 'blue'], /--mode takes light or dark \(got "blue"\)/],
    [['--brand', '#d9480f', '--strategy', 'loud'], /--strategy takes quiet, committed or drenched/],
    [['--brand', '#d9480f', '--ground', 'purple'], /--ground takes warm, cool, neutral, brand or a colour/],
    [['--brand', '#d9480f', '--mood', 'loud'], /--mood takes quiet, bold, warm, night, editorial, playful \(got "loud"\)/],
    [['--brand', '#12'], /"#12" is not a colour/],
    [['--brand', 'notacolor'], /"notacolor" is not a colour/],
    [['--logo', 'no-such-logo.svg'], /No file at no-such-logo\.svg/],
  ]) {
    const r = script('palette.mjs', args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, want, args.join(' '));
  }
  const ok = script('palette.mjs', ['--brand', '#d9480f', '--mode', 'dark', '--strategy', 'committed', '--ground', 'warm']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /committed, dark, warm ground, from #d9480f/);
  const cream = script('palette.mjs', ['--brand', '#2f6f4e', '--mood', 'warm']);
  assert.equal(cream.status, 0, cream.stderr);
  assert.match(cream.stdout, /committed, light, warm ground \(warm\), from #2f6f4e/);
  assert.match(cream.stdout, /--ground: oklch\(95\.0% 0\.019 80\.0\)/, 'a Warm green brand on cream, not sage');
});
