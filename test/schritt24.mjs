/**
 * Prüfung Schritt 24 — die Anzeige: Kennzahlen, festes Hauptboard, Entfernen.
 *
 * Die fünf Repositories des Testboards liegen in einer eigenen Prüffläche
 * unter `/tmp/board-scheibe1/schritt24`, daneben ein eigenes `DSH_HOME` mit
 * einem Hauptboard der Fassung 1. Der Server läuft in-process, ohne Netz.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/boards` reichert jedes Board an: `hauptboard` ist nur beim
 *      Hauptboard wahr, `besitzer`, `verweise` (Workflows, Vorhaben, Stationen)
 *      und `stand` stehen da; die alten Felder bleiben.
 *   2. `POST /board/boards/entfernen` weist das Hauptboard mit 409 und
 *      „Das Hauptboard bleibt“ ab.
 *   3. Das offene Testboard lässt sich entfernen; seine fünf Ordner bleiben
 *      liegen, das Hauptboard ist danach offen, und die Antwort des
 *      Schreibwegs bleibt schlank.
 *   4. Dasselbe Testboard lässt sich über seinen Ordner wieder aufnehmen.
 *   5. `POST /board/identitaet` ändert den Namen; `GET /board/boards` zeigt ihn.
 *   6. Server, Ablage und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt24');
const HOME = join(ABLAGE, 'home');
const HAUPT = join(ABLAGE, 'hauptboard');
const REGISTER = join(HOME, 'board', 'boards.json');
// Die fünf Ordner der Prüffläche mit der Datei, die ihre Art ausmacht.
const FLAECHE = [
  ['board', 'board.json'],
  ['station-idee', 'station.json'],
  ['station-umsetzen', 'station.json'],
  ['workflow', 'workflow.json'],
  ['vorhaben', 'vorhaben.json'],
];

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesRegister() {
  return JSON.parse(readFileSync(REGISTER, 'utf8'));
}

/**
 * Das Hauptboard der Fassung 1: eine Person, ein Workflow, ein Schritt. Kein
 * Remote — es ist das Board auf diesem Rechner.
 */
function legeHauptboard() {
  mkdirSync(join(HAUPT, 'personen'), { recursive: true });
  mkdirSync(join(HAUPT, 'workflows'), { recursive: true });
  writeFileSync(join(HAUPT, 'format'), '1\n', 'utf8');
  schreibeJson(join(HAUPT, 'personen', 'p1.json'), {
    id: 'p1',
    name: 'Hauptboard-Hüter',
    farbe: '#fbbf24',
  });
  schreibeJson(join(HAUPT, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'standard',
      titel: 'Hauptboard',
      layout: 'auto',
      schritte: [{
        id: 'start',
        name: 'Start',
        host: 'p1',
        eingang: [],
        ausgabe: [],
        wie: { art: 'textfeld', wert: '' },
      }],
      positionen: [{ id: 'start', schritt: 'start', x: 40, y: 80 }],
      kanten: [],
    }],
  });
}

function ctxBauen() {
  const routen = new Map();
  const aufraeumen = [];
  return {
    routen,
    aufraeumen,
    ctx: {
      webServer: {
        register(route) {
          routen.set(route.path, route);
          return () => routen.delete(route.path);
        },
      },
      effect(fn) {
        const ende = fn();
        if (typeof ende === 'function') aufraeumen.push(ende);
      },
      get() { return undefined; },
    },
  };
}

function anfrage(pfad, koerper) {
  return {
    method: koerper ? 'POST' : 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper) yield Buffer.from(JSON.stringify(koerper), 'utf8');
    },
  };
}

function antwort() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status; },
    end(text) { this.text = String(text == null ? '' : text); },
  };
}

async function starten() {
  process.env.DSH_HOME = HOME;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  modul.apply(gebaut.ctx);
  return gebaut;
}

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad, koerper), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === join(ABLAGE, 'board'),
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

  legeHauptboard();
  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'hauptboard',
    boards: [
      {
        id: 'hauptboard', name: 'Hauptboard', format: 1, art: 'ordner',
        repo: HAUPT, remote: null, person: 'p1',
      },
      {
        id: 'testboard', name: 'Testboard', format: 2, art: 'team',
        repo: flaeche.board, remote: null, person: 'p1',
      },
    ],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  // 1. Die Anzeige: beide Boards, nur eines ist das Hauptboard.
  const liste = await ruf(gebaut, '/board/boards');
  pruefe(liste.status === 200, 'GET /board/boards antwortet ' + liste.status
    + ': ' + JSON.stringify(liste.daten));
  const eintraege = Array.isArray(liste.daten.boards) ? liste.daten.boards : [];
  pruefe(eintraege.length === 2,
    'GET /board/boards listet ' + eintraege.length + ' Boards statt zwei');
  const haupt = eintraege.find((b) => b.id === 'hauptboard');
  const test = eintraege.find((b) => b.id === 'testboard');
  pruefe(haupt && test, 'Es fehlt eines der beiden Boards: '
    + JSON.stringify(eintraege.map((b) => b.id)));
  pruefe(haupt.name === 'Hauptboard' && haupt.format === 1,
    'Das Hauptboard trägt nicht Name und Fassung 1: ' + JSON.stringify(haupt));
  pruefe(test.name === 'Testboard' && test.format === 2,
    'Das Testboard trägt nicht Name und Fassung 2: ' + JSON.stringify(test));
  pruefe(haupt.hauptboard === true,
    'Das Hauptboard ist nicht als Hauptboard gekennzeichnet: ' + JSON.stringify(haupt));
  pruefe(test.hauptboard === false,
    'Das Testboard gilt als Hauptboard: ' + JSON.stringify(test.hauptboard));
  pruefe(eintraege.filter((b) => b.hauptboard).length === 1,
    'Es gibt mehr als ein Hauptboard: '
      + JSON.stringify(eintraege.map((b) => [b.id, b.hauptboard])));
  pruefe(haupt.besitzer === 'Hauptboard-Hüter',
    'Der Besitzer des Hauptboards ist nicht die Person aus dem Register: '
      + JSON.stringify(haupt.besitzer));
  pruefe(test.besitzer === 'Thomas Heinrich',
    'Der Besitzer des Testboards kommt nicht aus board.json: '
      + JSON.stringify(test.besitzer));
  pruefe(haupt.verweise && haupt.verweise.workflows === 1
    && haupt.verweise.vorhaben === 0 && haupt.verweise.stationen === 1,
  'Die Verweise der Fassung 1 stimmen nicht (W 1 · V 0 · S 1): '
    + JSON.stringify(haupt.verweise));
  pruefe(test.verweise && test.verweise.workflows === 1
    && test.verweise.vorhaben === 1 && test.verweise.stationen === 2,
  'Die Verweise der Fassung 2 stimmen nicht (W 1 · V 1 · S 2): '
    + JSON.stringify(test.verweise));
  for (const board of [haupt, test]) {
    pruefe(board.stand && typeof board.stand === 'object',
      'Dem Board fehlt der Stand: ' + JSON.stringify(board));
    pruefe(board.stand.lage === 'kein remote',
      'Ohne Remote steht nicht „kein remote“: ' + JSON.stringify(board.stand));
    pruefe(board.stand.nur_lokal === 0,
      'Ohne Remote zählt „nur_lokal“ nicht 0: ' + JSON.stringify(board.stand));
    pruefe(Object.prototype.hasOwnProperty.call(board.stand, 'zeit')
      && Object.prototype.hasOwnProperty.call(board.stand, 'remote'),
    'Dem Stand fehlen „zeit“ oder „remote“: ' + JSON.stringify(board.stand));
    pruefe(!board.fehler,
      'Ein lesbares Board trägt einen Fehler: ' + JSON.stringify(board.fehler));
    pruefe(typeof board.repo === 'string' && board.repo.length > 0,
      'Dem Board fehlt der Ordner für „Adresse“: ' + JSON.stringify(board));
  }
  console.log('ok Anzeige: hauptboard nur beim Hauptboard wahr; Besitzer '
    + haupt.besitzer + ' und ' + test.besitzer + '; Verweise W 1 · V 0 · S 1 '
    + 'und W 1 · V 1 · S 2; Stand „kein Remote“');

  // 2. Das Hauptboard bleibt.
  const hauptWeg = await ruf(gebaut, '/board/boards/entfernen', { id: 'hauptboard' });
  pruefe(hauptWeg.status === 409,
    'Das Entfernen des Hauptboards antwortet ' + hauptWeg.status + ' statt 409');
  pruefe(String((hauptWeg.daten && hauptWeg.daten.error) || '') === 'Das Hauptboard bleibt',
    'Die Meldung lautet nicht „Das Hauptboard bleibt“: '
      + JSON.stringify(hauptWeg.daten && hauptWeg.daten.error));
  pruefe(liesRegister().boards.length === 2,
    'Trotz 409 ist das Hauptboard aus dem Register verschwunden');
  const nachAbweisung = await ruf(gebaut, '/board/boards');
  pruefe(nachAbweisung.daten.boards.length === 2,
    'Nach der Abweisung listet GET /board/boards nicht mehr beide Boards');

  // 3. Das offene Testboard entfernen; seine Ordner bleiben liegen.
  const wechsel = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(wechsel.status === 200 && wechsel.daten.aktiv === 'testboard',
    'Das Testboard ließ sich nicht öffnen: ' + wechsel.status + ' '
      + JSON.stringify(wechsel.daten));
  const weg = await ruf(gebaut, '/board/boards/entfernen', { id: 'testboard' });
  pruefe(weg.status === 200, 'Das Entfernen des Testboards antwortet ' + weg.status
    + ': ' + JSON.stringify(weg.daten));
  pruefe(weg.daten.aktiv === 'hauptboard',
    'Nach dem Entfernen des offenen Testboards ist nicht das Hauptboard offen: '
      + JSON.stringify(weg.daten.aktiv));
  const register = liesRegister();
  pruefe(register.boards.length === 1
    && register.boards[0].id === 'hauptboard' && register.aktiv === 'hauptboard',
  'Das Register steht nach dem Entfernen nicht auf dem Hauptboard: '
    + JSON.stringify(register));
  // Die Antwort des Schreibwegs bleibt schlank; die Anzeige kommt nur aus GET.
  const schlank = Array.isArray(weg.daten.boards) ? weg.daten.boards[0] : null;
  pruefe(schlank && !Object.prototype.hasOwnProperty.call(schlank, 'hauptboard')
    && !Object.prototype.hasOwnProperty.call(schlank, 'besitzer')
    && !Object.prototype.hasOwnProperty.call(schlank, 'verweise')
    && !Object.prototype.hasOwnProperty.call(schlank, 'stand'),
  'Die Antwort des Schreibwegs trägt die Kennzahlen der Anzeige: '
    + JSON.stringify(schlank));
  for (const [ordner, anker] of FLAECHE) {
    pruefe(existsSync(join(ABLAGE, ordner, anker)),
      'Das Entfernen hat den Ordner „' + ordner + '“ angetastet');
  }

  // 4. Dasselbe Testboard über seinen Ordner wieder aufnehmen.
  const wieder = await ruf(gebaut, '/board/boards', { adresse: flaeche.board });
  pruefe(wieder.status === 200, 'POST /board/boards (Testboard) antwortet '
    + wieder.status + ': ' + JSON.stringify(wieder.daten));
  pruefe(wieder.daten.board === 'testboard' && wieder.daten.aktiv === 'testboard',
    'Wieder aufgenommen wurde nicht das Testboard: ' + JSON.stringify(wieder.daten));
  const danach = await ruf(gebaut, '/board/boards');
  pruefe(danach.status === 200, 'GET /board/boards antwortet ' + danach.status);
  const wiederTest = (danach.daten.boards || []).find((b) => b.id === 'testboard');
  pruefe(wiederTest && wiederTest.hauptboard === false,
    'Das wieder aufgenommene Testboard fehlt oder gilt als Hauptboard: '
      + JSON.stringify(wiederTest));
  pruefe(wiederTest.verweise && wiederTest.verweise.vorhaben === 1,
    'Das wieder aufgenommene Testboard verliert seine Verweise: '
      + JSON.stringify(wiederTest.verweise));
  for (const [ordner, anker] of FLAECHE) {
    pruefe(existsSync(join(ABLAGE, ordner, anker)),
      'Der Ordner „' + ordner + '“ fehlt nach dem Wiederaufnehmen');
  }

  // 5. Die Identität an derselben Stelle ändern.
  const identitaet = await ruf(gebaut, '/board/identitaet', {
    name: 'Thomas Neu', github: '', farbe: '#8b5cf6',
  });
  pruefe(identitaet.status === 200, 'POST /board/identitaet antwortet '
    + identitaet.status + ': ' + JSON.stringify(identitaet.daten));
  const neu = await ruf(gebaut, '/board/boards');
  pruefe(neu.status === 200, 'GET /board/boards antwortet ' + neu.status);
  pruefe(neu.daten.identitaet && neu.daten.identitaet.name === 'Thomas Neu',
    'GET /board/boards zeigt den geänderten Namen nicht: '
      + JSON.stringify(neu.daten.identitaet));
  pruefe(neu.daten.identitaet.farbe === '#8b5cf6',
    'GET /board/boards zeigt die geänderte Farbe nicht: '
      + JSON.stringify(neu.daten.identitaet));
  console.log('ok Kennzahlen: Hauptboard abgewiesen (409 „Das Hauptboard bleibt“); '
    + 'Testboard entfernt und über seinen Ordner wieder aufgenommen, die fünf Ordner '
    + 'liegen weiter da; Identität geändert, GET /board/boards zeigt „Thomas Neu“');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
