import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileFor, open, serve } from '../skills/one-shot-site/scripts/lib/serve.mjs';

// Browsers open a connection before they need it and keep it until they quit. The scripts close the server
// before the browser, so close() must not wait for that connection.
test('serve closes while a connection is still open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-serve-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
  const s = await serve(dir);
  const res = await fetch(s.url + '/');
  assert.equal(res.status, 200);
  await res.text();
  const { port } = new URL(s.url);
  const sock = connect(Number(port), '127.0.0.1');
  sock.on('error', () => {});
  await new Promise((r) => sock.once('connect', r));
  const closed = await Promise.race([s.close().then(() => true), new Promise((r) => setTimeout(() => r(false), 3000))]);
  sock.destroy();
  assert.ok(closed, 'close() waited for an idle connection');
});

// Running a check bare to read its options must not start a browser: with no dist and no dev server, the help.
test('look and film with no target, no dist and no dev server print their help', async (t) => {
  try { await fetch('http://localhost:5173', { signal: AbortSignal.timeout(1000) }); return t.skip('a dev server is running on 5173'); } catch {}
  const dir = mkdtempSync(join(tmpdir(), 'oss-bare-'));
  for (const s of ['look', 'film']) {
    const r = spawnSync(process.execPath, [resolve(`skills/one-shot-site/scripts/${s}.mjs`)], { cwd: dir, encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 2, s + r.stderr);
    assert.match(r.stderr, /No dist folder here/);
    assert.match(r.stderr, new RegExp(`^${s}:`, 'm'));
  }
});

// A folder with no site in it is bad input, before any browser starts: an empty dist was looked at, found empty
// and called "All clear".
test('open refuses a file and a folder without index.html; redesign may open one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-open-'));
  try {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/readme.txt'), 'not a site');
    writeFileSync(join(dir, 'page.html'), '<!doctype html><title>x</title>');
    await assert.rejects(open(join(dir, 'dist')), /^Error: No index\.html in .+dist\. Build first/);
    await assert.rejects(open(join(dir, 'page.html')), /page\.html is a file\. Pass its folder\./);
    const old = await open(join(dir, 'dist'), { index: false });
    assert.equal((await fetch(old.url + '/readme.txt')).status, 200);
    await old.close();
    for (const s of [['look.mjs'], ['film.mjs'], ['images.mjs', 'og'], ['safari.mjs']]) {
      for (const [target, want] of [['dist', /No index\.html in .+dist\. Build first/], ['page.html', /page\.html is a file\. Pass its folder\./]]) {
        const r = spawnSync(process.execPath, [resolve(`skills/one-shot-site/scripts/${s[0]}`), ...s.slice(1), target], { cwd: dir, encoding: 'utf8', timeout: 20000 });
        assert.equal(r.status, 2, `${s.join(' ')} ${target}: ${r.stdout}${r.stderr}`);
        assert.match(r.stderr, want, s.join(' '));
      }
    }
    assert.ok(!existsSync(join(dir, '.one-shot')), 'nothing is written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A page open during look or audit can ask this server for anything. A path that climbs out of the folder (even into
// a sibling whose name starts the same), one through a link that points out of it, or one with a broken % escape is
// a 404, the file next door stays unread, and the run goes on.
test('serve answers a path out of the folder, through a link out of it, or with a bad % escape, with 404', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-serve-out-'));
  const site = join(dir, 'site');
  mkdirSync(join(site, 'inside'), { recursive: true });
  mkdirSync(join(dir, 'site-evil'));
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(site, 'a b.txt'), 'inside');
  writeFileSync(join(site, 'inside/a.txt'), 'inner');
  writeFileSync(join(dir, 'secret.txt'), 'outside');
  writeFileSync(join(dir, 'site-evil', 'x.txt'), 'next door');
  symlinkSync(join(dir, 'site-evil'), join(site, 'assets'), 'junction'); // a junction needs no rights on Windows
  symlinkSync(join(site, 'inside'), join(site, 'alias'), 'junction');
  const s = await serve(site);
  const { port } = new URL(s.url);
  // raw paths: fetch() would tidy some of them before they are sent. A server that died answers nothing: fail then.
  const get = (path) => new Promise((ok, no) => request({ host: '127.0.0.1', port, path, timeout: 3000 }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); })
    .on('timeout', function () { this.destroy(new Error(`no answer to ${path}`)); }).on('error', no).end());
  try {
    assert.equal(await get('/a%20b.txt'), 200, 'an encoded name inside the folder is served');
    assert.equal(await get('/alias/a.txt'), 200, 'a link that stays inside the folder is served');
    for (const p of ['/..%2fsecret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt', '/a/..%2f..%2fsecret.txt', '/..%2fsite-evil%2fx.txt', '/assets/x.txt', '/50%off.png'])
      assert.equal(await get(p), 404, `${p} is not served`);
    assert.equal(await get('/'), 200, 'the server is still up');
    assert.equal(fileFor(site, '/..%2fsecret.txt'), null);
    assert.equal(fileFor(site, '/assets/x.txt'), null);
    assert.equal(fileFor(site, '/50%off.png'), null);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

// look and audit can run on a project root. A page in another tab that points a name of its own at 127.0.0.1 (DNS
// rebinding) got 200 for /.env: now only 127.0.0.1 and localhost with this port are answered, and a name starting
// with a dot is never served, except /.well-known/.
test('serve answers only its own host name, and serves no dot file but /.well-known/', { timeout: 15000 }, async () => {
  const site = mkdtempSync(join(tmpdir(), 'oss-serve-host-'));
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(site, '.env'), 'TOKEN=x');
  mkdirSync(join(site, '.git'));
  writeFileSync(join(site, '.git/config'), '[core]');
  mkdirSync(join(site, '.well-known'));
  writeFileSync(join(site, '.well-known/security.txt'), 'Contact: mailto:hello@example.com');
  const s = await serve(site);
  const { port } = new URL(s.url);
  const get = (path, host) => new Promise((ok, no) => request({ host: '127.0.0.1', port, path, timeout: 3000, headers: host ? { host } : {} }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode)); })
    .on('timeout', function () { this.destroy(new Error(`no answer to ${path}`)); }).on('error', no).end());
  try {
    assert.equal(await get('/'), 200, '127.0.0.1 with its port');
    assert.equal(await get('/', `localhost:${port}`), 200);
    assert.equal(await get('/', `LOCALHOST:${port}`), 200, 'a host name in capitals is the same name');
    for (const host of ['attacker.example', `attacker.example:${port}`, '127.0.0.1', `127.0.0.1:${Number(port) + 1}`, `localhost.attacker.example:${port}`])
      assert.equal(await get('/', host), 403, host);
    for (const p of ['/.env', '/%2eenv', '/.git/config', '/.well-known/..%2f.env', '/.well-known%2f..%2f.env'])
      assert.equal(await get(p), 404, `${p} is not served`);
    assert.equal(await get('/.well-known/security.txt'), 200);
    assert.equal(fileFor(site, '/.env'), null);
  } finally { await s.close(); rmSync(site, { recursive: true, force: true }); }
});
