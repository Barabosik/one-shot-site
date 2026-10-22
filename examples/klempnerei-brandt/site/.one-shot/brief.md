# Brief: Klempnerei Brandt

Interview: small business · Bold · colours picked from the mood · Still · goal: call or message · no extras ·
one language, German · business in Germany (`--legal de`).

## 1. Facts only they have

1. Meisterbetrieb. Owner Torsten Brandt, Installateur- und Heizungsbauermeister since 2004 (his master title;
   the founding year of the business is not given, so the site never says "seit 2004" about the firm).
2. Workshop in Leipzig-Gohlis, Lötgasse 41, 04155 Leipzig.
3. Three people: Torsten, Geselle Mehmet Arslan, Auszubildende Lea (no surname given, so none on the site).
4. Two vans: dark blue with yellow lettering.
5. Work: burst pipes, blocked drains, bathroom renovation from planning to finished tiles (with a partner
   tiler), servicing of gas boilers of all the common makes, water meters.
6. Emergency call-outs Mon–Fri 7–20 on the same number. No weekend emergency service.
7. Office hours Mon–Fri 7:00–16:00.
8. Phone 0341 1234 567, email info@klempnerei-brandt.example.
9. Prices incl. VAT: call-out within Leipzig 39 € including the first 15 minutes; working hour 68 € (Geselle),
   84 € (Meister).
10. Area: Leipzig and about 15 km around (Markkleeberg, Taucha, Schkeuditz).
11. Handwerkskammer zu Leipzig, in the Handwerksrolle. USt-IdNr DE123456789.
12. Most customers call from their phone with water on the floor.

## 2. The one job

A Leipzig household with water on the floor (or a cold boiler, or a bathroom to redo) arrives on a phone
wanting someone who will come, and should leave having called 0341 1234 567 (or, if it can wait, written an email).

## 3. The idea sentence

**The side of the dark-blue Brandt van becomes the page: navy paint, yellow lettering, and the phone number big
enough to read from across the street.** The first screen is lettered like the van (name, trade line, number),
and the number is the button. Swap test: another plumber has another van; this layout only makes sense for the
company whose vans already look like this.

## 4. Sections, each with one claim

```
Hero (the van)  Claim: a Meister plumber in Leipzig; call this number now.
                Proof: the number at poster scale (tap to call), "Notdienst Mo–Fr 7–20 Uhr", Meisterbetrieb, Gohlis.
Leistungen      "Vom Rohrbruch bis zur letzten Fliese"
                Claim: emergencies and planned jobs, same small team.
                Proof: the five jobs in plain rows: boilers of all the common makes, the partner tiler named as such.
Preise          "Was es kostet, bevor wir klingeln"
                Claim: the price is known before anyone rings the bell.
                Proof: 39 € / 68 € / 84 €, incl. MwSt., what the 39 € covers. Oversized numbers.
Zeiten          "Werktags bis 20 Uhr, auf derselben Nummer"
                Claim: weekdays 7–20 for emergencies; honest about weekends.
                Proof: hours from site.json, the weekend line, one tip for while you wait (main stopcock).
Wer kommt       "Wer bei Ihnen klingelt"
                Claim: you know who comes and which van to look for.
                Proof: Torsten, Mehmet Arslan, Lea with their roles; the van lettering band.
Einsatzgebiet   "Von Gohlis aus, etwa 15 Kilometer rundum"
                Claim: Leipzig and the towns around, from the Gohlis workshop.
                Proof: a schematic ring (Schkeuditz NW, Taucha NE, Markkleeberg S), the address with a map link.
Footer          The number again as the closing lettering, email, address, Impressum, Datenschutz.
```

## 5. The look

- **Mood:** Bold.
- **Colour:** drenched in bands. The van's dark blue is the ground of the hero, the prices and the footer; the
  bands between are a cool near-white so text reads in daylight on a phone. The one loud colour is the van's
  yellow lettering (traffic yellow, #f7b500): the phone number and the call buttons, nothing else. Ink is
  near-black. *Guess:* the exact van paint and lettering colours aren't known; navy and traffic yellow are
  stand-ins until a van photo exists.
- **Type:** Anybody (variable width) for display: at 150 % wide it is the van's name lettering, at 56 % narrow
  it sets the phone number and the prices at poster size (a 13-character number has to fill a 390 px screen).
  Work Sans for reading. Tried and dropped in the first-screen round: Archivo condensed (A, the safe reading)
  and Big Shoulders + Public Sans (B, uppercase poster).
- **Motion:** Still. No reveals, no movement; instant colour change on hover, a small press, the focus ring.
- **The one bold move:** the phone number, in yellow on navy, set as large as the screen allows, and it is the
  call link. On the phone it fills the width.
- **No photos (and no stock, by request):** type at poster scale carries the page, plus two drawn pieces from
  their world: the lettered van band and the service-area ring.

- **First screen picked: C, the drawn van** (navy body with cab curve, window, yellow stripe, two wheels on a
  road line; name, trade line, number and Notdienst hours lettered on its side). Picked over B (the boldest
  phone screen) because C is the idea itself and still puts the number at 112 px on a phone, one tap to call.
- **Header:** sticky, with "Anrufen" always one tap away. look.mjs reports "covered" for text scrolling under it;
  that is the sticky header doing its job, kept on purpose.

## 6. Genericness test

1. Could the hero belong to another plumber with the name swapped? *No:* it is lettered in their van colours
   and leads with their number and their hours; no wrench icon, no water drop, no "Ihr Partner für…".
2. Hundred-site headings? *No:* every heading states a fact (prices before the bell, until 20:00, who rings).
3. Category colour? Blue is common for plumbing, but this navy is their own van paint and the loud colour is the
   yellow lettering; no water-blue, no waves.
4. A section only because sites have one? *No:* no "Über uns", no FAQ, no testimonials, no stats. Team and area
   exist because the visitor asks "who comes" and "do you come to Taucha".
5. Something to tell a friend? "The site looks like their van, and the number is huge."

## 7. Missing

- Photos and logo: none, no stock. Type-led design, wordmark set in the display face.
- Exact van colours: approximated (see above).
- Handwerksrolle number, Lea's surname: left out.
- Hosting provider for the Datenschutz page and the URL: unknown until publishing (audit runs `--draft`).
- "Message": only email exists (no messenger or SMS given), so the second action is email.
- Impressum: the state where the Meister title was awarded and the chamber's address are not given; left out,
  flagged for the owner.
- *My additions, to check:* the split of the jobs into "Wenn es eilt" (Rohrbruch, Abfluss) and "Mit Termin"
  (Bad, Therme, Wasserzähler); "Außerhalb von Leipzig sagen wir Ihnen die Anfahrt am Telefon" (the 39 € is
  only for Leipzig, the rest isn't given); "Einbau und Wechsel" as the water-meter work; the stopcock tip ("Haupthahn zudrehen") in the hours section is general advice, not
  a fact from the owner.

## Checks, deliberate

- audit "title-case" on "Eine Nummer für Notdienst und Büro": German nouns are capitalised; the heading is in
  sentence case. Not silenced, left as a consider.
- `.one-shot/allow.json` allows `made-up-address`: this is a made-up client for the examples, so its email uses
  the reserved `.example` name on purpose. Street and phone number are made up too (no subscriber number in
  Germany starts with 1). A real client gets real ones.
