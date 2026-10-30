/**
 * Prüfung Schritt 31 — GitHub-Client und Token.
 *
 * Ein lokaler HTTP-Server (`node:http`, Port 0) ersetzt GitHub; `DSH_GITHUB_API`
 * zeigt darauf. Geprüft werden Metadaten und Sterne, Releases, der Filter der
 * Pull Requests aus den Fragen, 404, 401, die Grenze, der Zwischenspeicher,
 * die Token-Datei (0600, Inhalt, Löschen), die beiden Routen und dass der
 * Token nirgends im Antworttext steht. Server und Home werden danach entfernt.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt31');
const HOME = join(ABLAGE, 'home');
const TOKEN = 'test-token-geheim-123';
const RESET = Math.floor(Date.now() / 1000) + 120;

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

const REPO = {
  name: 'public-repo',
  full_name: 'octo/public-repo',
  private: false,
  stargazers_count: 7,
  forks_count: 3,
  open_issues_count: 9,
  description: 'Ein öffentliches Repository',
  topics: ['board', 'test'],
  default_branch: 'main',
  html_url: 'https://github.com/octo/public-repo',
  pushed_at: '2026-10-20T10:00:00Z',
  license: { spdx_id: 'MIT', name: 'MIT License' },
  archived: false,
  owner: { login: 'octo' },
};

const RELEASES = [
  {
    tag_name: 'v1.2.0', name: 'Fassung 1.2.0',
    published_at: '2026-10-01T10:00:00Z', prerelease: false,
  },
  {
    tag_name: 'v1.1.0', name: 'Fassung 1.1.0',
    published_at: '2026-09-01T10:00:00Z', prerelease: false,
  },
];

const ISSUES = [
  {
    number: 1, title: 'Frage eins', state: 'open', user: { login: 'anna' },
    html_url: 'https://github.com/octo/public-repo/issues/1',
    created_at: '2026-10-02T10:00:00Z', updated_at: '2026-10-03T10:00:00Z',
  },
  {
    number: 2, title: 'Frage zwei', state: 'open', user: { login: 'bea' },
    html_url: 'https://github.com/octo/public-repo/issues/2',
    created_at: '2026-10-04T10:00:00Z', updated_at: '2026-10-05T10:00:00Z',
  },
  {
    number: 3, title: 'Ein Pull Request', state: 'open', user: { login: 'carl' },
    html_url: 'https://github.com/octo/public-repo/pull/3',
    created_at: '2026-10-06T10:00:00Z', updated_at: '2026-10-07T10:00:00Z',
    pull_request: { url: 'https://api.github.com/repos/octo/public-repo/pulls/3' },
  },
];

const PULLS = [{
  number: 3, title: 'Ein Pull Request', state: 'open', user: { login: 'carl' },
  html_url: 'https://github.com/octo/public-repo/pull/3',
  created_at: '2026-10-06T10:00:00Z', updated_at: '2026-10-07T10:00:00Z',
  merged_at: null,
}];

let server = null;
let basis = '';
const zaehler = new Map();

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer((req, res) => {
      try {
        const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
        zaehler.set(pfad, (zaehler.get(pfad) || 0) + 1);
        const senden = (status, wert, kopf = {}) => {
          const text = wert == null ? '' : JSON.stringify(wert);
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(text),
            ...kopf,
          });
          res.end(text);
        };

        if (pfad === '/user') {
          if (req.headers.authorization === 'Bearer ' + TOKEN) {
            senden(200, {
              login: 'octo', name: 'Octo', html_url: 'https://github.com/octo',
              avatar_url: 'https://avatars.example/octo', type: 'User',
            });
          } else {
            senden(401, { message: 'Bad credentials' });
          }
          return;
        }
        if (pfad === '/rate_limit') {
          senden(200, {
            resources: { core: { limit: 5000, remaining: 42, reset: RESET } },
          });
          return;
        }
        if (pfad === '/repos/octo/public-repo') { senden(200, REPO); return; }
        if (pfad === '/repos/octo/public-repo/releases') { senden(200, RELEASES); return; }
        if (pfad === '/repos/octo/public-repo/issues') { senden(200, ISSUES); return; }
        if (pfad === '/repos/octo/public-repo/pulls') { senden(200, PULLS); return; }
        if (pfad === '/repos/octo/grenze') {
          senden(403, { message: 'API rate limit exceeded' }, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(RESET),
          });
          return;
        }
        if (pfad === '/repos/octo/wackelig') {
          if (zaehler.get(pfad) === 1) {
            senden(500, { message: 'kaputt' });
          } else {
            senden(200, {
              ...REPO, name: 'wackelig', full_name: 'octo/wackelig', stargazers_count: 1,
            });
          }
          return;
        }
        if (pfad.startsWith('/repos/octo/fehlt')) {
          senden(404, { message: 'Not Found' });
          return;
        }
        senden(404, { message: 'Not Found' });
      } catch (fehler) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: String((fehler && fehler.message) || fehler) }));
      }
    });
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      basis = 'http://127.0.0.1:' + s.address().port;
      erfuellt(basis);
    });
  });
}

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
    method: koerper ? 'POST' : 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper) yield Buffer.from(JSON.stringify(koerper), 'utf8');
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
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad, koerper), res);
  return { status: res.status, text: res.text, daten: res.text ? JSON.parse(res.text) : null };
}

let gebaut = null;
let bestanden = false;
const texte = [];
const fehlerTexte = [];

rmSync(ABLAGE, { recursive: true, force: true });

try {
  await starteServer();
  process.env.DSH_HOME = HOME;
  process.env.DSH_GITHUB_API = basis;

  mkdirSync(join(HOME, 'board'), { recursive: true });
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1, aktiv: null, boards: [],
  });

  const github = await import(pathToFileURL(join(PRODUKT, 'github.js')).href);
  const indexModul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);

  pruefe(github.GITHUB_API === basis,
    'GITHUB_API folgt DSH_GITHUB_API nicht: ' + github.GITHUB_API);

  // 1. Metadaten und Sterne; die zweite Abfrage kommt aus dem Speicher.
  const client = github.erstelleClient({ home: HOME });
  const daten = await client.repo('octo', 'public-repo');
  pruefe(daten.name === 'public-repo' && daten.vollerName === 'octo/public-repo',
    'Der Name des Repositories stimmt nicht: ' + JSON.stringify(daten));
  pruefe(daten.privat === false && daten.sichtbarkeit === 'öffentlich',
    'Die Sichtbarkeit stimmt nicht: ' + JSON.stringify(daten));
  pruefe(daten.sterne === 7, 'Die Sterne sind nicht 7: ' + JSON.stringify(daten.sterne));
  pruefe(daten.forks === 3 && daten.offeneFragen === 9,
    'Forks oder offene Fragen stimmen nicht: ' + JSON.stringify(daten));
  pruefe(daten.beschreibung === 'Ein öffentliches Repository',
    'Die Beschreibung fehlt: ' + JSON.stringify(daten.beschreibung));
  pruefe(Array.isArray(daten.themen) && daten.themen.join(',') === 'board,test',
    'Die Themen fehlen: ' + JSON.stringify(daten.themen));
  pruefe(daten.standardZweig === 'main', 'Der Standardzweig fehlt: '
    + JSON.stringify(daten.standardZweig));
  pruefe(daten.adresse === 'https://github.com/octo/public-repo',
    'Die Adresse fehlt: ' + JSON.stringify(daten.adresse));
  pruefe(daten.gedrueckt === '2026-10-20T10:00:00Z',
    'Der Zeitpunkt des letzten Pushs stimmt nicht: ' + JSON.stringify(daten.gedrueckt));
  pruefe(daten.lizenz === 'MIT' && daten.archiviert === false && daten.eigentuemer === 'octo',
    'Lizenz, Archiv oder Eigentümer stimmen nicht: ' + JSON.stringify(daten));
  pruefe(zaehler.get('/repos/octo/public-repo') === 1,
    'Die erste Abfrage hat den Server nicht genau einmal getroffen: '
      + zaehler.get('/repos/octo/public-repo'));
  await client.repo('octo', 'public-repo');
  pruefe(zaehler.get('/repos/octo/public-repo') === 1,
    'Die zweite Abfrage hat den Server erneut getroffen: '
      + zaehler.get('/repos/octo/public-repo'));

  // 2. Releases und der Filter der Pull Requests aus den Fragen.
  const freigaben = await client.releases('octo', 'public-repo');
  pruefe(freigaben.length === 2 && freigaben[0].tag === 'v1.2.0',
    'Die Releases stimmen nicht: ' + JSON.stringify(freigaben));
  pruefe(freigaben[0].name === 'Fassung 1.2.0' && freigaben[0].vorab === false,
    'Name oder Vorab-Kennzeichen des Releases stimmt nicht: ' + JSON.stringify(freigaben[0]));
  const fragen = await client.issues('octo', 'public-repo', { state: 'open' });
  pruefe(fragen.length === 2, 'Die Fragen enthalten einen Pull Request oder es fehlt eine: '
    + JSON.stringify(fragen.map((f) => f.nummer)));
  pruefe(fragen.every((f) => f.nummer !== 3),
    'Der Pull Request steht unter den Fragen: ' + JSON.stringify(fragen.map((f) => f.nummer)));
  pruefe(fragen[0].autor === 'anna' && fragen[0].zusammenGefuehrt === false,
    'Autor oder Zusammenführung einer Frage stimmt nicht: ' + JSON.stringify(fragen[0]));
  const pulls = await client.pulls('octo', 'public-repo', { state: 'open' });
  pruefe(pulls.length === 1 && pulls[0].nummer === 3 && pulls[0].titel === 'Ein Pull Request',
    'Die Pull Requests stimmen nicht: ' + JSON.stringify(pulls));
  pruefe(pulls[0].zusammenGefuehrt === false,
    'Ein offener Pull Request gilt als zusammengeführt: ' + JSON.stringify(pulls[0]));

  // 3. 404, 401 und die Grenze; die Meldungen nennen den Grund.
  try {
    await client.repo('octo', 'fehlt');
    throw new Error('404 wurde nicht gemeldet');
  } catch (fehler) {
    pruefe(fehler instanceof github.GithubFehler, '404 ist kein GithubFehler: ' + fehler);
    pruefe(fehler.status === 404, '404 trägt nicht Status 404: ' + fehler.status);
    pruefe(fehler.repo === 'octo/fehlt', '404 nennt nicht das Repository: ' + fehler.repo);
    pruefe(String(fehler.message).includes('nicht gefunden oder nicht zugänglich'),
      'Die 404-Meldung ist unklar: ' + fehler.message);
    fehlerTexte.push(String(fehler.message));
  }

  const falsch = github.erstelleClient({ home: HOME, token: 'falsch' });
  try {
    await falsch.ich();
    throw new Error('401 wurde nicht gemeldet');
  } catch (fehler) {
    pruefe(fehler instanceof github.GithubFehler && fehler.status === 401,
      '401 ist kein GithubFehler mit Status 401: ' + fehler);
    pruefe(String(fehler.message) === 'Token ungültig oder abgelaufen',
      'Die 401-Meldung lautet nicht „Token ungültig oder abgelaufen“: ' + fehler.message);
    fehlerTexte.push(String(fehler.message));
  }

  try {
    await client.repo('octo', 'grenze');
    throw new Error('Die Grenze wurde nicht gemeldet');
  } catch (fehler) {
    pruefe(fehler instanceof github.GithubFehler && fehler.status === 403,
      'Die Grenze ist kein GithubFehler mit Status 403: ' + fehler);
    pruefe(fehler.grenze && fehler.grenze.rest === 0 && fehler.grenze.reset === RESET,
      'Die Grenze trägt Rest und Reset nicht: ' + JSON.stringify(fehler.grenze));
    const iso = new Date(RESET * 1000).toISOString();
    pruefe(String(fehler.message) === 'GitHub-Grenze erreicht; wieder ab ' + iso,
      'Die Grenz-Meldung ist unklar: ' + fehler.message);
    fehlerTexte.push(String(fehler.message));
  }

  const offline = github.erstelleClient({ home: HOME, basis: 'http://127.0.0.1:1' });
  try {
    await offline.repo('octo', 'public-repo');
    throw new Error('Der Netzfehler wurde nicht gemeldet');
  } catch (fehler) {
    pruefe(String(fehler.message) === 'GitHub nicht erreichbar',
      'Die Meldung für einen Netzfehler ist unklar: ' + fehler.message);
    fehlerTexte.push(String(fehler.message));
  }

  // 4. 5xx einmal wiederholen, dann den zweiten Treffer nehmen.
  const wackelig = await client.repo('octo', 'wackelig');
  pruefe(wackelig.sterne === 1 && zaehler.get('/repos/octo/wackelig') === 2,
    'Der 5xx wurde nicht genau einmal wiederholt: '
      + JSON.stringify({ sterne: wackelig.sterne, treffer: zaehler.get('/repos/octo/wackelig') }));

  // 5. Der Stern-Zwischenspeicher liegt im Home.
  const sterne = JSON.parse(readFileSync(join(HOME, 'board', 'sterne.json'), 'utf8'));
  pruefe(sterne['octo/public-repo'] && sterne['octo/public-repo'].sterne === 7,
    'sterne.json trägt die Sterne nicht: ' + JSON.stringify(sterne));
  pruefe(typeof sterne['octo/public-repo'].am === 'string'
    && !Number.isNaN(Date.parse(sterne['octo/public-repo'].am)),
  'sterne.json trägt keinen Zeitpunkt: ' + JSON.stringify(sterne['octo/public-repo']));

  // 6. Die Token-Datei: 0600 im Verzeichnis 0700, Inhalt, Löschen.
  github.schreibeToken(HOME, TOKEN);
  const tokenDatei = join(HOME, 'board', 'github.json');
  pruefe(existsSync(tokenDatei), 'Die Token-Datei fehlt nach dem Schreiben');
  pruefe((statSync(tokenDatei).mode & 0o777) === 0o600,
    'Die Token-Datei hat nicht 0600: ' + (statSync(tokenDatei).mode & 0o777).toString(8));
  pruefe((statSync(join(HOME, 'board')).mode & 0o777) === 0o700,
    'Das Verzeichnis hat nicht 0700: '
      + (statSync(join(HOME, 'board')).mode & 0o777).toString(8));
  const inhalt = JSON.parse(readFileSync(tokenDatei, 'utf8'));
  pruefe(inhalt.token === TOKEN, 'Die Token-Datei trägt nicht den Token: '
    + JSON.stringify(Object.keys(inhalt)));
  pruefe(github.liesToken(HOME) === TOKEN, 'liesToken liest den Token nicht');
  pruefe(github.loescheToken(HOME) === true && !existsSync(tokenDatei)
    && github.liesToken(HOME) === null,
  'Der Token ließ sich nicht löschen');

  // 7. Die Routen: ohne Token lesen, mit Token verbinden, löschen.
  gebaut = ctxBauen();
  indexModul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/github/stand')
    && gebaut.routen.has('/board/github/token'),
  'Die GitHub-Routen sind nicht eingerichtet: '
    + JSON.stringify([...gebaut.routen.keys()].filter((p) => p.startsWith('/board/github'))));

  const ohne = await ruf(gebaut, '/board/github/stand');
  texte.push(ohne.text);
  pruefe(ohne.status === 200 && ohne.daten.verbunden === false && ohne.daten.login === null,
    'Ohne Token meldet der Stand nicht „nicht verbunden“: '
      + ohne.status + ' ' + ohne.text);

  const lesen = await ruf(gebaut, '/board/github/stand?repo=octo/public-repo');
  texte.push(lesen.text);
  pruefe(lesen.status === 200, 'GET stand (Repo) antwortet ' + lesen.status + ': ' + lesen.text);
  pruefe(lesen.daten.verbunden === false && lesen.daten.sterne === 7
    && lesen.daten.fassung === 'v1.2.0',
  'Der Stand ohne Token zeigt Sterne und Fassung nicht: ' + lesen.text);
  pruefe(lesen.daten.repo && lesen.daten.repo.vollerName === 'octo/public-repo',
    'Der Stand trägt die Repo-Metadaten nicht: ' + lesen.text);
  pruefe(Array.isArray(lesen.daten.freigaben) && lesen.daten.freigaben.length === 2,
    'Der Stand trägt die Freigaben nicht: ' + lesen.text);
  pruefe(lesen.daten.fehler == null, 'Der lesbare Stand trägt einen Fehler: ' + lesen.text);

  const schlecht = await ruf(gebaut, '/board/github/token', { token: 'falsch' });
  texte.push(schlecht.text);
  pruefe(schlecht.status === 401, 'Ein ungültiger Token antwortet ' + schlecht.status
    + ' statt 401: ' + schlecht.text);
  pruefe(schlecht.daten.error === 'Token ungültig oder abgelaufen',
    'Die 401-Antwort ist unklar: ' + schlecht.text);
  pruefe(!existsSync(tokenDatei), 'Ein ungültiger Token wurde trotzdem gespeichert');

  const verbinden = await ruf(gebaut, '/board/github/token', { token: TOKEN });
  texte.push(verbinden.text);
  pruefe(verbinden.status === 200 && verbinden.daten.verbunden === true
    && verbinden.daten.login === 'octo',
  'Der gültige Token verbindet nicht: ' + verbinden.status + ' ' + verbinden.text);
  pruefe(existsSync(tokenDatei), 'Der gültige Token wurde nicht gespeichert');
  pruefe((statSync(tokenDatei).mode & 0o777) === 0o600,
    'Die gespeicherte Token-Datei hat nicht 0600: '
      + (statSync(tokenDatei).mode & 0o777).toString(8));

  const mit = await ruf(gebaut, '/board/github/stand');
  texte.push(mit.text);
  pruefe(mit.status === 200 && mit.daten.verbunden === true && mit.daten.login === 'octo',
    'Der Stand meldet mit Token nicht „verbunden als octo“: ' + mit.text);
  pruefe(mit.daten.grenze && mit.daten.grenze.rest === 42,
    'Der Stand trägt die Grenze nicht: ' + mit.text);

  const mitRepo = await ruf(gebaut, '/board/github/stand?repo=octo/public-repo');
  texte.push(mitRepo.text);
  pruefe(mitRepo.daten.verbunden === true && mitRepo.daten.sterne === 7,
    'Der Stand mit Token zeigt Sterne und Verbindung nicht: ' + mitRepo.text);

  const fehlt = await ruf(gebaut, '/board/github/stand?repo=octo/fehlt');
  texte.push(fehlt.text);
  pruefe(fehlt.status === 200 && fehlt.daten.sterne === null
    && String(fehlt.daten.fehler).includes('nicht gefunden oder nicht zugänglich'),
  'Der Stand meldet ein fehlendes Repository nicht weich: ' + fehlt.text);

  const weg = await ruf(gebaut, '/board/github/token', { loeschen: true });
  texte.push(weg.text);
  pruefe(weg.status === 200 && weg.daten.verbunden === false && weg.daten.login === null,
    'Das Löschen des Tokens antwortet nicht mit „nicht verbunden“: ' + weg.text);
  pruefe(!existsSync(tokenDatei), 'Token-Datei liegt nach dem Löschen noch da');

  const danach = await ruf(gebaut, '/board/github/stand?repo=octo/public-repo');
  texte.push(danach.text);
  pruefe(danach.status === 200 && danach.daten.sterne === 7,
    'Ohne Token liest das Board das Repository nicht mehr: ' + danach.text);

  // 8. Der Token steht in keinem Antworttext und in keiner Fehlermeldung.
  for (const text of texte) {
    pruefe(!String(text).includes(TOKEN),
      'Der Token steht in einem Antworttext: ' + String(text).slice(0, 200));
  }
  for (const text of fehlerTexte) {
    pruefe(!String(text).includes(TOKEN),
      'Der Token steht in einer Fehlermeldung: ' + text);
  }

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  if (server) await new Promise((erfuellt) => server.close(erfuellt));
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok GitHub: Sterne 7, Fassung v1.2.0; Token 0600, verbunden, gelöscht; '
  + '404/401/Grenze klar; Token nirgends im Text');
