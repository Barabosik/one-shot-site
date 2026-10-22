# Writing the words

The words are half the design. Most generated sites give themselves away in the text before anyone notices the
layout.

## The rules

- **Concrete beats clever.** "Sourdough, rye and spelt, baked from 6 every morning" beats "Artisanal baked goods
  crafted with passion".
- **Short sentences, plain words.** Write like the person would say it to a friend at a counter. If a sentence
  needs a second read, rewrite it.
- **Facts carry the excitement.** No exclamation marks except one, maybe, in a playful site. No superlatives
  you can't prove ("the best coffee in town").
- **Their voice, not yours.** First person for a personal site ("I build…"), "we" for a team, the business name
  sparingly. Match how they wrote their own material.
- **Headings name the section; the first line makes the point.** "Menu", "Hours", "Prices" let a visitor find
  what they came for at a glance, and the sentence under each says what's special ("Baked by 7, gone by noon").
  The headings and first lines alone tell the whole story.
- **Buttons say what happens:** "Book a table", "See the menu", "Email Rosa", "Download for Mac". Never "Learn
  more", "Click here", "Submit", "Get started" on its own.
- **Same thing, same word.** If it's a "booking" in the nav it's not a "reservation" in the button.
- **Sentence case** for headings and buttons. All caps only for tiny labels, with letter spacing.
- **Numbers and details are content:** prices, hours, distances, years, names. Put them in.
- **Say each thing once.** The same line twice on a page (a call to action in the hero and again mid-page, the
  closing line repeated above the footer) reads as filler, and visitors notice. The action's button repeats, its
  sentence doesn't.

## Words to avoid

The lint and audit flag these (the full lists are in `scripts/lib/words.mjs`). Two kinds:

- **Marketing filler:** unlock, unleash, elevate, empower, supercharge, game-changing, cutting-edge, world-class,
  seamless, effortless, robust, leverage, innovative, transformative, streamline, bespoke, curated, "look no
  further", "we've got you covered", one-stop, "passionate about", "next level", "crafted with", journey, stunning.
- **Words generated text leans on:** delve, tapestry, testament, "stands as", "serves as a", pivotal, crucial,
  vibrant, nestled, "in the heart of", boasts, showcase, underscore, highlighting, fostering, enduring, renowned,
  groundbreaking, "rich history", "diverse array", "a commitment to", intricate, multifaceted, realm, meticulous,
  "evolving landscape", "in today's…". The fix is the plain verb: "boasts a terrace" → "has a terrace".

Patterns to avoid (the first five are the strongest tells of generated text):
- Set-up and reveal: "Not just X, but Y", "It's not about coffee, it's about people", "No fuss. No frills. Just bread."
- A trailing "-ing" comment: "…opened in 2019, highlighting its commitment to quality." End at the fact.
- Inflated importance: calling ordinary things a testament, a cornerstone or a pivotal moment.
- Sentences opening with "Additionally", "Moreover", "Furthermore", "Ultimately".
- Lists of three for rhythm ("fast, simple, and powerful"), especially more than once on a page.
- Title Case Headings Like This. Use sentence case.
- List items that open with a bold label and a colon ("**Speed:** we're fast"), the shape of a chat answer.
- Bold scattered through paragraphs. One emphasis per section at most.
- Questions as headlines ("Looking for the perfect…?") and fake intimacy ("Hey there! 👋").
- Em dashes in every paragraph. Use a full stop, a comma or a colon.
- Empty superlatives and invented stats ("Trusted by 10,000+ customers" when no one counted).
- Anything a chat assistant says to its user: "I hope this helps", "Certainly!", "[Your Name]". The audit fails these.

The test: read it aloud as the owner would say it to a customer at the counter. Anything they'd never say goes.

## Patterns by section

- **Hero line:** who + what + the specific thing. "Ilse builds tools that test AI code." / "Rosa's: sourdough
  from a 1950s stone oven, Saarbrücken." 4–12 words. Under it, one sentence of support, then the main action.
- **About:** three to five sentences: what they do, how, one personal detail that's true and specific, where.
- **Services or offers:** name, one sentence on what you get, price or "from …" if they have one.
- **Menu or goods:** each item with its line (what it is, what's in it, where it comes from) and its price. A name
  and a price alone reads like a till receipt.
- **Work or projects:** what it is, their role, the result (a number if real), a link.
- **Contact:** the channel itself (the email address, the phone number) plus when they'll hear back.
- **Footer small print:** © year and name, imprint or privacy link where the law needs one (ask: in Germany
  an Impressum is required for business sites).

## Meta text

- `<title>`: the name plus what it is, 30–60 characters: "Rosa's Bakery: sourdough in Saarbrücken".
- Description: one or two plain sentences, 120–160 characters, saying what a searcher will find.
- `og:title` / `og:description` can be warmer than the meta ones; they're read by people in chats.
