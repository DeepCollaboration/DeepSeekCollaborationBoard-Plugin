/**
 * Prüfung Schritt 39 — Verantwortung und Veröffentlichen.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt39`. Das Board
 * `board-team` liegt in `flaeche/`; seine eigenen Repositories liegen als
 * Geschwister daneben (so liegt die Fassung 2). Die fremde Station liegt
 * außerhalb dieser Fläche unter `fremd/` und gehört einem anderen Eigentümer:
 * ihr Remote zeigt auf `fremd/station-fremd`. Ein nachgebildeter
 * GitHub-Server liegt auf `127.0.0.1`, die Remotes sind lokale
 * Bare-Repositories. Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   1. `/board/data` nennt je Vorhaben die Verantwortlichen je Position
 *      (`verantwortlicheJeStation`, `verantwortet`); fehlt die Angabe, bleibt
 *      die Liste leer — die Karte sagt das dann (Codeprüfung in `client.js`).
 *   2. Ohne Token bleibt es beim Lesen: 409 mit den Befehlen nur für die
 *      eigenen Repositories, die fremde wird ausgelassen und mit Grund
 *      genannt; kein Remote wird gesetzt, nichts wird angelegt.
 *   3. Mit Token wird nur das eigene angelegt oder umgehängt; die fremde
 *      bleibt mit ihrem Remote und ihrer Fassung unberührt, ihr Name steht
 *      in `ausgelassen` mit dem Grund „gehört nicht zu diesem Board“.
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
const ABLAGE = join(WURZEL, 'markt39');
const HOME = join(ABLAGE, 'home');
const FLAECHE = join(ABLAGE, 'flaeche');
const REMOTES = join(ABLAGE, 'remotes');
const BOARD = join(FLAECHE, 'board-team');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const STATION = join(FLAECHE, 'station-eigen');
const VORHABEN = join(FLAECHE, 'vorhaben-a');
const VORHABEN_OHNE = join(FLAECHE, 'vorhaben-ohne');
// Außerhalb der Board-Fläche und unter einem anderen Eigentümer.
const FREMD = join(ABLAGE, 'fremd', 'station-fremd');
const REGISTER = join(HOME, 'board', 'boards.json');
const ORGANISATION = 'eigen';
const TOKEN = 'pruef-token-39';
const FREMD_REMOTE = 'https://github.com/fremd/station-fremd.git';
const ALTE_ADRESSE = 'file://' + join(ABLAGE, 'alt.git');

const EIGENE = [
  { name: 'board-team', pfad: BOARD, privat: true },
  { name: 'workflow-standard', pfad: WORKFLOW, privat: false },
  { name: 'station-eigen', pfad: STATION, privat: false },
  { name: 'vorhaben-a', pfad: VORHABEN, privat: true },
  { name: 'vorhaben-ohne', pfad: VORHABEN_OHNE, privat: true },
];

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

function remoteVon(ordner) {
  const lauf = spawnSync('git', ['-C', ordner, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  });
  return lauf.status === 0 ? String(lauf.stdout || '').trim() : '';
}

/** Ein lokales Repository mit einer Fassung und optional einem Remote. */
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

function legeFlaeche() {
  // Die eigene Station liegt neben dem Board — sie gehört zu dieser Fläche.
  schreibeJson(join(STATION, 'station.json'), station('eigen', 'Eigene Station', 'p1'));
  writeFileSync(join(STATION, 'README.md'), '# Eigene Station\n', 'utf8');
  festschreiben(STATION, ALTE_ADRESSE);

  // Die fremde Station liegt außerhalb und gehört einem anderen Eigentümer.
  schreibeJson(join(FREMD, 'station.json'),
    station('fremd', 'Fremde Station', 'p2'));
  writeFileSync(join(FREMD, 'README.md'), '# Fremde Station\n', 'utf8');
  festschreiben(FREMD, FREMD_REMOTE);

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zur Umsetzung.',
    autor: 'p1',
    stationen: [{ repo: STATION, fassung: 'v1', id: 'eigen' }],
    positionen: [{ id: 'idee', station: 'eigen', x: 40, y: 80, bedingung: [] }],
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
    farbe: '#8b5cf6',
  });
  writeFileSync(join(VORHABEN, 'README.md'), '# Vorhaben A\n', 'utf8');
  festschreiben(VORHABEN);

  // Ein zweites Vorhaben ohne Eintrag: an seiner Karte muss „fehlt“ stehen.
  schreibeJson(join(VORHABEN_OHNE, 'vorhaben.json'), {
    format: 2,
    id: 'vorhaben-ohne',
    name: 'Vorhaben ohne Angabe',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: {},
    laeufe: [],
    farbe: '#22c55e',
  });
  writeFileSync(join(VORHABEN_OHNE, 'README.md'), '# Vorhaben ohne Angabe\n', 'utf8');
  festschreiben(VORHABEN_OHNE);

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }, { repo: VORHABEN_OHNE }],
    stationen: [{ repo: STATION }, { repo: FREMD }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Testboard\n', 'utf8');
  festschreiben(BOARD);
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let basis = '';
let vorhanden = new Set();
const angelegt = [];
const gepatcht = [];
const anfragen = [];

function repoDaten(name, privat) {
  return {
    name,
    full_name: ORGANISATION + '/' + name,
    private: Boolean(privat),
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    description: '',
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
      anfragen.push(req.method + ' ' + pfad);

      if (req.method === 'GET' && pfad === '/user') {
        senden(200, { login: 'p1', name: 'Thomas Heinrich' });
        return;
      }
      if (req.method === 'GET' && teile[0] === 'repos' && teile.length === 3) {
        const name = teile[2];
        if (vorhanden.has(name)) {
          senden(200, repoDaten(name, false));
        } else {
          senden(404, { message: 'Not Found' });
        }
        return;
      }
      if (req.method === 'POST' && pfad === '/orgs/' + ORGANISATION + '/repos') {
        const name = String(daten.name || '');
        angelegt.push({ name, privat: daten.private === true });
        vorhanden.add(name);
        senden(201, repoDaten(name, daten.private === true));
        return;
      }
      if (req.method === 'PATCH' && teile[0] === 'repos' && teile.length === 3) {
        const name = teile[2];
        gepatcht.push({ name, privat: daten.private === true });
        vorhanden.add(name);
        senden(200, repoDaten(name, daten.private === true));
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
  legeFlaeche();
  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [{
      id: 'testboard',
      name: 'Testboard',
      format: 2,
      art: 'team',
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
  process.env.DSH_GITHUB_ORG = ORGANISATION;
  process.env.DSH_GIT_REMOTE_BASIS = 'file://' + REMOTES;

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  for (const pfad of ['/board/data', '/board/github/veroeffentlichen']) {
    pruefe(gebaut.routen.has(pfad), 'Die Route ' + pfad + ' fehlt');
  }

  // 1. Die Verantwortlichen je Position stehen im Bild, das die Karte liest.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status
    + ': ' + JSON.stringify(daten.daten));
  const mitAngabe = (daten.daten.vorgaenge || []).find((v) => v.id === 'vorhaben-a');
  pruefe(mitAngabe && mitAngabe.position === 'idee',
    'Vorhaben A steht nicht an „idee“: ' + JSON.stringify(mitAngabe));
  pruefe(mitAngabe.verantwortlicheJeStation
    && Array.isArray(mitAngabe.verantwortlicheJeStation.idee)
    && mitAngabe.verantwortlicheJeStation.idee.includes('p1'),
  'verantwortlicheJeStation nennt p1 an „idee“ nicht: '
    + JSON.stringify(mitAngabe.verantwortlicheJeStation));
  pruefe(String(mitAngabe.verantwortet).includes('Thomas Heinrich'),
    'Der Name des Verantwortlichen fehlt: ' + JSON.stringify(mitAngabe.verantwortet));
  const ohneAngabe = (daten.daten.vorgaenge || []).find((v) => v.id === 'vorhaben-ohne');
  pruefe(ohneAngabe && String(ohneAngabe.verantwortet || '') === '',
    'Ein Vorhaben ohne Eintrag nennt trotzdem einen Verantwortlichen: '
      + JSON.stringify(ohneAngabe && ohneAngabe.verantwortet));
  pruefe(!ohneAngabe.verantwortlicheJeStation
    || !Array.isArray(ohneAngabe.verantwortlicheJeStation.idee),
  'Ein Vorhaben ohne Eintrag trägt trotzdem eine Liste an „idee“: '
    + JSON.stringify(ohneAngabe.verantwortlicheJeStation));
  console.log('ok Daten: Verantwortliche je Position stehen im Bild der Karte');

  // Der Weg zum Veröffentlichen und die Karte selbst: der Leser der Seite
  // nimmt `verantwortlicheJeStation` und sagt, wenn die Angabe fehlt.
  const clientText = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
  const kartenStelle = clientText.indexOf('function chipFuer(v)');
  pruefe(kartenStelle >= 0, 'client.js hat keine Kartenfunktion chipFuer');
  // Die Kartenfunktion endet mit der nächsten Funktion auf derselben Ebene.
  const kartenEnde = clientText.indexOf('\n      function ', kartenStelle + 10);
  const kartenBlock = clientText.slice(
    kartenStelle, kartenEnde > kartenStelle ? kartenEnde : kartenStelle + 18000,
  );
  for (const stelle of ['verantwortlicheVon(v)', "uebersetze('verantwortet von {0}',",
    'ohne Verantwortliche', 'die Angabe fehlt']) {
    pruefe(kartenBlock.includes(stelle),
      'Die Karte zeigt „' + stelle + '“ nicht');
  }
  const veroeffStelle = clientText.indexOf("'/board/github/veroeffentlichen'");
  pruefe(veroeffStelle >= 0,
    'client.js ruft /board/github/veroeffentlichen nicht auf');
  const veroeffBlock = clientText.slice(veroeffStelle, veroeffStelle + 1400);
  for (const stelle of ['ausgelassen', 'Ausgelassen: ', 'gehört nicht zu diesem Board']) {
    pruefe(veroeffBlock.includes(stelle),
      'Die Meldung der Seite nennt die ausgelassenen Repositories nicht („'
        + stelle + '“)');
  }
  console.log('ok Karte: der Verantwortliche steht da, fehlt er, steht es da');

  // 2. Ohne Token: nur Befehle für die eigenen, die fremde wird ausgelassen.
  pruefe(!existsSync(join(HOME, 'board', 'github.json')),
    'Vor der Prüfung liegt schon ein Token da');
  const kopfVorher = new Map(EIGENE.map(
    (repo) => [repo.pfad, git(repo.pfad, ['rev-parse', 'HEAD'])],
  ));
  const fremdKopfVorher = git(FREMD, ['rev-parse', 'HEAD']);

  const ohneToken = await ruf(gebaut, '/board/github/veroeffentlichen',
    { board: 'testboard' });
  pruefe(ohneToken.status === 409, 'Ohne Token antwortet die Route '
    + ohneToken.status + ' statt 409: ' + JSON.stringify(ohneToken.daten));
  pruefe(Array.isArray(ohneToken.daten.befehle)
    && ohneToken.daten.befehle.length === EIGENE.length * 2,
  'Ohne Token fehlen die Befehle je eigenem Repository: '
    + JSON.stringify(ohneToken.daten.befehle));
  pruefe(!ohneToken.daten.befehle.some((befehl) => befehl.includes(FREMD)),
    'Ein Befehl nennt die fremde Station: '
      + JSON.stringify(ohneToken.daten.befehle));
  pruefe(Array.isArray(ohneToken.daten.repositories)
    && ohneToken.daten.repositories.length === EIGENE.length,
  'Ohne Token stehen nicht nur die eigenen Repositories in der Antwort: '
    + JSON.stringify(ohneToken.daten.repositories));
  pruefe(Array.isArray(ohneToken.daten.ausgelassen)
    && ohneToken.daten.ausgelassen.length === 1,
  'Ohne Token fehlt die ausgelassene fremde Station: '
    + JSON.stringify(ohneToken.daten.ausgelassen));
  const fremdWeg = ohneToken.daten.ausgelassen[0];
  pruefe(fremdWeg.repo === 'station-fremd' && fremdWeg.pfad === FREMD
    && fremdWeg.grund === 'gehört nicht zu diesem Board',
  'Die ausgelassene Station steht nicht mit Grund da: ' + JSON.stringify(fremdWeg));
  pruefe(remoteVon(STATION) === ALTE_ADRESSE,
    'Ohne Token wurde der Remote der eigenen Station umgehängt: ' + remoteVon(STATION));
  pruefe(remoteVon(FREMD) === FREMD_REMOTE,
    'Ohne Token wurde der Remote der fremden Station umgehängt: ' + remoteVon(FREMD));
  pruefe(git(FREMD, ['rev-parse', 'HEAD']) === fremdKopfVorher,
    'Ohne Token wurde die fremde Station verändert');
  pruefe(anfragen.every((eintrag) => eintrag.startsWith('GET')),
    'Ohne Token ging ein Schreibaufruf an GitHub: ' + JSON.stringify(anfragen));
  console.log('ok ohne Token: Befehle nur für eigene, fremde ausgelassen und genannt');

  // 3. Mit Token: nur das eigene wird angelegt oder umgehängt.
  tokenAblegen(TOKEN);
  vorhanden = new Set(['workflow-standard', 'station-eigen']);
  for (const repo of EIGENE) {
    const bare = join(REMOTES, ORGANISATION, repo.name + '.git');
    mkdirSync(bare, { recursive: true });
    git(bare, ['init', '--bare', '-q', '-b', 'main']);
  }

  const veroeffentlicht = await ruf(gebaut, '/board/github/veroeffentlichen',
    { board: 'testboard' });
  pruefe(veroeffentlicht.status === 200, 'Mit Token antwortet die Route '
    + veroeffentlicht.status + ': ' + JSON.stringify(veroeffentlicht.daten));
  pruefe(veroeffentlicht.daten.fehler == null,
    'Mit Token meldet die Route einen Fehler: ' + JSON.stringify(veroeffentlicht.daten));
  const gemacht = veroeffentlicht.daten.veroeffentlicht || [];
  pruefe(gemacht.length === EIGENE.length,
    'Veröffentlicht wurden nicht nur die eigenen Repositories: '
      + JSON.stringify(gemacht.map((e) => e.repo)));
  for (const repo of EIGENE) {
    pruefe(gemacht.some((eintrag) => eintrag.repo === repo.name),
      'Das eigene Repository „' + repo.name + '“ fehlt in der Antwort: '
        + JSON.stringify(gemacht.map((e) => e.repo)));
  }
  pruefe(!gemacht.some((eintrag) => eintrag.repo === 'station-fremd'),
    'Die fremde Station gilt als veröffentlicht: '
      + JSON.stringify(gemacht.map((e) => e.repo)));
  pruefe(Array.isArray(veroeffentlicht.daten.ausgelassen)
    && veroeffentlicht.daten.ausgelassen.length === 1
    && veroeffentlicht.daten.ausgelassen[0].repo === 'station-fremd'
    && veroeffentlicht.daten.ausgelassen[0].grund === 'gehört nicht zu diesem Board',
  'Die Antwort nennt die fremde Station nicht mit Grund: '
    + JSON.stringify(veroeffentlicht.daten.ausgelassen));

  // Angelegt wurde nur, was fehlte; die vorhandene eigene Station wurde
  // umgehängt, die fremde nicht angefasst.
  pruefe(angelegt.length === 3, 'Angelegt wurden ' + angelegt.length
    + ' statt 3 Repositories: ' + JSON.stringify(angelegt));
  for (const repo of EIGENE) {
    const neu = angelegt.some((eintrag) => eintrag.name === repo.name);
    pruefe(neu === !['workflow-standard', 'station-eigen'].includes(repo.name),
      'Angelegt wurde „' + repo.name + '“ falsch: ' + JSON.stringify(angelegt));
  }
  pruefe(!angelegt.some((eintrag) => eintrag.name === 'station-fremd'),
    'Die fremde Station wurde angelegt: ' + JSON.stringify(angelegt));
  pruefe(!anfragen.some((eintrag) => eintrag.includes('station-fremd')),
    'Für die fremde Station ging ein Aufruf an GitHub: ' + JSON.stringify(anfragen));

  for (const repo of EIGENE) {
    const adresse = 'file://' + join(REMOTES, ORGANISATION, repo.name + '.git');
    pruefe(remoteVon(repo.pfad) === adresse, 'Der Remote von „' + repo.name
      + '“ stimmt nicht: ' + remoteVon(repo.pfad));
    const bare = join(REMOTES, ORGANISATION, repo.name + '.git');
    pruefe(git(bare, ['rev-list', '--count', 'main'])
      === git(repo.pfad, ['rev-list', '--count', 'HEAD']),
    'Die Fassungen von „' + repo.name + '“ liegen nicht im Bare-Repository');
    pruefe(git(bare, ['tag']).includes('v1'),
      'Das Tag „v1“ von „' + repo.name + '“ wurde nicht gepusht');
  }
  pruefe(remoteVon(FREMD) === FREMD_REMOTE,
    'Der Remote der fremden Station wurde umgehängt: ' + remoteVon(FREMD));
  pruefe(git(FREMD, ['rev-parse', 'HEAD']) === fremdKopfVorher,
    'Die fremde Station hat eine andere Fassung');
  pruefe(!existsSync(join(REMOTES, ORGANISATION, 'station-fremd.git')),
    'Für die fremde Station wurde ein Bare-Repository angelegt');
  for (const repo of EIGENE) {
    pruefe(git(repo.pfad, ['rev-parse', 'HEAD']) === kopfVorher.get(repo.pfad),
      'Das Veröffentlichen hat „' + repo.name + '“ eine neue Fassung gegeben');
  }
  console.log('ok mit Token: eigene angelegt/umgehängt, fremde unberührt und genannt');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await stoppeServer();
  delete process.env.DSH_GITHUB_API;
  delete process.env.DSH_HOME;
  delete process.env.DSH_GITHUB_ORG;
  delete process.env.DSH_GIT_REMOTE_BASIS;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Veröffentlichen: nur eigene, fremde genannt, '
  + 'Verantwortliche an der Karte');
