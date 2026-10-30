/**
 * Gemeinsame Helfer für die vier Formate.
 *
 * Jede Formatdatei liegt im Wurzelordner ihres Repositories, trägt
 * `format: 2` und wird hier gelesen. Was danach kommt, prüft jedes Format für
 * sich: Diese Helfer kennen nur Text, Listen, Objekte, Kennungen und Farben.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Der Ordner eines Repositories; erlaubt ist ein Pfad oder `{ pfad }`. */
export function ordnerVon(repo) {
  if (typeof repo === 'string' && repo) return repo;
  if (repo && typeof repo.pfad === 'string' && repo.pfad) return repo.pfad;
  throw new Error('Kein Repository-Ordner: ' + JSON.stringify(repo));
}

/** Liest eine Formatdatei, prüft JSON und `format: 2`. */
export function liesFormatDatei(repo, name, was) {
  const ort = ordnerVon(repo);
  let text;
  try {
    text = readFileSync(join(ort, name), 'utf8');
  } catch {
    throw new Error(was + ': Die Datei ' + name + ' fehlt in ' + resolve(ort));
  }
  let roh;
  try {
    roh = JSON.parse(text);
  } catch (fehler) {
    throw new Error(was + ': ' + name + ' ist kein gültiges JSON ('
      + String((fehler && fehler.message) || fehler) + ')');
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error(was + ': ' + name + ' ist kein Objekt');
  }
  if (roh.format !== 2) {
    throw new Error(was + ': ' + name + ' hat Format ' + JSON.stringify(roh.format)
      + ', erwartet 2');
  }
  return roh;
}

export function objekt(wert, feld, was) {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) {
    throw new Error(was + ': „' + feld + '“ fehlt oder ist kein Objekt');
  }
  return wert;
}

export function text(wert, feld, was) {
  if (typeof wert !== 'string' || !wert.trim()) {
    throw new Error(was + ': „' + feld + '“ fehlt oder ist kein Text');
  }
  return wert;
}

export function optionalerText(wert, feld, was) {
  if (wert == null) return '';
  if (typeof wert !== 'string') {
    throw new Error(was + ': „' + feld + '“ ist kein Text');
  }
  return wert;
}

export function kennung(wert, feld, was) {
  const wertText = text(wert, feld, was).trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(wertText)) {
    throw new Error(was + ': „' + feld + '“ ist keine gültige Kennung: '
      + JSON.stringify(wert));
  }
  return wertText;
}

export function liste(wert, feld, was) {
  if (!Array.isArray(wert)) {
    throw new Error(was + ': „' + feld + '“ fehlt oder ist keine Liste');
  }
  return wert;
}

export function texte(wert, feld, was) {
  return liste(wert, feld, was)
    .map((eintrag, i) => text(eintrag, feld + '[' + i + ']', was));
}

export function zahl(wert, feld, was) {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    throw new Error(was + ': „' + feld + '“ fehlt oder ist keine Zahl');
  }
  return wert;
}

export function farbe(wert, feld, was) {
  const wertText = text(wert, feld, was);
  if (!/^#[0-9a-f]{6}$/i.test(wertText)) {
    throw new Error(was + ': „' + feld + '“ ist keine Farbe: ' + JSON.stringify(wert));
  }
  return wertText;
}
