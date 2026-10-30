/**
 * Prüfung Schritt 28 — Auffinden.
 *
 * Das Hauptboard liegt mit einer kuratierten Station `station-y` in einer
 * eigenen Fläche unter `/tmp/board-scheibe1/markt28`, daneben ein eigenes
 * `DSH_HOME`. Die Station trägt den GitHub-Remote `kuratiert/station-y`.
 * `DSH_GITHUB_API` zeigt auf einen nachgebildeten GitHub-Server auf
 * 127.0.0.1 — ein echtes Netz wird nicht benutzt.
 *
 * Der Server liefert zwei neue Treffer und zwei, die nicht zählen dürfen:
 * `fremd/station-x` (neu), `FREMD/station-X` (Doppel mit anderer
 * Schreibweise), `Kuratiert/Station-Y` (schon kuratiert) und `alt/station-a`
 * (archiviert).
 *
 * Geprüft wird:
 *
 *   1. `gefunden` enthält nur `fremd/station-x`, `kuratiert` die kuratierte
 *      Station; `eintraege` enthält beide je einmal, kuratiert zuerst. Die
 *      Suche fragt `topic:dsh-board-station`, sortiert nach Sternen, 50 je
 *      Seite.
 *   2. Ein zweiter Aufruf innerhalb der Haltbarkeit fragt den Server nicht
 *      erneut; `?suche=` wirkt auf alle drei Listen.
 *   3. Nach Schließen des Servers mit vorhandenem Zwischenspeicher kommen der
 *      letzte Stand und der Hinweis „Ohne Verbindung: letzter Stand vom …“.
 *   4. `frisch=1` fragt die Suche erneut und nimmt die neuen Sterne mit.
 *   5. Ein leerer Treffer ist kein Fehler.
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
const ABLAGE = join(WURZEL, 'markt28');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const KATALOG_DATEI = join(BOARD, 'katalog.json');
const STATION_Y = join(ABLAGE, 'station-y');
const CACHE = join(HOME, 'board', 'katalog-cache.json');
const THEMA = 'dsh-board-station';

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

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let sucheAufrufe = 0;
let sucheAnfrage = null;
let sterneY = 3;
let treffer = [];
const anfragen = [];

/** Ein Repository, wie es die Suche und die Einzelabfrage liefern. */
function repoDaten(owner, name, sterne, beschreibung, archiviert = false) {
  return {
    name,
    full_name: owner + '/' + name,
    private: false,
    stargazers_count: sterne,
    forks_count: 0,
    open_issues_count: 2,
    description: beschreibung,
    topics: [THEMA],
    default_branch: 'main',
    html_url: 'https://github.com/' + owner + '/' + name,
    pushed_at: null,
    license: null,
    archived: archiviert,
    owner: { login: owner },
  };
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
      for await (const stueck of req) { /* Der Körper wird nicht gebraucht. */ }
      const adresse = new URL(req.url, 'http://127.0.0.1');
      const pfad = adresse.pathname;
      const teile = pfad.split('/').filter(Boolean);
      anfragen.push({ methode: req.method, pfad });

      if (req.method === 'GET' && pfad === '/search/repositories') {
        sucheAufrufe += 1;
        sucheAnfrage = {
          roh: req.url,
          q: adresse.searchParams.get('q'),
          sort: adresse.searchParams.get('sort'),
          perPage: adresse.searchParams.get('per_page'),
        };
        senden(200, {
          total_count: treffer.length,
          incomplete_results: false,
          items: treffer,
        });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 3) {
        if (teile[1].toLowerCase() === 'kuratiert'
          && teile[2].toLowerCase() === 'station-y') {
          senden(200, repoDaten('kuratiert', 'station-y', sterneY,
            'Die kuratierte Station.'));
          return;
        }
        senden(404, { message: 'Not Found' });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile[3] === 'releases') {
        senden(200, []);
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

/* --- Eine freie Portnummer für Start, Pause und Neustart ----------------- */

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

  // Die kuratierte Station: eigener Ordner, GitHub-Remote, Fassung.
  schreibeJson(join(STATION_Y, 'station.json'), {
    format: 2,
    id: 'station-y',
    name: 'Station Y',
    beschreibung: 'Die kuratierte Station.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Die kuratierte Station.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['kuratiert'],
  });
  writeFileSync(join(STATION_Y, 'README.md'), '# Station Y\n', 'utf8');
  git(STATION_Y, ['init', '-q', '-b', 'main']);
  git(STATION_Y, ['add', '-A']);
  git(STATION_Y, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung',
  ]);
  git(STATION_Y, ['tag', 'v1']);
  git(STATION_Y, ['remote', 'add', 'origin',
    'https://github.com/kuratiert/station-y.git']);

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [{ repo: STATION_Y }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(KATALOG_DATEI, {
    format: 2,
    stationen: [{ repo: 'station-y', besonderheit: 'Die kuratierte.' }],
    workflows: [],
    vorhaben: [],
    geprueft: [],
  });

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

  treffer = [
    repoDaten('fremd', 'station-x', 9, 'Eine fremde Station.'),
    repoDaten('FREMD', 'station-X', 4, 'Doppelt, andere Schreibweise.'),
    repoDaten('Kuratiert', 'Station-Y', 3, 'Schon kuratiert.'),
    repoDaten('alt', 'station-a', 50, 'Archiviert.', true),
  ];

  const port = await reservierePort();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
  process.env.DSH_BOARD_CACHE_TTL = '600000';
  await starteServer(port);

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');

  // 1. Die Suche liefert einen neuen Treffer; das Doppel und das Archivierte
  //    bleiben draußen, die kuratierte Station steht in beiden Listen einmal.
  const erst = await ruf(gebaut, '/board/katalog');
  pruefe(erst.status === 200, 'GET /board/katalog antwortet ' + erst.status
    + ': ' + JSON.stringify(erst.daten));
  const daten = erst.daten;
  pruefe(daten.hinweis === '', 'Der Katalog meldet ohne Grund einen Hinweis: '
    + JSON.stringify(daten.hinweis));
  pruefe(Array.isArray(daten.luecken) && daten.luecken.length === 0,
    'Der Katalog meldet Lücken: ' + JSON.stringify(daten.luecken));
  pruefe(Array.isArray(daten.kuratiert) && daten.kuratiert.length === 1,
    '`kuratiert` enthält nicht genau die kuratierte Station: '
      + JSON.stringify(daten.kuratiert));
  pruefe(daten.kuratiert[0].name === 'Station Y'
    && String(daten.kuratiert[0].repo).endsWith('/station-y'),
  '`kuratiert` nennt nicht die kuratierte Station: '
    + JSON.stringify(daten.kuratiert[0]));

  pruefe(Array.isArray(daten.gefunden) && daten.gefunden.length === 1,
    '`gefunden` enthält nicht genau einen Treffer: '
      + JSON.stringify(daten.gefunden));
  const gefunden = daten.gefunden[0];
  pruefe(gefunden.art === 'station', 'Der Treffer ist keine Station: '
    + JSON.stringify(gefunden.art));
  pruefe(gefunden.repo === 'fremd/station-x',
    'Der Treffer hat nicht den erwarteten Namen: ' + JSON.stringify(gefunden.repo));
  pruefe(gefunden.name === 'station-x',
    'Der Treffer trägt nicht den Repository-Namen: '
      + JSON.stringify(gefunden.name));
  pruefe(gefunden.herkunft === 'gefunden',
    'Dem Treffer fehlt die Herkunft: ' + JSON.stringify(gefunden.herkunft));
  pruefe(gefunden.sterne === 9,
    'Der Treffer trägt nicht die Sterne: ' + JSON.stringify(gefunden.sterne));
  pruefe(gefunden.beschreibung === 'Eine fremde Station.',
    'Der Treffer trägt nicht die Beschreibung: '
      + JSON.stringify(gefunden.beschreibung));
  pruefe(gefunden.web === 'https://github.com/fremd/station-x',
    'Dem Treffer fehlt der Web-Verweis: ' + JSON.stringify(gefunden.web));
  pruefe(gefunden.github && gefunden.github.owner === 'fremd'
    && gefunden.github.name === 'station-x',
  'Dem Treffer fehlt der GitHub-Bezug: ' + JSON.stringify(gefunden.github));
  pruefe(!daten.gefunden.some((eintrag) => String(eintrag.repo).toLowerCase()
    === 'kuratiert/station-y'),
  'Die kuratierte Station steht doppelt in `gefunden`: '
    + JSON.stringify(daten.gefunden.map((eintrag) => eintrag.repo)));
  pruefe(!daten.gefunden.some((eintrag) => String(eintrag.repo).toLowerCase()
    === 'alt/station-a'),
  'Das archivierte Repository steht in `gefunden`: '
    + JSON.stringify(daten.gefunden.map((eintrag) => eintrag.repo)));
  pruefe(daten.gefunden.filter((eintrag) => String(eintrag.repo).toLowerCase()
    === 'fremd/station-x').length === 1,
  'Das Doppel mit anderer Schreibweise wurde nicht zusammengefasst: '
    + JSON.stringify(daten.gefunden.map((eintrag) => eintrag.repo)));

  pruefe(Array.isArray(daten.eintraege) && daten.eintraege.length === 2,
    '`eintraege` enthält nicht beide Einträge: '
      + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.repo)));
  pruefe(daten.eintraege[0].herkunft !== 'gefunden',
    '`eintraege` stellt die gefundene Station nicht hinter die kuratierte: '
      + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.herkunft)));
  pruefe(daten.eintraege[1].herkunft === 'gefunden',
    '`eintraege` enthält den Treffer nicht als zweiten Eintrag: '
      + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.herkunft)));
  pruefe(JSON.stringify(daten.eintraege)
    === JSON.stringify([...daten.kuratiert, ...daten.gefunden]),
  '`eintraege` ist nicht die zusammengeführte Liste aus `kuratiert` und '
    + '`gefunden`: ' + JSON.stringify(daten.eintraege));
  pruefe(daten.eintraege.filter((eintrag) => /(^|\/)station-y$/
    .test(String(eintrag.repo))).length === 1,
  'Die kuratierte Station steht doppelt in `eintraege`: '
    + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.repo)));
  pruefe(daten.eintraege.filter((eintrag) => String(eintrag.repo).toLowerCase()
    === 'fremd/station-x').length === 1,
  'Der Treffer steht doppelt in `eintraege`: '
    + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.repo)));

  pruefe(sucheAufrufe === 1, 'Die Suche wurde nicht genau einmal gefragt: '
    + sucheAufrufe);
  pruefe(sucheAnfrage && sucheAnfrage.roh === '/search/repositories?q=topic:'
    + THEMA + '&sort=stars&per_page=50',
  'Die Suche fragt nicht die verlangte Adresse: ' + JSON.stringify(sucheAnfrage));
  pruefe(sucheAnfrage.q === 'topic:' + THEMA,
    'Die Suche fragt nicht das Thema: ' + JSON.stringify(sucheAnfrage));
  pruefe(sucheAnfrage.sort === 'stars' && sucheAnfrage.perPage === '50',
    'Die Suche sortiert oder begrenzt nicht wie verlangt: '
      + JSON.stringify(sucheAnfrage));

  const cache = liesJson(CACHE);
  pruefe(Array.isArray(cache.eintraege) && cache.eintraege.length === 2,
    'katalog-cache.json trägt nicht beide Einträge: '
      + JSON.stringify(cache.eintraege));
  pruefe(cache.gefunden && typeof cache.gefunden.am === 'string'
    && cache.gefunden.am,
  'katalog-cache.json trägt keinen Suchstand: ' + JSON.stringify(cache.gefunden));
  pruefe(Array.isArray(cache.gefunden.eintraege)
    && cache.gefunden.eintraege.length === 1
    && cache.gefunden.eintraege[0].repo === 'fremd/station-x',
  'katalog-cache.json trägt nicht den gefundenen Eintrag: '
    + JSON.stringify(cache.gefunden));
  console.log('ok gefunden: fremd/station-x neben der kuratierten, Doppel und '
    + 'Archiv zusammengefasst');

  // 2. Innerhalb der Haltbarkeit wird der Server nicht erneut gefragt; die
  //    Suche wirkt auf alle drei Listen.
  const anfragenVor = anfragen.length;
  const zweit = await ruf(gebaut, '/board/katalog');
  pruefe(zweit.status === 200, 'Der zweite Aufruf antwortet ' + zweit.status);
  pruefe(anfragen.length === anfragenVor,
    'Der zweite Aufruf innerhalb der Haltbarkeit hat den Server gefragt: '
      + JSON.stringify(anfragen.slice(anfragenVor)));
  pruefe(sucheAufrufe === 1, 'Die Suche wurde erneut gefragt: ' + sucheAufrufe);
  pruefe(zweit.daten.gefunden.length === 1
    && zweit.daten.gefunden[0].repo === 'fremd/station-x',
  'Der zweite Aufruf verliert den gefundenen Eintrag: '
    + JSON.stringify(zweit.daten.gefunden));
  pruefe(zweit.daten.kuratiert.length === 1
    && zweit.daten.kuratiert[0].name === 'Station Y',
  'Der zweite Aufruf verliert die kuratierte Station: '
    + JSON.stringify(zweit.daten.kuratiert));

  const gesucht = await ruf(gebaut, '/board/katalog?suche=station-x');
  pruefe(gesucht.status === 200, 'Die Suche im Katalog antwortet ' + gesucht.status);
  pruefe(gesucht.daten.gefunden.length === 1
    && gesucht.daten.gefunden[0].repo === 'fremd/station-x',
  'Die Suche wirkt nicht auf `gefunden`: ' + JSON.stringify(gesucht.daten));
  pruefe(gesucht.daten.kuratiert.length === 0,
    'Die Suche lässt die kuratierte Station stehen: '
      + JSON.stringify(gesucht.daten.kuratiert));
  pruefe(gesucht.daten.eintraege.length === 1
    && gesucht.daten.eintraege[0].repo === 'fremd/station-x',
  'Die Suche wirkt nicht auf `eintraege`: ' + JSON.stringify(gesucht.daten));
  pruefe(anfragen.length === anfragenVor,
    'Die Suche im Katalog hat den Server gefragt: '
      + JSON.stringify(anfragen.slice(anfragenVor)));
  console.log('ok Haltbarkeit: zweiter Aufruf ohne Server; ?suche= wirkt auf '
    + 'alle drei Listen');

  // 3. Server aus: der letzte Suchstand bleibt, der Hinweis nennt ihn.
  await stoppeServer();
  const offline = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(offline.status === 200, 'Ohne Server antwortet der Katalog '
    + offline.status + ': ' + JSON.stringify(offline.daten));
  const hinweis = String(offline.daten.hinweis || '');
  pruefe(hinweis.startsWith('Ohne Verbindung: letzter Stand vom '),
    'Ohne Server fehlt der Hinweis auf den letzten Stand: '
      + JSON.stringify(hinweis));
  pruefe(hinweis.length > 'Ohne Verbindung: letzter Stand vom '.length,
    'Der Hinweis nennt keinen Zeitpunkt: ' + JSON.stringify(hinweis));
  pruefe(offline.daten.gefunden.length === 1
    && offline.daten.gefunden[0].repo === 'fremd/station-x',
  'Ohne Server fehlt der letzte Suchstand: '
    + JSON.stringify(offline.daten.gefunden));
  pruefe(offline.daten.gefunden[0].sterne === 9,
    'Ohne Server fehlt die letzte Sternzahl des Treffers: '
      + JSON.stringify(offline.daten.gefunden[0]));
  pruefe(offline.daten.kuratiert.length === 1
    && offline.daten.kuratiert[0].name === 'Station Y',
  'Ohne Server fehlt die kuratierte Station: '
    + JSON.stringify(offline.daten.kuratiert));
  pruefe(offline.daten.kuratiert[0].sterne === 3,
    'Ohne Server fehlt die letzte Sternzahl der kuratierten Station: '
      + JSON.stringify(offline.daten.kuratiert[0]));
  pruefe(offline.daten.eintraege.length === 2,
    'Ohne Server verschwinden Einträge: '
      + JSON.stringify(offline.daten.eintraege));
  pruefe(typeof offline.daten.stand === 'string' && offline.daten.stand,
    'Ohne Server fehlt der letzte Stand: ' + JSON.stringify(offline.daten.stand));
  console.log('ok ohne Server: letzter Stand von kuratiert und gefunden, mit '
    + 'Hinweis');

  // 4. Wieder da: `frisch=1` fragt die Suche erneut und nimmt neue Zahlen mit.
  treffer = [repoDaten('fremd', 'station-x', 12, 'Frisch von der Suche.')];
  await starteServer(port);
  const sucheVorFrisch = sucheAufrufe;
  const frisch = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(frisch.status === 200, 'frisch=1 antwortet ' + frisch.status
    + ': ' + JSON.stringify(frisch.daten));
  pruefe(sucheAufrufe === sucheVorFrisch + 1,
    'frisch=1 hat die Suche nicht erneut gefragt: ' + sucheAufrufe);
  pruefe(frisch.daten.gefunden.length === 1
    && frisch.daten.gefunden[0].sterne === 12,
  'frisch=1 nimmt die geänderten Sterne nicht: '
    + JSON.stringify(frisch.daten.gefunden));
  pruefe(frisch.daten.gefunden[0].beschreibung === 'Frisch von der Suche.',
    'frisch=1 nimmt die geänderte Beschreibung nicht: '
      + JSON.stringify(frisch.daten.gefunden[0]));
  pruefe(frisch.daten.hinweis === '',
    'frisch=1 meldet trotz Verbindung einen Hinweis: '
      + JSON.stringify(frisch.daten.hinweis));
  console.log('ok frisch=1: Suche erneut gefragt, neue Sterne übernommen');

  // 5. Ein leerer Treffer ist kein Fehler.
  treffer = [];
  const leer = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(leer.status === 200, 'Der leere Treffer antwortet ' + leer.status
    + ': ' + JSON.stringify(leer.daten));
  pruefe(leer.daten.gefunden.length === 0,
    'Der leere Treffer hinterlässt einen gefundenen Eintrag: '
      + JSON.stringify(leer.daten.gefunden));
  pruefe(leer.daten.kuratiert.length === 1,
    'Der leere Treffer nimmt die kuratierte Station mit: '
      + JSON.stringify(leer.daten.kuratiert));
  pruefe(leer.daten.eintraege.length === 1,
    'Der leere Treffer hinterlässt mehr als die kuratierte Station: '
      + JSON.stringify(leer.daten.eintraege));
  pruefe(leer.daten.hinweis === '',
    'Ein leerer Treffer gilt als Fehler: ' + JSON.stringify(leer.daten.hinweis));
  const cacheLeer = liesJson(CACHE);
  pruefe(Array.isArray(cacheLeer.gefunden.eintraege)
    && cacheLeer.gefunden.eintraege.length === 0,
  'Der leere Suchstand steht nicht im Zwischenspeicher: '
    + JSON.stringify(cacheLeer.gefunden));
  console.log('ok leerer Treffer: keine Einträge, kein Hinweis');

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
console.log('ok Katalog: gefunden neben kuratiert, keine Doppel, letzter Stand');
