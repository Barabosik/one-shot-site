#!/usr/bin/env node
// new-site: start a site from the starter. Copies the skeleton, fills in what is known, copies the check
// tools into tools/one-shot/ (so `npm run look` / `npm run audit` keep working without the agent),
// adds the chosen extras, and installs.
//
//   node new-site.mjs my-site --name "Rosa's Bakery" [--description "…"] [--url https://rosas.example/]
//        [--title "…"] [--lang en] [--email hi@…] [--phone "+49 …"] [--schema LocalBusiness] [--theme "#b4532a"]
//        [--mood warm] [--ground warm] [--addons motion,effects,hero3d,sound,theme,embed] [--legal de] [--country DE] [--currency GBP]
//        [--facts .one-shot/redesign/facts.json] [--no-install] [--force]
//
// --facts: site.json from redesign's facts draft, once the person has confirmed it (name, type, description, email,
// phone, fax, address, hours, currency, menu, links); a flag given as well wins over the file.
// --theme: the brand colour; tokens.css, the 404 page, the icon and the browser bar (theme-color) are made from it.
// --mood: with --theme, the look they picked, as palette.mjs takes it: Quiet starts on warm white, Warm and Editorial
// on cream, unless --ground says otherwise.
// --ground: with --theme, the ground's tone as palette.mjs takes it (warm, cool, neutral, brand or a colour like
// "#efe6d8"), so the first palette and the browser bar are the brief's.
// --country: where the business is (address, currency). Default: the phone's country code (+49 → DE), else
// --legal, else the region in --lang (en-GB → GB). An English site for a German business: --country DE.
// --currency: for prices in site.json. Default: the country's (GB → GBP, US → USD, CH → CHF), otherwise EUR; none
// for a person, a group or software, which sell nothing until --currency says so.
//
// --legal de adds an Impressum and a privacy page (German templates, filled from site.json) and links them
// in the footer.
//
// Anything not given stays as a {{PLACEHOLDER}}; the audit refuses to pass until each one is filled.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, stopOnError, usage } from './lib/cli.mjs';
import { hex, hexToRgb, moodDefaults, MOODS, palette, rgbToOklch, tokens } from './palette.mjs';

// Windows: cmd.exe (npm and npx go through it) runs an npm.cmd or git.exe in the site's own folder before the real
// one, unless this is set
process.env.NoDefaultCurrentDirectoryInExePath = '1';

const here = dirname(fileURLToPath(import.meta.url));
const skill = resolve(here, '..');
stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const dir = resolve(a._[0] || '');
// --facts: redesign's draft (.one-shot/redesign/facts.json) once the person has confirmed it, so nothing is copied by
// hand. Its "draft" is read (or the whole file, when it is shaped like site.json); a flag given here wins.
let given = {};
const took = []; // what came from the file, to say so
let countryFromFile = false;
if (a.facts !== undefined) {
  const file = resolve(a.facts === true ? '' : String(a.facts));
  if (a.facts === true || !existsSync(file) || statSync(file).isDirectory()) {
    console.error(a.facts === true ? 'Give --facts a file: --facts .one-shot/redesign/facts.json' : `No file at ${file}.`);
    process.exit(2);
  }
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`${file} is not valid JSON (${e.message}). Fix it, then run this again.`); process.exit(2); }
  given = j && typeof j.draft === 'object' && j.draft ? j.draft : j;
  if (!given || typeof given !== 'object' || Array.isArray(given)) { console.error(`${file} holds no facts: redesign writes them as {"draft": {"name": …}}.`); process.exit(2); }
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const take = (flag, key, v) => { if (a[flag] === undefined && v !== undefined) { a[flag] = v; took.push(key); } };
  for (const [flag, key] of [['name', 'name'], ['description', 'description'], ['email', 'email'], ['phone', 'phone'], ['schema', 'type']]) take(flag, key, text(given[key]));
  take('currency', 'currency', /^[A-Z]{3}$/i.test(text(given.currency) || '') ? text(given.currency) : undefined);
  if (a.country === undefined && /^[A-Z]{2}$/i.test(text(given.address?.country) || '')) { a.country = text(given.address.country); countryFromFile = true; }
}
if (!a._[0] || typeof a.name !== 'string' || !a.name.trim()) {
  console.error(`new-site needs ${a._[0] ? 'the name' : 'a folder for the site'}: node new-site.mjs my-site --name "Rosa's Bakery"\n`);
  usage(import.meta.url);
}
if (a.url !== undefined) {
  try { const u = new URL(String(a.url)); if (!/^https?:$/.test(u.protocol) || !u.hostname) throw 0; } catch {
    console.error(`--url takes a full address, like https://rosas.example/ (got ${a.url === true ? 'nothing' : `"${a.url}"`}).`);
    process.exit(2);
  }
}
if (a.currency !== undefined && !/^[A-Z]{3}$/i.test(String(a.currency))) {
  console.error('--currency takes a three-letter code like GBP, USD or EUR.');
  process.exit(2);
}
if (a.country !== undefined && !/^[A-Z]{2}$/i.test(String(a.country))) {
  console.error('--country takes a two-letter code like DE, AT, GB or US.');
  process.exit(2);
}
if (existsSync(dir) && readdirSync(dir).filter((f) => !f.startsWith('.')).length && !a.force) {
  console.error(`${dir} is not empty. Pick a new folder, or pass --force to write into it.`);
  process.exit(2);
}

const ADDONS = {
  motion: { file: 'motion.js', deps: ['gsap@^3.15.0'], use: "import { initMotion } from './addons/motion.js';\ninitMotion();" },
  effects: { file: ['effects.js', 'effects.css'], deps: [], use: "import { initEffects } from './addons/effects.js';\ninitEffects();" },
  hero3d: { file: 'hero3d.js', deps: ['three@^0.186.1'], use: "import { initHero3d } from './addons/hero3d.js';\ninitHero3d(document.querySelector('.hero-3d'));" },
  sound: { file: 'sound.js', deps: [], use: "import { initSound } from './addons/sound.js';\ninitSound(document.querySelector('.sound-toggle'));" },
  theme: { file: 'theme.js', deps: [], use: "import { initTheme } from './addons/theme.js';\ninitTheme(document.querySelector('.theme-toggle'));" },
  embed: { file: 'embed.js', deps: [], use: "import { initEmbeds } from './addons/embed.js';\ninitEmbeds();" },
};
const LEGAL = ['de'];
if (a.legal !== undefined && !LEGAL.includes(a.legal)) { console.error(`--legal takes one of: ${LEGAL.join(', ')}`); process.exit(2); }
if (a.theme !== undefined && !/^#[0-9a-f]{6}$/i.test(String(a.theme))) {
  console.error('--theme takes a colour like "#2a6fdb" (six hex digits).');
  process.exit(2);
}
// the ground's tone, as palette.mjs takes it, so the first tokens and the browser bar are the ones the brief chose
if (a.ground !== undefined && !/^(warm|cool|neutral|brand|#[0-9a-f]{3}([0-9a-f]{3})?)$/i.test(String(a.ground))) {
  console.error('--ground takes warm, cool, neutral, brand or a colour like "#efe6d8", as palette.mjs does.');
  process.exit(2);
}
if (a.mood !== undefined && !MOODS.includes(a.mood)) { console.error(`--mood takes ${MOODS.join(', ')}, as palette.mjs does.`); process.exit(2); }
if (a.ground !== undefined && !a.theme) { console.error('--ground goes with --theme: the palette is made from the brand colour.'); process.exit(2); }
const addons = a.addons ? String(a.addons).split(',').map((s) => s.trim()).filter(Boolean) : [];
for (const n of addons) if (!ADDONS[n]) { console.error(`Unknown addon "${n}". Pick from: ${Object.keys(ADDONS).join(', ')}`); process.exit(2); }

// white or near-black, whichever reads better on the favicon's background colour
function inkOn(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = (h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g)).map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.06 ? '#ffffff' : '#111111';
}

let url = a.url ? String(a.url) : null;
if (url && !url.endsWith('/')) url += '/';
const fill = {
  NAME: a.name,
  TITLE: a.title || a.name, // a better title comes with the brief: what it is, where, for whom
  DESCRIPTION: a.description,
  URL: url,
  LANG: a.lang || 'en',
  EMAIL: a.email,
  SCHEMA_TYPE: a.schema || null,
  THEME_COLOR: a.theme || null,
  INITIAL: String(a.name).trim()[0].toUpperCase(),
  ICON_INK: a.theme ? inkOn(String(a.theme)) : null,
  SLUG: String(a.name).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'site',
};
const html = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (v) => JSON.stringify(v).slice(1, -1);
// fill {{KEYS}}, escaped for where they land: JSON in .json files and the JSON-LD line, entities in markup
const put = (text, file) => text.split('\n').map((line) => {
  const esc = file.endsWith('.json') || line.includes('application/ld+json') ? json : /\.(html|svg|xml)$/.test(file) ? html : (v) => v;
  return line.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (fill[k] != null ? esc(String(fill[k])) : m));
}).join('\n');

// 1. the skeleton, with placeholders filled
const starter = join(skill, 'assets/starter');
const copy = (from, to) => {
  for (const f of readdirSync(from)) {
    const src = join(from, f), dst = join(to, f);
    // a folder link there (a junction, --force) is replaced too: its target got the starter's files
    if (statSync(src).isDirectory()) { if (lstatSync(dst, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(dst); mkdirSync(dst, { recursive: true }); copy(src, dst); continue; }
    rmSync(dst, { force: true }); // a link already there (--force) is replaced, not written through to what it points at
    if (/\.(html|css|js|json|txt|xml|svg|md)$|^\.gitignore$/.test(f)) {
      writeFileSync(dst, put(readFileSync(src, 'utf8'), f));
    } else cpSync(src, dst);
  }
};
mkdirSync(dir, { recursive: true });
copy(starter, dir);

// the starter's own words (skip link, nav, 404) in the page's language; the agent writes everything else
const WORDS = {
  de: ['Zum Inhalt springen', 'Über uns', 'Kontakt', 'E-Mail an', 'Seite nicht gefunden', 'Hier ist nichts.', 'Die Seite ist vielleicht umgezogen.', 'Zur Startseite'],
  fr: ['Aller au contenu', 'À propos', 'Contact', 'Écrire à', 'Page introuvable', 'Rien ici.', 'La page a peut-être été déplacée.', "Retour à l'accueil"],
  es: ['Saltar al contenido', 'Sobre nosotros', 'Contacto', 'Escribir a', 'Página no encontrada', 'Aquí no hay nada.', 'Puede que la página se haya movido.', 'Ir a la página de inicio'],
  it: ['Vai al contenuto', 'Chi siamo', 'Contatti', 'Scrivi a', 'Pagina non trovata', "Qui non c'è niente.", 'La pagina potrebbe essere stata spostata.', 'Vai alla home page'],
  nl: ['Naar de inhoud', 'Over ons', 'Contact', 'Mail', 'Pagina niet gevonden', 'Hier is niets.', 'De pagina is misschien verplaatst.', 'Naar de homepage'],
};
const EN = ['Skip to content', 'About', 'Contact', 'Write to', 'Page not found', 'Nothing here.', 'The page may have moved.', 'Go to the home page'];
const words = WORDS[String(fill.LANG).slice(0, 2).toLowerCase()];
if (words) {
  for (const f of ['index.html', 'public/404.html']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, 'utf8');
    // only text right after a tag (">About<", ">Write to {{"), so "#about" and attribute values stay as they are
    EN.forEach((en, i) => { text = text.replace(new RegExp(`(>\\s*)${en.replace(/\./g, '\\.')}(?=[\\s<{·])`, 'g'), (m, before) => before + words[i]); });
    writeFileSync(p, text);
  }
}

// the facts file: everything a visitor or a search engine needs to get right, in one place (see site-data.js)
const CURRENCY = { GB: 'GBP', US: 'USD', CH: 'CHF', LI: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', IN: 'INR', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', SG: 'SGD', ZA: 'ZAR', BR: 'BRL', MX: 'MXN' };
// The business's country, which sets the currency and the address. The page language only hints at it (an English
// site for a café in Germany is en-GB and still in Germany): --country, else the phone's country code, else
// --legal, else the language's region.
const DIAL = { 49: 'DE', 43: 'AT', 41: 'CH', 44: 'GB', 1: 'US', 33: 'FR', 34: 'ES', 39: 'IT', 31: 'NL', 32: 'BE', 352: 'LU', 45: 'DK', 46: 'SE', 47: 'NO', 48: 'PL', 420: 'CZ', 36: 'HU', 351: 'PT', 353: 'IE', 358: 'FI', 61: 'AU', 64: 'NZ', 81: 'JP', 65: 'SG', 27: 'ZA', 55: 'BR', 52: 'MX', 91: 'IN' };
const dialled = (() => { const d = String(a.phone || '').replace(/[^\d+]/g, '').match(/^(?:\+|00)(\d{1,3})/)?.[1]; return d && (DIAL[d.slice(0, 3)] || DIAL[d.slice(0, 2)] || DIAL[d.slice(0, 1)]); })();
const [region, regionFrom] = a.country ? [String(a.country).toUpperCase(), countryFromFile ? '--facts' : '--country']
  : dialled ? [dialled, 'the phone number']
  : a.legal ? [String(a.legal).toUpperCase(), '--legal']
  : [String(fill.LANG).split('-')[1]?.toUpperCase(), '--lang'];
// a person, a product or a group has no shop front: no street address, opening hours or menu to fill in (a country,
// yes: a translator in Lisbon works from Portugal)
const placeless = /^(Person|Organization|Corporation|NGO|SoftwareApplication|WebApplication|MobileApplication|Product|WebSite|CreativeWork|Book|MusicGroup|PerformingGroup)$/.test(a.schema || '');
// software has a version, a download, a licence and maybe a price instead (facts.md); site-data.js reads the same list
const software = /^(SoftwareApplication|WebApplication|MobileApplication|VideoGame)$/.test(a.schema || '');
const facts = {
  name: String(a.name).trim(),
  type: a.schema || '',
  description: a.description || '',
  url: url || '',
  email: a.email || '',
  phone: a.phone || '',
  // a free tool or a person sells nothing: a currency there would read as a fact
  ...(a.currency || !placeless ? { currency: a.currency ? String(a.currency).toUpperCase() : CURRENCY[region] || 'EUR' } : {}),
  ...(software ? { version: '', download: '', license: '', price: '' } : {}),
  address: placeless ? { country: region || '' } : { street: '', postcode: '', city: '', country: region || '' },
  ...(placeless || a.schema === 'Event' ? {} : { hours: [], closed: [], menu: [] }),
  events: [],
  links: { booking: '', payment: '' },
  owner: { name: '' },
  host: '',
  verify: { google: '', bing: '' },
  analytics: {},
};
// the rest of the confirmed draft, under the keys redesign writes: the full address, hours, price lists, fax, links
if (given.address && typeof given.address === 'object') {
  const parts = Object.entries(given.address).filter(([k, v]) => ['street', 'postcode', 'city', 'region', 'country'].includes(k) && typeof v === 'string' && v.trim());
  if (parts.length) { facts.address = { ...facts.address, ...Object.fromEntries(parts.map(([k, v]) => [k, v.trim()])) }; took.push('address'); }
}
for (const k of ['hours', 'menu']) if (Array.isArray(given[k]) && given[k].length) { facts[k] = given[k]; took.push(k); }
if (typeof given.fax === 'string' && given.fax.trim()) { facts.fax = given.fax.trim(); took.push('fax'); }
if (given.links && typeof given.links === 'object' && !Array.isArray(given.links)) {
  const links = Object.entries(given.links).filter(([, v]) => typeof v === 'string' && v.trim());
  if (links.length) { facts.links = { ...facts.links, ...Object.fromEntries(links) }; took.push('links'); }
}
writeFileSync(join(dir, 'site.json'), JSON.stringify(facts, null, 2) + '\n');

// legal pages: templates filled from site.json, linked from the footer of the home page
const pages = ['index.html']; // the pages with the site's head: theme-color and the theme addon's script go in each
if (a.legal) {
  // the legal pages are in their own language; on a site in that language they take its exact tag (de-DE, de-AT)
  const same = String(fill.LANG).toLowerCase().split('-')[0] === a.legal;
  for (const p of readdirSync(join(skill, 'assets/legal', a.legal))) {
    const text = put(readFileSync(join(skill, 'assets/legal', a.legal, p), 'utf8'), p);
    writeFileSync(join(dir, p), same ? text.replace(`<html lang="${a.legal}">`, `<html lang="${fill.LANG}">`) : text);
    pages.push(p);
  }
  const home = join(dir, 'index.html');
  writeFileSync(home, readFileSync(home, 'utf8').replace('<p>© <span data-year></span> <span translate="no">{{site.name}}</span></p>',
    '<p>© <span data-year></span> <span translate="no">{{site.name}}</span> · <a href="%BASE_URL%impressum.html">Impressum</a> · <a href="%BASE_URL%datenschutz.html">Datenschutz</a></p>'));
}

// the brand colour runs through the whole palette, so the page, the 404 and the icon agree from the start
if (a.theme) {
  const brand = rgbToOklch(hexToRgb(String(a.theme)));
  // a ground given as a colour is light or dark itself: it sets that scheme, and the other scheme keeps its own
  const start = moodDefaults(a.mood, { ground: a.ground && String(a.ground) });
  const ground = start.ground;
  const groundDark = ground && /^#/.test(ground) ? palette(brand, { ground }).dark : null;
  const pal = (mode) => palette(brand, { ...(mode && { mode }), ...(start.strategy && { strategy: start.strategy }), ...(ground && (groundDark === null || !mode || groundDark === (mode === 'dark')) && { ground }) });
  const t = tokens(pal());
  // the browser bar takes the page's ground, so it runs on from the page (the legal pages too); the icon keeps the
  // brand colour
  const bar = addons.includes('theme')
    ? ['light', 'dark'].map((m) => `<meta name="theme-color" content="${hex(pal(m).ground)}" media="(prefers-color-scheme: ${m})">`).join('\n  ')
    : `<meta name="theme-color" content="${hex(pal().ground)}">`;
  for (const f of pages) {
    const p = join(dir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/<meta name="theme-color" content="[^"]*">/, bar));
  }
  for (const f of ['src/tokens.css', 'public/404.html']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    let text = readFileSync(p, 'utf8');
    // the 404 page uses --accent only for its link, so it gets the shade that reads as text
    const set = f.endsWith('404.html') ? { ...t, accent: t['accent-text'] } : t;
    for (const [k, v] of Object.entries(set)) text = text.replace(new RegExp(`(--${k}:\\s*)oklch\\([^)]*\\)`), `$1${v}`);
    writeFileSync(p, text);
  }
}

// the theme addon: a visitor's saved light or dark is set before the first paint, on every page with the site's
// head, so none shows the other theme first (the line theme.js asks for)
if (addons.includes('theme')) {
  const saved = `<script>try{var t=localStorage.getItem('site-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>`;
  const main = '<script type="module" src="/src/main.js"></script>';
  for (const f of pages) {
    const p = join(dir, f);
    const text = readFileSync(p, 'utf8');
    if (!text.includes("getItem('site-theme')")) writeFileSync(p, text.replace(main, `${saved}\n  ${main}`));
  }
}

// 2. the check tools, so the site can check itself later
const tools = join(dir, 'tools/one-shot');
for (const p of [join(dir, 'tools'), tools, join(tools, 'lib')]) if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(p); // the same for a link here
mkdirSync(join(tools, 'lib'), { recursive: true });
for (const f of readdirSync(here)) if (f.endsWith('.mjs') && f !== 'new-site.mjs') cpSync(join(here, f), join(tools, f));
for (const f of readdirSync(join(here, 'lib'))) cpSync(join(here, 'lib', f), join(tools, 'lib', f));
cpSync(join(skill, 'LICENSE.txt'), join(tools, 'LICENSE.txt')); // MIT asks for the notice to travel with the code

// 3. extras
const deps = [];
if (addons.length) {
  mkdirSync(join(dir, 'src/addons'), { recursive: true });
  for (const n of addons) {
    for (const f of [ADDONS[n].file].flat()) cpSync(join(skill, 'assets/addons', f), join(dir, 'src/addons', f));
    deps.push(...ADDONS[n].deps);
  }
}

// 4. git and packages
// one command string through the shell: npm is a .cmd on Windows, and quoting is ours to control
const sh = (cmd, list) => spawnSync([cmd, ...list].join(' '), { cwd: dir, stdio: 'inherit', shell: true });
// a missing git was silent here, and the milestone commits failed later with no word why
const gi = existsSync(join(dir, '.git')) ? { status: 0 } : spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'inherit' });
if (gi.status !== 0) { console.error(gi.error?.code === 'ENOENT' ? 'git was not found, so the site has no history yet. Install it from https://git-scm.com/, then run "git init -b main" in the site folder.' : 'git init failed (its message is above).'); process.exitCode = 1; }
if (deps.length) {
  // recorded in package.json either way, so a later plain "npm install" brings them too
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const split = (d) => { const i = d.lastIndexOf('@'); return [d.slice(0, i), d.slice(i + 1)]; };
  pkg.dependencies = { ...pkg.dependencies, ...Object.fromEntries(deps.map(split)) };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}
// a failed install said so on stderr only, then "Run: npm run dev" and exit 0
let installFailed = false;
if (!a['no-install'] && sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']).status !== 0) { installFailed = true; process.exitCode = 1; }

// every placeholder still open, in any file, with where it goes
const WHERE = {
  URL: 'the address, set with set-url.mjs once it is known',
  DESCRIPTION: 'meta description in index.html (--description)',
  EMAIL: 'contact email in index.html (--email)',
  SCHEMA_TYPE: 'the type in site.json (--schema)',
  'site.type': 'what this is, for search engines: Person, Organization, LocalBusiness, Restaurant, Event… (--schema)',
  'site.email': 'the contact email in site.json (--email); the page links to it',
  'site.owner.name': 'the legal name of the person or business behind the site, for the Impressum (site.json "owner")',
  THEME_COLOR: 'theme-color meta and favicon.svg (--theme)',
  ICON_INK: 'letter colour in favicon.svg (--theme)',
};
const left = new Map();
const scan = (d) => {
  for (const f of readdirSync(d)) {
    if (['node_modules', 'tools', '.git', 'site-data.js'].includes(f)) continue; // site-data.js documents the syntax
    const p = join(d, f);
    if (statSync(p).isDirectory()) { scan(p); continue; }
    if (!/\.(html|css|js|json|txt|xml|svg)$/.test(f)) continue;
    const rel = relative(dir, p).replace(/\\/g, '/');
    for (const m of readFileSync(p, 'utf8').matchAll(/\{\{([A-Z_]+)\}\}/g)) left.set(m[1], new Set([...(left.get(m[1]) || []), rel]));
  }
};
scan(dir);
for (const k of ['type', 'email']) if (!facts[k]) left.set(`site.${k}`, new Set(['site.json']));
if (a.legal) left.set('site.owner.name', new Set(['site.json']));
console.log(`\nNew site in ${dir}`);
if (took.length) console.log(`From ${a.facts} into site.json: ${took.join(', ')}.`);
// what was set, and nothing that wasn't: a person's site has a country and no prices
const prices = facts.currency ? `, prices in ${facts.currency}` : '';
console.log(region ? `Country ${region} (from ${regionFrom})${prices}. Elsewhere? --country${prices && ' and --currency'}, or edit site.json.`
  : `Country not set${prices}. Give it with --country (like --country PT), or as address.country in site.json.`);
if (addons.length) console.log(`Extras copied to src/addons/. Wire them up in src/main.js:\n${addons.map((n) => ADDONS[n].use).join('\n')}`);
// and every site.json field left empty, the address's parts too, so none is forgotten
const empty = [], lists = [];
const look = (o, pre = '') => {
  for (const [k, v] of Object.entries(o)) {
    if (v === '' && !left.has(`site.${pre}${k}`)) empty.push(pre + k + ({ url: ' (set-url.mjs)', host: ' (set-url.mjs, for the free hosts)' }[pre + k] || ''));
    else if (Array.isArray(v)) { if (!v.length) lists.push(pre + k); } else if (v && typeof v === 'object') look(v, `${pre}${k}.`);
  }
};
look(facts);
const unfilled = [...(empty.length ? [`  site.json, empty: ${empty.join(', ')}`] : []), ...(lists.length ? [`  site.json, empty lists: ${lists.join(', ')} (fill the ones this site has)`] : [])];
if (left.size || unfilled.length) console.log(`Still to fill in:\n${[...[...left].map(([k, files]) => `  {{${k}}}: ${WHERE[k] || `write it in ${[...files].join(', ')}`}`), ...unfilled].join('\n')}`);
console.log(installFailed ? 'npm install FAILED (its message is above). Fix that, then run "npm install" before "npm run dev".' : 'Run: npm run dev   (then build the real page from the brief)');
