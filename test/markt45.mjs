/**
 * Prüfung Schritt 45 — Das „Nein“ von GitHub beim Anlegen einer Station.
 *
 * Zwei Fälle: die Organisation verweigert das Repository, und das Repository
 * entsteht, aber seine Dateien lassen sich nicht schreiben. Beide bekommen
 * eine eigene Meldung; keine sagt „ließ sich nicht anlegen“, wenn es schon
 * steht.
 *
 * Die Prüffläche liegt in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt45`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process; `DSH_GITHUB_API` zeigt auf einen nachgebildeten
 * GitHub-Server. Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. Der Eigentümer des Boards ist eine Organisation, der Token gehört zu
 *      einem anderen Konto: `POST /board/station` antwortet 403. Die Meldung
 *      nennt den Eigentümer und die Anmeldung und den Weg heraus (Eigentümer
 *      auf das Konto setzen oder Token mit Recht auf die Organisation).
 *   2. Nichts bleibt liegen: kein Ordner im Zwischenspeicher, `board.json`
 *      byte-gleich, kein neuer Commit.
 *   3. Der Aufruf ist bei GitHub angekommen: `POST /orgs/<owner>/repos`, nicht
 *      unter dem Konto.
 *   4. Unter eigenem Eigentümer entsteht das Repository, doch die Dateien
 *      scheitern (500): Antwort 502, die Meldung nennt das entstandene
 *      Repository und trennt Anlegen von Schreiben; `board.json` unverändert,
 *      kein halber lokaler Ordner.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt45');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const CACHE = join(HOME, 'board', 'cache');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const ORGANISATION = 'DeepCollaboration';
const LOGIN = 'ThomasTestDSBOARD';
const REPO = 'station-grosse-station';

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
// Was der nachgebildete GitHub-Server tut: der Organisation das Anlegen
// verweigern oder das Anlegen erlauben und erst die Dateien scheitern lassen.
let modus = 'verweigert';

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
      const teile = pfad.split('/').filter(Boolean);
      aufrufe.push({ methode: req.method, pfad, koerper });

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login: LOGIN, name: 'Prüfperson', type: 'User' });
        return;
      }
      // Der Name ist frei — deshalb kommt das Nein erst beim Anlegen.
      if (req.method === 'GET' && pfad === '/repos/' + ORGANISATION + '/' + REPO) {
        senden(404, { message: 'Not Found' });
        return;
      }
      // Die Organisation nimmt den Token nicht an: kein Mitglied, kein Recht.
      if (req.method === 'POST' && pfad === '/orgs/' + ORGANISATION + '/repos') {
        if (modus === 'verweigert') {
          senden(403, {
            message: 'You must be an organization member to create a repository '
              + 'in this organization.',
          });
          return;
        }
        senden(201, { name: String((koerper && koerper.name) || '') });
        return;
      }
      // Themen und Dateien gehören zum Repository; das Setzen der Themen
      // gelingt, das Schreiben der Dateien kann scheitern.
      if (req.method === 'PUT' && teile[0] === 'repos' && teile[3] === 'topics') {
        senden(200, { names: (koerper && koerper.names) || [] });
        return;
      }
      if (req.method === 'PUT' && teile[0] === 'repos' && teile[3] === 'contents') {
        if (modus === 'inhalt-kaputt') {
          senden(500, { message: 'Server Error' });
          return;
        }
        senden(201, {
          content: {
            path: teile.slice(4).join('/'),
            sha: 'sha-' + teile.slice(4).join('/'),
          },
        });
        return;
      }
      if (req.method === 'POST' && pfad === '/user/repos') {
        senden(201, {
          name: String((koerper && koerper.name) || ''),
          full_name: LOGIN + '/' + String((koerper && koerper.name) || ''),
          private: false,
          default_branch: 'main',
          owner: { login: LOGIN },
        });
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
    // Die Verbindung des GitHub-Clients bleibt offen; ohne dieses Schließen
    // wartet `close` auf sie und die Prüfung endet nie.
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
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

/* --- Der Lauf ------------------------------------------------------------ */

async function lauf() {
  let bestanden = false;
  rmSync(ABLAGE, { recursive: true, force: true });

  try {
    const flaeche = legePruefflaeche({ wurzel: ABLAGE });
    pruefe(flaeche.board === BOARD,
      'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

    // Der Eigentümer ist eine Organisation; der Token gehört nicht dazu.
    const roh = liesJson(BOARD_DATEI);
    roh.einstellungen = { eigentuemer: ORGANISATION, anlegeweg: 'selbst' };
    schreibeJson(BOARD_DATEI, roh);
    git(BOARD, ['add', '--', 'board.json']);
    git(BOARD, [
      '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
      'commit', '-q', '-m', 'Prüfung: Eigentümer und Anlegeweg', '--', 'board.json',
    ]);
    const kopfVorher = git(BOARD, ['rev-parse', 'HEAD']);
    const dateiVorher = readFileSync(BOARD_DATEI, 'utf8');

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
    schreibeJson(GITHUB, { token: 'token-pruefung', login: LOGIN });

    const port = await reservierePort();
    const adresse = await starteServer(port);
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = adresse;
    const gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    // (1) Das Anlegen scheitert an der Organisation — mit klarer Meldung.
    const versuch = await ruf(gebaut, '/board/station', {
      name: 'Grosse Station',
      beschreibung: 'Eine Station, die unter der Organisation entstehen sollte.',
    });
    pruefe(versuch.status === 403,
      'POST /board/station antwortet ' + versuch.status + ' statt 403: '
        + JSON.stringify(versuch.daten));
    const meldung = String((versuch.daten && versuch.daten.error) || '');
    pruefe(meldung.includes('GitHub verweigert das Anlegen unter „'
      + ORGANISATION + '“'),
    'Die Meldung nennt den Eigentümer nicht: ' + meldung);
    pruefe(meldung.includes('Der Token gehört zu „' + LOGIN + '“'),
      'Die Meldung nennt die Anmeldung nicht: ' + meldung);
    pruefe(meldung.includes('Setze den Eigentümer in den Einstellungen auf dein Konto'),
      'Die Meldung nennt den Weg nicht, den Eigentümer zu ändern: ' + meldung);
    pruefe(meldung.includes('Recht auf die Organisation'),
      'Die Meldung nennt den Token mit Recht auf die Organisation nicht: ' + meldung);

    // (2) Nichts bleibt liegen.
    pruefe(!existsSync(join(CACHE, ORGANISATION, REPO)),
      'Der halbe Weg liegt noch im Zwischenspeicher: ' + join(CACHE, ORGANISATION, REPO));
    pruefe(readFileSync(BOARD_DATEI, 'utf8') === dateiVorher,
      'board.json wurde trotz Fehler verändert');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVorher,
      'Trotz Fehler entstand eine neue Fassung im Board');
    pruefe(!liesJson(BOARD_DATEI).stationen
      .some((verweis) => String(verweis.repo || '').endsWith('/' + REPO)),
    'Der Verweis steht trotz Fehler im Board');

    // (3) Der Aufruf ging an die Organisation, nicht unter das Konto.
    const anlegen = aufrufe.filter((eintrag) => eintrag.methode === 'POST'
      && eintrag.pfad === '/orgs/' + ORGANISATION + '/repos');
    pruefe(anlegen.length === 1,
      'GitHub sah ' + anlegen.length + ' Anlegeversuche an der Organisation statt einem');
    pruefe(!aufrufe.some((eintrag) => eintrag.methode === 'POST'
      && eintrag.pfad === '/user/repos'),
    'Es wurde trotzdem unter dem Konto angelegt');

    // (4) Das Repository entsteht, aber die Dateien lassen sich nicht
    // schreiben: die Meldung sagt genau das und nennt das Repository.
    modus = 'inhalt-kaputt';
    const rohZweit = liesJson(BOARD_DATEI);
    rohZweit.einstellungen = { eigentuemer: LOGIN, anlegeweg: 'selbst' };
    schreibeJson(BOARD_DATEI, rohZweit);
    git(BOARD, ['add', '--', 'board.json']);
    git(BOARD, [
      '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
      'commit', '-q', '-m', 'Prüfung: eigener Eigentümer', '--', 'board.json',
    ]);
    const kopfZweit = git(BOARD, ['rev-parse', 'HEAD']);
    const dateiZweit = readFileSync(BOARD_DATEI, 'utf8');

    const halb = await ruf(gebaut, '/board/station', {
      name: 'Zweite Station',
      beschreibung: 'Das Repository entsteht, die Dateien nicht.',
    });
    pruefe(halb.status === 502,
      'POST /board/station mit scheiternden Dateien antwortet ' + halb.status
        + ' statt 502: ' + JSON.stringify(halb.daten));
    const halbMeldung = String((halb.daten && halb.daten.error) || '');
    pruefe(halbMeldung.includes('wurde angelegt, aber die Dateien ließen sich '
      + 'nicht schreiben'),
    'Die Meldung unterscheidet Anlegen und Schreiben nicht: ' + halbMeldung);
    pruefe(halbMeldung.includes(LOGIN + '/station-zweite-station'),
      'Die Meldung nennt das entstandene Repository nicht: ' + halbMeldung);
    pruefe(!existsSync(join(CACHE, LOGIN, 'station-zweite-station')),
      'Der halbe lokale Ordner blieb liegen');
    pruefe(readFileSync(BOARD_DATEI, 'utf8') === dateiZweit,
      'board.json wurde bei scheiternden Dateien verändert');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfZweit,
      'Bei scheiternden Dateien entstand eine neue Fassung');

    bestanden = true;
    console.log('ok Nein von GitHub: 403 mit Eigentümer und Anmeldung; '
      + 'Dateien: eigene Meldung mit Repository, nichts im Board');
  } finally {
    await stoppeServer();
    if (bestanden) rmSync(ABLAGE, { recursive: true, force: true });
  }
}

try {
  await lauf();
  process.exit(0);
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
