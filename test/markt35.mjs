/**
 * Prüfung Schritt 35 — Der Katalog ist vollständig.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt35`, daneben ein
 * eigenes `DSH_HOME`. Das Hauptboard führt fünf kuratierte Einträge:
 *
 *   - `station-a` mit GitHub-Remote, leerer Beispiel-Liste und zwei Dateien
 *     im Ordner `beispiele/`,
 *   - `station-b` mit Beispiel-Namen in `station.json` und einer weiteren
 *     Datei im Ordner (die Datei darf den Namen nicht verdrängen),
 *   - `station-c` ohne Remote und ohne Beispiele,
 *   - `workflow-w` und `vorhaben-v`, die trotz eigenem `beispiele/`-Ordner
 *     keine Beispiele tragen dürfen.
 *
 * `katalog.json` nennt zwei Prüfungen: `eigen/station-a` über `owner/repo`,
 * `station-b` über den lokalen Pfad. `station-c` ist ungeprüft.
 *
 * Der nachgebildete GitHub-Server auf 127.0.0.1 liefert für `station-a`
 * 7 Sterne, 2 offene Fragen (dazu einen Pull Request in der Issues-Liste,
 * der nicht als Frage zählt), 1 offenen Pull Request und die Freigabe `v9`.
 * `station-b` hat 0 Fragen und 0 Beiträge. Die Suche findet `fremd/station-d`
 * mit 5 Sternen, aber ohne Zahlen. Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. `fragen: 2`, `beitraege: 1` (getrennt, der Pull Request erhöht die
 *      Fragen nicht), `sterne: 7`, `beispiele` nicht leer und `geprueft` mit
 *      Person und Datum.
 *   2. Die Beispiele kommen aus `station.json`, sonst aus `beispiele/`;
 *      Workflows und Vorhaben tragen keine.
 *   3. Ohne Metadaten stehen `null` statt 0; ermittelbare Nullen bleiben 0.
 *   4. Der Zwischenspeicher hält die Zahlen; ohne Netz gelten sie weiter.
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
const ABLAGE = join(WURZEL, 'markt35');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const KATALOG_DATEI = join(BOARD, 'katalog.json');
const STATION_A = join(ABLAGE, 'station-a');
const STATION_B = join(ABLAGE, 'station-b');
const STATION_C = join(ABLAGE, 'station-c');
const WORKFLOW_W = join(ABLAGE, 'workflow-w');
const VORHABEN_V = join(ABLAGE, 'vorhaben-v');
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

/** Der Eintrag mit diesem Namen; fehlt er oder ist er doppelt, ist das ein Fehler. */
function eintrag(daten, name) {
  const treffer = daten.eintraege.filter((eintragRoh) => eintragRoh
    && eintragRoh.name === name);
  pruefe(treffer.length === 1, 'Der Eintrag „' + name + '“ steht nicht genau '
    + 'einmal im Katalog: ' + JSON.stringify(treffer));
  return treffer[0];
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let treffer = [];

/** Ein Repository, wie es die Suche und die Einzelabfrage liefern. */
function repoDaten(owner, name, sterne) {
  return {
    name,
    full_name: owner + '/' + name,
    private: false,
    stargazers_count: sterne,
    forks_count: 0,
    // Absichtlich hoch: die Fragen kommen aus den Issues, nicht von hier.
    open_issues_count: 99,
    description: 'Prüf-Repository ' + name,
    topics: [THEMA],
    default_branch: 'main',
    html_url: 'https://github.com/' + owner + '/' + name,
    pushed_at: null,
    license: null,
    archived: false,
    owner: { login: owner },
  };
}

function frageDaten(owner, name, nummer, mitPull = false) {
  return {
    number: nummer,
    title: 'Frage ' + nummer,
    state: 'open',
    user: { login: 'p1' },
    html_url: 'https://github.com/' + owner + '/' + name + '/issues/' + nummer,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    ...(mitPull ? { pull_request: { url: 'https://api.github.com/pulls/' + nummer } } : null),
  };
}

function pullDaten(owner, name, nummer) {
  return {
    number: nummer,
    title: 'Beitrag ' + nummer,
    state: 'open',
    user: { login: 'p1' },
    html_url: 'https://github.com/' + owner + '/' + name + '/pull/' + nummer,
    created_at: '2026-10-03T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    merged_at: null,
    head: { ref: 'beitrag' },
    base: { ref: 'main' },
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
        const owner = teile[1];
        const name = teile[2];
        const eigen = owner.toLowerCase() === 'eigen';
        // Die Metadaten: 7 Sterne für A, 4 für B.
        if (eigen && name.toLowerCase() === 'station-a' && teile.length === 3) {
          senden(200, repoDaten('eigen', 'station-a', 7));
          return;
        }
        if (eigen && name.toLowerCase() === 'station-b' && teile.length === 3) {
          senden(200, repoDaten('eigen', 'station-b', 4));
          return;
        }
        // Zwei offene Fragen und ein Pull Request in derselben Issues-Liste:
        // der Pull Request darf die Fragen nicht auf 3 erhöhen.
        if (eigen && name.toLowerCase() === 'station-a' && teile[3] === 'issues') {
          senden(200, [
            frageDaten('eigen', 'station-a', 1),
            frageDaten('eigen', 'station-a', 2),
            frageDaten('eigen', 'station-a', 3, true),
          ]);
          return;
        }
        // Ein offener Pull Request; geschlossene werden hier nicht geliefert.
        if (eigen && name.toLowerCase() === 'station-a' && teile[3] === 'pulls') {
          senden(200, [pullDaten('eigen', 'station-a', 7)]);
          return;
        }
        if (eigen && name.toLowerCase() === 'station-a' && teile[3] === 'releases') {
          senden(200, [{
            tag_name: 'v9',
            name: 'Fassung 9',
            published_at: '2026-10-10T00:00:00Z',
            prerelease: false,
          }]);
          return;
        }
        if (eigen && name.toLowerCase() === 'station-b' && teile[3] === 'issues') {
          senden(200, []);
          return;
        }
        if (eigen && name.toLowerCase() === 'station-b' && teile[3] === 'pulls') {
          senden(200, []);
          return;
        }
        if (eigen && name.toLowerCase() === 'station-b' && teile[3] === 'releases') {
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

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  // Station A: Beispiele als Dateien im Ordner `beispiele/`, GitHub-Remote.
  schreibeJson(join(STATION_A, 'station.json'), {
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
  mkdirSync(join(STATION_A, 'beispiele'), { recursive: true });
  writeFileSync(join(STATION_A, 'beispiele', 'lauf.md'), '# Lauf\n', 'utf8');
  writeFileSync(join(STATION_A, 'beispiele', 'notiz.md'), '# Notiz\n', 'utf8');
  writeFileSync(join(STATION_A, 'README.md'), '# Station A\n', 'utf8');
  repoAnlegen(STATION_A, 'station.json',
    'https://github.com/eigen/station-a.git');

  // Station B: die Namen stehen in `station.json`; die Datei im Ordner darf
  // sie nicht verdrängen. 0 Fragen und 0 Beiträge sind ermittelbar.
  schreibeJson(join(STATION_B, 'station.json'), {
    format: 2,
    id: 'station-b',
    name: 'Station B',
    beschreibung: 'Die Station mit Beispiel-Namen.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'B' },
    beispiele: ['aus-der-datei.md'],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['b'],
  });
  mkdirSync(join(STATION_B, 'beispiele'), { recursive: true });
  writeFileSync(join(STATION_B, 'beispiele', 'extra.md'), '# Extra\n', 'utf8');
  writeFileSync(join(STATION_B, 'README.md'), '# Station B\n', 'utf8');
  repoAnlegen(STATION_B, 'station.json',
    'https://github.com/eigen/station-b.git');

  // Station C: nur lokal, ohne Remote und ohne Beispiele.
  schreibeJson(join(STATION_C, 'station.json'), {
    format: 2,
    id: 'station-c',
    name: 'Station C',
    beschreibung: 'Die Station ohne Metadaten.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'C' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['c'],
  });
  writeFileSync(join(STATION_C, 'README.md'), '# Station C\n', 'utf8');
  repoAnlegen(STATION_C, 'station.json', '');

  // Workflow und Vorhaben tragen trotz eigenem `beispiele/`-Ordner keine
  // Beispiele: erfunden wird dort nichts.
  schreibeJson(join(WORKFLOW_W, 'workflow.json'), {
    format: 2,
    id: 'workflow-w',
    titel: 'Workflow W',
    beschreibung: 'Ein Workflow.',
    autor: 'p1',
    stationen: [],
    positionen: [],
    kanten: [],
    layout: 'frei',
    regeln: {},
  });
  mkdirSync(join(WORKFLOW_W, 'beispiele'), { recursive: true });
  writeFileSync(join(WORKFLOW_W, 'beispiele', 'workflow-beispiel.md'),
    '# Kein Beispiel des Katalogs\n', 'utf8');
  repoAnlegen(WORKFLOW_W, 'workflow.json', '');

  schreibeJson(join(VORHABEN_V, 'vorhaben.json'), {
    format: 2,
    id: 'vorhaben-v',
    name: 'Vorhaben V',
    workflow: { repo: 'workflow-w', fassung: 'v1' },
    position: 'start',
    verantwortliche: { start: ['p1'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#fbbf24',
  });
  writeFileSync(join(VORHABEN_V, 'README.md'), '# Vorhaben V\n', 'utf8');
  repoAnlegen(VORHABEN_V, 'vorhaben.json', '');

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [{ repo: STATION_A }, { repo: STATION_B }, { repo: STATION_C }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(KATALOG_DATEI, {
    format: 2,
    stationen: [
      { repo: 'station-a', besonderheit: 'Mit GitHub.' },
      { repo: 'station-b', besonderheit: 'Mit Beispiel-Namen.' },
      { repo: 'station-c', besonderheit: 'Nur lokal.' },
    ],
    workflows: [{ repo: 'workflow-w' }],
    vorhaben: [{ repo: 'vorhaben-v' }],
    // Eine Prüfung über `owner/repo`, eine über den lokalen Pfad.
    geprueft: [
      { repo: 'eigen/station-a', von: 'Thomas Heinrich', am: '2026-10-20' },
      { repo: STATION_B, von: 'Anna Beispiel', am: '2026-10-21' },
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
  // Das Vorhaben heißt `vorhaben-…` und gilt nach seinem Namen als privat;
  // für die Prüffläche ist es öffentlich. Die Karte gehört zur Umgebung,
  // nicht zum Einrichten durch den Menschen.
  schreibeJson(join(HOME, 'board', 'sichtbarkeit.json'), {
    [VORHABEN_V]: 'öffentlich',
  });

  // Die Suche findet eine Station ohne Zahlen; sie trägt keine Metadaten,
  // also bleiben Fragen und Beiträge `null`.
  treffer = [repoDaten('fremd', 'station-d', 5)];

  process.env.DSH_HOME = HOME;
  process.env.DSH_BOARD_CACHE_TTL = '600000';
  process.env.DSH_GITHUB_API = await starteServer();

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');

  // 1. Der vollständige Katalog.
  const erst = await ruf(gebaut, '/board/katalog');
  pruefe(erst.status === 200, 'GET /board/katalog antwortet ' + erst.status
    + ': ' + JSON.stringify(erst.daten));
  const daten = erst.daten;
  pruefe(daten.hinweis === '', 'Der Katalog meldet ohne Grund einen Hinweis: '
    + JSON.stringify(daten.hinweis));
  pruefe(Array.isArray(daten.luecken) && daten.luecken.length === 0,
    'Der Katalog meldet Lücken: ' + JSON.stringify(daten.luecken));
  pruefe(Array.isArray(daten.eintraege) && daten.eintraege.length === 6,
    '`eintraege` enthält nicht alle sechs Einträge: '
      + JSON.stringify((daten.eintraege || []).map((e) => e.name)));

  const a = eintrag(daten, 'Station A');
  pruefe(a.sterne === 7, 'Station A trägt nicht 7 Sterne, sondern '
    + JSON.stringify(a.sterne));
  pruefe(a.fragen === 2, 'Station A zählt nicht 2 offene Fragen, sondern '
    + JSON.stringify(a.fragen) + '; der Pull Request darf nicht mitzählen');
  pruefe(a.beitraege === 1, 'Station A zählt nicht 1 offenen Pull Request, '
    + 'sondern ' + JSON.stringify(a.beitraege));
  pruefe(a.fassung === 'v9', 'Die Freigabe des Servers gilt nicht als Fassung: '
    + JSON.stringify(a.fassung));
  pruefe(Array.isArray(a.beispiele) && a.beispiele.length > 0,
    'Station A trägt keine Beispiele aus dem Ordner `beispiele/`: '
      + JSON.stringify(a.beispiele));
  pruefe(JSON.stringify([...a.beispiele].sort())
    === JSON.stringify(['lauf.md', 'notiz.md']),
  'Station A trägt nicht die Beispieldateien: ' + JSON.stringify(a.beispiele));
  pruefe(a.geprueft && a.geprueft.von === 'Thomas Heinrich'
    && a.geprueft.am === '2026-10-20',
  'Station A trägt nicht die Prüfung mit Person und Datum: '
    + JSON.stringify(a.geprueft));

  const b = eintrag(daten, 'Station B');
  pruefe(b.sterne === 4, 'Station B trägt nicht 4 Sterne: '
    + JSON.stringify(b.sterne));
  pruefe(b.fragen === 0, 'Station B zählt nicht 0 offene Fragen: '
    + JSON.stringify(b.fragen));
  pruefe(b.beitraege === 0, 'Station B zählt nicht 0 offene Beiträge: '
    + JSON.stringify(b.beitraege));
  pruefe(JSON.stringify(b.beispiele) === JSON.stringify(['aus-der-datei.md']),
    'Die Namen aus `station.json` gelten nicht vor den Dateien im Ordner: '
      + JSON.stringify(b.beispiele));
  pruefe(b.geprueft && b.geprueft.von === 'Anna Beispiel'
    && b.geprueft.am === '2026-10-21',
  'Die Prüfung über den lokalen Pfad wurde Station B nicht zugeordnet: '
    + JSON.stringify(b.geprueft));

  const c = eintrag(daten, 'Station C');
  pruefe(c.sterne === null, 'Station C erfindet Sterne: '
    + JSON.stringify(c.sterne));
  pruefe(c.fragen === null, 'Station C erfindet Fragen statt null: '
    + JSON.stringify(c.fragen));
  pruefe(c.beitraege === null, 'Station C erfindet Beiträge statt null: '
    + JSON.stringify(c.beitraege));
  pruefe(Array.isArray(c.beispiele) && c.beispiele.length === 0,
    'Station C erfindet Beispiele: ' + JSON.stringify(c.beispiele));
  pruefe(c.geprueft === null, 'Station C erfindet eine Prüfung: '
    + JSON.stringify(c.geprueft));

  const w = eintrag(daten, 'Workflow W');
  pruefe(Array.isArray(w.beispiele) && w.beispiele.length === 0,
    'Der Workflow trägt erfundene Beispiele: ' + JSON.stringify(w.beispiele));
  pruefe(w.fragen === null && w.beitraege === null,
    'Der Workflow erfindet Zahlen: ' + JSON.stringify({
      fragen: w.fragen, beitraege: w.beitraege,
    }));
  pruefe(w.geprueft === null, 'Der Workflow erfindet eine Prüfung: '
    + JSON.stringify(w.geprueft));

  const v = eintrag(daten, 'Vorhaben V');
  pruefe(Array.isArray(v.beispiele) && v.beispiele.length === 0,
    'Das Vorhaben trägt erfundene Beispiele: ' + JSON.stringify(v.beispiele));
  pruefe(v.fragen === null && v.beitraege === null,
    'Das Vorhaben erfindet Zahlen: ' + JSON.stringify({
      fragen: v.fragen, beitraege: v.beitraege,
    }));

  const fund = eintrag(daten, 'station-d');
  pruefe(fund.sterne === 5, 'Der gefundene Eintrag trägt nicht 5 Sterne: '
    + JSON.stringify(fund.sterne));
  pruefe(fund.fragen === null && fund.beitraege === null,
    'Der gefundene Eintrag erfindet Fragen oder Beiträge: '
      + JSON.stringify({ fragen: fund.fragen, beitraege: fund.beitraege }));
  pruefe(Array.isArray(fund.beispiele) && fund.beispiele.length === 0,
    'Der gefundene Eintrag erfindet Beispiele: '
      + JSON.stringify(fund.beispiele));
  pruefe(fund.geprueft === null, 'Der gefundene Eintrag erfindet eine Prüfung: '
    + JSON.stringify(fund.geprueft));
  console.log('ok vollständig: 2 Fragen, 1 Beitrag, 7 Sterne, Beispiele und '
    + 'Prüfung je Eintrag');

  // 2. Die Zahlen und die Prüfung stehen im Zwischenspeicher.
  const cache = liesJson(CACHE);
  const cacheA = (cache.eintraege || []).find((e) => e.name === 'Station A');
  pruefe(cacheA && cacheA.fragen === 2 && cacheA.beitraege === 1,
    'Der Katalog-Zwischenspeicher hält die zwei Zahlen nicht getrennt: '
      + JSON.stringify(cacheA && {
        fragen: cacheA.fragen, beitraege: cacheA.beitraege,
      }));
  pruefe(cacheA && Array.isArray(cacheA.beispiele)
    && cacheA.beispiele.length === 2,
  'Der Zwischenspeicher verliert die Beispiele: '
    + JSON.stringify(cacheA && cacheA.beispiele));
  pruefe(cacheA && cacheA.geprueft
    && cacheA.geprueft.von === 'Thomas Heinrich',
  'Der Zwischenspeicher verliert die Prüfung: '
    + JSON.stringify(cacheA && cacheA.geprueft));
  console.log('ok Zwischenspeicher: Zahlen, Beispiele und Prüfung mitgehalten');

  // 3. Ohne Netz gelten die letzten Zahlen; `station.json` bleibt unverändert.
  await stoppeServer();
  const offline = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(offline.status === 200, 'Ohne Server antwortet der Katalog '
    + offline.status + ': ' + JSON.stringify(offline.daten));
  const off = offline.daten;
  const offA = eintrag(off, 'Station A');
  pruefe(offA.fragen === 2 && offA.beitraege === 1,
    'Ohne Netz gehen die letzten Zahlen verloren: ' + JSON.stringify({
      fragen: offA.fragen, beitraege: offA.beitraege,
    }));
  pruefe(offA.sterne === 7, 'Ohne Netz geht die letzte Sternzahl verloren: '
    + JSON.stringify(offA.sterne));
  pruefe(Array.isArray(offA.beispiele) && offA.beispiele.length === 2,
    'Ohne Netz gehen die Beispiele verloren: ' + JSON.stringify(offA.beispiele));
  pruefe(offA.geprueft && offA.geprueft.von === 'Thomas Heinrich',
    'Ohne Netz geht die Prüfung verloren: ' + JSON.stringify(offA.geprueft));
  pruefe(String(off.hinweis || '').length > 0,
    'Ohne Netz fehlt der Hinweis auf den letzten Stand');
  pruefe(readFileSync(KATALOG_DATEI, 'utf8') === katalogVorher,
    'katalog.json wurde durch den Katalog verändert');
  console.log('ok ohne Netz: letzte Zahlen und Prüfung bleiben');

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
console.log('ok Katalog: Beispiele, Prüfung, Sterne, Fragen und Beiträge getrennt');
