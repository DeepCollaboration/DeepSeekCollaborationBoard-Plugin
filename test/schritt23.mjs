/**
 * Prüfung Schritt 23 — der Wechsel auf ein Board der Fassung 2 und die
 * sichtbaren Aktionen an seiner Karte.
 *
 * Die fünf Repositories liegen in einer eigenen Prüffläche unter
 * `/tmp/board-scheibe1/schritt23`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process, ohne Netz; das Testboard wird über `POST /board/boards`
 * mit seinem lokalen Ordner verbunden.
 *
 * Geprüft wird:
 *
 *   1. Das Testboard der Fassung 2 lässt sich anwählen, obwohl ihm die Datei
 *      „format“ fehlt: `POST /board/boards/wechsel` antwortet 200 und
 *      `GET /board/data` nennt es als aktiv. Vorher antwortete die Route 409.
 *   2. `/board/data` liefert an der Karte dieselben Felder wie bei Fassung 1:
 *      `verantwortliche` als Objekt, `regel`, `verantwortet` und `darf` aus
 *      der einen Stelle `darfVon`. Für p1 sind alle vier Aktionen erlaubt.
 *   3. Steht an der Station eine andere Person (p2), liefert dieselbe Route
 *      `darf.verschieben: false`; die Datei wird ohne Commit geändert und
 *      danach zurückgesetzt.
 *   4. Ein Registereintrag ohne `board.json` (Fassung 2) und einer ohne
 *      `format` (Fassung 1) antworten beide 409 mit der Meldung vom fehlenden
 *      Ordner.
 *   5. Server, Ablage und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt23');
const HOME = join(ABLAGE, 'home');
const BOARD = join(ABLAGE, 'board');
const VORHABEN = join(ABLAGE, 'vorhaben');
const VORHABEN_ID = 'board-gesamtkonzept';
const ALTBOARD = join(ABLAGE, 'altboard');
const OHNE_BOARDJSON = join(ABLAGE, 'ohne-boardjson');
const OHNE_FORMAT = join(ABLAGE, 'ohne-format');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
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

/** Die eine Karte des Testboards aus einer `/board/data`-Antwort. */
function karteVon(daten, was) {
  const liste = Array.isArray(daten.vorgaenge) ? daten.vorgaenge : [];
  pruefe(liste.length === 1, was + ': das Board zeigt ' + liste.length
    + ' Vorhaben statt genau einem');
  pruefe(liste[0].id === VORHABEN_ID, was + ': die Karte ist nicht '
    + VORHABEN_ID + ', sondern ' + JSON.stringify(liste[0].id));
  return liste[0];
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);
  pruefe(flaeche.vorhaben === VORHABEN_ID,
    'Die Prüffläche meldet nicht die Kennung des Vorhabens: ' + flaeche.vorhaben);

  // Zwei Registereinträge, deren Ordner es gibt, in denen aber die Datei
  // fehlt, die ihre Fassung ausmacht. Sie werden vor dem Start eingetragen,
  // weil das Register beim Laden gelesen wird.
  mkdirSync(OHNE_BOARDJSON, { recursive: true });
  mkdirSync(OHNE_FORMAT, { recursive: true });
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: null,
    boards: [
      {
        id: 'ohne-boardjson', name: 'Ohne board.json', format: 2, art: 'lokal',
        repo: OHNE_BOARDJSON, person: 'p1',
      },
      {
        id: 'ohne-format', name: 'Ohne format', format: 1, art: 'ordner',
        repo: OHNE_FORMAT, person: 'p1',
      },
    ],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  // 1. Das Testboard der Fassung 2 verbinden; es ist danach das offene Board.
  const verbunden = await ruf(gebaut, '/board/boards', { adresse: BOARD });
  pruefe(verbunden.status === 200,
    'POST /board/boards antwortet ' + verbunden.status + ': ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.board === 'testboard',
    'Verbunden wurde nicht das Testboard: ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.aktiv === 'testboard', 'Das Testboard ist nicht aktiv');

  // Ein zweites, gewöhnliches Board (Fassung 1) wird angelegt und ist danach
  // offen. So ist der Wechsel auf das Testboard wirklich ein Zurückwechseln.
  const alt = await ruf(gebaut, '/board/boards', { name: 'Altboard', adresse: ALTBOARD });
  pruefe(alt.status === 200,
    'POST /board/boards (Altboard) antwortet ' + alt.status + ': '
      + JSON.stringify(alt.daten));
  pruefe(alt.daten.board === 'altboard',
    'Angelegt wurde nicht das Altboard: ' + JSON.stringify(alt.daten));
  pruefe(alt.daten.aktiv === 'altboard', 'Das Altboard ist nicht aktiv');

  // Vor diesem Schritt antwortete die Route 409, weil dem Board der Fassung 2
  // die Datei „format“ fehlt. Jetzt zählt `board.json`.
  const zurueck = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(zurueck.status === 200,
    'POST /board/boards/wechsel auf testboard antwortet ' + zurueck.status + ': '
      + JSON.stringify(zurueck.daten));
  pruefe(zurueck.daten.aktiv === 'testboard',
    'Nach dem Wechsel ist nicht testboard aktiv: ' + JSON.stringify(zurueck.daten.aktiv));

  // 2. Die Karte trägt die Felder, die die Seite für ihre Aktionen liest.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status);
  pruefe(daten.daten.aktiv === 'testboard',
    '/board/data nennt nicht testboard als aktiv: ' + JSON.stringify(daten.daten.aktiv));
  pruefe(daten.daten.format === 2,
    '/board/data nennt nicht Fassung 2: ' + JSON.stringify(daten.daten.format));
  const karte = karteVon(daten.daten, '/board/data');
  pruefe(karte.position === 'idee',
    'Die Karte steht nicht an idee: ' + JSON.stringify(karte.position));
  pruefe(karte.verantwortliche && typeof karte.verantwortliche === 'object'
    && !Array.isArray(karte.verantwortliche),
  'Die Karte trägt „verantwortliche“ nicht als Objekt: '
    + JSON.stringify(karte.verantwortliche));
  pruefe(Array.isArray(karte.verantwortliche.idee)
    && karte.verantwortliche.idee.includes('p1'),
  'Die Karte nennt an idee nicht p1: ' + JSON.stringify(karte.verantwortliche.idee));
  pruefe(karte.regel === 'einer',
    'Die Karte nennt nicht die Regel „einer“: ' + JSON.stringify(karte.regel));
  pruefe(typeof karte.verantwortet === 'string' && karte.verantwortet.length > 0,
    'Die Karte nennt nicht, wer sie verantwortet: ' + JSON.stringify(karte.verantwortet));
  const darf = karte.darf && typeof karte.darf === 'object' ? karte.darf : {};
  for (const aktion of ['verschieben', 'weitergeben', 'aendern', 'zurueckschicken']) {
    pruefe(darf[aktion] === true,
      'Die Karte erlaubt p1 nicht „' + aktion + '“: ' + JSON.stringify(karte.darf));
  }
  console.log('ok Wechsel: testboard aktiv; darf.weitergeben: true, '
    + 'darf.verschieben: true, darf.aendern: true, darf.zurueckschicken: true; '
    + 'verantwortet von ' + karte.verantwortet);

  // 3. Eine andere verantwortliche Person: dieselbe Route rechnet neu, ohne
  // dass etwas gespeichert wird. Die Datei wird ohne Commit geändert.
  const datei = join(VORHABEN, 'vorhaben.json');
  const original = readFileSync(datei, 'utf8');
  try {
    const roh = JSON.parse(original);
    roh.verantwortliche.idee = ['p2'];
    writeFileSync(datei, JSON.stringify(roh, null, 2) + '\n', 'utf8');

    const fremd = await ruf(gebaut, '/board/data');
    pruefe(fremd.status === 200, 'GET /board/data antwortet ' + fremd.status);
    const fremdeKarte = karteVon(fremd.daten, '/board/data (p2)');
    pruefe(Array.isArray(fremdeKarte.verantwortliche.idee)
      && fremdeKarte.verantwortliche.idee.length === 1
      && fremdeKarte.verantwortliche.idee[0] === 'p2',
    'Die geänderte Verantwortung steht nicht in der Antwort: '
      + JSON.stringify(fremdeKarte.verantwortliche.idee));
    pruefe(fremdeKarte.darf && fremdeKarte.darf.verschieben === false,
      'p2 bekommt „verschieben“: ' + JSON.stringify(fremdeKarte.darf));
    console.log('ok Verantwortung: mit p2 in vorhaben.json ist '
      + 'darf.verschieben: false');
  } finally {
    writeFileSync(datei, original, 'utf8');
  }
  pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
    'vorhaben.json wurde nicht auf den Stand der Fassung zurückgesetzt');
  const wieder = await ruf(gebaut, '/board/data');
  const wiederKarte = karteVon(wieder.daten, '/board/data (zurückgesetzt)');
  pruefe(wiederKarte.darf && wiederKarte.darf.verschieben === true,
    'Nach dem Zurücksetzen erlaubt p1 „verschieben“ nicht wieder: '
      + JSON.stringify(wiederKarte.darf));
  console.log('ok Zurücksetzen: vorhaben.json ist ohne Commit wieder im alten Stand, '
    + 'darf.verschieben: true');

  // 4. Ordner ohne die Datei ihrer Fassung: beide Wege melden 409 und den Ort.
  for (const [id, ordner] of [
    ['ohne-boardjson', OHNE_BOARDJSON],
    ['ohne-format', OHNE_FORMAT],
  ]) {
    const fehlt = await ruf(gebaut, '/board/boards/wechsel', { id });
    pruefe(fehlt.status === 409,
      'Der Wechsel auf „' + id + '“ antwortet ' + fehlt.status + ' statt 409');
    const meldung = String((fehlt.daten && fehlt.daten.error) || '');
    pruefe(meldung === 'Der Ordner dieses Boards fehlt: ' + ordner,
      'Die Meldung für „' + id + '“ nennt nicht den Ordner: ' + JSON.stringify(meldung));
  }
  const bleibt = await ruf(gebaut, '/board/data');
  pruefe(bleibt.daten.aktiv === 'testboard',
    'Ein gescheiterter Wechsel hat das offene Board verändert: '
      + JSON.stringify(bleibt.daten.aktiv));
  console.log('ok Fehler: ohne board.json und ohne format antwortet der Wechsel 409, '
    + 'das offene Board bleibt testboard');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
