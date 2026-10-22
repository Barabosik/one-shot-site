#!/usr/bin/env node
// Draws docs/media/social-preview.jpg, the 1280×640 picture GitHub shows when the repository is linked
// (Settings → General → Social preview takes it as an upload). The line and three example sites, from their
// desktop.jpg in examples/.
//
//   node docs/social-preview.mjs [example …]     default: klempnerei-brandt moth-orchestra fahrrad-hollerbach
//
// Opens the installed Chrome, like the skill's scripts. GitHub wants it under 1 MB.
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from '../skills/one-shot-site/scripts/lib/chrome.mjs';
import { serve } from '../skills/one-shot-site/scripts/lib/serve.mjs';

const root = resolve(import.meta.dirname, '..');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['klempnerei-brandt', 'moth-orchestra', 'fahrrad-hollerbach'];
const missing = names.filter((n) => !existsSync(join(root, 'examples', n, 'desktop.jpg')));
if (missing.length || names.length !== 3) {
  console.error(`Give three examples that have a desktop.jpg${missing.length ? ` (missing: ${missing.join(', ')})` : ''}.`);
  process.exit(2);
}

const cards = names.map((n, i) => `<figure style="left:${610 + i * 54}px;top:${56 + i * 94}px">
  <div class="bar"><i></i><i></i><i></i></div><img src="/examples/${n}/desktop.jpg"></figure>`).join('');
const page = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:640px;overflow:hidden;background:#111214;color:#f2f2f3;
    font:400 22px/1.4 "Segoe UI",system-ui,sans-serif}
  .t{position:absolute;left:64px;top:72px;width:500px}
  b{font-size:22px;color:#a9abb3;font-weight:600}
  h1{font-size:54px;line-height:1.08;margin:16px 0 22px;letter-spacing:-.02em}
  p{margin:0;color:#c7c9cf}
  .foot{position:absolute;left:64px;bottom:56px;font-size:19px;color:#a9abb3}
  figure{position:absolute;margin:0;width:500px;border-radius:10px;overflow:hidden;box-shadow:0 24px 50px #000c}
  .bar{height:22px;background:#2a2b2f;display:flex;gap:7px;align-items:center;padding:0 11px}
  .bar i{width:9px;height:9px;border-radius:50%;background:#4a4b50}
  img{display:block;width:100%}
</style>
<div class="t"><b>one-shot-site</b><h1>A few questions in. A finished, checked website out.</h1>
<p>Answer a few multiple-choice questions. Your agent builds a finished website, checks it in a real browser at
phone and desktop size, and puts it online.</p></div>
<div class="foot">MIT · github.com/Barabosik/one-shot-site</div>${cards}`;

const html = join(root, 'docs/social-preview.html');
writeFileSync(html, page);
const srv = await serve(root);
const b = await launch();
const out = join(root, 'docs/media/social-preview.jpg');
try {
  const p = await b.newPage({ width: 1280, height: 640, scale: 1 });
  await p.goto(srv.url + '/docs/social-preview.html');
  await new Promise((r) => setTimeout(r, 800));
  await p.shot(out, { quality: 86 });
} finally {
  await b.close();
  await srv.close();
  rmSync(html, { force: true });
}
const kb = Math.round(statSync(out).size / 1024);
console.log(`docs/media/social-preview.jpg, ${kb} KB${kb > 1000 ? ' (over 1 MB: GitHub will refuse it)' : ''}`);
