# Die Website der Klempnerei Brandt ändern

Die Seite ist fertig gebaut und geprüft, aber **noch nicht online**: Es gibt noch keine Adresse (Domain) und
keinen Hoster. Der Ordner ist dieser hier; der Code liegt mit allen Änderungen in Git.

## Was sich ändern kann, steht in `site.json`

Telefonnummer, Zeiten und Preise stehen nur an einer Stelle: in `site.json`. Die Seite, das Impressum und die
Angaben für Google lesen sie von dort. Nie eine Nummer, einen Preis oder eine Uhrzeit direkt in eine Seite tippen.

| Feld | Was es ist | Wo man es sieht |
|---|---|---|
| `name` | Klempnerei Brandt | überall |
| `description` | ein, zwei Sätze für Google | Suchergebnis |
| `phone` | 0341 1234 567, so geschrieben, wie man sie liest | Transporter oben, Anrufen-Knöpfe, Fußzeile, Impressum |
| `email` | info@klempnerei-brandt.example | unter dem Transporter, Fußzeile, Impressum, Datenschutz |
| `address` | Lötgasse 41, 04155 Leipzig | Gebiet, Fußzeile, Impressum, Google |
| `district` | Leipzig-Gohlis | Kopfzeile, Link-Vorschau |
| `hours` | Bürozeiten, z. B. `{ "days": "Mon-Fri", "opens": "07:00", "closes": "16:00" }`; Tage ohne Eintrag gelten als geschlossen | Abschnitt „Zeiten“, Google |
| `emergency` | Notdienst: `days` (Mo–Fr), `opens`, `closes`, `weekendDays` (Sa–So), `weekend` (kein Notdienst) | Transporter, „Zeiten“, Link-Vorschau |
| `closed` | Betriebsferien, z. B. `{ "from": "2026-12-24", "to": "2026-12-31", "note": "Weihnachten" }`; vergangene fallen beim nächsten Bauen weg | „Zeiten“, Google |
| `menu` | die Preise: Name, Betrag (nur die Zahl, z. B. `"39"`), Hinweis | Abschnitt „Preise“ |
| `area` | `km` (15) und die drei Orte im Schema | Abschnitt „Gebiet“ |
| `owner` | Inhaber und Berufsbezeichnung | Impressum, Datenschutz |
| `chamber`, `vatId` | Handwerkskammer und USt-IdNr. | Fußzeile, Impressum |
| `host` | der Hoster, sobald die Seite online ist | Datenschutz |
| `url` | die Adresse, sobald es eine gibt (mit `set-url.mjs` setzen, nicht von Hand) | Google, Link-Vorschau |

Text, Reihenfolge und Gestaltung stehen in `index.html` und `src/style.css`; Farben und Größen in
`src/tokens.css`.

## Eine Änderung machen lassen

Am einfachsten: einen Coding-Agenten bitten, zum Beispiel
„Nutze one-shot-site und ändere die Arbeitsstunde Meister auf 88 €“ oder
„Nutze one-shot-site: Betriebsferien vom 24. bis 31. Dezember“.

Selbst machen:

```
npm install          # einmal
npm run dev          # Vorschau unter http://localhost:5173, ändert sich beim Speichern
npm run build        # baut die fertige Seite nach dist/
npm run audit        # prüft sie (bis eine Adresse da ist: node tools/one-shot/audit.mjs dist --draft)
```

Danach die Änderung in Git festhalten (`git commit -am "Neue Preise ab Januar"`) und neu veröffentlichen.

## Online stellen und später neu veröffentlichen

Noch offen: wo die Seite liegen soll (GitHub Pages, Vercel, Netlify, Cloudflare, eine eigene Domain wie
klempnerei-brandt.de). Sobald das feststeht:

1. `node tools/one-shot/set-url.mjs . https://die-adresse/` setzt die Adresse in jede Seite, `robots.txt` und
   `sitemap.xml`.
2. In `site.json` den Hoster bei `host` eintragen (er steht dann in der Datenschutzerklärung).
3. `npm run build` und `node tools/one-shot/audit.mjs dist` ohne `--draft`, bis „Ready to ship“ dasteht.
4. Veröffentlichen, wie es der Hoster vorsieht. Den genauen Befehl bitte unten ergänzen, damit „neu
   veröffentlichen“ später ein Schritt ist.

Rechtliches: Impressum und Datenschutz sind aus Ihren Angaben gefüllt. Bitte noch ergänzen lassen: in welchem
Staat der Meistertitel verliehen wurde, und die Anschrift der Handwerkskammer zu Leipzig. Das ist keine
Rechtsberatung; im Zweifel mit einem Generator (eRecht24) oder einer Anwältin prüfen.

## Nach dem Start: einmal erledigen

Mit Ihren eigenen Zugängen, die Angaben genau so wie auf der Seite:

1. **Google-Unternehmensprofil** (business.google.com): Name „Klempnerei Brandt“, Adresse „Lötgasse 41,
   04155 Leipzig“, Telefon „0341 1234 567“, Öffnungszeiten Mo–Fr 07:00–16:00, Website = die neue Adresse,
   Kategorie „Klempner“ (dazu „Heizungsinstallateur“). Einzugsgebiet: Leipzig, Markkleeberg, Taucha, Schkeuditz.
   Ein paar echte Fotos, zum Beispiel die beiden Transporter. Betriebsferien als „besondere Öffnungszeiten“,
   dieselben Tage wie `closed` in `site.json`.
2. **Google Search Console** (search.google.com/search-console): Property mit der neuen Adresse anlegen,
   „HTML-Tag“ wählen, den Code in `site.json` bei `verify.google` eintragen, bauen, veröffentlichen, dann
   „Bestätigen“. Danach `sitemap.xml` einreichen. Bing Webmaster Tools genauso (`verify.bing`).
3. Wenn sich Zeiten oder Preise ändern: zuerst `site.json`, dann das Google-Profil.

Barrierefreiheit: Die Seite hat keine Fehler in der automatischen Prüfung (axe-core); das ersetzt keine
vollständige Prüfung. Ob das Barrierefreiheitsstärkungsgesetz (BFSG) für Sie gilt, klären Sie selbst; das hier ist
keine Rechtsberatung.
