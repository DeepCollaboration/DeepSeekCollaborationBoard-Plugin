/**
 * Prüfung Schritt 27 — das Vertrauensbild einer Station.
 *
 * Die fünf Repositories des Testboards liegen in einer eigenen Prüffläche
 * unter `/tmp/board-scheibe1/schritt27`, daneben ein eigenes `DSH_HOME`.
 * In `station-idee` liegt zusätzlich `examples/beispiel.md`; eine eigene
 * Kopie der Station heißt `station-ohne-readme` und hat kein README.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/station?station=idee` antwortet 200 mit Name, Host,
 *      Fassung, Beschreibung, Reife, Lizenz, dem Beispiel `beispiel.md`, der
 *      Verwendung im Standard-Workflow, dem Repository und dem README.
 *   2. `GET /board/station?station=umsetzen` antwortet 200; `beispiele` ist
 *      leer, weil das Repository keine Beispiele hat.
 *   3. Eine unbekannte Station antwortet 404 mit ihrem Grund.
 *   4. Eine Station ohne README liefert `readme: null`.
 *   5. Die Lese-Route legt keinen Commit an.
 *   6. Server, Ablage und Home sind danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt27');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const WORKFLOW = join(ABLAGE, 'workflow');
const STATION_IDEE = join(ABLAGE, 'station-idee');
const STATION_UMSETZEN = join(ABLAGE, 'station-umsetzen');
const STATION_OHNE_README = join(ABLAGE, 'station-ohne-readme');
const VORHABEN = join(ABLAGE, 'vorhaben');

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

function festschreiben(ordner, nachricht) {
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', nachricht,
  ]);
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

function anfrage(pfad) {
  return {
    method: 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() { /* kein Körper */ },
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

async function ruf(gebaut, pfad) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

  // Ein Beispiel in der Station „Idee“ und ein Commit, damit sie einen
  // sauberen Stand hat.
  mkdirSync(join(STATION_IDEE, 'examples'), { recursive: true });
  writeFileSync(join(STATION_IDEE, 'examples', 'beispiel.md'),
    '# Beispiel\n\nEin Thema in einem Satz.\n', 'utf8');
  festschreiben(STATION_IDEE, 'Ein Beispiel für die Station Idee');

  // Eine eigene Kopie ohne README, mit eigener Kennung — so zeigt die Route
  // den Unterschied zwischen „kein README“ und einem erfundenen Text.
  cpSync(STATION_IDEE, STATION_OHNE_README, { recursive: true });
  const ohneReadme = JSON.parse(
    readFileSync(join(STATION_OHNE_README, 'station.json'), 'utf8'),
  );
  ohneReadme.id = 'ohne-readme';
  ohneReadme.name = 'Ohne README';
  writeFileSync(
    join(STATION_OHNE_README, 'station.json'),
    JSON.stringify(ohneReadme, null, 2) + '\n',
    'utf8',
  );
  rmSync(join(STATION_OHNE_README, 'README.md'), { force: true });
  festschreiben(STATION_OHNE_README, 'Station ohne README');

  // Das Board verweist auf die Kopie.
  const boardJson = JSON.parse(readFileSync(join(BOARD, 'board.json'), 'utf8'));
  boardJson.stationen.push({ repo: STATION_OHNE_README });
  schreibeJson(join(BOARD, 'board.json'), boardJson);
  festschreiben(BOARD, 'Station ohne README ins Board');

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

  gebaut = await starten();
  const boardVorher = git(BOARD, ['rev-parse', 'HEAD']);

  // 1. Die Station „Idee“ mit allem, was ihr Repository hergibt.
  const idee = await ruf(gebaut, '/board/station?station=idee');
  pruefe(idee.status === 200,
    'GET /board/station?station=idee antwortet ' + idee.status + ': '
      + JSON.stringify(idee.daten));
  const d = idee.daten || {};
  pruefe(d.name === 'Idee', 'Die Station trägt nicht ihren Namen: ' + JSON.stringify(d.name));
  pruefe(d.host === 'p1', 'Die Station trägt nicht ihren Host: ' + JSON.stringify(d.host));
  pruefe(d.fassung === 'v1',
    'Die Station trägt nicht die Fassung aus dem Workflow: ' + JSON.stringify(d.fassung));
  pruefe(d.beschreibung
    === 'Thema in einem Satz festhalten. Noch keine Struktur, keine Technik.',
  'Die Beschreibung fehlt oder ist eine andere: ' + JSON.stringify(d.beschreibung));
  pruefe(d.reife === 'erprobt', 'Die Reife fehlt: ' + JSON.stringify(d.reife));
  pruefe(d.lizenz === 'MIT', 'Die Lizenz fehlt: ' + JSON.stringify(d.lizenz));
  pruefe(Array.isArray(d.tags) && d.tags.includes('idee'),
    'Die Tags fehlen: ' + JSON.stringify(d.tags));
  pruefe(Array.isArray(d.beispiele) && d.beispiele.includes('beispiel.md'),
    'Das Beispiel fehlt: ' + JSON.stringify(d.beispiele));
  pruefe(resolve(d.repo) === resolve(STATION_IDEE),
    'Das Repository ist ein anderes: ' + JSON.stringify(d.repo));
  pruefe(typeof d.readme === 'string' && d.readme.includes('Idee'),
    'Das README fehlt: ' + JSON.stringify(d.readme));

  const verwendung = Array.isArray(d.verwendung) ? d.verwendung : [];
  const standard = verwendung.find((eintrag) => eintrag && eintrag.titel === 'Standard-Workflow');
  pruefe(standard, 'Die Verwendung im Standard-Workflow fehlt: ' + JSON.stringify(verwendung));
  pruefe(standard.fassung === 'v1',
    'Die Verwendung nennt nicht die Fassung v1: ' + JSON.stringify(standard.fassung));
  pruefe(resolve(standard.repo) === resolve(WORKFLOW),
    'Die Verwendung nennt nicht das Workflow-Repository: ' + JSON.stringify(standard.repo));

  // 2. Eine Station ohne Beispiele: die Liste bleibt leer.
  const umsetzen = await ruf(gebaut, '/board/station?station=umsetzen');
  pruefe(umsetzen.status === 200,
    'GET /board/station?station=umsetzen antwortet ' + umsetzen.status + ': '
      + JSON.stringify(umsetzen.daten));
  pruefe(Array.isArray(umsetzen.daten.beispiele) && umsetzen.daten.beispiele.length === 0,
    '„Umsetzen“ trägt Beispiele, obwohl keine da sind: '
      + JSON.stringify(umsetzen.daten.beispiele));

  // 3. Eine unbekannte Station antwortet 404 mit ihrem Grund.
  const unbekannt = await ruf(gebaut, '/board/station?station=gibt-es-nicht');
  pruefe(unbekannt.status === 404,
    'Eine unbekannte Station antwortet ' + unbekannt.status + ' statt 404');
  pruefe(String(unbekannt.daten && unbekannt.daten.error || '').includes('gibt-es-nicht'),
    'Der Grund der 404-Antwort nennt die Station nicht: '
      + JSON.stringify(unbekannt.daten));

  // 4. Eine Station ohne README: `readme` ist null, nichts wird erfunden.
  const ohne = await ruf(gebaut, '/board/station?station=ohne-readme');
  pruefe(ohne.status === 200,
    'GET /board/station?station=ohne-readme antwortet ' + ohne.status + ': '
      + JSON.stringify(ohne.daten));
  pruefe(ohne.daten && ohne.daten.readme === null,
    'Eine Station ohne README liefert kein null: '
      + JSON.stringify(ohne.daten && ohne.daten.readme));
  // Sie steht in keinem Workflow: die Verwendung bleibt leer, die Fassung
  // kommt aus dem Repository selbst (hier der Stand von HEAD, kein Tag).
  pruefe(Array.isArray(ohne.daten.verwendung) && ohne.daten.verwendung.length === 0,
    'Eine Station außerhalb der Workflows trägt eine Verwendung: '
      + JSON.stringify(ohne.daten.verwendung));
  pruefe(/^[0-9a-f]{40}$/.test(String(ohne.daten.fassung || '')),
    'Ohne Workflow-Verweis fehlt die Fassung aus dem Repository: '
      + JSON.stringify(ohne.daten.fassung));

  // 5. Die Route liest nur: kein Commit im Board.
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardVorher,
    'Die Lese-Route hat einen Commit im Board angelegt');

  console.log('ok Station „Idee“: Host ' + d.host + ', Fassung ' + d.fassung
    + ', Beispiel ' + d.beispiele.join(', ')
    + ', Verwendung ' + verwendung.map((eintrag) => eintrag.titel
      + ' (' + eintrag.fassung + ')').join(', ')
    + '; Station ohne README: readme null');
  console.log('ok Fehler: unbekannte Station 404; „Umsetzen“ ohne Beispiel');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
