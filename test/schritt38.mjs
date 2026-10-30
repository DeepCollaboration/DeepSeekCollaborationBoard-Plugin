/**
 * Prüfung Schritt 38 — Das Probeprojekt.
 *
 * Unter `/tmp/board-scheibe1/schritt38` entstehen ein Hauptboard mit
 * Station, Workflow und dem Probeprojekt, alle als eigene Repositories.
 * Der Server läuft in-process; es gibt keinen GitHub-Aufruf.
 *
 * Geprüft wird:
 *
 *   1. Ohne eigenen Namen antwortet `POST /board/uebernehmen` mit 409 und
 *      `fehlt: 'name'`; es entsteht kein Board.
 *   2. Mit Namen und GitHub-Login legt die Route ein eigenes Board an, nimmt
 *      es ins Register auf und öffnet es.
 *   3. Die Kopie des Vorhabens liegt im Board, trägt eine neue Kennung,
 *      verweist mit `fork_von` aufs Original und nennt den eigenen Login als
 *      Verantwortlichen an jeder Position.
 *   4. Board und Kopie sind Git-Repositories mit genau einer Fassung.
 *   5. Das Original wird nur gelesen: sein HEAD und sein Stand bleiben gleich.
 *   6. `/board/data` des neuen Boards zeigt das Vorhaben an „Idee“.
 *
 * Die Ablage wird am Ende entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt38');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const PROBE = join(FLAECHE, 'vorhaben-probeprojekt');

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

/** Ein Repository festschreiben; ein Tag macht daraus eine benannte Fassung. */
function festschreiben(ordner, tag) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  if (tag) git(ordner, ['tag', tag]);
}

/** Das Hauptboard mit Station, Workflow und Probeprojekt. */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'idee',
    name: 'Idee',
    beschreibung: 'Thema in einem Satz festhalten.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Thema in einem Satz festhalten.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['idee'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION, 'v1');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom ersten Satz zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: 'station-idee', fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'v1');

  schreibeJson(join(PROBE, 'vorhaben.json'), {
    format: 2,
    id: 'probeprojekt',
    name: 'Probeprojekt',
    workflow: { repo: 'workflow-standard', fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['DeepCollaboration'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#38bdf8',
  });
  writeFileSync(join(PROBE, 'idee.md'), '# Probeprojekt\n\nEin Beispiel.\n', 'utf8');
  writeFileSync(join(PROBE, 'README.md'), '# Probeprojekt\n', 'utf8');
  festschreiben(PROBE, 'v1');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: 'workflow-standard', fassung: 'v1' }],
    vorhaben: [{ repo: 'vorhaben-probeprojekt' }],
    stationen: [{ repo: 'station-idee' }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(join(BOARD, 'katalog.json'), {
    format: 2,
    stationen: [{ repo: 'station-idee', besonderheit: 'Der Anfang.' }],
    workflows: [{ repo: 'workflow-standard' }],
    vorhaben: [{ repo: 'vorhaben-probeprojekt' }],
    geprueft: [],
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(BOARD, '');
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
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(
    anfrage(pfad, koerper), res,
  );
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeFlaeche();
  // Der Ordnername eines Verweises löst über den Zwischenspeicher der
  // Organisation auf. Dort liegen die Repositories wie bei einer Installation;
  // so bleibt das neue Board lesbar, obwohl seine Verweise keine absoluten
  // Pfade mehr tragen.
  for (const [name, quelle] of [
    ['workflow-standard', WORKFLOW],
    ['station-idee', STATION],
  ]) {
    cpSync(quelle, join(HOME, 'board', 'cache', 'DeepCollaboration', name),
      { recursive: true });
  }
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: 'hauptboard-2',
    boards: [{
      id: 'hauptboard-2', name: 'Hauptboard', format: 2, art: 'hauptboard',
      repo: BOARD, remote: null, person: 'p1', sichtbarkeit: 'öffentlich',
    }],
  });

  process.env.DSH_HOME = HOME;
  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/uebernehmen'),
    'Die Route /board/uebernehmen fehlt');

  // 1. Ohne eigenen Namen entsteht kein Board.
  const ohneName = await ruf(gebaut, '/board/uebernehmen', {});
  pruefe(ohneName.status === 409, 'Ohne Namen antwortet das Übernehmen '
    + ohneName.status + ': ' + ohneName.text);
  pruefe(ohneName.daten && ohneName.daten.fehlt === 'name',
    'Ohne Namen fehlt „fehlt: name“: ' + ohneName.text);
  pruefe(!existsSync(join(HOME, 'board', 'ablagen')),
    'Ohne Namen wurde eine Ablage angelegt');

  // 2. Erst der Name, dann das eigene Board.
  const identitaet = await ruf(gebaut, '/board/identitaet', {
    name: 'Anna',
    github: 'anna',
    farbe: '#38bdf8',
  });
  pruefe(identitaet.status === 200, 'Die Identität ließ sich nicht setzen: '
    + identitaet.text);

  const kopfVorher = git(PROBE, ['rev-parse', 'HEAD']);
  const uebernommen = await ruf(gebaut, '/board/uebernehmen', {});
  pruefe(uebernommen.status === 200, 'Mit Namen antwortet das Übernehmen '
    + uebernommen.status + ': ' + uebernommen.text);

  const board = uebernommen.daten.board || {};
  const vorhaben = uebernommen.daten.vorhaben || {};
  pruefe(board.art === 'lokal', 'Das neue Board ist nicht lokal: '
    + JSON.stringify(board.art));
  pruefe(board.name === 'Annas Board', 'Das neue Board heißt nicht '
    + '„Annas Board“: ' + JSON.stringify(board.name));
  pruefe(board.id === 'annas-board', 'Die Kennung des neuen Boards stimmt '
    + 'nicht: ' + JSON.stringify(board.id));

  // 3. Das Board steht im Register und ist offen.
  const register = liesJson(join(HOME, 'board', 'boards.json'));
  pruefe(register.aktiv === board.id, 'Das neue Board ist nicht offen: '
    + JSON.stringify(register.aktiv));
  const eintrag = (register.boards || []).find((b) => b.id === board.id);
  pruefe(Boolean(eintrag), 'Das neue Board steht nicht im Register');
  pruefe(eintrag.format === 2 && eintrag.art === 'lokal'
    && eintrag.repo === resolve(board.repo),
  'Der Registereintrag stimmt nicht: ' + JSON.stringify(eintrag));

  const boardOrdner = join(HOME, 'board', 'ablagen', board.id);
  pruefe(existsSync(join(boardOrdner, 'board.json')),
    'Die board.json des neuen Boards fehlt');
  const boardDaten = liesJson(join(boardOrdner, 'board.json'));
  pruefe(boardDaten.art === 'lokal' && boardDaten.id === board.id,
    'Die board.json nennt nicht das neue Board: ' + JSON.stringify(boardDaten));
  pruefe(boardDaten.personen.length === 1
    && boardDaten.personen[0].login === 'anna'
    && boardDaten.personen[0].name === 'Anna',
  'Die eigene Person steht nicht in der board.json: '
    + JSON.stringify(boardDaten.personen));
  // Seit Schritt 32 tragen die Verweise den Ordnernamen, keinen absoluten
  // Pfad; die Kopien im Zwischenspeicher oben halten sie auflösbar.
  pruefe(boardDaten.workflows.length === 1
    && boardDaten.workflows[0].repo === basename(WORKFLOW)
    && !boardDaten.workflows[0].repo.startsWith('/')
    && boardDaten.workflows[0].fassung === 'v1',
  'Der Workflow des Hauptboards steht nicht als Ordnername im Board: '
    + JSON.stringify(boardDaten.workflows));
  pruefe(boardDaten.stationen.length === 1
    && boardDaten.stationen[0].repo === basename(STATION)
    && !boardDaten.stationen[0].repo.startsWith('/'),
  'Die Station des Hauptboards steht nicht als Ordnername im Board: '
    + JSON.stringify(boardDaten.stationen));

  // 4. Die Kopie liegt im Board und verweist auf das Original.
  const kopieOrdner = join(boardOrdner, 'vorhaben-probeprojekt-kopie');
  pruefe(existsSync(join(kopieOrdner, 'vorhaben.json')),
    'Die Kopie des Vorhabens fehlt');
  pruefe(boardDaten.vorhaben.length === 1
    && boardDaten.vorhaben[0].repo === basename(kopieOrdner)
    && resolve(boardOrdner, boardDaten.vorhaben[0].repo) === kopieOrdner,
  'Das Board verweist nicht mit dem Ordnernamen auf die Kopie: '
    + JSON.stringify(boardDaten.vorhaben));
  const kopie = liesJson(join(kopieOrdner, 'vorhaben.json'));
  pruefe(kopie.id === 'probeprojekt-kopie', 'Die Kopie hat keine neue Kennung: '
    + JSON.stringify(kopie.id));
  pruefe(kopie.name === 'Probeprojekt', 'Die Kopie trägt nicht denselben Namen: '
    + JSON.stringify(kopie.name));
  pruefe(kopie.workflow.repo === basename(WORKFLOW)
    && !kopie.workflow.repo.startsWith('/'),
  'Der Workflow der Kopie zeigt nicht mit dem Ordnernamen auf das Original: '
    + JSON.stringify(kopie.workflow.repo));
  pruefe(kopie.fork_von && kopie.fork_von.repo === 'vorhaben-probeprojekt'
    && kopie.fork_von.fassung === 'v1',
  'Die Kopie nennt ihre Herkunft nicht: ' + JSON.stringify(kopie.fork_von));
  pruefe(kopie.verantwortliche.idee.length === 1
    && kopie.verantwortliche.idee[0] === 'anna',
  'Der eigene Login steht nicht als Verantwortlicher: '
    + JSON.stringify(kopie.verantwortliche));
  pruefe(existsSync(join(kopieOrdner, 'idee.md'))
    && existsSync(join(kopieOrdner, 'README.md')),
  'Die Dateien des Vorhabens wurden nicht mitkopiert');

  // 5. Board und Kopie sind eigene Repositories mit einer Fassung.
  for (const [ordner, was] of [[boardOrdner, 'Board'], [kopieOrdner, 'Kopie']]) {
    pruefe(existsSync(join(ordner, '.git')), was + ' ist kein Git-Repository');
    pruefe(git(ordner, ['log', '--oneline']).split('\n').filter(Boolean).length === 1,
      was + ' hat nicht genau eine Fassung');
    pruefe(git(ordner, ['status', '--porcelain']) === '',
      was + ' hat ungesicherte Änderungen');
  }

  // 6. Das Original bleibt unverändert.
  pruefe(git(PROBE, ['rev-parse', 'HEAD']) === kopfVorher,
    'Das Übernehmen hat einen Commit im Original angelegt');
  pruefe(git(PROBE, ['status', '--porcelain']) === '',
    'Das Übernehmen hat Dateien im Original verändert');
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Das Übernehmen hat das Hauptboard verändert');

  // 7. Das neue Board zeigt das Vorhaben an „Idee“.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, '/board/data des neuen Boards antwortet '
    + daten.status + ': ' + daten.text);
  pruefe(daten.daten.aktiv === board.id, '/board/data zeigt nicht das neue '
    + 'Board: ' + JSON.stringify(daten.daten.aktiv));
  const gezeigt = (daten.daten.vorgaenge || [])
    .find((v) => v.id === 'probeprojekt-kopie');
  pruefe(Boolean(gezeigt), '/board/data zeigt die Kopie nicht: '
    + JSON.stringify(daten.daten.vorgaenge));
  pruefe(gezeigt.position === 'idee', 'Die Kopie steht nicht an „Idee“: '
    + JSON.stringify(gezeigt.position));
  pruefe((daten.daten.workflow.positionen || []).some((p) => p.id === 'idee'),
    'Der Workflow des neuen Boards kennt keine Position „Idee“');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Probeprojekt: ohne Name 409, übernommen, Kopie verweist aufs '
  + 'Original, Original unverändert');
