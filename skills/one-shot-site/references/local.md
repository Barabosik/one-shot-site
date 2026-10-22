# Local businesses: being found and booked

For a café, shop, salon, practice or trade, most visitors arrive from Google Maps or a search for "near me", and
they come with three questions: is it open, where is it, can I book or order. The site answers those, and the
same facts appear everywhere the business shows up.

## On the site

- Hours, closures, address, phone and prices come from `site.json` (see [facts.md](facts.md)), shown with
  `<!-- site:hours -->`, `<!-- site:address -->` and `<!-- site:menu -->`. `<!-- site:open-now -->` says whether
  it's open now or when it opens next (set "timezone" where the country has several). A menu or price list is a page section,
  never a PDF: PDFs are hard to read on a phone and go stale (the audit warns about them).
- Open, where, and the main action sit on the first screen at 390 px, and the action stays one tap away on
  every screen after it: in the header on a desktop, in a bar at the bottom on a phone ([layout.md](layout.md),
  "The action stays in reach").
- `type` in site.json is the most specific schema.org type: `Restaurant`, `CafeOrCoffeeShop`, `Bakery`,
  `HairSalon`, `BeautySalon`, `Dentist`, `Physiotherapy`, `AutoRepair`, `Plumber`, `Electrician`, `Store`,
  `ClothingStore`, `LocalBusiness` when nothing fits. Add `priceRange` and, if known, `geo`.
- Map: a link (`{{site.address|maps}}`) is enough for most sites and loads nothing. If the design needs a map in
  the page, use the embed addon so it loads on click.

## Booking, ordering, paying

Link to the service they already use; don't build one. A button, not an embedded widget (widgets are heavy and
load third-party code before anyone asks for it).

| Need | Common services | site.json |
|---|---|---|
| Appointments | Cal.com, Calendly, Google Calendar booking pages, Treatwell, Doctolib | `links.booking` |
| Restaurant tables | OpenTable, Quandoo, TheFork, or "call us" | `links.booking` |
| Payments, deposits, simple sales | Stripe Payment Links, PayPal.me, SumUp | `links.payment` |
| Tickets | Eventbrite, Tito, Pretix | `events[].tickets` |

When the site takes bookings or payments from consumers, the EU accessibility act may apply (Germany: BFSG, since
28 June 2025); micro businesses (under 10 staff and under €2M turnover) that only offer services are exempt. Keep
axe-core at zero violations either way, and say so in the handover.

## After launch: the checklist to hand over

The owner does these with their own logins; give them the list with the exact values from `site.json`.

1. **Google Business Profile** (business.google.com): the same name, address, phone and hours as the site,
   character for character; the website field set to the live URL; the booking link if there is one; the right
   primary category; a few real photos. Reply to reviews. Holiday hours go in "special hours", the same dates
   as `closed` in site.json.
2. **Google Search Console** (search.google.com/search-console): add a URL-prefix property for the live URL,
   choose "HTML tag", put the code in `site.json` → `verify.google`, build and publish, then press Verify.
   Submit `sitemap.xml`. Bing Webmaster Tools works the same way (`verify.bing`) and can import from Google.
3. **Apple Business Connect** and **Bing Places**, if they want Apple Maps and Bing to match too.
4. Whenever hours or prices change: `site.json` first, then the Google profile.

## Events

One page or section per event with name, date and time, place, price and ticket link, all from `events` in
site.json; `<!-- site:events h3 -->` lists the upcoming ones and the structured data includes each of them, which
is what Google's event results read. Past events drop off at the next build.
