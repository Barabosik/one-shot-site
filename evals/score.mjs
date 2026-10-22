#!/usr/bin/env node
// score: one number for one built site. Runs the skill's own checks on it (lint, look at 390 and 1440, film,
// film --reduced, audit with axe-core, Lighthouse when installed), merges what they find, and writes a score card.
//
//   node evals/score.mjs <site folder | dist folder | URL> [--skill-dir skills/one-shot-site] [--out <dir>]
//                        [--name <label>] [--repeat N] [--tools <dir with node_modules>]
//
// A site folder is one with package.json and a built dist/ (run npm run build first). A URL gets look and film
// only: lint needs the source and audit needs the built files, so its score is marked partial.
//
// Writes <out>/score.json, score.md and sheet.jpg (default out: <site>/.one-shot/score). --repeat N scores the
// same site N times (run-1 … run-N) and adds the spread, to see how much the number moves on its own.
// How the score is made: evals/README.md. Exit code 0 = scored (whatever the score), 2 = could not score.
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { card, merge, parseAudit, readAuditJson, score, spread, LABELS } from './lib/scoring.mjs';
import { gitSha } from './lib/agent.mjs';
import { probeFirstScreen } from './lib/firstscreen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

// "my-site" (with dist/ inside), "my-site/dist" or a URL -> what can be checked
export function resolveTarget(t) {
  if (/^https?:\/\//.test(t)) return { url: t, dist: null, project: null, name: new URL(t).host };
  const p = resolve(t);
  if (existsSync(join(p, 'dist', 'index.html'))) return { url: null, dist: join(p, 'dist'), project: p, name: basename(p) };
  if (existsSync(join(p, 'index.html'))) {
    const up = dirname(p);
    return { url: null, dist: p, project: existsSync(join(up, 'package.json')) ? up : null, name: basename(p) === 'dist' ? basename(up) : basename(p) };
  }
  if (existsSync(join(p, 'package.json'))) throw new Error(`${p} has no dist/ yet. Build it first: npm run build`);
  throw new Error(`Nothing to score at ${p}: no index.html, no dist/index.html.`);
}

// where axe-core and lighthouse come from: the site itself, else --tools, else a node_modules next to evals/
function findModule(id, places) {
  for (const dir of places.filter(Boolean)) {
    try { return { path: createRequire(join(dir, 'package.json')).resolve(id), dir }; } catch {}
  }
  return null;
}
const nodeModulesOf = (resolved) => resolved && resolved.path.slice(0, resolved.path.lastIndexOf('node_modules') + 'node_modules'.length);

function run(tool, script, args, { env, cwd }) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  return { tool, exit: r.status ?? (r.signal ? `killed (${r.signal})` : 'error'), seconds: Math.round((Date.now() - t0) / 100) / 10, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const tail = (s, n = 4) => s.trim().split('\n').slice(-n).join(' / ');

// accept: rules not counted for this site even though it doesn't allow them itself (the head-to-head excuses the
// made-up addresses for a plain agent's site too, as the skill's sites allow them)
export async function scoreOnce(target, { skillDir, out, name, tools, accept = [] }) {
  const site = resolveTarget(target);
  const scripts = join(skillDir, 'scripts');
  if (!existsSync(join(scripts, 'look.mjs'))) throw new Error(`No skill at ${skillDir} (expected scripts/look.mjs).`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const shown = site.url || site.dist;
  const notes = [];
  const missing = [];
  const toolRuns = {};
  const byTool = {};
  const places = [site.project, tools, join(REPO, 'evals'), REPO];
  const axe = findModule('axe-core/axe.min.js', places);
  const lighthouse = findModule('lighthouse/cli/index.js', places);
  // the site's own allowances would hide findings: lint and audit read a copy of the source without them
  const keep = starterAllows(skillDir);
  const allowed = site.project ? allowancesOf(site.project, keep) : { file: [], inline: [] };
  const source = allowed.file.length || allowed.inline.length ? strictCopy(site.project, join(out, 'source'), keep) : site.project;
  const extra = [nodeModulesOf(axe), nodeModulesOf(lighthouse)].filter((d) => d && !(source && d.startsWith(source)));
  // scoring never adds a site to the machine's history of recent looks (the skill's audit does on Ready to ship)
  const env = { ...process.env, ONE_SHOT_HISTORY: 'off', ...(extra.length && { NODE_PATH: [...new Set(extra), process.env.NODE_PATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':') }) };
  const opts = { env, cwd: out };
  const record = (tool, r, findings, why) => {
    const ran = !!r && findings !== null;
    toolRuns[tool] = ran
      ? { ran, exit: r.exit, seconds: r.seconds, fails: findings.filter((f) => f.level === 'fail').length, warns: findings.filter((f) => f.level === 'warn').length }
      : { ran: false, why: why || (r ? `failed (exit ${r.exit}): ${tail(r.stderr || r.stdout, 2)}` : 'skipped') };
    if (ran) byTool[tool] = findings;
    else missing.push(tool);
  };

  // lint: the source
  if (site.project) {
    const r = run('lint', join(scripts, 'lint.mjs'), [source, '--json'], opts);
    let list = null;
    try { list = JSON.parse(r.stdout); } catch {}
    record('lint', r, list);
  } else record('lint', null, null, site.url ? 'needs the source (URL given)' : 'no package.json above dist');

  // look: phone and desktop
  {
    const r = run('look', join(scripts, 'look.mjs'), [shown, '--widths', '390,1440', '--out', join(out, 'look')], opts);
    const j = r.exit === 2 ? null : readJson(join(out, 'look', 'report.json'));
    record('look', r, j ? j.findings : null);
  }

  // film, normal and reduced motion
  const metrics = {};
  for (const [tool, flags] of [['film', []], ['film-reduced', ['--reduced']]]) {
    const r = run(tool, join(scripts, 'film.mjs'), [shown, ...flags, '--out', join(out, tool)], opts);
    const j = r.exit === 2 ? null : readJson(join(out, tool, 'report.json'));
    record(tool, r, j ? j.findings : null);
    if (j && tool === 'film') metrics.headline = j.readable === null || j.readable === undefined ? null : Math.round(Math.max(0, j.readable - (j.painted || 0))) / 1000;
    // the worse of the two: a page can jump only for people who asked for less motion
    if (j) metrics.layoutShift = Math.max(metrics.layoutShift || 0, Math.round((j.layoutShift || 0) * 10000) / 10000);
  }

  // the dark scheme, when the site has one: look is pinned to light. A fault both schemes show counts once (its
  // tools say "look, look-dark"); one that only dark visitors get is listed under look-dark.
  if (site.dist && hasDark(site.dist)) {
    const r = run('look-dark', join(scripts, 'look.mjs'), [shown, '--widths', '390,1440', '--scheme', 'dark', '--out', join(out, 'look-dark')], opts);
    const j = r.exit === 2 ? null : readJson(join(out, 'look-dark', 'report.json'));
    record('look-dark', r, j ? j.findings : null);
  }

  // audit: the launch gate, axe-core included
  let audit = null;
  if (site.dist) {
    const html = readFileSync(join(site.dist, 'index.html'), 'utf8');
    const draft = /\{\{URL\}\}|%7B%7BURL%7D%7D/.test(html);
    const args = [site.dist, ...(source ? ['--site', source] : []), ...(draft ? ['--draft'] : []), ...(lighthouse ? ['--lighthouse'] : []), '--out', join(out, 'audit', 'audit.md')];
    const r = run('audit', join(scripts, 'audit.mjs'), args, opts);
    // audit.json where the skill writes it (0.4.0 on), else the markdown read back
    const json = r.exit === 2 ? null : readJson(join(out, 'audit', 'audit.json'));
    const md = existsSync(join(out, 'audit', 'audit.md')) ? readFileSync(join(out, 'audit', 'audit.md'), 'utf8') : null;
    const a = json ? readAuditJson(json) : md && r.exit !== 2 ? parseAudit(md) : null;
    record('audit', r, a ? a.findings : null);
    if (a) {
      audit = { verdict: a.verdict, ready: a.ready, draft };
      const home = a.weight['/'] || Object.values(a.weight)[0];
      if (home) { metrics.jsKB = home.jsKB; metrics.weightKB = home.bytesKB; }
      if (!a.axeRan) { missing.push('axe-core'); notes.push('axe-core was not found (site, --tools, or evals/node_modules): the accessibility part is missing its broadest check.'); }
      audit.axe = a.axeRan ? a.axe : undefined;
      audit.lighthouse = a.lighthouse;
    }
  } else record('audit', null, null, 'needs the built files (URL given)');
  if (!lighthouse) notes.push('Lighthouse is not installed, so it was skipped (it is never part of the score).');

  // what the site allowed is charged like any finding, except an allowance the benchmark accepts
  const excused = [...new Set([...allowed.file.filter((r) => ACCEPTED.has(r)), ...accept.filter((r) => ACCEPTED.has(r))])];
  for (const tool of ['lint', 'audit']) {
    if (!byTool[tool]) continue;
    const kept = byTool[tool].filter((f) => !excused.includes(f.rule.replace(/^(lint|audit):/, '')));
    if (kept.length < byTool[tool].length) Object.assign(toolRuns[tool], { fails: kept.filter((f) => f.level === 'fail').length, warns: kept.filter((f) => f.level === 'warn').length, allowed: byTool[tool].length - kept.length });
    byTool[tool] = kept;
  }
  if (audit && (source !== site.project || excused.length)) {
    audit.ready = !(byTool.audit || []).some((f) => f.level === 'fail');
    audit.verdict = audit.ready ? 'Ready to ship.' : 'Not ready to ship.';
  }
  const charged = [...new Set([...allowed.file, ...allowed.inline])].filter((r) => !excused.includes(r));
  if (charged.length) notes.push(`The site allows ${charged.join(', ')} (.one-shot/allow.json or "one-shot: allow" comments). The score counts those findings anyway.`);
  if (excused.length) notes.push(`Allowed and not counted: ${excused.join(', ')} (the addresses in the examples and scenarios are made up on purpose).`);

  // the first screen's pattern, for sameness across a batch (not part of the score)
  let firstScreen = null;
  try {
    const { serve } = await import(pathToFileURL(join(skillDir, 'scripts/lib/serve.mjs')).href);
    const srv = site.dist ? await serve(site.dist) : null;
    try { firstScreen = await probeFirstScreen(srv ? srv.url : site.url, skillDir); } finally { await srv?.close(); }
  } catch (e) { notes.push(`First screen not measured: ${e.message}`); }

  const findings = merge(byTool);
  const s = score(findings, metrics);
  const result = {
    name: name || site.name, target: shown, skillDir, skillSha: gitSha(skillDir), date: new Date().toISOString(),
    score: s.score, complete: !missing.length, missing, parts: s.parts, metrics,
    contrast: findings.filter((f) => f.rule === 'contrast' || f.rule === 'axe:color-contrast').length,
    axe: audit?.axe, lighthouse: audit?.lighthouse || {}, audit: audit && { verdict: audit.verdict, ready: audit.ready, draft: audit.draft },
    allowed: { charged, excused }, firstScreen, tools: toolRuns, findings, notes,
  };
  try { result.sheet = await contactSheet(result, out, skillDir); } catch (e) { notes.push(`No contact sheet: ${e.message}`); }
  writeFileSync(join(out, 'score.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(out, 'score.md'), card(result));
  return result;
}

// A site can silence a rule: .one-shot/allow.json (lint and audit drop it) or a "one-shot: allow <rule>" comment
// (lint skips that line). That's for deliberate choices with a reason in the brief, but an agent short of "Ready to
// ship" can use it to pass, so the score reads a copy of the source without either. Only made-up-address is
// accepted: the examples and scenarios use made-up addresses on purpose.
export const ACCEPTED = new Set(['made-up-address']);
// what lint skips too; audit reads only site.json and package.json from the source
const SKIP_COPY = new Set(['node_modules', 'dist', '.git', '.one-shot', '.vite', 'tools', 'public']);
const INLINE = /one-shot: allow ([\w:-]+)/g;
const TEXT = /\.(html?|css|m?js|jsx|tsx?|vue|svelte|astro|svg|md|json)$/;

function walkSource(dir, each, rel = '') {
  for (const f of readdirSync(join(dir, rel))) {
    if (SKIP_COPY.has(f)) continue;
    const r = rel ? join(rel, f) : f;
    if (statSync(join(dir, r)).isDirectory()) walkSource(dir, each, r);
    else each(r);
  }
}

// The skill's own starter has a few deliberate "one-shot: allow" lines; a site that keeps one word for word keeps it.
export function starterAllows(skillDir) {
  const lines = new Set();
  const assets = join(skillDir, 'assets');
  if (existsSync(assets)) walkSource(assets, (r) => { if (TEXT.test(r)) for (const l of readFileSync(join(assets, r), 'utf8').split('\n')) if (l.includes('one-shot: allow')) lines.add(l.trim()); });
  return lines;
}
const ownLines = (text, keep) => text.split('\n').filter((l) => l.includes('one-shot: allow') && !keep.has(l.trim()));

export function allowancesOf(project, keep = new Set()) {
  let file = [];
  try { file = JSON.parse(readFileSync(join(project, '.one-shot', 'allow.json'), 'utf8')).map((r) => String(r).replace(/^(lint|audit):/, '')); } catch {}
  const inline = new Set();
  walkSource(project, (r) => { if (TEXT.test(r)) for (const l of ownLines(readFileSync(join(project, r), 'utf8'), keep)) for (const m of l.matchAll(INLINE)) inline.add(m[1]); });
  return { file: [...new Set(file)], inline: [...inline] };
}

// The source without its allowances: no .one-shot/, and the site's own "one-shot: allow" comments turned into notes.
export function strictCopy(project, dest, keep = new Set()) {
  rmSync(dest, { recursive: true, force: true });
  walkSource(project, (r) => {
    mkdirSync(dirname(join(dest, r)), { recursive: true });
    if (TEXT.test(r)) writeFileSync(join(dest, r), readFileSync(join(project, r), 'utf8').split('\n').map((l) => (l.includes('one-shot: allow') && !keep.has(l.trim()) ? l.replace(INLINE, 'one-shot: noted $1') : l)).join('\n'));
    else copyFileSync(join(project, r), join(dest, r));
  });
  return dest;
}

// Dark colours in the built CSS: the theme addon (follows the system until the visitor picks) or a site's own
// prefers-color-scheme: dark rules. A switch that ignores the system setting isn't seen by look --scheme dark.
export function darkIn(css) {
  return /prefers-color-scheme\s*:\s*dark|\[data-theme=["']?dark/.test(css);
}
function hasDark(dist) {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|html)$/.test(f)) files.push(p); } };
  walk(dist);
  return darkIn(files.map((f) => readFileSync(f, 'utf8')).join('\n'));
}

// One JPG to compare runs at a glance: desktop and phone screens from look, and the first seconds from film.
async function contactSheet(r, out, skillDir) {
  const { launch } = await import(pathToFileURL(join(skillDir, 'scripts/lib/chrome.mjs')).href);
  const { serve } = await import(pathToFileURL(join(skillDir, 'scripts/lib/serve.mjs')).href);
  const pick = (files) => files.filter((f) => existsSync(join(out, f)));
  const desktop = pick([0, 1, 2].map((i) => `look/home-1440-${i}.jpg`));
  const phone = pick([0, 1, 2, 3, 4, 5].map((i) => `look/home-390-${i}.jpg`));
  const load = pick([0, 2, 4, 6, 8, 10, 12, 15].map((i) => `film/load-${String(i).padStart(2, '0')}.jpg`));
  if (!desktop.length && !phone.length) throw new Error('look made no screenshots');
  const secs = (f) => `${((+f.match(/load-(\d+)/)[1] * 2.4) / 15).toFixed(2)} s`;
  const chips = Object.entries(r.parts).map(([k, p]) => `<span>${LABELS[k].split(' (')[0]} ${Math.round(p.points * 10) / 10}/${p.weight}</span>`).join('');
  const row = (files, cols, cap) => `<div class="g" style="grid-template-columns:repeat(${cols},1fr)">${files.map((f) => `<figure><img src="../${f}"><figcaption>${cap(f)}</figcaption></figure>`).join('')}</div>`;
  mkdirSync(join(out, 'sheet'), { recursive: true });
  writeFileSync(join(out, 'sheet', 'index.html'), `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#1d1e21;font:600 15px system-ui;color:#ddd}
    h1{font-size:22px;margin:0 0 8px} .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;color:#aaa;font-weight:500}
    .chips span{background:#2c2d31;padding:3px 9px;border-radius:5px} h2{font-size:14px;color:#999;margin:18px 0 8px;font-weight:600}
    .g{display:grid;gap:12px;align-items:start} figure{margin:0} img{width:100%;display:block;outline:1px solid #444}
    figcaption{margin-top:4px;color:#888;font-weight:500;font-size:13px}</style>
    <h1>${r.name} · ${r.score} / 100${r.complete ? '' : ' (partial)'}</h1><div class="chips">${chips}<span>${r.audit ? r.audit.verdict : 'no audit'}</span></div>
    ${desktop.length ? `<h2>Desktop 1440</h2>${row(desktop, 3, (f) => `screen ${+f.match(/-(\d+)\.jpg$/)[1] + 1}`)}` : ''}
    ${phone.length ? `<h2>Phone 390</h2>${row(phone, 6, (f) => `screen ${+f.match(/-(\d+)\.jpg$/)[1] + 1}`)}` : ''}
    ${load.length ? `<h2>First seconds at 1440 (film)</h2>${row(load, 8, secs)}` : ''}`);
  const srv = await serve(out);
  const b = await launch();
  try {
    const p = await b.newPage({ width: 1600, height: 900 });
    await p.goto(`${srv.url}/sheet/index.html`);
    const h = await p.eval('document.documentElement.scrollHeight');
    await p.shot(join(out, 'sheet.jpg'), { quality: 78, clip: { x: 0, y: 0, width: 1600, height: Math.min(h, 5000) } });
    await p.close();
  } finally {
    await b.close();
    await srv.close();
  }
  rmSync(join(out, 'sheet'), { recursive: true, force: true });
  return join(out, 'sheet.jpg');
}

export function spreadOf(runs) {
  const pick = (f) => spread(runs.map(f));
  const parts = Object.fromEntries(Object.keys(runs[0].parts).map((k) => [k, pick((r) => r.parts[k].points)]));
  return {
    score: pick((r) => r.score), parts,
    headline: pick((r) => r.metrics.headline), layoutShift: pick((r) => r.metrics.layoutShift),
    jsKB: pick((r) => r.metrics.jsKB), weightKB: pick((r) => r.metrics.weightKB),
    fails: pick((r) => r.findings.filter((f) => f.level === 'fail').length), warns: pick((r) => r.findings.filter((f) => f.level === 'warn').length),
    // findings that came and went between runs: the flaky checks
    flaky: (() => {
      const counts = new Map();
      for (const r of runs) for (const f of new Set(r.findings.map((x) => `${x.level} [${x.rule}] ${x.text}${x.where ? ` (${x.where})` : ''}`))) counts.set(f, (counts.get(f) || 0) + 1);
      return [...counts].filter(([, n]) => n < runs.length).map(([f, n]) => `${f}: ${n} of ${runs.length}`);
    })(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  if (!a._[0] || a.help) {
    console.error('Usage: node evals/score.mjs <site folder | dist | URL> [--skill-dir <skill>] [--out <dir>] [--name <label>] [--repeat N] [--tools <dir>]');
    process.exit(2);
  }
  try {
    const skillDir = resolve(typeof a['skill-dir'] === 'string' ? a['skill-dir'] : join(REPO, 'skills/one-shot-site'));
    const site = resolveTarget(a._[0]);
    const out = resolve(typeof a.out === 'string' ? a.out : join(site.project || process.cwd(), '.one-shot', 'score'));
    const opts = { skillDir, name: typeof a.name === 'string' ? a.name : undefined, tools: typeof a.tools === 'string' ? resolve(a.tools) : undefined };
    const n = Math.max(1, +(a.repeat || 1));
    if (n === 1) {
      const r = await scoreOnce(a._[0], { ...opts, out });
      console.log(`${r.name}: ${r.score} / 100${r.complete ? '' : ` (partial: ${r.missing.join(', ')})`}  ·  ${join(out, 'score.md')}`);
    } else {
      const runs = [];
      for (let i = 1; i <= n; i++) {
        const r = await scoreOnce(a._[0], { ...opts, out: join(out, `run-${i}`) });
        runs.push(r);
        console.log(`run ${i}/${n}: ${r.score}`);
      }
      const s = spreadOf(runs);
      writeFileSync(join(out, 'spread.json'), JSON.stringify({ name: runs[0].name, runs: runs.map((r) => ({ score: r.score, metrics: r.metrics, parts: Object.fromEntries(Object.entries(r.parts).map(([k, p]) => [k, p.points])) })), spread: s }, null, 2));
      console.log(`${runs[0].name}: mean ${s.score.mean}, min ${s.score.min}, max ${s.score.max}, sd ${s.score.sd}  ·  ${join(out, 'spread.json')}`);
      if (s.flaky.length) console.log('Came and went between runs:\n' + s.flaky.map((f) => '  ' + f).join('\n'));
    }
  } catch (e) {
    console.error(`Stopped: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(2);
  }
}
