// Reading a run: the agent's stream-json transcript turned into a list of events, and the automatic checks for
// expected behaviour. Pure functions over text and a few file reads, so test/score.test.mjs runs them offline.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// stream-json lines -> { init, events, texts, asked, cost, turns, seconds }
// events are short strings in order: "bash <command>", "write <path>", "read <path>", "skill <name>", "ask <questions>"
export function readTranscript(text) {
  const out = { init: null, events: [], texts: [], asked: [], cost: 0, turns: 0, seconds: 0, results: 0 };
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.type === 'system' && m.subtype === 'init' && !out.init) out.init = { model: m.model, cwd: m.cwd, tools: m.tools, skills: m.skills || [], version: m.claude_code_version };
    if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const c of m.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) out.texts.push(c.text);
        if (c.type === 'tool_use') out.events.push(eventOf(c.name, c.input || {}));
        if (c.type === 'tool_use' && c.name === 'AskUserQuestion') out.asked.push(c.input?.questions || []);
      }
    }
    if (m.type === 'result') {
      out.results++;
      out.cost = m.total_cost_usd ?? out.cost; // cumulative over the session
      out.turns += m.num_turns || 0;
      out.seconds += (m.duration_ms || 0) / 1000;
    }
  }
  return out;
}

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export function eventOf(name, input) {
  if (name === 'Bash' || name === 'PowerShell') return `bash ${one(input.command)}`;
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit' || name === 'NotebookEdit') return `write ${one(input.file_path || input.notebook_path)}`;
  if (name === 'Read') return `read ${one(input.file_path)}`;
  if (name === 'Skill') return `skill ${one(input.skill || input.name || input.command)}`;
  if (name === 'AskUserQuestion') return `ask ${(input.questions || []).map((q) => `${q.header || ''}: ${q.question} [${(q.options || []).map((o) => o.label).join(' | ')}]`).join(' ; ')}`;
  return `${name.toLowerCase()} ${one(JSON.stringify(input)).slice(0, 200)}`;
}

// A readable digest of the run for the judge and for people: what was said, asked and run, in order.
export function digest(text, { maxText = 700 } = {}) {
  const lines = [];
  for (const line of String(text).split(/\r?\n/)) {
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const c of m.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) lines.push(`AGENT: ${c.text.trim().slice(0, maxText)}${c.text.length > maxText ? ' …' : ''}`);
        if (c.type === 'tool_use') lines.push(`TOOL ${eventOf(c.name, c.input || {}).slice(0, 400)}`);
      }
    }
    if (m.type === 'user' && !m.parent_tool_use_id && typeof m.message?.content === 'string') lines.push(`PERSON: ${m.message.content.slice(0, maxText)}`);
    if (m.type === 'user' && Array.isArray(m.message?.content)) {
      for (const c of m.message.content) if (c.type === 'text' && !m.parent_tool_use_id) lines.push(`PERSON: ${c.text.slice(0, maxText)}`);
    }
  }
  return lines.join('\n\n') + '\n';
}

// The automatic checks. Each is a string; see evals/README.md for the list.
//   ran:<regex>                a shell command matched
//   order:<regex> then <regex> the first event matching A came before the first matching B
//   file:<path> / no-file:<path>   in the site folder
//   grep:<path>:<regex>        a site file contains it
//   asked                      the interview offered choices (question tool, or interview.md for agents that can't ask)
//   audit:ran  audit:ready  axe:0  film-reduced:clean  headline<=S  js<=KB  no-finding:<rule>   from the score
//   pages>=N                   the built site has N pages or more (not counting 404, og, variants, legal pages)
//   facts-kept                 every pattern in the scenario's "facts" is on a built page
//   site-json-kept             site.json is as it was before the run (a change request that isn't about facts)
//   text-kept[:after-first-screen]   the pages' words are as before (outside the section with the h1)
//   only-changed:<regex>       every file the run added, changed or removed matches
// before: the site as it was when the run started (scenarios with "start").
export function check(spec, { events = [], asked = [], interview = '', site = null, result = null, before = null, facts = [] } = {}) {
  const [kind, ...restParts] = spec.split(':');
  const rest = restParts.join(':');
  const re = (s) => new RegExp(s, 'i');
  const has = (f) => site && existsSync(join(site, f));
  const fail = (detail) => ({ check: spec, pass: false, detail });
  const ok = (detail) => ({ check: spec, pass: true, detail });
  if (kind === 'ran') {
    const hit = events.find((e) => e.startsWith('bash ') && re(rest).test(e));
    return hit ? ok(hit.slice(5, 200)) : fail(`no command matched /${rest}/`);
  }
  if (kind === 'order') {
    const [a, b] = rest.split(/\s+then\s+/);
    const ia = events.findIndex((e) => re(a).test(e)), ib = events.findIndex((e) => re(b).test(e));
    if (ia < 0) return fail(`never: /${a}/`);
    if (ib < 0) return fail(`never: /${b}/`);
    return ia < ib ? ok(`#${ia + 1} before #${ib + 1}`) : fail(`/${b}/ (#${ib + 1}) came before /${a}/ (#${ia + 1})`);
  }
  if (kind === 'file') return has(rest) ? ok(rest) : fail(`${rest} is missing`);
  if (kind === 'no-file') return has(rest) ? fail(`${rest} exists`) : ok(`no ${rest}`);
  if (kind === 'grep') {
    const [file, ...p] = rest.split(':');
    if (!has(file)) return fail(`${file} is missing`);
    const m = readFileSync(join(site, file), 'utf8').match(re(p.join(':')));
    return m ? ok(`${file}: "${m[0].slice(0, 80)}"`) : fail(`${file} has no /${p.join(':')}/`);
  }
  if (kind === 'asked') {
    const withChoices = asked.flat().filter((q) => (q.options || []).length >= 2);
    if (withChoices.length) return ok(`${withChoices.length} questions with choices`);
    // an agent that couldn't ask wrote its questions to interview.md: a question, then at least two options
    const lines = String(interview || '').split(/\r?\n/);
    let n = 0;
    // a line with a question mark ("**1. What's the site for?** (Purpose)"), then at least two options
    const option = (x) => /^\s*(\d+[.)]|[-*]|[A-Fa-f][.)])\s+\S/.test(x);
    lines.forEach((l, i) => { if (/\?/.test(l) && !option(l) && lines.slice(i + 1, i + 8).filter(option).length >= 2) n++; });
    return n ? ok(`${n} multiple-choice questions in interview.md`) : fail('no question with choices (question tool or interview.md)');
  }
  if (/^pages>=\d+$/.test(spec)) {
    const n = +spec.split('>=')[1];
    const pages = site ? pagesOf(existsSync(join(site, 'dist')) ? join(site, 'dist') : site) : [];
    return pages.length >= n ? ok(pages.join(', ')) : fail(`${pages.length} page(s): ${pages.join(', ') || 'none'}`);
  }
  if (spec === 'facts-kept') {
    if (!site || !existsSync(join(site, 'dist'))) return fail('no built site');
    const dist = join(site, 'dist');
    const text = pagesOf(dist).map((p) => pageText(readFileSync(join(dist, p), 'utf8'))).join(' ');
    const missing = facts.filter((f) => !re(f).test(text));
    return missing.length ? fail(`not on any page: ${missing.join(', ')}`) : ok(`${facts.length} facts on the pages`);
  }
  if (spec === 'site-json-kept') {
    if (!before || !site) return fail('no before snapshot');
    const read = (d) => { try { return JSON.stringify(sortKeys(JSON.parse(readFileSync(join(d, 'site.json'), 'utf8')))); } catch { return existsSync(join(d, 'site.json')) ? 'broken' : null; } };
    const a = read(before), b = read(site);
    if (a === null && b === null) return ok('no site.json, before or after');
    return a === b ? ok('site.json unchanged') : fail(b === null ? 'site.json is gone' : a === null ? 'site.json is new' : 'site.json changed');
  }
  if (kind === 'text-kept') {
    if (!before || !site) return fail('no before snapshot');
    const skipHero = rest === 'after-first-screen';
    const lost = [], added = [];
    for (const p of pagesOf(before)) {
      const was = blocks(readFileSync(join(before, p), 'utf8'), skipHero && p === 'index.html');
      const now = existsSync(join(site, p)) ? blocks(readFileSync(join(site, p), 'utf8'), skipHero && p === 'index.html') : [];
      // counted, so a heading that goes is lost even when a nav link says the same word ("Menu")
      const tally = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
      const w = tally(was), n = tally(now);
      for (const [x, k] of w) for (let i = n.get(x) || 0; i < k; i++) lost.push(`${p}: "${x.slice(0, 50)}"`);
      for (const [x, k] of n) for (let i = w.get(x) || 0; i < k; i++) added.push(`${p}: "${x.slice(0, 50)}"`);
    }
    const detail = [lost.length && `gone: ${lost.slice(0, 4).join('; ')}`, added.length && `new: ${added.slice(0, 4).join('; ')}`].filter(Boolean).join(' · ');
    return !lost.length && added.length <= 2 ? ok(detail || 'every text as before') : fail(detail);
  }
  if (kind === 'only-changed') {
    if (!before || !site) return fail('no before snapshot');
    const changed = changedFiles(before, site);
    const wrong = changed.filter((f) => !re(`^(${rest})$`).test(f));
    return wrong.length ? fail(`also changed: ${wrong.slice(0, 6).join(', ')}`) : ok(changed.length ? changed.join(', ') : 'nothing changed');
  }
  if (!result) return fail('no score for this run');
  if (spec === 'audit:ran') return result.audit ? ok(result.audit.verdict) : fail('audit did not run');
  if (spec === 'audit:ready') return result.audit?.ready ? ok(result.audit.verdict) : fail(result.audit ? result.audit.verdict : 'audit did not run');
  if (spec === 'axe:0') return result.axe === 0 ? ok('no violations') : fail(result.axe === undefined ? 'axe-core did not run' : `${result.axe} rules broken`);
  if (spec === 'film-reduced:clean') {
    const t = result.tools?.['film-reduced'];
    return t?.ran && t.fails === 0 ? ok(`${t.warns} warns`) : fail(t?.ran ? `${t.fails} fails` : 'film --reduced did not run');
  }
  let m = spec.match(/^headline<=([\d.]+)$/);
  if (m) {
    const v = result.metrics?.headline;
    return v !== null && v !== undefined && v <= +m[1] ? ok(`${v} s`) : fail(v === null ? 'never readable' : v === undefined ? 'not measured' : `${v} s`);
  }
  m = spec.match(/^js<=(\d+)$/);
  if (m) {
    const v = result.metrics?.jsKB;
    return v !== undefined && v <= +m[1] ? ok(`${v} KB`) : fail(v === undefined ? 'not measured' : `${v} KB`);
  }
  if (kind === 'no-finding') {
    const f = (result.findings || []).filter((x) => x.rule === rest);
    return f.length ? fail(f.map((x) => x.text).join(' / ').slice(0, 200)) : ok(`no ${rest}`);
  }
  return fail(`unknown check "${spec}"`);
}

// Pages a visitor reads: every .html except 404, og, variants and the legal pages, as paths with / (index.html first).
const NOT_PAGES = /(^|\/)(404|og|variant-[\w-]+|impressum|datenschutz|privacy|imprint|legal|mentions-legales|privacidad|aviso-legal)\.html$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.one-shot', '.vite', 'public', 'tools', 'src']);
export function pagesOf(dir, rel = '', root = dir) {
  const out = [];
  for (const f of readdirSync(join(root, rel))) {
    const r = rel ? `${rel}/${f}` : f;
    if (statSync(join(root, r)).isDirectory()) { if (!SKIP_DIRS.has(f) && !f.startsWith('.')) out.push(...pagesOf(dir, r, root)); }
    else if (f.endsWith('.html') && !NOT_PAGES.test(r)) out.push(r);
  }
  return out.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', euro: '€' };
const decode = (s) => s.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m));
const clean = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
export const pageText = (html) => decode(clean(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// The section (or header) that holds the h1: its start and end in the HTML.
export function heroSpan(html) {
  const h1 = html.search(/<h1\b/i);
  if (h1 < 0) return null;
  const opens = [...html.slice(0, h1).matchAll(/<(section|header)\b[^>]*>/gi)];
  for (let k = opens.length - 1; k >= 0; k--) {
    const start = opens[k].index;
    let depth = 0;
    for (const t of html.slice(start).matchAll(/<(\/?)(section|header)\b[^>]*>/gi)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        const end = start + t.index + t[0].length;
        if (end > h1) return { start, end };
        break;
      }
    }
  }
  return null;
}

// The words of a page as blocks (one per heading, paragraph, list item, cell, link, button), without the hero when asked.
export function blocks(html, withoutHero = false) {
  let h = clean(html);
  if (withoutHero) { const s = heroSpan(h); if (s) h = h.slice(0, s.start) + h.slice(s.end); }
  const body = h.match(/<body\b[\s\S]*<\/body>/i)?.[0] || h;
  return body.split(/<\/?(?:h[1-6]|p|li|td|th|dt|dd|figcaption|a|button|label|blockquote|caption|summary|title)\b[^>]*>/i)
    .map((x) => decode(x.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter((x) => x.length > 1);
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

// Files that differ between two copies of a site (added, changed or removed), ignoring builds and installs.
const NOT_SOURCE = new Set(['node_modules', 'dist', '.git', '.one-shot', '.vite']);
function filesOf(root, rel = '', out = new Map()) {
  if (!existsSync(join(root, rel))) return out;
  for (const f of readdirSync(join(root, rel))) {
    if (NOT_SOURCE.has(f)) continue;
    const r = rel ? `${rel}/${f}` : f;
    if (statSync(join(root, r)).isDirectory()) filesOf(root, r, out);
    else out.set(r, readFileSync(join(root, r)));
  }
  return out;
}
export function changedFiles(a, b) {
  const x = filesOf(a), y = filesOf(b);
  return [...new Set([...x.keys(), ...y.keys()])].filter((f) => !x.has(f) || !y.has(f) || !x.get(f).equals(y.get(f))).sort();
}

// An expectation is "text" or { text, auto: [checks], judge: true|false }. Without auto checks it goes to the judge.
export function expectations(scenario) {
  return (scenario.expected_behavior || []).map((e, i) => {
    const x = typeof e === 'string' ? { text: e } : e;
    const auto = x.auto || [];
    return { i, text: x.text, auto, judge: x.judge ?? !auto.length };
  });
}
