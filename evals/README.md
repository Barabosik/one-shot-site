# Benchmark

Every change to the skill gets a number. Five tools, from free to expensive:

| Command | What it does | Cost |
|---|---|---|
| `npm run bench:score -- <site>` | Scores one built site: the skill's own checks, one 0–100 score, a score card and a contact sheet | free, 1–2 min |
| `npm run bench:examples` | Scores every site in `examples/` with this checkout's checks | free, 1–2 min a site |
| `npm run bench -- --only <n>` | An agent builds scenario *n* from `scenarios.json` from scratch with this checkout's skill; then score and expected-behaviour checks | an agent run, 30–120 min |
| `npm run bench:triggers` | Checks that the skill's description makes Claude pick it for website requests, and only for those | a few cents per query |
| `node evals/head-to-head.mjs` | The skill against a plain agent: same person, same answers, same checks, then blind picks by judges and by people | a plain agent run per scenario, plus judges |

Without the npm scripts: `node evals/score.mjs`, `node evals/examples.mjs`, `node evals/run.mjs`,
`node evals/trigger.mjs`. Everything runs offline except the agent runs (and whatever the agent fetches).
`test/evals.test.mjs` tests the benchmark itself, offline, in under a second. `test/publish.test.mjs` tests
`publish.mjs` without the internet: `--dry` for every host, and the branch route pushed to a bare repository on disk.

Every one of these except the trigger test opens a headless browser. On a machine several agents share, run one
browser job at a time (the agent route's `--lock <folder>` does that for the agents it starts).

## Before and after a change

- **You changed a check** (a script in `skills/one-shot-site/scripts/`): run `node evals/examples.mjs` before and
  after. The example sites don't change, so every point that moves comes from your change, and the report lists
  each finding that appeared or went away. Under 1.5 points on one site is noise.
- **You rebuilt the examples** with a newer skill: `node evals/examples.mjs --from <folder>` scores the sites in
  that folder (one per subfolder) the same way, with their sameness.
- **You changed how the skill builds sites** (`SKILL.md`, `references/`, `assets/`): that needs an agent run of the
  scenario your change is about (`npm run bench -- --only <n>`, up to two hours), on main and on your branch. Put
  both numbers in the pull request ("kleiner-kaffee NN → NN, expectations N/N → N/N").

## How the score is made

`score.mjs` runs, on one built site: `lint` (source), `look` at 390 and 1440 px, `film` and `film --reduced` (at
1440), and `audit` (with `--draft` while the site has no address, and with axe-core). A site with dark colours
(`prefers-color-scheme: dark` or `[data-theme="dark"]` in its CSS) also gets `look --scheme dark`: the browser is
pinned to light otherwise, and a dark palette has its own contrast faults. Lighthouse runs when it is installed
but is never part of the score, so the number doesn't depend on what happens to be installed.

A site can silence a rule: `.one-shot/allow.json` (lint and audit drop it) or a `one-shot: allow <rule>` comment
(lint skips that line). That is meant for deliberate choices, but an agent short of "Ready to ship" can use it to
pass, so lint and audit score a copy of the source without either, and the card lists what the site allowed. A
comment the skill's own starter has (word for word, like the skip link's `outline-none`) stays. The one rule
excepted is `made-up-address`: the examples and scenarios use `.example` addresses on purpose, so when a site
allows it, it isn't counted. (A site that doesn't allow it loses 5 launch points for it. The examples allow it in
their `.one-shot/allow.json`.)

The findings of all tools are merged: a fault two tools see (look and audit both measure contrast; audit repeats
lint) counts once. Every finding belongs to one part of the score and costs **5 points for a fail, 1 for a warn**,
inside its part only:

| Part | Points | Rules (examples) |
|---|---|---|
| Accessibility | 25 | contrast, axe-core, alt, labels, keyboard, focus, tap targets, tiny text, headings |
| Layout | 20 | sideways scroll, long or overflowing headlines, text at the edge, never-shown content, fake bold, broken images |
| Launch checks | 20 | title, description, link previews, icons, structured data, broken links, placeholders, photo credits, image weight, third parties, script errors |
| Motion | 15 | reduced motion (missing rule, hidden content, things that still move or loop), endless loops, offscreen drawing, jank, ease-in, transition: all |
| Craft | 10 | copy and code tells: filler and generated-sounding words, vague buttons, Title Case, gradient text, eyebrows, default violet |
| Speed | 10 | measured, not counted (below) |

Speed is a straight line from full points at "good" to none at "bad":

| Measure | Points | Good | Bad |
|---|---|---|---|
| Headline readable after first paint (film) | 3 | 0.8 s | 2.5 s |
| Layout shift while loading and scrolling, the worse of film and film --reduced | 3 | 0.02 | 0.25 |
| JavaScript on the first visit, gzipped (audit) | 2 | 150 KB | 500 KB |
| First visit, all bytes (audit) | 2 | 1000 KB | 3000 KB |

The findings for these four (`slow-headline`, `layout-shift`, `budget`) aren't charged again. The weights live in
`evals/lib/scoring.mjs`; `test/evals.test.mjs` fails when a script gains a rule that no part of the score knows, so
a new check can't be silently ignored.

A score is **partial** when a check couldn't run (a URL has no source for lint and no files for audit; a site
without axe-core misses its broadest accessibility check). The card says which, and a partial score isn't
comparable with a full one.

Output, in `<site>/.one-shot/score/` (or `--out`): `score.json`, `score.md` (points per part, the measures, each
tool's fails and warns, every finding once) and `sheet.jpg` (desktop and phone screens, and the first seconds of
motion, on one picture).

## How much the score moves

- **Same site, scored again:** under 1.5 points is noise. Lint, look, audit and axe-core give the same findings
  every time; the movement is film's timing of the headline and of layout shifts, more of it on a machine other
  agents are busy on.
- **Same scenario, built again by the agent:** the agent makes a different site each time, so a scenario moves far
  more than the scorer does. Until that is measured, treat changes under 8 points on one scenario as noise, and
  look for the same direction across most scenarios.
- **Expectations** are pass or miss, and most are read by a judge: one flipped expectation on one scenario is not
  a trend.

## The scenario run

`run.mjs` builds each scenario in `evals/scenarios.json` the way a person would get it, in a work folder in the
runs folder (`one-shot-site-runs/evals/<time>/<scenario>/`, next to the repository, never inside it). The skill
under test is copied into the work folder's `.claude/skills/one-shot-site`, so the run never uses
`~/.claude/skills` or a plugin. Two routes:

**The agent route** (the standard one: no CLI login needed). `--prepare` writes the work folders and a
`task.md` per scenario: the skill copy to use, the person's first message, all their answers up front, and the run's
rules. Another session gives each task.md to a fresh agent. That agent can't ask anyone, so it writes the questions
it would have asked into `interview.md` and takes the answers from the task. With `--lock <folder>` (or
`BROWSER_LOCK`) the task also tells the agent to take that mkdir lock around every script that opens a browser, so
agents built one after another never run two browsers at once. When a lock helper sits next to the lock folder
(your own optional `locked.mjs`: waits for the lock, runs one command, always releases it), the task gives the
agent one command per browser script through it instead. Each agent keeps its scratch files in a `scratch` folder
beside its `work`. Then, from the session that started the agents:

```
node evals/run.mjs --prepare --skill-ref main --lock <browser.lock>   # or --skill-dir <path>
# one fresh agent per task.md, one at a time; their transcript paths go in <run>/agents.json
# ({ "<scenario>": "<path>.jsonl" } or { "<scenario>": { "transcript": "<path>.jsonl" } })
node evals/run.mjs --score-only --from <time> --judge files --only 1   # one site per browser turn: --only 2, 3 …
# one judge agent per scenario reads <run>/<scenario>/judge-prompt.md and writes judge.json
node evals/run.mjs --score-only --from <time> --keep-scores
```

`--keep-scores` reuses each scenario's `score/score.json` when the same checks made it after the site's last build,
so the last step needs no browser: the summary and the sameness cover every scenario, and the lock
was taken once per site.

**The claude -p route** (one command, needs a logged-in `claude` CLI).

> This route runs Claude Code with permission prompts off, in a scratch folder next to your checkout. It is not a
> sandbox: deploy commands are denied and `gh`, Netlify and Vercel get dead tokens, but the agent can still run
> any other command (curl, `node -e`, another deploy tool) and use the network. It gets an allow-list of your
> environment (`lib/agent.mjs`: what the system, Node, npm, git and Chrome need, proxy settings and Claude Code's
> own login), not all of it, but files on disk are as open to it as to you. Run it in a container, a virtual
> machine or a throw-away user, with nothing you would mind an agent reading. `--budget` caps the spend. The
> trigger test's claude -p route and the judge run the same way. The agent route has none of this: its agents run
> under the permissions of the session that starts them.

Claude Code runs headless (stream-json in and
out) with only project settings, so only the copied skill exists for it. A simulated person answers: the question
tool is answered from the scenario's `answers` by `lib/answerer.mjs` (an MCP server used as the permission prompt
tool), and when the agent stops for a plain-text reply, `lib/sim.mjs` sends the material, then "go with what you
recommend". The judge is a second, read-only `claude -p`.

```
node evals/run.mjs --only 1 [--skill-dir <path>] [--model opus] [--parallel 2] [--budget 30]
```

Neither route is meant to publish anything: the rules for the agent say never push, deploy or publish, and on the
claude -p route deploy commands are denied and `gh` and the deploy CLIs get dead tokens. That stops the usual ways
and accidents, not an agent set on another way (see the warning above).

Then each site is built and scored, and each expected behaviour is checked: by script where it can be (below),
otherwise by the judge, which follows `evals/judge.md` and reads the transcript, the brief, the pages and the
screenshots. Results go to `evals/results/<time>/` (not in git): `summary.md`, `summary.json`, and per scenario the
score card, the contact sheet and `result.json`. With `--save-baseline` a run is kept on your machine
(`evals/baseline.json`, not in git), and later summaries end with a comparison against it.

**Sameness, across the batch.** Each site scores alone, so five sites from one template could all score 99. The
summary adds one number for the whole run, 0–100, lower is better: how many sites share the most common font (the
Fontsource imports and @font-face rules the site loads, not every font installed), the most common ground colour
(light/mid/dark and its tone), the most common footer build (wordmark: the site's name set on its own; statement: a
big closing line that isn't the name; columns; plain), the most common first-screen pattern, plus how often
sections on one page repeat one shape. All but the first screen are read from the source (`lib/sameness.mjs`). The
first screen is measured by the scorer at 1440 px (`lib/firstscreen.mjs`): where the h1 and the biggest picture sit
gives one of layout.md's patterns (type-led, image-led, split, object, statement + proof), shown on each score card
too. It is a rough label for "all five are a split", not a verdict on one site. Redesigns and change requests
aren't counted, and the summary names them: they keep the look the business already had (SKILL.md: "keep what
people know them by"), so their look isn't the skill's own choice. An example is a redesign when its brief's
heading says so or it was read with `redesign.mjs`; a scenario, when it has `serve` (redesign) or `start` (change
request).

Options: `--only 1,3` (number, slug or part of a name), `--skill-dir <path>` or `--skill-ref <branch>` (the skill
under test; a ref leaves uncommitted edits out), `--score-with <path>` (the checks to score with: keep them fixed
when two branches change the checks), `--score-only [--from <time>]` (score a run's sites again, no agent),
`--judge files`, `--no-judge`, `--rejudge`, `--save-baseline`; for claude -p also `--model`, `--parallel`, `--budget`,
`--timeout`, `--ask text` (no question tool, so the interview happens in plain text).

### Expected behaviour

Items in `expected_behavior` are text, or `{ "text", "auto": [checks], "judge": true }`. Without `auto` the judge
decides; with both, both must pass. The checks:

| Check | Passes when |
|---|---|
| `ran:<regex>` | a shell command the agent ran matches |
| `order:<A> then <B>` | the first tool call matching A came before the first matching B (`write <path>`, `read <path>`, or a command) |
| `file:<path>`, `no-file:<path>` | the file is (not) in the site folder |
| `grep:<path>:<regex>` | the site file contains it |
| `asked` | the interview offered choices: the question tool, or questions with options in interview.md |
| `audit:ran`, `audit:ready` | the scorer's audit ran / said Ready to ship |
| `axe:0` | axe-core ran and found nothing |
| `film-reduced:clean` | film --reduced has no fails |
| `headline<=S`, `js<=KB` | measured by film / audit |
| `no-finding:<rule>` | the score has no finding with that rule |
| `pages>=N` | the built site has N pages or more, not counting 404, og, variants and legal pages |
| `facts-kept` | every pattern in the scenario's `facts` is on a built page |
| `site-json-kept` | `site.json` is as it was before the run (or there was none before or after) |
| `text-kept`, `text-kept:after-first-screen` | the pages' words are as before (every heading, paragraph, item, link); the second leaves out the section with the h1 |
| `only-changed:<regex>` | every file the run added, changed or removed matches (builds, installs and `.one-shot/` aside) |

### The twelve scenarios

Five build a site from nothing (coffee bar, portfolio with dark mode, event with sound, yoga studio that likes
another site, bakery with free photos), four more cover what those miss (a band with tour dates, a food bank with
two audiences, an app waitlist, a practice with four pages), and three start from something:

- **A redesign:** `"serve"` names a fixture, `fixtures/zur-linde/`: a made-up restaurant's site as a 2009 page
  would have it (tables, scrolling text, a tiled background, a visitor counter, a dead guestbook link), with real
  facts in it. The run copies it to `old-site/` and serves it on `http://127.0.0.1:4817/`
  (`fixtures/serve.mjs`, this machine only); the person points the agent at that address. `"facts"` lists what
  must survive, and the person's material changes one thing (the opening hours).
- **Two change requests:** `"start"` names a site the skill made (an example). The run copies it into the work
  folder as the person's site, committed, as if the skill had made it earlier, and keeps a copy in `before/`.
  "Make it warmer" (jonas-weber) and "show me another hero" (kleiner-kaffee) are scored on the three things that
  matter for a change: the facts kept (`site-json-kept`, `text-kept`), only the asked part changed
  (`only-changed`, `text-kept:after-first-screen`), and the checks still passing (`audit:ready`).

## Skill vs a plain agent (head-to-head)

A tool for your own runs: it puts the skill next to a plain agent on the same scenarios, and what it finds stays
with you. For each scenario of an agent-route run (the skill arm), a fresh agent with no skill builds a site for
the same person from the same first message and answers: "make the best site you can, finished", the same tools
(Node, npm, Vite, the web), the same rules about publishing and the browser lock, and about two hours. Its task
names no script, check or step of the skill, and it is told not to use the Skill tool; its transcript is checked
for that afterwards. Then:

1. **The same checks on both.** `--score` runs `score.mjs` with this checkout's checks on both arms, plus
   Lighthouse (phone and desktop presets, on a local server) from one install for both. The made-up addresses
   are excused on both alike (`accept` in `scoreOnce`), and axe-core is the version the starter installs.
2. **Blind judges.** `--judges` makes one folder per judgment: the brief and the home page at 1440 and 390 px
   (up to 8 screens at each width; the report says per site how many of its screens they saw) for site A and site
   B, under random ids. Every pair is judged in both orders by the same number of
   fresh judge agents (3 each way by default), which pick one, no ties, with one sentence why. `--tally` reports
   the win rate with counts, each pair, and how often the site shown first won (50% = no position bias).
3. **People.** `--vote-page` writes `blind-vote/index.html` from the same screenshots: each voter gets the pairs in
   a new random order and sides and picks one per pair. Votes stay in that browser (`#results` shows the count,
   copies or saves them). Nothing is published; open the file locally. People see whole pages: `--whole` (a
   browser job, with `--score-with` the same checks) shoots a home page taller than the judges' 8 screens again,
   every screen, into `whole/<arm>/<scenario>`, and the vote page takes those.
   `--more <out>,<out>` adds those rounds' pairs as a second part the voter may skip, and a round's `h2h.json`
   `"names": { "skill": …, "plain": … }` names its sides on the results view. A round with no judges (`--judges`
   never run) gets a report of the checks and the builds' cost only, its looks left to people.
   `--vote-page --live` gives people the sites themselves instead of screenshots: each built site is copied into
   `live-vote/` under a path that says nothing (`/p1/3fa2/`), its root links moved under that path, and a small
   script on every page turns its forms and mail, phone and text links into demos that send and open nothing. The
   page shows a pair side by side, each at 1440 or 390 px scaled to fit, and `live-vote/serve.mjs` serves it all on
   this machine: `node live-vote/serve.mjs live-vote --port 4831`.

```
node evals/head-to-head.mjs --prepare --from <run> --lock <browser.lock>
# one fresh agent per plain/<scenario>/task.md
node evals/head-to-head.mjs --score --from <run> --only <scenario>    # each scenario on its own browser turn
node evals/head-to-head.mjs --judges     # then one fresh agent per judges/<id>/prompt.md
node evals/head-to-head.mjs --tally      # head-to-head.md
node evals/head-to-head.mjs --whole --score-with <checks>   # pages taller than 8 screens, whole
node evals/head-to-head.mjs --vote-page  # blind-vote/index.html
```

The score and the findings are the skill's own checks, which the skill arm is built to pass, so they are reported
as counts next to two measures that aren't the skill's: axe-core and Lighthouse. The blind picks don't use the
checks at all.

One `--out` folder is one round: a skill run, its plain arm, its scores and judges. To compare scores across
rounds, score them all with the same frozen checks (`--score-with`, a `git archive` of one commit) and the same
`--tools`. `--tally --with <out>,<out> --dest <dir>` puts several rounds in one report, and `--vote-page` takes the
same options. The report also gives what each build took, read from its agent's transcript (`agents.json` of each
arm): minutes at work (a gap of 30 minutes or more is a pause and isn't counted), tool calls, and tokens (every token
read and written, cache included, and the tokens written). The tokens include every agent a build started (the
skill's reviewer, say), found by the `.meta.json` next to each transcript, which names its parent; the report
also says how often each skill build called the reviewer and what each `review-<n>.md` said. A round's `h2h.json`
can hold `about` (which briefs) and `notes` (anything that happened to the run), and both go in the report. To try
a new skill against the same plain sites, give the new round's `h2h.json` `"plain": "<the earlier round's folder>"`:
that round's plain builds, scores and transcripts are used as they are, and counted once in a report of both. A list
(`"plain": ["head-to-head-r2a", "head-to-head"]`) takes each pair's plain arm from the first of those rounds that
prepared it; a pair none of them has is prepared and built in the new round. Each round's section of the report also
counts the words that mark a site down in the judges' reasons (louder, colder, busier, odd, plain, with their forms).
People's votes stay in the voter's browser; a `people.md` you write next to the report (in `--dest`) goes into it
under the judges' tally. A control arm checks the judges themselves: `--prepare --arm-skill <a skill's folder>
--only <scenarios> --out <dir>` gives the plain agent's exact task with that one skill installed in its project
(built into `<dir>/arm`), and with `"plain"` in `<dir>/h2h.json` it is scored and judged in the skill's place.
Each plain or control-arm builder keeps its scratch files in a `scratch` folder beside its `work`, since the agents
of one session otherwise share a scratchpad and builds running together overwrote each other's files.

## Trigger test

`triggers.json` holds 29 first messages: 15 that should load the skill (sites, portfolios, event pages, a change to a
site it made, a redesign, a site that looks dated or AI-made, "put my CV online") and 14 near misses that shouldn't
(a React nav bug, a Next.js component, a Hugo deploy, a WordPress speed question, a poster, a logo, an email
newsletter, an accessibility audit of someone else's shop, a paragraph that "sounds AI-written").

- **claude -p route:** each message goes three times to a headless Claude Code that has only this skill. The first
  tool it reaches for decides (the Skill tool, or reading the skill's SKILL.md, is a trigger), and the run is
  stopped there. This is what skill-creator's trigger eval does.
- **Agent route** (`--prepare`, then `--score <time>`): three agents each get the skill list as Claude Code shows it,
  with 14 other common skills next to this one (frontend-design, web-artifacts-builder, canvas-design,
  theme-factory…), and the messages in a different order, and say which skill they would load first. A proxy: it
  asks for the decision instead of watching it.

A message passes when it triggers in at least half of its runs and should, or in less than half and shouldn't.
`--description "…"` tries another description without touching SKILL.md.

## Known limits

- The score can't see taste. A clean, generic template scores as well as a site a studio would sign. The judge's
  expectations (the bold move, invented facts, the first screen) cover some of it; the contact sheet is there so a
  person can look.
- Good sites bunch at the top, so the top of the scale separates less than the bottom.
- The agent route answers everything up front, so it can't test the back-and-forth of a real interview (whether
  the agent asks one round at a time). The claude -p route with the simulated person can.
- The trigger proxy asks agents what they would do; it can be more generous than a real first message. Use the
  claude -p route for a decision about the description.
- A theme switch that ignores the system setting (only `[data-theme]`, no `prefers-color-scheme`) is looked at
  in light only: `look --scheme dark` can't reach it. The skill's theme addon follows the system, so it is covered.
- Sameness needs a batch: it says nothing about one site, and five scenarios is a small batch.
