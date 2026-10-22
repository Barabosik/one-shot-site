import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// publish.mjs without the internet: --dry for every host, and the branch route pushed to a bare repository on disk.
// Git sees no global or system config, so the machine's own identity never reaches a test commit.
const PUBLISH = resolve('skills/one-shot-site/scripts/publish.mjs');

function setup() {
  // the real path: on macOS the temp folder is a link (/var -> /private/var), and publish.mjs prints where it really is
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oss-publish-')));
  const site = join(dir, 'site');
  mkdirSync(join(site, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(site, 'dist', 'index.html'), '<!doctype html><title>Kleiner Kaffee</title>');
  writeFileSync(join(site, 'dist', 'assets', 'main.js'), 'console.log(1)');
  writeFileSync(join(dir, 'gitconfig'), '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_DIR', 'GIT_WORK_TREE']) delete env[k];
  const run = (...args) => spawnSync(process.execPath, [PUBLISH, ...args], { cwd: site, env, encoding: 'utf8' });
  const git = (args, cwd = site) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  return { dir, site, dist: join(site, 'dist'), run, git, env, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('publish --dry prints each host\'s command and runs nothing', () => {
  const t = setup();
  try {
    const vercel = t.run('vercel', '--name', 'kleiner-kaffee', '--dry');
    assert.equal(vercel.status, 0, vercel.stderr);
    assert.ok(vercel.stdout.includes(`$ npx --yes vercel@latest deploy ${t.dist} --prod --yes --name kleiner-kaffee`), vercel.stdout);
    // without --name the project is named after the folder: every site would land in one project called "dist"
    const unnamed = t.run('vercel', '--dry');
    assert.equal(unnamed.status, 2, 'no --name');
    assert.match(unnamed.stderr, /Pass --name my-site/);
    assert.doesNotMatch(unnamed.stdout, /\$ npx/);

    const netlify = t.run('netlify', '--name', 'kleiner-kaffee', '--dry');
    assert.equal(netlify.status, 0, netlify.stderr);
    assert.ok(netlify.stdout.includes(`$ npx --yes netlify-cli@latest deploy --prod --dir=${t.dist} --json --site-name=kleiner-kaffee`), netlify.stdout);

    const cf = t.run('cloudflare', '--name', 'kleiner-kaffee', '--dry');
    assert.equal(cf.status, 0, cf.stderr);
    assert.ok(cf.stdout.includes(`$ npx --yes wrangler@latest deploy --config ${join(t.site, '.one-shot', 'wrangler.json')} --name kleiner-kaffee`), cf.stdout);
    // without a config Cloudflare answers a missing page with an empty 404: this one serves the site's own 404.html
    const conf = JSON.parse(readFileSync(join(t.site, '.one-shot', 'wrangler.json'), 'utf8'));
    assert.deepEqual(conf.assets, { directory: t.dist, not_found_handling: '404-page' });
    assert.equal(conf.name, 'kleiner-kaffee');
    assert.match(conf.compatibility_date, /^\d{4}-\d\d-\d\d$/);

    const pages = t.run('branch', '--repo', 'https://github.com/OWNER/REPO.git', '--dry');
    assert.equal(pages.status, 0, pages.stderr);
    assert.match(pages.stdout, /Publishing .+ \(gh-pages\)/);
    // a dry run says it pushed nothing, not "Done"
    assert.match(pages.stdout, /Dry run: nothing was pushed\..*\nIt would be live at: https:\/\/owner\.github\.io\/REPO\//);
    assert.doesNotMatch(pages.stdout, /Done\.|Live in a minute/);
    assert.match(t.run('branch', '--repo', 'https://github.com/OWNER/owner.github.io', '--dry').stdout, /It would be live at: https:\/\/owner\.github\.io\/\n/);
    assert.match(t.run('branch', '--repo', 'https://github.com/OWNER/REPO.git', '--cname', 'www.kleiner-kaffee.example', '--dry').stdout, /It would be live at: https:\/\/www\.kleiner-kaffee\.example\//);
    // a remote that isn't GitHub: the dry run still says it pushed nothing
    assert.match(t.run('branch', '--repo', 'https://gitlab.example/o/r.git', '--dry').stdout, /\nDry run: nothing was pushed\.\n/);
  } finally { t.done(); }
});

// the push replaces the branch: onto the code's own branch that loses the code, and a name like --mirror is an
// option to git (it mirror-pushed and deleted every other branch)
test('publish branch: no branch that starts with a dash, and not main, master or the current one without --force', () => {
  const t = setup();
  try {
    const bare = join(t.dir, 'remote.git');
    t.git(['init', '--bare', '-q', bare], t.dir);
    t.git(['init', '-q', '-b', 'work']);
    for (const b of ['--branch=--mirror', '--branch=-x', '--branch=--delete']) {
      const r = t.run('branch', '--repo', bare, b, '--dry');
      assert.equal(r.status, 2, b + r.stdout + r.stderr);
      assert.match(r.stderr, /--branch takes a branch name/, b);
    }
    for (const b of ['main', 'master', 'work']) {
      const r = t.run('branch', '--repo', bare, '--branch', b, '--dry');
      assert.equal(r.status, 2, b + r.stdout + r.stderr);
      assert.match(r.stderr, new RegExp(`--branch ${b} would replace that branch with the built files only.*Use gh-pages, or add --force\\.`), b);
    }
    const forced = t.run('branch', '--repo', bare, '--branch', 'main', '--force', '--dry');
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /Publishing .+ \(main\)/);
    // --repo=--receive-pack=<command> reached git push as an option and ran the command
    for (const r of ['--repo=--receive-pack=no-such-command', '--repo=-x']) {
      const bad = t.run('branch', r, '--dry');
      assert.equal(bad.status, 2, r + bad.stdout + bad.stderr);
      assert.match(bad.stderr, /--repo takes the repository address/, r);
    }
    assert.equal(t.git(['--git-dir', bare, 'branch', '--list'], t.dir), '', 'nothing pushed');
  } finally { t.done(); }
});

test('publish stops on bad input before anything reaches a shell', () => {
  const t = setup();
  try {
    assert.equal(t.run('netlify', '--name', 'Kleiner Kaffee', '--dry').status, 2);
    assert.equal(t.run('cloudflare', '--name', 'site;calc', '--dry').status, 2);
    assert.equal(t.run('cloudflare', '--dry').status, 2);
    assert.equal(t.run('branch', '--dry').status, 2);
    assert.equal(t.run('ftp', '--dry').status, 2);
    assert.equal(t.run('vercel', '--dist', join(t.site, 'nothing'), '--dry').status, 2);
    mkdirSync(join(t.dir, 'a&b', 'dist'), { recursive: true });
    writeFileSync(join(t.dir, 'a&b', 'dist', 'index.html'), '<!doctype html>');
    const shelly = t.run('vercel', '--dist', join(t.dir, 'a&b', 'dist'), '--dry');
    assert.equal(shelly.status, 2);
    assert.match(shelly.stderr, /characters a shell would act on/);
  } finally { t.done(); }
});

test('publish branch: the built files alone on the branch, replaced on each publish', () => {
  const t = setup();
  try {
    const bare = join(t.dir, 'remote.git');
    t.git(['init', '--bare', '-q', bare], t.dir);
    const files = () => t.git(['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'gh-pages'], t.dir).split('\n').sort();

    // --dry pushes nothing
    assert.equal(t.run('branch', '--repo', bare, '--dry').status, 0);
    assert.equal(t.git(['--git-dir', bare, 'branch', '--list'], t.dir), '');

    // not a git repository: a neutral identity and "Publish build"
    const first = t.run('branch', '--repo', bare, '--cname', 'www.kleiner-kaffee.example');
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(files(), ['.nojekyll', 'CNAME', 'assets/main.js', 'index.html']);
    assert.equal(t.git(['--git-dir', bare, 'show', 'gh-pages:CNAME'], t.dir), 'www.kleiner-kaffee.example');
    assert.equal(t.git(['--git-dir', bare, 'log', '-1', '--format=%s|%an|%ae', 'gh-pages'], t.dir), 'Publish build|site|site@localhost');

    // the site's own repository: its identity and commit go on the branch (so check user.email before a public push)
    t.git(['init', '-q', '-b', 'main']);
    t.git(['config', 'user.name', 'Kleiner Kaffee']);
    t.git(['config', 'user.email', 'hallo@kleiner-kaffee.example']);
    mkdirSync(join(t.site, 'src'));
    writeFileSync(join(t.site, 'src', 'main.js'), '// v1');
    writeFileSync(join(t.site, 'index.html'), '<!doctype html>');
    t.git(['add', 'src', 'index.html']);
    t.git(['commit', '-q', '-m', 'v1']);
    const sha = t.git(['rev-parse', '--short', 'HEAD']);
    writeFileSync(join(t.site, 'dist', 'index.html'), '<!doctype html><title>v2</title>');
    rmSync(join(t.site, 'dist', 'assets'), { recursive: true });
    const second = t.run('branch', '--repo', bare);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(files(), ['.nojekyll', 'index.html'], 'the CNAME and old files go when the next publish has none');
    assert.equal(t.git(['--git-dir', bare, 'log', '--format=%s|%an|%ae', 'gh-pages'], t.dir), `Publish ${sha}|Kleiner Kaffee|hallo@kleiner-kaffee.example`);

    // uncommitted source: refused, the branch stays as it was
    writeFileSync(join(t.site, 'src', 'main.js'), '// v2, not committed');
    const third = t.run('branch', '--repo', bare);
    assert.equal(third.status, 1);
    assert.match(third.stderr, /uncommitted changes/);
    assert.equal(t.git(['--git-dir', bare, 'log', '-1', '--format=%s', 'gh-pages'], t.dir), `Publish ${sha}`);
  } finally { t.done(); }
});

test('publish branch: a folder with & is fine (no shell), the build\'s CNAME stays, a bad --cname stops', () => {
  const t = setup();
  try {
    const bare = join(t.dir, 'remote.git');
    t.git(['init', '--bare', '-q', bare], t.dir);
    const files = () => t.git(['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'gh-pages'], t.dir).split('\n').sort();
    mkdirSync(join(t.dir, 'Smith & Sons', 'dist'), { recursive: true });
    writeFileSync(join(t.dir, 'Smith & Sons', 'dist', 'index.html'), '<!doctype html>');
    const amp = t.run('branch', '--repo', bare, '--dist', join(t.dir, 'Smith & Sons', 'dist'), '--dry');
    assert.equal(amp.status, 0, amp.stderr);

    // public/CNAME ends up in dist: a publish without --cname keeps the domain
    writeFileSync(join(t.dist, 'CNAME'), 'www.kleiner-kaffee.example\n');
    const kept = t.run('branch', '--repo', bare);
    assert.equal(kept.status, 0, kept.stderr);
    assert.match(kept.stdout, /Custom domain from .+CNAME: www\.kleiner-kaffee\.example/);
    assert.ok(files().includes('CNAME'));
    assert.equal(t.git(['--git-dir', bare, 'show', 'gh-pages:CNAME'], t.dir), 'www.kleiner-kaffee.example');
    // without one, it says what that means
    rmSync(join(t.dist, 'CNAME'));
    const gone = t.run('branch', '--repo', bare);
    assert.equal(gone.status, 0, gone.stderr);
    assert.match(gone.stdout, /No --cname and no CNAME in the build: if the site had a custom domain, GitHub Pages drops it/);
    assert.ok(!files().includes('CNAME'));

    for (const bad of ['https://www.example.com/', 'example', 'www.example.com/menu']) assert.equal(t.run('branch', '--repo', bare, '--cname', bad, '--dry').status, 2, bad);
    assert.equal(t.run('branch', '--repo', bare, '--branch', '--dry').status, 2, '--branch without a name');
  } finally { t.done(); }
});

test('publish branch: line endings stay as built, and git trouble is said in plain words', () => {
  const t = setup();
  try {
    const bare = join(t.dir, 'remote.git');
    t.git(['init', '--bare', '-q', bare], t.dir);
    // a machine that turns LF into CRLF: no warning per file, and the bytes go up as built
    writeFileSync(join(t.dir, 'gitconfig'), '[core]\n\tautocrlf = true\n\tsafecrlf = warn\n');
    writeFileSync(join(t.dist, 'index.html'), '<!doctype html>\n<title>Kleiner Kaffee</title>\n');
    const r = t.run('branch', '--repo', bare);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /LF will be replaced|CRLF/);
    assert.equal(execFileSync('git', ['--git-dir', bare, 'show', 'gh-pages:index.html'], { encoding: 'utf8' }), '<!doctype html>\n<title>Kleiner Kaffee</title>\n');

    const push = t.run('branch', '--repo', join(t.dir, 'no-such-remote.git'));
    assert.equal(push.status, 2);
    assert.match(push.stderr, /git push to .+no-such-remote\.git failed .+ Check the address, and that you may write to it\./);

    const env = { ...process.env, PATH: join(t.dir, 'empty'), Path: join(t.dir, 'empty') };
    mkdirSync(join(t.dir, 'empty'));
    const nogit = spawnSync(process.execPath, [PUBLISH, 'branch', '--repo', bare], { cwd: t.site, env, encoding: 'utf8' });
    assert.equal(nogit.status, 2, nogit.stdout + nogit.stderr);
    assert.match(nogit.stderr, /git was not found\. Install it from https:\/\/git-scm\.com\//);
  } finally { t.done(); }
});

// the build's CNAME is the address the dry run gives, uncommitted source only warns in one, and no git stops it
test('publish branch --dry: the build\'s CNAME is the address, uncommitted source only warns, no git stops it', () => {
  const t = setup();
  try {
    writeFileSync(join(t.dist, 'CNAME'), 'www.kleiner-kaffee.example\n');
    const dry = t.run('branch', '--repo', 'https://github.com/OWNER/REPO.git', '--dry');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /It would be live at: https:\/\/www\.kleiner-kaffee\.example\/\n/, 'the build\'s CNAME, not only --cname');
    t.git(['init', '-q', '-b', 'work']);
    mkdirSync(join(t.site, 'src'));
    writeFileSync(join(t.site, 'src', 'main.js'), '// not committed');
    const dirty = t.run('branch', '--repo', 'https://github.com/OWNER/REPO.git', '--dry');
    assert.equal(dirty.status, 0, dirty.stderr);
    assert.match(dirty.stderr, /uncommitted changes.*\(Dry run: carrying on\.\)/);
    mkdirSync(join(t.dir, 'empty'));
    const nogit = spawnSync(process.execPath, [PUBLISH, 'branch', '--repo', 'https://github.com/OWNER/REPO.git', '--dry'], { cwd: t.site, env: { ...t.env, PATH: join(t.dir, 'empty'), Path: join(t.dir, 'empty') }, encoding: 'utf8' });
    assert.equal(nogit.status, 2, nogit.stdout + nogit.stderr);
    assert.match(nogit.stderr, /git was not found/);
  } finally { t.done(); }
});

// Windows: cmd.exe runs an npx.cmd in the working folder before the one on PATH unless publish turns that off.
// PATH holds only a failing npx, so nothing can reach the network or a real host.
test('publish runs no npx from the site folder', () => {
  const t = setup();
  try {
    const bin = join(t.dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'npx.cmd'), '@exit /b 1\r\n');
    writeFileSync(join(bin, 'npx'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(t.site, 'npx.cmd'), `@echo planted> "${join(t.dir, 'planted.txt')}"\r\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(NoDefaultCurrentDirectoryInExePath|PATH)$/i.test(k)));
    env.PATH = bin;
    const r = spawnSync(process.execPath, [PUBLISH, 'vercel', '--name', 'kleiner-kaffee'], { cwd: t.site, env, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(!existsSync(join(t.dir, 'planted.txt')), 'the npx.cmd in the site folder ran');
  } finally { t.done(); }
});
