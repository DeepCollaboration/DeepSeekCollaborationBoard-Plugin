/**
 * Prüfung Schritt 39 — die frische Installation.
 *
 * Unter `/tmp/board-scheibe1/schritt39` entstehen eine Station, ein Workflow,
 * das Probeprojekt und das Hauptboard. Jedes Repository liegt zusätzlich als
 * lokales Bare-Repository unter `.../remotes/DeepCollaboration/`;
 * `DSH_BOARD_HAUPTBOARD` und `DSH_BOARD_REMOTE_BASIS` zeigen dorthin. Das Home
 * ist frisch: es gibt weder `boards.json` noch `identitaet.json`. Der Server
 * läuft in-process, ohne echten GitHub-Aufruf.
 *
 * Geprüft wird:
 *
 *   1. `/board/data` liefert das Hauptboard mit Station, Workflow und
 *      Probeprojekt — ohne Einrichten, ohne Namen.
 *   2. `/board/boards` zeigt das Hauptboard, aber keine Identität.
 *   3. Übernehmen antwortet ohne Namen mit 409 und `fehlt: 'name'`; es entsteht
 *      kein Board.
 *   4. `POST /board/identitaet` setzt den Namen.
 *   5. Übernehmen legt das eigene Board an; es ist offen und zeigt die Kopie
 *      des Probeprojekts an „Idee“.
 *   6. Die Anzeige listet Hauptboard und eigenes Board.
 *   7. Die deutsche README nennt „Hauptboard“, „Probeprojekt“ und den Token
 *      als optional; `package.json` trägt die vollständige `files`-Liste.
 *
 * Die Ablage wird am Ende entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt39');
const KOPIE = join(ABLAGE, 'produkt');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const PROBE = join(FLAECHE, 'vorhaben-probeprojekt');
const REMOTES = join(ABLAGE, 'remotes');
const ORGANISATION = 'DeepCollaboration';
const REMOTE_BOARD = join(REMOTES, ORGANISATION, 'board-hauptboard.git');
const REMOTE_STATION = join(REMOTES, ORGANISATION, 'station-idee.git');
const REMOTE_WORKFLOW = join(REMOTES, ORGANISATION, 'workflow-standard.git');
const REMOTE_PROBE = join(REMOTES, ORGANISATION, 'vorhaben-probeprojekt.git');
const HOME = join(ABLAGE, 'home');

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

/** Station, Workflow, Probeprojekt und Hauptboard samt Bare-Remotes. */
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
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#38bdf8',
  });
  writeFileSync(join(PROBE, 'idee.md'), '# Probeprojekt\n\nEin Beispiel.\n', 'utf8');
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

  for (const [quelle, ziel] of [
    [BOARD, REMOTE_BOARD],
    [STATION, REMOTE_STATION],
    [WORKFLOW, REMOTE_WORKFLOW],
    [PROBE, REMOTE_PROBE],
  ]) {
    mkdirSync(dirname(ziel), { recursive: true });
    git(FLAECHE, ['clone', '--bare', '--quiet', quelle, ziel]);
  }
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
  // Das Produkt als Kopie ohne seine alte Einzelkonfiguration: nur so ist das
  // Home wirklich frisch, ohne die Ablage dieses Arbeitsbereichs zu berühren.
  cpSync(PRODUKT, KOPIE, { recursive: true });
  rmSync(join(KOPIE, 'board.config.json'), { force: true });
  mkdirSync(HOME, { recursive: true });

  // 1. Das Home ist frisch: kein Register, keine Identität.
  pruefe(!existsSync(join(HOME, 'board', 'boards.json')),
    'Das Home hat schon ein Register');
  pruefe(!existsSync(join(HOME, 'board', 'identitaet.json')),
    'Das Home hat schon eine Identität');
  // Das Probeprojekt heißt „vorhaben-…“ und gilt nach seinem Namen als privat;
  // für die Prüffläche ist es öffentlich. Die Karte gehört zur Umgebung, nicht
  // zum Einrichten durch den Menschen.
  schreibeJson(join(HOME, 'board', 'sichtbarkeit.json'), {
    [join(HOME, 'board', 'cache', ORGANISATION, 'vorhaben-probeprojekt')]: 'öffentlich',
  });

  process.env.DSH_GITHUB_ORG = ORGANISATION;
  process.env.DSH_BOARD_HAUPTBOARD = 'file://' + REMOTE_BOARD;
  process.env.DSH_BOARD_REMOTE_BASIS = 'file://' + REMOTES;
  process.env.DSH_HOME = HOME;

  const modul = await import(pathToFileURL(join(KOPIE, 'index.js')).href
    + '?fall=frisch');
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  // 2. Das Hauptboard steht ohne Einrichten da: Station, Workflow, Probe.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status
    + ': ' + daten.text);
  pruefe(daten.daten.leer !== true,
    'Das Hauptboard wird als leeres Board gezeigt: ' + daten.text);
  const stationen = daten.daten.stationen || [];
  pruefe(stationen.some((s) => s.id === 'idee' && s.name === 'Idee'),
    'Die Station „Idee“ fehlt im Hauptboard: ' + JSON.stringify(stationen));
  const flaechen = daten.daten.workflows || [];
  const schritte = flaechen.flatMap((f) => (f.workflows || [])
    .flatMap((w) => w.schritte || []));
  pruefe(schritte.some((s) => s.id === 'idee' && s.name === 'Idee'),
    'Der Schritt „Idee“ fehlt im Workflow: ' + JSON.stringify(schritte));
  const vorgaenge = daten.daten.vorgaenge || [];
  const probe = vorgaenge.find((v) => v.id === 'probeprojekt');
  pruefe(Boolean(probe), 'Das Probeprojekt fehlt im Hauptboard: '
    + JSON.stringify(vorgaenge));
  pruefe(probe.name === 'Probeprojekt' && probe.position === 'idee',
    'Das Probeprojekt steht nicht als „Probeprojekt“ an „Idee“: '
      + JSON.stringify(probe));
  pruefe(Array.isArray(daten.daten.luecken) && daten.daten.luecken.length === 0,
    'Das frisch geholte Board trägt Lücken: '
      + JSON.stringify(daten.daten.luecken));

  // 3. Die Anzeige kennt das Hauptboard, aber noch keinen Namen.
  const liste = await ruf(gebaut, '/board/boards');
  pruefe(liste.status === 200, 'GET /board/boards antwortet ' + liste.status
    + ': ' + liste.text);
  pruefe(liste.daten.identitaet == null,
    'Ohne Namen zeigt die Anzeige eine Identität: '
      + JSON.stringify(liste.daten.identitaet));
  pruefe((liste.daten.boards || []).length === 1,
    'Die frische Anzeige nennt nicht genau das Hauptboard: '
      + JSON.stringify(liste.daten.boards));
  const haupt = liste.daten.boards[0];
  pruefe(haupt.id === 'hauptboard' && haupt.art === 'hauptboard'
    && haupt.aktiv === true,
  'Das Hauptboard steht nicht als offenes Hauptboard in der Anzeige: '
    + JSON.stringify(haupt));

  // 4. Übernehmen ohne Namen: 409, und nichts entsteht.
  const ohneName = await ruf(gebaut, '/board/uebernehmen', {});
  pruefe(ohneName.status === 409, 'Ohne Namen antwortet das Übernehmen '
    + ohneName.status + ': ' + ohneName.text);
  pruefe(ohneName.daten && ohneName.daten.fehlt === 'name',
    'Ohne Namen fehlt „fehlt: name“: ' + ohneName.text);
  pruefe(!existsSync(join(HOME, 'board', 'ablagen')),
    'Ohne Namen wurde eine Ablage angelegt');

  // 5. Erst beim Beitreten kommt der eigene Name.
  const identitaet = await ruf(gebaut, '/board/identitaet', {
    name: 'Anna',
    github: 'anna',
    farbe: '#38bdf8',
  });
  pruefe(identitaet.status === 200, 'Die Identität ließ sich nicht setzen: '
    + identitaet.text);
  const idDatei = liesJson(join(HOME, 'board', 'identitaet.json'));
  pruefe(idDatei.name === 'Anna' && idDatei.github === 'anna',
    'Die Identität liegt nicht im Home: ' + JSON.stringify(idDatei));

  // 6. Jetzt legt das Übernehmen das eigene Board an.
  const uebernommen = await ruf(gebaut, '/board/uebernehmen', {});
  pruefe(uebernommen.status === 200, 'Mit Namen antwortet das Übernehmen '
    + uebernommen.status + ': ' + uebernommen.text);
  const eigenes = uebernommen.daten.board || {};
  pruefe(eigenes.art === 'lokal' && eigenes.id === 'annas-board'
    && eigenes.name === 'Annas Board',
  'Das eigene Board stimmt nicht: ' + JSON.stringify(eigenes));
  const boardOrdner = join(HOME, 'board', 'ablagen', 'annas-board');
  pruefe(existsSync(join(boardOrdner, 'board.json')),
    'Die board.json des eigenen Boards fehlt');
  const kopieOrdner = join(boardOrdner, 'vorhaben-probeprojekt-kopie');
  pruefe(existsSync(join(kopieOrdner, 'vorhaben.json')),
    'Die Kopie des Probeprojekts fehlt');

  const register = liesJson(join(HOME, 'board', 'boards.json'));
  pruefe(register.aktiv === 'annas-board', 'Das eigene Board ist nicht offen: '
    + JSON.stringify(register.aktiv));
  pruefe(register.boards.length === 2, 'Das Register nennt nicht beide Boards: '
    + JSON.stringify(register.boards.map((b) => b.id)));

  // 7. Die Anzeige listet Hauptboard und eigenes Board, jetzt mit Namen.
  const anzeige = await ruf(gebaut, '/board/boards');
  pruefe(anzeige.status === 200, 'GET /board/boards nach dem Übernehmen '
    + anzeige.status + ': ' + anzeige.text);
  const namen = (anzeige.daten.boards || []).map((b) => b.name);
  pruefe(namen.includes('Hauptboard') && namen.includes('Annas Board'),
    'Die Anzeige nennt nicht Hauptboard und eigenes Board: ' + JSON.stringify(namen));
  pruefe(anzeige.daten.aktiv === 'annas-board',
    'Die Anzeige zeigt nicht das eigene Board als offen: '
      + JSON.stringify(anzeige.daten.aktiv));
  pruefe(anzeige.daten.identitaet && anzeige.daten.identitaet.name === 'Anna',
    'Die Anzeige zeigt den gesetzten Namen nicht: '
      + JSON.stringify(anzeige.daten.identitaet));

  // 8. Das eigene Board zeigt die Kopie an „Idee“.
  const eigenesBild = await ruf(gebaut, '/board/data');
  pruefe(eigenesBild.status === 200, '/board/data des eigenen Boards antwortet '
    + eigenesBild.status + ': ' + eigenesBild.text);
  pruefe(eigenesBild.daten.aktiv === 'annas-board',
    '/board/data zeigt nicht das eigene Board: '
      + JSON.stringify(eigenesBild.daten.aktiv));
  const kopie = (eigenesBild.daten.vorgaenge || [])
    .find((v) => v.id === 'probeprojekt-kopie');
  pruefe(Boolean(kopie), 'Das eigene Board zeigt die Kopie nicht: '
    + JSON.stringify(eigenesBild.daten.vorgaenge));
  pruefe(kopie.position === 'idee', 'Die Kopie steht nicht an „Idee“: '
    + JSON.stringify(kopie.position));

  // 9. Die deutsche README und die files-Liste gehören zur Fassung 2.
  const readme = readFileSync(join(PRODUKT, 'README.de.md'), 'utf8');
  pruefe(readme.includes('Hauptboard'),
    'Die deutsche README nennt das Hauptboard nicht');
  pruefe(readme.includes('Probeprojekt'),
    'Die deutsche README nennt das Probeprojekt nicht');
  pruefe(/Token[^\n]{0,80}optional|optional[^\n]{0,80}Token/i.test(readme),
    'Die deutsche README nennt den Token nicht als optional');
  const paket = liesJson(join(PRODUKT, 'package.json'));
  for (const datei of ['github.js', 'katalog.js', 'rechte.js', 'erststart.js',
    'werkzeuge/']) {
    pruefe(Array.isArray(paket.files) && paket.files.includes(datei),
      'In package.json fehlt in „files“: ' + datei);
  }

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.DSH_BOARD_HAUPTBOARD;
  delete process.env.DSH_BOARD_REMOTE_BASIS;
  delete process.env.DSH_GITHUB_ORG;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Frische Installation: Hauptboard ohne Einrichten, Name erst beim '
  + 'Beitreten, eigenes Board, deutsche README aktuell');
