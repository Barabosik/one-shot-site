// history: a short list of the looks of the last sites made on this machine, so a new one doesn't repeat them.
// Only looks and paths (fonts, ground, brand colour, mood, first-screen move); it stays on this machine and is
// never sent anywhere.
//
// ~/.one-shot-site/history.json. ONE_SHOT_HISTORY=<file> moves it, ONE_SHOT_HISTORY=off turns it off. Under
// node --test it is off unless ONE_SHOT_HISTORY names a file, so test runs never write to the home folder.
// { "version": 1, "sites": [newest first, at most 24, one per site folder] }, each
// { site, dir, at, mood, move, fonts: [display, text], ground, brand, hue }.
//
// Nothing here throws: a missing or broken file reads as empty, and a write that fails is skipped. A broken file
// is kept as history.json.bak before a new one starts; one that can't be read is left alone.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { hexToRgb, rgbToOklch } from '../palette.mjs';

export const KEEP = 24;
const MOODS = ['quiet', 'bold', 'warm', 'night', 'editorial', 'playful'];
const MOVES = ['type', 'photo', 'split', 'field', 'object', 'rows', 'proof'];
// a hue family: twelve bands of 30° on the OKLCH wheel, named after what sits in them
const HUES = ['rose', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'azure', 'blue', 'violet', 'magenta'];

export function historyFile(env = process.env) {
  const v = String(env.ONE_SHOT_HISTORY ?? '').trim();
  if (/^(off|0|false|no|none)$/i.test(v)) return null;
  if (v) return resolve(v);
  if (env.NODE_TEST_CONTEXT) return null;
  try { return join(homedir(), '.one-shot-site', 'history.json'); } catch { return null; } // no home folder: no history
}

export function readHistory(file = historyFile()) {
  try {
    if (!file || !existsSync(file)) return [];
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(j?.sites) ? j.sites.filter((s) => s && typeof s === 'object' && s.dir) : [];
  } catch { return []; }
}

// "#2f6f62", "oklch(55.7% 0.137 41.9)" or [L, C, H] -> [L, C, H] (L 0..1), or null
export function lch(c) {
  try {
    if (Array.isArray(c)) return c.length >= 3 ? c.map(Number) : null;
    const s = String(c ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return rgbToOklch(hexToRgb(s));
    const m = s.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
    return m ? [m[2] ? +m[1] / 100 : +m[1], +m[3], +m[4]] : null;
  } catch { return null; }
}

// the brand's family: "red", "teal" …, or "neutral" when there is hardly any colour in it
export function hueFamily(c) {
  const v = lch(c);
  if (!v) return null;
  if (v[1] < 0.04) return 'neutral';
  return HUES[Math.floor((((v[2] + 15) % 360) + 360) % 360 / 30)];
}

// the ground as a visitor feels it: "light warm", "dark cool", "light neutral" …
export function groundTone(c) {
  const v = lch(c);
  if (!v) return null;
  const [L, C, H] = v;
  const temp = C < 0.012 ? 'neutral' : H >= 20 && H < 120 ? 'warm' : H >= 150 && H < 300 ? 'cool' : 'neutral';
  return `${L < 0.5 ? 'dark' : 'light'} ${temp}`;
}

// the type system: display and text face, "gloock + figtree"
const system = (e) => (e?.fonts || []).slice(0, 2).map((f) => String(f ?? '').trim().toLowerCase()).filter(Boolean).join(' + ');

// entry (a concept or a new site) against the recent sites, this folder left out -> [{ site, at, same: [...] }].
// Each mood starts from a few type systems, so a face, a move or a cream ground shared with a recent site is normal
// (with the display face alone, seven new sites in ten were warned). A repeat is the same system, the same palette
// (brand hue family and ground tone) and the same first-screen move, all three.
export function repeats(entry, { dir, sites = readHistory() } = {}) {
  const here = dir ? resolve(dir) : null;
  const out = [];
  for (const s of sites.slice(0, KEEP)) {
    if (here && resolve(s.dir) === here) continue;
    const fonts = system(entry) && system(entry) === system(s);
    const hue = entry.hue || hueFamily(entry.brand);
    const tone = groundTone(entry.ground);
    const colours = hue && hue === (s.hue || hueFamily(s.brand)) && tone && tone === groundTone(s.ground);
    const move = entry.move && entry.move === s.move;
    if (fonts && colours && move) out.push({ site: s.site, at: s.at, same: ['fonts', 'colours', 'move'] });
  }
  return out;
}

// "same fonts (Gloock + Figtree), colours and first-screen move as kleiner-kaffee (2026-10-20)"
export function sayRepeat(r, entry) {
  const say = { fonts: entry?.fonts?.length ? `fonts (${entry.fonts.slice(0, 2).join(' + ')})` : 'fonts', move: 'first-screen move' };
  const words = r.same.map((k) => say[k] || k);
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
  return `same ${list} as ${r.site} (${r.at})`;
}

// --- recording a finished site -----------------------------------------------------------------------------------

// "'Calistoga Variable', 'Calistoga', serif" -> "Calistoga"
const family = (v) => (String(v ?? '').split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').replace(/\s+Variable$/i, '') || null;

// the kept idea in the brief ("Idea A · The van (kept)" and its "  move: object" lines), or the concept marked
// recommended in concepts.json
function keptIdea(dir) {
  const brief = join(dir, '.one-shot', 'brief.md');
  if (existsSync(brief)) {
    const lines = readFileSync(brief, 'utf8').replace(/\r/g, '').split('\n');
    const idea = {};
    const i = lines.findIndex((l) => /^\s*Idea [A-F]\b.*\(kept\)/i.test(l));
    if (i >= 0) {
      for (const l of lines.slice(i + 1)) {
        if (/^\s*Idea [A-F]\b/.test(l) || /^\s*```/.test(l)) break;
        const m = l.match(/^\s+(mood|move):\s*(\w+)/i);
        if (m) idea[m[1].toLowerCase()] = m[2].toLowerCase();
      }
    }
    // the look section's "- **Mood:** Night, bent toward folk" (older briefs have no idea blocks)
    const mood = lines.find((l) => /\*\*Mood:\*\*/.test(l))?.match(/\*\*Mood:\*\*\s*(\w+)/)?.[1]?.toLowerCase();
    if (!idea.mood && MOODS.includes(mood)) idea.mood = mood;
    if (idea.move || idea.mood) return idea;
  }
  const file = join(dir, '.one-shot', 'concepts.json');
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    const c = (Array.isArray(j) ? j : j.concepts || []).find((x) => x.recommended || x.kept);
    if (c) return { mood: c.mood, move: c.move };
  }
  return {};
}

// the name a warning can say: the folder's, or its parent's when the folder is only "site", "www" and the like
const siteName = (dir) => (/^(site|www|web|public|app|src|website)$/i.test(basename(dir)) ? basename(dirname(dir)) : basename(dir));

// a site folder -> its entry, read from src/tokens.css and the brief
export function siteEntry(dir) {
  dir = resolve(dir);
  const css = readFileSync(join(dir, 'src', 'tokens.css'), 'utf8');
  const token = (name) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
  const { mood, move } = keptIdea(dir);
  const brand = token('accent');
  return {
    site: siteName(dir), dir, at: new Date().toISOString().slice(0, 10),
    ...(MOODS.includes(mood) && { mood }), ...(MOVES.includes(move) && { move }),
    fonts: [family(token('font-display')), family(token('font-text'))].filter(Boolean),
    ground: token('ground') || null, brand: brand || null, hue: hueFamily(brand),
  };
}

// add (or replace) this folder's entry at the front, keep the newest 24. Returns the entry, or null when the
// history is off or anything went wrong; it never throws, so a broken history can't fail an audit.
export function recordSite(dir, { file = historyFile(), extra = {} } = {}) {
  try {
    if (!file) return null;
    const entry = { ...siteEntry(dir), ...extra };
    // a file that can't be read (locked, no rights) throws here and is left as it is; a broken one is kept aside
    let old = [];
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8');
      try { old = JSON.parse(raw).sites.filter((s) => s && typeof s === 'object' && s.dir); } catch { copyFileSync(file, `${file}.bak`); }
    }
    const sites = [entry, ...old.filter((s) => resolve(s.dir) !== entry.dir)].slice(0, KEEP);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, sites }, null, 2) + '\n');
    try { renameSync(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
    return entry;
  } catch { return null; }
}
