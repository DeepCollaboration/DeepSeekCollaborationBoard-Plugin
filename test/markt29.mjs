/**
 * Prüfung Schritt 29 — Ein Vorhaben anlegen.
 *
 * Die Prüffläche liegt in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt29`, daneben ein eigenes `DSH_HOME`. Das Board
 * der Fassung 2 verweist auf einen Workflow (`workflow-standard`, Fassung
 * `v1`) mit einer einzigen Station (`start`). Der Server läuft in-process.
 * `DSH_GITHUB_API` zeigt auf einen Port, auf dem zu Beginn nichts lauscht;
 * erst für den Weg `selbst` startet dort ein nachgebildeter GitHub-Server.
 * Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   (a) Anlegen über `attrappe`: 200, lokales Repository
 *       `$DSH_HOME/board/cache/testkonto/vorhaben-<slug>` mit gültigem
 *       `vorhaben.json` (`position`, `workflow.fassung`, `farbe`,
 *       Verantwortliche), README, genau eine Fassung; Verweis in
 *       `board.vorhaben`; das Vorhaben steht an seiner Station in
 *       `/board/data`.
 *   (b) Derselbe Name: 409 mit „Ein Vorhaben mit diesem Namen gibt es schon“,
 *       kein zweites Repository, keine neue Fassung.
 *   (c) Ohne `station`: 400; nichts wird angelegt.
 *   (d) Ohne Eigentümer: 403 mit Grund und Hinweis; ohne Anmeldung bei
 *       gesetztem Eigentümer: 403 mit dem Grund des Anlegebildes. Nichts
 *       entsteht.
 *   (e) `anlegeweg: selbst` mit nachgebildetem GitHub-Server:
 *       `POST /user/repos` (201), Thema `dsh-board-vorhaben`, zwei Inhalte,
 *       Antwort 200; die gesendeten Dateien sind die lokalen.
 *   (f) Kein Token in `.git/config` der neuen Repositories und kein Remote.
 *
 * Live-Lauf (nicht Teil der Suite):
 *
 *   BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token> node --test test/markt29.mjs
 *
 * legt unter `ThomasTestDSBOARD` ein Vorhaben an, prüft Repository, Thema und
 * Dateien über die API und löscht das Repository wieder. Ohne `BOARD_LIVE`
 * läuft kein echtes Netz.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { liesVorhaben } from '../formate/vorhaben.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt29');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const STATION = join(ABLAGE, 'station-start');
const WORKFLOW = join(ABLAGE, 'workflow-standard');
const CACHE = join(HOME, 'board', 'cache');
const EIGENTUEMER = 'testkonto';
const THEMA = 'dsh-board-vorhaben';

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
  const lauf = spawnSync('git', ['-C', ordner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/** Ein Repository mit einer Fassung; der Autor steht nur im Commit. */
function festschreiben(ordner) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
}

/** Den Stand von `board.json` mit denselben Einstellungen festschreiben. */
function boardEinstellungen(einstellungen) {
  const roh = liesJson(BOARD_DATEI);
  roh.einstellungen = einstellungen;
  schreibeJson(BOARD_DATEI, roh);
  git(BOARD, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'add', '--', 'board.json',
  ]);
  git(BOARD, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-m', 'Prüfung: Einstellungen', '--', 'board.json',
  ]);
}

/**
 * Die Fläche: eine Station, ein Workflow mit einer Position und das Board,
 * das auf beide verweist. Alles liegt als eigenes Repository mit einer
 * Fassung da.
 */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'start',
    name: 'Start',
    beschreibung: 'Der Anfang eines Vorhabens.',
    host: EIGENTUEMER,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Der Anfang eines Vorhabens.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['start'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Start\n', 'utf8');
  festschreiben(STATION);

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Anfang zum Produkt.',
    autor: EIGENTUEMER,
    stationen: [{ repo: STATION, fassung: 'v1', id: 'start' }],
    positionen: [{ id: 'start', station: 'start', x: 40, y: 60, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW);

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [{ login: EIGENTUEMER, name: 'Testperson', farbe: '#8b5cf6' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [],
    stationen: [{ repo: STATION }],
    einstellungen: { eigentuemer: EIGENTUEMER, anlegeweg: 'attrappe' },
    layout: {},
  });
  festschreiben(BOARD);
}

/* --- Ein Port, auf dem zu Beginn nichts lauscht -------------------------- */

function reservierePort() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer();
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => erfuellt(port));
    });
  });
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
const aufrufe = [];

function leseKoerper(req) {
  return new Promise((erfuellt, abgelehnt) => {
    let text = '';
    req.on('data', (stueck) => { text += stueck; });
    req.on('end', () => {
      try {
        erfuellt(text ? JSON.parse(text) : null);
      } catch (fehler) {
        abgelehnt(fehler);
      }
    });
    req.on('error', abgelehnt);
  });
}

function starteServer(port) {
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
      let koerper = null;
      try {
        koerper = await leseKoerper(req);
      } catch {
        senden(400, { message: 'Bad Request' });
        return;
      }
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      aufrufe.push({ methode: req.method, pfad, koerper });

      if (req.method === 'GET' && pfad === '/user') {
        const kopf = String(req.headers.authorization || '');
        const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
        if (!token) { senden(401, { message: 'Bad credentials' }); return; }
        senden(200, { login: EIGENTUEMER, name: 'Prüfperson', type: 'User' });
        return;
      }

      const teile = pfad.split('/').filter(Boolean);
      if (req.method === 'POST' && pfad === '/user/repos') {
        const name = String((koerper && koerper.name) || '');
        senden(201, {
          name,
          full_name: EIGENTUEMER + '/' + name,
          private: Boolean(koerper && koerper.private),
          html_url: 'https://github.com/' + EIGENTUEMER + '/' + name,
          default_branch: 'main',
          owner: { login: EIGENTUEMER },
        });
        return;
      }
      if (req.method === 'PUT' && teile[0] === 'repos' && teile.length === 4
        && teile[3] === 'topics') {
        senden(200, { names: (koerper && koerper.names) || [] });
        return;
      }
      if (req.method === 'PUT' && teile[0] === 'repos' && teile[3] === 'contents') {
        senden(201, {
          content: {
            path: teile.slice(4).join('/'),
            sha: 'sha-' + teile.slice(4).join('/'),
          },
        });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 3) {
        senden(404, { message: 'Not Found' });
        return;
      }
      senden(404, { message: 'Not Found' });
    });
    s.on('error', abgelehnt);
    s.listen(port, '127.0.0.1', () => {
      server = s;
      erfuellt('http://127.0.0.1:' + port);
    });
  });
}

function stoppeServer() {
  return new Promise((fertig) => {
    if (!server) { fertig(); return; }
    server.close(() => { server = null; fertig(); });
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
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}


/* --- Der Live-Lauf (nicht Teil der Suite) --------------------------------
 *
 * `BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token>` legt unter `ThomasTestDSBOARD` ein
 * Vorhaben an, prüft Repository, Thema und Dateien über die API und löscht das
 * Repository wieder. Der Token steht nur im Prozess, in keiner Datei. Ohne
 * `BOARD_LIVE` wird dieser Weg nicht betreten.
 */

const LIVE_API = 'https://api.github.com';
const LIVE_OWNER = 'ThomasTestDSBOARD';

/** Eine Anfrage an die echte API; der Token steht nur im Kopf, nie in der URL. */
async function liveAnfrage(token, pfad, { methode = 'GET', koerper = null } = {}) {
  const antwort = await fetch(LIVE_API + pfad, {
    method: methode,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-board-pruefung',
      authorization: 'Bearer ' + token,
      ...(koerper != null ? { 'content-type': 'application/json' } : null),
    },
    ...(koerper != null ? { body: JSON.stringify(koerper) } : null),
  });
  const text = await antwort.text();
  let wert = null;
  try { wert = text ? JSON.parse(text) : null; } catch { wert = null; }
  return { status: antwort.status, wert };
}

async function liveLauf() {
  const token = String(process.env.BOARD_LIVE_TOKEN || '').trim();
  pruefe(token, 'BOARD_LIVE_TOKEN fehlt; der Live-Lauf braucht den Token im Prozess.');

  const stempel = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const repoName = 'vorhaben-live-' + stempel;
  const anzeigeName = 'Live-Vorhaben ' + stempel;
  const beschreibung = 'Live-Prüfung von Schritt 29.';
  let angelegt = false;
  let owner = LIVE_OWNER;

  try {
    const ich = await liveAnfrage(token, '/user');
    pruefe(ich.status === 200,
      'Der Token ist nicht gültig: /user antwortet ' + ich.status);
    const login = String((ich.wert && ich.wert.login) || '');
    const eigenes = login.toLowerCase() === LIVE_OWNER.toLowerCase();
    const anlagePfad = eigenes
      ? '/user/repos'
      : '/orgs/' + LIVE_OWNER + '/repos';

    const da = await liveAnfrage(token, '/repos/' + LIVE_OWNER + '/' + repoName);
    pruefe(da.status === 404,
      'Der Name ist schon belegt (' + da.status + '): ' + repoName);

    const anlage = await liveAnfrage(token, anlagePfad, {
      methode: 'POST',
      koerper: {
        name: repoName,
        // Derselbe Weg wie die Route: sie legt das Repository öffentlich an.
        private: false,
        description: beschreibung,
      },
    });
    pruefe(anlage.status === 201,
      'Das Repository ließ sich nicht anlegen: HTTP ' + anlage.status);
    angelegt = true;

    const thema = await liveAnfrage(token,
      '/repos/' + LIVE_OWNER + '/' + repoName + '/topics', {
        methode: 'PUT',
        koerper: { names: [THEMA] },
      });
    pruefe(thema.status === 200,
      'Das Thema ließ sich nicht setzen: HTTP ' + thema.status);

    const vorhaben = {
      format: 2,
      id: 'live-' + stempel,
      name: anzeigeName,
      workflow: { repo: 'workflow-standard', fassung: 'v1' },
      position: 'idee',
      verantwortliche: { idee: [login || EIGENTUEMER] },
      laeufe: [],
      farbe: '#fbbf24',
    };
    const inhalt = JSON.stringify(vorhaben, null, 2) + '\n';
    const readme = '# ' + anzeigeName + '\n\n'
      + 'Vorhaben an der Station „idee“ des Workflows „workflow-standard“ '
      + '(Fassung v1).\n\nThema: ' + THEMA + '\n';
    for (const datei of [
      { pfad: 'vorhaben.json', text: inhalt },
      { pfad: 'README.md', text: readme },
    ]) {
      const geschrieben = await liveAnfrage(token,
        '/repos/' + LIVE_OWNER + '/' + repoName + '/contents/' + datei.pfad, {
          methode: 'PUT',
          koerper: {
            message: 'Vorhaben „' + anzeigeName + '“ angelegt',
            content: Buffer.from(datei.text, 'utf8').toString('base64'),
          },
        });
      pruefe(geschrieben.status === 201 || geschrieben.status === 200,
        'Die Datei ' + datei.pfad + ' ließ sich nicht schreiben: HTTP '
          + geschrieben.status);
    }

    // Über die API nachsehen, was dort steht.
    const gelesen = await liveAnfrage(token,
      '/repos/' + LIVE_OWNER + '/' + repoName);
    pruefe(gelesen.status === 200,
      'Das Repository ist nicht lesbar: HTTP ' + gelesen.status);
    pruefe(Array.isArray(gelesen.wert.topics)
      && gelesen.wert.topics.includes(THEMA),
    'Das Thema fehlt am Repository: ' + JSON.stringify(gelesen.wert.topics));
    pruefe(gelesen.wert.private === false,
      'Das Repository ist nicht öffentlich');

    for (const datei of [
      { pfad: 'vorhaben.json', pruefeInhalt: true },
      { pfad: 'README.md', pruefeInhalt: false },
    ]) {
      const gelesenDatei = await liveAnfrage(token,
        '/repos/' + LIVE_OWNER + '/' + repoName + '/contents/' + datei.pfad);
      pruefe(gelesenDatei.status === 200,
        'Die Datei ' + datei.pfad + ' fehlt: HTTP ' + gelesenDatei.status);
      const text = Buffer.from(
        String((gelesenDatei.wert && gelesenDatei.wert.content) || '')
          .replace(/\s+/g, ''),
        'base64',
      ).toString('utf8');
      if (datei.pruefeInhalt) {
        const gelesenVorhaben = JSON.parse(text);
        pruefe(gelesenVorhaben.id === vorhaben.id
          && gelesenVorhaben.name === anzeigeName
          && gelesenVorhaben.workflow.fassung === 'v1',
        'vorhaben.json nennt nicht Kennung, Name und Fassung: ' + text);
      } else {
        pruefe(text.includes(anzeigeName) && text.includes(THEMA),
          'Das README nennt nicht Name und Thema: ' + text);
      }
    }

    console.log('ok live: Vorhaben ' + repoName + ' unter ' + owner
      + ' angelegt, Thema und Dateien geprüft');
  } finally {
    if (angelegt) {
      const weg = await liveAnfrage(token,
        '/repos/' + LIVE_OWNER + '/' + repoName, { methode: 'DELETE' });
      pruefe(weg.status === 204,
        'Das Repository ließ sich nicht löschen: HTTP ' + weg.status);
      console.log('ok live: Vorhaben wieder gelöscht');
    }
  }
}

/* --- Der Lauf ohne Netz -------------------------------------------------- */

async function offlineLauf() {
  let gebaut = null;

  rmSync(ABLAGE, { recursive: true, force: true });

  try {
    legeFlaeche();

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
        person: EIGENTUEMER,
      }],
    });
    schreibeJson(join(HOME, 'board', 'identitaet.json'), {
      name: 'Testperson', github: '', farbe: '#8b5cf6',
    });
    // Der Token ist die Anmeldung; der Weg `attrappe` benutzt ihn nicht.
    schreibeJson(GITHUB, { token: 'token-attrappe', login: EIGENTUEMER });

    const port = await reservierePort();
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    // (a) Anlegen über `attrappe`: lokal, ohne Aufruf.
    const erst = await ruf(gebaut, '/board/vorhaben', {
      name: 'Erstes Vorhaben',
      station: 'start',
    });
    pruefe(erst.status === 200,
      'POST /board/vorhaben antwortet ' + erst.status + ': '
        + JSON.stringify(erst.daten));
    const neues = erst.daten.vorhaben;
    pruefe(neues && neues.owner === EIGENTUEMER
      && neues.repo === 'vorhaben-erstes-vorhaben'
      && neues.id === 'erstes-vorhaben'
      && neues.name === 'Erstes Vorhaben'
      && neues.position === 'start',
    'Die Antwort nennt nicht das neue Vorhaben: ' + JSON.stringify(neues));

    const vorhabenPfad = join(CACHE, EIGENTUEMER, 'vorhaben-erstes-vorhaben');
    pruefe(existsSync(join(vorhabenPfad, 'vorhaben.json')),
      'Das Vorhaben hat keine vorhaben.json: ' + vorhabenPfad);
    pruefe(existsSync(join(vorhabenPfad, 'README.md')),
      'Das Vorhaben hat kein README: ' + vorhabenPfad);

    const gelesen = liesVorhaben(vorhabenPfad);
    pruefe(gelesen.format === 2, 'vorhaben.json hat nicht Format 2');
    pruefe(gelesen.id === 'erstes-vorhaben',
      'vorhaben.json trägt nicht die Kennung: ' + JSON.stringify(gelesen.id));
    pruefe(gelesen.name === 'Erstes Vorhaben',
      'vorhaben.json trägt nicht den Namen: ' + JSON.stringify(gelesen.name));
    pruefe(gelesen.workflow.repo === WORKFLOW,
      'vorhaben.json verweist nicht auf den Workflow: '
        + JSON.stringify(gelesen.workflow.repo));
    pruefe(gelesen.workflow.fassung === 'v1',
      'vorhaben.json trägt nicht die Fassung: '
        + JSON.stringify(gelesen.workflow.fassung));
    pruefe(gelesen.position === 'start',
      'vorhaben.json steht nicht an der Station: '
        + JSON.stringify(gelesen.position));
    pruefe(JSON.stringify(gelesen.verantwortliche) === JSON.stringify({
      start: [EIGENTUEMER],
    }), 'vorhaben.json nennt nicht den Verantwortlichen: '
      + JSON.stringify(gelesen.verantwortliche));
    pruefe(Array.isArray(gelesen.laeufe) && gelesen.laeufe.length === 0,
      'Die Läufe sind nicht leer: ' + JSON.stringify(gelesen.laeufe));
    pruefe(gelesen.farbe === '#8b5cf6',
      'vorhaben.json trägt nicht die Farbe der Person: '
        + JSON.stringify(gelesen.farbe));

    const readme = readFileSync(join(vorhabenPfad, 'README.md'), 'utf8');
    pruefe(readme.includes('Erstes Vorhaben') && readme.includes('Start')
      && readme.includes('v1') && readme.includes(THEMA),
    'Das README nennt nicht Name, Station, Fassung und Thema:\n' + readme);
    pruefe(git(vorhabenPfad, ['status', '--porcelain']) === '',
      'Im neuen Repository bleibt etwas Uncommittetes liegen');
    pruefe(git(vorhabenPfad, ['log', '--oneline']).split('\n').filter(Boolean).length === 1,
      'Das neue Repository hat nicht genau eine Fassung');

    const boardErst = liesJson(BOARD_DATEI);
    pruefe(boardErst.vorhaben.filter(
      (eintrag) => eintrag.repo === EIGENTUEMER + '/vorhaben-erstes-vorhaben',
    ).length === 1,
    'Der Verweis steht nicht genau einmal in board.json: '
      + JSON.stringify(boardErst.vorhaben));
    pruefe(git(BOARD, ['status', '--porcelain']) === '',
      'Nach dem Anlegen bleibt im Board etwas Uncommittetes liegen');

    const datenErst = await ruf(gebaut, '/board/data');
    pruefe(datenErst.status === 200,
      'GET /board/data antwortet ' + datenErst.status + ': '
        + JSON.stringify(datenErst.daten));
    const karte = (datenErst.daten.vorgaenge || []).find(
      (eintrag) => eintrag.id === 'erstes-vorhaben',
    );
    pruefe(karte, 'Das neue Vorhaben fehlt in /board/data: '
      + JSON.stringify(datenErst.daten.vorgaenge));
    pruefe(karte.name === 'Erstes Vorhaben' && karte.position === 'start'
      && karte.workflow && karte.workflow.fassung === 'v1',
    'Die Karte nennt nicht Name, Station und Fassung: ' + JSON.stringify(karte));
    const stationKarte = (datenErst.daten.workflow.positionen || []).find(
      (eintrag) => eintrag.id === 'start',
    );
    pruefe(stationKarte, 'Die Station fehlt in /board/data: '
      + JSON.stringify(datenErst.daten.workflow.positionen));
    pruefe(datenErst.daten.anlegen && datenErst.daten.anlegen.darf === true,
      'Die Antwort erlaubt das Anlegen nicht: '
        + JSON.stringify(datenErst.daten.anlegen));
    console.log('ok Vorhaben attrappe: Repository, Verweis, Karte an der Station');

    // (b) Derselbe Name: 409, kein zweites Repository, keine neue Fassung.
    const kopfVor = git(BOARD, ['rev-parse', 'HEAD']);
    const zweit = await ruf(gebaut, '/board/vorhaben', {
      name: 'Erstes Vorhaben',
      station: 'start',
    });
    pruefe(zweit.status === 409,
      'Der zweite Versuch antwortet ' + zweit.status + ' statt 409: '
        + JSON.stringify(zweit.daten));
    pruefe(String((zweit.daten && zweit.daten.error) || '')
      === 'Ein Vorhaben mit diesem Namen gibt es schon',
    'Die 409-Antwort nennt den Grund nicht richtig: ' + JSON.stringify(zweit.daten));
    pruefe(existsSync(vorhabenPfad), 'Der zweite Versuch hat den Ordner entfernt');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVor,
      'Der zweite Versuch hat eine neue Fassung angelegt');
    const boardZweit = liesJson(BOARD_DATEI);
    pruefe(boardZweit.vorhaben.filter(
      (eintrag) => eintrag.repo === EIGENTUEMER + '/vorhaben-erstes-vorhaben',
    ).length === 1,
    'Der Verweis steht nach dem zweiten Versuch doppelt: '
      + JSON.stringify(boardZweit.vorhaben));
    console.log('ok Kollision: 409 mit Grund, keine zweite Fassung');

    // (c) Ohne Station: 400; nichts entsteht.
    const ohneName = await ruf(gebaut, '/board/vorhaben', { station: 'start' });
    pruefe(ohneName.status === 400,
      'Ohne Namen antwortet die Route ' + ohneName.status + ' statt 400');
    pruefe(String((ohneName.daten && ohneName.daten.error) || '') === 'Name fehlt',
      'Der Grund nennt nicht den fehlenden Namen: ' + JSON.stringify(ohneName.daten));
    const ohneStation = await ruf(gebaut, '/board/vorhaben', {
      name: 'Ohne Station',
    });
    pruefe(ohneStation.status === 400,
      'Ohne Station antwortet die Route ' + ohneStation.status
        + ' statt 400: ' + JSON.stringify(ohneStation.daten));
    pruefe(String((ohneStation.daten && ohneStation.daten.error) || '')
      .includes('Station'),
    'Der Grund nennt die fehlende Station nicht: '
      + JSON.stringify(ohneStation.daten));
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'vorhaben-ohne-station')),
      'Ohne Station wurde trotzdem ein Repository angelegt');
    const zuLang = await ruf(gebaut, '/board/vorhaben', {
      name: 'x'.repeat(121),
      station: 'start',
    });
    pruefe(zuLang.status === 400,
      'Ein zu langer Name antwortet ' + zuLang.status + ' statt 400');
    console.log('ok ohne Station: 400 mit Grund, nichts angelegt');

    // (d) Ohne Eigentümer: 403 mit Grund und Hinweis; nichts entsteht.
    boardEinstellungen({ anlegeweg: 'attrappe' });
    rmSync(GITHUB, { force: true });
    const ohneEigentuemer = await ruf(gebaut, '/board/vorhaben', {
      name: 'Ohne Eigentuemer',
      station: 'start',
    });
    pruefe(ohneEigentuemer.status === 403,
      'Ohne Eigentümer antwortet die Route ' + ohneEigentuemer.status
        + ' statt 403: ' + JSON.stringify(ohneEigentuemer.daten));
    const grundOhne = String((ohneEigentuemer.daten && ohneEigentuemer.daten.error) || '');
    pruefe(grundOhne.includes('Eigentümer'),
      'Der Grund nennt den fehlenden Eigentümer nicht: ' + JSON.stringify(grundOhne));
    pruefe(typeof ohneEigentuemer.daten.hinweis === 'string'
      && ohneEigentuemer.daten.hinweis.length > 0,
    'Der Hinweis zum fehlenden Eigentümer fehlt: '
      + JSON.stringify(ohneEigentuemer.daten));
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'vorhaben-ohne-eigentuemer')),
      'Ohne Eigentümer wurde trotzdem ein Repository angelegt');

    // Ohne Anmeldung, aber mit Eigentümer: das Anlegebild nennt den Grund.
    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'attrappe' });
    const ohneRecht = await ruf(gebaut, '/board/vorhaben', {
      name: 'Ohne Anmeldung',
      station: 'start',
    });
    pruefe(ohneRecht.status === 403,
      'Ohne Anmeldung antwortet die Route ' + ohneRecht.status
        + ' statt 403: ' + JSON.stringify(ohneRecht.daten));
    pruefe(String((ohneRecht.daten && ohneRecht.daten.error) || '').length > 0
      && typeof ohneRecht.daten.hinweis === 'string'
      && ohneRecht.daten.hinweis.length > 0,
    'Der Grund des Anlegebildes fehlt: ' + JSON.stringify(ohneRecht.daten));
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'vorhaben-ohne-anmeldung')),
      'Ohne Anmeldung wurde trotzdem ein Repository angelegt');
    console.log('ok ohne Recht: 403 mit Grund und Hinweis, nichts angelegt');

    // (e) Mit `selbst` und nachgebildetem GitHub-Server.
    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'selbst' });
    schreibeJson(GITHUB, { token: 'token-testkonto', login: EIGENTUEMER });
    await starteServer(port);
    aufrufe.length = 0;

    const ueberGitHub = await ruf(gebaut, '/board/vorhaben', {
      name: 'Zweites Vorhaben',
      station: 'start',
    });
    pruefe(ueberGitHub.status === 200,
      'Der Weg über GitHub antwortet ' + ueberGitHub.status + ': '
        + JSON.stringify(ueberGitHub.daten));
    const zweitPfad = join(CACHE, EIGENTUEMER, 'vorhaben-zweites-vorhaben');
    pruefe(ueberGitHub.daten.vorhaben
      && ueberGitHub.daten.vorhaben.repo === 'vorhaben-zweites-vorhaben'
      && ueberGitHub.daten.vorhaben.position === 'start',
    'Die Antwort nennt nicht das neue Vorhaben: '
      + JSON.stringify(ueberGitHub.daten.vorhaben));
    pruefe(existsSync(join(zweitPfad, 'vorhaben.json')),
      'Der Weg über GitHub hat lokal keine vorhaben.json hinterlassen');

    // Der Weg prüft den Namen vorher bei GitHub: ein GET auf das Repository,
    // das mit 404 frei meldet.
    const vorab = aufrufe.filter(
      (eintrag) => eintrag.methode === 'GET'
        && eintrag.pfad === '/repos/' + EIGENTUEMER + '/vorhaben-zweites-vorhaben',
    );
    pruefe(vorab.length === 1,
      'Der Weg hat den Namen nicht genau einmal geprüft: '
        + JSON.stringify(aufrufe.map((eintrag) => eintrag.methode + ' ' + eintrag.pfad)));

    const anlagen = aufrufe.filter(
      (eintrag) => eintrag.methode === 'POST' && eintrag.pfad === '/user/repos',
    );
    pruefe(anlagen.length === 1,
      'Der Server sieht nicht genau eine Anlage unter /user/repos: '
        + JSON.stringify(aufrufe.map((eintrag) => eintrag.methode + ' ' + eintrag.pfad)));
    pruefe(anlagen[0].koerper && anlagen[0].koerper.name === 'vorhaben-zweites-vorhaben',
      'Die Anlage nennt nicht den Namen: ' + JSON.stringify(anlagen[0].koerper));

    const themen = aufrufe.filter(
      (eintrag) => eintrag.methode === 'PUT' && /\/topics$/.test(eintrag.pfad),
    );
    pruefe(themen.length === 1,
      'Der Server sieht nicht genau ein Thema: '
        + JSON.stringify(aufrufe.map((eintrag) => eintrag.methode + ' ' + eintrag.pfad)));
    pruefe(themen[0].pfad
      === '/repos/' + EIGENTUEMER + '/vorhaben-zweites-vorhaben/topics',
    'Das Thema wird am falschen Repository gesetzt: ' + themen[0].pfad);
    pruefe(Array.isArray(themen[0].koerper.names)
      && themen[0].koerper.names.includes(THEMA),
    'Das Thema `' + THEMA + '` fehlt: ' + JSON.stringify(themen[0].koerper));

    const inhalte = aufrufe.filter(
      (eintrag) => eintrag.methode === 'PUT' && eintrag.pfad.includes('/contents/'),
    );
    pruefe(inhalte.length === 2,
      'Der Server sieht nicht genau zwei Inhalte: '
        + JSON.stringify(inhalte.map((eintrag) => eintrag.pfad)));
    const gesendet = new Map(inhalte.map((eintrag) => [
      eintrag.pfad.split('/contents/')[1],
      Buffer.from(String(eintrag.koerper.content || ''), 'base64').toString('utf8'),
    ]));
    pruefe(gesendet.get('vorhaben.json')
      === readFileSync(join(zweitPfad, 'vorhaben.json'), 'utf8'),
    'Der gesendete Inhalt von vorhaben.json weicht von der Datei ab');
    pruefe(gesendet.get('README.md')
      === readFileSync(join(zweitPfad, 'README.md'), 'utf8'),
    'Der gesendete Inhalt von README.md weicht von der Datei ab');
    for (const eintrag of aufrufe) {
      pruefe(!eintrag.pfad.includes('token-'),
        'Ein Token steht in einer Adresse: ' + eintrag.methode + ' ' + eintrag.pfad);
    }

    const boardDritt = liesJson(BOARD_DATEI);
    pruefe(boardDritt.vorhaben.filter(
      (eintrag) => eintrag.repo === EIGENTUEMER + '/vorhaben-zweites-vorhaben',
    ).length === 1,
    'Der Verweis des zweiten Vorhabens steht nicht genau einmal: '
      + JSON.stringify(boardDritt.vorhaben));
    console.log('ok selbst: POST /user/repos, Thema, zwei Inhalte, Antwort 200');

    // (f) Kein Token in `.git/config`, kein Remote.
    for (const pfad of [vorhabenPfad, zweitPfad]) {
      const config = readFileSync(join(pfad, '.git', 'config'), 'utf8');
      pruefe(!/token-/i.test(config),
        'Ein Token steht in .git/config von ' + pfad + ':\n' + config);
      pruefe(!/\[remote /.test(config),
        'Ein Remote steht in .git/config von ' + pfad + ':\n' + config);
      pruefe(git(pfad, ['remote']) === '',
        'Das Repository hat trotzdem einen Remote: ' + pfad);
    }
    console.log('ok keine Spur: kein Token in .git/config, kein Remote');

    console.log('ok Vorhaben: an der Station, Karte, Kollision, ohne Recht');
  } finally {
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    await stoppeServer();
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
  console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
}

if (process.env.BOARD_LIVE === '1') {
  await liveLauf();
} else {
  await offlineLauf();
}
