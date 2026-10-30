/**
 * Prüfung Schritt 26 — eine Station in einen Workflow stellen.
 *
 * Die fünf Repositories des Testboards liegen in einer eigenen Prüffläche
 * unter `/tmp/board-scheibe1/schritt26`, daneben ein eigenes `DSH_HOME` und
 * eine dritte Station `station-pruefen`. Der Server läuft in-process, ohne
 * Netz.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/data` nennt unter `stationen` alle drei Stationen des
 *      Boards; „Prüfen“ steht noch nicht im Workflow (`imWorkflow: false`).
 *   2. `POST /board/workflow/station` mit `{ station: 'pruefen' }` antwortet
 *      200 und das neue Board zeigt „Prüfen“ im Workflow.
 *   3. Der letzte Commit im Workflow-Repository nennt nur `workflow.json`;
 *      `workflow.json` trägt den Stationsverweis, eine neue Position und eine
 *      Kante von der letzten Position.
 *   4. Die Fassungen von `station-pruefen`, `station-idee`,
 *      `station-umsetzen`, `vorhaben` und `board` sind unverändert.
 *   5. Eine unbekannte Station antwortet 404 und legt keinen Commit an.
 *   6. Server, Ablage und Home sind danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt26');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const WORKFLOW = join(ABLAGE, 'workflow');
const STATION_IDEE = join(ABLAGE, 'station-idee');
const STATION_UMSETZEN = join(ABLAGE, 'station-umsetzen');
const STATION_PRUEFEN = join(ABLAGE, 'station-pruefen');
const VORHABEN = join(ABLAGE, 'vorhaben');
// Die Repositories, die unberührt bleiben müssen — das Workflow-Repository
// bekommt als einziges eine neue Fassung.
const UNBERUEHRT = [
  'station-pruefen', 'station-idee', 'station-umsetzen', 'vorhaben', 'board',
];

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

/** Die Fassung (HEAD) der genannten Repositories. */
function fassungen() {
  return new Map((UNBERUEHRT.concat('workflow')).map(
    (name) => [name, git(join(ABLAGE, name), ['rev-parse', 'HEAD'])],
  ));
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

  // Eine dritte Station als Kopie von `station-idee`, mit eigener Kennung und
  // eigenem Namen, und ein Commit, damit sie eine Fassung hat.
  cpSync(STATION_IDEE, STATION_PRUEFEN, { recursive: true });
  const stationPruefen = JSON.parse(
    readFileSync(join(STATION_PRUEFEN, 'station.json'), 'utf8'),
  );
  stationPruefen.id = 'pruefen';
  stationPruefen.name = 'Prüfen';
  writeFileSync(
    join(STATION_PRUEFEN, 'station.json'),
    JSON.stringify(stationPruefen, null, 2) + '\n',
    'utf8',
  );
  festschreiben(STATION_PRUEFEN, 'Station Prüfen');

  // Das Board verweist auf sie — noch steht sie in keinem Workflow.
  const boardJson = JSON.parse(readFileSync(join(BOARD, 'board.json'), 'utf8'));
  boardJson.stationen = Array.isArray(boardJson.stationen) ? boardJson.stationen : [];
  boardJson.stationen.push({ repo: STATION_PRUEFEN });
  schreibeJson(join(BOARD, 'board.json'), boardJson);
  festschreiben(BOARD, 'Station Prüfen ins Board');

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

  // 1. Alle drei Stationen stehen im Bild; „Prüfen“ noch ohne Workflow.
  const vorher = await ruf(gebaut, '/board/data');
  pruefe(vorher.status === 200,
    'GET /board/data antwortet ' + vorher.status + ': ' + JSON.stringify(vorher.daten));
  pruefe(vorher.daten.format === 2,
    'GET /board/data nennt nicht Fassung 2: ' + JSON.stringify(vorher.daten.format));
  const stationen = Array.isArray(vorher.daten.stationen) ? vorher.daten.stationen : [];
  pruefe(stationen.length === 3,
    'Das Board zeigt nicht drei Stationen: '
      + JSON.stringify(stationen.map((eintrag) => eintrag.name)));
  const pruefen = stationen.find((eintrag) => eintrag && eintrag.name === 'Prüfen');
  pruefe(pruefen, 'Die Station „Prüfen“ fehlt in `stationen`: ' + JSON.stringify(stationen));
  pruefe(pruefen.id === 'pruefen',
    'Die Station „Prüfen“ trägt nicht die Kennung pruefen: ' + JSON.stringify(pruefen.id));
  pruefe(pruefen.imWorkflow === false,
    '„Prüfen“ gilt schon als im Workflow: ' + JSON.stringify(pruefen.imWorkflow));
  pruefe(pruefen.host === 'p1',
    '„Prüfen“ trägt nicht ihren Host: ' + JSON.stringify(pruefen.host));
  pruefe(resolve(pruefen.repo) === resolve(STATION_PRUEFEN),
    '„Prüfen“ trägt nicht ihren Repository-Pfad: ' + JSON.stringify(pruefen.repo));
  const idee = stationen.find((eintrag) => eintrag && eintrag.name === 'Idee');
  pruefe(idee && idee.imWorkflow === true,
    '„Idee“ gilt nicht als im Workflow: ' + JSON.stringify(idee));

  const workflowVorher = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
  const letzteVorher = workflowVorher.positionen[workflowVorher.positionen.length - 1].id;
  const kantenVorher = workflowVorher.kanten.length;
  const standVorher = fassungen();

  // 2. Die Station in den Workflow stellen.
  const gestellt = await ruf(gebaut, '/board/workflow/station', { station: 'pruefen' });
  pruefe(gestellt.status === 200,
    'POST /board/workflow/station antwortet ' + gestellt.status + ': '
      + JSON.stringify(gestellt.daten));
  const inAntwort = (gestellt.daten.stationen || [])
    .find((eintrag) => eintrag && eintrag.name === 'Prüfen');
  pruefe(inAntwort && inAntwort.imWorkflow === true,
    'Die Antwort zeigt „Prüfen“ nicht im Workflow: ' + JSON.stringify(inAntwort));

  // 3. Der Commit nennt nur `workflow.json`, die Datei trägt alles Neue.
  const geaendert = git(WORKFLOW, ['log', '-1', '--format=', '--name-only'])
    .split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  pruefe(geaendert.length === 1 && geaendert[0] === 'workflow.json',
    'Der letzte Commit nennt nicht nur workflow.json: ' + JSON.stringify(geaendert));
  const nachricht = git(WORKFLOW, ['log', '-1', '--format=%s']);
  pruefe(nachricht.includes('Workflow'),
    'Die Commit-Nachricht nennt den Workflow nicht: ' + JSON.stringify(nachricht));
  pruefe(git(WORKFLOW, ['status', '--porcelain']) === '',
    'Im Workflow-Repository bleibt etwas Uncommittetes liegen');

  const workflowNachher = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
  const verweis = workflowNachher.stationen
    .find((eintrag) => eintrag && eintrag.id === 'pruefen');
  pruefe(verweis, 'workflow.json trägt keinen Verweis auf die Station pruefen');
  // Seit Schritt 32 steht der Ordnername im Verweis; er löst als
  // Geschwisterordner des Workflows auf.
  pruefe(verweis.repo === basename(STATION_PRUEFEN)
    && resolve(dirname(WORKFLOW), verweis.repo) === resolve(STATION_PRUEFEN),
  'Der Verweis nennt nicht station-pruefen als Ordnernamen: '
    + JSON.stringify(verweis.repo));
  const kopfPruefen = git(STATION_PRUEFEN, ['rev-parse', '--short', 'HEAD']);
  pruefe(verweis.fassung === kopfPruefen,
    'Der Verweis trägt nicht den kurzen Stand von station-pruefen: '
      + JSON.stringify(verweis.fassung));
  pruefe(workflowNachher.positionen.length === workflowVorher.positionen.length + 1,
    'workflow.json hat keine neue Position: '
      + JSON.stringify(workflowNachher.positionen.map((eintrag) => eintrag.id)));
  const neuePosition = workflowNachher.positionen[workflowNachher.positionen.length - 1];
  pruefe(neuePosition.station === 'pruefen',
    'Die neue Position verweist nicht auf die Station pruefen: '
      + JSON.stringify(neuePosition.station));
  pruefe(workflowNachher.kanten.length === kantenVorher + 1,
    'workflow.json hat keine neue Kante: ' + JSON.stringify(workflowNachher.kanten));
  pruefe(workflowNachher.kanten.some(
    (kante) => kante.von === letzteVorher && kante.nach === neuePosition.id,
  ), 'Die neue Position hängt nicht an der letzten Position: '
    + JSON.stringify(workflowNachher.kanten));

  // 4. Nur das Workflow-Repository hat eine neue Fassung.
  const standNachher = fassungen();
  pruefe(standNachher.get('workflow') !== standVorher.get('workflow'),
    'Im Workflow-Repository entstand keine neue Fassung');
  for (const name of UNBERUEHRT) {
    pruefe(standNachher.get(name) === standVorher.get(name),
      'Das Repository ' + name + ' hat eine neue Fassung bekommen');
  }

  // 5. `/board/data` zeigt die neue Position und „Prüfen“ im Workflow.
  const nachher = await ruf(gebaut, '/board/data');
  pruefe(nachher.status === 200, 'GET /board/data antwortet ' + nachher.status);
  const pruefenNachher = (nachher.daten.stationen || [])
    .find((eintrag) => eintrag && eintrag.name === 'Prüfen');
  pruefe(pruefenNachher && pruefenNachher.imWorkflow === true,
    '/board/data zeigt „Prüfen“ nicht im Workflow: ' + JSON.stringify(pruefenNachher));
  const positionenNachher = (nachher.daten.workflow && nachher.daten.workflow.positionen) || [];
  pruefe(positionenNachher.some((eintrag) => eintrag.id === neuePosition.id),
    '/board/data zeigt die neue Position nicht: '
      + JSON.stringify(positionenNachher.map((eintrag) => eintrag.id)));

  console.log('ok Workflow gestellt: Commit ' + standNachher.get('workflow').slice(0, 7)
    + ' nennt nur workflow.json; Station „Prüfen“ als Verweis und Position „'
    + neuePosition.id + '“; station-pruefen, station-idee, station-umsetzen, '
    + 'vorhaben und board unverändert');

  // 6. Eine unbekannte Station antwortet 404 und schreibt nichts.
  const fassungVorFehler = git(WORKFLOW, ['rev-parse', 'HEAD']);
  const unbekannt = await ruf(gebaut, '/board/workflow/station', {
    station: 'gibt-es-nicht',
  });
  pruefe(unbekannt.status === 404,
    'Eine unbekannte Station antwortet ' + unbekannt.status + ' statt 404');
  pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) === fassungVorFehler,
    'Trotz unbekannter Station entstand ein Commit');
  console.log('ok Fehler: unbekannte Station 404, kein Commit');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
