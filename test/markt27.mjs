/**
 * Prüfung Schritt 27 — Eine Station anlegen, mit austauschbarem Anlegeweg.
 *
 * Die Prüffläche liegt in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt27`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process. `DSH_GITHUB_API` zeigt auf einen Port, auf dem zu Beginn
 * nichts lauscht; erst für den Weg `selbst` startet dort ein nachgebildeter
 * GitHub-Server. Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   (a) `anlegeweg: "attrappe"`: Anlegen antwortet 200, baut unter
 *       `home/board/cache/testkonto/station-<slug>` ein lokales Repository mit
 *       gültigem `station.json` und README, trägt den Verweis in `board.json`
 *       ein und zeigt die Karte in `/board/data`. Der Server sieht keinen
 *       Aufruf.
 *   (b) Derselbe Name: 409, kein zweites Repository, keine neue Fassung.
 *   (c) Ohne Eigentümer: 403 mit Grund und Hinweis; nichts wird angelegt.
 *   (d) `anlegeweg: "selbst"` mit nachgebildetem GitHub-Server:
 *       `POST /user/repos` (201), Thema `dsh-board-station`, zwei Inhalte über
 *       die Inhalts-API, Antwort 200.
 *   (e) Kein Token in `.git/config` der neuen Repositories und kein Remote.
 *   (f) `anlegeweg: "torwart"` — ein gesetzter, unbekannter Wert: 409 mit
 *       deutscher Meldung, kein Repository, kein Serveraufruf.
 *
 * Live-Lauf (nicht Teil der Suite):
 *
 *   BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token> node --test test/markt27.mjs
 *
 * legt unter `ThomasTestDSBOARD` eine Station an, prüft Repository, Thema und
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
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';
import { liesStation } from '../formate/station.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt27');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const CACHE = join(HOME, 'board', 'cache');
const EIGENTUEMER = 'testkonto';

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
 * `BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token>` legt unter `ThomasTestDSBOARD` eine
 * Station an, prüft Repository, Thema und Dateien über die API und löscht das
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
  const repoName = 'station-live-' + stempel;
  const anzeigeName = 'Live-Prüfung ' + stempel;
  const beschreibung = 'Live-Prüfung von Schritt 27.';
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
        koerper: { names: ['dsh-board-station'] },
      });
    pruefe(thema.status === 200,
      'Das Thema ließ sich nicht setzen: HTTP ' + thema.status);

    const station = {
      format: 2,
      id: repoName,
      name: anzeigeName,
      beschreibung,
      host: owner,
      eingang: [],
      ausgabe: [],
      aktion: { art: 'textfeld', wert: beschreibung },
      beispiele: [],
      reife: 'entwurf',
      lizenz: 'nicht angegeben',
      tags: [],
    };
    const inhalt = JSON.stringify(station, null, 2) + '\n';
    const readme = '# ' + anzeigeName + '\n\n' + beschreibung
      + '\n\nThema: dsh-board-station\n';
    for (const datei of [
      { pfad: 'station.json', text: inhalt },
      { pfad: 'README.md', text: readme },
    ]) {
      const geschrieben = await liveAnfrage(token,
        '/repos/' + LIVE_OWNER + '/' + repoName + '/contents/' + datei.pfad, {
          methode: 'PUT',
          koerper: {
            message: 'Station „' + anzeigeName + '“ angelegt',
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
      && gelesen.wert.topics.includes('dsh-board-station'),
    'Das Thema fehlt am Repository: ' + JSON.stringify(gelesen.wert.topics));
    pruefe(gelesen.wert.private === false,
      'Das Repository ist nicht öffentlich');

    for (const datei of [
      { pfad: 'station.json', pruefeInhalt: true },
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
        const gelesenStation = JSON.parse(text);
        pruefe(gelesenStation.id === repoName && gelesenStation.name === anzeigeName
          && gelesenStation.host === owner,
        'station.json nennt nicht Kennung, Name und Host: ' + text);
      } else {
        pruefe(text.includes(anzeigeName) && text.includes('dsh-board-station'),
          'Das README nennt nicht Name und Thema: ' + text);
      }
    }

    console.log('ok live: Station ' + repoName + ' unter ' + owner
      + ' angelegt, Thema und Dateien geprüft');
  } finally {
    if (angelegt) {
      const weg = await liveAnfrage(token,
        '/repos/' + LIVE_OWNER + '/' + repoName, { methode: 'DELETE' });
      pruefe(weg.status === 204,
        'Das Repository ließ sich nicht löschen: HTTP ' + weg.status);
      console.log('ok live: Repository ' + repoName + ' wieder gelöscht');
    }
  }
}

async function offlineLauf() {
  let gebaut = null;
  let bestanden = false;

  rmSync(ABLAGE, { recursive: true, force: true });

  try {
    const flaeche = legePruefflaeche({ wurzel: ABLAGE });
    pruefe(flaeche.board === BOARD,
      'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'attrappe' });

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
    // Der Token ist die Anmeldung; der Weg `attrappe` benutzt ihn nicht.
    schreibeJson(GITHUB, { token: 'token-attrappe', login: EIGENTUEMER });

    const port = await reservierePort();
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    // (a) Anlegen über `attrappe`: lokal, ohne Aufruf.
    const erst = await ruf(gebaut, '/board/station', {
      name: 'Meine Station',
      beschreibung: 'Beschreibung der Station.',
    });
    pruefe(erst.status === 200,
      'POST /board/station antwortet ' + erst.status + ': '
        + JSON.stringify(erst.daten));
    const stationPfad = join(CACHE, EIGENTUEMER, 'station-meine-station');
    pruefe(erst.daten.station && erst.daten.station.owner === EIGENTUEMER
      && erst.daten.station.repo === 'station-meine-station'
      && erst.daten.station.pfad === stationPfad
      && erst.daten.station.name === 'Meine Station',
    'Die Antwort nennt nicht die neue Station: ' + JSON.stringify(erst.daten.station));
    pruefe(existsSync(join(stationPfad, 'station.json')),
      'Die Station hat keine station.json: ' + stationPfad);
    pruefe(existsSync(join(stationPfad, 'README.md')),
      'Die Station hat kein README: ' + stationPfad);

    const gelesen = liesStation(stationPfad);
    pruefe(gelesen.format === 2, 'station.json hat nicht Format 2');
    pruefe(gelesen.id === 'meine-station',
      'station.json trägt nicht die Kennung: ' + JSON.stringify(gelesen.id));
    pruefe(gelesen.name === 'Meine Station',
      'station.json trägt nicht den Namen: ' + JSON.stringify(gelesen.name));
    pruefe(gelesen.beschreibung === 'Beschreibung der Station.',
      'station.json trägt nicht die Beschreibung: '
        + JSON.stringify(gelesen.beschreibung));
    pruefe(gelesen.host === EIGENTUEMER,
      'station.json trägt nicht den Host: ' + JSON.stringify(gelesen.host));
    pruefe(gelesen.eingang.length === 0 && gelesen.ausgabe.length === 0,
      'Eingang oder Ausgang sind nicht leer: ' + JSON.stringify(gelesen));
    pruefe(gelesen.aktion.art === 'textfeld'
      && gelesen.aktion.wert === 'Beschreibung der Station.',
    'Die Aktion ist nicht das Textfeld mit der Beschreibung: '
      + JSON.stringify(gelesen.aktion));
    pruefe(gelesen.beispiele.length === 0 && gelesen.tags.length === 0,
      'Beispiele oder Tags sind nicht leer');
    pruefe(gelesen.reife === 'entwurf', 'Die Reife ist nicht Entwurf: '
      + JSON.stringify(gelesen.reife));
    pruefe(gelesen.lizenz === 'nicht angegeben', 'Die Lizenz ist nicht angegeben: '
      + JSON.stringify(gelesen.lizenz));

    const readme = readFileSync(join(stationPfad, 'README.md'), 'utf8');
    pruefe(readme.includes('Meine Station') && readme.includes('Beschreibung der Station.')
      && readme.includes('dsh-board-station'),
    'Das README nennt nicht Name, Beschreibung und Thema:\n' + readme);
    pruefe(git(stationPfad, ['status', '--porcelain']) === '',
      'Im neuen Repository bleibt etwas Uncommittetes liegen');
    pruefe(git(stationPfad, ['log', '--oneline']).split('\n').filter(Boolean).length === 1,
      'Das neue Repository hat nicht genau eine Fassung');

    const boardErst = liesJson(BOARD_DATEI);
    pruefe(boardErst.stationen.filter(
      (eintrag) => eintrag.repo === 'testkonto/station-meine-station',
    ).length === 1,
    'Der Verweis steht nicht genau einmal in board.json: '
      + JSON.stringify(boardErst.stationen));
    pruefe(git(BOARD, ['status', '--porcelain']) === '',
      'Nach dem Anlegen bleibt im Board etwas Uncommittetes liegen');

    const datenErst = await ruf(gebaut, '/board/data');
    pruefe(datenErst.status === 200,
      'GET /board/data antwortet ' + datenErst.status + ': '
        + JSON.stringify(datenErst.daten));
    const karte = (datenErst.daten.stationen || []).find(
      (eintrag) => eintrag.id === 'meine-station',
    );
    pruefe(karte, 'Die neue Station fehlt in /board/data: '
      + JSON.stringify(datenErst.daten.stationen));
    pruefe(karte.name === 'Meine Station' && karte.host === EIGENTUEMER
      && karte.repo === stationPfad,
    'Die Karte nennt nicht Name, Host und Pfad: ' + JSON.stringify(karte));
    pruefe(!Object.prototype.hasOwnProperty.call(datenErst.daten, 'darfFehler'),
      'Der Leseaufruf trägt einen unerwarteten Fehler');
    console.log('ok Station attrappe: lokales Repository, Verweis, Karte, kein Aufruf');

    // (b) Derselbe Name: 409, kein zweites Repository, keine neue Fassung.
    const kopfVor = git(BOARD, ['rev-parse', 'HEAD']);
    const zweit = await ruf(gebaut, '/board/station', {
      name: 'Meine Station',
      beschreibung: 'Noch einmal.',
    });
    pruefe(zweit.status === 409,
      'Der zweite Versuch antwortet ' + zweit.status + ' statt 409: '
        + JSON.stringify(zweit.daten));
    pruefe(String((zweit.daten && zweit.daten.error) || '').includes(
      'Eine Station mit diesem Namen gibt es schon',
    ), 'Die 409-Antwort nennt den Grund nicht: ' + JSON.stringify(zweit.daten));
    pruefe(existsSync(stationPfad), 'Der zweite Versuch hat den Ordner entfernt');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVor,
      'Der zweite Versuch hat eine neue Fassung angelegt');
    const boardZweit = liesJson(BOARD_DATEI);
    pruefe(boardZweit.stationen.filter(
      (eintrag) => eintrag.repo === 'testkonto/station-meine-station',
    ).length === 1,
    'Der Verweis steht nach dem zweiten Versuch doppelt: '
      + JSON.stringify(boardZweit.stationen));
    console.log('ok Kollision: 409 mit Grund, keine zweite Fassung');

    // (c) Ohne Eigentümer: 403 mit Grund und Hinweis; nichts entsteht.
    boardEinstellungen({ anlegeweg: 'attrappe' });
    rmSync(GITHUB, { force: true });
    const ohneEigentuemer = await ruf(gebaut, '/board/station', {
      name: 'Ohne Eigentuemer',
      beschreibung: 'Es gibt niemanden, unter dem sie liegen könnte.',
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
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'station-ohne-eigentuemer')),
      'Ohne Eigentümer wurde trotzdem ein Repository angelegt');
    console.log('ok ohne Eigentümer: 403 mit Grund und Hinweis, nichts angelegt');

    // (d) Mit `selbst` und nachgebildetem GitHub-Server.
    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'selbst' });
    schreibeJson(GITHUB, { token: 'token-testkonto', login: EIGENTUEMER });
    await starteServer(port);
    aufrufe.length = 0;

    const ueberGitHub = await ruf(gebaut, '/board/station', {
      name: 'Zweite Station',
      beschreibung: 'Über GitHub angelegt.',
    });
    pruefe(ueberGitHub.status === 200,
      'Der Weg über GitHub antwortet ' + ueberGitHub.status + ': '
        + JSON.stringify(ueberGitHub.daten));
    const zweitPfad = join(CACHE, EIGENTUEMER, 'station-zweite-station');
    pruefe(ueberGitHub.daten.station
      && ueberGitHub.daten.station.repo === 'station-zweite-station'
      && ueberGitHub.daten.station.pfad === zweitPfad,
    'Die Antwort nennt nicht die neue Station: '
      + JSON.stringify(ueberGitHub.daten.station));
    pruefe(existsSync(join(zweitPfad, 'station.json')),
      'Der Weg über GitHub hat lokal keine station.json hinterlassen');

    const anlagen = aufrufe.filter(
      (eintrag) => eintrag.methode === 'POST' && eintrag.pfad === '/user/repos',
    );
    pruefe(anlagen.length === 1,
      'Der Server sieht nicht genau eine Anlage unter /user/repos: '
        + JSON.stringify(aufrufe.map((eintrag) => eintrag.methode + ' ' + eintrag.pfad)));
    pruefe(anlagen[0].koerper && anlagen[0].koerper.name === 'station-zweite-station'
      && anlagen[0].koerper.private === false,
    'Die Anlage nennt nicht Name und Sichtbarkeit: '
      + JSON.stringify(anlagen[0].koerper));

    const themen = aufrufe.filter(
      (eintrag) => eintrag.methode === 'PUT' && /\/topics$/.test(eintrag.pfad),
    );
    pruefe(themen.length === 1,
      'Der Server sieht nicht genau ein Thema: '
        + JSON.stringify(aufrufe.map((eintrag) => eintrag.methode + ' ' + eintrag.pfad)));
    pruefe(themen[0].pfad === '/repos/' + EIGENTUEMER + '/station-zweite-station/topics',
      'Das Thema wird am falschen Repository gesetzt: ' + themen[0].pfad);
    pruefe(Array.isArray(themen[0].koerper.names)
      && themen[0].koerper.names.includes('dsh-board-station'),
    'Das Thema `dsh-board-station` fehlt: ' + JSON.stringify(themen[0].koerper));

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
    pruefe(gesendet.get('station.json')
      === readFileSync(join(zweitPfad, 'station.json'), 'utf8'),
    'Der gesendete Inhalt von station.json weicht von der Datei ab');
    pruefe(gesendet.get('README.md')
      === readFileSync(join(zweitPfad, 'README.md'), 'utf8'),
    'Der gesendete Inhalt von README.md weicht von der Datei ab');
    for (const eintrag of aufrufe) {
      pruefe(!eintrag.pfad.includes('token-'),
        'Ein Token steht in einer Adresse: ' + eintrag.methode + ' ' + eintrag.pfad);
    }

    const boardDritt = liesJson(BOARD_DATEI);
    pruefe(boardDritt.stationen.filter(
      (eintrag) => eintrag.repo === 'testkonto/station-zweite-station',
    ).length === 1,
    'Der Verweis der zweiten Station steht nicht genau einmal: '
      + JSON.stringify(boardDritt.stationen));
    console.log('ok selbst: POST /user/repos, Thema, zwei Inhalte, Antwort 200');

    // (e) Kein Token in `.git/config`, kein Remote.
    for (const pfad of [stationPfad, zweitPfad]) {
      const config = readFileSync(join(pfad, '.git', 'config'), 'utf8');
      pruefe(!/token-/i.test(config),
        'Ein Token steht in .git/config von ' + pfad + ':\n' + config);
      pruefe(!/\[remote /.test(config),
        'Ein Remote steht in .git/config von ' + pfad + ':\n' + config);
      pruefe(git(pfad, ['remote']) === '',
        'Das Repository hat trotzdem einen Remote: ' + pfad);
    }
    console.log('ok keine Spur: kein Token in .git/config, kein Remote');

    // Der Weg `attrappe` schickt auch dann nichts, wenn der Server läuft.
    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'attrappe' });
    const vorherAufrufe = aufrufe.length;
    const dritte = await ruf(gebaut, '/board/station', {
      name: 'Dritte Station',
      beschreibung: 'Ohne Netz.',
    });
    pruefe(dritte.status === 200,
      'Der Weg attrappe antwortet bei laufendem Server ' + dritte.status + ': '
        + JSON.stringify(dritte.daten));
    pruefe(aufrufe.length === vorherAufrufe,
      'Der Weg attrappe hat den Server aufgerufen: '
        + JSON.stringify(aufrufe.slice(vorherAufrufe)));
    pruefe(existsSync(join(CACHE, EIGENTUEMER, 'station-dritte-station')),
      'Der Weg attrappe hat lokal nichts angelegt');
    console.log('ok attrappe bei laufendem Server: null Aufrufe');

    // (f) Ein gesetzter, aber unbekannter Anlegeweg: 409, kein stiller
    // Rückfall auf `selbst` und kein Aufruf des laufenden Servers.
    boardEinstellungen({ eigentuemer: EIGENTUEMER, anlegeweg: 'torwart' });
    const kopfTorwart = git(BOARD, ['rev-parse', 'HEAD']);
    const vorherTorwart = aufrufe.length;
    const unbekannt = await ruf(gebaut, '/board/station', {
      name: 'Vierter Weg',
      beschreibung: 'Es gibt diesen Anlegeweg nicht.',
    });
    pruefe(unbekannt.status === 409,
      'Ein unbekannter Anlegeweg antwortet ' + unbekannt.status + ' statt 409: '
        + JSON.stringify(unbekannt.daten));
    const meldung = String((unbekannt.daten && unbekannt.daten.error) || '');
    pruefe(meldung.includes('Anlegeweg') && meldung.includes('torwart'),
      'Die 409-Antwort nennt den unbekannten Anlegeweg nicht: '
        + JSON.stringify(unbekannt.daten));
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'station-vierter-weg')),
      'Ein unbekannter Anlegeweg hat trotzdem ein Repository angelegt');
    const boardTorwart = liesJson(BOARD_DATEI);
    pruefe(!boardTorwart.stationen.some(
      (eintrag) => eintrag.repo === 'testkonto/station-vierter-weg',
    ), 'Ein unbekannter Anlegeweg hat trotzdem einen Verweis eingetragen: '
      + JSON.stringify(boardTorwart.stationen));
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfTorwart,
      'Ein unbekannter Anlegeweg hat trotzdem eine neue Fassung angelegt');
    pruefe(aufrufe.length === vorherTorwart,
      'Ein unbekannter Anlegeweg hat den Server aufgerufen: '
        + JSON.stringify(aufrufe.slice(vorherTorwart)));
    console.log('ok unbekannter Anlegeweg: 409, kein Repository, kein Aufruf');

    console.log('ok Station: attrappe lokal, Kollision, ohne Eigentümer, selbst über GitHub');
    bestanden = true;
  } finally {
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    await stoppeServer();
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
  pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
  console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);

}

if (process.env.BOARD_LIVE === '1') {
  await liveLauf();
} else {
  await offlineLauf();
}
