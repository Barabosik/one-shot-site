// <!-- site:open-now -->: the plain hours without JavaScript, and "Open now · until 17:00" or "Closed · opens …"
// with it, in the business's own time zone, closures and closed days counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { block, check, openState, render } from '../skills/one-shot-site/assets/starter/site-data.js';

const today = '2026-10-20';
// a made-up café: closed Mondays, a short Sunday, Christmas off, and a late bar on Fridays
const cafe = {
  name: 'Made-up Café', type: 'CafeOrCoffeeShop', address: { street: 'Musterweg 1', postcode: '66111', city: 'Saarbrücken', country: 'DE' },
  hours: [{ days: 'Tue-Thu', opens: '08:00', closes: '17:00' }, { days: 'Fri', opens: '08:00', closes: '02:00' }, { days: 'Sat', opens: '09:00', closes: '17:00' }, { days: 'Sun', opens: '10:00', closes: '16:00' }],
  closed: [{ from: '2026-12-24', to: '2026-12-26', note: 'Christmas' }, { from: '2027-01-04', to: '2027-01-24' }, { from: '2025-01-01' }],
};
const data = (site, lang = 'en-GB') => JSON.parse(block(site, 'open-now', undefined, { lang, today }).match(/data-open-now="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
const at = (d, date, time) => openState(d, { date, min: +time.slice(0, 2) * 60 + +time.slice(3) });

test('open-now: open, opening later today, tomorrow, after a closed day', () => {
  const d = data(cafe);
  assert.equal(d.tz, 'Europe/Berlin', 'from the country');
  // 2026-10-20 is a Tuesday
  assert.deepEqual(at(d, '2026-10-20', '09:30'), { open: true, text: 'Open now · until 17:00' });
  assert.equal(at(d, '2026-10-20', '07:59').text, 'Closed · opens at 08:00');
  assert.equal(at(d, '2026-10-20', '08:00').text, 'Open now · until 17:00', 'open from the minute it opens');
  assert.equal(at(d, '2026-10-20', '17:00').text, 'Closed · opens tomorrow at 08:00', 'closed from the minute it closes');
  assert.equal(at(d, '2026-10-25', '16:30').text, 'Closed · opens Tuesday at 08:00', 'Sunday evening: Monday is closed');
  assert.equal(at(d, '2026-10-26', '12:00').text, 'Closed · opens tomorrow at 08:00', 'a closed Monday');
});

test('open-now: a bar open past midnight, closures, and a long closure says the date', () => {
  const d = data(cafe);
  assert.equal(at(d, '2026-10-23', '23:00').text, 'Open now · until 02:00', 'Friday night');
  assert.equal(at(d, '2026-10-24', '01:30').text, 'Open now · until 02:00', 'after midnight, still Friday\'s night');
  assert.equal(at(d, '2026-10-24', '02:00').text, 'Closed · opens at 09:00', 'Saturday morning');
  // Wed 23 Dec: 24–26 (Thu–Sat) closed, Sunday 27 opens
  assert.equal(at(d, '2026-12-23', '18:00').text, 'Closed · opens Sunday at 10:00');
  assert.equal(at(d, '2026-12-25', '12:00').open, false, 'a closure overrules the week');
  assert.equal(at(d, '2027-01-04', '09:00').text, 'Closed · opens Tuesday 26 January at 08:00', 'three weeks off: the date, not only the weekday');
  assert.equal(at({ ...d, week: d.week.map(() => []) }, '2026-10-20', '09:00').text, 'Closed', 'never open: just closed');
});

test('open-now: the page\'s language and clock, a label, and the zone it needs', () => {
  assert.equal(at(data(cafe, 'de'), '2026-10-25', '16:30').text, 'Geschlossen · öffnet am Dienstag um 08:00');
  assert.equal(at(data(cafe, 'de'), '2026-10-20', '09:30').text, 'Jetzt geöffnet · bis 17:00');
  assert.equal(at(data(cafe, 'en'), '2026-10-20', '07:00').text, 'Closed · opens at 8:00 AM', 'plain en: a 12-hour clock');
  assert.equal(at(data({ ...cafe, labels: { closed: 'Shut', openNow: { open: 'We\'re in' } } }), '2026-10-20', '09:30').text, 'We\'re in · until 17:00');
  assert.equal(at(data({ ...cafe, labels: { closed: 'Shut' } }), '2026-10-20', '07:00').text, 'Shut · opens at 08:00');

  assert.equal(data({ ...cafe, address: { ...cafe.address, country: 'GB' } }).tz, 'Europe/London');
  assert.equal(data({ ...cafe, timezone: 'America/Chicago', address: { ...cafe.address, country: 'US' } }).tz, 'America/Chicago');
  assert.throws(() => data({ ...cafe, address: { ...cafe.address, country: 'US' } }), /needs "timezone".*US has more than one zone/);
  assert.throws(() => data({ ...cafe, timezone: 'Mars/Olympus' }), /"Mars\/Olympus" is not a time zone/);
  assert.throws(() => data({ ...cafe, hours: [] }), /"hours" is empty/);
});

test('open-now in a page: the plain hours without JavaScript, the state with it', () => {
  const html = render('<html lang="en-GB"><body><!-- site:open-now --></body></html>', cafe, { today });
  const plain = html.match(/<p class="open-now"[^>]*>([^<]*)<\/p>/)[1];
  assert.equal(plain, 'Tue–Thu 08:00–17:00 · Fri 08:00–02:00 · Sat 09:00–17:00 · Sun 10:00–16:00 · Mon Closed');
  assert.doesNotMatch(html, /\{\{|site:open-now/, 'the marker is filled in');

  // the script, run as a browser would: it reads the block before it and writes the state into it
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const p = { dataset: { openNow: html.match(/data-open-now="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') }, textContent: plain };
  let every;
  runInNewContext(script, { document: { currentScript: { previousElementSibling: p } }, setInterval: (f, ms) => { every = ms; }, Intl, Date, JSON, Object });
  assert.match(p.textContent, /^(Open now · until \d\d:\d\d|Closed · opens .+ \d\d:\d\d)$/);
  assert.match(p.dataset.state, /^(open|closed)$/);
  assert.equal(p.dataset.hours, plain, 'the plain hours kept, for a link preview that outlives the minute');
  assert.equal(every, 60000, 'and again every minute');
});

// the data the page carries: what the clock script below reads
test('open-now: past closures left out, a one-day closure ends the day it starts, a closed night has no late bar', () => {
  assert.deepEqual(data(cafe).closed, [{ from: '2026-12-24', to: '2026-12-26' }, { from: '2027-01-04', to: '2027-01-24' }], 'past closures are left out');
  // Tue 1 Dec 2026, no "to"
  const one = data({ ...cafe, closed: [{ from: '2026-12-01' }] });
  assert.deepEqual(one.closed, [{ from: '2026-12-01', to: '2026-12-01' }]);
  assert.equal(at(one, '2026-12-01', '12:00').text, 'Closed · opens tomorrow at 08:00', 'a one-day closure closes that day');
  // Fri 25 Dec off, Sat 26 Dec on: Friday's late bar did not open, so Saturday 01:00 is closed
  const fri = data({ ...cafe, closed: [{ from: '2026-12-25', to: '2026-12-25' }] });
  assert.equal(at(fri, '2026-12-25', '23:00').open, false, 'the closed Friday');
  assert.equal(at(fri, '2026-12-26', '01:00').text, 'Closed · opens at 09:00', 'no Friday night after a closed Friday');
  assert.equal(at(data(cafe), '2026-10-24', '01:00').open, true, 'an ordinary Friday night still runs past midnight');
});

// The only code that runs in a visitor's browser: at a fixed moment, it reads the clock in the business's zone, on
// a 24-hour clock, summer and winter.
test('open-now in a page: the script reads the clock in the business\'s zone on a 24-hour clock', () => {
  const html = render('<html lang="en-GB"><body><!-- site:open-now --></body></html>', cafe, { today });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const openNow = html.match(/data-open-now="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  // the page as a browser shows it at one instant: new Date() answers with it
  const shown = (utc) => {
    const p = { dataset: { openNow }, textContent: '' };
    const Fixed = class extends Date { constructor(...a) { super(...(a.length ? a : [utc])); } };
    runInNewContext(script, { document: { currentScript: { previousElementSibling: p } }, setInterval: () => {}, Intl, Date: Fixed, JSON, Object });
    return p.textContent;
  };
  // Berlin is UTC+2 until 25 Oct 2026, UTC+1 after
  assert.equal(shown('2026-10-20T13:30:00Z'), 'Open now · until 17:00', 'Tue 15:30: an afternoon hour is read as 15, not 3');
  assert.equal(shown('2026-10-20T06:30:00Z'), 'Open now · until 17:00', 'Tue 08:30 in Berlin, 06:30 in UTC');
  assert.equal(shown('2026-10-20T22:30:00Z'), 'Closed · opens at 08:00', 'Wed 00:30 in Berlin, still Tuesday in UTC');
  assert.equal(shown('2026-12-22T15:30:00Z'), 'Open now · until 17:00', 'Tue 16:30 in winter: one hour less than in summer');
  assert.equal(shown('2026-12-22T16:10:00Z'), 'Closed · opens tomorrow at 08:00', 'Tue 17:10 in winter');
});

test('open-now: times that are not HH:MM stop the build before the block runs', () => {
  assert.throws(() => check({ ...cafe, hours: [{ days: 'Tue', opens: '8:00', closes: '17:00' }] }), /hours\[0\] needs opens and closes as HH:MM/);
  assert.throws(() => check({ ...cafe, hours: [{ days: 'Tue', opens: '08:00' }] }), /hours\[0\] needs opens and closes as HH:MM/);
});
