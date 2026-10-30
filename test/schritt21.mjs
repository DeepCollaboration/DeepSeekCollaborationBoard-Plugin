/**
 * Prüfung Schritt 21 — Weitergeben schreibt ins Vorhaben-Repository.
 *
 * Die fünf Repositories liegen in einer eigenen Prüffläche unter
 * `/tmp/board-scheibe1/schritt21`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process, ohne Netz; das Testboard wird über `POST /board/boards`
 * mit seinem lokalen Ordner verbunden.
 *
 * Geprüft wird:
 *
 *   1. Das Testboard ist verbunden, „Board Gesamtkonzept“ steht an „idee“.
 *   2. `POST /board/vorhaben/verschieben` mit `{ id, position: 'umsetzen' }`
 *      antwortet 200 und das neu zusammengesetzte Board zeigt die Karte an
 *      „umsetzen“ — auch über `/board/data`.
 *   3. `vorhaben.json` trägt `position: umsetzen` und an der Zielstation die
 *      bisherige Person; alle übrigen Angaben stehen unverändert und in
 *      derselben Reihenfolge.
 *   4. Der letzte Commit im Vorhaben-Repository nennt nur `vorhaben.json`;
 *      die Fassungen von Stationen, Workflow und Board sind unverändert.
 *   5. Eine unbekannte Position antwortet 400, ein unbekanntes Vorhaben 404;
 *      keiner der beiden Versuche legt einen Commit an.
 *   6. Server, Ablage und Home sind danach entfernt.
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
const ABLAGE = join(WURZEL, 'schritt21');
const HOME = join(ABLAGE, 'home');
const BOARD = join(ABLAGE, 'board');
const VORHABEN = join(ABLAGE, 'vorhaben');
const VORHABEN_ID = 'board-gesamtkonzept';
const REPOS = ['vorhaben', 'station-idee', 'station-umsetzen', 'workflow', 'board'];

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

/** Die Fassung (HEAD) aller fünf Repositories. */
function fassungen() {
  return new Map(REPOS.map((name) => [name, git(join(ABLAGE, name), ['rev-parse', 'HEAD'])]));
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
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);
  pruefe(flaeche.vorhaben === VORHABEN_ID,
    'Die Prüffläche meldet nicht die Kennung des Vorhabens: ' + flaeche.vorhaben);

  // Ein leeres Register und eine Identität: der Server liest nichts von der
  // echten Ablage. Das Testboard kommt allein über die Route dazu.
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1, aktiv: null, boards: [],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  // 1. Das Testboard über seinen lokalen Ordner verbinden.
  const verbunden = await ruf(gebaut, '/board/boards', { adresse: BOARD });
  pruefe(verbunden.status === 200,
    'POST /board/boards antwortet ' + verbunden.status + ': ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.board === 'testboard',
    'Verbunden wurde nicht das Testboard: ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.aktiv === 'testboard', 'Das Testboard ist nicht aktiv');

  const vorher = await ruf(gebaut, '/board/data');
  pruefe(vorher.status === 200, 'GET /board/data antwortet ' + vorher.status);
  pruefe(vorher.daten.vorgaenge.length === 1, 'Das Board zeigt nicht genau ein Vorhaben');
  pruefe(vorher.daten.vorgaenge[0].position === 'idee',
    'Das Vorhaben steht vor dem Weitergeben nicht an idee: '
      + vorher.daten.vorgaenge[0].position);

  const standVorher = fassungen();
  const jsonVorher = JSON.parse(readFileSync(join(VORHABEN, 'vorhaben.json'), 'utf8'));

  // 2. Weitergeben: die Antwort selbst zeigt die Karte an „umsetzen“.
  const verschoben = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'umsetzen',
  });
  pruefe(verschoben.status === 200,
    'POST /board/vorhaben/verschieben antwortet ' + verschoben.status + ': '
      + JSON.stringify(verschoben.daten));
  const karte = (verschoben.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(karte && karte.position === 'umsetzen',
    'Die Antwort setzt die Karte nicht an umsetzen: '
      + JSON.stringify(karte && karte.position));

  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status);
  const nachherKarte = (daten.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(nachherKarte && nachherKarte.position === 'umsetzen',
    '/board/data zeigt die Karte nicht an umsetzen: '
      + JSON.stringify(nachherKarte && nachherKarte.position));

  // 3. Die Datei: nur position und verantwortliche haben sich geändert.
  const jsonNachher = JSON.parse(readFileSync(join(VORHABEN, 'vorhaben.json'), 'utf8'));
  pruefe(jsonNachher.position === 'umsetzen',
    'vorhaben.json trägt nicht position umsetzen: ' + jsonNachher.position);
  pruefe(Array.isArray(jsonNachher.verantwortliche.umsetzen)
    && jsonNachher.verantwortliche.umsetzen.includes('p1'),
  'vorhaben.json trägt an umsetzen nicht die bisherige Person p1');
  pruefe(JSON.stringify(jsonNachher.verantwortliche.idee)
    === JSON.stringify(jsonVorher.verantwortliche.idee),
  'Der Eintrag an idee wurde beim Weitergeben verändert');
  pruefe(JSON.stringify(Object.keys(jsonNachher)) === JSON.stringify(Object.keys(jsonVorher)),
    'Die Reihenfolge der Angaben in vorhaben.json wurde verändert');
  for (const schluessel of Object.keys(jsonVorher)) {
    if (schluessel === 'position' || schluessel === 'verantwortliche') continue;
    pruefe(JSON.stringify(jsonNachher[schluessel]) === JSON.stringify(jsonVorher[schluessel]),
      'Die Angabe „' + schluessel + '“ wurde beim Weitergeben verändert');
  }

  // 4. Der Commit nennt nur vorhaben.json; die anderen Repositories stehen.
  const geaendert = git(VORHABEN, ['log', '-1', '--format=', '--name-only'])
    .split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  pruefe(geaendert.length === 1 && geaendert[0] === 'vorhaben.json',
    'Der letzte Commit nennt nicht nur vorhaben.json: ' + JSON.stringify(geaendert));
  const nachricht = git(VORHABEN, ['log', '-1', '--format=%s']);
  pruefe(nachricht.includes('verschoben'),
    'Die Commit-Nachricht nennt das Verschieben nicht: ' + JSON.stringify(nachricht));

  const standNachher = fassungen();
  pruefe(standNachher.get('vorhaben') !== standVorher.get('vorhaben'),
    'Im Vorhaben-Repository entstand keine neue Fassung');
  for (const name of REPOS) {
    if (name === 'vorhaben') continue;
    pruefe(standNachher.get(name) === standVorher.get(name),
      'Das Repository ' + name + ' hat eine neue Fassung bekommen');
  }
  console.log('ok Weitergeben: Commit ' + standNachher.get('vorhaben').slice(0, 7)
    + ' nennt nur vorhaben.json; station-idee, station-umsetzen, workflow und board '
    + 'sind unverändert');

  // 5. Unbekannte Position und unbekanntes Vorhaben: kein Commit.
  const fassungVorFehler = git(VORHABEN, ['rev-parse', 'HEAD']);
  const unbekannt = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'gibt-es-nicht',
  });
  pruefe(unbekannt.status === 400,
    'Eine unbekannte Position antwortet ' + unbekannt.status + ' statt 400');
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === fassungVorFehler,
    'Trotz unbekannter Position entstand ein Commit');

  const fremd = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: 'fremd', position: 'umsetzen',
  });
  pruefe(fremd.status === 404,
    'Ein unbekanntes Vorhaben antwortet ' + fremd.status + ' statt 404');
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === fassungVorFehler,
    'Trotz unbekanntem Vorhaben entstand ein Commit');
  console.log('ok Fehler: unbekannte Position 400, unbekanntes Vorhaben 404, kein Commit');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
