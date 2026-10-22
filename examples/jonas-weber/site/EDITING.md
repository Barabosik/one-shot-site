# Editing your site

Your site is plain HTML, CSS and a little JavaScript, built with Vite. Everything in this folder is yours.

## The facts live in site.json

Anything that can change is written once, in `site.json`, and the pages, the Impressum and the data for search
engines all read it from there. Change it, build, publish.

| Field | What it is |
|---|---|
| `name` | Your name, as it appears in the header, footer and Impressum |
| `job` | "Independent app developer": what search engines show as your job title |
| `description` | One or two sentences for search engines |
| `email` | The address every "Email Jonas" button and link writes to. **Still the placeholder hello@jonasweber.example: put your real one in before launch.** |
| `phone` | Empty. Fill it in and a phone line appears in the Impressum (German law expects a second quick way to reach you besides email) |
| `address` | Street, postcode, city, country: shown only in the Impressum and the privacy page |
| `clients.next` | The next opening, "spring 2027". Shown in the first screen, the hire section and the footer |
| `apps` | Your three apps in the order they appear. For each: `name`, `job` (one line on what it does), `proof` (the big number: "41k downloads") and `detail` (the small line beside it) |
| `streaming.from`, `streaming.to` | The years on the offline downloads team, in the orange section |
| `owner.name` | The legal name for the Impressum |
| `host` | Your hosting company, for the privacy page. Fill it in once you know where the site lives |
| `url` | The site's address. Set it with the command below, not by hand |

Example: Tide passes 50k downloads. Change `"proof": "41k downloads"` to `"proof": "50k downloads"`, then build.

The words around the facts (the headline, the app descriptions, the offline paragraph) are in `index.html`. Colours,
sizes and timings are in `src/tokens.css`; the layout is in `src/style.css`.

## Working on it

```
npm install          # once
npm run dev          # then open http://localhost:5173, changes show as you save
npm run build        # makes the finished site in dist/
npm run audit        # checks everything a launch needs
```

You can also ask any coding agent: "use one-shot-site to change …" (new opening date, a fourth app, new numbers).
It reads `site.json` and this file, keeps the design and changes only what you asked.

## Before it goes live

1. Put your real email in `site.json` (`email`), and take `"made-up-address"` out of `.one-shot/allow.json`.
2. Decide where it lives (GitHub Pages, Netlify, Vercel, Cloudflare or your own domain) and fill in `host`.
3. Set the address everywhere: `node tools/one-shot/set-url.mjs . https://your-address/`
4. `npm run build`, then `node tools/one-shot/audit.mjs dist`: it should say "Ready to ship".
5. Publish `dist/` with your host. It is not published yet.

The Impressum and privacy page follow common practice for a freelancer in Germany. They aren't legal advice; if
your situation is unusual, check them with a generator such as eRecht24 or a lawyer.
