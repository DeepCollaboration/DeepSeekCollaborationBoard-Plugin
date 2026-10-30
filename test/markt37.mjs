/**
 * Prüfung Schritt 37 — Das Vertrauensbild.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt37`, daneben ein
 * eigenes `DSH_HOME`. Das Hauptboard führt eine kuratierte Station
 * (`station-a`) mit zwei Beispielen im Ordner `beispiele/`. Ein
 * nachgebildeter GitHub-Server auf `127.0.0.1` liefert 12 Sterne, die
 * Freigabe `v2`, 2 offene Fragen und 1 offenen Pull Request. Ein echtes Netz
 * wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. `/board/katalog` trägt die Zahlen aus Schritt 35 am Eintrag:
 *      Sterne, Beispiele, Fragen, Beiträge, Freigaben und die Prüfung.
 *   2. `/board/station` nennt dieselben fünf Felder und den Verweis; die
 *      Beispiele stehen an der Station.
 *   3. Ohne Server gilt der letzte Stand mit einem Hinweis — an der Station
 *      und am Katalogeintrag; `katalog.json` bleibt unverändert.
 *   4. `client.js` zeigt die Bezeichnungen und die Verweise (Codeprüfung).
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt37');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const KATALOG_DATEI = join(BOARD, 'katalog.json');
const STATION = join(ABLAGE, 'station-a');
const THEMA = 'dsh-board-station';
const ADRESSE = 'https://github.com/eigen/station-a';

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

/** Ein Repository als lokaler Ordner mit Ankerdatei, Remote und Tag. */
function repoAnlegen(ordner, datei, remote) {
  mkdirSync(ordner, { recursive: true });
  git(ordner, ['init', '-q', '-b', 'main']);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung ' + datei,
  ]);
  git(ordner, ['tag', 'v1']);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;

function repoDaten(sterne) {
  return {
    name: 'station-a',
    full_name: 'eigen/station-a',
    private: false,
    stargazers_count: sterne,
    forks_count: 0,
    open_issues_count: 99,
    description: 'Die Station mit GitHub.',
    topics: [THEMA],
    default_branch: 'main',
    html_url: ADRESSE,
    pushed_at: null,
    license: null,
    archived: false,
    owner: { login: 'eigen' },
  };
}

function frage(nummer) {
  return {
    number: nummer,
    title: 'Frage ' + nummer,
    state: 'open',
    user: { login: 'p1' },
    html_url: ADRESSE + '/issues/' + nummer,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  };
}

function starteServer(port = 0) {
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

      if (req.method === 'GET' && pfad === '/search/repositories') {
        senden(200, { total_count: 0, incomplete_results: false, items: [] });
        return;
      }
      if (req.method === 'GET' && pfad === '/repos/eigen/station-a') {
        senden(200, repoDaten(12));
        return;
      }
      if (req.method === 'GET' && pfad === '/repos/eigen/station-a/releases') {
        senden(200, [{
          tag_name: 'v2',
          name: 'Fassung 2',
          published_at: '2026-10-10T00:00:00Z',
          prerelease: false,
        }]);
        return;
      }
      if (req.method === 'GET' && pfad === '/repos/eigen/station-a/issues') {
        senden(200, [frage(1), frage(2)]);
        return;
      }
      if (req.method === 'GET' && pfad === '/repos/eigen/station-a/pulls') {
        senden(200, [{
          number: 7,
          title: 'Beitrag 7',
          state: 'open',
          user: { login: 'p1' },
          html_url: ADRESSE + '/pull/7',
          created_at: '2026-10-03T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
          merged_at: null,
          head: { ref: 'beitrag' },
          base: { ref: 'main' },
        }]);
        return;
      }
      senden(404, { message: 'Not Found' });
    });
    s.on('error', abgelehnt);
    s.listen(port, '127.0.0.1', () => {
      server = s;
      erfuellt('http://127.0.0.1:' + s.address().port);
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

function anfrage(pfad) {
  return {
    method: 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() {},
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

async function ruf(gebaut, pfad) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  // Die Station: zwei Beispiele im Ordner, ein GitHub-Remote, ein Tag für die
  // Fassung im Repository.
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'station-a',
    name: 'Station A',
    beschreibung: 'Die Station mit GitHub.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'A' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['a'],
  });
  mkdirSync(join(STATION, 'beispiele'), { recursive: true });
  writeFileSync(join(STATION, 'beispiele', 'lauf.md'), '# Lauf\n', 'utf8');
  writeFileSync(join(STATION, 'beispiele', 'notiz.md'), '# Notiz\n', 'utf8');
  writeFileSync(join(STATION, 'README.md'), '# Station A\n', 'utf8');
  repoAnlegen(STATION, 'station.json', ADRESSE + '.git');

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [{ repo: 'station-a' }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(KATALOG_DATEI, {
    format: 2,
    stationen: [{ repo: 'station-a', besonderheit: 'Mit GitHub.' }],
    workflows: [],
    vorhaben: [],
    geprueft: [
      { repo: 'eigen/station-a', von: 'Thomas Heinrich', am: '2026-10-20' },
    ],
  });
  const katalogVorher = readFileSync(KATALOG_DATEI, 'utf8');

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [{
      id: 'testboard',
      name: 'Testboard',
      format: 2,
      art: 'hauptboard',
      repo: BOARD,
      remote: null,
      person: 'p1',
    }],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  process.env.DSH_HOME = HOME;
  process.env.DSH_BOARD_CACHE_TTL = '600000';
  process.env.DSH_GITHUB_API = await starteServer();

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');
  pruefe(gebaut.routen.has('/board/station'), 'Die Route /board/station fehlt');

  // 0. Schon die Stationsseite merkt sich ihren Stand im Katalog-
  // Zwischenspeicher — auch wenn der Katalog noch nie geöffnet wurde.
  const erstStation = await ruf(gebaut, '/board/station?station=station-a');
  pruefe(erstStation.status === 200, 'Der erste Stationsaufruf antwortet '
    + erstStation.status + ': ' + JSON.stringify(erstStation.daten));
  const cacheNachStation = liesJson(join(HOME, 'board', 'katalog-cache.json'));
  pruefe(cacheNachStation.stationen
    && cacheNachStation.stationen[STATION]
    && cacheNachStation.stationen[STATION].sterne === 12,
  'Die Stationsseite merkt sich ihren Stand nicht: '
    + JSON.stringify(cacheNachStation.stationen));
  console.log('ok letzter Stand: die Stationsseite merkt sich ihre Zahlen');

  // 1. Der Katalog trägt die Zahlen aus Schritt 35 am Eintrag.
  const katalogAntwort = await ruf(gebaut, '/board/katalog');
  pruefe(katalogAntwort.status === 200, 'GET /board/katalog antwortet '
    + katalogAntwort.status + ': ' + JSON.stringify(katalogAntwort.daten));
  const eintraege = katalogAntwort.daten.eintraege || [];
  pruefe(eintraege.length === 1, 'Der Katalog trägt nicht genau einen Eintrag: '
    + JSON.stringify(eintraege.map((eintrag) => eintrag.name)));
  const a = eintraege[0];
  pruefe(a.sterne === 12, 'Der Katalogeintrag trägt nicht 12 Sterne: '
    + JSON.stringify(a.sterne));
  pruefe(Array.isArray(a.beispiele) && a.beispiele.length === 2,
    'Der Katalogeintrag trägt nicht die zwei Beispiele: '
      + JSON.stringify(a.beispiele));
  pruefe(a.fragen === 2, 'Der Katalogeintrag zählt nicht 2 offene Fragen: '
    + JSON.stringify(a.fragen));
  pruefe(a.beitraege === 1, 'Der Katalogeintrag zählt nicht 1 offenen Beitrag: '
    + JSON.stringify(a.beitraege));
  pruefe(Array.isArray(a.freigaben) && a.freigaben.length === 1
    && a.freigaben[0].tag === 'v2',
  'Der Katalogeintrag trägt nicht die Freigabe v2: '
    + JSON.stringify(a.freigaben));
  pruefe(a.fassung === 'v2', 'Der Katalogeintrag trägt nicht die Fassung v2: '
    + JSON.stringify(a.fassung));
  pruefe(a.geprueft && a.geprueft.von === 'Thomas Heinrich'
    && a.geprueft.am === '2026-10-20',
  'Der Katalogeintrag trägt nicht die Prüfung: ' + JSON.stringify(a.geprueft));
  console.log('ok Katalog: Sterne, Freigabe, Fragen, Beitrag, Beispiele, Prüfung');

  // 2. Die Stationsseite nennt die fünf Felder und den Verweis.
  const stationAntwort = await ruf(gebaut, '/board/station?station=station-a');
  pruefe(stationAntwort.status === 200, 'GET /board/station antwortet '
    + stationAntwort.status + ': ' + JSON.stringify(stationAntwort.daten));
  const s = stationAntwort.daten || {};
  for (const feld of ['sterne', 'freigaben', 'fragen', 'beitraege', 'beispiele']) {
    pruefe(Object.prototype.hasOwnProperty.call(s, feld),
      'Der Stationsseite fehlt das Feld „' + feld + '“: ' + JSON.stringify(s));
  }
  pruefe(Object.prototype.hasOwnProperty.call(s, 'geprueft'),
    'Der Stationsseite fehlt das Feld „geprueft“: ' + JSON.stringify(s));
  pruefe(s.sterne === 12, 'Die Stationsseite nennt nicht 12 Sterne: '
    + JSON.stringify(s.sterne));
  pruefe(Array.isArray(s.freigaben) && s.freigaben.length === 1
    && s.freigaben[0].tag === 'v2',
  'Die Stationsseite nennt nicht die Freigabe v2: ' + JSON.stringify(s.freigaben));
  pruefe(s.fragen === 2, 'Die Stationsseite zählt nicht 2 offene Fragen: '
    + JSON.stringify(s.fragen));
  pruefe(s.beitraege === 1, 'Die Stationsseite zählt nicht 1 offenen Beitrag: '
    + JSON.stringify(s.beitraege));
  pruefe(Array.isArray(s.beispiele) && s.beispiele.length === 2
    && s.beispiele.includes('lauf.md') && s.beispiele.includes('notiz.md'),
  'Die Stationsseite trägt nicht die zwei Beispiele: '
    + JSON.stringify(s.beispiele));
  pruefe(s.geprueft && s.geprueft.von === 'Thomas Heinrich',
    'Die Stationsseite trägt nicht die Prüfung: ' + JSON.stringify(s.geprueft));
  pruefe(String(s.adresse || '') === ADRESSE,
    'Die Stationsseite trägt nicht den Verweis ins Repository: '
      + JSON.stringify(s.adresse));
  pruefe(String(s.hinweis || '') === '',
    'Die Stationsseite meldet ohne Grund einen Hinweis: '
      + JSON.stringify(s.hinweis));
  console.log('ok Station: Sterne, Freigabe, Fragen, Beitrag, Beispiele, '
    + 'Prüfung und Verweis');

  // 3. Ohne Server gilt der letzte Stand, mit Hinweis.
  await stoppeServer();
  const offlineStation = await ruf(gebaut, '/board/station?station=station-a');
  pruefe(offlineStation.status === 200, 'Ohne Server antwortet die Station '
    + offlineStation.status + ': ' + JSON.stringify(offlineStation.daten));
  const os = offlineStation.daten || {};
  pruefe(os.sterne === 12, 'Ohne Server geht die letzte Sternzahl verloren: '
    + JSON.stringify(os.sterne));
  pruefe(Array.isArray(os.freigaben) && os.freigaben.length === 1
    && os.freigaben[0].tag === 'v2',
  'Ohne Server geht die letzte Freigabe verloren: ' + JSON.stringify(os.freigaben));
  pruefe(os.fragen === 2 && os.beitraege === 1,
    'Ohne Server gehen die letzten Zahlen verloren: ' + JSON.stringify({
      fragen: os.fragen, beitraege: os.beitraege,
    }));
  pruefe(Array.isArray(os.beispiele) && os.beispiele.length === 2,
    'Ohne Server gehen die Beispiele verloren: ' + JSON.stringify(os.beispiele));
  pruefe(os.geprueft && os.geprueft.von === 'Thomas Heinrich',
    'Ohne Server geht die Prüfung verloren: ' + JSON.stringify(os.geprueft));
  pruefe(String(os.hinweis || '').length > 0,
    'Ohne Server fehlt der Hinweis auf den letzten Stand');

  const offlineKatalog = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(offlineKatalog.status === 200, 'Ohne Server antwortet der Katalog '
    + offlineKatalog.status + ': ' + JSON.stringify(offlineKatalog.daten));
  const ok = (offlineKatalog.daten.eintraege || [])[0] || {};
  pruefe(ok.sterne === 12 && ok.fragen === 2 && ok.beitraege === 1,
    'Ohne Server verliert der Katalogeintrag seine Zahlen: ' + JSON.stringify({
      sterne: ok.sterne, fragen: ok.fragen, beitraege: ok.beitraege,
    }));
  pruefe(Array.isArray(ok.freigaben) && ok.freigaben.length === 1,
    'Ohne Server verliert der Katalogeintrag die Freigabe: '
      + JSON.stringify(ok.freigaben));
  pruefe(String(offlineKatalog.daten.hinweis || '').length > 0,
    'Ohne Server fehlt der Hinweis am Katalog');
  pruefe(readFileSync(KATALOG_DATEI, 'utf8') === katalogVorher,
    'katalog.json wurde durch die Prüfung verändert');
  console.log('ok ohne Netz: letzter Stand mit Hinweis an Station und Katalog');

  // 4. Der Client zeigt die Bezeichnungen und die Verweise.
  const clientText = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
  for (const wort of ['Sterne', 'Releases', 'Fragen', 'Beiträge', 'Beispiele']) {
    pruefe(clientText.includes("'" + wort + "'"),
      'client.js zeigt die Bezeichnung „' + wort + '“ nicht');
  }
  for (const pfad of ['/stargazers', '/issues', '/pulls', '/releases']) {
    pruefe(clientText.includes("'" + pfad + "'"),
      'client.js baut den Verweis „' + pfad + '“ nicht');
  }
  pruefe(clientText.includes("uebersetze('Beispiele: {0}',")
    && clientText.includes("uebersetze('Offene Fragen: {0}',"),
  'Die Katalogkarte zeigt Beispiele und offene Fragen nicht');
  console.log('ok Anzeige: Bezeichnungen und Verweise stehen in client.js');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await stoppeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  delete process.env.DSH_BOARD_CACHE_TTL;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Vertrauensbild: Station und Karte, letzter Stand');
