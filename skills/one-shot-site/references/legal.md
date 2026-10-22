# Legal basics (EU, especially Germany)

Not legal advice. These are the common requirements for a small site; the person stays responsible for their
own pages, and anything unusual (a shop, a newsletter, health data, a regulated profession) is worth a lawyer
or a generator like eRecht24 or Datenschutz-Generator.de. Say this to them once, in one line, at handover.

## Who needs what

| Page | Who | Where |
|---|---|---|
| Impressum | Germany: any site with a business purpose, freelancers and associations included (§ 5 DDG, which replaced § 5 TMG in May 2024). Austria: § 5 ECG. | one click from every page, usually the footer |
| Privacy page (Datenschutzerklärung) | every site in the EU that isn't purely private: the host sees visitor IP addresses. Anywhere: a site that collects emails or messages (a waitlist, a form) | same |
| Cookie banner | only when the site sets non-essential cookies or loads third-party content before a click | the starter needs none |

`new-site.mjs --legal de` adds `impressum.html` and `datenschutz.html`, filled from `site.json` (`owner.name`,
`address`, `email`, `host`), and links them in the footer. Read both with the person and fill in only real
facts. Until `owner.name` is known the pages show `{{OWNER_NAME}}`: a draft audit lists it as waiting on them, and the
final audit stops on it, since the name is required. Ask for it; until it's in, both pages stay with the mark (never remove them to pass the audit). The
Impressum shows these `owner` fields only when they are filled in: `business` (the trading name, if it isn't the
owner's name), `register` ("Amtsgericht Leipzig, HRB 12345"), `vatId` (USt-IdNr.) and `chamber`
(chamber, professional title, the state that awarded it). A supervisory authority goes in by hand. Besides the
email the law wants a second quick way to reach them: `phone` shows when it's in site.json; without one, ask
for a number or add a contact form.

## Keeping the site banner-free

- **Fonts:** self-hosted through Fontsource, never `fonts.googleapis.com` (a Munich court awarded damages over
  Google-hosted fonts in 2022).
- **Maps and video:** a link, or the embed addon so nothing loads until the visitor clicks. `youtube-nocookie`
  alone isn't enough: it still contacts Google when the page loads.
- **Counting visitors:** GoatCounter, Cloudflare Web Analytics or Plausible set no cookies; put the code in
  `site.json` → `analytics` and `<!-- site:head -->` adds the script. Name the service in the privacy page.
- **Forms:** a form service (Formspree, Web3Forms, Netlify Forms) receives what people type; name it in the
  privacy page.
- The audit lists every other server a page contacts before any click (`third-party`). For a German site each
  one needs a reason, consent, or removal.

## Privacy page building blocks

Add only the paragraphs that are true, in the same plain style as the template.

- **Contact form:** "Was Sie in das Kontaktformular eingeben, geht über [Dienst, Sitz] an uns. Wir nutzen es
  nur, um Ihre Anfrage zu beantworten (Art. 6 Abs. 1 lit. b bzw. f DSGVO)."
- **Visitor counting:** "Wir zählen Besuche mit [GoatCounter / Cloudflare Web Analytics / Plausible], ohne
  Cookies und ohne Profile. Erfasst werden nur zusammengefasste Angaben wie aufgerufene Seiten und Herkunftsland
  (Art. 6 Abs. 1 lit. f DSGVO)."
- **Booking or payment link:** "Für Buchungen leiten wir Sie zu [Dienst] weiter. Dort gilt dessen
  Datenschutzerklärung."
- **Map or video on click:** "Karten und Videos von [Anbieter] laden erst, wenn Sie darauf klicken. Erst dann
  wird Ihre IP-Adresse an [Anbieter] übertragen (Art. 6 Abs. 1 lit. a DSGVO)."
- **Light/dark choice (theme addon):** "Ihre Wahl zwischen hellem und dunklem Design speichert nur Ihr Browser
  (localStorage); sie wird nicht an uns übertragen."

## Accessibility law

From 28 June 2025 the European Accessibility Act (Germany: BFSG) covers services where consumers book or buy
online. Purely informational sites are generally outside it, and micro businesses offering services (under 10
staff, under €2M turnover) are exempt. The skill's checks (axe-core, contrast, keyboard, reduced motion) are the
base either way.
