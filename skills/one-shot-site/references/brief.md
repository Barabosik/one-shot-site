# The brief

Write the brief before any code. It's the difference between a site that could only be this person's and a
template. Save it as `.one-shot/brief.md` and keep it short: one screen. It stays on this machine: the
starter keeps `.one-shot/` out of git, so guesses and private notes don't go public with the site.

## 1. Facts only they have

List 8 to 12 concrete things that are true of this person or business and of no one else. Get them from the
interview and the material. Good facts are specific and checkable:

- "bakes in a 1950s stone oven in the back of the shop" and not "passionate about baking"
- "built the bus timetable app the whole town checks at the stop" and not "skilled developer"
- "open from 7, closed Mondays, two streets from the station" and not "convenient location"

If you can't find eight, ask for the missing ones, all in one message. These facts become the headings, the
images and the details that make the site feel owned.

## 2. The one job

One sentence: *A [visitor] arrives wanting [need], and should leave having [action].*
Example: "A hiring manager arrives wanting proof that this developer ships, and should leave having emailed them."
Every section has to help this job or go.

## 3. Three ideas, one kept

The idea is what the page is built around, taken from their world: *"[something from their world] becomes [what
the first screen and the page are built around]."* Often the strongest one is their own content at its best: the
whole menu set as well as a good printed menu, the room in one large photo, the week's classes as a timetable read
at a glance. Don't stop at the first one. Write three, each from a different fact in section 1, then keep the
strongest. One of the three is always **the classic, done beautifully**: a calm ground, one well-set headline, a
line, the action and one large picture of their best thing (move `photo` or `split`). It is what most calm briefs
want, so it is never left out to look different.

Where ideas come from (each of these made a page in testing that only that client could have):
- **Their own content, at its best:** the menu, the prices, the timetable set so well they're the reason to stay;
  the room, the dish or the work in one large photo.
- **Something they own or use:** the van with the number on its side, the blackboard upstairs, the oven.
- **Something they counted:** 2,140 food parcels drawn as tally marks; eight seats drawn as eight stools.
- **A ritual:** a child's first visit is counting teeth; every gig ends with one song in the middle of the room.
- **A document from their work:** the dental chart, the sign-out sheet, the menu board, the tool's own output.
- **The place:** the harbour, the shop window, the route up the climbing wall.

"Clean and modern", or a colour or a font alone, is not an idea. Neither is a device no visitor can see, or a trick
played on the letters.

**The name and the headline stay whole.** The name and the `h1` are never mirrored, reflected, flipped, cropped,
split, rotated, cut off at an edge or set as a sign or stamp: they're set straight, in the display face, and read
in one go. The `h1` says what this is, never a status ("Closed", "Open now"); the open-now line sits beside it or
under it.

Write each idea as a block. The keys are the ones `mockup.mjs --concepts` reads, so each block copies straight
into `.one-shot/concepts.json` (see iterate.md, "The whole page"); `from` and `tell a friend` stay in the brief:

```
Idea A · The van (kept)
  idea:   their dark blue van, photographed, with the number beside it in the van's yellow
  from:   two vans, dark blue with yellow lettering; people call with water on the floor
  move:   split
  bold:   the van photo filling half the screen, the number set large beside it
  line:   Burst pipe? Call 0341 1234 567
  mood:   bold
  brand:  #f7b500
  ground: #16264a
  fonts:  Anybody, Work Sans
  tell a friend: "a big photo of their van, and the number right there"

Idea B · Prices before the bell
  idea:   the price list is the first screen, at poster size
  from:   call-out 39 € with the first 15 minutes; 68 € and 84 € an hour
  move:   proof
  proof:  39 € | call-out in Leipzig, first 15 minutes included
          68 € | an hour, journeyman
  …
```

`move` is one of the first-screen patterns in [layout.md](layout.md): `type`, `photo`, `split`, `field`,
`object`, `rows`, `proof`. Three ideas with the same move are one idea three times. `bold` names the focal point: the one thing the eye
lands on first (the photo, the headline or the list). `rows` needs their list
(`rows: Espresso | 2,40 €`), `proof` their numbers, both from the facts. A product's own output (what a command
prints, a screen of the app) may be drawn as an example in the shape the material describes: captioned as an
example on the page and marked GUESS in the brief, for the person to swap for a real one. `brand` and `ground`
are colours (`#rrggbb`), `fonts` are Fontsource names, display face first, then the text face (a third sets the
rows alone, and only for real code, such as what a command prints, in a mono; never prices, hours or labels), and `line` is
that idea's own headline. An `object` idea keeps its picture's own shape; `shape: circle` crops it round. A
`type` idea sets the line as big as the screen; `size: small` makes it a quiet title page.

Test each one:
1. **Swap:** put a competitor's name on it. If it still fits, it's too generic.
2. **The job:** does it bring the main action closer (the number, the dates, the booking)? An idea that hides the
   job loses, however good it looks.
3. **The phone:** does it still work 390 px wide, with the action on the first screen?
4. **What you have:** can it be made from the facts and pictures you have now? (One that needs photos still to
   come waits.)
5. **The mood:** is its `mood` the one they picked, with their colour leading? Three ways to be quiet, never one
   quiet and two loud.

Keep the one that passes all five and serves the one job best, mark it "kept" (`"recommended": true` in
concepts.json), and say why in one line. For Quiet and Warm the classic is kept unless another clearly does the
job better, and between two that do it as well, keep the calmer. The other two stay in the brief: when the person says "another idea",
"something bolder" or "I don't like it", start from them before nudging the kept one. A quiet site can keep a
small idea ("the work is shown at full width, nothing else competes"), but it keeps one.

## 4. Sections, each with one claim

For each section: a working heading, its shape, the claim it makes, and the proof.

```
Hero · band       Claim: Rosa bakes sourdough the slow way, every morning.  Proof: the loaf photo, the open-now line.
Bread · rows      Claim: four breads, made the same way since 2009.         Proof: the four, with prices.
The oven · split  Claim: the oven is why it tastes like this.               Proof: oven photo, two sentences.
Visit · table     Claim: easy to find, open early.                          Proof: map link, hours, address.
Footer            Ends on: the oven's door, closed, and the open-now line under it.
```

Before the list, write what a visitor came to find and to do, in their words ("what does it cost?", "when is the
next class?", "how do I book?"), and give each a section that holds the whole answer. A striking page that
leaves an answer out is a sparse page, however good it looks. What a full page carries:
- **Café, bakery, shop, restaurant:** everything on offer, each with a line on what it is and its price; the
  week's hours with today marked, and the open-now line; where, with a route link; how to order or reserve;
  the special thing shown (the roast day, the oven); pictures of the goods and the place.
- **Studio, practice, school, trade:** each class, treatment or service in a line or two, who it's for and who
  does it; the timetable with dates and the next one marked; the prices as a table, each with its own Book; the
  first visit in three steps (how to book, what to bring, what happens); the team, a picture and a line each;
  where.
- **Event, band:** date, time, place and price on the first screen, set like a poster: big enough to read across a
  room; each act with a picture, a line and, for music, a sound; the running order of the night; a ticket picker
  (each kind with its price and a button); getting there, and what to know (age, access, cloakroom).
- **Charity, club, food bank: two audiences** (people who come for help and people who help; members and
  newcomers): both on the first screen, as two cards side by side, each with who it's for, the hours, the
  address and what to bring or what's needed, and its own action. Then a section for each.
- **Portfolio, freelancer:** the work itself, each project with a picture of it (a screenshot, or the app drawn on
  a phone in its own colours), what it did, its numbers; what you do for clients; how working together goes, in
  steps; about; the hire action.
- **Software:** what it does, shown (a terminal, a screen, a before and after); install in one line; three to
  five features, each with an example; docs, changes, licence; download.

Full means everything they gave, never more. A list, a time, a price, a name or a song they didn't give stays out,
or goes under "Missing" (section 7), however thin the page looks: a made-up tracklist or door time is worse than a
shorter page.

A section without a claim gets cut. Two sections with the same claim get merged. A one-page site for a business
or an event usually needs seven to ten sections; fewer only when there is less to say (a person's page), never
because the idea is strong. The shapes come from [layout.md](layout.md) (rows, table, one big thing, band,
column, split, sequence, objects); no two neighbours share one. The footer line says what the page ends on.

## 5. The look

- **Mood:** from the interview (see [looks.md](looks.md)).
- **Colour strategy:** quiet (colour only on actions), committed (the ground carries a tint), or drenched
  (the colour is the ground). Plus light or dark. Choose from who visits and where. A café menu read on phones in
  daylight is light; a synth musician's page is dark.
- **Type roles:** a display face and a text face (or one family doing both), named, with why they fit the subject.
- **Motion level:** Still / Gentle / Lively / Showpiece, and the one moment that gets the most motion.
- **The one focal point:** what the eye lands on first, from the kept idea: the photo, the headline or the list
  (a colour field, the drawn object or the 3D piece when the idea needs one). Only one, sized for the mood: on a
  Quiet page it can be a well-set headline and one large photo. Everything else supports it.
- **Live:** the one thing a visitor can try, or that answers them now, made from the facts ([layout.md](layout.md),
  "One live thing"): "open-now big over the week's hours, today marked", "a lesson calculator from the prices".
- **The action:** its words and where it stays in reach ("Book a class": the header on desktop, the bottom bar
  on phones, and on each class).
- **The pictures, planned:** at least four real pictures for a business, an event or a place, each with the
  section it goes in, what it shows and where it comes from, in this order: their own (the best, even from a
  phone); free photos of the subject in general (`photos.mjs`: the bread, the street, the tools, never posing as
  their own place, people or work); archive pictures of their world (an old postcard of the street, a map of the
  town, an engraving of the craft), credited. Every photo shows their real subject: their place, street, town,
  trade or goods. A pretty photo of somewhere else (another town, a famous landscape) never counts toward the
  four, and stays out. A drawing (an SVG of the subject in its own colours, at full size:
  the loaf with its crust, the app on a phone) stands in for a picture you couldn't find, and is never the whole
  plan for a business. Night and Bold pages, and Lively ones, get one mood picture on the first screen (the stage
  in its light, the street at night). When the photo services are down, draw now, say so in your next message,
  and run `photos.mjs` again before the audit. A layout planned
  around pictures never ships without them, and line icons never stand in for the goods: a bakery that shows its
  breads as line icons shows a visitor no bread.
- **No pictures at all** (they said no to photos)? Then the four don't apply, and no photo comes in by another
  door: drawings of their own subject, the type and their own lists carry the page (the headline set large, the
  lists set beautifully), with one piece of atmosphere (their colour as a field, a drawn scene of their world).
  Write `"photos": false` in site.json, so the audit knows (facts.md).

If they liked a site, add a line to the look: "From <site>: <the feel they liked, as measured in study.md>".
That feel is part of what they asked for, so it shows at a glance: its light or dark, its type weight, its
density (a calm, dark, thin-type site they liked means a dark ground and light type here too). Its words, logo,
pictures and layout never come along; the rest of the look is still about this client.

## 6. Genericness test

Before building, answer honestly, and revise the brief for any "yes":

1. Could this hero belong to a different business of the same kind if you swapped the name? 
2. Is any heading a phrase you've seen on a hundred sites ("Welcome to…", "Our story", "Why choose us")? Plain
   names ("Menu", "Hours", "Prices") are signposts, not phrases: keep them.
3. Is the accent the default hue of its category (blue for tech, green for eco, purple for "AI")? The ground isn't
   part of this: warm white and cream are where a calm page starts.
4. Does any section exist because "sites usually have one" rather than because of a claim?
5. Is there nothing on the page a visitor could describe to a friend afterwards? Their best photo set large, or a
   menu they'd read across the counter, counts; a trick played on the name or the headline doesn't.
6. Blur the words: would the sections below the first screen look alike? (Then give them different shapes.)
7. Would a visitor find it thin? Take the list of what they came for (section 4): is any of it missing, or
   answered by a sentence where they wanted the list, the price, the picture? Can they act from every screen?
8. Does the feel they chose show at a glance? A Warm brief that comes out in cool colours, or a "like that site"
   that misses its light or dark and its type weight, fails the brief however good the idea is.

## 7. Missing

List what you still need from the person (photos, prices, the email…), and what you'll do if it doesn't come
(e.g. "no oven photo: a free photo of a stone oven, else the oven drawn at full width"; never an empty band
where a picture would go).
