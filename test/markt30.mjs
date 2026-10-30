/**
 * Prüfung Schritt 30 — Eine Datei in einem Vorhaben speichern.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt30`, daneben ein
 * eigenes `DSH_HOME`. Das Board der Fassung 2 verweist auf einen Workflow
 * (`workflow-standard`, Fassung `v1`) mit einer Station (`start`) und auf ein
 * Vorhaben (`testkonto/vorhaben-markt30`), das als eigenes Repository im
 * Zwischenspeicher liegt. Das Vorhaben-Repository trägt bei Beginn drei
 * Dateien und genau eine Fassung. Der Server läuft in-process; `DSH_GITHUB_API`
 * zeigt auf einen Port, auf dem nichts lauscht. Ein echtes Netz wird nicht
 * benutzt.
 *
 * Geprüft wird:
 *
 *   (a) `/board/doc` liefert die Basis der gefassten Datei; Speichern mit
 *       dieser Basis antwortet 200 mit neuer Basis. Die Datei trägt nach
 *       erneutem Lesen den neuen Text; das Vorhaben-Repository hat genau eine
 *       neue Fassung mit der handelnden Person als Autor und der Meldung
 *       „gespeichert“; das Board-Repository bekommt keine Fassung.
 *   (b) `..`, ein absoluter Pfad und ein Ordner statt Datei antworten 400;
 *       nichts wird geschrieben oder gefasst.
 *   (c) Eine unbekannte Vorhaben-Kennung antwortet 404; ein fremdes Vorhaben
 *       antwortet 403 mit Grund. Nichts wird geschrieben.
 *   (d) Ein Vorhaben mit Remote, aber ohne Token antwortet 403 mit Grund;
 *       nichts wird geschrieben oder gefasst.
 *   (e) Ein von außen gefasster neuer Stand macht die alte Basis überholt:
 *       Speichern antwortet 409 mit dem neuen Text und der neuen Basis, ohne
 *       zu schreiben oder zu fassen. Mit der neuen Basis geht es danach durch.
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
const ABLAGE = join(WURZEL, 'markt30');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const BOARD_DATEI = join(BOARD, 'board.json');
const STATION = join(ABLAGE, 'station-start');
const WORKFLOW = join(ABLAGE, 'workflow-standard');
const CACHE = join(HOME, 'board', 'cache');
const EIGENTUEMER = 'testkonto';
const VORHABEN = join(CACHE, EIGENTUEMER, 'vorhaben-markt30');
const VORHABEN_ID = 'markt30';
const FREMD = join(CACHE, EIGENTUEMER, 'vorhaben-fremd');
const FREMD_ID = 'fremd';

const START = '# Notiz\n\nDer erste Stand.\n';
const NEU = '# Notiz\n\nDer zweite Stand aus dem Board.\n';
const VON_AUSSEN = '# Notiz\n\nVon außen geändert.\n';
const DANACH = '# Notiz\n\nNach dem neuen Stand.\n';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

/** Ein Git-Befehl; ein Fehler ist ein Fehler der Prüfung. */
function git(ordner, args) {
  const lauf = spawnSync('git', ['-C', ordner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/** Eine Fassung mit der Prüffläche als Autor — nur für den Ausgangsstand. */
function festschreiben(ordner) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', 'Prüffläche',
  ]);
}

/**
 * Die Fläche: eine Station, ein Workflow, ein Vorhaben-Repository und das
 * Board, das auf alle verweist. Alles liegt als eigenes Repository mit einer
 * Fassung da; `notiz.md` ist der Ausgangsstand zum Schreiben.
 */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'), {
    format: 2,
    id: 'start',
    name: 'Start',
    beschreibung: 'Der Anfang eines Vorhabens.',
    host: EIGENTUEMER,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Der Anfang eines Vorhabens.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['start'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Start\n', 'utf8');
  festschreiben(STATION);

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Anfang zum Produkt.',
    autor: EIGENTUEMER,
    stationen: [{ repo: STATION, fassung: 'v1', id: 'start' }],
    positionen: [{ id: 'start', station: 'start', x: 40, y: 60, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW);

  mkdirSync(VORHABEN, { recursive: true });
  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: VORHABEN_ID,
    name: 'Notizvorhaben',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'start',
    verantwortliche: { start: [EIGENTUEMER] },
    laeufe: [],
    farbe: '#8b5cf6',
  });
  writeFileSync(join(VORHABEN, 'README.md'),
    '# Notizvorhaben\n\nEin Vorhaben an der Station „Start“.\n', 'utf8');
  writeFileSync(join(VORHABEN, 'notiz.md'), START, 'utf8');
  festschreiben(VORHABEN);

  // Ein Vorhaben, das eine andere Person verantwortet: es gehört zum Board,
  // darf aber von der handelnden Person nicht geändert werden.
  mkdirSync(FREMD, { recursive: true });
  schreibeJson(join(FREMD, 'vorhaben.json'), {
    format: 2,
    id: FREMD_ID,
    name: 'Fremdes Vorhaben',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'start',
    verantwortliche: { start: ['jemand-anderes'] },
    laeufe: [],
    farbe: '#fbbf24',
  });
  writeFileSync(join(FREMD, 'README.md'), '# Fremdes Vorhaben\n', 'utf8');
  writeFileSync(join(FREMD, 'notiz.md'), '# Fremd\n\nNicht meins.\n', 'utf8');
  festschreiben(FREMD);

  schreibeJson(BOARD_DATEI, {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [{ login: EIGENTUEMER, name: 'Testperson', farbe: '#8b5cf6' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [
      { repo: EIGENTUEMER + '/vorhaben-markt30' },
      { repo: EIGENTUEMER + '/vorhaben-fremd' },
    ],
    stationen: [{ repo: STATION }],
    einstellungen: {},
    layout: {},
  });
  festschreiben(BOARD);
}

/* --- Ein Port, auf dem zu Beginn nichts lauscht -------------------------- */

function reservierePort() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer();
    s.on('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => erfuellt(port));
    });
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
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

/** Eine Datei über die Lese-Route öffnen; liefert `{ text, basis }`. */
async function liesDatei(gebaut, name) {
  const gelesen = await ruf(gebaut,
    '/board/doc?vorhaben=' + VORHABEN_ID + '&datei=' + encodeURIComponent(name));
  pruefe(gelesen.status === 200,
    'GET /board/doc antwortet ' + gelesen.status + ': ' + JSON.stringify(gelesen.daten));
  return gelesen.daten;
}

/* --- Der Lauf ohne Netz -------------------------------------------------- */

async function offlineLauf() {
  let gebaut = null;

  rmSync(ABLAGE, { recursive: true, force: true });

  try {
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
        person: EIGENTUEMER,
      }],
    });
    schreibeJson(join(HOME, 'board', 'identitaet.json'), {
      name: 'Testperson', github: '', farbe: '#8b5cf6',
    });
    // Kein Token: das Vorhaben hat zunächst keinen Remote, die alten Prüfungen
    // brauchen keins. Der Remote-Fall unten setzt voraus, dass keins da ist.
    rmSync(GITHUB, { force: true });

    const port = await reservierePort();
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    const notiz = join(VORHABEN, 'notiz.md');
    const boardKopf = git(BOARD, ['rev-parse', 'HEAD']);
    const boardZaehler = Number(git(BOARD, ['rev-list', '--count', 'HEAD']));
    pruefe(readFileSync(notiz, 'utf8') === START,
      'Die Ausgangsdatei trägt nicht den ersten Stand');
    pruefe(Number(git(VORHABEN, ['rev-list', '--count', 'HEAD'])) === 1,
      'Das Vorhaben-Repository beginnt nicht mit genau einer Fassung');

    // (a) Der Ausgangsstand: die Basis kommt aus dem Repository des Vorhabens.
    const docVorher = await liesDatei(gebaut, 'notiz.md');
    pruefe(docVorher.text === START,
      'Die Lese-Route zeigt nicht den Ausgangstext: ' + JSON.stringify(docVorher.text));
    const basis0 = String(docVorher.basis || '');
    pruefe(/^[0-9a-f]{40}$/.test(basis0),
      'Die Lese-Route liefert keine Basis aus dem Vorhaben: '
        + JSON.stringify(docVorher.basis));
    pruefe(basis0 === git(VORHABEN, ['log', '-1', '--format=%H', '--', 'notiz.md']),
      'Die Basis ist nicht die Fassung, die die Datei zuletzt geändert hat');
    console.log('ok Ausgangsstand: Basis der gefassten Datei ' + basis0.slice(0, 7));

    // (a) Speichern mit richtiger Basis: neue Fassung im Vorhaben, keine im Board.
    const geschrieben = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: VORHABEN_ID, datei: 'notiz.md', text: NEU, basis: basis0,
    });
    pruefe(geschrieben.status === 200,
      'Das Speichern antwortet ' + geschrieben.status + ' statt 200: '
        + JSON.stringify(geschrieben.daten));
    pruefe(geschrieben.daten && geschrieben.daten.ok === true,
      'Die Antwort ist nicht als Erfolg markiert: ' + JSON.stringify(geschrieben.daten));
    pruefe(geschrieben.daten.name === 'notiz.md',
      'Die Antwort nennt nicht die Datei: ' + JSON.stringify(geschrieben.daten.name));
    pruefe(geschrieben.daten.laenge === NEU.length,
      'Die Antwort nennt nicht die Länge: ' + JSON.stringify(geschrieben.daten.laenge));
    const basis1 = String(geschrieben.daten.basis || '');
    pruefe(/^[0-9a-f]{40}$/.test(basis1) && basis1 !== basis0,
      'Die Antwort trägt keine neue Basis: ' + JSON.stringify(geschrieben.daten));
    pruefe(geschrieben.daten.fassung === basis1,
      'Fassung und Basis der Antwort sind nicht dieselbe');

    const docNachher = await liesDatei(gebaut, 'notiz.md');
    pruefe(docNachher.text === NEU,
      'Die Datei trägt nach erneutem Lesen nicht den neuen Text: '
        + JSON.stringify(docNachher.text));
    pruefe(docNachher.basis === basis1,
      'Die Lese-Route liefert nach dem Speichern nicht die neue Basis: '
        + JSON.stringify([docNachher.basis, basis1]));

    const kopf = git(VORHABEN, ['log', '-1', '--format=%an%x1f%s']);
    pruefe(kopf.startsWith('Testperson\x1f'),
      'Die neue Fassung nennt nicht die handelnde Person als Autor: „' + kopf + '“');
    pruefe(/gespeichert/.test(kopf),
      'Die neue Fassung ist keine Speicherung: „' + kopf + '“');
    pruefe(Number(git(VORHABEN, ['rev-list', '--count', 'HEAD'])) === 2,
      'Das Vorhaben-Repository hat nicht genau eine neue Fassung');
    pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
      'Im Vorhaben-Repository bleibt etwas Uncommittetes liegen');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopf
      && Number(git(BOARD, ['rev-list', '--count', 'HEAD'])) === boardZaehler,
    'Das Board-Repository hat durch das Speichern eine Fassung bekommen');
    pruefe(git(BOARD, ['status', '--porcelain']) === '',
      'Im Board-Repository liegt nach dem Speichern etwas Uncommittetes');
    console.log('ok Schreiben: Datei geändert, Fassung ' + basis1.slice(0, 7)
      + ' im Vorhaben, Board unberührt');

    // (b) `..`, absoluter Pfad und ein Ordner statt Datei: 400, nichts passiert.
    mkdirSync(join(VORHABEN, 'ordner.md'));
    const angriffe = [
      { datei: '../ausbruch.md', grund: '..' },
      { datei: 'unter/../../ausbruch.md', grund: '.. im Weg' },
      { datei: join(ABLAGE, 'aussen.md'), grund: 'absoluter Pfad' },
      { datei: '/etc/passwd', grund: 'absoluter Pfad' },
      { datei: 'ordner.md', grund: 'Ordner statt Datei' },
      { datei: 'ordner/', grund: 'Ordner mit Schrägstrich' },
    ];
    const bytesVorAngriff = readFileSync(notiz);
    for (const angriff of angriffe) {
      const ab = await ruf(gebaut, '/board/doc/schreiben', {
        vorhaben: VORHABEN_ID, datei: angriff.datei, text: '# Verboten\n',
      });
      pruefe(ab.status === 400,
        'Der Angriff „' + angriff.grund + '“ antwortet ' + ab.status
          + ' statt 400: ' + JSON.stringify(ab.daten));
    }
    pruefe(Buffer.compare(bytesVorAngriff, readFileSync(notiz)) === 0,
      'Ein abgewiesener Pfad hat die Datei geändert');
    pruefe(!existsSync(join(CACHE, EIGENTUEMER, 'ausbruch.md')),
      'Ein `..` hat außerhalb des Vorhabens geschrieben');
    pruefe(!existsSync(join(ABLAGE, 'aussen.md')),
      'Ein absoluter Pfad hat außerhalb des Vorhabens geschrieben');
    pruefe(!existsSync(join(VORHABEN, 'passwd.md')) && !existsSync(join(VORHABEN, 'passwd')),
      'Ein absoluter Pfad hat im Vorhaben geschrieben');
    pruefe(Number(git(VORHABEN, ['rev-list', '--count', 'HEAD'])) === 2,
      'Ein abgewiesener Pfad hat eine Fassung angelegt');
    rmSync(join(VORHABEN, 'ordner.md'), { recursive: true, force: true });
    console.log('ok Pfad: `..`, absoluter Pfad und Ordner mit 400 abgewiesen');

    // (c) Eine unbekannte Kennung: 404, nichts wird geschrieben.
    const unbekannt = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: 'gibt-es-nicht', datei: 'notiz.md', text: '# Nirgendwo\n',
    });
    pruefe(unbekannt.status === 404,
      'Eine unbekannte Kennung antwortet ' + unbekannt.status + ' statt 404: '
        + JSON.stringify(unbekannt.daten));
    pruefe(String((unbekannt.daten && unbekannt.daten.error) || '')
      === 'Vorhaben nicht gefunden',
    'Der Grund der 404-Antwort: ' + JSON.stringify(unbekannt.daten));
    pruefe(Number(git(VORHABEN, ['rev-list', '--count', 'HEAD'])) === 2,
      'Eine unbekannte Kennung hat eine Fassung angelegt');
    console.log('ok unbekannte Kennung: 404, nichts geschrieben');

    // (c) Ein fremdes Vorhaben: 403 mit Grund, nichts wird geschrieben. Das
    //     Recht steht vor der Basisprüfung — die richtige Basis liegt vor.
    const fremdDatei = join(FREMD, 'notiz.md');
    const basisFremd = git(FREMD, ['log', '-1', '--format=%H', '--', 'notiz.md']);
    const bytesFremd = readFileSync(fremdDatei);
    const kopfFremd = git(FREMD, ['rev-parse', 'HEAD']);
    const fremd = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: FREMD_ID, datei: 'notiz.md', text: '# Meins\n', basis: basisFremd,
    });
    pruefe(fremd.status === 403,
      'Ein fremdes Vorhaben antwortet ' + fremd.status + ' statt 403: '
        + JSON.stringify(fremd.daten));
    pruefe(String((fremd.daten && fremd.daten.error) || '')
      === 'Dieses Vorhaben verantwortet jemand anderes.',
    'Der Grund des fremden Vorhabens: ' + JSON.stringify(fremd.daten));
    pruefe(Buffer.compare(bytesFremd, readFileSync(fremdDatei)) === 0,
      'Das fremde Vorhaben wurde trotzdem geschrieben');
    pruefe(git(FREMD, ['rev-parse', 'HEAD']) === kopfFremd,
      'Das fremde Vorhaben hat trotzdem eine Fassung bekommen');
    console.log('ok fremdes Vorhaben: 403 mit Grund, nichts geschrieben');

    // (d) Remote ohne Token: 403 mit Grund, nichts wird geschrieben.
    git(VORHABEN, ['remote', 'add', 'origin',
      'https://github.com/fremd/vorhaben-markt30.git']);
    rmSync(GITHUB, { force: true });
    const bytesVor403 = readFileSync(notiz);
    const kopfVor403 = git(VORHABEN, ['rev-parse', 'HEAD']);
    const ohneRecht = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: VORHABEN_ID, datei: 'notiz.md', text: '# Ohne Recht\n', basis: basis1,
    });
    pruefe(ohneRecht.status === 403,
      'Ein Vorhaben mit Remote ohne Token antwortet ' + ohneRecht.status
        + ' statt 403: ' + JSON.stringify(ohneRecht.daten));
    const grundOhne = String((ohneRecht.daten && ohneRecht.daten.error) || '');
    pruefe(/Token|Anmeldung/.test(grundOhne),
      'Der Grund nennt nicht die fehlende Anmeldung: ' + JSON.stringify(grundOhne));
    pruefe(Buffer.compare(bytesVor403, readFileSync(notiz)) === 0,
      'Das gesperrte Vorhaben wurde trotzdem geschrieben');
    pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVor403,
      'Das gesperrte Vorhaben hat trotzdem eine Fassung bekommen');
    pruefe(git(VORHABEN, ['status', '--porcelain']) === '',
      'Im gesperrten Vorhaben liegt etwas Uncommittetes');
    git(VORHABEN, ['remote', 'remove', 'origin']);
    console.log('ok ohne Token: 403 mit Grund, nichts geschrieben');

    // (e) Ein von außen gefasster Stand macht die Basis überholt: 409.
    writeFileSync(notiz, VON_AUSSEN, 'utf8');
    git(VORHABEN, ['add', '--', 'notiz.md']);
    git(VORHABEN, [
      '-c', 'user.name=Von außen',
      '-c', 'user.email=aussen@board',
      'commit', '-q', '-m', 'Von außen geändert', '--', 'notiz.md',
    ]);
    const basis2 = git(VORHABEN, ['log', '-1', '--format=%H', '--', 'notiz.md']);
    pruefe(basis2 !== basis1, 'Die äußere Fassung ändert die Basis nicht');
    const kopfVor409 = git(VORHABEN, ['rev-parse', 'HEAD']);
    const bytesVor409 = readFileSync(notiz);

    const alt = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: VORHABEN_ID, datei: 'notiz.md', text: DANACH, basis: basis1,
    });
    pruefe(alt.status === 409,
      'Das Speichern auf dem überholten Stand antwortet ' + alt.status
        + ' statt 409: ' + JSON.stringify(alt.daten));
    pruefe(alt.daten && alt.daten.ok === false,
      'Die 409-Antwort ist nicht als Fehler markiert');
    pruefe(alt.daten.neu && alt.daten.neu.text === VON_AUSSEN,
      'Die 409-Antwort trägt nicht den neuen Text: '
        + JSON.stringify((alt.daten.neu || {}).text));
    pruefe(alt.daten.neu && alt.daten.neu.basis === basis2,
      'Die 409-Antwort trägt nicht die neue Basis: '
        + JSON.stringify((alt.daten.neu || {}).basis));
    pruefe(Buffer.compare(bytesVor409, readFileSync(notiz)) === 0,
      'Das Speichern auf dem überholten Stand hat die Datei geändert');
    pruefe(git(VORHABEN, ['rev-parse', 'HEAD']) === kopfVor409,
      'Das Speichern auf dem überholten Stand hat eine Fassung angelegt');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopf,
      'Das Speichern auf dem überholten Stand hat das Board gefasst');

    // Mit der neuen Basis geht dasselbe Speichern durch.
    const richtig = await ruf(gebaut, '/board/doc/schreiben', {
      vorhaben: VORHABEN_ID, datei: 'notiz.md', text: DANACH, basis: basis2,
    });
    pruefe(richtig.status === 200,
      'Das Speichern mit der neuen Basis antwortet ' + richtig.status
        + ' statt 200: ' + JSON.stringify(richtig.daten));
    pruefe(richtig.daten.basis !== basis2,
      'Das Speichern mit der neuen Basis hat keine neue Fassung erzeugt');
    pruefe(readFileSync(notiz, 'utf8') === DANACH,
      'Die Datei trägt nach dem Speichern nicht den neuen Text');
    pruefe(Number(git(VORHABEN, ['rev-list', '--count', 'HEAD'])) === 4,
      'Das Vorhaben-Repository hat nicht genau vier Fassungen');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopf,
      'Das Board-Repository hat doch eine Fassung bekommen');
    console.log('ok Basis: 409 mit neuem Text und neuer Basis, danach 200');

    console.log('ok Datei: im Vorhaben, Commit, Pfad abgewiesen, Basis');
  } finally {
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
  console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
}

await offlineLauf();
