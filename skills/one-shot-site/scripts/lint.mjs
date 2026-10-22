#!/usr/bin/env node
// lint: read the site's source (no browser) and flag the habits that make a page look generated or
// break for some visitors. Fast enough to run after every edit.
//
//   node lint.mjs [site-folder] [--json]
//
// Silence a rule on one line with a comment containing "one-shot: allow <rule>", or for the whole site
// by listing it in .one-shot/allow.json (["rule", ...]). Exit code 1 = at least one "fix".
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { args, isMain, report, stopOnError, usage } from './lib/cli.mjs';
import { lintCopy } from './lib/words.mjs';
import { hex as oklchHex } from './palette.mjs';

// [rule, level, file types, pattern, message]
const LINE_RULES = [
  ['transition-all', 'fail', 'css js html', /transition(-property)?\s*:\s*all\b|transition:\s*['"]?all\b/, 'Name the properties you animate; "all" also animates layout and colour changes you did not plan.'],
  ['scale-zero', 'warn', 'css js', /scale\(\s*0\s*\)|scale:\s*0[;\s,}]/, 'Nothing in the real world appears from nothing; start at 0.9 to 0.96 with a fade.'],
  ['ease-in', 'warn', 'css js', /(?<![-\w])ease-in(?!-out)(?![-\w])|power\d\.in\b|"power\d\.in"|'power\d\.in'/, 'Ease-in starts slow and feels laggy on things people trigger; use ease-out.'],
  ['bounce', 'warn', 'css js', /\bbounce\b|\belastic\b|back\.out|back\.inOut/, 'Bouncy easing reads as a toy; keep it for a playful look only.'],
  ['gradient-text', 'warn', 'css html', /background-clip\s*:\s*text/, 'Gradient-filled text is the most common generated-page tell. Solid ink, colour in one place.'],
  ['vh-height', 'warn', 'css', /(?<![sdl])\b100vh\b/, '100vh jumps under phone toolbars; use 100svh (or dvh) with a vh fallback line above it.'],
  ['no-zoom', 'fail', 'html', /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/, 'Never block pinch zoom; people with low vision need it.'],
  ['outline-none', 'warn', 'css', /outline\s*:\s*(none|0)\s*[;}]/, 'Removing the outline hides keyboard focus. Fine only if a :focus-visible style replaces it.'],
  ['eyebrow', 'warn', 'css html', /class="[^"]*\b(eyebrow|kicker|overline|pretitle|tagline-pill)\b|\.(eyebrow|kicker|overline|pretitle)\b/, 'Small labels above every heading are template furniture. Let the heading speak.'],
  ['numbered-labels', 'warn', 'html', />\s*0[1-9]\s*(\/|—|–|\.|-)\s*[A-Za-z]/, '01 / 02 / 03 section numbers are a template tell unless the content really is a sequence.'],
  ['emoji-ui', 'warn', 'html', /<(h[1-6]|button|a)\b[^>]*>[^<]*\p{Extended_Pictographic}/u, 'Emoji in headings, buttons or links look cheap. Use words, or a proper icon.'],
  ['placeholder-img', 'fail', 'html css js', /placehold\.co|via\.placeholder|placekitten|picsum\.photos|unsplash\.it|dummyimage/, 'Placeholder image service. Use the real picture, or design the space without one.'],
  ['hotlinked-font', 'warn', 'html css', /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit/, 'Fonts load from another server. Self-host the woff2 files in public/fonts (faster, private).'],
  ['console-log', 'warn', 'js', /console\.log\(/, 'Leftover console.log.'],
  ['scroll-listener', 'warn', 'js', /addEventListener\(\s*['"](scroll|wheel|touchmove)['"](?!.*passive)/, 'Scroll/touch listeners should be { passive: true } so scrolling never waits for your code.'],
  ['svg-viewbox', 'warn', 'html', /<svg\b(?![^>]*\bviewBox=)(?![^>]*aria-hidden="true"[^>]*\bwidth=)(?![^>]*\bwidth="0")[^>]*>/, 'An <svg> without viewBox does not scale with its box and drifts out of place on other screen sizes.'],
  ['img-no-alt', 'fail', 'html', /<img\b(?![^>]*\balt=)[^>]*>/, 'Every image needs alt: describe it, or alt="" when it is decoration.'],
  ['dead-link', 'warn', 'html', /href="(#|javascript:[^"]*)?"/, 'A link that goes nowhere. Link somewhere real or make it a button.'],
  ['blank-no-rel', 'warn', 'html', /target="_blank"(?![^>]*rel=)/, 'Links that open a new tab should say so and carry rel="noopener".'],
  ['inline-style-color', 'warn', 'html', /style="[^"]*(color|background)\s*:\s*#[0-9a-f]{3,8}/i, 'Hard-coded colour in markup. Use a token from tokens.css so the palette stays in one place.'],
  ['overused-font', 'warn', 'css html', /(?:font-family|--font[\w-]*)\s*:[^;]*\b(Inter|Roboto|Poppins|Montserrat|Open Sans)\b/, 'One of the faces on a thousand pages. As the only face it makes the page look like all the others; give the headlines a face from the mood\'s systems (looks.md), or keep it on purpose.'],
  ['slashed-zero', 'warn', 'css html', /font-variant-numeric\s*:[^;]*slashed-zero|font-feature-settings\s*:[^;]*['"]zero['"]|--font-(?:text|body|display|heading|head|base|sans|serif|ui)\s*:[^;]*\b(Atkinson Hyperlegible(?: Next| Mono)?|B612 Mono|JetBrains Mono|Space Mono|IBM Plex Mono|Red Hat Mono|Fira (?:Code|Mono)|Source Code Pro|Roboto Mono|DM Mono|Ubuntu Mono|Martian Mono|Geist Mono)\b/, 'A zero with a slash or a dot reads as code, not as a time or a price. Set the hours, prices and phone numbers in a text face with a plain zero (not a mono face or Atkinson Hyperlegible), without slashed-zero; a mono face belongs on --font-mono, for code.'],
  ['ai-violet', 'warn', 'css html', /#(8b5cf6|7c3aed|a855f7|6366f1|4f46e5|9333ea|c084fc|818cf8)\b/i, 'Default violet/indigo, the colour of a thousand generated pages. Choose a colour from the subject.'],
];

const TYPES = { '.css': 'css', '.js': 'js', '.mjs': 'js', '.html': 'html', '.svg': 'html' };
const SKIP = new Set(['node_modules', 'dist', '.git', '.one-shot', '.vite', 'tools', 'public']);

function files(dir, list = []) {
  if (existsSync(join(dir, 'SKILL.md'))) return list; // an agent skill kept in the project, not site code
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f) || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, list);
    else if (TYPES[extname(f)] && !/\.min\./.test(f)) list.push(p);
  }
  return list;
}

const strip = (html) => html
  .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

// addEventListener( … ) up to its matching bracket
function wholeCall(text) {
  const start = text.indexOf('addEventListener(');
  if (start < 0) return text;
  let depth = 0;
  for (let j = start + 16; j < text.length; j++) {
    if (text[j] === '(') depth++;
    else if (text[j] === ')' && --depth === 0) return text.slice(start, j + 1);
  }
  return text.slice(start);
}

// a hidden sprite: an <svg> that holds only <symbol>s (in a <defs> or not) draws nothing itself, so needs no viewBox
function spriteOnly(text) {
  const inner = text.match(/^<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (inner === undefined) return false;
  const rest = inner.replace(/<!--[\s\S]*?-->/g, '').replace(/<symbol\b[\s\S]*?<\/symbol>/g, '').replace(/<\/?defs\b[^>]*>/g, '');
  return /<symbol\b/.test(inner) && !rest.trim();
}

// site-data.js blocks (hours, menu, events, address, open-now) render as lists, tables and <address>, which a <p> can't
// hold: the browser closes the paragraph before the block without a word, and the layout around it breaks.
// [line, block] for each marker inside an open <p>.
const CLOSES_P = /^(address|article|aside|blockquote|details|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hgroup|hr|li|main|menu|nav|ol|p|pre|section|table|ul)$/i;
function blocksInP(src) {
  const found = [];
  let inP = false;
  const text = src.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of text.matchAll(/<!--\s*site:([\w-]+)[^>]*-->|<!--[\s\S]*?-->|<(\/?)([a-z][\w-]*)\b[^>]*>/gi)) {
    if (m[1]) { if (inP && !/^(if|end)$/.test(m[1])) found.push([text.slice(0, m.index).split('\n').length, m[1]]); continue; }
    if (!m[3]) continue; // another comment
    if (m[2]) { if (/^p$/i.test(m[3])) inP = false; continue; }
    if (/^p$/i.test(m[3])) inP = true;
    else if (CLOSES_P.test(m[3])) inP = false;
  }
  return found;
}

// .one-shot/allow.json: ["rule", …]. A broken one names itself, not "Unexpected token".
export function readAllow(file) {
  let list;
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON (${e.message}). It should be a list like ["transition-all"].`); }
  // an object stopped the run with "is not iterable", naming no file; a string allowed each of its letters
  if (!Array.isArray(list) || list.some((r) => typeof r !== 'string')) throw new Error(`${file} should be a list of rule names like ["transition-all"].`);
  return list;
}

const lineAt = (src, i) => src.slice(0, i).split('\n').length;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// The business name where a browser's translate would turn it into words ("Kleiner Kaffee" into "Small coffee"):
// in the header, the footer and the h1, the element holding it, or one around it, carries translate="no".
// names: site.json's name and its token. -> [{ line, text }]
export function untranslatedName(src, names) {
  const found = [];
  for (const m of src.matchAll(/<(header|footer|h1)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
    const part = m[0], where = m[1].toLowerCase();
    // every place the name stands, in order; the first one a translation would reach is reported, once per part
    const spots = names.flatMap((name) => {
      const at = [];
      for (let i = part.indexOf(name); i !== -1; i = part.indexOf(name, i + name.length)) at.push([i, name]);
      return at;
    }).sort((x, y) => x[0] - y[0]);
    for (const [i, name] of spots) {
      const before = part.slice(0, i);
      if (before.lastIndexOf('<') > before.lastIndexOf('>') || before.lastIndexOf('<!--') > before.lastIndexOf('-->')) continue; // an attribute, a comment
      const open = [];
      for (const [, close, tag, attrs] of before.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
        const t = tag.toLowerCase();
        if (VOID.has(t) || attrs.endsWith('/')) continue;
        if (close) { const k = open.map((o) => o.t).lastIndexOf(t); if (k >= 0) open.length = k; } else open.push({ t, no: /\btranslate\s*=\s*["']?no\b/i.test(attrs) });
      }
      if (open.some((o) => o.no)) continue;
      found.push({ line: lineAt(src, m.index + i), text: `The name in the ${where} ${name.startsWith('{{') ? `(${name})` : `"${name}"`} can be translated: a browser that translates the page turns a name like "Kleiner Kaffee" into "Small coffee". Put translate="no" on the element that holds it (<a class="wordmark" translate="no">, <span translate="no">).` });
      break;
    }
  }
  return found;
}

// Form fields a phone fills in, known by their name, id, autocomplete, placeholder, aria-label or label: each gets
// the type and autocomplete that bring up the right keyboard and let autofill work (an email field also
// spellcheck="false", a postcode of digits inputmode="numeric"), and a label a screen reader can say.
// country: site.json's, for the postcode. -> [{ line, text }]
const FIELDS = [
  { what: 'email', re: /e-?mail/i, type: 'email', auto: 'email', spell: true },
  { what: 'phone', re: /\b(tele?phone|phone|telefon|mobile?|handy)|\btel\b/i, type: 'tel', auto: 'tel' },
  { what: 'postcode', re: /post(al)?[-_ ]?code|\bzip\b|\bplz\b/i, auto: 'postal-code', digits: true },
  { what: 'name', re: /\b(full[-_ ]?name|your[-_ ]?name|name|first[-_ ]?name|last[-_ ]?name|surname|vorname|nachname)\b/i, auto: /^(name|given-name|family-name|additional-name|nickname)$/ },
];
const DIGIT_CODES = new Set(['DE', 'AT', 'CH', 'FR', 'IT', 'ES', 'US', 'BE', 'DK', 'NO', 'FI', 'LU']);
export function formFields(src, country = '') {
  const found = [];
  const attr = (tag, k) => (tag.match(new RegExp(`\\s${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')) || []).slice(1).find((v) => v !== undefined);
  const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  for (const m of src.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0], type = (attr(tag, 'type') || 'text').toLowerCase();
    if (/^(hidden|submit|button|reset|checkbox|radio|file|image|range|color)$/.test(type)) continue;
    const id = attr(tag, 'id'), name = attr(tag, 'name') || '';
    if (attr(tag, 'tabindex') === '-1' || /honey|gotcha|bot-?field/i.test(name + ' ' + (attr(tag, 'class') || ''))) continue; // a honeypot
    const before = src.slice(0, m.index);
    const wrap = before.lastIndexOf('<label') > before.lastIndexOf('</label>') ? src.slice(before.lastIndexOf('<label'), src.indexOf('</label>', m.index) + 8) : '';
    const forLabel = id ? (src.match(new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*(["']?)${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1(?=[\\s>])[^>]*>([\\s\\S]*?)</label>`, 'i')) || [])[2] : undefined;
    const said = [name, id, attr(tag, 'autocomplete'), attr(tag, 'placeholder'), attr(tag, 'aria-label'), forLabel && text(forLabel), wrap && text(wrap)].filter(Boolean).join(' ');
    if (/compan|firm|organi[sz]|business|user/i.test(said)) continue;
    const f = FIELDS.find((x) => x.re.test(said));
    if (!f) continue;
    const auto = (attr(tag, 'autocomplete') || '').toLowerCase().split(/\s+/).pop();
    const need = [], why = new Set();
    const and = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0];
    if (f.type && type !== f.type) { need.push(`type="${f.type}"`); why.add('a phone shows the right keyboard'); }
    if (!(f.auto instanceof RegExp ? f.auto.test(auto) : auto === f.auto)) {
      const which = f.auto instanceof RegExp ? (/first|vorname|given/i.test(said) ? 'given-name' : /last|surname|nachname|family/i.test(said) ? 'family-name' : 'name') : f.auto;
      need.push(`autocomplete="${which}"`); why.add('the browser can fill it in');
    }
    if (f.spell && attr(tag, 'spellcheck') !== 'false') { need.push('spellcheck="false"'); why.add('the address is not marked as a typo'); }
    if (f.digits && DIGIT_CODES.has(String(country).toUpperCase()) && attr(tag, 'inputmode') !== 'numeric') { need.push('inputmode="numeric"'); why.add('a phone shows the number keys'); }
    if (forLabel === undefined && !wrap && !attr(tag, 'aria-label') && !attr(tag, 'aria-labelledby')) { need.push('a <label>'); why.add('a screen reader can name it'); }
    if (need.length) found.push({ line: lineAt(src, m.index), text: `The ${f.what} field (${name ? `name="${name}"` : id ? `id="${id}"` : tag.slice(0, 40)}) needs ${and(need)}, so ${and([...why])}.` });
  }
  return found;
}

export function lint(root = '.') {
  root = resolve(root);
  const allowFile = join(root, '.one-shot/allow.json');
  const allow = new Set(existsSync(allowFile) ? readAllow(allowFile) : []);
  const out = [];
  // the business name and country, from site.json when there is one
  let siteFile = {};
  try { siteFile = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8')); } catch {}
  const names = [...new Set(['{{site.name}}', typeof siteFile.name === 'string' && siteFile.name.trim().length > 1 ? siteFile.name.trim() : null].filter(Boolean))];
  let css = '', anyMotion = false, hover = false, hoverGuard = false, reduced = false;

  for (const file of files(root)) {
    const type = TYPES[extname(file)];
    const src = readFileSync(file, 'utf8');
    const rel = relative(root, file).replace(/\\/g, '/');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      for (const [rule, level, types, re, text] of LINE_RULES) {
        if (!types.split(' ').includes(type) || allow.has(rule) || !re.test(line)) continue;
        if (line.includes(`one-shot: allow ${rule}`) || (lines[i - 1] || '').includes(`one-shot: allow ${rule}`)) continue;
        // 100vh followed by 100svh/dvh is the right pattern: the fallback for older browsers
        if (rule === 'vh-height' && /\b100[sdl]vh\b/.test(line.replace(/\b100vh\b/g, '') + (lines[i + 1] || ''))) continue;
        // the options object often sits after a handler several lines long: read the whole call
        if (rule === 'scroll-listener' && /passive/.test(wholeCall(lines.slice(i, i + 60).join('\n')))) continue;
        if (rule === 'svg-viewbox') {
          const after = lines.slice(i, i + 400).join('\n');
          if ([...line.matchAll(new RegExp(re.source, 'g'))].every((m) => spriteOnly(after.slice(m.index)))) continue;
        }
        out.push({ level, rule, text, where: `${rel}:${i + 1}` });
      }
    });
    if (type === 'html' && !allow.has('block-in-p')) {
      for (const [n, name] of blocksInP(src)) {
        out.push({ level: 'fail', rule: 'block-in-p', text: `<!-- site:${name} --> is inside a <p>. The block becomes a list or a table, which a paragraph can't hold, so the browser ends the paragraph before it and the layout around it breaks. Put the marker on its own line, outside the paragraph.`, where: `${rel}:${n}` });
      }
    }
    if (type === 'html' && rel !== 'og.html') { // og.html is only photographed for the link preview
      if (!allow.has('translate-name')) for (const f of untranslatedName(src, names)) out.push({ level: 'warn', rule: 'translate-name', text: f.text, where: `${rel}:${f.line}` });
      if (!allow.has('form-field')) for (const f of formFields(src, siteFile.address?.country)) out.push({ level: 'warn', rule: 'form-field', text: f.text, where: `${rel}:${f.line}` });
    }
    if (type === 'css' || type === 'html') css += src;
    if (/@keyframes|transition\s*:|animation\s*:|gsap\.|\.animate\(/.test(src)) anyMotion = true;
    if (/:hover/.test(src)) hover = true;
    if (/hover:\s*hover/.test(src)) hoverGuard = true;
    if (/prefers-reduced-motion/.test(src)) reduced = true;
    if (type === 'html') for (const f of lintCopy(strip(src))) if (!allow.has(f.rule)) out.push({ ...f, where: rel });
  }

  if (anyMotion && !reduced && !allow.has('reduced-motion')) out.push({ level: 'fail', rule: 'reduced-motion', text: 'Things move, but nothing listens to prefers-reduced-motion. Calm the motion down for people who ask for that.' });
  if (hover && !hoverGuard && !allow.has('hover-guard')) out.push({ level: 'warn', rule: 'hover-guard', text: 'Hover effects without @media (hover: hover): on phones they stick after a tap.' });
  if (!/:focus-visible/.test(css) && !allow.has('focus')) out.push({ level: 'warn', rule: 'focus', text: 'No :focus-visible style. Give keyboard focus a clear ring in the accent colour.' });
  if (!/::selection/.test(css) && !allow.has('selection')) out.push({ level: 'warn', rule: 'selection', text: 'Theme ::selection too; the browser-blue highlight gives away an unfinished page.' });
  const bar = barColour(root);
  if (bar && !allow.has('theme-color')) out.push({ level: 'warn', rule: 'theme-color', text: `The browser bar is ${bar.meta} but the page ground is ${bar.ground}: set <meta name="theme-color"> in index.html (and public/404.html) to ${bar.ground}, so the phone's bar is the page's own colour.`, where: 'index.html' });
  // trim long lists of the same rule
  const per = new Map();
  return out.filter((f) => { const n = (per.get(f.rule) || 0) + 1; per.set(f.rule, n); return n <= 6; });
}

// theme-color against tokens.css's ground. A palette run after new-site changes the ground but not the meta, so the
// two drift. Light (or the only) meta against the first --ground; null when they match or can't be read.
function barColour(root) {
  const tokens = join(root, 'src/tokens.css'), home = join(root, 'index.html');
  if (!existsSync(tokens) || !existsSync(home)) return null;
  const line = readFileSync(tokens, 'utf8').split('\n').find((l) => /^\s*--ground\s*:/.test(l));
  const metas = [...readFileSync(home, 'utf8').matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/gi)].map((m) => m[0]);
  const meta = metas.find((m) => !/media=/.test(m) || /light/.test(m))?.match(/content="(#[0-9a-f]{6})"/i)?.[1]?.toLowerCase();
  if (!line || !meta) return null;
  let ground = line.match(/\/\*\s*(#[0-9a-f]{6})/i)?.[1] || line.match(/:\s*(#[0-9a-f]{6})\b/i)?.[1];
  const ok = line.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/);
  if (!ground && ok) ground = oklchHex([ok[1] / 100, +ok[2], +ok[3]]);
  if (!ground) return null;
  ground = ground.toLowerCase();
  const ch = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return ch(ground).some((v, i) => Math.abs(v - ch(meta)[i]) > 3) ? { meta, ground } : null;
}

if (isMain(import.meta.url)) {
  stopOnError();
  const a = args(import.meta.url);
  if (a.help) usage(import.meta.url, 0);
  const root = resolve(a._[0] || '.');
  readdirSync(root); // a missing folder or a file stops here, in plain words (stopOnError)
  // a folder without a site has nothing to flag, and "Nothing blocking" would read as a pass
  if (!existsSync(join(root, 'index.html')) && !existsSync(join(root, 'src'))) throw new Error(`No site in ${root} (no index.html). Pass the site's folder.`);
  const findings = lint(root);
  if (a.json) console.log(JSON.stringify(findings, null, 2));
  else report('Lint', findings);
  process.exit(findings.some((f) => f.level === 'fail') ? 1 : 0);
}
