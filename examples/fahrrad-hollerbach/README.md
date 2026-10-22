# Fahrrad Hollerbach

A made-up family bike workshop in Trier, redesigned from its old site.

**Answers:** A redesign · Not sure, show me · Keep our green and yellow · Gentle motion · Goal: bring the bike in

**What it was told:** the old site, from about 2008 and last touched in 2017: seven pages, a Comic Sans banner, a
visitor counter and a price list from 2015. `redesign.mjs` read it and drafted the facts: a family workshop in the
Speichengasse since 1958, three generations, no appointment needed, most repairs in two days, used and rental
bikes, opening hours and prices.

**What it did with that:** the repair tag that hangs on every bike in the workshop became the page. The first
screen says "Ihr Rad, repariert. Ohne Termin." in stencil letters, with a yellow tag of prices hanging beside it,
in the shop's own green and yellow. Every old page became a section, and the old addresses forward to it. The
news page, last updated in 2017, went.

| Before | After |
|---|---|
| ![The old site's home page: a yellow menu column, a Comic Sans banner and small photos](before-desktop.jpg) | [![The new first screen: a stencil headline and a yellow repair tag with the prices](desktop.jpg)](https://nikita-andreiev.com/one-shot-site/fahrrad-hollerbach/) |

[Open the live site →](https://nikita-andreiev.com/one-shot-site/fahrrad-hollerbach/) · [See the run](https://nikita-andreiev.com/one-shot-site/#run-fahrrad-hollerbach)

Every page, old and new, at desktop and phone size: [before-after.jpg](before-after.jpg). The three ideas it drew
with their name and words before building (the repair tag, three generations, a wheel trued by hand):
[concepts.jpg](concepts.jpg). "Not sure, show me" was answered by picking A from that sheet. The new first screen
on a phone: [phone.jpg](phone.jpg).

**Checked:** in the run, look, film and film with reduced motion found nothing. The audit, run again on the page
as the project page publishes it: Ready to ship, all clear, on all seven pages. The audit is told to accept the
made-up `.example` addresses (`.one-shot/allow.json`, with the reason in the brief).

**Photos:** all five, on the old site and the new one, are from Wikimedia Commons and free to use: Foxtod (CC0),
Scott Ehardt (public domain), Syced (CC0), freestocks.org (CC0), Wayne Bishop (CC0). The new site uses the first
two. None needs a credit; this line is a courtesy. The links to each photo's Commons page are in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md#photos).

**Fixed after the run:** the privacy page names GitHub Pages as the host, where the project page puts the example.
The site's `.gitignore` keeps the brief out of git, as the starter does; here it is kept, like the other examples'.
The old site was written for the run to look like 2008 and isn't in the repo; its pages are in `before-after.jpg`.
Later the social link stopped naming a network: "Fahrrad Hollerbach online". And the first screen got the row its
stylesheet was written for, the words beside the tag: the tag had been placed right with `justify-self` outside a
grid, which not every browser does, so there it fell under the words and covered the call button and the hours
link. With 0.5, the name keeps `translate="no"` in the header and the footer, so a translated page leaves it alone.

Source: [site/](site). Run `npm install && npm run dev` inside it. The facts live in
[site/site.json](site/site.json). Its `lint`, `look` and `audit` scripts need the skill's tools in
`tools/one-shot/`, which `new-site` copies in; they are left out here. The brief the run wrote is in
[site/.one-shot/brief.md](site/.one-shot/brief.md).
