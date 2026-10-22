# Changelog

What changed in each version, newest first. Versions follow `version` in `.claude-plugin/plugin.json` and
`SKILL.md`. From 0.5.0 on, each has a tag (`v0.5.0`) and a GitHub Release; 0.1.0 to 0.4.0 came before this
repository went public and have neither. A line for a merged pull request ends with its number and who made it:
"(#12, thanks @someone)".

## 0.5.0 (2026-10-22)

Calmer sites by default. The skill:

- **Calm grounds.** Quiet starts on warm white, Warm and Editorial on cream (`--mood` in `palette.mjs` and
  `new-site.mjs`, and the looks `mockup.mjs` draws). The brand colour goes on the actions and stays small; it
  tints the ground only when they ask (`--ground brand`). `look` warns about a coloured ground on a calm brief
  (`tinted-ground`) and about sage on a Warm one.
- **No gimmicks.** The name and the h1 stay whole, and the h1 is never a status. A page has one focal point. An
  idea may be their own content, done well. `references/refuse.md` lists the tricks, and the reviewer caps a page
  with a trick on the name or h1, a tinted calm ground nobody picked, or novelty faces and slashed zeros on facts.
  `lint` flags slashed zeros (`slashed-zero`).
- **Type systems.** Each mood has a few type systems, each with its weight, size, leading and tracking. Loud faces
  come only when someone asks for character. A recent site counts as a repeat when the type system, the colours
  and the first-screen move are all the same.
- **Pictures first.** A business, an event or a place plans at least four real pictures: their own, free photos
  (the default unless they say no) or archive pictures of their world, with drawings as the fallback. Night, Bold
  and Lively first screens get a mood picture. `audit` warns under four (`few-pictures`); `"photos": false` in
  `site.json` or "No pictures at all" in the brief turns that off, and then drawings and type carry the page.
  Section headings name the section plainly ("Menu", "Hours").
- **The classic, always offered.** One of the three ideas and one of the three first screens is the classic done
  well. For Quiet and Warm it is kept unless another clearly fits the brief better, and a tie goes to the calmer
  one.
- **Legal pages only for a country they gave.** No guess from the language: the handover asks where the business
  is based. A site that collects emails needs a privacy notice wherever it is. `audit --draft` lists a missing
  legal name as waiting on them; the final audit still stops on it.
- **Contrast on photos, from the pixels.** Text on a still picture is measured against the picture behind each
  line, and the weakest spot fails under 4.5:1 (3:1 for large text). Video and canvas stay a note.
- **Names and form fields.** `lint` checks that the business name in the header, the footer and the h1 keeps
  `translate="no"` (`translate-name`), so a translated page doesn't turn "Kleiner Kaffee" into "Small coffee", and
  that email, phone, name and postcode fields have their type, autocomplete, inputmode, spellcheck and a label
  (`form-field`). The starter and the legal pages do both.
- **The theme button says where it goes.** The theme addon's button names the theme a click switches to ("Dark"
  on a light page, "Light" on a dark one) and draws its half circle as an SVG that stays whole at any zoom. A
  click that lands while the cross-fade runs still counts; before, a second click during the fade was lost.
  `references/extras.md` and `checks.md` say how to write the button.
- **Fewer false alarms and stalls.** `look` and `audit` no longer report a collide for the hidden text of a closed
  `<details>`. The browser gets 45 s to start, then one more try with a fresh profile
  (`ONE_SHOT_BROWSER_START` sets a longer wait for a slow machine). Waits for the screen to settle, a scroll step
  and pictures to decode no longer hang when frames come seconds apart. `film` watches the first screen for
  `--seconds` from the first paint, so a page that paints late on a slow machine still gets its whole first screen
  filmed.

The examples:

- Kleiner Kaffee is made with 0.5, from the same answers: the drum roaster drawn beside the headline, on cream,
  in roast brown.
- The other five keep the version that made them; their names now carry `translate="no"`. Jonas Weber's theme
  button got the fix above after its run.

## 0.4.0 (not released on its own; it ships in 0.5.0)

The skill:

- **Three ideas before any code.** The brief writes three ideas, each from a different fact about the client.
  `mockup.mjs --concepts` draws them with the client's own name and words, in the site's language, the person picks
  one, and the three first screens are three takes on that idea.
- **Redesign a site you already have.** `redesign.mjs` reads the old site (up to 12 pages: the text, photos, facts,
  prices as a draft menu, and a picture of each page). The new site keeps all of it, the old addresses forward to
  the new pages, and `redesign.mjs compare` shows each old page next to the new one.
- **Other versions, any time.** "Show me another idea", "another idea for the prices", "make it warmer": three
  versions side by side, ranked against the brief, with the one it would pick (`references/iterate.md`).
- **Two languages**, with hreflang links (the audit checks they come in pairs, to pages that exist) and German
  legal pages that take the site's exact tag (`de-AT`); other countries get none yet. `site.json` holds texts per
  language, and `|price` writes prices the page's way (85p under a pound).
- **Hours and events:** a second list of hours, events with weekday, city, doors and "sold out" on the page and in
  the search data, and "from" prices on menus. `SITE_TODAY` builds a site as of a given day.
- **Legal pages without every fact yet:** an Impressum builds without a phone (it asks for a second way to get in
  touch) and without the owner's name, which shows as a visible slot the audit stops on. Long German headings break
  instead of running off a phone. `new-site` takes the country from `--country`, the phone or `--legal` before it
  guesses from the language.
- **Free photos** from Wikimedia Commons when Openverse is down or finds nothing.
- **An optional Safari check:** `safari.mjs` takes the same screens in WebKit when Playwright is installed.
- **Drawn pictures:** a wide drawing gets a closer crop on phones, drawn once and shown through two viewBoxes.
- **Effects:** entrances on the first screen wait for the first paint, a counting number keeps its final width,
  and dashed lines keep their dashes.
- **Start here.** The top of `SKILL.md` holds what a long conversation keeps when it is compacted: where the run
  is, the eleven steps in a line each, and the rules that always hold. `.one-shot/progress.md` keeps the step, the
  decisions so far and what's next, so a run picks up where it was after a compaction or in a new session.
- **A map of the starter and the scripts:** `references/tools.md` says what each starter file holds and each
  script's usual call, so the agent doesn't read their source. Each reference is read once, when its step comes.
- **Scored rounds:** after each round the agent scores the page five ways in `critique-N.md` (first screen, idea,
  craft, full, words) and names the three worst problems. Findings from `look` and habits from `refuse.md` cap the
  scores, and the page is ready for the finish at 7 or more on all five.
- **A reviewer that didn't build it.** Before the person sees the site, a reviewer in a fresh context gets only the
  brief and the site, takes its own `look` (and `film` when the page moves), scores design, originality, craft and
  function, and hands the three worst problems back to the builder as exact changes. The builder fixes them and a
  second review checks again; there is no third round. The Claude Code plugin brings it as `one-shot-site:reviewer`
  (`agents/reviewer.md`); otherwise a helper agent, or a step of its own after clearing the context, runs
  `references/reviewer.md` as its whole prompt.
- **Full pages.** The action stays in reach: a button in the header on a desktop, a bar at the bottom of a phone,
  and one beside each price or date. A business or event page has seven to ten sections, each answered in full.
  Body text is about 19px on a desktop and small text no smaller than 15px. The brief plans every picture with its
  fallbacks (their own, free photos, then drawn), never an empty band or icons for the goods. A Warm look keeps a
  warm ground. One live thing comes from the facts (open now, the next date, a calculator from the prices), and
  `site:hours` marks today's row in the business's time zone.
- **Desktop width:** every screen at 1440 px is looked at to the last, rows are capped, drawings scale with the
  screen and the ending runs in full bands. `look` names desktop screens left mostly empty. What a page drops is
  replaced by scale, the full content, a picture or a field of colour.
- **Fewer first choices:** `lint` names the fonts agents reach for first and the skill's own repeats.
- **New checks:** a theme colour that drifted from the page, contrast over textures and background pictures, split
  headlines read once, steadier film timing, a section or heading outside `<main>`. Pages that only forward to
  another are skipped. A `|day` filter writes a date with its weekday.
- **Look, never send.** While checking, the agent never submits a form, clicks a `mailto:`, `tel:` or `sms:` link
  or opens an address through the system; it reads the link instead. The scripts' browser stops app addresses in
  the page it opens, and a page that forwards to one stops with "Not opened".
- **No repeats of recent sites.** When an audit says Ready to ship, the site's look (fonts, colours, mood, first
  screen) joins a list of the last 24 in `~/.one-shot-site/history.json`, and `mockup.mjs --concepts` names a
  concept that repeats one. It never leaves the machine; `ONE_SHOT_HISTORY=off` turns it off.
- **Open now:** `<!-- site:open-now -->` says "Open now · until 17:00" or when it opens next, in the business's
  time zone, with the week's hours for a page without JavaScript. Hours in a headline come from it, never typed.
- **Software sites:** version, download, licence, price and maker go into the structured data, and download and
  docs links aren't counted as profiles; join, donate, order and map links are things to do.
- **new-site:** `--ground` gives the first palette and the browser bar the brief's ground; the legal pages get the
  same bar and the theme addon's script; a person, an organization, a group or software gets no currency unless
  `--currency` names one; every empty field in `site.json` is listed at the end; `--facts` fills `site.json` from a
  redesign's facts once the person has confirmed them. The starter has a `.gitattributes`, its home links work on a
  GitHub project page, and a base path that Git Bash rewrote is repaired. GitHub Pages works without `gh`, step by
  step.
- **Stricter input:** every script prints its options with `-h`, stops on an unknown option with a did-you-mean
  and on a number out of range with the range. `set-url.mjs` takes only http or https and stops before writing
  when `site.json` is broken. `look`, `film`, `images og` and `safari` refuse a file, or a folder without
  `index.html` unless the pages are named; `images og` writes nothing for a page that isn't there. `publish.mjs
  branch` keeps the build's `CNAME`, or says the custom domain goes. A `CHROME_PATH` that isn't a browser is
  named, and the installed one is used.
- **Script fixes:** a server that takes the connection and never sends the page stops the run in 30 s with exit 2,
  where it used to wait for the browser's 120 s limit, and a page still loading after 30 s is a finding. The footer
  links from `--legal de` work under a base path (a GitHub project page). `mockup.mjs --concepts` names a font that
  didn't load and exits 2, so that sheet isn't shown; `study.mjs` stops on a page that answers 4xx or 5xx;
  `new-site` exits 1 when `npm install` fails; `look` and `safari` stop when every page only forwards. An option
  that takes a value stops when nothing follows it (`--out` alone).
- **Safer publishing, serving and downloads:** `publish.mjs branch` needs `--force` to publish onto `main`,
  `master` or the branch you are on, refuses a `--branch` that starts with `-`, and a `--dry` run ends with "Dry
  run: nothing was pushed." The local server serves nothing that a link in the folder points to outside it, and the
  scripts' browser refuses downloads. `photos.mjs get` takes only pictures, up to 40 MB, from http or https
  addresses. `redesign.mjs` refuses more local address ranges and checks every address a name resolves to. A broken
  `history.json` is kept as `history.json.bak`.
- **look measures more:** a first screen mostly empty around a small headline, an `h1` hidden or below the first
  screen, off-centre margins, a long blank stretch, a long part with no heading, the habits `refuse.md` names
  (kickers, cream accents, glows, heavy shadows, side stripes, boxes in boxes, flat type) by rule name, and the box
  that sticks out furthest. It lets entrances settle before each shot, and `--reduced` keeps its own folder,
  `.one-shot/look-reduced`. `lint` fails a `site:` block marker inside a `<p>`.
- **First screens:** the three differ on a phone too; a concept may set its rows in a third font, crop its object
  round or keep its title small. In Gentle motion the headline is there from the start and only what follows
  rises in.
- **A benchmark to run yourself:** `npm run bench:examples` scores the example sites with a checkout's checks,
  and `npm run bench` has an agent build each scenario from scratch (`evals/README.md`).

The examples and docs:

- The three first examples (Kleiner Kaffee, Jonas Weber, Patch Night) rebuilt with this version, from the same
  answers and material, each by a fresh agent that read only `SKILL.md`. The old ones were made with 0.1.0.
- Two more examples, made with 0.3: Klempnerei Brandt, a plumber's site in German with an Impressum, and Moth
  Orchestra, a band's tour page with its dates in `site.json`.
- A redesign example, Fahrrad Hollerbach: a made-up 2008 site read by `redesign.mjs` and rebuilt, with its
  before and after.
- The examples use made-up streets, a made-up venue and no real brands or platforms, so none can be taken for a
  real business. Each one's pictures open it live on the project page, with "See the run" beside them.
- README: what it does in one line and its three points, a clip of the example sites, the six
  steps of a run as one picture, installs for Claude Code, Codex and other agents through `npx skills`, redesigns
  and other versions, which currency and legal pages a site gets, and answers on cost, privacy and what it won't do.
- `examples/README.md`: one page with every example, its answers, and desktop and phone views.
- `docs/`: a project page built from the examples (`docs/build.mjs`), the pictures and clips it uses
  (`docs/make-media.mjs` remakes the clip and the pictures with the skill's own tools; the launch film's come
  from the film), and a GitHub Pages workflow that stays idle
  until Pages is turned on.
- For contributors: `CONTRIBUTING.md` with "How changes get in", issue forms, a pull request template, CODEOWNERS
  and Dependabot for the workflows' actions.

## 0.3.0 (2026-10-20)

- `film.mjs` records the first seconds and a slow scroll as filmstrips, or as a video with `--video`. It times
  every animation and finds layout shifts, slow headlines, endless loops, canvases drawing off screen, and
  movement left on with reduced motion.
- Effects addon, with no library: split headlines, count-ups, drawn lines, wipes, a marquee with a pause button,
  magnetic buttons, tilt and page cross-fades. All of them stop with reduced motion.
- `photos.mjs` finds free photos on Openverse, shows them on a numbered sheet, and fetches the chosen ones in web
  sizes with their credits. The audit checks that CC BY photos are credited on the page.
- `study.mjs` measures a site the person likes (colours, type, spacing, corners, how much it moves) so the brief
  can take its feel, never its content.
- `look.mjs --numbers` puts 1, 2, 2a… on the screenshots, so changes can be asked for by pointing.
- The starter preloads its first fonts, so text no longer jumps when they arrive. `film.mjs` found it; the three
  examples got the same fix.

## 0.2.0 (2026-10-20)

- `site.json` holds contact details, address, opening hours, closures, the menu, events and links. A build step
  puts them into every page and writes the structured data for search engines from the same file. A missing fact
  stops the build and says which one.
- Changing a live site: skip the interview, change the facts or the pages, check, commit and publish again.
  `EDITING.md` for the owner, and an optional Pages CMS form for `site.json`.
- `mockup.mjs` draws the person's own name and line in up to six looks, or in three colours, so they can choose by
  picture.
- Local pack: a Google Business Profile and Search Console checklist, booking and payment links, menus as HTML,
  verification tags and cookieless analytics from `site.json`.
- Legal pack: `new-site --legal de` adds an Impressum and a privacy page, filled from `site.json`. The embed addon
  loads maps and video only on a click. `set-url` fills in the host for known hosts.
- New audit checks: local data, event data, PDF menus, third-party requests, Impressum and privacy page. og:image
  is found on project pages that live under a path.
- German day names in opening hours, and tests for all of the above.

## 0.1.0 (2026-10-20)

- The skill: `SKILL.md` and its references, a Vite starter, and the motion, 3D hero, sound and theme extras.
- Scripts: `new-site`, `look`, `audit`, `lint`, `palette`, `images` and `publish`. The checks drive the installed
  Chrome over the DevTools protocol, with nothing to install.
- Tests (palette contrast, lint, copy, and browser runs) and CI on Linux, Windows and macOS.
- `audit --draft` until the address is known, and `.one-shot/allow.json` for deliberate exceptions.
- `look` catches faked bold, sideways scroll on phones, identical variants, and text that never appears.
- Generated-text checks in lint and audit: inflated words, trailing "-ing" comments, set-up-and-reveal
  contrasts, pasted chat answers, Title Case headings and bold labels.
- `set-url.mjs` sets or changes the address and rewrites the sitemap.
- Three example sites: a café, a developer's portfolio and an event.
- Safety: site names and paths are checked before they reach a shell; every script exits 2 on bad input and 1 when
  it found faults.
