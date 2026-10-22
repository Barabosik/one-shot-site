# Brief: Moth Orchestra, winter tour 2027

## 1. Facts only they have
- Moth Orchestra: a five-piece indie folk band from Norwich.
- The line-up: cello, banjo, two voices, drums.
- Second album "Lamp Hours", out 6 November 2027, on its own album page (music.mothorchestra.example).
- The album cover: a dusty ochre moth on dark bottle green (#b8933a on #1f2d24). No logo.
- Winter tour of 8 nights, 12 November to 4 December 2027, starting at home in Norwich, six days after the album.
- Doors 19:30 every night. Tickets £14, London £16, one ticket page per city.
- The rooms: The Lantern Rooms, Holloway Social Club, The Wee Hall, Copperworks, The Ferry Boat, Bramble Room,
  Pier Street Theatre, The Malt House.
- Every show ends with one unplugged song in the middle of the room.
- Booking and press: booking@mothorchestra.example.

## 2. The one job
A fan (or a friend they're dragging along) arrives wanting to know whether Moth Orchestra play near them and when,
and should leave having bought a ticket for that night.

## 3. The idea sentence
"Lamp Hours" taken literally: the page is a dark bottle-green room lit by one bare bulb, the ochre moth from the
cover circles it, and the eight nights are listed in its light. Swap test: another band's name on a moth-and-lamp
page makes no sense; it only fits the band called Moth with the album called Lamp Hours.

## 4. Sections, each with one claim
```
Hero        Claim: Moth Orchestra are touring Lamp Hours, eight winter nights from 12 Nov.  Proof: the lamp + moth,
            the date range, the eight cities, "Find your night" -> dates. Dates reachable in one tap on a phone.
Dates       Claim: there's a night near you, and the ticket is one tap away.  Proof: 8 rows from site.json: day,
            city, room, price, ticket link. Doors 19:30 every night.
Last song   Claim: every night ends off the stage, one unplugged song in the middle of the room.  Proof: a drawn
            floor plan where the five players walk from the stage into the middle of the crowd.
Lamp Hours  Claim: the songs are from the new album, out 6 Nov, made by five people from Norwich.
            Proof: release date, album link, the line-up as instruments.
Footer      Booking and press email, the ticket action once more, the name big.
```

## 5. The look
- **Mood:** Night, bent toward folk: warm lamplight instead of neon, a serif with some age in it instead of a
  tech sans.
- **Colour:** committed, dark. The ground is the album's bottle green itself (#1f2d24, 28% lightness, a little
  lighter than Night's usual 15-20%, on purpose: it is their cover), deepening to a darker green at the edges of
  the light. Ochre is the one accent: buttons, the moth, the bulb's light. Ink is a warm off-white with a hint
  of ochre, like paper under a lamp. palette.mjs (dark, committed, --ground "#1f2d24") moved the ground to
  17% (#06130b), far from the cover, so the tokens are set by hand and every pair checked (ink 11.4:1, muted
  7.1:1, ochre text 7.0:1, dark ink on ochre button 6.7:1).
- **Type:** Imbue (display): a condensed, high-contrast serif in medium weight, like the lettering on an old
  playbill, big enough to set the name across the whole first screen; heavy weights glare on dark, so 460-480.
  Hanken Grotesk (text): a plain humanist sans with tabular figures for the dates. Fallbacks are metric-matched
  (Times squeezed to Imbue's width, Arial for Hanken) so nothing jumps when the fonts arrive.
- **Motion:** Showpiece. The authored moment: the bulb flickers on, the moth flies round it for two seconds,
  bumps it (the bulb swings), throws a big shadow on the wall, then lands; everything is still within about five
  seconds (WCAG 2.2.2). Move the mouse over the first screen (or tap it on a phone) and it takes off again and
  follows you, as if you were the light. Second, smaller
  moment: the players walking into the middle of the room as that section scrolls in. Everything else is quiet
  (a split headline, rows arriving once). Reduced motion: a still lamp, the moth resting, the band already in
  the middle.
- **The one bold move:** the lamp and moth with the band name at poster scale. No photos, so this drawing
  carries the page.
- **Sound (extra):** off until pressed; a soft generated bed in a low key and quiet clicks.

## 6. Genericness test
1. Could the hero belong to another band? No: moth + lamp is their name and album title.
2. Stock headings? No: headings state the claim ("Eight nights this winter", "The last song is in the middle of
   the room").
3. Category default colour? No: the colours are their cover's.
4. A section because sites have one? No: no about, no FAQ, no news. The line-up rides with the album.
5. Something to describe to a friend? "The moth follows your mouse round the lamp." and "they end every gig in
   the middle of the room".

## 7. Missing (designed around, not asked)
- Photos: none until press photos come. The drawing carries the page; no free photos.
- Band members' names, quotes, reviews, set times, support acts, sold-out status: left out.
- Venue street addresses: city only (each event's address is the city, GB).
- Guess to check: the event time in site.json is doors (19:30); the page labels it as doors.
- Ticket links follow the pattern given: tickets.example/moth-orchestra/<city>.

## First screen
Three variants: A (split, Red Hat Display, the safe reading), B (the poster: the lamp over the name in Imbue at
full width), C (the eight cities as the hero, Young Serif). The person asked for "the most atmospheric one, as
long as the dates are easy to find on a phone": B, with the cities on the first screen as links to their rows,
"Get tickets" visible without scrolling at 390x844, and "Dates" in the header.

## Build notes
- site-data.js (the site's own copy) has two additions: an event with a "city" renders as a tour row (day split
  for the date stub, city, room, price, ticket link with the city in its accessible name; the "name" still goes
  to search engines), and `<!-- site:cities -->` lists the upcoming cities as links to their rows.
- site.json `tour` holds the words the page uses for the whole tour (number of nights, first and last date,
  doors), because they are typed into sentences; change them with the events.
- Audit "consider" left as is: title-case flags "Moth Orchestra" and "Lamp Hours", which are names.
- `.one-shot/allow.json` allows `made-up-address`: this is a fictional client for a test run, and the email,
  album and ticket addresses (`.example`) are exactly the ones the material gave. Remove the entry once the
  real addresses are in site.json.
