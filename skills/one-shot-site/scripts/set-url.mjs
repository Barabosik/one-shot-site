#!/usr/bin/env node
// set-url: give the site its address once it is known, or move it to a new one.
// Replaces {{URL}} (or the address set before) in every page, robots.txt and the JSON-LD, and writes
// public/sitemap.xml fresh from the pages that exist. Rebuild afterwards.
//
//   node set-url.mjs <site folder> https://rosas.example/
//
// Exit code 2 = bad input. Pages with noindex, 404.html, og.html and variant-*.html stay out of the sitemap.
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { args, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const root = a._[0];
let url = a._[1];
const stop = (line) => { console.error(`${line}\nUsage: node set-url.mjs <site folder with index.html> https://your.address/`); process.exit(2); };
if (!root || !url) stop('set-url needs the site\'s folder and its address.');
if (!existsSync(join(root, 'index.html'))) stop(`No index.html in ${resolve(root)}: pass the site's own folder.`);
// only a web address: "javascript:…" or "file:…" would land in canonical, the sitemap, the JSON-LD and robots.txt
// (and a plain host name: one with a quote in it would end the href it is written into)
try { const u = new URL(url); if (!/^https?:$/.test(u.protocol) || !/^[\w.:[\]-]+$/.test(u.hostname)) throw 0; url = u.href; } catch { stop(`"${url}" is not a full address. Start it with https://`); }
if (!url.endsWith('/')) url += '/';

// the facts file carries the address too: read it before anything is written, so a broken one changes nothing
const factsFile = join(root, 'site.json');
let facts = null;
if (existsSync(factsFile)) {
  try { facts = JSON.parse(readFileSync(factsFile, 'utf8')); } catch (e) { console.error(`${resolve(factsFile)} is not valid JSON (${e.message}). Fix it, then run this again; nothing was changed.`); process.exit(2); }
}

// the address used so far: the placeholder, or whatever canonical index.html has now
const index = readFileSync(join(root, 'index.html'), 'utf8');
// (href before rel, single quotes or none: an edited page writes it either way)
const before = (index.match(/<link\b[^>]*\srel=["']?canonical\b[^>]*>/i)?.[0] ?? '').match(/\shref=["']?([^"'\s>]+)/i)?.[1];
const old = [/\{\{URL\}\}/g];
if (before && !before.includes('{{URL}}') && before !== url) {
  // only a full address can be the old one: "/" or "%BASE_URL%" would be swapped wherever it stands, "</head>" too
  if (!/^https?:\/\/[\w.:[\]-]+\//i.test(before)) { console.error(`The canonical link in ${resolve(root, 'index.html')} is "${before}", not a full address. Write {{URL}} in its href, then run this again; nothing was changed.`); process.exit(2); }
  old.push(new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
}
// a link (junction, symlink) is not written through either: the sitemap or site.json would land outside the site
const linked = ['public', 'public/sitemap.xml', 'site.json'].find((p) => { try { return lstatSync(join(root, p)).isSymbolicLink(); } catch { return false; } });
if (linked) { console.error(`${resolve(root, linked)} is a link (junction or symlink): set-url writes only inside the site folder. Make it a real folder or file, then run this again; nothing was changed.`); process.exit(2); }

const SKIP = new Set(['node_modules', 'dist', 'tools', '.one-shot', '.git']);
const files = [];
// a link (junction, symlink) is not followed: one pointing out of the site had files outside it rewritten
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = e.name;
    if (SKIP.has(f)) continue;
    const p = join(d, f);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && /\.(html|txt|xml|json|webmanifest)$/.test(f) && f !== 'package.json' && f !== 'package-lock.json') files.push(p);
  }
};
walk(root);

let changed = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const next = old.reduce((t, re) => t.replace(re, () => url), text);
  if (next !== text) { writeFileSync(f, next); changed++; }
}

// the address in the facts file, for the structured data
if (facts) {
  facts = JSON.parse(readFileSync(factsFile, 'utf8')); // the loop above may have rewritten it: start from what is on disk now
  // the host follows from the address for the free hosts; a custom domain needs it set by hand
  const HOSTS = [[/\.github\.io$/, 'GitHub Pages (GitHub Inc., USA)'], [/\.vercel\.app$/, 'Vercel (Vercel Inc., USA)'], [/\.netlify\.app$/, 'Netlify (Netlify Inc., USA)'], [/\.(workers|pages)\.dev$/, 'Cloudflare (Cloudflare Inc., USA)']];
  const host = HOSTS.find(([re]) => re.test(new URL(url).hostname))?.[1];
  const before = JSON.stringify(facts);
  facts.url = url;
  if (host && !facts.host) facts.host = host;
  if (JSON.stringify(facts) !== before) { writeFileSync(factsFile, JSON.stringify(facts, null, 2) + '\n'); changed++; }
  if (!facts.host) console.log('Set "host" in site.json (the hosting provider), for the privacy page.');
}

// sitemap: every page a search engine should list
const pages = files
  .filter((f) => f.endsWith('.html') && !relative(root, f).startsWith('public'))
  .map((f) => relative(root, f).replace(/\\/g, '/'))
  .filter((p) => !/(^|\/)(404|og|variant-[^/]*)\.html$/.test(p))
  .filter((p) => !/<meta name="robots" content="[^"]*noindex/.test(readFileSync(join(root, p), 'utf8')))
  .sort((x, y) => (x === 'index.html' ? -1 : y === 'index.html' ? 1 : x.localeCompare(y)));
const loc = (p) => url + p.replace(/(^|\/)index\.html$/, '$1');
if (existsSync(join(root, 'public'))) {
  writeFileSync(join(root, 'public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${loc(p)}</loc></url>`).join('\n')}
</urlset>
`);
}

// crawlers read robots.txt only at the root of the host: under a path (a GitHub project page) its Sitemap line is
// never seen, so the sitemap has to be handed in
const { origin, pathname } = new URL(url);
if (pathname !== '/') console.log(`The site lives under ${pathname}, and crawlers read robots.txt only at ${origin}/robots.txt, so its Sitemap line goes unseen. Once it is live, submit ${url}sitemap.xml in Google Search Console (and Bing Webmaster Tools).`);
console.log(`Address set to ${url} in ${changed} file(s); ${existsSync(join(root, 'public')) ? `sitemap lists ${pages.length} page(s)` : 'no public/ folder, so no sitemap was written'}. Rebuild, then run the audit without --draft.`);
