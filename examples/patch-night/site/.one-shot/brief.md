# Patch Night: brief

## 1. Facts only they have

1. Patch Night is a modular synthesizer evening; 2027 is the third edition.
2. Run by the Saar Synth Collective, since 2023.
3. Saturday 13 March 2027, 19:00–01:00; the workshop the same day, 16:00–18:00. (Corrected by the collective: the
   material's "14 March" was a typo.)
4. In the Alte Löschhalle, an old fire station: Am Schlauchturm 4, 66111 Saarbrücken (made up, kept exactly).
5. Ines Moro plays slow ambient on a west-coast style modular system.
6. Kofi & the Cables are three people playing techno from patch cables.
7. Dr. Lisa Brandt plays generative pieces from a 1970s modular synthesizer.
8. Open Patch: from 23:00 anyone can plug into the house rack.
9. Workshop "Your first patch", 16:00–18:00, before the doors open: 12 seats, bring headphones, +15 €.
10. Tickets 18 €, students 12 €, by email to tickets@patchnight.example, with your name and how many tickets.
11. The three sets fall between 19:00 and 23:00; their times are not fixed yet.

## 2. The one job

A synth-curious person around Saarbrücken arrives wanting to know what happens on Saturday 13 March and what it costs,
and should leave having emailed tickets@patchnight.example with their name and how many tickets.

## 3. Three ideas, one kept

```
Idea A · The house rack (kept)
  idea:   the house rack becomes the first screen: each act is a module, and the visitor patches the cables
  from:   from 23:00 anyone can plug into the house rack; Kofi & the Cables play techno from patch cables
  move:   object
  bold:   a drawn modular rack across the whole first screen, one module per act plus the mixer; the cables really plug, and with sound on every patched module plays
  line:   Patch Night
  sub:    Four modular synth sets in an old fire station. Saturday 13 March 2027, 19:00–01:00, Saarbrücken.
  action: Email for tickets
  mood:   night
  brand:  #ff5a2e
  fonts:  Chivo, IBM Plex Sans
  tell a friend: "you can plug the cables on their website, and it plays"

Idea B · The call-out board
  idea:   the fire station's call-out board becomes the programme: the whole evening as times on a board
  from:   an old fire station; workshop 16:00, doors 19:00, Open Patch 23:00, close 01:00
  move:   rows
  rows:   16:00 | Workshop: your first patch
          19:00 | Doors, then three live sets
          23:00 | Open Patch: the house rack is yours
          01:00 | Last cable out
  mood:   night
  brand:  #e8382c
  fonts:  Big Shoulders Display, Public Sans
  tell a friend: "it looks like the board in a fire station, with the night's times on it"

Idea C · Patch, literally
  idea:   the name taken literally: one cable plugs PATCH into NIGHT and runs on down the page to the ticket email
  from:   the name; the evening ends with everyone in one rack
  move:   type
  bold:   the two words at poster size, joined by one drawn cable sagging across the screen
  line:   Patch Night
  mood:   night
  brand:  #ffb02e
  fonts:  Sora, Red Hat Text
  tell a friend: "the name is huge, with a cable running between the words"
```

Kept: A. It is the only one where the visitor does what the night is about (plug a cable), it puts all four acts
on the first screen, and it gives the Sound extra a real job. Tests: swap (the modules carry these four acts and
their Open Patch ritual), job (date, price and the email button sit above the rack), phone (five narrow modules
still fit 390 px, the button above them), what we have (drawn, needs no photos). B is the fallback if the person
wants the times first; C if they want it quieter.

## 4. Sections

```
Hero · object        Claim: four modular sets in an old fire station, 13 March.  Proof: the rack (one module per act), date, place, price, email button.
Programme · rows     Claim: three acts, three ways to play a modular.            Proof: Moro, Kofi & the Cables, Brandt, each with what they play; "between 19:00 and 23:00".
Open Patch · band    Claim: from 23:00 the house rack is yours.                  Proof: the accent field, 23:00–01:00, anyone can plug in.
Workshop · split     Claim: your first patch, before the doors open.            Proof: 16:00–18:00, 12 seats, headphones, +15 €; a drawn three-module patch beside it.
The place · one big  Claim: it's an old fire station.                            Proof: "Am Schlauchturm 4" at poster size, Alte Löschhalle, postcode, map link.
Tickets · table      Claim: two prices, one email.                               Proof: 18 €, 12 € students, workshop +15 €; the address; what to write.
Footer               Ends on: "01:00, last cable out", the collective since 2023, the email once more.
```

## 5. The look

- **Mood:** Night.
- **Colour:** quiet, dark. Warm near-black ground (#130e0d), off-white ink, one luminous accent: signal orange
  #ff5a2e, the hot patch cable and the alarm lamp of a fire station. Drenched once: the Open Patch band.
- **Type:** Chivo for display (medium weight; a sturdy grotesque like the legends printed on instrument panels,
  also the module labels in small caps) and IBM Plex Sans for text (instrument manuals and data sheets).
- **Motion:** Showpiece. The authored moment is the rack: the cables drop in and swing, the plugs can be dragged
  from jack to jack, and with Sound on each patched module plays its own voice (slow sines for Moro, a kick for
  Kofi & the Cables, a random sequence for Brandt, a drone for Open Patch), LEDs blink and the mixer's scope draws.
  Elsewhere: the effects addon, sparingly (letters of the h1, the workshop patch drawing itself, the ticket button
  leaning to the mouse). Nothing loops unless the visitor turns Sound on.
- **Bold move:** the rack at full width across the first screen, with real cables.
- **No photos:** the rack drawing carries the page; the workshop gets a drawn patch; the venue is set in type.
- **Sound:** the addon's toggle in the header; its piano bed replaced with the rack's own synth voices, so the
  music is the patch the visitor made.

## 6. Genericness test

1. Hero swap: no, the modules are named for these four acts, and plugging in is their Open Patch.
2. Stock headings: none; each says its claim ("From 23:00 the rack is yours").
3. Category colour: no neon purple-cyan; orange from the cable and the fire station.
4. Sections from habit: no FAQ, no about, no stats; every section holds a fact from the material.
5. Something to tell a friend: yes, the cables plug and the rack plays.
6. Blurred shapes: object, rows, band, split, one big thing, table: no two alike.

## 7. Missing (designed around)

- **Weekday (resolved):** the material said Saturday 14 March 2027, but 14 March 2027 is a Sunday. The collective
  confirmed Saturday 13 March 2027 (the 14th was a typo). The page shows "Saturday, 13 March 2027" through the
  `|day` token (a filter added to site-data.js: the date with its weekday, so the two can't disagree).
- **Set times and order** between 19:00 and 23:00: not fixed. The page says "between 19:00 and 23:00", no order.
- **Payment after the email:** unknown. The page only says what to write; no promise about replies or payment.
- **Workshop booking (guess, to check):** the material gives one email and calls the workshop "+15 €", so the
  page asks to add workshop seats in the same ticket email.
- **Photos:** none; drawn rack and type instead.
- **Legal:** the collective adds its own Impressum before launch; no legal pages built.
- **Placeholder addresses:** tickets@patchnight.example (and any .example URL) are placeholders the collective
  replaces before launch. If the audit flags them, its rule goes in `.one-shot/allow.json` for that reason only.

## Concepts and first screens (what the person saw)

- Concepts sheet (`.one-shot/mockups/concepts.jpg`): A, the house rack, recommended and kept ("the one you'd
  recommend"). It and the first-screen sheets were redrawn after the date fix (the variants from their own commit, in a scratch copy, so the step-4 CSS is exact). The sheet draws an `object` move without an image as a disc with the initial, so the rack itself
  first appeared in the first-screen variants.
- Three first screens, all staging the rack (`.one-shot/variants/`):
  - A · object: name and facts above, the rack across the full width, the button above the rack on phones.
    Picked: the name, the date and the button are read first, then the rack takes the whole width.
  - B · split: the rack standing tall on the right, the name stacked on the left. Strong object, but on desktop the
    date and button drop to the bottom of the screen, and on phones the rack pushes the name down.
  - C · field: the whole first screen in signal orange, the name at poster size, the rack in black panels. The
    loudest, but it turns the Night mood into Bold and the orange cables lose against the orange ground.
  - The look script's `same-variant` warning on B is expected: B differs in layout, weight and case, not in font or
    colour.

## Deliberate exceptions in the checks

- `made-up-address` (allowed in `.one-shot/allow.json`): tickets@patchnight.example is a placeholder the
  collective replaces with the real ticket address before launch. Remove the entry when it is replaced.
- `title-case` (consider, left visible): the h1 is the event's name, "Patch Night", a proper noun. (The audit reads
  it twice, "Patch Night Patch Night", because the letter animation keeps a copy for screen readers.)
- `impressum` and `privacy-page` (consider, left visible): the collective adds its own Impressum and privacy page
  before launch; the page was built without legal pages on purpose. Link both in the footer when they exist.

## Built

- Rack: `src/rack.js` (cables, drag and drop, the four voices); `src/addons/sound.js` keeps the toggle and clicks,
  its piano bed removed (the rack is the music). Tested in Chrome: dragging a plug works with mouse and touch,
  the programme rows light up with the patch, Sound on starts the voices and the scope, no script errors.
- Effects used: `data-split` (h1 letters), `data-draw` (the Open Patch cable, the workshop wires),
  `data-magnetic` (the first ticket button). Sections arrive with `data-reveal`.
