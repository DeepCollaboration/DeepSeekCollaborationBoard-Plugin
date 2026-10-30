# Routen

Alle Routen liegen unter `/board/` und werden in
[`index.js`](../index.js) mit `ctx.webServer.register({ kind: 'exact', … })`
registriert. Diese Tabelle ist vollständig; sie folgt den `registriere`-Aufrufen
und ist gegen `grep "path: '/board"` abgeglichen.

## Zeichen und Abkürzungen

| Zeichen | Bedeutung |
| --- | --- |
| **offen** | Kein Token, keine Identität und keine Anmeldung nötig. |
| **S** | Schreibrecht am offenen Board: lokal ohne Remote ja; mit Remote nur mit Token und Schreibrecht bei GitHub ([`rechte.js`](../rechte.js)). |
| **V** | Verantwortung am Vorhaben an seiner jetzigen Position (`darf(...)`, nur Fassung 1). |
| **T** | GitHub-Token nötig. |
| **E** | Eigentümer des Boards und Token nötig (neue Dinge entstehen unter dem Eigentümer). |
| **F1**, **F2** | Die Route liest oder schreibt nur diese Fassung. |
| **Bild** | Die Form von `GET /board/data`, u. a. mit `workflow`, `schritte`, `workflows`, `vorgaenge`, `personen`, `einstellungen`, `stand`, `format`, `formatAblage`, `identitaet`, `hauptboard`, `aktiv`, `boards`. |
| **F2-Bild** | Bild plus `stationen`, `staende`, `luecken`, `sichtbarkeit`, `darf`, `anlegen` und bei fehlendem Recht `darfGrund`/`darfHinweis`. |

`GET*` heißt: Die Route prüft die Methode nicht und führt auch bei `POST` die
Lesefunktion aus. Ein `405` gibt es dort nicht. Betroffen sind `/board/data`,
`/board/doc`, `/board/dateien`, `/board/datei`, `/board/versionen`,
`/board/version`, `/board/verlauf`, `/board/skills`, `/board/transkript`,
`/board/gespraech/stand` und `/board/werkstatt/stand`.

## Gemeinsame Prüfungen vor jeder Route

`registriere` prüft bei jedem Aufruf, der nicht `GET` ist:

- Ist das offene Board ein Archiv, antwortet die Route `403` mit „Die alte
  Ablage ist Archiv“, bevor ein Handler eine Ablagedatei anfasst. Ausgenommen
  sind nur `/board/boards/wechsel`, `/board/boards/entfernen`,
  `/board/board/verbinden`, `/board/identitaet`, `/board/darstellung` und
  `/board/umzug`.
- Nennt die Ablage eine andere Fassung als das Programm, antwortet die Route
  `409` mit der Zahl der Ablage. Ausgenommen sind Wege, die keine
  Ablagedateien schreiben: `/board/sync`, `/board/korrigieren`,
  `/board/ueberarbeiten`, `/board/gespraech/stopp`, `/board/werkstatt/stopp`,
  `/board/boards`, `/board/boards/wechsel`, `/board/boards/entfernen`,
  `/board/board/verbinden`, `/board/hauptboard/holen`, `/board/uebernehmen`,
  `/board/umzug`, `/board/identitaet`, `/board/darstellung`,
  `/board/github/token`, `/board/github/beitrag`, `/board/github/fork` und
  `/board/github/frage`.

Lesen ist immer möglich; die beiden Prüfungen gelten nur für schreibende
Methoden.

## Tabelle

| Methode | Pfad | Zweck | Recht/Voraussetzung | Antwort |
| --- | --- | --- | --- | --- |
| GET* | `/board/data` | Gesamtbild des offenen Boards; F2 aus der Komposition, F1 aus der Ablage | offen; ohne Board `200` mit leerem Bild | Bild; ohne Board `leer: true`, bei fehlendem Hauptboard `fehler` |
| GET | `/board/konfiguration` | eigene Kennung, Ablageort, Remote und Format | offen | `{ person, repo, remote, format }` |
| POST | `/board/sync` | abgleichen: holen, eigene Fassung darauf, weitergeben | offen; kein Token, aber Git-Zugang | F2 `{ geholt, gegeben, lage, staende }`; F1 `{ geholt, gegeben, lage }` |
| GET, POST | `/board/boards` | GET: Boards mit Kennzahlen; POST: Board verbinden oder anlegen | GET offen; POST eigener Name | GET Registerliste mit `identitaet`; POST `{ ok, board, … }` |
| POST | `/board/hauptboard/holen` | das Hauptboard erneut holen | offen | `{ board, fehler, verweise? }`; ein Fehlschlag bleibt `200` |
| GET | `/board/katalog` | Katalog des Hauptboards; `suche`, `frisch=1` | offen | `{ eintraege, kuratiert, gefunden, hinweis, stand, standGefunden, luecken }` |
| POST | `/board/uebernehmen` | das Probeprojekt in ein eigenes Board übernehmen | eigener Name; kein Token | `{ board, vorhaben }`; `409` ohne Name oder Hauptboard |
| POST | `/board/boards/wechsel` | das offene Board wechseln | offen | `{ ok, aktiv, boards }`; `404` unbekannt, `409` Ordner fehlt |
| POST | `/board/boards/entfernen` | ein Board aus dem Register nehmen | offen; das Hauptboard bleibt | `{ ok, aktiv, boards }`; `409` beim Hauptboard |
| GET | `/board/board` | das offene Board: Register, Format, Art, Sichtbarkeit, Recht; ohne Fläche | offen | `{ board, format, art, sichtbarkeit, darf, … }`; F2 zusätzlich `verweise` |
| POST | `/board/board/verbinden` | ein Board ins Register legen und sofort öffnen | eigener Name | Bild; `400`/`404`/`409` |
| GET | `/board/workflow` | Workflow des offenen Boards | offen | `{ board, format, verweis, ort, fassung, … }`; `409` ohne Workflow |
| POST | `/board/umzug` | die alte Ablage in getrennte Repositories umziehen | S; F1-Board im Register; ggf. Zuordnung zum GitHub-Namen | `{ ok, quelle, ziel, zuordnung, host, bericht, anzahl, repositories }` |
| GET, POST | `/board/identitaet` | die eigene Identität lesen oder setzen | GET offen; POST Name, gültiger GitHub-Name, Farbe | `{ identitaet }` bzw. `{ ok, identitaet, … }` |
| GET | `/board/sprache` | Wörterbuch einer Sprache; `id` | offen | `{ id, texte }`; `400` bei ungültiger Kennung |
| GET, POST | `/board/darstellung` | Akzentfarbe lesen oder setzen | GET offen; POST nur ein Wert aus `AKZENTE` | `{ darstellung, akzente }`; POST `{ ok, … }` |
| GET | `/board/github/stand` | Stand der GitHub-Verbindung und Metadaten eines Repositories; optional `repo=owner/name` | offen; Token optional | `{ verbunden, login, grenze, fehler? }` bzw. `{ repo, sterne, fassung, freigaben, fehler }` |
| GET | `/board/github/teams` | Teams der Organisation; `org`, `frisch=1` | offen; ohne Token leer mit Hinweis | `{ org, kann, teams, hinweis }` |
| POST | `/board/github/token` | Token prüfen und speichern oder löschen | offen; der Token wird bei GitHub geprüft | `{ verbunden, login }`; `401` ungültig, `502` nicht erreichbar |
| GET | `/board/github/beitraege` | Pull Requests eines Repositories; `repo=owner/name` | offen | `{ repo, adresse, kann, beitraege, hinweis }` |
| GET, POST | `/board/github/beitrag` | GET: ein Pull Request (`nummer`); POST: einen anlegen | GET offen; POST T, Repository im Board, Schreibrecht am Repository | GET `{ repo, adresse, kann, beitrag }`; POST `{ nummer, adresse }` |
| GET | `/board/github/fragen` | Issues eines Repositories; `repo=owner/name` | offen | `{ repo, adresse, kann, fragen, hinweis }` |
| POST | `/board/github/frage` | eine Frage als Issue anlegen | T; Repository im Board | `{ nummer, adresse }`; ohne Token `409` mit Hinweis |
| POST | `/board/github/fork` | einen Fork bei GitHub anlegen | T; Repository im Board | `{ fork }`; ohne Token `409` mit Hinweis |
| POST | `/board/github/veroeffentlichen` | die Repositories eines F2-Boards unter der Organisation anlegen und schicken | T; F2; öffentlich nur auf öffentlich | `{ ok, organisation, veroeffentlicht, ausgelassen }`; ohne Token `409` mit `befehle` |
| GET* | `/board/doc` | eine Datei oder einen Ordner im Vorhaben lesen; `vorhaben`, `datei` | offen | `{ name, exists, text }` oder `{ art: 'ordner', anzahl }`, dazu `basis` |
| GET* | `/board/dateien` | einen Ordner im Vorhaben listen; `vorhaben`, `pfad` | offen | `{ pfad, eintraege, mehr? }`; höchstens 400 Einträge |
| GET* | `/board/datei` | eine Datei tief im Vorhaben lesen | offen | `{ exists, text, groesse }`, bei Binärdatei `{ binaer }`, über 2 MB `{ zuGross }` |
| POST | `/board/doc/schreiben` | eine Datei speichern; `basis` schützt vor überholtem Stand | F2: S am Board und am Vorhaben-Repository, dazu V; F1: V | `{ ok, name, laenge, basis, fassung }`; `409` mit `neu` |
| GET* | `/board/versionen` | die Fassungen einer Datei (höchstens 60) | F1; offen | `{ datei, versionen }`; `503` ohne Verlauf |
| GET | `/board/fassungen` | die Fassungen des Board-Repositories (höchstens 60) | offen | `{ fassungen }`; `503` ohne Verlauf |
| GET* | `/board/version` | zwei Fassungen einer Datei vergleichen; `hash` | F1; offen | `{ datei, hash, autor, datum, nachricht, alt, neu }` |
| POST | `/board/korrigieren` | Rechtschreibung korrigieren | offen; Modell im Host | `{ text }`; `503` ohne Modell, `504` bei Zeitüberschreitung |
| POST | `/board/ueberarbeiten` | einen Text nach einer Anweisung überarbeiten | offen; Modell im Host | `{ text }`; `400`/`503`/`504` |
| GET* | `/board/verlauf` | den Verlauf eines Vorhabens lesen | F1; offen | `{ vorhaben, schritte }` |
| POST | `/board/positions` | eine Station in den Workflow setzen | F1; offen | Bild |
| POST | `/board/workflow/station` | eine Station des Boards in den Workflow stellen | F2; S; Stationsverantwortung; öffentlich nur auf öffentlich | F2-Bild; `400`/`403`/`404`/`409` |
| POST | `/board/workflow/nachziehen` | einen Stationsverweis auf eine Fassung ziehen | F2; S | F2-Bild; `400`/`404`/`409` |
| POST | `/board/workflow/verbinden` | einen Workflow als Verweis ins Board aufnehmen | F2; S | F2-Bild; `400`/`404`/`409` |
| GET, POST | `/board/station` | GET: Vertrauensbild einer Station (`station`); POST: Station anlegen | GET offen (F2); POST E (F2) | GET `{ …bild, …zahlen }`; POST F2-Bild plus `station` |
| POST | `/board/fremd/anstellen` | einen fremden Schritt als Verweis anstellen | F1; offen | Bild |
| POST | `/board/fremd/entfernen` | den Verweis samt seinen Positionen entfernen | F1; offen; `409`, wenn dort Vorhaben stehen | Bild |
| POST | `/board/schritt` | eine Station anlegen | F1; offen | Bild |
| GET | `/board/skill/dateien` | die in einer Anweisung genannten Dateien; `name` | F1; offen | `{ dateien }`; `400`/`404` |
| POST | `/board/person/aendern` | die eigene Person ändern | F1; nur die eigene Kennung | Bild; `403` bei fremder Person |
| POST | `/board/schritt/aendern` | eine Station ändern | F1; offen; fremder Schritt `403` | Bild |
| POST | `/board/schritt/loeschen` | eine Station löschen | F1; offen; `409`, wenn sie im Workflow steht | Bild |
| GET* | `/board/skills` | die Anweisungen der Schritte aus der Ablage | F1; offen | `{ skills }` |
| POST | `/board/skill/eintragen` | eine Anweisung an eine Station eintragen | F1; offen; fremder Schritt `403` | `{ ok, skill, datei }` plus die Boarddaten (`workflow`, `schritte`, `vorgaenge`, …) |
| POST | `/board/skill/lauf` | eine Sitzung als Transkript festhalten | F1; V | `{ ok, datei, fragen }`; `422`, wenn der Skill nicht aufgerufen wurde |
| GET* | `/board/transkript` | die Transkripte eines Schritts; `vorhaben`, `position` | F1; offen | `{ laeufe }` |
| POST | `/board/kante` | eine Verbindung legen | F1; offen; `409` bei Kreis oder Doppelung | Bild |
| POST | `/board/kante/loeschen` | eine Verbindung lösen | F1; offen | Bild |
| POST | `/board/layout` | die Anordnung auf `frei` oder `auto` setzen | F1; offen | Bild |
| POST | `/board/einstellung` | `eigentuemer` (F2) oder `mausrad` (F1) setzen | F2: S; F1: offen | F2-Bild bzw. Bild; `400` bei unbekannter Einstellung |
| POST | `/board/position/platzieren` | eine Position setzen; `x`, `y` | F1; offen | Bild |
| POST | `/board/position/loeschen` | eine Position löschen | F1; offen; `409`, wenn dort Vorhaben stehen | Bild |
| POST | `/board/vorhaben` | ein Vorhaben anlegen | F2: E, erster Workflow mit Fassung, Position im Workflow; F1: offen | F2-Bild plus `vorhaben`; F1 Bild |
| POST | `/board/vorhaben/aendern` | ein Vorhaben umbenennen oder färben | F1; V | Bild |
| POST | `/board/vorhaben/abzweigen` | einen Zweig anlegen | F1; V; der Weg muss im Workflow führen | Bild plus `{ neu, mit }` |
| POST | `/board/vorhaben/verschieben` | ein Vorhaben verschieben oder weitergeben | F2: S und Stationsverantwortung; F1: V | F2-Bild bzw. Bild |
| POST | `/board/vorhaben/zurueckschicken` | ein Vorhaben mit Grund zurückschicken | F1; V | Bild |
| POST | `/board/gespraech/senden` | ein Gespräch beginnen oder fortsetzen | F1; V; `sessionController` im Host | `{ session, position }`; `503` ohne Sitzungsdienst |
| GET* | `/board/gespraech/stand` | den Stand eines Gesprächs lesen | F1; offen | `{ session, position, skill, laeuft, eintraege, fehler }` |
| POST | `/board/gespraech/stopp` | das Gespräch beenden | F1; offen; `sessionController` | `{ gestoppt }` |
| POST | `/board/gespraech/verwerfen` | das Gespräch verwerfen und die Sitzung archivieren | F1; offen | `{ ok, sitzung }` plus die Boarddaten |
| POST | `/board/werkstatt/senden` | das Werkstattgespräch einer Station beginnen oder fortsetzen | F1; offen; `sessionController` | `{ session, schritt }` |
| GET* | `/board/werkstatt/stand` | den Stand der Werkstatt lesen; `schritt` | F1; offen | `{ session, schritt, laeuft, eintraege, fehler }` |
| POST | `/board/werkstatt/stopp` | den laufenden Zug abbrechen | F1; offen; `sessionController` | `{ gestoppt }` |
| POST | `/board/werkstatt/verwerfen` | die Werkstatt verwerfen und die Sitzung archivieren | F1; offen | `{ ok, sitzung }` plus die Boarddaten |

In Fassung 1 prüfen die Handlungen am Vorhaben eine Verantwortung (`V`). Die
Struktur-Routen (Station, Kante, Layout, Position) schreiben ohne weitere
Prüfung; die Ablage gilt als persönlich. In Fassung 2 entscheidet dagegen das
Schreibrecht des Repositories (`S`).

## Fehlercodes

| Code | Bedeutung |
| --- | --- |
| `400` | Die Eingabe fehlt oder ist ungültig: Name, Pfad, Sprache, Farbe, Akzent, Modus, `owner/name`, `basis`. |
| `401` | GitHub weist den Token ab. Nur `/board/github/token` und Weitergaben von GitHub-Antworten. |
| `403` | Kein Schreibrecht; fremdes Vorhaben oder fremde Person; Archiv; Repository steht nicht im Board. |
| `404` | Board, Vorhaben, Station, Position, Datei, Sprache oder Pull Request gibt es nicht. |
| `405` | Falsche Methode — nur auf Routen, die die Methode prüfen. |
| `409` | Widerspruch: Format passt nicht, Ordner fehlt, Name ist belegt, Basis ist überholt, Token fehlt, Sichtbarkeitslücke. |
| `422` | Die Anweisung wurde in der Sitzung nicht aufgerufen; GitHub kann den Pull Request nicht annehmen. |
| `500` | Unerwarteter lokaler Fehler: Git antwortet nicht, Datei lässt sich nicht schreiben. |
| `502` | GitHub ist nicht erreichbar oder antwortet unbrauchbar. |
| `503` | Kein Git-Verlauf; der Host führt keine Sitzungen; kein Modell im Host. |

## Der Weg Token → Prüfung → Schreiben

1. **Token ablegen.** `POST /board/github/token` ruft `GET /user` auf. Erst
   wenn GitHub antwortet, schreibt `schreibeToken` die Datei
   `$DSH_HOME/board/github.json` (Datei `0600`, Verzeichnis `0700`, erst
   `.tmp`, dann `rename`). Der Token erscheint in keiner Antwort.
2. **Recht prüfen.** Die schreibenden Wege, die ein GitHub-Repository
   beschreiben, lesen den Token über `liesToken`. `schreibrecht` fragt bei
   GitHub die Berechtigung des Logins ab; `admin`, `maintain`, `push` und
   `write` dürfen schreiben. Das Ergebnis gilt 30 Sekunden je Repository,
   Remote und Login. Ohne Remote gilt das Repository als lokal und darf
   beschrieben werden.
3. **Schreiben.** Die Route prüft Pfad und Basis, schreibt über `.tmp` und
   `rename` und fasst die Änderung mit `git add` und `git commit` im
   zuständigen Repository.
4. **Weitergeben.** In Fassung 2 bleibt der Commit lokal; nur `POST /board/sync`
   gleicht ab: `fetch`, `pull --rebase`, `push`. In Fassung 1 gibt `festhalten`
   den Commit sofort an `origin` weiter (`gibWeiter`), und vor dem Lesen wird
   höchstens einmal je Minute abgeglichen. `POST /board/github/veroeffentlichen`
   pusht beim Veröffentlichen ausdrücklich. Git benutzt die SSH- oder
   Git-Zugangsdaten des Rechners, nicht den GitHub-Token;
   `GIT_TERMINAL_PROMPT=0` verhindert eine unsichtbare Eingabe.

Für die GitHub-Wege gilt zusätzlich: Ein Repository lässt sich nur
beschreiben, wenn das offene Board es nennt — in `board.json`, in einem
Workflow oder in einem Vorhaben (`boardPfadFuer`). Ein lokaler Ordner allein
genügt nicht.
