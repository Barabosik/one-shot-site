# Type and colour

## Type: the numbers

- **Body:** 16–20px on a phone, 18–20px on a desktop (the token `--step-0` is fluid 16.8–19.2px: never set running
  text below it). Line height 1.45–1.65. On a 1440px screen, 15px text looks tiny.
- **Measure:** 55–75 characters per line for paragraphs (`max-width: 66ch`). Headlines: 10–20 characters per line
  at their biggest.
- **Headlines:** at most two lines on desktop, three on phones. Line height 0.9–1.1. Tracking -0.01 to -0.04em
  for big sizes, never tighter than -0.05em. Use `text-wrap: balance`.
- **Hierarchy:** three or four visible sizes on a page. Neighbouring steps differ by at least 1.25×; the hero
  headline is at least 4× body on the desktop. If two sizes look almost the same, merge them. Where the brief wants
  presence (Bold, a band, a launch), it carries past the hero: section headings at 2× body or more on the desktop,
  and body never below `--step-0` (about 19px there), never big type on the first screen and quiet small text in
  wide space after it.
- **Weights:** two per family is usually enough (regular + one heavier). Don't fake bold or italic.
- **Space around headings:** more above than below, so a heading belongs to what follows.
- **Small text** (captions, meta, `--step--1`, 14–15px) still meets 4.5:1 contrast and is at least 14px on a phone
  and 15px on a desktop. More than a line of it is body text (look calls it `small-body`), and so is anything a
  visitor came for: a price's note, a timetable's day, the hours, an address. Set those at body size.
- **Numbers:** `font-variant-numeric: tabular-nums` in tables, prices, dates and counters.
- **Real punctuation:** curly quotes “ ” ‘ ’, apostrophes ’, en dash for ranges (9–5), ellipsis …, non-breaking
  space between number and unit (12&nbsp;km).

## Choosing fonts

1. Start from the mood's systems in [looks.md](looks.md): each is a headline face and weight, a text face, and
   the headline's size, leading and tracking, set to work together. Pick the one that suits the subject (a book
   serif for a bookshop café, a sturdy slab for a bakery), and take another when the concepts sheet says it
   repeats a recent site.
2. Set it as written, then bend it a little toward the subject within the numbers above. Big type in a regular or
   medium weight reads calm and expensive; heavy weights are for Bold and Playful.
3. Check it has the characters you need (accents in names, €, the languages of the site).
4. Five faces are spent as the only face of a page: Inter, Roboto, Poppins, Montserrat, Open Sans *(lint:
   `overused-font`)*. They're good fonts, and alone they make a page look like a thousand others. A serif
   headline is welcome for Quiet, Warm and Editorial: on its own it isn't the generated look (that is the trio in
   looks.md, Warm).
5. Facts are set in the text face with a plain zero: hours, prices, dates, phone numbers. Never a code face, a
   face that slashes or dots its zero (most mono faces, Atkinson Hyperlegible) or `slashed-zero` there *(lint:
   `slashed-zero`)*: a slashed zero turns a café's hours into a terminal.
6. Load at most what you use: a variable font is one file for all weights; for static fonts import only the
   weights you need (`@fontsource/bree-serif/400.css`).
7. If the text jumps when the font arrives (`film.mjs` reports `layout-shift`), give the fallback the font's
   width: `@font-face { font-family: 'Imbue fallback'; src: local('Times New Roman'); size-adjust: 82%; }`, then
   `--font-display: 'Imbue Variable', 'Imbue fallback', serif`. Change the percentage until the film is clean.

### When the person asks for character

The systems are the default. Faces with a strong voice (sign-painter, stencil, rounded, hand-lettered, cockpit
display) are for when the person asks for character, or when the subject has letters a visitor would know (the
shop's painted sign, the band's record sleeve), and then for the headline only: the facts stay in a calm text
face. Playful keeps its chunky faces (looks.md). Start from the subject: what letters would its places have?

| The subject's own letters | Display | Text |
|---|---|---|
| Shop signs, painted windows, enamel plates | Caprasimo *static*, Calistoga *static*, Bree Serif *static* | Karla, Work Sans |
| Old books, printed menus, jar labels, notices | Alegreya, Vollkorn, Brygada 1918, Petrona | Alegreya Sans *static*, Source Serif 4 |
| Vans, crates, stencils, workshop signs | Big Shoulders Stencil Display, Saira Stencil One *static*, Anybody or Archivo (width axis) | Work Sans, Public Sans |
| Drawings, instruments, tickets, timetables | Chivo, B612 *static* (made for cockpit displays), Red Hat Mono (labels only) | Red Hat Text, Public Sans |
| Handwriting: notes, chalk, children's drawings | Gaegu *static*, Patrick Hand *static*, Kalam *static* (a line or two, never body) | Nunito, Lexend |
| Soft and round: toys, sweets, care | Gluten, DynaPuff, Varela Round *static*, M PLUS Rounded 1c *static* | Nunito, Lexend |
| Japanese and East Asian craft | Shippori Mincho *static*, Zen Old Mincho *static* | Zen Kaku Gothic New *static* |
| Posters, transport, town signs | Familjen Grotesk, Barlow *static* (after California's road signs), Bricolage Grotesque | Public Sans, Barlow *static* |
| Clinics, public services, forms | Radio Canada | Radio Canada; Atkinson Hyperlegible Next in form fields only (its zero is slashed: never for times or prices) |
| Newspapers, magazines | Old Standard TT *static*, Source Serif 4, Libre Caslon Text *static*, Spectral *static* | Source Serif 4, Libre Franklin |

Packages: `@fontsource-variable/<name>`, or `@fontsource/<name>` for the ones marked *static* (names in
lower case with dashes: `@fontsource/m-plus-rounded-1c`). A subject can sit in two rows; pick the row a visitor
would recognise. Japanese families (Shippori Mincho, Zen Kaku Gothic New, M PLUS) carry thousands of glyphs: for
a page in a Latin script, import the Latin file of each weight only (`import '@fontsource/shippori-mincho/latin-500.css';`).

```js
// src/main.js
import '@fontsource-variable/archivo';
import '@fontsource-variable/public-sans';
```
```css
/* src/tokens.css */
--font-display: 'Archivo Variable', 'Arial Narrow', sans-serif;
--font-text: 'Public Sans Variable', system-ui, sans-serif;
```

## Colour: strategy first, then hues

Decide how much colour the page carries before picking a single hue:

| Strategy | What it means | Good for |
|---|---|---|
| Quiet | near-neutral ground and ink; the colour appears on actions and one or two details | portfolios, studios, anything where photos carry the colour |
| Committed | a cream or tinted ground; the accent stays small (about a tenth of any screen), and the colour may fill one or two whole sections as a field, never slabs everywhere | warm and friendly sites, brands with a known colour |
| Drenched | the colour is the background of whole sections or the whole page | bold launches, events, posters, playful brands |

Then the brand colour:
- From the person: logo, sign, packaging, uniform, the colour they already use (`palette.mjs --logo`). The colour
  they give stays the brand: after the ground, it's the colour a visitor sees most (the actions, the focal point, a
  field). A colour from the idea (the night's red for an app that works at night) can be a second accent, never
  take over: an app whose own colour is barely used no longer looks like theirs.
- Two brand colours (a dark blue van with yellow lettering): one is the brand (`--brand`, for buttons and links),
  the other the ground (`--ground "#16264a"`). The site still has one accent.
- From the subject: the bakery's crust, the climbing gym's chalk-and-rubber, the forest for a hiking guide, the
  felt of a pool table. Be literal first, then adjust.
- For the accent, not the category's default hue (blue tech, green eco, purple "AI", gold luxury) unless the person
  asks. That test is for the accent only: a white or cream ground is never a default to avoid.

`palette.mjs` builds the rest from that one colour and checks every text pair:

```
node SKILL_DIR/scripts/palette.mjs --brand "#2f6f4e" --mood warm
```

It prints `--ground`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-ink` (text on the
accent) and `--accent-text` (the accent dark or light enough for links on the ground). Use `--accent-text` for
coloured text, never `--accent`, which is tuned for fills.

A light page starts calm: warm white for Quiet, cream for Warm and Editorial (`--mood quiet`, `--mood warm`,
`--mood editorial`; new-site takes the same flag), with the brand colour on the actions and links, not on the
ground. A ground in the brand's own hue (`--ground brand`) or another tone (`--ground cool` for stone and snow,
`--ground neutral`, or any colour: `--ground "#e3ebdd"`, a pale tea green) only when the person picks one, or a
palette that has one. A Warm site keeps a warm ground: from the subject when its colour is in the warm half of the
wheel (the clay's pink, the oven's brick, honey, oatmeal), else cream. A cool subject colour (the tea's green, the
van's blue) is the accent on that warm ground, never the ground under a cool accent: a Warm site in sage and red,
or blue on kraft, reads as cold. Warm white and cream are never defaults to avoid; what's spent is the trio of
cream, a soft serif with an italic word and a terracotta pill, all together (looks.md, Warm). Comparing colours:
`--brand "#a,#b,#c" --sheet DIR` draws them side by side with the same strategy and ground.

## Colour rules

- Body text in full `--ink`. Grey body text looks refined in a mockup and reads badly on a phone in the sun.
- One accent. A second colour only when the mood calls for it (Playful), and then checked with palette.mjs too.
- Mix two colours in `oklab`: `color-mix(in oklab, var(--wood), var(--sky) 40%)` goes straight from one to the
  other. `in oklch` goes round the colour wheel and can pass through a hue neither has (wood and sky give
  lavender).
- Text on photos needs a scrim (a gradient or a solid band) or a placement over a calm area. The checks can't
  measure it, so look at the screenshots.
- Dark mode is its own palette (`--mode dark`), not inverted colours. Ground around 15–20% lightness, never
  pure black. Ink around 90%, never pure white.
- Theme the browser's own bits with the palette: `::selection`, `:focus-visible` outline, `caret-color`,
  `accent-color` for checkboxes, `scrollbar-color`, `<meta name="theme-color">`. base.css does most of it.
  With `--theme`, new-site sets `theme-color` to the page's ground on the home page and the legal pages alike; give
  a page you add the same one.
