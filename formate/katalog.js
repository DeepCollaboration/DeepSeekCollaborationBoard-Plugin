/**
 * `katalog.json` lesen, prüfen und schreiben.
 *
 * Der Katalog ist kuratiert: Er nennt die öffentlichen Dinge des Hauptboards,
 * nicht alles, was dort liegt. Ein Eintrag ist ein Verweis auf ein Repository;
 * die Angaben zu Name, Host und Fassung stehen in dessen eigener Datei und
 * werden erst beim Sammeln gelesen.
 *
 * `geprueft` hält fest, wer wann welches Repository angesehen hat. Eine leere
 * Liste heißt: geprüft wurde noch nichts — es wird keine Prüfung erfunden.
 *
 * `gesperrt` nennt Einträge, die nicht mehr im öffentlichen Katalog erscheinen
 * sollen, ohne aus dem Katalog gelöscht zu werden. Die Liste ist freiwillig;
 * fehlt sie, ist sie leer.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  liesFormatDatei, liste, objekt, optionalerText, ordnerVon, text,
} from './hilfe.js';

/** Die Arten, die ein Katalog nennt. */
export const KATALOG_ARTEN = ['station', 'workflow', 'vorhaben'];

function besonderheiten(roh, was) {
  return liste(roh.stationen, 'stationen', was).map((eintrag, i) => {
    const feld = 'stationen[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return {
      repo: text(eintragObjekt.repo, feld + '.repo', was),
      besonderheit: optionalerText(eintragObjekt.besonderheit, feld + '.besonderheit', was),
    };
  });
}

function repoVerweise(roh, feldName, was) {
  return liste(roh[feldName], feldName, was).map((eintrag, i) => {
    const feld = feldName + '[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return { repo: text(eintragObjekt.repo, feld + '.repo', was) };
  });
}

function pruefungen(roh, was) {
  return liste(roh.geprueft, 'geprueft', was).map((eintrag, i) => {
    const feld = 'geprueft[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return {
      repo: text(eintragObjekt.repo, feld + '.repo', was),
      von: text(eintragObjekt.von, feld + '.von', was),
      am: text(eintragObjekt.am, feld + '.am', was),
    };
  });
}

/** Liest `katalog.json` aus einem Repository und prüft die Felder. */
export function liesKatalog(repo) {
  const was = 'Katalog';
  const roh = liesFormatDatei(repo, 'katalog.json', was);
  return {
    format: 2,
    stationen: besonderheiten(roh, was),
    workflows: repoVerweise(roh, 'workflows', was),
    vorhaben: repoVerweise(roh, 'vorhaben', was),
    // Die Sperrliste ist freiwillig: fehlt sie, ist nichts gesperrt.
    gesperrt: roh.gesperrt == null ? [] : repoVerweise(roh, 'gesperrt', was),
    geprueft: pruefungen(roh, was),
  };
}

/**
 * Schreibt `katalog.json`. Geschrieben wird in einem Zug über eine
 * Zwischendatei, damit nie ein halber Katalog liegen bleibt.
 */
export function schreibeKatalog(repo, {
  stationen = [], workflows = [], vorhaben = [], gesperrt = [], geprueft = [],
} = {}) {
  const was = 'Katalog';
  const inhalt = {
    format: 2,
    stationen: besonderheiten({ stationen }, was),
    workflows: repoVerweise({ workflows }, 'workflows', was),
    vorhaben: repoVerweise({ vorhaben }, 'vorhaben', was),
    gesperrt: repoVerweise({ gesperrt }, 'gesperrt', was),
    geprueft: pruefungen({ geprueft }, was),
  };
  const ort = ordnerVon(repo);
  const pfad = join(ort, 'katalog.json');
  writeFileSync(pfad + '.tmp', JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
  renameSync(pfad + '.tmp', pfad);
  return inhalt;
}
