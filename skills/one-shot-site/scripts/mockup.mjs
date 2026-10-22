#!/usr/bin/env node
// mockup: the person's own first screen, drawn in several looks side by side, for when words aren't enough to
// choose ("warm or bold?", "which colour?"). Their name, their line, their button; nothing else invented.
//
//   node mockup.mjs --name "Kleiner Kaffee" --line "Eight seats on Röstergasse." --action "See the menu"
//        [--brand "#5a7d3a"] [--ground warm] [--moods warm,bold,quiet] [--lang en] [--nav "Menu,Visit"]
//        [--out .one-shot/mockups]
//   node mockup.mjs --name … --brand "#5a7d3a,#b4532a,#2a6fdb" --moods warm     one look in three colours
//   node mockup.mjs --concepts concepts.json [--out .one-shot/mockups]            three ideas, not three skins
//   node mockup.mjs --concepts concepts.json --check                            read it, draw nothing
//
// Moods: quiet, bold, warm, night, editorial, playful (default: all six). Writes mockups.jpg (the sheet to show)
// and one desktop and phone picture per option. --lang is the site's language: the page is marked with it, and
// the menu and the button get its words ("Über uns · Kontakt") unless --nav and --action give their own.
// Two brand colours (green and yellow): one is --brand, the other --ground; the site keeps one accent
// (type-and-colour.md). Quiet starts on warm white, Warm and Editorial on cream, as palette.mjs starts each mood;
// --ground is warm, cool, neutral, brand (a tint of the brand colour) or a colour, as in concepts.json.
//
// --concepts: each concept is a different idea for this client, with its own name, idea line, fonts and one focal
// point (its "bold" line), all in the mood they picked (the same "mood"), and its own words where the idea needs them. Writes
// concepts.jpg. concepts.json:
//   { "client": "Café Lindenblatt", "lang": "de", "line": "…", "action": "…", "nav": ["Kuchen", "Kontakt"],
//     "concepts": [{ "name": "Die Kuchentheke", "idea": "The page is the glass counter: …", "mood": "warm",
//       "brand": "#9c3d1c", "fonts": ["Gloock", "Commissioner"], "move": "rows", "bold": "the cakes are the first screen",
//       "line": "…", "sub": "…", "action": "…", "rows": [["Zwetschgenkuchen", "2,80 €"]], "image": "img/kuchen.jpg",
//       "recommended": true }, …] }
// Moves: type, photo, split, field, object, rows (needs "rows"), proof (needs "proof": [["1987", "the first cake"]]).
// The brief's idea blocks (brief.md, section 3) use these keys, so a block copies straight in: "fonts" may be
// "Gloock, Commissioner", rows and proof may be "1987 | the first cake" lines, and "kept": true means recommended.
// A key it doesn't read is named, in case it's a typo. A concept with the same fonts, colours and move as one of
// the last sites made on this machine is named too (lib/history.mjs).
// Fonts are Fontsource names: display, then text, and a third for the rows alone when they are real code (what a
// command prints, in a mono face). Images are paths from the JSON file's folder. Only photo, split
// and object draw one; without it, photo shows where the photo goes, split leaves a plain field of the ground
// colour, and an object is named in a dashed frame by its "bold" line. The object keeps the picture's own shape
// ("shape": "circle" crops it round). The type move sets the line at poster size; "size": "small" makes it a quiet
// title instead. The field move's ground is the brand colour itself unless "ground" says otherwise. Words, rows
// and proof are theirs: never invent a price, a date or a number.
//
// Fonts come from the Fontsource CDN, so this needs internet; the real site self-hosts them. A concept's face that
// did not load (a wrong name, or offline) is named on the sheet and stops the run. Exit code 2 = bad input.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { args, stopOnError, usage, write } from './lib/cli.mjs';
import { readHistory, repeats, sayRepeat } from './lib/history.mjs';
import { hexToRgb, moodDefaults, palette, rgbToOklch, tokens } from './palette.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const MOODS = {
  quiet: { about: 'calm, lots of space, the work does the talking', fonts: ['@fontsource-variable/gelasio', '@fontsource-variable/rethink-sans'], display: "'Gelasio Variable', serif", text: "'Rethink Sans Variable', sans-serif", pal: moodDefaults('quiet') },
  bold: { about: 'loud and sure: huge type, one strong colour', fonts: ['@fontsource-variable/archivo/wdth.css', '@fontsource-variable/public-sans'], display: "'Archivo Variable', sans-serif", text: "'Public Sans Variable', sans-serif", pal: { strategy: 'committed' } },
  // cream and a book serif or slab are a calm start; the spent look is the trio of an italic word, a terracotta
  // pill and a label over every heading (looks.md, Warm). The brand colour goes on the actions.
  warm: { about: 'friendly and handmade, on cream, rounded corners', fonts: ['@fontsource-variable/bitter', '@fontsource-variable/work-sans'], display: "'Bitter Variable', serif", text: "'Work Sans Variable', sans-serif", pal: moodDefaults('warm') },
  night: { about: 'dark and deep, light as the material', fonts: ['@fontsource-variable/sora'], display: "'Sora Variable', sans-serif", text: "'Sora Variable', sans-serif", pal: { strategy: 'quiet', mode: 'dark' } },
  editorial: { about: 'like a good magazine: the text is the design', fonts: ['@fontsource-variable/piazzolla'], display: "'Piazzolla Variable', serif", text: "'Piazzolla Variable', serif", pal: moodDefaults('editorial') },
  playful: { about: 'bright and bouncy, things you want to poke', fonts: ['@fontsource/bagel-fat-one', '@fontsource-variable/nunito'], display: "'Bagel Fat One', sans-serif", text: "'Nunito Variable', sans-serif", pal: { strategy: 'committed' } },
};
// the menu and the button in the site's language, until the person's own words replace them
const WORDS = {
  en: { nav: ['About', 'Contact'], action: 'Get in touch' },
  de: { nav: ['Über uns', 'Kontakt'], action: 'Kontakt aufnehmen' },
  fr: { nav: ['À propos', 'Contact'], action: 'Nous écrire' },
  nl: { nav: ['Over ons', 'Contact'], action: 'Neem contact op' },
  es: { nav: ['Nosotros', 'Contacto'], action: 'Escríbenos' },
  it: { nav: ['Chi siamo', 'Contatti'], action: 'Scrivici' },
};
const wordsFor = (lang) => WORDS[String(lang || 'en').toLowerCase().split('-')[0]];
const GROUND = /^(warm|cool|neutral|brand|#[0-9a-f]{6})$/i;

// --- concepts: three ideas for this client, each with its own words, colour, type and focal point --------------

// the move decides the first screen; the patterns are layout.md's
const MOVES = {
  type: 'the headline at poster size is the first screen',
  photo: 'one of their photos fills the screen, the words on a band',
  split: 'words on one side, the picture on the other',
  field: 'their colour is the whole ground, the words set huge on it',
  object: 'one thing large in the middle, the words around it',
  rows: 'their list (menu, prices, dates) is the first screen, set big',
  proof: 'a short claim with the proof right under it, in big numbers',
};
// the mood decides the hand: weight and case of the headline, the button, the corners
const SKIN = {
  quiet: 'h1{font-weight:400;letter-spacing:-.02em}.btn{color:var(--accent-text);font-weight:600;padding:.3rem 0;border-bottom:1px solid currentColor}.btn::after{content:" →"}',
  bold: 'h1{font-weight:850;font-stretch:75%;text-transform:uppercase;letter-spacing:-.01em;line-height:.88}.btn{background:var(--accent);color:var(--accent-ink);padding:1rem 1.6rem;font-weight:700}',
  warm: 'h1{font-weight:500;letter-spacing:-.01em}.btn{background:var(--accent);color:var(--accent-ink);padding:.95rem 1.6rem;border-radius:.7rem;font-weight:700}.pic,.board{border-radius:22px}',
  night: 'h1{font-weight:500;letter-spacing:-.03em}.btn{background:var(--accent);color:var(--accent-ink);padding:.95rem 1.6rem;border-radius:.3rem;font-weight:600}',
  editorial: 'h1{font-weight:400;letter-spacing:-.02em}header{border-bottom:3px double var(--ink)}.btn{color:var(--accent-text);text-decoration:underline;text-underline-offset:.2em}',
  playful: 'h1{font-weight:400}.btn{background:var(--accent);color:var(--accent-ink);padding:1rem 1.7rem;border-radius:1rem;font-weight:800;box-shadow:5px 5px 0 var(--ink);border:3px solid var(--ink)}.pic{border-radius:1.4rem;border:3px solid var(--ink)}',
};
const LAYOUT = {
  type: `.type{justify-content:flex-end;padding:2vh 5vw 6vh}.type h1{line-height:.92}
    .type.small{justify-content:center}.type.small h1{font-size:clamp(2rem,4.2vw,4.2rem);line-height:1.08;max-width:18ch}
    .row{display:flex;justify-content:space-between;align-items:flex-end;gap:2rem;flex-wrap:wrap;margin-top:4vh;padding-top:1.3rem;border-top:2px solid currentColor}
    @media(max-width:700px){.type{padding:2vh 20px 5vh}.row{flex-direction:column;align-items:flex-start}}`,
  photo: `.photo{position:relative}.photo .pic{position:absolute;inset:0;border-radius:0;border:0}
    .band{position:absolute;left:5vw;bottom:7vh;width:min(46rem,80vw);background:var(--ground);padding:2.2rem 2.4rem 2.4rem;display:grid;gap:1.4rem;justify-items:start}
    .photo h1{font-size:clamp(2.1rem,4.2vw,4.4rem)}@media(max-width:700px){.band{left:16px;right:16px;width:auto;bottom:20px;padding:1.4rem}}`,
  split: `.split{display:grid;grid-template-columns:1.05fr 1fr;gap:5vw;align-items:center;padding:3vh 5vw 7vh}
    .words{display:grid;gap:1.8rem;justify-items:start}.split h1{font-size:clamp(2.4rem,5vw,5.4rem)}.split .pic{aspect-ratio:4/5;max-height:74vh;width:100%}
    @media(max-width:700px){.split{grid-template-columns:1fr;padding:1vh 20px 5vh;gap:1.6rem}.split .pic{order:-1;aspect-ratio:auto;height:34vh}}`,
  field: `.field{justify-content:space-between;padding:2vh 5vw 6vh}.field h1{line-height:.88}
    .row{display:flex;justify-content:space-between;align-items:flex-end;gap:2rem;flex-wrap:wrap;margin-top:4vh;padding-top:1.3rem;border-top:6px solid currentColor}
    @media(max-width:700px){.field{padding:2vh 20px 5vh}.row{flex-direction:column;align-items:flex-start}}`,
  object: `.object{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:4vw;padding:2vh 5vw 6vh}
    .object h1{font-size:clamp(2.2rem,4.4vw,4.8rem);justify-self:end;text-align:right;max-width:12ch}
    .thing{width:min(62vh,36vw)}.thing img{display:block;margin:0 auto;max-width:100%;max-height:62vh;width:auto;height:auto}
    .thing.round{display:grid;place-items:center;aspect-ratio:1;border-radius:50%!important;overflow:hidden;background:var(--accent)}.thing.round img{width:100%;height:100%;max-height:none;object-fit:cover}
    .thing.todo{display:grid;place-items:center;aspect-ratio:1;background:none;border:2px dashed currentColor;border-radius:1.6rem!important;color:var(--muted);align-content:center;justify-items:center;gap:1rem;padding:8%;text-align:center}
    .todo p{margin:0;max-width:26ch;font:400 clamp(.95rem,1.35vw,1.25rem)/1.4 var(--ft)}
    .side{display:grid;gap:1.4rem;justify-items:start}
    @media(max-width:700px){.object{grid-template-columns:1fr;justify-items:center;text-align:center;gap:1.4rem;padding:2vh 20px 5vh}.object h1{justify-self:center;text-align:center}.thing{width:min(72vw,38vh)}.thing img{max-height:46vh}.side{justify-items:center}}`,
  // the list itself is the poster: full width, as big as the screen allows, no box; the line is its heading
  rows: `.rows{padding:2vh 5vw 5vh;gap:4vh}
    .head{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem 2rem;flex-wrap:wrap;padding-bottom:1.1rem;border-bottom:2px solid currentColor}
    .head div{display:grid;gap:.5rem}.rows h1{font-size:clamp(1.6rem,2.6vw,2.8rem)}
    .board{list-style:none;margin:0;padding:0;font:400 4rem/1.04 var(--fr);letter-spacing:-.01em}
    .board li{display:flex;align-items:baseline;gap:.3em;white-space:nowrap;padding:.06em 0}
    .board i{flex:1;min-width:.6em;border-bottom:.05em dotted currentColor;opacity:.35}.board b{font-weight:inherit;color:var(--accent-text);font-variant-numeric:tabular-nums}
    @media(max-width:700px){.rows{padding:1vh 20px 5vh;gap:2rem}.head{flex-direction:column;align-items:flex-start}
      .board{font-size:min(11vw,3.2rem)!important;line-height:1.06}.board li{display:block;white-space:normal;padding:.22em 0;border-bottom:1px solid var(--line)}.board i{display:none}.board b{display:block}}`,
  proof: `.proof{justify-content:space-between;padding:6vh 5vw;gap:6vh}
    .head{display:flex;justify-content:space-between;align-items:flex-end;gap:3rem;flex-wrap:wrap}.proof h1{font-size:clamp(2.4rem,5.6vw,6rem);max-width:15ch}
    .facts{list-style:none;margin:0;padding:2rem 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:3vw;border-top:2px solid currentColor}
    .facts b{display:block;font:400 clamp(2.6rem,6vw,6.4rem)/1 var(--fd);color:var(--accent-text)}.facts span{display:block;margin-top:.6rem;color:var(--muted)}
    @media(max-width:700px){.proof{padding:3vh 20px 5vh;gap:3vh}.facts{grid-template-columns:1fr;gap:1.1rem;padding-top:1.2rem}.facts b{font-size:2.5rem}}`,
};
// the biggest headline that fits the width and part of the screen's height, once the fonts are in
const FIT = `<script>window.__fitted = document.fonts.ready.then(() => { for (const el of document.querySelectorAll('.fit')) {
  const maxH = innerHeight * (+el.dataset.h || 0.55); let lo = 16, hi = 640;
  while (hi - lo > 1) { const mid = (lo + hi) / 2; el.style.fontSize = mid + 'px'; if (el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= maxH) lo = mid; else hi = mid; }
  el.style.fontSize = lo + 'px'; } return 1; });</script>`;
const CAMERA = '<svg viewBox="0 0 24 24" width="56" aria-hidden="true"><path d="M4 7h3l2-2.5h6L17 7h3v12H4z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" width="44" aria-hidden="true"><path d="M4 20l1.2-4.6L16.5 4.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z M14.5 6.1l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// concepts.json -> the concepts with every default filled in, or a list of what is wrong
function readConcepts(file) {
  if (!existsSync(file)) return { errors: [`No file at ${file}.`] };
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { errors: [`${file} is not valid JSON: ${e.message}`] }; }
  const list = Array.isArray(j) ? j : j.concepts;
  const top = Array.isArray(j) ? {} : j;
  const errors = [];
  if (!Array.isArray(list) || !list.length) return { errors: ['concepts.json needs a "concepts" list (two or three is usual, six at most).'] };
  if (list.length > 6) errors.push(`${list.length} concepts: six at most, and three choose best.`);
  const client = String(top.client || top.name || '').trim();
  if (!client) errors.push('"client": the name on the site is missing.');
  const lang = String(top.lang || 'en');
  const notes = [];
  const concepts = list.slice(0, 6).map((c, i) => {
    const at = `Concept ${'ABCDEF'[i]}${c.name ? ` ("${c.name}")` : ''}`;
    for (const k of ['name', 'idea', 'mood', 'brand', 'move']) if (!c[k]) errors.push(`${at}: "${k}" is missing.`);
    for (const k of Object.keys(c)) if (!KEYS.has(k)) notes.push(`${at}: "${k}" is not read (a typo? the keys are ${[...KEYS].slice(0, 17).join(', ')}).`);
    if (c.mood && !MOODS[c.mood]) errors.push(`${at}: mood "${c.mood}" is not one of ${Object.keys(MOODS).join(', ')}.`);
    if (c.move && !MOVES[c.move]) errors.push(`${at}: move "${c.move}" is not one of ${Object.keys(MOVES).join(', ')}.`);
    if (c.brand && !/^#[0-9a-f]{6}$/i.test(c.brand)) errors.push(`${at}: "${c.brand}" is not a colour like #2f6f62.`);
    if (c.ground && !GROUND.test(c.ground)) errors.push(`${at}: ground "${c.ground}" should be warm, cool, neutral, brand or a colour like #f3e6d8.`);
    if (c.shape && !/^circle$/.test(c.shape)) errors.push(`${at}: shape "${c.shape}" should be "circle", or left out so the picture keeps its own shape.`);
    if (c.shape && c.move && c.move !== 'object') notes.push(`${at}: only the object move has a shape, so "shape" is left out.`);
    if (c.size && !/^(small|poster)$/.test(c.size)) errors.push(`${at}: size "${c.size}" should be "small" (a quiet title) or "poster" (the line as big as the screen, as without it).`);
    if (c.size && c.move && c.move !== 'type') notes.push(`${at}: only the type move has a size, so "size" is left out.`);
    if (c.image && c.move && !DRAWS.has(c.move)) notes.push(`${at}: the ${c.move} move draws no picture, so "image" is left out (photo, split and object draw one).`);
    const rows = pairs(c.rows), proof = pairs(c.proof);
    if (c.move === 'rows' && !rows.length) errors.push(`${at}: the rows move needs "rows": [["Espresso", "2,40 €"], …], from their own menu or list.`);
    if (c.move === 'proof' && !proof.length) errors.push(`${at}: the proof move needs "proof": [["1987", "the first cake"], …], from their own facts.`);
    let fonts = c.fonts ? (Array.isArray(c.fonts) ? c.fonts : String(c.fonts).split(',')).map((f) => String(f).trim()).filter(Boolean) : null;
    if (fonts?.length > 3) notes.push(`${at}: fonts are the display face, the text face and one for the rows, three at most; ${fonts.slice(3).join(', ')} left out.`);
    if (fonts?.[2] && c.move && c.move !== 'rows') notes.push(`${at}: the third face sets only the rows, and the ${c.move} move has none, so ${fonts[2]} is left out.`);
    if (fonts) fonts = fonts.slice(0, c.move === 'rows' ? 3 : 2);
    const image = c.image ?? top.image;
    const img = image ? resolve(dirname(file), image) : null;
    if (img && !existsSync(img)) {
      // written from the site's folder or the shell's, as people do: say the path that works from here
      const there = [resolve(dirname(dirname(file)), image), resolve(image)].find(existsSync);
      errors.push(`${at}: no picture at ${img}. Pictures are found from the concepts file's folder${there ? `: write "${relative(dirname(file), there).replace(/\\/g, '/')}"` : ` (${dirname(file)})`}.`);
    }
    // the thing without its picture is a dashed frame, which looks unfinished next to drawn pictures
    if (c.move === 'object' && !img) notes.push(`${at}: the object has no "image", so it draws as a dashed frame named by "bold". Give it their picture of the thing if there is one; if not, say what the frame stands for when you show the sheet${c.recommended ?? c.kept ? ', since it is your pick' : ''}.`);
    const action = c.action || top.action || wordsFor(lang)?.action || 'Get in touch';
    const nav = c.nav || top.nav || [];
    return { ...c, client, lang, nav: Array.isArray(nav) ? nav : String(nav).split(',').map((s) => s.trim()).filter(Boolean), line: c.line || top.line || client, sub: c.sub ?? top.sub ?? '', action, fonts, image, img, rows, proof, recommended: !!(c.recommended ?? c.kept), letter: 'ABCDEF'[i] };
  });
  if (!top.action && list.some((c) => !c.action) && !wordsFor(lang)) notes.push(`No button words in "${lang}": give "action" in that language, or the button says "Get in touch".`);
  if (concepts.filter((c) => c.recommended).length > 1) errors.push('Mark one concept "recommended", not several.');
  return { concepts, errors, notes };
}

// The keys a concept is read by: the brief's idea blocks (brief.md, section 3) use the same names, so a block
// copies straight in. "from" and "tell a friend" belong to the brief and are passed over here.
const KEYS = new Set(['name', 'idea', 'mood', 'brand', 'move', 'bold', 'line', 'sub', 'action', 'fonts', 'ground', 'image', 'shape', 'size', 'rows', 'proof', 'recommended', 'kept', 'nav', 'strategy', 'from', 'tell a friend']);
// rows and proof as lists ([["39 €", "call-out"]]) or as the brief writes them ("39 € | call-out", one per line)
const pairs = (v) => (Array.isArray(v) ? v : v ? String(v).split('\n') : [])
  .map((r) => (Array.isArray(r) ? r : String(r).split('|')).map((s) => String(s).trim())).filter((r) => r[0]);
// the moves that draw the picture; the others are words, colour, a list or numbers
const DRAWS = new Set(['photo', 'split', 'object']);

// a concept's colours: the field move's ground is their colour itself (a dark roast stays dark), unless the
// concept names one
function paletteOf(c) {
  const m = MOODS[c.mood];
  const strategy = c.move === 'field' ? 'drenched' : c.strategy || m.pal.strategy;
  const ground = c.ground || (c.move === 'field' ? c.brand : null);
  return palette(rgbToOklch(hexToRgb(c.brand)), { ...m.pal, strategy, ...(ground && { ground }) });
}
const face = (stack) => stack.split("'")[1].replace(' Variable', '');
// the named faces that did not load in the page (a wrong name, or no internet): the browser draws those in the
// system font while the sheet would name them. Not read from failed requests: of the three addresses asked for
// each name, one or two are missing on purpose.
const notLoaded = (want) => want.filter((f) => ![...document.fonts].some((x) => x.status === 'loaded'
  && x.family.replace(/["']/g, '').replace(/ Variable$/, '').toLowerCase() === f.toLowerCase()));
// "Gloock + Commissioner", "Space Grotesk + Inter, rows in JetBrains Mono"
const saidFonts = (f) => `${f.slice(0, 2).join(' + ')}${f[2] ? `, rows in ${f[2]}` : ''}`;
// what the history compares (lib/history.mjs): the faces, the move, the brand colour and the ground
const lookOf = (c) => ({ fonts: c.fonts || [face(MOODS[c.mood].display), face(MOODS[c.mood].text)], move: c.move, brand: c.brand, ground: paletteOf(c).ground });

function conceptPage(c) {
  const m = MOODS[c.mood];
  const t = tokens(paletteOf(c));
  const vars = Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';');
  // a Fontsource name may be a variable or a static package: ask for both, the one that exists answers
  const cdn = 'https://cdn.jsdelivr.net/npm/';
  const slug = (f) => f.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const links = c.fonts ? c.fonts.flatMap((f) => [`${cdn}@fontsource-variable/${slug(f)}/index.css`, `${cdn}@fontsource/${slug(f)}/400.css`, `${cdn}@fontsource/${slug(f)}/700.css`])
    : m.fonts.map((f) => `${cdn}${f}${f.endsWith('.css') ? '' : '/index.css'}`);
  const stack = (f) => `'${f} Variable','${f}',system-ui,sans-serif`;
  const fd = c.fonts ? stack(c.fonts[0]) : m.display;
  const ft = c.fonts ? stack(c.fonts[1] || c.fonts[0]) : m.text;
  // the rows' own face, falling back to the display face
  const fr = c.fonts?.[2] ? `'${c.fonts[2]} Variable','${c.fonts[2]}',${fd}` : fd;
  const pic = c.img ? `<img src="${pathToFileURL(c.img).href}" alt="">` : `<div class="ph">${CAMERA}</div>`;
  const L = html(c.line), S = c.sub ? `<p class="sub">${html(c.sub)}</p>` : '', A = `<a class="btn">${html(c.action)}</a>`;
  // poster-size words break only between words ("Di–Fr" stays whole), so fitting shrinks them instead
  const W = c.line.split(/\s+/).map((w) => `<span style="white-space:nowrap">${html(w)}</span>`).join(' ');
  const body = {
    // "size": "small" is a quiet title page: the same words, set like a book's title, not fitted to the screen
    type: c.size === 'small' ? `<main class="type small"><h1>${W}</h1><div class="row">${S || '<span></span>'}${A}</div></main>`
      : `<main class="type"><h1 class="fit">${W}</h1><div class="row">${S || '<span></span>'}${A}</div></main>`,
    photo: `<main class="photo"><figure class="pic">${pic}</figure><div class="band"><h1>${L}</h1>${S}${A}</div></main>`,
    // without their picture, the picture side is plain ground, not a stand-in
    split: `<main class="split"><div class="words"><h1>${L}</h1>${S}${A}</div>${c.img ? `<figure class="pic">${pic}</figure>` : '<figure class="pic plain"></figure>'}</main>`,
    field: `<main class="field"><h1 class="fit" data-h="0.6">${W}</h1><div class="row">${S || '<span></span>'}${A}</div></main>`,
    // without their picture, the thing is named in a dashed frame, not stood in for by a badge
    object: `<main class="object"><h1>${L}</h1>${c.img ? `<div class="thing${c.shape === 'circle' ? ' round' : ''}">${pic}</div>` : `<div class="thing todo">${PENCIL}<p>${html(c.bold || c.idea)}</p></div>`}<div class="side">${S}${A}</div></main>`,
    rows: `<main class="rows"><div class="head"><div><h1>${L}</h1>${S}</div>${A}</div><ol class="board fit" data-h="0.6">${(c.rows || []).slice(0, 6).map((r) => { const [x, y] = [r].flat(); return `<li><span>${html(x)}</span>${y ? `<i></i><b>${html(y)}</b>` : ''}</li>`; }).join('')}</ol></main>`,
    proof: `<main class="proof"><div class="head"><h1>${L}</h1>${A}</div>${S}<ul class="facts">${(c.proof || []).slice(0, 4).map((p) => { const [x, y] = [p].flat(); return `<li><b>${html(x)}</b>${y ? `<span>${html(y)}</span>` : ''}</li>`; }).join('')}</ul></main>`,
  }[c.move];
  const nav = c.nav.length ? `<nav>${c.nav.map(html).join('<span>·</span>')}</nav>` : '';
  return `<!doctype html><html lang="${html(c.lang)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${links.map((l) => `<link rel="stylesheet" href="${l}">`).join('\n')}
<style>:root{${vars};--fd:${fd};--ft:${ft};--fr:${fr}}*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--ground);color:var(--ink);font:400 1.1rem/1.55 var(--ft);min-height:100vh;display:flex;flex-direction:column}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.5rem 5vw;font-size:1rem}header b{font-family:var(--fd);font-weight:600;font-size:1.2rem}
nav{display:flex;gap:.8rem;color:var(--muted)}a{color:inherit;text-decoration:none;display:inline-block}main{flex:1;display:flex;flex-direction:column}
h1{font-family:var(--fd);margin:0;font-synthesis:none;line-height:1.02;text-wrap:balance}.sub{max-width:36ch;margin:0;font-size:clamp(1.05rem,1.3vw,1.3rem)}
.pic{margin:0;overflow:hidden;background:var(--surface)}.pic img{width:100%;height:100%;object-fit:cover;display:block}
.ph{width:100%;height:100%;min-height:12rem;display:grid;place-items:center;background:var(--surface);color:var(--muted)}.pic.plain{background:var(--ground);border:0!important}
@media(max-width:700px){header{padding:1.1rem 20px}nav{display:none}}
${LAYOUT[c.move]}${SKIN[c.mood]}</style>
<body><header><b>${html(c.client)}</b>${nav}</header>${body}${FIT}</body></html>`;
}

async function concepts(file) {
  const { concepts: list, errors, notes = [] } = readConcepts(resolve(file)); // a file it can't read has errors only
  if (notes.length) console.log(notes.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(2); }
  // the last sites made on this machine: a concept that looks like one of them gets named, before anyone sees it
  const site = basename(dirname(resolve(file))) === '.one-shot' ? dirname(dirname(resolve(file))) : process.cwd();
  const recent = readHistory();
  for (const c of list) {
    const look = lookOf(c);
    for (const r of repeats(look, { dir: site, sites: recent }).slice(0, 2)) console.log(`${c.letter} · ${c.name} repeats a recent site: ${sayRepeat(r, look)}. Change one of them unless the subject asks for it.`);
  }
  if (a.check) {
    // everything it read, so a key that went missing shows here and not in the picture
    const two = (r) => r.map((x) => x.join(' | ')).join(' / ');
    console.log(list.map((c) => [`${c.letter} · ${c.name}${c.recommended ? ' (recommended)' : ''}: ${c.mood}, ${c.move}${c.move === 'type' && c.size === 'small' ? ' (small)' : ''}, ${c.brand}${c.ground ? ` on ${c.ground}` : ''}` +
      `${c.fonts ? `, ${saidFonts(c.fonts)}` : ''}`, `line "${c.line}"${c.sub ? `, sub "${c.sub}"` : ''}, button "${c.action}"${c.nav.length ? `, menu ${c.nav.join(' · ')}` : ''}`,
      c.bold && `bold: ${c.bold}`, c.image && `image ${c.image}${!DRAWS.has(c.move) ? ' (not drawn by this move)' : c.move === 'object' ? (c.shape === 'circle' ? ', in a circle' : ', in its own shape') : ''}`,
      c.move === 'split' && !c.image && 'no image: the picture side is plain ground',
      c.rows.length && `rows ${two(c.rows)}`, c.proof.length && `proof ${two(c.proof)}`].filter(Boolean).join('\n    ')).join('\n'));
    console.log(`${file}: ${list.length} concepts, ready to draw.`);
    return;
  }
  const out = resolve(a.out || '.one-shot/mockups');
  const b = await launch();
  try {
    for (const c of list) {
      c.id = `${c.letter.toLowerCase()}-${slugify(c.name) || c.move}`;
      const f = join(out, `${c.id}.html`);
      write(f, conceptPage(c));
      for (const [kind, w, h, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
        const p = await b.newPage({ width: w, height: h, mobile, scale: 1 });
        await p.goto(pathToFileURL(f).href);
        await p.eval('window.__fitted');
        if (kind === 'desktop') c.noFont = await p.call(notLoaded, c.fonts || [face(MOODS[c.mood].display), face(MOODS[c.mood].text)]);
        await p.shot(join(out, `${c.id}-${kind}.jpg`), { quality: 80 });
        await p.close();
      }
    }
    const font = (c) => saidFonts(c.fonts || [face(MOODS[c.mood].display), face(MOODS[c.mood].text)]);
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const sheet = join(out, 'concepts.html');
    write(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#1d1d1f;color:#eee;font:600 16px system-ui}
      .row{display:grid;grid-template-columns:1440fr 300fr;gap:16px;align-items:start;margin:12px 0 38px}img{width:100%;display:block;border-radius:6px}
      h2{font-size:21px;margin:0}h2 em{font-style:normal;color:#1d1d1f;background:#ffd24a;border-radius:4px;padding:2px 8px;font-size:14px;vertical-align:3px;margin-left:8px}
      p{margin:6px 0 0;color:#ccc;font-weight:500;max-width:110ch}p.d{color:#999;font-size:14px}</style>
      ${list.map((c) => `<h2>${c.letter} · ${html(c.name)}${c.recommended ? '<em>recommended</em>' : ''}</h2><p>${html(c.idea)}</p>
      <p class="d">${cap(c.mood)} · ${html(font(c))}${c.noFont.length ? ` <b style="color:#ff8a6a">(${html(c.noFont.join(', '))} did not load: drawn in the system font)</b>` : ''} · ${c.brand} · focal point: ${html(c.bold || MOVES[c.move])}</p>
      <div class="row"><img src="${c.id}-desktop.jpg"><img src="${c.id}-phone.jpg"></div>`).join('')}`);
    const p = await b.newPage({ width: 1600, height: 900 });
    await p.goto(pathToFileURL(sheet).href);
    const height = await p.eval('document.documentElement.scrollHeight');
    await p.shot(join(out, 'concepts.jpg'), { quality: 80, clip: { x: 0, y: 0, width: 1600, height: Math.min(height, 8000) } });
    await p.close();
  } finally { await b.close(); }
  const lost = list.filter((c) => c.noFont.length).map((c) => `${c.letter}: ${c.noFont.join(', ')}`);
  if (lost.length) {
    console.error(`Did not load, so drawn in the system font: ${lost.join('; ')}. Check the names on fontsource.org and the internet connection, fix ${file}, and draw again. Do not show this sheet.`);
    process.exit(2);
  }
  console.log(`Concepts: ${join(out, 'concepts.jpg')}\n${list.map((c) => `  ${c.letter}: ${c.name} (${c.mood}, ${c.move})${c.recommended ? ', recommended' : ''}`).join('\n')}`);
  console.log('Show the sheet with your pick and its reason in one line, then ask: A, B, C, or a mix ("A\'s idea in C\'s colours")?');
}

if (a.concepts) {
  await concepts(String(a.concepts));
  process.exit(0);
}

const name = typeof a.name === 'string' ? a.name.trim() : '';
if (!name) usage(import.meta.url);
const line = typeof a.line === 'string' ? a.line.trim() : '';
const lang = typeof a.lang === 'string' && a.lang.trim() ? a.lang.trim() : 'en';
const words = wordsFor(lang);
if (!words && (typeof a.nav !== 'string' || typeof a.action !== 'string')) console.log(`No menu and button words in "${lang}": pass --nav and --action in that language.`);
const action = typeof a.action === 'string' ? a.action.trim() : words?.action || 'Get in touch';
const navWords = typeof a.nav === 'string' ? a.nav.split(',').map((s) => s.trim()).filter(Boolean) : words?.nav || [];
const ground = typeof a.ground === 'string' ? a.ground.trim() : '';
if (ground && !GROUND.test(ground)) { console.error(`--ground "${ground}" should be warm, cool, neutral, brand or a colour like #f3e6d8.`); process.exit(2); }
const brands = String(a.brand || '#2f6f62').split(',').map((s) => s.trim());
for (const b of brands) if (!/^#[0-9a-f]{6}$/i.test(b)) { console.error(`"${b}" is not a colour like #2f6f62.`); process.exit(2); }
const moods = String(a.moods || Object.keys(MOODS).join(',')).split(',').map((s) => s.trim().toLowerCase());
for (const m of moods) if (!MOODS[m]) { console.error(`Unknown mood "${m}". Pick from: ${Object.keys(MOODS).join(', ')}`); process.exit(2); }
const out = resolve(a.out || '.one-shot/mockups');

// one look in several colours, or several looks in one colour
const options = moods.length === 1 && brands.length > 1
  ? brands.map((b) => ({ mood: moods[0], brand: b }))
  : moods.map((m) => ({ mood: m, brand: brands[0] }));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const N = esc(name), L = esc(line || name), A = esc(action);
const NAV = navWords.length ? `<nav>${navWords.map(esc).join(' · ')}</nav>` : '';

// each look: the same three things (name, line, action), arranged the way that mood would
const BODY = {
  quiet: `<header><b>${N}</b>${NAV}</header>
    <main class="q"><div><h1>${L}</h1><hr><a class="btn">${A} →</a></div><div class="plate"></div></main>`,
  bold: `<header><b>${N}</b>${NAV}</header>
    <main class="b"><h1>${N}</h1><div class="row"><p>${line ? L : ''}</p><a class="btn">${A}</a></div></main>`,
  warm: `<header><b>${N}</b>${NAV}</header>
    <main class="w"><div><h1>${L}</h1><a class="btn">${A}</a></div><div class="blob"></div></main>`,
  night: `<header><b>${N}</b>${NAV}</header>
    <main class="n"><h1>${L.replace(/(\S+)$/, '<span class="lit">$1</span>')}</h1><div class="beam"></div><a class="btn">${A}</a></main>`,
  editorial: `<header class="mast"><b>${N}</b></header>
    <main class="e"><h1>${L}</h1><div class="cols"><p>${N}.</p><p><a class="btn">${A} →</a></p></div></main>`,
  playful: `<header><b>${N}</b>${NAV}</header>
    <main class="p"><div class="dot d1"></div><div class="dot d2"></div><h1>${L}</h1><a class="btn">${A}</a></main>`,
};

const STYLE = {
  quiet: `.q{display:grid;grid-template-columns:1.3fr 1fr;gap:6vw;align-items:end;padding:10vh 6vw 8vh}
    h1{font:400 clamp(2.4rem,5.4vw,5.6rem)/1.02 var(--fd);letter-spacing:-.02em;margin:0;max-width:14ch}
    hr{border:0;border-top:1px solid var(--line);margin:2.2rem 0 1.4rem}.btn{color:var(--accent-text);font-weight:600}
    .plate{aspect-ratio:4/5;background:var(--surface)}@media(max-width:700px){.q{grid-template-columns:1fr}.plate{display:none}}`,
  bold: `body{background:var(--accent);color:var(--accent-ink)}header,header nav{color:var(--accent-ink)}
    .b{padding:4vh 4vw}h1{font:850 clamp(4rem,19vw,22rem)/.82 var(--fd);font-stretch:62%;text-transform:uppercase;letter-spacing:-.01em;margin:0;overflow-wrap:anywhere}
    .row{display:flex;justify-content:space-between;align-items:end;gap:2rem;margin-top:4vh;border-top:6px solid currentColor;padding-top:1.4rem;flex-wrap:wrap}
    .row p{font-size:clamp(1.1rem,1.6vw,1.6rem);max-width:30ch;margin:0}.btn{background:var(--accent-ink);color:var(--accent);padding:1rem 1.6rem;font-weight:700}`,
  warm: `.w{display:grid;grid-template-columns:1.2fr 1fr;gap:5vw;align-items:center;padding:8vh 6vw}
    h1{font:500 clamp(2.4rem,5vw,5rem)/1.08 var(--fd);letter-spacing:-.01em;margin:0 0 2.2rem;max-width:15ch}
    .btn{background:var(--accent);color:var(--accent-ink);padding:.95rem 1.6rem;border-radius:.7rem;font-weight:700}
    .blob{aspect-ratio:4/5;background:var(--surface);border-radius:22px}
    @media(max-width:700px){.w{grid-template-columns:1fr}.blob{width:60%;justify-self:end;order:-1}}`,
  // one hard-edged light: the last word lit, a thin beam under the line; no glow, no blur
  night: `.n{min-height:calc(100vh - 5rem);display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;padding:0 6vw 12vh}
    h1{font:500 clamp(2.6rem,6.4vw,6.8rem)/1.02 var(--fd);letter-spacing:-.03em;margin:0;max-width:16ch}.lit{color:var(--accent-text)}
    .beam{width:min(26rem,40vw);height:2px;background:var(--accent-text);margin:2.4rem 0 2.2rem}
    .btn{background:var(--accent);color:var(--accent-ink);padding:.95rem 1.6rem;border-radius:.3rem;font-weight:600}`,
  editorial: `.mast{justify-content:center;border-bottom:3px double var(--ink);font:600 1.6rem var(--fd);letter-spacing:.06em;text-transform:uppercase}
    .e{padding:7vh 8vw}h1{font:400 clamp(2.6rem,6.4vw,7rem)/1 var(--fd);letter-spacing:-.02em;margin:0 0 3rem;max-width:18ch}
    .cols{columns:2 16rem;column-rule:1px solid var(--line);gap:3rem;font-size:1.15rem;max-width:60rem}.btn{color:var(--accent-text);text-decoration:underline;text-underline-offset:.2em}`,
  playful: `.p{position:relative;padding:12vh 6vw;overflow:hidden}.dot{position:absolute;border-radius:50%}
    .d1{width:34vw;aspect-ratio:1;right:-8vw;top:-10vh;background:var(--accent)}.d2{width:12vw;aspect-ratio:1;left:58%;bottom:6vh;background:var(--surface);border:5px solid var(--ink)}
    h1{position:relative;font:400 clamp(2.6rem,6.4vw,6.8rem)/1.12 var(--fd);margin:0 0 3rem;max-width:11ch}
    .btn{position:relative;background:var(--accent);color:var(--accent-ink);padding:1rem 1.7rem;border-radius:1rem;font-weight:800;box-shadow:5px 5px 0 var(--ink);border:3px solid var(--ink)}`,
};

// comparing colours: on a button and an underline alone, three palettes look the same. Give the colour a field.
const FIELD = {
  quiet: '.plate{background:var(--accent)}',
  warm: '.blob{background:var(--accent)}',
  night: '.beam{height:.75rem;width:min(34rem,60vw);background:var(--accent)}',
  editorial: '.mast{background:var(--accent);color:var(--accent-ink);border-bottom:0}',
  playful: '.d2{background:var(--accent-text)}',
};

function page(o) {
  const m = MOODS[o.mood];
  const t = tokens(palette(rgbToOklch(hexToRgb(o.brand)), { ...m.pal, ...(ground && { ground }) }));
  const vars = Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';');
  return `<!doctype html><html lang="${esc(lang)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${m.fonts.map((f) => `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/${f}${f.endsWith('.css') ? '' : '/index.css'}">`).join('\n')}
<style>:root{${vars};--fd:${m.display};--ft:${m.text}}*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--ground);color:var(--ink);font:400 1.1rem/1.55 var(--ft);min-height:100vh}
header{display:flex;justify-content:space-between;align-items:center;padding:1.6rem 6vw;font-size:1rem}header b{font-family:var(--fd);font-weight:600;font-size:1.15rem}
nav{color:var(--muted)}a{color:inherit;text-decoration:none;display:inline-block}${STYLE[o.mood]}${brands.length > 1 ? FIELD[o.mood] || '' : ''}</style>
<body>${BODY[o.mood]}</body></html>`;
}

const b = await launch();
const shots = [];
try {
  for (const [i, o] of options.entries()) {
    const id = `${'abcdef'[i]}-${o.mood}${options.length > moods.length || brands.length > 1 ? '-' + o.brand.slice(1) : ''}`;
    const file = join(out, `${id}.html`);
    write(file, page(o));
    for (const [kind, w, h, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
      const p = await b.newPage({ width: w, height: h, mobile, scale: 1 });
      await p.goto(pathToFileURL(file).href);
      // offline the moods were drawn in the system font too, and "bold: huge type" was picked from that picture
      if (kind === 'desktop') o.noFont = await p.call(notLoaded, [...new Set([face(MOODS[o.mood].display), face(MOODS[o.mood].text)])]);
      await p.shot(join(out, `${id}-${kind}.jpg`), { quality: 80 });
      await p.close();
    }
    shots.push({ id, o, letter: 'ABCDEF'[i] });
  }

  // the sheet: one row per option, desktop and phone side by side, labelled in plain words
  const sheet = join(out, 'mockups.html');
  write(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#1d1d1f;color:#eee;font:600 16px system-ui}
    .row{display:grid;grid-template-columns:1440fr 300fr;gap:16px;align-items:start;margin-bottom:30px}img{width:100%;display:block;border-radius:6px}
    h2{font-size:19px;margin:0 0 10px}h2 span{color:#aaa;font-weight:500}</style>
    ${shots.map((s) => `<h2>${s.letter} · ${s.o.mood[0].toUpperCase() + s.o.mood.slice(1)}${brands.length > 1 ? ` · ${s.o.brand}` : ''} <span>${MOODS[s.o.mood].about}</span></h2>
    <div class="row"><img src="${s.id}-desktop.jpg"><img src="${s.id}-phone.jpg"></div>`).join('')}`);
  const p = await b.newPage({ width: 1600, height: 900 });
  await p.goto(pathToFileURL(sheet).href);
  const height = await p.eval('document.documentElement.scrollHeight');
  await p.shot(join(out, 'mockups.jpg'), { quality: 80, clip: { x: 0, y: 0, width: 1600, height: Math.min(height, 7000) } });
  await p.close();
} finally { await b.close(); }
// stopped as the concepts sheet is (above): a mood drawn in the system font is not that mood
const lost = shots.filter((s) => s.o.noFont?.length).map((s) => `${s.letter}: ${s.o.noFont.join(', ')}`);
if (lost.length) {
  console.error(`Did not load, so drawn in the system font: ${lost.join('; ')}. Check the internet connection (the faces come from cdn.jsdelivr.net), and draw again. Do not show this sheet.`);
  process.exit(2);
}

console.log(`Mockups: ${join(out, 'mockups.jpg')}\n${shots.map((s) => `  ${s.letter}: ${s.o.mood}${brands.length > 1 ? ' ' + s.o.brand : ''}`).join('\n')}\nShow the sheet and ask which is closest: a letter, or a mix ("A's colours with C's type").`);
