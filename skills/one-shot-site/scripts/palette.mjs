#!/usr/bin/env node
// palette: one brand colour in, a full contrast-checked colour set out, as CSS for src/tokens.css.
//
//   node palette.mjs --brand "#d9480f" [--mood warm] [--mode light|dark] [--strategy quiet|committed|drenched] [--ground warm]
//   node palette.mjs --logo public/logo.svg …     take the brand colour from a logo (SVG, PNG, JPG, WebP)
//   node palette.mjs --brand "#2f6f4e,#c2410c,#1d4ed8" --sheet .one-shot/palettes   compare three colours, as a picture
//   node palette.mjs --brand "#d9480f" --sheet .one-shot/palettes                   one colour, three looks: quiet, committed, quiet dark
//
// Strategies: quiet = near-white/near-black ground, colour only on actions and accents;
// committed = the ground itself carries a tint; drenched = the colour is the ground.
// --ground sets the ground's own tone, apart from the accent: warm (paper, sand), cool (stone, snow),
// neutral (barely any tint), brand (a whisper of the brand's own hue), or any colour ("#efe6d8", "#16264a"), used
// exactly as given: light or dark then follows that colour, and only the text colours move to pass.
// --mood: the look they picked (quiet, bold, warm, night, editorial, playful). Quiet starts on warm white, Warm and
// Editorial on cream (the committed strategy), unless --ground or --strategy say otherwise. Without a mood that
// does this, the ground is a tint of the brand colour, as --ground brand.
// Every text pair is pushed until it passes WCAG AA (4.5:1), so no pairing it prints can fail.
// Run in the site's folder, it also writes the colours into public/404.html's own :root (hosts serve that page as
// it is, without the site's CSS). A --mode other than the 404's own (the theme addon's dark set) leaves it alone.
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { args, isMain, stopOnError, usage } from './lib/cli.mjs';

// ---------- colour math: sRGB <-> OKLab/OKLCH ----------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
export function rgbToOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function oklchToLinear([L, C, H]) {
  const A = C * Math.cos((H * Math.PI) / 180), B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (c) => oklchToLinear(c).every((v) => v >= -0.0001 && v <= 1.0001);
// keep lightness and hue, give up chroma until the colour exists on a normal screen
function fit([L, C, H]) {
  L = Math.min(1, Math.max(0, L));
  let lo = 0, hi = C;
  if (inGamut([L, C, H])) return [L, C, H];
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut([L, mid, H])) lo = mid; else hi = mid; }
  return [L, lo, H];
}
const toRgb = (c) => oklchToLinear(fit(c)).map((v) => Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))));
export const hex = (c) => '#' + toRgb(c).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const css = (c) => { const [L, C, H] = fit(c); return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`; };
const luminance = (c) => { const [r, g, b] = toRgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// move lightness (darker or lighter) until the colour reads on every background given
function push(c, backs, need, dir) {
  let [L, C, H] = c;
  for (let i = 0; i < 200 && backs.some((b) => contrast([L, C, H], b) < need); i++) L += dir * 0.005;
  return fit([L, C, H]);
}

const GROUNDS = { warm: [80, 0.55], cool: [235, 0.5], neutral: [null, 0.15] }; // hue, chroma factor

// The calm moods start on warm white or cream: the brand colour goes on the actions, and the ground takes its hue
// only when someone asks for it (--ground brand). A ground or strategy given by hand wins.
export const MOODS = ['quiet', 'bold', 'warm', 'night', 'editorial', 'playful'];
const MOOD_START = { quiet: { ground: 'warm', strategy: 'quiet' }, warm: { ground: 'warm', strategy: 'committed' }, editorial: { ground: 'warm', strategy: 'committed' } };
export function moodDefaults(mood, { ground, strategy } = {}) {
  const d = MOOD_START[mood] || {};
  return { ground: ground ?? d.ground, strategy: strategy ?? d.strategy };
}

export function palette(brand, { mode = 'light', strategy = 'quiet', ground: tone } = {}) {
  const [bL, bC, bH] = brand;
  // a ground given as a colour ("the van's navy") is used as it is, in every strategy (drenched: drenched in that
  // colour); light or dark then follows that colour
  const exact = typeof tone === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(tone) ? rgbToOklch(hexToRgb(tone)) : null;
  const dark = exact ? exact[0] < 0.6 : mode === 'dark';
  // the ground's hue and how much colour it may carry
  let gH = bH, gC = bC, gK = 1;
  if (GROUNDS[tone]) { gH = GROUNDS[tone][0] ?? bH; gK = GROUNDS[tone][1]; gC = 0.12; }
  else if (typeof tone === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(tone)) { const t = rgbToOklch(hexToRgb(tone)); gH = t[2]; gC = t[1]; }
  const tint = (c) => Math.min(c * gK, gC);
  let ground, surface, ink;
  if (exact) {
    ground = fit(exact);
    surface = fit([ground[0] + (dark ? 0.045 : -0.035), ground[1] * 1.1, gH]);
    // ink close to white or black in the brand's hue (the ground's would tint the text), pushed until body text passes AAA
    ink = push(fit(dark ? [0.94, Math.min(0.015, bC), bH] : [0.2, Math.min(0.02, bC), bH]), [ground, surface], 7, dark ? 1 : -1);
  } else if (strategy === 'drenched') {
    ground = fit(dark ? [Math.min(bL, 0.32), bC * 0.75, bH] : [Math.max(bL, 0.86), bC * 0.55, bH]);
    surface = fit([ground[0] + (dark ? 0.05 : -0.05), ground[1], bH]);
    ink = fit(dark ? [0.96, Math.min(0.02, bC), bH] : [0.18, Math.min(0.04, bC), bH]);
    gH = bH;
  } else {
    const c = strategy === 'committed' ? 0.035 : 0.008;
    ground = fit(dark ? [0.17, tint(c * 1.2), gH] : [strategy === 'committed' ? 0.95 : 0.985, tint(c), gH]);
    surface = fit([ground[0] + (dark ? 0.045 : -0.035), ground[1] * 1.3, gH]);
    ink = fit(dark ? [0.93, tint(0.012), gH] : [0.2, tint(0.015), gH]);
  }
  const backs = [ground, surface];
  const muted = push(fit([dark ? 0.74 : 0.47, exact ? Math.min(0.02, bC) : tint(0.02), exact ? bH : gH]), backs, 4.6, dark ? 0.6 : -0.6);
  let accent = fit(brand);
  if (strategy === 'drenched') accent = fit(dark ? [0.86, Math.min(bC, 0.14), bH] : [0.24, Math.min(bC, 0.1), bH]); // on a coloured ground, actions use ink-like weight
  const light = fit([0.99, 0.005, bH]);
  const darkInk = fit([0.16, Math.min(0.02, bC), bH]);
  let accentInk = contrast(light, accent) >= contrast(darkInk, accent) ? light : darkInk;
  if (contrast(accentInk, accent) < 4.5) accent = push(accent, [accentInk], 4.5, accentInk === light ? -1 : 1);
  const accentText = strategy === 'drenched' ? push(accent, backs, 4.5, dark ? 1 : -1) : push(fit(brand), backs, 4.5, dark ? 1 : -1);
  return { ground, surface, ink, muted, accent, accentInk, accentText, line: ink, dark };
}

// the palette as CSS values by token name, for scripts that write tokens.css themselves
export function tokens(p) {
  return {
    ground: css(p.ground), surface: css(p.surface), ink: css(p.ink), muted: css(p.muted),
    line: css(p.ink).replace(')', ' / 0.14)'), accent: css(p.accent), 'accent-ink': css(p.accentInk), 'accent-text': css(p.accentText),
  };
}

function block(p, label) {
  const row = (name, c, note) => `  --${name}: ${css(c)};${' '.repeat(Math.max(1, 15 - name.length))}/* ${hex(c)}${note ? ', ' + note : ''} */`;
  const cr = (a, b) => contrast(a, b).toFixed(1) + ':1';
  return [
    `/* ${label} */`,
    ':root {',
    row('ground', p.ground, 'page background'),
    row('surface', p.surface, 'bands and cards'),
    row('ink', p.ink, `text, ${cr(p.ink, p.ground)}`),
    row('muted', p.muted, `quiet text, ${cr(p.muted, p.ground)}`),
    `  --line: ${css(p.ink).replace(')', ' / 0.14)')};`,
    row('accent', p.accent, 'buttons and highlights'),
    row('accent-ink', p.accentInk, `text on accent, ${cr(p.accentInk, p.accent)}`),
    row('accent-text', p.accentText, `links on ground, ${cr(p.accentText, p.ground)}`),
    `  color-scheme: ${p.dark ? 'dark' : 'light'};`,
    '}',
  ].join('\n');
}

// the main colour of a logo: the most common strong colour, ignoring near-whites, near-blacks and greys
async function fromLogo(file) {
  const { launch } = await import('./lib/chrome.mjs');
  const { serve } = await import('./lib/serve.mjs');
  const { dirname, basename } = await import('node:path');
  const s = await serve(dirname(resolve(file)));
  const b = await launch();
  try {
    const p = await b.newPage({ width: 400, height: 400 });
    await p.goto(`${s.url}/${encodeURIComponent(basename(file))}`);
    // through an Image, so SVG works as well as PNG, JPG and WebP
    return await p.eval(`(async () => {
      const img = new Image(); img.src = location.href; await img.decode();
      const x = new OffscreenCanvas(96, 96).getContext('2d');
      x.drawImage(img, 0, 0, 96, 96);
      const d = x.getImageData(0, 0, 96, 96).data, bins = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i+1], d[i+2], d[i+3]];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (a < 200 || mx - mn < 40 || mx < 40 || mn > 225) continue;
        const k = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
      }
      const top = [...bins.values()].sort((p, q) => q.n - p.n)[0];
      if (!top) return null;
      return '#' + [top.r, top.g, top.b].map(v => Math.round(v / top.n).toString(16).padStart(2, '0')).join('');
    })()`);
  } finally { await b.close(); await s.close(); }
}

async function sheet(brands, dir, opts) {
  const { launch } = await import('./lib/chrome.mjs');
  const options = brands.length > 1
    ? brands.map((x) => ({ ...x, mode: opts.mode || 'light', strategy: opts.strategy || 'quiet', ground: opts.ground }))
    : [['quiet', 'light'], ['committed', 'light'], ['quiet', 'dark']].map(([strategy, mode]) => ({ ...brands[0], strategy, mode, ground: opts.ground }));
  const label = (o) => (brands.length > 1 ? o.hex : `${o.strategy}, ${o.mode}`);
  const cards = options.map((o, i) => {
    const p = palette(o.color, o);
    return `<section style="background:${css(p.ground)};color:${css(p.ink)}">
      <b class="tag">${'ABCDEF'[i]} · ${label(o)}</b>
      <h2>A heading that sets the tone</h2>
      <p>Body text sits here at full strength. <a style="color:${css(p.accentText)}">A link looks like this</a>.</p>
      <p style="color:${css(p.muted)}">Quieter text for dates, captions and small print.</p>
      <div class="band" style="background:${css(p.surface)}"><span class="btn" style="background:${css(p.accent)};color:${css(p.accentInk)}">Main button</span><span class="btn ghost" style="border-color:${css(p.ink)}">Second button</span></div>
      <div class="chips">${['ground', 'surface', 'ink', 'muted', 'accent', 'accentText'].map((k) => `<i style="background:${css(p[k])}" title="${k}"></i>`).join('')}</div>
    </section>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;display:grid;grid-template-columns:repeat(${options.length},1fr);font:17px/1.5 system-ui,sans-serif}
    section{padding:40px 36px 40px} .tag{font-size:13px;letter-spacing:.04em;opacity:.8}
    h2{font-size:34px;line-height:1.05;margin:18px 0 14px;letter-spacing:-.02em} p{margin:0 0 12px}
    .band{margin:22px -36px;padding:22px 36px;display:flex;flex-wrap:wrap;gap:12px} .btn{padding:12px 18px;font-weight:600}
    .ghost{border:1.5px solid} .chips{display:flex;gap:8px;margin-top:20px} .chips i{width:34px;height:34px;outline:1px solid #8884}
  </style>${cards}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'palettes.html'), html);
  const b = await launch();
  try {
    const p = await b.newPage({ width: 500 * options.length, height: 400 });
    await p.goto(pathToFileURL(resolve(dir, 'palettes.html')).href);
    const h = await p.eval('document.documentElement.scrollHeight');
    await p.shot(join(dir, 'palettes.jpg'), { quality: 85, clip: { x: 0, y: 0, width: 500 * options.length, height: h } });
  } finally { await b.close(); }
  options.forEach((o, i) => console.log(block(palette(o.color, o), `${'ABCDEF'[i]}: ${label(o)}`) + '\n'));
  console.log(`Picture: ${join(dir, 'palettes.jpg')}`);
}

// run as a command (importing the file only gives the functions)
if (isMain(import.meta.url)) {
  stopOnError();
  const a = args(import.meta.url);
  if (a.help || (!a.brand && !a.logo)) usage(import.meta.url, a.help ? 0 : 2);
  const HEX = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i;
  const stop = (line) => {
    console.error(`${line}\nUsage: node palette.mjs --brand "#d9480f" [--mood quiet|bold|warm|night|editorial|playful] [--mode light|dark] [--strategy quiet|committed|drenched] [--ground warm|cool|neutral|brand|#hex] [--sheet DIR]`);
    process.exit(2);
  };
  // the documented values only: "--strategy loud" printed a "loud" header over the default colours
  const got = (v) => (v === true ? 'nothing' : `"${v}"`);
  if (a.mode !== undefined && !['light', 'dark'].includes(a.mode)) stop(`--mode takes light or dark (got ${got(a.mode)}).`);
  if (a.strategy !== undefined && !['quiet', 'committed', 'drenched'].includes(a.strategy)) stop(`--strategy takes quiet, committed or drenched (got ${got(a.strategy)}).`);
  if (a.mood !== undefined && !MOODS.includes(a.mood)) stop(`--mood takes ${MOODS.join(', ')} (got ${got(a.mood)}).`);
  if (a.ground !== undefined && !GROUNDS[a.ground] && a.ground !== 'brand' && !HEX.test(String(a.ground))) stop(`--ground takes warm, cool, neutral, brand or a colour like "#efe6d8" (got ${got(a.ground)}).`);
  if (a.brand !== undefined) {
    const bad = String(a.brand === true ? '' : a.brand).split(',').map((x) => x.trim()).find((x) => !HEX.test(x));
    if (bad !== undefined) stop(`${bad ? `"${bad}"` : '--brand with nothing after it'} is not a colour. Give it as "#d9480f" (# and six hex digits).`);
  }
  if (a.logo && (a.logo === true || !existsSync(a.logo))) stop(a.logo === true ? 'Give --logo a file: --logo public/logo.svg' : `No file at ${a.logo}.`);
  let brandHex = a.brand;
  if (a.logo) {
    brandHex = await fromLogo(a.logo);
    if (!brandHex) { console.error('No clear colour in that logo (it may be black and white). Pass --brand instead.'); process.exit(2); }
    console.log(`Brand colour from the logo: ${brandHex}\n`);
  }
  const hexes = String(brandHex || '').split(',').map((x) => x.trim()).filter(Boolean);
  const brands = hexes.map((x) => ({ hex: x, color: rgbToOklch(hexToRgb(x)) }));
  const start = moodDefaults(a.mood, { ground: a.ground, strategy: a.strategy });
  const opts = { mode: a.mode || 'light', strategy: start.strategy || 'quiet', ground: start.ground };
  if (a.sheet) await sheet(brands, resolve(a.sheet === true ? '.one-shot/palettes' : a.sheet), { mode: a.mode, strategy: start.strategy, ground: start.ground });
  else {
    const p = palette(brands[0].color, opts);
    console.log(block(p, `${opts.strategy}, ${p.dark ? 'dark' : 'light'}${opts.ground ? `, ${opts.ground} ground` : ''}${a.mood ? ` (${a.mood})` : ''}, from ${hexes[0]}`));
    // the browser bar follows the ground; new-site wrote it from the first palette, so a new ground needs it too
    console.log(`/* and in index.html and public/404.html: <meta name="theme-color" content="${hex(p.ground)}"> */`);
    const note = to404(p, a.mode);
    if (note) console.log(`/* ${note} */`);
  }
}

// The 404 page's own small :root takes the same ground, ink and link colour; it kept the first palette's before.
export function to404(p, mode, file = resolve('public/404.html')) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const root = text.match(/:root\s*\{[^}]*--ground:[^}]*\}/)?.[0];
  if (!root) return null;
  const was = /color-scheme:\s*dark/.test(root) ? 'dark' : 'light';
  if (mode && mode !== was) return `public/404.html stays ${was}: this is the ${mode} set. Give its :root these colours by hand if the site is ${mode} only.`;
  const t = tokens(p);
  let next = root, replaced = 0;
  // its --accent is only its link, so it takes the shade that reads as text (as new-site writes it)
  for (const [k, v] of Object.entries({ ground: t.ground, ink: t.ink, accent: t['accent-text'] })) next = next.replace(new RegExp(`(--${k}:\\s*)oklch\\([^)]*\\)`), (m, at) => { replaced++; return at + v; });
  // a :root edited to other colours (hex) is left as it is: it said "has these colours now" and changed nothing
  if (!replaced) return "public/404.html's :root has no oklch() colours to replace: give it this ground, ink and link colour by hand";
  next = next.replace(/color-scheme:\s*\w+/, `color-scheme: ${p.dark ? 'dark' : 'light'}`);
  if (next === root) return 'public/404.html has these colours already (its own :root)';
  writeFileSync(file, text.replace(root, () => next));
  // each run writes it, a trial one too: the 404 keeps the last run's colours, not the pasted ones
  return 'public/404.html has these colours now (its own :root; another run replaces them, so run the set you paste last)';
}
