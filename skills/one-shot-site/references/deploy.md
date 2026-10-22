# Putting it online

Ask where it should live (one question, four choices: SKILL.md step 11), explain the choice in one line each, and
match it to the site: a business goes on Cloudflare or Netlify, whose free plans allow commercial use. Ask before
anything that pushes code, publishes or needs their account. The person logs in themselves. Never ask for or type
passwords or tokens. Run any `publish.mjs` command with `--dry` first and show the person where it will publish (the repository
and branch, or the host). For a GitHub branch the dry run ends with "Dry run: nothing was pushed." and "It would be
live at: <url>". Run it for real only after they say yes.

| Choice | Address | Cost | Needs |
|---|---|---|---|
| Cloudflare (recommended for a business) | `site.<account>.workers.dev` | free plan; a business may use it | a Cloudflare account (browser login once) |
| Netlify (the same) | `site.netlify.app` | free plan; a business may use it | a Netlify account (browser login once) |
| GitHub Pages (recommended for a person, a project or a club with GitHub) | `name.github.io` or `name.github.io/site` | free; GitHub's terms rule out running an online business, a shop or payments on it | a GitHub account, `gh` CLI helps |
| Vercel (only when they ask, for a personal site) | `site.vercel.app` | free for personal, non-commercial sites only; a business needs the paid plan | a Vercel account (browser login once) |
| Their own domain | `rosasbakery.de` | the domain's yearly fee | one of the above + access to the domain's DNS |
| Just the folder | — | — | nothing: hand over `dist/` and the repo |

Before any of them: the audit passes and the work is committed. The address is predictable for all of them
(GitHub Pages from the user and repo name; Vercel, Netlify and Cloudflare from the project name, which they
confirm on first deploy). Set it with `node SKILL_DIR/scripts/set-url.mjs . https://…/` (http or https only),
rebuild, run the audit
without `--draft`, then publish. If the host gives a different address, set that one and publish again.

## GitHub Pages

Ask for their GitHub username first: the address is `https://USERNAME.github.io/NAME/`, or
`https://USERNAME.github.io/` for a repo named `USERNAME.github.io`. Each step below has a `gh` command and the
same step on github.com for someone without `gh`.

**With Actions (recommended):** builds on GitHub on every push, nothing to run locally.

1. Create the repo (ask public or private; Pages on private repos needs a paid plan).
   - With `gh`: `gh repo create NAME --public --source . --push`
   - Without: they make it on github.com (New repository → NAME, nothing ticked, so it starts empty). Then
     `git remote add origin https://github.com/USERNAME/NAME.git` and `git push -u origin main`. Git asks them to
     log in (usually in the browser); they do that.
2. Copy `SKILL_DIR/assets/deploy/github-pages.yml` to `.github/workflows/deploy.yml`.
3. Turn Pages on for Actions: Settings → Pages → Source: GitHub Actions
   (or `gh api -X POST repos/USERNAME/NAME/pages -f build_type=workflow`).
4. Address and base path:
   - Repo named `USERNAME.github.io` → lives at `https://USERNAME.github.io/`, base `/`. Nothing else to do.
   - Any other repo → lives at `https://USERNAME.github.io/NAME/`. Set the base: Settings → Secrets and
     variables → Actions → Variables → New repository variable, `BASE` = `/NAME/`
     (or `MSYS_NO_PATHCONV=1 gh variable set BASE --body "/NAME/"`).
   - Own domain → base `/` (see below).
   Links: Vite fills `%BASE_URL%` with the base but leaves `<a href>` alone. Write every internal link as
   `href="%BASE_URL%page.html"` (home: `href="%BASE_URL%"`), never `href="/page.html"`. The footer links to
   `impressum.html` and `datenschutz.html` that `--legal de` adds are written that way already. #anchors on the
   same page need nothing.
   `public/404.html` is copied as it is: it links home and to its icon by the full address (`{{URL}}`, which
   set-url.mjs fills in), so it needs no prefix. A link added to it by hand needs the full address too.
5. Commit and push. Watch the run in the repo's Actions tab (or `gh run watch`). Live in about a minute.

**Without Actions (built locally, pushed to a branch):** build with the base first, `BASE=/NAME/ npm run build`
(PowerShell: `$env:BASE='/NAME/'; npm run build`). Then
`node SKILL_DIR/scripts/publish.mjs branch --repo https://github.com/USERNAME/NAME.git --branch gh-pages`
and Settings → Pages → Deploy from a branch → `gh-pages`. Each publish replaces the branch: it keeps the build's
own `CNAME` (from `public/CNAME`), and with no `--cname` and no `CNAME` it warns, because GitHub drops a custom
domain when that file goes. Since the branch ends up holding the built files only, `--branch main`, `master` or
the branch you are on stops with exit 2 unless `--force` is added: keep the site on `gh-pages`. `--dist <folder>`
publishes a build that isn't in `dist`.

**Git Bash on Windows** rewrites anything that starts with `/` into a path inside its own folder (`/NAME/` becomes
`C:/Program Files/Git/NAME/`). The starter's `vite.config.js` undoes that for `BASE`, but not for `--base`, `gh`
or other tools: put `MSYS_NO_PATHCONV=1` in front of any command that passes a `/path` (as in step 4).

## Vercel

First time only: `npx --yes vercel@latest login` opens the browser (and prints the link) and waits; the person logs
in there. Deploy itself never asks: it stops with "No existing credentials found"; don't take its `--temporary`
offer (that deployment is not on their account). `node SKILL_DIR/scripts/publish.mjs vercel --name SITE-NAME` runs
`vercel deploy dist --prod --yes --name SITE-NAME`, the same command every time: SITE-NAME is the project
(`SITE-NAME.vercel.app` when free). It prints the live URL. For a domain: `npx vercel domains add example.com`,
then set the DNS records Vercel shows.

## Netlify

First time only: `npx --yes netlify-cli@latest login` opens the browser and waits; the person logs in there (deploy
itself stops with "Authentication required"; don't switch to `--allow-anonymous`).
`node SKILL_DIR/scripts/publish.mjs netlify --name SITE-NAME` creates the site and saves its id in
`.netlify/state.json`; commit that file (nothing secret), so the same command publishes to the same site from any
copy. Without it, Netlify makes a new site `SITE-NAME-xxxxxxxx`. Domains: Netlify dashboard → Domain management,
then the DNS records it shows.

## Cloudflare

`node SKILL_DIR/scripts/publish.mjs cloudflare --name SITE-NAME` runs `wrangler deploy` with `dist` as static
assets. The first time, run `npx --yes wrangler@latest login` before it: it opens the browser and waits until the
person has logged in. Without it the deploy stops ("In a non-interactive environment … CLOUDFLARE_API_TOKEN"): run
the login instead, never ask for a token. Domains: add the domain to Cloudflare, then Workers → the site →
Domains.

## Their own domain

1. Ask where the domain is registered and whether they can log in there (they make the DNS changes, you tell them
   exactly what to enter).
2. GitHub Pages:
   - `www.example.com`: CNAME record `www` → `USERNAME.github.io`.
   - `example.com` (apex): A records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (and AAAA `2606:50c0:8000::153` … `8003::153` for IPv6).
   - Then Settings → Pages → Custom domain → enter it, tick Enforce HTTPS once the certificate is issued (can take
     up to a day). With the branch method, put the domain in `public/CNAME` (it ships with every
     build) or pass `--cname example.com` each time.
   - Verify the domain in GitHub settings (Pages → Verified domains) so no one else can claim it.
3. Vercel / Netlify / Cloudflare: use the records their dashboard or CLI prints; don't guess them.
4. Set the URL everywhere (canonical, og:url, og:image, sitemap, robots), rebuild, publish again.

## After publishing

```
node SKILL_DIR/scripts/look.mjs https://the-live-url/ --frames 3
```

- The page loads at the real address, with no errors and no failed requests.
- `https://the-live-url/does-not-exist` shows the 404 page.
- The link preview works: paste the URL into a chat with themselves, or check with a preview tool.
- Optional: submit the sitemap in Google Search Console (the person's account).

## The handover

Tell them, in a few lines:
- the live URL, and where the code lives (folder and repo)
- to edit: `npm run dev`, change `index.html` / `src/`, look at `http://localhost:5173`
- to check: `npm run audit`
- to publish again: `git push` (Actions) or the same publish command
