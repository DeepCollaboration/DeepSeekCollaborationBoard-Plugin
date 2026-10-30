/**
 * Prüfung Schritt 41 — die fehlenden Routen.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt41`. Zwei Boards der
 * Fassung 2 liegen als Ordner in `flaeche/`, ihre Workflows und Stationen als
 * Geschwister daneben (so liegt die Fassung 2). Das dritte Board hat keinen
 * Workflow. Der Server läuft in-process, ohne Netz; das Register ist vor dem
 * Start gesetzt.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/board` antwortet mit dem offenen Board: Registereintrag,
 *      Format, Art, Sichtbarkeit, `darf` und `darfGrund` — ohne die Fläche.
 *   2. `GET /board/workflow` antwortet mit Verweis, Fassung, Stationen und
 *      Positionen; die Station wird in ihrer genannten Fassung gelesen.
 *   3. `POST /board/board/verbinden` verbindet ein Board über `{ repo }`,
 *      öffnet es und antwortet mit dem Bild; eine fehlende Angabe → 400, ein
 *      unbekanntes Board → 404.
 *   4. Ein Board ohne Workflow → 409 mit Grund.
 *   5. Danach bleibt `/board/data` bedienbar, ein Wechsel funktioniert, und
 *      die Repositories der Boards wurden nicht angefasst.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt41');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD_EINS = join(FLAECHE, 'board-eins');
const WORKFLOW_EINS = join(FLAECHE, 'workflow-eins');
const STATION_EINS = join(FLAECHE, 'station-eins');
const BOARD_ZWEI = join(FLAECHE, 'board-zwei');
const WORKFLOW_ZWEI = join(FLAECHE, 'workflow-zwei');
const STATION_ZWEI = join(FLAECHE, 'station-zwei');
const BOARD_OHNE = join(FLAECHE, 'board-ohne');
const REGISTER = join(HOME, 'board', 'boards.json');

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

/** Ein lokales Repository mit einer Fassung `v1` und optional einem Remote. */
function festschreiben(ordner, remote = '') {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung',
  ]);
  git(ordner, ['tag', 'v1']);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
}

function station(id, name, host) {
  return {
    format: 2,
    id,
    name,
    beschreibung: name + ' in einem Satz.',
    host,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: name + ' in einem Satz.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: [id],
  };
}

function workflow(id, titel, stationOrt, stationId, position) {
  return {
    format: 2,
    id,
    titel,
    beschreibung: titel + ' in einem Satz.',
    autor: 'p1',
    stationen: [{ repo: stationOrt, fassung: 'v1', id: stationId }],
    positionen: [{ id: position, station: stationId, x: 40, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'frei',
    regeln: {},
  };
}

function boardDatei(id, name, art, workflows, stationen) {
  return {
    format: 2,
    id,
    name,
    art,
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows,
    vorhaben: [],
    stationen,
    einstellungen: {},
    layout: {},
  };
}

/** Die Fläche: zwei Boards mit Workflow und eines ohne. */
function legeFlaeche() {
  schreibeJson(join(STATION_EINS, 'station.json'), station('start', 'Start', 'p1'));
  writeFileSync(join(STATION_EINS, 'README.md'), '# Start\n', 'utf8');
  festschreiben(STATION_EINS);

  schreibeJson(join(WORKFLOW_EINS, 'workflow.json'),
    workflow('eins', 'Erster Workflow', STATION_EINS, 'start', 'idee'));
  writeFileSync(join(WORKFLOW_EINS, 'README.md'), '# Workflow eins\n', 'utf8');
  festschreiben(WORKFLOW_EINS);

  schreibeJson(join(BOARD_EINS, 'board.json'),
    boardDatei('testboard', 'Testboard', 'team',
      [{ repo: WORKFLOW_EINS, fassung: 'v1' }],
      [{ repo: STATION_EINS }]));
  writeFileSync(join(BOARD_EINS, 'README.md'), '# Testboard\n', 'utf8');
  festschreiben(BOARD_EINS);

  schreibeJson(join(STATION_ZWEI, 'station.json'), station('zwei-start', 'Zweite Station', 'p1'));
  writeFileSync(join(STATION_ZWEI, 'README.md'), '# Zweite Station\n', 'utf8');
  festschreiben(STATION_ZWEI);

  schreibeJson(join(WORKFLOW_ZWEI, 'workflow.json'),
    workflow('zwei', 'Zweiter Workflow', STATION_ZWEI, 'zwei-start', 'anfang'));
  writeFileSync(join(WORKFLOW_ZWEI, 'README.md'), '# Workflow zwei\n', 'utf8');
  festschreiben(WORKFLOW_ZWEI);

  schreibeJson(join(BOARD_ZWEI, 'board.json'),
    boardDatei('zweites', 'Zweites Board', 'lokal',
      [{ repo: WORKFLOW_ZWEI, fassung: 'v1' }],
      [{ repo: STATION_ZWEI }]));
  writeFileSync(join(BOARD_ZWEI, 'README.md'), '# Zweites Board\n', 'utf8');
  // Ein Remote ohne Token: das Board bleibt lesbar, `darf` ist falsch.
  festschreiben(BOARD_ZWEI, 'https://github.com/eigen/board-zwei.git');

  schreibeJson(join(BOARD_OHNE, 'board.json'),
    boardDatei('ohne-workflow', 'Ohne Workflow', 'lokal', [], []));
  writeFileSync(join(BOARD_OHNE, 'README.md'), '# Ohne Workflow\n', 'utf8');
  festschreiben(BOARD_OHNE);
}

/* --- Der Server in-process ----------------------------------------------- */

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
    method: koerper === undefined ? 'GET' : 'POST',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper !== undefined) yield JSON.stringify(koerper);
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

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  const route = gebaut.routen.get(String(pfad).split('?')[0]);
  pruefe(route, 'Die Route ' + pfad + ' fehlt');
  await route.handler(anfrage(pfad, koerper), res);
  pruefe(res.status > 0, 'Die Route ' + pfad + ' hat nicht geantwortet');
  const text = res.text;
  let daten = null;
  try {
    daten = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Die Antwort von ' + pfad + ' ist kein JSON: ' + text.slice(0, 200));
  }
  pruefe(daten !== null && typeof daten === 'object',
    'Die Antwort von ' + pfad + ' ist kein JSON-Objekt: ' + text.slice(0, 200));
  return { status: res.status, daten };
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeFlaeche();
  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [{
      id: 'testboard',
      name: 'Testboard',
      format: 2,
      art: 'team',
      repo: BOARD_EINS,
      remote: null,
      person: 'p1',
    }],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  process.env.DSH_HOME = HOME;
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  for (const pfad of ['/board/board', '/board/board/verbinden', '/board/workflow']) {
    pruefe(gebaut.routen.has(pfad), 'Die Route ' + pfad + ' ist nicht angemeldet');
  }

  const kopfVorher = new Map([
    BOARD_EINS, WORKFLOW_EINS, STATION_EINS,
    BOARD_ZWEI, WORKFLOW_ZWEI, STATION_ZWEI, BOARD_OHNE,
  ].map((pfad) => [pfad, git(pfad, ['rev-parse', 'HEAD'])]));

  // 1. Das offene Board: Register, Format, Art, Sichtbarkeit, Recht — ohne Fläche.
  const eins = await ruf(gebaut, '/board/board');
  pruefe(eins.status === 200,
    'GET /board/board antwortet ' + eins.status + ': ' + JSON.stringify(eins.daten));
  const board = eins.daten.board;
  pruefe(board && board.id === 'testboard',
    'Der Registereintrag fehlt oder nennt ein anderes Board: ' + JSON.stringify(board));
  pruefe(board.name === 'Testboard' && board.art === 'team' && board.format === 2,
    'Name, Art oder Format des Boards fehlen: ' + JSON.stringify(board));
  pruefe(board.repo === BOARD_EINS && board.aktiv === true,
    'Der Ordner oder die Marke „aktiv“ fehlt am Registereintrag: ' + JSON.stringify(board));
  pruefe(board.sichtbarkeit === 'öffentlich' && eins.daten.sichtbarkeit === 'öffentlich',
    'Die Sichtbarkeit des Boards fehlt: ' + JSON.stringify(board.sichtbarkeit));
  pruefe(eins.daten.format === 2 && eins.daten.art === 'team',
    'Format oder Art steht nicht neben dem Registereintrag: '
      + JSON.stringify({ format: eins.daten.format, art: eins.daten.art }));
  pruefe(eins.daten.darf === true,
    'Ein lokales Board ohne Remote ist nicht schreibbar: ' + JSON.stringify(eins.daten.darf));
  pruefe(eins.daten.darfGrund === '',
    'Ohne Hindernis steht trotzdem ein Grund da: ' + JSON.stringify(eins.daten.darfGrund));
  for (const feld of ['vorgaenge', 'workflows', 'personen', 'schritte']) {
    pruefe(!Object.prototype.hasOwnProperty.call(eins.daten, feld),
      'GET /board/board sendet die ganze Fläche („' + feld + '“)');
  }
  const verweise = eins.daten.verweise || {};
  pruefe(Array.isArray(verweise.workflows) && verweise.workflows.length === 1,
    'Der Workflow-Verweis des Boards fehlt: ' + JSON.stringify(verweise.workflows));
  pruefe(verweise.workflows[0].repo === WORKFLOW_EINS
    && verweise.workflows[0].fassung === 'v1',
  'Der Workflow-Verweis nennt Ordner und Fassung nicht: '
    + JSON.stringify(verweise.workflows[0]));
  pruefe(Array.isArray(verweise.stationen) && verweise.stationen.length === 1,
    'Der Stations-Verweis des Boards fehlt: ' + JSON.stringify(verweise.stationen));
  console.log('ok Board: Register, Format, Art, Sichtbarkeit, darf und Grund');

  // 2. Der Workflow des offenen Boards: Verweis, Fassung, Stationen, Positionen.
  const wf = await ruf(gebaut, '/board/workflow');
  pruefe(wf.status === 200,
    'GET /board/workflow antwortet ' + wf.status + ': ' + JSON.stringify(wf.daten));
  pruefe(wf.daten.verweis === WORKFLOW_EINS,
    'Der Workflow-Verweis fehlt: ' + JSON.stringify(wf.daten.verweis));
  pruefe(wf.daten.fassung === 'v1',
    'Die Fassung des Workflows fehlt: ' + JSON.stringify(wf.daten.fassung));
  pruefe(wf.daten.id === 'eins' && wf.daten.titel === 'Erster Workflow',
    'Kennung oder Titel des Workflows fehlen: '
      + JSON.stringify({ id: wf.daten.id, titel: wf.daten.titel }));
  pruefe(Array.isArray(wf.daten.stationen) && wf.daten.stationen.length === 1,
    'Die Stationen des Workflows fehlen: ' + JSON.stringify(wf.daten.stationen));
  const ersteStation = wf.daten.stationen[0];
  pruefe(ersteStation.id === 'start' && ersteStation.repo === STATION_EINS
    && ersteStation.fassung === 'v1',
  'Die Station nennt Kennung, Ordner oder Fassung nicht: '
    + JSON.stringify(ersteStation));
  pruefe(ersteStation.name === 'Start' && ersteStation.fehlt === false
    && ersteStation.fassungFehlt === false,
  'Die Station wurde nicht in ihrer Fassung gelesen: ' + JSON.stringify(ersteStation));
  pruefe(Array.isArray(wf.daten.positionen) && wf.daten.positionen.length === 1,
    'Die Positionen des Workflows fehlen: ' + JSON.stringify(wf.daten.positionen));
  pruefe(wf.daten.positionen[0].id === 'idee'
    && wf.daten.positionen[0].station === 'start',
  'Die Position nennt Kennung oder Station nicht: '
    + JSON.stringify(wf.daten.positionen[0]));
  console.log('ok Workflow: Verweis, Fassung, Stationen und Positionen');

  // 3. Verbinden: fehlende Angabe 400, unbekanntes Board 404.
  const leer = await ruf(gebaut, '/board/board/verbinden', {});
  pruefe(leer.status === 400 && String(leer.daten.error || ''),
    'POST /board/board/verbinden ohne Angabe antwortet ' + leer.status
      + ': ' + JSON.stringify(leer.daten));
  const unbekannt = await ruf(gebaut, '/board/board/verbinden', {
    repo: join(ABLAGE, 'gibt-es-nicht'),
  });
  pruefe(unbekannt.status === 404 && /gibt-es-nicht/.test(String(unbekannt.daten.error || '')),
    'Ein unbekanntes Board antwortet ' + unbekannt.status
      + ': ' + JSON.stringify(unbekannt.daten));
  const unbekannteAdresse = await ruf(gebaut, '/board/board/verbinden', {
    adresse: join(ABLAGE, 'auch-nicht-da'),
  });
  pruefe(unbekannteAdresse.status === 404,
    'Eine unbekannte Adresse antwortet ' + unbekannteAdresse.status
      + ': ' + JSON.stringify(unbekannteAdresse.daten));
  console.log('ok Verbinden: fehlende Angabe 400, unbekanntes Board 404');

  // 4. Ein zweites Board verbinden: offen, im Register, Bild mit Recht und Grund.
  const zweites = await ruf(gebaut, '/board/board/verbinden', { repo: BOARD_ZWEI });
  pruefe(zweites.status === 200,
    'POST /board/board/verbinden antwortet ' + zweites.status
      + ': ' + JSON.stringify(zweites.daten));
  pruefe(zweites.daten.aktiv === 'zweites',
    'Das verbundene Board ist nicht offen: ' + JSON.stringify(zweites.daten.aktiv));
  pruefe(zweites.daten.repo === BOARD_ZWEI,
    'Das Bild nennt nicht den Ordner des verbundenen Boards: '
      + JSON.stringify(zweites.daten.repo));
  pruefe(Array.isArray(zweites.daten.vorgaenge) && Array.isArray(zweites.daten.boards),
    'Die Antwort ist nicht das Bild des Boards: '
      + JSON.stringify(Object.keys(zweites.daten)));
  const registerJetzt = JSON.parse(readFileSync(REGISTER, 'utf8'));
  pruefe(registerJetzt.aktiv === 'zweites' && registerJetzt.boards.length === 2,
    'Das Register nennt das verbundene Board nicht als offen: '
      + JSON.stringify({ aktiv: registerJetzt.aktiv, zahl: registerJetzt.boards.length }));
  const zweiBild = await ruf(gebaut, '/board/board');
  pruefe(zweiBild.status === 200 && zweiBild.daten.board.id === 'zweites',
    'GET /board/board zeigt nicht das verbundene Board: '
      + JSON.stringify(zweiBild.daten.board && zweiBild.daten.board.id));
  pruefe(zweiBild.daten.darf === false,
    'Ein Board mit Remote und ohne Token gilt als schreibbar: '
      + JSON.stringify(zweiBild.daten.darf));
  pruefe(/token/i.test(String(zweiBild.daten.darfGrund || '')),
    'Der Grund für das fehlende Schreibrecht fehlt: '
      + JSON.stringify(zweiBild.daten.darfGrund));
  console.log('ok Verbinden: Board im Register, geöffnet, Bild mit Recht und Grund');

  // 5. Ein Board ohne Workflow: 409 mit Grund.
  const ohne = await ruf(gebaut, '/board/board/verbinden', { repo: BOARD_OHNE });
  pruefe(ohne.status === 200 && ohne.daten.aktiv === 'ohne-workflow',
    'Das Board ohne Workflow ließ sich nicht verbinden: '
      + ohne.status + ' ' + JSON.stringify(ohne.daten));
  const wfOhne = await ruf(gebaut, '/board/workflow');
  pruefe(wfOhne.status === 409,
    'GET /board/workflow ohne Workflow antwortet ' + wfOhne.status
      + ': ' + JSON.stringify(wfOhne.daten));
  pruefe(/workflow/i.test(String(wfOhne.daten.error || '')),
    'Der Grund für den fehlenden Workflow fehlt: ' + JSON.stringify(wfOhne.daten));
  console.log('ok ohne Workflow: 409 mit Grund');

  // 6. Die Seite bleibt bedienbar: /board/data, ein Wechsel, wieder der Workflow.
  const datenOhne = await ruf(gebaut, '/board/data');
  pruefe(datenOhne.status === 200 && datenOhne.daten.repo === BOARD_OHNE,
    '/board/data ist nach dem Verbinden nicht bedienbar: '
      + datenOhne.status + ' ' + JSON.stringify(datenOhne.daten && datenOhne.daten.repo));
  const zurueck = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(zurueck.status === 200,
    'Der Wechsel zurück antwortet ' + zurueck.status
      + ': ' + JSON.stringify(zurueck.daten));
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200 && daten.daten.repo === BOARD_EINS,
    '/board/data zeigt nach dem Wechsel nicht das erste Board: '
      + daten.status + ' ' + JSON.stringify(daten.daten && daten.daten.repo));
  pruefe(daten.daten.format === 2, 'Das Bild nennt die Fassung nicht: '
    + JSON.stringify(daten.daten.format));
  const boardWieder = await ruf(gebaut, '/board/board');
  pruefe(boardWieder.status === 200 && boardWieder.daten.board.id === 'testboard',
    'GET /board/board zeigt nach dem Wechsel nicht das erste Board');
  const wfWieder = await ruf(gebaut, '/board/workflow');
  pruefe(wfWieder.status === 200 && wfWieder.daten.id === 'eins',
    'GET /board/workflow zeigt nach dem Wechsel nicht den ersten Workflow: '
      + wfWieder.status + ' ' + JSON.stringify(wfWieder.daten && wfWieder.daten.id));
  console.log('ok Seite: /board/data bedienbar, Wechsel zurück, Workflow wieder da');

  // 7. Kein Board-Repository wurde durch die Routen angefasst.
  for (const [pfad, kopf] of kopfVorher) {
    pruefe(git(pfad, ['rev-parse', 'HEAD']) === kopf,
      'Die Routen haben eine Fassung angelegt: ' + pfad);
    pruefe(git(pfad, ['status', '--porcelain']) === '',
      'Die Routen haben den Arbeitsbaum verändert: ' + pfad);
  }
  console.log('ok Repositories: kein Commit, kein geänderter Arbeitsbaum');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Routen: Board, Verbinden, Workflow antworten');
