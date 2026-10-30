/**
 * Prüfung Schritt 22 — der Stand je Repository.
 *
 * Die fünf Repositories liegen in einer eigenen Prüffläche unter
 * `/tmp/board-scheibe1/schritt22`, daneben ein eigenes `DSH_HOME`. Für das
 * Vorhaben-Repository entsteht daneben ein Bare-Repository als `origin`; der
 * Server läuft in-process, und das Testboard wird über `POST /board/boards`
 * mit seinem lokalen Ordner verbunden.
 *
 * Geprüft wird:
 *
 *   1. Nach dem Weitergeben zeigt `/board/data` für das Vorhaben „nicht
 *      abgeglichen“ und eine Fassung nur lokal; Board, Workflow und die beiden
 *      Stationen stehen als „kein remote“ da.
 *   2. `POST /board/sync` gleicht das Vorhaben ab: „abgeglichen“, null nur
 *      lokale Fassungen, das Bare-Repository trägt dieselbe Fassung.
 *   3. Wird das Bare-Repository umbenannt (offline) und erneut weitergegeben,
 *      antwortet `POST /board/sync` weiter mit 200; das Vorhaben steht als
 *      „nicht abgeglichen“ mit einer nur lokalen Fassung und einem Grund da,
 *      und das Board liefert weiter seine Karte.
 *   4. Nach dem Zurückbenennen gleicht derselbe Aufruf wieder ab.
 *   5. Server, Ablage und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt22');
const HOME = join(ABLAGE, 'home');
const BOARD = join(ABLAGE, 'board');
const VORHABEN = join(ABLAGE, 'vorhaben');
const VORHABEN_ID = 'board-gesamtkonzept';
const BARE = join(ABLAGE, 'origin.git');
const BARE_WEG = BARE + '.weg';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function gitIn(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

function git(ordner, args) {
  return gitIn(ordner, args);
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

async function starten() {
  process.env.DSH_HOME = HOME;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  modul.apply(gebaut.ctx);
  return gebaut;
}

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad, koerper), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

/** Der eine Stand einer Art; doppelte Einträge wären schon ein Fehler. */
function standVon(staende, art) {
  const treffer = (Array.isArray(staende) ? staende : []).filter((e) => e.art === art);
  pruefe(treffer.length === 1,
    'Es gibt ' + treffer.length + ' Einträge der Art „' + art + '“ statt einem: '
      + JSON.stringify(treffer));
  return treffer[0];
}

/** Ein Stand, der nichts mit dem Remote zu tun hat. */
function ohneRemote(eintrag) {
  pruefe(eintrag.lage === 'kein remote',
    eintrag.art + ' steht als ' + JSON.stringify(eintrag.lage) + ' statt „kein remote“');
  pruefe(eintrag.nur_lokal === 0,
    eintrag.art + ' zählt ' + eintrag.nur_lokal + ' nur lokale Fassungen statt 0');
  pruefe(eintrag.remote === null,
    eintrag.art + ' nennt einen Remote: ' + JSON.stringify(eintrag.remote));
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === BOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);
  pruefe(flaeche.vorhaben === VORHABEN_ID,
    'Die Prüffläche meldet nicht die Kennung des Vorhabens: ' + flaeche.vorhaben);

  // Das Vorhaben bekommt ein Bare-Repository als Remote; `main` liegt dort.
  gitIn(ABLAGE, ['init', '-q', '--bare', BARE]);
  git(VORHABEN, ['remote', 'add', 'origin', BARE]);
  git(VORHABEN, ['push', '-q', '-u', 'origin', 'main']);
  pruefe(git(VORHABEN, ['rev-parse', 'HEAD'])
    === git(VORHABEN, ['rev-parse', 'origin/main']),
  'origin/main trägt nach dem ersten Schicken nicht die lokale Fassung');

  // Ein leeres Register und eine Identität: der Server liest nichts von der
  // echten Ablage. Das Testboard kommt allein über die Route dazu.
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1, aktiv: null, boards: [],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  const verbunden = await ruf(gebaut, '/board/boards', { adresse: BOARD });
  pruefe(verbunden.status === 200,
    'POST /board/boards antwortet ' + verbunden.status + ': ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.board === 'testboard',
    'Verbunden wurde nicht das Testboard: ' + JSON.stringify(verbunden.daten));

  // 1. Das Vorhaben weitergeben: der Commit bleibt zunächst lokal.
  const weiter = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'umsetzen', person: 'p1',
  });
  pruefe(weiter.status === 200,
    'POST /board/vorhaben/verschieben antwortet ' + weiter.status + ': '
      + JSON.stringify(weiter.daten));
  pruefe(git(VORHABEN, ['rev-list', '--count', 'origin/main..HEAD']) === '1',
    'Nach dem Weitergeben steht nicht genau eine Fassung vor dem Remote');

  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status);
  const staende = daten.daten.staende;
  pruefe(Array.isArray(staende), '/board/data nennt keine staende');
  pruefe(staende.length === 5,
    'Das Board zeigt ' + staende.length + ' Repositories statt fünf: ' + JSON.stringify(staende));
  pruefe(staende.filter((e) => e.art === 'station').length === 2,
    'Die beiden Stationen stehen nicht genau einmal im Stand: ' + JSON.stringify(staende));

  const vorhabenStand = standVon(staende, 'vorhaben');
  pruefe(vorhabenStand.pfad === VORHABEN,
    'Der Stand des Vorhabens nennt nicht seinen Pfad: ' + JSON.stringify(vorhabenStand.pfad));
  pruefe(vorhabenStand.name === 'Board Gesamtkonzept',
    'Der Stand des Vorhabens nennt nicht seinen Namen: ' + JSON.stringify(vorhabenStand.name));
  pruefe(vorhabenStand.remote === BARE,
    'Der Stand des Vorhabens nennt nicht den Bare-Remote: '
      + JSON.stringify(vorhabenStand.remote));
  pruefe(vorhabenStand.lage === 'nicht abgeglichen',
    'Das Vorhaben steht als ' + JSON.stringify(vorhabenStand.lage)
      + ' statt „nicht abgeglichen“ da');
  pruefe(vorhabenStand.nur_lokal === 1,
    'Das Vorhaben zählt ' + vorhabenStand.nur_lokal
      + ' nur lokale Fassungen statt 1');

  const boardStand = standVon(staende, 'board');
  pruefe(boardStand.name === 'Testboard',
    'Der Stand des Boards nennt nicht seinen Namen: ' + JSON.stringify(boardStand.name));
  const workflowStand = standVon(staende, 'workflow');
  pruefe(workflowStand.name === 'Standard-Workflow',
    'Der Stand des Workflows nennt nicht seinen Titel: ' + JSON.stringify(workflowStand.name));
  const stationen = staende.filter((e) => e.art === 'station')
    .map((e) => e.name).sort();
  pruefe(JSON.stringify(stationen) === JSON.stringify(['Idee', 'Umsetzen']),
    'Die Stationen stehen ohne ihre Namen da: ' + JSON.stringify(stationen));
  for (const eintrag of staende.filter((e) => e.art !== 'vorhaben')) ohneRemote(eintrag);

  pruefe(daten.daten.stand.nur_lokal === 1,
    'Die Zusammenfassung zählt ' + daten.daten.stand.nur_lokal + ' statt 1');
  pruefe(daten.daten.stand.lage === 'nicht abgeglichen',
    'Die Zusammenfassung steht als ' + JSON.stringify(daten.daten.stand.lage)
      + ' statt „nicht abgeglichen“');
  const karte = (daten.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(karte && karte.position === 'umsetzen',
    'Das Board zeigt die Karte nicht an umsetzen: '
      + JSON.stringify(karte && karte.position));

  // 2. Der Abgleich holt und schickt; danach liegt nichts mehr nur lokal.
  const sync = await ruf(gebaut, '/board/sync', {});
  pruefe(sync.status === 200, 'POST /board/sync antwortet ' + sync.status);
  pruefe(Array.isArray(sync.daten.staende) && sync.daten.staende.length === 5,
    'POST /board/sync gibt nicht fünf Stände zurück: ' + JSON.stringify(sync.daten));
  const nachSync = standVon(sync.daten.staende, 'vorhaben');
  pruefe(nachSync.lage === 'abgeglichen',
    'Das Vorhaben steht nach dem Abgleich als ' + JSON.stringify(nachSync.lage)
      + ' statt „abgeglichen“ da');
  pruefe(nachSync.nur_lokal === 0,
    'Das Vorhaben zählt nach dem Abgleich ' + nachSync.nur_lokal
      + ' nur lokale Fassungen statt 0');
  pruefe(typeof nachSync.zeit === 'string' && nachSync.zeit.length > 0,
    'Der Abgleich setzt keine Zeit: ' + JSON.stringify(nachSync.zeit));
  pruefe(nachSync.fehler === '',
    'Der gelungene Abgleich nennt einen Fehler: ' + JSON.stringify(nachSync.fehler));
  for (const eintrag of sync.daten.staende.filter((e) => e.art !== 'vorhaben')) {
    ohneRemote(eintrag);
  }
  pruefe(git(BARE, ['rev-parse', 'main']) === git(VORHABEN, ['rev-parse', 'HEAD']),
    'Das Bare-Repository trägt nach dem Abgleich nicht die lokale Fassung');

  const nachDaten = await ruf(gebaut, '/board/data');
  const nachDatenVorhaben = standVon(nachDaten.daten.staende, 'vorhaben');
  pruefe(nachDatenVorhaben.lage === 'abgeglichen' && nachDatenVorhaben.nur_lokal === 0,
    '/board/data zeigt nach dem Abgleich nicht das abgeglichene Vorhaben: '
      + JSON.stringify(nachDatenVorhaben));
  console.log('ok Stand: Vorhaben zuerst 1 Fassung nur lokal, dann abgeglichen; '
    + 'station-idee, station-umsetzen, workflow und board: kein Remote');

  // 3. Offline: das Bare-Repository ist weg, das Weitergeben bleibt lokal.
  renameSync(BARE, BARE_WEG);
  pruefe(!existsSync(BARE), 'Das Bare-Repository wurde nicht umbenannt');
  const weiterOffline = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN_ID, position: 'idee', person: 'p1',
  });
  pruefe(weiterOffline.status === 200,
    'Das Weitergeben ohne Netz antwortet ' + weiterOffline.status + ': '
      + JSON.stringify(weiterOffline.daten));
  pruefe(git(VORHABEN, ['rev-list', '--count', 'origin/main..HEAD']) === '1',
    'Nach dem Weitergeben ohne Netz steht nicht genau eine Fassung vor dem Remote');

  const offlineDaten = await ruf(gebaut, '/board/data');
  pruefe(offlineDaten.status === 200,
    '/board/data antwortet offline ' + offlineDaten.status);
  const offlineKarte = (offlineDaten.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(offlineKarte && offlineKarte.position === 'idee',
    'Das Board zeigt offline die Karte nicht an idee: '
      + JSON.stringify(offlineKarte && offlineKarte.position));
  const offlineVorher = standVon(offlineDaten.daten.staende, 'vorhaben');
  pruefe(offlineVorher.lage === 'nicht abgeglichen' && offlineVorher.nur_lokal === 1,
    'Das Vorhaben steht vor dem Abgleich offline nicht als „nicht abgeglichen“ '
      + 'mit einer nur lokalen Fassung: ' + JSON.stringify(offlineVorher));

  const offlineSync = await ruf(gebaut, '/board/sync', {});
  pruefe(offlineSync.status === 200,
    'POST /board/sync antwortet offline ' + offlineSync.status + ' statt 200');
  const offlineNach = standVon(offlineSync.daten.staende, 'vorhaben');
  pruefe(offlineNach.lage === 'nicht abgeglichen',
    'Das Vorhaben steht offline nach dem Abgleich als ' + JSON.stringify(offlineNach.lage)
      + ' statt „nicht abgeglichen“ da');
  pruefe(offlineNach.nur_lokal === 1,
    'Das Vorhaben zählt offline ' + offlineNach.nur_lokal
      + ' nur lokale Fassungen statt 1');
  pruefe(String(offlineNach.fehler || '').length > 0,
    'Der gescheiterte Abgleich nennt keinen Grund');
  for (const eintrag of offlineSync.daten.staende.filter((e) => e.art !== 'vorhaben')) {
    ohneRemote(eintrag);
  }

  const danach = await ruf(gebaut, '/board/data');
  pruefe(danach.status === 200,
    '/board/data antwortet nach dem gescheiterten Abgleich ' + danach.status);
  const danachKarte = (danach.daten.vorgaenge || []).find((v) => v.id === VORHABEN_ID);
  pruefe(danachKarte && danachKarte.position === 'idee',
    'Das Board verliert offline seine Karte: '
      + JSON.stringify(danachKarte && danachKarte.position));
  const danachVorhaben = standVon(danach.daten.staende, 'vorhaben');
  pruefe(danachVorhaben.lage === 'nicht abgeglichen'
    && danachVorhaben.nur_lokal === 1
    && String(danachVorhaben.fehler || '').length > 0,
  '/board/data nennt offline nicht Lage, Zahl und Grund: '
    + JSON.stringify(danachVorhaben));
  console.log('ok offline: Vorhaben nicht abgeglichen, 1 Fassung nur hier, '
    + 'das Board zeigt weiter seine Karte');

  // 4. Zurückbenennen: derselbe Aufruf holt nach und schickt weiter.
  renameSync(BARE_WEG, BARE);
  const wieder = await ruf(gebaut, '/board/sync', {});
  pruefe(wieder.status === 200, 'POST /board/sync antwortet ' + wieder.status);
  const wiederStand = standVon(wieder.daten.staende, 'vorhaben');
  pruefe(wiederStand.lage === 'abgeglichen',
    'Das Vorhaben steht nach dem zweiten Abgleich als '
      + JSON.stringify(wiederStand.lage) + ' statt „abgeglichen“ da');
  pruefe(wiederStand.nur_lokal === 0,
    'Das Vorhaben zählt nach dem zweiten Abgleich ' + wiederStand.nur_lokal
      + ' nur lokale Fassungen statt 0');
  pruefe(wiederStand.fehler === '',
    'Der zweite Abgleich nennt weiter einen Fehler: '
      + JSON.stringify(wiederStand.fehler));
  pruefe(git(BARE, ['rev-parse', 'main']) === git(VORHABEN, ['rev-parse', 'HEAD']),
    'Das Bare-Repository trägt nach dem zweiten Abgleich nicht die lokale Fassung');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
pruefe(!existsSync(join(WURZEL, 'schritt22')), 'Der Ordner schritt22 blieb liegen');
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
