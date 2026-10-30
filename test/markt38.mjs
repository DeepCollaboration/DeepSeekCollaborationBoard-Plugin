/**
 * Prüfung Schritt 38 — Beitragen als Pull Request.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt38`, daneben ein
 * eigenes `DSH_HOME`. Ein nachgebildeter GitHub-Server liegt auf
 * `127.0.0.1`; er nimmt Pull Requests an, liest sie und führt sie zusammen.
 * Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. Ohne Token bleibt es beim Verweis auf GitHub: 409 mit `kann:false`,
 *      der Adresse und dem Hinweis, den Pull Request auf GitHub zu öffnen.
 *      Es wird kein Schreibaufruf an GitHub geschickt.
 *   2. Mit Token legt `/board/github/beitrag` den Pull Request #1 an; die
 *      Antwort nennt Nummer und Adresse, und der Pull Request liegt beim
 *      nachgebildeten Server.
 *   3. `/board/github/beitraege` zeigt den Stand: offen, zusammengeführt,
 *      geschlossen.
 *   4. Unter `beitraege/` entsteht keine Datei, `board.json` bleibt gleich,
 *      und in den lokalen Repositories entsteht kein Commit.
 *   5. Die Seite ruft für „Beitragen“ `/board/github/beitrag` mit
 *      `{ repo, titel, text, head, base }`; den alten Weg `/board/beitrag`
 *      ruft sie nicht mehr auf (Codeprüfung).
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
const ABLAGE = join(WURZEL, 'markt38');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const VORHABEN = join(FLAECHE, 'vorhaben-a');
const WORKFLOW = join(FLAECHE, 'workflow-a');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD_DATEI = join(BOARD, 'board.json');
const ORGANISATION = 'eigen';
const TOKEN = 'pruef-token';
const REPO = ORGANISATION + '/vorhaben-a';
const ADRESSE = 'https://github.com/' + REPO;

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
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

/** Ein lokales Repository mit einer Fassung und optional einem GitHub-Remote. */
function festschreiben(ordner, remote = '') {
  mkdirSync(ordner, { recursive: true });
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung',
  ]);
  git(ordner, ['tag', 'v1']);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
const PRS = [];
const anfragen = [];
let naechsteNummer = 1;

function pullAntwort(pr) {
  return {
    number: pr.nummer,
    title: pr.titel,
    body: pr.text,
    state: pr.state,
    merged_at: pr.merged_at,
    user: { login: pr.autor },
    html_url: ADRESSE + '/pull/' + pr.nummer,
    created_at: pr.erstellt,
    updated_at: pr.aktualisiert,
    head: { ref: pr.head },
    base: { ref: pr.base },
  };
}

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer(async (req, res) => {
      let roh = '';
      for await (const stueck of req) roh += stueck;
      const senden = (status, wert) => {
        const text = wert == null ? '' : JSON.stringify(wert);
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
      };
      const adresse = new URL(req.url, 'http://127.0.0.1');
      const pfad = adresse.pathname;
      const teile = pfad.split('/').filter(Boolean);
      anfragen.push(req.method + ' ' + pfad);

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login: 'p1', name: 'Thomas Heinrich' });
        return;
      }

      if (teile[0] === 'repos' && teile[1] === ORGANISATION
        && teile[2] === 'vorhaben-a') {
        // Das Schreibrecht des angemeldeten Logins.
        if (req.method === 'GET' && teile[3] === 'collaborators'
          && teile[5] === 'permission') {
          senden(200, { permission: 'push', role_name: 'push' });
          return;
        }
        // Die Beiträge: alle Zustände.
        if (req.method === 'GET' && teile[3] === 'pulls' && teile.length === 4) {
          senden(200, PRS.slice().reverse().map(pullAntwort));
          return;
        }
        // Ein einzelner Beitrag.
        if (req.method === 'GET' && teile[3] === 'pulls' && teile.length === 5) {
          const pr = PRS.find((eintrag) => eintrag.nummer === Number(teile[4]));
          if (!pr) { senden(404, { message: 'Not Found' }); return; }
          senden(200, pullAntwort(pr));
          return;
        }
        // Anlegen: der Pull Request #1 entsteht hier.
        if (req.method === 'POST' && teile[3] === 'pulls' && teile.length === 4) {
          let koerper = {};
          try { koerper = JSON.parse(roh || '{}'); } catch { koerper = {}; }
          if (!koerper.head || !koerper.base) {
            senden(422, { message: 'head und base sind Pflicht' });
            return;
          }
          const pr = {
            nummer: naechsteNummer,
            titel: String(koerper.title || ''),
            text: String(koerper.body || ''),
            head: String(koerper.head),
            base: String(koerper.base),
            autor: 'p1',
            state: 'open',
            merged_at: null,
            erstellt: '2026-10-29T02:00:00Z',
            aktualisiert: '2026-10-29T02:00:00Z',
          };
          naechsteNummer += 1;
          PRS.push(pr);
          senden(201, pullAntwort(pr));
          return;
        }
        // Die Metadaten des Repositories — für die Anzeige, nicht nötig zum Anlegen.
        if (req.method === 'GET' && teile.length === 3) {
          senden(200, {
            name: 'vorhaben-a',
            full_name: REPO,
            private: false,
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: 0,
            description: 'Das Vorhaben der Prüfung.',
            topics: [],
            default_branch: 'main',
            html_url: ADRESSE,
            pushed_at: null,
            license: null,
            archived: false,
            owner: { login: ORGANISATION },
          });
          return;
        }
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
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

function tokenAblegen(token) {
  mkdirSync(join(HOME, 'board'), { recursive: true });
  writeFileSync(join(HOME, 'board', 'github.json'),
    JSON.stringify({ token }) + '\n', { encoding: 'utf8', mode: 0o600 });
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  // Ein Workflow, ein Vorhaben mit GitHub-Remote und das Board, das beides
  // nennt.
  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom ersten Satz zum Produkt.',
    autor: 'p1',
    stationen: [],
    positionen: [],
    kanten: [],
    layout: 'frei',
    regeln: {},
  });
  writeFileSync(join(WORKFLOW, 'README.md'), '# Workflow\n', 'utf8');
  festschreiben(WORKFLOW);

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'vorhaben-a',
    name: 'Vorhaben A',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
  });
  writeFileSync(join(VORHABEN, 'README.md'), '# Vorhaben A\n', 'utf8');
  festschreiben(VORHABEN, ADRESSE + '.git');

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Testboard\n', 'utf8');
  festschreiben(BOARD);
  const boardVorher = readFileSync(BOARD_DATEI, 'utf8');

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
  process.env.DSH_GITHUB_API = await starteServer();

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  for (const route of ['/board/github/beitrag', '/board/github/beitraege']) {
    pruefe(gebaut.routen.has(route), 'Die Route ' + route + ' fehlt');
  }

  const beitrag = {
    repo: VORHABEN,
    titel: 'Idee schärfen',
    text: 'Der Beitrag als Pull Request.',
    head: 'beitrag/eins',
    base: 'main',
  };

  // 0. Das Board ist lesbar; die alte Ablage ist leer.
  const vorher = await ruf(gebaut, '/board/data');
  pruefe(vorher.status === 200, 'GET /board/data antwortet ' + vorher.status
    + ': ' + JSON.stringify(vorher.daten));
  pruefe(Array.isArray(vorher.daten.beitraege) && vorher.daten.beitraege.length === 0,
    'Die alte Ablage trägt schon einen Beitrag: '
      + JSON.stringify(vorher.daten.beitraege));

  // 1. Ohne Token bleibt es beim Verweis auf GitHub.
  const ohneToken = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(VORHABEN));
  pruefe(ohneToken.status === 200, 'Ohne Token antwortet die Liste '
    + ohneToken.status + ': ' + JSON.stringify(ohneToken.daten));
  pruefe(ohneToken.daten.kann === false, 'Ohne Token behauptet die Liste, '
    + 'ein Pull Request sei möglich: ' + JSON.stringify(ohneToken.daten));
  pruefe(ohneToken.daten.adresse === ADRESSE, 'Die GitHub-Adresse fehlt: '
    + JSON.stringify(ohneToken.daten.adresse));
  pruefe(Array.isArray(ohneToken.daten.beitraege)
    && ohneToken.daten.beitraege.length === 0,
  'Ohne Beiträge ist die Liste nicht leer: ' + JSON.stringify(ohneToken.daten));

  const abgewiesen = await ruf(gebaut, '/board/github/beitrag', beitrag);
  pruefe(abgewiesen.status === 409, 'Ohne Token antwortet das Anlegen '
    + abgewiesen.status + ': ' + JSON.stringify(abgewiesen.daten));
  pruefe(abgewiesen.daten.kann === false, 'Ohne Token fehlt „kann: false“: '
    + JSON.stringify(abgewiesen.daten));
  pruefe(abgewiesen.daten.adresse === ADRESSE, 'Der 409 nennt die '
    + 'GitHub-Adresse nicht: ' + JSON.stringify(abgewiesen.daten.adresse));
  pruefe(String(abgewiesen.daten.hinweis).includes('Pull Request auf GitHub öffnen'),
    'Der Hinweis auf GitHub fehlt: ' + JSON.stringify(abgewiesen.daten.hinweis));
  pruefe(PRS.length === 0, 'Ohne Token wurde ein Pull Request angelegt');
  pruefe(!anfragen.some((eintrag) => eintrag.startsWith('POST')),
    'Ohne Token ging ein Schreibaufruf an GitHub: ' + JSON.stringify(anfragen));
  console.log('ok ohne Token: der Weg bleibt der Verweis auf GitHub');

  // 2. Mit Token: der Pull Request #1 entsteht.
  tokenAblegen(TOKEN);
  const kopfVorher = git(VORHABEN, ['rev-parse', 'HEAD']);
  const boardKopfVorher = git(BOARD, ['rev-parse', 'HEAD']);

  const angelegt = await ruf(gebaut, '/board/github/beitrag', beitrag);
  pruefe(angelegt.status === 200, 'Mit Token antwortet das Anlegen '
    + angelegt.status + ': ' + JSON.stringify(angelegt.daten));
  pruefe(angelegt.daten.nummer === 1, 'Die Antwort nennt nicht den '
    + 'Pull Request #1: ' + JSON.stringify(angelegt.daten));
  pruefe(angelegt.daten.adresse === ADRESSE + '/pull/1', 'Die Antwort nennt '
    + 'nicht die Adresse des Pull Requests: '
    + JSON.stringify(angelegt.daten.adresse));
  pruefe(PRS.length === 1, 'Beim nachgebildeten Server liegt nicht genau ein '
    + 'Pull Request: ' + JSON.stringify(PRS.map((pr) => pr.nummer)));
  const pr = PRS[0];
  pruefe(pr.titel === beitrag.titel && pr.text === beitrag.text
    && pr.head === beitrag.head && pr.base === beitrag.base,
  'Der Pull Request trägt nicht Titel, Text und Zweige: ' + JSON.stringify(pr));
  console.log('ok mit Token: Pull Request #1 liegt beim Server, die Antwort nennt ihn');

  // 3. Der Stand ist sichtbar: offen, zusammengeführt, geschlossen.
  const einzeln = await ruf(gebaut, '/board/github/beitrag?repo='
    + encodeURIComponent(VORHABEN) + '&nummer=1');
  pruefe(einzeln.status === 200, 'Der einzelne Beitrag antwortet '
    + einzeln.status + ': ' + JSON.stringify(einzeln.daten));
  pruefe(einzeln.daten.beitrag && einzeln.daten.beitrag.nummer === 1,
    'Der einzelne Beitrag nennt nicht die Nummer 1: '
      + JSON.stringify(einzeln.daten));

  const offen = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(VORHABEN));
  pruefe(offen.status === 200, 'Die Liste antwortet ' + offen.status + ': '
    + JSON.stringify(offen.daten));
  pruefe(Array.isArray(offen.daten.beitraege) && offen.daten.beitraege.length === 1,
    'Die Liste zeigt nicht genau einen Beitrag: ' + JSON.stringify(offen.daten));
  pruefe(offen.daten.beitraege[0].zustand === 'offen',
    'Der frische Beitrag heißt nicht „offen“: '
      + JSON.stringify(offen.daten.beitraege[0]));

  pr.state = 'closed';
  pr.merged_at = '2026-10-29T03:00:00Z';
  const zusammengefuehrt = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(VORHABEN));
  pruefe(zusammengefuehrt.daten.beitraege[0].zustand === 'zusammengeführt',
    'Der zusammengeführte Beitrag heißt nicht „zusammengeführt“: '
      + JSON.stringify(zusammengefuehrt.daten.beitraege[0]));

  pr.merged_at = null;
  const geschlossen = await ruf(gebaut, '/board/github/beitraege?repo='
    + encodeURIComponent(VORHABEN));
  pruefe(geschlossen.daten.beitraege[0].zustand === 'geschlossen',
    'Der abgelehnte Beitrag heißt nicht „geschlossen“: '
      + JSON.stringify(geschlossen.daten.beitraege[0]));
  console.log('ok Stand: offen, zusammengeführt und geschlossen sichtbar');

  // 4. Keine lokale Ablage: kein Ordner, kein Eintrag, kein Commit.
  pruefe(!existsSync(join(BOARD, 'beitraege')),
    'Unter dem Board ist ein Ordner beitraege/ entstanden');
  pruefe(!existsSync(join(VORHABEN, 'beitraege')),
    'Im Vorhaben ist ein Ordner beitraege/ entstanden');
  pruefe(readFileSync(BOARD_DATEI, 'utf8') === boardVorher,
    'board.json wurde durch den Beitrag verändert');
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVorher,
    'Der Beitrag hat einen Commit im Vorhaben angelegt');
  pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopfVorher,
    'Der Beitrag hat einen Commit im Board angelegt');
  pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
    'Der Beitrag hat Dateien im Vorhaben verändert');
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Der Beitrag hat Dateien im Board verändert');
  const nachher = await ruf(gebaut, '/board/data');
  pruefe(Array.isArray(nachher.daten.beitraege) && nachher.daten.beitraege.length === 0,
    'Die alte Ablage trägt den Beitrag: ' + JSON.stringify(nachher.daten.beitraege));
  console.log('ok keine Ablage: kein beitraege-Ordner, kein Eintrag, kein Commit');

  // 5. Die Seite: der alte Weg wird nicht mehr aufgerufen (Codeprüfung).
  const clientText = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
  pruefe(clientText.includes("'/board/github/beitrag'"),
    'client.js ruft /board/github/beitrag nicht auf');
  pruefe(clientText.includes("'/board/github/beitraege?repo='"),
    'client.js liest den Stand nicht über /board/github/beitraege');
  pruefe(!clientText.includes("poste('/board/beitrag'"),
    'client.js ruft noch den alten Weg /board/beitrag auf');
  const stelle = clientText.indexOf("fetch('/board/github/beitrag'");
  const block = clientText.slice(stelle, stelle + 700);
  for (const feld of ['repo: ort', 'titel: form.titel', 'text: form.text',
    'head: form.head', 'base: form.base']) {
    pruefe(block.includes(feld), 'Dem Pull-Request-Aufruf fehlt „' + feld + '“');
  }
  pruefe(clientText.includes("'Beitragen'"),
    'Die Seite bietet „Beitragen“ nicht an');
  for (const wort of ["'offen'", "'zusammengeführt'", "'geschlossen'"]) {
    pruefe(clientText.includes(wort),
      'Die Seite zeigt den Stand „' + wort + '“ nicht');
  }
  console.log('ok Anzeige: Beitrag als Pull Request, der alte Weg wird nicht gerufen');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await stoppeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Beitrag: Pull Request, kein beitraege-Ordner, Stand sichtbar');
