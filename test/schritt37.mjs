/**
 * Prüfung Schritt 37 — Forken und Fragen.
 *
 * Unter `/tmp/board-scheibe1/schritt37` entstehen ein Board der Fassung 2 mit
 * Station, Workflow und Vorhaben, alle als eigene Repositories mit
 * GitHub-Remote. Ein nachgebildeter GitHub-Server legt Forks und Fragen an,
 * listet offene und geschlossene Fragen und filtert Pull Requests aus der
 * Fragenliste.
 *
 * Geprüft wird:
 *
 *   1. Ohne Token sind die Fragen eines öffentlichen Repositories lesbar;
 *      die Antwort trägt `kann:false` und die GitHub-Adresse.
 *   2. Ohne Token entsteht keine Frage und kein Fork: 409 mit Adresse und
 *      Verweis auf GitHub, ohne dass ein Schreibaufruf hinausgeht.
 *   3. Mit Token legt `POST /board/github/fork` einen Fork an; Antwort und
 *      Verweis nennen `anna/station-idee`.
 *   4. Mit Token legt `POST /board/github/frage` Frage #1 an; die Liste zeigt
 *      sie als „offen“ und lässt den Pull Request weg.
 *   5. Nach dem Schließen bleibt Frage #1 sichtbar und heißt „geschlossen“.
 *   6. Ein fremdes Repository wird vor jedem GitHub-Aufruf mit 403
 *      abgewiesen — für Frage und Fork.
 *   7. Kein Commit und keine Änderung in den lokalen Repositories.
 *
 * Kein echter GitHub-Aufruf; Ablage und Home werden danach entfernt.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt37');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const VORHABEN = join(FLAECHE, 'vorhaben-board-gesamtkonzept');
const FREMD = join(FLAECHE, 'fremd-repo');
const ORGANISATION = 'DeepCollaboration';
const TOKEN = 'pruef-token';
const STATION_REPO = ORGANISATION + '/station-idee';
const VORHABEN_REPO = ORGANISATION + '/vorhaben-board-gesamtkonzept';
const FREMD_REPO = ORGANISATION + '/fremd-repo';
const VORHABEN_ADRESSE = 'https://github.com/' + VORHABEN_REPO;
/** Die Repositories, die der nachgebildete Server kennt. */
const BEKANNT = new Set([
  'board-hauptboard', 'station-idee', 'workflow-standard',
  'vorhaben-board-gesamtkonzept',
]);

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

/** Ein Repository mit einer Fassung `v1` und einem GitHub-Remote. */
function festschreiben(ordner, name) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  git(ordner, ['tag', 'v1']);
  git(ordner, ['remote', 'add', 'origin', 'https://github.com/'
    + ORGANISATION + '/' + name + '.git']);
}

/** Das Board der Fassung 2: eine Station, ein Workflow, ein Vorhaben. */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'idee',
    name: 'Idee',
    beschreibung: 'Thema in einem Satz festhalten.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Thema in einem Satz festhalten.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['idee'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION, 'station-idee');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom ersten Satz zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: STATION, fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
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

  // Ein Repository mit GitHub-Remote, das das Board nicht nennt.
  mkdirSync(FREMD, { recursive: true });
  writeFileSync(join(FREMD, 'README.md'), '# Fremd\n', 'utf8');
  festschreiben(FREMD, 'fremd-repo');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(BOARD, 'board-hauptboard');
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
const FRAGEN = [];
const FORKS = [];
const anfragen = [];
let naechsteFrage = 1;

/** Die GitHub-Form einer Frage — ein Issue ohne `pull_request`. */
function frageAntwort(frage) {
  return {
    number: frage.nummer,
    title: frage.titel,
    body: frage.text,
    state: frage.state,
    user: { login: frage.autor || 'p1' },
    html_url: 'https://github.com/' + frage.repo + '/issues/' + frage.nummer,
    created_at: frage.erstellt,
    updated_at: frage.aktualisiert || frage.erstellt,
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
      const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
      const teile = pfad.split('/').filter(Boolean);
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      anfragen.push(req.method + ' ' + pfad);

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login: token === TOKEN ? 'p1' : 'fremd' });
        return;
      }
      if (teile[0] === 'repos' && teile.length >= 3) {
        const owner = teile[1];
        const name = teile[2];
        const repo = owner + '/' + name;
        if (!BEKANNT.has(name)) {
          senden(404, { message: 'Not Found' });
          return;
        }

        // Die Fragen: alle Zustände, der neueste zuerst. Dazu ein Pull
        // Request, den die Liste weglassen muss.
        if (req.method === 'GET' && teile[3] === 'issues' && teile.length === 4) {
          senden(200, [
            ...FRAGEN.filter((frage) => frage.repo === repo).slice().reverse()
              .map(frageAntwort),
            {
              number: 99,
              title: 'Ein Beitrag, keine Frage',
              state: 'open',
              html_url: 'https://github.com/' + repo + '/pull/99',
              pull_request: { url: 'https://api.github.com/repos/' + repo + '/pulls/99' },
            },
          ]);
          return;
        }

        // Eine Frage anlegen.
        if (req.method === 'POST' && teile[3] === 'issues' && teile.length === 4) {
          let koerper = {};
          try { koerper = JSON.parse(roh || '{}'); } catch { koerper = {}; }
          if (!String(koerper.title || '').trim()) {
            senden(422, { message: 'title fehlt' });
            return;
          }
          const frage = {
            repo,
            nummer: naechsteFrage,
            titel: String(koerper.title),
            text: String(koerper.body || ''),
            state: 'open',
            erstellt: '2026-10-28T10:00:00Z',
          };
          naechsteFrage += 1;
          FRAGEN.push(frage);
          senden(201, frageAntwort(frage));
          return;
        }

        // Einen Fork anlegen: die Kopie gehört der angemeldeten Person.
        if (req.method === 'POST' && teile[3] === 'forks' && teile.length === 4) {
          FORKS.push({ repo, token });
          senden(202, {
            name,
            full_name: 'anna/' + name,
            html_url: 'https://github.com/anna/' + name,
            owner: { login: 'anna' },
            private: false,
          });
          return;
        }

        // Die Metadaten eines Repositories.
        if (req.method === 'GET' && teile.length === 3) {
          senden(200, {
            name,
            full_name: repo,
            private: false,
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: FRAGEN.filter((frage) => frage.repo === repo
              && frage.state === 'open').length,
            description: 'Prüf-Repository',
            topics: [],
            default_branch: 'main',
            html_url: 'https://github.com/' + repo,
            pushed_at: null,
            license: null,
            archived: false,
            owner: { login: owner },
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

function beendeServer() {
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
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(
    anfrage(pfad, koerper), res,
  );
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
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
  legeFlaeche();
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1,
    aktiv: 'hauptboard-2',
    boards: [{
      id: 'hauptboard-2', name: 'Hauptboard', format: 2, art: 'hauptboard',
      repo: BOARD, remote: null, person: 'p1', sichtbarkeit: 'öffentlich',
    }],
  });

  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;

  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/github/fragen'),
    'Die Route /board/github/fragen fehlt');
  pruefe(gebaut.routen.has('/board/github/frage'),
    'Die Route /board/github/frage fehlt');
  pruefe(gebaut.routen.has('/board/github/fork'),
    'Die Route /board/github/fork fehlt');

  const fragenListe = '/board/github/fragen?repo=' + encodeURIComponent(VORHABEN);

  // 1. Ohne Token: öffentlich lesbar, aber keine Handlung möglich.
  const ohneToken = await ruf(gebaut, fragenListe);
  pruefe(ohneToken.status === 200, 'Ohne Token antwortet die Fragenliste '
    + ohneToken.status + ': ' + ohneToken.text);
  pruefe(ohneToken.daten.kann === false, 'Ohne Token behauptet die Liste, '
    + 'eine Frage sei möglich: ' + ohneToken.text);
  pruefe(ohneToken.daten.adresse === VORHABEN_ADRESSE, 'Die GitHub-Adresse '
    + 'fehlt: ' + JSON.stringify(ohneToken.daten.adresse));
  pruefe(Array.isArray(ohneToken.daten.fragen) && ohneToken.daten.fragen.length === 0,
    'Ohne Fragen ist die Liste nicht leer: ' + ohneToken.text);

  // Ein privates Repository ohne Token bleibt ein Verweis.
  const geheim = await ruf(gebaut, '/board/github/fragen?repo='
    + encodeURIComponent(ORGANISATION + '/geheim'));
  pruefe(geheim.status === 200 && geheim.daten.kann === false
    && geheim.daten.adresse === 'https://github.com/' + ORGANISATION + '/geheim'
    && geheim.daten.fragen.length === 0,
  'Ein nicht lesbares Repository antwortet nicht mit dem Verweis: ' + geheim.text);

  // 2. Ohne Token entsteht keine Frage und kein Fork.
  const ohneFrage = await ruf(gebaut, '/board/github/frage', {
    repo: VORHABEN,
    titel: 'Geht das ohne Token?',
    text: 'Nein.',
  });
  pruefe(ohneFrage.status === 409, 'Ohne Token antwortet das Fragen '
    + ohneFrage.status + ': ' + ohneFrage.text);
  pruefe(ohneFrage.daten.kann === false, 'Ohne Token fehlt „kann: false“: '
    + ohneFrage.text);
  pruefe(ohneFrage.daten.adresse === VORHABEN_ADRESSE, 'Der 409 nennt die '
    + 'GitHub-Adresse nicht: ' + ohneFrage.text);
  pruefe(String(ohneFrage.daten.hinweis).includes('GitHub'),
    'Der Hinweis auf GitHub fehlt: ' + JSON.stringify(ohneFrage.daten.hinweis));

  const ohneFork = await ruf(gebaut, '/board/github/fork', { repo: STATION });
  pruefe(ohneFork.status === 409, 'Ohne Token antwortet das Forken '
    + ohneFork.status + ': ' + ohneFork.text);
  pruefe(ohneFork.daten.adresse === 'https://github.com/' + STATION_REPO,
    'Der 409 nennt die GitHub-Adresse des Repositories nicht: ' + ohneFork.text);
  pruefe(FRAGEN.length === 0 && FORKS.length === 0,
    'Ohne Token wurde eine Frage oder ein Fork angelegt');
  pruefe(!anfragen.some((eintrag) => eintrag.startsWith('POST')),
    'Ohne Token ging ein Schreibaufruf an GitHub: ' + JSON.stringify(anfragen));

  // 3. Ein fremdes Repository wird vor jedem Aufruf abgewiesen.
  const vorherFremd = anfragen.length;
  const fremdFrage = await ruf(gebaut, '/board/github/frage', {
    repo: FREMD_REPO,
    titel: 'Nicht aus dem Board',
    text: '',
  });
  pruefe(fremdFrage.status === 403, 'Eine Frage an ein fremdes Repository '
    + 'antwortet ' + fremdFrage.status + ': ' + fremdFrage.text);
  pruefe(String(fremdFrage.daten.error).includes(FREMD_REPO),
    'Der Fehler nennt das fremde Repository nicht: ' + fremdFrage.text);
  pruefe(anfragen.length === vorherFremd,
    'Für die fremde Frage ging ein Aufruf an GitHub: '
      + JSON.stringify(anfragen.slice(vorherFremd)));

  const fremdFork = await ruf(gebaut, '/board/github/fork', { repo: FREMD });
  pruefe(fremdFork.status === 403, 'Ein Fork eines fremden lokalen Ordners '
    + 'antwortet ' + fremdFork.status + ': ' + fremdFork.text);
  pruefe(anfragen.length === vorherFremd,
    'Für den fremden Fork ging ein Aufruf an GitHub: '
      + JSON.stringify(anfragen.slice(vorherFremd)));
  pruefe(!anfragen.some((eintrag) => String(eintrag).includes('fremd-repo')),
    'Für das fremde Repository wurde GitHub gefragt: ' + JSON.stringify(anfragen));

  // 4. Mit Token: der Fork der Station gehört „anna“.
  tokenAblegen(TOKEN);
  const kopfVorher = git(VORHABEN, ['rev-parse', 'HEAD']);

  const geforkt = await ruf(gebaut, '/board/github/fork', { repo: STATION });
  pruefe(geforkt.status === 200, 'Mit Token antwortet das Forken '
    + geforkt.status + ': ' + geforkt.text);
  const fork = geforkt.daten.fork || {};
  pruefe(fork.vollerName === 'anna/station-idee', 'Der Fork heißt nicht '
    + '„anna/station-idee“: ' + JSON.stringify(fork));
  pruefe(fork.adresse === 'https://github.com/anna/station-idee',
    'Die Adresse des Forks stimmt nicht: ' + JSON.stringify(fork.adresse));
  pruefe(fork.eigentuemer === 'anna', 'Der Eigentümer des Forks fehlt: '
    + JSON.stringify(fork.eigentuemer));
  pruefe(FORKS.length === 1, 'Bei GitHub wurde nicht genau ein Fork angelegt: '
    + JSON.stringify(FORKS));

  // 5. Mit Token: Frage #1 anlegen; sie ist offen und ohne Pull Request.
  const angelegt = await ruf(gebaut, '/board/github/frage', {
    repo: VORHABEN,
    titel: 'Wie geht es weiter?',
    text: 'Bitte um Rat.',
  });
  pruefe(angelegt.status === 200, 'Mit Token antwortet das Fragen '
    + angelegt.status + ': ' + angelegt.text);
  pruefe(angelegt.daten.nummer === 1, 'Die angelegte Frage hat nicht die '
    + 'Nummer 1: ' + angelegt.text);
  pruefe(angelegt.daten.adresse === VORHABEN_ADRESSE + '/issues/1',
    'Die Adresse der Frage stimmt nicht: ' + JSON.stringify(angelegt.daten.adresse));
  pruefe(FRAGEN.length === 1 && FRAGEN[0].titel === 'Wie geht es weiter?'
    && FRAGEN[0].text === 'Bitte um Rat.',
  'Die Frage trägt nicht Titel und Text: ' + JSON.stringify(FRAGEN[0]));

  const mitToken = await ruf(gebaut, fragenListe);
  pruefe(mitToken.status === 200, 'Mit Token antwortet die Fragenliste '
    + mitToken.status + ': ' + mitToken.text);
  pruefe(mitToken.daten.kann === true, 'Mit Token fehlt „kann: true“: '
    + mitToken.text);
  pruefe(mitToken.daten.fragen.length === 1, 'Die Liste zeigt nicht genau '
    + 'eine Frage — der Pull Request gehört nicht hinein: ' + mitToken.text);
  const erster = mitToken.daten.fragen[0];
  pruefe(erster.nummer === 1 && erster.titel === 'Wie geht es weiter?'
    && erster.zustand === 'offen',
  'Frage #1 steht nicht als „offen“ in der Liste: ' + JSON.stringify(erster));

  // 6. Nach dem Schließen bleibt sie sichtbar und heißt „geschlossen“.
  FRAGEN[0].state = 'closed';
  const geschlossen = await ruf(gebaut, fragenListe);
  pruefe(geschlossen.daten.fragen.length === 1, 'Die geschlossene Frage '
    + 'verschwindet: ' + geschlossen.text);
  const bleibt = geschlossen.daten.fragen[0];
  pruefe(bleibt.nummer === 1 && bleibt.zustand === 'geschlossen',
    'Die geschlossene Frage heißt nicht „geschlossen“: ' + JSON.stringify(bleibt));

  // 7. Kein Commit und keine Änderung in den lokalen Repositories.
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVorher,
    'Fork oder Frage haben einen Commit im lokalen Repository angelegt');
  pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
    'Fork oder Frage haben Dateien im Vorhaben verändert');
  pruefe(git(STATION, ['status', '--porcelain']) === '',
    'Fork oder Frage haben die Station verändert');
  pruefe(git(BOARD, ['status', '--porcelain']) === '',
    'Fork oder Frage haben das Board verändert');

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
console.log('ok Fork und Frage: ohne Token Verweis, Fork verlinkt, '
  + 'Frage #1 offen, geschlossen sichtbar');
