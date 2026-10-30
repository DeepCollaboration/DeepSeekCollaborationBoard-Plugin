# Datenformate

Ein Board der Fassung 2 besteht aus Git-Repositories. Jedes trägt genau eine
Ankerdatei im Wurzelordner; sie sagt, was der Ordner ist:

| Art | Ankerdatei | Leser |
| --- | --- | --- |
| Board | `board.json` | [`formate/board.js`](../formate/board.js) |
| Workflow | `workflow.json` | [`formate/workflow.js`](../formate/workflow.js) |
| Station | `station.json` | [`formate/station.js`](../formate/station.js) |
| Vorhaben | `vorhaben.json` | [`formate/vorhaben.js`](../formate/vorhaben.js) |

Alle vier Dateien tragen `format: 2`; [`formate/hilfe.js`](../formate/hilfe.js)
weist alles andere ab. Geschrieben wird über eine Zwischendatei und
`rename`, damit nie eine halbe Datei liegen bleibt.

## Fassung 1 und Fassung 2

| | Fassung 1 | Fassung 2 |
| --- | --- | --- |
| Ablage | ein Repository je Board | ein Repository je Ding |
| Kennzeichen | Datei `format` mit `1` | Ankerdatei mit `format: 2` |
| Board | Eintrag in `$DSH_HOME/board/boards.json` | `board.json` im Board-Repository |
| Inhalt | `personen/`, `workflows/`, `vorgaenge/`, `skills/` | die Ankerdatei und ihre Dateien |
| Schreiben | [`ablage.js`](../ablage.js) schreibt die geänderten Dateien | die Route schreibt die eine Datei und fasst sie |
| Betrieb | lesbar und, außer im Archiv, schreibbar; Umzug über `POST /board/umzug` | der laufende Weg |

Die Fassung 1 wird weiter gelesen. Ein leerer Ordner oder ein leerer Klon
bekommt beim Verbinden noch die kleinste Ablage der Fassung 1
([`boards.js`](../boards.js), `initialisiere`); der laufende Weg ist die
Fassung 2. Ein Board der Fassung 2 bringt seine Personen und Workflows in den
Repositories mit; es gibt daneben keine `personen/`- oder
`workflows/`-Ordner.

## Verweise

Ein Verweis ist ein Text im Feld `repo`. Geschrieben wird er als
`owner/repo`, wenn das Repository einen GitHub-Remote hat; sonst als Name des
Ordners ([`index.js`](../index.js), `verweisFuerRepo`). Gelesen wird er so:

1. als Pfad relativ zum verweisenden Repository,
2. als Geschwisterordner,
3. bei `owner/repo` über `$DSH_HOME/board/cache/<owner>/<repo>`
   ([`repos.js`](../repos.js), `cachePfad`).

Eine HTTP- oder Git-Adresse hat keinen lokalen Ort. Sie wird nicht geholt,
sondern zur Lücke; die Seite nennt den Verweis. Fehlt ein Repository, steht
das an seiner Stelle in `luecken`, und es wird kein Name erfunden.

## `board.json`

| Feld | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `format` | Zahl | ja | muss `2` sein |
| `id` | Kennung | ja | `^[a-z0-9][a-z0-9._-]*$` |
| `name` | Text | ja | Anzeigename des Boards |
| `art` | Text | ja | `hauptboard`, `team` oder `lokal` |
| `personen` | Liste | ja | Einträge `{ login, name, farbe }`; `login` darf nicht doppelt vorkommen; `farbe` ist `#rrggbb` |
| `workflows` | Liste | ja | Einträge `{ repo, fassung }`; beide Texte |
| `vorhaben` | Liste | ja | Einträge `{ repo }` |
| `stationen` | Liste | ja | Einträge `{ repo }`; auch Stationen, die in keinem Workflow stehen |
| `einstellungen` | Objekt | ja | darf leer sein; u. a. `eigentuemer` |
| `layout` | Objekt | ja | darf leer sein |

```json
{
  "format": 2,
  "id": "testboard",
  "name": "Testboard",
  "art": "team",
  "personen": [{ "login": "p1", "name": "Thomas Heinrich", "farbe": "#fbbf24" }],
  "workflows": [{ "repo": "DeepCollaboration/workflow-standard", "fassung": "v1" }],
  "vorhaben": [{ "repo": "DeepCollaboration/vorhaben-probeprojekt" }],
  "stationen": [{ "repo": "DeepCollaboration/station-idee" }],
  "einstellungen": {},
  "layout": {}
}
```

Das Hauptboard trägt zusätzlich `katalog.json`; gelesen wird sie in
[`formate/katalog.js`](../formate/katalog.js) mit `format: 2`, den Listen
`stationen` (`{ repo, besonderheit? }`), `workflows`, `vorhaben`,
`gesperrt` (optional) und `geprueft` (`{ repo, von, am }`).

## `station.json`

| Feld | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `format` | Zahl | ja | muss `2` sein |
| `id` | Kennung | ja | Kennung der Station |
| `name` | Text | ja | Anzeigename |
| `beschreibung` | Text | nein | fehlt sie, gilt der leere Text |
| `host` | Text | ja | wer die Station verantwortet |
| `eingang` | Liste von Texten | ja | was hereingeht; darf leer sein |
| `ausgabe` | Liste von Texten | ja | was herauskommt; darf leer sein |
| `aktion` | Objekt | ja | wie gearbeitet wird |
| `aktion.art` | Text | ja | `skill`, `skript`, `textfeld` oder `datei` |
| `aktion.datei` | Text | nein | Datei zur Aktion, etwa `SKILL.md` |
| `aktion.wert` | Text | nein | Wert zur Aktion |
| `beispiele` | Liste | ja | darf leer sein; die Einträge werden nicht geprüft |
| `reife` | Text | ja | `entwurf`, `erprobt` oder `geprüft` |
| `lizenz` | Text | ja | etwa `MIT` |
| `tags` | Liste von Texten | ja | darf leer sein |

```json
{
  "format": 2,
  "id": "idee",
  "name": "Idee",
  "beschreibung": "Thema in einem Satz festhalten.",
  "host": "p1",
  "eingang": [],
  "ausgabe": [],
  "aktion": { "art": "textfeld", "wert": "Thema in einem Satz festhalten." },
  "beispiele": [],
  "reife": "erprobt",
  "lizenz": "MIT",
  "tags": ["idee", "start"]
}
```

Eine Station wird auf einer Fassung gelesen, wenn ein Workflow sie nennt:
`git show <fassung>:station.json`. Fehlt die Datei in dieser Fassung, gilt der
aktuelle Stand und `fassungFehlt` sagt es
([`komposition.js`](../komposition.js)).

## `workflow.json`

| Feld | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `format` | Zahl | ja | muss `2` sein |
| `id` | Kennung | ja | Kennung des Workflows |
| `titel` | Text | ja | Anzeigename |
| `beschreibung` | Text | nein | |
| `autor` | Text | nein | |
| `stationen` | Liste | ja | Einträge `{ repo, fassung, id }`; `id` darf nicht doppelt vorkommen; `fassung` ist Pflicht |
| `positionen` | Liste | ja | Einträge `{ id, station, x, y, bedingung? }`; `station` muss in `stationen` stehen; `id` darf nicht doppelt vorkommen |
| `kanten` | Liste | ja | Einträge `{ von, nach }`; beide müssen Positionen sein |
| `layout` | Text | ja | `frei` oder `auto` |
| `regeln` | Objekt | ja | darf leer sein |

```json
{
  "format": 2,
  "id": "standard",
  "titel": "Standard-Workflow",
  "beschreibung": "Vom Thema zum Produkt.",
  "autor": "p1",
  "stationen": [
    { "repo": "DeepCollaboration/station-idee", "fassung": "v1", "id": "idee" },
    { "repo": "DeepCollaboration/station-umsetzen", "fassung": "v1", "id": "umsetzen" }
  ],
  "positionen": [
    { "id": "idee", "station": "idee", "x": 50, "y": 80, "bedingung": [] },
    { "id": "umsetzen", "station": "umsetzen", "x": 2960, "y": 380, "bedingung": [] }
  ],
  "kanten": [{ "von": "idee", "nach": "umsetzen" }],
  "layout": "auto",
  "regeln": {}
}
```

`bedingung` ist eine Liste von Texten und darf fehlen; fehlt sie, gilt die
leere Liste. `x` und `y` sind Zahlen, keine Texte. Eine neue Fassung an einer
Station ändert den Workflow nicht — erst `POST /board/workflow/nachziehen`
schreibt den Verweis um.

## `vorhaben.json`

| Feld | Typ | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `format` | Zahl | ja | muss `2` sein |
| `id` | Kennung | ja | Kennung des Vorhabens |
| `name` | Text | ja | Anzeigename |
| `workflow` | Objekt | ja | `{ repo, fassung }`; beide Texte |
| `position` | Kennung | ja | die Position im Workflow, an der das Vorhaben steht |
| `verantwortliche` | Objekt | ja | Schlüssel sind Positionen, Werte Listen von Kennungen; darf leer sein |
| `laeufe` | Liste | ja | Einträge sind Objekte; ihr Inhalt wird nicht geprüft |
| `fork_von` | `null`, Text oder `{ repo, fassung? }` | nein | Herkunft aus einer Kopie |
| `zweig_von` | `null`, Text oder `{ repo, fassung? }` | nein | Herkunft aus einem Zweig |
| `farbe` | Farbe | ja | `#rrggbb` |

```json
{
  "format": 2,
  "id": "board-gesamtkonzept",
  "name": "Board Gesamtkonzept",
  "workflow": { "repo": "DeepCollaboration/workflow-standard", "fassung": "v1" },
  "position": "idee",
  "verantwortliche": { "idee": ["p1"] },
  "laeufe": [],
  "fork_von": null,
  "zweig_von": null,
  "farbe": "#60a5fa"
}
```

Die Datei liegt im eigenen Repository des Vorhabens. Daneben liegen seine
Dateien, `transkripte/` und alles, was an den Stationen entsteht. Ein Zweig
trägt zusätzlich `zweig_von`; die Seite liest dasselbe Feld auch als
`abzweig`.

## `sichtbarkeit.json`

Ob ein Repository öffentlich oder privat ist, steht nicht in seinem Inhalt.
[`rechte.js`](../rechte.js) liest es in dieser Reihenfolge:

1. `$DSH_HOME/board/sichtbarkeit.json` — Schlüssel ist der absolute Pfad oder
   der Ordnername.
2. `sichtbarkeit.json` im Elternordner des Repositories — Schlüssel ist der
   Ordnername.
3. Der Name: `board-team` und `vorhaben-*` sind privat, alles andere
   öffentlich.

Erlaubte Werte sind `öffentlich` und `privat`; zusätzlich werden
`oeffentlich`, `public` und `private` verstanden. Die Dateien werden von den
Board-Routen nur gelesen. Geschrieben wird die Karte im Zielordner vom Umzug
([`werkzeuge/umzug2.mjs`](../werkzeuge/umzug2.mjs)).

```json
{
  "station-idee": "öffentlich",
  "vorhaben-probeprojekt": "privat"
}
```

Ein öffentliches Ding darf nur auf öffentliche Dinge verweisen. Verstößt ein
Board dagegen, sammelt `pruefeVerweise` eine Lücke der Art `sichtbarkeit`, und
`POST /board/github/veroeffentlichen` bricht ab, bevor es ein Remote anlegt.

## Was fehlen darf

- `board.json`: `einstellungen` und `layout` müssen stehen, dürfen aber leer
  sein. Die Listen dürfen leer sein; ein Board ohne Workflow ist lesbar.
- `station.json`: `beschreibung`, `aktion.datei` und `aktion.wert` dürfen
  fehlen. `beispiele`, `eingang`, `ausgabe` und `tags` dürfen leer sein.
- `workflow.json`: `beschreibung` und `autor` dürfen fehlen, `bedingung` an
  einer Position auch. `stationen`, `positionen` und `kanten` dürfen leer
  sein.
- `vorhaben.json`: `fork_von` und `zweig_von` dürfen fehlen oder `null` sein.
  `verantwortliche` darf ein leeres Objekt sein.
- Ein Repository, auf das verwiesen wird, darf fehlen. Es wird zur Lücke in
  `luecken`; die Ankerdatei des lesenden Repositories muss aber da sein.

Nicht optional ist `format: 2`. Eine Datei ohne dieses Feld oder mit einer
anderen Zahl wird nicht gelesen. Der Grund steht je nach Route im Fehlerfeld
der Antwort oder in `luecken`; beim Schreiben antwortet die Route mit `409`.

## Fassung 1

Die alte Ablage ist ein einziges Repository. Ihre Dateien werden von
[`ablage.js`](../ablage.js) gelesen; sie prüft locker und füllt fehlende
Angaben, statt abzubrechen.

| Datei | Inhalt |
| --- | --- |
| `format` | eine Zahl; `1` ist die aktuelle Fassung, `0` ist älter, alles darüber ist neuer. Stimmt sie nicht mit `1` überein, wird nicht geschrieben (`409`). |
| `personen/<kennung>.json` | `{ id, name, farbe?, github? }`; `ich` wird nicht gespeichert, sondern beim Lesen aus der gelesenen Person abgeleitet. |
| `workflows/<person>.json` | `{ person, workflows: [...] }`. Ein Workflow trägt `id`, `titel`, `schritte`, `positionen`, `kanten`, `layout`. |
| `vorgaenge/<ordner>/vorhaben.json` | `{ id, name, position, verantwortliche, regel, rueckkehr, laeufe, fork_von, zweig_von, farbe? }`. `regel` ist `einer` oder `alle`. |
| `skills/<host>/<schritt>.md` | die Anweisung eines Schritts; gelesen wird der YAML-Kopf mit `description` und `whenToUse`. |
| `beitraege/<vorhaben>/<beitrag>.json` | alte Beiträge: `{ id, vorhaben, schritt, von, seit, basis, notiz, dateien: [{ name, datei }], entschieden }`. Sie werden gelesen, aber nicht mehr geschrieben. |

Ein Schritt in `workflows/<person>.json` trägt `id`, `name`, `host`,
`eingang`, `ausgabe`, `wie` (`{ art, wert }`), `skill` und optional `inhalt`,
`werkstatt` und `weiter`. Ein Verweis auf einen fremden Schritt ist
`{ ref: "<person>/<workflow>/<schritt>" }`; beim Lesen wird er aus der Datei
seines Hosts aufgelöst, nie kopiert. `positionen` tragen `id`, `schritt`, `x`,
`y` und optional `bedingung`; `kanten` tragen `von` und `nach`.
