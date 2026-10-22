# Extras

Add only what was asked for. Each extra has a cost in weight, care and things that can break.

## 3D hero (`--addons hero3d`)

`src/addons/hero3d.js`: three.js loaded after first paint, WebGL check, poster fallback, pixel-ratio cap,
pauses off-screen, still frame for reduced motion.

1. Markup: `<div class="hero-3d" aria-hidden="true"><img class="hero-3d-poster" src="/img/hero-poster.webp" alt=""></div>`
   placed in the hero, sized by CSS (it fills its box).
2. `initHero3d(document.querySelector('.hero-3d'), { build })`. The default `build` is a placeholder blob.
   Replace it with something from the subject:
   - a model: `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`, compressed with
     `npx @gltf-transform/cli meshopt in.glb out.glb` and decoded with `MeshoptDecoder` from
     `three/addons/libs/meshopt_decoder.module.js`. Free models: Poly Haven (CC0), or the person's own.
   - simple geometry that means something: dice for a board-game café, a vinyl record for a DJ, stacked plates
     for a restaurant.
3. Make the poster from the scene alone. It shows while three.js loads and whenever WebGL is missing, under the
   page's own words, so the words must not be in it. Hide them for a moment (`.site-header, .hero h1, .hero p {
   visibility: hidden; }` at the end of style.css), then `npm run build && node SKILL_DIR/scripts/look.mjs dist
   --pages / --widths 1440 --frames 1` (add `--headed` if the scene comes out black) and take
   `.one-shot/look/home-1440-0.jpg`. Remove the rule, then `node SKILL_DIR/scripts/images.mjs photo <that file>
   --out public/img` makes the WebP sizes.
4. Check: phone sheet (text must not sit on top of it; the look script flags overlaps), the `budget` line in the
   audit (three.js sits in its own chunk, loaded after the page; the audit reports its size).

## Sound (`--addons sound`)

`src/addons/sound.js`: everything synthesized with Web Audio, no files. Off until the visitor presses the
toggle; the choice is remembered; quiet when the tab is hidden.

- Markup: `<button class="sound-toggle" type="button" aria-pressed="false">Sound</button>`, visible in the header.
  Style `[aria-pressed="true"]` so the state is obvious.
- `initSound(button, { music: true, clicks: true, mood: 'calm' | 'bright' | 'deep', key: 50 })`. Mood picks the
  scale of the generated piano bed; key is the root note (MIDI, 50 = D).
- `sounds.press()`, `sounds.tap()`, `sounds.done()` for your own moments (a form sent, a game won).
- Never autoplay. Never make sound the only way to get information.

## Light and dark switch (`--addons theme`)

`src/addons/theme.js`: follows the system until the visitor chooses, remembers the choice, cross-fades with a view
transition. Make a second palette with `palette.mjs --mode dark`, then add it to tokens.css twice (the header comment
of `src/addons/theme.js` shows where). new-site puts the small head script against a flash of the wrong theme into
`index.html` and the legal pages; a page you add later needs it too (copy it from `index.html`).

## Motion library (`--addons motion`)

`src/addons/motion.js`: GSAP with ScrollTrigger for Lively and Showpiece sites. See [motion.md](motion.md).

## Effects (`--addons effects`)

`src/addons/effects.js` + `effects.css`: small effects with no library, each switched on by an attribute, each
off with reduced motion. `data-split` (headline words rise in; `="chars"` for letters), `data-count` (a number
counts up; write the real number), `data-draw` (SVG lines draw themselves), `data-mask` (a picture wipes in),
`data-marquee` (an endless row with its own pause button), `data-magnetic` and `data-tilt` (follow the mouse;
nothing on touch), a cross-fade between pages, and `swap(fn)` for in-page changes. Timing: `style="--fx-t: 1s"`.
Pick two or three per site. See motion.md for which level gets which.

## Contact form

A static site can't send email by itself. Options, ask which the person prefers:
- **A mailto link** with the address shown (no service, always works). The default.
- **Formspree** or **Web3Forms**: free tiers, a form `action` URL, the person signs up and gives you the form ID.
- **Netlify Forms**: if hosting on Netlify, add `data-netlify="true"` to the form.

Every field has a visible `<label>`, the right `type` and `autocomplete`, and errors say what to fix: email
`type="email" autocomplete="email" spellcheck="false"`, phone `type="tel" autocomplete="tel"`, name
`autocomplete="name"`, postcode `autocomplete="postal-code"` (and `inputmode="numeric"` where codes are digits);
lint names a field that misses one (`form-field`). Add a hidden honeypot field against spam. After sending, show
a clear thank-you in place. Check it by reading it, never by sending it (checks.md, "Look, never send"): the
person sends the first real message after launch.

## More pages

Any `.html` file in the project root becomes a page (vite.config.js picks it up): `about.html`, `work.html`.
Shared header and footer: copy them (fine for 2–4 pages), keep them identical, and check with
`look.mjs` (it shoots every page). Give each its own title, description and canonical; `set-url.mjs` writes the sitemap from the pages. For a blog with many posts, ask whether they want Markdown files turned into pages; that needs a small
build step and is beyond a one-shot site, so suggest a separate tool if it grows.

## Legal pages

German-speaking business sites need an Impressum, and every site that isn't purely private needs a privacy page.
`new-site.mjs --legal de` adds both in German, filled from site.json and linked in the footer. For Austria,
check them against § 5 ECG and the Austrian VAT rules, which differ from the German ones. Any other country: write
the privacy page by hand in the site's language from legal.md's paragraphs, name every form, counter and embed
the site uses, and link it in the footer. Who needs what, the facts to ask for, and paragraphs for forms,
counters and embeds: [legal.md](legal.md). Ask the person for each fact; never invent one, and don't write legal
advice.

## Maps and videos (`--addons embed`)

`src/addons/embed.js`: outside content (YouTube, Vimeo, Google Maps, OpenStreetMap) loads only when the visitor
clicks, so nothing contacts those servers before then. A poster image goes inside the box; see the file's
header. For a plain address, a link (`{{site.address|maps}}`) beats any embed.

## Visitor counting

Only when the person wants numbers. GoatCounter (free for small sites), Cloudflare Web Analytics (free) or
Plausible (paid) count visits without cookies, so they usually need no consent banner (a lawyer or the local
data-protection authority can confirm). Put the code in `site.json` →
`analytics`: `{ "goatcounter": "their-code" }`, `{ "cloudflare": "token" }` or `{ "plausible": "their-domain" }`.
`<!-- site:head -->` adds the script. Mention it in the privacy page.

## Two languages

The first language at `/`, the second in a folder (`/en/`), the same structure, `<html lang>` right on each, a
visible language switch that names languages in their own words ("Deutsch", "English"), linked with the base
(`href="%BASE_URL%en/"`, `href="%BASE_URL%"`) so it works on a GitHub project page too. Each page links its pair
with `hreflang`, written with the same `{{URL}}` as the canonical link until the address is known
(`<link rel="alternate" hreflang="en" href="{{URL}}en/">`). Translate everything on the page, the starter's own
words too: the skip link, the nav, the footer, the 404. Legal pages can stay in the language the law asks for
(a German Impressum), linked from both footers. Ask the person to check any language they speak. Both languages
share one `site.json`: prices and hours stay written once, and a text that differs gets one value per language
(see facts.md, "Two languages").
