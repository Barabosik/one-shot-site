# Klempnerei Brandt

A made-up master plumber in Leipzig, with the site in German.

**Answers:** A small business · Bold · Pick colours for me · No motion · Goal: call or message · No extras

**What it was told:** Klempnerei Brandt, a Meisterbetrieb in Leipzig-Gohlis, Lötgasse 41. The owner, one
journeyman and one apprentice, two dark-blue vans with yellow lettering. Burst pipes, blocked drains, bathrooms,
boiler servicing. Emergencies Mon–Fri 7–20 on the same number, none at weekends. Call-out 39 €, an hour 68 € or
84 €. Most people call from their phone with water on the floor. No photos.

**What it did with that:** the side of the van became the page. The first screen is a drawn navy van lettered with
the name, and the phone number is painted big in traffic yellow: it is the call button. The prices are three
oversized numbers, the service area is a ring drawn round Gohlis, and the page ends on the number, not a logo.

| Desktop | Phone |
|---|---|
| [![The plumber's first screen at desktop width](desktop.jpg)](https://nikita-andreiev.com/one-shot-site/klempnerei-brandt/) | [![The plumber's first screen on a phone](phone.jpg)](https://nikita-andreiev.com/one-shot-site/klempnerei-brandt/) |

[Open the live site →](https://nikita-andreiev.com/one-shot-site/klempnerei-brandt/) · [See the run](https://nikita-andreiev.com/one-shot-site/#run-klempnerei-brandt)

**Checked with v0.3:** in the run, lint, look, film and film with reduced motion found nothing. The audit, run
again on the page as the project page publishes it: Ready to ship, all clear, on all three pages. The first visit
is 134 KB, with no JavaScript. The audit is told to accept the made-up `.example` address
(`.one-shot/allow.json`, with the reason in the brief).

**Fixed after the run:** the run used a real street and a phone number that could belong to someone. The workshop
now sits on a made-up street, Lötgasse 41, and the number is 0341 1234 567, which no German line can have (local
numbers never start with 1). The privacy page names GitHub Pages as the host, where the project page puts the
example. Later the boiler makes went too, so no brand is named: "Gasthermen aller gängigen Marken". With 0.5, the
name keeps `translate="no"` in the header, the footer and the h1, so a translated page leaves it alone. Its
`EDITING.md` no longer says whether the BFSG (the German accessibility law) applies; that is for the owner to
check.

Source: [site/](site). Run `npm install && npm run dev` inside it. The facts (phone, hours, prices, area) live in
[site/site.json](site/site.json), and [site/EDITING.md](site/EDITING.md) is the owner's guide, in German. Its
`lint`, `look` and `audit` scripts need the skill's tools in `tools/one-shot/`, which `new-site` copies in; they are
left out here. The brief the run wrote is in [site/.one-shot/brief.md](site/.one-shot/brief.md).
