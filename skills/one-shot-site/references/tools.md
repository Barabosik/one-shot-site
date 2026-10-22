# The starter and the scripts

What `new-site.mjs` puts in the site's folder and what each script takes, so there's no need to read their
source. A script run with `--help` prints its full options. Exit codes: 0 done, 1 a "fix" found, 2 bad input.

## The site's folder

| File | What's in it | What you do with it |
|---|---|---|
| `index.html` | skip link; `header.site-header` (wordmark, nav); `main#main` with `section.hero`, `#about`, `#contact`; `footer.site-footer`; `<!-- site:head -->` in the head | build the page from it; every `.html` file outside `public/`, `src/` and `tools/` is a page |
| `src/tokens.css` | colours `--ground --surface --ink --muted --line --accent --accent-ink --accent-text`; fonts `--font-display --font-text --font-mono`; sizes `--step--1` to `--step-4` (body is `--step-0`, about 19px on a desktop); `--leading-tight --leading-body --measure`; space `--margin --gap --section`; `--radius`; `--ease-out --ease-in-out --t-press --t-hover --t-reveal` | paste palette.mjs's block; set the two fonts; every value on the site comes from here |
| `src/base.css` | reset and readable defaults, focus ring, `.skip`, `.visually-hidden`, `[data-reveal]` entrances, plain styles for the site.json blocks (`.hours` with today marked, `.menu`, `.events`, `.open-now`, `.closed-note`, `.embed`, `.legal`) | leave it; restyle the blocks in style.css |
| `src/style.css` | a plain working layout: `.site-header`, `.hero`, `.lead`, `.section`, `.button` | replace it with the design |
| `src/main.js` | imports the three CSS files; `[data-reveal]` blocks arrive on scroll (children stagger with `style="--i: 2"`); `[data-year]`; the skip link | import the fonts and the addons at the top |
| `src/addons/` | the extras asked for (`--addons`); new-site prints the lines for main.js | [extras.md](extras.md) |
| `site.json` | the facts: contact, address, hours, closures, menu, events, links | [facts.md](facts.md): fields, `{{site.…}}` tokens and `<!-- site:… -->` blocks |
| `site-data.js`, `preload-fonts.js`, `vite.config.js` | the build: facts into pages, font preloads, every `.html` a page, `BASE` for a sub-path | leave them |
| `public/` | `404.html` (its own colours, written by palette.mjs), `favicon.svg`, `robots.txt`, `sitemap.xml`; copied as they are | draw the favicon; set-url.mjs fills the rest |
| `tools/one-shot/` | copies of the skill's scripts (all but new-site), so the owner's `npm run lint`, `look` and `audit` work later | leave them |
| `package.json` | `dev`, `build`, `preview`, `lint`, `look`, `audit` | — |
| `.one-shot/` | your work: brief, progress, critiques, reviews, sheets; git-ignored, never shipped | — |

## The scripts

Run as `node SKILL_DIR/scripts/<name>.mjs` from the site's folder.

| Script | When | The usual call | Writes |
|---|---|---|---|
| `mockup` | 1, 2 | `--name "…" --line "…" --action "…" [--brand "#…"] [--moods warm,bold]`; `--concepts .one-shot/concepts.json [--check]` | `.one-shot/mockups/mockups.jpg`, `concepts.jpg` |
| `study` | 1 | `https://liked-site [--pages /,/work]` | `.one-shot/study/study.md`, its pictures |
| `redesign` | 1; compare, redirects after 9 | `https://their-site`; `compare https://their-site dist [--pages "/,/menu.html=/#menu"]`; `redirects . --pages "…"` | `.one-shot/redesign/` (redesign.md, content.md, facts.json, img/, before-sheet.jpg) |
| `new-site` | 3 | `. --name --description --email --phone --theme "#…" --lang en-GB --schema … --mood warm [--ground warm] [--addons …] [--legal de] [--country DE] [--currency GBP] [--facts facts.json]` | the folder above, installed; prints what it filled and what's left |
| `palette` | 3 | `--brand "#…" --mood warm [--strategy quiet\|committed\|drenched] [--mode light\|dark] [--ground warm\|cool\|neutral\|brand\|"#…"]`; `--logo file`; `--brand "#a,#b,#c" --sheet .one-shot/palettes` | the block for tokens.css; public/404.html's colours |
| `images` | 5, 7 | `photo <files> --out public/img [--hero]`; `og dist [--page og]`; `icon` | web sizes and the `<img>` tag; `public/og.jpg`; `public/apple-touch-icon.png` |
| `photos` | 5 | `search "plain nouns" [--shape wide] [--big]`; `get 3 7 --as loaf [--hero]` | `.one-shot/photos/photos.jpg`; the photos in public/img and their credits in `CREDITS.md` |
| `lint` | 5 on | `.` | the report only |
| `look` | 4, 6, 8, 10, 11 | `dist [--frames 30] [--pages index,about] [--widths 390,1440] [--numbers] [--compare] [--reduced] [--scheme dark] [--out dir]` | `.one-shot/look/` (sheet-*.jpg, report.md; numbers.md with `--numbers`) |
| `film` | 7 | `dist [--page /] [--reduced] [--scheme dark] [--video]` | `.one-shot/film/` (film-load.jpg, film-scroll.jpg, film.md) |
| `audit` | 9, 10, 11 | `dist --external [--draft] [--scheme dark] [--lighthouse]` | `.one-shot/audit.md`, `audit.json` |
| `safari` | 9 | `dist` (needs Playwright's WebKit) | `.one-shot/safari/` |
| `set-url` | 11 | `. https://…/` | the address in every page, robots.txt, sitemap.xml |
| `publish` | 11 | `branch --repo …`, `vercel --name …`, `netlify --name …`, `cloudflare --name …` `[--dry]` | — ([deploy.md](deploy.md)) |

With `--out`, look and film write there; `--scheme dark` adds `-dark` to that name (`.one-shot/x` →
`.one-shot/x-dark`) unless it already ends in it.
