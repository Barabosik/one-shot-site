#!/usr/bin/env node
// Photographs the example sites for the README: examples/<name>/desktop.jpg and phone.jpg for each, and
// examples/showcase.jpg with all of them side by side.
//
//   node tools/showcase.mjs <name>=<built dist folder> [<name>=<dist> …] [--reduced <name>,<name>]
//
// --reduced shoots those sites with reduced motion, so an effect that waits for scrolling (a count-up low on the
// first screen) shows its end state instead of its start.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from '../skills/one-shot-site/scripts/lib/chrome.mjs';
import { serve } from '../skills/one-shot-site/scripts/lib/serve.mjs';

const argv = process.argv.slice(2);
const reduced = argv.includes('--reduced') ? String(argv[argv.indexOf('--reduced') + 1]).split(',') : [];
const sites = argv.filter((x) => x.includes('=')).map((x) => { const [name, dist] = x.split('='); return { name, dist: resolve(dist) }; });
if (!sites.length) { console.error('node tools/showcase.mjs name=path/to/dist … [--reduced name,name]'); process.exit(2); }
const out = resolve('examples');
const b = await launch();
try {
  for (const s of sites) {
    const dir = join(out, s.name);
    mkdirSync(dir, { recursive: true });
    const srv = await serve(s.dist);
    for (const [file, width, height, mobile] of [['desktop.jpg', 1440, 900, false], ['phone.jpg', 390, 844, true]]) {
      const p = await b.newPage({ width, height, mobile, scale: 2, reducedMotion: reduced.includes(s.name) });
      await p.goto(srv.url + '/');
      await sleep(3500); // entrances finish, 3D settles
      await p.shot(join(dir, file), { quality: 82 });
      await p.close();
    }
    await srv.close();
    console.log(`${s.name}: desktop.jpg, phone.jpg`);
  }

  // the README's opening picture: each site as a desktop window with its phone view in front
  const cards = sites.map((s) => `<figure><div class="win"><i></i><i></i><i></i></div>
    <img class="d" src="${s.name}/desktop.jpg"><img class="m" src="${s.name}/phone.jpg"></figure>`).join('');
  writeFileSync(join(out, 'showcase.html'), `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#111214;padding:70px 60px 90px;display:grid;grid-template-columns:repeat(${sites.length},1fr);gap:56px}
    figure{margin:0;position:relative}
    .win{height:26px;background:#2a2b2f;border-radius:10px 10px 0 0;display:flex;gap:7px;align-items:center;padding:0 12px}
    .win i{width:10px;height:10px;border-radius:50%;background:#4a4b50}
    .d{display:block;width:100%;border-radius:0 0 10px 10px;box-shadow:0 30px 60px #0008}
    .m{position:absolute;right:-22px;bottom:-46px;width:27%;border-radius:18px;border:5px solid #2a2b2f;box-shadow:0 20px 40px #000a}
  </style>${cards}`);
  const srv = await serve(out);
  const p = await b.newPage({ width: 2400, height: 800 });
  await p.goto(srv.url + '/showcase.html');
  const h = await p.eval("Math.ceil(Math.max(...[...document.querySelectorAll('figure')].map((f) => f.getBoundingClientRect().bottom))) + 90");
  await p.shot(join(out, 'showcase.jpg'), { quality: 84, clip: { x: 0, y: 0, width: 2400, height: h } });
  await srv.close();
  rmSync(join(out, 'showcase.html'));
  console.log('examples/showcase.jpg');
} finally {
  await b.close();
}
