/**
 * `vorhaben.json` lesen und prüfen.
 *
 * Ein Vorhaben hängt an einem Workflow mit fester Fassung und steht an genau
 * einer Position darin. Seine Verantwortlichen werden je Position genannt;
 * seine Läufe, seine Dateien und seine Abzweigungen liegen bei ihm.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  farbe, kennung, liesFormatDatei, liste, objekt, ordnerVon, text, texte,
} from './hilfe.js';

/**
 * Ein Verweis auf ein anderes Repository: entweder ein Name oder
 * `{ repo, fassung }`. `null` heißt: es gibt keinen.
 */
function verweis(wert, feld, was) {
  if (wert == null) return null;
  if (typeof wert === 'string') {
    return text(wert, feld, was);
  }
  const eintrag = objekt(wert, feld, was);
  const ziel = { repo: text(eintrag.repo, feld + '.repo', was) };
  if (eintrag.fassung != null) ziel.fassung = text(eintrag.fassung, feld + '.fassung', was);
  return ziel;
}

/** Liest `vorhaben.json` aus einem Repository und prüft die Felder. */
export function liesVorhaben(repo) {
  const was = 'Vorhaben';
  const roh = liesFormatDatei(repo, 'vorhaben.json', was);

  const workflow = objekt(roh.workflow, 'workflow', was);
  const verantwortlicheRoh = objekt(roh.verantwortliche, 'verantwortliche', was);
  const verantwortliche = {};
  for (const [position, logins] of Object.entries(verantwortlicheRoh)) {
    const feld = 'verantwortliche.' + position;
    kennung(position, feld, was);
    verantwortliche[position] = texte(logins, feld, was);
  }

  const laeufe = liste(roh.laeufe, 'laeufe', was).map((eintrag, i) => {
    return objekt(eintrag, 'laeufe[' + i + ']', was);
  });

  return {
    format: 2,
    id: kennung(roh.id, 'id', was),
    name: text(roh.name, 'name', was),
    workflow: {
      repo: text(workflow.repo, 'workflow.repo', was),
      fassung: text(workflow.fassung, 'workflow.fassung', was),
    },
    position: kennung(roh.position, 'position', was),
    verantwortliche,
    laeufe,
    fork_von: verweis(roh.fork_von, 'fork_von', was),
    zweig_von: verweis(roh.zweig_von, 'zweig_von', was),
    farbe: farbe(roh.farbe, 'farbe', was),
  };
}

/**
 * Schreibt `vorhaben.json` zurück: Die gelesenen Angaben bleiben, nur
 * `position` und `verantwortliche` werden ersetzt. Das Format bleibt 2; es
 * werden keine Felder erfunden und die übrigen Angaben behalten ihre
 * Reihenfolge.
 */
export function schreibeVorhaben(repo, { position, verantwortliche } = {}) {
  const was = 'Vorhaben';
  const roh = liesFormatDatei(repo, 'vorhaben.json', was);
  const ziel = kennung(position, 'position', was);
  if (!verantwortliche || typeof verantwortliche !== 'object'
    || Array.isArray(verantwortliche)) {
    throw new Error(was + ': „verantwortliche“ fehlt oder ist kein Objekt');
  }
  for (const [stelle, logins] of Object.entries(verantwortliche)) {
    const feld = 'verantwortliche.' + stelle;
    kennung(stelle, feld, was);
    texte(logins, feld, was);
  }

  roh.position = ziel;
  roh.verantwortliche = verantwortliche;

  const ort = ordnerVon(repo);
  const text = JSON.stringify(roh, null, 2) + '\n';
  const pfad = join(ort, 'vorhaben.json');
  writeFileSync(pfad + '.tmp', text, 'utf8');
  renameSync(pfad + '.tmp', pfad);
}
