/**
 * Prüfung Schritt 25 — der Eigentümer ist eine Einstellung.
 *
 * Die fünf Repositories der Prüffläche liegen in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt25`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process, ohne Netz: `DSH_GITHUB_API` zeigt auf einen geschlossenen
 * Port, damit ein versehentlicher Aufruf sofort scheitert.
 *
 * Geprüft wird:
 *
 *   1. Ohne Eintrag und ohne Token: `quelle: "leer"` samt deutschem Hinweis,
 *      der Anmeldung oder Token als Weg nennt.
 *   2. `POST /board/einstellung` mit dem Eigentümer schreibt `board.json`
 *      (getrimmt), legt eine Fassung nur über `board.json` an; `/board/data`
 *      nennt danach `DeepCollaboration` mit `quelle: "gesetzt"`.
 *   3. Ein ungültiger Name antwortet 400, ohne Datei und ohne Fassung.
 *   4. Ein leerer Wert löscht den Eintrag; ohne Eintrag gilt der gemerkte
 *      Login aus `github.json` (`quelle: "angemeldet"`).
 *   5. Das Hauptboard trägt in seiner Datei `DeepCollaboration` — nur lesend.
 */
import {
  existsSync, readFileSync, rmdirSync, rmSync, writeFileSync, mkdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt25');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const HAUPTBOARD = '/workspace/projekte/board-repos/board-hauptboard/board.json';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
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

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [{
      id: 'testboard',
      name: 'Testboard',
      format: 2,
      art: 'team',
      repo: BOARD,
      remote: null,
      person: 'p1',
    }],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  // Kein Netz: ein versehentlicher Aufruf scheitert sofort am geschlossenen Port.
  process.env.DSH_GITHUB_API = 'http://127.0.0.1:9';
  gebaut = await starten();

  // 1. Ohne Eintrag und ohne Token ist der Eigentümer leer — mit Hinweis.
  const leer = await ruf(gebaut, '/board/data');
  pruefe(leer.status === 200,
    'GET /board/data antwortet ' + leer.status + ': ' + JSON.stringify(leer.daten));
  pruefe(leer.daten.format === 2,
    'GET /board/data nennt nicht Fassung 2: ' + JSON.stringify(leer.daten.format));
  pruefe(leer.daten.eigentuemer === '',
    'Ohne Eintrag und Token steht ein Eigentümer da: '
      + JSON.stringify(leer.daten.eigentuemer));
  pruefe(leer.daten.eigentuemerQuelle === 'leer',
    'Die Quelle ist nicht leer: ' + JSON.stringify(leer.daten.eigentuemerQuelle));
  pruefe(typeof leer.daten.eigentuemerHinweis === 'string'
    && /token/i.test(leer.daten.eigentuemerHinweis)
    && /melde/i.test(leer.daten.eigentuemerHinweis),
  'Der Hinweis nennt Anmeldung oder Token nicht: '
    + JSON.stringify(leer.daten.eigentuemerHinweis));
  pruefe(leer.daten.einstellungen && typeof leer.daten.einstellungen === 'object',
    '`einstellungen` fehlt in der Antwort');
  const kopfAnfang = git(BOARD, ['rev-parse', 'HEAD']);

  // 2. Den Eigentümer schreiben — getrimmt, mit einer Fassung über board.json.
  const gesetzt = await ruf(gebaut, '/board/einstellung', {
    name: 'eigentuemer', wert: '  DeepCollaboration  ',
  });
  pruefe(gesetzt.status === 200,
    'POST /board/einstellung antwortet ' + gesetzt.status + ': '
      + JSON.stringify(gesetzt.daten));
  const boardNach = liesJson(BOARD_DATEI);
  pruefe(boardNach.einstellungen && boardNach.einstellungen.eigentuemer
    === 'DeepCollaboration',
  'board.json trägt den Eigentümer nicht getrimmt: '
    + JSON.stringify(boardNach.einstellungen));
  const kopfNach = git(BOARD, ['rev-parse', 'HEAD']);
  pruefe(kopfNach !== kopfAnfang,
    'Das Speichern hat keine Fassung angelegt');
  const geaendert = git(BOARD, ['log', '-1', '--format=', '--name-only'])
    .split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  pruefe(geaendert.length === 1 && geaendert[0] === 'board.json',
    'Die Fassung nennt nicht nur board.json: ' + JSON.stringify(geaendert));
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Nach dem Speichern bleibt etwas Uncommittetes liegen');

  const nach = await ruf(gebaut, '/board/data');
  pruefe(nach.status === 200, 'GET /board/data antwortet ' + nach.status);
  pruefe(nach.daten.eigentuemer === 'DeepCollaboration',
    'Die Antwort nennt nicht den gesetzten Eigentümer: '
      + JSON.stringify(nach.daten.eigentuemer));
  pruefe(nach.daten.eigentuemerQuelle === 'gesetzt',
    'Die Quelle ist nicht gesetzt: ' + JSON.stringify(nach.daten.eigentuemerQuelle));
  pruefe(!('eigentuemerHinweis' in nach.daten),
    'Bei einem gesetzten Eigentümer steht trotzdem ein Hinweis: '
      + JSON.stringify(nach.daten.eigentuemerHinweis));
  pruefe(nach.daten.einstellungen && nach.daten.einstellungen.eigentuemer
    === 'DeepCollaboration',
  'Die Einstellungen in der Antwort tragen den Eigentümer nicht: '
    + JSON.stringify(nach.daten.einstellungen));
  console.log('ok gesetzt: DeepCollaboration in board.json und /board/data');

  // 3. Ein ungültiger Name wird abgewiesen und schreibt nichts.
  const kopfVorFehler = git(BOARD, ['rev-parse', 'HEAD']);
  const falsch = await ruf(gebaut, '/board/einstellung', {
    name: 'eigentuemer', wert: 'kein name!',
  });
  pruefe(falsch.status === 400,
    'Ein ungültiger Name antwortet ' + falsch.status + ' statt 400: '
      + JSON.stringify(falsch.daten));
  pruefe(String((falsch.daten && falsch.daten.error) || '').includes('Eigentümer'),
    'Die 400-Antwort nennt den Eigentümer nicht: ' + JSON.stringify(falsch.daten));
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVorFehler,
    'Trotz ungültigem Namen entstand eine Fassung');
  pruefe(liesJson(BOARD_DATEI).einstellungen.eigentuemer === 'DeepCollaboration',
    'Trotz ungültigem Namen wurde board.json geändert');
  console.log('ok abgewiesen: ungültiger Name 400, kein Schreiben');

  // 4. Leerer Wert löscht den Eintrag; der gemerkte Login gilt als Rückfall.
  schreibeJson(GITHUB, { token: 'geheimer-token', login: 'octo' });
  const geloescht = await ruf(gebaut, '/board/einstellung', {
    name: 'eigentuemer', wert: '',
  });
  pruefe(geloescht.status === 200,
    'Das Löschen antwortet ' + geloescht.status + ': ' + JSON.stringify(geloescht.daten));
  const ohneEintrag = liesJson(BOARD_DATEI);
  pruefe(!ohneEintrag.einstellungen || ohneEintrag.einstellungen.eigentuemer
    === undefined,
  'Der Eintrag wurde nicht gelöscht: ' + JSON.stringify(ohneEintrag.einstellungen));
  const rueckfall = await ruf(gebaut, '/board/data');
  pruefe(rueckfall.status === 200, 'GET /board/data antwortet ' + rueckfall.status);
  pruefe(rueckfall.daten.eigentuemer === 'octo',
    'Der gemerkte Login gilt nicht als Rückfall: '
      + JSON.stringify(rueckfall.daten.eigentuemer));
  pruefe(rueckfall.daten.eigentuemerQuelle === 'angemeldet',
    'Die Quelle ist nicht angemeldet: '
      + JSON.stringify(rueckfall.daten.eigentuemerQuelle));
  pruefe(!('eigentuemerHinweis' in rueckfall.daten),
    'Mit gemeldetem Login steht trotzdem ein Hinweis da');
  console.log('ok angemeldet: leerer Eintrag fällt auf octo zurück');

  // 5. Ohne Token und ohne Eintrag wieder leer — samt Hinweis.
  rmSync(GITHUB, { force: true });
  const wiederLeer = await ruf(gebaut, '/board/data');
  pruefe(wiederLeer.status === 200, 'GET /board/data antwortet ' + wiederLeer.status);
  pruefe(wiederLeer.daten.eigentuemer === ''
    && wiederLeer.daten.eigentuemerQuelle === 'leer',
  'Ohne Token und Eintrag ist der Eigentümer nicht leer: '
    + JSON.stringify({ eigentuemer: wiederLeer.daten.eigentuemer,
      quelle: wiederLeer.daten.eigentuemerQuelle }));
  pruefe(typeof wiederLeer.daten.eigentuemerHinweis === 'string'
    && wiederLeer.daten.eigentuemerHinweis.length > 0,
  'Der Hinweis bei leerer Quelle fehlt');
  console.log('ok leer: ohne Token und Eintrag mit Hinweis');

  // 5b. Mit Remote und ohne Token bleibt Schreiben gesperrt — 403, kein Stand.
  git(BOARD, ['remote', 'add', 'origin', 'file://' + join(ABLAGE, 'nicht-da.git')]);
  const kopfVor403 = git(BOARD, ['rev-parse', 'HEAD']);
  const verboten = await ruf(gebaut, '/board/einstellung', {
    name: 'eigentuemer', wert: 'DeepCollaboration',
  });
  pruefe(verboten.status === 403,
    'Ohne Token und mit Remote antwortet die Route ' + verboten.status
      + ' statt 403: ' + JSON.stringify(verboten.daten));
  pruefe(String((verboten.daten && verboten.daten.error) || '').includes('Nur lesen'),
    'Die 403-Antwort nennt den Lesemodus nicht: ' + JSON.stringify(verboten.daten));
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVor403,
    'Trotz fehlendem Schreibrecht entstand eine Fassung');
  pruefe(liesJson(BOARD_DATEI).einstellungen.eigentuemer === undefined,
    'Trotz fehlendem Schreibrecht wurde der Eigentümer gesetzt');
  git(BOARD, ['remote', 'remove', 'origin']);
  console.log('ok ohne Schreibrecht: 403, kein Schreiben');

  // 6. Das Hauptboard trägt den Eigentümer in seiner Datei — nur gelesen.
  // Das Hauptboard der Werkstatt liegt nicht in jedem Klon: ohne die Datei
  // entfällt nur dieser eine Punkt, die übrigen laufen weiter.
  if (existsSync(HAUPTBOARD)) {
    const haupt = liesJson(HAUPTBOARD);
    pruefe(haupt && haupt.einstellungen
      && haupt.einstellungen.eigentuemer === 'DeepCollaboration',
    'Das Hauptboard trägt nicht DeepCollaboration als Eigentümer: '
      + JSON.stringify(haupt && haupt.einstellungen));
    console.log('ok Hauptboard: DeepCollaboration in board.json');
  } else {
    console.log('Hinweis: kein Hauptboard unter ' + HAUPTBOARD
      + ' — der eine Punkt wird übersprungen.');
  }

  console.log('ok Eigentümer: gesetzt, angemeldet, leer, abgewiesen');
  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
