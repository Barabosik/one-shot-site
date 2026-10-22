# Layout

## Rhythm

- One spacing system: `--margin` (page edge), `--gap` (inside a section), `--section` (between sections). The
  gap between sections is always clearly bigger than any gap inside one, so the eye sees groups.
- Phone side margin at least 16px; text never touches the edge.
- Squint test: blur your eyes at the sheet. You should see a few big shapes with clear space between them, not
  an even grey texture.
- Vary the rhythm on purpose: a dense section, then an airy one; a full-bleed image, then a narrow column.
  The same layout repeated five times reads as a template.
- Full by default, with one rest. Each section carries its whole content at full size: the full timetable, every
  price with its line, the drawing as big as the focal point. The one rest is a band where the visitor pauses (one
  line at the hero's size across the width, after the hero or before the ending), at most half a screen tall. A
  screen of empty ground reads as unfinished. When you remove something, fill its
  place (refuse.md, "Remove, then fill").
- A section is thin when a desktop screen of it holds a heading and a sentence or two and nothing else. Give it
  its proof at full size (the list, the table, the picture, the numbers), or merge it into its neighbour. A big
  number or word alone is thin too: set what it counts beside it.
- Every item a visitor scans (a dish, a treatment, an app, a song, a service) gets a line on what it is, beside its
  name and price. A name alone is thin.
- The idea serves the content, never takes its screen. No single device (tally marks, a giant cropped number, a
  list of words as the hero) fills a whole phone screen with nothing to read; set it beside the facts it stands
  for, or smaller. Otherwise the site reads as a poster, not the business.

## The first screen

It decides whether anyone scrolls. It must say who/what this is, why it matters, and what to do, without
scrolling, on a phone too (390×844).

Patterns that work (pick from the brief, don't default to the first). The word in brackets is the `move` in
the brief's ideas and in concepts.json:
- **Type-led** (`type`): a huge headline is the hero. Best for Quiet, Bold, Editorial; needs a great line.
- **Image-led** (`photo`): one full-bleed photo with the headline in a calm area or on a band. Needs a great photo.
- **Split** (`split`): text on one side, image or 3D on the other; on phones the image goes above or below, never
  under the text.
- **Field** (`field`): their colour is the whole ground, with the headline and the action on it.
- **Object** (`object`): one thing (the van, the dish, the 3D piece) large in the middle, words around it.
- **Rows** (`rows`): their own list is the first screen: the menu board, the prices, the tour dates.
- **Statement + proof** (`proof`): a short claim and the proof right under it (a number, a live demo, the next
  date).

Rules: one `h1`. One primary action, visible without scrolling, named for what it does. Nav is small and calm.
No carousel. No "scroll down" arrow unless the screen looks finished without it.

**The three first screens** (SKILL.md step 4) use three different patterns from this list: the kept idea staged
three ways (or, when the concepts sheet was skipped, one screen per idea in the brief), so the person chooses
between moves, not between sizes of one layout. The words can stay the same; what the eye lands on first should
not. One of the three is always the classic, done beautifully: a calm ground, one well-set headline, a line, the
action and one large picture (`photo` or `split`); for Quiet and Warm it is the one to recommend unless another
clearly beats it. Three versions of "big headline, line, button" with different fonts is still one option shown
three times. Check
the 390px sheet too, where most visitors meet it: if two of them stack into the same order on a phone
(headline, line, button, picture), give one of them a different first thing there (the picture first, the rows
as the headline, the field of colour).

## The action stays in reach

A business, an event, a freelancer: the visitor came to do one thing (book a class, buy a ticket, call, hire,
order, download). It stays one tap away on every screen, not only in the hero and the footer: a Book button that
stays on screen, so a visitor who decides halfway down can act there.

- Name it for what it does, in the site's language and the same words everywhere: "Book a class", "Tickets",
  "Hire me", "Call the office", "Order beans". It goes where the brief's one job points (`links.booking`, the
  tickets link, `tel:`, the contact section).
- Desktop: the header stays at the top and holds the action as a button at its right end. One line, about 4rem
  tall, the page's ground behind it.
- Phone: a bar fixed to the bottom of the screen, where the thumb is, with the action (and the phone number, for
  a place people call). The header scrolls away there, so the two never take a third of the screen together.
- The page leaves room under its last section for that bar: the body ends with padding as tall as the bar, so at
  the very end the last section, the footer or a form's button sits above it, never under: a waitlist's email
  field hidden by the bar is a form nobody can fill in. look reports it as `under-bar`.
- Where the content has its own actions, put them in it too: "Book" on each price or class, "Tickets" beside
  each date, "Ask about this" under each service.
- A person's page with nothing to book (a writer, a translator): the email in the header is the action.

```html
<nav class="action-bar" aria-label="Book">
  <a class="button" href="{{site.links.booking}}">Book a class</a> <a href="tel:{{site.phone|tel}}">Call</a>
</nav>
```
```css
:root { --bar: 4.75rem; }                            /* in tokens.css: the phone bar's height */
.action-bar { position: fixed; inset: auto 0 0; z-index: 10; display: flex; gap: var(--gap); align-items: center;
  height: calc(var(--bar) + env(safe-area-inset-bottom));
  padding: 0.6rem var(--margin) calc(0.6rem + env(safe-area-inset-bottom)); background: var(--ground);
  box-shadow: 0 -1px 0 var(--line); }
.action-bar .button { flex: 1; text-align: center; }
body { padding-bottom: calc(var(--bar) + env(safe-area-inset-bottom)); }  /* room under the last section */
@media (min-width: 720px) {
  .action-bar { display: none; }                     /* the header's button takes over */
  .site-header { position: sticky; top: 0; z-index: 10; background: var(--ground); }
  body { padding-bottom: 0; }
}
```

## One live thing

Give the visitor one thing that answers them now or lets them try, made from the facts in `site.json`, so it
stays true: hours with today marked, the next class marked, a ticket builder, a playable synth panel.

- **A place with hours:** `<!-- site:open-now -->` set where it's seen, and `<!-- site:hours -->`, which marks
  today's row by itself.
- **Classes, a timetable, tour dates:** the next one marked ("next" from the dates, at build and again in the
  page), each with its Book or Tickets.
- **Prices people add up:** a small calculator from the price list (a driving licence: base fee, lessons, exams;
  a ticket count times the price), with the sum and the button to book or ask.
- **Tickets or kinds of a thing:** a picker (full, student, workshop) with the price shown and the link or email
  filled in for that kind.
- **Sound, an app, a tool:** the thing itself to try: a sound to play (the sound addon), the app on a drawn phone
  that swipes, the command with a copy button.

One only, from the brief's own facts, never a gimmick beside them. It works without JavaScript (the plain list,
prices and dates are there first), with a real button and label, and a change it shows is announced
(`aria-live="polite"`). It goes in the brief's look as "Live: …".

## Sections

- Each section makes one claim (see the brief) and shows proof right next to it.
- Headings name the section plainly, so a visitor finds it at a glance: "Menu", "Hours", "Prices", "The rooms".
  The claim goes in the first sentence under it ("Baked by 7, gone by noon"). A clever heading ("The menu is four
  lines long") reads busy and hides the section; "Our products" names nothing.
- Each section gets its own shape, picked for what it holds, and written in the brief next to its claim:
  - **rows:** a list set in strong type (a menu, services, tour dates), with leaders or prices
  - **table:** hours, prices, anything compared across columns
  - **one big thing:** a number, a word or a drawing at full width, with one line under it
  - **band:** a full-bleed field of colour or a photo, with a short text on it
  - **column:** prose alone in a narrow measure (the story, the about), nothing beside it; on a wide screen the
    column sits in the middle columns, not at the left edge with the right half empty (the text stays left-aligned)
  - **split:** words on one side, the proof on the other
  - **sequence:** steps, a timeline or a route, only when the content is one
  - **objects:** cards, only when the items are separate things

  Neighbouring sections never share a shape. "Heading on the left, text and a box on the right" is one shape
  however it is dressed; used three times, it is the page most generated sites have below the first screen.
  The same goes for the dress: thin rules between lines on the menu, the facts and the hours make three
  sections look like one form. Give one list the rules and set the others differently (big figures, a band).
- Lists of similar things (projects, services, menu items): consistent structure, but not identical cards with an
  icon on top. Prefer rows with real images, or a table, or a list with strong typography.
- Cards only when items are separate objects. Never cards inside cards.
- Testimonials only if real, with name and context. Logos only if real and permitted.
- Contact: the actual email, phone, address or booking link in plain sight, not only a form.

## The footer

A designed ending, not a dumping ground: repeat the main action once, the essentials (contact, address or
socials), and the small print. End on something from the idea: the last line of the board, the tally's total,
the next date, the drawing finished. A huge wordmark across the bottom has become the ending most generated
sites share; use it only when the name itself is the idea.

## Grids and widths

- A 12-column grid (CSS grid, `grid-template-columns: repeat(12, 1fr)`) on desktop is a good default; let text
  sit on 6–7 columns, images break out wider, and give the other columns something (the picture, the facts, the
  proof). Text on 7 columns with 5 empty beside it is a phone layout on a wide screen.
- Use `max-width` on text (`66ch`), not on whole sections, so backgrounds and images can run full width.
- Breakpoints by content, not by device: when the line gets too long or the columns too thin, change. Usually
  one around 720px and one around 1100px is enough. Fluid tokens do the rest.
- Use `svh`/`dvh` for full-height sections (with a `vh` line before it as fallback). Plain `100vh` jumps on phones.

## Images

- Real photos beat illustrations beat icons beat nothing. A business page plans at least four: theirs, free
  photos of the subject, archive pictures of their world (brief.md, "The pictures, planned"). Stock photos only when unavoidable and never of
  people pretending to work. Icons label things; they never show the goods (the brief's picture plan says what
  does).
- Resize with `images.mjs photo` (WebP, 800 and 1600 wide). Always width and height on `<img>`.
  `loading="lazy"` below the first screen; the hero image loads eagerly with `fetchpriority="high"`.
- Crop with intent: `object-fit: cover` plus `object-position` toward the subject.
- Alt text says what the image shows and why it's there; decorative images get `alt=""`.

## Drawn pictures

A drawing stands in for a photo you couldn't find, or shows what a photo can't (a route, a plan, how the app
works); it is never the whole picture plan for a business. When it stands in for a photo, it gets the care a
photo would.

- Draw the real thing from the side where it's recognisable, at its real proportions. A bar stool from the side
  has a seat, legs and a footrest ring; from above it's a dot.
- One style for the whole page: the same point of view, the same line (or none), the same corner radius.
- Two or three tones of each colour (the face, the side in shade, a lighter edge) and the one detail that says
  what it is: the van's sliding door, the cup's rim, the paths between the tea rows. Single flat shapes read as a
  diagram.
- Size it like the focal point it is. On the desktop first screen it takes at least a third of the height or half
  the width, on a phone the full width. A thin strip along the bottom of the screen reads as decoration.
- A wide drawing (the whole counter, a street, a tour map) shrinks on a phone to a strip where each part is a few
  pixels. Give the phone a closer crop as tall as it is wide, on the part that names it (the roaster and three
  stools rather than the whole room). Draw it once, as `<g id="room">` inside the `<defs>` of a zero-size SVG
  (`width="0" height="0"`, not `display: none`, which loses its gradients), and show it twice, each with its own
  `viewBox`: `<svg viewBox="0 0 1200 400"><use href="#room"/></svg>` and a closer one, one hidden per width.
  A `viewBox` can't change in CSS.
- Colour it from the tokens in CSS (`.van-body { fill: var(--brand); }`) or with `currentColor`, so the dark
  scheme and a later colour change reach it. Select its parts by the drawing's own classes (`.van .body`, where
  `.van` is the drawn `<g>`), never by where it sits (`.hero .body`): a `<use>` copy only matches selectors
  inside what it copies, and turns black. `aria-hidden="true"` when the words already say what it shows.
- Check it on the sheet at a glance: if it reads as dots or boxes, add the detail that names it, or draw a closer
  view (the counter with three stools rather than six dots).

## Phones first

Look at the 390px sheet before the desktop one. Common faults it shows: headlines broken one word per line (lower
the size), side-by-side layouts squeezed (stack them), tap targets under 44px, a sticky header eating a third of
the screen, horizontal scrolling from a wide element (the look script names it). And the idea itself: when the
device that carries it (the dotted leaders of a contents page, the stamps on a card, the route on a map) is hidden
on a phone to save room, the phone gets the plain page. Give the device a phone form instead of dropping it.

Then the desktop sheet, for the opposite fault: a page built for the phone and stretched. The focal point should
grow with the screen. A phone-sized drawing in the middle of a wide screen, or a column of small text with half
the screen empty beside it, looks unfinished. Let the focal point take the width, or set the proof beside the words.

Go through the 1440px sheet screen by screen, to the last one. Cover the left half of each screen: if the right
half is empty ground (not a photo, a drawn field or the focal point), that section isn't finished.

- A section of words only: put what answers it on the other side (the hours beside the heading, the address
  beside the email, the price board beside the promise), or centre its column. Wide margins on both sides read
  as typography; one empty side reads as unfinished.
- Rows across the width (a name, a line, a price or a small drawing): a `1fr auto` row at 1440px leaves the ends
  stranded with 800px of nothing between them. Cap the rows' width with the text, or give the middle something to
  hold (the description, the drawing at row height).
- Drawings and numbers grow with the screen: size them in `vw` with a floor and a ceiling
  (`width: clamp(16rem, 30vw, 34rem)`), never a fixed `15rem` that is half the phone and a sixth of the desktop.
- The ending is where this happens most. The contact, the closing line and the footer together make the last
  screens: set them side by side in one or two full bands (the email large on one side, the address and hours on
  the other), with no padding band taller than a quarter of the screen holding nothing. A closing line on its own
  is set across the width at the hero's size, or beside the facts; at half the width it reads as a leftover. The
  last screen of the desktop sheet should look as finished as the first.
