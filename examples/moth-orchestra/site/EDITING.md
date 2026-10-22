# Changing the Moth Orchestra site

The site is plain HTML, CSS and a little JavaScript, built with Vite. Everything that changes (dates, rooms,
prices, ticket links, the album date, the email) lives in one file: `site.json`. Change it there and the page,
the date list and the data search engines read all change together.

## What's in site.json

| Field | What it is |
|---|---|
| `name` | The band's name, as it appears on the page. |
| `description` | One or two sentences about the band, for search engines. |
| `email` | Booking and press address, shown in the footer. |
| `currency` | `GBP`, so prices show as £. |
| `album.title`, `album.out`, `album.link` | The album, its release date as written on the page ("6 November 2027") and its album page. |
| `tour.nights` | How many nights, as a word ("eight"). Used in the first screen and the dates heading. |
| `tour.from`, `tour.to` | First and last date as written in sentences ("12 November", "4 December 2027"). |
| `tour.doors` | Doors time, the same every night ("19:30"). |
| `events` | One entry per night (see below). Nights that have passed drop off the list at the next build. |
| `links.music` | The band's music page; search engines read it as the band's profile. |
| `labels.tickets` | The word on each ticket button ("Tickets"). |
| `url` | The site's address. Empty until it is published (`set-url.mjs` fills it in). |

Each night in `events`:

```json
{ "name": "Moth Orchestra in Leeds", "city": "Leeds", "place": "Holloway Social Club",
  "address": { "city": "Leeds", "country": "GB" }, "start": "2027-11-14T19:30", "price": "14",
  "tickets": "https://tickets.example/moth-orchestra/leeds", "description": "Lamp Hours tour. Doors 19:30." }
```

- `city` is the big word in the row, `place` the room under it, `price` in pounds without the £.
- `start` is the date and doors time, year-month-day then the time. The weekday is worked out from it.
- `name` is what search engines show for the event.
- Adding or removing a night? Also check `tour.nights`, `tour.from` and `tour.to`, which are written into
  sentences.
- When the tour is over the list is empty: ask for the page to be changed then (next tour, or the album).

## Asking for changes

Any coding agent with the one-shot-site skill can do it. Say for example:

- "Use one-shot-site to add a second London night on 22 November at Bramble Room, £16."
- "Use one-shot-site to move the Bristol night to Thursday 19 November."
- "Use one-shot-site to add the press photos to the site."

## Building and publishing

```
npm install        # once
npm run build      # makes the finished site in dist/
npm run audit      # checks it before it goes out
```

The site isn't published yet. Once it has a home (GitHub Pages, Netlify, Vercel, Cloudflare or your own domain),
the exact publish command goes here and in `.one-shot/brief.md` under "Published".
