// Redesigns and versions: reading an old site (redesign.mjs) and showing concepts (mockup.mjs --concepts).
// The browser tests drive the real browser, like the skill does. Skipped when no Chrome-type browser exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findBrowser, launch, sleep } from '../skills/one-shot-site/scripts/lib/chrome.mjs';
import { serve } from '../skills/one-shot-site/scripts/lib/serve.mjs';
import { download, findFacts, pageKey, pairOf, parseHours, privateHost, readPrice, relativeTarget, slugOf, stubFile } from '../skills/one-shot-site/scripts/redesign.mjs';

const SCRIPTS = resolve('skills/one-shot-site/scripts');
const skip = findBrowser() ? false : 'no Chrome, Edge, Brave or Chromium installed';
// async, never spawnSync: the sites in these tests are served from this process
const run = (script, args, cwd) => new Promise((ok) => {
  const p = spawn(process.execPath, [join(SCRIPTS, script), ...args], { cwd });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (status) => ok({ status, out }));
});
// a concept sheet's faces come from cdn.jsdelivr.net: out of reach, the run stops on purpose (browser.test.mjs
// tests that), so a drawing test is skipped then, not failed
const cdnDown = async (r) => r.status === 2 && /Did not load/.test(r.out)
  && !(await fetch('https://cdn.jsdelivr.net/npm/@fontsource/gloock/400.css', { signal: AbortSignal.timeout(10000) }).then((x) => x.ok, () => false));

test('opening hours in the ways old sites write them', () => {
  const h = (text, lang) => parseHours(text, lang).map((r) => `${r.days} ${r.opens}-${r.closes}`).join('; ');
  assert.equal(h('Mo–Fr 7–18 Uhr, Sa 8–13 Uhr', 'de'), 'Mon-Fri 07:00-18:00; Sat 08:00-13:00');
  assert.equal(h('Di - Fr: 7.00 - 18.30 Uhr', 'de'), 'Tue-Fri 07:00-18:30');
  assert.equal(h('Montag bis Freitag 7:00 bis 12:00 und 14:00 bis 18:00 Uhr', 'de'), 'Mon-Fri 07:00-12:00; Mon-Fri 14:00-18:00', 'a lunch break');
  assert.equal(h('Sa, So und Feiertage 9-17 Uhr', 'de'), 'Sat-Sun 09:00-17:00');
  assert.equal(h('Fr-Mo 18-24 Uhr', 'de'), 'Fri-Mon 18:00-24:00', 'a range across the weekend');
  assert.equal(h('Mon-Fri 7am-6pm, Sat 9am to 1pm', 'en-GB'), 'Mon-Fri 07:00-18:00; Sat 09:00-13:00');
  assert.equal(h('Saturday & Sunday: 10 - 4', 'en'), 'Sat-Sun 10:00-16:00', '"10 - 4" means until four in the afternoon');
  assert.equal(h('Montag Ruhetag', 'de'), '', 'a closed day gives no row');
  assert.equal(h('Betriebsferien 24.12.-26.12.', 'de'), '', 'dates are not times');
  assert.equal(h('Saarbrücken, Domplatz 2', 'de'), '', '"Sa" inside a word is not Saturday');
});

test('page keys and names: one key per page, tracking parameters dropped', () => {
  assert.equal(pageKey('http://x.test/index.html?utm_source=news'), '/');
  assert.equal(pageKey('http://x.test/team/index.php'), '/team/');
  assert.equal(pageKey('http://x.test/index.php?page=menu&PHPSESSID=9'), '/?page=menu');
  assert.equal(slugOf('/speisekarte.html'), 'speisekarte');
  assert.equal(slugOf('/'), 'home');
});

test('facts from an old site: the most reliable source wins, and disagreements are listed', () => {
  const pages = [
    { path: '/', title: 'Café Lindenblatt – Startseite', lang: 'de-DE', description: 'Kuchen und Kaffee.', ld: [], pictures: [{ logo: true, alt: 'Café Lindenblatt Logo' }],
      blocks: [
        { tag: 'h1', text: 'Herzlich willkommen!', region: 'main' },
        { tag: 'p', text: 'Öffnungszeiten:\nDi–Fr 8–18 Uhr\nSa 8–14 Uhr\nMontag Ruhetag', region: 'main' },
        { tag: 'td', text: 'Café Lindenblatt · Lindenstraße 14 · 12345 Musterstadt\nTelefon: 000 / 00 00 01\nTelefax: 000 / 00 00 02', region: 'footer' },
        { tag: 'p', text: 'Fragen? kontakt (at) cafe-lindenblatt (punkt) example', region: 'main' },
      ],
      links: [
        { text: 'Facebook', href: 'https://www.facebook.example/cafelindenblatt', region: 'footer' },
        { text: 'Teilen', href: 'https://www.facebook.example/sharer/sharer.php?u=x', region: 'main' },
        { text: 'Tisch reservieren', href: 'https://www.quandoo.example/cafe-lindenblatt', region: 'main' },
      ] },
    { path: '/kontakt.html', title: 'Kontakt – Café Lindenblatt', lang: 'de-DE', ld: [], pictures: [],
      blocks: [{ tag: 'tr', text: 'Dienstag bis Freitag | 8.00 – 18.00 Uhr', region: 'main' }, { tag: 'tr', text: 'Samstag | 8.00 – 13.00 Uhr', region: 'main' }],
      links: [{ text: 'info@cafe-lindenblatt.example', href: 'mailto:info@cafe-lindenblatt.example?subject=Hallo', region: 'main' }, { text: '000 000001', href: 'tel:+4900000001', region: 'main' }] },
  ];
  const { draft, found, check } = findFacts(pages, { host: 'cafe-lindenblatt.example' });
  assert.equal(draft.name, 'Café Lindenblatt');
  assert.equal(draft.email, 'info@cafe-lindenblatt.example', 'a mailto link beats an address spelled out in the text');
  assert.ok(found.email.some((e) => e.value === 'kontakt@cafe-lindenblatt.example'), 'the "(at)" address is read too');
  assert.equal(found.phone.length, 1, '000 / 00 00 01 and +4900000001 are one number, and the fax is not a phone');
  assert.deepEqual(found.phone[0].found, ['/, footer text', '/kontakt.html, main tel link']);
  assert.deepEqual(draft.address, { street: 'Lindenstraße 14', postcode: '12345', city: 'Musterstadt', country: 'DE' });
  assert.deepEqual(draft.hours, [{ days: 'Tue-Fri', opens: '08:00', closes: '18:00' }, { days: 'Sat', opens: '08:00', closes: '14:00' }]);
  assert.match(check.join('\n'), /different opening hours: Sat 08:00-14:00 \(\/, p\) or 08:00-13:00 \(\/kontakt\.html, tr\)/);
  assert.deepEqual(draft.links, { facebook: 'https://www.facebook.example/cafelindenblatt', booking: 'https://www.quandoo.example/cafe-lindenblatt' }, 'the share button is not their page');
  assert.equal(draft.description, 'Kuchen und Kaffee.');
});

test('downloads: nothing on this machine or its network unless the site is there, and never more than the cap', async () => {
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.0.1', '169.254.169.254', '::1', '[::1]', 'fd12::1', 'fe80::1'])
    assert.ok(privateHost(h), `${h} is private`);
  for (const h of ['172.32.0.1', '11.0.0.1', 'cafe-lindenblatt.example', '2001:db8::1']) assert.ok(!privateHost(h), `${h} is not private`);
  // the same addresses spelled another way, and the shared and benchmark ranges: the body of one was saved to disk
  for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://100.64.0.1/', 'http://198.18.0.1/', 'http://[fec0::1]/', 'http://0.1.2.3/', 'http://localhost./', 'http://[::]/'])
    assert.ok(privateHost(new URL(u).hostname), `${u} is private`);
  for (const u of ['http://100.63.0.1/', 'http://100.128.0.1/', 'http://198.20.0.1/', 'http://[2606:4700::1111]/']) assert.ok(!privateHost(new URL(u).hostname), `${u} is not private`);

  const server = createServer((req, res) => {
    res.on('error', () => {});
    if (req.url === '/small.jpg') return res.end(Buffer.alloc(2000));
    if (req.url === '/says-big.jpg') { res.writeHead(200, { 'Content-Length': 5e6 }); return res.end(); }
    if (req.url === '/moved.jpg') { res.writeHead(302, { Location: '/small.jpg' }); return res.end(); }
    // no length given: the cap has to hold while reading
    res.writeHead(200);
    let n = 0;
    const more = () => { while (n++ < 40) if (!res.write(Buffer.alloc(65536))) return res.once('drain', more); res.end(); };
    more();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const at = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.match((await download(`${at}/small.jpg`, 1e6)).error, /private or local address/);
    assert.equal((await download(`${at}/small.jpg`, 1e6, { local: true })).data.length, 2000);
    assert.equal((await download(`${at}/moved.jpg`, 1e6, { local: true })).data.length, 2000, 'redirects are followed');
    assert.match((await download(`${at}/says-big.jpg`, 1e6, { local: true })).error, /5 MB, too big/);
    assert.match((await download(`${at}/endless.jpg`, 1e6, { local: true })).error, /over 1 MB, too big/);
    assert.match((await download('file:///etc/passwd', 1e6, { local: true })).error, /not a web address/);
  } finally { server.closeAllConnections(); server.close(); }
});

// A café site from about 2009: tables for layout, font tags, no viewport, a marquee, a background banner,
// spacer gifs, a PDF menu, an email written as "(at)", and two pages that disagree about Saturday.
function datedSite(dir) {
  mkdirSync(join(dir, 'bilder'), { recursive: true });
  copyFileSync(resolve('examples/kleiner-kaffee/desktop.jpg'), join(dir, 'bilder/kuchen.jpg'));
  copyFileSync(resolve('examples/patch-night/desktop.jpg'), join(dir, 'bilder/banner.jpg'));
  copyFileSync(resolve('examples/jonas-weber/desktop.jpg'), join(dir, 'bilder/shutterstock_88231.jpg')); // bought once, for this site
  writeFileSync(join(dir, 'bilder/spacer.gif'), Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  writeFileSync(join(dir, 'speisekarte.pdf'), '%PDF-1.4\n% Speisekarte\n%%EOF\n');
  const frame = (title, body) => `<html><head><title>${title}</title><meta name="generator" content="Microsoft FrontPage 5.0">
    <style>body{margin:0;background:#c9b48a}td{font-family:Verdana,Arial;font-size:11px}</style></head>
    <body><center><table width="780" cellpadding="0" cellspacing="0" bgcolor="#fffbe8">
      <tr><td colspan="2" id="kopf" style="background:url(bilder/banner.jpg);height:150px"><font size="6" color="#7a3b10"><b>Café Lindenblatt</b></font></td></tr>
      <tr><td width="160" valign="top" class="navigation"><a href="index.html">Startseite</a><br><a href="speisekarte.html">Speisekarte</a><br><a href="kontakt.html">Kontakt</a><br><a href="gaestebuch.html">Gästebuch</a><br><img src="bilder/spacer.gif" width="1" height="1"></td>
      <td valign="top">${body}</td></tr>
      <tr><td colspan="2" id="fuss"><font size="1">© 2009 Café Lindenblatt · Lindenstraße 14 · 12345 Musterstadt · Telefon: 000 / 00 00 01</font></td></tr>
    </table></center></body></html>`;
  writeFileSync(join(dir, 'index.html'), frame('Café Lindenblatt – Startseite', `<marquee>Neu: Zwetschgenkuchen!</marquee>
    <h1>Herzlich willkommen!</h1><p>Seit 1987 backen wir jeden Morgen Kuchen nach den Rezepten von Oma Hilde.</p>
    <img src="bilder/kuchen.jpg" width="400" height="250"><p><b>Öffnungszeiten:</b><br>Di–Fr 8–18 Uhr<br>Sa 8–14 Uhr<br>Montag Ruhetag</p>
    <p>Sie sind Besucher Nr. 004711</p>`));
  writeFileSync(join(dir, 'speisekarte.html'), frame('Speisekarte – Café Lindenblatt', `<h2>Unsere Kuchen</h2>
    <img src="bilder/shutterstock_88231.jpg" width="300" height="180">
    <table border="1"><tr><td>Zwetschgenkuchen</td><td>2,80 €</td></tr><tr><td>Käsekuchen</td><td>3,10 €</td></tr></table>
    <p><a href="speisekarte.pdf">Speisekarte als PDF</a></p>`));
  writeFileSync(join(dir, 'kontakt.html'), frame('Kontakt – Café Lindenblatt', `<h2>So erreichen Sie uns</h2>
    <p>E-Mail: <a href="mailto:info@cafe-lindenblatt.example">info@cafe-lindenblatt.example</a> oder kontakt (at) cafe-lindenblatt (punkt) example</p>
    <table><tr><td>Dienstag bis Freitag</td><td>8.00 – 18.00 Uhr</td></tr><tr><td>Samstag</td><td>8.00 – 13.00 Uhr</td></tr></table>
    <p><a href="https://www.facebook.example/cafelindenblatt">Besuchen Sie uns auf Facebook</a> · <a href="javascript:void(0)">Anfahrt</a></p>
    <form action="/cgi-bin/formmail.pl" method="post">Name: <input name="name"> Nachricht: <textarea name="text"></textarea><input type="submit" value="Absenden"></form>`));
}

test('redesign reads a dated site: content, facts, before shots, its photos and documents, then before and after', { skip, timeout: 300000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-redesign-'));
  const old = join(dir, 'old');
  datedSite(old);
  const server = await serve(old);
  const out = join(dir, 'out');
  try {
    const r = await run('redesign.mjs', [server.url + '/', '--out', out, '--wait', '400']);
    assert.equal(r.status, 0, r.out);

    const content = readFileSync(join(out, 'content.md'), 'utf8');
    const at = (s) => { const i = content.indexOf(s); assert.ok(i >= 0, `content.md lacks "${s}":\n${content}`); return i; };
    assert.ok(at('## / · Café Lindenblatt – Startseite') < at('h1: Herzlich willkommen!'));
    assert.ok(at('h1: Herzlich willkommen!') < at('Seit 1987 backen wir'), 'blocks in reading order');
    at('Öffnungszeiten: / Di–Fr 8–18 Uhr / Sa 8–14 Uhr / Montag Ruhetag');
    at('tr: Zwetschgenkuchen | 2,80 €');
    at('[header] td (32px): Café Lindenblatt'); // set large in a <font> tag, no heading
    assert.match(content, /img\/kuchen\.jpg ← \/bilder\/kuchen\.jpg · no alt text · \d+×\d+, shown at 400×250/);
    at('img/banner.jpg ← /bilder/banner.jpg · background picture');
    at('img/shutterstock-88231.jpg ← /bilder/shutterstock_88231.jpg · no alt text');
    assert.match(content, /shutterstock_88231\.jpg .* · may not be theirs \(from a stock photo site\): ask before reusing/);
    assert.doesNotMatch(content, /kuchen\.jpg .* may not be theirs/, 'their own photo is theirs');
    at('"Speisekarte als PDF" → /speisekarte.pdf (saved as files/speisekarte.pdf)');
    at('"Anfahrt" → javascript:void(0) (goes nowhere)');
    at('Form: Name, Nachricht (sends to /cgi-bin/formmail.pl, POST)'); // no labels: the words before each field
    assert.equal(content.match(/Speisekarte \(\/speisekarte\.html\)|"Speisekarte" → \/speisekarte\.html/g)?.length, 1, 'the navigation is listed once, not per page');

    const facts = JSON.parse(readFileSync(join(out, 'facts.json'), 'utf8'));
    assert.equal(facts.draft.name, 'Café Lindenblatt');
    assert.equal(facts.draft.email, 'info@cafe-lindenblatt.example');
    assert.equal(facts.draft.phone, '000 / 00 00 01');
    assert.equal(facts.draft.address.street, 'Lindenstraße 14');
    assert.equal(facts.draft.links.facebook, 'https://www.facebook.example/cafelindenblatt');
    assert.match(facts.check.join('\n'), /different opening hours: Sat/);

    for (const f of ['home-desktop', 'home-phone', 'speisekarte-desktop', 'kontakt-phone']) assert.ok(existsSync(join(out, 'before', f + '.jpg')), f);
    for (const f of ['before-sheet.jpg', 'img/kuchen.jpg', 'img/banner.jpg', 'files/speisekarte.pdf', 'study/study.md']) assert.ok(existsSync(join(out, f)), f);
    assert.ok(readFileSync(join(out, 'img/kuchen.jpg')).equals(readFileSync(join(old, 'bilder/kuchen.jpg'))), 'the photo is saved as it was, byte for byte');
    assert.match(readFileSync(join(out, 'files/speisekarte.pdf'), 'utf8'), /^%PDF-1\.4/);
    assert.ok(!existsSync(join(out, 'img/spacer.gif')), 'spacer gifs are not photos');
    assert.ok(!existsSync(join(out, 'before-sheet.html')), 'the sheet page is cleaned up');

    const md = readFileSync(join(out, 'redesign.md'), 'utf8');
    for (const want of ['No viewport tag on /, /speisekarte.html, /kontakt.html', 'At 390px wide the site', 'Laid out with tables', 'old HTML tags', 'Made with Microsoft FrontPage 5.0',
      'The newest copyright year on it is 2009', 'Body text is 11px', 'A visitor counter.', 'Pages that would not open: /gaestebuch.html: the server answers 404', 'img/kuchen.jpg: 2880×1800, big enough for a full-width picture', 'Ask before reusing: img/shutterstock-88231.jpg (from a stock photo site)', 'different opening hours'])
      assert.ok(md.includes(want), `redesign.md lacks "${want}":\n${md}`);

    // the new site: a home page and a contact page; the menu became a section of the home page
    const dist = join(dir, 'dist');
    mkdirSync(dist);
    const page = (body) => `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Café Lindenblatt</title><link rel="icon" href="data:,">
      <body style="margin:0;font:18px/1.5 system-ui;background:#f4efe6;color:#222">${body}</body></html>`;
    writeFileSync(join(dist, 'index.html'), page('<h1 style="font-size:64px;margin:0;padding:80px 24px">Kuchen seit 1987</h1><div style="height:1200px"></div><section id="menu" style="padding:24px"><h2>Kuchen</h2></section><div style="height:1200px"></div>'));
    writeFileSync(join(dist, 'kontakt.html'), page('<h1 style="padding:24px">Kontakt</h1>'));
    let c = await run('redesign.mjs', ['compare', server.url + '/', dist, '--out', out, '--wait', '300', '--pages', '/,/kontakt.html,/speisekarte.html=/#menu']);
    assert.equal(c.status, 0, c.out);
    assert.match(c.out, /\/speisekarte\.html → \/#menu/);
    assert.ok(existsSync(join(out, 'before-after.jpg')));
    // with no old site given, the before shots saved by the first run stand in for it
    c = await run('redesign.mjs', ['compare', dist, '--out', out, '--wait', '300']);
    assert.equal(c.status, 0, c.out);
    assert.match(c.out, /Not in the new site under the same path: \/speisekarte\.html/);
  } finally { await server.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('old addresses: where each stub goes, and its link from there', () => {
  assert.deepEqual(pairOf('/index.php?page=menu=/#menu'), ['/index.php?page=menu', '/#menu']);
  assert.equal(stubFile('/werkstatt.html'), 'werkstatt.html');
  assert.equal(stubFile('/team/'), 'team/index.html');
  assert.equal(stubFile('/kontakt'), 'kontakt/index.html');
  assert.equal(stubFile('/speisekarte.php'), null, 'a static host serves .php as a file, not a page');
  assert.equal(stubFile('/?page=menu'), null);
  assert.equal(relativeTarget('/werkstatt.html', '/#werkstatt'), './#werkstatt');
  assert.equal(relativeTarget('/team/', '/impressum.html'), '../impressum.html');
  assert.equal(relativeTarget('/a/b/c.html', '/'), '../../');
  assert.equal(relativeTarget('/team/', '/about/'), '../about/');
  // only plain paths inside the site
  for (const p of ['/../x.html', '/a/../../x.html', '/..\\..\\x.html', '/..%2f..%2fx.html', '/a%5Cb.html', '/a:b.html', '/%E0%A4%A.html'])
    assert.equal(stubFile(p), null, `${p} gets no stub`);
  assert.equal(stubFile('/%C3%9Cber%20uns.html'), 'Über uns.html', 'the file a host serves for that address');
});

// a Latin-1 escape in a link (an old German site) stopped the run with "URI malformed"; a long unbroken run of
// letters took minutes per address pattern
test('facts: a link that is not UTF-8 is read as it is, and a long run of letters is quick', () => {
  const page = { path: '/', title: 'Gasthaus', lang: 'de-DE', ld: [], pictures: [], links: [{ href: 'mailto:k%FCche@zur-linde.example', text: 'Küche', region: 'footer' }, { href: 'tel:%2B49%20681%20%E4', text: 'Anrufen', region: 'footer' }],
    blocks: [{ tag: 'p', text: 'x'.repeat(100000), region: 'main' }, { tag: 'p', text: 'Schreiben Sie an info@zur-linde.example', region: 'footer' }] };
  const t0 = Date.now();
  const { found } = findFacts([page], { host: 'zur-linde.example' });
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  const emails = JSON.stringify(found.email);
  assert.match(emails, /k%fc?che@zur-linde\.example/i, emails);
  assert.match(emails, /info@zur-linde\.example/);
});

test('facts: a name loses the decoration around it', () => {
  const page = { path: '/', title: '', lang: 'de-DE', ld: [], pictures: [], links: [], blocks: [{ tag: 'h1', text: '~*~ Gasthaus Zur Linde ~*~', region: 'main' }] };
  assert.equal(findFacts([page], { host: 'zur-linde.example' }).draft.name, 'Gasthaus Zur Linde');
  page.blocks[0].text = '*** Gasthaus Zur Linde ***';
  assert.equal(findFacts([page], { host: 'zur-linde.example' }).draft.name, 'Gasthaus Zur Linde');
});

test('facts: prices become the draft\'s menu, a fax and a closure are listed to ask about', () => {
  for (const [s, price, currency] of [['49,00 €', '49.00', 'EUR'], ['€ 2.40', '2.40', 'EUR'], ['1.250,00 €', '1250.00', 'EUR'], ['15,- DM', '15', 'DM'], ['£9', '9', 'GBP'], ['10 Euro', '10', 'EUR']]) {
    assert.deepEqual(readPrice(s), { price, currency, plain: true }, s);
  }
  assert.deepEqual(readPrice('ab 12,00 €'), { price: 'ab 12,00 €', currency: 'EUR', plain: false }, 'a "from" price keeps its words');
  for (const s of ['12', '9.00', '1994', '9–18 Uhr']) assert.equal(readPrice(s), null, `${s} is no price: no currency`);

  const b = (tag, text, more) => ({ tag, text, region: 'main', ...more });
  const page = { path: '/werkstatt.html', title: 'Werkstatt', lang: 'de-DE', ld: [], pictures: [], links: [], blocks: [
    b('p', 'Unsere Werkstatt', { size: 24 }), b('p', 'Preisliste (Auszug):'),
    b('tr', 'Leistung | Preis'), b('tr', 'Inspektion komplett | 49,00 €'), b('tr', 'Laufrad zentrieren | ab 12,00 €'),
    b('p', 'Frühjahrs-Check für nur 39 €'),
    b('h3', 'Leihräder'), b('p', 'Ein Tag ....... 10,00 €\nEine Woche: 45,00 €'),
    b('p', 'Betriebsferien\nVom 31.07. bis 12.08.2016 machen wir Betriebsferien.'), b('p', 'Mo–Fr 9.00–18.30. So + Feiertage geschlossen.'),
    b('p', 'Telefon: 000 / 12 34 56\nTelefax: 000 / 12 34 57'),
  ] };
  const { draft, check } = findFacts([page], { host: 'fahrrad-muster.example' });
  assert.deepEqual(draft.menu, [
    { section: 'Preisliste (Auszug)', items: [{ name: 'Inspektion komplett', price: '49.00' }, { name: 'Laufrad zentrieren', price: 'ab 12,00 €' }] },
    { section: 'Leihräder', items: [{ name: 'Ein Tag', price: '10.00' }, { name: 'Eine Woche', price: '45.00' }] },
  ], 'table rows and a list of lines; the price in a sentence stays out');
  assert.equal(draft.currency, 'EUR');
  assert.equal(draft.phone, '000 / 12 34 56');
  assert.equal(draft.fax, '000 / 12 34 57');
  const all = check.join('\n');
  assert.match(all, /4 prices in the draft's "menu".*ask for today's/);
  assert.match(all, /not a plain number: "ab 12,00 €" \(Laufrad zentrieren\)/);
  assert.match(all, /A closure on the old site: "Betriebsferien Vom 31\.07\. bis 12\.08\.2016/);
  assert.equal(check.filter((c) => c.includes('closure')).length, 1, 'times and a weekly closing day are no closure');
  assert.match(all, /A fax number: 000 \/ 12 34 57/);
});

test('facts: pence, a closure written in words, and social and map links on any host', () => {
  assert.deepEqual(readPrice('85p'), { price: '0.85', currency: 'GBP', plain: true });
  assert.deepEqual(readPrice('5p'), { price: '0.05', currency: 'GBP', plain: true });
  assert.deepEqual(readPrice('from 50p'), { price: 'from 50p', currency: 'GBP', plain: false });
  for (const s of ['p', '850p', '2pm']) assert.equal(readPrice(s), null, `${s} is no price`);

  const b = (tag, text) => ({ tag, text, region: 'main' });
  // a made-up bakery's 2012 site, the way it wrote things
  const page = { path: '/', title: 'Bakery', lang: 'en-GB', ld: [], pictures: [], blocks: [
    b('h2', 'Our Breads'), b('tr', 'Item | Price'), b('tr', 'White loaf | £2.20'), b('tr', 'Iced bun | 85p'),
    b('h3', 'Little things'), b('p', 'Jam tart ..... 60p\nScone: 75p'),
    b('p', 'Summer holiday\nWe are closed from Monday 30th July to Saturday 11th August 2012.'),
    b('p', 'Shut for the market on July 4th, closed all day.'),
    b('p', 'Sunday: Closed. Saturday: 7am - 3pm'),
  ], links: [
    { text: 'Follow us', href: 'https://twitter.example/madeupbakery', region: 'footer' },
    { text: 'Click here for a map', href: 'https://maps.example/?q=1+Made+Up+Yard', region: 'main' },
  ] };
  const { draft, found, check } = findFacts([page], { host: 'madeup-bakery.example' });
  assert.deepEqual(draft.menu, [
    { section: 'Our Breads', items: [{ name: 'White loaf', price: '2.20' }, { name: 'Iced bun', price: '0.85' }] },
    { section: 'Little things', items: [{ name: 'Jam tart', price: '0.60' }, { name: 'Scone', price: '0.75' }] },
  ]);
  assert.equal(draft.currency, 'GBP');
  assert.equal(draft.links.x, 'https://twitter.example/madeupbakery');
  assert.equal(found.map[0].value, 'https://maps.example/?q=1+Made+Up+Yard');
  const closures = check.filter((c) => c.includes('closure'));
  assert.equal(closures.length, 2, closures.join('\n'));
  assert.match(closures.join('\n'), /"Summer holiday We are closed from Monday 30th July to Saturday 11th August 2012\."/);
  assert.match(closures.join('\n'), /closed all day/, 'month first, as in "July 4th"');
});

function newSite(dir) {
  mkdirSync(join(dir, 'public'), { recursive: true });
  writeFileSync(join(dir, 'site.json'), JSON.stringify({ name: 'Café Lindenblatt' }));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html lang="de-DE"><head><meta charset="utf-8"><title>Café Lindenblatt: Kuchen seit 1987</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#f4efe6"></head>
    <body><h1>Kuchen seit 1987</h1><div style="height:3000px"></div><section id="kuchen"><h2>Kuchen</h2></section><div style="height:3000px"></div></body></html>`);
  writeFileSync(join(dir, 'impressum.html'), '<!doctype html><html lang="de-DE"><title>Impressum</title><h1>Impressum</h1></html>');
  writeFileSync(join(dir, 'kontakt.html'), '<!doctype html><html lang="de-DE"><title>Kontakt</title><h1>Kontakt</h1></html>');
}

test('redesign redirects: a page at each old address that leads on, and nothing it shouldn\'t write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-redirects-'));
  newSite(dir);
  const pages = '/speisekarte.html=/#kuchen,/team/=/impressum.html,/index.php?page=menu=/#kuchen,/impressum.html=/impressum.html,/gaestebuch.html=/gaestebuch.html,/kontakt.html=/#kuchen';
  let r = await run('redesign.mjs', ['redirects', dir, '--pages', pages]);
  assert.equal(r.status, 0, r.out);
  const stub = readFileSync(join(dir, 'public/speisekarte.html'), 'utf8');
  for (const want of ['<html lang="de-DE">', '<title>Café Lindenblatt: Diese Seite ist umgezogen</title>', '<meta name="robots" content="noindex">',
    '<link rel="canonical" href="{{URL}}#kuchen">', 'content="0; url=./#kuchen"', '<a href="./#kuchen">Weiter zu Café Lindenblatt</a>', '<link rel="icon" href="/favicon.svg"', '<meta name="theme-color"'])
    assert.ok(stub.includes(want), `the stub lacks ${want}:\n${stub}`);
  assert.match(readFileSync(join(dir, 'public/team/index.html'), 'utf8'), /url=\.\.\/impressum\.html/);
  assert.match(r.out, /\/index\.php\?page=menu: a static host can't serve this address as a page; add a redirect to \/ in the host's settings \(iterate\.md, "Old addresses"\)/);
  assert.doesNotMatch(r.out, /gaestebuch/, 'an address that stays needs nothing and is not mentioned');
  assert.ok(!existsSync(join(dir, 'public/impressum.html')), 'an address that stays gets no stub');
  assert.ok(!existsSync(join(dir, 'public/kontakt.html')), 'a page of the new site is never covered by a stub');
  assert.match(r.out, /\/kontakt\.html: the new site has a page there already; left alone/);
  // nothing outside public/, however the old address is written (the site sits two folders deep in this test's own)
  const deep = join(dir, 'x', 'y');
  newSite(deep);
  const tricks = ['/../escape.html', '/a/../../escape.html', '/..\\..\\escape.html', '/..%2f..%2fescape.html', '/ok.html'].map((p) => `${p}=/impressum.html`).join(',');
  r = await run('redesign.mjs', ['redirects', deep, '--pages', tricks]);
  assert.equal(r.status, 0, r.out);
  for (const f of [join(deep, 'escape.html'), join(deep, '..', 'escape.html'), join(dir, 'escape.html'), join(deep, 'public', '..%2f..%2fescape.html')])
    assert.ok(!existsSync(f), `nothing written at ${f}`);
  assert.equal((r.out.match(/not a plain address inside the site/g) || []).length, 4, r.out);
  assert.ok(existsSync(join(deep, 'public/ok.html')), 'a plain one next to them is still written');
  r = await run('redesign.mjs', ['redirects', dir, '--pages', '/speisekarte.html=/#kuchen,/alt.html=/weg.html']);
  assert.equal(r.status, 0, 'its own stubs are rewritten, again and again');
  assert.match(r.out, /\/alt\.html: \/weg\.html is not a page of the new site/);
  r = await run('redesign.mjs', ['redirects', dir]);
  assert.equal(r.status, 2);
  assert.match(r.out, /Name the old addresses/);
  rmSync(dir, { recursive: true, force: true });
});

test('redesign redirects: the stub really lands on the new section, also on a site in a subfolder', { skip, timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-redirects-live-'));
  const site = join(dir, 'sub');
  newSite(site);
  assert.equal((await run('redesign.mjs', ['redirects', site, '--pages', '/speisekarte.html=/#kuchen,/team/=/impressum.html'])).status, 0);
  copyFileSync(join(site, 'public/speisekarte.html'), join(site, 'speisekarte.html')); // what the build does with public/
  mkdirSync(join(site, 'team'));
  copyFileSync(join(site, 'public/team/index.html'), join(site, 'team/index.html'));
  const server = await serve(dir);
  const browser = await launch();
  try {
    for (const [from, to] of [['/sub/speisekarte.html', '/sub/#kuchen'], ['/sub/team/', '/sub/impressum.html']]) {
      const page = await browser.newPage({ width: 390, height: 844 });
      await page.goto(server.url + from);
      let at = '';
      for (let i = 0; i < 20 && !at.endsWith(to); i++) { await sleep(150); at = await page.eval('location.href').catch(() => ''); }
      assert.equal(at, server.url + to, `${from} leads to ${to}`);
      await page.close();
    }
  } finally { await browser.close(); await server.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('redesign: no target prints the usage, a missing folder is bad input', async () => {
  let r = await run('redesign.mjs', []);
  assert.equal(r.status, 2);
  assert.match(r.out, /node redesign\.mjs https:\/\/their-site/);
  r = await run('redesign.mjs', ['--help']);
  assert.equal(r.status, 0);
  r = await run('redesign.mjs', [join(tmpdir(), 'no-such-old-site-folder')]);
  assert.equal(r.status, 2);
  assert.match(r.out, /Nothing at/);
});

const CONCEPTS = {
  client: 'Café Lindenblatt', lang: 'de', action: 'Heute im Café', nav: ['Kuchen', 'Café', 'Kontakt'],
  concepts: [
    { name: 'Die Kuchentheke', idea: 'The page is the glass counter: every cake on its shelf, with its price card.', mood: 'warm', brand: '#9c3d1c',
      fonts: ['Gloock', 'Figtree'], move: 'rows', line: 'Heute in der Theke', rows: [['Zwetschgenkuchen', '2,80 €'], ['Käsekuchen', '3,10 €']], recommended: true },
    { name: 'Omas Rezeptbuch', idea: 'Every section is a page of Oma Hilde’s recipe book.', mood: 'editorial', brand: '#2f5d50', move: 'split',
      line: 'Seit 1987 nach Omas Rezepten', sub: 'Jeden Morgen frisch gebacken.', image: 'kuchen.jpg' },
    { name: 'Offen ab acht', idea: 'The opening hours are the headline, as big as the sign on the door.', mood: 'bold', brand: '#e2b13c', move: 'field',
      fonts: ['Anybody'], line: 'Di–Fr ab 8', bold: 'the hours fill the screen' },
    { name: 'Die Theke', idea: 'The counter is the page.', mood: 'quiet', brand: '#5b6b2f', move: 'object', line: 'Acht Plätze an der Theke',
      bold: 'the counter drawn in one line, eight stools' },
  ],
};

// brief.md's idea blocks, taken from the reference itself: "Idea A · The van (kept)", then "  key:   value" lines,
// a deeper indent continuing the value above. Each value is copied as written, the way an agent would copy it.
function briefIdeas() {
  const md = readFileSync(resolve('skills/one-shot-site/references/brief.md'), 'utf8').replace(/\r/g, '');
  const block = md.split('```').find((b) => /^Idea A · /m.test(b));
  assert.ok(block, 'brief.md shows the idea blocks');
  const ideas = [];
  let key;
  for (const line of block.split('\n')) {
    const head = line.match(/^Idea [A-F] · (.+?)( \(kept\))?$/);
    const pair = line.match(/^ {2}([a-z][a-z ]*):\s+(.*)$/);
    if (head) { ideas.push({ name: head[1], ...(head[2] && { kept: true }) }); key = null; } else if (pair) ideas.at(-1)[(key = pair[1])] = pair[2];
    else if (key && /^ {4,}\S/.test(line) && !/^\s*…/.test(line)) ideas.at(-1)[key] += '\n' + line.trim();
  }
  return ideas;
}

test('mockup --concepts reads the brief\'s idea blocks as they are written', async () => {
  const ideas = briefIdeas();
  assert.ok(ideas.length >= 2 && ideas[0].kept, 'the example has ideas, the first one kept');
  const used = new Set(ideas.flatMap(Object.keys));
  const src = readFileSync(join(SCRIPTS, 'mockup.mjs'), 'utf8');
  const keys = new Set(src.match(/const KEYS = new Set\(\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((k) => k.slice(1, -1)));
  for (const k of used) assert.ok(keys.has(k), `brief.md uses "${k}", which mockup.mjs does not read`);

  // the example stops after B's proof ("…"): fill in only what the brief left out
  const [a, b] = ideas;
  b.mood ||= 'editorial'; b.brand ||= a.brand;
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-brief-'));
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'Made-up Plumbing', lang: 'en', concepts: [a, b] }, null, 2));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /is not read/, 'every key in the brief is one mockup reads');
  assert.match(r.out, new RegExp(`A · ${a.name} \\(recommended\\): ${a.mood}, ${a.move}, ${a.brand} on ${a.ground}, ${a.fonts.split(/,\s*/).join(' \\+ ')}$`, 'm'), 'fonts written "X, Y" are two fonts');
  assert.match(r.out, /B · .+: editorial, proof, [^]*\n {4}proof \S[^|]* \| [^/]+ \/ \S[^|]* \| /, 'proof lines written "a | b" are pairs');
  assert.match(r.out, /2 concepts, ready to draw/);
  assert.ok(!existsSync(join(dir, '.one-shot')), '--check draws nothing');

  // a typo is named, not silently dropped
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'X', concepts: [{ ...a, colour: '#123456' }] }));
  assert.match((await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'])).out, /"colour" is not read/);
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts --check shows everything it read, and says when a picture is not drawn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-check-'));
  writeFileSync(join(dir, 'kuchen.jpg'), '');
  const [a, b, c] = CONCEPTS.concepts;
  const { action, ...top } = CONCEPTS;
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ ...top, concepts: [{ ...a, ground: '#f2c230' }, b, { ...c, image: 'kuchen.jpg' }] }));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.ok(action, 'the button words came from the top of the file');
  assert.match(r.out, /A · Die Kuchentheke \(recommended\): warm, rows, #9c3d1c on #f2c230, Gloock \+ Figtree/);
  assert.match(r.out, /button "Kontakt aufnehmen", menu Kuchen · Café · Kontakt/, 'without its own words, the button speaks the site\'s language');
  assert.match(r.out, /bold: the hours fill the screen/);
  assert.match(r.out, /image kuchen\.jpg\nC · /, 'the split move draws the picture');
  assert.match(r.out, /image kuchen\.jpg \(not drawn by this move\)/);
  assert.match(r.out, /Concept C \("Offen ab acht"\): the field move draws no picture/);
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts: a third face sets the rows alone, a mono for a program\'s output', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-mono-'));
  const diff = { name: 'The diff', idea: 'The page is what changed, the way the tool prints it.', mood: 'night', brand: '#7fd1a0', move: 'rows',
    fonts: 'Space Grotesk, Inter, JetBrains Mono', line: 'Schema drift, caught', rows: '- price: number | before\n+ price: string | after' };
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'Made-up Tool', lang: 'en', concepts: [
    { ...diff, kept: true },
    { ...diff, name: 'Big type', move: 'type', fonts: ['Space Grotesk', 'Inter', 'JetBrains Mono'] },
    { ...diff, name: 'Too many', fonts: 'Space Grotesk, Inter, JetBrains Mono, Gloock' },
  ] }));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^A · The diff \(recommended\): night, rows, #7fd1a0, Space Grotesk \+ Inter, rows in JetBrains Mono$/m, 'written "X, Y, Z" as the brief does');
  assert.match(r.out, /Concept B \("Big type"\): the third face sets only the rows, and the type move has none, so JetBrains Mono is left out\./);
  assert.match(r.out, /^B · Big type: night, type, #7fd1a0, Space Grotesk \+ Inter$/m);
  assert.match(r.out, /Concept C \("Too many"\): fonts are the display face, the text face and one for the rows, three at most; Gloock left out\./);
  assert.match(r.out, /^C · Too many: night, rows, #7fd1a0, Space Grotesk \+ Inter, rows in JetBrains Mono$/m);
  rmSync(dir, { recursive: true, force: true });
});

// two objects with the same wide picture (a card, say): one in its own shape, one asked to be a circle
const OBJECTS = (o = {}) => ({ client: 'Made-up Library', lang: 'en', concepts: [
  { name: 'The card', idea: 'The library card is the page.', mood: 'quiet', brand: '#2f5d50', move: 'object', line: 'Borrow anything', image: 'card.jpg', kept: true, ...o },
  { name: 'The stamp', idea: 'The date stamp is the page.', mood: 'warm', brand: '#9c3d1c', move: 'object', line: 'Due back in three weeks', image: 'card.jpg', shape: 'circle' },
] });

test('mockup --concepts: the object keeps its picture\'s shape, a circle only when asked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-shape-'));
  writeFileSync(join(dir, 'card.jpg'), '');
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify(OBJECTS()));
  let r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /\n {4}image card\.jpg, in its own shape\n/);
  assert.match(r.out, /\n {4}image card\.jpg, in a circle\n/);
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify(OBJECTS({ shape: 'round' })));
  r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /Concept A \("The card"\): shape "round" should be "circle", or left out so the picture keeps its own shape\./);
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify(OBJECTS({ move: 'type' })));
  r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /Concept A[^\n]*only the object move/, 'no shape asked, nothing said');
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify(OBJECTS({ move: 'type', shape: 'circle' })));
  r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.match(r.out, /Concept A \("The card"\): only the object move has a shape, so "shape" is left out\./);
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts: a picture written from the site folder gets the path that works, an object without one is named', async () => {
  const site = mkdtempSync(join(tmpdir(), 'oss-concepts-paths-'));
  mkdirSync(join(site, '.one-shot', 'redesign', 'img'), { recursive: true });
  writeFileSync(join(site, '.one-shot', 'redesign', 'img', 'loaf.jpg'), '');
  writeFileSync(join(site, '.one-shot', 'card.jpg'), '');
  const file = join(site, '.one-shot', 'concepts.json');
  writeFileSync(file, JSON.stringify(OBJECTS({ image: '.one-shot/redesign/img/loaf.jpg' })));
  let r = await run('mockup.mjs', ['--concepts', file, '--check'], site);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no picture at .+loaf\.jpg\. Pictures are found from the concepts file's folder: write "redesign\/img\/loaf\.jpg"\./);
  writeFileSync(file, JSON.stringify(OBJECTS({ image: undefined, bold: 'the sign on the door' })));
  r = await run('mockup.mjs', ['--concepts', file, '--check'], site);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Concept A \("The card"\): the object has no "image", so it draws as a dashed frame named by "bold"\. .+, since it is your pick\./);
  assert.doesNotMatch(r.out, /Concept B[^\n]*dashed frame/, 'B has its picture');
  rmSync(site, { recursive: true, force: true });
});

// a quiet title page, the same line as a poster, and a split that has no picture yet
const QUIET = [
  { name: 'The title page', idea: 'The page opens like a book.', mood: 'editorial', brand: '#2f5d50', move: 'type', size: 'small', line: 'Borrow anything' },
  { name: 'The poster', idea: 'The line is the sign over the door.', mood: 'bold', brand: '#e2b13c', move: 'type', line: 'Borrow anything' },
  { name: 'The shelf', idea: 'Words on one side, the shelf on the other.', mood: 'quiet', brand: '#5b6b2f', move: 'split', line: 'Borrow anything' },
];

test('mockup --concepts: type can be a quiet title, and a split without a picture is plain ground', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-quiet-'));
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'Made-up Library', lang: 'en', concepts: QUIET }));
  let r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^A · The title page: editorial, type \(small\), #2f5d50$/m);
  assert.match(r.out, /^B · The poster: bold, type, #e2b13c$/m);
  assert.match(r.out, /^C · The shelf: quiet, split, #5b6b2f\n.+\n {4}no image: the picture side is plain ground$/m);
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ client: 'X', concepts: [{ ...QUIET[0], size: 'tiny' }, { ...QUIET[2], size: 'small' }] }));
  r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--check'], dir);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /Concept A \("The title page"\): size "tiny" should be "small" \(a quiet title\) or "poster"/);
  assert.match(r.out, /Concept B \("The shelf"\): only the type move has a size, so "size" is left out\./);
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts draws the object in its picture\'s own shape, and round when asked', { skip, timeout: 240000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-shape-draw-'));
  copyFileSync(resolve('examples/kleiner-kaffee/desktop.jpg'), join(dir, 'card.jpg')); // 1440×900, wide like a card
  // and, on the same sheet, a quiet title, a poster and a split with no picture
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ ...OBJECTS(), concepts: [...OBJECTS().concepts, ...QUIET] }));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--out', join(dir, 'out')]);
  if (await cdnDown(r)) { rmSync(dir, { recursive: true, force: true }); return t.skip('cdn.jsdelivr.net did not answer, so no face could load'); }
  assert.equal(r.status, 0, r.out);
  const b = await launch();
  try {
    const measure = async (file, width, height) => {
      const p = await b.newPage({ width, height });
      await p.goto(pathToFileURL(join(dir, 'out', file)).href);
      const m = await p.eval(`(() => { const t = document.querySelector('.thing'), i = t.querySelector('img'), r = i.getBoundingClientRect(), s = getComputedStyle(t);
        return { ratio: r.width / r.height, natural: i.naturalWidth / i.naturalHeight, radius: s.borderTopLeftRadius, round: t.classList.contains('round'), tw: t.getBoundingClientRect().width, th: t.getBoundingClientRect().height }; })()`);
      await p.close();
      return m;
    };
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const own = await measure('a-the-card.html', w, h);
      assert.ok(!own.round && own.radius === '0px', `${w}: no circle unless asked (${own.radius})`);
      assert.ok(Math.abs(own.ratio - own.natural) < 0.02, `${w}: the card keeps its shape: ${own.ratio.toFixed(3)} vs ${own.natural.toFixed(3)}`);
      const round = await measure('b-the-stamp.html', w, h);
      assert.ok(round.round && Math.abs(round.tw - round.th) < 1 && round.radius === '50%', `${w}: asked for a circle, gets one (${round.tw}×${round.th}, ${round.radius})`);
    }
    const look = async (file) => {
      const p = await b.newPage({ width: 1440, height: 900 });
      await p.goto(pathToFileURL(join(dir, 'out', file)).href);
      await p.eval('window.__fitted');
      const m = await p.eval(`(() => { const h = document.querySelector('h1'), pic = document.querySelector('.pic');
        return { size: parseFloat(getComputedStyle(h).fontSize), pic: pic && getComputedStyle(pic).backgroundColor, ground: getComputedStyle(document.body).backgroundColor, svg: !!document.querySelector('.pic svg, .ph') }; })()`);
      await p.close();
      return m;
    };
    const [quiet, poster, shelf] = [await look('c-the-title-page.html'), await look('d-the-poster.html'), await look('e-the-shelf.html')];
    assert.ok(quiet.size <= 68 && poster.size > 1.5 * quiet.size, `a quiet title, not a poster: ${quiet.size}px vs ${poster.size}px`);
    assert.ok(!shelf.svg && shelf.pic === shelf.ground, `the split's picture side is plain ground (${shelf.pic} on ${shelf.ground}), no camera`);
  } finally { await b.close(); }
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --moods speaks the site\'s language and takes a second colour as the ground', { skip, timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-moods-'));
  assert.equal((await run('mockup.mjs', ['--name', 'X', '--ground', 'yellow'])).status, 2, 'a ground that is not a colour stops before drawing');
  const r = await run('mockup.mjs', ['--name', 'Fahrrad Muster', '--line', 'Reparatur in zwei Tagen.', '--moods', 'warm', '--lang', 'de-DE',
    '--nav', 'Werkstatt, Preise', '--brand', '#2f6f3a', '--ground', '#f2c230', '--out', dir]);
  assert.equal(r.status, 0, r.out);
  const h = readFileSync(join(dir, 'a-warm.html'), 'utf8');
  assert.match(h, /<html lang="de-DE">/);
  assert.match(h, /<nav>Werkstatt · Preise<\/nav>/);
  assert.match(h, /<a class="btn">Kontakt aufnehmen<\/a>/, 'no --action: the button in German');
  assert.doesNotMatch(h, /About|Contact|Get in touch/);
  // the yellow is the ground, not a tint of the green
  const [, L, , H] = h.match(/--ground:oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/).map(Number);
  assert.ok(L > 75 && H > 70 && H < 110, `ground L ${L} H ${H}`);
  // no --ground: Warm and Editorial start on cream and Quiet on warm white, not on a tint of the green; the tint
  // only with --ground brand
  const calm = await run('mockup.mjs', ['--name', 'Fahrrad Muster', '--moods', 'warm,quiet,editorial', '--brand', '#2f6f3a', '--out', join(dir, 'calm')]);
  assert.equal(calm.status, 0, calm.out);
  const groundOf = (f) => readFileSync(join(dir, f), 'utf8').match(/--ground:oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/).slice(1).map(Number);
  for (const f of ['calm/a-warm.html', 'calm/c-editorial.html']) {
    const [cL, cC, cH] = groundOf(f);
    assert.ok(cL > 93 && cC <= 0.03 && cH >= 70 && cH <= 90, `${f}: cream (L ${cL}, C ${cC}, H ${cH})`);
  }
  const [qL, qC] = groundOf('calm/b-quiet.html');
  assert.ok(qL >= 98 && qC <= 0.01, `quiet: warm white (L ${qL}, C ${qC})`);
  const tint = await run('mockup.mjs', ['--name', 'Fahrrad Muster', '--moods', 'warm', '--brand', '#2f6f3a', '--ground', 'brand', '--out', join(dir, 'tint')]);
  assert.equal(tint.status, 0, tint.out);
  const [, , tH] = groundOf('tint/a-warm.html');
  assert.ok(tH > 120 && tH < 160, `--ground brand: the green's own hue (H ${tH})`);
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts: bad concepts are listed and nothing is drawn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-bad-'));
  writeFileSync(join(dir, 'c.json'), JSON.stringify({ client: 'X', concepts: [{ name: 'One', idea: 'i', mood: 'loud', brand: 'red', move: 'rows' }, { name: 'Two', idea: 'i', mood: 'warm', brand: '#112233' }] }));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'c.json'), '--out', join(dir, 'out')]);
  assert.equal(r.status, 2, r.out);
  for (const want of ['mood "loud"', '"red" is not a colour', 'the rows move needs "rows"', 'Concept B ("Two"): "move" is missing']) assert.ok(r.out.includes(want), `missing ${want} in\n${r.out}`);
  assert.ok(!existsSync(join(dir, 'out')));
  rmSync(dir, { recursive: true, force: true });
});

test('mockup --concepts draws three different ideas with their own words, colours and moves', { skip, timeout: 240000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'oss-concepts-'));
  copyFileSync(resolve('examples/kleiner-kaffee/desktop.jpg'), join(dir, 'kuchen.jpg'));
  // and a till receipt: the same rows in a mono face of their own
  const receipt = { name: 'Der Kassenbon', idea: 'The page is today\'s till receipt.', mood: 'quiet', brand: '#3d3a35', move: 'rows',
    fonts: 'Gloock, Figtree, JetBrains Mono', line: 'Heute gebacken', rows: CONCEPTS.concepts[0].rows };
  writeFileSync(join(dir, 'concepts.json'), JSON.stringify({ ...CONCEPTS, concepts: [...CONCEPTS.concepts, receipt] }));
  const r = await run('mockup.mjs', ['--concepts', join(dir, 'concepts.json'), '--out', join(dir, 'out')]);
  if (await cdnDown(r)) { rmSync(dir, { recursive: true, force: true }); return t.skip('cdn.jsdelivr.net did not answer, so no face could load'); }
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /A: Die Kuchentheke \(warm, rows\), recommended/);
  const e = readFileSync(join(dir, 'out/e-der-kassenbon.html'), 'utf8');
  assert.match(e, /--fr:'JetBrains Mono Variable','JetBrains Mono','Gloock Variable'/, 'the rows in the mono, the display face behind it');
  assert.match(e, /@fontsource-variable\/jetbrains-mono\/index\.css/);
  assert.match(e, /\.board\{[^}]*var\(--fr\)/);
  for (const f of ['concepts.jpg', 'a-die-kuchentheke-desktop.jpg', 'b-omas-rezeptbuch-phone.jpg', 'c-offen-ab-acht-desktop.jpg']) assert.ok(existsSync(join(dir, 'out', f)), f);
  const a = readFileSync(join(dir, 'out/a-die-kuchentheke.html'), 'utf8');
  const b = readFileSync(join(dir, 'out/b-omas-rezeptbuch.html'), 'utf8');
  const c = readFileSync(join(dir, 'out/c-offen-ab-acht.html'), 'utf8');
  assert.match(a, /<ol class="board fit"[^>]*><li><span>Zwetschgenkuchen<\/span><i><\/i><b>2,80 €<\/b>/, 'the list is fitted to the screen, poster size');
  assert.match(a, /@fontsource-variable\/gloock|@fontsource\/gloock/);
  assert.match(b, /<img src="file:[^"]+kuchen\.jpg"/);
  assert.match(b, /Seit 1987 nach Omas Rezepten/);
  assert.match(c, /<h1 class="fit" data-h="0.6"><span style="white-space:nowrap">Di–Fr<\/span> <span[^>]*>ab<\/span>/, 'words that never break inside');
  assert.match(a + b + c, /lang="de"/);
  // three palettes, not one: each concept's own colour reaches its page, on the actions; Warm and Editorial start
  // on cream whatever their colour
  const accents = [a, b, c].map((h) => h.match(/--accent:([^;]+);/)[1]);
  assert.equal(new Set(accents).size, 3, accents.join(' / '));
  assert.deepEqual([a, b].map((h) => h.match(/--ground:([^;]+);/)[1]), ['oklch(95.0% 0.019 80.0)', 'oklch(95.0% 0.019 80.0)'], 'warm and editorial on cream');
  // the field is their colour itself (#e2b13c is L 78.5), not a pale tint of it
  const L = +c.match(/--ground:oklch\(([\d.]+)%/)[1];
  assert.ok(Math.abs(L - 78.5) < 2, `field ground L ${L}`);
  // an object without its picture is named, not stood in for by the client's initial
  const d = readFileSync(join(dir, 'out/d-die-theke.html'), 'utf8');
  assert.match(d, /<div class="thing todo"><svg[^]*?<p>the counter drawn in one line, eight stools<\/p>/);
  rmSync(dir, { recursive: true, force: true });
});

test('iterate.md names only scripts and flags that exist', () => {
  const md = readFileSync(resolve('skills/one-shot-site/references/iterate.md'), 'utf8');
  const calls = [...md.matchAll(/([\w-]+)\.mjs((?:[ \t]+[^\s`|]+)*)/g)];
  assert.ok(calls.length >= 3, 'it shows the commands');
  for (const [, script, rest] of calls) {
    const file = join(SCRIPTS, `${script}.mjs`);
    assert.ok(existsSync(file), `${script}.mjs`);
    const head = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n');
    for (const flag of rest.match(/--[\w-]+/g) || []) assert.ok(head.includes(flag), `${script}.mjs does not document ${flag}`);
  }
});
