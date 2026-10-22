import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDay, jsonld, parseDays, render, weekdayIn } from '../skills/one-shot-site/assets/starter/site-data.js';

const site = {
  name: 'Kleiner Kaffee', type: 'CafeOrCoffeeShop', url: 'https://kk.example/', email: 'hi@kk.example', phone: '+49 681 12 34',
  address: { street: 'Markt 12', postcode: '66111', city: 'Saarbrücken', country: 'DE' },
  hours: [{ days: 'Tue-Sat', opens: '08:00', closes: '17:00' }, { days: 'Sun', opens: '10:00', closes: '16:00' }],
  closed: [{ from: '2026-12-24', to: '2026-12-26', note: 'Christmas' }, { from: '2025-01-01' }],
  menu: [{ section: 'Coffee', items: [{ name: 'Espresso', price: '2.40' }, { name: 'Bun', price: 3 }] }],
  events: [{ name: 'Cupping', start: '2026-11-14T09:00', price: 12 }, { name: 'Old one', start: '2025-03-01T10:00' }],
  links: { instagram: 'https://insta.example/kk', booking: 'https://book.example/kk' },
};
const today = '2026-10-20';
const text = (html) => html.replace(/<script>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('days: ranges wrap the week, names in any form', () => {
  assert.deepEqual(parseDays('Tue-Sat'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('Sat–Mon'), [5, 6, 0]);
  assert.deepEqual(parseDays(['monday', 'Wed']), [0, 2]);
  assert.throws(() => parseDays('Funday'), /not a day/);
});

test('values, filters and blocks fill the page', () => {
  const out = render('<html lang="en"><a href="tel:{{site.phone|tel}}">{{ site.phone }}</a> <!-- site:hours --> <!-- site:menu h2 --> <!-- site:address -->', site, { today });
  assert.match(out, /href="tel:\+496811234"/);
  assert.match(text(out), /Tue–Sat 8:00 AM–5:00 PM Sun 10:00 AM–4:00 PM Mon Closed Closed: December 24 – 26, 2026 \(Christmas\)/);
  assert.ok(!out.includes('2025'), 'past closures are left out');
  assert.match(out, /<h2>Coffee<\/h2>/);
  assert.match(text(out), /Espresso €2\.40 Bun €3\.00/);
  assert.match(out, /<address>Markt 12<br>66111 Saarbrücken<\/address>/);
});

test('the postcode sits where the country writes it', () => {
  const uk = { ...site, address: { street: '4 Net Loft Lane', postcode: 'KY10 9ZZ', city: 'Anstruther', country: 'GB' } };
  assert.match(render('<!-- site:address -->', uk), /<address>4 Net Loft Lane<br>Anstruther KY10 9ZZ<\/address>/);
  assert.equal(render('{{site.address}}', uk), '4 Net Loft Lane, Anstruther KY10 9ZZ');
  const us = { ...site, address: { street: '12 Alder Row', postcode: '97201', city: 'Portland', region: 'OR', country: 'US' } };
  assert.equal(render('{{site.address}}', us), '12 Alder Row, Portland, OR 97201');
  assert.equal(render('{{site.address}}', site), 'Markt 12, 66111 Saarbrücken');
});

test('the page language sets day names and formats', () => {
  const out = text(render('<html lang="de"><!-- site:hours -->', site, { today }));
  assert.match(out, /Di–Sa 08:00–17:00 So 10:00–16:00 Mo Geschlossen Geschlossen: 24\.–26\. Dezember 2026/);
});

test('hours: the week starts open, short weeks list open days only, a second list', () => {
  const shop = { ...site, hours: [{ days: 'Tue-Fri', opens: '11:00', closes: '18:00' }, { days: 'Sat', opens: '10:00', closes: '16:00' }], closed: [] };
  assert.equal(text(render('<html lang="de"><!-- site:hours -->', shop, { today })), 'Di–Fr 11:00–18:00 Sa 10:00–16:00 So–Mo Geschlossen');
  const pantry = { ...site, hours: [{ days: 'Tue', opens: '10:00', closes: '13:00' }, { days: 'Thu', opens: '16:00', closes: '19:00' }], closed: [] };
  assert.equal(text(render('<html lang="en-GB"><!-- site:hours -->', pantry, { today })), 'Tue 10:00–13:00 Thu 16:00–19:00');
  const plumber = { ...site, emergency: [{ days: 'Mon-Fri', opens: '07:00', closes: '20:00' }] };
  assert.equal(text(render('<html lang="de"><!-- site:hours emergency -->', plumber, { today })), 'Mo–Fr 07:00–20:00 Sa–So Geschlossen');
  assert.throws(() => render('<!-- site:hours office -->', site), /"office" is empty/);
});

test('a missing fact stops the build and names it', () => {
  assert.throws(() => render('{{site.fax}}', site), /\{\{site\.fax\}\}.*"fax" is empty/);
  assert.throws(() => render('<!-- site:nope -->', site), /unknown block/);
});

test('values are escaped', () => {
  assert.equal(render('{{site.name}}', { ...site, name: 'A & <B>' }), 'A &amp; &lt;B&gt;');
  // the analytics token sits in a double-quoted attribute, so a quote in it can't end the attribute
  const head = render('<!-- site:head -->', { ...site, analytics: { cloudflare: `x' onload='alert(1)` } }, { today });
  assert.match(head, /data-cf-beacon="\{&quot;token&quot;: &quot;x' onload='alert\(1\)&quot;\}"/);
});

test('structured data matches the page', () => {
  const [main, event] = jsonld(site, today);
  assert.equal(main['@type'], 'CafeOrCoffeeShop');
  assert.deepEqual(main.openingHoursSpecification[0].dayOfWeek, ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  assert.deepEqual(main.specialOpeningHoursSpecification, [{ '@type': 'OpeningHoursSpecification', validFrom: '2026-12-24', validThrough: '2026-12-26', opens: '00:00', closes: '00:00' }]);
  assert.equal(main.hasMenu.hasMenuSection[0].hasMenuItem[0].offers.price, '2.40');
  assert.deepEqual(main.sameAs, ['https://insta.example/kk'], 'booking links are not profiles');
  const doing = { join: 'https://j.example', donate: 'https://d.example', order: 'https://o.example', map: 'https://m.example' };
  assert.deepEqual(jsonld({ ...site, links: { ...site.links, ...doing } }, today)[0].sameAs, ['https://insta.example/kk'], 'nor are join, donate, order or map');
  assert.equal(event['@type'], 'Event');
  assert.equal(event.startDate, '2026-11-14T09:00');
  assert.equal(event.offers.price, '12');
  assert.throws(() => jsonld({ name: 'x' }), /"type" is empty/);
});

test('software: version, download, licence and maker; download and docs links are not profiles', () => {
  const tool = {
    name: 'schemadrift', type: 'SoftwareApplication', version: '0.9.2', license: 'MIT', price: 0, currency: 'EUR',
    download: 'https://git.example/sd/releases', owner: { name: 'Tomasz Wierzba' },
    links: { github: 'https://git.example/sd', docs: 'https://git.example/sd#readme' },
  };
  const data = jsonld(tool, today);
  assert.equal(data.softwareVersion, '0.9.2');
  assert.equal(data.downloadUrl, 'https://git.example/sd/releases');
  assert.equal(data.license, 'MIT');
  assert.deepEqual(data.author, { '@type': 'Person', name: 'Tomasz Wierzba' });
  assert.deepEqual(data.offers, { '@type': 'Offer', price: '0', priceCurrency: 'EUR' });
  assert.deepEqual(data.sameAs, ['https://git.example/sd']);
  assert.equal(jsonld({ ...site, version: '1.0' }, today)[0].softwareVersion, undefined, 'only software gets them');
});

test('German day names, the head block and facts that come later', () => {
  assert.deepEqual(parseDays('Di-Sa'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDays('So'), [6]);
  const head = render('<html lang="en"><head><!-- site:head --></head>', { ...site, verify: { google: 'abc' }, analytics: { goatcounter: 'kk' } }, { today });
  assert.match(head, /application\/ld\+json/);
  assert.match(head, /<meta name="google-site-verification" content="abc">/);
  assert.match(head, /data-goatcounter="https:\/\/kk\.goatcounter\.com\/count"/);
  assert.equal(render('bei {{site.host|later}}', site), 'bei {{HOST}}');
  assert.equal(render('bei {{site.host|later}}', { ...site, host: 'GitHub Pages' }), 'bei GitHub Pages');
});

test('texts per language, prices in the page language, parts only when a fact exists', () => {
  const tea = {
    ...site, currency: 'EUR', tasting: '9', owner: { name: 'Mei Aoyama-Kuhn' },
    menu: [{ section: { de: 'Grüntee', en: 'Green tea' }, items: [{ name: 'Sencha', price: '8.50', note: { de: '50 g', en: '50 g (1.8 oz)' } }, { name: 'Gyokuro', note: 'beschattet' }, { name: 'Matcha', price: 12, from: true }] }],
    labels: { closed: { de: 'Ruhetag', en: 'Closed' } },
  };
  const de = render('<html lang="de">{{site.tasting|price}} <!-- site:menu h3 --> <!-- site:hours -->', tea, { today });
  assert.match(text(de), /^9 € Grüntee Sencha 8,50 € 50 g Gyokuro beschattet Matcha ab 12,00 € Di–Sa .* Mo Ruhetag/);
  const en = render('<html lang="en-GB">{{site.tasting|price}} <!-- site:menu h3 -->', tea, { today });
  assert.match(text(en), /^€9 Green tea Sencha €8\.50 50 g \(1\.8 oz\)/);
  assert.match(text(en), /Matcha from €12\.00/);
  assert.match(de, /<dt>Gyokuro<\/dt><dd class="note">beschattet<\/dd>/, 'no price, no empty price cell');
  const page = '<p>{{site.owner.name}}</p><!-- site:if owner.vatId --><p>USt-IdNr.: {{site.owner.vatId}}</p><!-- site:end -->';
  assert.equal(render(page, tea), '<p>Mei Aoyama-Kuhn</p>');
  assert.equal(render(page, { ...tea, owner: { ...tea.owner, vatId: 'DE298765432' } }), '<p>Mei Aoyama-Kuhn</p><p>USt-IdNr.: DE298765432</p>');
});

test('events: weekday, place and city, doors, sold out, a city is enough for the search data', () => {
  const band = {
    name: 'Moth Orchestra', type: 'MusicGroup', currency: 'GBP', address: { street: '', city: '', country: 'GB' },
    events: [
      { name: 'Norwich', city: 'Norwich', place: 'The Lantern Rooms', start: '2026-11-12T20:00', doors: '19:30', price: '14', tickets: 'https://t.example/n' },
      { name: 'Leeds', city: 'Leeds', place: 'Holloway Social Club', start: '2026-11-14T20:00', price: '14', soldOut: true },
    ],
  };
  const out = text(render('<html lang="en-GB"><!-- site:events h3 -->', band, { today }));
  // the word between date and time ("at", ",") depends on the ICU version
  assert.match(out, /^Norwich Thu, 12 November 2026(,| at) 20:00 · The Lantern Rooms, Norwich · Doors 19:30 · £14 Tickets Leeds Sat, 14 November 2026(,| at) 20:00 · Holloway Social Club, Leeds · £14 Sold out$/);
  assert.match(render('<html lang="de">{{site.events.0.start|date}}', band, { today }), />12. November 2026(,| um) 20:00$/);
  assert.match(render('<html lang="en-GB">{{site.events.0.start|day}}', band, { today }), />Thursday,? 12 November 2026$/);
  assert.match(render('<html lang="de">{{site.events.0.start|day}}', band, { today }), />Donnerstag, 12\. November 2026$/);
  const [main, norwich, leeds] = jsonld(band, today);
  assert.equal(main.address, undefined, 'an empty address is left out');
  assert.deepEqual(norwich.location.address, { '@type': 'PostalAddress', addressLocality: 'Norwich', addressCountry: 'GB' });
  assert.equal(leeds.offers.availability, 'https://schema.org/SoldOut');
});

test('hours: each row knows its days, and the script marks today in the business time zone', () => {
  const out = render('<html lang="en"><!-- site:hours -->', site, { today });
  assert.match(out, /<dl class="hours" data-tz="Europe\/Berlin"><div data-days="1 2 3 4 5"><dt>Tue–Sat<\/dt>/);
  assert.match(out, /<div data-days="6"><dt>Sun<\/dt>.*<div data-days="0"><dt>Mon<\/dt>/);
  const wraps = render('<html lang="en"><!-- site:hours -->', { ...site, hours: [{ days: 'Tue-Sat', opens: '10:00', closes: '14:00' }] }, { today });
  assert.match(wraps, /data-days="6 0"><dt>Sun–Mon<\/dt><dd>Closed/, 'a closed range across the week end');
  // one instant, three zones: Wednesday in Berlin and Auckland, still Tuesday in Los Angeles
  const at = new Date('2026-10-20T23:30:00Z');
  assert.deepEqual(['Europe/Berlin', 'Pacific/Auckland', 'America/Los_Angeles'].map((tz) => weekdayIn(tz, at)), [2, 2, 1]);
  // the script as it runs in the page: the row holding today gets aria-current
  const rows = [...out.matchAll(/data-days="([\d ]+)"/g)].map((m) => ({ dataset: { days: m[1] }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
  const script = out.match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function('document', script)({ currentScript: { previousElementSibling: { dataset: { tz: 'Europe/Berlin' }, children: rows } } });
  const day = String(weekdayIn('Europe/Berlin'));
  assert.deepEqual(rows.map((r) => r.attrs['aria-current'] === 'date'), rows.map((r) => r.dataset.days.split(' ').includes(day)));
});

test('past events and closures are gone for tokens and site:if, as for the blocks', () => {
  const page = '<html lang="en"><!-- site:if events.0 -->Next: {{site.events.0.name}}<!-- site:end -->|<!-- site:if closed.0 -->{{site.closed.0.note}}<!-- site:end -->';
  assert.equal(render(page, site, { today }), '<html lang="en">Next: Cupping|Christmas');
  assert.equal(render(page, site, { today: '2026-12-01' }), '<html lang="en">|Christmas', 'the course is over');
  assert.equal(render(page, site, { today: '2027-01-02' }), '<html lang="en">|', 'and so is Christmas');
  assert.throws(() => render('<p>Next: {{site.events.0.name}}</p>', site, { today: '2026-12-01' }), /no event at events\.0 any more: .* <!-- site:if events\.0 -->/, 'outside site:if the build says why');
});

test('SITE_TODAY pins the day the build counts from', () => {
  const was = process.env.SITE_TODAY;
  try {
    process.env.SITE_TODAY = '2025-02-01';
    assert.equal(buildDay(), '2025-02-01');
    assert.match(text(render('<html lang="en"><!-- site:events h3 -->', site)), /^Cupping .* Old one /, 'the 2025 event still shows');
    process.env.SITE_TODAY = '1 Feb';
    assert.throws(() => buildDay(), /not a date like/);
    delete process.env.SITE_TODAY;
    assert.match(buildDay(), /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    if (was === undefined) delete process.env.SITE_TODAY; else process.env.SITE_TODAY = was;
  }
});

test('the Impressum builds without a phone number or, for now, a name', () => {
  const page = readFileSync(new URL('../skills/one-shot-site/assets/legal/de/impressum.html', import.meta.url), 'utf8');
  const person = { name: 'Jonas Weber', type: 'Person', email: 'hello@jw.example', owner: { name: 'Jonas Weber' }, address: { street: 'Bahnengasse 8', postcode: '04109', city: 'Leipzig', country: 'DE' } };
  assert.doesNotMatch(render(page, person), /Telefon: </);
  assert.match(render(page, { ...person, phone: '0341 1234 567' }), /Telefon: <a href="tel:/);
  const { owner, ...nameless } = person;
  assert.match(render(page, nameless), /<p>\{\{OWNER_NAME\}\}<\/p>/, 'no name yet: a visible slot the audit stops on, not a failed build');
});

test('an address block needs a street, a postcode or a city: a country alone is no address', () => {
  assert.throws(() => render('<!-- site:address -->', { ...site, address: { country: 'PT' } }), /"address" is empty: fill in street, postcode and city/);
  assert.throws(() => render('<!-- site:address -->', { ...site, address: undefined }), /"address" is empty/);
  assert.match(render('<!-- site:address -->', { ...site, address: { city: 'Lisboa', country: 'PT' } }), /<address>.*Lisboa.*<\/address>/);
});

test('a price under a pound shows in pence, as British shops write it', () => {
  const gb = { ...site, currency: 'GBP', menu: [{ section: 'Bakes', items: [{ name: 'Roll', price: '0.85' }, { name: 'Loaf', price: '2.40' }] }] };
  const out = text(render('<html lang="en-GB"><!-- site:menu h2 -->', gb, { today }));
  assert.match(out, /Roll 85p/);
  assert.match(out, /Loaf £2\.40/);
  assert.equal(render('{{site.tasting|price}}', { ...gb, tasting: '0.5' }), '50p');
  assert.doesNotMatch(text(render('<html lang="de"><!-- site:menu h2 -->', { ...gb, currency: 'EUR' }, { today })), /85p/, 'euros stay as they are');
});
