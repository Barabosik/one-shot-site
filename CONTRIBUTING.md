# Contributing

Thanks for helping. Bug reports, fixes, better checks and new examples are all welcome. This page says how the
repo is laid out, how to test a change, and the few rules that keep the skill's output good.

## What's where

| Path | What it is |
|---|---|
| `skills/one-shot-site/SKILL.md` | The run, step by step. The agent reads this first; keep it under 500 lines. |
| `skills/one-shot-site/references/` | Longer guides the run loads when it needs them: interview, brief, looks, copy, motion, deploy… `tools.md` maps the starter's files and the scripts' usual calls, and `reviewer.md` is the reviewer's whole prompt. |
| `agents/reviewer.md` | The plugin's reviewer agent, `one-shot-site:reviewer`: a fresh context that follows `references/reviewer.md`. |
| `skills/one-shot-site/scripts/` | The tools: `look`, `audit`, `film`, `lint`, `palette`, `mockup`, `photos`, `study`, `new-site`, `publish`… |
| `skills/one-shot-site/assets/` | The starter site, the addons, deploy and legal templates. |
| `test/` | `node --test` suites, including real browser runs. |
| `evals/` | The benchmark: scenarios with the answers to give and the behaviour to expect, and the scorer. |
| `examples/` | Finished example sites with their answers, briefs and screenshots. |
| `docs/` | The project page (`docs/site/`, itself a one-shot-site project made with the skill), its pictures, and the scripts that build and make them. |

## Test a change

You need Node 22.12 or newer and Chrome, Edge, Brave or Chromium. If the browser isn't found, set `CHROME_PATH` to
its executable.

```
npm test
```

There is nothing to install first: the tests use Node's own test runner and drive the browser you have. The
browser runs take a few minutes. CI runs the same command on Linux, Windows and macOS.

Then measure it, before and after the change, and put both numbers in the pull request.
[evals/README.md](evals/README.md) has the details:

- A change to a check (a script in `scripts/`): `npm run bench:examples` scores the example sites with your
  checkout's checks. It's free and takes a few minutes.
- A change to how the skill builds sites (`SKILL.md`, a reference, the starter): `npm run bench -- --only <n>`
  has an agent build scenario *n* from scratch. That is a full agent run, 30 to 120 minutes, so pick the scenario
  your change is about. It runs `claude -p` with permission prompts off: read the warning in evals/README.md and run
  it in a container or a VM.

Check the change on a real site too: build one of the examples and run `look`, `film` and `audit` on it.

## Rules for the scripts

- No Playwright, no Puppeteer, no image libraries. The scripts talk to the installed browser over the DevTools
  protocol with Node's built-in WebSocket (`scripts/lib/chrome.mjs`). The one exception is the optional Safari
  check: `safari.mjs` uses Playwright's WebKit only if the person already has it installed, and otherwise says so
  in one line and stops. axe-core and Lighthouse are used when a site has them installed.
- Every script starts with a comment that shows how to call it and what it writes. That comment is also its `-h`
  help and its list of flags: `args(import.meta.url)` (`scripts/lib/cli.mjs`) stops on a flag the comment doesn't
  name, with a did-you-mean, so a new flag goes in the comment too. It also stops on a flag that takes a value but
  has none after it (`--out` alone), so a new on/off flag goes in `SWITCHES` in `scripts/lib/cli.mjs` as well (one
  that may stand alone or take a value, like palette's `--sheet`, in `OPTIONAL`). Read numbers with `num()` or
  `nums()`, which stop with the allowed range.
- Exit codes: 0 when all is well, 1 when it found something to fix, 2 for bad input. Messages say what to do next,
  in one line.
- Anything that reaches a shell is checked first (see `publish.mjs`).
- Add a test for every new check, with a page that has the fault planted in it.

## Rules for the words

Everything the skill writes, and everything in this repo, follows
[references/copy.md](skills/one-shot-site/references/copy.md): plain words, short sentences, facts instead of
claims. The lists of filler words and generated-text habits live in
[scripts/lib/words.mjs](skills/one-shot-site/scripts/lib/words.mjs), and `test/words.test.mjs` covers them. If you
add a word, add a test line for it.

The same goes for docs and commit messages: say what changed, not how great it is.

## Fictional clients only

Examples, evals, tests and screenshots use made-up businesses and people. No real company, person, account,
email address or phone number, and no real venue made to host a made-up event. Use `.example` domains for
addresses and email (they can never be registered) and invented numbers.

## Add an example

[examples/README.md](examples/README.md#adding-an-example) has the steps. Afterwards, run `node docs/build.mjs --page`
so the example's window appears on the project page (`docs/site/index.html`).

## The README pictures and the project page

- `node docs/make-media.mjs kleiner-kaffee=<dist> jonas-weber=<dist> patch-night=<dist>` remakes the README clip
  (`hero.gif`, `hero.mp4`) and the pictures drawn from the built examples, with the skill's own `film`, `mockup`,
  `look` and `audit`. `--page` makes the project page's own pictures (`redesign-before.jpg`, `page-idea-*`, and
  with `--run <site folder>` the "One run" section's `run-idea-*` and `run-screen-*`); `--now <built page folder>`
  makes `page-now-*`. The `launch-film-*` files come from the launch film, not from a script. It needs ffmpeg on
  the PATH (or `FFMPEG=/path/to/ffmpeg`), and `hero.gif` has to stay under 3 MB.
- `node docs/social-preview.mjs` draws `docs/media/social-preview.jpg`, the 1280×640 picture GitHub shows when the
  repository is linked, from three examples' screenshots.
- The project page is `docs/site/`, a one-shot-site project like any other: change it there, and its facts in
  `docs/site/site.json`. `node docs/build.mjs <folder>` builds it with every example site in it, into a folder
  outside `docs/`; the Pages workflow runs the same command. Check it as a run would:
  `node skills/one-shot-site/scripts/look.mjs <folder> --pages / --widths 390,1440` and
  `node skills/one-shot-site/scripts/audit.mjs <folder> --site docs/site --draft`.

## How changes get in

1. **Issue first.** Anything bigger than a typo or a clear bug fix starts as an issue ("New example or idea"),
   and the maintainer OKs it before the code. A large pull request nobody asked for may be closed, politely, with
   a pointer to an issue. Questions go to Discussions.
2. **Tests on three systems.** Every pull request runs `npm test` on Linux, macOS and Windows. All three have to be
   green.
3. **Numbers for behaviour changes.** A change to how sites get built (`SKILL.md`, `references/`, `assets/`) comes
   with scores from before and after it. A change to a check comes with `npm run bench:examples` before
   and after. The pull request template has a table for them.
4. **Tried for real.** Run the skill once in an agent with your change, not only the tests, and read your own diff
   before asking for review.
5. **AI help is fine.** Say in the pull request which assistant you used and for what.
6. **Review and merge.** The maintainer reviews every pull request and merges it with a squash merge. You stay the
   author of the commit. The maintainer adds themselves as `Co-authored-by` only after pushing fixes to your
   branch.
7. **`main` is protected.** No direct pushes and no force-pushes, for anyone. Everything goes through a pull
   request.

## Credit and releases

- Every merged change gets a line in [CHANGELOG.md](CHANGELOG.md) that ends with the pull request and the person:
  "… (#12, thanks @someone)". The release notes on GitHub say the same.
- Versions follow [SemVer](https://semver.org/) tags (`v0.5.0`), each with a CHANGELOG entry and a GitHub Release.
  `version` in `SKILL.md` and `.claude-plugin/plugin.json` matches the tag.

## Pull requests

Small and about one thing. Say what changed and how you checked it; the template asks for the rest. Line endings
are LF everywhere (`.gitattributes` takes care of it).

Found a security problem? Please don't open an issue; [SECURITY.md](SECURITY.md) says how to report it privately.
