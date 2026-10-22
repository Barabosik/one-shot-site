#!/usr/bin/env node
// run: the benchmark. For each scenario in evals/scenarios.json a headless Claude Code builds the site from
// scratch with the skill from a given checkout, a simulated person answers its questions, and then the site is
// built, scored (score.mjs), and checked against the scenario's expected behaviour. Results go to
// evals/results/<time>/ and are compared with evals/baseline.json.
//
//   node evals/run.mjs [--only <scenario>] [--skill-dir <path>] [--model opus] [--parallel 2]
//   node evals/run.mjs --score-only [--from <run folder>]    # score the sites of the last run again, no agent
//   node evals/run.mjs ... --save-baseline                    # make this run the new baseline
//
// --only        a scenario's number (1-12), slug or part of its name; repeat or comma-separate for several
// --skill-dir   the skill under test (default: skills/one-shot-site in this checkout). The run copies it into the
//               work folder's .claude/skills and loads only project settings, so ~/.claude/skills is never used
// --skill-ref   or the skill as committed on a branch or commit (main, my-branch, a commit), uncommitted edits left out
// --prepare     the agent route: write work folders and a task.md per scenario for agents another session starts,
//               then --score-only --from <time> --judge files (a judge agent writes judge.json from judge-prompt.md)
// --lock        with --prepare (or BROWSER_LOCK): a folder the agents mkdir around every script that opens a browser,
//               so one browser runs on the machine at a time (through locked.mjs when it sits next to the folder)
// --score-with  the skill whose checks score the sites (default: --skill-dir). Keep it fixed to compare sites
//               built by two branches with the same ruler
// --runs-dir    where the work happens (default: one-shot-site-runs/evals next to the repository)
// --ask text    take the question tool away, so the interview happens in plain text
// --no-judge    automatic checks only; --rejudge asks the judge again in --score-only
// --keep-scores with --score-only: reuse a scenario's score/score.json when the same checks made it after the site's
//               last build. Score each site on its own browser turn (--only), then summarise them all without a browser
// --budget      dollars per scenario before the agent is stopped (default 30); --timeout minutes (default 120)
// Everything else: evals/README.md.
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, digest, expectations, readTranscript } from './lib/checks.mjs';
import { reply, rules, task } from './lib/sim.mjs';
import { scoreOnce } from './score.mjs';
import { sameness, siteFeatures } from './lib/sameness.mjs';
import { agentEnv, DENY, defaultRunsDir, exportSkill, findClaude, gitSha, hashDir, installSkill, ISOLATE, killTree, REPO } from './lib/agent.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Score differences smaller than these are noise (evals/README.md, "How much the score moves"). scorer: the same
// site scored again, measured. site: the same scenario built again by the agent, an estimate until measured.
export const NOISE = { scorer: 1.5, site: 8 };

function parseArgs(argv) {
  const SWITCHES = new Set(['score-only', 'prepare', 'no-judge', 'rejudge', 'save-baseline', 'help', 'dry']);
  const out = { _: [], only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    if (SWITCHES.has(k)) out[k] = true;
    else if (k === 'only') out.only.push(...String(argv[++i] || '').split(','));
    else out[k] = argv[++i];
  }
  return out;
}

export const slugOf = (name) => name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').split('-').slice(0, 4).join('-');
export const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/:/g, '');

export function pick(scenarios, only) {
  if (!only.length) return scenarios;
  return scenarios.filter((s, i) => only.some((o) => o && (String(i + 1) === o || slugOf(s.name) === o || s.name.toLowerCase().includes(o.toLowerCase()))));
}

// The work folder with the skill copy. A scenario with "start" (a change request) begins from that site: copied in
// as the person's site and committed, as if this skill had made it earlier, with a copy in before/ for the checks.
// A scenario with "serve" (a redesign) gets the old site in old-site/, served on localhost while the agent works.
export const startName = (sc) => sc.start && (basename(sc.start) === 'site' ? basename(dirname(sc.start)) : basename(sc.start));
export function setUpWork(sc, dir, skillDir) {
  const work = join(dir, 'work');
  mkdirSync(work, { recursive: true });
  installSkill(skillDir, work);
  const copy = (from, to) => cpSync(from, to, { recursive: true, filter: (s) => !/[\\/](node_modules|dist|\.git)([\\/]|$)/.test(s.slice(from.length)) });
  if (sc.start) {
    const from = resolve(REPO, sc.start), site = join(work, startName(sc));
    if (!existsSync(site)) {
      copy(from, site);
      const git = (...a) => spawnSync('git', a, { cwd: site, encoding: 'utf8' });
      git('init', '-q', '-b', 'main');
      git('config', 'user.name', 'one-shot-site');
      git('config', 'user.email', 'site@localhost');
      git('add', '-A');
      git('commit', '-q', '-m', 'The site as published');
    }
    if (!existsSync(join(dir, 'before'))) copy(from, join(dir, 'before'));
  }
  if (sc.serve && !existsSync(join(dir, 'old-site'))) copy(resolve(REPO, sc.serve.dir), join(dir, 'old-site'));
  return work;
}
export const serveCommand = (sc, dir) => sc.serve && `node "${join(here, 'fixtures', 'serve.mjs').replace(/\\/g, '/')}" "${join(dir, 'old-site').replace(/\\/g, '/')}" --port ${sc.serve.port}`;

// One scenario, one agent, until it says it is done (or runs out of replies, money or time).
async function runAgent(sc, dir, o) {
  const work = setUpWork(sc, dir, o.skillDir);
  const old = sc.serve ? spawn(process.execPath, [join(here, 'fixtures', 'serve.mjs'), join(dir, 'old-site'), '--port', String(sc.serve.port)], { stdio: 'ignore' }) : null;
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(sc.answers || {}, null, 2));
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { sim: { command: process.execPath, args: [join(here, 'lib', 'answerer.mjs'), join(dir, 'answers.json'), join(dir, 'questions.jsonl')] } } }));
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    ...ISOLATE, '--mcp-config', join(dir, 'mcp.json'),
    '--permission-mode', 'bypassPermissions', '--permission-prompt-tool', 'mcp__sim__answer',
    '--append-system-prompt', rules(work), '--no-session-persistence', '--max-budget-usd', String(o.budget),
    ...(o.model ? ['--model', o.model] : []), ...(o.effort ? ['--effort', o.effort] : []),
    '--disallowedTools', ...DENY, ...(o.ask === 'text' ? ['AskUserQuestion'] : []),
  ];
  const t0 = Date.now();
  const child = spawn(o.claude, args, { cwd: work, env: agentEnv(), stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  const log = createWriteStream(join(dir, 'transcript.jsonl'));
  const err = createWriteStream(join(dir, 'stderr.txt'));
  child.stderr.pipe(err);
  const say = (text) => child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' }) + '\n');
  const state = { replies: 0, materialSent: false };
  let turnText = '', stop = null;
  const timer = setTimeout(() => { stop = `timed out after ${o.timeout} min`; killTree(child); }, o.timeout * 60000);
  say(sc.query);
  createInterface({ input: child.stdout }).on('line', (line) => {
    log.write(line + '\n');
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === 'assistant' && !m.parent_tool_use_id) for (const c of m.message?.content || []) if (c.type === 'text') turnText += c.text + '\n';
    if (m.type !== 'result') return;
    if (m.subtype && m.subtype !== 'success') stop = stop || `stopped: ${m.subtype}`;
    const next = stop ? null : reply(sc, state, turnText, o.maxReplies);
    turnText = '';
    if (next) say(next); else child.stdin.end();
  });
  const code = await new Promise((r) => child.on('close', r));
  clearTimeout(timer);
  old?.kill();
  log.end(); err.end();
  return { exit: code, minutes: Math.round((Date.now() - t0) / 6000) / 10, replies: state.replies, stop };
}

// The site the agent made: the folder under work/ with a brief (or else a package.json), newest first.
export function findSite(work) {
  const found = [];
  const look = (d, depth) => {
    for (const f of existsSync(d) ? readdirSync(d) : []) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      const p = join(d, f);
      if (!statSync(p).isDirectory()) continue;
      if (existsSync(join(p, 'package.json'))) found.push({ p, brief: existsSync(join(p, '.one-shot', 'brief.md')), t: statSync(join(p, 'package.json')).mtimeMs });
      else if (depth < 2) look(p, depth + 1);
    }
  };
  look(work, 0);
  found.sort((a, b) => (b.brief - a.brief) || (b.t - a.t));
  return found[0]?.p || null;
}

export function build(site) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const sh = { cwd: site, encoding: 'utf8', shell: process.platform === 'win32', timeout: 10 * 60000 };
  if (!existsSync(join(site, 'node_modules'))) spawnSync(npm, ['install', '--no-audit', '--no-fund'], sh);
  const r = spawnSync(npm, ['run', 'build'], sh);
  return { ok: r.status === 0 && existsSync(join(site, 'dist', 'index.html')), log: (r.stdout + r.stderr).trim().split('\n').slice(-6).join('\n') };
}

const RUBRIC = () => readFileSync(join(here, 'judge.md'), 'utf8');

// What the judge reads. how = 'claude' (claude -p answers on stdout) or 'files' (a judge agent writes judge.json).
export function judgePrompt(sc, items, dir, site, how) {
  const rel = (p) => (p ? relative(dir, p).replace(/\\/g, '/') : '(none)');
  const at = how === 'files' ? dir.replace(/\\/g, '/') : 'the current folder';
  return [
    RUBRIC(),
    '## This run',
    `The person asked: "${sc.query}"`,
    `Their answers: ${JSON.stringify(sc.answers)}`,
    `Files (relative to ${at}): transcript.md (what was said, asked and run, in order; empty when the host kept no transcript), questions.jsonl or interview.md (the questions the agent asked, and the answers), the site at ${rel(site)} (brief: ${rel(site)}/.one-shot/brief.md, pages: ${rel(site)}/*.html and src/), score/score.md (the checks), score/sheet.jpg (desktop and phone screens), score/look/sheet-home-390.jpg and score/look/sheet-home-1440.jpg (every screen).`,
    ...(sc.start ? [`This is a change request on a site the skill made earlier: before/ is that site as it was when the run started (its source; compare it with the site's).`] : []),
    ...(sc.serve ? [`This is a redesign: old-site/ is the person's old site (the pages the agent was pointed at).`] : []),
    ...(sc.facts?.length ? [`Facts the site must keep (patterns): ${sc.facts.join(', ')}`] : []),
    '## Expectations to judge',
    ...items.map((e) => `${e.i}. ${e.text}${e.autoResults?.length ? `  (automatic checks: ${e.autoResults.map((r) => `${r.check} ${r.pass ? 'passed' : 'failed'}: ${r.detail}`).join('; ')})` : ''}`),
    '',
    how === 'files'
      ? `Write your verdicts as JSON to ${join(dir, 'judge.json').replace(/\\/g, '/')}, in exactly this shape, one entry per expectation above: [{"i": <number>, "pass": true|false, "evidence": "<one or two sentences, naming the file or screen>"}]. Change nothing else.`
      : 'Answer with only this JSON: {"verdicts": [{"i": <number>, "pass": true|false, "evidence": "<one or two sentences, naming the file or screen>"}]}',
  ].join('\n\n');
}

// The judge: a second, read-only Claude that checks the expectations a script can't, against the rubric.
async function judge(sc, items, dir, site, o) {
  if (!items.length) return [];
  if (!o.claude) return items.map((e) => ({ i: e.i, pass: false, evidence: 'no claude CLI to judge with' }));
  const prompt = judgePrompt(sc, items, dir, site, 'claude');
  writeFileSync(join(dir, 'judge-prompt.md'), prompt);
  const args = ['-p', prompt, '--output-format', 'json', '--model', o.judgeModel, '--tools', 'Read,Glob,Grep', '--disable-slash-commands',
    ...ISOLATE, '--no-session-persistence', '--permission-mode', 'bypassPermissions', '--max-budget-usd', '3'];
  const r = spawnSync(o.claude, args, { cwd: dir, env: agentEnv(), encoding: 'utf8', timeout: 20 * 60000, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(dir, 'judge.raw.json'), r.stdout || r.stderr || '');
  let text = '';
  let cost = 0;
  try { const j = JSON.parse(r.stdout); text = j.result || ''; cost = j.total_cost_usd || 0; } catch { text = r.stdout || ''; }
  const m = text.match(/\{[\s\S]*"verdicts"[\s\S]*\}/);
  let verdicts = [];
  try { verdicts = JSON.parse(m[0]).verdicts; } catch { return items.map((e) => ({ i: e.i, pass: false, evidence: `the judge gave no readable answer: ${(r.stderr || text).slice(0, 200)}`, cost })); }
  return items.map((e) => ({ cost, ...(verdicts.find((v) => +v.i === e.i) || { i: e.i, pass: false, evidence: 'not judged' }) }));
}

// One scenario after the agent: build, score, check, judge. Writes result.json in its run folder.
async function evaluate(sc, dir, o, agent) {
  const work = join(dir, 'work');
  const site = findSite(work);
  // agent route: the host keeps each agent's transcript; <run>/agents.json says where ({ "<slug>": "<path>.jsonl" })
  // (or { "transcript": "<path>", "tokens": n, "minutes": n } when the host reported them)
  let kept = readJson(join(dirname(dir), 'agents.json'))?.[slugOf(sc.name)];
  if (typeof kept === 'string') kept = { transcript: kept };
  if (kept?.transcript && existsSync(kept.transcript) && !existsSync(join(dir, 'transcript.jsonl'))) cpSync(kept.transcript, join(dir, 'transcript.jsonl'));
  if (kept && !agent) agent = { tokens: kept.tokens, minutes: kept.minutes };
  const transcript = existsSync(join(dir, 'transcript.jsonl')) ? readFileSync(join(dir, 'transcript.jsonl'), 'utf8') : '';
  const t = readTranscript(transcript);
  writeFileSync(join(dir, 'transcript.md'), digest(transcript));
  const result = { name: sc.name, slug: slugOf(sc.name), site, agent: agent || readJson(join(dir, 'result.json'))?.agent || null,
    model: t.init?.model || null, claudeVersion: t.init?.version || null, skillsLoaded: t.init?.skills || [], cost: Math.round(t.cost * 100) / 100,
    turns: t.turns, skillUsed: t.events.some((e) => /^skill .*one-shot-site/.test(e) || /^read .*one-shot-site[\\/]SKILL\.md/i.test(e)), error: null };
  let score = null;
  if (!site) result.error = 'the agent made no site folder';
  else {
    const b = existsSync(join(site, 'dist', 'index.html')) && o.scoreOnly ? { ok: true } : build(site);
    if (!b.ok) result.error = `build failed: ${b.log}`;
    else {
      const had = o.keepScores && keptScore(dir, site, o.scoreWith);
      if (had) score = had;
      else {
        try { score = await scoreOnce(site, { skillDir: o.scoreWith, out: join(dir, 'score'), name: result.slug }); }
        catch (e) { result.error = `scoring failed: ${e.message}`; }
      }
    }
  }
  result.score = score ? score.score : 0;
  result.complete = !!score?.complete;
  result.parts = score ? Object.fromEntries(Object.entries(score.parts).map(([k, p]) => [k, p.points])) : null;
  result.metrics = score?.metrics || null;
  result.audit = score?.audit || null;
  result.firstScreen = score?.firstScreen?.pattern || null;
  result.axe = score?.axe ?? null;
  // expected behaviour: automatic checks first, then the judge for the rest
  const asked = [...t.asked, ...readLines(join(dir, 'questions.jsonl')).filter((x) => x.kind === 'question').map((x) => x.questions)];
  const interview = existsSync(join(dir, 'interview.md')) ? readFileSync(join(dir, 'interview.md'), 'utf8') : '';
  const ctx = { events: t.events, asked, interview, site, result: score, before: existsSync(join(dir, 'before')) ? join(dir, 'before') : null, facts: sc.facts || [] };
  const items = expectations(sc).map((e) => ({ ...e, autoResults: e.auto.map((c) => check(c, ctx)) }));
  const old = readJson(join(dir, 'judge.json'));
  const toJudge = items.filter((e) => e.judge);
  let verdicts = [];
  if (o.noJudge || !toJudge.length) verdicts = [];
  else if (old && !o.rejudge) verdicts = old;
  else if (o.judge === 'files') writeFileSync(join(dir, 'judge-prompt.md'), judgePrompt(sc, toJudge, dir, site, 'files')); // a judge agent writes judge.json
  else verdicts = await judge(sc, toJudge, dir, site, o);
  if (verdicts.length) writeFileSync(join(dir, 'judge.json'), JSON.stringify(verdicts, null, 2));
  result.judgeCost = Math.round((verdicts[0]?.cost || 0) * 100) / 100;
  result.expectations = items.map((e) => {
    const v = verdicts.find((x) => x.i === e.i);
    const autoOk = e.autoResults.every((r) => r.pass);
    const judged = e.judge ? (v ? !!v.pass : null) : true;
    return { i: e.i, text: e.text, pass: autoOk && judged === true, auto: e.autoResults, judge: e.judge ? (v ? { pass: !!v.pass, evidence: v.evidence } : null) : undefined };
  });
  result.passed = result.expectations.filter((e) => e.pass).length;
  result.total = result.expectations.length;
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  return { result, score };
}

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

// the score a scenario already has, when the same checks made it after the site's last build (--keep-scores)
export function keptScore(dir, site, scoreWith) {
  const f = join(dir, 'score', 'score.json'), s = readJson(f);
  if (!s?.skillDir || resolve(s.skillDir) !== resolve(scoreWith)) return null;
  const built = join(site, 'dist', 'index.html');
  return existsSync(built) && statSync(f).mtimeMs >= statSync(built).mtimeMs ? s : null;
}
const readLines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);

export function compare(summary, baseline) {
  if (!baseline) return null;
  const rows = summary.scenarios.map((s) => {
    const b = baseline.scenarios?.[s.slug];
    if (!b) return { slug: s.slug, score: s.score, base: null };
    const d = Math.round((s.score - b.score) * 10) / 10;
    return { slug: s.slug, score: s.score, base: b.score, delta: d, passed: s.passed, basePassed: b.passed, total: s.total, real: Math.abs(d) > NOISE.site };
  });
  const both = rows.filter((r) => r.base !== null);
  const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const subagents = (x) => /subagents|^agent$/.test(x || '');
  return { baselineDate: baseline.date, baselineSha: baseline.skillSha, sameModel: baseline.model === summary.model, sameRoute: subagents(baseline.route) === subagents(summary.route), baselineRoute: baseline.route || '?', rows, meanDelta: both.length ? mean(both.map((r) => r.delta)) : null };
}

export function summaryMd(s, cmp) {
  const L = [`# Benchmark ${s.stamp}`, '', `Skill: \`${s.skillDir}\` @ ${s.skillSha || '?'} (${s.skillHash}) · model ${s.model || '?'} · scored with ${s.scoreWithSha || '?'}${s.scoredFrom ? ` · re-scored from ${s.scoredFrom}` : ''}`, ''];
  L.push(`**Mean score ${s.mean}** · expectations ${s.passed}/${s.total}${s.cost ? ` · cost ${s.cost}` : ''}`, '');
  L.push('| Scenario | Score | Expectations | Audit | Headline | Shift | JS KB | Cost | Minutes |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of s.scenarios) L.push(`| ${r.slug} | ${r.score}${r.complete ? '' : '*'} | ${r.passed}/${r.total} | ${r.audit ? (r.audit.ready ? 'ready' : 'not ready') : '-'} | ${r.metrics?.headline ?? '-'} | ${r.metrics?.layoutShift ?? '-'} | ${r.metrics?.jsKB ?? '-'} | ${r.cost ? `${r.cost}` : r.agent?.tokens ? `${Math.round(r.agent.tokens / 1000)}k tokens` : '-'} | ${r.agent?.minutes ?? '-'} |`);
  if (s.scenarios.some((r) => !r.complete)) L.push('', '\\* partial score: a check did not run (see the scenario\'s score.md).');
  if (cmp) {
    L.push('', `## Against the baseline (${cmp.baselineDate}, ${cmp.baselineSha || '?'})${cmp.sameModel ? '' : ' — different model, compare with care'}${cmp.sameRoute === false ? ` — the baseline was ${cmp.baselineRoute}, this run was not: compare like with like` : ''}`, '');
    L.push('| Scenario | Now | Baseline | Change | Expectations |', '|---|---|---|---|---|');
    for (const r of cmp.rows) L.push(`| ${r.slug} | ${r.score} | ${r.base ?? '-'} | ${r.base === null ? 'new' : `${r.delta > 0 ? '+' : ''}${r.delta}${r.real ? ' (real)' : ' (noise)'}`} | ${r.base === null ? '' : `${r.passed}/${r.total} (was ${r.basePassed})`} |`);
    if (cmp.meanDelta !== null) L.push('', `Mean change: ${cmp.meanDelta > 0 ? '+' : ''}${cmp.meanDelta}. One run per scenario: a single site moves up to ±${NOISE.site} points between agent runs, so only bigger changes (or the same direction across most scenarios) mean something.`);
  }
  if (s.sameness) {
    L.push('', `## Sameness across the batch: ${s.sameness.value} / 100`, '', 'Lower is better: 0 means no two sites share fonts, ground, footer or first-screen pattern and no section repeats a shape.', '');
    L.push(...s.sameness.lines.map((x) => `- ${x}`), '', '| Site | Fonts | Ground | Footer | Repeated sections | First screen |', '|---|---|---|---|---|---|');
    for (const x of s.sameness.sites) L.push(`| ${x.name} | ${x.fonts.join(', ')} | ${x.ground} | ${x.footer} | ${Math.round((x.repeatShare || 0) * 100)}% | ${x.firstScreen || '?'} |`);
  }
  L.push('', '## Expectations', '');
  for (const r of s.scenarios) {
    L.push(`### ${r.slug}${r.error ? ` — ${r.error.split('\n')[0]}` : ''}`, '');
    for (const e of r.expectations || []) {
      const why = [...(e.auto || []).filter((a) => !a.pass).map((a) => `${a.check}: ${a.detail}`), ...(e.judge && !e.judge.pass ? [`judge: ${e.judge.evidence}`] : e.judge === null ? ['not judged'] : [])];
      L.push(`- ${e.pass ? 'pass' : '**miss**'} ${e.text}${why.length ? ` — ${why.join('; ')}` : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
  const o = {
    skillDir: resolve(a['skill-dir'] || join(REPO, 'skills/one-shot-site')),
    model: a.model || 'opus', effort: a.effort, judgeModel: a['judge-model'] || 'sonnet', ask: a.ask || 'tool',
    budget: +(a.budget || 30), timeout: +(a.timeout || 120), maxReplies: +(a['max-replies'] || 8), parallel: Math.max(1, +(a.parallel || 2)),
    noJudge: !!a['no-judge'], rejudge: !!a.rejudge, scoreOnly: !!a['score-only'], judge: a.judge || 'claude', keepScores: !!a['keep-scores'],
  };
  const runsDir = resolve(a['runs-dir'] || defaultRunsDir());
  const now = stamp();
  // --skill-ref main: the skill as committed on a branch, exported into the run folder (uncommitted edits stay out)
  if (a['skill-ref'] && !a['score-only']) {
    o.skillDir = join(runsDir, now, 'skill');
    o.skillSha = `${a['skill-ref']} @ ${exportSkill(a['skill-ref'], o.skillDir)}`;
  }
  o.scoreWith = resolve(a['score-with'] || o.skillDir);
  if (!existsSync(join(o.skillDir, 'SKILL.md'))) { console.error(`No SKILL.md in ${o.skillDir}`); process.exit(2); }
  const scenarios = pick(JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8')), a.only);
  if (!scenarios.length) { console.error(`No scenario matches ${a.only.join(', ')}.`); process.exit(2); }

  let runDir = join(runsDir, now);
  if (o.scoreOnly) {
    const from = a.from ? resolve(runsDir, a.from) : readdirSync(runsDir).filter((d) => /^\d{4}-\d\d-\d\dT\d{4}$/.test(d)).sort().pop();
    if (!from) { console.error(`No earlier run in ${runsDir} to score.`); process.exit(2); }
    runDir = resolve(runsDir, from);
    // a run is scored with the checks of the skill it was built with, unless --score-with says otherwise
    const built = readJson(join(runDir, 'run.json'))?.skillDir;
    if (!a['score-with'] && built && existsSync(join(built, 'scripts'))) o.scoreWith = built;
  }
  if (a.prepare) {
    // the agent route: work folders and one task file per scenario, for agents that another session starts
    for (const sc of scenarios) {
      const dir = join(runDir, slugOf(sc.name));
      setUpWork(sc, dir, o.skillDir);
      mkdirSync(join(dir, 'scratch'), { recursive: true });
      writeFileSync(join(dir, 'task.md'), task(sc, join(dir, 'work'), dir, a.lock || process.env.BROWSER_LOCK, { site: startName(sc), serve: serveCommand(sc, dir) }));
      console.log(join(dir, 'task.md'));
    }
    writeFileSync(join(runDir, 'run.json'), JSON.stringify({ route: 'agent', skillDir: o.skillDir, skillSha: o.skillSha || gitSha(o.skillDir), skillHash: hashDir(o.skillDir), model: a.model || null }, null, 2));
    console.log(`Prepared ${scenarios.length} scenario(s). Give each agent its task.md, then: node evals/run.mjs --score-only --from ${now} --judge files`);
    process.exit(0);
  }
  try { o.claude = findClaude(a.claude); } catch (e) { if (!o.scoreOnly) { console.error(e.message); process.exit(2); } }
  console.log(o.scoreOnly
    ? `Scoring ${scenarios.length} scenario(s) · checks from ${o.scoreWith} · ${runDir}`
    : `Running ${scenarios.length} scenario(s) · skill ${o.skillDir} @ ${gitSha(o.skillDir) || '?'} · ${runDir}`);
  if (a.dry) process.exit(0);

  // agents in parallel (they take a while), then scoring one at a time (timings are measured, so no crowding)
  const agents = new Map();
  if (!o.scoreOnly) {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'run.json'), JSON.stringify({ route: 'claude -p', skillDir: o.skillDir, skillSha: o.skillSha || gitSha(o.skillDir), skillHash: hashDir(o.skillDir), model: o.model }, null, 2));
    const queue = [...scenarios];
    await Promise.all(Array.from({ length: Math.min(o.parallel, queue.length) }, async () => {
      while (queue.length) {
        const sc = queue.shift();
        const dir = join(runDir, slugOf(sc.name));
        mkdirSync(dir, { recursive: true });
        console.log(`  ${slugOf(sc.name)}: agent started`);
        const r = await runAgent(sc, dir, o).catch((e) => ({ exit: null, stop: `could not start: ${e.message}` }));
        agents.set(sc.name, r);
        console.log(`  ${slugOf(sc.name)}: agent finished in ${r.minutes ?? '?'} min${r.stop ? ` (${r.stop})` : ''}`);
      }
    }));
  }
  const results = [];
  for (const sc of scenarios) {
    const dir = join(runDir, slugOf(sc.name));
    if (!existsSync(dir)) { console.log(`  ${slugOf(sc.name)}: no run folder, skipped`); continue; }
    const { result } = await evaluate(sc, dir, o, agents.get(sc.name));
    results.push(result);
    console.log(`  ${result.slug}: ${result.score}${result.complete ? '' : ' (partial)'} · ${result.passed}/${result.total} expectations${result.error ? ` · ${result.error.split('\n')[0]}` : ''}`);
  }

  const out = join(here, 'results', o.scoreOnly ? `${now}-rescore` : now);
  mkdirSync(out, { recursive: true });
  for (const r of results) {
    const d = join(out, r.slug);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'result.json'), JSON.stringify(r, null, 2));
    for (const f of ['score.json', 'score.md', 'sheet.jpg']) if (existsSync(join(runDir, r.slug, 'score', f))) cpSync(join(runDir, r.slug, 'score', f), join(d, f));
  }
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const run = readJson(join(runDir, 'run.json')) || {}; // what was tested, written when the run started
  const summary = {
    stamp: basename(out), date: new Date().toISOString(), runDir, route: run.route || 'claude -p', scoredFrom: o.scoreOnly ? basename(runDir) : undefined,
    skillDir: run.skillDir || o.skillDir, skillSha: run.skillSha ?? gitSha(o.skillDir), skillHash: run.skillHash || hashDir(o.skillDir),
    // the checks that scored it: a commit, or the run's own skill copy (a folder outside git)
    scoreWithSha: gitSha(o.scoreWith) || (resolve(o.scoreWith) === resolve(run.skillDir || o.skillDir) ? 'its own skill' : o.scoreWith),
    model: results.find((r) => r.model)?.model || run.model || o.model, judgeModel: o.noJudge ? null : o.judgeModel, ask: o.ask,
    mean: results.length ? Math.round((sum(results.map((r) => r.score)) / results.length) * 10) / 10 : 0,
    passed: sum(results.map((r) => r.passed)), total: sum(results.map((r) => r.total)),
    cost: Math.round(sum(results.map((r) => r.cost + (r.judgeCost || 0))) * 100) / 100,
    scenarios: results.map((r) => ({ name: r.name, slug: r.slug, score: r.score, complete: r.complete, parts: r.parts, metrics: r.metrics, audit: r.audit, axe: r.axe, firstScreen: r.firstScreen, passed: r.passed, total: r.total, cost: r.cost, agent: r.agent, error: r.error, expectations: r.expectations })),
  };
  // do the scenarios' sites come out alike? (fonts, ground, footer, repeated section shapes). Redesigns and change
  // requests keep the look the business already had, so they aren't counted.
  const { rgbToOklch } = await import(pathToFileURL(join(o.scoreWith, 'scripts', 'palette.mjs')).href).catch(() => ({}));
  const keptLook = (sc) => (sc?.start ? 'a change request' : sc?.serve ? 'a redesign' : false);
  summary.sameness = sameness(results.filter((r) => r.site).map((r) => ({ ...siteFeatures(r.site, r.slug, rgbToOklch), firstScreen: r.firstScreen, keptLook: keptLook(scenarios.find((sc) => sc.name === r.name)) })));
  const baseline = readJson(join(here, 'baseline.json'));
  const cmp = compare(summary, baseline);
  summary.compare = cmp;
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, 'summary.md'), summaryMd(summary, cmp));
  if (a['save-baseline']) {
    writeFileSync(join(here, 'baseline.json'), JSON.stringify({
      date: summary.date, stamp: summary.stamp, route: summary.route === 'agent' ? 'built by subagents (agent route)' : summary.route, skillSha: summary.skillSha, skillHash: summary.skillHash, model: summary.model, mean: summary.mean, sameness: summary.sameness?.value ?? null,
      passed: summary.passed, total: summary.total,
      scenarios: Object.fromEntries(summary.scenarios.map((s) => [s.slug, { score: s.score, complete: s.complete, passed: s.passed, total: s.total, parts: s.parts, metrics: s.metrics, audit: s.audit?.verdict ?? null, axe: s.axe, firstScreen: s.firstScreen, agent: s.agent }])),
    }, null, 2) + '\n');
    console.log('Saved as the new baseline: evals/baseline.json');
  }
  console.log(`\nMean ${summary.mean} · expectations ${summary.passed}/${summary.total} · $${summary.cost}${cmp?.meanDelta !== null && cmp ? ` · ${cmp.meanDelta > 0 ? '+' : ''}${cmp.meanDelta} against the baseline` : ''}\n${join(out, 'summary.md')}`);
}
