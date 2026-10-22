# The facts file: site.json

Everything that is true about the person or business and may change goes in `site.json` in the project
root: contact, address, opening hours, closures, prices, events, booking and payment links. Pages show these
facts through tokens, and the structured data for search engines is built from the same file. So the hours on
the page, in Google's results and in the owner's head can't drift apart, and a change is one edit.

## Fields

| Field | Example | Notes |
|---|---|---|
| `name` | `"Kleiner Kaffee"` | |
| `type` | `"CafeOrCoffeeShop"` | schema.org type: Person, Organization, LocalBusiness, Restaurant, Bakery, Store, HairSalon, Event… The most specific one that fits. |
| `description` | one or two plain sentences | used in the structured data |
| `url` | `"https://kleiner-kaffee.example/"` | set by `set-url.mjs`, leave empty until known |
| `email`, `phone` | `"+49 681 123 45 67"` | phone as people write it; `|tel` makes the link |
| `currency` | `"EUR"` | for prices; new-site leaves it out for a person, an organization, a group or software unless `--currency` names one |
| `priceRange` | `"€"` or `"€€"` | local businesses |
| `address` | `{ "street", "postcode", "city", "country": "DE" }` | every site keeps its country; a person or software may have the country only. `<!-- site:address -->` needs a street, postcode or city, or the build stops |
| `geo` | `{ "lat": 49.2335, "lng": 6.9969 }` | optional, five decimals |
| `hours` | `[{ "days": "Tue-Sat", "opens": "08:00", "closes": "17:00" }]` | days: `Mon`, `Tue-Sat`, `Sat-Mon`, `Mon, Wed`; 24-hour times. Days not listed show as closed. Two rows for one day = a lunch break. |
| `closed` | `[{ "from": "2026-12-24", "to": "2026-12-26", "note": "Christmas" }]` | holidays and closures; past ones drop out at the next build |
| `timezone` | `"America/Chicago"` | the business's clock, for `<!-- site:open-now -->`; only needed where the country has more than one zone |
| `menu` | `[{ "section": "Coffee", "items": [{ "name": "Espresso", "price": "2.40", "note": "" }] }]` | menus, price lists, services; `"from": true` on an item writes "from €49" ("ab 49 €"); an item with no known price leaves `price` out and shows its name and note; a price under a pound in GBP, `"0.85"`, shows as 85p |
| `events` | `[{ "name", "start": "2027-03-14T20:00", "end", "place", "city", "doors": "19:30", "price", "tickets", "soldOut": true, "description" }]` | past events drop out at the next build (one with an `end` the day after it ends, so a festival stays up while it runs); `start` is when it starts, `doors` when people get in; a city is enough for a tour date's address |
| `links` | `{ "booking", "payment", "join", "instagram", … }` | `booking`, `payment`, `tickets`, `menu`, `join` (a membership or sign-up form), `donate`, `order` and `map` are things to do; `download` and `docs` are where to get and read software; every other link counts as a profile of the same person or business |
| `job` | `"Independent app developer"` | for `type: Person` |
| `version`, `download`, `license`, `price`, `category`, `os` | `"0.9.2"`, a releases page, `"MIT"`, `0`, `"DeveloperApplication"`, `"macOS, Linux"` | for software (`SoftwareApplication`, `WebApplication`, `MobileApplication`, `VideoGame`): new-site adds `version`, `download`, `license` and `price` empty and lists them under "Still to fill in"; they go into the structured data with `owner.name` as its maker; `price` only when it's free (`0`) or has one price |
| `labels` | `{ "closed": "Ruhetag", "tickets": "Karten" }` | optional wording for the blocks |
| `photos` | `false` | only when they said no to photos: the four-picture floor and the audit's `few-pictures` don't apply, and drawings, type and atmosphere carry the page (brief.md, "No pictures at all") |
| `owner` | `{ "name": "Rosa Brandt", "business", "register", "vatId", "chamber" }` | the legal name behind the site, for the Impressum and as software's maker; the other fields show in the Impressum only when filled in ([legal.md](legal.md)) |
| `host` | `"GitHub Pages (GitHub Inc., USA)"` | the hosting provider, named in the privacy page; `set-url.mjs` fills it in for GitHub Pages, Vercel, Netlify and Cloudflare, any other host by hand |
| `verify` | `{ "google": "…", "bing": "…" }` | the codes Search Console and Bing Webmaster Tools give as an HTML tag; `<!-- site:head -->` writes the meta tags ([local.md](local.md)) |
| `analytics` | `{ "goatcounter": "kleiner-kaffee" }` | visitor counts without cookies: `goatcounter` (the site's code), `cloudflare` (the token) or `plausible` (the domain); `<!-- site:head -->` adds the script; name the service in the privacy page |

Keep only fields that are real. Never fill one with a guess: ask, or leave it empty and design without it. A fact
known only at publishing (`host`, or `owner.name` before they give it) takes `|later`: `{{site.host|later}}`
shows as `{{HOST}}` until it's filled in, which `audit.mjs --draft` lets through and a real audit stops on (a
missing `owner.name`, `{{OWNER_NAME}}`, is listed in the draft's notes as waiting on them).

Any other fact that may change can have its own field: `"area": { "towns": ["Taucha", "Markkleeberg"] }`, a needs
list, a yearly count. Every field is a token (`{{site.area.towns.0}}`; a number picks from a list). A second set
of hours (an emergency line, a kitchen that closes earlier) gets its own field in the shape of `hours` and its
own block: `<!-- site:hours emergency -->`. Only `hours` goes into the data for search engines.

Past events and closures drop out at every build, counted from today: from the blocks, the tokens and `site:if`
alike. So wrap a line that names one by number in `<!-- site:if events.0 -->` (`Next course:
{{site.events.0.start|day}}`): it goes when the course is over. Outside one, the build stops on it then. To see
the page as of another day (next month's gigs, or an example that must stay as it is), build with
`SITE_TODAY=2026-11-01 npm run build`.

## In the pages

```html
<a href="tel:{{site.phone|tel}}">{{site.phone}}</a>
<a href="{{site.address|maps}}">{{site.address}}</a>      <!-- a search on OpenStreetMap, no embed -->
<a class="button" href="{{site.links.booking}}">Book a table</a>
<p>Three teas to taste for {{site.tasting|price}}</p>   <!-- "9 €" on a German page, "€9" in English -->
<p>Next: {{site.events.0.start|date}}</p>                 <!-- the date in the page's language -->
<p>{{site.events.0.start|day}}</p>                        <!-- the day with its weekday, no time: check the weekday is right -->

<!-- site:if links.booking --><a href="{{site.links.booking}}">Book online</a><!-- site:end -->
                            the part between shows only when that fact is filled in

<!-- site:head -->          in <head>, once per page: the structured data, the verify tags, the analytics script
<!-- site:jsonld -->        the structured data alone
<!-- site:hours -->         <dl class="hours"> plus upcoming closures; the week starts at the first open day,
                            and a place open three days or fewer lists only those days. Today's row gets
                            aria-current="date" in the business's time zone (base.css colours it; restyle
                            `.hours > [aria-current]` with the design)
<!-- site:open-now -->      <p class="open-now">: "Open now · until 17:00" or "Closed · opens Thursday at 10:00",
                            in the business's time zone, closures and closed days counted, again every minute.
                            Without JavaScript, the week's hours in one line. The zone comes from the address's
                            country; where a country has several (US, CA, AU…), set "timezone": "America/Chicago"
<!-- site:menu h3 -->       sections with h3 headings and a <dl> of items and prices; once one price in a menu
                            has cents, all show two decimals (€3.00 under €3.60), so the column lines up.
                            `|price` writes a single value as it is: €9, €8.50
<!-- site:events h3 -->     upcoming events: weekday and date, place and city, doors, price, and the ticket
                            link or "Sold out"
<!-- site:address -->       <address>
```

A block marker stands on its own line, outside any `<p>`: the block becomes a list, a table, an address or a
paragraph of its own, which a paragraph can't hold, so the browser ends the paragraph early and the layout breaks
(lint fails `block-in-p`).
`site:if` and `site:end` are the exception: they may wrap a link inside a sentence.

The name in the header, the footer and the `h1` sits in an element with `translate="no"`, as in the starter, so a
browser that translates the page keeps "Kleiner Kaffee" (lint: `translate-name`).

Blocks come out as plain semantic HTML with the classes above, and base.css gives them a tidy default; style
them in style.css like any other part of the design. Prices and dates follow the page's `lang`
(`2,40 €` and `24.–26. Dezember` on a German page). A token with an empty value stops the build with its
name, so a page can't ship with a blank phone number.

Times are 24-hour, except on pages in plain `en` or `en-US`, which show "8:00 AM". A British or Irish site sets
`lang="en-GB"` for 24-hour times.

**Two languages:** a text that differs by language is written once per language, `"section": { "de": "Grüntee",
"en": "Green tea" }`, and each page shows the one for its `lang`. Names, notes, sections, labels and
descriptions can all do this; prices, times and addresses stay written once.

## Changes later

The owner (or you, for them) edits `site.json`, then `npm run build` and publish again. Typical asks:
"new hours from Monday", "closed 24 to 26 December", "espresso is 2.60 now", "add the March concert".
If they'd rather edit in a browser and the site is on GitHub with the Pages workflow, copy
`SKILL_DIR/assets/cms/pages.yml` to `.pages.yml` in the repo: [Pages CMS](https://pagescms.org) then shows a
form for these fields, each save is a commit, and the workflow publishes it.
