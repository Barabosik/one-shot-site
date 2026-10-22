# Third-party notices

one-shot-site is MIT-licensed (see [LICENSE](LICENSE)). That covers the files in this repository.

This repository contains no third-party code and no font files. The third-party media in it are a few photos and
the launch films' music, both listed below. The sites the skill builds pull the packages below from npm when they
are installed. Each package keeps its own licence, and its files carry its notice. This page says what they are, so
you know what a built site contains.

## Packages that end up in a built site

| Package | What for | Licence | Where it comes in |
|---|---|---|---|
| [Vite](https://vite.dev) | builds the site | MIT | every site, dev dependency |
| [axe-core](https://github.com/dequelabs/axe-core) | accessibility checks in `audit.mjs` | MPL-2.0 | every site, dev dependency; the audit loads it into the test browser, and it is not part of the built site |
| [GSAP](https://gsap.com) | scroll motion for the "Lively" and "Showpiece" settings | GSAP Standard "No Charge" License ([text](https://gsap.com/standard-license)) | optional; added with the `motion` addon (Lively or Showpiece) |
| [three.js](https://threejs.org) | the 3D hero | MIT | optional; added only when a 3D hero is chosen |
| Fonts from [Fontsource](https://fontsource.org) | self-hosted type | SIL Open Font License 1.1 | sites that use a Fontsource font. The six example sites use Anybody, Archivo, Brygada 1918, Chivo, Hanken Grotesk, IBM Plex Sans, Imbue, Karla, Public Sans, Saira Stencil One and Work Sans; the project page uses Schibsted Grotesk |

Things to know:

- **GSAP is not open source.** Its licence lets anyone use it, including for commercial sites, at no charge. Its
  terms also bar a few uses, such as building a visual animation tool that competes with Webflow's. A website
  built with this skill is an ordinary use. The terms were last read on 20 October 2026; the page at the link above
  is the one that counts.
- **axe-core is MPL-2.0.** That licence only asks for changes to axe-core's own files to be shared. This repository
  does not copy or change any of them.
- **Fonts under the OFL** are free to use and to embed in a site. The licence file travels with each Fontsource
  package in `node_modules`. Keep it there, and don't re-save the font files under the same name after changing
  them.
- **[Lighthouse](https://github.com/GoogleChrome/lighthouse)** (Apache-2.0) runs only if the person has already
  installed it, and only when asked (`audit.mjs --lighthouse`).
- **[Playwright](https://playwright.dev)** (Apache-2.0, Microsoft) and the WebKit build it downloads (open source
  under BSD and LGPL licences, [webkit.org](https://webkit.org)) are used only if the person has already installed
  them, and only when asked (`safari.mjs`). They are not bundled, not listed as a dependency and never installed by
  the skill.
- **Chrome, Edge, Brave or Chromium** is driven over the DevTools protocol. None of them is bundled or downloaded.

## Maths

The colour maths in `palette.mjs` uses the published OKLab matrices by Björn Ottosson
([bottosson.github.io/posts/oklab](https://bottosson.github.io/posts/oklab/)). The code around them is original.

## Photos

The skill can look up free photos on [Openverse](https://openverse.org), or on
[Wikimedia Commons](https://commons.wikimedia.org) when Openverse is down or finds nothing (`photos.mjs`). It asks
only for public domain, CC0 and CC BY ones. Each photo keeps the licence its creator gave it.
`photos.mjs get` writes the credit for every photo into `public/img/CREDITS.md`, and the audit fails a CC BY photo
that isn't credited on the page. Openverse takes its licence data from the source sites and doesn't check it, and
Commons relies on its uploaders, so a photo that matters should be checked at its source page, which the credits
file links to.

The redesign example, `examples/fahrrad-hollerbach/`, is the one place photos are stored in this repository: two,
as WebP files under `site/public/img/`. Its screenshots (`before-after.jpg` and the others) also show the old site's
three other photos. All five are from Wikimedia Commons, and none of the licences asks for a credit. They are listed here as a courtesy:

| Photo | Author | Licence | Commons file |
|---|---|---|---|
| A wheel in a truing stand | Foxtod | CC0 1.0 | [Bicycle wheel truing stand.jpg](https://commons.wikimedia.org/wiki/File:Bicycle_wheel_truing_stand.jpg) |
| A spoke wrench in use | Scott Ehardt | public domain | [Spoke wrench in use.jpg](https://commons.wikimedia.org/wiki/File:Spoke_wrench_in_use.jpg) |
| Old pliers on a workshop wall (old site only) | Syced | CC0 1.0 | [Old tools on personal workshop wall 3.jpg](https://commons.wikimedia.org/wiki/File:Old_tools_on_personal_workshop_wall_3.jpg) |
| A navy bicycle's front wheel (old site only) | freestocks.org, via Unsplash | CC0 1.0 | [Navy bicycle with wheel (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Navy_bicycle_with_wheel_(Unsplash).jpg) |
| A rear cassette and chain (old site only) | Wayne Bishop, via Unsplash | CC0 1.0 | [Wheel and gears of bicycle (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Wheel_and_gears_of_bicycle_(Unsplash).jpg) |

## Music

The launch films (`docs/media/launch-film-*.mp4`) carry a music track that is not this project's and not MIT: "100"
(Electro House Dance Music) by Freccero, from [Pixabay](https://pixabay.com/music/upbeat-freccero-100-116208/),
under the [Pixabay Content License](https://pixabay.com/service/license-summary/). That licence allows it in a
video, also commercially, with no credit required; it is credited here as a courtesy. It does not allow selling or
sharing the track on its own. The licence was read on 20 October 2026; the page at the link is the one that counts.

## Services and names

GitHub Pages, Vercel, Netlify, Cloudflare, GoatCounter, Plausible, Formspree, Web3Forms, Pages CMS, eRecht24 and
Datenschutz-Generator.de are named in the docs because the skill can work with them. Their names belong to their
owners. This project has no connection to any of them.

The example sites are made up. Names, addresses and email addresses in them are invented, and the email domains
end in `.example`, which no one can register.

## Words

The word lists in `scripts/lib/words.mjs` (the plain-words checks) draw on the patterns Wikipedia's editors collect
in [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (CC BY-SA 4.0). They are
single words and short phrases; none of the page's text is copied.

## What the skill copies into a site

`new-site.mjs` copies the starter, the add-ons (`src/addons/`) and the check tools (`tools/one-shot/`) into the new
site. Those files are MIT-licensed like the rest of this project, and the site's owner may use and change them
freely. The licence text is in [skills/one-shot-site/LICENSE.txt](skills/one-shot-site/LICENSE.txt), inside the
skill folder, so it travels with the skill when it is installed on its own.

## Ideas from other skills

Some ideas in this skill grew out of reading other people's skills. They are open source, and none of their text is
copied here; everything is written in this repository's own words. They are credited because they helped:

- [impeccable](https://github.com/pbakaus/impeccable) by Paul Bakaus (Apache-2.0)
- [frontend-design](https://github.com/anthropics/skills) from Anthropic's skills repository (Apache-2.0)
- [taste-skill](https://github.com/Leonxlnx/taste-skill) by Leonxlnx (MIT)
- [Emil Kowalski's skills](https://github.com/emilkowalski/skills) (MIT)
- [GSAP's skills](https://github.com/greensock/gsap-skills) from GreenSock (MIT)
- [web-quality-skills](https://github.com/addyosmani/web-quality-skills) by Addy Osmani (MIT)
- [scroll-craft](https://github.com/nateherkai/scroll-craft) by nateherkai (MIT), for measuring text contrast
  against the pixels behind it (the over-media check)
- [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) by Vercel (MIT), for
  `translate="no"` on the name and the input attributes (the translate-name and form-field lint rules)
