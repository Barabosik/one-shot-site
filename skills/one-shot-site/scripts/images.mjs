#!/usr/bin/env node
// images: the pictures a site needs, made with the browser already on the machine (no image libraries).
//
//   node images.mjs og [dist | URL] [--page og] [--out public/og.jpg] [--wait 2500] [--headed]
//       The link preview for chats and social posts, 1200×630. Renders og.html if the site has one
//       (a page in the project root designed at exactly 1200×630; look and audit skip it), otherwise the
//       top of the home page. --wait: milliseconds to let entrances finish first. --headed: a real window, for 3D.
//   node images.mjs icon [--svg public/favicon.svg] [--bg "#ffffff"] [--pad 0] [--out public/apple-touch-icon.png]
//       The 180×180 home-screen icon, drawn from the SVG favicon on a solid background. When the favicon has its
//       own background (a first <rect> over the whole of it), that colour fills the square, edge to edge, and the
//       phone rounds the corners. Otherwise: white, with a margin. --bg and --pad 0 / --pad 18 override.
//   node images.mjs photo <files…> [--widths 800,1600] [--out public/img] [--quality 0.8] [--format webp|jpeg] [--hero]
//       Resize and compress photos. Prints the <img> tag with srcset, width and height for each.
//       --hero: for the first-screen image, loaded at once instead of lazily.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './lib/chrome.mjs';
import { fileFor, open, serve, siteTarget } from './lib/serve.mjs';
import { forPicture } from './lib/probes.mjs';
import { args, num, nums, pagePath, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const what = a._[0];

// the favicon's own background: the fill of a first <rect> that covers its whole viewBox (rounded corners or not)
function ownFill(text) {
  const vb = text.match(/viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  const rect = text.match(/<rect\b[^>]*>/)?.[0];
  if (!vb || !rect) return null;
  const at = (n) => rect.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const covers = (v, whole) => v === '100%' || +v >= +whole;
  if (!covers(at('width'), vb[1]) || !covers(at('height'), vb[2]) || +(at('x') || 0) > 0 || +(at('y') || 0) > 0) return null;
  const fill = at('fill');
  return fill && fill !== 'none' && !/url\(|\{\{/.test(fill) ? fill : null;
}

if (what === 'og') {
  const wait = num(a.wait, '--wait', { def: 2500, min: 0, max: 60000, int: true });
  const target = await siteTarget(a._[1], import.meta.url);
  const site = await open(target, { index: !a.page });
  const page = a.page ? pagePath(a.page) : site.root && existsSync(join(site.root, 'og.html')) ? '/og.html' : '/';
  const out = resolve(a.out || 'public/og.jpg');
  // a page that isn't there would be answered by the 404 page, and that picture would replace the real preview
  const none = `No page at ${page} in the site. Nothing was written.`;
  if (site.root && !fileFor(site.root, page)) { await site.close(); console.error(none); process.exit(2); }
  const b = await launch({ headed: !!a.headed });
  try {
    const p = await b.newPage({ width: 1200, height: 630, scale: 1 });
    await p.goto(site.url + page);
    if ((await p.eval(`performance.getEntriesByType('navigation')[0]?.responseStatus || 0`)) >= 400) throw new Error(none);
    await sleep(wait);
    await p.call(forPicture); // no skip link, and the plain hours instead of this minute's "Open now"
    mkdirSync(dirname(out), { recursive: true });
    await p.shot(out, { type: out.endsWith('.png') ? 'png' : 'jpeg', quality: 88 });
    console.log(`Social preview: ${out} (from ${page}). Look at it: is the main line readable at thumbnail size?`);
  } finally { await b.close(); await site.close(); }
} else if (what === 'icon') {
  const svg = resolve(a.svg || 'public/favicon.svg');
  const out = resolve(a.out || 'public/apple-touch-icon.png');
  if (!existsSync(svg)) { console.error(`No SVG at ${svg}`); process.exit(2); }
  const text = readFileSync(svg, 'utf8');
  const own = ownFill(text);
  const pad = a.pad !== undefined ? num(a.pad, '--pad', { min: 0, max: 60, int: true, like: 18 }) : own ? 0 : 18;
  const size = 180 - 2 * pad;
  const html = `<!doctype html><style>html,body{margin:0;background:${a.bg || own || '#ffffff'}}img{display:block;width:${size}px;height:${size}px;margin:${pad}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}">`;
  const b = await launch();
  try {
    const p = await b.newPage({ width: 180, height: 180 });
    // drawn from a temp folder, so nothing is left in public/ if a step fails
    const tmpDir = mkdtempSync(join(tmpdir(), 'oss-icon-'));
    const tmp = join(tmpDir, 'icon.html');
    try {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(tmp, html);
      await p.goto(pathToFileURL(tmp).href);
      await p.shot(out, { type: 'png' });
    } finally { rmSync(tmpDir, { recursive: true, force: true }); }
    console.log(`Icon: ${out}`);
  } finally { await b.close(); }
} else if (what === 'photo') {
  const files = a._.slice(1);
  if (!files.length) { console.error('Pass one or more image files.'); process.exit(2); }
  for (const f of files) {
    if (!existsSync(f)) { console.error(`No file at ${f}`); process.exit(2); }
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(f)) { console.error(`${f}: photos only (JPG, PNG, WebP, AVIF, GIF). SVGs go in as they are.`); process.exit(2); }
  }
  const widths = nums(a.widths, '--widths', { def: [800, 1600], min: 16, max: 8000, int: true }).sort((x, y) => x - y);
  const outDir = resolve(a.out || 'public/img');
  const format = a.format === 'jpg' ? 'jpeg' : a.format || 'webp';
  if (format !== 'webp' && format !== 'jpeg') { console.error('--format takes webp or jpeg'); process.exit(2); }
  const q = num(a.quality, '--quality', { def: 0.8, min: 0.1, max: 1 });
  mkdirSync(outDir, { recursive: true });
  const b = await launch();
  try {
    for (const file of files) {
      const s = await serve(dirname(resolve(file)));
      const p = await b.newPage({ width: 800, height: 600 });
      await p.goto(`${s.url}/${encodeURIComponent(basename(file))}`);
      const [nw, nh] = await p.eval(`(() => { const i = document.querySelector('img'); return i ? [i.naturalWidth, i.naturalHeight] : [0, 0]; })()`);
      if (!nw || !nh) throw new Error(`${file} is not a picture the browser can open (an error page saved as .jpg?).`);
      const name = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const made = [];
      for (const width of [...new Set(widths.map((w) => Math.min(w, nw)))]) {
        const height = Math.round((nh * width) / nw);
        const data = await p.eval(`(() => {
          const i = document.querySelector('img'), c = document.createElement('canvas');
          c.width = ${width}; c.height = ${height};
          const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, ${width}, ${height});
          return c.toDataURL('image/${format}', ${q}).split(',')[1];
        })()`);
        const f = `${name}-${width}.${format === 'jpeg' ? 'jpg' : format}`;
        writeFileSync(join(outDir, f), Buffer.from(data, 'base64'));
        made.push({ f, width, height, kb: Math.round(Buffer.byteLength(data, 'base64') / 1024) });
      }
      await p.close();
      await s.close();
      const big = made[made.length - 1];
      // the URL path: whatever follows public/ (Vite serves public/ at the site root)
      const norm = outDir.replace(/\\/g, '/');
      const pub = norm.includes('/public/') ? '/' + norm.split('/public/').pop() : norm.endsWith('/public') ? '/' : '/' + basename(norm);
      const src = (m) => `${pub.replace(/\/$/, '')}/${m.f}`;
      console.log(`${file} (${nw}×${nh}) → ${made.map((m) => `${m.f} ${m.kb} KB`).join(', ')}`);
      console.log(`  <img src="${src(big)}"${made.length > 1 ? ` srcset="${made.map((m) => `${src(m)} ${m.width}w`).join(', ')}" sizes="(min-width: 1100px) 50vw, 100vw"` : ''} width="${big.width}" height="${big.height}" alt="" ${a.hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`);
    }
  } finally { await b.close(); }
} else {
  usage(import.meta.url);
  process.exit(2);
}
