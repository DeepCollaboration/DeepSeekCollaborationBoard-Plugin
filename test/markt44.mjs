/**
 * Prüfung Schritt 44 — die frische Installation.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt44`. Ein leeres Zuhause
 * bekommt nur den Zwischenspeicher: das Hauptboard und eine Station, die der
 * Katalog als „gefunden“ führt. Es gibt kein Register, keine Identität und
 * keinen Token. Ein nachgebildeter GitHub-Server auf `127.0.0.1` beantwortet
 * die anonyme Suche und die Zahlen der Station; ein echtes Netz wird nicht
 * benutzt.
 *
 * Geprüft wird:
 *
 *   1. Der Start mit dem Zwischenspeicher gelingt ohne Fehler; das Register
 *      entsteht, das Hauptboard ist offen.
 *   2. `/board/data` zeigt das Hauptboard und die gefundene Station;
 *      `darf` ist falsch, `eigentuemer` leer mit Hinweis.
 *   3. `POST /board/station` ohne Token antwortet 403 und nennt den Weg über
 *      die Anmeldung; es entsteht nichts.
 *   4. Katalog, Station, Workflow und Board sind ohne Token lesbar; kein
 *      Aufruf verlangt eine Anmeldung.
 *   5. Die Seite sagt „Nur lesen“ mit Grund und bietet den Anlegeknopf nicht
 *      an (Codeprüfung in `client.js`).
 *   6. Die deutsche README nennt den Erststart: installieren, öffnen, lesen;
 *      anlegen erst mit Token.
 *
 * Die Ablage wird am Ende entfernt.
 */
import { createServer } from 'node:http';
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt44');
const HOME = join(ABLAGE, 'home');
const KOPIE = join(ABLAGE, 'produkt');
const CACHE = join(HOME, 'board', 'cache');
const HAUPT = join(CACHE, 'DeepCollaboration', 'board-hauptboard');
const WORKFLOW = join(CACHE, 'DeepCollaboration', 'workflow-gefunden');
const STATION = join(CACHE, 'fremd', 'station-gefunden');
const REGISTER = join(HOME, 'board', 'boards.json');
const TOKEN = join(HOME, 'board', 'github.json');
const STATION_ID = 'gefunden';
const STATION_REPO = 'fremd/station-gefunden';

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

/** Ein Repository mit einem Stand; optional mit Tag und GitHub-Remote. */
function festschreiben(ordner, { tag = '', remote = '' } = {}) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  if (tag) git(ordner, ['tag', tag]);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
}

/** Eine Station, ein Workflow und das Hauptboard — nur im Zwischenspeicher. */
function legeZwischenspeicher() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: STATION_ID,
    name: 'Gefundene Station',
    beschreibung: 'Eine Station, die der Katalog ohne Zutun gefunden hat.',
    host: 'fremd',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Thema festhalten.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['gefunden'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Gefundene Station\n', 'utf8');
  festschreiben(STATION, {
    tag: 'v1',
    remote: 'https://github.com/' + STATION_REPO + '.git',
  });

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'gefunden',
    titel: 'Gefundener Workflow',
    beschreibung: 'Der Workflow des Hauptboards mit der gefundenen Station.',
    autor: 'fremd',
    stationen: [{ repo: STATION_REPO, fassung: 'v1', id: STATION_ID }],
    positionen: [{
      id: STATION_ID, station: STATION_ID, x: 80, y: 60, bedingung: [],
    }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  writeFileSync(join(WORKFLOW, 'README.md'), '# Gefundener Workflow\n', 'utf8');
  festschreiben(WORKFLOW, {
    tag: 'v1',
    remote: 'https://github.com/DeepCollaboration/workflow-gefunden.git',
  });

  schreibeJson(join(HAUPT, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [
      { login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' },
      { login: 'fremd', name: 'Fremd', farbe: '#22c55e' },
    ],
    workflows: [{ repo: 'workflow-gefunden', fassung: 'v1' }],
    vorhaben: [],
    stationen: [{ repo: STATION_REPO }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(join(HAUPT, 'katalog.json'), {
    format: 2,
    stationen: [],
    workflows: [],
    vorhaben: [],
    geprueft: [],
  });
  writeFileSync(join(HAUPT, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(HAUPT, {
    remote: 'https://github.com/DeepCollaboration/board-hauptboard.git',
  });
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let serverBasis = '';
const anfragen = [];

const GEFUNDEN = {
  owner: 'fremd',
  name: 'station-gefunden',
  beschreibung: 'Eine Station, die der Katalog ohne Zutun gefunden hat.',
  sterne: 4,
};

function repoDaten() {
  const voll = GEFUNDEN.owner + '/' + GEFUNDEN.name;
  return {
    name: GEFUNDEN.name,
    full_name: voll,
    private: false,
    stargazers_count: GEFUNDEN.sterne,
    forks_count: 0,
    open_issues_count: 0,
    description: GEFUNDEN.beschreibung,
    topics: ['dsh-board-station'],
    default_branch: 'main',
    html_url: 'https://github.com/' + voll,
    pushed_at: '2026-10-28T12:00:00Z',
    license: { spdx_id: 'MIT', name: 'MIT License' },
    archived: false,
    owner: { login: GEFUNDEN.owner },
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
      for await (const stueck of req) { /* Der Körper wird nicht gebraucht. */ }
      const adresse = new URL(req.url, 'http://127.0.0.1');
      const pfad = adresse.pathname;
      const teile = pfad.split('/').filter(Boolean);
      anfragen.push({
        methode: req.method,
        pfad,
        auth: String(req.headers.authorization || ''),
      });

      if (req.method === 'GET' && pfad === '/rate_limit') {
        senden(200, {
          resources: { core: { remaining: 5000, limit: 5000, reset: 0 } },
        });
        return;
      }
      if (req.method === 'GET' && pfad === '/search/repositories') {
        const gesucht = String(adresse.searchParams.get('q') || '');
        const treffer = gesucht.includes('topic:dsh-board-station')
          ? [repoDaten()] : [];
        senden(200, { total_count: treffer.length, items: treffer });
        return;
      }
      if (teile[0] === 'repos' && teile.length >= 3) {
        const owner = decodeURIComponent(teile[1]);
        const name = decodeURIComponent(teile[2]);
        const rest = teile.slice(3).map((teil) => decodeURIComponent(teil));
        if (owner !== GEFUNDEN.owner || name !== GEFUNDEN.name) {
          senden(404, { message: 'Not Found' });
          return;
        }
        if (req.method === 'GET' && rest.length === 0) {
          senden(200, repoDaten());
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'releases') {
          senden(200, [{
            tag_name: 'v1',
            name: 'v1',
            published_at: '2026-10-28T12:00:00Z',
            prerelease: false,
          }]);
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'issues') {
          senden(200, []);
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'pulls') {
          senden(200, []);
          return;
        }
      }
      senden(404, { message: 'Not Found' });
    });
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      serverBasis = 'http://127.0.0.1:' + s.address().port;
      erfuellt(serverBasis);
    });
  });
}

function stoppeServer() {
  return new Promise((fertig) => {
    if (!server) { fertig(); return; }
    const s = server;
    server = null;
    s.close(() => fertig());
    if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
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
  let daten = null;
  try {
    daten = res.text ? JSON.parse(res.text) : null;
  } catch {
    throw new Error('Die Antwort von ' + pfad + ' ist kein JSON: '
      + res.text.slice(0, 300));
  }
  return { status: res.status, daten };
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeZwischenspeicher();

  // Das Produkt als Kopie ohne seine alte Einzelkonfiguration: nur so ist das
  // Home wirklich frisch, ohne die Ablage dieses Arbeitsbereichs zu berühren.
  cpSync(PRODUKT, KOPIE, {
    recursive: true,
    filter: (quelle) => !/(^|[\\/])(?:\.git|test)(?:[\\/]|$)/.test(quelle),
  });
  rmSync(join(KOPIE, 'board.config.json'), { force: true });

  // 1. Das Home ist frisch: kein Register, keine Identität, kein Token.
  pruefe(!existsSync(REGISTER), 'Das Home hat schon ein Register');
  pruefe(!existsSync(join(HOME, 'board', 'identitaet.json')),
    'Das Home hat schon eine Identität');
  pruefe(!existsSync(TOKEN), 'Das Home hat schon einen Token');

  const basis = await starteServer();
  process.env.DSH_GITHUB_API = basis;
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_ORG = 'DeepCollaboration';
  // Alle fehlenden Verweise würden lokal scheitern, nie im echten Netz.
  process.env.DSH_BOARD_REMOTE_BASIS = 'file://' + join(ABLAGE, 'remotes');
  process.env.DSH_BOARD_HAUPTBOARD = 'file://'
    + join(ABLAGE, 'remotes', 'DeepCollaboration', 'board-hauptboard.git');

  const modul = await import(pathToFileURL(join(KOPIE, 'index.js')).href
    + '?pruefung=44');
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  // 2. Der Start mit dem Zwischenspeicher gelingt: Register, Hauptboard offen,
  //    kein Fehler. GitHub wurde dafür nicht gefragt.
  pruefe(existsSync(REGISTER), 'Der Erststart hat kein Register angelegt');
  const register = liesJson(REGISTER);
  const haupt = (register.boards || []).find((b) => b.art === 'hauptboard');
  pruefe(register.aktiv === 'hauptboard',
    'Das Hauptboard ist nicht offen: ' + JSON.stringify(register.aktiv));
  pruefe(haupt && haupt.repo === HAUPT,
    'Das Register nennt nicht den Zwischenspeicher des Hauptboards: '
      + JSON.stringify(haupt));
  pruefe(haupt && !String(haupt.fehler || '').trim(),
    'Der Start hat einen Fehler hinterlassen: ' + JSON.stringify(haupt));
  pruefe(anfragen.length === 0,
    'Der Start hat GitHub gefragt: ' + JSON.stringify(anfragen));
  console.log('ok Start: Hauptboard aus dem Zwischenspeicher, kein Fehler');

  // 3. `/board/data` zeigt das Hauptboard und die gefundene Station. Ohne
  //    Token bleibt es beim Lesen; der Eigentümer ist leer und nennt den Weg.
  const bild = await ruf(gebaut, '/board/data');
  pruefe(bild.status === 200,
    'GET /board/data antwortet ' + bild.status + ': ' + JSON.stringify(bild.daten));
  const daten = bild.daten;
  pruefe(daten.aktiv === 'hauptboard'
    && (daten.boards || []).some((b) => b.id === 'hauptboard'
      && b.name === 'Hauptboard'),
  'Die Antwort zeigt nicht das Hauptboard: '
    + JSON.stringify((daten.boards || []).map((b) => b.id)));
  const stationen = daten.stationen || [];
  const gefunden = stationen.find((s) => s.id === STATION_ID);
  pruefe(Boolean(gefunden),
    'Die gefundene Station fehlt im Board: ' + JSON.stringify(stationen));
  pruefe(gefunden.name === 'Gefundene Station' && gefunden.repo === STATION,
    'Die gefundene Station steht nicht mit Name und Ordner da: '
      + JSON.stringify(gefunden));
  const schritte = daten.schritte || [];
  pruefe(schritte.some((s) => s.id === STATION_ID
    && s.name === 'Gefundene Station'),
  'Die gefundene Station fehlt im Workflow: ' + JSON.stringify(schritte));
  pruefe(daten.darf === false,
    'Ohne Token behauptet das Board ein Schreibrecht: '
      + JSON.stringify(daten.darf));
  pruefe(/token/i.test(String(daten.darfGrund || '')),
    'Der Grund für das fehlende Schreibrecht fehlt: '
      + JSON.stringify(daten.darfGrund));
  pruefe(/einstellungen/i.test(String(daten.darfHinweis || '')),
    'Der Weg zum Schreibrecht fehlt: ' + JSON.stringify(daten.darfHinweis));
  pruefe(daten.eigentuemer === '' && daten.eigentuemerQuelle === 'leer',
    'Der Eigentümer ist nicht leer: '
      + JSON.stringify({ eigentuemer: daten.eigentuemer,
        quelle: daten.eigentuemerQuelle }));
  pruefe(/token/i.test(String(daten.eigentuemerHinweis || '')),
    'Der Hinweis zum leeren Eigentümer fehlt: '
      + JSON.stringify(daten.eigentuemerHinweis));
  pruefe(daten.anlegen && daten.anlegen.darf === false,
    'Neue Dinge gelten ohne Token als erlaubt: '
      + JSON.stringify(daten.anlegen));
  pruefe(/token/i.test(String(daten.anlegen.hinweis || '')),
    'Der Hinweis zum Anlegen fehlt: ' + JSON.stringify(daten.anlegen.hinweis));
  pruefe((daten.luecken || []).length === 0,
    'Das frisch gelesene Board trägt Lücken: ' + JSON.stringify(daten.luecken));
  pruefe(!(daten.staende || []).some((s) => String(s.fehler || '').trim()),
    'Ein Repository meldet einen Fehler: ' + JSON.stringify(daten.staende));
  console.log('ok Board: Hauptboard und gefundene Station, darf false, '
    + 'Eigentümer leer mit Hinweis');

  // 4. Anlegen ohne Token: 403, und die Antwort nennt den Weg über die
  //    Anmeldung. Es entsteht weder eine Datei noch ein Aufruf bei GitHub.
  const boardDatei = readFileSync(join(HAUPT, 'board.json'), 'utf8');
  const anfragenVorher = anfragen.length;
  const verboten = await ruf(gebaut, '/board/station', {
    name: 'Erste Station',
    beschreibung: 'Die ohne Anmeldung nicht entstehen darf.',
  });
  pruefe(verboten.status === 403,
    'POST /board/station ohne Token antwortet ' + verboten.status + ': '
      + JSON.stringify(verboten.daten));
  const weg = [verboten.daten.error, verboten.daten.grund, verboten.daten.hinweis]
    .filter(Boolean).join(' ');
  pruefe(/token/i.test(weg),
    'Die Absage nennt den Token nicht: ' + JSON.stringify(verboten.daten));
  pruefe(/(melde dich|einstellungen|anmelden|eintragen)/i.test(weg),
    'Die Absage nennt den Weg zur Anmeldung nicht: '
      + JSON.stringify(verboten.daten));
  pruefe(anfragen.length === anfragenVorher,
    'Der Anlegeversuch hat GitHub gefragt: '
      + JSON.stringify(anfragen.slice(anfragenVorher)));
  pruefe(readFileSync(join(HAUPT, 'board.json'), 'utf8') === boardDatei,
    'Der Anlegeversuch hat board.json verändert');
  pruefe(!existsSync(join(CACHE, 'DeepCollaboration', 'station-erste-station'))
    && !existsSync(join(CACHE, 'p1', 'station-erste-station')),
  'Der Anlegeversuch hat einen Stationsordner angelegt');
  console.log('ok Anlegen: 403, Weg über den Token genannt, nichts geschrieben');

  // 5. Katalog, Station, Workflow und Board sind ohne Token lesbar. Die
  //    gefundene Station kommt aus der anonymen Suche.
  const station = await ruf(gebaut, '/board/station?station=' + STATION_ID);
  pruefe(station.status === 200,
    'GET /board/station antwortet ' + station.status + ': '
      + JSON.stringify(station.daten));
  pruefe(station.daten.name === 'Gefundene Station',
    'Die Station nennt nicht ihren Namen: ' + JSON.stringify(station.daten.name));
  pruefe(station.daten.sterne === GEFUNDEN.sterne,
    'Die Station zeigt nicht die Sterne aus GitHub: '
      + JSON.stringify(station.daten.sterne));
  pruefe(Array.isArray(station.daten.freigaben)
    && station.daten.freigaben.some((f) => f.tag === 'v1'),
  'Die Station zeigt die Freigabe v1 nicht: '
    + JSON.stringify(station.daten.freigaben));

  const katalog = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(katalog.status === 200,
    'GET /board/katalog antwortet ' + katalog.status + ': '
      + JSON.stringify(katalog.daten));
  const gefundene = katalog.daten.gefunden || [];
  pruefe(gefundene.some((e) => e.repo === STATION_REPO
    && e.herkunft === 'gefunden' && e.name === 'station-gefunden'
    && e.sterne === GEFUNDEN.sterne),
  'Der Katalog nennt die gefundene Station nicht: '
    + JSON.stringify(gefundene));
  pruefe((katalog.daten.eintraege || []).some((e) => e.repo === STATION_REPO),
    'Der Katalog führt die gefundene Station nicht in der Gesamtliste: '
      + JSON.stringify(katalog.daten.eintraege));

  const offen = await ruf(gebaut, '/board/board');
  pruefe(offen.status === 200 && offen.daten.board
    && offen.daten.board.id === 'hauptboard',
  'GET /board/board zeigt nicht das Hauptboard: '
    + JSON.stringify(offen.daten));
  pruefe(offen.daten.darf === false
    && /token/i.test(String(offen.daten.darfGrund || '')),
  'Das offene Board nennt ohne Token nicht den Grund: '
    + JSON.stringify(offen.daten));

  const workflow = await ruf(gebaut, '/board/workflow');
  pruefe(workflow.status === 200,
    'GET /board/workflow antwortet ' + workflow.status + ': '
      + JSON.stringify(workflow.daten));
  pruefe((workflow.daten.positionen || [])
    .some((p) => p.station === STATION_ID),
  'Der Workflow zeigt die gefundene Station nicht: '
    + JSON.stringify(workflow.daten.positionen));
  pruefe((workflow.daten.stationen || [])
    .some((s) => s.id === STATION_ID && s.name === 'Gefundene Station'),
  'Der Workflow nennt die gefundene Station nicht beim Namen: '
    + JSON.stringify(workflow.daten.stationen));

  pruefe(anfragen.length > anfragenVorher,
    'Die Kataloganfrage hat GitHub nicht gefragt');
  pruefe(anfragen.every((e) => e.auth === ''),
    'Ein Aufruf hat sich angemeldet: '
      + JSON.stringify(anfragen.filter((e) => e.auth)));
  console.log('ok Lesen: Katalog, Station, Workflow und Board ohne Token');

  // 6. Die Seite zeigt „Nur lesen“ samt Grund und bietet den Anlegeknopf
  //    nicht an, solange `anlegen.darf` falsch ist (Codeprüfung).
  const clientText = readFileSync(join(KOPIE, 'client.js'), 'utf8');
  pruefe(clientText.includes(
    'const nurLesen = !archiv && !!data && data.darf === false;',
  ), 'client.js liest `darf` nicht für „Nur lesen“');
  pruefe(clientText.includes("uebersetze('Nur lesen: {0}', [darfGrund"),
    'client.js zeigt den Grund zu „Nur lesen“ nicht');
  pruefe(clientText.includes('darfHinweis'),
    'client.js zeigt den Weg zu „Nur lesen“ nicht');
  pruefe(clientText.includes(
    'const stationWerkzeug = !(data && data.anlegen && data.anlegen.darf === true)',
  ), 'client.js bietet den Anlegeknopf ohne Anlege-Recht an');
  pruefe(clientText.includes("uebersetze('Station anlegen')"),
    'client.js hat keinen Anlegeknopf „Station anlegen“');
  console.log('ok Seite: „Nur lesen“ mit Grund, Knopf erst mit Anlege-Recht');

  // 7. Die deutsche README nennt den Erststart: installieren, öffnen, lesen;
  //    anlegen erst mit Token.
  const readme = readFileSync(join(PRODUKT, 'README.de.md'), 'utf8');
  for (const wort of ['## Installieren', '## Der erste Start',
    '### Frisch installiert', 'Nur lesen', 'Station anlegen',
    'Einstellungen → Board → GitHub']) {
    pruefe(readme.includes(wort),
      'Die deutsche README nennt „' + wort + '“ nicht');
  }
  pruefe(/ohne Token[\s\S]{0,200}offen/i.test(readme),
    'Die deutsche README sagt nicht, dass Lesen ohne Token offen ist');
  console.log('ok deutsche README: installieren, öffnen, lesen, anlegen mit Token');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  delete process.env.DSH_GITHUB_ORG;
  delete process.env.DSH_BOARD_REMOTE_BASIS;
  delete process.env.DSH_BOARD_HAUPTBOARD;
  await stoppeServer();
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Frisch: Hauptboard und Gefundenes lesbar, Anlegen verlangt '
  + 'Anmeldung');
