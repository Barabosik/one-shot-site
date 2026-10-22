#!/usr/bin/env node
// Makes the pictures and clips in docs/media from the example sites, with the skill's own tools: film.mjs films
// each site, mockup.mjs draws the looks to pick from, look.mjs numbers the screens. ffmpeg turns the films into
// hero.gif (the README's opening clip, kept under 3 MB) and hero.mp4.
//
//   node docs/make-media.mjs kleiner-kaffee=<dist> jonas-weber=<dist> patch-night=<dist> [--films <folder>]
//
// --films keeps the films in that folder and reuses any that are already there, so a run that stopped half way
// (a busy machine can make a film time out) only films what is missing. Delete the folder to film afresh.
//
// Build each example first (npm install && npm run build in examples/<name>/site). Needs ffmpeg on the PATH,
// or FFMPEG=/path/to/ffmpeg. Fonts for the mockups come from the Fontsource CDN, so this needs internet.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch } from '../skills/one-shot-site/scripts/lib/chrome.mjs';
import { serve } from '../skills/one-shot-site/scripts/lib/serve.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = join(root, 'skills/one-shot-site/scripts');
// --to <folder> writes there instead, to look at the pictures before they replace the ones in docs/media
const out = process.argv.includes('--to') ? resolve(process.argv[process.argv.indexOf('--to') + 1]) : join(root, 'docs/media');
const FF = process.env.FFMPEG || 'ffmpeg';

// What the opening clip shows of each site: the answers in the window's title bar, and which seconds of the
// film (the first screen arriving, then one step of scrolling; Patch Night's cables are costly, so less).
// Patch Night is filmed in a real (off-screen) window: its canvas is too slow in the headless software renderer.
const SITES = {
  'kleiner-kaffee': { title: 'Kleiner Kaffee', answers: 'A small business · Warm · Gentle motion', from: 0.35, to: 4.7 },
  'jonas-weber': { title: 'Jonas Weber', answers: 'Me and my work · Bold · Lively motion', from: 0.3, to: 4.7 },
  'patch-night': { title: 'Patch Night', answers: 'An event · Night · Showpiece', from: 0.55, to: 3.2, headed: true },
};
// The run shown step by step in how-it-works.jpg: which of the brief's facts it quotes, what its three first
// screens are called, and what the drawing on the first screen is
const STORY = { site: 'kleiner-kaffee', name: 'Kleiner Kaffee', line: 'A coffee bar that roasts its own beans', action: 'Get directions', brand: '#6f3b1e',
  facts: [0, 3, 4], screens: ['A · the classic split (picked)', 'B · three columns', 'C · on roast brown'], drawing: 'the drum roaster' };

const argv = process.argv.slice(2);
const filmsAt = argv.includes('--films') ? resolve(argv[argv.indexOf('--films') + 1]) : null;
const sites = argv.filter((x, i) => x.includes('=') && argv[i - 1] !== '--films').map((x) => { const [name, dist] = x.split('='); return { name, dist: resolve(dist), ...SITES[name] }; });
// --page: only the project page's own pictures, with ffmpeg and no browser:
//   redesign-before.jpg, the bike workshop's old site for the before/after slider, with two of its lines painted
//     over: the "visit us online" link and the footer's second line.
//   page-idea-a.jpg, -b, -c: the three first screens mockup.mjs --concepts drew for the page itself (in
//     docs/site/.one-shot/mockups, which git leaves out), for the footer's "This page was made with this skill too".
//   With --run <site folder>, the "One run" section's pictures from that run's own .one-shot folder (git leaves
//     those pictures out, so they come from the folder the run was made in): run-idea-a.jpg, -b, -c, its three
//     ideas (mockups/<letter>-*-desktop.jpg; --ideas <folder> takes them from a redraw instead), and
//     run-screen-a.jpg, -b, -c, its three first screens: look/variant-<letter>-1440-0.jpg, or for a run made
//     before 0.5, cut from variants/sheet-compare.jpg.
//   node docs/make-media.mjs --page [--run <site folder> [--ideas <folder>]]
// --now <built page folder>: page-now-light.jpg and page-now-dark.jpg (800×500), the page's first screen as it is
// today at 1440×900, for the footer's "Now" beside the three first screens the run started from. Reduced motion,
// so the film shows its poster.   node docs/make-media.mjs --now <folder that docs/build.mjs wrote>
if (argv.includes('--now')) {
  const built = resolve(argv[argv.indexOf('--now') + 1]);
  if (!existsSync(join(built, 'index.html'))) { console.error(`No index.html in ${built}: build the page first (node docs/build.mjs <folder>).`); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'oss-now-'));
  const srv = await serve(built);
  const b = await launch();
  try {
    for (const scheme of ['light', 'dark']) {
      const p = await b.newPage({ width: 1440, height: 900, reducedMotion: true, colorScheme: scheme });
      await p.goto(srv.url + '/');
      await new Promise((r) => setTimeout(r, 800));
      await p.shot(join(tmp, `${scheme}.jpg`), { quality: 92 });
      await p.close();
      execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', join(tmp, `${scheme}.jpg`),
        '-vf', 'scale=800:500:flags=lanczos', '-q:v', '3', join(out, `page-now-${scheme}.jpg`)], { stdio: 'inherit' });
      console.log(`page-now-${scheme}.jpg`);
    }
  } finally {
    await b.close();
    await srv.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(0);
}
if (argv.includes('--page')) {
  mkdirSync(out, { recursive: true });
  const before = join(root, 'examples/fahrrad-hollerbach/before-desktop.jpg');
  if (existsSync(before)) {
    execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', before, '-vf',
      'format=rgb24,drawbox=x=494:y=597:w=246:h=22:color=white:t=fill,drawbox=x=462:y=849:w=516:h=17:color=0x2e5b2e:t=fill',
      '-q:v', '3', join(out, 'redesign-before.jpg')], { stdio: 'inherit' });
    console.log('redesign-before.jpg');
  }
  const own = join(root, 'docs/site/.one-shot');
  if (existsSync(join(own, 'concepts.json'))) {
    // the same names mockup.mjs gives them: a-answers-in-the-address-bar-desktop.jpg
    const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    JSON.parse(readFileSync(join(own, 'concepts.json'), 'utf8')).concepts.forEach((c, i) => {
      const letter = 'abc'[i], shot = join(own, 'mockups', `${letter}-${slug(c.name)}-desktop.jpg`);
      if (!existsSync(shot)) return console.error(`${shot} is missing: run mockup.mjs --concepts in docs/site first.`);
      execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', shot, '-vf', 'scale=800:500:flags=lanczos',
        '-q:v', '4', join(out, `page-idea-${letter}.jpg`)], { stdio: 'inherit' });
      console.log(`page-idea-${letter}.jpg: ${c.name}`);
    });
  }
  if (argv.includes('--run')) {
    const run = resolve(argv[argv.indexOf('--run') + 1], '.one-shot');
    const ideas = argv.includes('--ideas') ? resolve(argv[argv.indexOf('--ideas') + 1]) : join(run, 'mockups');
    for (const letter of 'abc') {
      const f = readdirSync(ideas).find((n) => n.startsWith(`${letter}-`) && n.endsWith('-desktop.jpg'));
      if (!f) { console.error(`No ${letter}-*-desktop.jpg in ${ideas}`); process.exit(1); }
      execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', join(ideas, f), '-vf', 'scale=800:500:flags=lanczos', '-q:v', '4', join(out, `run-idea-${letter}.jpg`)], { stdio: 'inherit' });
    }
    // since 0.5 look.mjs --compare keeps each first screen in look/ (variant-a-1440-0.jpg); before, one sheet
    const shots = ['a', 'b', 'c'].map((l) => join(run, `look/variant-${l}-1440-0.jpg`));
    if (shots.every((f) => existsSync(f))) {
      shots.forEach((f, i) => execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', f, '-vf', 'scale=800:500:flags=lanczos', '-q:v', '4', join(out, `run-screen-${'abc'[i]}.jpg`)], { stdio: 'inherit' }));
      console.log(`run-idea-a/b/c.jpg from ${ideas}, run-screen-a/b/c.jpg from ${join(run, 'look')}`);
    } else {
      // sheet-compare.jpg: one row per first screen, desktop first, on the sheet's dark ground
      const sheet = join(run, 'variants/sheet-compare.jpg');
      const [w, h] = String(spawnSync(FF, ['-hide_banner', '-i', sheet], { encoding: 'utf8' }).stderr).match(/, (\d{3,5})x(\d{3,5})/).slice(1).map(Number);
      const px = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', sheet, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
      const ground = px[8 * w + 8];
      const runs = (n, at) => { const found = []; let s = -1; for (let i = 0; i <= n; i++) { const on = i < n && Math.abs(at(i) - ground) > 24; if (on && s < 0) s = i; if (!on && s >= 0) { if (i - s > 200) found.push([s, i]); s = -1; } } return found; };
      const ys = runs(h, (y) => px[y * w + 30]);
      const [x0, x1] = runs(w, (x) => px[(ys[0][0] + 3) * w + x])[0]; // just inside the top edge, above any text
      if (ys.length < 3) { console.error(`${sheet}: found ${ys.length} first screens, not 3.`); process.exit(1); }
      ys.slice(0, 3).forEach(([y0, y1], i) => execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-i', sheet, '-vf',
        `crop=${x1 - x0 - 4}:${y1 - y0 - 4}:${x0 + 2}:${y0 + 2},scale=800:500:flags=lanczos`, '-q:v', '4', join(out, `run-screen-${'abc'[i]}.jpg`)], { stdio: 'inherit' }));
      console.log(`run-idea-a/b/c.jpg from ${ideas}, run-screen-a/b/c.jpg from ${sheet}`);
    }
  }
  process.exit(0);
}
if (!sites.length || sites.some((s) => !s.title)) {
  console.error(`node docs/make-media.mjs ${Object.keys(SITES).map((n) => `${n}=<dist>`).join(' ')}`);
  process.exit(2);
}
try { execFileSync(FF, ['-version'], { stdio: 'ignore' }); } catch { console.error('ffmpeg not found: put it on the PATH or set FFMPEG.'); process.exit(2); }

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'oss-media-'));
const node = (script, args, cwd = root) => execFileSync(process.execPath, [join(scripts, script), ...args], { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
const ff = (args) => execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const mb = (f) => (statSync(join(out, f)).size / 1e6).toFixed(2) + ' MB';

const b = await launch();
try {
  // 1. film every site, with video
  for (const s of sites) {
    s.film = join(filmsAt || join(tmp, 'film'), s.name);
    if (filmsAt && existsSync(join(s.film, 'film.webm'))) { console.log(`kept the film of ${s.name}`); continue; }
    node('film.mjs', [s.dist, '--video', '--seconds', '3', '--steps', '2', ...(s.headed ? ['--headed'] : []), '--out', s.film]);
    console.log(`filmed ${s.name}`);
  }

  // 2. hero.gif and hero.mp4: each site in a window, its answers in the title bar
  const W = 800, PAD = 20, BAR = 36, VW = W - PAD * 2, VH = Math.round((VW * 900) / 1440 / 2) * 2, H = PAD + BAR + VH + PAD, FPS = 10;
  for (const s of sites) {
    const p = await b.newPage({ width: W, height: H, scale: 1 });
    await p.goto('data:text/html,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:${W}px;height:${H}px;background:#111214;font:500 13px/1 "Segoe UI",system-ui,sans-serif}
      .win{position:absolute;left:${PAD}px;top:${PAD}px;width:${VW}px;height:${BAR + VH}px;background:#2a2b2f;border-radius:10px;overflow:hidden}
      .bar{height:${BAR}px;display:flex;align-items:center;gap:7px;padding:0 14px;color:#a9abb3}
      .bar i{width:11px;height:11px;border-radius:50%;background:#4a4b50}
      .bar b{color:#f2f2f3;font-weight:600;margin-left:12px} .bar span{margin-left:auto}
    </style><div class="win"><div class="bar"><i></i><i></i><i></i><b>${s.title}</b><span>Answers: ${s.answers}</span></div></div>`));
    s.frame = join(tmp, `frame-${s.name}.png`);
    await p.shot(s.frame, { type: 'png' });
    await p.close();
  }
  const inputs = sites.flatMap((s) => ['-loop', '1', '-framerate', String(FPS), '-i', s.frame, '-i', join(s.film, 'film.webm')]);
  let fc = sites.map((s, i) => `[${i * 2 + 1}:v]trim=start=${s.from}:end=${s.to},setpts=PTS-STARTPTS,fps=${FPS},scale=${VW}:${VH}:flags=lanczos[v${i}];`
    + `[${i * 2}:v]trim=duration=${(s.to - s.from).toFixed(2)},setpts=PTS-STARTPTS[f${i}];[f${i}][v${i}]overlay=${PAD}:${PAD + BAR}:shortest=1,format=rgb24[c${i}];`).join('');
  fc += sites.map((_, i) => `[c${i}]`).join('') + `concat=n=${sites.length}:v=1:a=0[all];`;
  ff([...inputs, '-filter_complex', fc + '[all]split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle[out]',
    '-map', '[out]', '-loop', '0', join(out, 'hero.gif')]);
  ff([...inputs, '-filter_complex', fc + '[all]format=yuv420p[out]', '-map', '[out]', '-c:v', 'libx264', '-crf', '24', '-preset', 'slow',
    '-movflags', '+faststart', '-r', '30', join(out, 'hero.mp4')]);
  console.log(`hero.gif ${mb('hero.gif')}, hero.mp4 ${mb('hero.mp4')}`);

  // 3. the pictures for the story: looks to pick from, numbered screens, a filmstrip
  const story = sites.find((s) => s.name === STORY.site);
  if (story) {
    const mock = join(tmp, 'mockups');
    node('mockup.mjs', ['--name', STORY.name, '--line', STORY.line, '--action', STORY.action, '--brand', STORY.brand, '--moods', 'warm,bold,quiet', '--out', mock]);
    const look = join(tmp, 'look');
    node('look.mjs', [story.dist, '--numbers', '--widths', '390,1440', '--frames', '2', '--out', look]);
    ff(['-i', join(mock, 'mockups.jpg'), '-vf', 'scale=1200:-2:flags=lanczos', '-q:v', '3', join(out, 'pick-a-look.jpg')]);
    // the same three looks one by one, for the project page's "Why" section
    for (const [from, to] of [['a-warm', 'look-warm'], ['b-bold', 'look-bold'], ['c-quiet', 'look-quiet']]) {
      ff(['-i', join(mock, `${from}-desktop.jpg`), '-vf', 'scale=800:500:flags=lanczos', '-q:v', '4', join(out, `${to}.jpg`)]);
    }
    copyFileSync(join(look, 'home-390-0.jpg'), join(out, 'numbers-phone.jpg'));
    copyFileSync(join(look, 'home-1440-0.jpg'), join(out, 'numbers-desktop.jpg'));

    // how-it-works.jpg: one run, start to finish, from the run's own files
    const brief = readFileSync(join(root, 'examples', STORY.site, 'site/.one-shot/brief.md'), 'utf8');
    const section = (title) => brief.split(title)[1].split('\n## ')[0];
    const facts = section('## 1. Facts only they have').split('\n').filter((l) => /^(\d+\.|-) /.test(l)).filter((_, i) => STORY.facts.includes(i));
    // the kept idea's "idea:" line, and the indented lines that carry it on (up to the next "key:")
    const kept = (section('## 3. Three ideas, one kept').split(/\n\s*\n/).find((b) => /\(kept\)/.test(b)) || '').split('\n');
    const at = kept.findIndex((l) => /^\s*idea:/.test(l));
    const rest = at < 0 ? [] : kept.slice(at + 1);
    const end = rest.findIndex((l) => !/^\s{6,}\S/.test(l) || /^\s*[a-z][a-z ]*:\s/.test(l));
    const more = end < 0 ? rest : rest.slice(0, end);
    const idea = brief.includes('## 3. The idea sentence')
      ? section('## 3. The idea sentence').trim().split('\n').filter((l) => !l.startsWith('Swap test')).join(' ')
      : at < 0 ? '' : [kept[at].replace(/^\s*idea:\s*/, ''), ...more.map((l) => l.trim())].join(' ');
    const numbers = readFileSync(join(look, 'numbers.md'), 'utf8').split('\n').filter((l) => /^- \*\*2[abc]\*\*/.test(l))
      .map((l) => l.replace(/^- \*\*(\w+)\*\* /, '$1  ').replace(/svg(\.[\w-]+)?$/, `drawing: ${STORY.drawing}`));
    const audit = join(tmp, 'audit.md');
    // --draft: an example has no address of its own; --site: its project, for the source checks and allow.json
    try { node('audit.mjs', [story.dist, '--draft', '--site', join(root, 'examples', STORY.site, 'site'), '--out', audit]); } catch {} // exit 1 still writes the report
    const verdict = readFileSync(audit, 'utf8').split('\n').filter(Boolean).slice(0, 2).map((l) => l.replace(/^# /, ''));
    const screens = ['a', 'b', 'c'].every((l) => existsSync(join(out, `run-screen-${l}.jpg`)));
    for (const [from, to] of [...(screens ? ['a', 'b', 'c'].map((l) => [join(out, `run-screen-${l}.jpg`), `${l}.jpg`])
      : [[join(mock, 'a-warm-desktop.jpg'), 'a.jpg'], [join(mock, 'b-bold-desktop.jpg'), 'b.jpg'], [join(mock, 'c-quiet-desktop.jpg'), 'c.jpg']]),
      [join(root, 'examples', STORY.site, 'desktop.jpg'), 'desktop.jpg'], [join(root, 'examples', STORY.site, 'phone.jpg'), 'phone.jpg'],
      [join(look, 'home-390-0.jpg'), 'numbers.jpg']]) copyFileSync(from, join(tmp, to));
    writeFileSync(join(tmp, 'how.html'), howItWorks({ facts, idea, numbers, verdict, screens }));
    const srv = await serve(tmp);
    const p = await b.newPage({ width: 1600, height: 1000, scale: 1.5 });
    await p.goto(srv.url + '/how.html');
    const h = await p.eval('document.documentElement.scrollHeight');
    await p.shot(join(out, 'how-it-works.jpg'), { quality: 86, clip: { x: 0, y: 0, width: 1600, height: h } });
    await p.close();
    await srv.close();
    console.log(`pick-a-look.jpg, look-warm/bold/quiet.jpg, numbers-phone.jpg, numbers-desktop.jpg, how-it-works.jpg ${mb('how-it-works.jpg')}`);
  }
  const pn = sites.find((s) => s.name === 'patch-night');
  if (pn) {
    ff(['-i', join(pn.film, 'film-load.jpg'), '-vf', 'scale=1200:-2:flags=lanczos', '-q:v', '3', join(out, 'filmstrip.jpg')]);
    console.log('filmstrip.jpg');
  }
} finally {
  await b.close();
  rmSync(tmp, { recursive: true, force: true });
}

function howItWorks({ facts, idea, numbers, verdict, screens }) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const q = (title, options, pick) => `<div class="q"><b>${title}</b>${options.map((o) => `<span class="${o === pick ? 'on' : ''}">${o}</span>`).join('')}</div>`;
  const step = (n, title, note, body) => `<section><h2><i>${n}</i>${title}</h2><p>${note}</p><div class="pic">${body}</div></section>`;
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#111214;color:#f2f2f3;font:400 24px/1.35 "Segoe UI",system-ui,sans-serif}
  body{padding:56px 56px 64px}
  header{display:flex;align-items:baseline;gap:18px;margin:0 0 36px}
  header h1{font-size:38px;font-weight:650;margin:0} header span{color:#a9abb3}
  main{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
  section{background:#1b1c20;border-radius:16px;padding:26px 26px 28px;display:flex;flex-direction:column}
  h2{margin:0;font-size:29px;font-weight:650;display:flex;align-items:center;gap:12px}
  h2 i{font-style:normal;width:36px;height:36px;border-radius:50%;background:#f2f2f3;color:#111214;display:grid;place-items:center;font-size:19px;flex:none}
  p{margin:10px 0 20px;color:#a9abb3}
  .pic{flex:1;position:relative}
  img{display:block;border-radius:8px;width:100%}
  .q{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;font-size:21px} .q b{width:100%;font-weight:600;margin-bottom:2px}
  .q span{border:1.5px solid #3a3b41;border-radius:999px;padding:5px 13px;color:#c9cad0}
  .q span.on{background:${STORY.brand};border-color:${STORY.brand};color:#fff}
  .mono{font:400 19px/1.5 ui-monospace,Consolas,monospace;background:#0c0d0f;border-radius:10px;padding:16px 18px;color:#d9dade}
  .mono em{font-style:normal;color:#9fbf72;display:block} .mono .gap{margin-top:12px} .mono .dim{color:#7d7f87}
  .mono .ok{color:#9fbf72;font-weight:700}
  .three{display:grid;grid-template-columns:1fr 1fr;gap:12px} .three figure{margin:0} .three figure:first-child{grid-column:1/-1}
  .three figcaption{font-size:19px;color:#a9abb3;margin-top:6px} .three figure:first-child img{outline:3px solid #9fbf72;outline-offset:3px}
  .build{position:relative;padding-right:22%} .build .ph{position:absolute;right:0;bottom:-6px;width:26%;border-radius:12px;border:4px solid #2a2b2f}
  .check{display:grid;grid-template-columns:40% 1fr;gap:16px;align-items:start}
  .say{margin-top:14px;font-size:21px;color:#f2f2f3;background:#2a2b2f;border-radius:14px 14px 4px 14px;padding:10px 14px;display:inline-block}
  .after{margin:18px 0 0} .hosts{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px} .hosts span{border:1.5px solid #3a3b41;border-radius:8px;padding:5px 12px;font-size:20px;color:#c9cad0}
  </style>
  <header><h1>How one run goes</h1><span>Kleiner Kaffee, a made-up café, from the first question to a finished site</span></header>
  <main>
  ${step(1, 'You answer a few questions', 'Six or seven, all multiple choice. Then your text and photos, if you have any.',
    q("What's the site for?", ['Me and my work', 'A small business', 'A product', 'An event'], 'A small business')
    + q('How should it feel?', ['Quiet', 'Bold', 'Warm', 'Night'], 'Warm')
    + q('Colours?', ['Pick them for me', 'I have a logo', 'Black and white plus one'], 'Pick them for me')
    + q('How much movement?', ['Gentle', 'Still', 'Lively', 'Showpiece'], 'Gentle'))}
  ${step(2, 'It writes a brief', 'Facts only you have, one job for the site, and three ideas. The one it keeps has to fail on any other business.',
    `<div class="mono"><em>Facts only they have</em>${facts.map((f) => `<div>${esc(f)}</div>`).join('')}<em class="gap">The idea</em>${esc(idea)}<em class="gap">Swap test: passes</em></div>`)}
  ${step(3, 'You pick a first screen', 'Three takes on the top of the page, with your own name and words, one of them the classic. Pick one, or mix two.',
    `<div class="three">${(screens ? STORY.screens : ['A · Warm', 'B · Bold', 'C · Quiet'])
      .map((c, i) => `<figure><img src="${'abc'[i]}.jpg"><figcaption>${c}</figcaption></figure>`).join('')}</div>`)}
  ${step(4, 'It builds the whole site', 'Plain HTML, CSS and JavaScript. Real content, real pictures first, every link working.',
    `<div class="build"><img src="desktop.jpg"><img class="ph" src="phone.jpg"></div>`)}
  ${step(5, 'It checks it in a real browser', 'Screenshots at phone, tablet and desktop size, numbered so you can point. It films how the page moves, too.',
    `<div class="check"><img src="numbers.jpg"><div><div class="mono">${numbers.map((l) => `<div>${esc(l)}</div>`).join('')}</div><div class="say">“Make 2a a bit smaller.”</div></div></div>`)}
  ${step(6, 'It goes online', 'A last audit: links, contrast, link previews, search, speed. Then it publishes where you choose.',
    `<div class="mono"><span class="dim">$ node audit.mjs dist</span><br><span class="ok">${esc(verdict[0])}</span><br>${esc(verdict[1] || '')}</div><div class="hosts"><span>GitHub Pages</span><span>Vercel</span><span>Netlify</span><span>Cloudflare</span><span>Your own domain</span></div><p class="after">You get the address, the code, and a short EDITING.md on how to change things later.</p>`)}
  </main>`;
}
