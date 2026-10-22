# Fahrrad Hollerbach: brief (redesign)

Redesign of their site from about 2008 (last touched 2017), read with redesign.mjs into `.one-shot/redesign/`.
Interview (redesign route): feel "not sure, show me" (answered by the three concepts), colours "keep our green
and yellow", motion Gentle. A made-up client for this run: the street, the people, the phone number and the
`.example` email are invented.

## 1. Facts only they have

1. A family workshop in the same street since 1958: Josef Hollerbach opened it for bikes and mopeds, his son
   Werner took over in 1994, grandson Markus (Zweiradmechanikermeister) has run it since 2012.
2. Speichengasse 7, 54290 Trier. Ten minutes on foot from the Hauptbahnhof, customer parking in the yard.
3. Every wheel is still trued by hand.
4. No appointment: bring the bike in during opening hours. Small jobs (a tube, a brake) often while you wait;
   most repairs within two days.
5. Their price list: inspection 49 €, tube changed incl. tube 12,50 €, tyre fitted 8 € plus tyre, brakes or gears
   set 15 € each, chain changed 10 € plus chain, wheel trued from 12 €, e-bike inspection 69 €. Prices incl. VAT,
   parts extra. (Old list from March 2015: to be confirmed.)
6. E-bike workshop since 2016: motors and batteries of the common systems.
7. Used bikes from trade-ins, checked in the workshop, six months' warranty. Old bikes taken in part exchange.
8. Rental bikes: 10 € a day, 45 € a week.
9. New bikes: city, trekking, children's bikes and e-bikes, with a test ride.
10. Three people in the workshop.
11. Hours: Mon, Tue, Thu, Fri 9:00–12:30 and 14:00–18:30, Wed 9:00–12:30, Sat 9:00–13:00 (the home page said
    14:00: asked, the contact page is right). Closed Sundays and holidays.

## 2. The one job

A Trier cyclist with a broken bike arrives wanting to know whether Hollerbach can fix it soon and what it costs,
and should leave having wheeled it over (or called).

## 3. Three ideas, one kept

Idea A · Der Reparaturzettel (kept)
  idea:   the repair tag that hangs on every bike in the workshop becomes the page: a job, a price, when it's ready
  from:   their price list (section 1, fact 5) and "no appointment, most jobs in two days" (fact 4)
  move:   rows
  bold:   the price tag, set big, is the first screen
  line:   Was kostet's?
  rows:   Schlauch wechseln | 12,50 € · Bremsen einstellen | 15 € · Inspektion | 49 € · E-Bike-Inspektion | 69 €
  mood:   bold
  brand:  #2e5c2e
  ground: #f6f1df
  fonts:  Saira Stencil One, Public Sans
  tell a friend: "their site is a big repair tag with the prices on it"

Idea B · Seit 1958
  idea:   three generations in one street: the page reads like the shop's own logbook, Josef to Werner to Markus
  from:   fact 1, the family since 1958
  move:   proof
  proof:  1958 | Josef eröffnet die Werkstatt · 1994 | Werner übernimmt · 2012 | Markus, Zweiradmechanikermeister
  mood:   editorial
  brand:  #2e5c2e
  fonts:  Bree Serif, Karla

Idea C · Von Hand zentriert
  idea:   one wheel, trued by hand, sits in the middle of the page: the care is the message
  from:   fact 3, every wheel trued by hand, and their own photo of it (redesign/img/zentrieren.jpg)
  move:   object
  mood:   quiet
  brand:  #d9a400
  fonts:  Chivo, IBM Plex Sans

Kept A: it passes all four tests, and the prices and the phone are on the first screen, on a phone too. B carries
the family but puts the job a scroll away; C says the least about what a repair costs. The concepts sheet
(`mockups/concepts.jpg`) showed all three, A first.

## 4. Sections

```
Hero · rows        Claim: we fix your bike, here is what it costs.       Proof: four prices on the tag, "ohne Termin".
Werkstatt · table  Claim: honest prices, no appointment needed.          Proof: the full list, "parts extra", while-you-wait jobs.
Räder · objects    Claim: new, used or for a week.                        Proof: three tags: new (test ride), used (6 months), rental (10 €/45 €).
Familie · split    Claim: three generations in one street.                Proof: 1958 · 1994 · 2012, the old workshop photo, the hand-trued wheel.
Besuch · table     Claim: easy to find, open six days.                    Proof: hours, address, phone, map link, parking in the yard.
Footer             Ends on: a last tag, "Fertig. Abholbereit ab 9 Uhr."
```

Old pages to sections: werkstatt.html → #werkstatt, fahrraeder.html → #raeder, ueber-uns.html → #familie,
kontakt.html → #besuch, impressum.html → impressum.html. aktuelles.html goes: its news is from 2016 and 2017
(an offer that ended, a holiday that's over); the one lasting item (e-bike workshop since 2016) moves into
Werkstatt. The contact form goes: their visitors call or come by, and a form needs a service; the email stays.

## 5. The look

- Concepts shown (mockup.mjs --concepts): A "Der Reparaturzettel" (rows, Bold), B "Seit 1958" (proof,
  Editorial), C "Von Hand zentriert" (object, Quiet). Picked: A.
- Mood: Bold, toward a workshop: stencil and condensed letters like crates and workshop signs.
- Colour strategy: committed, light. Their green (#2e5c2e) as the brand, their yellow as the tag colour on one
  thing per screen. People in Trier know the shop by green and yellow.
- Type: display Saira Stencil One (workshop stencils, crates), text Public Sans (sober, wide language support).
- Motion: Gentle. The one moment: the tags settle in as you scroll, a small swing like a tag on a handlebar.
- The one bold move: the price tag, set big, is the first screen.

## 6. Genericness test

1. Another bike shop's hero? The tag holds their own prices and "seit 1958": no.
2. Stock headings? "Was kostet's?", "Drei Generationen, eine Straße": no "Willkommen", no "Über uns".
3. Category default colour? Green is common for bikes, but it's theirs and known; kept on purpose.
4. A section because sites have one? News went; the form went.
5. Something to tell a friend: "their site is a big repair tag with the prices on it".
6. Neighbours share a shape? rows, table, objects, split, table: two tables, not neighbours.

## 7. Missing

- Their own photos are few and small; three are usable (the truing stand, a bike, the spoke key). No team photo:
  the family section leads with the dates set big, the old workshop photo small.
- Current prices (the list says March 2015) and Saturday hours: asked; until confirmed, the prices are marked
  for checking.

## Allowed on purpose

- `made-up-address`: a made-up client for a test run, so the email uses the reserved `.example` name.
