#!/usr/bin/env node
// Serves a live vote folder on this machine only: the vote page at /, each site under its own path (/p1/3fa2/).
//
//   node serve.mjs [folder] [--port 4831]     (folder: default, the one this file is in; --port 0 picks a free one)
//
// A site's own pages are found as a static host would: a folder gives its index.html, /team gives team.html, and a
// missing page gives the site's 404.html. A root path its pages still ask for (/team.html, made in a script) is sent
// to the same path under the site of the page that asked.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const root = resolve(args.find((x, i) => !x.startsWith('--') && args[i - 1] !== '--port') || dirname(fileURLToPath(import.meta.url)));
const port = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 4831;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
};
const SITE = /^\/(p\d+\/[0-9a-f]+)\//;
const file = (p) => { const f = join(root, p); return f === root || f.startsWith(root + sep) ? f : null; };
const isFile = (f) => f && existsSync(f) && statSync(f).isFile();

if (!existsSync(join(root, 'index.html'))) { console.error(`No index.html in ${root}.`); process.exit(2); }
const server = createServer((req, res) => {
  let path;
  try { path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/'); } catch { res.writeHead(400).end(); return; }
  const send = (status, f) => res.writeHead(status, { 'content-type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(f));
  const site = path.match(SITE)?.[1];
  // a root path asked for by a site's page: the same path under that site
  if (!site && path !== '/' && !isFile(file(path))) {
    let from = null;
    try { from = new URL(req.headers.referer || '').pathname.match(SITE)?.[1]; } catch {}
    if (from) { res.writeHead(302, { location: `/${from}${path}${new URL(req.url, 'http://x').search}`, 'cache-control': 'no-store' }).end(); return; }
  }
  const f = file(path);
  if (!f) { res.writeHead(403).end(); return; }
  // a folder without its slash: with it, so the page's relative links resolve inside the folder
  if (!path.endsWith('/') && existsSync(f) && statSync(f).isDirectory()) { res.writeHead(302, { location: `${path}/`, 'cache-control': 'no-store' }).end(); return; }
  for (const c of [f, join(f, 'index.html'), `${f.replace(/[\\/]$/, '')}.html`]) if (isFile(c)) { send(200, c); return; }
  const missing = site && file(`/${site}/404.html`);
  if (isFile(missing)) { send(404, missing); return; }
  res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
});
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`));
