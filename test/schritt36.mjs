/**
 * Prüfung Schritt 36 — Verantwortung und Teams.
 *
 * Unter `/tmp/board-scheibe1/schritt36` entstehen ein Board der Fassung 2 mit
 * drei Stationen, einem Workflow und einem Vorhaben an „umsetzen“. Station,
 * Workflow und Vorhaben tragen einen GitHub-Remote; ein nachgebildeter
 * GitHub-Server kennt die Teams der Organisation und die Schreibrechte.
 *
 * Geprüft wird:
 *
 *   1. `/board/data` nennt je Vorhaben `verantwortlicheJeStation` und je
 *      Station `host` und `sichtbarkeit`.
 *   2. Das Vorhaben steht an „umsetzen“; `thomas` ist dort eingetragen und
 *      darf verschieben (200, Commit nur `vorhaben.json`).
 *   3. `fremd` ist nicht eingetragen und nicht im Team: 403 ohne Commit.
 *   4. `anna` ist nicht eingetragen, aber Mitglied des Teams „vorhaben“:
 *      verschieben ist erlaubt (200).
 *   5. `/board/workflow/station`: der Host `thomas` darf die Station
 *      „prüfen“ in den Workflow stellen; `fremd` erhält 403 ohne Commit.
 *   6. `/board/github/teams` liefert Team, Schlüssel und Mitglieder; ohne
 *      Token kommt `{ kann: false, hinweis: 'Teams nur mit Token' }`.
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
const ABLAGE = join(WURZEL, 'schritt36');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION_IDEE = join(FLAECHE, 'station-idee');
const STATION_UMSETZEN = join(FLAECHE, 'station-umsetzen');
const STATION_PRUEFEN = join(FLAECHE, 'station-pruefen');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const VORHABEN = join(FLAECHE, 'vorhaben-board-gesamtkonzept');
const ORGANISATION = 'DeepCollaboration';
const VORHABEN_ID = 'board-gesamtkonzept';
const TOKEN_THOMAS = 'token-thomas';
const TOKEN_FREMD = 'token-fremd';
const TOKEN_ANNA = 'token-anna';
const LOGIN_VON_TOKEN = new Map([
  [TOKEN_THOMAS, 'thomas'],
  [TOKEN_FREMD, 'fremd'],
  [TOKEN_ANNA, 'anna'],
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

/** Ein Repository mit einer Fassung `v1`; auf Wunsch mit GitHub-Remote. */
function festschreiben(ordner, name, mitRemote = true) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
  git(ordner, ['tag', 'v1']);
  if (mitRemote) {
    git(ordner, ['remote', 'add', 'origin', 'https://github.com/'
      + ORGANISATION + '/' + name + '.git']);
  }
}

function station(id, name, host) {
  schreibeJson(join(FLAECHE, 'station-' + id, 'station.json'), {
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
  });
  writeFileSync(join(FLAECHE, 'station-' + id, 'README.md'), '# ' + name + '\n', 'utf8');
  festschreiben(join(FLAECHE, 'station-' + id), 'station-' + id);
}

/** Das Board der Fassung 2: ein Vorhaben an „umsetzen“. */
function legeFlaeche() {
  station('idee', 'Idee', 'thomas');
  station('umsetzen', 'Umsetzen', 'thomas');
  station('pruefen', 'Prüfen', 'thomas');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zum Produkt.',
    // Der Autor ist nicht der Host: die Station „prüfen“ gehört thomas.
    autor: 'p1',
    stationen: [
      { repo: STATION_IDEE, fassung: 'v1', id: 'idee' },
      { repo: STATION_UMSETZEN, fassung: 'v1', id: 'umsetzen' },
    ],
    positionen: [
      { id: 'idee', station: 'idee', x: 40, y: 80, bedingung: [] },
      { id: 'umsetzen', station: 'umsetzen', x: 360, y: 80, bedingung: [] },
    ],
    kanten: [{ von: 'idee', nach: 'umsetzen' }],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'workflow-standard');

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: VORHABEN_ID,
    name: 'Board Gesamtkonzept',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'umsetzen',
    verantwortliche: { umsetzen: ['thomas'] },
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
    stationen: [
      { repo: STATION_IDEE },
      { repo: STATION_UMSETZEN },
      { repo: STATION_PRUEFEN },
    ],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  // Das Board selbst bleibt lokal: die Identitätsänderung soll keine
  // Weitergabe an einen echten Remote versuchen.
  festschreiben(BOARD, 'board-hauptboard', false);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

const TEAMS = [{
  slug: 'vorhaben',
  name: 'vorhaben',
  description: 'Die Vorhaben des Boards',
  privacy: 'closed',
  members_count: 1,
}];
const TEAM_MITGLIEDER = {
  vorhaben: [{ login: 'anna', name: 'Anna Beispiel', html_url: 'https://github.com/anna' }],
};

let server = null;
let basis = '';
const anfragen = [];

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer(async (req, res) => {
      for await (const stueck of req) { /* Körper lesen, hier ohne Inhalt */ }
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
      anfragen.push(req.method + ' ' + pfad);
      const kopf = String(req.headers.authorization || '');
      const token = kopf.replace(/^Bearer\s+/i, '');
      const login = LOGIN_VON_TOKEN.get(token) || 'p1';

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login });
        return;
      }

      // Die Teams der Organisation und ihre Mitglieder.
      if (req.method === 'GET' && teile[0] === 'orgs'
        && teile[1] === ORGANISATION) {
        if (teile[2] === 'teams' && teile.length === 3) {
          senden(200, TEAMS);
          return;
        }
        if (teile[2] === 'teams' && teile[4] === 'members') {
          senden(200, TEAM_MITGLIEDER[teile[3]] || []);
          return;
        }
      }

      // Das Schreibrecht an den Repositories: alle dürfen schreiben.
      if (teile[0] === 'repos' && teile.length >= 3) {
        if (teile[3] === 'collaborators' && teile[5] === 'permission') {
          senden(200, { permission: 'push', role_name: 'push' });
          return;
        }
        if (req.method === 'GET' && teile.length === 3) {
          senden(200, {
            name: teile[2],
            full_name: teile[1] + '/' + teile[2],
            private: false,
            stargazers_count: 0,
            forks_count: 0,
            open_issues_count: 0,
            description: 'Prüf-Repository',
            topics: [],
            default_branch: 'main',
            html_url: 'https://github.com/' + teile[1] + '/' + teile[2],
            pushed_at: null,
            license: null,
            archived: false,
            owner: { login: teile[1] },
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

/** Die Identität wechseln: Name, GitHub-Name und Token gehören zusammen. */
async function setzeIdentitaet(gebaut, name, github, token) {
  const ident = await ruf(gebaut, '/board/identitaet', {
    name, github, farbe: '#fbbf24',
  });
  pruefe(ident.status === 200, 'Die Identität „' + github + '“ antwortet '
    + ident.status + ': ' + ident.text);
  const t = await ruf(gebaut, '/board/github/token', { token });
  pruefe(t.status === 200, 'Der Token für „' + github + '“ antwortet '
    + t.status + ': ' + t.text);
}

function liesVorhabenDatei() {
  return JSON.parse(readFileSync(join(VORHABEN, 'vorhaben.json'), 'utf8'));
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
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas', github: 'thomas', farbe: '#fbbf24',
  });
  tokenAblegen(TOKEN_THOMAS);

  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;
  process.env.DSH_GITHUB_ORG = ORGANISATION;

  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/github/teams'),
    'Die Route /board/github/teams fehlt');

  // 1. Das Bild trägt die Verantwortlichen je Station, Host und Sichtbarkeit.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, '/board/data antwortet ' + daten.status
    + ': ' + daten.text);
  const vorgang = (daten.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(vorgang && vorgang.position === 'umsetzen',
    'Das Vorhaben steht nicht an „umsetzen“: ' + JSON.stringify(vorgang));
  pruefe(vorgang.verantwortlicheJeStation
    && Array.isArray(vorgang.verantwortlicheJeStation.umsetzen)
    && vorgang.verantwortlicheJeStation.umsetzen.includes('thomas'),
  'verantwortlicheJeStation fehlt oder nennt thomas nicht: '
    + JSON.stringify(vorgang.verantwortlicheJeStation));
  const stationUmsetzen = (daten.daten.stationen || [])
    .find((eintrag) => eintrag.id === 'umsetzen');
  pruefe(stationUmsetzen && stationUmsetzen.host === 'thomas',
    'Die Station „umsetzen“ trägt nicht ihren Host: '
      + JSON.stringify(stationUmsetzen));
  pruefe(stationUmsetzen.sichtbarkeit === 'öffentlich',
    'Die Station „umsetzen“ trägt nicht ihre Sichtbarkeit: '
      + JSON.stringify(stationUmsetzen.sichtbarkeit));

  // 2. Die Teams-Route: Name, Schlüssel und Mitglieder.
  const teams = await ruf(gebaut, '/board/github/teams');
  pruefe(teams.status === 200 && teams.daten.kann === true,
    'Die Teams-Route antwortet ' + teams.status + ': ' + teams.text);
  const team = (teams.daten.teams || []).find(
    (eintrag) => (eintrag.schluessel || eintrag.key) === 'vorhaben',
  );
  pruefe(team && team.name === 'vorhaben',
    'Das Team „vorhaben“ fehlt: ' + JSON.stringify(teams.daten.teams));
  pruefe(Array.isArray(team.mitglieder) && team.mitglieder.includes('anna'),
    'Das Team „vorhaben“ nennt anna nicht: ' + JSON.stringify(team));

  // 3. thomas ist eingetragen: verschieben ist erlaubt und wird gefasst.
  const kopfVorher = git(VORHABEN, ['rev-parse', 'HEAD']);
  const verschoben = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'idee',
  });
  pruefe(verschoben.status === 200, 'thomas darf nicht verschieben: '
    + verschoben.status + ' ' + verschoben.text);
  const dateiNachThomas = liesVorhabenDatei();
  pruefe(dateiNachThomas.position === 'idee',
    'vorhaben.json steht nach dem Verschieben nicht an „idee“: '
      + JSON.stringify(dateiNachThomas.position));
  pruefe(dateiNachThomas.verantwortliche.idee.includes('thomas'),
    'An „idee“ steht thomas nicht als Verantwortlicher: '
      + JSON.stringify(dateiNachThomas.verantwortliche));
  const kopfNachThomas = git(VORHABEN, ['rev-parse', 'HEAD']);
  pruefe(kopfNachThomas !== kopfVorher,
    'Das Verschieben hat keinen Commit hinterlassen');
  const geaendert = git(VORHABEN, ['log', '-1', '--format=', '--name-only'])
    .split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  pruefe(geaendert.length === 1 && geaendert[0] === 'vorhaben.json',
    'Der Commit nennt nicht nur vorhaben.json: ' + JSON.stringify(geaendert));

  // 4. fremd ist weder eingetragen noch im Team: 403, kein Commit.
  await setzeIdentitaet(gebaut, 'Max Fremd', 'fremd', TOKEN_FREMD);
  const kopfVorFremd = git(VORHABEN, ['rev-parse', 'HEAD']);
  const statusVorFremd = git(VORHABEN, ['status', '--porcelain']);
  const fremd = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'umsetzen',
  });
  pruefe(fremd.status === 403, 'fremd darf verschieben: '
    + fremd.status + ' ' + fremd.text);
  pruefe(String(fremd.daten.error).includes('Nicht verantwortlich für diese Station'),
    'Der 403 nennt die Verantwortung nicht: ' + fremd.text);
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVorFremd,
    'Der abgewiesene fremde Zug hat einen Commit hinterlassen');
  pruefe(git(VORHABEN, ['status', '--porcelain']) === statusVorFremd,
    'Der abgewiesene fremde Zug hat Dateien verändert');

  // 5. anna steht nicht in der Liste, ist aber im Team „vorhaben“.
  await setzeIdentitaet(gebaut, 'Anna Beispiel', 'anna', TOKEN_ANNA);
  const anna = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'umsetzen',
  });
  pruefe(anna.status === 200, 'anna darf über das Team nicht verschieben: '
    + anna.status + ' ' + anna.text);
  pruefe(liesVorhabenDatei().position === 'umsetzen',
    'anna hat das Vorhaben nicht nach „umsetzen“ verschoben: '
      + JSON.stringify(liesVorhabenDatei().position));

  // 6. Die Station „prüfen“ gehört thomas; er stellt sie in den Workflow.
  await setzeIdentitaet(gebaut, 'Thomas', 'thomas', TOKEN_THOMAS);
  const workflowKopfVorher = git(WORKFLOW, ['rev-parse', 'HEAD']);
  const gestellt = await ruf(gebaut, '/board/workflow/station', { station: 'pruefen' });
  pruefe(gestellt.status === 200, 'Der Host darf die Station nicht stellen: '
    + gestellt.status + ' ' + gestellt.text);
  const workflowDatei = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
  pruefe(workflowDatei.stationen.some(
    (eintrag) => eintrag.repo === STATION_PRUEFEN || eintrag.id === 'pruefen',
  ), 'Die Station „prüfen“ steht nicht im Workflow: '
    + JSON.stringify(workflowDatei.stationen));
  pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) !== workflowKopfVorher,
    'Das Stellen der Station hat keinen Commit hinterlassen');

  // 7. fremd ist nicht Host und nicht Autor: 403, kein Commit.
  await setzeIdentitaet(gebaut, 'Max Fremd', 'fremd', TOKEN_FREMD);
  const workflowKopfFremd = git(WORKFLOW, ['rev-parse', 'HEAD']);
  const workflowStatusFremd = git(WORKFLOW, ['status', '--porcelain']);
  const stationFremd = await ruf(gebaut, '/board/workflow/station', {
    station: 'pruefen',
  });
  pruefe(stationFremd.status === 403, 'fremd darf die Station stellen: '
    + stationFremd.status + ' ' + stationFremd.text);
  pruefe(String(stationFremd.daten.error).includes('Nicht verantwortlich'),
    'Der 403 der Station nennt die Verantwortung nicht: ' + stationFremd.text);
  pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) === workflowKopfFremd,
    'Der abgewiesene Stationsweg hat einen Commit hinterlassen');
  pruefe(git(WORKFLOW, ['status', '--porcelain']) === workflowStatusFremd,
    'Der abgewiesene Stationsweg hat Dateien verändert');

  // 8. Ohne Token gibt es keine Teams, nur den Hinweis.
  const weg = await ruf(gebaut, '/board/github/token', { loeschen: true });
  pruefe(weg.status === 200, 'Der Token ließ sich nicht löschen: ' + weg.text);
  const ohneToken = await ruf(gebaut, '/board/github/teams');
  pruefe(ohneToken.status === 200 && ohneToken.daten.kann === false,
    'Ohne Token behauptet die Teams-Route Zugang: ' + ohneToken.text);
  pruefe(ohneToken.daten.hinweis === 'Teams nur mit Token',
    'Der Hinweis ohne Token fehlt: ' + JSON.stringify(ohneToken.daten.hinweis));
  pruefe(Array.isArray(ohneToken.daten.teams) && ohneToken.daten.teams.length === 0,
    'Ohne Token kommen trotzdem Teams: ' + ohneToken.text);

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await beendeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_GITHUB_ORG;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Verantwortung: thomas darf, fremd 403, anna über Team, '
  + 'Host prüft, Teams sichtbar');
