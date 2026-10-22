import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Sameness across a batch: do the sites of different scenarios come out alike? Each site is reduced to a few
// features read from its source (no browser): its fonts, its ground colour, how its footer is built, and how
// often its sections repeat one shape. A batch where every site has the same fonts and the same off-white ground
// is a template, however well each one scores alone.

const strip = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, (m, t) => (t.toLowerCase() === 'svg' ? '<svg></svg>' : ''));

// Font families the site loads: Fontsource imports in its JS and CSS, and @font-face rules. package.json only when
// nothing is imported, since a font installed for a variant and then dropped stays there.
export function fontsOf(pkg, css = '', js = '') {
  const imported = [...`${js}\n${css}`.matchAll(/@fontsource(?:-variable)?\/([a-z0-9-]+)/g)].map((m) => m[1]);
  const deps = Object.keys({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) });
  const fromPkg = imported.length ? [] : deps.map((d) => d.match(/^@fontsource(?:-variable)?\/(.+)$/)?.[1]).filter(Boolean);
  const fromCss = [...css.matchAll(/@font-face\s*{[^}]*font-family:\s*["']?([^;"']+)/g)].map((m) => m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  // "Work Sans Fallback" (a local font with size-adjust, so the swap doesn't shift the page) isn't a family
  return [...new Set([...imported, ...fromPkg, ...fromCss])].filter((f) => !/-fallback$/.test(f)).sort();
}

// "--ground: oklch(98.5% 0.008 92.5)" or a hex -> { l, c, h } (l 0-1). toOklch converts [r, g, b] for hex values.
export function groundOf(tokensCss, toOklch) {
  const v = tokensCss.match(/--ground:\s*([^;]+);/)?.[1]?.trim();
  if (!v) return null;
  const o = v.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (o) return { l: o[2] ? +o[1] / 100 : +o[1], c: +o[3], h: +o[4] };
  const hex = v.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i)?.[1];
  if (hex && toOklch) {
    const full = hex.length === 3 ? [...hex].map((x) => x + x).join('') : hex;
    const [l, c, h] = toOklch(full.match(/../g).map((x) => parseInt(x, 16)));
    return { l, c, h };
  }
  return null;
}

// A ground in words, coarse on purpose: "light warm", "dark neutral", "mid cool"…
export function groundKind(g) {
  if (!g) return 'unknown';
  const tone = g.c < 0.012 ? 'neutral' : g.h >= 30 && g.h < 110 ? 'warm' : g.h >= 110 && g.h < 200 ? 'green' : g.h >= 200 && g.h < 300 ? 'cool' : 'red';
  return `${g.l > 0.85 ? 'light' : g.l < 0.35 ? 'dark' : 'mid'} ${tone}`;
}

// The text inside the element that opens at i (nested tags of the same name counted).
function textAt(html, i) {
  const tag = html.slice(i).match(/^<([a-z0-9]+)/i)[1];
  let depth = 0;
  for (const t of html.slice(i).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi'))) {
    depth += t[1] ? -1 : 1;
    if (!depth) return html.slice(i, i + t.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}{}.]+/gu, '');

// The footer's build: "wordmark" (the site's name set as its own element: a name or mark class, or a big heading),
// "columns" (three or more headings or blocks), "statement" (a big heading that isn't the name: a closing line)
// or "plain". name: the site's name; "{{site.name}}" (filled at build) counts as the name too.
export function footerKind(html, name = '') {
  const f = strip(html).match(/<footer\b[\s\S]*?<\/footer>/i)?.[0];
  if (!f) return 'none';
  const names = [norm(name), '{{site.name}}', '{{name}}'].filter((x) => x.length >= 3);
  const isName = (t) => { const n = norm(t); return n.length >= 3 && names.some((x) => n === x || n.includes(x) || (n.length >= 4 && x.includes(n))); };
  const marks = [...f.matchAll(/<([a-z0-9]+)\b[^>]*class="[^"]*\b(wordmark|footer-name|foot-name|big-name|giant|footer-mark|foot-mark|sign-?off)\b[^>]*>/gi)];
  const heads = [...f.matchAll(/<(h1|h2)\b[^>]*>/gi)];
  if ([...marks, ...heads].some((m) => isName(textAt(f, m.index)))) return 'wordmark';
  if (!name && marks.length) return 'wordmark';
  if (heads.length >= 3) return 'columns';
  if (heads.length) return 'statement';
  const blocks = (f.match(/<(div|ul|section|nav|address|p)\b/gi) || []).length;
  return blocks >= 4 ? 'columns' : 'plain';
}

// The site's name: site.json, else og:site_name, else the title up to its first separator.
export function nameOf(siteJson, html) {
  return siteJson?.name || html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i)?.[1] || (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').split(/\s+[|·–—-]\s+/)[0].trim();
}

// Each <section>'s shape: the order of its content elements, repeats collapsed ("h2 p ul"). Share of sections
// whose shape another section of the same page also has.
const PARTS = /<(h[1-6]|p|ul|ol|dl|table|img|picture|figure|svg|form|blockquote|details|video|canvas|iframe|a\b[^>]*class="[^"]*button)/gi;
export function sectionShapes(html) {
  const main = strip(html).match(/<main\b[\s\S]*?<\/main>/i)?.[0] || strip(html);
  const sections = main.match(/<section\b[\s\S]*?<\/section>/gi) || [];
  const shapes = sections.map((s) => {
    const seq = [...s.matchAll(PARTS)].map((m) => (m[1].toLowerCase().startsWith('a') ? 'button' : m[1].toLowerCase().replace(/^h[3-6]$/, 'h3')));
    return seq.filter((x, i) => x !== seq[i - 1]).slice(0, 4).join(' ');
  });
  const counts = new Map();
  for (const s of shapes) counts.set(s, (counts.get(s) || 0) + 1);
  const repeated = shapes.filter((s) => counts.get(s) > 1).length;
  return { shapes, repeatShare: shapes.length ? Math.round((repeated / shapes.length) * 100) / 100 : 0 };
}

// features: [{ name, fonts, ground, footer, sections: { repeatShare }, firstScreen?, keptLook? }] -> the batch report.
// Sameness 0-100: for each feature, how many sites share its most common value (0 when all differ, 100 when all
// match), averaged with how much sections repeat inside the sites. The first-screen pattern (measured by the
// scorer in a browser, lib/firstscreen.mjs) counts when at least two sites have it.
// A site with keptLook ('a redesign', 'a change request') isn't counted: it keeps the look the business already
// had (SKILL.md: "keep what people know them by"), so its look isn't the skill's own choice. A line names it.
export function sameness(all) {
  const left = all.filter((f) => f.keptLook);
  const features = all.filter((f) => !f.keptLook);
  const n = features.length;
  if (n < 2) return null;
  const top = (values) => {
    const c = new Map();
    for (const v of values) c.set(v, (c.get(v) || 0) + 1);
    const [value, count] = [...c].sort((a, b) => b[1] - a[1])[0];
    return { value, count, share: (count - 1) / (n - 1) };
  };
  const fontCount = new Map();
  for (const f of features) for (const x of new Set(f.fonts)) fontCount.set(x, (fontCount.get(x) || 0) + 1);
  const [font, fontN] = [...fontCount].sort((a, b) => b[1] - a[1])[0] || ['none', 1];
  const ground = top(features.map((f) => groundKind(f.ground)));
  const footer = top(features.map((f) => f.footer));
  const repeat = features.reduce((s, f) => s + (f.sections?.repeatShare || 0), 0) / n;
  const parts = { font: (fontN - 1) / (n - 1), ground: ground.share, footer: footer.share, sections: repeat };
  const lines = [
    `Most shared font: ${font} on ${fontN} of ${n} sites`,
    `Most common ground: ${ground.value} on ${ground.count} of ${n}`,
    `Most common footer: ${footer.value} on ${footer.count} of ${n}`,
    `Sections that share a shape with another section on the same page: ${Math.round(repeat * 100)}% on average`,
  ];
  const measured = features.filter((f) => f.firstScreen);
  if (measured.length >= 2) {
    const c = new Map();
    for (const f of measured) c.set(f.firstScreen, (c.get(f.firstScreen) || 0) + 1);
    const [value, count] = [...c].sort((a, b) => b[1] - a[1])[0];
    parts.firstScreen = (count - 1) / (measured.length - 1);
    lines.push(`Most common first screen: ${value} on ${count} of ${measured.length}`);
  }
  if (left.length) lines.push(`Not counted: ${left.map((f) => `${f.name} (${f.keptLook})`).join(', ')}: ${left.length > 1 ? 'they keep' : 'it keeps'} the look the business already had`);
  const shares = Object.values(parts);
  return {
    value: Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100),
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100)])),
    lines,
    sites: features.map((f) => ({ name: f.name, fonts: f.fonts, ground: groundKind(f.ground), footer: f.footer, repeatShare: f.sections?.repeatShare, firstScreen: f.firstScreen || null })),
    notCounted: left.map((f) => ({ name: f.name, why: f.keptLook })),
  };
}

// A site whose brief says it is a redesign (its heading, or the old site read with redesign.mjs).
export function isRedesign(dir) {
  try { return /^#.*\bredesign\b|redesign\.mjs/im.test(readFileSync(join(dir, '.one-shot', 'brief.md'), 'utf8')); } catch { return false; }
}

// A site folder -> its features. toOklch: palette.mjs's rgbToOklch, for hex grounds.
export function siteFeatures(dir, name, toOklch) {
  const read = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } };
  const css = (existsSync(join(dir, 'src')) ? readdirSync(join(dir, 'src')).filter((f) => f.endsWith('.css')) : []).map((f) => read(join('src', f))).join('\n');
  const js = (existsSync(join(dir, 'src')) ? readdirSync(join(dir, 'src')).filter((f) => /\.m?js$/.test(f)) : []).map((f) => read(join('src', f))).join('\n');
  let pkg = null, siteJson = null;
  try { pkg = JSON.parse(read('package.json')); } catch {}
  try { siteJson = JSON.parse(read('site.json')); } catch {}
  const html = read('index.html');
  return { name, fonts: fontsOf(pkg, css, js), ground: groundOf(read('src/tokens.css'), toOklch), footer: footerKind(html, nameOf(siteJson, html)), sections: sectionShapes(html) };
}
