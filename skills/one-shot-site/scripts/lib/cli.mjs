// Tiny argument parser and report printer shared by the scripts.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The comment at the top of a script is its help: printed for --help (exit 0) or when the input is missing (exit 2).
// It also names every flag the script takes (see args).
function header(scriptUrl) {
  const head = [];
  for (const l of readFileSync(fileURLToPath(scriptUrl), 'utf8').split('\n')) {
    if (l.startsWith('#!')) continue;
    if (!l.startsWith('//')) break;
    head.push(l.replace(/^\/\/ ?/, ''));
  }
  return head.join('\n');
}

export function usage(scriptUrl, code = 2) {
  (code ? console.error : console.log)(header(scriptUrl));
  process.exit(code);
}

// Run as a command, not imported. Also through a symlink or junction (skill managers link skills into place): Node
// gives import.meta.url the real path but leaves argv[1] as typed, so comparing the two as they are says "imported"
// and the script prints nothing at all.
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  const [x, y] = [real(process.argv[1]), real(fileURLToPath(metaUrl))];
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// Flags that never take a value, so "--reduced dist" keeps dist as the folder.
const SWITCHES = new Set(['headed', 'compare', 'reduced', 'draft', 'external', 'lighthouse', 'dry', 'force', 'no-install', 'hero', 'json', 'help', 'numbers', 'video', 'big', 'check']);
// Flags that may stand alone or take a value (palette --sheet [folder]).
const OPTIONAL = new Set(['sheet']);

// node x.mjs dist --widths 390,1440 --headed  ->  { _: ['dist'], widths: '390,1440', headed: true }
// -h, and "help" in first place, are --help. Given the script's URL, a flag its header doesn't name stops the run
// (exit 2): "--pagess /about", or "--width 390" for --widths, ran the defaults and reported on pages and widths
// nobody asked about. So does any other flag with nothing after it: "--out" alone wrote to a folder called "true",
// and "--name --dry" printed --name true.
export function args(scriptUrl, argv = process.argv.slice(2)) {
  const out = { _: [] };
  const given = [], bare = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || (i === 0 && a === 'help')) { out.help = true; continue; }
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const k = eq < 0 ? a.slice(2) : a.slice(2, eq);
    given.push(k);
    if (eq >= 0) out[k] = a.slice(eq + 1); // only the first "=" splits: --url=https://x/?a=b stays whole
    else if (SWITCHES.has(k)) out[k] = true;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else { out[k] = true; if (!OPTIONAL.has(k)) bare.push(k); }
  }
  if (scriptUrl && !out.help) {
    const head = header(scriptUrl);
    const known = new Set(['help', ...[...head.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1])]);
    const bad = given.find((k) => !known.has(k));
    if (bad !== undefined) {
      const near = [...known].map((k) => [k, distance(bad, k)]).filter(([, d]) => d <= 2).sort((x, y) => x[1] - y[1])[0]?.[0];
      console.error(`Unknown option --${bad}${near ? ` (did you mean --${near}?)` : ''}. node ${basename(fileURLToPath(scriptUrl))} --help lists them.`);
      process.exit(2);
    }
    if (bare.length) {
      // the example in the header's usage lines (the indented ones), when they have one: --out .one-shot/look
      const usage = head.split('\n').filter((l) => /^\s/.test(l)).join('\n');
      const like = usage.match(new RegExp(`--${bare[0]}[ =]("[^"]*"|[^\\s\\]]+)`))?.[1];
      console.error(`--${bare[0]} needs a value after it${like && !like.startsWith('-') ? `, for example: --${bare[0]} ${like}` : '.'}`);
      process.exit(2);
    }
  }
  return out;
}

// edits between two words (Levenshtein), for the did-you-mean
function distance(x, y) {
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    row = next;
  }
  return row[y.length];
}

export function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  // text and bytes as they are; anything else as JSON
  writeFileSync(path, typeof data === 'string' || ArrayBuffer.isView(data) ? data : JSON.stringify(data, null, 2));
}

// Print findings grouped by level; returns the markdown text too.
export function report(title, findings, notes = []) {
  const fails = findings.filter((f) => f.level === 'fail');
  const warns = findings.filter((f) => f.level === 'warn');
  const line = (f) => `- [${f.rule}] ${f.text}${f.where ? `  (${f.where})` : ''}${f.at ? `  @ ${f.at}` : ''}`;
  const md = [
    `# ${title}`,
    '',
    fails.length ? `**${fails.length} to fix**, ${warns.length} to consider.` : warns.length ? `Nothing blocking. ${warns.length} to consider.` : 'All clear.',
    ...(fails.length ? ['', '## Fix', ...fails.map(line)] : []),
    ...(warns.length ? ['', '## Consider', ...warns.map(line)] : []),
    ...(notes.length ? ['', '## Notes', ...notes.map((n) => `- ${n}`)] : []),
    '',
  ].join('\n');
  console.log(md);
  return md;
}

// A page problem caught by the browser (see chrome.mjs) as a finding.
export function problem(p, at) {
  if (p.kind === 'intervention') return { level: 'warn', rule: 'browser-blocked', text: p.text, at };
  if (p.kind === 'http' || p.kind === 'network') return { level: 'fail', rule: 'request', text: p.text, at };
  return { level: 'fail', rule: 'script-error', text: p.text + (p.where ? ` (${p.where})` : ''), at };
}

// Git Bash on Windows turns an argument that starts with "/" into a path inside its own install folder
// ("/de/about" -> "C:/Program Files/Git/de/about"), so that prefix is cut off again.
export function unGitBash(p) {
  p = String(p).trim();
  // the usual install, scoop's (…\apps\git\current\) and the portable one
  if (/^[A-Za-z]:[\\/]/.test(p)) p = p.match(/[\\/](?:git[\\/]current|PortableGit|Git)[\\/](.+)$/i)?.[1] ?? p.split(/[\\/]/).pop();
  return p;
}

// "/", "index", "variant-a", "/about.html", "de/" all name a page, in any shell (see unGitBash)
export function pagePath(p) {
  p = unGitBash(p);
  p = p.replace(/\\/g, '/');
  p = p.replace(/^\/+/, '');
  if (!p || p === 'index' || p === 'index.html' || p === 'home') return '/';
  if (p.endsWith('/')) return '/' + p;
  return '/' + (/\.\w+$/.test(p) ? p : p + '.html');
}

// --scheme light|dark: the visitor's system setting, for sites that follow it (the theme addon). Absent = light,
// whatever the machine is set to. "-dark" goes on the default output name, so both runs keep their files.
export function colorScheme(a) {
  if (a.scheme === undefined) return { scheme: undefined, suffix: '' };
  if (a.scheme !== 'light' && a.scheme !== 'dark') throw new Error('--scheme takes light or dark');
  return { scheme: a.scheme, suffix: '-' + a.scheme };
}

// Where a run in a colour scheme writes: the suffix on the folder, or before a file's extension, on a name given with
// --out as on the default one, so a dark run never overwrites the light run's files. A name that has it already
// ("--out look-dark") keeps it once.
export function schemed(path, suffix, file = false) {
  if (!suffix) return path;
  const p = String(path).replace(/[\\/]+$/, '');
  const ext = file ? (p.match(/\.[^.\\/]+$/) || [''])[0] : '';
  const base = p.slice(0, p.length - ext.length);
  return base.endsWith(suffix) ? p : base + suffix + ext;
}

// schema.org types: an event, and the types with no shop front (no address or opening hours to expect). Every other
// type is a LocalBusiness or one of its kinds (a café, a plumber, a studio).
export const EVENT = /Event$|^Festival$/; // Event, MusicEvent, TheaterEvent, Festival…
export const NOT_LOCAL = /^(Person|Organization|Corporation|NGO|WebSite|WebPage|SoftwareApplication|MobileApplication|WebApplication|SoftwareSourceCode|VideoGame|Product|Service|CreativeWork|Book|Article|Blog|BlogPosting|Course|Dataset|Movie|MusicAlbum|MusicRecording|PodcastSeries|Recipe|MusicGroup|PerformingGroup|SportsTeam|ProfilePage|CollectionPage|AboutPage)$|Event$|^Festival$/;

// A number flag: its default when not given, else a number in range, or one line and exit 2. "--widths abc" looked
// at nothing and said "All clear"; "--seconds abc" put NaN in the report.
export function num(value, name, { def, min = -Infinity, max = Infinity, int = false, like = def } = {}) {
  if (value === undefined) return def;
  const n = typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (Number.isFinite(n) && n >= min && n <= max && (!int || Number.isInteger(n))) return n;
  throw new Error(`${name} takes ${int ? 'a whole number' : 'a number'} from ${min} to ${max}, like ${like} (got ${value === true ? 'nothing' : `"${value}"`})`);
}
// a list of them: --widths 390,1440
export function nums(value, name, { def, ...range } = {}) {
  if (value === undefined) return def;
  const list = String(value === true ? '' : value).split(',');
  try { return list.map((x) => num(x, name, range)); } catch {
    throw new Error(`${name} takes ${range.int ? 'whole numbers' : 'numbers'} from ${range.min} to ${range.max}, like ${def.join(',')} (got ${value === true ? 'nothing' : `"${value}"`})`);
  }
}

// [width, height] from an image file's header (a path or its bytes): PNG, JPEG, WebP, GIF. null if unknown.
export function imageSize(file) {
  const b = Buffer.isBuffer(file) ? file : readFileSync(file);
  if (b.length < 30) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

// Pages that exist only to be photographed (og.html) are not part of the site.
export const TOOL_PAGES = new Set(['/og.html', '/404.html']);
// A page that only sends visitors on (redesign.mjs redirects writes these at old addresses): checking it would check
// the page it lands on again.
// A refresh inside <noscript>, a comment or a script does not count: that page is a real one.
export const forwardsOnly = (html) => /<meta\b[^>]*http-equiv=["']?refresh/i.test(html.replace(/<!--[\s\S]*?-->|<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ''));

// Bad input or a broken setup: one line saying what went wrong, exit code 2. Exit code 1 stays reserved for
// "the check found faults". DEBUG=1 prints the full stack.
export function stopOnError() {
  const stop = (e) => {
    // a wrong path in plain words, not Node's "ENOENT: no such file or directory, scandir …"
    const why = e?.code === 'ENOTDIR' ? `Not a folder: ${e.path}`
      : e?.code === 'ENOENT' && /^(scandir|opendir|mkdir)$/.test(e.syscall) ? `No such folder: ${e.path}`
      : e?.code === 'ENOENT' && e.path && /^(open|stat|lstat|access|copyfile)$/.test(e.syscall) ? `Nothing at ${e.path}` : e?.message || e;
    console.error(`Stopped: ${why}`);
    if (process.env.DEBUG) console.error(e?.stack);
    process.exit(2);
  };
  process.on('uncaughtException', stop);
  process.on('unhandledRejection', stop);
}
