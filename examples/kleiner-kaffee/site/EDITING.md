# Kleiner Kaffee: changing the website

The site is plain HTML, CSS and a little JavaScript, built with Vite. Everything that changes now and then
(hours, prices, the email, the roast day) lives in one file, `site.json`. Change it there and the page, the
Impressum and what Google reads all change together.

## Before it goes online

1. **The email.** `hallo@kleiner-kaffee.example` is a stand-in. Put the real address in `site.json` → `email`,
   then remove `"made-up-address"` from `.one-shot/allow.json` (the check should pass without it).
2. **A phone number for the Impressum.** German law wants a second quick way to reach you besides email. Add
   `"phone": "+49 681 …"` to `site.json`; the Impressum shows it by itself.
3. **The postcode.** Add `"postcode": "…"` to `site.json` → `address`, so the address on the page and in Google
   is complete.
4. **Where it lives.** Once you have an address (for example `https://kleiner-kaffee.example/`), run
   `node tools/one-shot/set-url.mjs . https://kleiner-kaffee.example/` once, and name the host in `site.json` →
   `host` (it appears in the privacy page).

## What is in site.json

| Field | What it is | Shows up |
|---|---|---|
| `name` | Kleiner Kaffee | header, footer, title, Impressum |
| `description` | one sentence about the place | search engines |
| `email` | where people order beans and write to you | roasting section, Visit, Impressum, privacy page |
| `address` | street, city, country (`DE`); the postcode once you add it | first screen, Visit, footer, directions links, Impressum |
| `hours` | `Tue-Sat` 08:00–17:00, `Sun` 10:00–16:00; days not listed show as closed | first screen, Visit, footer, Google |
| `closed` | holidays: `{ "from": "2026-12-24", "to": "2026-12-26", "note": "Christmas" }`; past ones drop off by themselves | under the hours |
| `menu` | two groups (Coffee, To eat), each item with a name, a price like `"2.40"` and a short note | the menu, Google |
| `seats` | 8 | first screen, the bar |
| `since` | 2019 | the bar |
| `roast` | `day` (Tuesday) and `batch` (5 kg) | first screen, roasting section |
| `photos` | `false`: you said no photos, so drawings carry the page | the checks |
| `priceRange` | `€` | Google |
| `owner` | Lena Hoffmann, trading as Kleiner Kaffee | the bar, Impressum, privacy page |
| `host` | the hosting company | privacy page |

Typical changes, all in `site.json`: "espresso is 2.60 now" (the price), "closed 24 to 26 December" (a line in
`closed`), "open from 9 on Sundays" (`hours`), "we roast on Wednesdays now" (`roast` → `day`).

## How to change it

Easiest: open this folder with any coding agent and say "use one-shot-site to change …" (new hours, a price, a
holiday, a sentence). It reads `site.json` and this file, and keeps the design.

By hand:

```
npm install          # once
# edit site.json (or the words in index.html)
npm run build        # stops with a message if a field the page needs is empty
npm run audit -- --draft   # the launch checks; drop --draft once the address is set
```

The built site is the `dist` folder. To publish again, upload `dist` the same way as the first time: once it's
online, this file names the host and the exact command. Then check the live page on your phone.

## After launch: being found

1. **Google Business Profile** (business.google.com): the same name, address and hours as the site, character
   for character: *Kleiner Kaffee*, *Röstergasse 12, Saarbrücken* (with the postcode), Tue–Sat 08:00–17:00,
   Sun 10:00–16:00, Monday closed. Website: the live address. Category: coffee shop (or café). Holidays go in
   "special hours", the same dates as `closed` in `site.json`.
2. **Google Search Console** (search.google.com/search-console): add the live address as a URL-prefix property,
   choose "HTML tag", put the code in `site.json` → `verify.google`, build and publish, then press Verify.
   Submit `sitemap.xml`. Bing Webmaster Tools works the same way (`verify.bing`).
3. **Apple Business Connect** and **Bing Places**, if you want Apple Maps and Bing to match too.
4. Whenever hours or prices change: `site.json` first, then the Google profile.

## Legal

The Impressum and the privacy page (in German, `impressum.html`, `datenschutz.html`) are filled from
`site.json`. Not legal advice: you stay responsible for them, and a generator such as eRecht24 is a good check.
The site sets no cookies, loads no outside fonts or maps, and needs no cookie banner. The directions buttons
link to OpenStreetMap; nothing loads from there until someone taps them.
