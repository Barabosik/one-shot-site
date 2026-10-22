// What makes page text read as filler or as machine-written. Sources: years of marketing-site clichés,
// and the patterns Wikipedia's editors collect for spotting generated text ("Signs of AI writing").
// None of these is proof on its own; together they make a visitor stop trusting the page.
// Matched case-insensitively on whole words.

// Marketing buzzwords: a claim with no content.
export const FILLER = [
  'unlock', 'unleash', 'elevate', 'elevated', 'elevating', 'empower', 'empowering', 'supercharge', 'revolutionize',
  'revolutionise', 'game-changer', 'game-changing', 'cutting-edge', 'state-of-the-art', 'next-level', 'world-class',
  'best-in-class', 'seamless', 'seamlessly', 'effortless', 'effortlessly', 'robust', 'leverage', 'synergy',
  'holistic', 'innovative', 'transformative', 'harness', 'streamline', 'unparalleled', 'bespoke', 'curated',
  'fast-paced', 'look no further', "we've got you covered", 'one-stop', 'trusted partner', 'passionate about',
  'take it to the next level', 'to the next level', 'crafted with', 'reimagine', 'reimagined', 'pixel-perfect',
  'blazing fast', 'blazingly fast', 'stunning', 'embark', 'journey',
];

// Words generated text leans on: inflated significance, travel-brochure gloss, vague "-ing" commentary.
export const INFLATED = [
  'delve', 'tapestry', 'testament', 'stands as', 'serves as a', 'pivotal', 'crucial', 'vibrant', 'nestled',
  'in the heart of', 'boasts', 'showcase', 'showcases', 'showcasing', 'underscore', 'underscores', 'underscoring',
  'highlighting', 'fostering', 'enduring', 'indelible', 'deeply rooted', 'rich heritage', 'rich history', 'renowned',
  'groundbreaking', 'diverse array', 'a commitment to', 'interplay', 'intricate', 'garner', 'resonate with',
  'valuable insights', 'multifaceted', 'ever-evolving', 'evolving landscape', 'digital landscape', 'realm',
  'meticulous', 'meticulously', "in today's", 'deep dive', 'dive into', 'more than just',
];

// Text that only appears when a chat answer was pasted in whole. Never ships.
export const CHAT_LEFTOVERS = /\b(Certainly!|Of course!|(?:I hope this helps|As an AI|as a large language model|Here is a (revised|draft|version)|Here's a (revised|draft|version)|Let me know if|Would you like me to|Feel free to (adjust|customize))\b)|contentReference|oaicite|\[cite:?\s*\d|INSERT_[A-Z_]+|\b\d{4}-XX-XX\b|\[(Your|Insert|Add) [^\]]{2,40}\]|\((Add|Insert) your [^)]{2,40}\)/gi;

// Button and link text that says nothing about where it goes.
export const VAGUE_ACTIONS = ['learn more', 'click here', 'read more', 'get started', 'discover more', 'find out more', 'submit', 'here'];

// Template leftovers: exact words, case-sensitive, so "write with your name" stays fine.
export const LEFTOVERS = /\{\{\s*[A-Z_ ]+\s*\}\}|\blorem ipsum\b|\bTODO\b|\bFIXME\b|(?<![\w.-])example\.com\b|\bYour Name\b|\bCompany Name\b|\bJohn Doe\b|\bJane Doe\b|\bAcme\b/g;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (list) => new RegExp(`(?<![\\w-])(${list.map(esc).join('|')})(?![\\w-])`, 'gi');
const FILLER_RE = words(FILLER);
const INFLATED_RE = words(INFLATED);

function tally(text, re) {
  const found = new Map();
  for (const m of text.matchAll(re)) { const w = m[1].toLowerCase(); found.set(w, (found.get(w) || 0) + 1); }
  return [...found].map(([w, n]) => (n > 1 ? `${w} ×${n}` : w)).join(', ');
}

// Plain-words findings for a block of visible text.
export function lintCopy(text) {
  const out = [];
  const add = (level, rule, msg) => out.push({ level, rule, text: msg });

  const filler = tally(text, FILLER_RE);
  if (filler) add('warn', 'filler-words', `Filler words: ${filler}. Say the concrete thing instead.`);
  const inflated = tally(text, INFLATED_RE);
  if (inflated) add('warn', 'ai-words', `Words that make text read as generated: ${inflated}. Use the plain verb ("has", "is", "shows") and a fact.`);

  // "not just X, but Y", "it's not X, it's Y", "no X, no Y, just Z"
  const contrast = text.match(/\b(not just|not only|isn't just|it's not about)\b[^.!?\n]{1,60}?\b(but|it's|it is)\b|\bno \w+[,.] no \w+[,.]? just\b/i);
  if (contrast) add('warn', 'not-just', `"${contrast[0].trim()}…": the set-up-and-reveal contrast is a generated-text habit. Just say what it is.`);

  // a comma, then an "-ing" phrase that comments on what was just said
  const tail = text.match(/, (highlighting|underscoring|emphasizing|emphasising|reflecting|showcasing|ensuring|fostering|cementing|solidifying|symbolizing|contributing to)\b[^.!?\n]{0,50}/i);
  if (tail) add('warn', 'ing-tail', `"…${tail[0].trim()}": a trailing "-ing" comment adds no fact. End the sentence earlier, or give the fact.`);

  const connectors = (text.match(/(^|[.!?]\s+)(Additionally|Moreover|Furthermore|In conclusion|In summary|Ultimately|Overall),/g) || []).length;
  if (connectors > 1) add('warn', 'connectors', `${connectors} sentences open with "Additionally", "Moreover", "Ultimately"… Web copy rarely needs them.`);

  const dashes = (text.match(/—/g) || []).length;
  const count = text.split(/\s+/).length;
  if (dashes > 2 && dashes > count / 250) add('warn', 'dashes', `${dashes} em dashes in ${count} words. Use commas, colons or full stops for most of them.`);

  const bangs = (text.match(/!(\s|$)/g) || []).length;
  if (bangs > 2) add('warn', 'exclamations', `${bangs} exclamation marks. One at most; let the facts carry the excitement.`);

  const chat = [...new Set((text.match(CHAT_LEFTOVERS) || []).map((s) => s.trim()))];
  if (chat.length) add('fail', 'chat-leftover', `Pasted chat-assistant text: ${chat.join(', ')}`);

  const left = [...new Set((text.match(LEFTOVERS) || []).map((s) => s.trim()))];
  if (left.length) add('fail', 'placeholder', `Placeholder text left in: ${left.join(', ')}`);
  return out;
}

// Headings in Title Case ("Our Story And Mission") read as generated or corporate; sentence case reads human.
// Short names and brands are fine, so only headings of four or more words count.
// Addresses that can never work: the reserved .example, .test and .invalid names, example.org and .net, and
// github.com/example. Fine in docs and tests; on a live site, a mail that bounces or a link that goes nowhere.
const MADE_UP = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.(?:example|test|invalid)\b|\bhttps?:\/\/[\w-]+(?:\.[\w-]+)*\.(?:example|test|invalid)\b[^\s"'<>]*|(?<![\w.-])example\.(?:org|net)\b|\bgithub\.com\/example\b[^\s"'<>]*/gi;
export function madeUp(text) {
  return [...new Set(String(text).match(MADE_UP) || [])].slice(0, 6);
}

// Title Case capitalises every word but the small ones, so a lowercase "see" or "us" means sentence case, and
// capitals at the end are a name: "Come and see us on Gloucester Road" is fine.
// Names don't count: days and months, which English capitalises in any case style ("Open Wednesday and Saturday"),
// and words the page itself capitalises in the middle of a sentence ("Free on Universal Credit"; see namesIn).
const MINOR = new Set('a an the and but or nor for so yet as at by in of on to up via per with from into onto over'.split(' '));
const CALENDAR = new Set(`
  monday tuesday wednesday thursday friday saturday sunday tues weds thur thurs sept
  january february march april may june july august september october november december
  montag dienstag mittwoch donnerstag freitag samstag sonnabend sonntag januar jänner februar märz mai juni juli oktober dezember
  lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril juin juillet août septembre octobre novembre décembre
  lunes martes miércoles jueves viernes sábado domingo enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre
  lunedì martedì mercoledì giovedì venerdì sabato domenica gennaio febbraio aprile maggio giugno luglio settembre ottobre dicembre
  maandag dinsdag woensdag donderdag vrijdag zaterdag zondag januari februari maart mei augustus
  segunda terça quarta quinta sexta janeiro fevereiro março maio junho julho setembro outubro novembro dezembro
`.trim().split(/\s+/));
const bare = (x) => x.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/['’]s$/, '').replace(/-feira$/, '');
export function titleCase(heading, names = new Set()) {
  const w = heading.trim().split(/\s+/).filter((x) => /^\p{L}/u.test(x));
  if (w.length < 4 || heading === heading.toUpperCase()) return false;
  if (w.slice(1).some((x) => /^\p{Ll}/u.test(x) && !MINOR.has(x.toLowerCase().replace(/\W+$/, '')))) return false;
  const long = w.slice(1).filter((x) => x.length > 3 && !CALENDAR.has(bare(x)) && !names.has(bare(x)));
  return long.length >= 2 && long.every((x) => /^\p{Lu}/u.test(x));
}

// every word of a text as titleCase compares them: the words of a book's title in a <cite> or <i> count as names
export const wordsIn = (text) => new Set(String(text || '').split(/\s+/).map(bare).filter(Boolean));

// Words a page writes with a capital in the middle of its own sentences are names: "if you're on Universal Credit",
// "on Gloucester Road". Only lines that read as sentences count (five words or more, most of them lowercase), so
// headings, menus and buttons, Title Case or not, add nothing.
// The headings' own lines are left out first: one of small words ("Coffee and Cake for the Rest of the Day")
// reads as a sentence and would lend itself its own capitals.
export function namesIn(text, headings = []) {
  const out = new Set();
  let t = String(text);
  for (const h of headings) if (h?.trim()) t = t.replace(new RegExp(`(^|\\n)[^\\S\\n]*${h.trim().split(/\s+/).map(esc).join('\\s+')}[^\\S\\n]*(?=\\n|$)`, 'g'), '$1');
  for (const line of t.split(/\n+/)) {
    const words = line.trim().split(/\s+/);
    if (words.length < 5 || words.filter((x) => /^\p{Ll}/u.test(x)).length * 2 < words.length) continue;
    for (let i = 1; i < words.length; i++) {
      if (/[.!?:…]["'”’)]*$/.test(words[i - 1])) continue; // a new sentence starts with a capital anyway
      if (/^["'“‘(]?\p{Lu}\p{Ll}/u.test(words[i])) out.add(bare(words[i]));
    }
  }
  return out;
}

export function vagueAction(label) {
  return VAGUE_ACTIONS.includes(label.trim().toLowerCase().replace(/[\s→›»>.]+$/, ''));
}
