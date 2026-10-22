// The benchmark's own parts, offline: no browser, no network, no agent. The scoring arithmetic, the audit parser,
// the simulated person, the transcript checks and the scenario files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { card, merge, parseAudit, partOf, RULES, score, spread, WEIGHTS } from '../evals/lib/scoring.mjs';
import { answer, fit } from '../evals/lib/answerer.mjs';
import { check, expectations, readTranscript } from '../evals/lib/checks.mjs';
import { DONE, reply } from '../evals/lib/sim.mjs';
import { compare, findSite, pick, slugOf } from '../evals/run.mjs';
import { verdict } from '../evals/trigger.mjs';
import { ACCEPTED, allowancesOf, darkIn, resolveTarget, starterAllows, strictCopy } from '../evals/score.mjs';

const AUDIT = `# Audit: Not ready to ship.

**2 to fix**, 3 to consider.

## Fix
- [contrast] Contrast 2.10:1, needs 4.5:1  (p.note "Pale grey")  @ / 390px
- [axe:color-contrast] Elements must meet minimum color contrast ratio thresholds (2×: p.note, footer small)  @ /

## Consider
- [lint:ease-in] Ease-in starts slow and feels laggy on things people trigger; use ease-out.  (src/style.css:12)  @ source
- [filler-words] Filler words: seamless. Say the concrete thing instead.  @ /
- [budget] First visit loads 320 KB of JavaScript (gzipped); under 300 KB keeps phones quick.  @ /

## Notes
- axe-core on /: 1 rule broken, listed above.
- /: first visit 812 KB (JS 320 KB, CSS 12 KB, fonts 88 KB gzipped)
- Lighthouse mobile (local server, so treat performance as a rough guide): Performance 91, Accessibility 100, Best Practices 96, SEO 100
`;

test('parseAudit reads the verdict, findings, weights, axe and Lighthouse back out of audit.md', () => {
  const a = parseAudit(AUDIT);
  assert.equal(a.verdict, 'Not ready to ship.');
  assert.equal(a.ready, false);
  assert.equal(a.findings.length, 5);
  assert.deepEqual(a.findings[0], { level: 'fail', rule: 'contrast', text: 'Contrast 2.10:1, needs 4.5:1', where: 'p.note "Pale grey"', at: '/ 390px' });
  assert.deepEqual(a.findings[2], { level: 'warn', rule: 'lint:ease-in', text: 'Ease-in starts slow and feels laggy on things people trigger; use ease-out.', where: 'src/style.css:12', at: 'source' });
  assert.equal(a.findings[1].where, '', 'parentheses inside the text are not a "where"');
  assert.deepEqual(a.weight['/'], { bytesKB: 812, jsKB: 320, cssKB: 12, fontsKB: 88 });
  assert.equal(a.axe, 1);
  assert.equal(a.axeRan, true);
  assert.equal(a.lighthouse.mobile.Performance, 91);
  assert.equal(parseAudit('# Audit: Ready to ship.\n\nAll clear.\n').ready, true);
});

test('merge counts a fault seen by two tools once, and keeps different elements apart', () => {
  const look = [
    { level: 'warn', rule: 'contrast', text: 'Contrast 4.10:1, needs 4.5:1', where: 'p.note "Pale grey"', at: 'home 390px' },
    { level: 'warn', rule: 'contrast', text: 'Contrast 4.10:1, needs 4.5:1', where: 'small "Footer"', at: 'home 390px' },
  ];
  const audit = [
    { level: 'fail', rule: 'contrast', text: 'Contrast 4.10:1, needs 4.5:1', where: 'p.note "Pale grey"', at: '/ 390px' },
    { level: 'warn', rule: 'lint:ease-in', text: 'Ease-in…', where: 'src/style.css:12', at: 'source' },
    { level: 'warn', rule: 'filler-words', text: 'Filler words: seamless.', where: '', at: '/' },
  ];
  const lint = [
    { level: 'warn', rule: 'ease-in', text: 'Ease-in…', where: 'src/style.css:12' },
    { level: 'warn', rule: 'filler-words', text: 'Filler words: seamless.', where: 'index.html' },
  ];
  const m = merge({ lint, look, audit });
  assert.equal(m.length, 4);
  const pale = m.find((f) => f.where.startsWith('p.note'));
  assert.equal(pale.level, 'fail', 'the stricter level wins');
  assert.deepEqual(pale.tools, ['look', 'audit']);
  assert.deepEqual(m.find((f) => f.rule === 'ease-in').tools, ['lint', 'audit']);
  assert.deepEqual(m.find((f) => f.rule === 'filler-words').tools, ['lint', 'audit']);
});

test('score: 100 for a clean site, part caps, measured speed, nothing counted twice', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const good = { headline: 0.3, layoutShift: 0, jsKB: 40, weightKB: 400 };
  assert.equal(score([], good).score, 100);
  const f = (level, rule) => ({ level, rule, text: rule + Math.random(), part: partOf(rule) });
  // six accessibility fails lose all 25 points and no more
  const r = score(Array.from({ length: 6 }, () => f('fail', 'contrast')), good);
  assert.equal(r.parts.access.points, 0);
  assert.equal(r.score, 75);
  // warns cost 1, fails 5
  assert.equal(score([f('warn', 'long-headline'), f('fail', 'overflow-x')], good).parts.layout.points, 14);
  // speed is a straight line between good and bad
  assert.equal(score([], { ...good, headline: 1.65 }).parts.speed.metrics.headline.points, 1.5);
  assert.equal(score([], { ...good, headline: null }).parts.speed.metrics.headline.points, 0, 'never readable');
  assert.equal(score([], { ...good, jsKB: 900, weightKB: 5000 }).score, 96);
  // the findings for what is measured, and Lighthouse, don't cost points
  assert.equal(score([f('fail', 'slow-headline'), f('fail', 'layout-shift'), f('warn', 'budget'), f('fail', 'lighthouse')], good).score, 100);
  // not measured: full points, but flagged
  const partial = score([], {});
  assert.equal(partial.score, 100);
  assert.equal(partial.parts.speed.metrics.jsKB.measured, false);
});

test('every rule the skill\'s scripts can report belongs to a part of the score', () => {
  const dir = resolve('skills/one-shot-site/scripts');
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, f)), ...readdirSync(join(dir, 'lib')).map((f) => join(dir, 'lib', f))];
  const found = new Set();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const re of [/add\((?!\[)[^,()]*,\s*'([\w:-]+)'/g, /rule:\s*'([\w:-]+)'/g, /\[\s*'([\w-]+)'\s*,\s*'(?:fail|warn)'/g, /rule:\s*\w+\s*\?\s*'([\w-]+)'/g]) {
      for (const m of s.matchAll(re)) found.add(m[1]);
    }
  }
  assert.ok(found.size > 80, `found only ${found.size} rules; the patterns no longer match the scripts`);
  const missing = [...found].filter((r) => !RULES.has(r));
  assert.deepEqual(missing, [], `add these rules to PARTS in evals/lib/scoring.mjs: ${missing.join(', ')}`);
  assert.equal(partOf('axe:color-contrast'), 'access');
  assert.equal(partOf('lint:ease-in'), 'motion');
});

test('spread and the score card', () => {
  assert.deepEqual(spread([99, 99, 98, 100]), { n: 4, mean: 99, min: 98, max: 100, sd: 0.816 });
  assert.equal(spread([]), null);
  const s = score([{ level: 'warn', rule: 'edge', text: 'x', part: 'layout', tools: ['look'] }], { headline: 0.5, layoutShift: 0.01, jsKB: 10, weightKB: 100 });
  const md = card({ name: 'demo', target: 'dist', skillDir: 'skill', date: 'today', complete: false, missing: ['audit'], ...s, contrast: 0, axe: undefined,
    tools: { look: { ran: true, exit: 0, fails: 0, warns: 1, seconds: 3 }, audit: { ran: false, why: 'needs the built files' } }, findings: [{ level: 'warn', rule: 'edge', text: 'x', where: '', at: '', tools: ['look'] }] });
  assert.match(md, /\*\*99 \/ 100\*\* \(partial: audit\)/);
  assert.match(md, /\| audit \| skipped \|/);
  assert.match(md, /axe-core violations \| not run/);
});

test('the simulated person picks the closest option, or answers in their own words', () => {
  assert.ok(fit('Pick them for me from the mood', 'Pick for me') > 0.3);
  assert.equal(fit('Warm', 'Warm'), 1);
  const q = (header, question, labels, multiSelect = false) => ({ header, question, multiSelect, options: labels.map((label) => ({ label, description: '' })) });
  const answers = { purpose: 'A small business', feel: 'Not sure', colours: 'Pick for me', motion: 'Gentle', goal: 'Visit', extras: 'none', likes: 'How calm it is' };
  const got = answer({ questions: [
    q('Purpose', "What's the site for?", ['Me and my work', 'A small business', 'A product or app', 'An event or launch']),
    q('Feel', 'How should it feel?', ['Quiet', 'Bold', 'Warm', 'Night']),
    q('Colours', 'Colours?', ['Mostly black and white, plus one colour', 'Pick them for me from the mood', 'I have a logo or brand colour', 'Show me three palettes first']),
    q('Goal', 'What should a visitor do?', ['Visit or book', 'Call or message', 'See the menu, prices or services', 'Buy']),
    q('Extras', 'Extras?', ['Light and dark switch', 'Sound you can turn on'], true),
    q('Liked', 'What do you like about linear.app?', ['The colours', 'The big type', 'How calm it is', 'How it moves']),
    q('Pages', 'How many pages?', ['One page', 'Several pages']),
  ] }, answers);
  assert.equal(got["What's the site for?"], 'A small business');
  assert.equal(got['How should it feel?'], 'Not sure', 'nothing fits: their own words');
  assert.equal(got['Colours?'], 'Pick them for me from the mood');
  assert.equal(got['What should a visitor do?'], 'Visit or book');
  assert.equal(got['Extras?'], '', 'none ticked');
  assert.equal(got['What do you like about linear.app?'], 'How calm it is');
  assert.equal(got['How many pages?'], 'One page', 'no canned answer: the recommended (first) one');
  const multi = answer({ questions: [q('Extras', 'Extras?', ['Light and dark switch', 'Sound you can turn on (soft generated music)'], true)] }, { extras: 'Sound' });
  assert.equal(multi['Extras?'], 'Sound you can turn on (soft generated music)');
});

test('the answerer speaks MCP over stdio and fills in AskUserQuestion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-answerer-'));
  writeFileSync(join(dir, 'answers.json'), JSON.stringify({ feel: 'Bold' }));
  const child = spawn(process.execPath, [resolve('evals/lib/answerer.mjs'), join(dir, 'answers.json'), join(dir, 'log.jsonl')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = [];
  const lines = createInterface({ input: child.stdout });
  const next = () => new Promise((r) => lines.once('line', (l) => r(JSON.parse(l))));
  const send = async (m) => { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n'); if (m.id !== undefined) replies.push(await next()); };
  await send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  await send({ method: 'notifications/initialized' });
  await send({ id: 2, method: 'tools/list' });
  const input = { questions: [{ header: 'Feel', question: 'How should it feel?', multiSelect: false, options: [{ label: 'Quiet' }, { label: 'Bold' }] }] };
  await send({ id: 3, method: 'tools/call', params: { name: 'answer', arguments: { tool_name: 'AskUserQuestion', input } } });
  await send({ id: 4, method: 'tools/call', params: { name: 'answer', arguments: { tool_name: 'Bash', input: { command: 'ls' } } } });
  child.stdin.end();
  assert.equal(replies[0].result.serverInfo.name, 'answerer');
  assert.equal(replies[1].result.tools[0].name, 'answer');
  const asked = JSON.parse(replies[2].result.content[0].text);
  assert.equal(asked.behavior, 'allow');
  assert.deepEqual(asked.updatedInput.answers, { 'How should it feel?': 'Bold' });
  assert.deepEqual(JSON.parse(replies[3].result.content[0].text), { behavior: 'allow', updatedInput: { command: 'ls' } });
  await new Promise((r) => child.on('close', r));
  assert.match(readFileSync(join(dir, 'log.jsonl'), 'utf8'), /"kind":"question"/);
  rmSync(dir, { recursive: true, force: true });
});

test('the simulated person sends the material once, then says go on, and stops at the done line', () => {
  const sc = { answers: { purpose: 'An event', material: 'Patch Night, 14 March.' } };
  const state = { replies: 0, materialSent: false };
  const first = reply(sc, state, 'Send me what you have.');
  assert.match(first, /What I have: Patch Night, 14 March\./);
  assert.match(first, /What it's for: An event/);
  assert.match(reply(sc, state, 'A, B or C?'), /go with what you recommend/);
  assert.equal(reply(sc, state, `All done.\n${DONE}`), null);
  assert.equal(reply(sc, { replies: 8, materialSent: true }, 'more?', 8), null);
});

const line = (m) => JSON.stringify(m);
const TRANSCRIPT = [
  line({ type: 'system', subtype: 'init', model: 'claude-opus-5-5', cwd: '/w', tools: ['Bash'], skills: ['one-shot-site'], claude_code_version: '2.1.280' }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'one-shot-site' } }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ header: 'Feel', question: 'How should it feel?', options: [{ label: 'Quiet' }, { label: 'Bold' }] }] } }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node .claude/skills/one-shot-site/scripts/study.mjs https://linear.app' } }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/w/.one-shot/study/study.md' } }] } }),
  line({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'subagent stuff' } }] } }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/w/atem/.one-shot/brief.md', content: '…' } }, { type: 'text', text: 'Brief written.' }] } }),
  line({ type: 'result', subtype: 'success', total_cost_usd: 1.5, num_turns: 4, duration_ms: 60000 }),
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node look.mjs dist --pages variant-a,variant-b,variant-c --compare' } }] } }),
  line({ type: 'result', subtype: 'success', total_cost_usd: 2.25, num_turns: 3, duration_ms: 30000 }),
].join('\n');

test('readTranscript and the automatic checks', () => {
  const t = readTranscript(TRANSCRIPT);
  assert.equal(t.init.model, 'claude-opus-5-5');
  assert.equal(t.cost, 2.25, 'the last cumulative cost');
  assert.equal(t.turns, 7);
  assert.equal(t.events.length, 6, 'sub-agent tool calls are left out');
  const dir = mkdtempSync(join(tmpdir(), 'oss-checks-'));
  mkdirSync(join(dir, '.one-shot'));
  writeFileSync(join(dir, '.one-shot', 'brief.md'), '## Look\nFrom linear.app: dark ground, tight sans.\n');
  const result = { audit: { ready: true, verdict: 'Ready to ship.' }, axe: 0, metrics: { headline: 0.9, jsKB: 120 }, tools: { 'film-reduced': { ran: true, fails: 0, warns: 2 } }, findings: [{ rule: 'vague-action', text: 'Get started' }] };
  const ctx = { events: t.events, asked: t.asked, site: dir, result };
  const pass = (spec) => check(spec, ctx).pass;
  assert.ok(pass('ran:study\\.mjs.*linear\\.app'));
  assert.ok(pass('ran:look\\.mjs.*--compare'));
  assert.ok(!pass('ran:photos\\.mjs search'));
  assert.ok(pass('order:study\\.md then write .*brief\\.md'));
  assert.ok(!pass('order:write .*brief\\.md then study\\.mjs'));
  assert.ok(pass('file:.one-shot/brief.md'));
  assert.ok(!pass('file:public/img/CREDITS.md'));
  assert.ok(pass('grep:.one-shot/brief.md:From linear\\.app'));
  assert.ok(pass('asked'));
  assert.ok(pass('audit:ready') && pass('audit:ran') && pass('axe:0') && pass('film-reduced:clean'));
  assert.ok(pass('headline<=1.2') && !pass('headline<=0.5'));
  assert.ok(pass('js<=300') && !pass('js<=100'));
  assert.ok(!pass('no-finding:vague-action') && pass('no-finding:photo-credit'));
  assert.equal(check('audit:ready', { ...ctx, result: null }).pass, false, 'no score, no pass');
  assert.match(check('nonsense:1', ctx).detail, /unknown check/);
  rmSync(dir, { recursive: true, force: true });
});

test('scenarios.json: every scenario is complete and every automatic check is one the runner knows', () => {
  const scenarios = JSON.parse(readFileSync('evals/scenarios.json', 'utf8'));
  assert.ok(scenarios.length >= 5);
  // a regex's \b written once in JSON is a backspace, and the check silently never matches: write \\b
  JSON.stringify(scenarios, (k, v) => { if (typeof v === 'string') assert.doesNotMatch(v, /[\x00-\x08\x0b\x0c\x0e-\x1f]/, `a control character in scenarios.json: ${v}`); return v; });
  // a script check matches a run of the script, not a command that only mentions it (a builder's node -e once
  // wrote "photos.mjs get" into a file, and the check passed a run that never fetched a photo)
  const get = scenarios.find((s) => /bakery/.test(s.name)).expected_behavior.flatMap((e) => e.auto || []).find((a) => /^ran:.*photos/.test(a));
  assert.equal(check(get, { events: ['bash cd w && node "C:/w/.claude/skills/one-shot-site/scripts/photos.mjs" get 3,5'] }).pass, true);
  assert.equal(check(get, { events: ['bash node "C:/notes/locked.mjs" bakery node C:/w/scripts/photos.mjs get 3'] }).pass, true);
  assert.equal(check(get, { events: [`bash node -e "fs.writeFileSync('brief.md', 'next: photos.mjs get 1,2')"`] }).pass, false);
  assert.equal(check(get, { events: ['bash grep -n "photos.mjs get" brief.md'] }).pass, false);
  const KNOWN = /^(ran:.+|order:.+ then .+|file:.+|no-file:.+|grep:[^:]+:.+|asked|audit:ran|audit:ready|axe:0|film-reduced:clean|headline<=[\d.]+|js<=\d+|no-finding:[\w:-]+|pages>=\d+|facts-kept|site-json-kept|text-kept(:after-first-screen)?|only-changed:.+)$/;
  for (const sc of scenarios) {
    assert.ok(sc.name && sc.query && sc.answers?.material, `${sc.name}: name, query and material`);
    if (sc.start) assert.ok(existsSync(join(sc.start, '.one-shot', 'brief.md')), `${sc.name}: start is a site the skill made`);
    if (sc.serve) assert.ok(existsSync(join(sc.serve.dir, 'index.html')) && sc.serve.port > 1024, `${sc.name}: serve has a folder and a port`);
    const autos = expectations(sc).flatMap((e) => e.auto);
    if (autos.includes('facts-kept')) assert.ok(sc.facts?.length, `${sc.name}: facts-kept needs "facts"`);
    if (autos.some((c) => /^(site-json-kept|text-kept|only-changed)/.test(c))) assert.ok(sc.start, `${sc.name}: before-and-after checks need "start"`);
    for (const f of sc.facts || []) new RegExp(f);
    for (const e of expectations(sc)) {
      assert.ok(e.text, `${sc.name}: expectation ${e.i} has text`);
      assert.ok(e.auto.length || e.judge, `${sc.name}: expectation ${e.i} is checked somehow`);
      for (const c of e.auto) {
        assert.match(c, KNOWN, `${sc.name}: unknown check ${c}`);
        if (/^(ran|order|grep):/.test(c)) for (const part of c.replace(/^grep:[^:]+:/, '').replace(/^\w+:/, '').split(/\s+then\s+/)) new RegExp(part);
      }
    }
  }
  const triggers = JSON.parse(readFileSync('evals/triggers.json', 'utf8'));
  assert.ok(triggers.length >= 20);
  assert.ok(triggers.some((t) => t.should_trigger) && triggers.some((t) => !t.should_trigger));
});

test('--keep-scores: a score is reused only when the same checks made it after the last build', async () => {
  const { keptScore } = await import('../evals/run.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'kept-'));
  try {
    const dir = join(tmp, 'run'), site = join(tmp, 'site'), checks = join(tmp, 'skill');
    mkdirSync(join(dir, 'score'), { recursive: true });
    mkdirSync(join(site, 'dist'), { recursive: true });
    writeFileSync(join(site, 'dist', 'index.html'), '<h1>x</h1>');
    writeFileSync(join(dir, 'score', 'score.json'), JSON.stringify({ skillDir: checks, score: 97 }));
    const at = (f, s) => utimesSync(f, s, s);
    at(join(site, 'dist', 'index.html'), 1000);
    at(join(dir, 'score', 'score.json'), 2000);
    assert.equal(keptScore(dir, site, checks)?.score, 97);
    assert.equal(keptScore(dir, site, join(tmp, 'other-skill')), null, 'other checks');
    at(join(site, 'dist', 'index.html'), 3000);
    assert.equal(keptScore(dir, site, checks), null, 'built again since');
    assert.equal(keptScore(join(tmp, 'none'), site, checks), null, 'never scored');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runner helpers: slugs, --only, finding the site, comparing with the baseline', () => {
  assert.equal(slugOf('event, night, showpiece with sound'), 'event-night-showpiece-with');
  const sc = [{ name: 'small business, warm' }, { name: 'portfolio, bold' }, { name: 'event, night' }];
  assert.deepEqual(pick(sc, ['2']).map((s) => s.name), ['portfolio, bold']);
  assert.deepEqual(pick(sc, ['night', 'small-business-warm']).map((s) => s.name), ['small business, warm', 'event, night']);
  assert.equal(pick(sc, []).length, 3);
  const work = mkdtempSync(join(tmpdir(), 'oss-find-'));
  mkdirSync(join(work, 'scratch'), { recursive: true });
  writeFileSync(join(work, 'scratch', 'package.json'), '{}');
  mkdirSync(join(work, 'sites', 'kleiner-kaffee', '.one-shot'), { recursive: true });
  writeFileSync(join(work, 'sites', 'kleiner-kaffee', 'package.json'), '{}');
  writeFileSync(join(work, 'sites', 'kleiner-kaffee', '.one-shot', 'brief.md'), '#');
  assert.equal(findSite(work), join(work, 'sites', 'kleiner-kaffee'), 'the folder with a brief wins');
  rmSync(work, { recursive: true, force: true });
  const cmp = compare({ model: 'm', scenarios: [{ slug: 'a', score: 90, passed: 5, total: 6 }, { slug: 'b', score: 70, passed: 2, total: 4 }, { slug: 'c', score: 50 }] },
    { model: 'm', date: 'then', scenarios: { a: { score: 88, passed: 4 }, b: { score: 85, passed: 3 } } });
  assert.deepEqual(cmp.rows.map((r) => [r.slug, r.delta, r.real]), [['a', 2, false], ['b', -15, true], ['c', undefined, undefined]]);
  assert.equal(cmp.meanDelta, -6.5);
  assert.equal(compare({ scenarios: [] }, null), null);
});

test('trigger test: only the skill itself counts as triggered', () => {
  assert.equal(verdict({ name: 'Skill', input: { skill: 'one-shot-site' } }), true);
  assert.equal(verdict({ name: 'Read', input: { file_path: 'C:\\w\\.claude\\skills\\one-shot-site\\SKILL.md' } }), true);
  assert.equal(verdict({ name: 'Skill', input: { skill: 'frontend-design' } }), false);
  assert.equal(verdict({ name: 'Bash', input: { command: 'ls' } }), false);
  assert.equal(verdict(null), false);
});

test('score.mjs finds what it can check in a folder, a dist folder or a URL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-target-'));
  mkdirSync(join(dir, 'site', 'dist'), { recursive: true });
  writeFileSync(join(dir, 'site', 'package.json'), '{}');
  assert.throws(() => resolveTarget(join(dir, 'site')), /no dist\/ yet/);
  writeFileSync(join(dir, 'site', 'dist', 'index.html'), '<!doctype html>');
  assert.deepEqual(resolveTarget(join(dir, 'site')), { url: null, dist: join(dir, 'site', 'dist'), project: join(dir, 'site'), name: 'site' });
  assert.deepEqual(resolveTarget(join(dir, 'site', 'dist')), { url: null, dist: join(dir, 'site', 'dist'), project: join(dir, 'site'), name: 'site' });
  assert.equal(resolveTarget('https://example.org/x').url, 'https://example.org/x');
  assert.throws(() => resolveTarget(join(dir, 'nothing')), /Nothing to score/);
  rmSync(dir, { recursive: true, force: true });
  // the site's allowances: read, and left out of the copy that lint and audit see
  const proj = join(mkdtempSync(join(tmpdir(), 'oss-allow-')), 'site');
  mkdirSync(join(proj, '.one-shot'), { recursive: true });
  mkdirSync(join(proj, 'src'));
  mkdirSync(join(proj, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(proj, '.one-shot', 'allow.json'), '["made-up-address", "lint:gradient-text"]');
  writeFileSync(join(proj, 'src', 'main.css'), '.a { transition: all 1s; } /* one-shot: allow transition-all */');
  writeFileSync(join(proj, 'node_modules', 'x', 'y.js'), '// one-shot: allow everything');
  writeFileSync(join(proj, 'package.json'), '{}');
  assert.deepEqual(allowancesOf(proj), { file: ['made-up-address', 'gradient-text'], inline: ['transition-all'] });
  const copy = strictCopy(proj, join(proj, '.one-shot', 'score', 'source'));
  assert.equal(existsSync(join(copy, '.one-shot')), false);
  assert.equal(existsSync(join(copy, 'node_modules')), false);
  assert.equal(readFileSync(join(copy, 'src', 'main.css'), 'utf8'), '.a { transition: all 1s; } /* one-shot: noted transition-all */');
  assert.ok(existsSync(join(copy, 'package.json')));
  assert.deepEqual([...ACCEPTED], ['made-up-address']);
  // the starter's own allow lines stay when kept word for word
  const keep = starterAllows(resolve('skills/one-shot-site'));
  assert.ok([...keep].some((l) => l.includes('allow outline-none')));
  const starterLine = [...keep].find((l) => l.includes('allow outline-none'));
  writeFileSync(join(proj, 'src', 'base.css'), `  ${starterLine}\n#main:focus { outline: none; }\n`);
  assert.deepEqual(allowancesOf(proj, keep).inline, ['transition-all']);
  strictCopy(proj, copy, keep);
  assert.ok(readFileSync(join(copy, 'src', 'base.css'), 'utf8').includes(starterLine));
  assert.match(readFileSync(join(copy, 'src', 'main.css'), 'utf8'), /noted transition-all/);
  rmSync(dirname(proj), { recursive: true, force: true });
  // a dark scheme gets a second look
  assert.equal(darkIn('@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ground: #111 } }'), true);
  assert.equal(darkIn(':root[data-theme="dark"] { --ground: #111 }'), true);
  assert.equal(darkIn('@media (prefers-color-scheme: light) { } :root { color-scheme: light }'), false);
});

test('agent route: the task file has the skill copy, the answers and the rules; interview.md counts as asking', async () => {
  const { task } = await import('../evals/lib/sim.mjs');
  const sc = { name: 'bakery', query: 'Website for my bakery please.', answers: { purpose: 'A small business', material: 'Brotzeit, Backhausgasse 3.' } };
  const t = task(sc, String.raw`C:\runs\x\work`, String.raw`C:\runs\x`);
  assert.match(t, /C:\/runs\/x\/work\/\.claude\/skills\/one-shot-site\/SKILL\.md/);
  assert.match(t, /"Website for my bakery please\."/);
  assert.match(t, /What it's for: A small business/);
  assert.match(t, /Their material: Brotzeit, Backhausgasse 3\./);
  assert.match(t, /never use AskUserQuestion/);
  assert.match(t, /never push, deploy, publish/);
  assert.match(t, /Keep your scratch files [^`]*`C:\/runs\/x\/scratch`, not in a scratchpad/, 'a scratch folder of its own');
  assert.doesNotMatch(t, /One browser at a time/);
  const locked = task(sc, String.raw`C:\runs\x\work`, String.raw`C:\runs\x`, String.raw`C:\notes\browser.lock`);
  // the lock commands themselves, run in a shell: they never start with a sleep (some hosts block that), the script
  // runs only with this run's own lock, and a release never removes someone else's
  const take = locked.match(/`(for i in [^`]+)`/)[1], run = locked.match(/`(if \[ -f [^`]+)`/)[1];
  assert.doesNotMatch(take, /^sleep/);
  const tmp = mkdtempSync(join(tmpdir(), 'oss-lock-')).replace(/\\/g, '/');
  const sh = (cmd) => spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
  const fast = (cmd) => cmd.replaceAll('C:/notes/browser.lock', `${tmp}/browser.lock`).replace('seq 27', 'seq 3').replace('sleep 15', 'sleep 0');
  const script = (cmd) => fast(cmd).replace('timeout 540 node … ', 'echo ran ');
  mkdirSync(`${tmp}/browser.lock`); // someone else holds it
  assert.doesNotMatch(sh(fast(take)).stdout, /locked/);
  assert.match(sh(script(run)).stdout, /No lock/);
  assert.ok(existsSync(`${tmp}/browser.lock`), "someone else's lock stays");
  rmSync(`${tmp}/browser.lock`, { recursive: true });
  assert.match(sh(fast(take)).stdout, /locked/);
  assert.match(sh(script(run)).stdout, /ran/);
  assert.equal(existsSync(`${tmp}/browser.lock`), false, 'released');
  // a lock helper next to the lock: one command per browser script, no loop to get wrong
  writeFileSync(`${tmp}/locked.mjs`, '');
  const helped = task(sc, String.raw`C:\runs\x\work`, String.raw`C:\runs\x`, `${tmp}/browser.lock`);
  assert.ok(helped.includes(`\`ONE_SHOT_HISTORY=off node "${tmp}/locked.mjs" evals-bakery node C:/runs/x/work/.claude/skills/one-shot-site/scripts/look.mjs dist`));
  assert.match(helped, /Exit code 75/);
  for (const t of [locked, helped]) assert.match(t, /read the comment\s+at the top of the file/, 'usage without starting a browser');
  assert.doesNotMatch(helped, /for i in|rmdir/);
  for (const t of [locked, helped]) assert.match(t, /ONE_SHOT_HISTORY=off node \S+\/scripts\/audit\.mjs/, 'a run stays out of the history of recent sites');
  for (const t of [locked, helped, task(sc, 'C:/w', 'C:/r', null)]) assert.match(t, /Never submit a form, and never click, follow or open a mailto:, tel:, sms:[\s\S]*xdg-open/, "nothing reaches the owner's mail app");
  // a reviewer the builder starts gets the same rules, the helper's command included
  const toAgents = (t) => t.match(/word for word[^:\n]*:\n {2}> (.+)/)?.[1];
  assert.match(toAgents(helped), new RegExp(`^How to run on this machine: start every command .* with ONE_SHOT_HISTORY=off\\. Never submit a form.*xdg-open\\)\\. One browser at a time: .*ONE_SHOT_HISTORY=off node "${tmp}/locked\\.mjs" evals-bakery node <the script`));
  assert.doesNotMatch(toAgents(task(sc, 'C:/w', 'C:/r', null)), /One browser/);
  assert.match(locked, /word for word, then the one-browser rule above:/);
  for (const t of [locked, helped]) assert.doesNotMatch(t, /skip step \d/i, 'no step numbers: the skill renumbers its steps');
  rmSync(tmp, { recursive: true, force: true });
  const interview = '## Round 1\n\n**What\'s the site for?**\n1. Me and my work\n2. A small business (recommended)\n\nAnswer: A small business\n';
  assert.equal(check('asked', { interview }).pass, true);
  assert.equal(check('asked', { interview: 'Name? Brotzeit.' }).pass, false);
  // as a builder wrote it: the question in bold with its header after it
  assert.equal(check('asked', { interview: "**1. What's the site for?** (Purpose)\n1. A small business (recommended)\n2. Me and my work\n\nAnswer: A small business." }).pass, true);
  assert.equal(check('asked', { interview: '1. Is it open? Yes.\n2. Two? No.' }).pass, false, 'options alone are not a question');
});

test('trigger test, agent route: every query and skill in each prompt, in another order per run; rates from answers', async () => {
  const { agentPrompt, rowsOf, shuffled } = await import('../evals/trigger.mjs');
  const queries = [{ n: 1, query: 'make me a site', should_trigger: true }, { n: 2, query: 'fix my react nav', should_trigger: false }, { n: 3, query: 'band homepage', should_trigger: true }];
  const p1 = agentPrompt(queries, 'Builds sites.', 1, 'C:/x/answers-1.json');
  for (const q of queries) assert.ok(p1.includes(`${q.n}. ${q.query}`));
  assert.match(p1, /- one-shot-site: Builds sites\./);
  assert.match(p1, /- frontend-design: /);
  assert.match(p1, /C:\/x\/answers-1\.json/);
  assert.deepEqual([...shuffled([1, 2, 3, 4, 5], 2)].sort(), [1, 2, 3, 4, 5]);
  assert.notDeepEqual(shuffled([1, 2, 3, 4, 5, 6, 7, 8], 1), shuffled([1, 2, 3, 4, 5, 6, 7, 8], 2));
  const got = new Map([[1, [{ triggered: true }, { triggered: true }, { triggered: false }]], [2, [{ triggered: true }, { triggered: false }, { triggered: false }]], [3, [{ triggered: false }, { triggered: false }, { triggered: true }]]]);
  assert.deepEqual(rowsOf(queries, got).map((r) => [r.n, r.rate, r.pass]), [[1, 0.67, true], [2, 0.33, true], [3, 0.33, false]]);
});

test('readAuditJson reads audit.json the same way as the markdown, with weights to the byte', async () => {
  const { readAuditJson } = await import('../evals/lib/scoring.mjs');
  const a = readAuditJson({
    verdict: 'Ready to ship.',
    findings: [{ level: 'warn', rule: 'lint:ease-in', text: 'Ease-in…', where: 'src/style.css:12', at: 'source' }, { level: 'warn', rule: 'title', text: 'Title is 70 characters', at: '/' }],
    notes: ['axe-core on /: no violations.', 'axe-core on /impressum.html: 2 rules broken, listed above.', '/: first visit 812 KB (JS 320 KB, CSS 12 KB, fonts 88 KB gzipped)'],
    firstLoad: { '/': { bytes: 831488, js: 327680, css: 12288, fonts: 90112 } },
  });
  assert.equal(a.ready, true);
  assert.deepEqual(a.findings[1], { level: 'warn', rule: 'title', text: 'Title is 70 characters', where: '', at: '/' });
  assert.deepEqual(a.weight['/'], { bytesKB: 812, jsKB: 320, cssKB: 12, fontsKB: 88 });
  assert.equal(a.axe, 2);
  assert.equal(readAuditJson({ verdict: 'Not ready to ship.', findings: [], notes: ['axe-core is not installed in the site'] }).axe, null);
});

test('sameness: fonts, ground, footer and section shapes, read from source', async () => {
  const { fontsOf, groundOf, groundKind, footerKind, sectionShapes, sameness } = await import('../evals/lib/sameness.mjs');
  assert.deepEqual(fontsOf({ dependencies: { '@fontsource-variable/fraunces': '1', '@fontsource/karla': '1', vite: '1' } }, '@font-face { font-family: "Own Sans"; src: url(x.woff2); }'), ['fraunces', 'karla', 'own-sans']);
  assert.deepEqual(groundOf(':root { --ground: oklch(97.5% 0.02 80); }'), { l: 0.975, c: 0.02, h: 80 });
  assert.equal(groundKind({ l: 0.975, c: 0.02, h: 80 }), 'light warm');
  assert.equal(groundKind({ l: 0.17, c: 0.004, h: 250 }), 'dark neutral');
  assert.equal(groundOf(':root { --ground: #ffffff; }', () => [1, 0, 0]).l, 1);
  assert.equal(footerKind('<footer><p class="footer-name">Kleiner Kaffee</p><p>x</p></footer>'), 'wordmark');
  assert.equal(footerKind('<footer><div>a</div><div>b</div><div>c</div><ul><li>d</li></ul></footer>'), 'columns');
  assert.equal(footerKind('<footer><p>© 2026</p></footer>'), 'plain');
  // fonts the site imports, not every one installed; fallback faces aren't families
  const pkg = { dependencies: { '@fontsource-variable/literata': '1', '@fontsource-variable/figtree': '1', '@fontsource/young-serif': '1', '@fontsource/gloock': '1' } };
  assert.deepEqual(fontsOf(pkg, '@font-face { font-family: "Figtree Fallback"; src: local(Arial); size-adjust: 104%; }', "import '@fontsource-variable/literata/opsz.css';\nimport '@fontsource-variable/figtree';"), ['figtree', 'literata']);
  // a wordmark is the name set on its own; a big closing line is a statement; three headings are columns
  assert.equal(footerKind('<footer><h2>Anrufen oder schreiben</h2><p class="big">0681 000</p><p>a</p><p>b</p><p>c</p></footer>', 'Klempnerei Brandt'), 'statement');
  assert.equal(footerKind('<footer><p class="footer-mark">{{site.name}}</p></footer>', 'Teehaus Aoyama'), 'wordmark');
  assert.equal(footerKind('<footer><div class="footer-name"><span>Moth</span> <span>Orchestra</span></div></footer>', 'Moth Orchestra'), 'wordmark');
  assert.equal(footerKind('<footer><h2>Find us</h2><h2>Talk to us</h2><h2>Help</h2></footer>', 'Eastgate Community Pantry'), 'columns');
  const { nameOf } = await import('../evals/lib/sameness.mjs');
  assert.equal(nameOf(null, '<title>Kleiner Kaffee · Saarbrücken</title>'), 'Kleiner Kaffee');
  assert.equal(nameOf({ name: 'Little Molars' }, '<title>x</title>'), 'Little Molars');
  const page = '<main><section><h2>A</h2><p>x</p><figure></figure></section><section><h2>B</h2><p>y</p><figure></figure></section><section><h2>C</h2><ul><li>z</li></ul></section></main>';
  const sh = sectionShapes(page);
  assert.deepEqual(sh.shapes, ['h2 p figure', 'h2 p figure', 'h2 ul']);
  assert.equal(sh.repeatShare, 0.67);
  const site = (name, fonts, l, footer) => ({ name, fonts, ground: { l, c: 0.02, h: 80 }, footer, sections: { repeatShare: 0 } });
  const same = sameness([site('a', ['fraunces'], 0.97, 'wordmark'), site('b', ['fraunces'], 0.96, 'wordmark'), site('c', ['fraunces'], 0.95, 'wordmark')]);
  assert.equal(same.value, 75, 'font, ground and footer all shared; sections not');
  const apart = sameness([site('a', ['karla'], 0.97, 'wordmark'), site('b', ['saira'], 0.2, 'columns')]);
  assert.equal(apart.value, 0);
  assert.equal(sameness([site('a', [], 0.9, 'plain')]), null, 'one site is not a batch');
  // the first-screen pattern joins when two or more sites have it
  const split = (n) => ({ ...site(n, ['karla'], 0.2, 'columns'), firstScreen: 'split' });
  const fs = sameness([split('a'), { ...split('b'), fonts: ['saira'], ground: { l: 0.97, c: 0.02, h: 80 }, footer: 'plain' }]);
  assert.equal(fs.parts.firstScreen, 100);
  assert.equal(fs.value, 20, 'only the first screen is shared: 100 / 5 parts');
  assert.match(fs.lines.at(-1), /Most common first screen: split on 2 of 2/);
  // a redesign keeps the look the business had: named, not counted
  const kept = sameness([site('a', ['karla'], 0.97, 'wordmark'), site('b', ['saira'], 0.2, 'columns'), { ...site('c', ['karla'], 0.96, 'wordmark'), keptLook: 'a redesign' }]);
  assert.equal(kept.value, 0, 'the redesign shares font, ground and footer with a, and still adds nothing');
  assert.deepEqual(kept.sites.map((x) => x.name), ['a', 'b']);
  assert.deepEqual(kept.notCounted, [{ name: 'c', why: 'a redesign' }]);
  assert.match(kept.lines.at(-1), /Not counted: c \(a redesign\)/);
  assert.equal(sameness([site('a', [], 0.9, 'plain'), { ...site('b', [], 0.9, 'plain'), keptLook: 'a change request' }]), null);
  const { isRedesign } = await import('../evals/lib/sameness.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'redesign-'));
  try {
    mkdirSync(join(tmp, 'r', '.one-shot'), { recursive: true });
    mkdirSync(join(tmp, 'n', '.one-shot'), { recursive: true });
    writeFileSync(join(tmp, 'r', '.one-shot', 'brief.md'), '# Fahrrad Hollerbach: brief (redesign)\n\nRead with redesign.mjs.\n');
    writeFileSync(join(tmp, 'n', '.one-shot', 'brief.md'), '# Kleiner Kaffee: brief\n\nA new site; no old one to redesign from.\n');
    assert.equal(isRedesign(join(tmp, 'r')), true);
    assert.equal(isRedesign(join(tmp, 'n')), false, 'the word in running text is not enough');
    assert.equal(isRedesign(join(tmp, 'none')), false);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  const { firstScreenPattern } = await import('../evals/lib/firstscreen.mjs');
  const vw = 1440, vh = 900;
  const h1 = { x: 120, y: 260, w: 560, h: 220 };
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: null, proof: null }), 'type-led');
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: { x: 1300, y: 20, w: 40, h: 40 }, proof: null }), 'type-led', 'an icon is not a picture');
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: null, proof: { x: 120, y: 520, w: 700, h: 260 } }), 'statement + proof');
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: { x: 0, y: 0, w: 1440, h: 900 }, proof: null }), 'image-led');
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: { x: 80, y: 200, w: 700, h: 400 }, proof: null }), 'image-led', 'the headline sits on the picture');
  assert.equal(firstScreenPattern({ vw, vh, h1, visual: { x: 760, y: 120, w: 600, h: 640 }, proof: null }), 'split');
  assert.equal(firstScreenPattern({ vw, vh, h1: { x: 420, y: 80, w: 600, h: 120 }, visual: { x: 520, y: 240, w: 400, h: 520 }, proof: null }), 'object');
  assert.equal(firstScreenPattern({ vw, vh, h1: { x: 120, y: 80, w: 900, h: 160 }, visual: { x: 120, y: 300, w: 1200, h: 500 }, proof: null }), 'statement + proof');
});

test('change requests and redesigns: the site to start from, its before copy, and the before-and-after checks', async () => {
  const { setUpWork, startName, serveCommand } = await import('../evals/run.mjs');
  const { task } = await import('../evals/lib/sim.mjs');
  const { heroSpan, pagesOf } = await import('../evals/lib/checks.mjs');
  const scenarios = JSON.parse(readFileSync('evals/scenarios.json', 'utf8'));
  const hero = scenarios.find((s) => s.start && s.start.includes('kleiner-kaffee'));
  const dir = mkdtempSync(join(tmpdir(), 'oss-change-'));
  try {
    const work = setUpWork(hero, dir, resolve('skills/one-shot-site'));
    const site = join(work, startName(hero));
    assert.equal(startName(hero), 'kleiner-kaffee');
    assert.ok(existsSync(join(site, '.one-shot', 'brief.md')) && existsSync(join(dir, 'before', 'index.html')));
    assert.equal(spawnSync('git', ['log', '--format=%s'], { cwd: site, encoding: 'utf8' }).stdout.trim(), 'The site as published');
    const t = task(hero, work, dir, null, { site: startName(hero) });
    assert.match(t, /already in `.+\/kleiner-kaffee`/);
    assert.doesNotMatch(t, /put the site in a new folder/);

    const ctx = { site, before: join(dir, 'before'), facts: [] };
    assert.equal(check('site-json-kept', ctx).detail, 'site.json unchanged');
    assert.equal(check('text-kept', ctx).pass, true);
    assert.equal(check('only-changed:src/.*', ctx).detail, 'nothing changed');

    // a new hero: the first screen's words change, the rest stays
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    const s = heroSpan(html);
    assert.match(html.slice(s.start, s.end), /^<section class="hero"[^>]*>[\s\S]*<h1[\s\S]*<\/section>$/);
    writeFileSync(join(site, 'index.html'), html.slice(0, s.start) + '<section class="hero"><h1>Roasted here every Tuesday.</h1><p>Eight seats.</p></section>' + html.slice(s.end));
    assert.equal(check('text-kept:after-first-screen', ctx).pass, true);
    assert.equal(check('text-kept', ctx).pass, false);
    assert.equal(check('only-changed:index\.html', ctx).pass, true);
    assert.equal(check('only-changed:src/.*', ctx).pass, false);
    // a section rewritten further down fails it
    writeFileSync(join(site, 'index.html'), readFileSync(join(site, 'index.html'), 'utf8').replace(/(<section id="menu"[\s\S]*?<h2[^>]*>)[\s\S]*?(<\/h2>)/, '$1Something else entirely$2'));
    assert.equal(check('text-kept:after-first-screen', ctx).pass, false);
    // a fact changed in site.json
    writeFileSync(join(site, 'site.json'), '{"name": "Kleiner Kaffee"}');
    assert.equal(check('site-json-kept', ctx).detail, 'site.json changed');

    // pages and facts on a built site
    mkdirSync(join(site, 'dist'));
    for (const p of ['index.html', 'team.html', 'preise.html', 'behandlungen.html', '404.html', 'impressum.html', 'og.html', 'variant-a.html']) writeFileSync(join(site, 'dist', p), `<title>${p}</title><p>Dibbelabbes&nbsp;12,50 €</p>`);
    assert.deepEqual(pagesOf(join(site, 'dist')), ['index.html', 'behandlungen.html', 'preise.html', 'team.html']);
    assert.equal(check('pages>=4', ctx).pass, true);
    assert.equal(check('pages>=5', ctx).pass, false);
    assert.equal(check('facts-kept', { ...ctx, facts: ['Dibbelabbes 12[,.]50'] }).pass, true);
    assert.match(check('facts-kept', { ...ctx, facts: ['Hoorische'] }).detail, /Hoorische/);

    // the redesign: the old site copied next to the run and served on localhost
    const redesign = scenarios.find((x) => x.serve);
    const rdir = join(dir, 'redesign');
    setUpWork(redesign, rdir, resolve('skills/one-shot-site'));
    assert.ok(existsSync(join(rdir, 'old-site', 'speisekarte.html')));
    const cmd = serveCommand(redesign, rdir);
    assert.match(task(redesign, join(rdir, 'work'), rdir, null, { serve: cmd }), new RegExp(`http://127\.0\.0\.1:${redesign.serve.port}/.*\n.*fixtures/serve\.mjs`));
    const srv = spawn(process.execPath, ['evals/fixtures/serve.mjs', join(rdir, 'old-site'), '--port', String(redesign.serve.port + 1000)]);
    await new Promise((r) => srv.stdout.once('data', r));
    try {
      const base = `http://127.0.0.1:${redesign.serve.port + 1000}/`;
      assert.match(await (await fetch(base)).text(), /Gasthaus Zur Linde/);
      assert.equal((await fetch(base + 'gaestebuch.html')).status, 404, 'the old guestbook link is dead, as on the real thing');
      assert.notEqual((await fetch(base + '..%2f..%2fpackage.json')).status, 200, 'nothing outside the folder');
      assert.equal((await fetch(base + '50%off.html')).status, 400, 'a bad % escape is a bad request');
      assert.equal((await fetch(base)).status, 200, 'and the server is still up');
    } finally { srv.kill(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the claude -p agent gets an allow-listed environment: what tools need, its own login, no other secrets', async () => {
  const { agentEnv } = await import('../evals/lib/agent.mjs');
  const source = {
    Path: 'C:/bin', USERPROFILE: 'C:/Users/x', LOCALAPPDATA: 'C:/x', 'ProgramFiles(x86)': 'C:/pf', HTTPS_PROXY: 'http://proxy', CHROME_PATH: 'C:/c.exe',
    ANTHROPIC_API_KEY: 'sk-own', CLAUDE_CODE_OAUTH_TOKEN: 'own', npm_config_registry: 'https://registry.example',
    // not passed on
    CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'host', CLAUDE_CODE_MESSAGING_TOKEN: 'host', GH_TOKEN: 'real', NPM_TOKEN: 'real', npm_config__authToken: 'real',
    OPENAI_API_KEY: 'real', AWS_SECRET_ACCESS_KEY: 'real', SSH_AUTH_SOCK: '/tmp/agent', DATABASE_URL: 'postgres://real',
  };
  const env = agentEnv(source);
  for (const k of ['Path', 'USERPROFILE', 'LOCALAPPDATA', 'ProgramFiles(x86)', 'HTTPS_PROXY', 'CHROME_PATH', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'npm_config_registry']) assert.equal(env[k], source[k], `${k} passes`);
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_TOKEN', 'NPM_TOKEN', 'npm_config__authToken', 'OPENAI_API_KEY', 'AWS_SECRET_ACCESS_KEY', 'SSH_AUTH_SOCK', 'DATABASE_URL']) assert.equal(env[k], undefined, `${k} stays out`);
  assert.equal(env.GH_TOKEN, 'benchmark-no-publish');
  assert.equal(env.VERCEL_TOKEN, 'none');
  assert.equal(env.ONE_SHOT_HISTORY, 'off', 'a benchmark site never joins the history of recent sites');
  // a Claude Code set up for Bedrock keeps its AWS credentials
  assert.equal(agentEnv({ ...source, CLAUDE_CODE_USE_BEDROCK: '1' }).AWS_SECRET_ACCESS_KEY, 'real');
});
