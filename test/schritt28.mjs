/**
 * Prüfung Schritt 28 — einen Workflow in ein Board übernehmen.
 *
 * Die fünf Repositories des Testboards liegen in einer eigenen Prüffläche
 * unter `/tmp/board-scheibe1/schritt28`, daneben ein eigenes `DSH_HOME`. Der
 * Server läuft in-process, ohne Netz.
 *
 * Eine Kopie des Workflows heißt `workflow-zwei`, trägt die Kennung `zwei`,
 * den Titel „Zweiter Workflow“, einen eigenen Commit und den Tag `v1`.
 *
 * Geprüft wird:
 *
 *   1. `POST /board/workflow/verbinden` mit `{ repo: <workflow-zwei> }`
 *      antwortet 200; die Antwort zeigt zwei Workflows, den neuen mit Titel,
 *      Autor, Fassung und seinen Stationen.
 *   2. Der letzte Commit im Board-Repository nennt nur `board.json`; die
 *      Nachricht nennt den Workflow, der Autor ist die Identität.
 *   3. `board.json` trägt zwei Workflow-Verweise, jeden mit fester Fassung;
 *      alle anderen Angaben der Datei sind unverändert.
 *   4. `/board/data` zeigt zwei Workflows; der neue steht mit Titel und
 *      Stationen darin.
 *   5. Die HEADs von `workflow`, `workflow-zwei`, `station-idee`,
 *      `station-umsetzen` und `vorhaben` sind unverändert; in `workflow-zwei`
 *      liegt nichts Uncommittetes.
 *   6. Ein zweiter Aufruf mit demselben Ordner antwortet 409 ohne neuen Commit;
 *      ein Ordner ohne `workflow.json` antwortet 404 ohne neuen Commit.
 *   7. Server, Ablage und Home sind danach entfernt.
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
const ABLAGE = join(WURZEL, 'schritt28');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const WORKFLOW = join(ABLAGE, 'workflow');
const WORKFLOW_ZWEI = join(ABLAGE, 'workflow-zwei');
const STATION_IDEE = join(ABLAGE, 'station-idee');
const STATION_UMSETZEN = join(ABLAGE, 'station-umsetzen');
const VORHABEN = join(ABLAGE, 'vorhaben');
const OHNE_WORKFLOW = join(ABLAGE, 'ohne-workflow');
// Die Repositories, die unberührt bleiben müssen — das Board-Repository
// bekommt als einziges eine neue Fassung.
const UNBERUEHRT = ['workflow', 'workflow-zwei', 'station-idee', 'station-umsetzen', 'vorhaben'];

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
  return new Map(UNBERUEHRT.map(
    (name) => [name, git(join(ABLAGE, name), ['rev-parse', 'HEAD'])],
  ));
}

/** Alle Workflows aus einer `/board/data`-Antwort, flach. */
function workflowsVon(daten) {
  const flaechen = Array.isArray(daten && daten.workflows) ? daten.workflows : [];
  const liste = [];
  for (const person of flaechen) {
    for (const workflow of ((person && person.workflows) || [])) {
      liste.push(workflow || {});
    }
  }
  return liste;
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

  // Eine Kopie des Workflows mit eigener Kennung, eigenem Titel, eigenem
  // Commit und dem Tag v1. Die Stationsverweise bleiben dieselben.
  cpSync(WORKFLOW, WORKFLOW_ZWEI, { recursive: true });
  const zwei = JSON.parse(readFileSync(join(WORKFLOW_ZWEI, 'workflow.json'), 'utf8'));
  zwei.id = 'zwei';
  zwei.titel = 'Zweiter Workflow';
  schreibeJson(join(WORKFLOW_ZWEI, 'workflow.json'), zwei);
  festschreiben(WORKFLOW_ZWEI, 'Zweiter Workflow');
  git(WORKFLOW_ZWEI, ['tag', 'v1']);

  // Ein Ordner, der kein Workflow ist: keine Ankerdatei, kein Repository.
  mkdirSync(OHNE_WORKFLOW, { recursive: true });
  writeFileSync(join(OHNE_WORKFLOW, 'README.md'), '# Kein Workflow\n', 'utf8');

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

  const boardVorher = JSON.parse(readFileSync(join(BOARD, 'board.json'), 'utf8'));
  const boardFassungVorher = git(BOARD, ['rev-parse', 'HEAD']);
  const standVorher = fassungen();

  // 1. Den Workflow ins Board übernehmen.
  const verbunden = await ruf(gebaut, '/board/workflow/verbinden', { repo: WORKFLOW_ZWEI });
  pruefe(verbunden.status === 200,
    'POST /board/workflow/verbinden antwortet ' + verbunden.status + ': '
      + JSON.stringify(verbunden.daten));
  const antwortFlows = workflowsVon(verbunden.daten);
  pruefe(antwortFlows.length === 2,
    'Die Antwort zeigt nicht zwei Workflows: '
      + JSON.stringify(antwortFlows.map((eintrag) => eintrag.titel)));
  const neuerFlow = antwortFlows.find((eintrag) => eintrag.id === 'zwei');
  pruefe(neuerFlow, 'Die Antwort zeigt den Workflow „zwei“ nicht: '
    + JSON.stringify(antwortFlows.map((eintrag) => eintrag.id)));
  pruefe(neuerFlow.titel === 'Zweiter Workflow',
    'Der neue Workflow trägt nicht seinen Titel: ' + JSON.stringify(neuerFlow.titel));
  pruefe(neuerFlow.autor === 'p1',
    'Der neue Workflow trägt nicht seinen Autor: ' + JSON.stringify(neuerFlow.autor));
  pruefe(neuerFlow.fassung === 'v1',
    'Der neue Workflow trägt nicht die Fassung v1: ' + JSON.stringify(neuerFlow.fassung));
  pruefe(resolve(neuerFlow.repo) === resolve(WORKFLOW_ZWEI),
    'Der neue Workflow nennt nicht sein Repository: ' + JSON.stringify(neuerFlow.repo));
  const neueSchritte = Array.isArray(neuerFlow.schritte) ? neuerFlow.schritte : [];
  pruefe(neueSchritte.length === 2,
    'Der neue Workflow zeigt nicht zwei Stationen: '
      + JSON.stringify(neueSchritte.map((eintrag) => eintrag.name)));
  pruefe(neueSchritte.some((eintrag) => eintrag.name === 'Idee')
    && neueSchritte.some((eintrag) => eintrag.name === 'Umsetzen'),
  'Dem neuen Workflow fehlen die Stationen Idee und Umsetzen: '
    + JSON.stringify(neueSchritte.map((eintrag) => eintrag.name)));

  // 2. Der Commit nennt nur `board.json`, mit deutscher Nachricht und dem
  // Autor aus der Identität.
  const geaendert = git(BOARD, ['log', '-1', '--format=', '--name-only'])
    .split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  pruefe(geaendert.length === 1 && geaendert[0] === 'board.json',
    'Der letzte Commit nennt nicht nur board.json: ' + JSON.stringify(geaendert));
  const nachricht = git(BOARD, ['log', '-1', '--format=%s']);
  pruefe(nachricht.includes('Zweiter Workflow'),
    'Die Commit-Nachricht nennt den Workflow nicht: ' + JSON.stringify(nachricht));
  const autor = git(BOARD, ['log', '-1', '--format=%an']);
  pruefe(autor === 'Thomas Heinrich',
    'Der Commit trägt nicht den Autor aus der Identität: ' + JSON.stringify(autor));
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Im Board-Repository bleibt etwas Uncommittetes liegen');

  // 3. `board.json` trägt zwei Verweise mit fester Fassung; alles andere in
  // der Datei ist unverändert.
  const boardNachher = JSON.parse(readFileSync(join(BOARD, 'board.json'), 'utf8'));
  const verweise = Array.isArray(boardNachher.workflows) ? boardNachher.workflows : [];
  pruefe(verweise.length === 2,
    'board.json trägt nicht zwei Workflow-Verweise: ' + JSON.stringify(verweise));
  for (const eintrag of verweise) {
    pruefe(typeof eintrag.fassung === 'string' && eintrag.fassung.trim(),
      'Ein Workflow-Verweis trägt keine Fassung: ' + JSON.stringify(eintrag));
  }
  // Seit Schritt 32 steht der Ordnername im Verweis; er löst als
  // Geschwisterordner des Boards auf.
  const neuerVerweis = verweise.find(
    (eintrag) => eintrag.repo === basename(WORKFLOW_ZWEI)
      && resolve(dirname(BOARD), eintrag.repo) === resolve(WORKFLOW_ZWEI),
  );
  pruefe(neuerVerweis, 'board.json trägt keinen Verweis auf workflow-zwei als '
    + 'Ordnernamen: ' + JSON.stringify(verweise));
  pruefe(neuerVerweis.fassung === 'v1',
    'Der Verweis auf workflow-zwei trägt nicht den Tag v1: '
      + JSON.stringify(neuerVerweis.fassung));
  const alterVerweis = verweise.find(
    (eintrag) => resolve(BOARD, eintrag.repo) === resolve(WORKFLOW),
  );
  pruefe(alterVerweis && alterVerweis.fassung === 'v1',
    'Der bestehende Workflow-Verweis ist nicht unverändert: ' + JSON.stringify(alterVerweis));
  pruefe(JSON.stringify({ ...boardNachher, workflows: null })
    === JSON.stringify({ ...boardVorher, workflows: null }),
  'board.json hat sich außerhalb von workflows verändert');

  // 4. Die anderen Repositories bleiben, wo sie waren.
  const standNachher = fassungen();
  for (const name of UNBERUEHRT) {
    pruefe(standNachher.get(name) === standVorher.get(name),
      'Das Repository ' + name + ' hat eine neue Fassung bekommen');
  }
  pruefe(git(WORKFLOW_ZWEI, ['status', '--porcelain']) === '',
    'Im Workflow-Repository bleibt etwas Uncommittetes liegen');

  // 5. `/board/data` zeigt beide Workflows; der neue mit Titel und Stationen.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status);
  const datenFlows = workflowsVon(daten.daten);
  pruefe(datenFlows.length === 2,
    '/board/data zeigt nicht zwei Workflows: '
      + JSON.stringify(datenFlows.map((eintrag) => eintrag.titel)));
  const neuerDatenFlow = datenFlows.find((eintrag) => eintrag.id === 'zwei');
  pruefe(neuerDatenFlow && neuerDatenFlow.titel === 'Zweiter Workflow',
    '/board/data zeigt den neuen Workflow nicht mit seinem Titel: '
      + JSON.stringify(neuerDatenFlow));
  pruefe((neuerDatenFlow.schritte || []).length === 2,
    '/board/data zeigt die Stationen des neuen Workflows nicht: '
      + JSON.stringify((neuerDatenFlow.schritte || []).map((eintrag) => eintrag.name)));

  const boardFassungNachher = git(BOARD, ['rev-parse', 'HEAD']);
  pruefe(boardFassungNachher !== boardFassungVorher,
    'Im Board-Repository entstand keine neue Fassung');

  console.log('ok Workflow übernommen: Commit ' + boardFassungNachher.slice(0, 7)
    + ' nennt nur board.json; board.json trägt zwei Workflows (Standard-Workflow v1, '
    + 'Zweiter Workflow v1 mit den Stationen Idee und Umsetzen); workflow, workflow-zwei, '
    + 'station-idee, station-umsetzen und vorhaben unverändert');

  // 6. Derselbe Ordner noch einmal: 409, kein neuer Commit.
  const fassungVorDoppelt = git(BOARD, ['rev-parse', 'HEAD']);
  const doppelt = await ruf(gebaut, '/board/workflow/verbinden', { repo: WORKFLOW_ZWEI });
  pruefe(doppelt.status === 409,
    'Ein zweiter Aufruf antwortet ' + doppelt.status + ' statt 409: '
      + JSON.stringify(doppelt.daten));
  pruefe(String((doppelt.daten && doppelt.daten.error) || '').includes('schon im Board'),
    'Der Grund der 409-Antwort nennt das Board nicht: ' + JSON.stringify(doppelt.daten));
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === fassungVorDoppelt,
    'Trotz des zweiten Aufrufs entstand ein Commit');

  // 7. Ein Ordner ohne `workflow.json`: 404, kein neuer Commit.
  const ohne = await ruf(gebaut, '/board/workflow/verbinden', { repo: OHNE_WORKFLOW });
  pruefe(ohne.status === 404,
    'Ein Ordner ohne workflow.json antwortet ' + ohne.status + ' statt 404: '
      + JSON.stringify(ohne.daten));
  pruefe(String((ohne.daten && ohne.daten.error) || '').trim().length > 0,
    'Die 404-Antwort nennt keinen Grund: ' + JSON.stringify(ohne.daten));
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === fassungVorDoppelt,
    'Trotz des Ordners ohne Workflow entstand ein Commit');
  console.log('ok Fehler: derselbe Workflow 409, Ordner ohne workflow.json 404, kein Commit');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
