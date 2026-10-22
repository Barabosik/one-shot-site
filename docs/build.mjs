#!/usr/bin/env node
// Builds the project page: docs/site (a one-shot-site project, made with the skill) with every example site built
// into it, ready to click through. The GitHub Pages workflow (.github/workflows/pages.yml) runs this and publishes
// the folder.
//
//   node docs/build.mjs <out> [--url https://owner.github.io/repo/]
//       The whole page into <out>: installs and builds docs/site and every example (needs npm). --url fills in the
//       address (canonical, link preview, sitemap, the 404 page's way home). Without it the page is a draft, like
//       a new site before set-url.
//   node docs/build.mjs <out> --no-sites   the page, its pictures and media, without the example sites
//   node docs/build.mjs <out> --keep-og    keeps og.html in <out>, to photograph the link preview from it:
//       node skills/one-shot-site/scripts/images.mjs og <out> --out docs/site/public/og.jpg
//   node docs/build.mjs --page             only rewrite the example sites' block in docs/site/index.html
//
// The block comes from each examples/<name>/README.md: its title, first line, **Answers:** and **What it did with
// that:**. The page shows each site in a window whose address bar holds its answers, and runs the real site in it.
// The example sites are built with relative paths, so they work under any address, and get a noindex tag: they
// are demos of made-up businesses, not real ones.
//
// Check the result with the skill's own tools, as a run would:
//   node skills/one-shot-site/scripts/look.mjs <out> --pages / --widths 390,1440
//   node skills/one-shot-site/scripts/audit.mjs <out> --site docs/site --draft
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
// Pages hands the workflow an http:// address until "Enforce HTTPS" is ticked, though it serves the page over
// https: the canonical, link-preview and sitemap addresses always say https (a local address keeps http)
const url = flag('--url') ? String(args[args.indexOf('--url') + 1]).replace(/\/?$/, '/').replace(/^http:\/\/(?!(localhost|127\.0\.0\.1|\[::1\])[:/])/, 'https://') : null;
if (url !== null && !/^https?:\/\/[^/]+\//.test(url)) { console.error('--url needs a full address: --url https://owner.github.io/repo/'); process.exit(2); }
const outArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
if (!outArg && !flag('--page')) { console.error('node docs/build.mjs <out folder> [--url https://…/] [--no-sites]   or   node docs/build.mjs --page'); process.exit(2); }
const out = outArg && resolve(outArg);
if (out && (out === root || root.startsWith(out) || out.startsWith(join(root, 'docs')))) { console.error(`${out} is inside the repo's docs or holds the repo; pick a folder outside it.`); process.exit(2); }
const site = join(root, 'docs/site');
const page = join(site, 'index.html');
// The example sites are built as of this day (site-data.js reads SITE_TODAY), so events and closures that were
// ahead when they were made stay on the page instead of dropping off at the next Pages build.
const EXAMPLES_DAY = '2026-10-20';
const REPO = 'https://github.com/Barabosik/one-shot-site/tree/main/examples/';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '$1');
// "**Label:** text that may run over several lines" up to the next blank line
const field = (md, label) => {
  const m = md.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?:\\n\\s*\\n|$)`));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

const gallery = readFileSync(join(root, 'examples/README.md'), 'utf8');
const order = (name) => { const i = gallery.indexOf(`](${name})`); return i < 0 ? Infinity : i; };
const examples = readdirSync(join(root, 'examples'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, 'examples', d.name, 'README.md')) && existsSync(join(root, 'examples', d.name, 'site')))
  .map((d) => {
    const md = readFileSync(join(root, 'examples', d.name, 'README.md'), 'utf8');
    const ex = {
      name: d.name,
      title: (md.match(/^# (.+)$/m) || [])[1],
      line: (md.split('\n').find((l, i, all) => l.trim() && i > all.findIndex((x) => x.startsWith('# '))) || '').trim(),
      answers: field(md, 'Answers').split('·').map((s) => s.trim()).filter(Boolean),
      did: field(md, 'What it did with that'),
    };
    const missing = Object.entries(ex).filter(([, v]) => !v || !v.length).map(([k]) => k);
    if (missing.length) { console.error(`examples/${d.name}/README.md is missing: ${missing.join(', ')}`); process.exit(1); }
    return ex;
  })
  // in the order examples/README.md lists them
  .sort((x, y) => order(x.name) - order(y.name) || x.name.localeCompare(y.name));

// the block, written into docs/site/index.html between the markers: tabs (shown by the page's script) and one
// window per site, which is also how the page reads without scripts
const arrow = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6.5 5H11v4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const did = (e) => inline(e.did.charAt(0).toUpperCase() + e.did.slice(1));
const block = `        <div class="runs-tabs" role="tablist" aria-label="The six example sites" hidden>
${examples.map((e) => `          <button type="button" role="tab" id="tab-${e.name}" aria-controls="run-${e.name}" aria-selected="false"><span class="tab-name">${esc(e.title)}</span><span class="tab-what">${inline(e.line)}</span></button>`).join('\n')}
        </div>
        <div class="runs">
${examples.map((e) => `          <div class="run" id="run-${e.name}" data-name="${e.name}" data-src="${e.name}/" aria-labelledby="run-${e.name}-h">
            <div class="window">
              <div class="bar"><span class="lights" aria-hidden="true"></span><p class="address"><span class="visually-hidden">Answers: </span>${e.answers.map(esc).join(' · ')}</p><a class="bar-open" href="${e.name}/">Open<span class="visually-hidden"> ${esc(e.title)}</span> ${arrow}</a></div>
              <div class="stage"><div class="screen"><img class="desk" src="shots/${e.name}-desktop.jpg" width="1440" height="900" loading="lazy" alt="${esc(e.title)} at desktop width"><img class="phone" src="shots/${e.name}-phone.jpg" width="390" height="844" loading="lazy" alt="${esc(e.title)} on a phone"></div></div>
            </div>
            <div class="run-text">
              <h3 id="run-${e.name}-h">${esc(e.title)}</h3>
              <p class="what">${inline(e.line)}</p>
              <p>${did(e)}</p>
              <p class="links"><a class="text-link" href="${e.name}/">Open the site</a><a class="text-link" href="${REPO}${e.name}">Answers, brief and source</a></p>
            </div>
          </div>`).join('\n')}
        </div>`;
const html = readFileSync(page, 'utf8');
const start = html.indexOf('<!-- examples:start'), end = html.indexOf('<!-- examples:end -->');
if (start < 0 || end < 0) { console.error('docs/site/index.html lost its <!-- examples:start … --> / <!-- examples:end --> markers.'); process.exit(1); }
const startEnd = html.indexOf('-->', start) + 3;
const next = html.slice(0, startEnd) + '\n' + block + '\n' + html.slice(end);
if (next !== html) writeFileSync(page, next);
console.log(`docs/site/index.html: ${examples.length} examples`);
if (flag('--page')) process.exit(0);

// the page itself: a one-shot-site project, built like any other, with relative paths
const sh = (cwd, cmd, env = {}) => execSync(cmd, { cwd, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
const install = (dir) => { if (!existsSync(join(dir, 'node_modules'))) sh(dir, 'npm install --no-audit --no-fund --no-package-lock'); };
rmSync(out, { recursive: true, force: true });
install(site);
sh(site, `npx vite build --outDir "${out}" --emptyOutDir`, { BASE: './' });
// og.html is only there to be photographed into og.jpg, as in the examples below; visitors never need it
if (!flag('--keep-og')) rmSync(join(out, 'og.html'), { force: true });
console.log('the page built');

// its pictures: the files in docs/media that the page names (the rest are the README's), and each example's
// screenshots
mkdirSync(join(out, 'media'), { recursive: true });
const used = new Set([...readFileSync(join(out, 'index.html'), 'utf8').matchAll(/media\/([\w.-]+)/g)].map((m) => m[1]));
for (const f of used) {
  if (!existsSync(join(root, 'docs/media', f))) { console.error(`docs/site/index.html names media/${f}, which isn't in docs/media.`); process.exit(1); }
  cpSync(join(root, 'docs/media', f), join(out, 'media', f));
}
mkdirSync(join(out, 'shots'), { recursive: true });
for (const e of examples) for (const shot of ['desktop', 'phone']) cpSync(join(root, 'examples', e.name, `${shot}.jpg`), join(out, 'shots', `${e.name}-${shot}.jpg`));

// the address, where it is known; without it robots.txt names no sitemap and there is none, as in a draft
const fill = (text) => (url ? text.replaceAll('{{URL}}', url) : text);
const relative = (text) => text.replace(/(href|src|poster)="\/(?!\/)/g, '$1="./');
writeFileSync(join(out, 'index.html'), fill(relative(readFileSync(join(out, 'index.html'), 'utf8'))));
// the 404 page links home by the full address; a draft has none, so it links to the root it is served from
writeFileSync(join(out, '404.html'), readFileSync(join(out, '404.html'), 'utf8').replaceAll('{{URL}}', url || '/'));
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${url ? `\nSitemap: ${url}sitemap.xml\n` : ''}`);
if (url) writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc></url>\n</urlset>\n`);
else rmSync(join(out, 'sitemap.xml'), { force: true });
writeFileSync(join(out, '.nojekyll'), '');

if (!flag('--no-sites')) {
  for (const e of examples) {
    const dir = join(root, 'examples', e.name, 'site');
    install(dir);
    sh(dir, `npx vite build --outDir "${join(out, e.name)}" --emptyOutDir`, { BASE: './', SITE_TODAY: EXAMPLES_DAY });
    // og.html is only there to be photographed into og.jpg; visitors never need it
    rmSync(join(out, e.name, 'og.html'), { force: true });
    // {{URL}} becomes the example's own address; links like href="/" or "/#menu" point at the site's own root:
    // make them relative, since it lives in a folder
    for (const f of readdirSync(join(out, e.name)).filter((f) => /\.(html|txt|xml)$/.test(f))) {
      const p = join(out, e.name, f);
      let text = readFileSync(p, 'utf8');
      if (url) text = text.replaceAll('{{URL}}', `${url}${e.name}/`);
      if (f.endsWith('.html')) {
        text = text.replace(/(href|src)="\/(?!\/)/g, '$1="./');
        if (!/<meta name="robots"/i.test(text)) text = text.replace(/(<meta charset="utf-8">)/i, '$1\n  <meta name="robots" content="noindex">');
      }
      writeFileSync(p, text);
    }
    console.log(`${e.name}/ built`);
  }
}
console.log(`Ready: ${out}`);
