/**
 * Prüfung Schritt 34 — Der Katalog führt zusammen.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt34`, daneben ein
 * eigenes `DSH_HOME`. Das Hauptboard trägt eine kuratierte Station
 * `station-y` mit dem GitHub-Remote `kuratiert/station-y`; `DSH_GITHUB_API`
 * zeigt auf einen nachgebildeten Server auf 127.0.0.1. Ein echtes Netz wird
 * nicht benutzt.
 *
 * Der Server liefert die neue Station `fremd/station-x` und das Doppel
 * `kuratiert/station-y`; das Doppel trägt andere Sterne und eine andere
 * Beschreibung, damit sichtbar wird, ob Felder der gefundenen Fassung in den
 * kuratierten Eintrag geraten.
 *
 * Geprüft wird:
 *
 *   1. Jeder Eintrag trägt `herkunft`; `kuratiert` und `gefunden` sind
 *      getrennt, `eintraege` ist kuratiert zuerst und je `owner/repo` einmal.
 *      Der kuratierte Eintrag behält seine eigenen Felder.
 *   2. `stand` (letzte Sammlung) und `standGefunden` (letzte Suche) sind
 *      gesetzt; der Zwischenspeicher trägt beide getrennt.
 *   3. `?suche=` filtert alle drei Listen gleich — mit und ohne Treffer.
 *   4. Ohne Server gelten die letzten Stände mit Hinweis; `katalog.json` bleibt
 *      unverändert, gefundene Einträge werden nicht hineingeschrieben.
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
const ABLAGE = join(WURZEL, 'markt34');
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

/** Der Schlüssel eines Eintrags: `owner/repo`, klein geschrieben. */
function eintragSchluessel(eintrag) {
  const ziel = eintrag && eintrag.github;
  if (ziel && typeof ziel === 'object' && ziel.owner && ziel.name) {
    return (String(ziel.owner) + '/' + String(ziel.name)).toLowerCase();
  }
  // Beim kuratierten Eintrag steht der GitHub-Bezug nicht in `github`, sondern
  // nur im Remote; daraus wird derselbe Schlüssel.
  const treffer = String((eintrag && eintrag.remote) || '').match(
    /github\.com[:/]+([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i,
  );
  if (treffer) return (treffer[1] + '/' + treffer[2]).toLowerCase();
  return String((eintrag && eintrag.repo) || '').toLowerCase();
}

/** Jeder Eintrag in allen drei Listen trägt eine bekannte Herkunft. */
function herkunftPruefen(daten, was) {
  for (const name of ['eintraege', 'kuratiert', 'gefunden']) {
    pruefe(Array.isArray(daten[name]), was + ': `' + name + '` fehlt');
    for (const eintrag of daten[name]) {
      pruefe(eintrag && (eintrag.herkunft === 'kuratiert'
        || eintrag.herkunft === 'gefunden'),
      was + ': Eintrag ohne Herkunft in `' + name + '`: '
        + JSON.stringify(eintrag));
    }
  }
  pruefe(daten.kuratiert.every((eintrag) => eintrag.herkunft === 'kuratiert'),
    was + ': `kuratiert` enthält einen gefundenen Eintrag: '
      + JSON.stringify(daten.kuratiert.map((eintrag) => eintrag.herkunft)));
  pruefe(daten.gefunden.every((eintrag) => eintrag.herkunft === 'gefunden'),
    was + ': `gefunden` enthält einen kuratierten Eintrag: '
      + JSON.stringify(daten.gefunden.map((eintrag) => eintrag.herkunft)));
}

/** `eintraege` ist die zusammengeführte Liste, kuratiert zuerst, ohne Doppel. */
function zusammenPruefen(daten, was) {
  pruefe(JSON.stringify(daten.eintraege)
    === JSON.stringify([...daten.kuratiert, ...daten.gefunden]),
  was + ': `eintraege` ist nicht kuratiert + gefunden: '
    + JSON.stringify({
      eintraege: daten.eintraege.map(eintragSchluessel),
      kuratiert: daten.kuratiert.map(eintragSchluessel),
      gefunden: daten.gefunden.map(eintragSchluessel),
    }));
  const schluessel = daten.eintraege.map(eintragSchluessel);
  pruefe(new Set(schluessel).size === schluessel.length,
    was + ': `eintraege` enthält ein Doppel: ' + JSON.stringify(schluessel));
  const gefundeneSchluessel = new Set(daten.gefunden.map(eintragSchluessel));
  for (const eintrag of daten.kuratiert) {
    pruefe(!gefundeneSchluessel.has(eintragSchluessel(eintrag)),
      was + ': Ein kuratierter Eintrag steht auch in `gefunden`: '
        + JSON.stringify(eintragSchluessel(eintrag)));
  }
}

/** Beide Stände sind gesetzt und als Zeitpunkt lesbar. */
function staendePruefen(daten, was) {
  for (const name of ['stand', 'standGefunden']) {
    pruefe(typeof daten[name] === 'string' && daten[name],
      was + ': `' + name + '` fehlt: ' + JSON.stringify(daten[name]));
    pruefe(Number.isFinite(Date.parse(daten[name])),
      was + ': `' + name + '` ist kein Zeitpunkt: ' + JSON.stringify(daten[name]));
  }
}

/* --- Der nachgebildete GitHub-Server ------------------------------------- */

let server = null;
let sucheAufrufe = 0;
let sucheAnfrage = null;
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
        const owner = teile[1];
        const name = teile[2];
        if (owner.toLowerCase() === 'kuratiert'
          && name.toLowerCase() === 'station-y') {
          senden(200, repoDaten('kuratiert', 'station-y', 3,
            'Die kuratierte Station.'));
          return;
        }
        if (owner.toLowerCase() === 'fremd'
          && name.toLowerCase() === 'station-x') {
          senden(200, repoDaten('fremd', 'station-x', 9,
            'Eine fremde Station.'));
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

  // `fremd/station-x` ist neu; `kuratiert/station-y` ist das Doppel und trägt
  // absichtlich andere Zahlen und Worte als die kuratierte Fassung.
  treffer = [
    repoDaten('fremd', 'station-x', 9, 'Eine fremde Station.'),
    repoDaten('kuratiert', 'station-y', 77, 'Doppelt gefunden.'),
  ];

  process.env.DSH_HOME = HOME;
  process.env.DSH_BOARD_CACHE_TTL = '600000';
  process.env.DSH_GITHUB_API = await starteServer();

  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);
  pruefe(gebaut.routen.has('/board/katalog'), 'Die Route /board/katalog fehlt');

  // 1. Eine Antwort mit beiden Herkünften, ohne Doppel, kuratiert zuerst.
  const erst = await ruf(gebaut, '/board/katalog');
  pruefe(erst.status === 200, 'GET /board/katalog antwortet ' + erst.status
    + ': ' + JSON.stringify(erst.daten));
  const daten = erst.daten;
  pruefe(daten.hinweis === '', 'Der Katalog meldet ohne Grund einen Hinweis: '
    + JSON.stringify(daten.hinweis));
  pruefe(Array.isArray(daten.luecken) && daten.luecken.length === 0,
    'Der Katalog meldet Lücken: ' + JSON.stringify(daten.luecken));
  herkunftPruefen(daten, 'Die erste Antwort');
  zusammenPruefen(daten, 'Die erste Antwort');
  staendePruefen(daten, 'Die erste Antwort');

  pruefe(daten.kuratiert.length === 1, '`kuratiert` enthält nicht genau die '
    + 'kuratierte Station: ' + JSON.stringify(daten.kuratiert));
  const kuratiert = daten.kuratiert[0];
  pruefe(kuratiert.herkunft === 'kuratiert', 'Der kuratierte Eintrag trägt die '
    + 'Herkunft ' + JSON.stringify(kuratiert.herkunft));
  pruefe(kuratiert.name === 'Station Y', 'Der kuratierte Eintrag hat nicht den '
    + 'Namen der Station: ' + JSON.stringify(kuratiert.name));
  pruefe(String(kuratiert.repo).endsWith('/station-y'), 'Der kuratierte Eintrag '
    + 'verweist nicht auf die Station: ' + JSON.stringify(kuratiert.repo));
  pruefe(kuratiert.sterne === 3, 'Der kuratierte Eintrag trägt nicht seine '
    + 'eigene Sternzahl, sondern ' + JSON.stringify(kuratiert.sterne));
  pruefe(kuratiert.beschreibung === 'Die kuratierte Station.',
    'Die gefundene Fassung hat die Beschreibung des kuratierten Eintrags '
    + 'überschrieben: ' + JSON.stringify(kuratiert.beschreibung));
  pruefe(!('web' in kuratiert), 'Der kuratierte Eintrag trägt das Feld `web` '
    + 'der gefundenen Fassung: ' + JSON.stringify(kuratiert));

  pruefe(daten.gefunden.length === 1, '`gefunden` enthält nicht genau einen '
    + 'Treffer: ' + JSON.stringify(daten.gefunden));
  const gefunden = daten.gefunden[0];
  pruefe(gefunden.herkunft === 'gefunden', 'Dem Treffer fehlt die Herkunft: '
    + JSON.stringify(gefunden.herkunft));
  pruefe(gefunden.repo === 'fremd/station-x', 'Der Treffer hat nicht den '
    + 'erwarteten Namen: ' + JSON.stringify(gefunden.repo));
  pruefe(gefunden.name === 'station-x', 'Der Treffer trägt nicht den '
    + 'Repository-Namen: ' + JSON.stringify(gefunden.name));
  pruefe(gefunden.sterne === 9, 'Der Treffer trägt nicht die Sterne: '
    + JSON.stringify(gefunden.sterne));
  pruefe(gefunden.herkunft === 'gefunden' && gefunden.web
    === 'https://github.com/fremd/station-x', 'Dem Treffer fehlt der '
    + 'Web-Verweis: ' + JSON.stringify(gefunden.web));
  pruefe(!daten.gefunden.some((eintrag) => eintragSchluessel(eintrag)
    === 'kuratiert/station-y'), 'Das Doppel steht in `gefunden`: '
    + JSON.stringify(daten.gefunden.map(eintragSchluessel)));

  pruefe(daten.eintraege.length === 2, '`eintraege` enthält nicht beide '
    + 'Einträge: ' + JSON.stringify(daten.eintraege.map(eintragSchluessel)));
  pruefe(daten.eintraege[0].herkunft === 'kuratiert'
    && daten.eintraege[1].herkunft === 'gefunden',
  '`eintraege` steht nicht kuratiert zuerst: '
    + JSON.stringify(daten.eintraege.map((eintrag) => eintrag.herkunft)));
  pruefe(daten.eintraege.filter((eintrag) => eintragSchluessel(eintrag)
    === 'kuratiert/station-y').length === 1, 'Die kuratierte Station steht '
    + 'doppelt in `eintraege`: '
    + JSON.stringify(daten.eintraege.map(eintragSchluessel)));
  pruefe(daten.eintraege.filter((eintrag) => eintragSchluessel(eintrag)
    === 'fremd/station-x').length === 1, 'Der Treffer steht doppelt in '
    + '`eintraege`: ' + JSON.stringify(daten.eintraege.map(eintragSchluessel)));
  console.log('ok Herkunft: jeder Eintrag nennt sie, kuratiert und gefunden '
    + 'getrennt');

  // 2. Beide Stände stehen in der Antwort und getrennt im Zwischenspeicher.
  const cache = liesJson(CACHE);
  pruefe(cache.am === daten.stand, 'Der Zwischenspeicher trägt nicht den '
    + 'Stand der Sammlung: ' + JSON.stringify({ cache: cache.am, antwort: daten.stand }));
  pruefe(cache.gefunden && cache.gefunden.am === daten.standGefunden,
    'Der Zwischenspeicher trägt nicht den Stand der Suche: '
      + JSON.stringify({ cache: cache.gefunden && cache.gefunden.am,
        antwort: daten.standGefunden }));
  pruefe(Array.isArray(cache.eintraege) && cache.eintraege.length === 2,
    'katalog-cache.json trägt nicht beide Einträge: '
      + JSON.stringify(cache.eintraege));
  pruefe(cache.eintraege[0].herkunft === 'kuratiert'
    && cache.eintraege[1].herkunft === 'gefunden',
  'katalog-cache.json führt die Herkunft nicht in der Reihenfolge: '
    + JSON.stringify(cache.eintraege.map((eintrag) => eintrag.herkunft)));
  pruefe(Array.isArray(cache.gefunden.eintraege)
    && cache.gefunden.eintraege.length === 1
    && cache.gefunden.eintraege[0].repo === 'fremd/station-x',
  'katalog-cache.json trägt nicht den gefundenen Eintrag: '
    + JSON.stringify(cache.gefunden));
  console.log('ok Stände: Sammlung und Suche getrennt, beide gesetzt');

  // 3. Innerhalb der Haltbarkeit kommt die Antwort ohne Server; `?suche=`
  //    wirkt auf alle drei Listen gleich.
  const anfragenVor = anfragen.length;
  const zweit = await ruf(gebaut, '/board/katalog');
  pruefe(zweit.status === 200, 'Der zweite Aufruf antwortet ' + zweit.status);
  pruefe(anfragen.length === anfragenVor, 'Der zweite Aufruf innerhalb der '
    + 'Haltbarkeit hat den Server gefragt: '
      + JSON.stringify(anfragen.slice(anfragenVor)));
  herkunftPruefen(zweit.daten, 'Der zweite Aufruf');
  zusammenPruefen(zweit.daten, 'Der zweite Aufruf');
  staendePruefen(zweit.daten, 'Der zweite Aufruf');
  pruefe(zweit.daten.stand === daten.stand
    && zweit.daten.standGefunden === daten.standGefunden,
  'Der zweite Aufruf verliert einen Stand: ' + JSON.stringify({
    vorher: { stand: daten.stand, standGefunden: daten.standGefunden },
    nachher: { stand: zweit.daten.stand, standGefunden: zweit.daten.standGefunden },
  }));

  const filterPruefen = async (text, erwartet) => {
    const antwort = await ruf(gebaut, '/board/katalog?suche='
      + encodeURIComponent(text));
    pruefe(antwort.status === 200, 'Die Suche „' + text + '“ antwortet '
      + antwort.status + ': ' + JSON.stringify(antwort.daten));
    const gefiltert = antwort.daten;
    herkunftPruefen(gefiltert, 'Suche „' + text + '“');
    zusammenPruefen(gefiltert, 'Suche „' + text + '“');
    staendePruefen(gefiltert, 'Suche „' + text + '“');
    pruefe(gefiltert.kuratiert.length === erwartet.kuratiert,
      'Die Suche „' + text + '“ lässt ' + gefiltert.kuratiert.length
        + ' kuratierte Einträge stehen statt ' + erwartet.kuratiert
        + ': ' + JSON.stringify(gefiltert.kuratiert.map(eintragSchluessel)));
    pruefe(gefiltert.gefunden.length === erwartet.gefunden,
      'Die Suche „' + text + '“ lässt ' + gefiltert.gefunden.length
        + ' gefundene Einträge stehen statt ' + erwartet.gefunden
        + ': ' + JSON.stringify(gefiltert.gefunden.map(eintragSchluessel)));
    pruefe(gefiltert.eintraege.length === erwartet.gesamt,
      'Die Suche „' + text + '“ lässt ' + gefiltert.eintraege.length
        + ' Einträge stehen statt ' + erwartet.gesamt
        + ': ' + JSON.stringify(gefiltert.eintraege.map(eintragSchluessel)));
    if (erwartet.repo) {
      pruefe(gefiltert.eintraege.some((eintrag) => eintragSchluessel(eintrag)
        === erwartet.repo), 'Die Suche „' + text + '“ verliert '
        + erwartet.repo + ': '
        + JSON.stringify(gefiltert.eintraege.map(eintragSchluessel)));
    }
    return gefiltert;
  };

  await filterPruefen('station', { kuratiert: 1, gefunden: 1, gesamt: 2 });
  await filterPruefen('station-x', {
    kuratiert: 0, gefunden: 1, gesamt: 1, repo: 'fremd/station-x',
  });
  await filterPruefen('kuratiert', {
    kuratiert: 1, gefunden: 0, gesamt: 1, repo: 'kuratiert/station-y',
  });
  await filterPruefen('KURATIERT', {
    kuratiert: 1, gefunden: 0, gesamt: 1, repo: 'kuratiert/station-y',
  });
  // Der Verweis ist auch ein Suchwort: `station-y` steht im Namen mit
  // Leerzeichen, im Verweis mit Bindestrich.
  await filterPruefen('station-y', {
    kuratiert: 1, gefunden: 0, gesamt: 1, repo: 'kuratiert/station-y',
  });
  await filterPruefen('ohne-treffer', { kuratiert: 0, gefunden: 0, gesamt: 0 });
  pruefe(anfragen.length === anfragenVor, 'Die Suche im Katalog hat den '
    + 'Server gefragt: ' + JSON.stringify(anfragen.slice(anfragenVor)));
  pruefe(sucheAufrufe === 1, 'Die Suche wurde erneut gefragt: ' + sucheAufrufe);
  console.log('ok Suche: filtert `eintraege`, `kuratiert` und `gefunden` '
    + 'gleich');

  // 4. Ohne Server gelten die letzten Stände mit Hinweis; `katalog.json`
  //    bleibt unverändert und nimmt keine gefundenen Einträge auf.
  await stoppeServer();
  const offline = await ruf(gebaut, '/board/katalog?frisch=1');
  pruefe(offline.status === 200, 'Ohne Server antwortet der Katalog '
    + offline.status + ': ' + JSON.stringify(offline.daten));
  const off = offline.daten;
  herkunftPruefen(off, 'Ohne Server');
  zusammenPruefen(off, 'Ohne Server');
  staendePruefen(off, 'Ohne Server');
  pruefe(off.eintraege.length === 2, 'Ohne Server verschwinden Einträge: '
    + JSON.stringify(off.eintraege.map(eintragSchluessel)));
  pruefe(off.kuratiert.length === 1 && off.kuratiert[0].name === 'Station Y',
    'Ohne Server fehlt die kuratierte Station: ' + JSON.stringify(off.kuratiert));
  pruefe(off.gefunden.length === 1
    && off.gefunden[0].repo === 'fremd/station-x'
    && off.gefunden[0].sterne === 9,
  'Ohne Server fehlt der letzte Suchstand: ' + JSON.stringify(off.gefunden));
  pruefe(off.stand === daten.stand, 'Ohne Server gilt nicht der letzte Stand '
    + 'der Sammlung: ' + JSON.stringify({ vorher: daten.stand, nachher: off.stand }));
  pruefe(off.standGefunden === daten.standGefunden,
    'Ohne Server gilt nicht der letzte Stand der Suche: '
      + JSON.stringify({ vorher: daten.standGefunden, nachher: off.standGefunden }));
  const hinweis = String(off.hinweis || '');
  pruefe(hinweis.startsWith('Ohne Verbindung: letzter Stand vom '),
    'Ohne Server fehlt der Hinweis auf den letzten Stand: '
      + JSON.stringify(hinweis));
  pruefe(hinweis.length > 'Ohne Verbindung: letzter Stand vom '.length,
    'Der Hinweis nennt keinen Zeitpunkt: ' + JSON.stringify(hinweis));

  pruefe(readFileSync(KATALOG_DATEI, 'utf8') === katalogVorher,
    'katalog.json wurde durch den Katalog verändert');
  const katalogNachher = liesJson(KATALOG_DATEI);
  pruefe(katalogNachher.stationen.length === 1
    && katalogNachher.stationen[0].repo === 'station-y',
  'katalog.json trägt nicht mehr nur die kuratierte Station: '
    + JSON.stringify(katalogNachher.stationen));
  pruefe(!JSON.stringify(katalogNachher).includes('fremd/station-x'),
    'Ein gefundener Eintrag wurde in katalog.json geschrieben: '
      + JSON.stringify(katalogNachher));
  console.log('ok ohne Server: letzte Stände mit Hinweis, katalog.json '
    + 'unverändert');

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
console.log('ok Katalog: Herkunft, eine Liste, zwei Stände, keine Doppel');
