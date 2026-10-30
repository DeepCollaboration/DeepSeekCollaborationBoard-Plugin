/**
 * Prüfung Schritt 36 — Der Katalog bleibt sauber.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt36`, daneben ein
 * eigenes `DSH_HOME`. Das Hauptboard führt fünf kuratierte Stationen:
 *
 *   - `station-a`, `station-b` und `station-c` sind öffentlich,
 *   - `station-geheim` steht in `$DSH_HOME/board/sichtbarkeit.json`
 *     ausdrücklich als privat,
 *   - `station-gh-privat` ist lokal öffentlich, aber der nachgebildete
 *     GitHub-Server meldet sein Repository als privat.
 *
 * Die Suche findet `fremd/station-d` und `fremd/vorhaben-x` (beide
 * öffentlich). Später liefert sie zusätzlich `geheim/station-p` mit
 * `private: true` — ein Fund, der inzwischen privat ist. `fremd/vorhaben-x`
 * prüft die Gegenrichtung: Die Namensregel `vorhaben-…` trifft nur lokale
 * Ordner, ein fremdes öffentliches Repository bleibt im Katalog.
 *
 * Im Katalog stehen außerdem zwei lokale Vorhaben, die nach ihrem Namen
 * privat sind: `vorhaben-kunde-x` (lesbar, Name „Kunde X (intern)“) und das
 * fehlende `vorhaben-nicht-da`. Beide dürfen weder erscheinen noch als Lücke
 * genannt werden; keines hat einen Eintrag in `sichtbarkeit.json`.
 *
 * Der Server auf 127.0.0.1 zeichnet jede Anfrage auf; ein echtes Netz wird
 * nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. Kein privates Repository erscheint in `eintraege`, `kuratiert`,
 *      `gefunden`, `luecken` oder im Hinweis; sein Name steht auch nicht im
 *      Zwischenspeicher. Für das lokal private wird GitHub gar nicht gefragt.
 *      Die Namensregel wirkt für lokale Ordner; `fremd/vorhaben-x` bleibt.
 *   2. Ein inzwischen privater Suchtreffer verschwindet, ohne genannt zu
 *      werden.
 *   3. `gesperrt` wirkt nach dem Neuladen (auch aus dem Zwischenspeicher) auf
 *      beide Schreibweisen `owner/repo` und Namen; die übrigen Einträge
 *      bleiben gleich, `katalog.json` bleibt unverändert, und der direkte
 *      Stationsaufruf antwortet weiter.
 *   4. `gesperrt` ist freiwillig: fehlt die Liste, ist sie leer; geschrieben
 *      wird sie mit.
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
const ABLAGE = join(WURZEL, 'markt36');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const SICHTBARKEIT = join(HOME, 'board', 'sichtbarkeit.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const KATALOG_DATEI = join(BOARD, 'katalog.json');
const CACHE = join(HOME, 'board', 'katalog-cache.json');
const STATION_A = join(ABLAGE, 'station-a');
const STATION_B = join(ABLAGE, 'station-b');
const STATION_C = join(ABLAGE, 'station-c');
const STATION_GEHEIM = join(ABLAGE, 'station-geheim');
const STATION_GH_PRIVAT = join(ABLAGE, 'station-gh-privat');
// Das Vorhaben gilt nach seinem Namen als privat; es steht ohne Eintrag in
// `sichtbarkeit.json` im Katalog und darf dort nicht auftauchen.
const VORHABEN_KUNDE = join(ABLAGE, 'vorhaben-kunde-x');
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

/** Ein Repository als lokaler Ordner mit Ankerdatei und Git-Remote. */
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

/** Eine Station als Repository; der Name steht in `station.json`. */
function stationAnlegen(ordner, id, name, remote) {
  schreibeJson(join(ordner, 'station.json'), {
    format: 2,
    id,
    name,
    beschreibung: 'Beschreibung von ' + name + '.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: name },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: [id],
  });
  writeFileSync(join(ordner, 'README.md'), '# ' + name + '\n', 'utf8');
  repoAnlegen(ordner, 'station.json', remote);
}

/** Ein Vorhaben als lokales Repository; der Name steht in `vorhaben.json`. */
function vorhabenAnlegen(ordner, id, name) {
  schreibeJson(join(ordner, 'vorhaben.json'), {
    format: 2,
    id,
    name,
    workflow: { repo: 'workflow-standard', fassung: 'v1' },
    position: 'start',
    verantwortliche: { start: ['p1'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#123456',
  });
  writeFileSync(join(ordner, 'README.md'), '# ' + name + '\n', 'utf8');
  repoAnlegen(ordner, 'vorhaben.json', '');
}

/** Der Eintrag mit diesem Namen; fehlt er oder ist er doppelt, ist das ein Fehler. */
function eintrag(daten, name) {
  const treffer = daten.eintraege.filter((eintragRoh) => eintragRoh
    && eintragRoh.name === name);
  pruefe(treffer.length === 1, 'Der Eintrag „' + name + '“ steht nicht genau '
    + 'einmal im Katalog: ' + JSON.stringify(treffer));
  return treffer[0];
}

/** Die Werte, die einen öffentlichen Eintrag ausmachen, für den Vergleich. */
function pruefwert(eintragRoh) {
  const felder = [
    'art', 'herkunft', 'name', 'host', 'fassung', 'beschreibung', 'tags',
    'repo', 'remote', 'adresse', 'sterne', 'fragen', 'beitraege', 'beispiele',
    'geprueft', 'verwendet',
  ];
  const wert = {};
  for (const feld of felder) {
    if (eintragRoh && Object.prototype.hasOwnProperty.call(eintragRoh, feld)) {
      wert[feld] = eintragRoh[feld];
    }
  }
  return JSON.stringify(wert);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let treffer = [];
const anfragen = [];

function repoDaten(owner, name, sterne, privat = false, beschreibung = '') {
  return {
    name,
    full_name: owner + '/' + name,
    private: Boolean(privat),
    stargazers_count: sterne,
    forks_count: 0,
    open_issues_count: 0,
    description: beschreibung || ('Prüf-Repository ' + name),
    topics: [THEMA],
    default_branch: 'main',
    html_url: 'https://github.com/' + owner + '/' + name,
    pushed_at: null,
    license: null,
    archived: false,
    owner: { login: owner },
  };
}

const REPOS = new Map([
  ['eigen/station-a', repoDaten('eigen', 'station-a', 7)],
  ['eigen/station-b', repoDaten('eigen', 'station-b', 3)],
  ['eigen/station-c', repoDaten('eigen', 'station-c', 2)],
  ['eigen/geheim', repoDaten('eigen', 'geheim', 1)],
  ['eigen/station-gh-privat', repoDaten('eigen', 'station-gh-privat', 9, true)],
]);

function zaehle(pfad) {
  return anfragen.filter((eintragRoh) => eintragRoh.pfad === pfad).length;
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
      anfragen.push({ methode: req.method, pfad });
      const teile = pfad.split('/').filter(Boolean);

      if (req.method === 'GET' && pfad === '/search/repositories') {
        senden(200, {
          total_count: treffer.length,
          incomplete_results: false,
          items: treffer,
        });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length >= 3) {
        const eintragRoh = REPOS.get((teile[1] + '/' + teile[2]).toLowerCase());
        if (!eintragRoh) {
          senden(404, { message: 'Not Found' });
          return;
        }
        if (teile.length === 3) {
          senden(200, eintragRoh);
          return;
        }
        if (teile[3] === 'issues' || teile[3] === 'pulls'
          || teile[3] === 'releases') {
          senden(200, []);
          return;
        }
        senden(404, { message: 'Not Found' });
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

const PRIVATE_NAMEN = [
  'Geheime Station', 'station-geheim', 'eigen/geheim',
  'Nur auf GitHub privat', 'station-gh-privat',
];

// Lokale Vorhaben, die nach der Namensregel privat sind. Keines von beiden
// darf im öffentlichen Katalog oder in einer Lücke stehen.
const LOKALE_VORHABEN = [
  'Kunde X (intern)', 'vorhaben-kunde-x', 'vorhaben-nicht-da',
];

function keinePrivatenNamen(text, was) {
  for (const verboten of PRIVATE_NAMEN) {
    pruefe(!String(text).includes(verboten),
      was + ' nennt „' + verboten + '“: ' + String(text));
  }
}

function keineLokalenVorhaben(text, was) {
  for (const verboten of LOKALE_VORHABEN) {
    pruefe(!String(text).includes(verboten),
      was + ' nennt „' + verboten + '“: ' + String(text));
  }
}

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  stationAnlegen(STATION_A, 'station-a', 'Station A',
    'https://github.com/eigen/station-a.git');
  stationAnlegen(STATION_B, 'station-b', 'Station B',
    'https://github.com/eigen/station-b.git');
  stationAnlegen(STATION_C, 'station-c', 'Station C',
    'https://github.com/eigen/station-c.git');
  // Die Karte im Home sagt ausdrücklich: privat. GitHub wird dafür nicht
  // gefragt.
  stationAnlegen(STATION_GEHEIM, 'station-geheim', 'Geheime Station',
    'https://github.com/eigen/geheim.git');
  // Lokal öffentlich; erst die GitHub-Metadaten sagen privat.
  stationAnlegen(STATION_GH_PRIVAT, 'station-gh-privat', 'Nur auf GitHub privat',
    'https://github.com/eigen/station-gh-privat.git');
  // Dieses Vorhaben heißt `vorhaben-…` und ist damit nach der Namensregel
  // privat. Es hat keinen GitHub-Remote und keinen Eintrag in
  // `sichtbarkeit.json`; es darf im öffentlichen Katalog nicht erscheinen.
  vorhabenAnlegen(VORHABEN_KUNDE, 'kunde-x', 'Kunde X (intern)');

  schreibeJson(SICHTBARKEIT, {
    [STATION_A]: 'öffentlich',
    [STATION_B]: 'öffentlich',
    [STATION_C]: 'öffentlich',
    [STATION_GEHEIM]: 'privat',
    [STATION_GH_PRIVAT]: 'öffentlich',
  });

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [
      { repo: STATION_A },
      { repo: STATION_B },
      { repo: STATION_C },
      { repo: STATION_GEHEIM },
      { repo: STATION_GH_PRIVAT },
    ],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(KATALOG_DATEI, {
    format: 2,
    stationen: [
      { repo: 'station-a', besonderheit: 'Öffentlich.' },
      { repo: 'station-b', besonderheit: 'Öffentlich.' },
      { repo: 'station-c', besonderheit: 'Wird gesperrt.' },
      { repo: 'station-geheim', besonderheit: 'Privat laut Karte.' },
      { repo: 'station-gh-privat', besonderheit: 'Privat laut GitHub.' },
    ],
    workflows: [],
    vorhaben: [
      { repo: 'vorhaben-kunde-x' },
      { repo: 'vorhaben-nicht-da' },
    ],
    geprueft: [],
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

  treffer = [
    repoDaten('fremd', 'station-d', 5, false, 'Die öffentliche Fundstation.'),
    // Ein fremdes, öffentliches Repository mit `vorhaben-` im Namen. Die
    // Namensregel gilt nur für lokale Ordner; dieser Eintrag bleibt.
    repoDaten('fremd', 'vorhaben-x', 6, false, 'Ein öffentliches Vorhaben.'),
  ];

  process.env.DSH_HOME = HOME;
  process.env.DSH_BOARD_CACHE_TTL = '600000';
  process.env.DSH_GITHUB_API = await starteServer();

  const formate = await import(
    pathToFileURL(join(PRODUKT, 'formate', 'katalog.js')).href);
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');

  // 0. `gesperrt` ist freiwillig und wird mitgeschrieben.
  const ohneSperre = formate.liesKatalog(BOARD);
  pruefe(Array.isArray(ohneSperre.gesperrt) && ohneSperre.gesperrt.length === 0,
    'Die fehlende Sperrliste ist nicht leer: '
      + JSON.stringify(ohneSperre.gesperrt));
  const probe = join(ABLAGE, 'katalog-probe');
  mkdirSync(probe, { recursive: true });
  formate.schreibeKatalog(probe, {
    gesperrt: [{ repo: 'fremd/gesperrt' }],
  });
  const probeRoh = liesJson(join(probe, 'katalog.json'));
  pruefe(Array.isArray(probeRoh.gesperrt) && probeRoh.gesperrt.length === 1
    && probeRoh.gesperrt[0].repo === 'fremd/gesperrt',
  'Die Sperrliste wird nicht geschrieben: ' + JSON.stringify(probeRoh.gesperrt));
  pruefe(formate.liesKatalog(probe).gesperrt.length === 1,
    'Die geschriebene Sperrliste wird nicht wieder gelesen');
  rmSync(probe, { recursive: true, force: true });
  console.log('ok Sperrliste: fehlt sie, ist sie leer; geschrieben wird sie mit');

  // 1. Private Einträge erscheinen nicht und werden nirgends genannt.
  const erst = await ruf(gebaut, '/board/katalog');
  pruefe(erst.status === 200, 'GET /board/katalog antwortet ' + erst.status
    + ': ' + JSON.stringify(erst.daten));
  const daten = erst.daten;
  pruefe(daten.hinweis === '', 'Der Katalog meldet ohne Grund einen Hinweis: '
    + JSON.stringify(daten.hinweis));
  pruefe(Array.isArray(daten.luecken) && daten.luecken.length === 0,
    'Der Katalog meldet Lücken, obwohl Private still fallen sollen: '
      + JSON.stringify(daten.luecken));
  keineLokalenVorhaben(JSON.stringify(daten.luecken),
    'Die Lückenliste');
  pruefe(JSON.stringify(daten.eintraege.map((e) => e.name))
    === JSON.stringify(['Station A', 'Station B', 'Station C', 'station-d',
      'vorhaben-x']),
  'Der Katalog enthält nicht genau die öffentlichen Einträge: '
    + JSON.stringify(daten.eintraege.map((e) => e.name)));
  pruefe(daten.kuratiert.length === 3 && daten.gefunden.length === 2,
    '`kuratiert` und `gefunden` sind nicht sauber getrennt: '
      + JSON.stringify({
        kuratiert: daten.kuratiert.map((e) => e.name),
        gefunden: daten.gefunden.map((e) => e.name),
      }));
  keinePrivatenNamen(JSON.stringify(daten), 'Der öffentliche Katalog');
  keineLokalenVorhaben(JSON.stringify(daten), 'Der öffentliche Katalog');

  const a = eintrag(daten, 'Station A');
  const b = eintrag(daten, 'Station B');
  const c = eintrag(daten, 'Station C');
  const fund = eintrag(daten, 'station-d');
  const fundVorhaben = eintrag(daten, 'vorhaben-x');
  pruefe(a.sterne === 7 && b.sterne === 3 && c.sterne === 2,
    'Die Sterne der öffentlichen Einträge fehlen: '
      + JSON.stringify({ a: a.sterne, b: b.sterne, c: c.sterne }));
  pruefe(fund.repo === 'fremd/station-d' && fund.sterne === 5,
    'Der gefundene Eintrag ist unvollständig: ' + JSON.stringify(fund));
  // Ein fremdes, öffentliches Repository mit `vorhaben-` im Namen bleibt:
  // Die Namensregel trifft nur lokale Ordner.
  pruefe(fundVorhaben.repo === 'fremd/vorhaben-x'
    && fundVorhaben.herkunft === 'gefunden' && fundVorhaben.sterne === 6,
  'Das öffentliche fremde Vorhaben fällt der Namensregel zum Opfer: '
    + JSON.stringify(fundVorhaben));

  // Die lokal private Station wird gar nicht gelesen: kein GitHub-Aufruf.
  pruefe(zaehle('/repos/eigen/geheim') === 0,
    'Für die lokal private Station wurde GitHub gefragt');
  // Die auf GitHub private Station wird gefragt, aber nicht weiter verfolgt.
  pruefe(zaehle('/repos/eigen/station-gh-privat') === 1,
    'Die GitHub-Metadaten der privat gemeldeten Station wurden nicht gelesen: '
      + zaehle('/repos/eigen/station-gh-privat'));
  pruefe(zaehle('/repos/eigen/station-gh-privat/issues') === 0
    && zaehle('/repos/eigen/station-gh-privat/pulls') === 0
    && zaehle('/repos/eigen/station-gh-privat/releases') === 0,
  'Für die private Station wurden Zahlen oder Freigaben gefragt');
  pruefe(readFileSync(KATALOG_DATEI, 'utf8') === katalogVorher,
    'katalog.json wurde durch das Sammeln verändert');
  pruefe(liesJson(KATALOG_DATEI).stationen.length === 5,
    'Das private Repository wurde aus katalog.json gelöscht');
  pruefe(liesJson(KATALOG_DATEI).vorhaben.length === 2,
    'Die privaten Vorhaben wurden aus katalog.json gelöscht');
  const cacheText = readFileSync(CACHE, 'utf8');
  keinePrivatenNamen(cacheText, 'Der Katalog-Zwischenspeicher');
  keineLokalenVorhaben(cacheText, 'Der Katalog-Zwischenspeicher');
  console.log('ok privat: Karte und GitHub, nicht in Listen, Lücken, Hinweis '
    + 'oder Zwischenspeicher');

  const vorherA = pruefwert(a);
  const vorherB = pruefwert(b);
  const vorherFund = pruefwert(fundVorhaben);

  // 2. Ein Fund, der inzwischen privat ist, verschwindet.
  treffer = [
    repoDaten('fremd', 'station-d', 5, false, 'Die öffentliche Fundstation.'),
    repoDaten('fremd', 'vorhaben-x', 6, false, 'Ein öffentliches Vorhaben.'),
    repoDaten('geheim', 'station-p', 4, true, 'Privatfund.'),
  ];
  const zweit = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(zweit.status === 200, 'Der frische Katalog antwortet ' + zweit.status);
  pruefe(zweit.daten.eintraege.length === 5,
    'Der inzwischen private Fund bleibt im Katalog: '
      + JSON.stringify(zweit.daten.eintraege.map((e) => e.name)));
  pruefe(zweit.daten.eintraege.some((e) => e.name === 'vorhaben-x'),
    'Das öffentliche fremde Vorhaben verschwindet beim frischen Lauf: '
      + JSON.stringify(zweit.daten.eintraege.map((e) => e.name)));
  const zweitText = JSON.stringify(zweit.daten);
  for (const verboten of ['station-p', 'Privatfund', 'geheim/station-p']) {
    pruefe(!zweitText.includes(verboten),
      'Der öffentliche Katalog nennt den privaten Fund „' + verboten + '“: '
        + zweitText);
  }
  keineLokalenVorhaben(zweitText, 'Der frische Katalog');
  keinePrivatenNamen(readFileSync(CACHE, 'utf8'),
    'Der Zwischenspeicher nach dem privaten Fund');
  keineLokalenVorhaben(readFileSync(CACHE, 'utf8'),
    'Der Zwischenspeicher nach dem privaten Fund');
  console.log('ok Fund: inzwischen privat, also nicht im Katalog');

  // 3. Die Sperrliste wirkt nach dem Neuladen; `katalog.json` bleibt.
  const katalogJetzt = liesJson(KATALOG_DATEI);
  katalogJetzt.gesperrt = [
    { repo: 'station-c' },
    { repo: 'fremd/station-d' },
  ];
  schreibeJson(KATALOG_DATEI, katalogJetzt);
  const katalogNachSperre = readFileSync(KATALOG_DATEI, 'utf8');
  const mitSperre = formate.liesKatalog(BOARD);
  pruefe(mitSperre.gesperrt.length === 2
    && mitSperre.gesperrt.some((e) => e.repo === 'station-c')
    && mitSperre.gesperrt.some((e) => e.repo === 'fremd/station-d'),
  'Die Sperrliste wird nicht gelesen: ' + JSON.stringify(mitSperre.gesperrt));

  // Der Zwischenspeicher ist noch gültig: die Sperrliste muss trotzdem gelten.
  const anfragenVor = anfragen.length;
  const dritt = await ruf(gebaut, '/board/katalog');
  pruefe(dritt.status === 200, 'Der Katalog nach der Sperre antwortet '
    + dritt.status + ': ' + JSON.stringify(dritt.daten));
  pruefe(anfragen.length === anfragenVor,
    'Der Katalog aus dem Zwischenspeicher hat den Server gefragt: '
      + JSON.stringify(anfragen.slice(anfragenVor)));
  const nach = dritt.daten;
  pruefe(nach.eintraege.length === 3,
    'Die gesperrten Einträge sind nicht verschwunden: '
      + JSON.stringify(nach.eintraege.map((e) => e.name)));
  pruefe(JSON.stringify(nach.eintraege.map((e) => e.name))
    === JSON.stringify(['Station A', 'Station B', 'vorhaben-x']),
  'Es blieben nicht genau die öffentlichen Einträge: '
    + JSON.stringify(nach.eintraege.map((e) => e.name)));
  pruefe(nach.kuratiert.length === 2 && nach.gefunden.length === 1,
    'Die Sperre wirkt nicht auf alle drei Listen: '
      + JSON.stringify({
        kuratiert: nach.kuratiert.map((e) => e.name),
        gefunden: nach.gefunden.map((e) => e.name),
      }));
  pruefe(Array.isArray(nach.luecken) && nach.luecken.length === 0,
    'Ein gesperrter Eintrag erscheint als Lücke: '
      + JSON.stringify(nach.luecken));
  keineLokalenVorhaben(JSON.stringify(nach.luecken), 'Die Lückenliste nach der Sperre');
  const nachText = JSON.stringify(nach);
  for (const verboten of ['station-c', 'Station C', 'station-d']) {
    pruefe(!nachText.includes(verboten),
      'Ein gesperrter Eintrag wird noch genannt („' + verboten + '“): '
        + nachText);
  }
  keinePrivatenNamen(nachText, 'Der Katalog nach der Sperre');
  keineLokalenVorhaben(nachText, 'Der Katalog nach der Sperre');
  // Die öffentliche Liste bleibt sonst unverändert.
  pruefe(pruefwert(eintrag(nach, 'Station A')) === vorherA,
    'Station A hat sich durch die Sperre geändert: '
      + pruefwert(eintrag(nach, 'Station A')));
  pruefe(pruefwert(eintrag(nach, 'Station B')) === vorherB,
    'Station B hat sich durch die Sperre geändert: '
      + pruefwert(eintrag(nach, 'Station B')));
  pruefe(pruefwert(eintrag(nach, 'vorhaben-x')) === vorherFund,
    'Das öffentliche fremde Vorhaben hat sich durch die Sperre geändert: '
      + pruefwert(eintrag(nach, 'vorhaben-x')));
  pruefe(readFileSync(KATALOG_DATEI, 'utf8') === katalogNachSperre,
    'katalog.json wurde durch die Sperre verändert');
  pruefe(liesJson(KATALOG_DATEI).stationen.length === 5,
    'Die Sperre hat Einträge aus katalog.json gelöscht');
  pruefe(liesJson(KATALOG_DATEI).vorhaben.length === 2,
    'Die Sperre hat Vorhaben aus katalog.json gelöscht');

  // Der frische Weg überspringt die gesperrte Station ganz: keine Anfrage.
  const cVorher = zaehle('/repos/eigen/station-c');
  const frisch = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(frisch.status === 200, 'Der frische Katalog nach der Sperre antwortet '
    + frisch.status);
  pruefe(zaehle('/repos/eigen/station-c') === cVorher,
    'Die gesperrte Station wurde bei GitHub gefragt');
  pruefe(zaehle('/repos/eigen/geheim') === 0,
    'Für die lokal private Station wurde GitHub gefragt');
  pruefe(frisch.daten.eintraege.length === 3,
    'Der frische Weg bringt gesperrte Einträge zurück: '
      + JSON.stringify(frisch.daten.eintraege.map((e) => e.name)));
  pruefe(frisch.daten.eintraege.some((e) => e.name === 'vorhaben-x'),
    'Der frische Weg verliert das öffentliche fremde Vorhaben');
  pruefe(!JSON.stringify(frisch.daten).includes('station-c'),
    'Der frische Weg nennt den gesperrten Namen');
  keineLokalenVorhaben(JSON.stringify(frisch.daten),
    'Der frische Katalog nach der Sperre');

  // Der direkte Weg bleibt lesbar.
  const direkt = await ruf(gebaut, '/board/station?station=station-c');
  pruefe(direkt.status === 200, 'Der direkte Stationsaufruf antwortet '
    + direkt.status + ': ' + JSON.stringify(direkt.daten));
  pruefe(direkt.daten && direkt.daten.name === 'Station C',
    'Der direkte Stationsaufruf liefert nicht die Station: '
      + JSON.stringify(direkt.daten));
  console.log('ok Sperre: aus allen Listen weg, katalog.json unverändert, '
    + 'direkter Weg bleibt');

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
console.log('ok Katalog: privat nicht genannt, gesperrt weg, Verweis bleibt');
