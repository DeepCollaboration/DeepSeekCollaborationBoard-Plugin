# Sicherheit

## Melden

Bitte über die GitHub-Sicherheitsmeldungen des Repositories
(„Report a vulnerability“), nicht als offenes Issue. Wir antworten dort.

## Was das Plugin tut

- Es läuft im DeepSeek Harness und liest und schreibt Git-Repositories auf dem
  Rechner, auf dem der Harness läuft.
- Der GitHub-Token liegt unter `$DSH_HOME/board/` mit Rechten `0600` und wird
  nur für Aufrufe an GitHub benutzt. Er erscheint in keiner Antwort der
  Board-Routen.
- Die Board-Routen des Harness haben **keine eigene Anmeldung**. Wer den
  Web-Server erreicht, kann die Fläche lesen und die Routen aufrufen. Deshalb:
  den Harness nur in einem vertrauenswürdigen Netz betreiben, nicht offen ins
  Internet stellen.
- Private Repositories bleiben privat, solange GitHub sie so führt; das Board
  zeigt nur, was der angemeldete Token lesen darf.

## Nicht in diesem Repository

- Keine Tokens, keine Schlüssel, keine Zugangsdaten. Wer einen findet, meldet
  ihn bitte vertraulich.
