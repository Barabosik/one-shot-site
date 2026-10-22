# The six moods

Contents: [Quiet](#quiet) · [Bold](#bold) · [Warm](#warm) · [Night](#night) · [Editorial](#editorial) · [Playful](#playful)

Each mood is a starting point, not a skin. Take its rules, then bend them toward the subject: a Warm site for a
pottery studio and a Warm site for a children's dentist share a temperature, not a look.

Font names are Fontsource packages (`npm i @fontsource-variable/<name>`, or `@fontsource/<name>` where marked
*static*). The CSS family is the font name, plus " Variable" for variable packages.

**Type systems.** Each mood lists a few: the headline face and its weight, the text face, then the headline's
size against body, its leading and its tracking. Start from one as written and bend it toward the subject. Body
text in all of them: weight 400, leading 1.6, at the sizes in [type-and-colour.md](type-and-colour.md). Faces with
a louder voice are there too, for when the person asks for character.

**Spent first choices.** Each mood has a first version that every model reaches for and every visitor has seen:
its "Watch out" line names it. Five fonts are spent as the only face of a page (Inter, Roboto, Poppins,
Montserrat, Open Sans). Use one only when the subject asks for exactly that, and say why in the brief.

---

## Quiet

Calm, spacious, sure of itself. The work is the loudest thing on the page.

- **Type:** a calm serif headline over a quiet sans, or one sans for everything. Systems:
  - Gelasio 500 + Rethink Sans: 4.5× body, leading 1.05, tracking -0.015em.
  - Source Serif 4 400 + Public Sans: 5× body, leading 1.02, tracking -0.02em.
  - Albert Sans 500, alone: 4× body, leading 1.0, tracking -0.03em.
  - Schibsted Grotesk 500 + Public Sans: 4× body, leading 1.02, tracking -0.025em.
- **Scale:** big jump from body to headline (4× or more), few sizes in between. Headlines in normal or medium
  weight, not heavy.
- **Colour:** quiet strategy, light. A warm white ground (`--mood quiet`), near-black ink, the accent on one or
  two things only (the main button, a hover).
- **Layout:** wide margins, a strict grid, space used on purpose: one rest per page, and full, large sections
  around it (asymmetric, not centred everything). Images large, never cropped into small cards.
- **Motion:** Gentle. Slow fades (700–900ms), no movement over 16px.
- **Details:** alignment and space instead of boxes; a rule only where it separates something (the rows of a
  timetable), not under every block. Small caps or tabular numbers for dates, generous line height.
- **Watch out:** quiet must not become empty. Pay for the space with excellent images and precise type. Hairlines
  between every block, small grey labels and small type on white are the generated Quiet: spent.

## Bold

Confident and loud. It takes a position.

- **Type:** a display face with presence (condensed, extended or very heavy) and a plain workhorse for text.
  Systems:
  - Archivo 800 at width 75 (`@fontsource-variable/archivo/wdth.css`) + Archivo: 6× body, leading 0.9, tracking
    -0.01em, capitals allowed.
  - Big Shoulders Display 800 + Public Sans: 6× body, leading 0.9, tracking 0.
  - Funnel Display 700 + Funnel Sans: 5× body, leading 0.95, tracking -0.03em.
  - Anybody 750 at width 120 (`@fontsource-variable/anybody/wdth.css`) + Work Sans: 5× body, leading 0.95,
    tracking -0.02em.
- **Scale:** headlines that fill the width (10–18vw on the hero), tight leading (0.9–1), slight negative tracking.
- **Colour:** committed or drenched, one saturated colour, black and white for everything else. No second accent.
- **Layout:** full-bleed bands, hard edges, square corners, a mood picture on the first screen, a block of colour
  for a section or two.
- **Motion:** Lively suits it: headlines that slide in by line, colour bands that wipe in, snappy (300–500ms).
- **Details:** oversized numbers, thick rules, buttons as solid blocks.
- **Watch out:** bold everywhere is noise. Keep one loud thing per screen, with calm around it.

## Warm

Friendly, human, a little handmade. Feels like a place, not a product.

- **Type:** a book serif or a sturdy slab for headlines over a friendly text face, set calmly. A serif headline
  is welcome here; the italic word in it is what's spent (Watch out). Systems:
  - Alegreya 500 + Alegreya Sans *static*: 4× body, leading 1.08, tracking -0.01em.
  - Vollkorn 500 + Commissioner: 4× body, leading 1.1, tracking -0.01em.
  - Bitter 500 + Work Sans: 4× body, leading 1.05, tracking -0.015em.
  - Petrona 500 + Karla: 4.5× body, leading 1.05, tracking -0.015em.

  Sign-painter, rounded and hand-lettered faces (Caprasimo, Gluten, Calistoga) are for when the person asks for
  character ([type-and-colour.md](type-and-colour.md), "When the person asks for character").
- **Scale:** 4× body to headline, comfortable line height (1.6), slightly larger body text.
- **Colour:** committed, light, and warm at a glance. Cream (`--mood warm`), or the subject's own warm colour
  when it has one (the clay's pink, the oven's brick, the wool's oatmeal, honey). Dark brown-black ink, an earthy
  or fruity accent from the subject, kept small (terracotta is fine for a pottery, not for a lawyer). A cool
  subject colour (the tea's green, the van's blue) is the accent at most: a Warm site in sage or blue reads as
  cold.
- **Layout:** soft rhythm, rounded corners (12–24px), large photos with people and hands in them.
- **Motion:** Gentle. Things settle softly (ease-out, a little scale from 0.97).
- **Details:** photos with a warm grade, prices and hours written like a person would say them.
- **Watch out:** the generated Warm look is a trio: a soft serif headline with one word in italic, a terracotta
  (or dark green) pill button, and a small label over every heading. Leave those three out. Cream and a serif
  are fine, and often the right start; going cool to look different loses the brief. Take the warmth from the
  subject's real colours, pictures and textures, and give the hours a real place: the open-now line beside or
  under the headline (`<!-- site:open-now -->`, so it says "Open now · until 17:30" and stays true), and the
  week's hours as a timetable with today marked.

## Night

Dark, deep, made for screens. Light is the material.

- **Type:** a geometric or technical sans with personality; mono only on a page about code, never for body or
  facts. Systems:
  - Sora 500 + Red Hat Text: 4× body, leading 1.05, tracking -0.02em.
  - Geologica 500, alone: 4.5× body, leading 1.02, tracking -0.025em.
  - Onest 500, alone: 4× body, leading 1.05, tracking -0.02em.
  - Red Hat Display 500 + Red Hat Text: 4.5× body, leading 1.02, tracking -0.02em.
- **Scale:** large headlines in medium weight (heavy weights glare on dark grounds), body at least 17px.
- **Colour:** dark, quiet or committed. The ground is a deep colour tinted toward the brand (never pure #000),
  off-white ink, one luminous accent. Contrast is easy to overdo: soften ink to around 90% lightness.
- **Layout:** one big visual moment on the first screen: a mood picture (the stage in its light, the street at
  night), a 3D piece or a glow. Sections that fade between depths, cards only where content is a set.
- **Motion:** Lively or Showpiece: light that follows the pointer, a 3D hero, slow drifting backgrounds.
- **Details:** subtle glow on the accent only, grain to avoid banding in dark gradients, themed scrollbar.
- **Watch out:** neon on black with purple-cyan gradients is the cliché. Pick a hue from the subject and use
  glow on one thing.

## Editorial

A good magazine or newspaper. Text is the design.

- **Type:** a serif with real character for headlines, a readable serif or sober sans for text. An optical-size
  axis (`opsz.css`) sharpens big headlines, but its files are more than twice the size (Newsreader: 132 KB a
  style against 58 KB), so with an italic it passes the 200 KB font budget alone. Use it when the headlines are
  the page; the plain weights otherwise.
  Systems:
  - Piazzolla 500, alone (text at 400): 5× body, leading 1.02, tracking -0.02em.
  - Libre Caslon Text *static* 400 + Source Serif 4: 4.5× body, leading 1.08, tracking -0.01em.
  - EB Garamond 500 + Public Sans: 5× body, leading 1.0, tracking -0.015em.
  - Spectral *static* 400 + Libre Franklin: 4.5× body, leading 1.08, tracking -0.01em.
- **Scale:** dramatic headline sizes, a clear hierarchy of deck (standfirst), byline, body; body at a 60–70
  character measure.
- **Colour:** quiet, light: cream paper (`--mood editorial`) and ink, one accent used like a printer's spot colour:
  rules, initials, links.
- **Layout:** a column grid with real columns (2–3 on desktop), pull quotes, captions under images, drop caps
  once, rules between sections.
- **Motion:** Still or Gentle. Reading pages shouldn't move.
- **Details:** proper quotes (“ ”), real dashes, small caps for names, dates in tabular figures, footnotes.
- **Watch out:** too many hairlines and boxes turns it into a fake newspaper. Fewer rules, more space.

## Playful

Bright, surprising, alive. Things react when you poke them.

- **Type:** a chunky or quirky display face, a round friendly text face. Systems:
  - Bagel Fat One *static* + Rubik: 4.5× body, leading 1.0, tracking 0.
  - Shrikhand *static* + Lexend: 4× body, leading 1.05, tracking 0.
  - Fredoka 600 + Nunito: 4.5× body, leading 1.02, tracking -0.01em.
  - Baloo 2 700 + Nunito: 4.5× body, leading 1.0, tracking -0.01em.
- **Scale:** big and bouncy, headlines on colour shapes; stickers and cards may tilt, the headline stays straight.
- **Colour:** two or three saturated colours that come from the subject (a toy, a game, a fruit), on a light
  ground. Check every text pair with palette.mjs; bright colours fail contrast easily.
- **Layout:** stickers, blobs, tilted cards, things that overlap on purpose, a wavy section edge.
- **Motion:** Lively. Hover wobbles, things that pop in with a little overshoot (the only mood where it fits),
  a cursor or click effect.
- **Details:** custom illustrations or shapes, emoji only if the subject is literally about them, sound fits here.
- **Watch out:** playful still needs a grid underneath. Chaos on purpose only works on top of order.
