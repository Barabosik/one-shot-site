// The head-to-head's own parts, offline: no browser, no agent. The plain arm's task, the judge set, the tally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { checksOf, judgeSet, plainSite, plainTask, screens, tally } from '../evals/head-to-head.mjs';

const scenarios = JSON.parse(readFileSync('evals/scenarios.json', 'utf8'));

test('the plain arm gets the same person and answers, and nothing of the skill', () => {
  const sc = scenarios.find((s) => /portfolio/.test(s.name));
  const t = plainTask(sc, String.raw`C:\runs\h2h\plain\p\work`, 'C:/notes/locked.mjs');
  assert.ok(t.includes(`"${sc.query}"`));
  assert.ok(t.includes(sc.answers.material));
  for (const [k, v] of Object.entries(sc.answers)) if (k !== 'pick') assert.ok(t.includes(v), `answer ${k}`);
  assert.match(t, /C:\/runs\/h2h\/plain\/p\/work/);
  assert.match(t, /Don't use the Skill tool or any skill/);
  assert.match(t, /Never submit a form, and never click, follow or open a mailto:, tel:/, 'nothing reaches the owner\'s mail app');
  assert.match(t, /Start-Process, cmd \/c start, open, xdg-open/);
  assert.doesNotMatch(t, /one-shot-site|SKILL\.md|audit\.mjs|look\.mjs|brief\.md/, 'no word of the skill or its scripts');
  assert.match(t, /node "C:\/notes\/locked\.mjs" evals-plain-portfolio-bold-lively-dark /, 'named for the plain arm and its scenario');
  assert.match(t, /Keep your scratch files [^`]*`C:\/runs\/h2h\/plain\/p\/scratch`, not in a\s+scratchpad/, 'a scratch folder of its own, beside work');
  assert.doesNotMatch(plainTask(sc, 'w', null), /lock helper/);
  const picky = { ...sc, answers: { ...sc.answers, pick: 'B' } };
  assert.doesNotMatch(plainTask(picky, 'w', null), /When you show options/, 'the skill-only answer stays out');
});

test('judges: every pair in both orders, as many each way, ids that say nothing', () => {
  const set = judgeSet(['a', 'b', 'c'], 3, 7);
  assert.equal(set.length, 18);
  for (const slug of ['a', 'b', 'c']) for (const side of ['A', 'B']) assert.equal(set.filter((j) => j.slug === slug && j.skillIs === side).length, 3);
  assert.equal(new Set(set.map((j) => j.id)).size, 18);
  for (const j of set) assert.match(j.id, /^[0-9a-f]{8}$/);
  assert.deepEqual(judgeSet(['a'], 2, 7), judgeSet(['a'], 2, 7), 'the same seed gives the same set');
});

test('tally: wins per pair, the rate, and how often the first site won', () => {
  const v = [
    { slug: 'a', skillIs: 'A', winner: 'A' }, { slug: 'a', skillIs: 'B', winner: 'B' },
    { slug: 'b', skillIs: 'A', winner: 'B' }, { slug: 'b', skillIs: 'B', winner: 'B' },
  ];
  const t = tally(v);
  assert.equal(t.n, 4);
  assert.equal(t.skill, 3);
  assert.equal(t.plain, 1);
  assert.equal(t.rate, 75);
  assert.equal(t.aRate, 25);
  assert.deepEqual(t.by, { a: { skill: 2, plain: 0 }, b: { skill: 1, plain: 1 } });
  assert.equal(tally([]).rate, null);
});

test('screens in page order, a plain site found by its index.html, and the checks per arm', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-'));
  try {
    const look = join(tmp, 'look');
    mkdirSync(look);
    for (const f of ['home-1440-10.jpg', 'home-1440-2.jpg', 'home-1440-0.jpg', 'home-390-0.jpg', 'about-1440-0.jpg', 'sheet-home-1440.jpg']) writeFileSync(join(look, f), '');
    assert.deepEqual(screens(look, 1440), ['home-1440-0.jpg', 'home-1440-2.jpg', 'home-1440-10.jpg']);
    assert.deepEqual(screens(join(tmp, 'none'), 390), []);
    mkdirSync(join(tmp, 'work', 'cafe-site'), { recursive: true });
    writeFileSync(join(tmp, 'work', 'cafe-site', 'index.html'), '<h1>x</h1>');
    assert.equal(plainSite(join(tmp, 'work')), join(tmp, 'work', 'cafe-site'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const c = checksOf({
    score: 91, complete: true, audit: { ready: false }, axe: 2, contrast: 1, metrics: { layoutShift: 0.02, jsKB: 4, weightKB: 300, headline: 0 },
    tools: { look: { ran: true, fails: 1, warns: 2 }, 'look-dark': { ran: true, fails: 0, warns: 1 }, film: { ran: true, fails: 0, warns: 0 }, 'film-reduced': { ran: false }, audit: { ran: true, fails: 2, warns: 3 } },
    findings: [{ level: 'fail', rule: 'audit:broken-link' }, { level: 'fail', rule: 'contrast' }, { level: 'warn', rule: 'long-headline' }],
  }, { mobile: { performance: 98 } });
  assert.equal(c.look, 4, 'light and dark looks together');
  assert.equal(c.motion, 0);
  assert.equal(c.lint, null, 'not run is not zero');
  assert.equal(c.links, 1);
  assert.equal(c.contrast, 1);
  assert.equal(c.fails, 2);
  assert.equal(c.ready, false);
  assert.equal(c.lighthouse.mobile.performance, 98);
});

test("a plain agent's transcript: any touch of the skill is found, its own work is not", async () => {
  const { skillUse } = await import('../evals/head-to-head.mjs');
  const call = (name, input) => JSON.stringify({ message: { content: [{ type: 'tool_use', name, input }] } });
  const own = 'D:\\work\\one-shot-site-runs\\evals\\head-to-head\\plain\\bakery\\work';
  const clean = [call('Bash', { command: `cd "${own}" && npm run build` }), call('Write', { file_path: `${own}\\site\\index.html` }), call('WebSearch', { query: 'rye bread' })].join('\n');
  assert.deepEqual(skillUse(clean), []);
  assert.equal(skillUse(call('Skill', { skill: 'one-shot-site' })).length, 1);
  assert.equal(skillUse(call('Read', { file_path: 'C:\\Users\\sam\\.claude\\skills\\one-shot-site\\SKILL.md' })).length, 1);
  assert.equal(skillUse(call('Bash', { command: 'ls D:/work/one-shot-site/examples/' })).length, 1);
  assert.equal(skillUse(call('Glob', { path: 'D:/work/one-shot-site-runs/evals/2026-10-20T1336' })).length, 1, "the skill arm's sites");
  assert.deepEqual(skillUse('not json\n'), []);
});

test('the vote page template takes the pairs and names the arms only on the results view', () => {
  const html = readFileSync('evals/lib/blind-vote.html', 'utf8');
  assert.ok(html.includes('/*PAIRS*/[]'));
  const voting = html.slice(0, html.indexOf('function results()'));
  assert.doesNotMatch(voting.replace(/\/\/[^\n]*/g, ''), /skill|plain/i, 'nothing on the voting screens says which is which');
  assert.doesNotMatch(html, /<script src=|<link [^>]*href="http/, 'no outside files: it works offline');
  // screens apart and named, so stacked screenshots don't read as a broken page
  assert.match(voting, /el\('figure'[\s\S]*figcaption[\s\S]*Screen \$\{i \+ 1\} of \$\{n\}/);
  assert.match(voting, /Each picture is one screen, so a header that stays on top shows on every one\./);
  assert.match(html, /const KEY = `blind-vote:\$\{PAIRS\.map/, "another page's votes stay out of this one's");
});

test("a build's cost from its transcript: one model call per id, pauses left out", async () => {
  const { usage } = await import('../evals/head-to-head.mjs');
  const line = (at, id, usage, content) => JSON.stringify({ timestamp: at, message: { id, usage, content } });
  const u = { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 };
  const t = [
    line('2026-10-20T10:00:00Z', 'm1', { ...u, output_tokens: 3 }, [{ type: 'thinking' }]),
    line('2026-10-20T10:00:05Z', 'm1', { ...u, output_tokens: 400 }, [{ type: 'tool_use', id: 't1' }]),
    line('2026-10-20T10:10:00Z', 'm2', { ...u, output_tokens: 50 }, [{ type: 'tool_use', id: 't2' }]),
    line('2026-10-21T09:00:00Z', 'm3', { ...u, output_tokens: 50 }, [{ type: 'text' }]), // the next morning: a pause
    line('2026-10-21T09:05:00Z', 'm4', { ...u, output_tokens: 0 }, [{ type: 'tool_use', id: 't3' }]),
    'not json',
  ].join('\n');
  const r = usage(t);
  assert.equal(r.calls, 4);
  assert.equal(r.tools, 3);
  assert.equal(r.output, 500);
  assert.equal(r.tokens, 500 + 4 * 1102);
  assert.equal(r.minutes, 15, '10 minutes, then 5 after the pause');
});

test('per arm: faults summed, the rest as medians; a round is the scenarios prepared in its folder', async () => {
  const { armTotals, roundOf } = await import('../evals/head-to-head.mjs');
  const c = (score, fails, warns, axe, perf) => ({ score, ready: fails === 0, fails, warns, axe, contrast: 0, links: 0, lighthouse: { mobile: { performance: perf } } });
  const rows = [
    { skill: { checks: c(100, 0, 1, 0, 99), usage: { minutes: 46.4, tokens: 9e6, output: 1e5 } }, plain: { checks: c(80, 3, 4, 2, 90), usage: { minutes: 20, tokens: 2e6, output: 4e4 } } },
    { skill: { checks: c(98, 0, 0, 0, 97), usage: { minutes: 50.8, tokens: 1e7, output: 2e5 } }, plain: { checks: null, usage: null } },
  ];
  const s = armTotals(rows, 'skill'), p = armTotals(rows, 'plain');
  assert.deepEqual([s.sites, s.ready, s.fails, s.warns, s.score, s.lhPhone[0], s.minutes, s.minutesAll], [2, 2, 0, 1, 99, 98, 48.6, 97]);
  assert.deepEqual([p.sites, p.ready, p.fails, p.axe, p.builds], [1, 0, 3, 2, 1]);
  assert.equal(p.lhDesktop[0], null, 'not run is not zero');
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-'));
  try {
    const slug = 'portfolio-bold-lively-dark';
    mkdirSync(join(tmp, 'plain', slug), { recursive: true });
    writeFileSync(join(tmp, 'plain', slug, 'task.md'), '# x');
    writeFileSync(join(tmp, 'h2h.json'), JSON.stringify({ from: 'C:/runs/x', about: 'unseen', notes: ['n'] }));
    const r = roundOf(tmp, scenarios);
    assert.deepEqual(r.scenarios.map((sc) => sc.name), [scenarios.find((sc) => /portfolio/.test(sc.name)).name]);
    assert.equal(r.from, 'C:/runs/x');
    assert.equal(r.meta.about, 'unseen');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("a build's cost counts the agents it started, and theirs; the reviewer is the one told to read reviewer.md", async () => {
  const { buildUsage, subagentsOf, reviewsOf } = await import('../evals/head-to-head.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-subs-'));
  try {
    const agent = (name, id, input, prompt, meta) => {
      writeFileSync(join(tmp, `agent-${name}.jsonl`), [JSON.stringify({ message: { role: 'user', content: prompt } }), JSON.stringify({ timestamp: '2026-10-21T10:00:00Z', message: { id, usage: { input_tokens: input, output_tokens: 10 }, content: [] } })].join('\n'));
      if (meta) writeFileSync(join(tmp, `agent-${name}.meta.json`), JSON.stringify(meta));
    };
    agent('build', 'b1', 1000, 'Build the site');
    agent('rev', 'r1', 200, 'SKILL_DIR: C:/s\nSite: C:/x\nRound: 1\nRead SKILL_DIR/references/reviewer.md and follow its prompt.', { description: 'Review round 1', parentAgentId: 'build' });
    agent('deep', 'd1', 30, 'Look at this', { description: 'deeper', parentAgentId: 'rev' });
    // a builder may paste reviewer.md's prompt in instead of naming the file
    agent('pasted', 'p1', 0, '# The reviewer\n\nYou review a website before its owner sees it.', { description: 'Review, round 2', parentAgentId: 'build' });
    // the plugin's reviewer agent, given only the three lines
    agent('plugin', 'g1', 0, 'SKILL_DIR: C:/s\nSite: C:/x\nRound: 1', { description: 'Review', agentType: 'one-shot-site:reviewer', parentAgentId: 'build' });
    agent('other', 'o1', 5000, 'Judge', { description: 'another build', parentAgentId: 'someone' });
    assert.deepEqual(subagentsOf(join(tmp, 'agent-build.jsonl')).map((s) => s.description), ['Review, round 2', 'Review', 'Review round 1', 'deeper']);
    const u = buildUsage(join(tmp, 'agent-build.jsonl'));
    assert.deepEqual([u.tokens, u.calls, u.output], [1010 + 10 + 10 + 210 + 40, 5, 50]);
    assert.deepEqual(u.subagents.map((s) => s.reviewer), [true, true, true, false]);
    const site = join(tmp, 'site');
    mkdirSync(join(site, '.one-shot'), { recursive: true });
    writeFileSync(join(site, '.one-shot', 'review-2.md'), 'Design 8/10\nWeighted: 7.8\nVerdict: SHOW\n');
    writeFileSync(join(site, '.one-shot', 'review-1.md'), 'Caps: thin (screen 3)\n**Weighted:** 6.2\n**Verdict:** FIX\n');
    writeFileSync(join(site, '.one-shot', 'critique-1.md'), 'Verdict: PASS');
    assert.deepEqual(reviewsOf(site), [{ round: 1, verdict: 'FIX', weighted: 6.2 }, { round: 2, verdict: 'SHOW', weighted: 7.8 }]);
    assert.deepEqual(reviewsOf(null), []);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('the judges\' words for a louder, colder, busier, odd or plain site are counted with their forms', async () => {
  const { toneWords } = await import('../evals/head-to-head.mjs');
  const v = [{ why: 'A is louder and busier; B is plain, a bit plainer, and cold.' }, { why: 'Its odd, oddly cropped title is too loud. Busy, plainly. Colder.' }, { why: 'Placeholder text, a cold-brew bar and a business card: none of these.' }];
  assert.deepEqual(toneWords(v), { louder: 2, colder: 2, busier: 2, odd: 2, plain: 3 });
});

test("a round can reuse an earlier round's plain arm: the same sites and scores, counted once", async () => {
  const { armHomes, armTotals, roundOf } = await import('../evals/head-to-head.mjs');
  const runs = mkdtempSync(join(tmpdir(), 'h2h-rounds-'));
  try {
    const r2 = join(runs, 'r2'), r3 = join(runs, 'r3'), slug = 'portfolio-bold-lively-dark';
    mkdirSync(join(r2, 'plain', slug), { recursive: true });
    writeFileSync(join(r2, 'plain', slug, 'task.md'), '# x');
    mkdirSync(r3);
    writeFileSync(join(r3, 'h2h.json'), JSON.stringify({ from: 'C:/runs/y', plain: 'r2' }));
    const r = roundOf(r3, scenarios);
    assert.deepEqual(r.home(slug), { skill: r3, plain: r2 });
    assert.equal(r.scenarios.length, 1, 'the scenarios of the reused plain arm');
    assert.deepEqual(armHomes(r2, {}), { skill: r2, plain: r2 });
    // a list: each pair's plain arm from the first round that prepared it, else this round's own
    const r1 = join(runs, 'r1'), cafe = 'small-business-warm-no';
    mkdirSync(join(r1, 'plain', cafe), { recursive: true });
    writeFileSync(join(r1, 'plain', cafe, 'task.md'), '# x');
    const meta = { plain: ['r2', 'r1'] };
    assert.deepEqual([slug, cafe, 'band-night-tour-dates'].map((s) => armHomes(r3, meta, s).plain), [r2, r1, r3]);
    writeFileSync(join(r3, 'h2h.json'), JSON.stringify({ from: 'C:/runs/y', ...meta }));
    assert.deepEqual(roundOf(r3, scenarios).scenarios.map((sc) => sc.name).sort(), ['portfolio, bold, lively, dark mode', 'small business, warm, no photos']);
    const c = { score: 90, ready: true, fails: 0, warns: 1, axe: 0, contrast: 0, links: 0 };
    const rows = [{ skill: { src: 'r2/s', checks: c }, plain: { src: 'r2/p', checks: c } }, { skill: { src: 'r3/s', checks: c }, plain: { src: 'r2/p', checks: c } }];
    assert.deepEqual([armTotals(rows, 'skill').sites, armTotals(rows, 'plain').sites, armTotals(rows, 'plain').warns], [2, 1, 1]);
  } finally { rmSync(runs, { recursive: true, force: true }); }
});

test('judges one pair at a time: --only keeps the other pairs\' judges and verdicts', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-judges-'));
  try {
    const run = join(tmp, 'run'), out = join(tmp, 'r3'), slugs = ['band-night-tour-dates', 'app-quiet-waitlist'];
    for (const slug of slugs) {
      mkdirSync(join(run, slug), { recursive: true });
      writeFileSync(join(run, slug, 'task.md'), '# x');
      for (const arm of ['skill', 'plain']) {
        mkdirSync(join(out, 'score', arm, slug, 'look'), { recursive: true });
        for (const w of [1440, 390]) writeFileSync(join(out, 'score', arm, slug, 'look', `sheet-home-${w}.jpg`), 'jpg');
      }
    }
    const judges = (only) => spawnSync(process.execPath, ['evals/head-to-head.mjs', '--judges', '--out', out, '--from', run, '--seed', '3', '--only', only], { encoding: 'utf8' });
    assert.equal(judges(slugs[0]).status, 0);
    const first = JSON.parse(readFileSync(join(out, 'judge-key.json'), 'utf8')).judges;
    writeFileSync(join(out, 'judges', first[0].id, 'verdict.json'), '{"winner":"A","why":"x"}');
    assert.equal(judges(slugs[1]).status, 0);
    const key = JSON.parse(readFileSync(join(out, 'judge-key.json'), 'utf8')).judges;
    assert.equal(key.length, 12);
    assert.equal(new Set(key.map((j) => j.id)).size, 12, 'no id twice');
    assert.deepEqual(key.slice(0, 6), first, 'the first pair kept');
    assert.ok(existsSync(join(out, 'judges', first[0].id, 'verdict.json')), 'and its verdict');
    assert.equal(judges(slugs[0]).status, 0, 'judging a pair again');
    assert.equal(JSON.parse(readFileSync(join(out, 'judge-key.json'), 'utf8')).judges.filter((j) => j.slug === slugs[0]).length, 6);
    assert.ok(!existsSync(join(out, 'judges', first[0].id, 'verdict.json')), 'its old verdicts go');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a control arm: the plain task with one other skill installed in its project, built in the skill\'s place', () => {
  const sc = scenarios.find((s) => /portfolio/.test(s.name));
  const t = plainTask(sc, 'C:/runs/fd/arm/x/work', 'C:/notes/locked.mjs', { skill: '.claude/skills/frontend-design/SKILL.md', tag: 'frontend-design' });
  assert.match(t, /read `C:\/runs\/fd\/arm\/x\/work\/\.claude\/skills\/frontend-design\/SKILL\.md` and follow it/);
  assert.doesNotMatch(t, /Don't use the Skill tool or any skill/);
  assert.match(t, /locked\.mjs" evals-frontend-design-portfolio/);
  const plain = plainTask(sc, 'C:/runs/fd/arm/x/work', 'C:/notes/locked.mjs');
  assert.equal(t.replace(/- Before you start[\s\S]*?looking things up on the web is fine\)\./, '').replace(/evals-frontend-design-/g, 'evals-plain-'),
    plain.replace(/- Don't use the Skill tool[\s\S]*?looking things up on the web is fine\)\./, ''), 'otherwise the plain task word for word');
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-arm-'));
  try {
    const skill = join(tmp, 'frontend-design'), out = join(tmp, 'fd');
    mkdirSync(skill);
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: frontend-design\n---\n');
    const r = spawnSync(process.execPath, ['evals/head-to-head.mjs', '--prepare', '--arm-skill', skill, '--out', out, '--only', 'portfolio-bold-lively-dark'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const dir = join(out, 'arm', 'portfolio-bold-lively-dark');
    assert.ok(existsSync(join(dir, 'work', '.claude', 'skills', 'frontend-design', 'SKILL.md')));
    assert.ok(existsSync(join(dir, 'scratch')), 'its scratch folder, outside the site\'s project');
    assert.match(readFileSync(join(dir, 'task.md'), 'utf8'), /frontend-design\/SKILL\.md` and follow it/);
    const meta = JSON.parse(readFileSync(join(out, 'h2h.json'), 'utf8'));
    assert.equal(meta.from, join(out, 'arm'));
    assert.match(meta.skill, /^frontend-design \(a control arm/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('how much of each home page the judges saw, in the report; the vote page shows the whole page', async () => {
  const { seen } = await import('../evals/head-to-head.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-whole-'));
  try {
    const run = join(tmp, 'run'), out = join(tmp, 'r5'), slug = 'band-night-tour-dates';
    mkdirSync(join(run, slug), { recursive: true });
    writeFileSync(join(run, slug, 'task.md'), '# x');
    mkdirSync(join(out, 'plain', slug), { recursive: true });
    writeFileSync(join(out, 'plain', slug, 'task.md'), '# x');
    const shots = (dir, n1440, n390) => {
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < n1440; i++) writeFileSync(join(dir, `home-1440-${i}.jpg`), 'jpg');
      for (let i = 0; i < n390; i++) writeFileSync(join(dir, `home-390-${i}.jpg`), 'jpg');
    };
    const look = join(out, 'score', 'skill', slug, 'look');
    shots(look, 8, 5);
    writeFileSync(join(look, 'report.md'), '# look\n\n- home at 1440px is 12 screens tall; the sheet shows the first 8 (use --frames to see more).\n- about at 390px is 9 screens tall; the sheet shows the first 8 (use --frames to see more).\n');
    shots(join(out, 'score', 'plain', slug, 'look'), 3, 4);
    for (const arm of ['skill', 'plain']) writeFileSync(join(out, 'score', arm, slug, 'score.json'), JSON.stringify({ score: 80, complete: true, findings: [] }));
    assert.deepEqual(seen(look), { 1440: { seen: 8, of: 12 }, 390: { seen: 5, of: 5 } }, 'another page\'s note is not the home page\'s');
    // one judge: the screens column is about what the judges saw
    mkdirSync(join(out, 'judges', 'j1'), { recursive: true });
    writeFileSync(join(out, 'judge-key.json'), JSON.stringify({ perOrder: 1, seed: 1, judges: [{ id: 'j1', slug, skillIs: 'A' }] }));
    writeFileSync(join(out, 'judges', 'j1', 'verdict.json'), '{"winner":"A","why":"x"}');
    const cli = (...args) => spawnSync(process.execPath, ['evals/head-to-head.mjs', '--out', out, '--from', run, ...args], { encoding: 'utf8' });
    let r = cli('--tally', '--vote-page');
    assert.equal(r.status, 0, r.stderr);
    const md = readFileSync(join(out, 'head-to-head.md'), 'utf8');
    assert.match(md, /\| band-night-tour-dates \| skill \| 80 \| not ready \| 8 of 12 \/ 5 of 5 \|/);
    assert.match(md, /\| band-night-tour-dates \| plain \| 80 \| not ready \| 3 of 3 \/ 4 of 4 \|/);
    assert.match(md, /Cut: band-night-tour-dates skill at 1440 \(8 of 12\)\./);
    assert.match(r.stdout, /band-night-tour-dates skill: 8 of 12 screens at 1440; run --whole first/, 'a cut page on the vote page is named');
    const pairs = () => JSON.parse(readFileSync(join(out, 'blind-vote', 'index.html'), 'utf8').match(/const PAIRS = (.*);/)[1]);
    assert.equal(pairs()[0].x.desktop.length, 8);
    shots(join(out, 'whole', 'skill', slug), 12, 5);
    r = cli('--vote-page');
    assert.doesNotMatch(r.stdout, /run --whole first/);
    assert.deepEqual([pairs()[0].x.desktop.length, pairs()[0].x.phone.length, pairs()[0].y.desktop.length], [12, 5, 3], 'the whole page, where --whole shot it');
    assert.match(readFileSync(join(out, 'head-to-head.md'), 'utf8'), /8 of 12/, 'the report still says what the judges saw');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('no AI judges: the report keeps the checks and costs only; the vote page can have an optional second part', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-nojudge-'));
  try {
    const run = join(tmp, 'run'), slug = 'band-night-tour-dates';
    mkdirSync(join(run, slug), { recursive: true });
    writeFileSync(join(run, slug, 'task.md'), '# x');
    const round = (name, meta) => {
      const out = join(tmp, name);
      mkdirSync(join(out, 'plain', slug), { recursive: true });
      writeFileSync(join(out, 'plain', slug, 'task.md'), '# x');
      writeFileSync(join(out, 'h2h.json'), JSON.stringify({ from: run, label: name, ...meta }));
      for (const arm of ['skill', 'plain']) {
        const look = join(out, 'score', arm, slug, 'look');
        mkdirSync(look, { recursive: true });
        for (const w of [1440, 390]) writeFileSync(join(look, `home-${w}-0.jpg`), 'jpg');
        writeFileSync(join(out, 'score', arm, slug, 'score.json'), JSON.stringify({ score: 70, complete: true, findings: [] }));
      }
      return out;
    };
    const r5 = round('r5', { names: { skill: 'v0.5', plain: 'Plain agent' } }), other = round('other', { names: { skill: 'arm-a', plain: 'arm-b' } });
    const r = spawnSync(process.execPath, ['evals/head-to-head.mjs', '--out', r5, '--tally', '--vote-page', '--more', other], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const md = readFileSync(join(r5, 'head-to-head.md'), 'utf8');
    assert.match(md, /No AI judges: the same checks on both arms and what each build took/);
    assert.doesNotMatch(md, /Blind judges|Home screens judged|Words in the judges|Every judgment|Skill picked/);
    assert.match(md, /\| band-night-tour-dates \| skill \| 70 \| not ready \| 0 \| 0 \|/);
    const pairs = JSON.parse(readFileSync(join(r5, 'blind-vote', 'index.html'), 'utf8').match(/const PAIRS = (.*);/)[1]);
    assert.deepEqual(pairs.map((p) => [p.pair, p.part, p.names.x, p.names.y]), [['r5/band-night-tour-dates', 1, 'v0.5', 'Plain agent'], ['other/band-night-tour-dates', 2, 'arm-a', 'arm-b']]);
    const html = readFileSync('evals/lib/blind-vote.html', 'utf8');
    assert.match(html, /if \(session\.at === PART1 && PART2 && !session\.more\) return between\(\);/, 'the extra pairs only if the voter wants them');
    assert.match(html, /order: \[\.\.\.shuffle\(part\(1\)\), \.\.\.shuffle\(part\(2\)\)\]/, 'each part in its own random order, the optional one last');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a live site under a path: its root links get the path, full ones stay; forms and mail links are demos', async () => {
  const { underPath, copySite, GUARD } = await import('../evals/lib/live-vote.mjs');
  const html = '<a href="/team.html">T</a><a href="/">H</a><a href="//cdn.example/x">C</a><a href="https://x.example/">X</a><a href="#top">A</a><img src="/a.jpg" srcset="/a.jpg 1x, /a@2x.jpg 2x"><link rel="stylesheet" href="/assets/m.css"><script type="module" src="/assets/m.js"></script><div style="background:url(/img/b.png)"></div><a href="mailto:x@y.example">M</a>';
  const t = underPath(html, '/p1/ab12/', '.html');
  for (const u of ['href="/p1/ab12/team.html"', 'href="/p1/ab12/"', 'href="//cdn.example/x"', 'href="https://x.example/"', 'href="#top"', 'src="/p1/ab12/a.jpg"', 'srcset="/p1/ab12/a.jpg 1x, /p1/ab12/a@2x.jpg 2x"', 'href="/p1/ab12/assets/m.css"', 'src="/p1/ab12/assets/m.js"', 'url(/p1/ab12/img/b.png)', 'href="mailto:x@y.example"']) assert.ok(t.includes(u), u);
  assert.equal(underPath('@font-face{src:url("/assets/f.woff2")} a{background:url(//cdn.example/b.png)}', '/p1/ab12/', '.css'), '@font-face{src:url("/p1/ab12/assets/f.woff2")} a{background:url(//cdn.example/b.png)}');
  assert.equal(underPath('import("/assets/x.js");const u=`/assets/y.png`', '/p1/ab12/', '.js'), 'import("/p1/ab12/assets/x.js");const u=`/p1/ab12/assets/y.png`');
  assert.equal(underPath('{"start_url": "/", "icons": [{"src": "/i.png"}]}', '/p1/ab12/', '.webmanifest'), '{"start_url": "/p1/ab12/", "icons": [{"src": "/p1/ab12/i.png"}]}');
  assert.match(GUARD, /addEventListener\('submit',\(e\)=>\{e\.preventDefault\(\);e\.stopPropagation\(\)/, 'a form sends nothing');
  assert.match(GUARD, /\^\(mailto\|tel\|sms\):/, 'a mail, phone or text link opens nothing');
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-live-'));
  try {
    const src = join(tmp, 'dist'), dest = join(tmp, 'out', 'p1', 'ab12');
    mkdirSync(join(src, '.one-shot'), { recursive: true });
    mkdirSync(join(src, 'assets'));
    writeFileSync(join(src, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><a href="/team.html">T</a></body></html>');
    writeFileSync(join(src, 'assets', 'm.css'), 'a{background:url(/assets/b.png)}');
    writeFileSync(join(src, '.one-shot', 'brief.md'), 'the brief');
    writeFileSync(join(src, 'package.json'), '{}');
    assert.equal(copySite(src, dest, '/p1/ab12/'), 2);
    const page = readFileSync(join(dest, 'index.html'), 'utf8');
    assert.ok(page.startsWith('<!doctype html><html><head><script>/* demo */'), 'the guard runs before anything else');
    assert.match(page, /href="\/p1\/ab12\/team\.html"/);
    assert.equal(readFileSync(join(dest, 'assets', 'm.css'), 'utf8'), 'a{background:url(/p1/ab12/assets/b.png)}');
    assert.ok(!existsSync(join(dest, '.one-shot')) && !existsSync(join(dest, 'package.json')), 'nothing but the site');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('the live vote server: the page, each site under its path, its pages found as a host would, root paths sent home', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'h2h-serve-'));
  const site = join(tmp, 'p1', 'ab12');
  mkdirSync(join(site, 'assets'), { recursive: true });
  writeFileSync(join(tmp, 'index.html'), 'vote page');
  writeFileSync(join(site, 'index.html'), 'home');
  writeFileSync(join(site, 'team.html'), 'team');
  writeFileSync(join(site, '404.html'), 'lost');
  writeFileSync(join(site, 'assets', 'f.woff2'), 'font');
  const { spawn } = await import('node:child_process');
  const p = spawn(process.execPath, ['evals/lib/vote-serve.mjs', tmp, '--port', '0']);
  try {
    const base = await new Promise((ok, no) => { p.stdout.on('data', (d) => ok(String(d).trim())); p.on('exit', () => no(new Error('server exited'))); });
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+\/$/, 'this machine only');
    const get = (path, headers = {}) => fetch(new URL(path, base), { redirect: 'manual', headers });
    const text = async (path) => { const r = await get(path); return [r.status, await r.text()]; };
    assert.deepEqual(await text('/'), [200, 'vote page']);
    assert.deepEqual(await text('/p1/ab12/'), [200, 'home']);
    assert.deepEqual(await text('/p1/ab12/team'), [200, 'team'], 'a page without .html');
    assert.deepEqual(await text('/p1/ab12/nope.html'), [404, 'lost'], "the site's own 404 page");
    assert.equal((await get('/p1/ab12/assets/f.woff2')).headers.get('content-type'), 'font/woff2');
    const r = await get('/p1/ab12');
    assert.deepEqual([r.status, r.headers.get('location')], [302, '/p1/ab12/'], 'a folder gets its slash');
    const home = await get('/team.html?x=1', { referer: `${base}p1/ab12/index.html` });
    assert.deepEqual([home.status, home.headers.get('location')], [302, '/p1/ab12/team.html?x=1'], 'a root path, sent to the site that asked');
    assert.equal((await get('/team.html')).status, 404, 'without a site behind it, nothing');
    const outside = `${tmp}-outside.txt`;
    writeFileSync(outside, 'secret');
    try { assert.equal((await get(`/p1/ab12/..%2f..%2f..%2f${basename(outside)}`)).status, 404, 'nothing outside the folder'); } finally { rmSync(outside, { force: true }); }
  } finally { p.kill(); rmSync(tmp, { recursive: true, force: true }); }
});

test('the live vote page: real sites side by side, no names until #results, forms off in the frames', () => {
  const html = readFileSync('evals/lib/blind-vote-live.html', 'utf8');
  assert.ok(html.includes('/*PAIRS*/[]'));
  const voting = html.slice(0, html.indexOf('function results()'));
  assert.doesNotMatch(voting.replace(/\/\/[^\n]*/g, ''), /skill|plain/i, 'nothing on the voting screens says which is which');
  assert.match(voting, /sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'/);
  assert.doesNotMatch(voting, /allow-forms|allow-top-navigation/, 'a form in a frame sends nothing, and a site cannot leave its frame');
  assert.match(voting, /const WIDTH = \{ desktop: 1440, phone: 390 \}/, 'each at a real width, scaled to fit');
  assert.match(voting, /Open \$\{name\} full screen/);
  assert.match(voting, /comment: comment\.trim\(\)/, 'a comment per pair, with the vote');
  assert.doesNotMatch(html, /<script src=|<link [^>]*href="http/, 'no outside files');
});
