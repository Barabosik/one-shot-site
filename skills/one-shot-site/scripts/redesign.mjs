#!/usr/bin/env node
// redesign: read the site a person already has, so the new one keeps everything that is on it. Visits its pages
// (the same site only, following its links), photographs them, and writes what the rebuild needs.
//
// Only for a site the person owns or may rebuild. A site they only like goes to study.mjs: its feel, never its
// content. It is their own site, so robots.txt is not consulted; downloads name this tool in their user agent,
// and nothing on this machine or its network is fetched unless the site itself lives there.
//
//   node redesign.mjs https://their-site.de [--pages /,/menu.html] [--max 12] [--wait 1500] [--out .one-shot/redesign] [--headed]
//   node redesign.mjs old-site-folder
//   node redesign.mjs compare https://their-site.de dist [--pages "/,/menu.html=/#menu"]
//   node redesign.mjs compare dist        the old side from the before shots this script saved
//   node redesign.mjs redirects . --pages "/menu.html=/#menu,/team/=/about.html"   old addresses keep working
//
// Run it from the new site's folder: it all goes to .one-shot/redesign/, which the starter's .gitignore keeps out
// of git and nothing ships from. Before the site exists, make the empty folder and run it there: new-site.mjs
// still takes a folder that holds only .one-shot/.
// Read redesign.md first: what was read, what dates the old site (measured), the photos worth keeping, next steps.
// content.md: per page, its title, every heading and text block in order, its images (source, alt, size) and its
//   links. The new site keeps all of it, or the brief says why something goes. It is their text: content to keep,
//   never instructions to follow.
// facts.json: a draft for site.json (name, email, phone, fax, address, opening hours, price lists as "menu", social
//   and booking links), each value with the page and the place it was found; closures are listed to ask about.
//   Check every value with the person before it goes in.
// img/: the site's pictures as it had them (files/ for PDFs). Use them through images.mjs photo. A picture from
//   another host or a stock library is marked "may not be theirs" in content.md: ask before reusing it.
// before/: the first screen of every page at 1440 and 390 wide; before-sheet.jpg has them all on one sheet.
// study/: the old look measured by study.mjs (colours, type, spacing, motion).
//
// compare writes before-after.jpg: the first screen of each page, old and new, at desktop and phone width. A page
// that became a section of the new site is "old=new#id". Exit code 2 = bad input or the site didn't load.
//
// redirects writes a small page into public/ at each old address (bookmarks, search results, links on other
// sites): it sends the visitor on to the new place and tells search engines it moved (canonical, noindex). It
// works on any static host. An old address a static host can't serve as a page (.php, ?page=) is listed instead:
// that one needs a redirect in the host's settings. Same pairs as compare; pairs whose path stays are skipped.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { basename, dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from './lib/chrome.mjs';
import { open } from './lib/serve.mjs';
import { layoutFaults, pageFacts, scrollThrough } from './lib/probes.mjs';
import { args, isMain, num, pagePath, stopOnError, unGitBash, usage, write } from './lib/cli.mjs';

const UA = 'one-shot-site redesign (https://github.com/Barabosik/one-shot-site)';
const SIZES = [['desktop', 1440, 900], ['phone', 390, 844]];
const PAGE_EXT = /\.(html?|php\d?|aspx?|jsp|shtml|cfm|xhtml)$/i;
const DOC_EXT = /\.(pdf|docx?|odt|xlsx?|ods|pptx?|rtf)$/i;
const TRACKING = /^(utm_\w+|fbclid|gclid|msclkid|mc_\w+|sid|phpsessid|jsessionid|ref)$/i;
const STOCK = /getty|shutterstock|istock|adobestock|stock\.adobe|unsplash|pexels|pixabay|fotolia|depositphotos|dreamstime|123rf|alamy/i;

// --- in the page ---------------------------------------------------------------------------------------------
// Everything a visitor can read on the page, in reading order, plus its pictures, links, forms and the signs of
// its age. Sent to the browser as source text, so it uses nothing from this file's scope.
async function readPage() {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'CANVAS', 'VIDEO', 'AUDIO', 'SELECT', 'OPTION', 'HEAD', 'TEXTAREA', 'MAP']);
  const BLOCKY = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,section,article,blockquote,dl,dt,dd,form,header,footer,nav,aside,address,figure,pre,center,main,fieldset,tr,td';
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const tidy = (s) => s.replace(/[ \t\r\f\v\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
  const linkShare = (el) => { const all = (el.innerText || '').length || 1; let l = 0; for (const a of el.querySelectorAll('a')) l += (a.innerText || '').length; return l / all; };
  // which part of the page: semantic tags first, then the names dated sites give their table cells and divs
  const region = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const t = e.tagName, role = e.getAttribute('role') || '';
      if (t === 'NAV' || role === 'navigation') return 'nav';
      if (t === 'FOOTER' || role === 'contentinfo') return 'footer';
      if (t === 'HEADER' && !e.closest('main, article, section')) return 'header';
      if (t === 'ASIDE' || role === 'complementary') return 'aside';
      if (t === 'MAIN' || role === 'main') return 'main';
      const n = `${e.id} ${typeof e.className === 'string' ? e.className : ''}`.toLowerCase();
      if (/(^|[\s_-])(nav|navi|navigation|navbar|topnav|mainmenu|hauptmenue|menuleiste)([\s_-]|$)/.test(n) && linkShare(e) > 0.5) return 'nav';
      if (/(^|[\s_-])(footer|fuss|fusszeile|foot|bottom)([\s_-]|$)/.test(n)) return 'footer';
      if (/(^|[\s_-])(header|kopf|kopfzeile|banner|masthead)([\s_-]|$)/.test(n)) return 'header';
      if (/(^|[\s_-])(sidebar|aside|seitenleiste|rechts|links-spalte)([\s_-]|$)/.test(n)) return 'aside';
    }
    return 'main';
  };
  // a table of data (hours, prices) and not a table holding the whole layout
  const dataTable = (t) => !t.querySelector('table, div, p, h1, h2, h3, ul, ol, form') && ![...t.querySelectorAll('img')].some((i) => i.width > 60);

  const blocks = [];
  const push = (tag, text, el) => {
    const t = tidy(text);
    if (!t) return;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
    blocks.push({ tag, text: t, region: region(el), ...(!/^h\d$/.test(tag) && size >= 20 && t.length < 90 && { size }) });
  };
  const visit = (el) => {
    if (SKIP.has(el.tagName) || !shown(el)) return;
    if (el.tagName === 'TABLE' && dataTable(el)) {
      for (const tr of el.rows) if (shown(tr)) push('tr', [...tr.cells].map((c) => tidy(c.innerText).replace(/\n/g, ' / ')).filter(Boolean).join(' | '), tr);
      return;
    }
    let buf = '', from = el;
    const flush = () => { push(el.tagName.toLowerCase(), buf, from); buf = ''; };
    for (const n of el.childNodes) {
      if (n.nodeType === 3) buf += n.data;
      else if (n.nodeType !== 1 || SKIP.has(n.tagName)) continue;
      else if (n.tagName === 'BR') buf += '\n';
      else if (!shown(n)) continue;
      else if (getComputedStyle(n).display.startsWith('inline') && !n.querySelector(BLOCKY)) {
        if (!buf.trim()) from = n; // the size of a heading made of <font size=5><b>…</b></font>
        buf += n.innerText;
      } else { flush(); from = el; visit(n); }
    }
    flush();
  };
  visit(document.body);

  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const pictures = [];
  for (const i of document.images) {
    const src = i.currentSrc || i.src;
    if (!src || src.startsWith('data:')) continue;
    const r = i.getBoundingClientRect();
    const near = `${src} ${i.alt} ${i.id} ${i.className} ${i.parentElement?.id || ''} ${i.parentElement?.className || ''}`;
    pictures.push({ src, alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight, shownW: Math.round(r.width), shownH: Math.round(r.height), region: region(i), ...(/logo/i.test(near) && { logo: true }), ...(!shown(i) && { hidden: true }) });
  }
  // pictures set as backgrounds (the banner of many dated sites); their size comes from loading them once more
  const bgs = [];
  for (const el of document.querySelectorAll('body, body *')) {
    const s = getComputedStyle(el);
    if (!s.backgroundImage.includes('url(')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 60) continue;
    for (const m of s.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) {
      const src = abs(m[1]);
      if (src && !src.startsWith('data:')) bgs.push({ src, alt: null, background: true, shownW: Math.round(r.width), shownH: Math.round(r.height), region: region(el) });
    }
  }
  await Promise.all(bgs.map((b) => new Promise((ok) => { const i = new Image(); i.onload = () => { b.w = i.naturalWidth; b.h = i.naturalHeight; ok(); }; i.onerror = ok; setTimeout(ok, 5000); i.src = b.src; })));

  const links = [...document.querySelectorAll('a[href], area[href]')].map((a) => ({
    text: tidy(a.innerText || a.getAttribute('alt') || a.querySelector('img')?.alt || a.title || '').replace(/\n/g, ' '),
    href: a.getAttribute('href').trim().toLowerCase().startsWith('javascript:') ? a.getAttribute('href').trim() : abs(a.getAttribute('href')),
    region: region(a),
  })).filter((l) => l.href);
  // a field's name as the visitor reads it: its label, or the words just before it ("Name: <input>")
  const before = (e) => { let t = e.previousSibling; while (t && t.nodeType === 3 && !t.data.trim()) t = t.previousSibling; return t?.nodeType === 3 ? t.data.trim().replace(/[:*]+$/, '') : ''; };
  const forms = [...document.forms].map((f) => ({
    action: f.getAttribute('action') ? abs(f.getAttribute('action')) : location.href,
    method: (f.method || 'get').toLowerCase(),
    fields: [...f.elements].filter((e) => !['hidden', 'submit', 'button', 'reset', 'image'].includes(e.type) && e.tagName !== 'BUTTON' && e.tagName !== 'FIELDSET')
      .map((e) => tidy(e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || before(e) || e.name || e.id || e.type).replace(/[:*]+$/, '')),
  }));
  const embeds = [...document.querySelectorAll('iframe[src], embed[src], object[data], video[src], video source[src], audio[src]')].map((e) => abs(e.getAttribute('src') || e.getAttribute('data'))).filter(Boolean);
  const frames = [...document.querySelectorAll('frame[src], iframe[src]')].map((f) => abs(f.getAttribute('src'))).filter(Boolean);

  const text = document.body?.innerText || '';
  const sizes = [...document.querySelectorAll('p, td, li, dd')].filter((e) => shown(e) && (e.innerText || '').trim().length > 40).map((e) => parseFloat(getComputedStyle(e).fontSize)).sort((x, y) => x - y);
  const years = [...text.matchAll(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]);
  const layoutTables = [...document.querySelectorAll('table')].filter((t) => !dataTable(t)).length;
  return {
    url: location.href,
    title: document.title.trim(),
    blocks, pictures: [...pictures, ...bgs], links, forms, embeds, frames,
    siteName: document.querySelector('meta[property="og:site_name"]')?.content || null,
    generator: document.querySelector('meta[name="generator" i]')?.content || null,
    dated: {
      viewport: !!document.querySelector('meta[name="viewport" i]'),
      layoutTables,
      oldTags: document.querySelectorAll('font, center, marquee, blink, frameset, frame, applet, bgsound, basefont, big, tt').length,
      flash: document.querySelectorAll('embed[type*="flash"], object[type*="flash"], embed[src$=".swf"], object[data$=".swf"]').length,
      copyright: years.length ? Math.max(...years) : null,
      bodySize: sizes.length ? sizes[Math.floor(sizes.length / 2)] : null,
      jquery: window.jQuery?.fn?.jquery || null,
      counter: /(besucherz[äa]hler|sie sind besucher|you are visitor|visitors? since|hit counter)/i.test(text),
      bestViewed: /(best viewed|optimiert f[üu]r|am besten (?:mit|bei)|resolution of \d{3,4}\s*x)/i.test(text),
      updated: text.match(/(?:last updated|zuletzt aktualisiert|letzte aktualisierung|stand)\s*:?\s*([\d./-]{6,10})/i)?.[1] || null,
    },
  };
}

// --- reading the facts out of the text (no browser; exported for the tests) ------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_WORDS = {
  en: [['monday', 'mon'], ['tuesday', 'tues', 'tue'], ['wednesday', 'wed'], ['thursday', 'thurs', 'thur', 'thu'], ['friday', 'fri'], ['saturday', 'sat'], ['sunday', 'sun']],
  de: [['montag', 'mo'], ['dienstag', 'di'], ['mittwoch', 'mi'], ['donnerstag', 'do'], ['freitag', 'fr'], ['samstag', 'sonnabend', 'sa'], ['sonntag', 'so']],
  fr: [['lundi', 'lun'], ['mardi', 'mar'], ['mercredi', 'mer'], ['jeudi', 'jeu'], ['vendredi', 'ven'], ['samedi', 'sam'], ['dimanche', 'dim']],
  nl: [['maandag', 'ma'], ['dinsdag', 'di'], ['woensdag', 'wo'], ['donderdag', 'do'], ['vrijdag', 'vr'], ['zaterdag', 'za'], ['zondag', 'zo']],
  es: [['lunes', 'lun'], ['martes', 'mar'], ['miércoles', 'miercoles', 'mié'], ['jueves', 'jue'], ['viernes', 'vie'], ['sábado', 'sabado', 'sáb'], ['domingo', 'dom']],
  it: [['lunedì', 'lunedi', 'lun'], ['martedì', 'martedi', 'mar'], ['mercoledì', 'mercoledi', 'mer'], ['giovedì', 'giovedi', 'gio'], ['venerdì', 'venerdi', 'ven'], ['sabato', 'sab'], ['domenica', 'dom']],
};
const dayTable = (lang) => {
  const l = String(lang || '').slice(0, 2).toLowerCase();
  const words = new Map();
  for (const k of DAY_WORDS[l] && l !== 'en' ? [l, 'en'] : ['en', 'de']) DAY_WORDS[k].forEach((list, i) => list.forEach((w) => { if (!words.has(w)) words.set(w, i); }));
  const alt = [...words.keys()].sort((x, y) => y.length - x.length).join('|');
  return { words, re: new RegExp(`(?<!\\p{L})(${alt})\\.?(?!\\p{L})`, 'giu') };
};
const TIME = String.raw`(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|uhr|h)?`;
const RANGE = new RegExp(`(?<![\\d.:])${TIME}\\s*(?:-|–|—|bis|to|until|till|à|a|al|alle|tot)\\s*${TIME}(?![\\d])`, 'giu');
const DAY_RANGE = /^\s*(?:-|–|—|bis|to|through|thru|till|au|à|a|al|t\/m|tot)\s*$/i;
const pad = (n) => String(n).padStart(2, '0');

function clock(h, m, ap) {
  h = +h; m = +(m || 0);
  ap = String(ap || '').toLowerCase().replace(/[.\s]/g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h <= 24 && m < 60 ? { h, m, ap } : null;
}

// "Mo–Fr 7–18 Uhr, Sa 8–13 Uhr" -> [{ days: 'Mon-Fri', opens: '07:00', closes: '18:00' }, { days: 'Sat', … }]
// Days with no time ("Montag Ruhetag") give no row: in site.json, days not listed show as closed.
export function parseHours(text, lang = '') {
  const { words, re } = dayTable(lang);
  const toks = [];
  for (const m of String(text).matchAll(RANGE)) {
    const o = clock(m[1], m[2], m[3]), c = clock(m[4], m[5], m[6]);
    if (!o || !c) continue;
    if (!c.ap && c.h <= 12 && c.h * 60 + c.m <= o.h * 60 + o.m) c.h += 12; // "7-6" means until six in the evening
    if (c.h * 60 + c.m <= o.h * 60 + o.m || c.h > 24) continue;
    toks.push({ at: m.index, end: m.index + m[0].length, opens: `${pad(o.h)}:${pad(o.m)}`, closes: `${pad(c.h)}:${pad(c.m)}` });
  }
  for (const m of String(text).matchAll(re)) {
    if (toks.some((t) => t.opens && m.index < t.end && m.index + m[0].length > t.at)) continue;
    toks.push({ at: m.index, end: m.index + m[0].length, day: words.get(m[1].toLowerCase()) });
  }
  toks.sort((x, y) => x.at - y.at);
  const rows = [];
  let days = [], timed = false, lastEnd = 0;
  for (const t of toks) {
    if (t.day !== undefined) {
      if (timed) { days = []; timed = false; }
      if (days.length && DAY_RANGE.test(text.slice(lastEnd, t.at))) {
        for (let d = (days[days.length - 1] + 1) % 7, n = 0; n < 7; d = (d + 1) % 7, n++) { days.push(d); if (d === t.day) break; }
      } else if (!days.includes(t.day)) days.push(t.day);
      lastEnd = t.end;
    } else if (days.length) {
      rows.push({ days: dayList(days), opens: t.opens, closes: t.closes });
      timed = true;
    }
  }
  return rows;
}

// [0, 1, 2, 3, 4] -> "Mon-Fri"; [0, 2] -> "Mon, Wed"; [5, 6, 0] -> "Sat-Mon"
function dayList(days) {
  const runs = [];
  for (const d of days) {
    const r = runs[runs.length - 1];
    if (r && (r[r.length - 1] + 1) % 7 === d) r.push(d); else runs.push([d]);
  }
  return runs.map((r) => (r.length > 1 ? `${DAYS[r[0]]}-${DAYS[r[r.length - 1]]}` : DAYS[r[0]])).join(', ');
}

const SOCIAL = [
  ['instagram', /(^|\.)instagram\.\w+$/], ['facebook', /(^|\.)(facebook\.\w+|fb\.com|fb\.me)$/], ['x', /(^|\.)(twitter\.\w+|x\.com)$/],
  ['tiktok', /(^|\.)tiktok\.\w+$/], ['youtube', /(^|\.)(youtube\.\w+|youtu\.be)$/], ['linkedin', /(^|\.)linkedin\.\w+$/],
  ['pinterest', /(^|\.)pinterest\.\w+$/], ['xing', /(^|\.)xing\.com$/], ['threads', /(^|\.)threads\.net$/], ['bluesky', /(^|\.)bsky\.app$/],
  ['mastodon', /(^|\.)(mastodon\.\w+|mstdn\.\w+)$/], ['github', /(^|\.)github\.com$/], ['bandcamp', /(^|\.)bandcamp\.com$/],
  ['soundcloud', /(^|\.)soundcloud\.com$/], ['spotify', /(^|\.)spotify\.com$/], ['vimeo', /(^|\.)vimeo\.com$/],
  ['whatsapp', /(^|\.)(wa\.me|whatsapp\.com)$/], ['tripadvisor', /(^|\.)tripadvisor\.\w+$/], ['yelp', /(^|\.)yelp\.\w+$/],
];
const BOOKING = /(^|\.)(opentable|resy|quandoo|thefork|lafourchette|bookatable|resmio|treatwell|fresha|booksy|calendly|doctolib|shore|planity|eventbrite|tickettailor|eventim|reservix|ticketmaster|cal|simplybook|timify|etermin|acuityscheduling|setmore|exploretock|sevenrooms|dish|aleno|formitable)\.\w+$/;
const PAYMENT = /(^|\.)(paypal\.me|paypal\.com|ko-fi\.com|buymeacoffee\.com|patreon\.com|buy\.stripe\.com|sumup\.\w+|betterplace\.org|gofundme\.com)$/;
const MAPS = /(^|\.)(maps\.google\.\w+|goo\.gl|maps\.app\.goo\.gl|openstreetmap\.org|maps\.apple\.com|bing\.com)$|google\.\w+\/maps|^maps\./;
const GENERIC = /^(home|homepage|startseite|start|willkommen|herzlich willkommen|welcome|index|hauptseite|accueil|inicio|benvenuti|aktuelles|news)$/i;
const PHONE_LABEL = /(?<!\p{L})(?:tel(?:efon)?|phone|fon|ruf|call|mobil|handy|t[ée]l[ée]phone|telefoon|tel[ée]fono)\.?[ \t]*:?[ \t]*(\+?\(?\d[\d \t/().–-]{5,}\d)/giu;
// each starts where a word starts: tried from every letter of a long run, they took minutes on a big page
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const OBFUSCATED = /(?<![\w.+-])([\w.+-]+)\s*[[(]\s*(?:at|ät|@)\s*[\])]\s*([\w-]+(?:\s*(?:[[(]\s*(?:dot|punkt|point)\s*[\])]|\.)\s*[\w-]+)+)/gi;
const ADDRESS = [
  // Lindenstraße 14, 66111 Saarbrücken · Rue du Port 3, 1003 Lausanne
  [/((?:\p{Lu}[\p{L}'’.-]*\s){0,3}\p{L}[\p{L}'’.-]*\s\d{1,4}\s?[a-zA-Z]?)\s*(?:,|\n|·|•|\||\/|–|-)?\s*(?:[A-Z]{1,2}-)?(\d{4,5})\s+(\p{Lu}[\p{L}.'’-]*(?:[ -]\p{Lu}[\p{L}.'’-]*)?)/u, (m) => ({ street: m[1].trim(), postcode: m[2], city: m[3].trim() })],
  // 12 High Street, Bristol BS1 4DJ
  [/(\d{1,4}[a-z]?\s(?:\p{Lu}[\p{L}'’.-]*\s?){1,4}),\s*(\p{Lu}[\p{L}'’ .-]{1,30}?),?\s+([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/u, (m) => ({ street: m[1].trim(), city: m[2].trim(), postcode: m[3] })],
  // 120 Main St, Springfield, IL 62701
  [/(\d{1,5}\s(?:[\p{L}0-9'’.-]+\s?){1,5}),\s*(\p{Lu}[\p{L}'’ .-]{1,30}?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/u, (m) => ({ street: m[1].trim(), city: m[2].trim(), region: m[3], postcode: m[4] })],
];
const COUNTRY_TLD = { de: 'DE', at: 'AT', ch: 'CH', uk: 'GB', fr: 'FR', nl: 'NL', be: 'BE', it: 'IT', es: 'ES', pt: 'PT', dk: 'DK', se: 'SE', no: 'NO', fi: 'FI', pl: 'PL', cz: 'CZ', ie: 'IE', lu: 'LU' };
const FAX = /(?<!\p{L})(?:tele)?fax\.?[ \t]*:?[ \t]*(\+?\(?\d[\d \t/().–-]{5,}\d)/giu;
const CLOSURE = /betriebsferien|betriebsurlaub|urlaub|geschlossen|closed|holiday|vacances|ferm[ée]|vakantie|gesloten|chiuso|cerrado|vacaciones/i;
// "31.07.", "30/07", "30. Juli", "30th July", "July 30th"
const MONTH = '(?:jan|feb|m[äa]r|apr|ma[iy]|jun|jul|aug|sep|o[ck]t|nov|de[cz])';
const MONTH_FIRST = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b`;
const DATE = new RegExp(String.raw`\b\d{1,2}\.\s?(?:0?[1-9]|1[0-2])\.|\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|[12]\d|3[01])\b|\b\d{1,2}(?:\.|st|nd|rd|th)?\s+${MONTH}|\b${MONTH_FIRST}\.?\s+\d{1,2}(?:st|nd|rd|th)?\b`, 'i');
// a price as old sites write it, with a currency on one side: "49,00 €", "€ 2.40", "ab 12,00 €", "15,- DM"
const FROM = String.raw`(?:ab|from|von|à partir de|dès|vanaf|desde|da|a partire da)\s+`;
const PRICE = new RegExp(String.raw`^(${FROM})?(€|EUR|£|\$|CHF|Fr\.)?\s*(\d{1,3}(?:[.' ]\d{3})+|\d+)(?:[.,](\d{1,2}|-|–))?\s*(€|EUR|Euro|£|\$|CHF|Fr\.|DM)?$`, 'i');
// a line of a price list: "Inspektion komplett 49,00 €", "Espresso ....... 2,40", "Kette: ab 10 €"
const PRICE_LINE = new RegExp(String.raw`^(.*\p{L}.*?)[\s.…:–—-]+((?:${FROM})?(?:(?:€|EUR|£|\$|CHF|Fr\.)?\s*\d[\d.,' ]*(?:[-–])?\s*(?:€|EUR|Euro|£|\$|CHF|Fr\.|DM)?|\d{1,2}\s?p))$`, 'iu');
// "85p": pence, the way shops in Britain write a price under a pound
const PENCE = new RegExp(String.raw`^(${FROM})?(\d{1,2})\s?p$`, 'i');
const CURRENCY = { '€': 'EUR', eur: 'EUR', euro: 'EUR', '£': 'GBP', $: 'USD', chf: 'CHF', 'fr.': 'CHF', dm: 'DM' };

// "49,00 €" -> { price: "49.00", currency: "EUR", plain: true }, "85p" -> "0.85" in GBP; "ab 12,00 €" keeps its
// words, so plain: false
export function readPrice(s) {
  const t = String(s).trim(), m = t.match(PRICE), p = t.match(PENCE);
  if (p) return { price: p[1] ? t : `0.${p[2].padStart(2, '0')}`, currency: 'GBP', plain: !p[1] };
  if (!m || !(m[2] || m[5])) return null;
  const whole = m[3].replace(/[.' ]/g, '');
  return { price: m[1] ? t : m[4] && /\d/.test(m[4]) ? `${whole}.${m[4].padEnd(2, '0')}` : whole, currency: CURRENCY[(m[2] || m[5]).toLowerCase()], plain: !m[1] };
}

// pages: [{ path, title, lang, description, siteName, blocks, links, ld }] -> { draft, found, check }
export function findFacts(pages, { host = '' } = {}) {
  const found = { name: [], email: [], phone: [], fax: [], address: [], hours: [], closed: [], links: {}, map: [] };
  const menu = []; // price lists: { section, path, where, items }
  // weight: structured data and links say more than a guess from the text
  const note = (list, value, where, key = String(value).toLowerCase(), weight = /JSON-LD|link|og:site_name/.test(where) ? 2 : 1) => {
    let c = list.find((x) => x.key === key);
    if (!c) list.push(c = { key, value, found: [], score: 0 });
    if (!c.found.includes(where)) { c.found.push(where); c.score += weight; }
  };
  // a name as they'd write it on a letter: "~*~ Gasthaus Zur Linde ~*~" and "*** X ***" lose the trimmings
  const noteName = (value, where) => {
    const v = String(value).replace(/^[\s~*+=#_|•·:–—-]+|[\s~*+=#_|•·:–—-]+$/g, '').trim();
    if (v) note(found.name, v, where);
  };
  // one number written two ways ("030 / 123 45 67", "+49301234567") is one number
  const phoneKey = (s) => String(s).replace(/\D/g, '').slice(-8);
  const at = (p, place) => `${p.path}, ${place}`;
  const titles = pages.map((p) => p.title || '').filter(Boolean);
  const parts = (t) => t.split(/\s+[|–—·•»:\-/]\s+|\s*::\s*/).map((s) => s.trim()).filter((s) => s && !GENERIC.test(s));
  const lang = pages.find((p) => p.lang)?.lang || '';

  for (const p of pages) {
    const sameAs = [];
    if (p.siteName) noteName(p.siteName, at(p, 'og:site_name'));
    for (const t of parts(p.title || '')) if (titles.length < 2 || titles.filter((x) => x.includes(t)).length > titles.length / 2) noteName(t, at(p, '<title>'));
    const home = p.path === pages[0].path;
    if (home) {
      const h1 = p.blocks.find((b) => b.tag === 'h1')?.text;
      if (h1 && h1.length < 40 && !GENERIC.test(h1) && !/willkommen|welcome|bienvenue/i.test(h1)) noteName(h1, at(p, 'h1'));
      for (const im of p.pictures || []) if (im.logo && im.alt && !/^logo$/i.test(im.alt.trim())) noteName(im.alt.replace(/\s*logo\s*/i, ' ').trim(), at(p, 'logo alt text'));
    }
    // structured data the old site already had
    for (const d of p.ld || []) {
      const type = [d['@type']].flat()[0];
      if (!type || /^(WebPage|BreadcrumbList|ImageObject|SearchAction)$/.test(type)) continue;
      if (d.name) noteName(d.name, at(p, `JSON-LD ${type}`));
      if (d.email) note(found.email, String(d.email).replace(/^mailto:/i, '').toLowerCase(), at(p, 'JSON-LD'));
      if (d.telephone) note(found.phone, d.telephone, at(p, 'JSON-LD'), phoneKey(d.telephone));
      const ad = d.address && typeof d.address === 'object' ? d.address : null;
      if (ad) note(found.address, { street: ad.streetAddress, postcode: ad.postalCode, city: ad.addressLocality, country: ad.addressCountry?.name || ad.addressCountry }, at(p, 'JSON-LD'), `${ad.streetAddress} ${ad.postalCode}`.toLowerCase());
      for (const s of [d.openingHours].flat().filter(Boolean)) note(found.hours, { text: s, rows: parseHours(s, 'en') }, at(p, 'JSON-LD'), s);
      for (const s of [d.openingHoursSpecification].flat().filter(Boolean)) {
        const days = [s.dayOfWeek].flat().map((x) => DAYS.findIndex((d) => String(x).includes(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][DAYS.indexOf(d)])));
        if (s.opens && s.closes && days.every((x) => x >= 0)) note(found.hours, { text: `${days.map((x) => DAYS[x]).join(', ')} ${s.opens}-${s.closes}`, rows: [{ days: dayList(days), opens: s.opens.slice(0, 5), closes: s.closes.slice(0, 5) }] }, at(p, 'JSON-LD'));
      }
      for (const u of [d.sameAs].flat().filter(Boolean)) sameAs.push({ text: '', href: u, region: 'JSON-LD' });
      if (type && !found.type) found.type = type;
    }

    let section = '';
    for (const b of p.blocks) {
      const where = at(p, b.region === 'main' ? `${b.tag}` : `${b.region} ${b.tag}`);
      // the first 20,000 characters of a block: the address and price patterns slow down with the square of its
      // length (a block of a megabyte took minutes), and no contact line sits further in
      const text = b.text.slice(0, 20000);
      for (const m of text.matchAll(FAX)) note(found.fax, m[1].trim(), at(p, `${b.region} text`), phoneKey(m[1]));
      if (CLOSURE.test(text) && DATE.test(text)) { const t = text.replace(/\n/g, ' '); note(found.closed, t.length > 140 ? t.slice(0, 139) + '…' : t, where); }
      // a price list: table rows, or lines that end in a price, under the heading (or "Preise:" line) above them
      const one = text.replace(/\n/g, ' ').trim();
      if (b.tag !== 'tr' && one.length < 50 && (/^h[1-4]$/.test(b.tag) || b.size || /:$/.test(one))) section = one.replace(/\s*:$/, '');
      const items = (b.tag === 'tr' ? [text.split(' | ')] : text.split('\n').map((l) => l.trim().match(PRICE_LINE)?.slice(1)).filter(Boolean))
        .map((cells) => ({ cells, got: cells.length > 1 && /\p{L}/u.test(cells[0]) && readPrice(cells.at(-1)) })).filter((x) => x.got);
      // a paragraph counts when it holds a list (two lines or more): one price in a sentence is news, not a list
      if (items.length && b.region !== 'nav' && (b.tag === 'tr' || /^(li|dd)$/.test(b.tag) || items.length > 1)) {
        const name = section || p.title || p.path;
        let s = menu.find((x) => x.section === name && x.path === p.path);
        if (!s) menu.push(s = { section: name, path: p.path, where: at(p, b.tag === 'tr' ? 'table' : b.tag), items: [] });
        for (const { cells, got } of items) s.items.push({ name: cells[0].trim(), ...got, ...(cells.length > 2 && { note: cells.slice(1, -1).join(' · ') }) });
      }
      for (const m of text.matchAll(EMAIL)) note(found.email, m[0].replace(/\.$/, '').toLowerCase(), at(p, `${b.region} text`));
      for (const m of text.matchAll(OBFUSCATED)) note(found.email, `${m[1]}@${m[2].replace(/\s*[[(]\s*(?:dot|punkt|point)\s*[\])]\s*/gi, '.').replace(/\s+/g, '')}`.toLowerCase(), at(p, `${b.region} text, written as "${m[0]}"`));
      for (const m of text.matchAll(PHONE_LABEL)) {
        if (/fax/i.test(text.slice(Math.max(0, m.index - 8), m.index + 6))) continue;
        const digits = m[1].replace(/\D/g, '');
        if (digits.length >= 6 && digits.length <= 15) note(found.phone, m[1].trim().replace(/[\s–-]+$/, ''), at(p, `${b.region} text`), phoneKey(digits));
      }
      const flat = text.replace(/\n/g, ', ');
      for (const [re, make] of ADDRESS) {
        const m = flat.match(re);
        if (m) { const v = make(m); note(found.address, v, at(p, `${b.region} text`), `${v.street} ${v.postcode}`.toLowerCase().replace(/\s+/g, ' ')); break; }
      }
      // opening hours: each line (or table row) that names a day and a time
      for (const line of text.split('\n')) {
        const l = line.replace(/\s*\|\s*/g, ' ');
        const rows = parseHours(l, lang);
        if (rows.length) note(found.hours, { text: line.trim(), rows }, where, l.trim().toLowerCase());
      }
    }
    for (const l of [...p.links, ...sameAs]) {
      const href = String(l.href);
      if (/^mailto:/i.test(href)) { const e = safeDecode(href.slice(7).split('?')[0]).toLowerCase(); if (e.includes('@')) note(found.email, e, at(p, `${l.region} mailto link`)); continue; }
      if (/^tel:/i.test(href)) {
        const shown = /\d{3}/.test(l.text) && l.text.replace(/\D/g, '').length >= 6 ? l.text : safeDecode(href.slice(4));
        note(found.phone, shown.trim(), at(p, `${l.region} tel link`), phoneKey(safeDecode(href.slice(4))));
        continue;
      }
      let u;
      try { u = new URL(href); } catch { continue; }
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') === host) continue;
      const h = u.hostname.replace(/^www\./, '');
      const social = SOCIAL.find(([, re]) => re.test(h));
      const kind = social ? social[0] : BOOKING.test(h) || /(reserv|booking|book-?now|buchen|termin|tisch|tickets?)/i.test(u.pathname + ' ' + l.text) ? 'booking' : PAYMENT.test(h) ? 'payment' : MAPS.test(h) || MAPS.test(h + u.pathname) ? 'map' : null;
      if (!kind) continue;
      if (kind === 'map') { note(found.map, href, at(p, `${l.region} link "${l.text}"`)); continue; }
      if (/\/(sharer|share|intent|plugins|dialog)\b/.test(u.pathname)) continue; // share buttons, not their profile
      note(found.links[kind] ||= [], href.replace(/\/$/, ''), at(p, `${l.region} link${l.text ? ` "${l.text}"` : ''}`), href.replace(/\/$/, '').toLowerCase());
    }
  }

  const ranked = (list) => list.sort((x, y) => y.score - x.score).map(({ value, found: f }) => ({ value, found: f }));
  const out = {};
  for (const k of ['name', 'email', 'phone', 'fax', 'address', 'hours', 'closed', 'map']) out[k] = ranked(found[k]);
  // one price alone is a sentence ("the check for only 39 €"); a list has two or more
  const lists = menu.filter((s) => s.items.length > 1);
  out.menu = lists.map(({ section, where, items }) => ({ section, found: [where], items: items.map(({ currency, plain, ...i }) => i) }));
  out.links = Object.fromEntries(Object.entries(found.links).map(([k, v]) => [k, ranked(v)]));
  // the site's own domain first among emails
  if (host) out.email.sort((x, y) => (y.value.endsWith('@' + host) ? 1 : 0) - (x.value.endsWith('@' + host) ? 1 : 0));

  // one set of hours for the draft: each day from the source found most often, and a note where pages disagree
  const check = [];
  const perDay = Array(7).fill(null);
  const clashes = [];
  for (const c of out.hours) {
    const mine = Array.from({ length: 7 }, () => []);
    for (const r of c.value.rows) for (const d of expand(r.days)) mine[d].push(`${r.opens}-${r.closes}`);
    mine.forEach((spans, d) => {
      if (!spans.length) return;
      const key = [...new Set(spans)].sort().join(', ');
      if (!perDay[d]) perDay[d] = { key, where: c.found[0] };
      else if (perDay[d].key !== key && !clashes.some((x) => x.d === d)) clashes.push({ d, a: perDay[d], b: { key, where: c.found[0] } });
    });
  }
  const hours = [];
  for (let d = 0; d < 7; d++) {
    if (!perDay[d]) continue;
    let e = d;
    while (e + 1 < 7 && perDay[e + 1]?.key === perDay[d].key) e++;
    for (const span of perDay[d].key.split(', ')) { const [opens, closes] = span.split('-'); hours.push({ days: e > d ? `${DAYS[d]}-${DAYS[e]}` : DAYS[d], opens, closes }); }
    d = e;
  }
  if (clashes.length) check.push(`The pages give different opening hours: ${clashes.map((x) => `${DAYS[x.d]} ${x.a.key} (${x.a.where}) or ${x.b.key} (${x.b.where})`).join('; ')}. Ask which is right.`);
  if (out.email.length > 1) check.push(`${out.email.length} email addresses: ${out.email.map((e) => e.value).join(', ')}. Ask which one visitors should use.`);
  if (out.phone.length > 1) check.push(`${out.phone.length} phone numbers: ${out.phone.map((e) => e.value).join(', ')}. Ask which ones still work.`);
  if (out.address.length > 1) check.push(`${out.address.length} addresses: ${out.address.map((e) => Object.values(e.value).filter(Boolean).join(' ')).join(' / ')}. Ask which is current.`);
  if (out.fax.length) check.push(`A fax number: ${out.fax.map((e) => `${e.value} (${e.found[0]})`).join(', ')}. Ask whether anyone still faxes them: if so it stays in the draft as "fax" ({{site.fax}}), if not it goes.`);
  for (const c of out.closed) check.push(`A closure on the old site: "${c.value}" (${c.found[0]}). Ask about this year's; dates go in "closed".`);
  const items = lists.flatMap((s) => s.items);
  const currencies = [...new Set(items.map((i) => i.currency))];
  if (items.length) check.push(`${items.length} prices in the draft's "menu" (${lists.map((s) => `"${s.section}", ${s.where}`).join('; ')}). Prices go out of date first: ask for today's.`);
  const worded = items.filter((i) => !i.plain);
  if (worded.length) check.push(`Kept as written, not a plain number: ${worded.map((i) => `"${i.price}" (${i.name})`).join(', ')}.`);
  if (currencies.includes('DM')) check.push('Prices in DM: that list is from before 2002. Ask for today\'s, in euros.');
  else if (currencies.length > 1) check.push(`Prices in ${currencies.join(' and ')}: ask which one the site uses.`);

  const tld = host.split('.').pop();
  const country = COUNTRY_TLD[tld] || (lang.includes('-') ? lang.split('-')[1].toUpperCase() : undefined);
  const addr = out.address[0]?.value;
  const description = pages[0]?.description;
  const draft = {
    ...(out.name[0] && { name: out.name[0].value }),
    ...(found.type && { type: found.type }),
    ...(description && { description }),
    ...(out.email[0] && { email: out.email[0].value }),
    ...(out.phone[0] && { phone: out.phone[0].value }),
    ...(out.fax[0] && { fax: out.fax[0].value }),
    ...(addr && { address: Object.fromEntries(Object.entries({ ...addr, country: addr.country || country }).filter(([, v]) => v)) }),
    ...(hours.length && { hours }),
    ...(currencies.length === 1 && currencies[0] !== 'DM' && { currency: currencies[0] }),
    ...(lists.length && { menu: lists.map(({ section, items: list }) => ({ section, items: list.map(({ name, price, note: n }) => ({ name, price, ...(n && { note: n }) })) })) }),
    ...(Object.keys(out.links).length && { links: Object.fromEntries(Object.entries(out.links).map(([k, v]) => [k, v[0].value])) }),
  };
  return { draft, found: out, check };
}

// "Mon-Fri, Sun" -> [0, 1, 2, 3, 4, 6]
function expand(days) {
  const out = [];
  for (const part of days.split(/,\s*/)) {
    const [a, b] = part.split('-').map((d) => DAYS.indexOf(d));
    if (b === undefined) out.push(a);
    else for (let d = a, n = 0; n < 7; d = (d + 1) % 7, n++) { out.push(d); if (d === b) break; }
  }
  return out;
}

// --- paths and names ------------------------------------------------------------------------------------------

// "old=new" from --pages, split at the last "=": the old address may be /index.php?page=menu
export const pairOf = (s) => { const i = s.lastIndexOf('='); return (i < 0 ? [s] : [s.slice(0, i), s.slice(i + 1)]).map((x) => x.trim()); };

// a path as typed: Git Bash on Windows turns "/x" into "C:/Program Files/Git/x", and scoop's or the portable Git into
// their own folders (cli.mjs unGitBash, as look's --pages)
export const typed = (p) => {
  p = unGitBash(p);
  return '/' + p.replace(/\\/g, '/').replace(/^\/+/, '');
};
// an old site's own path, decoded where it can be: "Gr%F6%DFe.jpg" (Latin-1, from an old German site) is no
// UTF-8 and stopped the run before anything was written
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// a path a shell would act on ($(…), a quote, a backtick): never printed into a command to run
const unsafe = (s) => /[$`"\\]/.test(s);
// one key per page: "/", "/index.html" and "/index.php" are the home page; tracking parameters don't count
export function pageKey(u) {
  const x = new URL(u);
  const q = [...x.searchParams].filter(([k]) => !TRACKING.test(k));
  const path = x.pathname.replace(/\/index\.(html?|php\d?|aspx?|shtml)$/i, '/') || '/';
  return path + (q.length ? '?' + new URLSearchParams(q) : '');
}
export const slugOf = (key) => (key === '/' ? 'home' : key.replace(/^\/|\.(html?|php\d?|aspx?|jsp|shtml|cfm|xhtml)$/gi, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page');
const bare = (h) => h.replace(/^www\./, '');
// bytes as they came (cli's write() is for text and JSON)
const save = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// a sheet of pictures, photographed in the browser (the HTML is removed again)
async function sheet(browser, dir, name, body) {
  const html = join(dir, name + '.html');
  write(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#1d1d1f;font:600 15px system-ui;color:#ddd}
    h1{font-size:19px;margin:0 0 6px} p.sub{margin:0 0 18px;color:#999;font-weight:500} h2{font-size:15px;margin:0 0 8px;color:#ccc;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .g{display:grid;gap:14px;align-items:start} figure{margin:0} img{width:100%;display:block;outline:1px solid #444}
    figcaption{margin-top:5px;color:#999;font-weight:500;font-size:13px} .pair{margin-bottom:26px} .mark{color:#ff2d75}</style>${body}`);
  const page = await browser.newPage({ width: 1600, height: 900 });
  await page.goto(pathToFileURL(html).href);
  await page.eval('Promise.all([...document.images].map((i) => i.decode().catch(() => 0)))');
  const height = await page.eval('document.documentElement.scrollHeight');
  await page.shot(join(dir, name + '.jpg'), { quality: 80, clip: { x: 0, y: 0, width: 1600, height: Math.min(height, 9000) } });
  await page.close();
  rmSync(html, { force: true });
  return join(dir, name + '.jpg');
}

// the first screen of a page, at one size; "#id" scrolls that section to the top first
async function firstScreen(browser, url, file, [, w, h], wait) {
  const page = await browser.newPage({ width: w, height: h, mobile: w < 600, scale: 1 });
  const hash = new URL(url).hash;
  await page.goto(url);
  await sleep(wait);
  if (hash) {
    await page.eval(`(() => { const e = document.getElementById(${JSON.stringify(safeDecode(hash.slice(1)))}); if (e) e.scrollIntoView({ block: 'start', behavior: 'instant' }); return 1; })()`);
    await sleep(600);
  }
  await page.shot(file, { quality: 80 });
  return page;
}

const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : b.slice(0, 3).toString() === 'GIF' ? 'gif'
  : b.slice(8, 12).toString() === 'WEBP' ? 'webp' : b.slice(4, 12).toString().startsWith('ftypavi') ? 'avif' : /<svg[\s>]/.test(b.slice(0, 600).toString()) ? 'svg' : null);

// this machine and the local network: never fetched, unless the site being read is itself local. As address ranges,
// not spellings: "[::ffff:7f00:1]" is 127.0.0.1 too (BlockList checks an IPv4 address written as IPv6 against
// the IPv4 ranges).
const LOCAL = new BlockList();
for (const [a, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15]]) LOCAL.addSubnet(a, n, 'ipv4');
for (const [a, n] of [['::', 96], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10]]) LOCAL.addSubnet(a, n, 'ipv6');
export const privateHost = (host) => {
  const h = String(host).replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const v = isIP(h);
  return v ? LOCAL.check(h, v === 4 ? 'ipv4' : 'ipv6') : /^(localhost|.+\.localhost)$/i.test(h);
};
// every address the name has, not only the first
async function privateAddress(url) {
  const { hostname } = new URL(url);
  if (privateHost(hostname)) return true;
  try { return (await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true })).some((x) => privateHost(x.address)); } catch { return false; } // unknown name: fetch fails by itself
}

// at most max bytes, read as they come: a size given up front is checked first, a body that runs over is cut off.
// Redirects are followed by hand, so none of them leads to a private address either.
export async function download(url, max, { local = false } = {}) {
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (!/^https?:/.test(url)) return { error: 'not a web address' };
      if (!local && (await privateAddress(url))) return { error: 'a private or local address, not fetched' };
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { await res.body?.cancel(); url = new URL(res.headers.get('location'), url).href; continue; }
      if (!res.ok) { await res.body?.cancel(); return { error: `${res.status}` }; }
      const size = +res.headers.get('content-length') || 0;
      if (size > max) { await res.body?.cancel(); return { error: `${Math.round(size / 1e6)} MB, too big` }; }
      const chunks = [];
      let got = 0;
      for await (const c of res.body || []) {
        got += c.length;
        if (got > max) return { error: `over ${Math.round(max / 1e6)} MB, too big` }; // leaving the loop cancels the rest
        chunks.push(c);
      }
      return { data: Buffer.concat(chunks) };
    }
    return { error: 'too many redirects' };
  } catch (e) { return { error: e.message }; }
}

// --- read the old site ------------------------------------------------------------------------------------------

async function read(a) {
  const target = a._[0];
  const out = resolve(a.out || '.one-shot/redesign');
  const max = num(a.max, '--max', { def: 12, min: 1, max: 40, int: true });
  const wait = num(a.wait, '--wait', { def: 1500, min: 0, max: 60000, int: true });
  if (!/^https?:\/\//.test(target) && !existsSync(target)) { console.error(`Nothing at ${target}. Pass their site's address (https://…) or the folder it is in.`); process.exit(2); }
  const site = await open(target, { index: false }); // an old site may start at index.htm
  const start = /^https?:\/\//.test(target) ? target : site.url + '/';
  // a folder, or a site on this machine or network: then its own pictures may come from local addresses too
  const local = !/^https?:\/\//.test(target) || privateHost(new URL(target).hostname);
  for (const d of ['before', 'img', 'files']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(join(out, 'before'), { recursive: true });

  let host = bare(new URL(start).hostname);
  const queue = a.pages ? String(a.pages).split(',').map((p) => new URL(typed(p), start).href) : [start];
  const seen = new Set(queue.map(pageKey));
  const pages = [], skipped = [], documents = new Map(), broken = [];
  const slugs = new Set();
  const browser = await launch({ headed: !!a.headed });
  try {
    while (queue.length && pages.length < max) {
      const url = queue.shift();
      const key = pageKey(url);
      let slug = slugOf(key);
      for (let i = 2; slugs.has(slug); i++) slug = `${slugOf(key)}-${i}`;
      const shots = {};
      let data, facts, faults = [], problems = [];
      try {
        for (const size of SIZES) {
          const file = join(out, 'before', `${slug}-${size[0]}.jpg`);
          const page = await firstScreen(browser, url, file, size, wait);
          // a dead link: the server's "not found" page is not one of their pages
          const dead = page.problems.find((p) => p.kind === 'http' && pageKey(p.text.split(' ')[1] || 'http://x/?') === key);
          if (dead) { await page.close(); rmSync(file, { force: true }); throw new Error(`the server answers ${dead.text.split(' ')[0]}`); }
          shots[size[0]] = `before/${slug}-${size[0]}.jpg`;
          await page.call(scrollThrough, 100);
          if (size[0] === 'desktop') { data = await page.call(readPage); facts = await page.call(pageFacts); }
          else faults = await page.call(layoutFaults, size[1]);
          problems.push(...page.problems.filter((p) => !/\/favicon\.ico$/.test(p.text)));
          await page.close();
        }
      } catch (e) {
        if (!pages.length) throw e;
        broken.push(`${key}: ${e.message}`);
        continue;
      }
      if (!pages.length) host = bare(new URL(data.url).hostname); // after a redirect to www or https
      // a link that redirects to a page already read (/home.html -> /) is that page
      if (pages.some((p) => p.path === pageKey(data.url))) { for (const f of Object.values(shots)) rmSync(join(out, f), { force: true }); continue; }
      slugs.add(slug);
      pages.push({ path: pageKey(data.url), url: data.url, slug, title: data.title, lang: facts.lang, description: facts.description, siteName: data.siteName, generator: data.generator,
        blocks: data.blocks, pictures: data.pictures, links: data.links, forms: data.forms, embeds: data.embeds, ld: facts.ldData, dated: data.dated,
        icon: facts.icon, faults: faults.map((f) => f.rule), problems: [...new Set(problems.map((p) => p.text))], shots });
      seen.add(pageKey(data.url));
      console.error(`Read ${key} (${data.blocks.length} text blocks, ${data.pictures.length} pictures)`);
      // follow the site's own links, in the order they appear
      for (const href of [...data.links.map((l) => l.href), ...data.frames]) {
        let u;
        try { u = new URL(href); } catch { continue; }
        if (!/^https?:$/.test(u.protocol) || bare(u.hostname) !== host) continue;
        if (DOC_EXT.test(u.pathname)) { if (!documents.has(u.href.split('#')[0])) documents.set(u.href.split('#')[0], key); continue; }
        const last = u.pathname.split('/').pop();
        if (last.includes('.') && !PAGE_EXT.test(last)) continue;
        const k = pageKey(u.href);
        if (seen.has(k)) continue;
        seen.add(k);
        u.hash = '';
        if (a.pages) continue;
        queue.push(u.href);
      }
    }
    skipped.push(...queue.map(pageKey));

    // the before sheet: every page's first screen at desktop and phone width, two pages to a row
    const cols = SIZES.map(([, w, h]) => `${(w / h).toFixed(3)}fr`).join(' ');
    const cell = (p) => `<div class="pair"><h2>${esc(p.path)} · ${esc(p.title)}</h2><div class="g" style="grid-template-columns:${cols}">${SIZES.map(([k]) => `<figure><img src="${p.shots[k]}"></figure>`).join('')}</div></div>`;
    await sheet(browser, out, 'before-sheet', `<h1>Before: ${esc(/^https?:\/\//.test(target) ? host : basename(resolve(target)))}</h1><p class="sub">${pages.length} pages as they are today, the first screen at 1440 and 390 wide</p>
      <div class="g" style="grid-template-columns:1fr 1fr;column-gap:28px">${pages.map(cell).join('')}</div>`);
  } finally {
    await browser.close();
  }

  // their pictures and documents, as files the rebuild can use
  const pics = new Map();
  for (const p of pages) for (const im of p.pictures) {
    if (!pics.has(im.src)) pics.set(im.src, { ...im, pages: [] });
    const x = pics.get(im.src);
    x.pages.push(p.path);
    x.w ||= im.w; x.h ||= im.h;
  }
  // a picture from another host or a stock library may be licensed, not theirs: it gets asked about, not reused
  for (const im of pics.values()) {
    const from = (() => { try { return bare(new URL(im.src).hostname); } catch { return ''; } })();
    if (STOCK.test(im.src)) im.doubt = 'from a stock photo site';
    else if (from !== host) im.doubt = `hosted on ${from}`;
  }
  const names = new Set();
  const nameFor = (u, ext, dir) => {
    let base = safeDecode(new URL(u).pathname.split('/').pop() || '').replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'file';
    let n = `${base}.${ext}`;
    for (let i = 2; names.has(dir + n); i++) n = `${base}-${i}.${ext}`;
    names.add(dir + n);
    return n;
  };
  let saved = 0;
  for (const im of pics.values()) {
    if (im.w && im.h && (Math.max(im.w, im.h) < 64 || im.w * im.h < 4000)) { im.skip = 'too small (a spacer, bullet or icon)'; continue; }
    if (saved >= 80) { im.skip = 'over 80 pictures, not saved'; continue; }
    const got = await download(im.src, 15e6, { local });
    const ext = got.data && sniff(got.data);
    if (!ext) { im.skip = got.error ? `could not download (${got.error})` : 'not a picture'; continue; }
    im.file = `img/${nameFor(im.src, ext, 'img/')}`;
    save(join(out, im.file), got.data);
    im.kb = Math.round(got.data.length / 1024);
    saved++;
  }
  const docs = [];
  for (const [u, from] of [...documents].slice(0, 12)) {
    const got = await download(u, 25e6, { local });
    const ext = (u.match(DOC_EXT)?.[1] || 'bin').toLowerCase();
    const d = { url: u, from, ...(got.data ? { file: `files/${nameFor(u, ext, 'files/')}`, kb: Math.round(got.data.length / 1024) } : { skip: got.error }) };
    if (got.data) save(join(out, d.file), got.data);
    docs.push(d);
  }

  // the old look, measured the same way as a site they like. Not spawnSync: a folder is served from this process.
  const study = await new Promise((ok) => {
    const p = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'study.mjs'), pages[0].url, '--out', join(out, 'study')]);
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    p.on('close', (status) => ok({ status, text }));
  });
  await site.close();

  const facts = findFacts(pages, { host: /^https?:\/\//.test(target) ? host : '' });
  const relOf = (u) => { try { const x = new URL(u); return bare(x.hostname) === host ? x.pathname + x.search + x.hash : u; } catch { return u; } };
  write(join(out, 'facts.json'), {
    note: `A draft for site.json, read from ${target} on ${new Date().toISOString().slice(0, 10)}. Old sites go out of date: check every value with the person before it goes into site.json.`,
    draft: facts.draft, check: facts.check, found: facts.found,
  });
  write(join(out, 'inventory.json'), { target, host, read: new Date().toISOString(), pages: pages.map(({ ld, ...p }) => p), pictures: [...pics.values()], documents: docs, skipped, broken });
  write(join(out, 'content.md'), contentMd(target, pages, pics, docs, relOf));
  const md = summary({ target, out, pages, pics, docs, facts, skipped, broken, study: study.status === 0 ? null : study.text.trim().split('\n').pop() });
  write(join(out, 'redesign.md'), md);
  console.log(md);
}

// content.md: the inventory, page by page. What appears on most pages (navigation, footer) is listed once.
function contentMd(target, pages, pics, docs, relOf) {
  const blockKey = (b) => `${b.tag}|${b.text}`;
  const linkKey = (l) => `${l.text}|${l.href}`;
  // on more than half the pages in the header, nav or footer; or on every one of three or more pages, wherever
  // it sits (dated sites rarely name their parts)
  const common = (list, key) => {
    if (pages.length < 2) return new Set();
    const count = new Map();
    for (const p of pages) for (const [k, x] of new Map(list(p).map((x) => [key(x), x]))) {
      const c = count.get(k) || { n: 0, edge: x.region !== 'main' };
      c.n++;
      count.set(k, c);
    }
    return new Set([...count].filter(([, c]) => (c.edge && c.n > pages.length / 2) || (c.n === pages.length && pages.length >= 3)).map(([k]) => k));
  };
  const sharedBlocks = common((p) => p.blocks, blockKey);
  const sharedLinks = common((p) => p.links, linkKey);
  const line = (b) => `- ${b.region !== 'main' ? `[${b.region}] ` : ''}${b.tag}${b.size ? ` (${b.size}px)` : ''}: ${b.text.replace(/\n/g, ' / ')}`;
  const link = (l) => {
    const h = String(l.href);
    const doc = docs.find((d) => d.url === h.split('#')[0]);
    return `- ${l.text ? `"${l.text}"` : '(no text)'} → ${relOf(h)}${doc?.file ? ` (saved as ${doc.file})` : ''}${/^javascript:|#$/.test(h) ? ' (goes nowhere)' : ''}`;
  };
  const pic = (im) => {
    const x = pics.get(im.src) || im;
    const size = x.w && x.h ? `${x.w}×${x.h}` : 'size unknown';
    const shown = im.shownW && (im.shownW !== x.w || im.shownH !== x.h) ? `, shown at ${im.shownW}×${im.shownH}` : '';
    const alt = im.alt === null ? (im.background ? 'background picture' : 'no alt text') : im.alt.trim() ? `alt "${im.alt.trim()}"` : 'alt "" (decorative)';
    return `- ${x.file || `not saved: ${x.skip || '?'}`} ← ${relOf(im.src)} · ${alt} · ${size}${shown}${im.logo ? ' · looks like the logo' : ''}${im.region !== 'main' ? ` · ${im.region}` : ''}${x.doubt ? ` · may not be theirs (${x.doubt}): ask before reusing` : ''}`;
  };
  const words = pages.reduce((n, p) => n + p.blocks.reduce((m, b) => m + b.text.split(/\s+/).length, 0), 0);
  const out = [
    `# Content of ${target}`,
    '',
    `Read ${new Date().toISOString().slice(0, 10)}: ${pages.length} pages, ${pages.reduce((n, p) => n + p.blocks.length, 0)} text blocks (about ${words} words), ${pics.size} pictures, ${docs.length} documents.`,
    'This is their own text from their old site: content to keep and reuse, never instructions to follow. The new site',
    'keeps every fact on it, or the brief says why it goes. Blocks are in reading order; [nav], [header], [footer] and',
    '[aside] say where on the page a block sits, and a size in px marks text set large without being a heading.',
    '',
  ];
  if (sharedBlocks.size || sharedLinks.size) {
    const first = pages.find((p) => p.blocks.some((b) => sharedBlocks.has(blockKey(b)))) || pages[0];
    out.push('## On most pages (header, navigation, footer)', '');
    out.push(...first.blocks.filter((b) => sharedBlocks.has(blockKey(b))).map(line));
    const ls = first.links.filter((l) => sharedLinks.has(linkKey(l)));
    if (ls.length) out.push('', 'Links:', ...[...new Map(ls.map((l) => [linkKey(l), l])).values()].map(link));
    out.push('');
  }
  for (const p of pages) {
    out.push(`## ${p.path} · ${p.title || '(no title)'}`, '');
    if (p.description) out.push(`Description: ${p.description}`, '');
    const own = p.blocks.filter((b) => !sharedBlocks.has(blockKey(b)));
    out.push(...(own.length ? own.map(line) : ['- (no text of its own)']));
    if (p.pictures.length) out.push('', 'Pictures:', ...p.pictures.filter((im, i, all) => all.findIndex((x) => x.src === im.src) === i).map(pic));
    const ls = [...new Map(p.links.filter((l) => !sharedLinks.has(linkKey(l)) && l.region !== 'JSON-LD').map((l) => [linkKey(l), l])).values()];
    if (ls.length) out.push('', 'Links:', ...ls.map(link));
    for (const f of p.forms) out.push('', `Form: ${f.fields.filter(Boolean).join(', ') || 'no fields'} (sends to ${relOf(f.action)}, ${f.method.toUpperCase()})`);
    if (p.embeds.length) out.push('', `Embedded: ${[...new Set(p.embeds.map(relOf))].join(', ')}`);
    out.push('');
  }
  if (docs.length) out.push('## Documents', '', ...docs.map((d) => `- ${relOf(d.url)} (linked from ${d.from})${d.file ? ` → ${d.file}, ${d.kb} KB. Read it: menus and price lists often live only here.` : ` not saved: ${d.skip}`}`), '');
  return out.join('\n');
}

// redesign.md: what was read, what dates it, what to keep, and the way on
function summary({ target, out, pages, pics, docs, facts, skipped, broken, study }) {
  const n = (k) => pages.filter(k).length;
  const list = (k) => pages.filter(k).map((p) => p.path).join(', ');
  const year = new Date().getFullYear();
  const dated = [];
  if (n((p) => !p.dated.viewport)) dated.push(`No viewport tag on ${list((p) => !p.dated.viewport)}: phones show the desktop page shrunk to fit.`);
  const rules = new Map();
  for (const p of pages) for (const r of new Set(p.faults)) rules.set(r, [...(rules.get(r) || []), p.path]);
  const say = { 'overflow-x': 'scrolls sideways', 'tiny-text': 'has text under 12px', 'small-body': 'has body text under 15px', 'tap-target': 'has links too small to tap', edge: 'has text touching the edge', contrast: 'has text with too little contrast', 'broken-image': 'has broken pictures', 'long-headline': 'has headlines over three lines' };
  const phone = [...rules].filter(([r]) => say[r]).map(([r, ps]) => `${say[r]} (${ps.length === pages.length && ps.length > 1 ? 'every page' : ps.join(', ')})`);
  if (phone.length) dated.push(`At 390px wide the site ${phone.join(', ')}.`);
  const tables = pages.reduce((s, p) => s + p.dated.layoutTables, 0);
  if (tables) dated.push(`Laid out with tables (${tables} on ${n((p) => p.dated.layoutTables)} pages).`);
  const old = pages.reduce((s, p) => s + p.dated.oldTags, 0);
  if (old) dated.push(`${old} old HTML tags (font, center, marquee, frames…).`);
  if (n((p) => p.dated.flash)) dated.push(`Flash on ${list((p) => p.dated.flash)}: no browser plays it any more.`);
  const gen = [...new Set(pages.map((p) => p.generator).filter(Boolean))];
  if (gen.length) dated.push(`Made with ${gen.join(', ')}.`);
  const years = pages.map((p) => p.dated.copyright).filter(Boolean);
  if (years.length && Math.max(...years) < year - 1) dated.push(`The newest copyright year on it is ${Math.max(...years)}.`);
  const upd = pages.map((p) => p.dated.updated).find(Boolean);
  if (upd) dated.push(`It says it was last updated ${upd}.`);
  const sizes = pages.map((p) => p.dated.bodySize).filter(Boolean).sort((x, y) => x - y);
  if (sizes.length && sizes[Math.floor(sizes.length / 2)] < 15) dated.push(`Body text is ${sizes[Math.floor(sizes.length / 2)]}px on a desktop screen (16 to 18 reads well).`);
  const jq = pages.map((p) => p.dated.jquery).find(Boolean);
  if (jq && +jq.split('.')[0] < 3) dated.push(`jQuery ${jq}.`);
  if (pages.some((p) => p.dated.counter)) dated.push('A visitor counter.');
  if (pages.some((p) => p.dated.bestViewed)) dated.push('A "best viewed with" note.');
  if (/^http:\/\//.test(target) && !/^http:\/\/(localhost|127\.|\[::1\])/.test(target)) dated.push('No https: browsers mark it "not secure".');
  const noAlt = [...pics.values()].filter((im) => im.alt === null && !im.background).length;
  if (noAlt) dated.push(`${noAlt} of ${pics.size} pictures have no alt text.`);
  const problems = [...new Set(pages.flatMap((p) => p.problems))];
  if (problems.length) dated.push(`Broken: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ` and ${problems.length - 6} more` : ''}.`);
  if (broken.length) dated.push(`Pages that would not open: ${broken.join('; ')}.`);
  const dead = pages.flatMap((p) => p.links.filter((l) => /^javascript:|#$/.test(String(l.href)) && l.text).map((l) => `"${l.text}" on ${p.path}`));
  if (dead.length) dated.push(`Links that go nowhere: ${[...new Set(dead)].slice(0, 5).join(', ')}.`);

  const photos = [...pics.values()].filter((im) => im.file && !im.doubt && !/\.svg$/.test(im.file)).sort((x, y) => (y.w * y.h || 0) - (x.w * x.h || 0));
  const doubtful = [...pics.values()].filter((im) => im.file && im.doubt);
  const logo = [...pics.values()].find((im) => im.logo && im.file && !im.doubt);
  const fit = (im) => (im.w >= 1600 ? 'big enough for a full-width picture' : im.w >= 800 ? 'fine for half the width or a card' : 'small: a detail or a thumbnail, never full width');
  const d = facts.draft;
  const blocks = pages.reduce((s, p) => s + p.blocks.length, 0);
  return [
    `# Redesign: ${target}`,
    '',
    `Read ${pages.length} page${pages.length > 1 ? 's' : ''}: ${pages.map((p) => p.path).join(', ')}.${skipped.length ? ` Not read (over --max): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}.` : ''}`,
    '',
    'Files, in this folder:',
    `- before-sheet.jpg: every page today, desktop and phone. Show it to the person. Single shots in before/.`,
    `- content.md: ${blocks} text blocks, every picture and link, page by page. The rebuild keeps all of it, or says why not.`,
    `- facts.json: a draft for site.json${d.name ? ` (${['name', 'email', 'phone', 'fax', 'address', 'hours', 'menu', 'links'].filter((k) => d[k]).join(', ')})` : ''}, each value with where it was found.`,
    `- img/: ${[...pics.values()].filter((im) => im.file).length} pictures from the site${doubtful.length ? `, ${doubtful.length} of them maybe not theirs (below)` : ''}.${docs.some((x) => x.file) ? ` files/: ${docs.filter((x) => x.file).length} documents (read them).` : ''}`,
    study ? `- study/: the look could not be measured (${study}).` : '- study/study.md: the old look measured (colours, type, spacing, motion). On their own site, their name, words, logo and photos are theirs to keep; the note there about not copying is for other people\'s sites.',
    '',
    '## What dates it',
    '',
    ...(dated.length ? dated.map((x) => `- ${x}`) : ['- Nothing the scripts can measure. Look at the sheet: the faults may be in the design and the words.']),
    '',
    '## Worth keeping',
    '',
    ...(logo ? [`- The logo: ${logo.file} (${logo.w}×${logo.h}). For its colour: palette.mjs --logo ${join(out, logo.file).replace(/\\/g, '/')}`] : []),
    ...photos.filter((im) => im !== logo).slice(0, 8).map((im) => `- ${im.file}: ${im.w}×${im.h}, ${fit(im)}${im.alt ? `, "${im.alt.trim()}"` : ''}`),
    ...(photos.length > 8 ? [`- and ${photos.length - 8} more in content.md`] : []),
    ...(doubtful.length ? [`- Ask before reusing: ${doubtful.slice(0, 6).map((im) => `${im.file} (${im.doubt})`).join(', ')}${doubtful.length > 6 ? ` and ${doubtful.length - 6} more` : ''}. Pictures from another host or a stock library may be licensed to the old site, not theirs to keep.`] : []),
    `- Their words: content.md. Rewrite for the web where it helps (copy.md), but keep every fact, price and name.`,
    '',
    '## Check with the person',
    '',
    ...(facts.check.length ? facts.check.map((x) => `- ${x}`) : []),
    `- Every value in facts.json: old sites go out of date. Ask in one list, with what the site says now as the answer to confirm.`,
    '',
    '## Next',
    '',
    '1. Show before-sheet.jpg. In two lines: what you would keep, and what dates it.',
    '2. Brief: the facts and the sections come from content.md; every page of the old site becomes a section or a page of the new one, or the brief says why it goes.',
    '3. Show three directions: mockup.mjs --concepts concepts.json, with their name and their words.',
    `4. After the build: node SKILL_DIR/scripts/redesign.mjs compare ${target} dist`,
    '',
  ].join('\n');
}

// --- compare: before and after ------------------------------------------------------------------------------------

async function compare(a) {
  const [oldTarget, newTarget] = a._.length >= 3 ? a._.slice(1, 3) : [null, a._[1]];
  if (!newTarget) { console.error('redesign compare needs the old site and the new folder: redesign.mjs compare https://their-site.de dist\n'); usage(import.meta.url); }
  const out = resolve(a.out || '.one-shot/redesign');
  const inv = existsSync(join(out, 'inventory.json')) ? JSON.parse(readFileSync(join(out, 'inventory.json'), 'utf8')) : null;
  if (!oldTarget && !inv) { console.error(`No before shots in ${out}. Run redesign.mjs on the old site first, or pass it: redesign.mjs compare <old site> ${newTarget}`); process.exit(2); }
  const wait = num(a.wait, '--wait', { def: 1500, min: 0, max: 60000, int: true });
  const neu = await open(newTarget);
  const old = oldTarget ? await open(oldTarget, { index: false }) : null;
  const oldBase = old ? (/^https?:\/\//.test(oldTarget) ? oldTarget : old.url + '/') : null;
  // pairs: "old=new#id"; without one, the old site's pages that the new one has under the same path
  const want = a.pages ? String(a.pages).split(',').map(pairOf) : (inv?.pages.map((p) => [p.path]) || [['/']]);
  const pairs = [], missing = [];
  for (const [o, nw] of want) {
    const oldPath = typed(o);
    if (!nw && oldPath.includes('?')) { missing.push(oldPath); continue; } // index.php?page=menu has no twin by name
    const newPath = nw ? (nw.trim().startsWith('#') ? '/' + nw.trim() : nw.includes('#') ? pagePath(nw.split('#')[0]) + '#' + nw.split('#')[1] : pagePath(nw)) : oldPath === '/' ? '/' : pagePath(oldPath.replace(/\.(php\d?|aspx?|jsp|shtml|cfm|htm)$/i, '.html'));
    const newUrl = neu.url + newPath;
    let ok = true;
    try { ok = (await fetch(newUrl.split('#')[0], { signal: AbortSignal.timeout(20000) })).ok; } catch { ok = false; }
    if (!ok) { missing.push(oldPath); continue; }
    const saved = inv?.pages.find((p) => p.path === pageKey(new URL(oldPath, 'http://x').href));
    if (!old && !saved) { missing.push(oldPath); continue; }
    pairs.push({ oldPath, newPath, newUrl, saved });
  }
  if (!pairs.length) { console.error(`None of these pages is in ${newTarget}: ${missing.join(', ')}. Name the pairs: --pages "/=/,/old-page.html=/#section"`); await neu.close(); await old?.close(); process.exitCode = 2; return; }

  const dir = join(out, 'compare');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await launch({ headed: !!a.headed });
  try {
    for (const [i, p] of pairs.entries()) {
      for (const size of SIZES) {
        const after = join(dir, `${i}-after-${size[0]}.jpg`);
        await (await firstScreen(browser, p.newUrl, after, size, wait)).close();
        p[`after-${size[0]}`] = `compare/${i}-after-${size[0]}.jpg`;
        if (old) {
          await (await firstScreen(browser, new URL(p.oldPath.slice(1), oldBase).href, join(dir, `${i}-before-${size[0]}.jpg`), size, wait)).close();
          p[`before-${size[0]}`] = `compare/${i}-before-${size[0]}.jpg`;
        } else p[`before-${size[0]}`] = p.saved.shots[size[0]];
      }
    }
    const cols = [...SIZES, ...SIZES].map(([, w, h]) => `${(w / h).toFixed(3)}fr`).join(' ');
    const fig = (p, side, k) => `<figure><img src="${p[`${side}-${k}`]}"><figcaption>${side === 'before' ? 'Before' : '<span class="mark">After</span>'} · ${k}</figcaption></figure>`;
    const file = await sheet(browser, out, 'before-after', `<h1>Before and after</h1><p class="sub">Old site: ${esc(oldTarget || inv.target)}${old ? '' : ` (as read on ${inv.read.slice(0, 10)})`} · new site: ${esc(newTarget)}</p>
      ${pairs.map((p) => `<div class="pair"><h2>${esc(p.oldPath)}${p.newPath !== p.oldPath ? ` → ${esc(p.newPath)}` : ''}</h2><div class="g" style="grid-template-columns:${cols}">${['before', 'after'].flatMap((s) => SIZES.map(([k]) => fig(p, s, k))).join('')}</div></div>`).join('')}`);
    console.log(`Before and after: ${file}`);
    console.log(pairs.map((p) => `  ${p.oldPath}${p.newPath !== p.oldPath ? ` → ${p.newPath}` : ''}`).join('\n'));
    const moved = pairs.filter((p) => p.newPath.split('#')[0] !== p.oldPath.split('#')[0] && !unsafe(p.oldPath) && !unsafe(p.newPath));
    if (moved.length) console.log(`So the old addresses keep working, in the new site's folder: node SKILL_DIR/scripts/redesign.mjs redirects . --pages "${moved.map((p) => `${p.oldPath}=${p.newPath}`).join(',')}"`);
    if (missing.length) console.log(`Not in the new site under the same path: ${missing.join(', ')}. To set one beside the section that took its place: --pages "${['/=/', ...missing.filter((m) => !unsafe(m)).slice(0, 2).map((m) => `${m}=/#section`)].join(',')}"`);
  } finally {
    await browser.close();
    await neu.close();
    await old?.close();
  }
}

// --- old addresses ----------------------------------------------------------------------------------------------

// the heading, and the link with and without the site's name
const MOVED = {
  de: ['Diese Seite ist umgezogen', (n) => (n ? `Weiter zu ${n}` : 'Weiter zur neuen Seite')],
  fr: ['Cette page a déménagé', (n) => (n ? `Continuer vers ${n}` : 'Aller à la nouvelle page')],
  nl: ['Deze pagina is verhuisd', (n) => (n ? `Verder naar ${n}` : 'Naar de nieuwe pagina')],
  es: ['Esta página se ha mudado', (n) => (n ? `Continuar a ${n}` : 'Ir a la nueva página')],
  it: ['Questa pagina è stata spostata', (n) => (n ? `Continua su ${n}` : 'Vai alla nuova pagina')],
  en: ['This page has moved', (n) => (n ? `Continue to ${n}` : 'Continue to the new page')],
};

// where a stub for an old address goes, or null when a static host can't serve that address as a page
export function stubFile(oldPath) {
  const p = plainPath(oldPath.split('#')[0]);
  if (!p || p.includes('?')) return null;
  if (p.endsWith('/')) return p.slice(1) + 'index.html';
  if (/\.html?$/i.test(p)) return p.slice(1);
  return /\.[a-z0-9]{2,5}$/i.test(p) ? null : p.slice(1) + '/index.html'; // /kontakt also answers as /kontakt/
}

// an address as the file a host serves for it ("/%C3%9Cber%20uns.html" is "Über uns.html"), or null for anything
// that isn't a plain path inside the site: "..", a backslash, an encoded slash, what a file name can't hold
export function plainPath(path) {
  if (/\\|%2f|%5c|%00/i.test(path)) return null;
  let d;
  try { d = decodeURIComponent(path); } catch { return null; }
  if (!d.startsWith('/') || d.split('/').some((s) => s === '..' || s === '.') || /[\x00-\x1f:*"<>|]/.test(d)) return null;
  return d;
}

// the target as a link from the stub's folder, so it works on a site that lives in a subfolder too
export function relativeTarget(oldPath, newPath) {
  const [path, hash] = newPath.split('#');
  const from = posix.dirname('/' + stubFile(oldPath));
  let rel = posix.relative(from, path) || '.';
  if (path.endsWith('/') && !rel.endsWith('/')) rel += '/';
  if (/^[^./][^/]*:/.test(rel)) rel = './' + rel; // "a:b.html" would read as a scheme
  return rel + (hash ? `#${hash}` : '');
}

export function redirectPage({ oldPath, newPath, lang = 'en', name = '', head = '' }) {
  const [moved, go] = MOVED[lang.slice(0, 2).toLowerCase()] || MOVED.en;
  const to = relativeTarget(oldPath, newPath);
  const at = esc(to);
  return `<!doctype html>
<!-- ${esc(oldPath)} moved to ${esc(newPath)}: written by redesign.mjs redirects -->
<html lang="${esc(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name ? `${name}: ${moved}` : moved)}</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="{{URL}}${esc(newPath.slice(1))}">
  <meta http-equiv="refresh" content="0; url=${at}">
${head}  <script>location.replace(${JSON.stringify(to).replace(/</g, '\\u003c')})</script>
  <style>:root{color-scheme:light dark}body{margin:0;font:1.15rem/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText}
    main{max-width:34rem;margin:20vh auto;padding:0 1.25rem}h1{font-size:1.6rem;line-height:1.2}a{color:LinkText;padding-block:.4rem;display:inline-block}</style>
</head>
<body>
  <main>
    <h1>${esc(moved)}.</h1>
    <p><a href="${at}">${esc(go(name))}</a></p>
  </main>
</body>
</html>
`;
}

function redirects(a) {
  const root = resolve(a._[1] || '.');
  const index = join(root, 'index.html');
  if (!existsSync(index)) { console.error(`No index.html in ${root}: run this in the new site's folder.`); process.exit(2); }
  if (!a.pages || a.pages === true) { console.error('Name the old addresses and where they went: --pages "/menu.html=/#menu,/team/=/about.html" (the same pairs as compare).'); process.exit(2); }
  const html = readFileSync(index, 'utf8');
  const lang = html.match(/<html[^>]*\blang="([^"]+)"/i)?.[1] || 'en';
  let name = '';
  try { name = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8')).name || ''; } catch {}
  name ||= (html.match(/<title>([^<:·|–-]+)/i)?.[1] || '').trim();
  // the site's own icon and bar colour, so the stub looks like it belongs while it moves on
  const head = (html.match(/<link rel="(icon|apple-touch-icon)"[^>]*>|<meta name="theme-color"[^>]*>/gi) || []).map((l) => `  ${l}\n`).join('');
  // a page of the new site, in the project or in public/
  const has = (p) => { const f = p.split('#')[0].replace(/^\//, '').replace(/(^|\/)$/, '$1index.html'); return existsSync(join(root, f)) || existsSync(join(root, 'public', f)) || existsSync(join(root, f.replace(/\/index\.html$/, '.html'))); };
  const done = [], left = [];
  for (const pair of String(a.pages).split(',')) {
    const [o, nw] = pairOf(pair);
    if (!o || !nw) { left.push(`${pair}: give it as old=new`); continue; }
    const oldPath = typed(o), newPath = nw.startsWith('#') ? '/' + nw : typed(nw);
    if (oldPath.split('#')[0] === newPath.split('#')[0]) continue; // the address stays
    if (!plainPath(oldPath.split(/[?#]/)[0])) { left.push(`${oldPath}: not a plain address inside the site, so nothing is written for it`); continue; }
    if (!plainPath(newPath.split('#')[0]) || !has(newPath)) { left.push(`${oldPath}: ${newPath} is not a page of the new site`); continue; }
    const file = stubFile(oldPath);
    if (!file) { left.push(`${oldPath}: a static host can't serve this address as a page; add a redirect to ${newPath.split('#')[0]} in the host's settings (iterate.md, "Old addresses")`); continue; }
    // and once more on the file itself: it lands inside public/, or nowhere
    const pub = resolve(root, 'public'), dest = resolve(pub, file);
    if (!dest.startsWith(pub + sep)) { left.push(`${oldPath}: would land outside the site's public folder, so nothing is written for it`); continue; }
    const ours = existsSync(dest) && readFileSync(dest, 'utf8').includes('written by redesign.mjs redirects');
    if ((existsSync(dest) && !ours) || existsSync(join(root, file))) { left.push(`${oldPath}: the new site has a page there already; left alone`); continue; }
    write(dest, redirectPage({ oldPath, newPath, lang, name, head }));
    done.push(`  ${oldPath} → ${newPath}  (public/${file})`);
  }
  if (done.length) console.log(`Old addresses that now lead on:\n${done.join('\n')}\nThey are noindex, out of the sitemap, and replace nothing. Build, then look and audit as usual.`);
  if (left.length) console.log(`Not written:\n${left.map((l) => `  ${l}`).join('\n')}`);
  if (!done.length) process.exitCode = left.length ? 2 : 0;
}

// run as a command (importing the file only gives the functions)
if (isMain(import.meta.url)) {
  stopOnError();
  const a = args(import.meta.url);
  if (a.help) usage(import.meta.url, 0);
  if (a._[0] === 'compare') await compare(a);
  else if (a._[0] === 'redirects') redirects(a);
  else if (a._[0]) await read(a);
  else { console.error('redesign needs their site: its address (https://…) or the folder it is in.\n'); usage(import.meta.url); }
}
