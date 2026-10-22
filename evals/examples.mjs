#!/usr/bin/env node
// examples: the free benchmark. Scores every example site in examples/ with the checks of a given checkout,
// no agent involved. The sites don't change, so any change in their scores comes from the checks: run it before
// and after changing a script in skills/one-shot-site/scripts. (Changes to how the skill builds sites need the
// agent: run.mjs.)
//
//   node evals/examples.mjs [--skill-dir skills/one-shot-site] [--only kleiner-kaffee] [--save-baseline]
//   node evals/examples.mjs --from <folder>     the sites in another folder (one per subfolder, e.g. a rebuild of the
//                                              examples), scored the same way and compared with the examples' baseline
//
// The sites are copied to the runs folder, installed and built there; the repository stays clean.
// Writes evals/results/examples-<time>.md and .json, and compares with evals/baseline-examples.json.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultRunsDir, gitSha, REPO } from './lib/agent.mjs';
import { scoreOnce } from './score.mjs';
import { isRedesign, sameness, siteFeatures } from './lib/sameness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const skillDir = resolve(a['skill-dir'] || join(REPO, 'skills/one-shot-site'));
const from = a.from ? resolve(a.from) : null;
const label = from ? basename(from) : 'examples';
// a site is <name>/site (as in examples/) or <name> itself
const srcOf = (n) => { const d = join(from || join(REPO, 'examples'), n); return existsSync(join(d, 'site', 'package.json')) ? join(d, 'site') : d; };
const root = join(resolve(a['runs-dir'] || defaultRunsDir()), from ? `examples-${label}` : 'examples');
const allNames = readdirSync(from || join(REPO, 'examples')).filter((n) => existsSync(join(srcOf(n), 'package.json')));
const names = allNames.filter((n) => !a.only || String(a.only).split(',').includes(n));
if (!names.length) { console.error(`No sites in ${from || join(REPO, 'examples')}.`); process.exit(2); }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sh = (cwd, args) => spawnSync(npm, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', timeout: 10 * 60000 });

const rows = [];
for (const n of names) {
  const site = join(root, n);
  // a fresh copy of the source, keeping node_modules from last time so the install is quick
  for (const f of existsSync(site) ? readdirSync(site) : []) if (f !== 'node_modules') rmSync(join(site, f), { recursive: true, force: true });
  cpSync(srcOf(n), site, { recursive: true, filter: (s) => !/[\\/](node_modules|dist|\.git)([\\/]|$)/.test(s.slice(srcOf(n).length)) });
  const inst = sh(site, ['install', '--no-audit', '--no-fund']);
  const b = inst.status === 0 ? sh(site, ['run', 'build']) : inst;
  if (b.status !== 0) { rows.push({ name: n, error: (b.stderr || b.stdout).trim().split('\n').slice(-3).join(' / ') }); console.log(`${n}: build failed`); continue; }
  const r = await scoreOnce(site, { skillDir, out: join(root, `${n}-score`), name: n });
  rows.push({ name: n, score: r.score, complete: r.complete, parts: Object.fromEntries(Object.entries(r.parts).map(([k, p]) => [k, p.points])), metrics: r.metrics, firstScreen: r.firstScreen?.pattern || null, fails: r.findings.filter((f) => f.level === 'fail').length, warns: r.findings.filter((f) => f.level === 'warn').length, findings: r.findings.map((f) => `${f.level} [${f.rule}] ${f.text}`) });
  console.log(`${n}: ${r.score}${r.complete ? '' : ' (partial)'}`);
}

// sameness covers the whole set, also when this run scored only some of it (--only, one site per browser turn):
// the first screens measured earlier are kept next to the copies. A redesign isn't counted (lib/sameness.mjs).
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const known = readJson(join(root, 'first-screens.json')) || {};
for (const r of rows) if (r.firstScreen) known[r.name] = r.firstScreen;
mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'first-screens.json'), JSON.stringify(known, null, 2));
const { rgbToOklch } = await import(pathToFileURL(join(skillDir, 'scripts', 'palette.mjs')).href).catch(() => ({}));
const same = sameness(allNames.filter((n) => existsSync(join(root, n, 'package.json'))).map((n) => ({ ...siteFeatures(join(root, n), n, rgbToOklch), firstScreen: known[n], keptLook: isRedesign(join(root, n)) && 'a redesign' })));
const base = readJson(join(here, 'baseline-examples.json'));
const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '');
const sha = gitSha(skillDir);
for (const r of rows) r.skillSha = sha;
const result = { date: new Date().toISOString(), from: from || undefined, skillSha: sha, rows, sameness: same?.value ?? null, samenessParts: same?.parts, samenessNotCounted: same?.notCounted };
const md = [`# ${from ? `Sites in ${from}` : 'Example sites'}, scored ${stamp}`, '', `Checks from \`${skillDir}\` @ ${result.skillSha || '?'}${base ? ` · baseline ${base.skillSha} (${base.date.slice(0, 10)})` : ''}`, '',
  '| Site | Score | Baseline | Fails | Warns |', '|---|---|---|---|---|',
  ...rows.map((r) => { const b = base?.rows.find((x) => x.name === r.name); return `| ${r.name} | ${r.error ? 'error' : r.score} | ${b ? `${b.score}${b.score !== r.score ? ` (${r.score - b.score > 0 ? '+' : ''}${Math.round((r.score - b.score) * 10) / 10})` : ''}` : '-'} | ${r.fails ?? ''} | ${r.warns ?? ''} |`; }),
  ...(same ? [`Sameness across the examples: ${same.value} / 100 (${same.lines.join('; ')})`, ''] : []),
  ''];
// what appeared and what went away, per site: that is what a change to the checks did
for (const r of rows) {
  const b = base?.rows.find((x) => x.name === r.name);
  if (!b || !r.findings) continue;
  const added = r.findings.filter((f) => !b.findings.includes(f)), gone = b.findings.filter((f) => !r.findings.includes(f));
  if (added.length || gone.length) md.push(`## ${r.name}`, '', ...added.map((f) => `- new: ${f}`), ...gone.map((f) => `- gone: ${f}`), '');
}
md.push('Changes under 1.5 points on one site are noise: film times the headline and layout shift a little differently each run (evals/README.md, "How much the score moves").', '');
const out = join(here, 'results', `${from ? `examples-${label}` : 'examples'}-${stamp}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out + '.json', JSON.stringify(result, null, 2));
writeFileSync(out + '.md', md.join('\n'));
if (a['save-baseline'] && !from) {
  // with --only, only those sites' rows change; the others stay as they were (each row says which checks scored it)
  const kept = a.only && base ? base.rows.filter((r) => !rows.some((x) => x.name === r.name)).map((r) => ({ skillSha: base.skillSha, ...r })) : [];
  const all = [...kept, ...rows].sort((x, y) => allNames.indexOf(x.name) - allNames.indexOf(y.name));
  writeFileSync(join(here, 'baseline-examples.json'), JSON.stringify({ ...result, rows: all }, null, 2) + '\n');
  console.log(`Saved as the new baseline: evals/baseline-examples.json (${rows.map((r) => r.name).join(', ')}${kept.length ? `; kept ${kept.map((r) => r.name).join(', ')}` : ''})`);
}
console.log(md.join('\n'));
