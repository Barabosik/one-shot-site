// The facts of the site live in site.json: name, contact, address, opening hours, closures, prices, events,
// links. This build step puts them into every page, so changing a price or the hours is a one-line edit
// there, and the page, the search-engine data and the next build always agree.
//
// In any .html page:
//   {{site.phone}}               a value (dotted paths work: {{site.address.city}}, {{site.links.booking}})
//   {{site.phone|tel}}           for href="tel:…"        {{site.address|maps}}  a map search link (OpenStreetMap)
//   {{site.tasting|price}}       a number as money in the page's language: "9 €" on a German page, "€9" in English
//   {{site.events.0.start|date}} a date (and time) in the page's language
//   {{site.events.0.start|day}}  the day alone, with its weekday: "Saturday 13 March 2027", "Samstag, 13. März 2027"
//   {{site.host|later}}          a fact that is only known at publishing: until then it shows as {{HOST}},
//                                which audit.mjs --draft lets through and a real audit stops
//   <!-- site:if owner.vatId --> … <!-- site:end -->   that part only when the fact is filled in
// A text in site.json can come once per language, { "de": "Teeprobe", "en": "Tea tasting" }; each page shows its own.
//   <!-- site:head -->           in <head>: structured data, search-console verification, cookieless analytics
//   <!-- site:jsonld -->         the structured data alone
//   <!-- site:hours -->          opening hours, plus upcoming closures
//   <!-- site:open-now -->       "Open now · until 17:00" or "Closed · opens Thursday at 10:00", in the business's
//                                time zone ("timezone", or its country's), closures and closed days counted; without
//                                JavaScript, the week's hours in one line
//   <!-- site:menu h3 -->        prices or a menu, grouped, with section headings at the given level; once one
//                                price in it has cents, all show two decimals so the column lines up
//   <!-- site:events h3 -->      upcoming events
//   <!-- site:address -->        the postal address
// A token whose value is missing stops the build and says which one, so nothing ships half-filled.
// Events and closures that are over drop out at every build; SITE_TODAY=2026-11-01 builds the site as of that day.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const FOOD = /^(FoodEstablishment|Restaurant|CafeOrCoffeeShop|Bakery|BarOrPub|Brewery|FastFoodRestaurant|IceCreamShop|Winery|Distillery)$/;
const SOFTWARE = /^(SoftwareApplication|WebApplication|MobileApplication|VideoGame)$/;
const CLOSED = { en: 'Closed', de: 'Geschlossen', fr: 'Fermé', es: 'Cerrado', it: 'Chiuso', nl: 'Gesloten', pt: 'Fechado' };
const DOORS = { en: 'Doors', de: 'Einlass', fr: 'Ouverture', es: 'Puertas', it: 'Apertura', nl: 'Deuren', pt: 'Abertura' };
const FROM = { en: 'from', de: 'ab', fr: 'à partir de', es: 'desde', it: 'da', nl: 'vanaf', pt: 'a partir de' };
const SOLD_OUT = { en: 'Sold out', de: 'Ausverkauft', fr: 'Complet', es: 'Agotado', it: 'Esaurito', nl: 'Uitverkocht', pt: 'Esgotado' };
const word = (site, key, list, lang) => site.labels?.[key] || list[lang.slice(0, 2)] || list.en;
// "Open now · until 17:00", "Closed · opens tomorrow at 08:00": {t} is the time, {day} the weekday (or the date)
const OPEN = {
  en: { open: 'Open now', until: 'until {t}', today: 'opens at {t}', tomorrow: 'opens tomorrow at {t}', later: 'opens {day} at {t}' },
  de: { open: 'Jetzt geöffnet', until: 'bis {t}', today: 'öffnet um {t}', tomorrow: 'öffnet morgen um {t}', later: 'öffnet am {day} um {t}' },
  fr: { open: 'Ouvert', until: 'jusqu’à {t}', today: 'ouvre à {t}', tomorrow: 'ouvre demain à {t}', later: 'ouvre {day} à {t}' },
  es: { open: 'Abierto', until: 'hasta las {t}', today: 'abre a las {t}', tomorrow: 'abre mañana a las {t}', later: 'abre el {day} a las {t}' },
  it: { open: 'Aperto', until: 'fino alle {t}', today: 'apre alle {t}', tomorrow: 'apre domani alle {t}', later: 'apre {day} alle {t}' },
  nl: { open: 'Nu open', until: 'tot {t}', today: 'opent om {t}', tomorrow: 'opent morgen om {t}', later: 'opent {day} om {t}' },
  pt: { open: 'Aberto', until: 'até às {t}', today: 'abre às {t}', tomorrow: 'abre amanhã às {t}', later: 'abre {day} às {t}' },
};
// the business's clock: "timezone" in site.json, or the one zone of its country (Spain and Portugal: the mainland;
// a business on the islands, or in a country with several zones, sets "timezone")
const ZONES = {
  DE: 'Europe/Berlin', AT: 'Europe/Vienna', CH: 'Europe/Zurich', LI: 'Europe/Vaduz', GB: 'Europe/London', UK: 'Europe/London',
  IE: 'Europe/Dublin', FR: 'Europe/Paris', BE: 'Europe/Brussels', NL: 'Europe/Amsterdam', LU: 'Europe/Luxembourg', IT: 'Europe/Rome',
  ES: 'Europe/Madrid', PT: 'Europe/Lisbon', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', SI: 'Europe/Ljubljana', HR: 'Europe/Zagreb',
  GR: 'Europe/Athens', JP: 'Asia/Tokyo', SG: 'Asia/Singapore', IN: 'Asia/Kolkata',
};

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fail = (msg) => { throw new Error(`site.json: ${msg}`); };

// "Tue-Sat", "Mon, Wed", "Sunday", ["Mon", "Tue"] -> [1, 2, …] (0 = Monday)
export function parseDays(spec) {
  // English or German, any length from two letters: Tu, Tue, Tuesday, Di, Dienstag
  const one = (s) => {
    const w = s.trim().toLowerCase().replace(/\.$/, '');
    const hits = new Set(DAYS.flatMap((d, i) => [d, TAGE[i]].filter((n) => w.length >= 2 && n.toLowerCase().startsWith(w)).map(() => i)));
    if (hits.size !== 1) fail(`"${s}" is not a day (use Mon, Tue-Sat, … or Mo, Di-Sa, …)`);
    return [...hits][0];
  };
  const out = [];
  for (const part of (Array.isArray(spec) ? spec : String(spec).split(',')).map(String)) {
    const [a, b] = part.split(/\s*[-–]\s*/);
    if (b === undefined) { out.push(one(a)); continue; }
    for (let i = one(a), n = 0; n < 7; i = (i + 1) % 7, n++) { out.push(i); if (i === one(b)) break; }
  }
  return [...new Set(out)];
}

const TIME = /^([01]\d|2[0-4]):[0-5]\d$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
export function check(site) {
  for (const [i, h] of (site.hours || []).entries()) {
    parseDays(h.days);
    if (!TIME.test(h.opens || '') || !TIME.test(h.closes || '')) fail(`hours[${i}] needs opens and closes as HH:MM, like "08:00"`);
  }
  for (const [i, c] of (site.closed || []).entries()) {
    if (!DATE.test(c.from || '') || (c.to && !DATE.test(c.to))) fail(`closed[${i}] needs from (and to) as YYYY-MM-DD`);
  }
  for (const [i, e] of (site.events || []).entries()) {
    if (!e.name || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.start || '')) fail(`events[${i}] needs a name and start as YYYY-MM-DDTHH:MM`);
  }
}

function value(site, path) {
  const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), site);
  return v;
}

// The postcode goes where the country writes it: after the town in the UK, Ireland and North America
// ("Anstruther KY10 3EA", "Portland, OR 97201"), before it in most of Europe ("66111 Saarbrücken").
const TOWN_FIRST = /^(GB|UK|IE|US|CA|AU|NZ|ZA|IN|SG)$/i;
const townLine = (a) => (TOWN_FIRST.test(a.country || '')
  ? [[a.city, /^(US|CA|AU)$/i.test(a.country) && a.region].filter(Boolean).join(', '), a.postcode].filter(Boolean).join(' ')
  : [a.postcode, a.city].filter(Boolean).join(' '));
const addressLine = (a) => (typeof a === 'string' ? a : [a.street, townLine(a), a.country && a.country.length > 2 ? a.country : ''].filter(Boolean).join(', '));

function token(site, expr, lang = 'en') {
  const [path, filter] = expr.split('|').map((s) => s.trim());
  const v = value(site, path);
  if (filter === 'later' && (v == null || v === '')) return `{{${path.toUpperCase().replace(/\W/g, '_')}}}`;
  const over = path.match(/^(events|closed)\.\d+/)?.[0];
  if ((v == null || v === '') && over) fail(`the page uses {{site.${expr}}}, but there is no ${over.startsWith('events') ? 'event' : 'closure'} at ${over} any more: the ones that are over drop out at each build. Wrap the line in <!-- site:if ${over} --> … <!-- site:end -->, or add the next one to site.json`);
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) fail(`the page uses {{site.${expr}}}, but "${path}" is empty`);
  if (filter === 'tel') return String(v).replace(/[^\d+]/g, '');
  if (filter === 'maps') return `https://www.openstreetmap.org/search?query=${encodeURIComponent(typeof v === 'object' ? addressLine(v) : v)}`;
  if (filter === 'price') return money(site, lang, v);
  if (filter === 'date') return dateText(lang, String(v), String(v).length > 10);
  if (filter === 'day') return dateText(lang, String(v).slice(0, 10), false, 'long');
  if (filter && filter !== 'later') fail(`unknown filter "|${filter}" (use tel, maps, price, date, day or later)`);
  return typeof v === 'object' ? addressLine(v) : String(v);
}

// 0 = Monday, in the page's language: "Tue", "Dienstag"
const weekday = (lang, i, style = 'short') => new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
// a time as the page writes it: 24-hour as given, or "8:00 AM" on pages in plain en and en-US
const clock = (lang, t) => (/^en(-US)?$/.test(lang) ? new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`2024-01-01T${t === '24:00' ? '23:59' : t}:00Z`)) : t);

// group days that share the same times: Tue–Sat 08:00–17:00. A week that starts closed starts at the first open
// day instead (Tue–Sat, Sun, Sun–Mon closed reads better than Mon closed first), and a place open three days or
// fewer lists only those days.
function hoursRows(site, lang, list = site.hours) {
  const dayName = (i, style) => weekday(lang, i, style);
  const time = (t) => clock(lang, t);
  const byDay = Array.from({ length: 7 }, () => []);
  for (const h of list || []) for (const d of parseDays(h.days)) byDay[d].push(`${time(h.opens)}–${time(h.closes)}`);
  const closed = site.labels?.closed || CLOSED[lang.slice(0, 2)] || CLOSED.en;
  const label = byDay.map((t) => (t.length ? t.join(', ') : closed));
  const open = byDay.filter((t) => t.length).length;
  const start = byDay[0].length || !open ? 0 : byDay.findIndex((t) => t.length);
  const rows = [];
  for (let n = 0; n < 7; n++) {
    const d = (start + n) % 7, last = rows.at(-1);
    if (last && last.text === label[d] && last.n === n - 1) { last.to = d; last.n = n; }
    else rows.push({ from: d, to: d, n, text: label[d] });
  }
  const span = (r) => Array.from({ length: ((r.to - r.from + 7) % 7) + 1 }, (_, i) => (r.from + i) % 7);
  return rows.filter((r) => open > 3 || r.text !== closed)
    .map((r) => ({ days: r.from === r.to ? dayName(r.from) : `${dayName(r.from)}–${dayName(r.to)}`, text: r.text, idx: span(r) }));
}

// today's weekday in the business's own time zone (the visitor's when it isn't known), 0 = Monday. Its source
// goes into the page as it is, after <!-- site:hours -->, to mark today's row.
export function weekdayIn(tz, now = new Date()) {
  const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz || undefined }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d);
}
const HOURS_TODAY = `(()=>{const dl=document.currentScript.previousElementSibling,i=String((${weekdayIn})(dl.dataset.tz));for(const r of dl.children)if(r.dataset.days.split(' ').includes(i))r.setAttribute('aria-current','date')})()`;

// the day the build counts from; SITE_TODAY pins it (an example that must not change, a check of next month)
export function buildDay() {
  const t = process.env.SITE_TODAY;
  if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error(`SITE_TODAY: "${t}" is not a date like 2026-11-01`);
  return t || new Date().toISOString().slice(0, 10);
}
const upcoming = (list, key, today) => (list || []).filter((x) => (x[key] || x.from || x.start || '').slice(0, 10) >= today);

const num = (p) => Number(String(p).replace(',', '.'));
// cents shown for every price in a list as soon as one price has cents, so the column lines up
function money(site, lang, p, cents = num(p) % 1 !== 0) {
  if (p === undefined || p === '') return '';
  const n = num(p);
  if (Number.isNaN(n)) return String(p);
  // British shops write a price under a pound in pence: "85p", not "£0.85"
  if ((site.currency || 'EUR') === 'GBP' && n > 0 && n < 1) return `${Math.round(n * 100)}p`;
  return new Intl.NumberFormat(lang, { style: 'currency', currency: site.currency || 'EUR', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(n);
}
const price = (site, lang, p, cents) => esc(money(site, lang, p, cents));

const asDate = (iso) => new Date(iso.length === 10 ? iso + 'T00:00Z' : iso + 'Z');
const dateFmt = (lang, withTime, weekday) => new Intl.DateTimeFormat(lang, { ...(weekday && { weekday: weekday === true ? 'short' : weekday }), day: 'numeric', month: 'long', year: 'numeric', ...(withTime && { hour: 'numeric', minute: '2-digit' }), timeZone: 'UTC' });
const dateText = (lang, iso, withTime, weekday) => dateFmt(lang, withTime, weekday).format(asDate(iso));
const dateRange = (lang, from, to) => (to && to !== from ? dateFmt(lang).formatRange(asDate(from), asDate(to)) : dateText(lang, from));

// Open now, or when it opens next. d: the block's data (the week as [opens, closes, opens shown, closes shown] per
// day, 0 = Monday; upcoming closures; the words), now: the business's own date and minute of the day. Its source
// goes into the page as it is, so it uses nothing from outside itself.
export function openState(d, now) {
  const m = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const add = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const day = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const shut = (iso) => d.closed.some((c) => iso >= c.from && iso <= c.to);
  // one date's open spans in minutes; a span past midnight ends at 24:00 and goes on in the next date
  const spans = (iso) => {
    const out = [], prev = add(iso, -1);
    if (!shut(iso)) for (const [o, c, ot, ct] of d.week[day(iso)]) out.push({ from: m(o), to: m(c) > m(o) ? m(c) : 1440, opens: ot, closes: ct });
    if (!shut(prev)) for (const [o, c, , ct] of d.week[day(prev)]) if (m(c) < m(o)) out.push({ from: 0, to: m(c), closes: ct });
    return out.sort((a, b) => a.from - b.from);
  };
  const say = (s, t, when) => s.replace('{t}', t).replace('{day}', when);
  const cur = spans(now.date).find((s) => now.min >= s.from && now.min < s.to);
  if (cur) return { open: true, text: d.w.open + ' · ' + say(d.w.until, cur.closes) };
  for (let n = 0; n < 60; n++) {
    const iso = add(now.date, n);
    const next = spans(iso).find((s) => s.opens && (n > 0 || s.from > now.min));
    if (!next) continue;
    // a weekday is enough within the week; further off, the date too
    const when = n < 7 ? d.days[day(iso)] : new Intl.DateTimeFormat(d.lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
    return { open: false, text: d.w.closed + ' · ' + say(n === 0 ? d.w.today : n === 1 ? d.w.tomorrow : d.w.later, next.opens, when) };
  }
  return { open: false, text: d.w.closed };
}
// in the page, right after the block: the state now, in the business's time zone, and again every minute
// the plain hours stay in data-hours, for pictures that outlive the minute (images.mjs og puts them back)
const OPEN_NOW = `(()=>{const el=document.currentScript.previousElementSibling,d=JSON.parse(el.dataset.openNow),state=${openState};el.dataset.hours=el.textContent;`
  + 'const tick=()=>{const p={};for(const x of new Intl.DateTimeFormat("en-CA",{timeZone:d.tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()))p[x.type]=x.value;'
  + 'const s=state(d,{date:p.year+"-"+p.month+"-"+p.day,min:+p.hour*60+ +p.minute});el.textContent=s.text;el.dataset.state=s.open?"open":"closed"};tick();setInterval(tick,6e4)})()';

export function block(site, name, arg, { lang = 'en', today = buildDay() } = {}) {
  const h = /^h[2-6]$/.test(arg || '') ? arg : 'h3';
  if (name === 'head') return [block(site, 'jsonld', arg, { lang, today }), verify(site), analytics(site)].filter(Boolean).join('\n  ');
  if (name === 'jsonld') return `<script type="application/ld+json">${JSON.stringify(jsonld(site, today)).replace(/</g, '\\u003c')}</script>`;
  if (name === 'address') {
    // a country alone (new-site keeps one for every kind of site) is no address to print: the Impressum needs a street
    const a = site.address;
    if (!a || (typeof a === 'object' && !(a.street || a.postcode || a.city))) fail('the page uses <!-- site:address -->, but "address" is empty: fill in street, postcode and city in site.json');
    if (typeof a === 'string') return `<address>${esc(a)}</address>`;
    return `<address>${[a.street, townLine(a)].filter(Boolean).map(esc).join('<br>')}</address>`;
  }
  if (name === 'hours') {
    // <!-- site:hours --> shows "hours"; <!-- site:hours emergency --> a second list of the same shape
    const key = arg && !/^h[2-6]$/.test(arg) ? arg : 'hours';
    if (!site[key]?.length) fail(`the page uses <!-- site:hours${key === 'hours' ? '' : ' ' + key} -->, but "${key}" is empty`);
    for (const [i, h] of site[key].entries()) if (!TIME.test(h.opens || '') || !TIME.test(h.closes || '')) fail(`${key}[${i}] needs opens and closes as HH:MM, like "08:00"`);
    // each row knows its days, and a line of script marks today's in the business's time zone
    const rows = hoursRows(site, lang, site[key]).map((r) => `<div data-days="${r.idx.join(' ')}"><dt>${esc(r.days)}</dt><dd>${esc(r.text)}</dd></div>`).join('');
    const tz = site.timezone || ZONES[String(site.address?.country || '').toUpperCase()] || '';
    const notes = key !== 'hours' ? '' : upcoming(site.closed, 'to', today).map((c) => {
      const span = dateRange(lang, c.from, c.to);
      return `<p class="closed-note">${esc(site.labels?.closed || CLOSED[lang.slice(0, 2)] || CLOSED.en)}: ${esc(span)}${c.note ? ` (${esc(c.note)})` : ''}</p>`;
    }).join('');
    return `<dl class="hours"${tz ? ` data-tz="${esc(tz)}"` : ''}>${rows}</dl><script>${HOURS_TODAY}</script>${notes}`;
  }
  if (name === 'open-now') {
    // without JavaScript, the week's hours in one line; with it, open now or when it opens next
    if (!site.hours?.length) fail('the page uses <!-- site:open-now -->, but "hours" is empty');
    const country = String(site.address?.country || '').toUpperCase();
    const tz = site.timezone || ZONES[country] || fail(`<!-- site:open-now --> needs "timezone", like "Europe/London" or "America/Chicago"${country ? ` (${country} has more than one zone, or isn't known here)` : ''}`);
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { fail(`"timezone": "${tz}" is not a time zone (like "Europe/London")`); }
    const week = Array.from({ length: 7 }, () => []);
    for (const h of site.hours) for (const d of parseDays(h.days)) week[d].push([h.opens, h.closes, clock(lang, h.opens), clock(lang, h.closes)]);
    const data = {
      tz, lang, week, closed: upcoming(site.closed, 'to', today).map((c) => ({ from: c.from, to: c.to || c.from })),
      days: Array.from({ length: 7 }, (_, i) => weekday(lang, i, 'long')),
      w: { ...(OPEN[lang.slice(0, 2)] || OPEN.en), ...site.labels?.openNow, closed: word(site, 'closed', CLOSED, lang) },
    };
    const plain = hoursRows(site, lang).map((r) => `${r.days} ${r.text}`).join(' · ');
    return `<p class="open-now" data-open-now="${esc(JSON.stringify(data))}">${esc(plain)}</p><script>${OPEN_NOW}</script>`;
  }
  if (name === 'menu') {
    if (!site.menu?.length) fail('the page uses <!-- site:menu -->, but "menu" is empty');
    const cents = site.menu.some((s) => (s.items || []).some((it) => num(it.price) % 1));
    return `<div class="menu">${site.menu.map((s) => `<section class="menu-section">${s.section ? `<${h}>${esc(s.section)}</${h}>` : ''}<dl>${(s.items || []).map((it) =>
      `<div><dt>${esc(it.name)}</dt>${it.price !== undefined && it.price !== '' ? `<dd class="price">${it.from ? `${esc(word(site, 'from', FROM, lang))} ` : ''}${price(site, lang, it.price, cents)}</dd>` : ''}${it.note ? `<dd class="note">${esc(it.note)}</dd>` : ''}</div>`).join('')}</dl></section>`).join('')}</div>`;
  }
  if (name === 'events') {
    const list = upcoming(site.events, 'start', today);
    if (!list.length) return '';
    // Thu, 12 November 2026, 20:00 · The Lantern Rooms, Norwich · £14, doors and sold out when given
    const row = (e) => [
      `<time datetime="${esc(e.start)}">${esc(dateText(lang, e.start, e.start.length > 10, true))}</time>`,
      [e.place, e.city].filter(Boolean).map(esc).join(', '),
      e.doors && `${esc(word(site, 'doors', DOORS, lang))} ${esc(e.doors)}`,
      e.price !== undefined && e.price !== '' && price(site, lang, e.price),
    ].filter(Boolean).join(' · ');
    const action = (e) => (e.soldOut ? `<p class="sold-out">${esc(word(site, 'soldOut', SOLD_OUT, lang))}</p>`
      : e.tickets ? `<p><a href="${esc(e.tickets)}">${esc(site.labels?.tickets || 'Tickets')}</a></p>` : '');
    return `<ul class="events">${list.map((e) => `<li><${h}>${esc(e.name)}</${h}><p>${row(e)}</p>${action(e)}</li>`).join('')}</ul>`;
  }
  fail(`unknown block <!-- site:${name} --> (use head, jsonld, hours, open-now, menu, events or address)`);
}

// the meta tags Google Search Console and Bing Webmaster Tools ask for, to prove the site is yours
function verify(site) {
  const v = site.verify || {};
  return [v.google && `<meta name="google-site-verification" content="${esc(v.google)}">`, v.bing && `<meta name="msvalidate.01" content="${esc(v.bing)}">`].filter(Boolean).join('\n  ');
}

// visitor counts without cookies, so no consent banner: GoatCounter, Cloudflare Web Analytics or Plausible
function analytics(site) {
  const a = site.analytics || {};
  if (a.goatcounter) return `<script data-goatcounter="https://${esc(a.goatcounter)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
  if (a.cloudflare) return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{&quot;token&quot;: &quot;${esc(a.cloudflare)}&quot;}"></script>`;
  if (a.plausible) return `<script defer data-domain="${esc(a.plausible)}" src="https://plausible.io/js/script.js"></script>`;
  return '';
}

// schema.org data from the same facts: the address, hours and prices search engines read are the ones on the page
export function jsonld(site, today = buildDay()) {
  if (!site.type) fail('"type" is empty: Person, Organization, LocalBusiness (or Restaurant, CafeOrCoffeeShop, Store…), Event');
  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || (Array.isArray(v) && !v.length) ? undefined : v)));
  // an address with nothing in it (new-site leaves one empty) is no address
  const real = (a) => (a && (typeof a === 'string' || a.street || a.city || a.postcode) ? a : undefined);
  const place = (a, name) => real(a) && { '@type': 'Place', name, address: typeof a === 'string' ? a : postal(a) };
  const postal = (a) => (typeof a === 'string' ? a : { '@type': 'PostalAddress', streetAddress: a.street, postalCode: a.postcode, addressLocality: a.city, addressRegion: a.region, addressCountry: a.country });
  const social = Object.entries(site.links || {}).filter(([k, v]) => v && !['booking', 'payment', 'menu', 'tickets', 'join', 'donate', 'order', 'map', 'download', 'docs'].includes(k)).map(([, v]) => v);
  const event = (e) => ({
    '@type': 'Event', name: e.name, description: e.description, startDate: e.start, endDate: e.end,
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(real(e.address) || (e.city && { city: e.city, country: site.address?.country }) || site.address, e.place || site.name),
    image: site.url ? site.url + 'og.jpg' : undefined,
    organizer: { '@type': 'Organization', name: site.name, url: site.url },
    offers: e.price !== undefined ? { '@type': 'Offer', price: String(e.price), priceCurrency: site.currency || 'EUR', url: e.tickets || site.url, availability: `https://schema.org/${e.soldOut ? 'SoldOut' : 'InStock'}` } : undefined,
  });

  if (site.type === 'Event') return clean({ '@context': 'https://schema.org', ...event({ ...(site.events?.[0] || {}), name: site.events?.[0]?.name || site.name }) });

  const main = {
    '@context': 'https://schema.org', '@type': site.type, name: site.name, url: site.url, description: site.description,
    email: site.email, telephone: site.phone, jobTitle: site.type === 'Person' ? site.job : undefined,
    address: real(site.address) ? postal(site.address) : undefined,
    geo: site.geo ? { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng } : undefined,
    priceRange: site.priceRange, sameAs: social,
    openingHoursSpecification: (site.hours || []).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: parseDays(h.days).map((d) => DAYS[d]), opens: h.opens, closes: h.closes })),
    // closed all day: opens and closes both 00:00, as Google reads it
    specialOpeningHoursSpecification: upcoming(site.closed, 'to', today).map((c) => ({ '@type': 'OpeningHoursSpecification', validFrom: c.from, validThrough: c.to || c.from, opens: '00:00', closes: '00:00' })),
    // software: the version, where to get it, its licence and who makes it
    ...(SOFTWARE.test(site.type) ? {
      softwareVersion: site.version, downloadUrl: site.download || site.links?.download, license: site.license,
      applicationCategory: site.category, operatingSystem: site.os,
      author: site.owner?.name ? { '@type': 'Person', name: site.owner.name } : undefined,
      offers: site.price !== undefined && site.price !== '' ? { '@type': 'Offer', price: String(site.price), priceCurrency: site.currency || 'EUR' } : undefined,
    } : {}),
    hasMenu: FOOD.test(site.type) && site.menu?.length ?{ '@type': 'Menu', hasMenuSection: site.menu.map((s) => ({ '@type': 'MenuSection', name: s.section, hasMenuItem: (s.items || []).map((it) => ({ '@type': 'MenuItem', name: it.name, description: it.note, offers: it.price !== undefined && !Number.isNaN(Number(String(it.price).replace(',', '.'))) ? { '@type': 'Offer', price: String(it.price).replace(',', '.'), priceCurrency: site.currency || 'EUR' } : undefined })) })) } : undefined,
  };
  const events = upcoming(site.events, 'start', today).map(event);
  return events.length ? [clean(main), ...events.map((e) => clean({ '@context': 'https://schema.org', ...e }))] : clean(main);
}

// A text can be given once per language, { "de": "Teeprobe", "en": "Tea tasting" }: each page takes its own
// (the page's lang, then its first two letters, then the first one given). Prices and times stay written once.
const LANG = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
export function localize(v, lang) {
  if (Array.isArray(v)) return v.map((x) => localize(x, lang));
  if (!v || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  if (keys.length && keys.every((k) => LANG.test(k))) return v[lang] ?? v[lang.slice(0, 2)] ?? v[keys[0]];
  return Object.fromEntries(keys.map((k) => [k, localize(v[k], lang)]));
}

// fill one page
export function render(html, site, opts = {}) {
  const lang = opts.lang || html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] || 'en';
  const local = localize(site, lang);
  // past events and closures are gone for tokens and site:if too, not only for the blocks: a "Next course"
  // wrapped in <!-- site:if events.0 --> goes when the course is over
  const today = () => opts.today || buildDay();
  if (Array.isArray(local.events)) local.events = upcoming(local.events, 'start', today());
  if (Array.isArray(local.closed)) local.closed = upcoming(local.closed, 'to', today());
  const filled = (path) => { const v = value(local, path); return v != null && v !== '' && !(Array.isArray(v) && !v.length); };
  return html
    // <!-- site:if owner.vatId --> … <!-- site:end -->: that part shows only when the fact is filled in
    .replace(/<!--\s*site:if\s+([\w.]+)\s*-->([\s\S]*?)<!--\s*site:end\s*-->/g, (m, path, inner) => (filled(path) ? inner : ''))
    .replace(/<!--\s*site:(\w+(?:-\w+)*)(?:\s+(\w+))?\s*-->/g, (m, name, arg) => block(local, name, arg, { ...opts, lang }))
    .replace(/\{\{\s*site\.([\w.]+(?:\s*\|\s*\w+)?)\s*\}\}/g, (m, expr) => esc(token(local, expr, lang)));
}

// the Vite plugin: reads site.json from the project root, fills every page, reloads the dev server on change
export function siteData(root) {
  const file = join(root, 'site.json');
  const load = () => {
    if (!existsSync(file)) return null;
    let site;
    try { site = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`not valid JSON (${e.message})`); }
    check(site);
    return site;
  };
  return {
    name: 'one-shot-site-data',
    transformIndexHtml: { order: 'pre', handler: (html) => { const site = load(); return site ? render(html, site) : html; } },
    configureServer(server) {
      server.watcher.add(file);
      server.watcher.on('change', (f) => { if (f === file) server.ws.send({ type: 'full-reload' }); });
    },
  };
}
