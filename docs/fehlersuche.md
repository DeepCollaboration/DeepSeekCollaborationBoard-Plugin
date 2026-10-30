# Fehlersuche

Symptom, Ursache, Handgriff — die Fälle, die im Betrieb vorkommen. Die Zahlen
in Klammern sind Antwortcodes der Board-Routen; die vollständige Liste steht in
[routen.md](routen.md).

## Das Plugin lädt nicht

**Symptom:** DSH meldet beim Start „Failed to load plugins“ mit
`@local/dsh-board: failed`; die Seite fehlt.

**Ursache:** Der Client liest einen Dienst des Dashboards, ohne ihn unter
`inject` anzumelden. Schon das Lesen wirft; eine Absicherung im Code hilft
nicht. Das Board braucht `slots` und `locale`.

**Handgriff:** In `client.js` unter `inject` beide Namen eintragen, DSH neu
starten. `test/markt47.mjs` prüft die Liste und scheitert mit derselben
Meldung, wenn ein Dienst fehlt.

## Die Seite zeigt ein leeres Board

**Symptom:** Die Fläche ist leer, in der Board-Leiste steht „nicht geholt“.

**Ursache:** Das Hauptboard konnte beim Start nicht geholt werden — kein Netz,
GitHub nicht erreichbar oder das Repository nicht lesbar.

**Handgriff:** In der Board-Leiste „Wiederholen“ wählen. Bleibt es dabei, die
Adresse prüfen (`remote` in `/board/konfiguration`) und ob GitHub erreichbar
ist. Ein privates Hauptboard braucht einen Token.

## „Nur lesen“ und ein Grund

**Symptom:** Über der Fläche steht „Nur lesen: …“, die Schreibknöpfe fehlen.

**Ursachen und Handgriffe:**

- *Keine Anmeldung: es fehlt ein Token.* → Einstellungen → CollaborationBoard →
  GitHub, Token eintragen.
- *Kein Schreibrecht: der angemeldete Login darf dieses Repository nicht
  beschreiben.* → Der Token gehört zu einem Konto ohne Schreibrecht; ein Token
  mit Schreibrecht hilft, oder das Repository gehört jemand anderem.
- *Das Schreibrecht ist nicht prüfbar: GitHub ist nicht erreichbar.* →
  Verbindung prüfen, Board neu laden.
- *Die Anmeldung ist nicht prüfbar: der Token wird von GitHub abgewiesen.* →
  Token erneuern.

Der Grund steht auch im Titel des „Nur lesen“-Satzes; er ist übersetzt.

## Anlegen endet mit 403

**Symptom:** „Entsteht unter …“ stand im Formular, das Anlegen antwortet mit
403.

**Ursache:** GitHub verweigert das Anlegen unter dem Eigentümer — kein Recht in
der Organisation oder am Zielkonto. Das ist ein Recht, kein Serverfehler.

**Handgriff:** Eigentümer in den Einstellungen prüfen; wer in der Organisation
anlegen darf, braucht die passende Rolle. Der Anlegeknopf bleibt bewusst
stehen: Ob der Token darf, ließe sich nur mit einem zusätzlichen Recht
(`read:org`) vorab fragen.

## 409 — die Ablage ist neuer oder älter

**Symptom:** Eine Meldung nennt „Format 2“ (oder „Format 1“) und dass nicht
geschrieben wird.

**Ursache:** Die Ablage wurde von einer neueren Fassung des Plugins
geschrieben; das laufende kennt das Format nicht. Oder umgekehrt: die Ablage
ist älter und braucht den Umzug.

**Handgriff:** Plugin aktualisieren und DSH neu starten; für eine ältere Ablage
den Umzug aus der Board-Leiste starten. Bis dahin bleibt Lesen möglich.

## Der Abgleich meldet einen Konflikt

**Symptom:** „Der Stand ist neuer“ und eine Datei ist benannt.

**Ursache:** Dieselbe Datei wurde an zwei Stellen geändert.

**Handgriff:** Die genannte Datei öffnen, den eigenen Text als Pull Request
anlegen oder den neuen Stand übernehmen. Die übrigen Repositories sind nicht
betroffen.

## Die Board-Routen antworten ohne Anmeldung

**Symptom:** `curl http://…/board/data` liefert Daten, ohne dass das Dashboard
angemeldet ist.

**Ursache:** Die Board-Routen hängen nicht an der Anmeldung des Dashboards;
GitHub ist der Ort der Rechte, nicht der Web-Server.

**Handgriff:** Den Harness nur in einem vertrauenswürdigen Netz betreiben und
nicht offen ins Internet stellen. Siehe [SECURITY.md](../SECURITY.md).

## Nach einer Änderung ist die Oberfläche alt

**Symptom:** Der Quelltext ist neu, die Seite zeigt den alten Stand.

**Ursache:** Den Host lädt DSH beim Start; den Client bündelt DSH bei der
Anfrage.

**Handgriff:** Für `client.js` genügt ein Neuladen der Seite; für `index.js`
und alles, was der Host beim Start liest, DSH neu starten. Der Name in der
Plugin-Verwaltung kommt aus `locale/*.json` und ändert sich erst beim Neustart.

## Prüfungen scheitern an der Werkstatt

**Symptom:** `npm test` ist rot, obwohl der Code unverändert ist; die Meldung
nennt `/workspace/projekte/board` oder `board-repos`.

**Ursache:** 34 der Prüfungen lesen die echte alte Ablage und das Hauptboard;
ein fremder Klon hat beides nicht. `test/schritt30.mjs` vergleicht den Stand
der alten Ablage vor und nach dem Lauf — schreibt währenddessen ein anderer
Vorgang dort, ist dieser eine Test rot.

**Handgriff:** In der Werkstatt laufen lassen; bei einem einzelnen roten
`schritt30` den Lauf einmal wiederholen. Die CI führt die 50 selbstständigen
Prüfungen aus.
