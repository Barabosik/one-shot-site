#!/usr/bin/env node
// Serves a fixture site on this machine only, for the redesign scenario: the "old site" the person points at.
//
//   node evals/fixtures/serve.mjs <folder> [--port 4817]
//
// Answers on http://127.0.0.1:<port>/ until stopped.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const root = resolve(args.find((x) => !x.startsWith('--')) || '.');
const port = +(args[args.indexOf('--port') + 1] || 4817);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No index.html in ${root}.`);
  process.exit(2);
}
createServer((req, res) => {
  let p;
  try { p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, ''); } catch { res.writeHead(400).end(); return; }
  let file = join(root, p);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
