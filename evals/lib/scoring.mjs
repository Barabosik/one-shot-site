// The benchmark's arithmetic: read what the skill's checks report, merge the findings, and turn them into one
// 0-100 score. No browser and no files here, so test/score.test.mjs can run it offline.

// What each part of the score is worth. Findings cost points inside their part only, so one bad area can't
// sink the whole score, and every part shows on the card.
export const WEIGHTS = { access: 25, layout: 20, launch: 20, motion: 15, craft: 10, speed: 10 };
export const LABELS = {
  access: 'Accessibility', layout: 'Layout', launch: 'Launch checks', motion: 'Motion', craft: 'Craft (copy and code tells)', speed: 'Speed',
};
export const COST = { fail: 5, warn: 1 };

// Speed is measured, not counted: full points at or under `good`, none at or over `bad`, a straight line between.
export const METRICS = {
  headline: { points: 3, good: 0.8, bad: 2.5, unit: 's', label: 'Headline readable after first paint' },
  layoutShift: { points: 3, good: 0.02, bad: 0.25, unit: '', label: 'Layout shift (load and scroll)' },
  jsKB: { points: 2, good: 150, bad: 500, unit: 'KB', label: 'JavaScript, first visit (gzipped)' },
  weightKB: { points: 2, good: 1000, bad: 3000, unit: 'KB', label: 'First visit, all bytes' },
};

// Findings these metrics already score; counting them again would charge twice. Lighthouse runs only where it is
// installed, so its findings are shown but never scored (the score must not depend on what is installed).
const MEASURED = new Set(['slow-headline', 'layout-shift', 'budget', 'lighthouse']);

// Every rule the skill's scripts report, by part. test/score.test.mjs fails when a script gains a rule that is
// not listed here, so the score never quietly ignores a new check.
const PARTS = {
  access: ['contrast', 'alt', 'img-no-alt', 'link-name', 'button-name', 'label', 'lang', 'keyboard', 'focus-ring', 'focus-hidden',
    'focus', 'outline-none', 'tap-target', 'tiny-text', 'small-body', 'small-text', 'skip-link', 'landmarks', 'outside-main', 'headings', 'h1', 'no-zoom', 'viewport',
    'translate-name', 'form-field'],
  layout: ['overflow-x', 'headline-overflow', 'long-headline', 'edge', 'measure', 'wide-empty', 'never-shown', 'covered', 'collide', 'spill', 'on-picture', 'fake-bold', 'broken-image',
    'font', 'fonts', 'over-media', 'same-variant', 'img-size', 'vh-height', 'svg-viewbox', 'hero-void', 'margins', 'untitled', 'first-h1', 'blank', 'block-in-p',
    'under-bar', 'action-out-of-reach', 'thin-section', 'sparse-screen'],
  motion: ['reduced-motion', 'slow-entrance', 'reduced-motion-hidden', 'reduced-loops', 'reduced-moves', 'forever', 'offscreen-loop', 'janky',
    'transition-all', 'scale-zero', 'ease-in', 'bounce', 'hover-guard', 'scroll-listener'],
  launch: ['title', 'description', 'canonical', 'social-preview', 'icon', 'theme-color', 'json-ld', 'site-file', 'placeholder', 'address',
    'broken-link', 'broken-anchor', 'dead-link', 'external-link', '404', 'sitemap', 'local-data', 'event-data', 'hreflang', 'impressum',
    'privacy-page', 'photo-credit', 'image-weight', 'video-weight', 'third-party', 'request', 'script-error', 'browser-blocked',
    'source-maps', 'charset', 'pdf-menu', 'placeholder-img', 'hotlinked-font', 'blank-no-rel', 'lighthouse', 'made-up-address'],
  craft: ['filler-words', 'ai-words', 'not-just', 'ing-tail', 'connectors', 'dashes', 'exclamations', 'chat-leftover', 'vague-action',
    'title-case', 'bold-labels', 'bold', 'gradient-text', 'eyebrow', 'numbered-labels', 'emoji-ui', 'inline-style-color',
    'overused-font', 'ai-violet', 'console-log', 'selection', 'kicker', 'cream-accent', 'glow', 'heavy-shadow', 'side-stripe', 'nested-boxes', 'flat-type',
    'cold-warm', 'tinted-ground', 'slashed-zero', 'repeated-line', 'no-pictures', 'few-pictures', 'nothing-to-try'],
};
export const RULES = new Map(Object.entries(PARTS).flatMap(([part, rules]) => rules.map((r) => [r, part])));
RULES.set('slow-headline', 'speed').set('layout-shift', 'speed').set('budget', 'speed');
const BY_TOOL = { lint: 'craft', look: 'layout', 'look-dark': 'layout', film: 'motion', 'film-reduced': 'motion', audit: 'launch' };

export const bare = (rule) => String(rule).replace(/^lint:/, '');
export function partOf(rule, tool) {
  const r = bare(rule);
  if (r.startsWith('axe:')) return 'access';
  return RULES.get(r) || BY_TOOL[tool] || 'launch';
}

// audit.mjs writes markdown only: "# Audit: Ready to ship." then "## Fix" / "## Consider" / "## Notes" with lines
// "- [rule] text  (where)  @ at". Turns it back into findings, the verdict and the measured notes.
export function parseAudit(md) {
  const out = { verdict: null, ready: false, findings: [], notes: [], weight: {}, axe: null, lighthouse: {} };
  const head = md.match(/^# Audit: (.+)$/m);
  if (head) { out.verdict = head[1].trim(); out.ready = /^Ready to ship/.test(out.verdict); }
  let section = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^## (Fix|Consider|Notes)\s*$/);
    if (h) { section = h[1]; continue; }
    if (!line.startsWith('- ') || !section) continue;
    if (section === 'Notes') { out.notes.push(line.slice(2)); continue; }
    const m = line.match(/^- \[([^\]]+)\] (.*)$/);
    if (!m) continue;
    let rest = m[2], at = '', where = '';
    const atIx = rest.lastIndexOf('  @ ');
    if (atIx >= 0) { at = rest.slice(atIx + 4); rest = rest.slice(0, atIx); }
    const w = rest.match(/^(.*)  \((.*)\)$/);
    if (w) { rest = w[1]; where = w[2]; }
    out.findings.push({ level: section === 'Fix' ? 'fail' : 'warn', rule: m[1], text: rest, where, at });
  }
  return readNotes(out);
}

// What the notes measured: first-visit weight, axe-core, Lighthouse.
function readNotes(out) {
  for (const n of out.notes) {
    const w = n.match(/^(\/\S*): first visit (\d+) KB \(JS (\d+) KB, CSS (\d+) KB, fonts (\d+) KB gzipped\)/);
    if (w && !out.weight[w[1]]) out.weight[w[1]] = { bytesKB: +w[2], jsKB: +w[3], cssKB: +w[4], fontsKB: +w[5] };
    const ax = n.match(/^axe-core on (\S+): (no violations|(\d+) rules? broken)/);
    if (ax) out.axe = (out.axe || 0) + (ax[3] ? +ax[3] : 0);
    const lh = n.match(/^Lighthouse (mobile|desktop) .*?: (.+)$/);
    if (lh) out.lighthouse[lh[1]] = Object.fromEntries(lh[2].split(', ').map((s) => s.match(/^(.+) (\d+)$/)).filter(Boolean).map((x) => [x[1], +x[2]]));
  }
  out.axeRan = out.notes.some((n) => /^axe-core on /.test(n));
  if (!out.axeRan) out.axe = null;
  return out;
}

// audit.json (audit.mjs writes it next to audit.md): the same findings, and the weights to the byte.
export function readAuditJson(j) {
  const kb = (n) => Math.round((n / 1024) * 10) / 10;
  const out = {
    verdict: j.verdict, ready: /^Ready to ship/.test(j.verdict || ''), notes: j.notes || [], lighthouse: {}, axe: null,
    findings: (j.findings || []).map((f) => ({ level: f.level, rule: f.rule, text: f.text, where: f.where || '', at: f.at || '' })),
    weight: Object.fromEntries(Object.entries(j.firstLoad || {}).map(([p, b]) => [p, { bytesKB: kb(b.bytes), jsKB: kb(b.js), cssKB: kb(b.css), fontsKB: kb(b.fonts) }])),
  };
  return readNotes(out);
}

// The same fault seen by two tools (look and audit both measure contrast; audit repeats lint) counts once. Text
// is part of the key; "where" too, unless it is only a file name (the copy checks name the file in lint and the
// page in audit, for the same words).
export function findingKey(f) {
  const where = /^[\w./-]+\.(html|css|js|mjs|svg)$/.test(f.where || '') ? '' : (f.where || '');
  return `${bare(f.rule)}|${where}|${f.text}`;
}

export function merge(byTool) {
  const seen = new Map();
  for (const [tool, list] of Object.entries(byTool)) {
    for (const f of list || []) {
      const k = findingKey(f);
      const had = seen.get(k);
      if (had) {
        if (!had.tools.includes(tool)) had.tools.push(tool);
        if (f.level === 'fail') had.level = 'fail';
        continue;
      }
      seen.set(k, { level: f.level, rule: bare(f.rule), text: f.text, where: f.where || '', at: f.at || '', tools: [tool], part: partOf(f.rule, tool) });
    }
  }
  return [...seen.values()];
}

const slope = (v, { good, bad, points }) => {
  if (v === null || v === undefined || Number.isNaN(v)) return 0;
  if (v <= good) return points;
  if (v >= bad) return 0;
  return points * (1 - (v - good) / (bad - good));
};

// findings: merged list. metrics: { headline, layoutShift, jsKB, weightKB } (null = measured but never happened,
// undefined = not measured). Returns the score and how it came about.
export function score(findings, metrics = {}) {
  const parts = {};
  for (const [part, weight] of Object.entries(WEIGHTS)) if (part !== 'speed') parts[part] = { weight, lost: 0, fails: 0, warns: 0 };
  for (const f of findings) {
    if (MEASURED.has(f.rule)) continue;
    const p = parts[f.part] || parts.launch;
    p.lost += COST[f.level] || 0;
    p[f.level === 'fail' ? 'fails' : 'warns']++;
  }
  for (const p of Object.values(parts)) { p.lost = Math.min(p.weight, p.lost); p.points = p.weight - p.lost; }
  const speed = { weight: WEIGHTS.speed, points: 0, metrics: {} };
  for (const [k, m] of Object.entries(METRICS)) {
    const measured = metrics[k] !== undefined;
    const pts = measured ? slope(metrics[k], m) : m.points; // not measured: not held against the site, but flagged
    speed.metrics[k] = { value: measured ? metrics[k] : undefined, points: Math.round(pts * 100) / 100, of: m.points, measured };
    speed.points += pts;
  }
  speed.points = Math.round(speed.points * 100) / 100;
  speed.lost = Math.round((speed.weight - speed.points) * 100) / 100;
  parts.speed = speed;
  const total = Object.values(parts).reduce((s, p) => s + p.points, 0);
  return { score: Math.round(total * 10) / 10, parts };
}

// Spread of repeated numbers: mean, min, max, standard deviation.
export function spread(values) {
  const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (!v.length) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, v.length - 1));
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n: v.length, mean: r(mean), min: r(Math.min(...v)), max: r(Math.max(...v)), sd: r(sd) };
}

const fmt = (v, unit) => (v === undefined ? 'not measured' : v === null ? 'never' : `${typeof v === 'number' ? Math.round(v * 1000) / 1000 : v}${unit ? ' ' + unit : ''}`);

// The score card as markdown.
export function card(r) {
  const lines = [`# Score: ${r.name}`, '', `**${r.score} / 100**${r.complete ? '' : ' (partial: ' + r.missing.join(', ') + ')'}`, ''];
  lines.push(`Target: \`${r.target}\` · skill: \`${r.skillDir}\` · ${r.date}`, '');
  lines.push('| Part | Points | Fails | Warns |', '|---|---|---|---|');
  for (const [k, p] of Object.entries(r.parts)) lines.push(`| ${LABELS[k]} | ${Math.round(p.points * 10) / 10} / ${p.weight} | ${p.fails ?? ''} | ${p.warns ?? ''} |`);
  lines.push('', '## Measured', '', '| | Value | Points |', '|---|---|---|');
  for (const [k, m] of Object.entries(r.parts.speed.metrics)) lines.push(`| ${METRICS[k].label} | ${fmt(m.value, METRICS[k].unit)} | ${m.points} / ${m.of} |`);
  lines.push(`| Contrast faults | ${r.contrast} | (in accessibility) |`);
  lines.push(`| axe-core violations | ${r.axe === undefined ? 'not run' : r.axe} | (in accessibility) |`);
  for (const [preset, s] of Object.entries(r.lighthouse || {})) lines.push(`| Lighthouse ${preset} | ${Object.entries(s).map(([t, v]) => `${t} ${v}`).join(', ')} | not scored |`);
  lines.push('', '## Per tool', '', '| Tool | Exit | Fails | Warns | Time |', '|---|---|---|---|---|');
  for (const [t, x] of Object.entries(r.tools)) lines.push(`| ${t} | ${x.ran ? x.exit : 'skipped'} | ${x.ran ? x.fails + (x.allowed ? ` (+${x.allowed} allowed)` : '') : ''} | ${x.ran ? x.warns : ''} | ${x.ran ? x.seconds + ' s' : x.why || ''} |`);
  if (r.audit) lines.push('', `Audit: **${r.audit.verdict}**${r.audit.draft ? ' (--draft)' : ''}`);
  if (r.firstScreen) lines.push('', `First screen (1440 px): ${r.firstScreen.pattern}${r.firstScreen.visual ? `, biggest picture a ${r.firstScreen.visual.tag} of ${r.firstScreen.visual.w}×${r.firstScreen.visual.h}` : ''}`);
  const shown = r.findings.filter((f) => f.level === 'fail').concat(r.findings.filter((f) => f.level === 'warn'));
  if (shown.length) {
    lines.push('', '## Findings (each counted once)', '');
    for (const f of shown) lines.push(`- ${f.level === 'fail' ? '**fail**' : 'warn'} [${f.rule}] ${f.text}${f.where ? ` (${f.where})` : ''}${f.at ? ` @ ${f.at}` : ''} · ${f.tools.join('+')}`);
  }
  if (r.sheet) lines.push('', `Contact sheet: ${r.sheet}`);
  if (r.notes?.length) lines.push('', '## Notes', '', ...r.notes.map((n) => `- ${n}`));
  return lines.join('\n') + '\n';
}
