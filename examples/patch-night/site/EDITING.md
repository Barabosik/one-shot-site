# Editing the Patch Night page

The page is plain HTML, CSS and JavaScript, built with Vite. Everything about the night that can change lives in
one file, `site.json`; the page, the link preview and the data search engines read all come from it.

## The facts in site.json

| Field | What it is |
|---|---|
| `name` | Patch Night |
| `description` | One or two sentences for search engines |
| `email` | The ticket address. **Still a placeholder** (`tickets@patchnight.example`): put the real one in before launch |
| `address` | The venue's street, postcode, city and country |
| `venue` | The venue's name, Alte Löschhalle |
| `events.0.start` / `end` | Start and end for search engines, `2027-03-13T19:00` and `2027-03-14T01:00` |
| `events.0.day` | The date shown on the page, with its weekday ("Saturday, 13 March 2027") |
| `events.0.doors` / `until` | Doors and closing time on the page (19:00, 01:00) |
| `events.0.setsUntil` | When the three live sets end (23:00) |
| `events.0.openPatch` | When Open Patch starts (23:00) |
| `events.0.price` / `student` | Ticket prices in euros (18 and 12) |
| `workshop` | The workshop's name, times, seats and price |
| `collective` | Saar Synth Collective, since 2023, and which edition this is |

When the date moves, change `start`, `end` and `day` together. When the times move, change `doors`, `until` and
the time in `start` / `end` together. Then `npm run build`.

## Before launch

1. Replace `tickets@patchnight.example` in `site.json` with the real address, and delete `"made-up-address"`
   from `.one-shot/allow.json`.
2. Add your Impressum and privacy page, and link both in the footer of `index.html`.
3. Choose where it lives (GitHub Pages, Netlify, Cloudflare, Vercel, or your own server), then put the address in:
   `node tools/one-shot/set-url.mjs . https://your-address/`, build, and check with
   `node tools/one-shot/audit.mjs dist` (without `--draft`).
4. Publish the `dist` folder.

## Changing things later

Ask any coding agent: "use one-shot-site to change …", for example "the set times are fixed now: …" or "add a
sold-out note". It reads `site.json` and this file, and keeps the design.

By hand: edit `site.json` (facts) or `index.html` (words), then

```
npm run build
node tools/one-shot/look.mjs dist      # pictures of every screen, in .one-shot/look
node tools/one-shot/audit.mjs dist     # everything a launch needs
```

and publish `dist` again.

## Where things are

- `index.html`: the page. `src/style.css`: its design. `src/tokens.css`: every colour, size and timing.
- `src/rack.js`: the rack in the first screen (the cables, the drag and drop, the four voices).
- `src/addons/sound.js`: the Sound switch in the header. Nothing plays until a visitor turns it on.
- `og.html`: the link preview, rendered to `public/og.jpg` with `node tools/one-shot/images.mjs og dist`.
