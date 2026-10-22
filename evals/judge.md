# Judging a benchmark run

You check one run of the one-shot-site skill against the expectations below: a coding agent was asked for a
website, a simulated person answered its questions, and the agent built the site. Scripts have already checked
what they can (their results are shown next to each expectation). You judge what needs reading or looking.

## How to judge

- Read before you decide. Open `transcript.md` for what was said, asked and run, the brief, the page source
  (`index.html` and `src/`), and look at the screenshots (`score/sheet.jpg`, `score/look/sheet-home-*.jpg`).
- Pass only with evidence you saw. When the evidence is missing (a file was never written, a step never ran,
  a screenshot doesn't show it), the expectation is missed. Don't give credit for intent.
- One expectation at a time. A run that is good overall still misses an expectation it doesn't meet, and a
  weak run still passes the ones it meets.
- Be literal about facts. The person's material is the only source of facts: names, numbers, prices, hours,
  addresses, dates, people. Any review, award, quote, client, team member, statistic or year that is not in the
  material is invented, and fails any expectation about not inventing things. Words describing the place in
  general ("small", "every Tuesday" when the material says so) are fine.
- Questions: "multiple choice" means the question offered options to pick from (the question tool, or a numbered
  list of choices). Asking for hex codes, font names, pixel sizes or framework names fails it.
- First screen: the part of the page visible before scrolling, i.e. screen 1 in the phone (390 px) or desktop
  (1440 px) sheet. "Visible" means readable in that screenshot, not hidden behind a menu or below the fold.
- Photos and pictures: placeholder boxes, empty grey slots, stock-looking mockups of a product the person doesn't
  have, or free photos captioned or framed as the person's own shop, team or work all fail. A drawn,
  typographic or abstract element that comes from the subject passes "designs around missing photos".
- Desktop use: judge from the 1440 px sheet, screen by screen. Wide margins and a text column of about 65
  characters are good typography and pass. It fails when a section's content sits in less than half the screen
  with nothing answering it on the other side, when a drawing or the hero is phone-sized in an empty field, or
  when a screen is mostly empty ground.
- Change requests ("make it warmer", "another hero"): compare `before/` with the site. Pass only what was asked
  changed, in the direction asked; a change that also rewrites copy, adds sections or moves facts fails "only the
  asked part". Warmer means warmer hues or friendlier type to an ordinary visitor, not a new layout.
- Redesigns: compare `old-site/` with the new site. Every fact on the old pages that the person didn't change
  must still be there; what made the old site dated (scrolling text, tiled background, table layout) should be gone.
- Copying another site: the site fails if it reuses that site's words, logo, pictures or recognisable layout.
  Sharing a general feel (dark, calm, thin type) is what was asked for and passes.
- The brief: an idea sentence "fails the competitor-swap test" when it would be false or odd for a competitor
  (another café in the same town); generic lines ("great coffee in a cozy atmosphere") don't.

## Evidence

Give one or two sentences per expectation, naming the file, the screen or the transcript step you used
("brief.md line 3 …", "phone screen 1 shows …", "transcript: look.mjs … --compare ran before the full build").
