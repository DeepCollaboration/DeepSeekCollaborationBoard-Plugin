# Entwicklung

Diese Seite beschreibt, wie das Plugin geprüft, geändert und erweitert wird.
Installation und erste Schritte stehen im [README](../README.md); der Aufbau
steht in [architektur.md](architektur.md).

## Voraussetzungen

- Node 24 (`engines.node` in [`package.json`](../package.json)).
- Git; die Ablage ist ein Git-Repository.
- Ein DeepSeek Harness, in dessen Profil das Plugin läuft.
- Keine npm-Abhängigkeiten: `package.json` nennt weder `dependencies` noch
  `devDependencies`. Es gibt nichts zu installieren; `npm test` genügt.

## Ins Profil einklinken

Das Plugin wird als Paket in ein Profil des Harness eingetragen:

```bash
dsh plugin --profile web add <Paket oder Pfad>
```

`dsh plugin` reicht den Befehl an pnpm im Profilordner weiter. Für die
Entwicklung wird der ausgecheckte Ordner als `link:` eingetragen, damit das
Profil auf den Arbeitsstand zeigt:

```bash
dsh plugin --profile web add link:/pfad/zum/board-plugin
```

Für die Installation wird die Adresse aus dem README genommen. Ein erneutes
`add` ersetzt einen vorhandenen Eintrag (pnpm meldet das); das Profil liegt unter
`$DSH_HOME/profiles/web/`; die Datei [`cordis.patch.yml`](../cordis.patch.yml)
fügt das Bundle unter der Kennung `board-panel` mit dem Namen
`@local/dsh-board` ein.

Danach den Harness neu starten. Der Host wird beim Start geladen; den Client
lädt das Dashboard (in `package.json` steht `client.immediately: true`). Nach
einer Änderung an [`index.js`](../index.js) oder [`client.js`](../client.js)
ist ein Neustart der sichere Weg; ob ein Neuladen der Seite für den Client
genügt, hängt am Harness.

## Prüfen

```bash
npm test        # node --test test/*.mjs
npm run check   # node --check client.js && node --check index.js
```

`test/` enthält 84 Prüfdateien; der Testläufer zählt jede als einen Test.
Davon lesen 34 die echte Werkstatt: die alte Ablage unter
`/workspace/projekte/board` und das Hauptboard unter
`/workspace/projekte/board-repos`. Ein fremder Klon hat beides nicht. Die CI
führt deshalb die 50 selbstständigen Prüfungen aus; sie lässt die
Werkstatt-Dateien über einen `grep -vE`-Ausdruck aus
([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). Eine Suite mit
eigenen Fixtures für alle 84 ist offen.

`test/grundlagen.mjs` prüft die Veröffentlichungs-Grundlagen: MIT-Lizenz,
Node 24, CI, acht Anzeige-Metadaten unter `locale/` und genau acht
Wörterbücher unter `texte/` mit 614 Schlüsseln (`de.json` leer).

Die Prüfungen lesen den Quelltext und arbeiten auf Kopien unter `/tmp`. Sie
schreiben nicht in echte Repositories.

## Aufbau von `client.js`

Die Datei wird vom Dashboard über `window.__ModuleLoader__.load` geladen. Der
`factory` baut den Baum aus React und den Diensten; `apply(ctx)` hängt ihn in
die Slots. Gelesen werden nur `slots` und `locale` (`inject`).

Der Kopf der Datei nennt eine thematische Übersicht; maßgeblich sind die
`// --- …`-Marken im Quelltext. Sie stehen in dieser Reihenfolge:

1. Abgleich und Hinweise
2. Stile — `S` für die Seite
3. Stationen und Farben
4. Kleine Helfer
5. Daten der Fläche
6. Die automatische Anordnung
7. Kleiner Markdown-Renderer
8. Vergleich zweier Fassungen
9. Was die Ansicht behält
10. Übersetzung und Sprache
11. Theme und Akzent
12. Stile der Einstellungsseite (`E`)
13. Bausteine
14. Einstellungen
15. Konto und GitHub
16. Beiträge
17. Fragen
18. Teams
19. BoardPage
20. Slots und `apply`, dazu die Liste der Sprachen für `addLanguage`

`BoardPage` hat eigene Marken: Zustand und Laden, Der Verlauf einer Datei, Ein
Zweig von hier aus, Startseite, Was zwischen zwei Stationen übergeben wird,
Schritte, Dateien und Verbindungen, Der Baum der Dateien, Fläche und Karten,
Kanten, Bibliothek, Katalog, Verlauf des Boards, Leser, Chat.

`S` und `E` sind reine Objekte mit CSS-Eigenschaften; es gibt keine
Stylesheet-Datei. Die einzige Ausnahme ist `AKZENT_STIL`: er setzt
`--board-akzent` je Akzent und Modus und wird in `apply` als `<style>`
eingehängt.

### Regeln für die Oberfläche

- **Farben** kommen aus `var(--dsw-…)`; die einzige eigene Farbe ist der
  Akzent als `var(--board-akzent)`. Keine harten Hex-, `rgb`- oder
  `hsl`-Werte in den Stilen. Die sechs Akzentwerte selbst stehen als Hex in
  `AKZENTE` — sie sind die Definition des Akzents, nicht seine Verwendung.
- **Schriftgrößen** sind `12px`, `13px`, `14px`, `18px` oder mindestens
  `20px` (Titel; verwendet wird `22px`). Unter `20px` gibt es höchstens vier
  verschiedene Werte.
- **Radien** sind `6px`, `8px`, `12px`, `999px` (Pille), `50%` (Kreis) oder
  `0`.
- Die Abstände folgen dem Takt 4 / 8 / 12 / 16. Er ist eine Vereinbarung für
  neue Stellen und wird nicht über den Bestand geprüft.

`test/nach63.mjs` prüft Schrift und Radien, `test/nach85b.mjs` die Farben und
den Stilblock. Beide lesen `client.js` als Text.

## Eine Sprache hinzufügen

Die Sprache kommt vom Dashboard. Der Client holt die Texte über
`GET /board/sprache?id=<id>`; die Wörterbücher liegen in `texte/`. Deutsch ist
der Ausgangstext im Code, `texte/de.json` bleibt leer. Die übrigen sieben
Wörterbücher tragen je 614 Schlüssel: 605 Texte aus `client.js` und neun Sätze,
die der Host mitschickt.

So kommt eine Sprache dazu:

1. **Kennung wählen.** Erlaubt ist `^[a-z]{2}(-[a-z0-9]+)?$`; die Route lehnt
   alles andere mit `400` ab.
2. **Wörterbuch anlegen.** Eine vorhandene Datei nach `texte/<id>.json`
   kopieren und die Werte übersetzen. Die Schlüssel bleiben unverändert.
   `{0}`, `{1}` … müssen in gleicher Zahl und Reihenfolge stehen bleiben.
   Leere Werte sind nicht erlaubt. Eine Vorlage erzeugen die Prüfungen nicht;
   die Schlüsselliste liefert [`werkzeuge/texte-schluessel.mjs`](../werkzeuge/texte-schluessel.mjs).
3. **Sprache anmelden.** In `apply` in der Liste `angebot` einen Eintrag
   `{ id: '<id>', label: '<Name in der Sprache>' }` ergänzen. Die Liste steht
   am Ende von `client.js` bei den Slots. Sie enthält nur Sprachen, die das
   Dashboard nicht schon selbst anbietet; Englisch und Chinesisch fehlen dort,
   weil das Dashboard sie mitbringt, ihre Wörterbücher aber trotzdem geladen
   werden.
4. **Prüfungen anpassen.** `test/nach66.mjs` führt die geprüften Sprachen in
   `SPRACHEN`; die neue Kennung dort ergänzen. `test/markt48.mjs` liest alle
   Dateien unter `texte/` und braucht keine Liste.
5. **Achtung, Zählung.** `test/grundlagen.mjs` verlangt zurzeit genau acht
   Wörterbücher (`texte.length === 8`). Mit einer neunten Sprache wird diese
   Prüfung rot; die Zahl ist im selben Schritt mitzuziehen. Für die Anzeige in
   der Plugin-Verwaltung käme eine `locale/<id>.json` dazu; geprüft werden
   dort nur die acht vorhandenen Sprachen.
6. **Prüfen.** `node --test test/markt48.mjs test/nach66.mjs test/grundlagen.mjs`
   und danach `npm test`.

Die Prüfungen vergleichen die Schlüsselmenge in beide Richtungen: kein
Schlüssel darf fehlen, keiner überzählig sein, kein Wert leer, und die
Platzhalter müssen erhalten bleiben. Ein halb übersetztes Wörterbuch fällt
damit auf.

## Fehlersuche

1. **`GET /board/data`** ist der erste Blick. Die Antwort trägt das offene
   Board, `darf` samt `darfGrund`, `luecken`, bei Fassung 2 `staende` und
   `sichtbarkeit`. Ist gar kein Board offen, steht `leer: true`; fehlt nur der
   Ordner des Hauptboards, steht der Grund in `fehler`. Ist die Antwort leer,
   fehlt das Register oder der Ordner des Boards.
2. **`GET /board/sprache?id=<id>`** zeigt, ob ein Wörterbuch ausgeliefert
   wird. `200` mit `{ id, texte }` ist richtig; unbekannte, aber gültige
   Kennungen liefern leere Texte, ungültige `400`. Fehlt ein Schlüssel im
   Wörterbuch, steht der deutsche Text da — die Route selbst meldet keinen
   Fehler.
3. **Server-Log.** Der Host schreibt Warnungen beim Start auf seine Ausgabe
   (`console.warn('Board: …')`), etwa wenn das Hauptboard nicht eingerichtet
   werden konnte. Client-Fehler stehen in der Browser-Konsole
   (`[board] Ansicht abgestürzt`).
4. **`/tmp/board-korrektur.log`.** Die beiden Modellwege `korrigieren` und
   `ueberarbeiten` protokollieren je Aufruf Zeichenzahl, Denkstufe, Dauer,
   Lage und Fehler dorthin. Ohne Modell im Host antworten sie mit `503`, bei
   Zeitüberschreitung mit `504`.
5. **`test/schritt30.mjs` ist bekannt schwankend.** Der Test vergleicht den
   Stand von `/workspace/projekte/board` vor und nach dem Lauf. Schreibt
   währenddessen ein anderer Vorgang dort, ist er rot, obwohl der Umzug
   stimmt. Dann einmal wiederholen; die CI lässt ihn deshalb aus. Dasselbe
   gilt für alle Werkstatt-Prüfungen, wenn die echte Ablage gerade bearbeitet
   wird.

Für Syntaxfehler zuerst `npm run check`; es prüft `client.js` und `index.js`
mit `node --check`, ohne die Suite zu starten.
