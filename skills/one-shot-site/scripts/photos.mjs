#!/usr/bin/env node
// photos: free photos for when the person has none of their own. Searches Openverse, and Wikimedia Commons when
// Openverse is down or finds nothing (photos that are public domain, CC0 or CC BY, so a business may use them),
// shows them numbered on one sheet, and fetches the chosen ones: resized for the web, with their credits written down.
//
//   node photos.mjs search "sourdough bread" [--shape wide|tall|square] [--big] [--count 12] [--page 2] [--from commons]
//   node photos.mjs get 3 [7 …] [--as loaf] [--hero] [--out public/img] [--widths 800,1600] [--format webp|jpeg]
//
// search: photos.jpg (the sheet to show) and photos.json in .one-shot/photos (--dir for another folder; get reads
// the same one). --big: only large originals.
// get: downloads each number from the last search, makes the web sizes with images.mjs (printing the <img> tag),
// and adds its credit to public/img/CREDITS.md. A CC BY photo must be credited on the page: get prints the line.
//
// Free photos show the subject in general (bread, a city, tools, a texture). Never present one as the person's
// own shop, team, food or work. Their own photos always win. Exit code 2 = bad input or neither source reachable.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { args, imageSize, num, nums, write, stopOnError, usage } from './lib/cli.mjs';

stopOnError();
const a = args(import.meta.url);
if (a.help) usage(import.meta.url, 0);
const [what, ...rest] = a._;
const dir = resolve(a.dir || '.one-shot/photos');
const API = process.env.OPENVERSE_API || 'https://api.openverse.org/v1/images/'; // tests point this at a stand-in
const LICENSES = { cc0: 'CC0', pdm: 'Public domain', by: 'CC BY' };
const UA = 'one-shot-site (https://github.com/Barabosik/one-shot-site)';

// a photo for a web page, not whatever a server sends
const MAX_MB = 40;
const tooBig = (url) => Object.assign(new Error(`The file at ${new URL(url).host} is over ${MAX_MB} MB, too big for a photo on a web page. Pick another number.`), { final: true });

// Openverse is free and keyless, and sometimes slow: wait up to 30 s, try twice.
async function fetchOnce(url, as = 'json') {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (res.ok && as === 'json') return res.json();
      if (res.ok) {
        if (+res.headers.get('content-length') > MAX_MB * 2 ** 20) throw tooBig(url);
        const chunks = [];
        let size = 0;
        for await (const c of res.body) { if ((size += c.length) > MAX_MB * 2 ** 20) throw tooBig(url); chunks.push(c); }
        return Buffer.concat(chunks);
      }
      if (res.status < 500 || attempt === 2) throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      if (e.final) throw e;
      // "fetch failed" is Node's word for it; the reason is in e.cause. A refused certificate is not "no internet".
      const c = e.cause?.code || e.cause?.errors?.[0]?.code || ''; // several addresses tried: an AggregateError
      const why = e.name === 'TimeoutError' ? 'no answer in 30 s' : e.message !== 'fetch failed' ? e.message
        : c === 'ECONNREFUSED' ? 'connection refused'
        : /^(ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT)$/.test(c) ? 'no internet connection?'
        : /CERT|SSL|TLS|VERIFY/.test(c) ? `the secure connection failed: ${c}; a proxy or antivirus that checks traffic?`
        : c || e.cause?.message || e.message;
      if (attempt === 2) throw new Error(`Couldn't reach ${new URL(url).host} (${why}). Try again in a minute.`);
    }
  }
}

// Wikimedia Commons, the second source: when Openverse is down or finds nothing (or --from commons). Keyless too.
// Only what a business may use without sharing alike: CC0, public domain, CC BY. Its results take Openverse's shape.
// Commons also holds maps, diagrams, logos, flags, coats of arms and scanned documents on every subject; a search for
// "bakery" finds a bakery's logo and a town's coat of arms with a loaf on it. Their titles and categories say so.
const COMMONS = process.env.COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
const OFF_TOPIC = new RegExp('\\b(' + [
  'maps?', 'map of', 'karte', 'stadtplan', 'lageplan', 'floor ?plans?', 'street ?plans?', 'city ?plans?', 'site ?plans?',
  'diagrams?', 'schematics?', 'schemas?', 'charts?', 'graphs?', 'infographics?',
  'logos?', 'logotypes?', 'wordmarks?',
  'flags?', 'flagge', 'coats? of arms', 'wappen', 'heraldry', 'blazons?', 'escudos?', 'emblems?',
  'scans?', 'scanned', 'documents?', 'manuscripts?', 'newspapers?', 'book pages?', 'title pages?', 'certificates?', 'pdf', 'djvu',
  'screenshots?', 'svg',
].join('|') + ')\\b', 'i');
// a PNG is often a drawing, not a photo: it needs a hint less to go
const DRAWN = /\b(illustrations?|drawings?|clip ?art|icons?|renders?|renderings?|cartoons?|vectors?)\b/i;
async function commons(q, { shape, big } = {}) {
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '50', prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '500',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|Categories', origin: '*' });
  const pages = Object.values((await fetchOnce(`${COMMONS}?${params}`)).query?.pages || {}).sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
  const text = (v) => String(v || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const clean = (u) => String(u || '').replace(/\?utm_[^#]*$/, '');
  return pages.flatMap((p) => {
    const i = p.imageinfo?.[0];
    if (!i || !/^image\/(jpeg|png|webp)$/.test(i.mime)) return [];
    const m = i.extmetadata || {};
    const lic = text(m.LicenseShortName?.value);
    const license = /^cc0\b/i.test(lic) ? 'cc0' : /^(public domain|pd\b)/i.test(lic) ? 'pdm' : /^cc by \d/i.test(lic) ? 'by' : null;
    if (!license) return []; // BY-SA, GFDL, fair use…
    const about = `${p.title} ${text(m.Categories?.value).replace(/\|/g, ' | ')}`;
    if (OFF_TOPIC.test(about) || (i.mime === 'image/png' && DRAWN.test(about))) return [];
    const ratio = i.width / i.height;
    if (shape === 'wide' && ratio < 1.2) return [];
    if (shape === 'tall' && ratio > 0.85) return [];
    if (shape === 'square' && (ratio < 0.85 || ratio > 1.2)) return [];
    if (big && i.width < 1600) return [];
    // a large original comes as Commons' own 1920px copy, not a 40 MB camera file
    const wide = i.width > 1920 && i.thumburl;
    return [{
      id: 'commons-' + p.pageid, title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''), creator: text(m.Artist?.value) || 'unknown',
      creator_url: '', source: 'Wikimedia Commons', license, license_version: lic.match(/\d(\.\d)?/)?.[0] || '',
      license_url: m.LicenseUrl?.value || (license === 'cc0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/publicdomain/mark/1.0/'),
      foreign_landing_url: i.descriptionurl, url: wide ? clean(i.thumburl).replace(/\/500px-/, '/1920px-') : clean(i.url),
      thumbnail: clean(i.thumburl) || clean(i.url), width: wide ? 1920 : i.width, height: wide ? Math.round(1920 / ratio) : i.height,
      tags: text(m.ImageDescription?.value).split(' ').slice(0, 40).map((name) => ({ name })),
    }];
  });
}

const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const credit = (p) => `"${p.title || 'Untitled'}" by ${p.creator || 'unknown'} (${p.source}), ${LICENSES[p.license]}${p.license === 'by' ? ' ' + p.license_version : ''}`;
// for the credit line that goes into a page: titles and names are whatever the uploader typed, and a link is only
// a web address (audit.mjs reads the names back with the entities undone)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const web = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '');

// After a fetch, end with return and process.exitCode, never process.exit: on Windows, exiting while fetch is
// still closing its sockets can crash Node ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)").
async function search() {
  const q = rest.join(' ').trim();
  if (!q) { console.error('Usage: node photos.mjs search "what to look for" [--shape wide] [--big]'); process.exit(2); }
  const count = num(a.count, '--count', { def: 12, min: 1, max: 20, int: true });
  const page = num(a.page, '--page', { def: 1, min: 1, max: 100, int: true });
  if (a.shape !== undefined && !['wide', 'tall', 'square'].includes(a.shape)) throw new Error('--shape takes wide, tall or square');
  if (a.from !== undefined && a.from !== 'commons') throw new Error('--from takes commons (leave it out to try Openverse first)');
  const params = new URLSearchParams({ q, license: Object.keys(LICENSES).join(','), category: 'photograph', page_size: '20', page: String(page), mature: 'false' });
  if (a.shape) params.set('aspect_ratio', String(a.shape));
  if (a.big) params.set('size', 'large');
  // the same search again (a second look, another --count) comes from the last day's answers, not the network
  const cached = (key) => join(dir, 'cache', createHash('sha1').update(key).digest('hex').slice(0, 16) + '.json');
  const fresh = (file) => { try { if (Date.now() - statSync(file).mtimeMs < 864e5) return JSON.parse(readFileSync(file, 'utf8')); } catch {} return null; };
  let results = null, from = 'Openverse', why = null;
  if (a.from !== 'commons') {
    const file = cached(API + String(params));
    results = fresh(file);
    if (!results) {
      console.error(`Searching Openverse for "${q}" (it can take a minute)…`);
      try { results = (await fetchOnce(`${API}?${params}`)).results || []; write(file, results); }
      catch (e) { why = `Openverse didn't answer (${e.message.match(/\((.*)\)/)?.[1] || e.message})`; }
    }
    if (!why && !results.length) why = `Openverse found nothing for "${q}"${a.shape || a.big ? ' in that shape or size' : ''}`;
  }
  if (!results?.length) {
    from = 'Wikimedia Commons';
    // one line that says why the second source is asked
    if (why) console.error(`${why}: trying Wikimedia Commons.`);
    const file = cached(COMMONS + q + a.shape + a.big + ' on-topic'); // a new key: answers cached before the filter go unused
    results = fresh(file);
    if (!results) {
      results = await commons(q, { shape: a.shape, big: a.big });
      write(file, results);
    }
  }
  // Openverse ranks loosely ("fishing boats" brings beaches): photos whose title and tags name the words come
  // first, larger ones before smaller. One photo per title and photographer: a series of near-identical shots is
  // one choice.
  const plain = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const words = plain(q).split(/\s+/).filter((w) => w.length > 2);
  const hits = (p) => { const t = plain([p.title, ...(p.tags || []).map((x) => x.name)].join(' ')); return words.filter((w) => t.includes(w.replace(/s$/, ''))).length; };
  const seen = new Set();
  const found = results.filter((p) => !seen.has(p.title + '|' + p.creator) && seen.add(p.title + '|' + p.creator))
    .map((p, i) => ({ p, i, hits: hits(p), big: (p.width || 0) >= 1600 }))
    .sort((x, y) => y.hits - x.hits || +y.big - +x.big || x.i - y.i)
    .map((x) => x.p).slice(0, count);
  if (!found.length) { console.log(`Nothing for "${q}"${a.big ? ' in large sizes' : ''}. Try fewer or plainer words, in English${a.big ? ', or drop --big' : ''}.`); return; }
  const list = found.map((p, i) => ({
    n: i + 1, id: p.id, title: p.title, creator: p.creator, creator_url: p.creator_url, source: p.source,
    license: p.license, license_version: p.license_version, license_url: p.license_url, landing: p.foreign_landing_url,
    url: p.url, thumb: p.thumbnail, width: p.width, height: p.height,
  }));
  write(join(dir, 'photos.json'), { q, list });

  const cell = (p) => `<figure><div class="img"><img src="${p.thumb}" alt=""><b>${p.n}</b></div><figcaption>${p.width && p.height ? `${p.width}×${p.height}` : '?'} · ${LICENSES[p.license]} · ${(p.creator || 'unknown').replace(/</g, '&lt;').slice(0, 28)}</figcaption></figure>`;
  write(join(dir, 'photos.html'), `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#222;font:600 15px system-ui;color:#ddd} h1{font-size:17px;margin:0 0 16px}
    .g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px} figure{margin:0}
    .img{position:relative;aspect-ratio:4/3;background:#333;overflow:hidden} img{width:100%;height:100%;object-fit:cover;display:block}
    b{position:absolute;left:0;top:0;background:#ff2d75;color:#fff;font:700 22px/1 system-ui;padding:6px 10px;border-radius:0 0 8px 0}
    figcaption{margin-top:6px;color:#999;font-weight:500;font-size:13px}</style>
    <h1>"${q.replace(/</g, '&lt;')}" · free photos from ${from}</h1><div class="g">${list.map(cell).join('')}</div>`);
  const b = await launch();
  try {
    const page = await b.newPage({ width: 1600, height: 900 });
    await page.goto('file:///' + join(dir, 'photos.html').replace(/\\/g, '/'));
    await page.eval(`Promise.race([Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 45000))])`);
    const h = await page.eval('document.documentElement.scrollHeight');
    await page.shot(join(dir, 'photos.jpg'), { quality: 82, clip: { x: 0, y: 0, width: 1600, height: h } });
  } finally { await b.close(); }
  console.log(`Sheet: ${join(dir, 'photos.jpg')}`);
  for (const p of list) console.log(`${String(p.n).padStart(2)}. ${p.width}×${p.height}  ${short(credit(p), 110)}`);
  console.log('\nFetch with: node photos.mjs get <number> [--as name]. Below 1600px wide is too small for a full-width picture.');
}

async function get() {
  const picks = rest.map(Number).filter(Boolean);
  if (!picks.length) { console.error('Usage: node photos.mjs get 3 [7 …] [--as name]'); process.exit(2); }
  if (!existsSync(join(dir, 'photos.json'))) { console.error('Search first: node photos.mjs search "…"'); process.exit(2); }
  const { q, list } = JSON.parse(readFileSync(join(dir, 'photos.json'), 'utf8'));
  const missing = picks.find((n) => !list.some((x) => x.n === n));
  if (missing) { console.error(`No photo ${missing} in the last search (1 to ${list.length}).`); process.exit(2); }
  // checked here too, so a typo stops before the downloads, not after them in images.mjs
  if (a.widths !== undefined) nums(a.widths, '--widths', { def: [800, 1600], min: 16, max: 8000, int: true });
  const out = resolve(a.out || 'public/img');
  const credits = join(out, 'CREDITS.md');
  mkdirSync(out, { recursive: true });
  if (!existsSync(credits)) writeFileSync(credits, '# Photo credits\n\nFree photos on this site, from Openverse and Wikimedia Commons. "CC BY" ones are credited on the page too.\n\n');
  const onPage = [];
  for (const [i, n] of picks.entries()) {
    const p = list.find((x) => x.n === n);
    // named for what was searched ("sourdough-bread-3"), not the photo's own title, which is often "IMG_2041"
    // (a name with no Latin letters, like "日本", is photo-3, not the source's long id)
    const slug = (a.as ? String(a.as) + (picks.length > 1 ? `-${i + 1}` : '') : `${q || 'photo'}-${n}`).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `photo-${n}`;
    if (!/^https?:\/\//i.test(String(p.url || ''))) { console.error(`Photo ${n} has no web address to fetch. Search again.`); process.exitCode = 2; break; }
    // a failed download stops the loop the same way: a throw lost the CC BY lines of the photos fetched before it
    let data;
    try { data = await fetchOnce(p.url, 'buffer'); } catch (e) { console.error(e.message); process.exitCode = 2; break; }
    // an error page or a "no hotlinking" page comes back as 200 too
    const ext = data[0] === 0xff ? 'jpg' : data[0] === 0x89 ? 'png' : data.toString('ascii', 0, 3) === 'GIF' ? 'gif'
      : data.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : data.toString('ascii', 4, 8) === 'ftyp' ? 'avif' : null;
    if (!ext) { console.error(`Photo ${n} came back as something that is not a picture (an error page?). Pick another number, or try again later.`); process.exitCode = 2; break; }
    // the listing gives the original's size; the file served can be a smaller copy
    const real = imageSize(data);
    if (real && p.width && real[0] < p.width * 0.9) { console.log(`  (photo ${n}: listed ${p.width}×${p.height}, the file served is ${real[0]}×${real[1]})`); p.width = real[0]; p.height = real[1]; }
    const original = join(dir, `${slug}.${ext}`);
    writeFileSync(original, data);
    const made = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'images.mjs'), 'photo', original, '--out', out,
      ...(a.widths ? ['--widths', String(a.widths)] : []), ...(a.hero ? ['--hero'] : []), ...(a.format ? ['--format', String(a.format)] : [])], { encoding: 'utf8' });
    process.stdout.write(made.stdout);
    // a child killed by a signal has status null; break, not return, keeps the CC BY lines of the photos before it
    if (made.status !== 0) { process.stderr.write(made.stderr || ''); process.exitCode = made.status || 1; break; }
    // the same photo fetched again is credited once
    const line = `- \`${slug}-*\`: ${credit(p)}, resized. License: ${p.license_url}. Source: ${p.landing}\n`; // CC BY asks to say it was changed
    if (!readFileSync(credits, 'utf8').includes(line)) appendFileSync(credits, line);
    if (p.license === 'by') onPage.push(p);
    if (p.width && p.width < 1600) console.log(`  (${p.width}px wide: fine for a card or a half-width picture, too small to fill a screen)`);
  }
  if (onPage.length) {
    console.log('\nCC BY: put this credit on the page, near the photo or in the footer:');
    for (const p of onPage) console.log(`  <small class="credit">Photo: <a href="${web(p.landing)}">${esc(p.title || 'Untitled')}</a> by ${web(p.creator_url) ? `<a href="${web(p.creator_url)}">${esc(p.creator)}</a>` : esc(p.creator)}, <a href="${web(p.license_url)}">CC BY ${esc(p.license_version)}</a>, resized</small>`);
  }
  console.log(`Credits: ${credits}`);
}

if (what === 'search') await search();
else if (what === 'get') await get();
else usage(import.meta.url);
