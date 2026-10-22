#!/usr/bin/env node
// answerer: the person in a benchmark run. A tiny MCP server (stdio, no dependencies) that Claude Code calls as
// its --permission-prompt-tool. Every tool call is allowed as it is, except AskUserQuestion: that one gets the
// scenario's canned answers filled in, the way a person would pick them in the question picker.
//
//   node answerer.mjs <answers.json> <log.jsonl>
//
// answers.json is the scenario's "answers" object. Each question and the answer given go to log.jsonl, so the
// judge can see how the interview was asked.
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const words = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'me', 'my', 'for', 'of', 'to', 'it', 'them', 'i', 'you', 'your', 'on', 'in', 'with']);

// How well option label `label` fits the canned answer `want`: 1 = same, 0 = nothing shared.
export function fit(label, want) {
  const l = words(label).join(' '), w = words(want).join(' ');
  if (!l || !w) return 0;
  if (l === w) return 1;
  if (l.startsWith(w) || w.startsWith(l)) return 0.9;
  const lw = new Set(words(label).filter((x) => !STOP.has(x)));
  const ww = words(want).filter((x) => !STOP.has(x));
  if (!lw.size || !ww.length) return 0;
  const shared = ww.filter((x) => lw.has(x)).length;
  return 0.8 * (shared / ww.length) * (0.5 + (0.5 * shared) / lw.size); // their words found, extra option words cost a little
}

// Which canned answer a question is about: by its header ("Purpose", "Feel"…), else by words in the question.
// Most specific first: "What do you like about that site?" is about likes, not about the site's purpose.
const KEYS = {
  likes: /\blike (about|in)\b|\bliked?\b.*\b(site|it)\b|you like/i, material: /material|send me|what you have/i,
  extras: /extra|add-?on|feature/i, languages: /language/i, goal: /goal|visitor|do next|action/i,
  colours: /colou?r|palette|brand/i, motion: /motion|movement|animat|alive|move/i, feel: /feel|mood|look|style/i,
  purpose: /purpose|site for|is it for|what.*for\?/i,
};
export function keyFor(q, answers) {
  const header = String(q.header || '').toLowerCase().trim();
  if (header && header in answers) return header;
  for (const [k, re] of Object.entries(KEYS)) if (k in answers && (re.test(q.header || '') || re.test(q.question || ''))) return k;
  return null;
}

// AskUserQuestion input -> the answers object it expects ({ [question text]: "label" or "a, b" }).
export function answer(input, answers) {
  const out = {};
  for (const q of input?.questions || []) {
    const key = keyFor(q, answers);
    const want = key ? String(answers[key]) : '';
    const opts = (q.options || []).map((o) => o.label);
    if (!want) { out[q.question] = opts[0] ?? 'Your pick'; continue; } // no canned answer: the recommended one
    if (q.multiSelect && /^(none|no|nothing|-)?$/i.test(want.trim())) { out[q.question] = ''; continue; }
    const picks = (q.multiSelect ? want.split(/\s*,\s*/) : [want]).map((w) => {
      const best = opts.map((l) => [l, fit(l, w)]).sort((x, y) => y[1] - x[1])[0];
      return best && best[1] >= 0.3 ? best[0] : w; // nothing fits: answer in their own words ("Other")
    });
    out[q.question] = [...new Set(picks)].join(', ');
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [answersFile, logFile] = process.argv.slice(2);
  const answers = answersFile ? JSON.parse(readFileSync(answersFile, 'utf8')) : {};
  const log = (x) => { if (logFile) appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...x }) + '\n'); };
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  const TOOL = {
    name: 'answer',
    description: 'Answers permission prompts for a benchmark run: allows every tool, and answers AskUserQuestion with the scenario answers.',
    inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name'] },
  };
  createInterface({ input: process.stdin }).on('line', (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.id === undefined) return; // notifications
    if (m.method === 'initialize') return send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'answerer', version: '1.0.0' } } });
    if (m.method === 'tools/list') return send({ id: m.id, result: { tools: [TOOL] } });
    if (m.method === 'tools/call') {
      const { tool_name, input = {} } = m.params?.arguments || {};
      let updatedInput = input;
      if (tool_name === 'AskUserQuestion') {
        const given = answer(input, answers);
        updatedInput = { ...input, answers: given };
        log({ kind: 'question', questions: input.questions, answers: given });
      } else log({ kind: 'allow', tool: tool_name });
      return send({ id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ behavior: 'allow', updatedInput }) }] } });
    }
    if (m.method === 'ping') return send({ id: m.id, result: {} });
    send({ id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } });
  });
}
