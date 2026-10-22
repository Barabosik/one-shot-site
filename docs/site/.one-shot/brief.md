# Brief: one-shot-site, the project page

Made with the skill itself, run by its maintainer. The page people land on from the launch posts.

**Answers:** A product or app · Not sure, show me (Quiet, Bold, Night drawn; picked A's calm and space, B's pink as
one field, C's grotesk) · My own colour: the pink of the number tags, #ff2d75 · Lively motion · Goal: install it
· Light and dark · One language

**A site I like:** the project page of another agent skill (studied for ideas, nothing copied). From it: two type sizes far apart, warm
near-neutral colours with no decoration, real product pictures large, and one moment that explains the product.
Not its dark developer look, its smooth-scroll library or its footer wordmark.

## 1. Facts only it has

1. Six or seven multiple-choice questions, then one message for your material. "Skip, write it for me" is fine.
2. Before any code it writes a brief and asks: would this fit any other business? If yes, it rewrites the brief.
3. It writes three ideas from facts only you have and draws them on your own name and words. You pick one.
4. Six example sites, six runs, made-up clients, each with the answers that made it. None look alike.
5. It checks the site in the Chrome, Edge, Brave or Chromium you already have: no Playwright, no Puppeteer.
6. Screenshots come back with pink number tags (1, 2, 2a), so "make 2a bigger" is a whole instruction.
7. It films the page loading and scrolling and catches jumps and loops that never stop.
8. Nothing ships until its audit says "Ready to ship", and it asks before it publishes anything.
9. Give it your old site and it reads every page first, keeps your words and facts, and shows before and after.
10. Hours, prices and events live in one file: "we're closed on the 24th" is one sentence to your agent.
11. Plain Vite, HTML, CSS and JavaScript. No framework. Every file is yours. Free, MIT.
12. Built and tested in Claude Code. Other agents read the format but are untested.

## 2. The one job

A developer or a small-business owner arrives from a launch post wanting to know whether the sites are really
good and how much work it is, and should leave having copied the install command.

## 3. Three ideas, one kept

```
Idea A · Answers in the address bar (kept)
  idea:   every site on the page sits in a browser window whose address bar holds the answers that made it;
          the try-it questions fill that bar and open the real site those answers made
  from:   facts 1 and 4; the README's clip already puts each site's answers in its title bar
  move:   object
  bold:   one big browser window running a real example site, its bar reading "A small business · Warm · Gentle"
  line:   Answer a few questions. Get a finished website.
  mood:   quiet
  brand:  #ff2d75
  fonts:  Schibsted Grotesk, Schibsted Grotesk
  tell a friend: "you tap four answers and the page opens a real site the skill made from them"

Idea B · Six questions, six sites
  idea:   the first screen is the six answer sets as a list, each row opening the site it made
  from:   fact 4; each example's README lists its answers
  move:   rows
  rows:   A small business · Bold · Still | Klempnerei Brandt
          An event · Night · Showpiece | Moth Orchestra
          A redesign · Gentle | Fahrrad Hollerbach
          A small business · Warm · Gentle | Kleiner Kaffee
          Me and my work · Bold · Lively | Jonas Weber
          An event · Night · Showpiece | Patch Night
  line:   Six sets of answers. Six websites.
  mood:   bold
  brand:  #ff2d75
  fonts:  Schibsted Grotesk, Schibsted Grotesk

Idea C · Ready to ship
  idea:   the audit's last line is the headline; every site on the page passed the same gate
  from:   fact 8
  move:   proof
  proof:  Ready to ship | the audit's verdict on every example site
          0 | placeholders, invented quotes or links to # in any of them
  line:   Nothing ships until it says so.
  mood:   night
  brand:  #ff2d75
  fonts:  Schibsted Grotesk, Schibsted Grotesk
```

Kept: A. Swap: another builder can't show its answers next to six real, running sites. Job: the window is the
proof and Install stays on the first screen. Phone: the window shows the phone version. What we have: the six
sites are in examples/. B is a good second screen (it becomes the window's list); C needs nothing new and becomes
the checks section.

## 4. Sections, each with one claim

```
Hero · split          Claim: a few answers become a finished, checked website.  Proof: the launch film in a window; Install.
Why · three           Claim: it takes care of the parts that aren't design.      Proof: three things, one picture each.
One run · sequence    Claim: you answer once, it does the rest.                  Proof: the café's run, in order, as the run showed it.
Six sites · object    Claim: six runs, six sites that look nothing alike.        Proof: the real sites, live, answers in the bar.
Try it · sequence     Claim: the questions are easy: no hex codes, no fonts.     Proof: four real questions open the closest real site.
Redesign · one thing  Claim: your old site goes in, your words and facts stay.   Proof: a before/after slider.
Install · band        Claim: one command, then say "make me a website".          Proof: every route, copy buttons, what happens next.
Contribute · column   Claim: issues first; every PR is tested on three systems.  Proof: the links and the rules.
Questions · rows      Claim: no server, nothing sent on its own, free.           Proof: the three answers.
Footer                Ends on: this page's own answers, in the address bar, and its brief.
```

## 5. The look

- Mood: Quiet, with one Bold moment (the Install band is the pink field).
- Colour: quiet strategy, light by default with a dark palette (theme addon, follows the system). Ground a
  near-white with a hint of the pink's hue; the pink only on the action, the number tags and the Install field.
- Type: Schibsted Grotesk for everything (a newspaper grotesk: sturdy at poster size, plain at 18 px). Two sizes
  far apart: a 6-9vw headline and an 18 px text. Commands in the system's own monospace (no font to load).
- Motion: Lively, spent in two places: the Install panel grows out of the button you pressed and walks you
  through the next steps; the example window loads the real sites, so their own entrances play. Everything else
  is a short reveal. Reduced motion: no growth, no live autoload (a still and a button), the film waits for a press.
- Bold move: the browser window, as wide as the page, with a real site running in it.

## 6. Genericness test

1. Hero for another builder? The line alone could be; the window with answers and a real site under it can't.
2. Stock headings? None ("Features", "Why choose us" are out).
3. Category colour? No: pink, from the skill's own number tags, not dev-tool blue, green or purple.
4. A section because sites have one? The FAQ answers the three questions launch threads ask; the rest each prove one fact.
5. Something to tell a friend? Yes: the live sites and the questions you can take.
6. Blurred, do sections look alike? No: split, window, cards, sheet, slider, three objects, pink band, column, rows.

## 7. Missing

- Nothing. (The launch film is in: media/launch-film-*.mp4, 2026-10-21.)

## Allowed exceptions (.one-shot/allow.json)

- `made-up-address`: the six example sites are built into the page, and they are made-up businesses with
  `.example` addresses on purpose (each allows the same in its own allow.json). The page itself has no made-up
  address.

## Positioning (2026-10-20)

The hero says what it does in 10 seconds (the short line, then the full sentence); "What it takes care of"
gives the three things in 30 seconds, one picture each; "One run, start to finish" shows the café's run.
