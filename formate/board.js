/**
 * `board.json` lesen, prüfen und fortschreiben.
 *
 * Ein Board ist eine Liste von Verweisen: Menschen, Workflows, Vorhaben und
 * Stationen. Es besitzt ihre Inhalte nicht; es sagt nur, was zu ihm gehört und
 * wie es aussieht.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  farbe, kennung, liesFormatDatei, liste, objekt, ordnerVon, text,
} from './hilfe.js';

/** Die Arten eines Boards. */
export const BOARD_ARTEN = ['hauptboard', 'team', 'lokal'];

function personenLesen(roh, was) {
  const personen = liste(roh, 'personen', was).map((eintrag, i) => {
    const feld = 'personen[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return {
      login: text(eintragObjekt.login, feld + '.login', was),
      name: text(eintragObjekt.name, feld + '.name', was),
      farbe: farbe(eintragObjekt.farbe, feld + '.farbe', was),
    };
  });
  const gesehen = new Set();
  for (const person of personen) {
    if (gesehen.has(person.login)) {
      throw new Error(was + ': die Person „' + person.login + '“ steht doppelt');
    }
    gesehen.add(person.login);
  }
  return personen;
}

function workflowVerweise(roh, was) {
  return liste(roh, 'workflows', was).map((eintrag, i) => {
    const feld = 'workflows[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return {
      repo: text(eintragObjekt.repo, feld + '.repo', was),
      fassung: text(eintragObjekt.fassung, feld + '.fassung', was),
    };
  });
}

function repoVerweise(roh, feldName, was) {
  return liste(roh, feldName, was).map((eintrag, i) => {
    const feld = feldName + '[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return { repo: text(eintragObjekt.repo, feld + '.repo', was) };
  });
}

/** Liest `board.json` aus einem Repository und prüft die Felder. */
export function liesBoard(repo) {
  const was = 'Board';
  const roh = liesFormatDatei(repo, 'board.json', was);

  const art = text(roh.art, 'art', was);
  if (!BOARD_ARTEN.includes(art)) {
    throw new Error(was + ': „art“ ist keine bekannte Board-Art: ' + JSON.stringify(art));
  }

  return {
    format: 2,
    id: kennung(roh.id, 'id', was),
    name: text(roh.name, 'name', was),
    art,
    personen: personenLesen(roh.personen, was),
    workflows: workflowVerweise(roh.workflows, was),
    vorhaben: repoVerweise(roh.vorhaben, 'vorhaben', was),
    stationen: repoVerweise(roh.stationen, 'stationen', was),
    einstellungen: objekt(roh.einstellungen, 'einstellungen', was),
    layout: objekt(roh.layout, 'layout', was),
  };
}

/** Der aufgelöste lokale Pfad eines Verweises; eine Adresse bleibt leer. */
function pfadImBoard(ort, verweis) {
  const wert = String(verweis == null ? '' : verweis).trim();
  if (!wert || /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(wert)) return '';
  return resolve(ort, wert);
}

/**
 * `board.json` um einen Workflow-Verweis erweitern.
 *
 * Gelesen wird die Datei roh: alle Angaben bleiben stehen, wie sie sind;
 * geändert wird nur `workflows`. Ein Verweis auf denselben Ordner steht danach
 * einmal da. Geschrieben wird in einem Zug über eine Zwischendatei, damit nie
 * eine halbe `board.json` liegen bleibt.
 *
 * Zurück kommt `true`, wenn der Verweis neu aufgenommen wurde; war er schon
 * da, bleibt die Datei unberührt und die Antwort ist `false`.
 */
export function schreibeBoard(repo, { workflow } = {}) {
  const was = 'Board';
  const ort = resolve(ordnerVon(repo));
  const roh = liesFormatDatei(ort, 'board.json', was);
  liste(roh.workflows, 'workflows', was);
  if (!workflow) return false;

  const verweis = {
    repo: text(workflow.repo, 'workflows[].repo', was).trim(),
    fassung: text(workflow.fassung, 'workflows[].fassung', was),
  };
  const ziel = pfadImBoard(ort, verweis.repo);
  if (!ziel) {
    throw new Error(was + ': „workflows[].repo“ ist kein lokaler Ordner: '
      + JSON.stringify(verweis.repo));
  }
  if (roh.workflows.some((eintrag) => pfadImBoard(ort, eintrag && eintrag.repo) === ziel)) {
    return false;
  }

  roh.workflows.push(verweis);
  const inhalt = JSON.stringify(roh, null, 2) + '\n';
  const pfad = join(ort, 'board.json');
  writeFileSync(pfad + '.tmp', inhalt, 'utf8');
  renameSync(pfad + '.tmp', pfad);
  return true;
}
