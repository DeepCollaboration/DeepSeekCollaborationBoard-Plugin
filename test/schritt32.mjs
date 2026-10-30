/**
 * Prüfung Schritt 32 — öffentlich und privat.
 *
 * Unter `/tmp/board-scheibe1/schritt32` entstehen fünf Repositories: das
 * private Board „Team“, der öffentliche Workflow „Standard“, die öffentlichen
 * beziehungsweise privaten Stationen „Idee“ und „Privat“ und das private
 * Vorhaben. Ein eigenes `DSH_HOME` trägt die Sichtbarkeitskarte mit absoluten
 * Pfaden; die Karte des Elternordners nennt nur den Workflow, das Vorhaben
 * fällt auf die Regel seines Namens zurück.
 *
 * Geprüft wird:
 *
 *   1. `sichtbarkeitVon` liest Home, Elternordner und Name in dieser
 *      Reihenfolge und schreibt nichts.
 *   2. `pruefeVerweise` findet nichts, solange das Board privat ist; wird es
 *      öffentlich, stehen die beiden Lücken (private Station, privates
 *      Vorhaben) da. `/board/data` gibt Sichtbarkeit, Lücken und `darf` weiter.
 *   3. Eine private Station kommt nicht in einen öffentlichen Workflow: 409,
 *      kein Commit. Nach dem Umschalten auf öffentlich geht es, mit Commit.
 *   4. Veröffentlichen ohne Token: 409 mit den Befehlen je Repository.
 *   5. Mit nachgebildetem GitHub und `DSH_GIT_REMOTE_BASIS` auf lokale
 *      Bare-Repositories: Repositories angelegt oder verbunden, Remotes
 *      gesetzt, gepusht, Sichtbarkeit gesetzt.
 *   6. Lesemodus bei Remote ohne Token: `darf: false`, Verschieben 403,
 *      `vorhaben.json` unverändert.
 *
 * Server, Ablage und Home werden danach entfernt.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt32');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const REMOTES = join(ABLAGE, 'remotes');
const ORGANISATION = 'DeepCollaboration';
const TOKEN = 'test-token-nur-fuer-schritt32';

const BOARD = join(FLAECHE, 'board-team');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const STATION_IDEE = join(FLAECHE, 'station-idee');
const STATION_PRIVAT = join(FLAECHE, 'station-privat');
const VORHABEN = join(FLAECHE, 'vorhaben-board-gesamtkonzept');
const REPOS = [
  { name: 'board-team', pfad: BOARD, privat: true },
  { name: 'workflow-standard', pfad: WORKFLOW, privat: false },
  { name: 'station-idee', pfad: STATION_IDEE, privat: false },
  { name: 'station-privat', pfad: STATION_PRIVAT, privat: false },
  { name: 'vorhaben-board-gesamtkonzept', pfad: VORHABEN, privat: true },
];

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

/** Eine Fassung je Repository, dazu das Tag `v1` (für `push --tags`). */
function festschreiben(ordner) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  git(ordner, ['tag', 'v1']);
}

function station(id, name, beschreibung) {
  return {
    format: 2,
    id,
    name,
    beschreibung,
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: beschreibung },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['prüfung'],
  };
}

/** Die fünf Repositories; ihre Verweise nennen absolute Pfade. */
function legeFlaeche() {
  schreibeJson(join(STATION_IDEE, 'station.json'), station(
    'idee', 'Idee', 'Thema in einem Satz festhalten.',
  ));
  writeFileSync(join(STATION_IDEE, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION_IDEE);

  schreibeJson(join(STATION_PRIVAT, 'station.json'), station(
    'privat', 'Privat', 'Nur intern sichtbar.',
  ));
  writeFileSync(join(STATION_PRIVAT, 'README.md'), '# Privat\n', 'utf8');
  festschreiben(STATION_PRIVAT);

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: STATION_IDEE, fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW);

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'board-gesamtkonzept',
    name: 'Board Gesamtkonzept',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#60a5fa',
  });
  writeFileSync(join(VORHABEN, 'idee.md'), '# Idee\n', 'utf8');
  festschreiben(VORHABEN);

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'team',
    name: 'Team',
    art: 'team',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION_IDEE }, { repo: STATION_PRIVAT }],
    einstellungen: {},
    layout: {},
  });
  festschreiben(BOARD);

  // Die Karte des Umzugs: sie liegt neben den Repositories und nennt den
  // Ordnernamen. Der Workflow steht nur hier; die Station „Privat“ steht
  // absichtlich widersprüchlich hier und im Home — das Home muss gewinnen.
  schreibeJson(join(FLAECHE, 'sichtbarkeit.json'), {
    'workflow-standard': 'öffentlich',
    'station-privat': 'öffentlich',
  });
}

/** Die Sichtbarkeitskarte im Home: absolute Pfade. */
const KARTE = {
  [BOARD]: 'privat',
  [STATION_IDEE]: 'öffentlich',
  [STATION_PRIVAT]: 'privat',
};

function schreibeKarte(werte) {
  schreibeJson(join(HOME, 'board', 'sichtbarkeit.json'), werte);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
let vorhanden = new Set();
let angelegt = [];
let gepatcht = [];
let berechtigungen = [];
const sichtbarkeitenAmServer = new Map();

function repoDaten(name, privat) {
  return {
    name,
    full_name: ORGANISATION + '/' + name,
    private: Boolean(privat),
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    description: '',
    topics: [],
    default_branch: 'main',
    html_url: 'https://github.com/' + ORGANISATION + '/' + name,
    pushed_at: null,
    license: null,
    archived: false,
    owner: { login: ORGANISATION },
  };
}

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer(async (req, res) => {
      const senden = (status, wert) => {
        const text = wert == null ? '' : JSON.stringify(wert);
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
      };
      let koerper = '';
      for await (const stueck of req) koerper += stueck;
      let daten = {};
      if (koerper) {
        try {
          daten = JSON.parse(koerper);
        } catch {
          daten = {};
        }
      }
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      const teile = pfad.split('/').filter(Boolean);

      if (pfad === '/user') {
        if (req.headers.authorization === 'Bearer ' + TOKEN) {
          senden(200, { login: 'octo', name: 'Octo', type: 'User' });
        } else {
          senden(401, { message: 'Bad credentials' });
        }
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 3) {
        const name = teile[2];
        if (vorhanden.has(name)) {
          senden(200, repoDaten(name, sichtbarkeitenAmServer.get(name) === true));
        } else {
          senden(404, { message: 'Not Found' });
        }
        return;
      }
      if (req.method === 'POST' && pfad === '/orgs/' + ORGANISATION + '/repos') {
        const name = String(daten.name || '');
        angelegt.push({ name, privat: daten.private === true });
        vorhanden.add(name);
        sichtbarkeitenAmServer.set(name, daten.private === true);
        senden(201, repoDaten(name, daten.private === true));
        return;
      }
      if (req.method === 'PATCH' && teile[0] === 'repos' && teile.length === 3) {
        const name = teile[2];
        gepatcht.push({ name, privat: daten.private === true });
        vorhanden.add(name);
        sichtbarkeitenAmServer.set(name, daten.private === true);
        senden(200, repoDaten(name, daten.private === true));
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile[3] === 'collaborators'
        && teile[5] === 'permission') {
        const login = teile[4];
        berechtigungen.push(login);
        senden(200, {
          permission: login === 'nurleser' ? 'read' : 'push',
          role_name: login === 'nurleser' ? 'read' : 'write',
        });
        return;
      }
      senden(404, { message: 'Not Found' });
    });
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      basis = 'http://127.0.0.1:' + s.address().port;
      erfuellt(basis);
    });
  });
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

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad, koerper), res);
  // Eine Route mit Remote und Token antwortet erst nach der Rückfrage bei
  // GitHub; darauf wird kurz gewartet.
  for (let i = 0; i < 200 && res.status === 0; i += 1) {
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
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: 'team',
    boards: [{
      id: 'team', name: 'Team', format: 2, art: 'team',
      repo: BOARD, remote: null, person: 'p1',
    }],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });
  schreibeKarte(KARTE);
  const karteVorher = readFileSync(join(HOME, 'board', 'sichtbarkeit.json'), 'utf8');

  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;
  process.env.DSH_GITHUB_ORG = ORGANISATION;
  process.env.DSH_GIT_REMOTE_BASIS = 'file://' + REMOTES;

  const rechte = await import(pathToFileURL(join(PRODUKT, 'rechte.js')).href);
  const github = await import(pathToFileURL(join(PRODUKT, 'github.js')).href);
  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);

  // 1. sichtbarkeitVon: Home, Elternordner, Name — und nichts wird geschrieben.
  pruefe(rechte.sichtbarkeitVon(HOME, BOARD) === 'privat',
    'Das Board ist nicht privat: ' + rechte.sichtbarkeitVon(HOME, BOARD));
  pruefe(rechte.sichtbarkeitVon(HOME, STATION_IDEE) === 'öffentlich',
    'Die Station „Idee“ ist nicht öffentlich');
  pruefe(rechte.sichtbarkeitVon(HOME, STATION_PRIVAT) === 'privat',
    'Die Karte im Home gilt nicht vor der des Elternordners');
  pruefe(rechte.sichtbarkeitVon(HOME, WORKFLOW) === 'öffentlich',
    'Die Karte des Elternordners wird nicht gelesen');
  pruefe(rechte.sichtbarkeitVon(HOME, VORHABEN) === 'privat',
    'Der Name „vorhaben-*“ entscheidet nicht privat');
  pruefe(rechte.sichtbarkeitVon(HOME, join(FLAECHE, 'board-team-weiter')) === 'öffentlich',
    'Ein unbekannter Name ist nicht öffentlich');
  pruefe(readFileSync(join(HOME, 'board', 'sichtbarkeit.json'), 'utf8') === karteVorher,
    'sichtbarkeitVon hat die Karte im Home verändert');
  pruefe(liesJson(join(FLAECHE, 'sichtbarkeit.json'))['workflow-standard'] === 'öffentlich',
    'Die Karte des Elternordners wurde verändert');

  // 2. Die Verweisprüfung: privat ist erlaubt, öffentlich nicht.
  const privat = rechte.pruefeVerweise(BOARD, { home: HOME });
  pruefe(privat.luecken.length === 0,
    'Das private Board meldet Lücken: ' + JSON.stringify(privat.luecken));
  pruefe(privat.sichtbarkeiten[BOARD] === 'privat'
    && privat.sichtbarkeiten[WORKFLOW] === 'öffentlich'
    && privat.sichtbarkeiten[STATION_PRIVAT] === 'privat'
    && privat.sichtbarkeiten[VORHABEN] === 'privat',
  'Die Sichtbarkeiten der Verweisprüfung stimmen nicht: '
    + JSON.stringify(privat.sichtbarkeiten));

  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  for (const pfad of ['/board/data', '/board/boards', '/board/workflow/station',
    '/board/vorhaben/verschieben', '/board/github/veroeffentlichen']) {
    pruefe(gebaut.routen.has(pfad), 'Die Route fehlt: ' + pfad);
  }

  const basisDaten = await ruf(gebaut, '/board/data');
  pruefe(basisDaten.status === 200, 'GET /board/data antwortet ' + basisDaten.status
    + ': ' + basisDaten.text);
  const daten = basisDaten.daten;
  pruefe(daten.format === 2, 'Die Daten tragen nicht Fassung 2');
  pruefe(daten.darf === true, 'Das lokale Board ohne Remote ist nicht beschreibbar');
  pruefe(daten.sichtbarkeit === 'privat',
    'Das Board trägt nicht seine Sichtbarkeit: ' + JSON.stringify(daten.sichtbarkeit));
  pruefe(daten.vorgaenge.length === 1 && daten.vorgaenge[0].sichtbarkeit === 'privat',
    'Das Vorhaben trägt nicht seine Sichtbarkeit: '
      + JSON.stringify(daten.vorgaenge.map((v) => v.sichtbarkeit)));
  const workflowBild = daten.workflows[0].workflows[0];
  pruefe(workflowBild.sichtbarkeit === 'öffentlich',
    'Der Workflow trägt nicht seine Sichtbarkeit: ' + workflowBild.sichtbarkeit);
  const idee = daten.stationen.find((s) => s.id === 'idee');
  const privatStation = daten.stationen.find((s) => s.id === 'privat');
  pruefe(idee && idee.sichtbarkeit === 'öffentlich',
    'Die Station „Idee“ trägt nicht ihre Sichtbarkeit');
  pruefe(privatStation && privatStation.sichtbarkeit === 'privat',
    'Die Station „Privat“ trägt nicht ihre Sichtbarkeit');
  pruefe(daten.schritte[0].sichtbarkeit === 'öffentlich',
    'Der Schritt im Workflow trägt nicht die Sichtbarkeit seiner Station');
  pruefe(!daten.luecken.some((eintrag) => eintrag.art === 'sichtbarkeit'),
    'Das private Board meldet eine Sichtbarkeitslücke: ' + JSON.stringify(daten.luecken));
  pruefe(daten.boards[0].sichtbarkeit === 'privat',
    'Die Board-Liste in /board/data trägt nicht die Sichtbarkeit: '
      + JSON.stringify(daten.boards));
  const boardListe = await ruf(gebaut, '/board/boards');
  pruefe(boardListe.status === 200 && boardListe.daten.boards[0].sichtbarkeit === 'privat',
    'GET /board/boards nennt nicht die Sichtbarkeit des Boards: '
      + boardListe.text);

  // Das Board wird öffentlich: jetzt verweisen zwei Dinge auf Privates.
  schreibeKarte({ ...KARTE, [BOARD]: 'öffentlich' });
  const offenDaten = await ruf(gebaut, '/board/data');
  pruefe(offenDaten.status === 200 && offenDaten.daten.sichtbarkeit === 'öffentlich',
    'Das öffentliche Board trägt nicht seine Sichtbarkeit');
  const offeneLuecken = offenDaten.daten.luecken
    .filter((eintrag) => eintrag.art === 'sichtbarkeit');
  pruefe(offeneLuecken.length === 2,
    'Das öffentliche Board meldet nicht zwei Sichtbarkeitslücken: '
      + JSON.stringify(offeneLuecken));
  for (const luecke of offeneLuecken) {
    pruefe(luecke.art === 'sichtbarkeit' && luecke.von && luecke.auf
      && luecke.von.art === 'board' && ['station', 'vorhaben'].includes(luecke.auf.art),
    'Eine Lücke ist nicht geformt wie verlangt: ' + JSON.stringify(luecke));
    pruefe(String(luecke.grund).includes('privat'),
      'Die Lücke nennt den Grund nicht: ' + JSON.stringify(luecke));
  }
  const offenPruefung = rechte.pruefeVerweise(BOARD, { home: HOME });
  pruefe(offenPruefung.luecken.length === 2,
    'pruefeVerweise meldet nicht zwei Lücken: ' + JSON.stringify(offenPruefung.luecken));
  schreibeKarte(KARTE);

  // 2b. Dasselbe für einen Workflow: ein öffentliches Board nimmt keinen
  // privaten Workflow auf. Dafür wird der Workflow aus dem Board genommen;
  // die fünf Repositories bleiben dieselben.
  schreibeKarte({ ...KARTE, [BOARD]: 'öffentlich', [WORKFLOW]: 'privat' });
  const boardDatei = join(BOARD, 'board.json');
  const boardRoh = liesJson(boardDatei);
  boardRoh.workflows = [];
  schreibeJson(boardDatei, boardRoh);
  git(BOARD, ['add', '--', 'board.json']);
  git(BOARD, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Workflow aus dem Board genommen', '--', 'board.json',
  ]);
  const boardKopfVorher = git(BOARD, ['rev-parse', 'HEAD']);
  const workflowVerboten = await ruf(gebaut, '/board/workflow/verbinden',
    { repo: WORKFLOW });
  pruefe(workflowVerboten.status === 409,
    'Der private Workflow antwortet ' + workflowVerboten.status + ' statt 409: '
      + workflowVerboten.text);
  pruefe(workflowVerboten.daten.error === 'Öffentlich verweist nur auf Öffentliches',
    'Die 409-Antwort für den Workflow ist nicht die verlangte: '
      + workflowVerboten.text);
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopfVorher,
    'Der abgewiesene Workflow hat einen Commit hinterlassen');
  pruefe(liesJson(boardDatei).workflows.length === 0,
    'Der abgewiesene Workflow steht trotz 409 im Board');
  schreibeKarte({ ...KARTE, [BOARD]: 'öffentlich', [WORKFLOW]: 'öffentlich' });
  const workflowErlaubt = await ruf(gebaut, '/board/workflow/verbinden',
    { repo: WORKFLOW });
  pruefe(workflowErlaubt.status === 200,
    'Der öffentliche Workflow antwortet ' + workflowErlaubt.status + ': '
      + workflowErlaubt.text);
  pruefe(liesJson(boardDatei).workflows.length === 1,
    'board.json trägt den Workflow nach dem Verbinden nicht');
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) !== boardKopfVorher,
    'Der erlaubte Workflow hat keinen Commit hinterlassen');
  schreibeKarte(KARTE);

  // 3. Eine private Station kommt nicht in den öffentlichen Workflow.
  const workflowDatei = join(WORKFLOW, 'workflow.json');
  const kopfVorher = git(WORKFLOW, ['rev-parse', 'HEAD']);
  const standVorher = git(WORKFLOW, ['status', '--porcelain']);
  const verboten = await ruf(gebaut, '/board/workflow/station', { station: 'privat' });
  pruefe(verboten.status === 409, 'Die private Station antwortet ' + verboten.status
    + ' statt 409: ' + verboten.text);
  pruefe(verboten.daten.error === 'Öffentlich verweist nur auf Öffentliches',
    'Die 409-Antwort ist nicht die verlangte: ' + verboten.text);
  pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) === kopfVorher,
    'Die abgewiesene Station hat einen Commit hinterlassen');
  pruefe(git(WORKFLOW, ['status', '--porcelain']) === standVorher,
    'Die abgewiesene Station hat die Arbeitsdateien verändert');
  pruefe(liesJson(workflowDatei).stationen.length === 1,
    'Die private Station steht trotz 409 im Workflow');

  // Nach dem Umschalten auf öffentlich ist derselbe Weg erlaubt.
  schreibeKarte({ ...KARTE, [STATION_PRIVAT]: 'öffentlich' });
  const erlaubt = await ruf(gebaut, '/board/workflow/station', { station: 'privat' });
  pruefe(erlaubt.status === 200, 'Die öffentliche Station antwortet ' + erlaubt.status
    + ': ' + erlaubt.text);
  pruefe(erlaubt.daten.schritte.length === 2,
    'Der Workflow hat nach dem Eintragen nicht zwei Schritte: '
      + JSON.stringify((erlaubt.daten.schritte || []).map((s) => s.id)));
  const nachherDatei = liesJson(workflowDatei);
  pruefe(nachherDatei.stationen.length === 2 && nachherDatei.positionen.length === 2,
    'workflow.json trägt die zweite Station nicht: ' + JSON.stringify(nachherDatei));
  pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) !== kopfVorher,
    'Der erlaubte Weg hat keinen Commit hinterlassen');
  pruefe(git(WORKFLOW, ['log', '-1', '--format=%s'])
    .includes('Station „Privat“ in den Workflow gestellt'),
  'Die Fassung nennt nicht die eingetragene Station: '
    + git(WORKFLOW, ['log', '-1', '--format=%s']));
  pruefe(git(WORKFLOW, ['status', '--porcelain']) === '',
    'Der Workflow ist nach dem Eintragen nicht sauber');
  const nachEintrag = await ruf(gebaut, '/board/data');
  pruefe(!nachEintrag.daten.luecken.some((e) => e.art === 'sichtbarkeit'),
    'Nach dem Eintragen bleibt eine Sichtbarkeitslücke: '
      + JSON.stringify(nachEintrag.daten.luecken));

  // 3b. Eine Lücke bricht das Veröffentlichen ab, bevor etwas geschrieben wird.
  // Jetzt ist das Board öffentlich, die Station privat und der Workflow nimmt
  // sie dennoch: drei Lücken — Board → Station, Board → Vorhaben und
  // Workflow → Station.
  github.schreibeToken(HOME, TOKEN);
  schreibeKarte({ ...KARTE, [BOARD]: 'öffentlich', [STATION_PRIVAT]: 'privat' });
  const mitLuecke = await ruf(gebaut, '/board/github/veroeffentlichen',
    { board: 'team' });
  pruefe(mitLuecke.status === 409, 'Die Lücke antwortet ' + mitLuecke.status
    + ' statt 409: ' + mitLuecke.text);
  pruefe(Array.isArray(mitLuecke.daten.luecken) && mitLuecke.daten.luecken.length === 3,
    'Der Abbruch nennt nicht drei Lücken: ' + mitLuecke.text);
  pruefe(mitLuecke.daten.luecken.some((e) => e.von.art === 'workflow'
    && e.auf.art === 'station'),
  'Der Abbruch nennt nicht den Verweis des Workflows auf die Station: '
    + mitLuecke.text);
  pruefe(!Array.isArray(mitLuecke.daten.befehle),
    'Der Abbruch zeigt trotz Token Befehle: ' + mitLuecke.text);
  const keineFern = spawnSync('git', ['-C', BOARD, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  });
  pruefe(keineFern.status !== 0,
    'Trotz Lücke wurde ein Remote gesetzt');
  pruefe(angelegt.length === 0, 'Trotz Lücke wurde ein Repository angelegt');
  github.loescheToken(HOME);
  schreibeKarte({ ...KARTE, [STATION_PRIVAT]: 'öffentlich' });

  // 4. Veröffentlichen ohne Token: Befehle statt eines Schreibens.
  github.loescheToken(HOME);
  const ohneToken = await ruf(gebaut, '/board/github/veroeffentlichen',
    { board: 'team' });
  pruefe(ohneToken.status === 409, 'Ohne Token antwortet die Route '
    + ohneToken.status + ' statt 409: ' + ohneToken.text);
  pruefe(ohneToken.daten.organisation === ORGANISATION,
    'Ohne Token fehlt die Organisation: ' + ohneToken.text);
  pruefe(Array.isArray(ohneToken.daten.befehle)
    && ohneToken.daten.befehle.length === REPOS.length * 2,
  'Ohne Token fehlen die Befehle je Repository: '
    + JSON.stringify(ohneToken.daten.befehle));
  for (const repo of REPOS) {
    const url = 'file://' + REMOTES + '/' + ORGANISATION + '/' + repo.name + '.git';
    const add = 'git -C ' + repo.pfad + ' remote add origin ' + url;
    const push = 'git -C ' + repo.pfad + ' push -u origin main --tags';
    pruefe(ohneToken.daten.befehle.includes(add),
      'Der Befehl für den Remote fehlt: ' + add);
    pruefe(ohneToken.daten.befehle.includes(push),
      'Der Befehl für den Push fehlt: ' + push);
  }
  const ohneRemote = spawnSync('git', ['-C', BOARD, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  });
  pruefe(ohneRemote.status !== 0, 'Ohne Token wurde trotzdem ein Remote gesetzt');

  // 5. Mit Token: anlegen, Remote setzen, pushen, Sichtbarkeit setzen.
  github.schreibeToken(HOME, TOKEN);
  vorhanden = new Set(['workflow-standard']);
  for (const repo of REPOS) {
    const bare = join(REMOTES, ORGANISATION, repo.name + '.git');
    mkdirSync(bare, { recursive: true });
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
  }
  const veroeffentlicht = await ruf(gebaut, '/board/github/veroeffentlichen',
    { board: 'team' });
  pruefe(veroeffentlicht.status === 200, 'Mit Token antwortet die Route '
    + veroeffentlicht.status + ': ' + veroeffentlicht.text);
  pruefe(veroeffentlicht.daten.fehler == null,
    'Mit Token meldet die Route einen Fehler: ' + veroeffentlicht.text);
  pruefe(veroeffentlicht.daten.veroeffentlicht.length === REPOS.length,
    'Veröffentlicht wurden nicht alle Repositories: ' + veroeffentlicht.text);
  pruefe(angelegt.length === REPOS.length - 1,
    'Angelegt wurden ' + angelegt.length + ' statt ' + (REPOS.length - 1)
      + ' Repositories: ' + JSON.stringify(angelegt));
  pruefe(!angelegt.some((eintrag) => eintrag.name === 'workflow-standard'),
    'Das vorhandene Repository wurde trotzdem angelegt');
  for (const repo of REPOS) {
    const url = 'file://' + REMOTES + '/' + ORGANISATION + '/' + repo.name + '.git';
    pruefe(git(repo.pfad, ['remote', 'get-url', 'origin']) === url,
      'Der Remote von „' + repo.name + '“ stimmt nicht: '
        + git(repo.pfad, ['remote', 'get-url', 'origin']));
    const bare = join(REMOTES, ORGANISATION, repo.name + '.git');
    pruefe(git(bare, ['rev-list', '--count', 'main'])
      === git(repo.pfad, ['rev-list', '--count', 'HEAD']),
    'Die Fassungen von „' + repo.name + '“ liegen nicht im Bare-Repository');
    pruefe(git(bare, ['tag']).includes('v1'),
      'Das Tag „v1“ von „' + repo.name + '“ wurde nicht gepusht');
    const eintrag = veroeffentlicht.daten.veroeffentlicht
      .find((e) => e.repo === repo.name);
    pruefe(eintrag && eintrag.remote === url && eintrag.sichtbarkeit
      === (repo.privat ? 'privat' : 'öffentlich'),
    'Die Antwort nennt „' + repo.name + '“ nicht richtig: '
      + JSON.stringify(veroeffentlicht.daten.veroeffentlicht));
  }
  pruefe(gepatcht.length === REPOS.length,
    'Die Sichtbarkeit wurde nicht für jedes Repository gesetzt: '
      + JSON.stringify(gepatcht));
  for (const repo of REPOS) {
    const eintrag = gepatcht.find((e) => e.name === repo.name);
    pruefe(eintrag && eintrag.privat === repo.privat,
      'Die Sichtbarkeit von „' + repo.name + '“ wurde falsch gesetzt: '
        + JSON.stringify(eintrag));
    pruefe(sichtbarkeitenAmServer.get(repo.name) === repo.privat,
      'GitHub kennt für „' + repo.name + '“ die falsche Sichtbarkeit');
  }

  // Mit Remote und gültigem Token ist das Board beschreibbar.
  const mitToken = await ruf(gebaut, '/board/data');
  pruefe(mitToken.status === 200 && mitToken.daten.darf === true,
    'Mit Token und Schreibrecht bleibt das Board gesperrt: ' + mitToken.text);
  pruefe(berechtigungen.includes('octo'),
    'Das Schreibrecht wurde nicht über die Berechtigung geprüft: '
      + JSON.stringify(berechtigungen));

  // Eine Berechtigung ohne Schreibrecht genügt nicht.
  const leser = {
    ich: async () => ({ login: 'nurleser' }),
    berechtigung: async () => ({ berechtigung: 'read', rolle: 'read' }),
  };
  pruefe(await rechte.darfSchreiben({ pfad: BOARD, home: HOME, client: leser }) === false,
    'Eine Leseberechtigung gilt als Schreibrecht');
  const pfleger = {
    ich: async () => ({ login: 'pfleger' }),
    berechtigung: async () => ({ berechtigung: 'maintain', rolle: 'maintain' }),
  };
  pruefe(await rechte.darfSchreiben({ pfad: BOARD, home: HOME, client: pfleger }) === true,
    '„maintain“ gilt nicht als Schreibrecht');

  // 6. Lesemodus: Remote ohne Token.
  github.loescheToken(HOME);
  const nurLesen = await ruf(gebaut, '/board/data');
  pruefe(nurLesen.status === 200 && nurLesen.daten.darf === false,
    'Ohne Token mit Remote fehlt „darf: false“: ' + nurLesen.text);
  pruefe(nurLesen.daten.vorgaenge[0].darf.verschieben === false
    && nurLesen.daten.vorgaenge[0].darf.aendern === false,
  'Ohne Schreibrecht bietet die Seite Handlungen an: '
    + JSON.stringify(nurLesen.daten.vorgaenge[0].darf));
  const vorhabenDatei = join(VORHABEN, 'vorhaben.json');
  const vorhabenKopf = git(VORHABEN, ['rev-parse', 'HEAD']);
  const vorhabenStand = git(VORHABEN, ['status', '--porcelain']);
  const abgewiesen = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: 'board-gesamtkonzept',
    position: 'privat',
  });
  pruefe(abgewiesen.status === 403, 'Das Verschieben antwortet '
    + abgewiesen.status + ' statt 403: ' + abgewiesen.text);
  pruefe(String(abgewiesen.daten.error).includes('Nur lesen'),
    'Die 403-Antwort nennt den Lesemodus nicht: ' + abgewiesen.text);
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === vorhabenKopf,
    'Das abgewiesene Verschieben hat einen Commit hinterlassen');
  pruefe(git(VORHABEN, ['status', '--porcelain']) === vorhabenStand,
    'Das abgewiesene Verschieben hat die Arbeitsdateien verändert');
  pruefe(liesJson(vorhabenDatei).position === 'idee',
    'Das abgewiesene Verschieben hat die Position geändert');

  // Die Karte im Home trägt am Ende noch genau das, was zuletzt geschrieben
  // wurde — keine Route hat sie ergänzt.
  pruefe(readFileSync(join(HOME, 'board', 'sichtbarkeit.json'), 'utf8')
    === JSON.stringify({ ...KARTE, [STATION_PRIVAT]: 'öffentlich' }, null, 2) + '\n',
  'Die Sichtbarkeitskarte im Home wurde von einer Route verändert');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  if (server) await new Promise((erfuellt) => server.close(erfuellt));
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Sichtbarkeit: Lücke erkannt, Schreiben abgewiesen, ohne Token '
  + 'Befehle, mit Token gepusht, Lesemodus');
