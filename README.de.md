# CollaborationBoard

**Deutsch** · [English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [العربية](README.ar.md) · [中文](README.zh.md)

[![CI](https://github.com/DeepCollaboration/DeepSeekCollaborationBoard-Plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/DeepCollaboration/DeepSeekCollaborationBoard-Plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Das Board ist eine öffentliche Werkstatt und ein privater Arbeitsplatz: Menschen
legen Vorhaben an, arbeiten an ihnen und sehen, was die anderen tun. Es gibt
keinen Dienst dazwischen, keine Datenbank und keine eigene Anmeldung. Der
Harness ist der Prozess, Git die Ablage, GitHub der Ort für Rechte und
Zusammenarbeit.

## Was das Board ist

Stationen, Workflows, Vorhaben und Boards sind eigene Git-Repositories; die
öffentlichen liegen unter der Organisation `DeepCollaboration`:

- **Station** — ein einzelner Arbeitsschritt: was hineingeht, was herauskommt,
  wie er läuft, mit Beispielen und Grenzen. Ihre Ankerdatei ist `station.json`.
- **Workflow** — eine Zusammensetzung aus Stationen mit Reihenfolge,
  Abzweigungen und Regeln. Seine Ankerdatei ist `workflow.json`; er verweist auf
  Stationen mit Fassung, statt sie zu kopieren.
- **Vorhaben** — die konkrete Arbeit an einem Workflow: Name, Position,
  Verantwortliche je Schritt, Dateien und Transkripte. Seine Ankerdatei ist
  `vorhaben.json`.
- **Board** — ein Repository voller Verweise: welche Workflows, Vorhaben und
  Stationen ein Mensch oder ein Team benutzt. Das öffentliche **Hauptboard** ist
  die Startseite; daneben gibt es Team-Boards und lokale Boards ohne Remote.

Das Plugin setzt aus diesen Repositories die Fläche zusammen. Es besitzt keine
Inhalte: Was du siehst, steht in den Repositories; was du änderst, wird dort als
neue Fassung festgehalten.

## Installieren

Voraussetzung: DeepSeek Harness (DSH) mit Node 24 und Git.

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

Das Plugin wird in das Profil `web` installiert und dort eingeschaltet. Starte
DSH danach neu; die Seite erscheint in der Seitenleiste. Die Konfiguration des
Profils liegt unter `$DSH_HOME/profiles/web/` — von Hand ist dort nichts
einzutragen.

### Wenn das Plugin nicht startet

Die häufigen Fälle stehen mit Ursache und Handgriff in
[docs/fehlersuche.md](docs/fehlersuche.md).

Meldet DSH beim Start „Failed to load plugins“ mit `@local/dsh-board: failed`,
hat der Client einen Dienst des Dashboards gelesen, ohne ihn anzumelden. Das
Board braucht `slots` (die Plätze in der Oberfläche) und `locale` (die Sprache);
beide stehen in `client.js` unter `inject`. Fehlt ein Eintrag, bricht DSH den
Start des Plugins ab, statt es ohne den Dienst zu laden.

Eine Absicherung im Code hilft dort nicht: Schon das Lesen wirft. Zu tun ist
eine Zeile — `inject` ergänzen, DSH neu starten. `test/markt47.mjs` prüft die
Liste und scheitert mit derselben Meldung, wenn ein Dienst fehlt.

## Der erste Start

Beim ersten Start holt das Board das öffentliche Hauptboard von selbst:

- Es klont `https://github.com/DeepCollaboration/board-hauptboard` nach
  `$DSH_HOME/board/cache/DeepCollaboration/board-hauptboard`.
- Es trägt das Hauptboard in `$DSH_HOME/board/boards.json` ein und öffnet es.
- Es holt die Stationen, Workflows und Vorhaben, auf die das Hauptboard verweist,
  in denselben Zwischenspeicher. Sie liegen danach unter
  `$DSH_HOME/board/cache/DeepCollaboration/<repository>`.

Ein vorhandenes Register mit anderen Boards bleibt unangetastet. Ohne Netz
bleibt der Eintrag stehen und trägt „nicht geholt“; die Seite zeigt einen Knopf
zum Wiederholen, der Rest des Boards bleibt bedienbar.

**Lesen braucht keinen Namen.** Nach dem ersten Start stehen das Hauptboard, seine
Stationen, der Katalog und das Probeprojekt offen. Du kannst stöbern, Dateien
öffnen und Gespräche lesen. Ein eigener Name wird erst gebraucht, wenn du
beitrittst, etwas beiträgst oder ein eigenes Board willst.

### Frisch installiert: lesen ja, anlegen erst mit Token

1. **Installieren.** Der Befehl steht oben unter **Installieren**; danach DSH
   neu starten.
2. **Öffnen.** In der Seitenleiste das Board öffnen. Das Hauptboard ist beim
   ersten Start schon geholt und eingetragen.
3. **Lesen.** Hauptboard, Stationen, Workflow, Katalog und das Probeprojekt
   stehen ohne Namen und ohne Token offen. Solange kein Schreibrecht da ist,
   zeigt die Board-Leiste **Nur lesen** mit dem Grund darunter; die Bibliothek
   lässt sich trotzdem durchstöbern.
4. **Anlegen erst mit Token.** Der Knopf **Station anlegen** erscheint erst,
   wenn ein Token eingetragen und ein Eigentümer bekannt ist. Den Token trägst
   du unter **Einstellungen → Board → GitHub** ein; ohne ihn bleibt
   das Board lesbar, aber neue Stationen entstehen nicht. Die Antwort auf einen
   Anlegeversuch nennt diesen Weg.

Der Katalog sucht die öffentlichen Stationen mit dem Thema
`dsh-board-station` auch ohne Anmeldung. Was du findest, kannst du lesen und in
einen Workflow stellen; geschrieben wird dabei nur der Verweis.

## Die Oberfläche

Alles geschieht auf einer Seite: oben die Kopfzeile, links die Schiene, daneben
die Docks, in der Mitte die Fläche.

- **Kopfzeile** — links die Board-Leiste, in der Mitte der Titel, rechts die
  Menschen und die Werkzeuge der Fläche, einschließlich der Suche nach einer
  Station. Eine Statuszeile darunter sagt, was die Seite zu sagen hat, und
  verschwindet, wenn es nichts zu sagen gibt.
- **Schiene** — eine schmale Spalte links, immer sichtbar. Sie trägt
  **Bibliothek** und **Verlauf**; ein kleiner Begleiter sitzt dort und reagiert
  auf „fertig“ und auf Fehler.
- **Dock** — das linke Dock öffnet die Bibliothek oder den Verlauf; sein Inhalt
  scrollt, sein Kopf bleibt stehen. Das rechte Dock zeigt die offene Station und
  das Gespräch, mit Reitern, wenn beide zugleich offen sind. Am linken Rand des
  rechten Docks lässt sich die Breite ziehen.
- **Fläche** — die freie Fläche mit Karten und Verbindungen. Stationen und
  Vorhaben ziehen, Stationen verbinden, ein Vorhaben an den nächsten Schritt
  weitergeben. Was du verschiebst, bleibt liegen, solange **Frei** eingestellt
  ist.
- **Offene Station** — eine Station auf der Fläche oder in der Bibliothek
  anklicken. Das rechte Dock zeigt ihren Namen und ihre Fassung, was hineingeht
  und herauskommt, und wie sie läuft.
- **Gespräch** — ein Gespräch an einer Station läuft im rechten Dock und zeigt
  Fragen und Antworten, während sie entstehen — derselbe Text, der später im
  Transkript steht. Schließt du die Spalte, läuft das Gespräch im Chat weiter.

## Das eigene Board

Im Hauptboard öffnest du die Bibliothek und schaltest oben auf **Katalog**. Dort
steht das **Probeprojekt**, ein öffentliches Vorhaben an der Station „Idee“. Der
Knopf **In mein Board übernehmen** führt den Einstieg:

1. Fehlt dein Name, fragt ein kleines Formular nach Name, GitHub-Name
   (freiwillig) und Farbe. Diese Angaben gelten für alle Boards.
2. Das Board legt ein lokales Board unter `$DSH_HOME/board/ablagen/<kennung>/`
   an, zum Beispiel `annas-board`.
3. Das Probeprojekt wird als eigene Kopie in dein Board gelegt. Die Kopie ist ein
   eigenes Repository unter `vorhaben-probeprojekt-kopie/`; sie verweist mit
   `fork_von` auf das Original. Workflows und Stationen werden nur verwiesen,
   nicht kopiert.
4. Das neue Board ist offen. Über die Board-Leiste wechselst du jederzeit
   zwischen Hauptboard und eigenem Board. Der Wechsel bleibt auf der Fläche:
   sie füllt sich mit dem neuen Board, ohne dass die Seite neu geladen wird
   oder du in den Chat zurückfällst.

Das eigene Board hat zunächst kein Remote und bleibt auf diesem Rechner. Es
lässt sich später unter der Organisation veröffentlichen; dafür braucht es den
GitHub-Token.

## Eine Station anlegen

In der Bibliothek steht unter **Stationen** der Knopf **Station anlegen**, sobald
ein Token und ein Eigentümer da sind; darunter fragen zwei Felder nach Name und
Beschreibung. Im Formular steht **Entsteht unter „<Eigentümer>“** — der Name,
unter dem das Repository angelegt wird. Das Board baut daraus im
Zwischenspeicher ein eigenes Repository mit `station.json` und README und legt
es als öffentliches Repository `station-<kennung>` unter dem Eigentümer an — mit
dem Thema `dsh-board-station`, ohne Token in `.git/config`. Danach steht der
Verweis `owner/repo` in `board.json`, und die neue Station erscheint sofort in
der Bibliothek.

Als Bestätigung bleibt eine Karte stehen: der Name der Station, ihr Repository
und der Satz, wo sie zu finden ist. Hier im Board steht sie unter **Stationen**;
auf jedem anderen Board steht sie im **Katalog**. Der Knopf **Im Katalog
zeigen** öffnet ihn mit ihrer Repository-Kennung in der Suche und sieht dabei
bei GitHub nach, statt den Zwischenspeicher zu lesen — ein eben angelegtes
Repository braucht dort manchmal einen Moment, bis es in der Suche auftaucht.
Im Katalog trägt jeder
Eintrag seine Herkunft: **im Hauptboard kuratiert** oder **über GitHub
gefunden**, bei gefundenen dazu das Repository.

Verweigert GitHub das Anlegen, steht der Grund in der Meldung: das Board nennt
den Eigentümer und die Anmeldung des Tokens und den Weg heraus — den Eigentümer
auf das eigene Konto setzen oder einen Token mit Recht auf die Organisation
nehmen.

## Der offene Weg — zwei Menschen, ein Board

Ein Board gehört nicht einem allein. Derselbe Weg ist von beiden Seiten
gegangen und in `test/markt43.mjs` gegen einen nachgebildeten GitHub-Server
geprüft:

1. **Anlegen.** A legt in der Bibliothek eine Station an. Sie entsteht als
   öffentliches Repository `station-<kennung>` unter dem Eigentümer, trägt das
   Thema `dsh-board-station` und steht mit ihrem Verweis in `board.json`.
2. **Auffinden.** B öffnet den Katalog. Der Katalog sucht von selbst nach dem
   Thema und findet die Station ohne Zutun; sie steht neben den kuratierten
   Einträgen. Dafür braucht B keinen Token.
3. **In einen Workflow stellen.** Auf dem gemeinsamen Board steht die Station
   in der Bibliothek. B stellt sie von dort in den Workflow. Geschrieben wird
   nur der Verweis mit seiner Fassung; die Station bleibt in ihrem Repository.
4. **Forken und beitragen.** B forkt die Station und stellt einen Pull Request
   gegen das Original. A sieht den Beitrag mit Nummer, Zustand und Quelle;
   entschieden wird auf GitHub.
5. **Ein Vorhaben anlegen.** B legt an der Station ein Vorhaben an. Es ist ein
   eigenes Repository; A sieht die Karte am Schritt, mit B als
   Verantwortlichem.

Ohne Token bleiben Board, Workflow, Station, Katalog und Pull Request lesbar.
Nur Anlegen, Forken und Beitragen brauchen eine Anmeldung; ohne Token führt
der Knopf zu GitHub, wo dieselbe Handlung möglich ist.

## Darstellung und Sprache

Das Board bringt keine eigenen Farben mit: Es liest die Farben, Flächen und
Schriften des Dashboards und folgt damit **Einstellungen → Allgemein →
Darstellung** (Hell, Dunkel, System) — auch Schriften und Schriftgrößen, die
dort gesetzt sind. Eigene Themes, die andere Plugins anmelden, gelten ebenfalls.

Eine Ausnahme ist die **Akzentfarbe des Boards**. Sie färbt Hervorhebungen im
Board und sonst nichts. Zu finden unter **Einstellungen → Board → Akzentfarbe**:
Standard (die Farbe des Dashboards), Violett, Türkis, Bernstein, Rose oder
Indigo. Jeder Akzent hat einen hellen und einen dunklen Wert; die Wahl gilt für
alle Boards und liegt persönlich in `$DSH_HOME/board/darstellung.json`.

Im selben Abschnitt stehen **Anordnung** (Frei oder Automatisch), **Mausrad**
(seitwärts oder auf und ab) und der **Eigentümer** neuer Stationen und
Vorhaben. Darunter folgen **Deine Identität** (Name, GitHub-Name, Farbe) und
**GitHub** (Token verbinden oder löschen, ein Repository prüfen). Die
Board-Leiste oben schaltet nur noch zwischen Boards und legt neue an — alles,
was eingerichtet wird, steht an einer Stelle: im Einstellungsfenster.

Die **Sprache** folgt dem Dashboard: **Einstellungen → Allgemein → Sprache**.
Acht Sprachen sind vollständig da: Deutsch, English, 中文, Español, Français,
Русский, 日本語 und العربية. Fehlt in einer Sprache ein Eintrag, steht dort der
deutsche Text, nie eine leere Stelle. Arabisch stellt die Fläche zusätzlich
rechtsläufig (`dir="rtl"`); die Karten behalten ihre Lagen, weil die Fläche ein
Ort ist und keine Textspalte.

Das Dashboard selbst bleibt bei Englisch oder Chinesisch — die übrigen
Sprachen bringt es nicht mit. Wählst du zum Beispiel Deutsch, sind die
Board-Texte deutsch, die übrige Oberfläche bleibt englisch.

## Der GitHub-Token (optional)

Der Token ist **optional**. Ohne Token kannst du lesen, klonen, lokal schreiben
und über deine Git-Anbindung veröffentlichen. Auch Pull Requests, Fragen und
Forks sind ohne Token möglich — dann über die Wege, die das Board zu GitHub
verlinkt.

Mit Token kann das Board zusätzlich:

- Repositories unter der Organisation anlegen und ein Board veröffentlichen,
- Pull Requests, Fragen und Forks direkt im Board anlegen,
- Teams und private Metadaten lesen,
- dein Schreibrecht an einem Repository prüfen.

Du trägst ihn unter **Einstellungen → Board → GitHub** ein. Das Board prüft ihn bei
GitHub, bevor es ihn speichert. Er liegt in `$DSH_HOME/board/github.json`, nur
für dich lesbar (0600), und erscheint in keiner Antwort, keiner Meldung und
keinem Protokoll. **Token löschen** entfernt ihn wieder.

Der Token ersetzt keinen Git-Zugang: Geschrieben wird über deinen SSH-Schlüssel
oder deine Git-Zugangsdaten, der Token nur für die GitHub-API.

## Beitragen, forken, fragen

Ein **Beitrag** ist ein Pull Request gegen das Repository des Dings, das du
verbessern willst. Ein **Fork** ist deine eigene Kopie dieses Repositories. Eine
**Frage** ist ein Issue an seinem Repository. Alles drei bleibt bei GitHub; das
Board führt keine zweite Ablage. Die frühere lokale Ablage unter `beitraege/`
wird nicht mehr beschrieben; vorhandene Einträge bleiben lesbar.

So läuft es im Board:

1. Öffne eine Station, einen Workflow oder ein Vorhaben in der Bibliothek oder
   im Katalog.
2. Unten stehen **Beiträge**, **Fragen** und **Fork** mit ihrem Stand.
3. Mit Token legst du einen Beitrag, eine Frage oder einen Fork direkt dort an.
   Ohne Token führt der Knopf zu GitHub, wo du dasselbe tust.
4. Entschieden wird auf GitHub: Der Verantwortliche führt den Pull Request
   zusammen, beantwortet oder schließt die Frage, übernimmt den Fork. Das Board
   zeigt beim nächsten Lesen den neuen Stand.

Für eigene Dinge bearbeitest du die Dateien im Board; jede Speicherung ist eine
Fassung in ihrem Repository. Für fremde Dinge ist der Weg der Beitrag als Pull
Request; das Board ändert deren Originaldatei nicht.

## Wo die lokalen Dateien liegen

Alles, was das Board lokal ablegt, liegt unter `$DSH_HOME/board/`:

| Pfad | Inhalt |
| --- | --- |
| `boards.json` | die Boards, die du benutzt, welches offen ist und ob ein altes Board Archiv ist |
| `identitaet.json` | dein Name, dein GitHub-Name, deine Farbe |
| `github.json` | dein GitHub-Token, falls eingetragen (0600) |
| `cache/<owner>/<repository>/` | die Klone der öffentlichen und verbundenen Repositories; löschbar und wieder herstellbar |
| `ablagen/<kennung>/` | deine lokalen Boards samt übernommenen Vorhaben |
| `sterne.json` | der Zwischenspeicher der Sterne aus dem Katalog |
| `sichtbarkeit.json` | öffentlich oder privat für Repositories, bei denen der Name es nicht sagt |

Die Repositories selbst liegen bei GitHub oder in deinem eigenen Ordner. Der
Zwischenspeicher ist eine Kopie; die Wahrheit steht im Repository.

## Die alte Ablage als Archiv

Neben den Boards der Fassung 2 kann ein Board der Fassung 1 im Register stehen.
Wird es als Archiv geführt (`archiv: true` in `boards.json`), zeigt die
Board-Leiste „Archiv“ und den Hinweis **Nur lesen**: Vorhaben, Dateien und
Gespräche bleiben lesbar; jeder Schreibversuch wird mit **403 „Die alte Ablage
ist Archiv“** abgewiesen, bevor eine Datei angefasst wird. Erlaubt bleiben der
Wechsel auf ein anderes Board, das Entfernen aus der Liste und die eigene
Identität.

Die Markierung setzt niemand beim Umzug. Erst nach der Abnahme durch den Eigentümer wird das echte Board als Archiv eingetragen; bis dahin lässt es
sich mit `BOARD_ARCHIV=1` für eine Prüfung erzwingen.

## Form der Ablage

Die Ablage hat die Fassung 2. Ein Board-Repository enthält `board.json` mit Name,
Art, Personen und den Verweisen auf Workflows, Vorhaben und Stationen; das
Hauptboard trägt zusätzlich `katalog.json`, die öffentliche Sammlung. Jedes
andere Ding trägt genau eine Ankerdatei — `station.json`, `workflow.json` oder
`vorhaben.json` — und daneben seine Dateien, Beispiele und Transkripte.

Ein Board enthält Verweise, keine Kopien der Dinge. Nur ein übernommenes
Vorhaben liegt als eigene Kopie in deinem Board, weil du daran arbeiten willst;
auch diese Kopie ist ein eigenes Repository mit eigener Geschichte.

## Prüfungen

```bash
npm test        # node --test test/*.mjs
npm run check   # node --check client.js && node --check index.js
```

`test/` enthält 84 Prüfdateien; der Testläufer zählt jede als einen Test. Davon
lesen 34 die Werkstatt des Autors — die alte Ablage und das Hauptboard, beide
außerhalb dieses Repositories. Ein fremder Klon hat beides nicht. Die CI führt
deshalb die 50 selbstständigen Prüfungen aus; sie lässt die Werkstatt-Dateien
über einen `grep -vE`-Ausdruck aus
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Eine Suite mit eigenen
Fixtures für alle 84 ist offen.

Die Prüfungen lesen den Quelltext und arbeiten auf Kopien unter `/tmp`. Sie
schreiben nicht in echte Repositories.

## Dokumentation

Die Dokumentation unter [`docs/`](docs/) ist auf Deutsch:

- [Architektur](docs/architektur.md) — Host und Client, Module, Speicherorte,
  Rechte, Zusammensetzen, Slots.
- [Entwicklung](docs/entwicklung.md) — Voraussetzungen, Einklinken ins Profil,
  Prüfungen, `client.js`, eine Sprache hinzufügen, Fehlersuche.
- [Routen](docs/routen.md) — alle `/board/*`-Routen mit Methode, Zweck, Recht
  und Antwort.
- [Datenformate](docs/datenformate.md) — die Ankerdateien, Felder und Beispiele.
- [Fehlersuche](docs/fehlersuche.md) — Symptom, Ursache, Handgriff für die
  Fälle im Betrieb.

[CONTRIBUTING.md](CONTRIBUTING.md) erklärt, wie du mitmachst;
[CHANGELOG.md](CHANGELOG.md) nennt die Änderungen;
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) sagt, wie wir miteinander umgehen;
[SECURITY.md](SECURITY.md) sagt, wie du Sicherheitslücken meldest.

## Lizenz

MIT — siehe [LICENSE](LICENSE). Copyright © 2026 Thomas Heinrich.

## Stand

Version 0.1.0 — die erste öffentliche Fassung. `package.json` führt das Paket
als privat, weil es aus Git installiert wird und nicht aus npm.

Bekannte Grenzen: Die GitHub-Schreibwege sind gegen eine Attrappe geprüft, nicht
live. Die Prüfungen benutzen keinen Browser; die sichtbare Wirkung wird von Hand
geprüft.
