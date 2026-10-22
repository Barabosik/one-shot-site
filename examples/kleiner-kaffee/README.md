# Kleiner Kaffee

A made-up eight-seat coffee bar in Saarbrücken.

**Answers:** A small business · Warm · Pick colours for me · Gentle motion · Goal: visit · No extras

**What it was told:** Kleiner Kaffee, 8 seats, Röstergasse 12, Saarbrücken, run by Lena Hoffmann since 2019.
Roasts its own beans every Tuesday in a 5 kg drum roaster. Espresso 2.40, flat white 3.60, filter 3.20, cardamom
bun 3.00. Tue–Sat 8–17, Sun 10–16. Beans by email: hallo@kleiner-kaffee.example. No photos.

**What it did with that:** of its three ideas (the roaster on Röstergasse, the menu board over the counter, the
eight seats) it kept the roaster, the classic for a Warm brief. The first screen is the 5 kg drum roaster, drawn
large beside the headline "A coffee bar that roasts its own beans", with the open-now line, the address and Get
directions under it. On a phone the roaster comes first. No photos, so drawings carry the page: each thing on the
menu, a bag of their beans in the roast-brown band, and the eight stools along the counter. Roast brown on cream,
in Brygada 1918 and Karla.

| Desktop | Phone |
|---|---|
| [![The café's first screen at desktop width](desktop.jpg)](https://nikita-andreiev.com/one-shot-site/kleiner-kaffee/) | [![The café's first screen on a phone](phone.jpg)](https://nikita-andreiev.com/one-shot-site/kleiner-kaffee/) |

[Open the live site →](https://nikita-andreiev.com/one-shot-site/kleiner-kaffee/) · [See the run](https://nikita-andreiev.com/one-shot-site/#run-kleiner-kaffee)

**Made with 0.5**, by a fresh agent from the answers and material above, before 0.5's last checks were in (the
name kept from translation, form fields, contrast on photos).

**Checked:** in the run, look and film (with and without reduced motion) found nothing, the reviewer's three
points were fixed, and the audit said Ready to ship. Run again after the run with 0.5's final checks: lint, look
at phone and desktop width and the audit all clear, on all three pages. The first visit is 111 KB. The audit is
told to accept the made-up `.example` address (`.one-shot/allow.json`, with the reason in the brief).

**Fixed after the run:** the café's name in the header and the footers keeps `translate="no"`, so a translated page
doesn't turn it into "Small coffee" (a check that came after the run). The privacy page names GitHub Pages as the
host, where the project page puts the example. [site/EDITING.md](site/EDITING.md), the owner's guide, was written
after the run, which stopped before publishing, where the skill writes it.

Source: [site/](site). Run `npm install && npm run dev` inside it. The facts (hours, menu, address) live in
[site/site.json](site/site.json), and [site/EDITING.md](site/EDITING.md) is the owner's guide. Its `lint`, `look`
and `audit` scripts need the skill's tools in `tools/one-shot/`, which `new-site` copies in; they are left out here.
The brief the run wrote is in [site/.one-shot/brief.md](site/.one-shot/brief.md).
