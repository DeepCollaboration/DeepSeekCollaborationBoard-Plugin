/**
 * Zeigt, was ein Umzugsziel enthält.
 *
 * Gelesen wird ein Ordner mit getrennten Repositories der Fassung 2: je
 * Station, Workflow, Vorhaben und Board ein eigener Ordner, dazu
 * `sichtbarkeit.json`. Jedes Repository wird mit seinem Formatleser geprüft;
 * erst danach entsteht die Übersicht. Ist ein Format kaputt, bricht das
 * Werkzeug mit Exit 1 ab und nennt Repository und Grund — es wird nichts
 * geschrieben.
 *
 * Aufruf:
 *   node werkzeuge/zeige-umzug.mjs --ziel <ordner>
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { erkenneRepo } from '../repos.js';
import { liesBoard } from '../formate/board.js';
import { liesStation } from '../formate/station.js';
import { liesVorhaben } from '../formate/vorhaben.js';
import { liesWorkflow } from '../formate/workflow.js';

const SICHTBARKEITEN = ['öffentlich', 'privat'];

function abbruch(text) {
  throw new Error(text);
}

function liesArgumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    const treffer = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!treffer || treffer[1] !== 'ziel') {
      abbruch('Unbekanntes Argument: ' + argv[i]);
    }
    let wert = treffer[2];
    if (wert == null) {
      wert = argv[i + 1];
      if (wert == null || wert.startsWith('--')) {
        abbruch('--' + treffer[1] + ' braucht einen Wert');
      }
      i += 1;
    }
    werte[treffer[1]] = wert;
  }
  if (!werte.ziel) abbruch('Es fehlt --ziel (der Ordner mit den Repositories).');
  return werte;
}

/** `sichtbarkeit.json` lesen und jede Angabe prüfen. */
function liesSichtbarkeit(ziel) {
  const pfad = join(ziel, 'sichtbarkeit.json');
  if (!existsSync(pfad)) {
    abbruch('sichtbarkeit.json fehlt in ' + ziel);
  }
  let roh;
  try {
    roh = JSON.parse(readFileSync(pfad, 'utf8'));
  } catch (fehler) {
    abbruch('sichtbarkeit.json ist kein gültiges JSON ('
      + String((fehler && fehler.message) || fehler) + ')');
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    abbruch('sichtbarkeit.json ist kein Objekt');
  }
  for (const [name, wert] of Object.entries(roh)) {
    if (!SICHTBARKEITEN.includes(wert)) {
      abbruch('sichtbarkeit.json: „' + name + '“ nennt '
        + JSON.stringify(wert) + ' statt „öffentlich“ oder „privat“');
    }
  }
  return roh;
}

/** Je Station die Fassung, die ein Workflow fortschreibt. */
function fassungenDerStationen(workflows) {
  const karte = new Map();
  for (const eintrag of workflows) {
    for (const verweis of eintrag.workflow.stationen) {
      if (!verweis.fassung || karte.has(verweis.id)) continue;
      karte.set(verweis.id, verweis.fassung);
    }
  }
  return karte;
}

function zaehle(verweise) {
  return verweise.length;
}

function boardUebersicht(eintrag, sichtbarkeit) {
  const { board, ordner, repo } = eintrag;
  return {
    repo,
    id: board.id,
    name: board.name,
    art: board.art,
    pfad: ordner,
    sichtbarkeit: sichtbarkeit[repo] == null ? null : sichtbarkeit[repo],
    verweise: {
      stationen: board.stationen.map((verweis) => ({ ...verweis })),
      workflows: board.workflows.map((verweis) => ({ ...verweis })),
      vorhaben: board.vorhaben.map((verweis) => ({ ...verweis })),
    },
    stationen: zaehle(board.stationen),
    workflows: zaehle(board.workflows),
    vorhaben: zaehle(board.vorhaben),
  };
}

function main() {
  const werte = liesArgumente(process.argv.slice(2));
  const ziel = resolve(werte.ziel);
  if (!existsSync(ziel) || !statSync(ziel).isDirectory()) {
    abbruch('Das Ziel fehlt oder ist kein Ordner: ' + ziel);
  }

  const sichtbarkeit = liesSichtbarkeit(ziel);
  const ordnerNamen = readdirSync(ziel, { withFileTypes: true })
    .filter((eintrag) => eintrag.isDirectory())
    .map((eintrag) => eintrag.name)
    .sort();

  const stationen = [];
  const workflows = [];
  const vorhaben = [];
  const boards = [];

  for (const name of ordnerNamen) {
    const ordner = join(ziel, name);
    let repo;
    try {
      repo = erkenneRepo(ordner);
    } catch (fehler) {
      abbruch(name + ': ' + String((fehler && fehler.message) || fehler));
    }
    if (!repo) {
      abbruch(name + ': kein Repository (keine station.json, workflow.json, '
        + 'vorhaben.json oder board.json)');
    }
    const sicht = sichtbarkeit[name] == null ? null : sichtbarkeit[name];
    try {
      if (repo.art === 'station') {
        const station = liesStation(ordner);
        stationen.push({ repo: name, ordner, station, sichtbarkeit: sicht });
      } else if (repo.art === 'workflow') {
        const workflow = liesWorkflow(ordner);
        workflows.push({ repo: name, ordner, workflow, sichtbarkeit: sicht });
      } else if (repo.art === 'vorhaben') {
        const eintrag = liesVorhaben(ordner);
        vorhaben.push({ repo: name, ordner, vorhaben: eintrag, sichtbarkeit: sicht });
      } else if (repo.art === 'board') {
        const board = liesBoard(ordner);
        boards.push({ repo: name, ordner, board, sichtbarkeit: sicht });
      } else {
        abbruch(name + ': unbekannte Art ' + repo.art);
      }
    } catch (fehler) {
      abbruch(name + ': ' + String((fehler && fehler.message) || fehler));
    }
  }

  const fassungen = fassungenDerStationen(workflows);

  const stationenListe = stationen.map(({ repo, station, sichtbarkeit: sicht }) => ({
    repo,
    id: station.id,
    name: station.name,
    host: station.host,
    fassung: fassungen.get(station.id) || '',
    sichtbarkeit: sicht,
  }));

  const workflowsListe = workflows.map(({ repo, workflow, sichtbarkeit: sicht }) => ({
    repo,
    id: workflow.id,
    titel: workflow.titel,
    stationen: workflow.stationen.length,
    sichtbarkeit: sicht,
  }));

  const vorhabenListe = vorhaben.map(({ repo, vorhaben: eintrag, sichtbarkeit: sicht }) => ({
    repo,
    id: eintrag.id,
    name: eintrag.name,
    position: eintrag.position,
    workflow: { ...eintrag.workflow },
    sichtbarkeit: sicht,
  }));

  const boardsListe = boards.map((eintrag) => boardUebersicht(eintrag, sichtbarkeit));
  const haupt = boardsListe.find((eintrag) => eintrag.art === 'hauptboard') || null;
  const team = boardsListe.find((eintrag) => eintrag.art === 'team') || null;

  const bekannt = new Set(ordnerNamen);
  const ohneSichtbarkeit = ordnerNamen.filter((name) => sichtbarkeit[name] == null);
  const unbekannt = Object.keys(sichtbarkeit).filter((name) => !bekannt.has(name)).sort();

  const ergebnis = {
    ziel,
    stationen: stationenListe.length,
    workflows: workflowsListe.length,
    vorhaben: vorhabenListe.length,
    boards: boardsListe.length,
    sichtbarkeit,
    ohneSichtbarkeit,
    unbekannt,
    stationenListe,
    workflowsListe,
    vorhabenListe,
    boardsListe,
    hauptboard: haupt,
    team,
  };
  console.log(JSON.stringify(ergebnis, null, 2));
}

try {
  main();
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
