// safari.mjs looks at a site in Playwright's WebKit. Playwright is not a dependency of this repo, so the run in
// WebKit is skipped unless it can be found (`npm i -D playwright && npx playwright install webkit`, in the folder
// the tests run from); what happens without it, and the help, are tested everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL, loadPlaywright, webkitOf } from '../skills/one-shot-site/scripts/lib/playwright.mjs';

const SAFARI = fileURLToPath(new URL('../skills/one-shot-site/scripts/safari.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [SAFARI, ...args], { cwd, encoding: 'utf8', timeout: 240000 });
const tempDir = (name) => realpathSync(mkdtempSync(join(tmpdir(), name)));

// can the process find Playwright from this folder? (the folder a command runs in is one of the places looked in)
async function playwrightFrom(dir) {
  const was = process.cwd();
  process.chdir(dir);
  try { return await loadPlaywright(); } finally { process.chdir(was); }
}
const here = await playwrightFrom(process.cwd());
const webkit = webkitOf(here);
let installed = false;
try { installed = !!webkit && existsSync(webkit.executablePath()); } catch {}
const skip = installed ? false : 'Playwright with WebKit is not installed here';

test('safari says how to get Playwright when it is missing, and exits 2', async (t) => {
  const dir = tempDir('oss-safari-none-');
  try {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><title>Nothing</title>');
    if (await playwrightFrom(dir)) return t.skip('Playwright can be found from a temporary folder on this machine');
    const r = run(['dist'], dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.equal(r.stderr.trim().split('\n').length, 1, 'one line');
    assert.ok(r.stderr.includes(INSTALL), r.stderr);
    assert.ok(!existsSync(join(dir, '.one-shot')), 'nothing is written without a browser');
    // the last run's verdict goes first, so a run that stops here leaves no old "All clear." to read
    mkdirSync(join(dir, '.one-shot/safari'), { recursive: true });
    for (const f of ['report.md', 'report.json']) writeFileSync(join(dir, '.one-shot/safari', f), 'All clear.');
    assert.equal(run(['dist'], dir).status, 2);
    assert.deepEqual(readdirSync(join(dir, '.one-shot/safari')), [], 'the old report is gone');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('safari prints its usage: with --help, and with no site to look at', async () => {
  const dir = tempDir('oss-safari-help-');
  try {
    const help = run(['--help'], dir);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--widths 390,1440/);
    assert.match(help.stdout, /npm i -D playwright/, 'the help says where Playwright comes from');
    // no dist folder and no dev server: the help, before anything else (skipped when a dev server runs on 5173)
    let devServer = false;
    try { await fetch('http://localhost:5173', { signal: AbortSignal.timeout(1000) }); devServer = true; } catch {}
    if (devServer) return;
    const bare = run([], dir);
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /No dist folder here/);
    assert.match(bare.stderr, /^safari: look at the site in WebKit/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('safari finds faults planted in a page, in WebKit', { skip, timeout: 240000 }, () => {
  const dir = tempDir('oss-safari-faults-');
  try {
    writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Faults</title><link rel="icon" href="data:,">
      <body style="margin:0;font:18px/1.5 sans-serif;background:#fff">
        <h1 style="padding:0 16px">A page with problems</h1>
        <div style="width:1400px;padding:0 16px">This row is far wider than a phone.</div>
        <p style="color:#c8c8c8;padding:0 16px">Pale grey text that nobody can read on white.</p>
        <p style="opacity:0;padding:0 16px">This paragraph waits for a reveal that never comes.</p>
        <img src="missing.png" alt="Missing picture" width="200" height="100">
        <script>notDefinedAnywhere();</script>
      </body></html>`);
    const out = join(dir, 'out');
    const r = run([dir, '--widths', '390', '--frames', '1', '--out', out], process.cwd());
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    assert.equal(report.engine, 'webkit');
    const rules = new Set(report.findings.map((f) => f.rule));
    for (const want of ['overflow-x', 'contrast', 'never-shown', 'broken-image', 'script-error', 'request']) assert.ok(rules.has(want), `missing ${want}: got ${[...rules].join(', ')}`);
    assert.match(r.stdout, /Engine: WebKit/);
    for (const f of ['sheet-home-390.jpg', 'home-390-0.jpg', 'report.md']) assert.ok(existsSync(join(out, f)), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('safari passes a clean two-page site, and a page it cannot find is a fault, not a crash', { skip, timeout: 240000 }, () => {
  const dir = tempDir('oss-safari-clean-');
  try {
    const page = (title, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title><link rel="icon" href="data:,">
      <body style="margin:0;font:18px/1.5 Georgia,serif;background:oklch(97% 0.01 80);color:#222"><main style="padding:24px 16px">${body}</main></body></html>`;
    mkdirSync(join(dir, 'about'));
    writeFileSync(join(dir, 'index.html'), page('Corner Bakery', '<h1>Bread at seven</h1><p>Sourdough from a stone oven.</p><a href="/about/">About</a>'));
    writeFileSync(join(dir, 'about/index.html'), page('About', '<h1>About the bakery</h1><p>Two bakers and one oven.</p>'));
    // an old address that only forwards to the new one is not a page to look at
    mkdirSync(join(dir, 'old-menu'));
    writeFileSync(join(dir, 'old-menu/index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/about/">');
    const out = join(dir, 'out');
    const r = run([dir, '--widths', '390,1440', '--frames', '1', '--out', out], process.cwd());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    assert.deepEqual(report.pages, ['/', '/about/'], 'the forwarding stub is skipped');
    assert.deepEqual(report.findings, [], 'a clean page shows no fault in WebKit either');
    for (const f of ['sheet-home-390.jpg', 'sheet-home-1440.jpg', 'sheet-about-390.jpg', 'sheet-about-1440.jpg']) assert.ok(existsSync(join(out, f)), f);

    // a page that does not exist is answered 404: the visit shows the error page, and it is reported as a failed request
    const missing = run([dir, '--pages', '/nowhere/', '--widths', '390', '--frames', '1', '--out', join(dir, 'out2')], process.cwd());
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stdout, /\[request\] 404/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
