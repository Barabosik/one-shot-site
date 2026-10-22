import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lint, untranslatedName } from '../skills/one-shot-site/scripts/lint.mjs';

function site(files) {
  const dir = mkdtempSync(join(tmpdir(), 'oss-lint-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

test('catches the usual generated-page habits', () => {
  const dir = site({
    'index.html': `<meta name="viewport" content="width=device-width, maximum-scale=1">
      <p class="eyebrow">New</p><svg width="20"><use href="#x"/></svg><h1>Unleash your potential</h1><img src="a.jpg"><a href="#">Learn more</a>`,
    'src/style.css': `.card { transition: all .3s; } .x { background-clip: text; } .h { height: 100vh; } a:hover { color: red }
      @keyframes pop { from { transform: scale(0) } }`,
  });
  const found = new Set(lint(dir).map((f) => f.rule));
  for (const r of ['no-zoom', 'eyebrow', 'img-no-alt', 'dead-link', 'transition-all', 'gradient-text', 'vh-height', 'svg-viewbox', 'scale-zero', 'filler-words', 'reduced-motion', 'hover-guard', 'focus', 'selection']) {
    assert.ok(found.has(r), `expected ${r}, got ${[...found].join(', ')}`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('overused fonts are found in font tokens too, and an allow line with a reason quiets one', () => {
  const dir = site({
    'index.html': '<h1>Rosa’s Bakery</h1>',
    'src/tokens.css': `:root {
      --font-display: 'Montserrat Variable', system-ui, sans-serif;
      /* one-shot: allow overused-font: the menu board's face */
      --font-text: 'Open Sans Variable', system-ui, sans-serif;
      --font-mono: ui-monospace, monospace; }`,
  });
  const fonts = lint(dir).filter((f) => f.rule === 'overused-font');
  assert.deepEqual(fonts.map((f) => f.where), ['src/tokens.css:2']);
  rmSync(dir, { recursive: true, force: true });
  const inter = site({ 'index.html': '<h1>Rosa’s Bakery</h1>', 'src/tokens.css': ":root { --font-text: 'Inter Variable', system-ui, sans-serif; }" });
  assert.deepEqual(lint(inter).filter((f) => f.rule === 'overused-font').map((f) => f.where), ['src/tokens.css:1'], 'Inter alone is spent');
  rmSync(inter, { recursive: true, force: true });
  // a serif headline is welcome on a calm page: the serifs once on the list pass
  const serif = site({ 'index.html': '<h1>Rosa’s Bakery</h1>', 'src/tokens.css': ":root { --font-display: 'Young Serif Variable', Georgia, serif; --font-text: 'Literata Variable', Georgia, serif; }" });
  assert.deepEqual(lint(serif).filter((f) => f.rule === 'overused-font'), [], 'Young Serif and Literata are fine');
  rmSync(serif, { recursive: true, force: true });
});

// The charity's hours came out with slashed zeros (Atkinson Hyperlegible Next as the text face): a time or a price
// with a code zero reads as a terminal. A mono face on --font-mono, for code, is fine.
test('slashed zeros: a code face or Atkinson as a text or display face, or the slashed-zero setting', () => {
  const dir = site({
    'index.html': '<h1>Rosa’s Bakery</h1><p class="hours">Open 07:00–18:00</p>',
    'src/tokens.css': `:root {
      --font-text: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;
      --font-display: 'JetBrains Mono Variable', monospace;
      --font-mono: 'JetBrains Mono Variable', monospace; }`,
    'src/style.css': `.hours { font-variant-numeric: tabular-nums slashed-zero; }
      .price { font-feature-settings: "zero" 1; }
      .times { font-variant-numeric: tabular-nums; font-family: var(--font-text); }`,
  });
  const found = lint(dir).filter((f) => f.rule === 'slashed-zero');
  assert.deepEqual(found.map((f) => f.where).sort(), ['src/style.css:1', 'src/style.css:2', 'src/tokens.css:2', 'src/tokens.css:3']);
  assert.match(found[0].text, /^A zero with a slash or a dot reads as code/);
  rmSync(dir, { recursive: true, force: true });
});

test('a clean page has nothing to fix', () => {
  const dir = site({
    'index.html': '<h1>Rosa’s Bakery</h1><img src="a.jpg" alt="A loaf on the counter"><a href="/menu">See the menu</a>',
    'src/style.css': `::selection { background: var(--accent) } :focus-visible { outline: 2px solid }
      .b { transition: opacity 200ms } .hero { min-height: 100vh;
      min-height: 100svh; } @media (hover: hover) { a:hover { color: var(--accent) } }
      @media (prefers-reduced-motion: reduce) { * { transition-duration: 1ms } }`,
  });
  const found = lint(dir);
  assert.deepEqual(found.filter((f) => f.level === 'fail'), []);
  assert.ok(!found.some((f) => f.rule === 'vh-height'), 'a 100vh fallback before 100svh is correct');
  rmSync(dir, { recursive: true, force: true });
});

test('a scroll listener counts as passive when the options come after a long handler', () => {
  const dir = site({
    'src/ok.js': "addEventListener('scroll', () => {\n  const y = scrollY;\n  document.body.style.setProperty('--y', y);\n  if (y > 10) go();\n}, { passive: true });",
    'src/bad.js': "addEventListener('scroll', () => {\n  go();\n});\nconst passive = 1;",
  });
  const where = lint(dir).filter((f) => f.rule === 'scroll-listener').map((f) => f.where);
  assert.deepEqual(where, ['src/bad.js:1']);
  rmSync(dir, { recursive: true, force: true });
});

test('allow comments silence one line', () => {
  const dir = site({ 'src/a.css': '.a { transition: all 1s; } /* one-shot: allow transition-all */' });
  assert.ok(!lint(dir).some((f) => f.rule === 'transition-all'));
  rmSync(dir, { recursive: true, force: true });
});

// an object stopped lint with "is not iterable" and no file named; a string allowed each of its letters
test('.one-shot/allow.json must be a list of rule names, and says so with its path', () => {
  for (const bad of ['{ "rules": ["transition-all"] }', '"transition-all"', '[1]', 'null']) {
    const dir = site({ 'src/a.css': '.a { color: red }', '.one-shot/allow.json': bad });
    try { assert.throws(() => lint(dir), /allow\.json should be a list of rule names like \["transition-all"\]/, bad); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const ok = site({ 'src/a.css': '.a { transition: all 1s; }', '.one-shot/allow.json': '["transition-all"]' });
  try { assert.ok(!lint(ok).some((f) => f.rule === 'transition-all')); } finally { rmSync(ok, { recursive: true, force: true }); }
});

test('theme-color that drifted from the ground after a new palette is flagged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-lint-bar-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/tokens.css'), ':root {\n  --ground: oklch(37.6% 0.055 135.7);         /* #34482a, page background */\n}\n');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="en"><meta name="theme-color" content="#fff9f6"><title>x</title>');
  assert.match(lint(dir).find((f) => f.rule === 'theme-color')?.text || '', /#fff9f6.*#34482a/);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="en"><meta name="theme-color" content="#34482a"><title>x</title>');
  assert.equal(lint(dir).filter((f) => f.rule === 'theme-color').length, 0);
  rmSync(dir, { recursive: true, force: true });
});

// "Nothing blocking" on a folder that holds no site read as a pass, and a wrong path came out as Node's ENOENT
test('lint on a folder without a site, a missing folder or a file stops with exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-lint-nosite-'));
  try {
    writeFileSync(join(dir, 'notes.txt'), 'not a site');
    const run = (...args) => spawnSync(process.execPath, [resolve('skills/one-shot-site/scripts/lint.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    for (const [args, want] of [[[], /^Stopped: No site in .+ \(no index\.html\)\. Pass the site's folder\.$/], [['nope'], /^Stopped: No such folder: .+nope$/], [['notes.txt'], /^Stopped: Not a folder: .+notes\.txt$/]]) {
      const r = run(...args);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stderr.trim(), want);
    }
    const into = spawnSync(process.execPath, [resolve('skills/one-shot-site/scripts/new-site.mjs'), 'notes.txt', '--name', 'X', '--no-install'], { cwd: dir, encoding: 'utf8' });
    assert.equal(into.status, 2);
    assert.match(into.stderr, /Not a folder: .+notes\.txt/);
    mkdirSync(join(dir, 'src'));
    assert.equal(run().status, 0, 'a src/ folder is a site');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// the browser moves a <dl> or <ul> out of a <p> without a word, so the block lands outside its paragraph
test('a site: block marker inside a paragraph is a fault; on its own line, or an if inside one, is fine', () => {
  const dir = site({
    'index.html': `<h1>Café</h1>
<p>Open: <!-- site:hours --></p>
<p class="where">
  Find us at <!-- site:address -->
</p>
<p>Book <!-- site:if links.booking --><a href="{{site.links.booking}}">online</a><!-- site:end --></p>
<section><h2>Menu</h2>
  <!-- site:menu h3 -->
</section>
<p>Before a div<div><!-- site:events h3 --></div>
<script>const s = '<p><!-- site:hours -->';</script>`,
  });
  const found = lint(dir).filter((f) => f.rule === 'block-in-p');
  assert.deepEqual(found.map((f) => f.where), ['index.html:2', 'index.html:4']);
  assert.equal(found[0].level, 'fail');
  assert.match(found[0].text, /<!-- site:hours --> is inside a <p>.*Put the marker on its own line, outside the paragraph\./);
  rmSync(dir, { recursive: true, force: true });
});

test('svg-viewbox passes over a hidden sprite of symbols', () => {
  const dir = site({
    'index.html': `<h1>Icons</h1>
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <!-- the icons, used with <use href="#i-cup"> -->
  <symbol id="i-cup" viewBox="0 0 24 24"><path d="M4 4h12v8H4z"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><circle cx="12" cy="10" r="4"/></symbol>
</svg>
<svg width="0" height="0" class="defs"><defs><symbol id="i-x" viewBox="0 0 1 1"><path d="M0 0"/></symbol></defs></svg>
<svg class="drawing"><symbol id="i-y" viewBox="0 0 1 1"></symbol><circle r="4"/></svg>`,
  });
  assert.deepEqual(lint(dir).filter((f) => f.rule === 'svg-viewbox').map((f) => f.where), ['index.html:8'], 'only the svg that draws something itself');
  rmSync(dir, { recursive: true, force: true });
});

// Chrome's translate turned "Kleiner Kaffee" into "Small coffee": the name in the header, the footer and the h1 is
// kept with translate="no", on the element that holds it or one around it.
test('translate-name: the business name in the header, footer and h1 needs translate="no"', () => {
  const dir = site({
    'site.json': JSON.stringify({ name: 'Kleiner Kaffee' }),
    'index.html': `<header><a class="wordmark" href="/">{{site.name}}</a><nav><a href="#menu">Menu</a></nav></header>
<main><h1>Kleiner Kaffee, eight seats on Röstergasse</h1>
<p>Kleiner Kaffee roasts on Mondays.</p></main>
<footer><p>© 2026 <span translate="no">{{site.name}}</span></p><p translate="no"><a href="/">Kleiner Kaffee</a></p><img alt="Kleiner Kaffee" src="a.jpg"></footer>`,
    'about.html': '<footer><p>{{site.name}}</p><p>Kleiner Kaffee</p></footer>',
    'og.html': '<h1>{{site.name}}</h1>',
  });
  const found = lint(dir).filter((f) => f.rule === 'translate-name').sort((x, y) => x.where.localeCompare(y.where));
  assert.deepEqual(found.map((f) => f.where), ['about.html:1', 'index.html:1', 'index.html:2'], 'the header and the h1; the footer keeps it, the paragraph and the alt text are not asked; og.html is only photographed');
  assert.match(found[0].text, /^The name in the footer \(\{\{site\.name\}\}\) can be translated/, 'once for the footer, at the first place the name stands');
  assert.match(found[1].text, /^The name in the header \(\{\{site\.name\}\}\) can be translated/);
  assert.match(found[2].text, /^The name in the h1 "Kleiner Kaffee" can be translated/);
  rmSync(dir, { recursive: true, force: true });
});

test('form-field: email, phone, name and postcode fields get their type, autocomplete, inputmode and a label', () => {
  const dir = site({
    'site.json': JSON.stringify({ name: 'Kleiner Kaffee', address: { country: 'DE' } }),
    'index.html': `<form>
<label for="em">Email</label><input id="em" name="email" type="text">
<label>Phone <input name="phone" type="tel" autocomplete="tel"></label>
<input name="name" placeholder="Your name">
<label for="plz">Postleitzahl</label><input id="plz" name="plz" autocomplete="postal-code">
<label for="nm-2">Vorname</label><input id="nm" name="first"> <label for="ln">Nachname</label><input id="ln" name="last">
<label for="tel">Telephone</label><input id="tel" name="telephone">
<label for="mail2">E-Mail</label><input id="mail2" name="mail2" type="email" autocomplete="email" spellcheck="false">
<input name="company" autocomplete="organization" aria-label="Company">
<input type="text" name="_gotcha" tabindex="-1" class="hp">
</form>`,
  });
  const found = lint(dir).filter((f) => f.rule === 'form-field');
  assert.deepEqual(found.map((f) => f.where), ['index.html:2', 'index.html:4', 'index.html:5', 'index.html:6', 'index.html:7'], 'the good fields, the company and the honeypot are not named');
  assert.equal(found[0].text, 'The email field (name="email") needs type="email", autocomplete="email" and spellcheck="false", so a phone shows the right keyboard, the browser can fill it in and the address is not marked as a typo.');
  assert.equal(found[1].text, 'The name field (name="name") needs autocomplete="name" and a <label>, so the browser can fill it in and a screen reader can name it.');
  assert.equal(found[2].text, 'The postcode field (name="plz") needs inputmode="numeric", so a phone shows the number keys.');
  assert.equal(found[3].text, 'The name field (name="last") needs autocomplete="family-name", so the browser can fill it in.');
  assert.equal(found[4].text, 'The phone field (name="telephone") needs type="tel" and autocomplete="tel", so a phone shows the right keyboard and the browser can fill it in.');
  // the label for "nm-2" is not the label for "nm": the field named "first" has no label, so no known purpose
  rmSync(dir, { recursive: true, force: true });
});

test('the starter keeps its name from translation', () => {
  assert.deepEqual(untranslatedName(readFileSync(resolve('skills/one-shot-site/assets/starter/index.html'), 'utf8'), ['{{site.name}}']), []);
  for (const f of ['impressum', 'datenschutz']) assert.deepEqual(untranslatedName(readFileSync(resolve(`skills/one-shot-site/assets/legal/de/${f}.html`), 'utf8'), ['{{site.name}}']), [], f);
});
