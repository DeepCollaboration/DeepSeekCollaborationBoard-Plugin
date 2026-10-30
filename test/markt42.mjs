/**
 * Prüfung Schritt 42 — der Umzug als Route.
 *
 * Die echte alte Ablage wird nur gelesen und nach
 * `/tmp/board-scheibe1/markt42/quelle` kopiert. Der Umzug läuft ausschließlich
 * auf dieser Kopie und schreibt unter ein Ziel daneben; die echte Ablage wird
 * nie beschrieben. Die Kopie muss vorher und nachher dieselbe Prüfsumme tragen.
 *
 * Geprüft wird:
 *
 *   1. Die Route ist angemeldet; ein GET antwortet 405.
 *   2. Ohne Schreibrecht (Board mit Remote, kein Token) → 403, kein Ziel
 *      entsteht.
 *   3. Ohne Ziel (leeres Ziel) → 400; ein Ziel in der alten Ablage → 400;
 *      eine ungültige Zuordnung → 400.
 *   4. Ein Aufruf ohne Angaben zieht auf den Vorgabeordner unter
 *      `$DSH_HOME/board/umzug` um: 18 Repositories, je Name, GitHub-Name,
 *      Sichtbarkeit und „angelegt“; die Zuordnung aus dem Register steht in
 *      der Antwort und im Bericht; die Kopie ist byte-gleich.
 *   5. Ein zweiter Lauf auf dasselbe Ziel überschreibt nichts: alles
 *      „übersprungen“, Ziel byte-gleich, die vorhandenen Namen stehen da.
 *      Danach gilt die Zuordnung aus `identitaet.json`.
 *   6. Eine eigene Zuordnung wird benutzt; die kleine Ablage im Archiv ist
 *      dabei das offene Board und bleibt unverändert.
 *   7. Die Prüfablage ist danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt42');
const HOME = join(ABLAGE, 'home');
const QUELLE = join(ABLAGE, 'quelle');
const KLEIN = join(ABLAGE, 'klein');
const BOARD = join(ABLAGE, 'board-test');
const FERN = join(ABLAGE, 'board-fern');
const REGISTER = join(HOME, 'board', 'boards.json');
const ECHT = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const HOST = 'DeepCollaboration';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function gleich(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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

/** Ein lokales Repository mit einer Fassung; optional mit GitHub-Remote. */
function festschreiben(ordner, remote = '') {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-q', '-m', 'Prüfung',
  ]);
  if (remote) git(ordner, ['remote', 'add', 'origin', remote]);
}

/** Alle Dateien unterhalb eines Ordners, relativ, mit `.git`. */
function dateienVon(ordner, basis = ordner) {
  const ergebnis = [];
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...dateienVon(pfad, basis));
    else if (eintrag.isFile()) ergebnis.push(relative(basis, pfad).split(sep).join('/'));
  }
  return ergebnis.sort();
}

/** Die Prüfsumme eines Ordners: Namen und Inhalte aller Dateien. */
function pruefsumme(ordner) {
  const hash = createHash('sha256');
  for (const name of dateienVon(ordner)) {
    hash.update(name);
    hash.update('\0');
    hash.update(readFileSync(join(ordner, name)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Ein Board der Fassung 2 ohne Workflow, nur als offenes Ziel der Route. */
function legeBoard(pfad, id, name) {
  schreibeJson(join(pfad, 'board.json'), {
    format: 2,
    id,
    name,
    art: 'team',
    personen: [{ login: HOST, name: HOST, farbe: '#fbbf24' }],
    workflows: [],
    vorhaben: [],
    stationen: [],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(pfad, 'README.md'), '# ' + name + '\n', 'utf8');
}

/** Die kleine Ablage der Fassung 1: eine Person, ein Workflow, keine Vorhaben. */
function legeKlein() {
  mkdirSync(join(KLEIN, 'personen'), { recursive: true });
  mkdirSync(join(KLEIN, 'vorgaenge'), { recursive: true });
  mkdirSync(join(KLEIN, 'workflows'), { recursive: true });
  writeFileSync(join(KLEIN, 'format'), '1\n', 'utf8');
  schreibeJson(join(KLEIN, 'personen', 'p1.json'),
    { id: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' });
  schreibeJson(join(KLEIN, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'klein',
      titel: 'Kleiner Workflow',
      schritte: [{
        id: 'start',
        name: 'Start',
        host: 'p1',
        eingang: [],
        ausgabe: [],
        wie: { art: 'datei', wert: '' },
        skill: null,
        inhalt: 'Der Anfang in einem Satz.',
      }],
      positionen: [{ id: 'start', schritt: 'start', x: 40, y: 80 }],
      kanten: [],
      layout: 'auto',
    }],
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
    throw new Error('Die Antwort von ' + pfad + ' ist kein JSON: ' + res.text.slice(0, 300));
  }
  pruefe(daten !== null && typeof daten === 'object',
    'Die Antwort von ' + pfad + ' ist kein JSON-Objekt: ' + res.text.slice(0, 300));
  return { status: res.status, daten };
}

function zahlDerArt(repositories, art) {
  return repositories.filter((eintrag) => eintrag.art === art).length;
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  // 0. Die echte alte Ablage nur lesen und vollständig kopieren.
  pruefe(existsSync(join(ECHT, 'format')), 'Die echte alte Ablage fehlt: ' + ECHT);
  cpSync(ECHT, QUELLE, { recursive: true });
  const quelleVorher = pruefsumme(QUELLE);

  legeKlein();
  const kleinVorher = pruefsumme(KLEIN);
  legeBoard(BOARD, 'testboard', 'Testboard');
  festschreiben(BOARD);
  legeBoard(FERN, 'fern', 'Fernboard');
  festschreiben(FERN, 'https://github.com/eigen/board-fern.git');

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [
      {
        id: 'alt', name: 'Alte Ablage', format: 1, art: 'ordner',
        repo: QUELLE, remote: null, person: 'p1',
      },
      {
        id: 'klein', name: 'Kleine Ablage', format: 1, art: 'ordner',
        repo: KLEIN, remote: null, person: 'p1', archiv: true,
      },
      {
        id: 'testboard', name: 'Testboard', format: 2, art: 'team',
        repo: BOARD, remote: null, person: HOST,
      },
      {
        id: 'fern', name: 'Fernboard', format: 2, art: 'lokal',
        repo: FERN, remote: 'https://github.com/eigen/board-fern.git',
        person: HOST,
      },
    ],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  process.env.DSH_HOME = HOME;
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  pruefe(gebaut.routen.has('/board/umzug'),
    'Die Route /board/umzug ist nicht angemeldet');

  // 1. Nur POST; ein GET antwortet 405.
  const nurGet = await ruf(gebaut, '/board/umzug');
  pruefe(nurGet.status === 405,
    'GET /board/umzug antwortet ' + nurGet.status + ': ' + JSON.stringify(nurGet.daten));
  console.log('ok Route: /board/umzug angemeldet, nur POST');

  // 2. Ohne Schreibrecht: 403, und es entsteht kein Ziel.
  const fern = await ruf(gebaut, '/board/boards/wechsel', { id: 'fern' });
  pruefe(fern.status === 200, 'Der Wechsel auf das Fernboard antwortet '
    + fern.status + ': ' + JSON.stringify(fern.daten));
  const verweigert = await ruf(gebaut, '/board/umzug', {});
  pruefe(verweigert.status === 403,
    'Ohne Schreibrecht antwortet der Umzug ' + verweigert.status
      + ': ' + JSON.stringify(verweigert.daten));
  pruefe(/token/i.test(String(verweigert.daten.error || '')),
    'Der Grund für das fehlende Schreibrecht fehlt: '
      + JSON.stringify(verweigert.daten.error));
  pruefe(!existsSync(join(HOME, 'board', 'umzug')),
    'Ohne Schreibrecht wurde trotzdem ein Ziel angelegt');
  const zurueck = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(zurueck.status === 200 && zurueck.daten.aktiv === 'testboard',
    'Der Wechsel zurück antwortet ' + zurueck.status);
  console.log('ok Stopp: ohne Schreibrecht 403, kein Ziel angelegt');

  // 3. Ohne Ziel 400; Ziel in der alten Ablage 400; falsche Zuordnung 400.
  const ohneZiel = await ruf(gebaut, '/board/umzug', { ziel: '' });
  pruefe(ohneZiel.status === 400 && /ziel/i.test(String(ohneZiel.daten.error || '')),
    'Ohne Ziel antwortet der Umzug ' + ohneZiel.status
      + ': ' + JSON.stringify(ohneZiel.daten));
  const imQuelle = await ruf(gebaut, '/board/umzug', { ziel: join(QUELLE, 'drin') });
  pruefe(imQuelle.status === 400,
    'Ein Ziel in der alten Ablage antwortet ' + imQuelle.status
      + ': ' + JSON.stringify(imQuelle.daten));
  const falsch = await ruf(gebaut, '/board/umzug', {
    ziel: join(ABLAGE, 'waere-nicht'),
    zuordnung: { p1: 'kein name!' },
  });
  pruefe(falsch.status === 400 && /GitHub-Name/i.test(String(falsch.daten.error || '')),
    'Eine ungültige Zuordnung antwortet ' + falsch.status
      + ': ' + JSON.stringify(falsch.daten));
  pruefe(!existsSync(join(ABLAGE, 'waere-nicht')),
    'Trotz Fehler wurde ein Ziel angelegt');
  pruefe(!existsSync(join(HOME, 'board', 'umzug')),
    'Trotz Fehler wurde der Vorgabeordner angelegt');
  console.log('ok Stopp: ohne Ziel 400, Ziel in der Ablage 400, falsche Zuordnung 400');

  // 4. Der Umzug ohne Angaben: Vorgabeziel, Zuordnung aus dem Register.
  const lauf = await ruf(gebaut, '/board/umzug', {});
  pruefe(lauf.status === 200,
    'POST /board/umzug antwortet ' + lauf.status + ': ' + JSON.stringify(lauf.daten));
  const ziel = lauf.daten.ziel;
  pruefe(typeof ziel === 'string' && ziel.startsWith(join(HOME, 'board', 'umzug') + sep),
    'Das Vorgabeziel liegt nicht unter $DSH_HOME/board/umzug: ' + JSON.stringify(ziel));
  pruefe(existsSync(ziel), 'Das Ziel fehlt nach dem Lauf: ' + ziel);
  pruefe(gleich(lauf.daten.zuordnung, { p1: HOST }),
    'Die Zuordnung aus dem Register fehlt: ' + JSON.stringify(lauf.daten.zuordnung));
  pruefe(lauf.daten.host === HOST,
    'Der GitHub-Name des Laufs fehlt: ' + JSON.stringify(lauf.daten.host));
  const repositories = lauf.daten.repositories;
  pruefe(Array.isArray(repositories) && repositories.length === 18,
    'Der Bericht nennt nicht 18 Repositories: '
      + JSON.stringify(Array.isArray(repositories) ? repositories.length : repositories));
  pruefe(zahlDerArt(repositories, 'station') === 11
    && zahlDerArt(repositories, 'workflow') === 1
    && zahlDerArt(repositories, 'vorhaben') === 4
    && zahlDerArt(repositories, 'board') === 2,
  'Die Arten stimmen nicht: ' + JSON.stringify(repositories.map((e) => e.art)));
  for (const eintrag of repositories) {
    pruefe(eintrag.name && typeof eintrag.name === 'string',
      'Ein Repository ohne Namen: ' + JSON.stringify(eintrag));
    pruefe(eintrag.github === HOST,
      'Ein Repository ohne GitHub-Namen: ' + JSON.stringify(eintrag));
    pruefe(eintrag.stand === 'angelegt',
      'Ein Repository ist nicht angelegt: ' + JSON.stringify(eintrag));
    pruefe(eintrag.fehler === '',
      'Ein Repository meldet einen Fehler: ' + JSON.stringify(eintrag));
    pruefe(eintrag.sichtbarkeit === 'öffentlich' || eintrag.sichtbarkeit === 'privat',
      'Ein Repository ohne Sichtbarkeit: ' + JSON.stringify(eintrag));
  }
  pruefe(repositories.filter((e) => e.sichtbarkeit === 'öffentlich').length === 13,
    'Nicht 13 Repositories sind öffentlich: '
      + JSON.stringify(repositories.filter((e) => e.sichtbarkeit === 'öffentlich').length));
  pruefe(repositories.filter((e) => e.sichtbarkeit === 'privat').length === 5,
    'Nicht 5 Repositories sind privat: '
      + JSON.stringify(repositories.filter((e) => e.sichtbarkeit === 'privat').length));
  const idee = repositories.find((eintrag) => eintrag.repo === 'station-idee');
  pruefe(idee && idee.name === 'Idee' && idee.art === 'station',
    'Die Station „Idee“ fehlt im Bericht: ' + JSON.stringify(idee));
  const hauptboard = repositories.find((eintrag) => eintrag.repo === 'board-hauptboard');
  pruefe(hauptboard && hauptboard.sichtbarkeit === 'öffentlich',
    'Das Hauptboard fehlt oder ist nicht öffentlich: ' + JSON.stringify(hauptboard));
  const vorhaben = repositories
    .find((eintrag) => eintrag.repo === 'vorhaben-board-gesamtkonzept');
  pruefe(vorhaben && vorhaben.sichtbarkeit === 'privat',
    'Das Vorhaben fehlt oder ist nicht privat: ' + JSON.stringify(vorhaben));

  // Die Repositories stehen wirklich da, mit Fassung und Tag.
  pruefe(existsSync(join(ziel, 'station-idee', 'station.json')),
    'Die Station „Idee“ wurde nicht geschrieben');
  pruefe(git(join(ziel, 'station-idee'), ['rev-parse', '--verify', 'v1']) !== '',
    'Die Station „Idee“ trägt keinen Tag v1');
  pruefe(existsSync(join(ziel, 'board-team', 'board.json')),
    'Das Team-Board wurde nicht geschrieben');

  // Die Zuordnung steht im Bericht.
  pruefe(lauf.daten.bericht === join(ziel, 'umzug.md'),
    'Der Bericht liegt nicht im Ziel: ' + JSON.stringify(lauf.daten.bericht));
  const bericht = readFileSync(lauf.daten.bericht, 'utf8');
  pruefe(/^# Umzug auf Fassung 2/m.test(bericht), 'Der Bericht hat keinen Titel');
  pruefe(/## Zuordnung/.test(bericht), 'Der Bericht nennt keine Zuordnung');
  pruefe(bericht.includes('- `p1` → `' + HOST + '`'),
    'Die Zuordnung steht nicht im Bericht: ' + bericht.slice(-400));
  pruefe(new RegExp('## Repositories \\(18\\)').test(bericht),
    'Der Bericht zählt die Repositories nicht');
  pruefe(bericht.includes('`station-idee`') && bericht.includes('`board-hauptboard`'),
    'Der Bericht nennt die Repositories nicht');
  console.log('ok Umzug: 18 Repositories, Zuordnung im Bericht, Sichtbarkeit getrennt');

  // Die alte Ablage ist danach byte-gleich.
  const quelleNachher = pruefsumme(QUELLE);
  pruefe(quelleNachher === quelleVorher,
    'Die alte Ablage ist nach dem Umzug nicht byte-gleich: '
      + quelleVorher + ' → ' + quelleNachher);
  console.log('ok Kopie: alte Ablage vorher und nachher byte-gleich');

  // 5. Ein zweiter Lauf auf dasselbe Ziel überschreibt nichts.
  const zielVorher = pruefsumme(ziel);
  const zweiter = await ruf(gebaut, '/board/umzug', { ziel });
  pruefe(zweiter.status === 200,
    'Der zweite Lauf antwortet ' + zweiter.status + ': ' + JSON.stringify(zweiter.daten));
  pruefe(zweiter.daten.anzahl.angelegt === 0 && zweiter.daten.anzahl.uebersprungen === 18,
    'Der zweite Lauf legt an statt zu überspringen: '
      + JSON.stringify(zweiter.daten.anzahl));
  pruefe(zweiter.daten.repositories.length === 18
    && zweiter.daten.repositories.every((eintrag) => eintrag.stand === 'übersprungen'),
  'Der zweite Lauf nennt nicht alle als übersprungen');
  pruefe(zweiter.daten.repositories.some((eintrag) => eintrag.repo === 'station-idee'
    && eintrag.name === 'Idee'),
  'Der zweite Lauf nennt die vorhandenen Repositories nicht');
  pruefe(/nicht leer/i.test(String(zweiter.daten.hinweis || '')),
    'Der zweite Lauf sagt nicht, dass das Ziel nicht leer ist: '
      + JSON.stringify(zweiter.daten.hinweis));
  pruefe(gleich(zweiter.daten.zuordnung, { p1: HOST }),
    'Der zweite Lauf nennt die Zuordnung nicht: '
      + JSON.stringify(zweiter.daten.zuordnung));
  pruefe(pruefsumme(ziel) === zielVorher,
    'Der zweite Lauf hat das Ziel verändert');
  pruefe(pruefsumme(QUELLE) === quelleVorher,
    'Der zweite Lauf hat die alte Ablage verändert');
  console.log('ok zweiter Lauf: nichts überschrieben, übersprungen genannt');

  // Danach gilt die vorhandene Abbildung aus `identitaet.json`.
  const identitaet = await ruf(gebaut, '/board/identitaet', {
    name: 'Thomas Heinrich', github: 'thomas-heinrich', farbe: '#fbbf24',
  });
  pruefe(identitaet.status === 200, 'Die Identität ließ sich nicht setzen: '
    + identitaet.status + ': ' + JSON.stringify(identitaet.daten));
  const mitIdentitaet = await ruf(gebaut, '/board/umzug', { ziel });
  pruefe(mitIdentitaet.status === 200,
    'Der Lauf mit Identität antwortet ' + mitIdentitaet.status
      + ': ' + JSON.stringify(mitIdentitaet.daten));
  pruefe(gleich(mitIdentitaet.daten.zuordnung, { p1: 'thomas-heinrich' }),
    'Die Zuordnung aus identitaet.json fehlt: '
      + JSON.stringify(mitIdentitaet.daten.zuordnung));
  pruefe(mitIdentitaet.daten.repositories.every((eintrag) => eintrag.stand === 'übersprungen'),
    'Der Lauf mit Identität hat etwas angelegt');
  pruefe(pruefsumme(ziel) === zielVorher,
    'Der Lauf mit Identität hat das Ziel verändert');
  console.log('ok Zuordnung: aus identitaet.json gelesen');

  // 6. Eine eigene Zuordnung wird benutzt; die kleine Ablage liegt im Archiv.
  const klein = await ruf(gebaut, '/board/boards/wechsel', { id: 'klein' });
  pruefe(klein.status === 200 && klein.daten.aktiv === 'klein',
    'Der Wechsel auf die kleine Ablage antwortet ' + klein.status
      + ': ' + JSON.stringify(klein.daten));
  const zielKlein = join(ABLAGE, 'ziel-klein');
  const kleinLauf = await ruf(gebaut, '/board/umzug', {
    ziel: zielKlein,
    zuordnung: { p1: 'UmzugBot' },
  });
  pruefe(kleinLauf.status === 200,
    'Der Umzug aus dem Archiv antwortet ' + kleinLauf.status
      + ': ' + JSON.stringify(kleinLauf.daten));
  pruefe(gleich(kleinLauf.daten.zuordnung, { p1: 'UmzugBot' }),
    'Die eigene Zuordnung fehlt in der Antwort: '
      + JSON.stringify(kleinLauf.daten.zuordnung));
  pruefe(kleinLauf.daten.host === 'UmzugBot',
    'Der Lauf benutzt nicht den Namen aus der Zuordnung: '
      + JSON.stringify(kleinLauf.daten.host));
  pruefe(Array.isArray(kleinLauf.daten.repositories)
    && kleinLauf.daten.repositories.length === 4,
  'Die kleine Ablage ergibt nicht 4 Repositories: '
    + JSON.stringify(kleinLauf.daten.repositories && kleinLauf.daten.repositories.length));
  pruefe(kleinLauf.daten.repositories.every((eintrag) => eintrag.github === 'UmzugBot'
    && eintrag.stand === 'angelegt'),
  'Die kleine Ablage trägt nicht überall den Namen aus der Zuordnung: '
    + JSON.stringify(kleinLauf.daten.repositories));
  const kleinStation = JSON.parse(
    readFileSync(join(zielKlein, 'station-start', 'station.json'), 'utf8'),
  );
  pruefe(kleinStation.host === 'UmzugBot',
    'Die Station trägt nicht den GitHub-Namen aus der Zuordnung: '
      + JSON.stringify(kleinStation.host));
  pruefe(pruefsumme(KLEIN) === kleinVorher,
    'Das Archiv wurde durch den Umzug verändert');
  console.log('ok Zuordnung: eigener Name benutzt, Archiv unverändert');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Umzug: Route, Zuordnung, alte Ablage unverändert');
