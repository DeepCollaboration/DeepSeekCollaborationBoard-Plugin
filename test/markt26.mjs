/**
 * Prüfung Schritt 26 — Anmelden und dürfen.
 *
 * Die fünf Repositories der Prüffläche liegen in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt26`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process. `DSH_GITHUB_API` zeigt auf einen nachgebildeten
 * GitHub-Server auf 127.0.0.1 — ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. Lokales Board ohne Remote: `darf: true`, kein Grund, kein Hinweis;
 *      eine Datei speichern geht.
 *   2. Board mit GitHub-Remote ohne Token: `darf: false` mit deutschem Grund
 *      (Token/Anmeldung) und Weg; `anlegen.darf: false` mit Hinweis;
 *      `POST /board/einstellung` antwortet 403 und schreibt nichts;
 *      `/board/github/stand` nennt `login: null` ohne Fehler.
 *   3. Mit Token und Schreibrecht: `stand.login` gesetzt, `darf: true`,
 *      `anlegen.darf: true`, kein Grund.
 *   4. Mit Token ohne Schreibrecht (`read`): `darf: false`, Grund nennt das
 *      fehlende Schreibrecht; die Handlungen am Vorhaben sind gesperrt.
 *   5. Mit Token und ohne Netz: `stand.login` bleibt der gemerkte Login,
 *      `fehler` nennt den Grund; `darf: false` mit „nicht prüfbar“.
 *   6. Token löschen: `darf` wieder falsch mit dem Grund „kein Token“.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt26');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const VORHABEN = join(ABLAGE, 'vorhaben');
const VORHABEN_ID = 'board-gesamtkonzept';

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

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
const berechtigungen = [];

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
      for await (const stueck of req) { /* Der Körper wird nicht gebraucht. */ }
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      const teile = pfad.split('/').filter(Boolean);
      const kopf = String(req.headers.authorization || '');
      const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
      const login = token === 'token-schreiber'
        ? 'schreiber'
        : token === 'token-leser' ? 'leser' : '';

      if (pfad === '/user') {
        if (!login) { senden(401, { message: 'Bad credentials' }); return; }
        senden(200, { login, name: 'Prüfperson', type: 'User' });
        return;
      }
      if (pfad === '/rate_limit') {
        senden(200, {
          resources: { core: { remaining: 4999, reset: 4102444800, limit: 5000 } },
        });
        return;
      }
      // Die Rechte gelten der Person, nicht dem Token.
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 6
        && teile[3] === 'collaborators' && teile[5] === 'permission') {
        const person = teile[4];
        berechtigungen.push(person);
        if (person === 'schreiber') {
          senden(200, { permission: 'write', role_name: 'write' });
          return;
        }
        if (person === 'leser') {
          senden(200, { permission: 'read', role_name: 'read' });
          return;
        }
        senden(404, { message: 'Not Found' });
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

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

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

  // Der nachgebildete Server steht, bevor das Produkt geladen wird: die
  // API-Adresse wird beim Import gelesen.
  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;
  gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  modul.apply(gebaut.ctx);

  // 1. Lokal ohne Remote: Schreiben ist erlaubt, ohne Grund.
  const lokal = await ruf(gebaut, '/board/data');
  pruefe(lokal.status === 200,
    'GET /board/data antwortet ' + lokal.status + ': ' + JSON.stringify(lokal.daten));
  pruefe(lokal.daten.format === 2,
    'GET /board/data nennt nicht Fassung 2: ' + JSON.stringify(lokal.daten.format));
  pruefe(lokal.daten.darf === true,
    'Lokal ohne Remote ist `darf` nicht true: ' + JSON.stringify(lokal.daten.darf));
  pruefe(!Object.prototype.hasOwnProperty.call(lokal.daten, 'darfGrund'),
    'Ohne Grund steht trotzdem `darfGrund` da: '
      + JSON.stringify(lokal.daten.darfGrund));
  pruefe(!Object.prototype.hasOwnProperty.call(lokal.daten, 'darfHinweis'),
    'Ohne Grund steht trotzdem `darfHinweis` da: '
      + JSON.stringify(lokal.daten.darfHinweis));

  const gespeichert = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID,
    position: 'umsetzen',
  });
  pruefe(gespeichert.status === 200,
    'Lokal ließ sich keine Datei speichern: ' + JSON.stringify(gespeichert.daten));
  const vorhabenDatei = liesJson(join(VORHABEN, 'vorhaben.json'));
  pruefe(vorhabenDatei.position === 'umsetzen',
    'vorhaben.json trägt nicht die neue Station: '
      + JSON.stringify(vorhabenDatei.position));
  pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
    'Nach dem Speichern bleibt im Vorhaben etwas Uncommittetes liegen');
  console.log('ok lokal ohne Remote: darf true, kein Grund, Datei gespeichert');

  // 2. GitHub-Remote ohne Token: niemand ist angemeldet.
  git(BOARD, ['remote', 'add', 'origin',
    'https://github.com/DeepCollaboration/board.git']);
  const ohneToken = await ruf(gebaut, '/board/data');
  pruefe(ohneToken.status === 200,
    'GET /board/data antwortet ' + ohneToken.status + ': '
      + JSON.stringify(ohneToken.daten));
  pruefe(ohneToken.daten.darf === false,
    'Mit Remote und ohne Token ist `darf` nicht false: '
      + JSON.stringify(ohneToken.daten.darf));
  const grundOhneToken = String(ohneToken.daten.darfGrund || '');
  pruefe(/token/i.test(grundOhneToken) && /anmeldung/i.test(grundOhneToken),
    'Der Grund nennt Token oder Anmeldung nicht: ' + JSON.stringify(grundOhneToken));
  pruefe(typeof ohneToken.daten.darfHinweis === 'string'
    && ohneToken.daten.darfHinweis.length > 0,
  'Der Hinweis zum fehlenden Token fehlt: '
    + JSON.stringify(ohneToken.daten.darfHinweis));
  pruefe(ohneToken.daten.anlegen && ohneToken.daten.anlegen.darf === false,
    '`anlegen.darf` ist ohne Token nicht false: '
      + JSON.stringify(ohneToken.daten.anlegen));
  pruefe(typeof ohneToken.daten.anlegen.hinweis === 'string'
    && /token/i.test(ohneToken.daten.anlegen.hinweis)
    && /melde/i.test(ohneToken.daten.anlegen.hinweis),
  'Der Hinweis zum Anlegen nennt den Weg nicht: '
    + JSON.stringify(ohneToken.daten.anlegen.hinweis));

  const kopfVor403 = git(BOARD, ['rev-parse', 'HEAD']);
  const verboten = await ruf(gebaut, '/board/einstellung', {
    name: 'eigentuemer', wert: 'DeepCollaboration',
  });
  pruefe(verboten.status === 403,
    'POST /board/einstellung antwortet ' + verboten.status + ' statt 403: '
      + JSON.stringify(verboten.daten));
  pruefe(String((verboten.daten && verboten.daten.error) || '').includes('Nur lesen'),
    'Die 403-Antwort nennt den Lesemodus nicht: ' + JSON.stringify(verboten.daten));
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVor403,
    'Trotz fehlendem Schreibrecht entstand eine Fassung');
  const boardOhneRecht = liesJson(BOARD_DATEI);
  pruefe(!boardOhneRecht.einstellungen || boardOhneRecht.einstellungen.eigentuemer
    === undefined,
  'Trotz fehlendem Schreibrecht wurde der Eigentümer gesetzt: '
    + JSON.stringify(boardOhneRecht.einstellungen));

  const standOhneToken = await ruf(gebaut, '/board/github/stand');
  pruefe(standOhneToken.status === 200,
    'GET /board/github/stand antwortet ' + standOhneToken.status);
  pruefe(standOhneToken.daten.login === null,
    'Ohne Token trägt der Stand einen Login: '
      + JSON.stringify(standOhneToken.daten.login));
  pruefe(!standOhneToken.daten.fehler,
    'Ohne Token meldet der Stand einen Fehler: '
      + JSON.stringify(standOhneToken.daten.fehler));
  console.log('ok Remote ohne Token: darf false mit Grund, anlegen false mit '
    + 'Hinweis, Einstellung 403, stand.login null');

  // 3. Mit Token und Schreibrecht: die Antwort gilt dem Login.
  const angemeldet = await ruf(gebaut, '/board/github/token', {
    token: 'token-schreiber',
  });
  pruefe(angemeldet.status === 200,
    'POST /board/github/token antwortet ' + angemeldet.status + ': '
      + JSON.stringify(angemeldet.daten));
  pruefe(angemeldet.daten.login === 'schreiber',
    'Der Token wird nicht als „schreiber“ angemeldet: '
      + JSON.stringify(angemeldet.daten.login));
  const standSchreiber = await ruf(gebaut, '/board/github/stand');
  pruefe(standSchreiber.daten.verbunden === true,
    'Mit Token ist der Stand nicht verbunden: '
      + JSON.stringify(standSchreiber.daten));
  pruefe(standSchreiber.daten.login === 'schreiber',
    'Der Stand nennt nicht den Login: ' + JSON.stringify(standSchreiber.daten.login));

  const mitRecht = await ruf(gebaut, '/board/data');
  pruefe(mitRecht.status === 200, 'GET /board/data antwortet ' + mitRecht.status);
  pruefe(mitRecht.daten.darf === true,
    'Mit Schreibrecht ist `darf` nicht true: ' + JSON.stringify(mitRecht.daten.darf));
  pruefe(!Object.prototype.hasOwnProperty.call(mitRecht.daten, 'darfGrund'),
    'Mit Schreibrecht steht trotzdem ein Grund da: '
      + JSON.stringify(mitRecht.daten.darfGrund));
  pruefe(mitRecht.daten.anlegen && mitRecht.daten.anlegen.darf === true,
    '`anlegen.darf` ist mit Token nicht true: '
      + JSON.stringify(mitRecht.daten.anlegen));
  pruefe(berechtigungen.includes('schreiber'),
    'Die Berechtigung wurde nicht für den Login geprüft: '
      + JSON.stringify(berechtigungen));
  console.log('ok Token write: stand.login schreiber, darf true, anlegen true');

  // 4. Mit Token ohne Schreibrecht: die Person ist bekannt, darf aber nicht.
  const nurLeser = await ruf(gebaut, '/board/github/token', { token: 'token-leser' });
  pruefe(nurLeser.status === 200,
    'Der zweite Token wird nicht gespeichert: ' + JSON.stringify(nurLeser.daten));
  const ohneRecht = await ruf(gebaut, '/board/data');
  pruefe(ohneRecht.status === 200, 'GET /board/data antwortet ' + ohneRecht.status);
  pruefe(ohneRecht.daten.darf === false,
    'Mit read ist `darf` nicht false: ' + JSON.stringify(ohneRecht.daten.darf));
  const grundOhneRecht = String(ohneRecht.daten.darfGrund || '');
  pruefe(/kein schreibrecht/i.test(grundOhneRecht),
    'Der Grund nennt das fehlende Schreibrecht nicht: '
      + JSON.stringify(grundOhneRecht));
  pruefe(berechtigungen.includes('leser'),
    'Die Berechtigung wurde nicht für „leser“ geprüft: '
      + JSON.stringify(berechtigungen));
  const vorgang = (ohneRecht.daten.vorgaenge || [])[0];
  pruefe(vorgang && vorgang.darf && vorgang.darf.aendern === false
    && vorgang.darf.weitergeben === false,
  'Ohne Schreibrecht bietet das Vorhaben Handlungen an: '
    + JSON.stringify(vorgang && vorgang.darf));
  console.log('ok Token read: darf false, kein Schreibrecht, Handlungen gesperrt');

  // 5. Ohne Netz bleibt der gemerkte Login stehen; das Recht ist nicht prüfbar.
  await stoppeServer();
  schreibeJson(GITHUB, { token: 'token-netz', login: 'netz' });
  const standOhneNetz = await ruf(gebaut, '/board/github/stand');
  pruefe(standOhneNetz.status === 200,
    'GET /board/github/stand antwortet ' + standOhneNetz.status);
  pruefe(standOhneNetz.daten.login === 'netz',
    'Ohne Netz geht der gemerkte Login verloren: '
      + JSON.stringify(standOhneNetz.daten.login));
  pruefe(typeof standOhneNetz.daten.fehler === 'string'
    && /erreichbar|netz/i.test(standOhneNetz.daten.fehler),
  'Der Fehler nennt den Grund nicht: ' + JSON.stringify(standOhneNetz.daten.fehler));

  const ohneNetz = await ruf(gebaut, '/board/data');
  pruefe(ohneNetz.status === 200, 'GET /board/data antwortet ' + ohneNetz.status);
  pruefe(ohneNetz.daten.darf === false,
    'Ohne Netz ist `darf` nicht false: ' + JSON.stringify(ohneNetz.daten.darf));
  const grundOhneNetz = String(ohneNetz.daten.darfGrund || '');
  pruefe(/nicht prüfbar/i.test(grundOhneNetz) && /erreichbar/i.test(grundOhneNetz),
    'Der Grund nennt „nicht prüfbar“ oder das Netz nicht: '
      + JSON.stringify(grundOhneNetz));
  console.log('ok ohne Netz: stand.login netz bleibt, fehler nennt den Grund, '
    + 'darf false nicht prüfbar');

  // 6. Token löschen: wieder falsch, mit dem Grund „kein Token“.
  const geloescht = await ruf(gebaut, '/board/github/token', { loeschen: true });
  pruefe(geloescht.status === 200,
    'POST /board/github/token zum Löschen antwortet ' + geloescht.status);
  const wiederOhne = await ruf(gebaut, '/board/data');
  pruefe(wiederOhne.status === 200, 'GET /board/data antwortet ' + wiederOhne.status);
  pruefe(wiederOhne.daten.darf === false,
    'Nach dem Löschen ist `darf` nicht false: '
      + JSON.stringify(wiederOhne.daten.darf));
  pruefe(/token/i.test(String(wiederOhne.daten.darfGrund || '')),
    'Nach dem Löschen nennt der Grund den Token nicht: '
      + JSON.stringify(wiederOhne.daten.darfGrund));
  console.log('ok Token gelöscht: wieder falsch mit Grund');

  console.log('ok Recht: lokal ja, Remote ohne Token nein mit Grund, Token write ja, '
    + 'read nein, anlegen');
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
