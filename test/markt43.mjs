/**
 * Prüfung Schritt 43 — Zwei Menschen, ein Board.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt43`. Zwei Menschen
 * arbeiten am selben Board: A heißt `testkonto`, B heißt `fremd`. Jeder hat
 * sein eigenes Zuhause (`home-a`, `home-b`) mit eigener Identität und eigenem
 * Token; das Board, sein Workflow und der Katalog liegen in `flaeche/` und
 * werden von beiden gelesen. Ein nachgebildeter GitHub-Server liegt auf
 * `127.0.0.1`; ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird der offene Weg einmal ganz:
 *
 *   1. A legt eine Station an; das Thema `dsh-board-station` steht am
 *      Repository.
 *   2. B findet sie ohne Token über die Suche im Katalog, ohne Zutun.
 *   3. B stellt sie in den Workflow des gemeinsamen Boards; danach steht sie
 *      an einer Position und die Karte sagt `imWorkflow`.
 *   4. B forkt sie und stellt einen Pull Request; A sieht den Pull Request.
 *   5. B legt ein Vorhaben an; A sieht es am Schritt.
 *   6. Der Katalog zeigt beide Herkünfte: kuratiert und gefunden.
 *   7. Ohne Token bleiben Board, Workflow, Station, Katalog und Pull Request
 *      lesbar.
 *
 * Der Live-Lauf (nicht Teil der Suite):
 *
 *   BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token> node --test test/markt43.mjs
 *
 * legt mit dem Testkonto eine Station an, sucht sie anonym im Katalog und
 * löscht sie wieder. Die B-Seite (Fork und Pull Request) braucht ein zweites
 * Konto; sie wird im Bericht als offener Punkt genannt und nicht vorgetäuscht.
 */
import { createServer } from 'node:http';
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt43');
const HOME_A = join(ABLAGE, 'home-a');
const HOME_B = join(ABLAGE, 'home-b');
const FLAECHE = join(ABLAGE, 'flaeche');
const HAUPT = join(FLAECHE, 'hauptboard');
const BOARD = join(FLAECHE, 'board-team');
const WORKFLOW = join(FLAECHE, 'workflow-team');
const KURATIERT = join(FLAECHE, 'station-kuratiert');
const REGISTER_A = join(HOME_A, 'board', 'boards.json');
const REGISTER_B = join(HOME_B, 'board', 'boards.json');
const TOKEN_A = join(HOME_A, 'board', 'github.json');
const TOKEN_B = join(HOME_B, 'board', 'github.json');
const STATION_ID = 'gemeinsame-station';
const STATION_REPO = 'testkonto/station-' + STATION_ID;
const VORHABEN_NAME = 'Baut zusammen';
const VORHABEN_ID = 'baut-zusammen';
const VORHABEN_REPO = 'fremd/vorhaben-' + VORHABEN_ID;

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

/** Ein lokales Repository mit einem Stand; optional Tag und GitHub-Remote. */
function festschreiben(ordner, { tag = '', remote = '' } = {}) {
  mkdirSync(ordner, { recursive: true });
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung',
  ]);
  if (tag) git(ordner, ['tag', tag]);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
}

function station(id, name, host) {
  return {
    format: 2,
    id,
    name,
    beschreibung: name + ' in einem Satz.',
    host,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: name + ' in einem Satz.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: [id],
  };
}

/** Die kuratierte Station des Hauptboards — Gegenstück zur gefundenen. */
function legeKuratiert() {
  schreibeJson(join(KURATIERT, 'station.json'),
    station('station-kuratiert', 'Kuratierte Station', 'kuratiert'));
  writeFileSync(join(KURATIERT, 'README.md'), '# Kuratierte Station\n', 'utf8');
  festschreiben(KURATIERT, {
    tag: 'v1',
    remote: 'https://github.com/kuratiert/station-kuratiert.git',
  });
}

function legeHauptboard() {
  schreibeJson(join(HAUPT, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'testkonto', name: 'Testkonto', farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [{ repo: 'station-kuratiert' }],
    einstellungen: {},
    layout: {},
  });
  schreibeJson(join(HAUPT, 'katalog.json'), {
    format: 2,
    stationen: [{ repo: 'station-kuratiert' }],
    workflows: [],
    vorhaben: [],
    geprueft: [],
  });
  writeFileSync(join(HAUPT, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(HAUPT);
}

function legeWorkflow() {
  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'team',
    titel: 'Team-Workflow',
    beschreibung: 'Der Workflow des gemeinsamen Boards.',
    autor: 'fremd',
    stationen: [],
    positionen: [],
    kanten: [],
    layout: 'frei',
    regeln: {},
  });
  writeFileSync(join(WORKFLOW, 'README.md'), '# Team-Workflow\n', 'utf8');
  // Kein Remote: der Workflow-Verweis bleibt ein Geschwisterordner, den beide
  // Zuhause gleich auflösen. Die Station trägt den Remote.
  festschreiben(WORKFLOW, { tag: 'v1' });
}

function legeBoard() {
  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [
      { login: 'testkonto', name: 'Testkonto', farbe: '#fbbf24' },
      { login: 'fremd', name: 'Fremd', farbe: '#22c55e' },
    ],
    workflows: [{ repo: 'workflow-team', fassung: 'v1' }],
    vorhaben: [],
    stationen: [],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Testboard\n', 'utf8');
  festschreiben(BOARD, { remote: 'https://github.com/testkonto/board-team.git' });
}

function legeRegister() {
  const boards = [
    {
      id: 'hauptboard', name: 'Hauptboard', format: 2, art: 'hauptboard',
      repo: HAUPT, remote: null, person: 'testkonto',
    },
    {
      id: 'testboard', name: 'Testboard', format: 2, art: 'team',
      repo: BOARD, remote: 'https://github.com/testkonto/board-team.git',
      person: 'testkonto',
    },
  ];
  schreibeJson(REGISTER_A, { format: 1, aktiv: 'testboard', boards });
  schreibeJson(REGISTER_B, {
    format: 1,
    aktiv: 'testboard',
    boards: boards.map((eintrag) => ({ ...eintrag, person: 'fremd' })),
  });
  schreibeJson(join(HOME_A, 'board', 'identitaet.json'), {
    name: 'Anna Testkonto', github: 'testkonto', farbe: '#fbbf24',
  });
  schreibeJson(join(HOME_B, 'board', 'identitaet.json'), {
    name: 'Bea Fremd', github: 'fremd', farbe: '#22c55e',
  });
  schreibeJson(TOKEN_A, { token: 'token-a', login: 'testkonto' });
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
const repos = new Map();
const pulls = new Map();
const forks = [];
const anfragen = [];
let serverBasis = '';

function repoSchluessel(owner, name) {
  return owner + '/' + name;
}

function legeRepoAn(owner, name, {
  privat = false, themen = [], beschreibung = '', sterne = 0,
} = {}) {
  repos.set(repoSchluessel(owner, name), {
    owner, name, privat: Boolean(privat), themen: [...themen],
    beschreibung, sterne, archiviert: false,
  });
}

function repoDaten(owner, name) {
  const repo = repos.get(repoSchluessel(owner, name));
  if (!repo) return null;
  return {
    name: repo.name,
    full_name: repoSchluessel(owner, name),
    private: repo.privat,
    stargazers_count: repo.sterne,
    forks_count: 0,
    open_issues_count: 0,
    description: repo.beschreibung,
    topics: repo.themen,
    default_branch: 'main',
    html_url: 'https://github.com/' + repoSchluessel(owner, name),
    pushed_at: null,
    license: null,
    archived: repo.archiviert,
    owner: { login: owner },
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
      let roh = '';
      for await (const stueck of req) roh += stueck;
      let daten = {};
      if (roh) {
        try { daten = JSON.parse(roh); } catch { daten = {}; }
      }
      const adresse = new URL(req.url, 'http://127.0.0.1');
      const pfad = adresse.pathname;
      const teile = pfad.split('/').filter(Boolean);
      const kopf = String(req.headers.authorization || '');
      const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
      const login = token === 'token-a' ? 'testkonto'
        : (token === 'token-b' ? 'fremd' : '');
      anfragen.push({ methode: req.method, pfad, login });

      if (req.method === 'GET' && pfad === '/user') {
        if (!login) { senden(401, { message: 'Bad credentials' }); return; }
        senden(200, { login, name: login, type: 'User' });
        return;
      }
      if (req.method === 'GET' && pfad === '/rate_limit') {
        senden(200, { resources: { core: { remaining: 5000, limit: 5000, reset: 0 } } });
        return;
      }
      if (req.method === 'GET' && pfad === '/search/repositories') {
        const gesucht = String(adresse.searchParams.get('q') || '');
        const treffer = [];
        if (gesucht.includes('topic:dsh-board-station')) {
          for (const repo of repos.values()) {
            if (repo.privat || repo.archiviert) continue;
            if (!repo.themen.includes('dsh-board-station')) continue;
            treffer.push(repoDaten(repo.owner, repo.name));
          }
        }
        senden(200, { total_count: treffer.length, items: treffer });
        return;
      }

      // /repos/<owner>/<name>/...
      if (teile[0] === 'repos' && teile.length >= 3) {
        const owner = teile[1];
        const name = teile[2];
        const repo = repos.get(repoSchluessel(owner, name));
        const rest = teile.slice(3);

        if (req.method === 'GET' && rest.length === 0) {
          if (!repo) { senden(404, { message: 'Not Found' }); return; }
          senden(200, repoDaten(owner, name));
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'releases') {
          senden(200, []);
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'issues') {
          senden(200, []);
          return;
        }
        if (req.method === 'GET' && rest.length === 1 && rest[0] === 'pulls') {
          const zustand = String(adresse.searchParams.get('state') || 'open');
          const liste = (pulls.get(repoSchluessel(owner, name)) || [])
            .filter((eintrag) => zustand === 'all' || eintrag.state === zustand);
          senden(200, liste);
          return;
        }
        if (req.method === 'GET' && rest.length === 2 && rest[0] === 'pulls') {
          const nummer = Number(rest[1]);
          const treffer = (pulls.get(repoSchluessel(owner, name)) || [])
            .find((eintrag) => eintrag.number === nummer);
          if (!treffer) { senden(404, { message: 'Not Found' }); return; }
          senden(200, treffer);
          return;
        }
        if (req.method === 'GET' && rest.length === 3
          && rest[0] === 'collaborators' && rest[2] === 'permission') {
          senden(200, { permission: 'push', role_name: 'write' });
          return;
        }
        if (req.method === 'PUT' && rest.length === 1 && rest[0] === 'topics') {
          if (!repo) { senden(404, { message: 'Not Found' }); return; }
          repo.themen = Array.isArray(daten.names) ? daten.names.map(String) : [];
          senden(200, { names: repo.themen });
          return;
        }
        if (req.method === 'PUT' && rest[0] === 'contents' && rest.length >= 2) {
          senden(201, {
            content: { path: rest.slice(1).join('/'), sha: 'sha-' + rest.join('-') },
          });
          return;
        }
        if (req.method === 'POST' && rest.length === 1 && rest[0] === 'forks') {
          if (!repo) { senden(404, { message: 'Not Found' }); return; }
          if (!login) { senden(401, { message: 'Bad credentials' }); return; }
          // Ein Fork trägt das Thema nicht: die Suche findet das Original.
          legeRepoAn(login, name, {
            privat: false, themen: [], beschreibung: repo.beschreibung,
          });
          forks.push({ von: repoSchluessel(owner, name),
            nach: repoSchluessel(login, name) });
          senden(202, repoDaten(login, name));
          return;
        }
        if (req.method === 'POST' && rest.length === 1 && rest[0] === 'pulls') {
          if (!repo) { senden(404, { message: 'Not Found' }); return; }
          if (!login) { senden(401, { message: 'Bad credentials' }); return; }
          const schluessel = repoSchluessel(owner, name);
          const liste = pulls.get(schluessel) || [];
          const nummer = liste.length + 1;
          const eintrag = {
            number: nummer,
            title: String(daten.title || ''),
            body: String(daten.body || ''),
            state: 'open',
            user: { login },
            html_url: 'https://github.com/' + schluessel + '/pull/' + nummer,
            created_at: '2026-10-29T03:00:00Z',
            updated_at: '2026-10-29T03:00:00Z',
            head: { ref: String(daten.head || '') },
            base: { ref: String(daten.base || '') },
            merged_at: null,
          };
          liste.push(eintrag);
          pulls.set(schluessel, liste);
          senden(201, eintrag);
          return;
        }
      }

      if (req.method === 'POST' && (pfad === '/user/repos'
        || (teile[0] === 'orgs' && teile[2] === 'repos' && teile.length === 3))) {
        if (!login) { senden(401, { message: 'Bad credentials' }); return; }
        const owner = pfad === '/user/repos' ? login : teile[1];
        const name = String(daten.name || '');
        if (repos.has(repoSchluessel(owner, name))) {
          senden(422, { message: 'Repository already exists' });
          return;
        }
        legeRepoAn(owner, name, {
          privat: daten.private === true,
          beschreibung: String(daten.description || ''),
        });
        senden(201, repoDaten(owner, name));
        return;
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
  pruefe(daten !== null && typeof daten === 'object',
    'Die Antwort von ' + pfad + ' ist kein JSON-Objekt: ' + res.text.slice(0, 300));
  return { status: res.status, daten };
}

/* --- Der Offline-Lauf ---------------------------------------------------- */

async function offlineLauf() {
  let gebautA = null;
  let gebautB = null;
  let bestanden = false;

  rmSync(ABLAGE, { recursive: true, force: true });

  try {
    mkdirSync(ABLAGE, { recursive: true });
    legeKuratiert();
    legeHauptboard();
    legeWorkflow();
    legeBoard();
    legeRegister();

    legeRepoAn('kuratiert', 'station-kuratiert', {
      themen: ['dsh-board-station'], beschreibung: 'Eine kuratierte Station.',
      sterne: 9,
    });
    legeRepoAn('testkonto', 'board-team', {
      privat: true, beschreibung: 'Das gemeinsame Board.',
    });
    legeRepoAn('testkonto', 'workflow-team', {
      beschreibung: 'Der Workflow des gemeinsamen Boards.',
    });

    const basis = await starteServer();
    process.env.DSH_GITHUB_API = basis;
    process.env.DSH_HOME = HOME_A;
    const modulA = await import(pathToFileURL(join(PRODUKT, 'index.js')).href
      + '?pruefung=43a');
    pruefe(typeof modulA.apply === 'function', 'Das Modul A exportiert apply nicht');
    gebautA = ctxBauen();
    modulA.apply(gebautA.ctx);

    process.env.DSH_HOME = HOME_B;
    const modulB = await import(pathToFileURL(join(PRODUKT, 'index.js')).href
      + '?pruefung=43b');
    pruefe(typeof modulB.apply === 'function', 'Das Modul B exportiert apply nicht');
    gebautB = ctxBauen();
    modulB.apply(gebautB.ctx);

    const a = gebautA;
    const b = gebautB;

    // 1. A legt eine Station an; das Thema steht am Repository.
    const erst = await ruf(a, '/board/station', {
      name: 'Gemeinsame Station',
      beschreibung: 'Eine Station, die beiden gehört.',
    });
    pruefe(erst.status === 200,
      'A kann die Station nicht anlegen (' + erst.status + '): '
        + JSON.stringify(erst.daten));
    const angelegt = erst.daten.station || {};
    pruefe(angelegt.owner === 'testkonto' && angelegt.repo === 'station-' + STATION_ID,
      'Die Antwort nennt nicht die Station unter testkonto: '
        + JSON.stringify(angelegt));
    const stationPfad = String(angelegt.pfad || '');
    pruefe(existsSync(join(stationPfad, 'station.json')),
      'Die Station liegt nicht im Zwischenspeicher: ' + stationPfad);
    pruefe(repos.has(STATION_REPO),
      'Der nachgebildete Server kennt die Station nicht: ' + STATION_REPO);
    pruefe(repos.get(STATION_REPO).themen.includes('dsh-board-station'),
      'Das Thema `dsh-board-station` fehlt am Repository: '
        + JSON.stringify(repos.get(STATION_REPO).themen));
    const boardNachAnlegen = liesJson(join(BOARD, 'board.json'));
    pruefe(boardNachAnlegen.stationen.some((eintrag) => eintrag.repo === STATION_REPO),
      'Der Stationsverweis steht nicht im Board: '
        + JSON.stringify(boardNachAnlegen.stationen));
    console.log('ok A legt an: ' + STATION_REPO + ' mit Thema `dsh-board-station`');

    // B ist noch nicht angemeldet; er findet die Station anonym.
    pruefe(!existsSync(TOKEN_B), 'B hat vor der Suche schon einen Token');
    const bKatalog = await ruf(b, '/board/katalog?frisch=1');
    pruefe(bKatalog.status === 200,
      'Der Katalog antwortet für B ' + bKatalog.status + ': '
        + JSON.stringify(bKatalog.daten));
    const gefunden = (bKatalog.daten.gefunden || [])
      .find((eintrag) => eintrag.repo === STATION_REPO);
    pruefe(gefunden,
      'B findet die Station nicht über die Suche: '
        + JSON.stringify(bKatalog.daten.gefunden));
    pruefe(gefunden.herkunft === 'gefunden'
      && gefunden.name === 'station-' + STATION_ID
      && gefunden.beschreibung === 'Eine Station, die beiden gehört.',
    'Der gefundene Eintrag nennt nicht Herkunft, Namen und Beschreibung: '
      + JSON.stringify(gefunden));
    const suchen = anfragen.filter((eintrag) => eintrag.pfad === '/search/repositories');
    pruefe(suchen.length > 0 && suchen.every((eintrag) => eintrag.login === ''),
      'B hat die Suche nicht anonym ausgeführt: '
        + JSON.stringify(suchen));
    console.log('ok B findet: ' + STATION_REPO + ' anonym in `gefunden`');

    // B meldet sich an und stellt die gefundene Station in den Workflow des
    // gemeinsamen Boards. Sein Zuhause hat einen eigenen Klon der Station.
    const bStation = join(HOME_B, 'board', 'cache', 'testkonto',
      'station-' + STATION_ID);
    mkdirSync(dirname(bStation), { recursive: true });
    cpSync(stationPfad, bStation, { recursive: true });
    // B hat die Station von GitHub geklont; sein Klon trägt den Remote.
    git(bStation, ['remote', 'add', 'origin',
      'https://github.com/' + STATION_REPO + '.git']);
    schreibeJson(TOKEN_B, { token: 'token-b', login: 'fremd' });

    const gestellt = await ruf(b, '/board/workflow/station', { station: STATION_ID });
    pruefe(gestellt.status === 200,
      'B kann die Station nicht in den Workflow stellen (' + gestellt.status + '): '
        + JSON.stringify(gestellt.daten));
    const position = (gestellt.daten.workflow.positionen || [])
      .find((eintrag) => eintrag.schritt === STATION_ID);
    pruefe(position, 'Die Station steht nicht an einer Position: '
      + JSON.stringify(gestellt.daten.workflow.positionen));
    const karte = (gestellt.daten.stationen || [])
      .find((eintrag) => eintrag.id === STATION_ID);
    pruefe(karte && karte.imWorkflow === true,
      'Die Karte sagt nicht `imWorkflow`: ' + JSON.stringify(karte));
    const workflowDatei = liesJson(join(WORKFLOW, 'workflow.json'));
    pruefe(workflowDatei.stationen.some((eintrag) => eintrag.id === STATION_ID
      && eintrag.repo === STATION_REPO && eintrag.fassung),
    'Der Workflow trägt nicht den Stationsverweis mit Fassung: '
      + JSON.stringify(workflowDatei.stationen));
    console.log('ok B benutzt: ' + STATION_ID + ' steht im Workflow');

    // B forkt die Station und stellt einen Pull Request.
    const geforkt = await ruf(b, '/board/github/fork', { repo: STATION_REPO });
    pruefe(geforkt.status === 200,
      'B kann nicht forken (' + geforkt.status + '): '
        + JSON.stringify(geforkt.daten));
    pruefe(geforkt.daten.fork && geforkt.daten.fork.eigentuemer === 'fremd',
      'Der Fork gehört nicht B: ' + JSON.stringify(geforkt.daten.fork));
    pruefe(forks.some((eintrag) => eintrag.von === STATION_REPO
      && eintrag.nach === 'fremd/station-' + STATION_ID),
    'Der Server sah keinen Fork von ' + STATION_REPO + ': ' + JSON.stringify(forks));
    const beitrag = await ruf(b, '/board/github/beitrag', {
      repo: STATION_REPO,
      titel: 'Die Station gemeinsam nutzen',
      text: 'B schlägt eine kleine Ergänzung vor.',
      head: 'fremd:beitrag',
      base: 'main',
    });
    pruefe(beitrag.status === 200,
      'B kann keinen Pull Request stellen (' + beitrag.status + '): '
        + JSON.stringify(beitrag.daten));
    pruefe(beitrag.daten.nummer === 1,
      'Der Pull Request trägt nicht die Nummer 1: '
        + JSON.stringify(beitrag.daten));
    const gespeichert = pulls.get(STATION_REPO) || [];
    pruefe(gespeichert.length === 1 && gespeichert[0].head.ref === 'fremd:beitrag'
      && gespeichert[0].base.ref === 'main',
    'Der Pull Request steht nicht mit Quelle und Ziel im Server: '
      + JSON.stringify(gespeichert));
    console.log('ok B forkt und beiträgt: fremd/station-' + STATION_ID
      + ', Pull Request #1');

    // A sieht den Pull Request.
    const beitraege = await ruf(a, '/board/github/beitraege?repo=' + STATION_REPO);
    pruefe(beitraege.status === 200,
      'A kann die Beiträge nicht lesen (' + beitraege.status + '): '
        + JSON.stringify(beitraege.daten));
    const gesehen = (beitraege.daten.beitraege || [])
      .find((eintrag) => eintrag.nummer === 1);
    pruefe(gesehen && gesehen.autor === 'fremd' && gesehen.zustand === 'offen',
      'A sieht den Pull Request nicht als offen von fremd: '
        + JSON.stringify(beitraege.daten.beitraege));
    const einzeln = await ruf(a, '/board/github/beitrag?repo=' + STATION_REPO
      + '&nummer=1');
    pruefe(einzeln.status === 200 && einzeln.daten.beitrag.nummer === 1,
      'A kann den Pull Request nicht einzeln lesen: '
        + JSON.stringify(einzeln.daten));
    console.log('ok A sieht: Pull Request #1 von fremd, offen');

    // B legt ein Vorhaben an dieser Station an.
    const vorhabenAntwort = await ruf(b, '/board/vorhaben', {
      name: VORHABEN_NAME,
      station: STATION_ID,
    });
    pruefe(vorhabenAntwort.status === 200,
      'B kann das Vorhaben nicht anlegen (' + vorhabenAntwort.status + '): '
        + JSON.stringify(vorhabenAntwort.daten));
    const vorhaben = vorhabenAntwort.daten.vorhaben || {};
    pruefe(vorhaben.owner === 'fremd' && vorhaben.repo === 'vorhaben-' + VORHABEN_ID
      && vorhaben.position === STATION_ID,
    'Das Vorhaben steht nicht unter fremd an der Station: '
      + JSON.stringify(vorhaben));
    const bVorhaben = join(HOME_B, 'board', 'cache', 'fremd', 'vorhaben-' + VORHABEN_ID);
    pruefe(existsSync(join(bVorhaben, 'vorhaben.json')),
      'B hat kein Vorhaben-Repository: ' + bVorhaben);
    console.log('ok B legt an: ' + VORHABEN_REPO + ' an ' + STATION_ID);

    // A sieht das Vorhaben; dafür liegt der Klon in seinem Zuhause.
    const aVorhaben = join(HOME_A, 'board', 'cache', 'fremd', 'vorhaben-' + VORHABEN_ID);
    mkdirSync(dirname(aVorhaben), { recursive: true });
    cpSync(bVorhaben, aVorhaben, { recursive: true });
    const datenA = await ruf(a, '/board/data');
    pruefe(datenA.status === 200,
      'A kann das Board nicht lesen (' + datenA.status + '): '
        + JSON.stringify(datenA.daten));
    const gesehenesVorhaben = (datenA.daten.vorgaenge || [])
      .find((eintrag) => eintrag.name === VORHABEN_NAME);
    pruefe(gesehenesVorhaben && gesehenesVorhaben.position === STATION_ID,
      'A sieht das Vorhaben nicht an der Station: '
        + JSON.stringify(datenA.daten.vorgaenge));
    pruefe(gesehenesVorhaben.verantwortliche
      && Array.isArray(gesehenesVorhaben.verantwortliche[STATION_ID])
      && gesehenesVorhaben.verantwortliche[STATION_ID].includes('fremd'),
    'A sieht B nicht als verantwortlich: '
      + JSON.stringify(gesehenesVorhaben.verantwortliche));
    console.log('ok A sieht: ' + VORHABEN_NAME + ' an ' + STATION_ID + ' von fremd');

    // Der Katalog zeigt beide Herkünfte.
    const katalog = await ruf(a, '/board/katalog?frisch=1');
    pruefe(katalog.status === 200,
      'Der Katalog antwortet ' + katalog.status + ': ' + JSON.stringify(katalog.daten));
    const kuratiert = katalog.daten.kuratiert || [];
    const gefundenA = katalog.daten.gefunden || [];
    pruefe(kuratiert.length === 1 && kuratiert[0].herkunft === 'kuratiert'
      && kuratiert[0].name === 'Kuratierte Station',
    'Der Katalog nennt nicht die kuratierte Station: ' + JSON.stringify(kuratiert));
    pruefe(gefundenA.length === 1 && gefundenA[0].repo === STATION_REPO
      && gefundenA[0].herkunft === 'gefunden',
    'Der Katalog nennt nicht die gefundene Station: ' + JSON.stringify(gefundenA));
    pruefe((katalog.daten.eintraege || []).length === 2,
      'Der Katalog führt nicht beide Einträge zusammen: '
        + JSON.stringify(katalog.daten.eintraege));
    console.log('ok Katalog: kuratiert und gefunden, zwei Einträge');

    // Ohne Token ist alles lesbar.
    rmSync(TOKEN_A, { force: true });
    rmSync(TOKEN_B, { force: true });
    const ohneToken = await ruf(a, '/board/data');
    pruefe(ohneToken.status === 200,
      'Ohne Token antwortet das Board ' + ohneToken.status + ': '
        + JSON.stringify(ohneToken.daten));
    pruefe(ohneToken.daten.darf === false,
      'Ohne Token behauptet das Board ein Schreibrecht');
    pruefe(String(ohneToken.daten.darfGrund || '').trim().length > 0,
      'Ohne Token fehlt der Grund für das Lesen: '
        + JSON.stringify(ohneToken.daten.darfGrund));
    const ohneWorkflow = await ruf(a, '/board/workflow');
    pruefe(ohneWorkflow.status === 200,
      'Ohne Token antwortet der Workflow ' + ohneWorkflow.status + ': '
        + JSON.stringify(ohneWorkflow.daten));
    const ohneStation = await ruf(a, '/board/station?station=' + STATION_ID);
    pruefe(ohneStation.status === 200
      && ohneStation.daten.name === 'Gemeinsame Station',
    'Ohne Token antwortet die Station ' + ohneStation.status + ': '
      + JSON.stringify(ohneStation.daten));
    const ohneKatalog = await ruf(a, '/board/katalog?frisch=1');
    pruefe(ohneKatalog.status === 200
      && (ohneKatalog.daten.gefunden || []).some(
        (eintrag) => eintrag.repo === STATION_REPO),
    'Ohne Token fehlt die gefundene Station im Katalog: '
      + JSON.stringify(ohneKatalog.daten.gefunden));
    const ohneBeitraege = await ruf(a, '/board/github/beitraege?repo=' + STATION_REPO);
    pruefe(ohneBeitraege.status === 200
      && (ohneBeitraege.daten.beitraege || []).some(
        (eintrag) => eintrag.nummer === 1),
    'Ohne Token ist der Pull Request nicht lesbar: '
      + JSON.stringify(ohneBeitraege.daten));
    const ohneBeitrag = await ruf(a, '/board/github/beitrag?repo=' + STATION_REPO
      + '&nummer=1');
    pruefe(ohneBeitrag.status === 200 && ohneBeitrag.daten.beitrag.nummer === 1,
      'Ohne Token ist der einzelne Pull Request nicht lesbar: '
        + JSON.stringify(ohneBeitrag.daten));
    pruefe(anfragen.every((eintrag) => !/token-[ab]/i.test(eintrag.pfad)),
      'Ein Token steht in einer Adresse: '
        + JSON.stringify(anfragen.filter((e) => /token-[ab]/i.test(e.pfad))));
    console.log('ok ohne Token: Board, Workflow, Station, Katalog und Beitrag lesbar');

    console.log('ok Zwei Menschen: anlegen, finden, benutzen, forken, beitragen');
    bestanden = true;
  } finally {
    if (gebautA) gebautA.aufraeumen.forEach((ende) => ende());
    if (gebautB) gebautB.aufraeumen.forEach((ende) => ende());
    delete process.env.DSH_HOME;
    delete process.env.DSH_GITHUB_API;
    await stoppeServer();
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
  pruefe(!existsSync(ABLAGE), 'Ablage und Zuhause wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
}

/* --- Der Live-Lauf (nicht Teil der Suite) --------------------------------
 *
 * `BOARD_LIVE=1 BOARD_LIVE_TOKEN=<token>` legt mit dem Testkonto eine Station
 * an, sucht sie ohne Token im Katalog und löscht das Repository wieder. Der
 * Token steht nur im Prozess, in keiner Datei. Die B-Seite braucht ein
 * zweites Konto; sie wird nicht vorgetäuscht.
 */

const LIVE_API = 'https://api.github.com';
const LIVE_OWNER = 'ThomasTestDSBOARD';

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
  const stationId = 'live-' + stempel;
  const repoName = 'station-' + stationId;
  const anzeigeName = 'Live ' + stempel;
  const liveHome = join(WURZEL, 'markt43-live');
  let gebaut = null;
  let angelegt = false;
  let owner = LIVE_OWNER;

  rmSync(liveHome, { recursive: true, force: true });
  try {
    // Der Eigentümer ist der Login des Tokens, nicht der Name der Organisation.
    const ich = await liveAnfrage(token, '/user');
    pruefe(ich.status === 200, 'Der Token ist nicht gültig: /user antwortet '
      + ich.status);
    owner = String((ich.wert && ich.wert.login) || '');
    pruefe(owner, 'Der Token nennt keinen Login');

    const hauptboard = join(liveHome, 'flaeche', 'hauptboard');
    const board = join(liveHome, 'flaeche', 'board');
    schreibeJson(join(hauptboard, 'board.json'), {
      format: 2, id: 'hauptboard', name: 'Hauptboard', art: 'hauptboard',
      personen: [{ login: owner, name: owner, farbe: '#fbbf24' }],
      workflows: [], vorhaben: [], stationen: [], einstellungen: {}, layout: {},
    });
    schreibeJson(join(hauptboard, 'katalog.json'), {
      format: 2, stationen: [], workflows: [], vorhaben: [], geprueft: [],
    });
    festschreiben(hauptboard);
    schreibeJson(join(board, 'board.json'), {
      format: 2, id: 'testboard', name: 'Testboard', art: 'team',
      personen: [{ login: owner, name: owner, farbe: '#fbbf24' }],
      workflows: [], vorhaben: [], stationen: [], einstellungen: {}, layout: {},
    });
    festschreiben(board);
    schreibeJson(join(liveHome, 'board', 'boards.json'), {
      format: 1,
      aktiv: 'testboard',
      boards: [
        { id: 'hauptboard', name: 'Hauptboard', format: 2, art: 'hauptboard',
          repo: hauptboard, remote: null, person: owner },
        { id: 'testboard', name: 'Testboard', format: 2, art: 'team',
          repo: board, remote: null, person: owner },
      ],
    });
    schreibeJson(join(liveHome, 'board', 'identitaet.json'), {
      name: 'Testkonto', github: owner, farbe: '#fbbf24',
    });
    schreibeJson(join(liveHome, 'board', 'github.json'), {
      token, login: owner,
    });

    delete process.env.DSH_GITHUB_API;
    process.env.DSH_HOME = liveHome;
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href
      + '?pruefung=43live');
    gebaut = ctxBauen();
    modul.apply(gebaut.ctx);

    const erst = await ruf(gebaut, '/board/station', {
      name: anzeigeName, beschreibung: 'Live-Prüfung von Schritt 43.',
    });
    pruefe(erst.status === 200,
      'Die Station ließ sich nicht anlegen (' + erst.status + '): '
        + JSON.stringify(erst.daten));
    angelegt = true;
    const repo = erst.daten.station && erst.daten.station.repo;
    pruefe(repo === repoName, 'Die Route legt nicht ' + repoName + ' an: '
      + JSON.stringify(erst.daten.station));

    const gelesen = await liveAnfrage(token, '/repos/' + owner + '/' + repoName);
    pruefe(gelesen.status === 200, 'Das Repository ist nicht lesbar: HTTP '
      + gelesen.status);
    pruefe(Array.isArray(gelesen.wert.topics)
      && gelesen.wert.topics.includes('dsh-board-station'),
    'Das Thema `dsh-board-station` fehlt: '
      + JSON.stringify(gelesen.wert.topics));

    // Anonym suchen: der Token liegt für diesen Teil nicht mehr im Zuhause.
    rmSync(join(liveHome, 'board', 'github.json'), { force: true });
    let gefunden = null;
    for (let versuch = 0; versuch < 40 && !gefunden; versuch += 1) {
      const katalog = await ruf(gebaut, '/board/katalog?frisch=1');
      pruefe(katalog.status === 200, 'Der Katalog antwortet '
        + katalog.status + ': ' + JSON.stringify(katalog.daten));
      gefunden = (katalog.daten.gefunden || [])
        .find((eintrag) => eintrag.repo === owner + '/' + repoName) || null;
      if (!gefunden) await new Promise((fertig) => setTimeout(fertig, 5000));
    }
    pruefe(gefunden, 'Die Station wurde nach 200 s nicht gefunden: '
      + owner + '/' + repoName);
    console.log('ok live: ' + owner + '/' + repoName
      + ' anonym im Katalog gefunden');
  } finally {
    if (angelegt) {
      const weg = await liveAnfrage(token,
        '/repos/' + owner + '/' + repoName, { methode: 'DELETE' });
      pruefe(weg.status === 204 || weg.status === 404,
        'Das Repository ließ sich nicht löschen: HTTP ' + weg.status);
    }
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    delete process.env.DSH_HOME;
    rmSync(liveHome, { recursive: true, force: true });
  }
}

if (process.env.BOARD_LIVE === '1') {
  await liveLauf();
} else {
  await offlineLauf();
}
