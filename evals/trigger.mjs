#!/usr/bin/env node
// trigger: does the skill's description make Claude Code pick the skill when it should, and leave it alone when it
// shouldn't? Each query in evals/triggers.json goes to a headless Claude Code that has only this skill installed;
// the first tool it reaches for decides: the Skill tool (or reading the skill's SKILL.md) counts as triggered,
// anything else, or no tool at all, as not. The run is stopped right there, so a query costs little.
//
//   node evals/trigger.mjs [--skill-dir skills/one-shot-site] [--runs 3] [--model opus] [--parallel 4]
//                          [--description "another description to try"] [--only 3,12]
//   node evals/trigger.mjs --prepare [--runs 3] [--description "…"]   # the agent route, when there is no CLI login
//   node evals/trigger.mjs --score <time>                              # after the agents wrote their answers
//
// A query passes when it triggers in at least half of its runs and should, or in less than half and shouldn't.
// Writes evals/results/triggers-<time>.json and .md.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { agentEnv, defaultRunsDir, findClaude, gitSha, hashDir, installSkill, ISOLATE, killTree, REPO } from './lib/agent.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// The first tool call says whether the skill was chosen.
export function verdict(toolUse) {
  if (!toolUse) return false;
  const input = JSON.stringify(toolUse.input || {});
  if (toolUse.name === 'Skill') return /one-shot-site/.test(input);
  if (toolUse.name === 'Read') return /one-shot-site[\\/]+SKILL\.md/i.test(input);
  return false;
}

function ask(query, project, o) {
  return new Promise((done) => {
    const args = ['-p', query, '--output-format', 'stream-json', '--verbose', ...ISOLATE, '--permission-mode', 'bypassPermissions',
      '--no-session-persistence', '--max-budget-usd', '1', ...(o.model ? ['--model', o.model] : [])];
    const child = spawn(o.claude, args, { cwd: project, env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let first = null, finished = false, skills = null, err = '';
    const end = (why) => { if (finished) return; finished = true; clearTimeout(timer); killTree(child); done({ triggered: verdict(first), first: first ? `${first.name} ${JSON.stringify(first.input).slice(0, 120)}` : null, why, skills, err: err.slice(-300) }); };
    const timer = setTimeout(() => end('timeout'), 180000);
    child.stderr.on('data', (d) => { err += d; });
    createInterface({ input: child.stdout }).on('line', (line) => {
      let m;
      try { m = JSON.parse(line); } catch { return; }
      if (m.type === 'system' && m.subtype === 'init') skills = m.skills || null;
      if (m.type === 'assistant') {
        const t = (m.message?.content || []).find((c) => c.type === 'tool_use');
        if (t) { first = t; end('tool'); }
        const text = (m.message?.content || []).find((c) => c.type === 'text')?.text || '';
        if (/Failed to authenticate|Invalid API key|Please run \/login/i.test(text)) { err += text; end('auth'); }
      }
      if (m.type === 'result') end('answered without tools');
    });
    child.on('close', () => end('exited'));
  });
}

// The agent route (no CLI login): agents that another session starts read the skill list the way Claude Code shows
// it and say which skill they would load first for each query. A proxy for the real test above: it asks for the
// decision instead of watching it, so read small differences with care.
// Other skills a person may well have installed, so the description has to win against them. Paraphrased from
// common public skills.
export const OTHER_SKILLS = {
  'frontend-design': 'Create distinctive, production-grade frontend interfaces with high design quality. Use when the user asks to build web components, pages or applications.',
  'web-artifacts-builder': 'Build elaborate multi-component HTML artifacts with React, Tailwind CSS and shadcn/ui, for state, routing or many components.',
  'webapp-testing': 'Test local web applications with Playwright: check frontend behaviour, take screenshots, read browser logs.',
  'canvas-design': 'Create visual art as .png and .pdf files: posters, illustrations, static designs.',
  'brand-guidelines': "Apply a company's brand colours and typography to any artifact.",
  'theme-factory': 'Style artifacts such as slides, documents, reports and landing pages with one of ten ready-made themes, or make a new theme.',
  docx: 'Create, read and edit Word documents (.docx).',
  pdf: 'Read, fill, merge, split and create PDF files.',
  pptx: 'Create and edit PowerPoint presentations (.pptx).',
  xlsx: 'Create and edit spreadsheets (.xlsx, .csv).',
  'internal-comms': 'Write internal communications: status reports, newsletters, FAQs, incident reports.',
  'mcp-builder': 'Build MCP servers that let models use outside services.',
  'skill-creator': 'Create new skills and improve existing ones.',
  'algorithmic-art': 'Make generative art with p5.js.',
};

// a fixed shuffle per run, so each run sees the queries and skills in another order
export function shuffled(list, seed) {
  const out = [...list];
  let x = (seed * 9301 + 49297) % 233280;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function agentPrompt(queries, description, seed, answerFile) {
  const skills = shuffled(Object.entries({ 'one-shot-site': description, ...OTHER_SKILLS }), seed + 7);
  return [
    'You are Claude Code. These skills are installed (name: description), exactly as you would see them:',
    '',
    ...skills.map(([n, d]) => `- ${n}: ${d}`),
    '',
    'Below are first messages from different people, each opening a fresh conversation in an empty project folder.',
    'For each one on its own, as if it were the only message you had seen: would your first step be to load one of',
    'these skills, and which? Answer null when you would load none (answer directly, ask a question, or start working',
    "without a skill). Don't do the tasks and don't open any files.",
    '',
    ...shuffled(queries, seed).map((q) => `${q.n}. ${q.query}`),
    '',
    `Write only this JSON to ${answerFile.replace(/\\/g, '/')}: [{"n": <number>, "skill": "<name>" or null}], one entry per message.`,
  ].join('\n');
}

export function rowsOf(queries, got) {
  return queries.map((q) => {
    const rs = got.get(q.n) || [];
    const rate = rs.length ? rs.filter((r) => r.triggered).length / rs.length : 0;
    return { n: q.n, query: q.query, should: q.should_trigger, rate: Math.round(rate * 100) / 100, pass: q.should_trigger ? rate >= 0.5 : rate < 0.5, first: rs.map((r) => r.first || r.why || 'none') };
  });
}

function report(rows, meta, stamp) {
  const tp = rows.filter((r) => r.should && r.pass).length, fn = rows.filter((r) => r.should && !r.pass).length;
  const tn = rows.filter((r) => !r.should && r.pass).length, fp = rows.filter((r) => !r.should && !r.pass).length;
  const result = { date: new Date().toISOString(), ...meta, passed: tp + tn, total: rows.length, recall: tp + fn ? Math.round((tp / (tp + fn)) * 100) / 100 : null, precision: tp + fp ? Math.round((tp / (tp + fp)) * 100) / 100 : null, rows };
  const out = join(here, 'results', `triggers-${stamp}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out + '.json', JSON.stringify(result, null, 2));
  writeFileSync(out + '.md', [
    `# Trigger test ${stamp}`, '', `${result.passed}/${result.total} right · recall ${result.recall} (should trigger and did) · precision ${result.precision} (triggered and should have) · ${meta.route}, ${meta.model || '?'}, ${meta.runs} runs each`, '',
    `Description: ${meta.description}`, '', '| # | Should | Rate | Pass | Query |', '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.n} | ${r.should ? 'yes' : 'no'} | ${r.rate} | ${r.pass ? 'pass' : '**miss**'} | ${r.query} |`), '',
    '## First choice per run', '', ...rows.map((r) => `- ${r.n}: ${r.first.join(' · ')}`), '',
  ].join('\n'));
  console.log(`${result.passed}/${result.total} right · recall ${result.recall} · precision ${result.precision}\n${out}.md`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  const o = { model: a.model || 'opus', runs: +(a.runs || 3), parallel: +(a.parallel || 4) };
  const skillDir = resolve(a['skill-dir'] || join(REPO, 'skills/one-shot-site'));
  let queries = JSON.parse(readFileSync(join(here, 'triggers.json'), 'utf8')).map((q, i) => ({ ...q, n: i + 1 }));
  if (a.only) { const keep = new Set(String(a.only).split(',').map(Number)); queries = queries.filter((q) => keep.has(q.n)); }
  const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '');
  const runs = resolve(a['runs-dir'] || defaultRunsDir());
  const alt = typeof a.description === 'string' ? a.description : undefined;

  if (a.prepare) {
    const root = join(runs, 'triggers', stamp);
    mkdirSync(root, { recursive: true });
    const description = alt || readFileSync(join(skillDir, 'SKILL.md'), 'utf8').match(/^description: (.*)$/m)[1];
    for (let k = 1; k <= o.runs; k++) writeFileSync(join(root, `prompt-${k}.md`), agentPrompt(queries, description, k, join(root, `answers-${k}.json`)));
    writeFileSync(join(root, 'meta.json'), JSON.stringify({ route: 'agent proxy', model: a.model || null, runs: o.runs, skillSha: gitSha(skillDir), skillHash: hashDir(skillDir), description }, null, 2));
    console.log(`Give one fresh agent each of ${root}/prompt-1.md … prompt-${o.runs}.md, then: node evals/trigger.mjs --score ${stamp}`);
    process.exit(0);
  }
  if (a.score) {
    const root = resolve(join(runs, 'triggers'), String(a.score));
    const meta = JSON.parse(readFileSync(join(root, 'meta.json'), 'utf8'));
    const got = new Map();
    let n = 0;
    for (const f of readdirSync(root).filter((x) => /^answers-\d+\.json$/.test(x))) {
      let list = [];
      try { list = JSON.parse(readFileSync(join(root, f), 'utf8')); n++; } catch (e) { console.error(`${f}: ${e.message}`); }
      for (const x of list) { if (!got.has(+x.n)) got.set(+x.n, []); got.get(+x.n).push({ triggered: x.skill === 'one-shot-site', first: x.skill || 'none' }); }
    }
    report(rowsOf(queries, got), { ...meta, runs: n }, `${basename(root)}-agents`);
    process.exit(0);
  }

  o.claude = findClaude(a.claude);
  const root = join(runs, 'triggers', stamp);
  // every run gets its own empty project, so nothing one run does is seen by the next
  const projectFor = (q, k) => { const p = join(root, `q${q.n}-${k}`); mkdirSync(p, { recursive: true }); installSkill(skillDir, p, alt); return p; };
  const description = readFileSync(join(projectFor({ n: 0 }, 0), '.claude/skills/one-shot-site/SKILL.md'), 'utf8').match(/^description: (.*)$/m)[1];
  console.log(`${queries.length} queries × ${o.runs} runs · ${o.model} · ${root}`);
  const jobs = queries.flatMap((q) => Array.from({ length: o.runs }, (_, k) => ({ q, k })));
  const got = new Map(queries.map((q) => [q.n, []]));
  let authFailed = false;
  await Promise.all(Array.from({ length: o.parallel }, async () => {
    while (jobs.length && !authFailed) {
      const { q, k } = jobs.shift();
      const r = await ask(q.query, projectFor(q, k), o);
      if (r.why === 'auth') { authFailed = true; console.error(`Stopped: claude is not logged in (${r.err.trim().split('\n').pop()})`); }
      got.get(q.n).push(r);
      process.stdout.write(r.triggered ? '+' : '.');
    }
  }));
  console.log('');
  if (authFailed) process.exit(2);
  report(rowsOf(queries, got), { route: 'claude -p', model: o.model, runs: o.runs, skillSha: gitSha(skillDir), skillHash: hashDir(skillDir), description }, stamp);
}
