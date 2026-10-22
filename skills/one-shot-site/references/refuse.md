# What makes a page look generated

Each of these alone is forgivable. Three together and visitors feel it, even if they can't say why. lint catches
the ones marked *(lint)* in the source, look the ones marked *(look)* in the page, by the rule it names; the rest
you catch by looking. When a site the person likes has some of them, keep what they said they like about it (the
calm, the big type) and leave the habits out; the brief says which.

## Layout and components

- A small label above every heading (an "eyebrow" or "kicker"), or small capitals over every block (BOOK,
  OPENING HOURS, FIND US) *(lint, by class name; look: `kicker`, whatever the class)*.
- 01 / 02 / 03 numbers on sections that aren't a sequence *(lint)*.
- Three identical cards with an icon, a bold title and two lines of grey text.
- Cards inside cards *(look: `nested-boxes`)*; every section boxed.
- A "stats" band of big numbers nobody measured.
- Centred everything: every heading, paragraph and button on the middle axis.
- A hero with a headline, a sub-line, two buttons and a dashboard screenshot tilted in 3D.
- Logo walls of companies that never agreed to be there.
- Testimonials with stock headshots and first names only.
- A floating pill navigation with a blurred glass background.
- Thick coloured borders on one side of a box *(look: `side-stripe`)*.
- An FAQ that answers questions nobody asked.
- Every section below the first screen the same shape: heading on the left, text and a box on the right.
- A huge wordmark across the footer, whatever the site is.
- For software: a dark page, a big grotesk headline, a pill button beside a copy-the-command pill, then a
  terminal window. It is the default developer-tool page; find what only this tool can show.

## Type

- One of the default fonts as the only face *(lint)*: Inter for everything, Roboto, Poppins, Montserrat, Open Sans.
- Gradient-filled headlines *(lint)*.
- Monospace used for body or headlines to look "techy".
- Italic serif display words mixed into a sans headline ("Build *beautiful* things").
- Headlines so tight the letters touch, or so large they break into one word per line on phones *(look:
  `long-headline`)*.
- A flat scale: headings barely bigger than the text, every size close to the next *(look: `flat-type`)*.
- Grey body text.

## Colour and surface

- Purple-to-blue gradients. Violet-indigo accents *(lint, for the usual hex codes)*.
- Cream ground + serif + terracotta accent, with no reason in the subject *(look: `cream-accent`, for the colours)*.
  The three together are the tell, and an italic word in the serif headline makes it certain. A Warm site keeps its
  cream and its serif and takes its accent from the subject.
- Neon on pure black, glows everywhere *(look: `glow`)*.
- Soft blurry blobs and radial "spotlight" halos in the background.
- A drawing of the subject's data (lessons, stages, a route) as pale grey rounded bars in a pale grey box: it
  reads as a page still loading. Draw it in the subject's own material (a road, a ruler, a ticket) and colours.
- Big soft shadows under everything *(look: `heavy-shadow`)*; hairline border plus big shadow on the same box.
- Default blue link and selection colours (unthemed browser) *(lint, for selection)*.

## Motion

- The same fade-up on every element *(look for it in Lively sites)*.
- Bounce or elastic easing outside Playful *(lint)*.
- Pulsing dots, blinking cursors, endless marquees.
- `transition: all` *(lint)*; things growing from `scale(0)` *(lint)*.
- Scroll-jacking: the page scrolls at a speed you didn't choose.

## Content

- Placeholder text, lorem ipsum, "John Doe", example.com *(audit)*.
- Filler words and patterns *(lint, audit)*: see [copy.md](copy.md).
- Chat text pasted in whole ("I hope this helps", "[Your name]", citation marks) *(audit)*.
- Headings In Title Case, and lists where every line starts with a **bold label:** *(audit)*.
- Emoji as icons in headings and buttons *(lint)*.
- Stock photos of people pointing at laptops, or a pretty photo of somewhere else (another town, a famous
  landscape) standing in for their own place.
- Facts nobody gave, made up to fill a page: a tracklist, door times, a team, a count. Leave them out, or ask.
- "Learn more" buttons *(audit)*.
- Social icons linking to `#` *(lint, audit)*.

## Gimmicks

A trick played on the letters or the ground reads as a rendering fault or a theme, never as design, and one is
enough to spoil a calm page. The idea lives in the pictures, the content and the composition instead.

- The name or the headline mirrored, reflected, flipped, rotated, split or cropped.
- A status as the headline ("Closed", "Open now"): the headline says what this is; the open-now line sits beside it.
- Slashed or dotted zeros in times, prices and phone numbers (a code face, or a text face that draws its zero
  that way) *(lint: `slashed-zero`, for the font tokens and the setting)*.
- Monospace labels on sections and facts, on a page that isn't about code.
- Stencil, sign-painter or departure-board faces on facts: hours, prices and addresses are set in the text face.
- Grid lines, dot grids, sunbursts or rays as the ground.
- Words cut off at an edge, or giant letters bleeding off the page as decoration.

## Remove, then fill

When a page feels generic, remove before you add: the eyebrow, the cards, the second accent, one animation. Then
fill what you removed, or the page only gets thinner, and a thin page looks unfinished, which is worse than a
page with a habit in it. Fill with the subject, never with a new habit:

- scale: the focal point larger (the photo wider, the headline set larger, the list at reading size), the
  drawing at the size of the screen;
- the full content: the whole timetable, every tea with its price, all twelve dates, instead of three and a link;
- a real picture: theirs, a free photo of the subject, an archive picture of their world, a mood picture on the
  first screen; a drawing of the real thing only when no picture exists ([layout.md](layout.md), "Drawn pictures");
- a field of colour: a section on the brand colour, the ground of the subject.

One deliberate rest per page (a screen of space around a single line or object, where the visitor should pause)
is design. Every screen like that is an empty page.
