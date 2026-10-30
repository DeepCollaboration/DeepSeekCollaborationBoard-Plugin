/**
 * Lokale Repositories erkennen und lesen.
 *
 * Ein Repository der Fassung 2 ist ein Ordner mit genau einer Ankerdatei:
 * `station.json`, `workflow.json`, `vorhaben.json` oder `board.json`. Diese
 * Datei sagt, was der Ordner ist. Gelesen wird nur das Dateisystem — kein Git,
 * kein Remote, kein Netz.
 *
 * Die Formate selbst prüfen `formate/station.js`, `formate/workflow.js`,
 * `formate/vorhaben.js` und `formate/board.js`; hier steht nur, welche Art
 * vorliegt und welche Dateien daneben liegen.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Die Organisation, unter der die öffentlichen Dinge liegen. */
export const CACHE_ORGANISATION = process.env.DSH_GITHUB_ORG || 'DeepCollaboration';

/** Von wo die Dinge der Organisation geholt werden, wenn sie lokal fehlen. */
export const CACHE_BASIS = process.env.DSH_BOARD_REMOTE_BASIS || 'https://github.com';

/**
 * Wo ein Repository der Organisation im eigenen Zuhause liegt:
 * `$DSH_HOME/board/cache/<owner>/<name>`. Ohne Zuhause gibt es keinen Ort.
 */
export function cachePfad(home, owner, name) {
  const zuhause = String(home == null ? '' : home).trim();
  if (!zuhause) return '';
  return join(zuhause, 'board', 'cache', String(owner), String(name));
}

/** Die Ankerdatei je Art, in der Reihenfolge, in der gesucht wird. */
export const ANKER = {
  station: 'station.json',
  workflow: 'workflow.json',
  vorhaben: 'vorhaben.json',
  board: 'board.json',
};

/** Die Arten, die ein lokales Repository haben kann. */
export const ARTEN = Object.keys(ANKER);

function istOrdner(pfad) {
  try {
    return statSync(pfad).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Alle Dateien unterhalb des Repositories, relativ und mit `/` als Trenner,
 * sortiert. `.git` bleibt draußen: die Geschichte gehört nicht zum Inhalt.
 * Verweise (Symlinks) werden nicht verfolgt.
 */
function liesDateien(ordner, basis, liste) {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (eintrag.name === '.git') continue;
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      liesDateien(pfad, basis, liste);
    } else if (eintrag.isFile()) {
      liste.push(relative(basis, pfad).split(sep).join('/'));
    }
  }
  return liste;
}

/**
 * Erkennt ein lokales Repository an seiner Ankerdatei. Gibt
 * `{ pfad, art, dateien }` zurück oder `null`, wenn der Ordner keines ist.
 * Mehrere Ankerdateien in einem Ordner sind ein Fehler: er wäre nicht eindeutig.
 */
export function erkenneRepo(pfad) {
  const ort = resolve(String(pfad == null ? '' : pfad));
  if (!istOrdner(ort)) return null;
  const treffer = ARTEN.filter((art) => existsSync(join(ort, ANKER[art])));
  if (treffer.length === 0) return null;
  if (treffer.length > 1) {
    throw new Error('Mehrdeutiges Repository: ' + ort + ' hat '
      + treffer.map((art) => ANKER[art]).join(', '));
  }
  return {
    pfad: ort,
    art: treffer[0],
    dateien: liesDateien(ort, ort, []).sort(),
  };
}

/** Wie `erkenneRepo`, aber ein Ordner ohne Ankerdatei ist ein Fehler. */
export function liesRepo(pfad) {
  const repo = erkenneRepo(pfad);
  if (!repo) {
    throw new Error('Kein Repository: ' + resolve(String(pfad == null ? '' : pfad))
      + ' hat keine der Dateien ' + Object.values(ANKER).join(', '));
  }
  return repo;
}
