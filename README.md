# DeepSeek Collaboration Board — Plugin

Dieses Repository enthält die **Mechanik** des Collaboration Boards: wie eine
Station aufgebaut ist, wie Stationen verbunden werden, wie Projekte als Karten
durch einen Workflow wandern, wie die Ablage gelesen und geschrieben wird und
wie die Oberfläche sie zeigt.

Die **Inhalte** des öffentlichen Hauptboards — Menschen, Workflows, Stationen,
Projekte, Dateien und Transkripte — liegen im zweiten Repository:

**https://github.com/DeepCollaboration/DeepSeekCollaborationBoard**

Die Trennung ist Absicht: Das Plugin kennt die Form, das Board-Repository trägt
die konkreten Inhalte. Ein eigenes Board ist ein weiteres Repository oder ein
Ordner mit derselben Form.

## Installieren

Voraussetzung: DeepSeek Harness (DSH) mit Node 24 und Git.

```bash
dsh plugin --profile web add github:DeepCollaboration/DeepSeekCollaborationBoard-Plugin
```

Danach in `$DSH_HOME/profiles/web/package.json` den Namen `@local/dsh-board`
in die Liste `dsh.profile.bundles` aufnehmen:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["…", "@local/dsh-board"]
    }
  }
}
```

DSH neu starten. Beim ersten Öffnen fragt das Board nach Name, GitHub-Name und
Farbe. „Hauptboard verbinden“ holt das öffentliche Board. Wer noch keinen
GitHub-Namen eintragen will, kann ihn später am eigenen Namen nachholen.

## Erste Schritte

- **Hauptboard verbinden** — das öffentliche Board mit allen Menschen und
  Projekten. Es wird über HTTPS gelesen; für eigene Beiträge braucht es
  Schreibzugriff auf das Repository.
- **Eigenes Board anlegen** — ein lokales Board unter
  `$DSH_HOME/board/ablagen/`. Es bleibt auf diesem Rechner.
- **Board verbinden** — eine GitHub-Adresse oder einen vorhandenen Ordner.
  Ein leerer Klon bekommt die kleinste Ablage mit einer Start-Station.
- **Wechseln** — über die Leiste oben; jedes Board hat eigene Menschen,
  Workflows und Projekte.

## Öffentlich und privat

Das Hauptboard ist öffentlich: Projekte, Dateien und Transkripte sind für alle
sichtbar, auch die Entstehung. Eigene lokale Boards bleiben lokal. Bei
GitHub-Boards gilt die Sichtbarkeit des Repositories.

## Form der Ablage

Ein Board ist ein Git-Repository mit:

```
format                       die Fassung der Ablage (heute 1)
personen/<kennung>.json      Menschen mit Name, Farbe, optional GitHub-Name
workflows/<kennung>.json     Workflows einer Person: Stationen, Positionen, Kanten
vorgaenge/<ordner>/          Projekte: vorhaben.json, Dateien, transkripte/
beitraege/<vorhaben>/        vorgeschlagene Änderungen
```

Das Plugin schreibt nur, wenn die Fassung der Ablage zu seiner eigenen passt.
Ist die Ablage neuer, verweigert es das Schreiben und sagt es auf der Seite.

## Stand

Frühe Fassung. Enthalten sind Identität, mehrere Boards, Anlegen und Verbinden,
Wechseln sowie die bestehende Board-Mechanik. Beiträge über Fork und Pull
Request sind noch nicht eingebaut; bis dahin braucht ein eigenes Board einen
Git-Zugang, auf den das Plugin schreiben darf.
