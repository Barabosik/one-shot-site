// Serve a folder over http on 127.0.0.1 so pages load the way they will when hosted:
// module scripts, fetch() and absolute /paths all work, and missing files get the site's own 404.html.
import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { usage } from './cli.mjs';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.pdf': 'application/pdf',
};

// The file a path is served from (/about -> about.html, /de/ -> de/index.html), or null: no such page here.
// A name that starts with a dot (.env, .git, .one-shot) is never served, as on most hosts; /.well-known/ is.
export function fileFor(dir, path) {
  const root = resolve(dir);
  let name;
  try { name = decodeURIComponent(path); } catch { return null; } // "/50%off.png" is a 404, not a crash
  if (name.split(/[\\/]/).some((part, i) => part.startsWith('.') && !(i === 1 && part === '.well-known'))) return null;
  let f = resolve(join(root, name));
  if (f !== root && !f.startsWith(root + sep)) return null;
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  else if (!existsSync(f) && existsSync(f + '.html')) f += '.html'; // /about -> about.html, like most hosts
  if (!(existsSync(f) && statSync(f).isFile())) return null;
  // and where it really is: a link (junction, symlink) in the folder that points out of it serves nothing
  return realpathSync.native(f).startsWith(realpathSync.native(root) + sep) ? f : null;
}

export async function serve(dir) {
  const root = resolve(dir);
  const file = (path) => fileFor(root, path);
  const server = createServer((req, res) => {
    // only this machine's names for it: a page in another tab that points a name of its own at 127.0.0.1 (DNS
    // rebinding) gets nothing
    const { port } = server.address();
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(String(req.headers.host).toLowerCase())) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end('forbidden');
    }
    const path = new URL(req.url, 'http://x').pathname;
    let f = file(path);
    let status = 200;
    if (!f) {
      status = 404;
      f = file('/404.html');
      if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    }
    res.writeHead(status, {
      'content-type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream',
      'content-length': statSync(f).size,
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  // close() alone waits for every open connection, and the browser keeps one open (even one it never sent a request
  // on) until it quits, which comes after this: so the connections are cut here.
  return { url, root, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
}

// No target given: dist if it's here, else a running dev server. Neither: the script's help, before any browser
// starts (someone running a script bare to read its options shouldn't get a browser).
export async function siteTarget(given, scriptUrl) {
  if (given) return given;
  if (existsSync('dist')) return 'dist';
  const dev = 'http://localhost:5173';
  try { await fetch(dev, { signal: AbortSignal.timeout(1500) }); return dev; } catch {}
  console.error(`No dist folder here and nothing at ${dev}. Build first (npm run build), or give a folder or URL.\n`);
  usage(scriptUrl, 2);
}

// "dist", "./site/dist", "http://localhost:5173" or "https://example.com" -> { url, close }
// A folder must hold a site, or an empty dist is looked at, found empty and called all clear. index: false for a
// folder that may have no index.html: an old site (redesign.mjs), or one whose pages are named (look --pages
// variant-a,variant-b on a folder of variants).
export async function open(target, { index = true } = {}) {
  if (/^https?:\/\//.test(target)) return { url: target.replace(/\/$/, ''), root: null, close: async () => {} };
  if (!existsSync(target)) throw new Error(`Nothing at ${target}. Run the build first (npm run build), or pass a URL.`);
  if (!statSync(target).isDirectory()) throw new Error(`${target} is a file. Pass its folder.`);
  if (index && !existsSync(join(target, 'index.html'))) throw new Error(`No index.html in ${resolve(target)}. Build first (npm run build), or pass the folder with the built site.`);
  return serve(target);
}
