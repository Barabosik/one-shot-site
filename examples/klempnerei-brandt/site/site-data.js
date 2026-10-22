// The facts of the site live in site.json: name, contact, address, opening hours, closures, prices, events,
// links. This build step puts them into every page, so changing a price or the hours is a one-line edit
// there, and the page, the search-engine data and the next build always agree.
//
// In any .html page:
//   {{site.phone}}               a value (dotted paths work: {{site.address.city}}, {{site.links.booking}})
//   {{site.phone|tel}}           for href="tel:…"        {{site.address|maps}}  a map search link
//   {{site.host|later}}          a fact that is only known at publishing: until then it shows as {{HOST}},
//                                which audit.mjs --draft lets through and a real audit stops
//   <!-- site:head -->           in <head>: structured data, search-console verification, cookieless analytics
//   <!-- site:jsonld -->         the structured data alone
//   <!-- site:hours -->          opening hours, plus upcoming closures
//   <!-- site:menu h3 -->        prices or a menu, grouped, with section headings at the given level
//   <!-- site:events h3 -->      upcoming events
//   <!-- site:address -->        the postal address
// A token whose value is missing stops the build and says which one, so nothing ships half-filled.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const FOOD = /^(FoodEstablishment|Restaurant|CafeOrCoffeeShop|Bakery|BarOrPub|Brewery|FastFoodRestaurant|IceCreamShop|Winery|Distillery)$/;
const CLOSED = { en: 'Closed', de: 'Geschlossen', fr: 'Fermé', es: 'Cerrado', it: 'Chiuso', nl: 'Gesloten', pt: 'Fechado' };

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

const addressLine = (a) => (typeof a === 'string' ? a : [a.street, [a.postcode, a.city].filter(Boolean).join(' '), a.country && a.country.length > 2 ? a.country : ''].filter(Boolean).join(', '));

function token(site, expr) {
  const [path, filter] = expr.split('|').map((s) => s.trim());
  const v = value(site, path);
  if (filter === 'later' && (v == null || v === '')) return `{{${path.toUpperCase().replace(/\W/g, '_')}}}`;
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) fail(`the page uses {{site.${expr}}}, but "${path}" is empty`);
  if (filter === 'tel') return String(v).replace(/[^\d+]/g, '');
  if (filter === 'maps') return `https://www.openstreetmap.org/search?query=${encodeURIComponent(typeof v === 'object' ? addressLine(v) : v)}`;
  if (filter && filter !== 'later') fail(`unknown filter "|${filter}" (use tel, maps or later)`);
  return typeof v === 'object' ? addressLine(v) : String(v);
}

// group days that share the same times: Tue–Sat 08:00–17:00
function hoursRows(site, lang) {
  const dayName = (i, style = 'short') => new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));
  const time = (t) => (/^en(-US)?$/.test(lang) ? new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`2024-01-01T${t === '24:00' ? '23:59' : t}:00Z`)) : t);
  const byDay = Array.from({ length: 7 }, () => []);
  for (const h of site.hours || []) for (const d of parseDays(h.days)) byDay[d].push(`${time(h.opens)}–${time(h.closes)}`);
  const closed = site.labels?.closed || CLOSED[lang.slice(0, 2)] || CLOSED.en;
  const label = byDay.map((t) => (t.length ? t.join(', ') : closed));
  const rows = [];
  for (let d = 0; d < 7; d++) {
    const last = rows.at(-1);
    if (last && last.text === label[d] && last.to === d - 1) last.to = d;
    else rows.push({ from: d, to: d, text: label[d] });
  }
  return rows.map((r) => ({ days: r.from === r.to ? dayName(r.from) : `${dayName(r.from)}–${dayName(r.to)}`, text: r.text }));
}

const upcoming = (list, key, today) => (list || []).filter((x) => (x[key] || x.from || x.start || '').slice(0, 10) >= today);

const num = (p) => Number(String(p).replace(',', '.'));
// cents shown for every price in a list as soon as one price has cents, so the column lines up
function price(site, lang, p, cents = num(p) % 1 !== 0) {
  if (p === undefined || p === '') return '';
  const n = num(p);
  if (Number.isNaN(n)) return esc(p);
  return esc(new Intl.NumberFormat(lang, { style: 'currency', currency: site.currency || 'EUR', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(n));
}

const asDate = (iso) => new Date(iso.length === 10 ? iso + 'T00:00Z' : iso + 'Z');
const dateFmt = (lang, withTime) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', ...(withTime && { hour: 'numeric', minute: '2-digit' }), timeZone: 'UTC' });
const dateText = (lang, iso, withTime) => dateFmt(lang, withTime).format(asDate(iso));
const dateRange = (lang, from, to) => (to && to !== from ? dateFmt(lang).formatRange(asDate(from), asDate(to)) : dateText(lang, from));

export function block(site, name, arg, { lang = 'en', today = new Date().toISOString().slice(0, 10) } = {}) {
  const h = /^h[2-6]$/.test(arg || '') ? arg : 'h3';
  if (name === 'head') return [block(site, 'jsonld', arg, { lang, today }), verify(site), analytics(site)].filter(Boolean).join('\n  ');
  if (name === 'jsonld') return `<script type="application/ld+json">${JSON.stringify(jsonld(site, today)).replace(/</g, '\\u003c')}</script>`;
  if (name === 'address') {
    const a = site.address || fail('the page uses <!-- site:address -->, but "address" is empty');
    if (typeof a === 'string') return `<address>${esc(a)}</address>`;
    return `<address>${[a.street, [a.postcode, a.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>')}</address>`;
  }
  if (name === 'hours') {
    if (!site.hours?.length) fail('the page uses <!-- site:hours -->, but "hours" is empty');
    const rows = hoursRows(site, lang).map((r) => `<div><dt>${esc(r.days)}</dt><dd>${esc(r.text)}</dd></div>`).join('');
    const notes = upcoming(site.closed, 'to', today).map((c) => {
      const span = dateRange(lang, c.from, c.to);
      return `<p class="closed-note">${esc(site.labels?.closed || CLOSED[lang.slice(0, 2)] || CLOSED.en)}: ${esc(span)}${c.note ? ` (${esc(c.note)})` : ''}</p>`;
    }).join('');
    return `<dl class="hours">${rows}</dl>${notes}`;
  }
  if (name === 'menu') {
    if (!site.menu?.length) fail('the page uses <!-- site:menu -->, but "menu" is empty');
    const cents = site.menu.some((s) => (s.items || []).some((it) => num(it.price) % 1));
    return `<div class="menu">${site.menu.map((s) => `<section class="menu-section">${s.section ? `<${h}>${esc(s.section)}</${h}>` : ''}<dl>${(s.items || []).map((it) =>
      `<div><dt>${esc(it.name)}</dt><dd class="price">${price(site, lang, it.price, cents)}</dd>${it.note ? `<dd class="note">${esc(it.note)}</dd>` : ''}</div>`).join('')}</dl></section>`).join('')}</div>`;
  }
  if (name === 'events') {
    const list = upcoming(site.events, 'start', today);
    if (!list.length) return '';
    return `<ul class="events">${list.map((e) => `<li><${h}>${esc(e.name)}</${h}><p><time datetime="${esc(e.start)}">${esc(dateText(lang, e.start, e.start.length > 10))}</time>${e.place ? ` · ${esc(e.place)}` : ''}${e.price !== undefined ? ` · ${price(site, lang, e.price)}` : ''}</p>${e.tickets ? `<p><a href="${esc(e.tickets)}">${esc(site.labels?.tickets || 'Tickets')}</a></p>` : ''}</li>`).join('')}</ul>`;
  }
  fail(`unknown block <!-- site:${name} --> (use head, jsonld, hours, menu, events or address)`);
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
export function jsonld(site, today = new Date().toISOString().slice(0, 10)) {
  if (!site.type) fail('"type" is empty: Person, Organization, LocalBusiness (or Restaurant, CafeOrCoffeeShop, Store…), Event');
  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || (Array.isArray(v) && !v.length) ? undefined : v)));
  const place = (a, name) => a && { '@type': 'Place', name, address: typeof a === 'string' ? a : postal(a) };
  const postal = (a) => (typeof a === 'string' ? a : { '@type': 'PostalAddress', streetAddress: a.street, postalCode: a.postcode, addressLocality: a.city, addressRegion: a.region, addressCountry: a.country });
  const social = Object.entries(site.links || {}).filter(([k, v]) => v && !['booking', 'payment', 'menu', 'tickets'].includes(k)).map(([, v]) => v);
  const event = (e) => ({
    '@type': 'Event', name: e.name, description: e.description, startDate: e.start, endDate: e.end,
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(e.address || site.address, e.place || site.name),
    image: site.url ? site.url + 'og.jpg' : undefined,
    organizer: { '@type': 'Organization', name: site.name, url: site.url },
    offers: e.price !== undefined ? { '@type': 'Offer', price: String(e.price), priceCurrency: site.currency || 'EUR', url: e.tickets || site.url, availability: 'https://schema.org/InStock' } : undefined,
  });

  if (site.type === 'Event') return clean({ '@context': 'https://schema.org', ...event({ ...(site.events?.[0] || {}), name: site.events?.[0]?.name || site.name }) });

  const main = {
    '@context': 'https://schema.org', '@type': site.type, name: site.name, url: site.url, description: site.description,
    email: site.email, telephone: site.phone, jobTitle: site.type === 'Person' ? site.job : undefined,
    address: site.address ? postal(site.address) : undefined,
    geo: site.geo ? { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng } : undefined,
    priceRange: site.priceRange, sameAs: social,
    openingHoursSpecification: (site.hours || []).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: parseDays(h.days).map((d) => DAYS[d]), opens: h.opens, closes: h.closes })),
    // closed all day: opens and closes both 00:00, as Google reads it
    specialOpeningHoursSpecification: upcoming(site.closed, 'to', today).map((c) => ({ '@type': 'OpeningHoursSpecification', validFrom: c.from, validThrough: c.to || c.from, opens: '00:00', closes: '00:00' })),
    hasMenu: FOOD.test(site.type) && site.menu?.length ? { '@type': 'Menu', hasMenuSection: site.menu.map((s) => ({ '@type': 'MenuSection', name: s.section, hasMenuItem: (s.items || []).map((it) => ({ '@type': 'MenuItem', name: it.name, description: it.note, offers: it.price !== undefined && !Number.isNaN(Number(String(it.price).replace(',', '.'))) ? { '@type': 'Offer', price: String(it.price).replace(',', '.'), priceCurrency: site.currency || 'EUR' } : undefined })) })) } : undefined,
  };
  const events = upcoming(site.events, 'start', today).map(event);
  return events.length ? [clean(main), ...events.map((e) => clean({ '@context': 'https://schema.org', ...e }))] : clean(main);
}

// fill one page
export function render(html, site, opts = {}) {
  const lang = opts.lang || html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] || 'en';
  return html
    .replace(/<!--\s*site:(\w+)(?:\s+(\w+))?\s*-->/g, (m, name, arg) => block(site, name, arg, { ...opts, lang }))
    .replace(/\{\{\s*site\.([\w.]+(?:\s*\|\s*\w+)?)\s*\}\}/g, (m, expr) => esc(token(site, expr)));
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
