/**
 * `workflow.json` lesen, prüfen und fortschreiben.
 *
 * Ein Workflow verweist auf Stationen mit ihrer Fassung und legt fest, wo sie
 * liegen und wie sie verbunden sind. Er besitzt die Stationen nicht: geändert
 * wird an ihnen in ihren eigenen Repositories.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  kennung, liesFormatDatei, liste, objekt, optionalerText, ordnerVon, text, texte, zahl,
} from './hilfe.js';

/** Die Arten, wie ein Workflow seine Positionen berechnet. */
export const LAYOUTS = ['frei', 'auto'];

/** Liest `workflow.json` aus einem Repository und prüft die Felder. */
export function liesWorkflow(repo) {
  const was = 'Workflow';
  const roh = liesFormatDatei(repo, 'workflow.json', was);

  const stationen = liste(roh.stationen, 'stationen', was).map((eintrag, i) => {
    const feld = 'stationen[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    return {
      repo: text(eintragObjekt.repo, feld + '.repo', was),
      fassung: text(eintragObjekt.fassung, feld + '.fassung', was),
      id: kennung(eintragObjekt.id, feld + '.id', was),
    };
  });
  const stationenGesehen = new Set();
  for (const station of stationen) {
    if (stationenGesehen.has(station.id)) {
      throw new Error(was + ': die Station „' + station.id + '“ steht doppelt');
    }
    stationenGesehen.add(station.id);
  }

  const positionen = liste(roh.positionen, 'positionen', was).map((eintrag, i) => {
    const feld = 'positionen[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    const station = kennung(eintragObjekt.station, feld + '.station', was);
    if (!stationenGesehen.has(station)) {
      throw new Error(was + ': Position „' + String(eintragObjekt.id)
        + '“ verweist auf keine Station: ' + JSON.stringify(station));
    }
    return {
      id: kennung(eintragObjekt.id, feld + '.id', was),
      station,
      x: zahl(eintragObjekt.x, feld + '.x', was),
      y: zahl(eintragObjekt.y, feld + '.y', was),
      bedingung: eintragObjekt.bedingung == null
        ? [] : texte(eintragObjekt.bedingung, feld + '.bedingung', was),
    };
  });
  const positionenGesehen = new Set();
  for (const position of positionen) {
    if (positionenGesehen.has(position.id)) {
      throw new Error(was + ': die Position „' + position.id + '“ steht doppelt');
    }
    positionenGesehen.add(position.id);
  }

  const kanten = liste(roh.kanten, 'kanten', was).map((eintrag, i) => {
    const feld = 'kanten[' + i + ']';
    const eintragObjekt = objekt(eintrag, feld, was);
    const von = text(eintragObjekt.von, feld + '.von', was);
    const nach = text(eintragObjekt.nach, feld + '.nach', was);
    if (!positionenGesehen.has(von) || !positionenGesehen.has(nach)) {
      throw new Error(was + ': die Kante ' + JSON.stringify([von, nach])
        + ' verbindet keine zwei Positionen');
    }
    return { von, nach };
  });

  const layout = text(roh.layout, 'layout', was);
  if (!LAYOUTS.includes(layout)) {
    throw new Error(was + ': „layout“ ist keine bekannte Art: ' + JSON.stringify(layout));
  }

  return {
    format: 2,
    id: kennung(roh.id, 'id', was),
    titel: text(roh.titel, 'titel', was),
    beschreibung: optionalerText(roh.beschreibung, 'beschreibung', was),
    autor: optionalerText(roh.autor, 'autor', was),
    stationen,
    positionen,
    kanten,
    layout,
    regeln: objekt(roh.regeln, 'regeln', was),
  };
}

/**
 * `workflow.json` um einen Stationsverweis, eine Position und eine Kante
 * fortschreiben. Gelesen werden die vorhandenen Angaben; angehängt wird nur,
 * was übergeben ist. Geschrieben wird in einem Zug über eine Zwischendatei,
 * damit nie eine halbe `workflow.json` liegen bleibt.
 */
export function schreibeWorkflow(repo, { station, position, kante } = {}) {
  const was = 'Workflow';
  const roh = liesFormatDatei(repo, 'workflow.json', was);

  if (station) {
    liste(roh.stationen, 'stationen', was);
    roh.stationen.push({
      repo: text(station.repo, 'stationen[].repo', was),
      fassung: text(station.fassung, 'stationen[].fassung', was),
      id: kennung(station.id, 'stationen[].id', was),
    });
  }

  if (position) {
    liste(roh.positionen, 'positionen', was);
    roh.positionen.push({
      id: kennung(position.id, 'positionen[].id', was),
      station: kennung(position.station, 'positionen[].station', was),
      x: zahl(position.x, 'positionen[].x', was),
      y: zahl(position.y, 'positionen[].y', was),
      bedingung: Array.isArray(position.bedingung) ? position.bedingung : [],
    });
  }

  if (kante) {
    liste(roh.kanten, 'kanten', was);
    roh.kanten.push({
      von: text(kante.von, 'kanten[].von', was),
      nach: text(kante.nach, 'kanten[].nach', was),
    });
  }

  const ort = ordnerVon(repo);
  const inhalt = JSON.stringify(roh, null, 2) + '\n';
  const pfad = join(ort, 'workflow.json');
  writeFileSync(pfad + '.tmp', inhalt, 'utf8');
  renameSync(pfad + '.tmp', pfad);
}

/**
 * Eine Station in `workflow.json` auf eine andere Fassung ziehen.
 *
 * Geändert wird nur `stationen[].fassung` dieser einen Kennung; alle anderen
 * Angaben bleiben stehen, wie sie sind. Das Nachziehen ist eine eigene
 * Handlung: eine neue Fassung an der Station ändert den Workflow nicht, bis
 * er selbst nachzieht.
 */
export function schreibeFassung(repo, id, fassung) {
  const was = 'Workflow';
  const kennungWert = kennung(id, 'stationen[].id', was);
  const ort = ordnerVon(repo);
  const roh = liesFormatDatei(ort, 'workflow.json', was);
  const eintraege = liste(roh.stationen, 'stationen', was);
  const stelle = eintraege.findIndex(
    (eintrag) => eintrag && typeof eintrag === 'object' && !Array.isArray(eintrag)
      && eintrag.id === kennungWert,
  );
  if (stelle < 0) {
    throw new Error(was + ': die Station „' + kennungWert + '“ steht nicht im Workflow');
  }
  eintraege[stelle].fassung = text(fassung, 'stationen[].fassung', was);

  const inhalt = JSON.stringify(roh, null, 2) + '\n';
  const pfad = join(ort, 'workflow.json');
  writeFileSync(pfad + '.tmp', inhalt, 'utf8');
  renameSync(pfad + '.tmp', pfad);
}
