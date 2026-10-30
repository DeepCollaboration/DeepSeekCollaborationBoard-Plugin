/**
 * Prüfung Schritt 34 — Sterne und Katalog.
 *
 * Unter `/tmp/board-scheibe1/schritt34` entstehen das Hauptboard mit einer
 * `katalog.json` (zwei Stationen, ein Workflow, ein Vorhaben) und die vier
 * Repositorys dazu. Jedes trägt einen GitHub-Remote; ein nachgebildeter
 * GitHub-Server liefert Sterne und je eine Freigabe. Im Register steht neben
 * dem Hauptboard der Fassung 2 noch ein altes Board der Fassung 1 mit der
 * Kennung „hauptboard“ — gemeint ist das neue.
 *
 * Geprüft wird:
 *
 *   1. Der Katalog listet vier Einträge mit Sternen und Fassung; die Suche
 *      „Idee“ findet genau die Station „Idee“.
 *   2. `frisch=1` nimmt eine geänderte Sternzahl (8) mit.
 *   3. Bei abgeschaltetem Server kommt der letzte Stand aus `sterne.json`,
 *      mit dem Hinweis „GitHub nicht erreichbar; letzter Stand“.
 *   4. Eine fehlende Station steht als Lücke in der Antwort, nicht als
 *      erfundener Eintrag.
 *
 * Kein echter GitHub-Aufruf; Ablage und Home werden danach entfernt.
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
const ABLAGE = join(WURZEL, 'schritt34');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION_IDEE = join(FLAECHE, 'station-idee');
const STATION_VISION = join(FLAECHE, 'station-vision');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const VORHABEN = join(FLAECHE, 'vorhaben-board-gesamtkonzept');
const FEHLT = join(FLAECHE, 'station-fehlt');
const ORGANISATION = 'DeepCollaboration';
const HINWEIS = 'GitHub nicht erreichbar; letzter Stand';

const STERNE = new Map([
  ['station-idee', 7],
  ['station-vision', 2],
  ['workflow-standard', 5],
  ['vorhaben-board-gesamtkonzept', 4],
]);

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

/** Ein Repository mit einer Fassung `v0` und einem GitHub-Remote. */
function festschreiben(ordner, name) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  git(ordner, ['tag', 'v0']);
  git(ordner, ['remote', 'add', 'origin', 'https://github.com/'
    + ORGANISATION + '/' + name + '.git']);
}

function station(id, name, beschreibung, tags) {
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
    tags,
  };
}

/** Das Hauptboard und seine vier Dinge; die Verweise nennen feste Ordner. */
function legeFlaeche() {
  schreibeJson(join(STATION_IDEE, 'station.json'), station(
    'idee', 'Idee', 'Thema in einem Satz festhalten.', ['idee'],
  ));
  writeFileSync(join(STATION_IDEE, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION_IDEE, 'station-idee');

  schreibeJson(join(STATION_VISION, 'station.json'), station(
    'vision', 'Vision', 'Das Bild vom Produkt festhalten.', ['vision'],
  ));
  writeFileSync(join(STATION_VISION, 'README.md'), '# Vision\n', 'utf8');
  festschreiben(STATION_VISION, 'station-vision');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom ersten Satz zum Produkt.',
    autor: 'p1',
    stationen: [
      { repo: STATION_IDEE, fassung: 'v1', id: 'idee' },
      { repo: STATION_VISION, fassung: 'v1', id: 'vision' },
    ],
    positionen: [
      { id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] },
      { id: 'vision', station: 'vision', x: 250, y: 80, bedingung: [] },
    ],
    kanten: [{ von: 'idee', nach: 'vision' }],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'workflow-standard');

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'board-gesamtkonzept',
    name: 'Board Gesamtkonzept',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    farbe: '#8b5cf6',
  });
  writeFileSync(join(VORHABEN, 'README.md'), '# Vorhaben\n', 'utf8');
  festschreiben(VORHABEN, 'vorhaben-board-gesamtkonzept');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION_IDEE }, { repo: STATION_VISION }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  schreibeJson(join(BOARD, 'katalog.json'), {
    format: 2,
    stationen: [
      { repo: 'station-idee', besonderheit: 'Der Anfang: ein Satz.' },
      { repo: 'station-vision', besonderheit: 'Das Bild vom Produkt.' },
    ],
    workflows: [{ repo: 'workflow-standard' }],
    vorhaben: [{ repo: VORHABEN }],
    geprueft: [],
  });
  festschreiben(BOARD, 'board-hauptboard');
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
let anfragen = 0;

function repoDaten(name) {
  return {
    name,
    full_name: ORGANISATION + '/' + name,
    private: false,
    stargazers_count: STERNE.get(name) || 0,
    forks_count: 0,
    open_issues_count: 3,
    description: 'Prüf-Repository',
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
      anfragen += 1;
      const senden = (status, wert) => {
        const text = wert == null ? '' : JSON.stringify(wert);
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
      };
      for await (const stueck of req) { /* Körper lesen, hier ohne Inhalt */ }
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      const teile = pfad.split('/').filter(Boolean);
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 3) {
        const name = teile[2];
        if (STERNE.has(name)) { senden(200, repoDaten(name)); return; }
        senden(404, { message: 'Not Found' });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile[3] === 'releases') {
        const name = teile[2];
        if (STERNE.has(name)) {
          senden(200, [{
            tag_name: 'v1',
            name: 'Fassung 1',
            published_at: '2026-01-01T00:00:00Z',
            prerelease: false,
          }]);
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
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
}

function beendeServer() {
  return new Promise((fertig) => {
    if (!server) { fertig(); return; }
    server.close(() => { server = null; fertig(); });
  });
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeFlaeche();
  // Das alte Board der Fassung 1 steht zuerst und trägt sogar die Kennung
  // „hauptboard“. Der Katalog muss trotzdem das Board der Fassung 2 nehmen.
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: 'hauptboard',
    boards: [
      {
        id: 'hauptboard', name: 'Altes Hauptboard', format: 1, art: 'github',
        repo: join(FLAECHE, 'altes-board'), remote: null, person: 'p1',
      },
      {
        id: 'hauptboard-2', name: 'Hauptboard', format: 2, art: 'hauptboard',
        repo: BOARD, remote: null, person: 'p1', sichtbarkeit: 'öffentlich',
      },
    ],
  });
  // Das Vorhaben heißt `vorhaben-…` und gilt nach seinem Namen als privat;
  // für die Prüffläche ist es öffentlich. Die Karte gehört zur Umgebung,
  // nicht zum Einrichten durch den Menschen.
  schreibeJson(join(HOME, 'board', 'sichtbarkeit.json'), {
    [VORHABEN]: 'öffentlich',
  });

  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;

  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');

  // 1. Vier Einträge mit Sternen und Fassung aus der Freigabe.
  const erste = await ruf(gebaut, '/board/katalog');
  pruefe(erste.status === 200, 'GET /board/katalog antwortet ' + erste.status
    + ': ' + erste.text);
  const daten = erste.daten;
  pruefe(daten.hinweis === '', 'Der Katalog meldet ohne Grund einen Hinweis: '
    + JSON.stringify(daten.hinweis));
  pruefe(Array.isArray(daten.eintraege) && daten.eintraege.length === 4,
    'Der Katalog hat nicht vier Einträge: ' + JSON.stringify((daten.eintraege || [])
      .map((e) => [e.art, e.name])));
  pruefe(Array.isArray(daten.luecken) && daten.luecken.length === 0,
    'Der Katalog meldet ohne fehlendes Repository Lücken: '
      + JSON.stringify(daten.luecken));
  const idee = daten.eintraege.find((e) => e.art === 'station' && e.name === 'Idee');
  const vision = daten.eintraege.find((e) => e.art === 'station' && e.name === 'Vision');
  pruefe(idee && idee.sterne === 7, 'Die Station „Idee“ trägt nicht 7 Sterne: '
    + JSON.stringify(idee));
  pruefe(vision && vision.sterne === 2, 'Die Station „Vision“ trägt nicht 2 Sterne: '
    + JSON.stringify(vision));
  pruefe(idee.fassung === 'v1', 'Die letzte Freigabe gilt nicht als Fassung: '
    + JSON.stringify(idee.fassung));
  pruefe(idee.host === 'p1' && idee.beschreibung.includes('Satz'),
    'Host oder Beschreibung der Station fehlen: ' + JSON.stringify(idee));
  pruefe(idee.verwendet === 1, 'Die Verwendung der Station im Workflow zählt nicht: '
    + JSON.stringify(idee.verwendet));
  const workflowEintrag = daten.eintraege.find((e) => e.art === 'workflow');
  const vorhabenEintrag = daten.eintraege.find((e) => e.art === 'vorhaben');
  pruefe(workflowEintrag && workflowEintrag.fassung === 'v1'
    && workflowEintrag.sterne === 5,
  'Der Workflow-Eintrag ist unvollständig: ' + JSON.stringify(workflowEintrag));
  pruefe(vorhabenEintrag && vorhabenEintrag.fassung === 'v1'
    && vorhabenEintrag.sterne === 4,
  'Der Vorhaben-Eintrag ist unvollständig: ' + JSON.stringify(vorhabenEintrag));
  pruefe(daten.eintraege.every((e) => e.adresse
    && e.adresse.startsWith('https://github.com/')),
  'Ein Eintrag hat keinen GitHub-Verweis: '
    + JSON.stringify(daten.eintraege.map((e) => e.adresse)));

  // Die Zwischenspeicher liegen dort, wo sie hingehören.
  const sterneDatei = liesJson(join(HOME, 'board', 'sterne.json'));
  pruefe(sterneDatei[ORGANISATION + '/station-idee'].sterne === 7,
    'sterne.json trägt die Sternzahl nicht: ' + JSON.stringify(sterneDatei));
  const cacheDatei = liesJson(join(HOME, 'board', 'katalog-cache.json'));
  pruefe(Array.isArray(cacheDatei.eintraege) && cacheDatei.eintraege.length === 4
    && typeof cacheDatei.am === 'string' && cacheDatei.am,
  'katalog-cache.json ist nicht geschrieben: ' + JSON.stringify(cacheDatei));

  // 2. Suche „Idee“ findet genau eine Station.
  const gesucht = await ruf(gebaut, '/board/katalog?suche=Idee');
  pruefe(gesucht.status === 200, 'Die Suche antwortet ' + gesucht.status);
  pruefe(gesucht.daten.eintraege.length === 1
    && gesucht.daten.eintraege[0].name === 'Idee',
  'Die Suche „Idee“ findet nicht genau die Station: '
    + JSON.stringify(gesucht.daten.eintraege.map((e) => e.name)));

  // 3. `frisch=1` nimmt die geänderte Sternzahl mit.
  STERNE.set('station-idee', 8);
  const frisch = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(frisch.status === 200, 'frisch=1 antwortet ' + frisch.status);
  const ideeFrisch = frisch.daten.eintraege.find((e) => e.name === 'Idee');
  pruefe(ideeFrisch && ideeFrisch.sterne === 8,
    'frisch=1 nimmt die geänderten Sterne nicht: ' + JSON.stringify(ideeFrisch));
  pruefe(liesJson(join(HOME, 'board', 'sterne.json'))[ORGANISATION + '/station-idee']
    .sterne === 8, 'sterne.json wurde bei frisch=1 nicht fortgeschrieben');

  // 4. Server aus: der letzte Stand bleibt, mit Hinweis.
  await beendeServer();
  const offline = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(offline.status === 200, 'Ohne Server antwortet der Katalog '
    + offline.status + ': ' + offline.text);
  pruefe(offline.daten.hinweis === HINWEIS,
    'Ohne Server fehlt der Hinweis: ' + JSON.stringify(offline.daten.hinweis));
  const ideeOffline = offline.daten.eintraege.find((e) => e.name === 'Idee');
  pruefe(ideeOffline && ideeOffline.sterne === 8,
    'Ohne Server fehlt der letzte Sternstand: ' + JSON.stringify(ideeOffline));
  pruefe(ideeOffline && ideeOffline.fassung === 'v1',
    'Ohne Server fällt die letzte Freigabe weg: ' + JSON.stringify(ideeOffline));
  pruefe(offline.daten.eintraege.length === 4,
    'Ohne Server verschwinden Einträge: ' + offline.daten.eintraege.length);
  pruefe(typeof offline.daten.stand === 'string' && offline.daten.stand,
    'Ohne Server fehlt der letzte Stand: ' + JSON.stringify(offline.daten.stand));

  // 5. Eine fehlende Station wird als Lücke geführt, nicht erfunden.
  const katalog = liesJson(join(BOARD, 'katalog.json'));
  katalog.stationen.push({ repo: 'station-fehlt', besonderheit: 'Gibt es nicht.' });
  schreibeJson(join(BOARD, 'katalog.json'), katalog);
  const lueckenAntwort = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(lueckenAntwort.status === 200, 'Mit fehlender Station antwortet der Katalog '
    + lueckenAntwort.status + ': ' + lueckenAntwort.text);
  pruefe(lueckenAntwort.daten.eintraege.length === 4,
    'Die fehlende Station wird als Eintrag erfunden: '
      + JSON.stringify(lueckenAntwort.daten.eintraege.map((e) => e.repo)));
  pruefe(lueckenAntwort.daten.luecken.some((l) => l.art === 'station'
    && String(l.repo).endsWith('/station-fehlt') && l.grund),
  'Die fehlende Station steht nicht als Lücke: '
    + JSON.stringify(lueckenAntwort.daten.luecken));

  // Der Zwischenspeicher bleibt trotz fehlender Station und fehlendem Netz
  // der letzte gute Stand.
  pruefe(existsSync(join(HOME, 'board', 'katalog-cache.json')),
    'Der Katalog-Zwischenspeicher ist verschwunden');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await beendeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Katalog: 4 Einträge, Sterne 7/2, Suche „Idee“, frisch 8, '
  + 'offline letzter Stand');
