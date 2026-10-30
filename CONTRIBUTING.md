# Mitmachen

CollaborationBoard ist ein Plugin für den DeepSeek Harness. Es gibt keine
npm-Abhängigkeiten; gebraucht wird Node 24. 34 der Prüfungen lesen die Werkstatt
des Autors — die alte Ablage und das Hauptboard, beide außerhalb dieses
Repositories — und laufen nur dort; die CI führt die 50 selbstständigen
Prüfungen aus. Eine Suite mit eigenen Fixtures für alle Prüfungen ist offen.

## Prüfen

```bash
npm test          # node --test test/*.mjs
npm run check     # node --check client.js und index.js
```

Die Prüfungen lesen den Quelltext und arbeiten auf Kopien unter `/tmp`; sie
schreiben nicht in echte Repositories. `test/schritt30.mjs` vergleicht den
Stand des Repositories in der Werkstatt vor und nach dem Lauf — schreibt
währenddessen ein anderer Vorgang dort, ist dieser eine Test rot. Dann einmal
wiederholen.

## Aufbau

- `index.js` — der Host: Routen, Ablage, GitHub, Rechte.
- `client.js` — die Oberfläche: eine Seite, viele Flächen, ein Stilblock.
- `formate/` — die vier Datenformate (Station, Workflow, Vorhaben, Board).
- `texte/*.json` — die Wörterbücher; Deutsch ist der Ausgangstext im Code.
- `werkzeuge/` — Abnahme, Umzug, Schlüsselzählung.

## Beitragen

- Ein Thema je Pull Request; die Prüfungen müssen grün sein.
- Neue sichtbare Texte gehen durch `uebersetze(...)` und stehen in allen
  Wörterbüchern. Wie eine Sprache dazukommt, steht in `docs/entwicklung.md`.
- Keine Tokens, keine persönlichen Daten, keine Pfade aus dem eigenen Rechner
  in Commits.
- Sprache: Deutsch für die Oberfläche und die Dokumentation, Englisch für
  Code-Kommentare nur, wo es der Code verlangt.
- Umgang: sachlich, nachvollziehbar, fremdes achtend — siehe
  `CODE_OF_CONDUCT.md`.

## Fehler melden

Bitte mit Schritten, die man nachgehen kann: was war zu sehen, was war
erwartet, welches Theme (hell/dunkel), welche Fensterbreite, welche Sprache.
Sicherheitslücken bitte nicht als offenes Issue — siehe `SECURITY.md`.
