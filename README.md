<h1 align="center">one-shot-site</h1>

<p align="center">
  <a href="https://nikita-andreiev.com/one-shot-site/"><img src="https://img.shields.io/badge/website-nikita--andreiev.com-ff2d75?style=flat" alt="Website: nikita-andreiev.com/one-shot-site"></a>
  &nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-24292f?style=flat" alt="License: MIT"></a>
  &nbsp;
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-read-24292f?style=flat" alt="Changelog"></a>
  &nbsp;
  <a href="#install"><img src="https://img.shields.io/badge/install-one%20command-24292f?style=flat" alt="Install: one command"></a>
</p>

<p align="center">
  <a href="https://nikita-andreiev.com/one-shot-site/"><img src="docs/banner-readme.webp" width="100%" alt="Open the website, nikita-andreiev.com/one-shot-site (this picture is a link). one-shot-site: a few questions in, where a card asks how the site should feel and Warm is picked; a finished, checked website out, with the example sites, a café's site live on a laptop and a phone, and its audit saying Ready to ship."></a>
</p>

<p align="center">
  <a href="https://nikita-andreiev.com/one-shot-site/"><b>Open the website →</b></a><br>
  <sub>How it works, six examples, the film and the install</sub>
</p>

**Answer a few multiple-choice questions. Your agent builds a finished website, checks it in a real browser at
phone and desktop size, and puts it online.**

One shot: you answer once, it does the rest.

One skill, start to live site. No hunting for design skills, checkers or deploy tools.

1. **Made for people who aren't designers, all the way to a live address.** Multiple-choice questions anyone can
   answer, three ideas drawn with your own name to pick from (one is always the classic), then it publishes the
   site and checks it live.
2. **Ready to launch, not just good-looking.** Before it hands over, it checks what going live needs: link
   previews, dead links, keyboard and screen-reader basics, speed, motion filmed over time, and the legal pages a
   German business needs. It fixes things until the audit says "Ready to ship".
3. **Easy to keep up to date.** Hours, prices and events live in one place; "we're closed on the 24th" is one
   sentence to your agent, and every change is saved.

An agent skill, built and tested in Claude Code. It uses the open [Agent Skills](https://agentskills.io) format,
so Codex, Cursor and other agents can load it too.

![Three example sites loading, each with the interview answers that made it in its title bar](docs/media/hero.gif)

<sub>Three runs, three sites. The answers that made each one are in its title bar. The businesses are made up.</sub>

## Try it

1. Install it: `npx skills add Barabosik/one-shot-site -a claude-code` (`-a codex` or `-a cursor` for those;
   [other ways](#install))
2. Open your agent in an empty folder.
3. Say **"make me a website"**.

It asks six or seven multiple-choice questions, then for any text and photos you have. It shows you three ideas,
then three first screens, to pick from, builds the whole site, checks it in a browser at phone and desktop size,
and puts it online where you choose. You never need to know a hex code, a font name or a framework.

A whole site takes up to two hours of agent time, often under one. After that, say what you want in your own
words:

- *"make it calmer"*
- *"another idea for the menu"*
- *"new hours from 1 November"*
- *"redesign my site"*, with the link to the old one
- *"publish it"*

## What you get

- A fast static site that's yours: plain HTML, CSS and JavaScript, no framework, nothing to pay for every month.
- Calm by default: a light ground, your colour on the buttons rather than everywhere, and no tricks on your name.
  Bold and dark looks come when you pick them.
- Real pictures first: your own, free photos you may use (with the credits right), or old pictures of your town.
  Drawings only when there are none, or when you'd rather have none.
- Checked before it ships: phone layout, contrast (on photos too), accessibility, link previews, search, speed and
  dead links.
- Put online on GitHub Pages, or handed over as a folder: those two are what the tests cover. It also supports
  Vercel, Netlify, Cloudflare and your own domain.
- Like another site? Give it the link. It measures the colours, type, spacing and motion, and takes the feel, never
  the content.
- Motion that's checked: it films the page loading and scrolling, and catches jumps and endless loops.
- Change things by pointing: screenshots come numbered, so "make 2a bigger" is enough.
- Ready for Google Maps. An Impressum and a privacy page to fill in when you say the business is in Germany or
  Austria.

## Made with it

Six runs, six made-up clients. Each started from the answers under its picture and a few lines about the business;
each picture opens the site live.

<!-- The pictures open the examples at https://nikita-andreiev.com/one-shot-site/<name>/, where docs/build.mjs
     puts them. If the project page moves, that address is the one string to replace, here and in examples/. -->

<table>
  <tr>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/kleiner-kaffee/"><img src="examples/kleiner-kaffee/desktop.jpg" width="400" alt="Kleiner Kaffee, a café site"></a></td>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/klempnerei-brandt/"><img src="examples/klempnerei-brandt/desktop.jpg" width="400" alt="Klempnerei Brandt, a plumber's site in German"></a></td>
  </tr>
  <tr>
    <td align="center"><b>Kleiner Kaffee</b><br>Warm&nbsp;· Gentle&nbsp;motion<br><a href="https://nikita-andreiev.com/one-shot-site/#run-kleiner-kaffee">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/kleiner-kaffee">Source</a></td>
    <td align="center"><b>Klempnerei Brandt</b><br>Bold&nbsp;· No&nbsp;motion&nbsp;· In&nbsp;German<br><a href="https://nikita-andreiev.com/one-shot-site/#run-klempnerei-brandt">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/klempnerei-brandt">Source</a></td>
  </tr>
  <tr>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/moth-orchestra/"><img src="examples/moth-orchestra/desktop.jpg" width="400" alt="Moth Orchestra, a band's tour page"></a></td>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/jonas-weber/"><img src="examples/jonas-weber/desktop.jpg" width="400" alt="Jonas Weber, a developer portfolio"></a></td>
  </tr>
  <tr>
    <td align="center"><b>Moth Orchestra</b><br>Night&nbsp;· Showpiece&nbsp;· Sound<br><a href="https://nikita-andreiev.com/one-shot-site/#run-moth-orchestra">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/moth-orchestra">Source</a></td>
    <td align="center"><b>Jonas Weber</b><br>Bold&nbsp;· Lively&nbsp;· Light&nbsp;and&nbsp;dark<br><a href="https://nikita-andreiev.com/one-shot-site/#run-jonas-weber">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/jonas-weber">Source</a></td>
  </tr>
  <tr>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/fahrrad-hollerbach/"><img src="examples/fahrrad-hollerbach/desktop.jpg" width="400" alt="Fahrrad Hollerbach, a bike workshop's site, redesigned"></a></td>
    <td align="center" width="50%"><a href="https://nikita-andreiev.com/one-shot-site/patch-night/"><img src="examples/patch-night/desktop.jpg" width="400" alt="Patch Night, an event page"></a></td>
  </tr>
  <tr>
    <td align="center"><b>Fahrrad Hollerbach</b><br>A&nbsp;redesign&nbsp;· Gentle&nbsp;motion<br><a href="https://nikita-andreiev.com/one-shot-site/#run-fahrrad-hollerbach">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/fahrrad-hollerbach">Source</a></td>
    <td align="center"><b>Patch Night</b><br>Night&nbsp;· Showpiece&nbsp;· Sound<br><a href="https://nikita-andreiev.com/one-shot-site/#run-patch-night">See&nbsp;the&nbsp;run</a>&nbsp;· <a href="examples/patch-night">Source</a></td>
  </tr>
</table>

[examples/](examples) has every answer, the phone views, the brief, the full source, and the small fixes made after
each run.

## Already have a site?

Say *"Redesign my site"* and give the link. It reads the old site first: the text of every page, your photos,
opening hours and contact details, and a picture of each page. It asks only about the look, and sends back the
facts it found for you to confirm in one go. The new site keeps all of it, or the brief says why something goes,
and keeps what people know you by: the name, the logo, a colour. At the end you see each old page next to the new
one, at desktop and phone size. This is for a site that is yours; a site you only like gives its feel, never its
words or photos.

| Before | After |
|---|---|
| <a href="examples/fahrrad-hollerbach"><img src="examples/fahrrad-hollerbach/before-desktop.jpg" width="400" alt="A made-up bike workshop's site from 2008: a yellow menu column, a Comic Sans banner"></a> | <a href="https://nikita-andreiev.com/one-shot-site/fahrrad-hollerbach/"><img src="examples/fahrrad-hollerbach/desktop.jpg" width="400" alt="The same workshop, redesigned: a stencil headline and a repair tag with the prices"></a><br><a href="https://nikita-andreiev.com/one-shot-site/fahrrad-hollerbach/">Open the live site →</a> · <a href="https://nikita-andreiev.com/one-shot-site/#run-fahrrad-hollerbach">See the run</a> |

*Fahrrad Hollerbach, a made-up workshop: [every page, old and new](examples/fahrrad-hollerbach).*

## Ask for other versions

At any point, say *"show me another idea"*, *"another idea for the prices"* or *"make it warmer"*. It saves the
site as it is, makes three real versions side by side, says which one it would pick and why, and you answer with
a letter or a mix. Any earlier version can come back.

## How it works

![How one run goes, in six steps, with the pictures each step makes](docs/media/how-it-works.jpg)

1. You answer two rounds of multiple choice: what the site is for, how it should feel, colours, how much it
   moves, what a visitor should do. Then you send what you have in one message. "Skip, write it for me" is fine.
2. It writes a brief: facts only you have, the one job of the site, and the sections. Before any code it asks
   whether this would look the same for anyone else. If it would, the brief gets rewritten.
3. It writes three ideas, each from a different fact, and draws them with your own name and words. It says which
   one it would keep, and you pick. Then it builds the top of the page three ways around that idea; pick one or
   mix two.
4. It builds every section of the brief with real content and real images. A lint catches filler words and
   generated-sounding text as it goes.
5. It takes screenshots at phone, tablet and desktop size, reads them and fixes what's wrong, at most three rounds,
   then back to the brief. It films the motion, and a reviewer that didn't build it names the three worst problems.
6. An audit has to say "Ready to ship"; then you see it numbered, so "make 2c bigger" is enough. It publishes
   where you chose, after you say yes, and hands over the address and a short guide to changing things later.

<details>
<summary>What the checks look like</summary>

Numbered screenshots, so you can answer "2a smaller" instead of describing it:

![A numbered desktop screenshot of the café site](docs/media/numbers-desktop.jpg)

A filmstrip of the first three seconds, to see what moves, in what order, and when it stops:

![Sixteen frames of the event page loading, each labelled with its time](docs/media/filmstrip.jpg)

When words like "warm" or "bold" don't help, the looks drawn with your own name:

![The café's first screen drawn as Warm, Bold and Quiet](docs/media/pick-a-look.jpg)
</details>

## Install

**With [skills](https://github.com/vercel-labs/skills)** (Claude Code, Codex, Cursor and other agents):
```
npx skills add Barabosik/one-shot-site -a claude-code
```
`-a` names your agent: `claude-code`, `codex`, `cursor` and others. Without it, the skill can land in a folder for
each of about 20 agents. Add `-g` to install it for every project instead of only this one.

**Claude Code, as a plugin:**
```
claude plugin marketplace add Barabosik/one-shot-site
claude plugin install one-shot-site@one-shot-site
```
Inside Claude Code the same works as `/plugin marketplace add Barabosik/one-shot-site`, then
`/plugin install one-shot-site@one-shot-site`.

**By hand:** copy the folder `skills/one-shot-site` to where your agent looks for skills. Claude Code reads
`.claude/skills/` in a project and `~/.claude/skills/` for every project. Codex, Cursor, Gemini CLI and GitHub
Copilot all read `.agents/skills/` and `~/.agents/skills/`.

**The reviewer** ([How it works](#how-it-works), step 5) comes with the plugin as `one-shot-site:reviewer`. With
the skill alone, the same review runs in a fresh context. In Cursor, copy `agents/reviewer.md` into your
project's `.cursor/agents/` to have it by name (not tested yet).

### Requirements

- Node 22.12 or newer, and git
- Chrome, Edge, Brave or Chromium. The checks drive the browser you already have; there's no Playwright or
  Puppeteer to download. Only the optional Safari check (`safari.mjs`) uses Playwright's WebKit, and only if
  you've installed it.
- An agent that can run shell commands. Agents other than Claude Code should work but haven't been tested yet.
  Where the agent has a question picker (Claude Code does), the questions come as one; elsewhere as a numbered
  list you answer with "2" or "1,3".

<details>
<summary>The tools inside (they work on any site)</summary>

```
node skills/one-shot-site/scripts/look.mjs https://example.com     # screenshots + layout problems
node skills/one-shot-site/scripts/audit.mjs dist                    # everything to fix before launch
node skills/one-shot-site/scripts/film.mjs https://example.com     # filmstrips of how it moves + motion problems
node skills/one-shot-site/scripts/study.mjs https://example.com    # colours, type, spacing and motion, measured
node skills/one-shot-site/scripts/palette.mjs --brand "#d9480f"     # a full colour set that passes contrast
```
No installs: they use the Chrome you already have. `-h` prints a script's options; a misspelt option or a number
out of range stops it with a hint instead of running with the defaults.
</details>

## Questions

**What does it cost?**
The skill is free and MIT-licensed. Your agent costs what it always costs; a full run is a long session, because
the agent looks at many screenshots. GitHub Pages hosts a site like this for free from a public repository
(Netlify and Cloudflare have free plans; Vercel's free plan is for non-commercial use), so a domain name is the
only thing you might need to buy.

**What leaves my computer?**
The skill has no server and sends nothing on its own. The checks run in your own browser against a copy of the site
on your machine. It goes online only to install packages from npm (Vite, axe-core, the fonts, and GSAP or three.js
when an add-on needs them), to draw the looks with fonts from Fontsource (through `cdn.jsdelivr.net`), to search
Openverse (or Wikimedia Commons when Openverse is down or finds nothing) for free photos, unless you said no
photos, and download the ones picked from the hosts they name, to open sites you name, to test the site's outside
links, and to publish, which it asks you about first. You log in to your host yourself; it never handles passwords or tokens.
Your agent talks to its own model provider as usual. On your machine, it keeps a short list of the last 24 sites'
looks and folders (in `~/.one-shot-site/`) so new ones don't repeat them; `ONE_SHOT_HISTORY=off` turns it off.

**Which currency, and which country's legal pages?**
Prices are in the currency of the business's country. The skill takes the country from what you told it, else the
phone number's country code, else the legal pages you asked for, and only then the region in the site's language:
en-GB gives pounds, en-US dollars, de-CH francs, and about fifteen more countries their own (Canada, Australia,
Japan, Sweden…); any other gets euros. A person, a group or software gets no currency. Say so if it should be
another. The legal pages, an Impressum and a privacy page in German, come only when you say the business is in
Germany or Austria; it never guesses from the language, and asks at the end if you didn't say. The Impressum cites
German law (§ 5 DDG); for an Austrian site, change that to § 5 ECG. Other countries get no legal pages yet, so
check what yours asks for.

**What won't it do?**
- Make up facts: no invented clients, numbers, awards, quotes or team members. When something is missing, it
  asks once and designs around the gap until you answer.
- Copy a site you like. It takes the feel, never the words, logo, pictures or layout.
- Pass off a free photo as your own shop, team or work.
- Build an app: no user accounts, databases or checkout of its own. It links to your booking page or shop.
- Add a framework, a page builder or Tailwind. Every file stays plain and yours.
- Give legal advice. The German Impressum and privacy page are templates for you to check.

**Can I change the site later?**
Yes. Open your agent in the site's folder and say what changed: "espresso is 2.60 now", "add the March concert".
It skips the interview, makes the change, checks the changed pages and publishes again.

## More

[CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · Credits and
third-party licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Feedback and ideas: [open an issue](https://github.com/Barabosik/one-shot-site/issues) or write to
[contact@nikita-andreiev.com](mailto:contact@nikita-andreiev.com).

MIT · made by [Nikita Andreiev](https://nikita-andreiev.com)
