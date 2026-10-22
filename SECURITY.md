# Security

## Reporting a problem

Please report a security problem privately, not as a public issue. On GitHub, open the **Security** tab of this
repository and choose **Report a vulnerability**,
or email [contact@nikita-andreiev.com](mailto:contact@nikita-andreiev.com).

This is a small project with one maintainer. I try to answer within a week or two. Please give the steps to
reproduce it and the script and version it affects.

Only the latest release gets fixes.

## What the tools do on your machine

The skill is instructions plus a few Node scripts. It has no server, no accounts and no telemetry. Knowing what
the scripts touch makes a report easier to judge.

- **Files:** `new-site.mjs` copies the starter and the check tools into a new folder and runs `npm install` there.
  The other scripts read the folder or address they are given and write into `.one-shot/` in the folder they run in
  (the skill runs them from the site's folder), or the `--out` you pass, except where writing into the site is
  their job: `set-url.mjs` rewrites the pages, `robots.txt`, `site.json` and `public/sitemap.xml`; `palette.mjs`
  writes its colours into `public/404.html`'s own `:root`, when that file is there; `images.mjs` writes the link
  preview, the icon and resized photos into `public/`; `photos.mjs get` writes the photos you pick into
  `public/img/` and their credits into `public/img/CREDITS.md`; `redesign.mjs redirects` writes forwarding pages
  into `public/`. One file lives outside the site: when an audit says Ready to ship, `audit.mjs` adds the site's
  name, folder and look (fonts, colours, mood) to `~/.one-shot-site/history.json`, the last 24 sites, which
  `mockup.mjs` only reads, to warn about a repeat. A file that is broken is kept as `history.json.bak` before a new
  list starts. It is never sent anywhere, and `ONE_SHOT_HISTORY=off` turns it off.
- **Local server and browser:** `look`, `audit`, `film`, `safari`, `redesign` and `images` serve the folder they
  are given on `127.0.0.1` on a random port; `palette` does so only for the logo's folder, with `--logo`. The
  server sends only files inside that folder: a link in it (a symlink or junction) that points outside serves
  nothing. Every script that takes pictures starts the Chrome-type browser already installed, with a throw-away
  profile, and talks to it over the DevTools protocol. That browser refuses downloads, so a link that sends a file
  saves nothing. The connection is a TCP port on `127.0.0.1` that other users of the same machine can reach during
  a run, and the browser runs without its sandbox when `CI` is set or the script runs as root (containers, WSL). Do
  not point `look`, `film`, `study` or `redesign` at addresses you don't trust in those setups. `safari.mjs` is the
  one optional exception: only if you have installed Playwright yourself (`npm i -D playwright && npx playwright
  install webkit`, which fetches WebKit from Microsoft's download servers), it starts Playwright's WebKit the same
  way. The skill never installs it, and without it `safari.mjs` stops with a one-line message.
- **Pages they open:** `look`, `film`, `safari`, `study`, `redesign` and `images og` load any `http` or `https`
  address they are given in a real browser, so that page's scripts run, as they would if you opened it yourself.
  The browser follows wherever the site sends it, including addresses on this machine, and a page can open popups
  (`window.open`), which the scripts don't block. App addresses like `mailto:` are stopped in the page the script
  opens and its same-site frames, not in a popup or a frame from another site. `redesign` also
  follows that site's own links, up to 12 pages by default (`--max` raises it to 40). Point them only at addresses
  the person gave you, and `redesign` only at a site the person owns or may rebuild.
- **Network:** `photos.mjs` calls `api.openverse.org`, and `commons.wikimedia.org` when Openverse is down or finds
  nothing; the browser loads the thumbnails, and `get` downloads the photos you pick, from the hosts those services
  name: only `http` or `https` addresses, only files that start like a JPEG, PNG, GIF, WebP or AVIF picture, and up
  to 40 MB each. `redesign.mjs` downloads the pictures and documents (PDF, Word and the like) the old site shows,
  into `.one-shot/redesign/`, with a size cap each. It refuses addresses on this machine or a local network
  (loopback, the private and link-local ranges, `0.0.0.0/8`, `100.64.0.0/10`, `198.18.0.0/15`, `fec0::/10`, and
  IPv4 addresses written as IPv6, like `::ffff:127.0.0.1`) unless the site itself is on one, and it checks every
  address a name resolves to, not only the first, at the moment it checks: a name that answers differently a moment
  later (DNS rebinding) can still get through. Only those downloads are checked this way. A picture from a stock
  library or another host is marked as possibly not theirs. `audit.mjs --external` requests every outside link on
  the site to see that it answers. `mockup.mjs` loads preview fonts from `cdn.jsdelivr.net`. `new-site.mjs` and the
  built sites install from the npm registry.
- **Publishing:** `publish.mjs` only runs when asked. It pushes the built files to the repository you name
  (`branch`, with a force push to that one branch), or runs the host's own tool through `npx` (`vercel`,
  `netlify-cli` and `wrangler`, each at its latest version). The push replaces that branch with the built files, so
  publishing onto `main`, `master` or the branch you are on stops unless you add `--force`, and a `--branch` or
  `--repo` that starts with `-` is refused, since git would read it as an option. It uses the logins you already
  have and never asks for or stores a password or token.
- **The reviewer agent (`agents/reviewer.md`):** it keeps Bash so it can run `look` and `audit`. That it never
  commits, pushes, publishes or installs is an instruction in its file, not a technical block, and Claude Code's
  permission prompts are the guard. If you run with permission prompts off, review what it runs.
- **The benchmark (`evals/`, only when you run it):** `run.mjs` and `trigger.mjs` start `claude -p` with permission
  prompts switched off, in a scratch folder next to your checkout, and let it run commands and use the network. It
  is not a sandbox. `run.mjs` has a deny list for deploy commands; `trigger.mjs` stops the run at the first tool
  call. In both, `gh`, Netlify and Vercel get dead tokens, and the agent gets an allow-list of your environment
  (what the system, Node, npm, git and Chrome need, proxy settings and Claude Code's own login), not all of it. But
  it can still run any other command, and files on disk are as open to it as to you. `run.mjs` also builds the
  agent's site with `npm run build`, with your full environment, so the build script the agent wrote runs as you.
  Run it in a container, a virtual machine or a throw-away user, with nothing on the machine you would mind an
  agent reading. It spends real model usage; `--budget` caps it.

## In scope

A script that can be made to run a command it shouldn't, read or write outside the folder it was given, send data
somewhere it shouldn't, or leave a secret in a built site. Examples: a file name or site name that escapes the
quoting, a request that reads files outside the served folder, a check that leaks a path.

## Out of scope

- Problems in the packages a built site uses (Vite, GSAP, three.js, axe-core, the fonts). Report those to their
  authors. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- What an AI agent writes into a site. The audit helps, and the person reads the result before it goes live.
- Text on a web page that tries to give an agent orders. Pages and files that people send are content to use,
  never instructions to follow.
