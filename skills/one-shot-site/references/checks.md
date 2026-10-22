# Checking the work

Four scripts check what can be measured. You check the rest by looking at the sheets.

## Look, never send

Checking a site never sends anything from this computer:

- Never submit a form, and never click or open a `mailto:`, `tel:`, `sms:`, `whatsapp:` or other link that hands
  over to an app: not in the scripts' browser, not in a browser of your own, not in a script you write. On a
  desktop it opens the user's own mail or phone app, filled in, in their name.
- Never open an address with the operating system (`start`, `open`, `xdg-open`, `explorer`, `Invoke-Item`). The
  scripts photograph the pages themselves.
- Check those links by reading the `href`: the address, and the subject and body if it has them. lint and audit
  read them the same way. A form is checked by its labels, fields and `action`; the person sends the first real
  one themselves, after launch.
- The scripts hold the same line: a `mailto:`, `tel:` or app address typed in stops at exit 2 as not a site; an
  address whose server redirects to one stops with "Not opened: … forwards to …, which would start another
  program" (look, film, images og, study, and redesign on its first page); a page that forwards by script or meta
  refresh is held in the page and checked like any other. Pass a web address or a folder.

## The scripts

| Script | When | What it does | Exit 1 means |
|---|---|---|---|
| `lint.mjs .` | while writing, any time | reads the source: generated-look habits, missing reduced motion, focus, alt, filler words | a "fix" in the source |
| `look.mjs dist` | after each build round | shoots every screen at 390, 768 and 1440 wide, makes contact sheets, measures layout faults | a layout fault a visitor would hit |
| `film.mjs dist` | after the motion pass | records the first seconds and a slow scroll as filmstrips, times every animation, finds jumps and endless loops | motion that hurts: jumps, a headline that takes too long, movement left on with reduced motion |
| `audit.mjs dist` | before shipping | everything a launch needs: meta, link previews, icons, links, keyboard, contrast, reduced motion, budgets, axe-core, copy | not ready to ship |

All of them print a short report: **Fix** (must change), **Consider** (look and decide), **Notes**. Reports are
also saved: `.one-shot/look/report.md`, `.one-shot/audit.md`.

### What look.mjs measures

- **overflow-x:** the page scrolls sideways; names the widest element.
- **contrast:** text against its real background colour (any CSS colour, transparency included).
- **over-media:** text over a picture, measured from the pixels behind each line (a fix under 4.5:1, or 3:1 for
  large text); over video or a canvas, a note to judge by eye.
- **covered:** text that something else is drawn over. A bar fixed to the bottom of the screen is on top by design;
  **under-bar** is text it still hides at the end of the page (the body needs the bar's height as padding at its
  end, layout.md).
- **collide:** text that runs into other text: the letters of two pieces of text overlap by more than 3px on a
  screen (a "Sold out" pushed into the next date), with nothing drawn between them. aria-hidden decoration, text in an
  SVG and text faded far back don't count.
- **spill:** text whose letters run more than 3px out of the box drawn around it (a chip, a button, a card: a
  background, a border or a shadow), or that the box cuts off. An ellipsis or line clamp set on purpose, a box that
  scrolls, a label positioned on the box's edge and a running ticker are meant. Let the box grow with its text, allow
  a second line, or set the text smaller there.
- **on-picture:** on a phone, a control or a block of text set partly on a picture it isn't part of, straddling its
  edge (fix); or a control laid over the picture's frame (position: absolute) and squeezed in under 24px beside it
  (consider), which reads as overlapping too. Pictures include a figure's drawing (a phone drawn in HTML). A play
  button wholly on its video, a caption wholly beside its photo and a card set over a photo's edge are placed on
  purpose. On a phone, give the control its own row above or below the picture.
- **never-shown:** text still invisible after scrolling the whole page (a reveal that never fired).
- **tiny-text, small-body, edge, measure, long-headline, headline-overflow, tap-target.**
- **wide-empty:** on a wide screen, a part that uses one side only, a picture far from its text, or a tall stretch
  of empty ground (fixes in [layout.md](layout.md), "Phones first").
- **hero-void:** on a wide screen, a first screen mostly empty around a small headline (under 12% of it covered).
- **margins:** on a wide screen, left and right page margins that differ a lot in most parts (an off-centre wrapper).
- **blank:** below the first screen, a stretch over half a screen tall with nothing on it, at any width.
- **untitled:** a part with 400 or more characters of text and no heading.
- **first-h1:** the h1 hidden, or below the first screen.
- **action-out-of-reach:** for a business, an event, or a person to hire, the screens of the phone and desktop
  sheets with no link to the first screen's action in view (layout.md, "The action stays in reach").
- **thin-section:** on a wide screen, a part with under 40 words and no list, row of cards, table, form or picture a
  quarter of its width. The hero is exempt, and so is one band up to half a screen tall.
- **sparse-screen:** on a wide screen, two or more screens under 30% filled (consider), or two under 15% (fix)
  (lines of text, pictures, boxes, bands of another colour than the ground).
- **small-text:** on a wide screen, running text under 17px (two paragraphs or more: fix), or several pieces of
  text over three words under 15px. The footer's small print may be smaller.
- **repeated-line:** the same sentence of five words or more seen twice on a page, outside the nav and buttons.
- **fake-bold:** a heading or button in a weight or italic the font doesn't have, so the browser fakes it.
- **kicker:** small tracked capitals right above several headings, whatever the class is called ([refuse.md](refuse.md)).
- **cream-accent:** the generated trio: a cream ground with a terracotta or violet accent, a serif headline, and an
  italic word in it or a pill-shaped button (cream and terracotta alone are a warm palette, not a tell).
- **cold-warm:** the brief's mood is Warm and the page came out cool: a cool or green ground (oklch hue 100 to 290,
  sage included), or a cool accent on a grey or white one.
- **tinted-ground:** the brief's mood is Quiet, Warm or Editorial and the light ground carries a colour (sage, mint,
  peach, a strong sand) where warm white or cream was the start. Chosen by the person? List it in allow.json with
  the reason in the brief.
- **glow:** three or more things glowing (a coloured or bright shadow with no offset).
- **heavy-shadow:** three or more boxes at rest with a big soft shadow.
- **side-stripe:** two or more cards with a thick stripe down one side.
- **nested-boxes:** two or more boxes inside other boxes (cards in a card).
- **flat-type:** on a wide screen, the largest text under 1.5× the body text, or section headings under 1.15×.
- **same-variant** (with `--compare`): two variants that came out with the same fonts and colours.
- **broken-image, font** failures, **fonts** (too many families), and every **script-error** and failed
  **request**. A page still loading after 30 s is a **request** fix too ("… was still loading after 30 s; the
  checks ran on what had arrived"), in look, film and audit alike.

Useful flags: `--pages index,about` · `--widths 390,1440` · `--frames 12` for long pages · `--reduced` for the
reduced-motion pass (sheets in `.one-shot/look-reduced`) · `--compare` for variants · `--headed` if 3D renders
black · a URL instead of `dist` (a dev server or the live site). look, film, images og and safari refuse a file,
and a folder without index.html unless `--pages` (`--page` for film and images og) names the pages in it, as in
a folder of variants.

Pages that only forward to another (a `<meta http-equiv="refresh">`, as `redesign.mjs redirects` writes them) are
left out of look, safari and audit. A refresh inside `<noscript>`, a comment or a script doesn't count: that page
is checked like any other. Two cases stop a run at exit 2, with one line:
- a folder where every page only forwards (look and safari): "No page to check in …: every .html file only
  forwards. Name one with --pages."
- a server that takes the connection and never sends the page: "Could not open …: no answer within 30 s (the
  server is stuck, or the site is down?)". Restart the dev server, or check the address.

`--numbers` draws 1, 2, 2a… on each block and on its headline, picture and button, and writes `numbers.md`.
Use it for the sheets you show the person, not for your own checking rounds (the badges hide a little of the page).

### What audit.mjs adds

- Head: `lang`, charset first, title and description length, viewport (and no zoom blocking), canonical,
  `og:title/description/image` (absolute URL, image in the build, 1200×630), `twitter:card`, favicon and
  apple-touch-icon present, theme-color, JSON-LD that parses.
- Structure: one `h1`, no skipped heading levels, `main`, a skip link, alt text, image dimensions, link, button
  and field names, dead links, anchors that point nowhere.
- Keyboard: the first Tab stops land on something visible with a visible focus ring.
- Reduced motion: every page with motion has a reduced-motion rule, and nothing stays hidden with it on.
- Laptop widths: each page resized through 900 to 1400px (8 widths), where a desktop layout gets squeezed; text
  into text, out of its box, drawn over or past the screen is told once, at the narrowest width it shows at.
- Site files: robots.txt (with the sitemap line), sitemap.xml, a 404.html with noindex and a link home, no source maps.
- Weight: first-visit JavaScript, CSS, fonts and total transfer against the budgets; oversized images.
- Copy: placeholders and pasted chat text (**placeholder**, **chat-leftover**, both must go), marketing filler
  (**filler-words**), words and shapes that read as generated (**ai-words**, **not-just**, **ing-tail**,
  **connectors**, **dashes**), Title Case headings (**title-case**), "**Label:** text" lists
  (**bold-labels**), too much bold (**bold**) and buttons that say nothing (**vague-action**). The reasons and
  the fixes are in copy.md.
- Local and legal: address and hours in a local business's structured data (**local-data**), date and place
  for events (**event-data**), menus as PDFs (**pdf-menu**), every other server a page contacts before any
  click (**third-party**), and for German-speaking sites the Impressum and privacy links (**impressum**,
  **privacy-page**). See local.md and legal.md.
- Full and doing: a page with no photo and no drawing 300px wide or more (**no-pictures**, a fix on the home page
  when the brief plans photos in "The pictures, planned"); a business, an event or a place with fewer than four
  real pictures across the site, each counted once, drawings and logos left out (**few-pictures**, a warning; not
  when site.json has `"photos": false` or the brief says no pictures); and a home page with nothing to try (**nothing-to-try**:
  no open-now line, hours with today marked, form, details, sound, canvas or button that does something).
- Links between pages, and with `--external` every outside link.
- `--draft` while there's no address yet (skips canonical, link-preview URLs and the sitemap).
  `.one-shot/allow.json` (a list of rule names) silences deliberate exceptions in lint, look and audit; say why in
  the brief.
- With axe-core installed: its automated WCAG 2.2 A and AA rules (automated checks find many problems, not all
  of them). With `--lighthouse` and lighthouse installed: the four Lighthouse scores, mobile and desktop.

## What only your eyes catch

Go through the sheets with these questions, phone first:

1. **Five-second test:** first screen only. Who is this, what do they offer, what should I do? If any answer is
   unclear, fix the hero before anything else.
2. **Hierarchy:** squint. Is there one clear first thing to look at on each screen, then a second?
3. **Rhythm:** are section gaps clearly bigger than gaps inside sections? Does the page vary, or is every screen
   the same layout?
4. **Line breaks:** headlines breaking badly (one word alone on the last line, a name split across lines). Fix
   with size, `text-wrap: balance`, or a `&nbsp;`.
5. **Images:** sharp, cropped toward the subject, not stretched, consistent in tone.
6. **Text over images and 3D:** readable on every screen where look.mjs reported over-media or covered.
7. **Alignment:** edges that almost line up are worse than edges that clearly don't. Snap them to the grid.
8. **Desktop width:** the 1440px sheet, every screen to the last. Cover the left half: is the right half empty
   ground? A phone-sized drawing in a wide field, rows with 800px of nothing in the middle, a closing screen of
   one line and a footer? look names some of these (`wide-empty`); the sheet shows the rest. Fixes in
   [layout.md](layout.md), "Phones first".
9. **Full and doing:** would a visitor find this thin? Take the brief's list of what they came for: is each
   answered in full (the whole menu with its lines, the timetable, every price), with a picture where one
   belongs? Can they act from every screen, the header button on the desktop and the bar on the phone? Does the
   text read on the 1440 sheet without zooming in? Is the one live thing there? Striking never makes up for
   sparse.
10. **The generated look:** run through [refuse.md](refuse.md). Any three hits cap Idea at 5 (below): remove them
   and fill (refuse.md, "Remove, then fill"); if no idea is left, go back to the brief.
11. **Brief check:** does the idea sentence show? Would a visitor describe one specific thing afterwards? Does the
   feel they chose show at a glance (a Warm brief in warm colours, the liked site's light or dark)?
12. **States:** hover, pressed, focus on every link and button; the sound toggle shows its state;
   the theme toggle names the theme it switches to, right after load and after each click, in light and dark.

## Score each round

After each look round, before you fix anything, write `.one-shot/critique-1.md` (then `-2`, `-3`). It makes the
rounds comparable and tells you what the next one is for. Short, from the sheets:

```
# Round 1
One second: what the eye lands on first, on the phone and on the desktop first screen.
The idea: the brief's idea sentence, and the screen where it shows (or "nowhere").
First screen  6/10  who, what and what to do in five seconds; the focal point at its size
Idea          5/10  their own pictures and content at their best; could it be anyone's site?
Craft         6/10  type, spacing, alignment, pictures, desktop width, phone
Full          5/10  everything the visitor came for, at full size; the action in reach; the live thing
Words         8/10  the person's facts, said the way they'd say them
Caps: wide-empty on the 1440 sheet (Craft at most 6)
Three worst: sheet-home-1440.jpg screen 4: contact in the left half, right half empty -> email large left,
  address and hours right. …
Next round: …
```

Caps hold whatever the rest looks like:
- a **Fix** left in look's report: every score at most 5, unless the sheets show it isn't there: name it under "Not
  a fault" in the critique, with its sheet and screen (the reviewer still judges that screen);
- three or more habits from [refuse.md](refuse.md) on the page, or a gimmick on the name or the headline
  (refuse.md, "Gimmicks"): Idea at most 5;
- a tinted ground on a Quiet or Warm brief that the person didn't pick (look: `tinted-ground`, `cold-warm`): Idea at
  most 6;
- a novelty face or slashed zeros on the facts (lint: `slashed-zero`): Craft at most 6;
- a `wide-empty` or `overflow-x` from look, or a screen you'd call empty on either sheet: Craft at most 6;
- a thin section, something from the brief's visitor list missing, the action out of reach on some screen, one of
  two audiences missing from the first screen, a phone screen given to one device with nothing to read, or text
  under 15px on the desktop sheet that a visitor came for: Full at most 6;
- a picture planned and missing, or icons standing in for the goods: Full at most 5;
- the mood missed (a Warm brief that looks cold, or dark when they didn't ask for dark; a Quiet one built loud or
  busy) or the brand colour they gave barely used: Idea at most 5;
- a fact the person didn't give (a number, a quote, a client): Words 0 until it goes.

Ready for the finish and the reviewer (SKILL.md steps 7 and 8) when no cap applies and every score is 7 or more;
until then the lowest score is the next round's work. After three rounds the rule in SKILL.md step 6 holds (back to the brief), and the last critique says what
still falls short. Score as a visitor who didn't build it: an 8 you'd have to explain is a 6.

## The reviewer

Your own rounds catch what you can see. What you can't, because you built it, the reviewer does: a fresh context
with a rubric and caps that make a pass hard to get, its own look and film, and the worst problems as exact
changes. When to start it and what to do with its verdict: SKILL.md step 8. Its whole prompt:
[reviewer.md](reviewer.md).

## Finishing list

- [ ] Every placeholder gone, every link real, contact details right (ask the person to confirm).
- [ ] Title, description and link preview text written for people (see [copy.md](copy.md)).
- [ ] `public/og.jpg` made (`images.mjs og`) and looked at: readable at thumbnail size.
- [ ] Favicon from the brand (edit `public/favicon.svg`), `apple-touch-icon.png` made (`images.mjs icon`).
- [ ] 404 page styled like the site and linking home.
- [ ] `::selection`, focus ring, caret, scrollbar, theme-color all from the palette.
- [ ] Motion checked: `film.mjs dist` strips read, `film.mjs dist --reduced` clean, `look.mjs --reduced` looked at
  (`.one-shot/look-reduced`).
- [ ] Sitemap lists every page with the real URL; robots.txt points to it.
- [ ] Free photos: each CC BY one credited on the page (audit: `photo-credit`); `public/img/CREDITS.md` complete.
- [ ] Legal: imprint/privacy page where required (ask; Germany requires an Impressum for business sites).
- [ ] Audit says **Ready to ship**.
