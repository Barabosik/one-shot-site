# The interview

Two rounds of multiple choice, then one open message for material. It should take under two minutes. Each
question has a recommended answer (listed first) and "Other" for free text.

## Round 1 (four questions)

**1. What's the site for?** (header: Purpose)
- Me and my work: a portfolio, a CV, a personal page
- A small business: a café, studio, shop, practice, trade
- A product or app: something people sign up for, download or buy
- An event or launch: a date, a place, a reason to show up

**2. How should it feel?** (header: Feel) The six moods, described in [looks.md](looks.md):
- Quiet: calm and spacious, lets the work talk
- Bold: big type, one loud colour, confident
- Warm: soft, friendly, a little handmade
- Night: dark and glowing, made for screens

(If the tool allows only four options, offer these four. Editorial and Playful come through "Other", or offer them
when the answers point there: Editorial for writers, magazines, restaurants with a story; Playful for kids,
games, toys, playful brands.)

**Not sure?** Words like "warm" or "bold" mean different things to different people. When they answer "not sure",
"show me", or hesitate between two moods, ask for just the name and one line about them, make the site's folder
from the name (SKILL.md, step 3) and run this from inside it, so the sheets land in its `.one-shot/`:

```
node SKILL_DIR/scripts/mockup.mjs --name "…" --line "…" --action "…" --moods warm,bold,quiet --brand "#…" --lang en
```

`--lang` puts the menu and the button in the site's language. Two brand colours: one is `--brand`, the other
`--ground`. Use the two or three moods they're torn between (all six when they have no idea), show `mockups.jpg`,
and take a letter as the answer. Their own name and words on the screen make the choice easy; a mix ("A's colours, C's
type") is a fine answer too.

**3. Colours?** (header: Colours)
- Pick them for me from the mood
- I have a logo or brand colour (I'll send it)
- Mostly black and white, plus one colour
- Show me three palettes first (then: three colours from the subject, drawn in their mood with
  `mockup.mjs --moods <mood> --brand "#a,#b,#c"`)

**4. How much movement?** (header: Motion)
- Gentle: things fade in as you scroll, buttons respond (recommended for most sites)
- Still: no animation at all
- Lively: scenes that build as you scroll, things that follow the mouse
- Showpiece: a 3D or interactive centrepiece

## Round 2 (two or three questions, shaped by round 1)

**5. What should a visitor do?** (header: Goal) The options depend on the purpose:
- Me and my work: Get in touch / Hire me / See my work / Read my writing
- Small business: Visit or book / Call or message / See the menu, prices or services / Buy
- Product or app: Sign up / Download / Buy / Join a waitlist
- Event or launch: Get a ticket / Register / Add to calendar / Come by

**6. Extras?** (header: Extras, multi-select; no pick or an empty reply means none)
- Light and dark switch
- Sound you can turn on (soft generated music and clicks)
- A contact form (needs a form service; see extras.md)
- More than one page (about, work, blog posts…)

**7. More languages?** (only when the person or place suggests it, e.g. a business in a non-English country)
- One language
- Two languages, with a switch

## The material message

Ask once, all together, and make skipping easy:

> Send me what you have. Anything missing is fine; I'll draft it and mark what to check.
> - the name, and one or two sentences on what you do and for whom
> - any text: about, services, prices, opening hours, project descriptions
> - photos or a folder of them, a logo if there is one. None? Fine: I'll use free photos of your kind of place
>   and old pictures of your street or town, credited, unless you'd rather I didn't
> - links: socials, shop, booking, GitHub, an old site
> - how people should contact you (email, phone, booking link)
> - a site or two you like the look of (any kind of business), if one comes to mind

## Turning answers into decisions

The person never sees these. Use them to steer the brief and the variants.

| Answer | Energy | Density | Boldness |
|---|---|---|---|
| Quiet | low | airy | low: type and space do the work |
| Bold | high | medium | high: scale and one strong colour |
| Warm | medium | medium | medium: texture and rounded shapes |
| Night | medium | airy | medium-high: light on dark, glow used sparingly |
| Editorial | low-medium | dense | medium: big serif headlines, columns |
| Playful | high | medium | high: colour, shape, movement |

Motion maps to: Still = no motion, only instant state changes; Gentle = CSS reveals and transitions (base.css);
Lively = the effects addon, or the motion addon when sections build with the scroll; Showpiece = those plus
hero3d, or one custom interactive piece.

Purpose sets the page's shape:
- **Me and my work:** name, line, proof (work), about, contact.
- **Small business:** what/where/when on the first screen, offer, place and hours, people, contact or booking.
- **Product:** what it does in one line, see it working, three reasons with proof, price, sign-up.
- **Event:** what, when, where on the first screen, why come, programme, ticket.
