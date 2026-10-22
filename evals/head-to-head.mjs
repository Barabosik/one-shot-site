#!/usr/bin/env node
// head-to-head: the skill against a plain agent. Same person, same answers, same tools; one arm has the skill and
// one doesn't. Both are scored by the same checks, then judged blind in pairs (by agents, and by people on a local
// vote page). The skill arm is a scenario run that already exists (run.mjs --prepare, the agent route).
//
//   node evals/head-to-head.mjs --prepare --from <run>    plain/<scenario>/task.md: the person and answers, no skill
//     then one fresh agent per task.md (transcripts in <out>/agents.json, as for run.mjs)
//   node evals/head-to-head.mjs --score --from <run> --only <scenario> [--arm plain|skill]
//     both arms, the checks of this checkout's skill (or --score-with), plus Lighthouse when --tools has it.
//     One scenario per browser turn.
//   node evals/head-to-head.mjs --lighthouse --only <scenario> [--arm …]   Lighthouse alone, on sites already scored
//   node evals/head-to-head.mjs --judges [--per-order 3] [--seed 1]
//     judges/<id>/: one pair, A and B in a set order, no names; one fresh judge agent each writes verdict.json
//   node evals/head-to-head.mjs --tally       head-to-head.md: the win rate with counts, the checks side by side,
//                                             what each build took (minutes, tokens), every verdict
//   node evals/head-to-head.mjs --vote-page   blind-vote/index.html: the same pairs for people, tallied in the browser
//   node evals/head-to-head.mjs --whole       a home page taller than the judges' screens, shot again whole into
//                                             whole/<arm>/<scenario> for the vote page (a browser job of its own)
//
// --out <dir>     default: one-shot-site-runs/evals/head-to-head. One --out is one round (its own h2h.json, judges)
// --with <dirs>   with --tally or --vote-page: more rounds (their --out folders, comma-separated) in the same report
// --dest <dir>    where --tally and --vote-page write (default: --out). h2h.json's "about" and "notes" go in the report
// --more <dirs>   with --vote-page: rounds whose pairs make a second part of the page, which the voter may skip
// --live          with --vote-page: the sites themselves, to scroll and click through (live-vote/, its own server)
// --lock <dir>    with --prepare: the browser lock; a lock helper (locked.mjs) next to it is named in the tasks
// --tools <dir>   axe/node_modules/axe-core (the version the starter installs) and lighthouse/node_modules/lighthouse,
//                 the same for both arms (default: <out>/tools). Lighthouse sits apart so the audit doesn't run it too
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultRunsDir, gitSha, REPO } from './lib/agent.mjs';
import { LABELS, NO_HANDOFF } from './lib/sim.mjs';
import { build, findSite, slugOf } from './run.mjs';
import { resolveTarget, scoreOnce } from './score.mjs';
import { copySite } from './lib/live-vote.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ARMS = ['skill', 'plain'];
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const fwd = (p) => p.replace(/\\/g, '/');

// The plain arm's whole job: the person's first message and every answer the skill arm got, and the same rules
// about publishing and the browser. No skill, no checklist: what an agent does when it is simply asked.
// skill: a control arm, the same task with one other skill installed in the project (its SKILL.md, relative to work)
export function plainTask(sc, work, helper, { skill, tag = 'plain' } = {}) {
  const a = sc.answers || {};
  const name = `evals-${tag}-${slugOf(sc.name)}`.slice(0, 48); // the lock helper takes the name as the job's label
  return `# Build a website

Someone wants a website, and you are building it for them. Make the best site you can: finished, and good enough
to put online today (nothing gets published in this run).

Work in \`${fwd(work)}\` and put the site in a new folder there. Build it however you like: plain HTML, CSS and
JavaScript, or npm packages and a build step (Vite, for example). With a build step, \`npm run build\` must write
the finished site to \`dist/\`; without one, \`index.html\` sits at the top of the site folder.

## The person

Their first message: "${sc.query}"

You can't reach them, and nobody else either: don't ask anything. This is everything they told you:

${Object.entries(a).filter(([k]) => k !== 'material' && k !== 'pick').map(([k, v]) => `- ${LABELS[k] || k}: ${v}`).join('\n')}
- Their material: ${a.material || '(none)'}

Where they didn't say, decide yourself.

## Rules for this run

${skill ? `- Before you start, read \`${fwd(join(work, skill))}\` and follow it: it is the one skill installed for this
  project. Use no other skill and not the Skill tool, and don't read other website projects or skill files on this
  machine: work from this task, that skill and your own knowledge (looking things up on the web is fine).` : `- Don't use the Skill tool or any skill, and don't read other website projects or skill files on this machine:
  work from this task and your own knowledge (looking things up on the web is fine).`}
- Nothing gets published: never push, deploy, publish or create a repository anywhere.
- The email and web addresses in their material are made up for this run (.example). Use them as given, as you
  would a real one.
- Photos and other media: only what you are allowed to use, and say where each came from.
- ${NO_HANDOFF}
${helper ? `- One browser at a time on this machine. Anything that opens a browser (a headless Chrome, Puppeteer,
  Playwright, a screenshot tool, a skill's own browser checks) runs through the lock helper, one Bash call each, with
  the Bash tool's timeout set to 600000: \`node "${fwd(helper)}" ${name} <your command>\`. Exit code 75 means it was
  busy and nothing ran: run the same command again. Close any preview server you start.
` : ''}- Keep your scratch files (screenshots, notes, helper scripts) in \`${fwd(work).replace(/\/+[^/]*\/*$/, '')}/scratch\`, not in a
  scratchpad or temp folder: other builds run on this machine at the same time.
- Take the time you need (up to about two hours).
- End with a short report: the site folder, how to build it, what you made, and anything you skipped.
`;
}

// a plain site: a project with package.json (as run.mjs finds it), else the first folder with an index.html
export function plainSite(work) {
  const p = findSite(work);
  if (p) return p;
  const look = (d, depth) => {
    for (const f of existsSync(d) ? readdirSync(d) : []) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      const q = join(d, f);
      if (!statSync(q).isDirectory()) continue;
      if (existsSync(join(q, 'index.html'))) return q;
      if (depth < 2) { const r = look(q, depth + 1); if (r) return r; }
    }
    return null;
  };
  return existsSync(join(work, 'index.html')) ? work : look(work, 0);
}

// where each arm's site is: a folder score.mjs can read (a project with dist/, or a folder with index.html)
export function siteOf(arm, slug, from, out) {
  // (a control arm in the skill's place may have no build step, so it is found like a plain site)
  return arm === 'skill' ? plainSite(join(from, slug, 'work')) : plainSite(join(out, 'plain', slug, 'work'));
}

// Did a plain agent touch the skill? Every tool call in its transcript: the Skill tool, or a path into the skill,
// the repository's examples and evals, or the skill arm's runs. Returns what it found (empty = clean).
const SKILL_PATHS = /SKILL\.md|[\\/]skills[\\/]+one-shot-site|one-shot-site[\\/]+(skills|examples|evals)[\\/]|one-shot-site-runs[\\/]+(evals[\\/]+\d{4}-|examples)|\.claude[\\/]+skills/i;
export function skillUse(jsonl) {
  const hits = [];
  for (const line of jsonl.split('\n')) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    for (const c of Array.isArray(j.message?.content) ? j.message.content : []) {
      if (c.type !== 'tool_use') continue;
      const input = JSON.stringify(c.input || {});
      if (c.name === 'Skill' || SKILL_PATHS.test(input)) hits.push(`${c.name}: ${input.slice(0, 160)}`);
    }
  }
  return hits;
}

// What a build took, from its agent's transcript: minutes at work (a gap of 30 minutes or more is a pause, not
// work), tool calls, model calls, the tokens it wrote, and every token it read and wrote (cache included).
export function usage(jsonl) {
  const calls = new Map(), tools = new Set(), times = [];
  for (const line of jsonl.split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.timestamp) times.push(Date.parse(e.timestamp));
    const m = e.message;
    if (m?.id && m.usage) {
      // one model call is written as a line per block, the last with the full output count
      const u = m.usage, out = u.output_tokens || 0;
      if (!(calls.get(m.id)?.out > out)) calls.set(m.id, { out, all: out + (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) });
    }
    for (const c of Array.isArray(m?.content) ? m.content : []) if (c.type === 'tool_use') tools.add(c.id);
  }
  times.sort((x, y) => x - y);
  let ms = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] < 30 * 60000) ms += times[i] - times[i - 1];
  const sum = (k) => [...calls.values()].reduce((s, c) => s + c[k], 0);
  return { minutes: Math.round(ms / 6000) / 10, tools: tools.size, calls: calls.size, output: sum('out'), tokens: sum('all') };
}

// The agents a build started (a reviewer, a fresh look), and the ones they started: each has a .meta.json next to
// its transcript that names its parent agent.
export function subagentsOf(transcript) {
  const dir = dirname(transcript), id = basename(transcript).replace(/^agent-|\.jsonl$/g, '');
  const found = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.meta.json')).sort() : []) {
    const m = readJson(join(dir, f)), t = join(dir, f.replace(/\.meta\.json$/, '.jsonl'));
    if (m?.parentAgentId === id && existsSync(t)) found.push({ description: m.description || '', agentType: m.agentType || '', transcript: t }, ...subagentsOf(t));
  }
  return found;
}

// A build's whole cost: its own transcript plus every agent it started. Their tokens count; their minutes are inside
// the build's own (it waits for them). A reviewer is the plugin's reviewer agent, or an agent told to follow the
// skill's reviewer.md, by name or with its prompt pasted in.
export function buildUsage(transcript) {
  const own = usage(readFileSync(transcript, 'utf8'));
  const subs = subagentsOf(transcript).map((s) => {
    const j = readFileSync(s.transcript, 'utf8');
    return { description: s.description, reviewer: /reviewer$/i.test(s.agentType) || /reviewer\.md|^# The reviewer\b|You review a website before its owner sees it/m.test(firstPrompt(j)), ...usage(j) };
  });
  const add = (k) => own[k] + subs.reduce((s, x) => s + x[k], 0);
  return { ...own, calls: add('calls'), output: add('output'), tokens: add('tokens'), subagents: subs.map(({ description, reviewer, tokens, minutes }) => ({ description, reviewer, tokens, minutes })) };
}

// the first thing an agent was told, from its transcript
function firstPrompt(jsonl) {
  for (const line of jsonl.split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.role === 'user' && e.message.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  }
  return '';
}

// what the skill's reviewer said, round by round, from the review-<n>.md files it writes in the site's .one-shot
export function reviewsOf(site) {
  if (!site) return [];
  const dir = join(site, '.one-shot');
  return (existsSync(dir) ? readdirSync(dir) : []).filter((f) => /^review-\d+\.md$/.test(f)).sort((x, y) => parseInt(x.slice(7)) - parseInt(y.slice(7))).map((f) => {
    const t = readFileSync(join(dir, f), 'utf8');
    return { round: parseInt(f.slice(7)), verdict: t.match(/^\W*Verdict\W+(PASS|SHOW|FIX|RETHINK)/mi)?.[1].toUpperCase() || null, weighted: Number(t.match(/^\W*Weighted\W+(\d+(?:\.\d+)?)/mi)?.[1]) || null };
  });
}

// A seeded shuffle, so a set of judges can be made again exactly.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Every pair is seen in both orders by the same number of judges: per-order judges with the skill site as A, as
// many with it as B. Ids are random so a folder name says nothing about the arm.
export function judgeSet(slugs, perOrder, seed) {
  const r = rng(seed);
  const hex = () => Math.floor(r() * 2 ** 32).toString(16).padStart(8, '0');
  const set = [];
  for (const slug of slugs) for (const skillIs of ['A', 'B']) for (let k = 0; k < perOrder; k++) set.push({ id: hex(), slug, skillIs });
  return set;
}

// verdicts: [{ slug, skillIs, winner }] -> wins per pair and overall, and how often the first site (A) won
export function tally(verdicts) {
  const by = {};
  let skill = 0, a = 0;
  for (const v of verdicts) {
    const won = v.winner === v.skillIs;
    by[v.slug] ||= { skill: 0, plain: 0 };
    by[v.slug][won ? 'skill' : 'plain']++;
    if (won) skill++;
    if (v.winner === 'A') a++;
  }
  const n = verdicts.length;
  return { n, skill, plain: n - skill, rate: n ? Math.round((skill / n) * 1000) / 10 : null, aRate: n ? Math.round((a / n) * 1000) / 10 : null, by };
}

// the screens of one page at one width, in order (look.mjs writes home-1440-0.jpg, home-1440-1.jpg, …)
export function screens(lookDir, width, page = 'home') {
  if (!existsSync(lookDir)) return [];
  return readdirSync(lookDir).filter((f) => new RegExp(`^${page}-${width}-\\d+\\.jpg$`).test(f))
    .sort((x, y) => +x.match(/-(\d+)\.jpg$/)[1] - +y.match(/-(\d+)\.jpg$/)[1]);
}

// How much of a home page the judges saw: look.mjs shoots at most 8 screens per width and notes a taller page in its
// report ("home at 390px is 10 screens tall"). Per width: { seen, of }; of = seen when the page fit.
export function seen(lookDir) {
  const notes = existsSync(join(lookDir, 'report.md')) ? readFileSync(join(lookDir, 'report.md'), 'utf8') : '';
  return Object.fromEntries([1440, 390].map((w) => {
    const n = screens(lookDir, w).length, tall = notes.match(new RegExp(`^- home at ${w}px is (\\d+) screens tall`, 'm'));
    return [w, { seen: n, of: tall ? +tall[1] : n }];
  }));
}

const judgePrompt = (sc, dir) => `# Which website is better for this business?

Two websites were made for the same business from the same brief. Pick the one you would rather put online for
them. Use only the files in \`${fwd(dir)}\`: don't open anything else on this machine.

## The business and what they asked for

Their first message: "${sc.query}"

${Object.entries(sc.answers || {}).filter(([k]) => k !== 'pick').map(([k, v]) => `- ${LABELS[k] || k}: ${v}`).join('\n')}

## The two sites

- Site A: \`A-desktop.jpg\` (every screen of the home page at 1440 px wide, in order) and \`A-phone.jpg\` (at 390 px).
- Site B: \`B-desktop.jpg\` and \`B-phone.jpg\`, the same way.

Look at all four pictures before deciding. Judge them as the business owner and their visitors would: does it
present this business well and fit what they asked for, can a visitor find what they came for (what, where, when,
how to get in touch or buy), does it look finished and trustworthy, and does it work on a phone as well as on a
desktop. The order of A and B means nothing. Pick one; no ties.

Write your verdict to \`${fwd(join(dir, 'verdict.json'))}\` in exactly this shape:
{"winner": "A" or "B", "why": "<one sentence>"}
Change nothing else. Reply with the same JSON.
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  const runs = defaultRunsDir();
  const out = resolve(a.out || join(runs, 'head-to-head'));
  const from = a.from ? resolve(runs, a.from) : readJson(join(out, 'h2h.json'))?.from;
  const tools = resolve(a.tools || join(out, 'tools'));
  const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
  // A control arm in the skill's place: the plain agent's task with another skill installed in its project
  // (--arm-skill <that skill's folder>), built into <out>/arm. Its round names the plain sites to face in h2h.json
  // "plain"; from here on it is scored and judged like a skill arm.
  if (a.prepare && a['arm-skill']) {
    const src = resolve(a['arm-skill']), skill = basename(src);
    if (!existsSync(join(src, 'SKILL.md'))) { console.error(`No SKILL.md in ${src}`); process.exit(2); }
    const lock = a.lock || process.env.BROWSER_LOCK;
    const helper = lock && existsSync(join(dirname(resolve(lock)), 'locked.mjs')) ? join(dirname(resolve(lock)), 'locked.mjs') : null;
    const chosen = scenarios.filter((sc) => String(a.only || '').split(',').some((o) => o && slugOf(sc.name) === o));
    for (const sc of chosen) {
      const dir = join(out, 'arm', slugOf(sc.name));
      for (const d of ['work', 'scratch']) mkdirSync(join(dir, d), { recursive: true });
      cpSync(src, join(dir, 'work', '.claude', 'skills', skill), { recursive: true });
      writeFileSync(join(dir, 'task.md'), plainTask(sc, join(dir, 'work'), helper, { skill: `.claude/skills/${skill}/SKILL.md`, tag: a.tag || skill }));
      console.log(join(dir, 'task.md'));
    }
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'h2h.json'), JSON.stringify({ ...(readJson(join(out, 'h2h.json')) || {}), from: join(out, 'arm'), skill: `${skill} (a control arm: the plain task with that skill installed)` }, null, 2));
    console.log(`Prepared ${chosen.length} task(s) with ${skill}. Give each to a fresh agent; agents.json goes in ${join(out, 'arm')}.`);
    process.exit(0);
  }
  if (!from || !existsSync(from)) { console.error('Name the skill arm\'s run: --from <run folder> (a run.mjs --prepare run with built sites).'); process.exit(2); }
  // the scenarios of that run (a task to build, or a site already built); scoring skips any without a site yet
  const inRun = scenarios.filter((sc) => existsSync(join(from, slugOf(sc.name), 'task.md')) || findSite(join(from, slugOf(sc.name), 'work')));
  const picked = inRun.filter((sc) => !a.only || String(a.only).split(',').some((o) => slugOf(sc.name) === o || slugOf(sc.name).includes(o)));
  mkdirSync(out, { recursive: true });
  const meta = readJson(join(out, 'h2h.json')) || {};
  writeFileSync(join(out, 'h2h.json'), JSON.stringify({ ...meta, from, skill: readJson(join(from, 'run.json'))?.skillSha || meta.skill || null }, null, 2));
  const home = (slug) => armHomes(out, meta, slug);

  if (a.prepare) {
    // a pair whose plain arm an earlier round built (h2h.json "plain") is not built again
    const own = picked.filter((sc) => home(slugOf(sc.name)).plain === out);
    for (const sc of picked) if (!own.includes(sc)) console.log(`plain ${slugOf(sc.name)}: ${home(slugOf(sc.name)).plain}'s (h2h.json "plain"), nothing to prepare`);
    const lock = a.lock || process.env.BROWSER_LOCK;
    const helper = lock && existsSync(join(dirname(resolve(lock)), 'locked.mjs')) ? join(dirname(resolve(lock)), 'locked.mjs') : null;
    for (const sc of own) {
      const dir = join(out, 'plain', slugOf(sc.name));
      for (const d of ['work', 'scratch']) mkdirSync(join(dir, d), { recursive: true });
      writeFileSync(join(dir, 'task.md'), plainTask(sc, join(dir, 'work'), helper));
      console.log(join(dir, 'task.md'));
    }
    if (own.length) console.log(`Prepared ${own.length} plain task(s). Give each to a fresh agent, then: node evals/head-to-head.mjs --score --only <scenario>`);
  }

  const skillDir = resolve(a['score-with'] || join(REPO, 'skills/one-shot-site'));
  const arms = a.arm ? [a.arm] : ARMS;
  if (a.score) {
    for (const sc of picked) for (const arm of arms) {
      const slug = slugOf(sc.name);
      if (home(slug)[arm] !== out) { console.log(`${arm} ${slug}: scored in ${home(slug)[arm]}`); continue; }
      const site = siteOf(arm, slug, from, out);
      if (!site) { console.log(`${arm} ${slug}: no site`); continue; }
      if (existsSync(join(site, 'package.json')) && !existsSync(join(site, 'dist', 'index.html'))) {
        const b = build(site);
        if (!b.ok) { console.log(`${arm} ${slug}: build failed: ${b.log}`); writeFileSync(join(out, `${arm}-${slug}-build.txt`), b.log); continue; }
      }
      const dest = join(out, 'score', arm, slug);
      // the scenario addresses are made up on purpose, so both arms are excused that one rule alike
      const r = await scoreOnce(site, { skillDir, out: dest, name: `${arm} ${slug}`, tools: join(tools, 'axe'), accept: ['made-up-address'] });
      const lh = await lighthouse(r, site, skillDir, tools, dest);
      writeFileSync(join(dest, 'lighthouse.json'), JSON.stringify(lh, null, 2));
      console.log(`${arm} ${slug}: ${r.score}${r.complete ? '' : ' (partial)'} · ${r.audit?.verdict || 'no audit'} · Lighthouse ${lh ? Object.entries(lh).map(([p, s]) => `${p} ${Object.values(s).join('/')}`).join(', ') : 'not run'}`);
    }
    writeFileSync(join(out, 'h2h.json'), JSON.stringify({ ...readJson(join(out, 'h2h.json')), scoredWith: `${skillDir} @ ${gitSha(skillDir) || '?'}` }, null, 2));
  }

  // Lighthouse again on sites already scored, on a browser turn of its own
  if (a.lighthouse) {
    for (const sc of picked) for (const arm of arms) {
      const slug = slugOf(sc.name), site = siteOf(arm, slug, from, out), dest = join(out, 'score', arm, slug);
      if (home(slug)[arm] !== out) { console.log(`${arm} ${slug}: scored in ${home(slug)[arm]}`); continue; }
      if (!site || !existsSync(join(dest, 'score.json'))) { console.log(`${arm} ${slug}: not scored yet`); continue; }
      const lh = await lighthouse(null, site, skillDir, tools, dest);
      writeFileSync(join(dest, 'lighthouse.json'), JSON.stringify(lh, null, 2));
      console.log(`${arm} ${slug}: Lighthouse ${lh ? Object.entries(lh).map(([p, x]) => `${p} ${Object.values(x).join('/')}`).join(', ') : 'not run'}`);
    }
  }

  if (a.judges) {
    const perOrder = +(a['per-order'] || 3), seed = +(a.seed || 1);
    const ready = picked.filter((sc) => ARMS.every((arm) => existsSync(join(home(slugOf(sc.name))[arm], 'score', arm, slugOf(sc.name), 'look', 'sheet-home-1440.jpg'))));
    // with --only, the other pairs' judges and verdicts stay: a pair can be judged as soon as it is scored
    const kept = a.only ? (readJson(join(out, 'judge-key.json'))?.judges || []).filter((j) => !ready.some((sc) => slugOf(sc.name) === j.slug)) : [];
    for (const f of existsSync(join(out, 'judges')) ? readdirSync(join(out, 'judges')) : []) if (!kept.some((j) => j.id === f)) rmSync(join(out, 'judges', f), { recursive: true, force: true });
    // one pair's ids come from the seed and its name, so they differ from the pairs judged before
    const salt = a.only ? [...ready.map((sc) => slugOf(sc.name)).join()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) : 0;
    const set = judgeSet(ready.map((sc) => slugOf(sc.name)), perOrder, (seed + salt) >>> 0);
    if (set.some((j) => kept.some((k) => k.id === j.id))) { console.error('A judge id repeats: run again with another --seed.'); process.exit(1); }
    for (const j of set) {
      const sc = ready.find((x) => slugOf(x.name) === j.slug);
      const dir = join(out, 'judges', j.id);
      mkdirSync(dir, { recursive: true });
      const side = { A: j.skillIs === 'A' ? 'skill' : 'plain', B: j.skillIs === 'B' ? 'skill' : 'plain' };
      for (const s of ['A', 'B']) for (const [w, n] of [['1440', 'desktop'], ['390', 'phone']]) cpSync(join(home(j.slug)[side[s]], 'score', side[s], j.slug, 'look', `sheet-home-${w}.jpg`), join(dir, `${s}-${n}.jpg`));
      writeFileSync(join(dir, 'prompt.md'), judgePrompt(sc, dir));
    }
    // which side is which stays outside the judges' folders
    writeFileSync(join(out, 'judge-key.json'), JSON.stringify({ perOrder, seed, judges: [...kept, ...set] }, null, 2));
    console.log(`${set.length} judge folders in ${join(out, 'judges')} (${ready.length} pairs × 2 orders × ${perOrder})${kept.length ? `, ${kept.length} kept from before` : ''}. One fresh agent per prompt.md, then --tally.`);
    for (const j of set) console.log(join(out, 'judges', j.id, 'prompt.md'));
  }

  // the vote page shows people whole home pages: a page taller than the judges' screens is shot again, every screen,
  // into whole/<arm>/<scenario> of this round (the judges' look/ stays as it was). It opens a browser: one lock turn.
  if (a.whole) {
    for (const sc of picked) for (const arm of ARMS) {
      const slug = slugOf(sc.name), dir = join(home(slug)[arm], 'score', arm, slug);
      const cut = Object.values(seen(join(dir, 'look'))).filter((x) => x.seen < x.of);
      if (!cut.length) continue;
      const target = readJson(join(dir, 'score.json'))?.target;
      if (!target) { console.log(`${arm} ${slug}: no score.json with the site's folder`); continue; }
      const site = resolveTarget(target), dest = join(out, 'whole', arm, slug);
      const r = spawnSync(process.execPath, [join(skillDir, 'scripts', 'look.mjs'), site.url || site.dist, '--widths', '390,1440', '--frames', String(Math.max(...cut.map((x) => x.of))), '--out', dest], { env: { ...process.env, ONE_SHOT_HISTORY: 'off' }, encoding: 'utf8', timeout: 10 * 60000 });
      const got = seen(dest);
      console.log(`${arm} ${slug}: ${r.status === 2 || !got[1440].seen ? `look failed: ${(r.stderr || '').trim().split('\n').pop()}` : `whole, ${got[1440].seen} screens at 1440 and ${got[390].seen} at 390`}`);
    }
  }

  const rounds = [{ ...roundOf(out, scenarios), scenarios: picked }, ...String(a.with || '').split(',').filter(Boolean).map((o) => roundOf(resolve(runs, o), scenarios))];
  const dest = resolve(a.dest || out);
  mkdirSync(dest, { recursive: true });
  if (a.tally) report(rounds, dest, tools);
  if (a['vote-page']) (a.live ? livePage : votePage)(rounds, dest, String(a.more || '').split(',').filter(Boolean).map((o) => roundOf(resolve(runs, o), scenarios)));
}

// Lighthouse on the built site, phone and desktop presets, the same way for both arms (not part of any score)
async function lighthouse(r, site, skillDir, tools, dest) {
  let cli;
  try { cli = join(tools, 'lighthouse', 'node_modules', 'lighthouse', 'cli', 'index.js'); if (!existsSync(cli)) return null; } catch { return null; }
  const dist = existsSync(join(site, 'dist', 'index.html')) ? join(site, 'dist') : site;
  const { serve } = await import(pathToFileURL(join(skillDir, 'scripts/lib/serve.mjs')).href);
  const { findBrowser } = await import(pathToFileURL(join(skillDir, 'scripts/lib/chrome.mjs')).href);
  const env = { ...process.env, CHROME_PATH: process.env.CHROME_PATH || findBrowser() }; // the browser the checks use
  const srv = await serve(dist);
  const res = {};
  try {
    for (const preset of ['mobile', 'desktop']) {
      const file = join(dest, `lighthouse-${preset}.json`);
      const args = [cli, srv.url, '--output=json', `--output-path=${file}`, '--quiet', '--chrome-flags=--headless=new', '--only-categories=performance,accessibility,best-practices,seo', ...(preset === 'desktop' ? ['--preset=desktop'] : [])];
      // not spawnSync: the server runs in this process and has to answer while Lighthouse loads the page
      const r = await new Promise((done) => {
        const p = spawn(process.execPath, args, { env });
        let stderr = '';
        p.stderr.on('data', (d) => { stderr += d; });
        const stop = setTimeout(() => p.kill(), 5 * 60000);
        p.on('error', (error) => { clearTimeout(stop); done({ status: null, error, stderr }); });
        p.on('close', (status, signal) => { clearTimeout(stop); done({ status, signal, stderr }); });
      });
      if (!existsSync(file)) writeFileSync(join(dest, `lighthouse-${preset}.log`), `exit ${r.status} ${r.signal || ''} ${r.error?.message || ''}\n${r.stderr || ''}\n${r.stdout || ''}`);
      const j = readJson(file);
      if (j?.categories) res[preset] = Object.fromEntries(Object.entries(j.categories).map(([k, v]) => [k, v.score === null ? null : Math.round(v.score * 100)]));
    }
  } finally { await srv.close(); }
  return Object.keys(res).length ? res : null;
}

// what the checks found, per arm: the numbers a reviewer can verify without trusting the skill's own score
export function checksOf(s, lh) {
  const f = s.findings || [];
  const n = (re) => f.filter((x) => re.test(x.rule)).length;
  const t = (...ks) => ks.every((k) => !s.tools?.[k]?.ran) ? null : ks.reduce((sum, k) => sum + (s.tools?.[k]?.ran ? s.tools[k].fails + s.tools[k].warns : 0), 0);
  return {
    score: s.score, complete: s.complete, ready: !!s.audit?.ready,
    fails: f.filter((x) => x.level === 'fail').length, warns: f.filter((x) => x.level === 'warn').length,
    look: t('look', 'look-dark'), motion: t('film', 'film-reduced'), audit: t('audit'), lint: t('lint'),
    contrast: s.contrast ?? n(/contrast/), links: n(/^(audit:|lint:)?(broken-link|dead-link|broken-anchor)$/),
    axe: s.axe ?? null,
    headline: s.metrics?.headline ?? null, shift: s.metrics?.layoutShift ?? null, jsKB: s.metrics?.jsKB ?? null, weightKB: s.metrics?.weightKB ?? null,
    lighthouse: lh || null,
  };
}

// a round: one --out folder (its h2h.json names the skill arm's run) and the scenarios prepared in it
// (home(slug): where that pair's arms are)
export function roundOf(out, scenarios) {
  const meta = readJson(join(out, 'h2h.json')) || {}, home = (slug) => armHomes(out, meta, slug);
  return { label: meta.label || basename(out), out, from: meta.from, meta, home, scenarios: scenarios.filter((sc) => existsSync(join(home(slugOf(sc.name)).plain, 'plain', slugOf(sc.name), 'task.md'))) };
}

// Where a pair's builds, scores and transcripts are. A round can reuse an earlier round's plain arm, the same sites
// against a new skill: h2h.json "plain" names that round's folder, or a list of them (relative to the folder the
// rounds sit in). A pair's plain arm is in the first of them that prepared it, else in this round.
export function armHomes(out, meta, slug) {
  const reused = [meta?.plain || []].flat().map((p) => resolve(dirname(out), p));
  const plain = slug ? reused.find((p) => existsSync(join(p, 'plain', slug, 'task.md'))) : reused[0];
  return { skill: out, plain: plain || out };
}

// everything one round has: the verdicts, and per pair each arm's checks and what its build took
function roundData(r) {
  const key = readJson(join(r.out, 'judge-key.json'));
  const verdicts = [];
  for (const j of key?.judges || []) {
    const v = readJson(join(r.out, 'judges', j.id, 'verdict.json'));
    if (v && /^[AB]$/.test(v.winner)) verdicts.push({ round: r.label, ...j, winner: v.winner, why: v.why });
  }
  const home = r.home || ((slug) => armHomes(r.out, r.meta, slug));
  // the skill arm's builders are in its run; each pair's plain builder is in the round its plain arm is from
  const agents = (dir) => readJson(join(dir || '', 'agents.json')) || {};
  const transcript = (arm, slug) => { const t = agents(arm === 'skill' ? r.from : home(slug).plain)[slug]?.transcript; return t && existsSync(t) ? t : null; };
  const rows = r.scenarios.map((sc) => {
    const slug = slugOf(sc.name);
    const arm = (a) => {
      const dir = join(home(slug)[a], 'score', a, slug), s = readJson(join(dir, 'score.json')), t = transcript(a, slug);
      return { src: dir, checks: s ? checksOf(s, readJson(join(dir, 'lighthouse.json'))) : null, usage: t ? buildUsage(t) : null, screens: seen(join(dir, 'look')) };
    };
    return { slug, skill: { ...arm('skill'), reviews: r.from ? reviewsOf(siteOf('skill', slug, r.from)) : [] }, plain: arm('plain') };
  });
  // the plain agents' transcripts: any use of the skill would void the comparison
  const clean = Object.fromEntries(rows.map(({ slug }) => { const t = transcript('plain', slug); return [slug, t === null ? null : skillUse(readFileSync(t, 'utf8'))]; }));
  return { ...r, key, verdicts, tally: tally(verdicts), rows, skillUse: clean };
}

// How often the judges' reasons use the words that mark a skill's site down (louder, colder, busier, odd) or the
// other site's (plain), each with its forms but not inside a compound (cold-brew), so rounds can be compared
export function toneWords(verdicts) {
  // (inside: the CLI above runs before a top-level const here exists)
  const TONE = { louder: /\bloud(?:er|est|ly)?\b(?!-)/gi, colder: /\bcold(?:er|est|ly)?\b(?!-)/gi, busier: /\bbus(?:y|ier|iest)\b(?!-)/gi, odd: /\bodd(?:er|ly)?\b(?!-)/gi, plain: /\bplain(?:er|est|ly)?\b(?!-)/gi };
  return Object.fromEntries(Object.entries(TONE).map(([w, re]) => [w, verdicts.reduce((n, v) => n + (String(v.why || '').match(re)?.length || 0), 0)]));
}

function median(xs) {
  const s = xs.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  // the mean of the middle two, to two places (46.4 and 50.8 make 48.6, not 48.599999999999994)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) * 50) / 100) : null;
}

// one arm over every pair: the faults the same checks found, and what the builds took
export function armTotals(rows, arm) {
  // a plain arm that a later round reuses is one set of builds: counted once
  const seen = new Set();
  const own = rows.filter((r) => !r[arm].src || (!seen.has(r[arm].src) && seen.add(r[arm].src)));
  const cs = own.map((r) => r[arm].checks).filter(Boolean), us = own.map((r) => r[arm].usage).filter(Boolean);
  const sum = (xs, k) => xs.reduce((s, x) => s + (x[k] ?? 0), 0);
  const lh = (p, k) => median(cs.map((c) => c.lighthouse?.[p]?.[k]));
  return {
    sites: cs.length, ready: cs.filter((c) => c.ready).length, fails: sum(cs, 'fails'), warns: sum(cs, 'warns'),
    axe: sum(cs, 'axe'), contrast: sum(cs, 'contrast'), links: sum(cs, 'links'), score: median(cs.map((c) => c.score)),
    lhPhone: ['performance', 'accessibility', 'best-practices', 'seo'].map((k) => lh('mobile', k)),
    lhDesktop: ['performance', 'accessibility', 'best-practices', 'seo'].map((k) => lh('desktop', k)),
    builds: us.length, minutes: median(us.map((u) => u.minutes)), tokens: median(us.map((u) => u.tokens)), output: median(us.map((u) => u.output)),
    minutesAll: Math.round(sum(us, 'minutes')), tokensAll: sum(us, 'tokens'),
  };
}

// the CLI above runs before any const down here exists: functions only
function k(n) { return n == null ? '-' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n); }
function version(tools, dir, pkg) { return readJson(join(tools, dir, 'node_modules', pkg, 'package.json'))?.version || '?'; }

function report(rounds, dest, tools) {
  const data = rounds.map(roundData);
  const verdicts = data.flatMap((d) => d.verdicts), rows = data.flatMap((d) => d.rows);
  const t = tally(verdicts);
  const per = data.find((d) => d.key)?.key?.perOrder;
  const totals = Object.fromEntries(ARMS.map((arm) => [arm, armTotals(rows, arm)]));
  writeFileSync(join(dest, 'head-to-head.json'), JSON.stringify({ date: new Date().toISOString(), tally: t, totals, rounds: data.map(({ scenarios, ...d }) => d) }, null, 2));

  const L = ['# Skill vs plain agent, same brief', ''];
  // rounds with no AI judges (--judges never ran): the checks and the builds' cost only, the looks left to people
  const judged = t.n > 0;
  if (judged) {
    L.push(`**Blind judges picked the skill's site ${t.skill} of ${t.n} times${t.n ? ` (${t.rate}%)` : ''}.** ${data.reduce((s, d) => s + Object.keys(d.tally.by).length, 0)} pairs in ${data.length} round${data.length === 1 ? '' : 's'}${per ? `, each pair judged ${per * 2} times: ${per} with the skill's site shown first, ${per} with it second` : ''}. The first-shown site won ${t.aRate ?? '-'}% of the time (50% means the order made no difference).`, '');
    L.push('| Round | Briefs | Skill | Judgments | Skill picked | Plain picked |', '|---|---|---|---|---|---|');
    for (const d of data) L.push(`| ${d.label} | ${d.meta.about || '-'} | ${d.meta.skill || '?'} | ${d.tally.n} | ${d.tally.skill} | ${d.tally.plain} |`);
    L.push(`| All | | | ${t.n} | ${t.skill} | ${t.plain} |`, '');
  } else {
    L.push(`No AI judges: the same checks on both arms and what each build took, ${rows.length} pair${rows.length === 1 ? '' : 's'} in ${data.length} round${data.length === 1 ? '' : 's'}. The looks are left to people, on the vote page.`, '');
    L.push('| Round | Briefs | Skill |', '|---|---|---|', ...data.map((d) => `| ${d.label} | ${d.meta.about || '-'} | ${d.meta.skill || '?'} |`), '');
  }
  // people's votes from the vote page arrive by hand (they stay in the voter's browser): people.md next to the report
  if (existsSync(join(dest, 'people.md'))) L.push(readFileSync(join(dest, 'people.md'), 'utf8').trim(), '');

  const T = totals;
  const row = (label, f) => `| ${label} | ${f(T.skill)} | ${f(T.plain)} |`;
  L.push('## Per arm, every site', '', '| | Skill | Plain |', '|---|---|---|',
    row('Sites scored', (x) => x.sites),
    row('Ready to ship (the skill\'s audit)', (x) => `${x.ready} of ${x.sites}`),
    row('Score (median, the skill\'s checks)', (x) => x.score ?? '-'),
    row('FAIL findings, all sites', (x) => x.fails),
    row('WARN findings, all sites', (x) => x.warns),
    row('axe-core violations, all sites', (x) => x.axe),
    row('Contrast faults', (x) => x.contrast),
    row('Broken links', (x) => x.links),
    row('Lighthouse phone, median (perf/a11y/best/SEO)', (x) => x.lhPhone.map((v) => v ?? '-').join('/')),
    row('Lighthouse desktop, median', (x) => x.lhDesktop.map((v) => v ?? '-').join('/')),
    row('Minutes per build (median)', (x) => x.minutes ?? '-'),
    row('Tokens per build, read and written (median)', (x) => k(x.tokens)),
    row('Tokens written per build (median)', (x) => k(x.output)),
    row('All builds: minutes, tokens', (x) => `${x.minutesAll}, ${k(x.tokensAll)} (${x.builds} builds)`), '');

  const lhs = (l, p) => ['performance', 'accessibility', 'best-practices', 'seo'].map((x) => l?.[p]?.[x] ?? '-').join('/');
  const scoredWith = [...new Set(data.map((d) => d.meta.checks || d.meta.scoredWith).filter(Boolean))];
  L.push('## Method', '',
    '- Same person, same answers: each scenario\'s first message and answers (`evals/scenarios.json`) go to both arms. The skill arm runs the skill\'s interview and gets those answers; the plain arm gets them all at once in a task with no skill (`plainTask` in `evals/head-to-head.mjs`).',
    '- Same builder: every build is a fresh agent of the same model with the same tools (subagents of one session, the agent route), with up to about two hours. The plain agent is told not to use any skill or read other site projects on the machine, and its transcript is checked for it (below).',
    `- Same checks on both: \`evals/score.mjs\` with the checks of ${scoredWith.join('; ') || 'one fixed checkout'}, frozen; axe-core ${version(tools, 'axe', 'axe-core')} and Lighthouse ${version(tools, 'lighthouse', 'lighthouse')} (phone and desktop presets) from one install. Every scoring job ran alone on the machine (\`locked.mjs --solo\`), one site at a time.`,
    ...(judged ? [`- Blind judges: for each pair, fresh agents see the brief and the home page as screenshots (up to 8 screens at 1440 and at 390 px wide), labelled A and B, nothing else. ${per ?? '?'} judges see the skill's site as A and ${per ?? '?'} as B; folder names are random. Each must pick one, no ties, and say why in one sentence. Which side was which stays in \`judge-key.json\`, outside their folders.`] : []),
    '- People: the same pairs on a local page (`blind-vote/index.html`, nothing published), every screen of each home page at 1440 and 390 px. Each voter gets the pairs in a new random order with random sides; the votes stay in that browser and the tally is at `#results`.', '');

  for (const d of data) {
    L.push(`## Round ${d.label}`, '');
    if (d.meta.about) L.push(`Briefs: ${d.meta.about}. Skill: ${d.meta.skill || '?'}. Skill arm's run: \`${basename(d.from || '?')}\`.`, '');
    // a reused plain arm, per round it is from: the same sites, not built again
    const from = Map.groupBy(d.rows.map((r) => [d.home(r.slug).plain, r.slug]).filter(([p]) => p !== d.out), ([p]) => p);
    const label = (p) => `round ${readJson(join(p, 'h2h.json'))?.label || basename(p)}'s`;
    if (from.size) L.push(`Plain arm: ${[...from].map(([p, xs]) => xs.length === d.rows.length ? label(p) : `${label(p)} for ${xs.map(([, s]) => s).join(', ')}`).join('; ')} builds and scores, the same sites, not built again (counted once in the totals).`, '');
    for (const n of d.meta.notes || []) L.push(`- ${n}`);
    if (d.meta.notes?.length) L.push('');
    const by = d.verdicts.length > 0;
    if (by) L.push('| Pair | Skill picked | Plain picked |', '|---|---|---|', ...Object.entries(d.tally.by).map(([s, v]) => `| ${s} | ${v.skill} | ${v.plain} |`), '');
    const head = ['Pair', 'Arm', 'Score', 'Audit', ...(by ? ['Home screens judged, 1440 / 390'] : []), 'Fails', 'Warns', 'Look faults', 'axe', 'Contrast', 'Broken links', 'Shift', 'JS KB', 'KB', 'Lighthouse phone', 'Lighthouse desktop', 'Minutes', 'Tool calls', 'Agents it started', 'Tokens (written)'];
    L.push(`| ${head.join(' | ')} |`, `|${'---|'.repeat(head.length)}`);
    for (const r of d.rows) for (const arm of ARMS) {
      const c = r[arm].checks, u = r[arm].usage;
      const part = ({ seen: n, of }) => `${n} of ${of}`, shown = by ? ` ${part(r[arm].screens[1440])} / ${part(r[arm].screens[390])} |` : '';
      const cost = u ? `${u.minutes} | ${u.tools} | ${u.subagents?.length ?? '-'} | ${k(u.tokens)} (${k(u.output)})` : '- | - | - | -';
      if (!c) { L.push(`| ${r.slug} | ${arm} | not scored |${' |'.repeat(head.length - 7)} ${cost} |`); continue; }
      L.push(`| ${r.slug} | ${arm} | ${c.score}${c.complete ? '' : '*'} | ${c.ready ? 'ready' : 'not ready'} |${shown} ${c.fails} | ${c.warns} | ${c.look ?? '-'} | ${c.axe ?? '-'} | ${c.contrast} | ${c.links} | ${c.shift ?? '-'} | ${c.jsKB ?? '-'} | ${c.weightKB ?? '-'} | ${lhs(c.lighthouse, 'mobile')} | ${lhs(c.lighthouse, 'desktop')} | ${cost} |`);
    }
    // a page taller than the judges' 8 screens: they judged its top part only
    const cuts = d.rows.flatMap((r) => ARMS.flatMap((arm) => Object.entries(r[arm].screens).filter(([, x]) => x.seen < x.of).map(([w, x]) => `${r.slug} ${arm} at ${w} (${x.seen} of ${x.of})`)));
    if (by) L.push('', cuts.length ? `The judges saw at most 8 screens of a home page at each width. Cut: ${cuts.join(', ')}.` : 'Every home page fit in the judges\' screens.');
    // the skill's reviewer: how often each build called it, and what each review said
    const calls = (r) => r.skill.usage?.subagents?.filter((x) => x.reviewer).length ?? '?';
    const said = (r) => r.skill.reviews?.length ? ` (${r.skill.reviews.map((v) => `round ${v.round}: ${v.verdict || '?'} ${v.weighted ?? '?'}`).join(', ')})` : ', no review file';
    // (only a skill with reviewer.md: an older fresh look wrote review files with no score)
    if (d.rows.some((r) => r.skill.usage?.subagents?.some((x) => x.reviewer) || r.skill.reviews?.some((v) => v.weighted != null))) L.push('', `The skill's reviewer: ${d.rows.map((r) => `${r.slug} called it ${calls(r)} times${said(r)}`).join('; ')}.`);
    const checked = Object.values(d.skillUse).filter((x) => x !== null);
    const hits = Object.entries(d.skillUse).filter(([, x]) => x?.length);
    L.push('', `Plain agents' transcripts checked for any use of the skill (the Skill tool, or a path into the skill, its examples or the skill arm's runs): ${checked.length} of ${Object.keys(d.skillUse).length} read, ${hits.length ? hits.map(([s, x]) => `${s}: ${x.length} hits`).join(', ') : 'none found'}.`, '');
    if (!by) continue;
    const words = toneWords(d.verdicts);
    L.push(`Words in the judges' ${d.verdicts.length} reasons, with their forms (louder, loud; busier, busy; ...): ${Object.entries(words).map(([w, n]) => `${w} ${n}`).join(', ')}.`, '');
    L.push('Every judgment, the losses first:', '');
    const won = (v) => v.winner === v.skillIs;
    for (const v of [...d.verdicts].sort((x, y) => won(x) - won(y) || x.slug.localeCompare(y.slug))) L.push(`- ${v.slug}, skill shown as ${v.skillIs}, picked **${won(v) ? 'skill' : 'plain'}**: ${v.why}`);
    L.push('');
  }

  L.push('## Limits', '',
    '- The score, the audit and the FAIL and WARN counts come from the skill\'s own checks, which the skill arm is built to pass: they show what the plain agent misses by that ruler, not a neutral grade. axe-core and Lighthouse are not the skill\'s, but they test narrow things.',
    ...(judged ? ['- The judges are agents of the same model family as the builders, and they judge screenshots of the home page, not the whole site in use. The people\'s vote page is the check on that.'] : []),
    '- Few briefs, and the first round\'s briefs are the benchmark the skill was tuned on; a round marked unseen uses briefs the skill was not tuned on. One build per arm per brief in a run, so a pair is one draw of each.',
    '- Minutes include waiting for the shared browser lock, which both arms had to do; tokens count every token the model read and wrote, cache reads included, and those of every agent a build started (the skill\'s reviewer or fresh look), from their transcripts next to the build\'s.',
    ...data.flatMap((d) => (d.meta.limits || []).map((l) => `- ${l}`)), '');
  writeFileSync(join(dest, 'head-to-head.md'), L.join('\n') + '\n');
  console.log(L.slice(0, 3).join('\n'));
  console.log(join(dest, 'head-to-head.md'));
}

// The same pairs for people: one page, local only. Each voter gets the pairs in a new random order and sides,
// picks one per pair; the counts stay in this browser (localStorage) and show at #results. Image names are random,
// so not even the page's files say which side is which. more: rounds for a second part the voter may skip. A round's
// h2h.json "names" ({ skill, plain }) names its sides on the results view.
function votePage(rounds, dest, more = []) {
  const dir = join(dest, 'blind-vote');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'img'), { recursive: true });
  const pairs = [], all = [...rounds, ...more];
  for (const r of all) for (const sc of r.scenarios) {
    const slug = slugOf(sc.name);
    const sides = {};
    for (const arm of ARMS) {
      // the whole page when the judges' screens cut it (--whole), else the judges' own screens
      const whole = join(r.out, 'whole', arm, slug), judged = join(r.home(slug)[arm], 'score', arm, slug, 'look');
      const look = screens(whole, 1440).length ? whole : judged;
      const short = Object.entries(seen(look)).filter(([, x]) => x.seen < x.of);
      if (short.length) console.log(`${r.label} ${slug} ${arm}: ${short.map(([w, x]) => `${x.seen} of ${x.of} screens at ${w}`).join(', ')}; run --whole first for the whole page`);
      const shots = { desktop: screens(look, 1440), phone: screens(look, 390) };
      if (!shots.desktop.length) continue;
      const id = randomBytes(4).toString('hex');
      sides[arm] = { desktop: [], phone: [] };
      for (const [kind, list] of Object.entries(shots)) list.forEach((f, i) => { const name = `${id}-${kind}-${i}.jpg`; cpSync(join(look, f), join(dir, 'img', name)); sides[arm][kind].push(`img/${name}`); });
    }
    const names = { x: r.meta?.names?.skill || "The skill's site", y: r.meta?.names?.plain || "The plain agent's site" };
    if (sides.skill && sides.plain) pairs.push({ pair: all.length > 1 ? `${r.label}/${slug}` : slug, about: sc.query, x: sides.skill, y: sides.plain, round: r.label, names, part: more.includes(r) ? 2 : 1 });
  }
  const html = readFileSync(join(here, 'lib', 'blind-vote.html'), 'utf8').replace('/*PAIRS*/[]', JSON.stringify(pairs));
  writeFileSync(join(dir, 'index.html'), html);
  console.log(`${pairs.length} pairs: open ${join(dir, 'index.html')} in a browser (nothing is published; votes stay in that browser).`);
}

// The same pairs as live sites (--vote-page --live): each side's built site, copied under a path that says nothing
// (/p1/3fa2/) into live-vote/, next to the page and the server that serves them all (serve.mjs). People scroll and
// click through both sites; forms and mail links there are demos (lib/live-vote.mjs).
function livePage(rounds, dest, more = []) {
  const dir = join(dest, 'live-vote');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const pairs = [], all = [...rounds, ...more];
  for (const r of all) for (const sc of r.scenarios) {
    const slug = slugOf(sc.name), n = pairs.length + 1, sides = {};
    for (const arm of ARMS) {
      const target = readJson(join(r.home(slug)[arm], 'score', arm, slug, 'score.json'))?.target;
      const site = target && resolveTarget(target);
      if (!site?.dist) { console.log(`${r.label} ${slug} ${arm}: no built site`); continue; }
      const prefix = `/p${n}/${randomBytes(2).toString('hex')}/`;
      copySite(site.dist, join(dir, prefix), prefix);
      sides[arm] = { url: prefix };
    }
    if (!sides.skill || !sides.plain) { for (const s of Object.values(sides)) rmSync(join(dir, s.url), { recursive: true, force: true }); continue; }
    const names = { x: r.meta?.names?.skill || "The skill's site", y: r.meta?.names?.plain || "The plain agent's site" };
    pairs.push({ pair: all.length > 1 ? `${r.label}/${slug}` : slug, about: sc.query, x: sides.skill, y: sides.plain, round: r.label, names, part: more.includes(r) ? 2 : 1 });
  }
  writeFileSync(join(dir, 'index.html'), readFileSync(join(here, 'lib', 'blind-vote-live.html'), 'utf8').replace('/*PAIRS*/[]', JSON.stringify(pairs)));
  cpSync(join(here, 'lib', 'vote-serve.mjs'), join(dir, 'serve.mjs'));
  console.log(`${pairs.length} pairs, live: node "${join(dir, 'serve.mjs')}" "${dir}" --port 4831, then http://127.0.0.1:4831/ (this machine only; votes stay in that browser).`);
}
