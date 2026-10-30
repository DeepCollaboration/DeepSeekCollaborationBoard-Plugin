# Architektur

Dieses Dokument beschreibt den Aufbau des Plugins. Was es für Anwender tut,
steht im [README](../README.md); hier steht, welche Teile es gibt, wo sie
liegen und wie sie zusammenspielen. Die Routen stehen in [routen.md](routen.md),
die Dateiformate in [datenformate.md](datenformate.md), die Arbeitsweise in
[entwicklung.md](entwicklung.md).

## Ein Plugin, zwei Hälften

Das Plugin läuft im DeepSeek Harness. Es hat keinen eigenen Prozess und keinen
eigenen Port; der Harness lädt beide Hälften.

| Hälfte | Datei | Aufgabe |
| --- | --- | --- |
| Host | [`index.js`](../index.js) | `apply(ctx)` registriert die `/board/*`-Routen am Web-Server des Harness und liest und schreibt Dateien und Git-Repositories. |
| Client | [`client.js`](../client.js) | Die sichtbare Fläche als React-Baum. Das Dashboard lädt sie über `window.__ModuleLoader__.load`; `apply` hängt sie in Slots und meldet die Sprachen an. |

Der Host benutzt weitere Module, die keine eigenen Einstiegspunkte haben:

| Modul | Aufgabe |
| --- | --- |
| [`ablage.js`](../ablage.js) | Die alte Ablage der Fassung 1 als Dateien lesen und schreiben (`format`, `personen/`, `workflows/`, `vorgaenge/`). |
| [`boards.js`](../boards.js) | Identität, Darstellung und das Board-Register unter `$DSH_HOME/board/`. |
| [`komposition.js`](../komposition.js) | Aus einem Board der Fassung 2 und seinen Repositories das Bild bauen, das die Seite liest. |
| [`abgleich.js`](../abgleich.js) | Je Repository holen, die eigene Fassung darauf legen und weitergeben; den Stand ohne Netz lesen. |
| [`rechte.js`](../rechte.js) | Sichtbarkeit, Verweisprüfung und Schreibrecht. |
| [`github.js`](../github.js) | GitHub-API, Token, Sterne; keine zusätzliche Abhängigkeit, `fetch` genügt. |
| [`formate/`](../formate/) | Die vier Ankerdateien lesen und prüfen. |
| [`repos.js`](../repos.js) | Einen Ordner an seiner Ankerdatei als Repository erkennen. |
| [`erststart.js`](../erststart.js) | Beim ersten Start das Hauptboard holen und eintragen. |
| [`katalog.js`](../katalog.js) | Den Katalog des Hauptboards sammeln und durchsuchen. |
| [`werkzeuge/`](../werkzeuge/) | Prüffläche, Abnahme und der Umzug von Fassung 1 nach 2. |

## Kein Dienst, keine Datenbank, keine eigene Anmeldung

Drei Entscheidungen prägen den ganzen Aufbau:

- **Kein Dienst.** Es gibt keinen Hintergrundprozess, der dauerhaft läuft. Die
  Arbeit geschieht im Aufruf einer Route oder beim Start des Harness.
- **Keine Datenbank.** Der Zustand liegt in JSON-Dateien und in
  Git-Repositories. Änderungen an einem Board werden als Commit festgehalten;
  persönliche Seitendateien bleiben einzelne Dateien.
- **Keine eigene Anmeldung.** Die Board-Routen prüfen keine Sitzung und kein
  Kennwort. Wer den Web-Server des Harness erreicht, kann sie aufrufen (siehe
  [`SECURITY.md`](../SECURITY.md)). GitHub ist der Ort, an dem Rechte
  entschieden werden; der Token ist die Anmeldung bei GitHub, nicht beim Board.

## Wo die Daten liegen

Alles Persönliche liegt unter `$DSH_HOME/board/`: Register, Identität,
Darstellung, Token und der Zwischenspeicher. Die Repositories selbst liegen an
lokalen Pfaden. Für ein Board nennt `repo` im Register seinen Ordner; die
Dinge, auf die das Board verweist, liegen oft im Zwischenspeicher daneben. Je
nach Board ist das:

- `$DSH_HOME/board/cache/<owner>/<repository>/` für geklonte Boards und die
  Dinge, auf die sie verweisen;
- `$DSH_HOME/board/ablagen/<kennung>/` für eigene lokale Boards;
- ein eigener Werkstattpfad wie `/workspace/projekte/board-repos/board-hauptboard`
  oder `…/board-team` — so liegen die aktiven Boards dieser Werkstatt.

`remote` nennt die GitHub-Adresse, wenn das Repository dort liegt; ein lokales
Board hat kein `remote`. `$DSH_HOME/board` ist also der Ort der Steuerdateien,
nicht der Ort aller Repositories.

| Ort | Inhalt | Gelesen und geschrieben von |
| --- | --- | --- |
| `boards.json` | Register: welche Boards dieser Mensch benutzt und welches offen ist. `format: 1`, `aktiv`, `boards[]` mit `id`, `name`, `format`, `art`, `repo`, `remote`, `person`, `angelegt` und optional `archiv`, `nameAlt`, `fehler`, `sichtbarkeit`. | [`boards.js`](../boards.js) |
| `identitaet.json` | `{ name, github, farbe }`; gilt für alle Boards. | [`boards.js`](../boards.js) |
| `darstellung.json` | `{ akzent }`; die Akzentfarbe, persönlich für alle Boards. | [`boards.js`](../boards.js) |
| `github.json` | `{ token, login? }`, Datei `0600`, Verzeichnis `0700`. | [`github.js`](../github.js) |
| `sterne.json` | Zwischenspeicher der Sternzahlen, je `owner/name`. | [`github.js`](../github.js) |
| `sichtbarkeit.json` | `öffentlich` oder `privat` je Repository; siehe [datenformate.md](datenformate.md#sichtbarkeitjson). | gelesen von [`rechte.js`](../rechte.js); geschrieben nur vom Umzug |
| `cache/<owner>/<repository>/` | Klone der öffentlichen und verbundenen Repositories; auch neu angelegte Stationen und Vorhaben entstehen hier. Löschbar und wieder herstellbar. | geschrieben von [`erststart.js`](../erststart.js) und den Anlege-Routen in [`index.js`](../index.js); gelesen von [`komposition.js`](../komposition.js) und [`rechte.js`](../rechte.js) |
| `ablagen/<kennung>/` | Lokale Boards samt übernommenen Vorhaben. | [`boards.js`](../boards.js), Routen in [`index.js`](../index.js) |
| `einstellungen.json`, `gespraeche.json` | Persönliche Seitendateien der Fassung 1 (Mausrad-Einstellung, Gespräche je Vorhaben). | [`ablage.js`](../ablage.js) |

Ein Repository der Fassung 2 ist ein Ordner mit genau einer Ankerdatei:
`board.json`, `workflow.json`, `station.json` oder `vorhaben.json`. Mehrere
Ankerdateien in einem Ordner sind ein Fehler ([`repos.js`](../repos.js)).
Ein Board der Fassung 1 ist dagegen eine Ablage mit `format`, `personen/`,
`workflows/`, `vorgaenge/` und `skills/`; sie wird als Ganzes gelesen und ist
schreibbar, solange sie nicht als Archiv geführt wird.

Der Zwischenspeicher ist eine Kopie, nicht die Wahrheit. Die Wahrheit steht im
Repository; `cache/` lässt sich löschen und beim nächsten Start oder Abgleich
wieder füllen.

## GitHub als Zugang und Recht

Der Token ist optional und liegt außerhalb der Ablage in
`$DSH_HOME/board/github.json`. Er wird nie zurückgegeben: keine Route und keine
Meldung enthält ihn.

Das Schreibrecht wird in [`rechte.js`](../rechte.js) entschieden:

1. Ein Repository ohne Remote gilt als lokal und darf beschrieben werden.
2. Mit Remote und ohne Token: kein Schreibrecht, mit Grund und Hinweis.
3. Mit Token fragt das Board bei GitHub nach der Berechtigung des Logins.
   `admin`, `maintain`, `push` und `write` dürfen schreiben; jede andere
   Antwort nicht. Das Ergebnis gilt 30 Sekunden je Repository, Remote und
   Login.

Die Sichtbarkeit eines Repositories steht nicht in seinem Inhalt. Sie wird in
dieser Reihenfolge bestimmt: `$DSH_HOME/board/sichtbarkeit.json`, dann eine
`sichtbarkeit.json` im Elternordner, zuletzt der Ordnername (`vorhaben-*` und
`board-team` sind privat, alles andere öffentlich). Ein öffentliches Ding darf
nur auf öffentliche Dinge verweisen; [`rechte.js`](../rechte.js) sammelt jede
solche Lücke, bevor veröffentlicht oder ein Verweis aufgenommen wird.

Geschrieben wird über die GitHub-API nur, was eine Route ausdrücklich anstößt
(Anlegen, Pull Request, Frage, Fork, Veröffentlichen). Dateien und Commits
entstehen lokal. In Fassung 1 gibt jede Speicherung den Commit zusätzlich an
`origin` weiter, wenn ein Remote steht (`gibWeiter`); in Fassung 2 bleiben die
Commits lokal, und `POST /board/sync` gleicht ab (`fetch`, `pull --rebase`,
`push`). `POST /board/github/veroeffentlichen` legt Remotes an und pusht
ausdrücklich.

## Wie ein Board zusammengesetzt wird

Ein Board der Fassung 2 besitzt seine Inhalte nicht. [`komposition.js`](../komposition.js)
liest `board.json` und baut daraus das Bild für die Seite:

1. **Verweise auflösen.** Ein Verweis ist ein relativer Pfad, ein
   Geschwisterordner oder `owner/repo`. `owner/repo` wird über
   `$DSH_HOME/board/cache/<owner>/<repo>` aufgelöst; eine HTTP- oder
   Git-Adresse bleibt ohne lokalen Ort und wird zur Lücke.
2. **Ankerdateien lesen.** Jedes Repository wird an seiner Ankerdatei erkannt
   und mit seinem Leser aus [`formate/`](../formate/) geprüft. Eine Station
   wird auf der Fassung gelesen, die der Workflow nennt (`git show
   <fassung>:station.json`); fehlt sie, gilt der aktuelle Stand und
   `fassungFehlt` sagt es.
3. **Zusammensetzen.** Workflows liefern Positionen und Kanten, Stationen
   liefern Name, Host, Ein- und Ausgang, Aktion und Reife, Vorhaben liefern
   Position, Verantwortliche und Läufe. Nichts wird kopiert.
4. **Lücken benennen.** Was fehlt oder nicht lesbar ist, steht in `luecken`
   mit Art und Grund; es wird kein Name erfunden. Die Prüfung der Sichtbarkeit
   kommt als eigene Art hinzu.
5. **Stände anhängen.** `staende` nennt je Repository Name, Art, Pfad, Lage,
   Zahl der nur lokalen Fassungen, Remote, Zeit, Konfliktdatei und Fehler.
   Gelesen wird ohne Netz; abgeglichen wird nur auf Anstoß.

`GET /board/data` liefert dieses Bild samt `darf`, `anlegen`, `sichtbarkeit`
und `format`. Die Routen, die das Board, einen Workflow oder ein Vorhaben
ändern, antworten mit demselben Bild — teils um den neuen Eintrag ergänzt —,
damit die Seite nach der Handlung genau das sieht, was der nächste Leseaufruf
brächte.

## Slots

Der Client meldet in `apply` zwei Dienste an (`inject`): `slots` und `locale`.
Er hängt sich an drei Stellen des Dashboards:

| Slot | Inhalt |
| --- | --- |
| `main` | Die ganze Board-Seite. |
| `settings.section` | Der Abschnitt „CollaborationBoard“ im Einstellungsfenster. |
| `sidebar.panellist` | Das Symbol in der Seitenleiste. |

Fehlt einer der beiden Dienste in `inject`, bricht der Harness den Start des
Plugins ab. Das ist Absicht: der Client liest die Dienste, bevor er etwas
zeichnen kann.

## Übersetzung

Die Sprache kommt vom Dashboard. Der Client holt die Texte über
`GET /board/sprache?id=<sprache>` aus `texte/<sprache>.json`. Fehlt ein
Eintrag, bleibt der deutsche Ausgangstext stehen; eine leere Stelle gibt es
nicht. Deutsch ist die Ausgangssprache und braucht kein Wörterbuch
(`texte/de.json` ist leer).

Die Kennung muss `^[a-z]{2}(-[a-z0-9]+)?$` erfüllen. Unbekannte, aber gültige
Kennungen liefern `200` mit leeren Texten; ungültige `400`. Arabisch stellt die
Fläche rechtsläufig (`dir="rtl"`). Wie eine Sprache dazukommt, steht in
[entwicklung.md](entwicklung.md#eine-sprache-hinzufügen).

## Grenzen

- **Host-Dienste nötig.** Gespräch und Werkstatt brauchen Dienste des Harness.
  Ohne `sessionController` antworten sie `503`; fehlt `sessionQuery`, bleibt
  die Spalte ohne Einträge; fehlt `agents`, ist `laeuft` falsch; ohne
  `workspaceController` wird eine Sitzung beim Verwerfen nicht archiviert.
- **Modell nötig.** `POST /board/korrigieren` und `POST /board/ueberarbeiten`
  rufen das Modell des Harness; ohne Modell antworten sie mit `503`.

## Bekannte Lücken

Der Kopfkommentar von `index.js` nennt keine eigene Routenliste mehr; er
verweist auf [routen.md](routen.md). Maßgeblich sind die `registriere`-Aufrufe.

- **Elf Routen prüfen die Methode nicht.** `/board/data`, `/board/doc`,
  `/board/dateien`, `/board/datei`, `/board/versionen`, `/board/version`,
  `/board/verlauf`, `/board/skills`, `/board/transkript`,
  `/board/gespraech/stand` und `/board/werkstatt/stand` führen auch bei POST
  die Lesefunktion aus; ein `405` gibt es dort nicht.
- **Fassung 1 prüft an der Struktur kein Verantwortungsrecht.** `/board/schritt`,
  `/board/kante`, `/board/layout`, `/board/position/*` und `/board/fremd/*`
  schreiben ohne `darf`; nur die Handlungen am Vorhaben prüfen es.
- **34 der 84 Prüfungen brauchen die Werkstatt.** Sie lesen die echte alte
  Ablage unter `/workspace/projekte/board` und das Hauptboard unter
  `/workspace/projekte/board-repos`. Ein fremder Klon hat beides nicht; die CI
  führt deshalb 50 Prüfungen aus. Eine Suite mit eigenen Fixtures für alle ist
  offen.
- **Kein Browser-Test.** Die Prüfungen lesen `client.js` als Text. Die sichtbare Wirkung wird von Hand geprüft; ein automatisierter Browser-Test fehlt.
