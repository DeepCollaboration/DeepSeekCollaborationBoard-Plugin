/**
 * Prüfung Schritt 31 — Fassungen lesen.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt31`, daneben ein
 * eigenes `DSH_HOME`. Das Stations-Repository trägt zwei Stände und die Tags
 * `v1` und `v2`; der Arbeitsbaum steht auf `v2`. Der Workflow verweist auf
 * diese Station mit `fassung: "v1"`, das Board der Fassung 2 auf den Workflow.
 * Der Server läuft in-process; `DSH_GITHUB_API` zeigt auf einen Port, auf dem
 * nichts lauscht. Ein echtes Netz wird nicht benutzt.
 *
 * Geprüft wird:
 *
 *   (a) Die Komposition liest den Stand von `v1` — Name und Beschreibung —,
 *       auch nachdem der Arbeitsbaum auf `v2` steht; Schritt und Karte tragen
 *       `fassung` und `fassungFehlt`. Das Stationsdetail nennt die Fassung
 *       und bietet `v2` zum Nachziehen an.
 *   (b) `POST /board/workflow/nachziehen` setzt `v2`: `workflow.json` trägt
 *       `v2`, das Workflow-Repository genau eine neue Fassung mit der
 *       handelnden Person als Autor, das Board-Repository bleibt unberührt;
 *       danach zeigt die Komposition den neuen Stand, und das Detail bietet
 *       kein Nachziehen mehr an.
 *   (c) Eine fehlende Fassung (`v9`) fällt auf den aktuellen Stand zurück,
 *       `fassungFehlt` ist gesetzt und der Hinweis steht in den Lücken. Eine
 *       ausdrücklich genannte, unbekannte Fassung antwortet 409, ohne zu
 *       schreiben; ohne Angabe zieht die Route den neuesten Tag (`v2`) nach.
 *   (d) Ohne Schreibrecht (Remote am Board, kein Token) antwortet die Route
 *       403; `workflow.json` und der Workflow-Stand bleiben unverändert.
 */
import { createServer } from 'node:http';
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { komponiere } from '../komposition.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt31');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const BOARD = join(ABLAGE, 'board');
const STATION = join(ABLAGE, 'station-start');
const WORKFLOW = join(ABLAGE, 'workflow-standard');
const EIGENTUEMER = 'testkonto';

const V1_NAME = 'Start';
const V1_TEXT = 'Der erste Stand der Station.';
const V2_NAME = 'Start neu';
const V2_TEXT = 'Der zweite Stand der Station.';
const FEHLT = 'v9';

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

/** Einen Stand fassen — mit der Prüffläche als Autor. */
function fasse(ordner, nachricht) {
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', nachricht,
  ]);
}

/** Ein neues Repository mit seinem ersten Stand anlegen. */
function festschreiben(ordner, nachricht) {
  git(ordner, ['init', '-q', '-b', 'main']);
  fasse(ordner, nachricht);
}

/** `station.json` mit den Feldern, die das Format verlangt. */
function stationJson(name, beschreibung) {
  return {
    format: 2,
    id: 'start',
    name,
    beschreibung,
    host: EIGENTUEMER,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: beschreibung },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['start'],
  };
}

/**
 * Die Fläche: eine Station mit zwei Ständen und den Tags `v1` und `v2`, ein
 * Workflow, der auf `v1` steht, und das Board, das auf beides verweist. Der
 * Arbeitsbaum der Station steht am Ende auf `v2` — gelesen werden soll
 * trotzdem `v1`.
 */
function legeFlaeche() {
  mkdirSync(STATION, { recursive: true });
  schreibeJson(join(STATION, 'station.json'), stationJson(V1_NAME, V1_TEXT));
  writeFileSync(join(STATION, 'README.md'), '# Start\n', 'utf8');
  festschreiben(STATION, 'Erster Stand');
  git(STATION, ['tag', 'v1']);

  schreibeJson(join(STATION, 'station.json'), stationJson(V2_NAME, V2_TEXT));
  writeFileSync(join(STATION, 'README.md'), '# Start neu\n', 'utf8');
  fasse(STATION, 'Zweiter Stand');
  git(STATION, ['tag', 'v2']);

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
  festschreiben(WORKFLOW, 'Ausgangsstand');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [{ login: EIGENTUEMER, name: 'Testperson', farbe: '#8b5cf6' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [],
    stationen: [{ repo: STATION }],
    einstellungen: {},
    layout: {},
  });
  festschreiben(BOARD, 'Ausgangsstand');
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

/** Das Bild der Komposition, wie es die Seite liest. */
function bild() {
  return komponiere({ repo: BOARD, person: EIGENTUEMER, home: HOME });
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
    // Kein Token: lokal ist Schreiben erlaubt; der Remote-Fall unten wird
    // dadurch abgewiesen. Kein Netz: der GitHub-Port ist geschlossen.
    rmSync(GITHUB, { force: true });

    const port = await reservierePort();
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    const boardKopf = git(BOARD, ['rev-parse', 'HEAD']);
    const boardZaehler = Number(git(BOARD, ['rev-list', '--count', 'HEAD']));
    const stationKopf = git(STATION, ['rev-parse', 'HEAD']);

    // Der Arbeitsbaum steht auf v2; die beiden Stände sind verschieden.
    pruefe(stationKopf === git(STATION, ['rev-parse', 'v2']),
      'Der Arbeitsbaum der Station steht nicht auf v2');
    pruefe(JSON.parse(git(STATION, ['show', 'v1:station.json'])).name === V1_NAME,
      'Der Tag v1 trägt nicht den ersten Stand');
    pruefe(JSON.parse(readFileSync(join(STATION, 'station.json'), 'utf8')).name === V2_NAME,
      'Der Arbeitsbaum trägt nicht den zweiten Stand');

    // (a) Die Komposition liest v1 — nicht den Arbeitsbaum.
    const erstes = bild();
    const schritt = (erstes.schritte || [])[0];
    pruefe(schritt, 'Die Komposition hat keinen Schritt');
    pruefe(schritt.name === V1_NAME,
      'Die Komposition zeigt nicht den Stand von v1: ' + JSON.stringify(schritt.name));
    pruefe(schritt.inhalt === V1_TEXT,
      'Die Beschreibung kommt nicht aus v1: ' + JSON.stringify(schritt.inhalt));
    pruefe(schritt.fassung === 'v1',
      'Der Schritt trägt nicht die Fassung v1: ' + JSON.stringify(schritt.fassung));
    pruefe(schritt.fassungFehlt === false,
      'Der Schritt meldet eine fehlende Fassung: ' + JSON.stringify(schritt.fassungFehlt));
    const karte = (erstes.stationen || []).find((eintrag) => eintrag.id === 'start');
    pruefe(karte, 'Die Karte der Station fehlt');
    pruefe(karte.name === V1_NAME,
      'Die Karte zeigt nicht den Stand von v1: ' + JSON.stringify(karte.name));
    pruefe(karte.fassung === 'v1' && karte.fassungFehlt === false,
      'Die Karte trägt nicht Fassung und Lücke: ' + JSON.stringify(karte));

    // Das Detail nennt die Fassung und bietet den neueren Tag an.
    const detail = await ruf(gebaut, '/board/station?station=start');
    pruefe(detail.status === 200,
      'GET /board/station antwortet ' + detail.status + ': ' + JSON.stringify(detail.daten));
    pruefe(detail.daten.fassung === 'v1',
      'Das Detail nennt nicht die eingetragene Fassung: '
        + JSON.stringify(detail.daten.fassung));
    pruefe(detail.daten.nachziehen === 'v2',
      'Das Detail bietet v2 nicht zum Nachziehen an: '
        + JSON.stringify(detail.daten.nachziehen));
    console.log('ok Lesen: v1 bleibt im Schritt und an der Karte, v2 liegt daneben');

    // (b) Nachziehen als eigene Handlung: v1 → v2.
    const gezogen = await ruf(gebaut, '/board/workflow/nachziehen', { station: 'start' });
    pruefe(gezogen.status === 200,
      'Das Nachziehen antwortet ' + gezogen.status + ' statt 200: '
        + JSON.stringify(gezogen.daten));
    pruefe((gezogen.daten.schritte || [])[0]
      && gezogen.daten.schritte[0].name === V2_NAME,
    'Die Antwort des Nachziehens zeigt nicht den neuen Stand: '
      + JSON.stringify((gezogen.daten.schritte || [])[0]));

    const workflowDatei = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
    pruefe(workflowDatei.stationen[0].fassung === 'v2',
      'workflow.json trägt nicht v2: ' + JSON.stringify(workflowDatei.stationen[0].fassung));
    pruefe(Number(git(WORKFLOW, ['rev-list', '--count', 'HEAD'])) === 2,
      'Das Workflow-Repository hat nicht genau eine neue Fassung');
    const kopfNach = git(WORKFLOW, ['log', '-1', '--format=%an%x1f%s']);
    pruefe(kopfNach.startsWith('Testperson\x1f'),
      'Die neue Fassung nennt nicht die handelnde Person: „' + kopfNach + '“');
    pruefe(/nachgezogen/.test(kopfNach),
      'Die neue Fassung ist kein Nachziehen: „' + kopfNach + '“');
    pruefe(git(WORKFLOW, ['status', '--porcelain']) === '',
      'Im Workflow-Repository bleibt etwas Uncommittetes liegen');
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === boardKopf
      && Number(git(BOARD, ['rev-list', '--count', 'HEAD'])) === boardZaehler,
    'Das Board-Repository hat durch das Nachziehen eine Fassung bekommen');

    // Danach zeigt die Komposition den neuen Stand.
    const zweites = bild();
    pruefe(zweites.schritte[0].name === V2_NAME,
      'Die Komposition zeigt nach dem Nachziehen nicht v2: '
        + JSON.stringify(zweites.schritte[0].name));
    pruefe(zweites.schritte[0].fassung === 'v2' && zweites.schritte[0].fassungFehlt === false,
      'Der Schritt trägt nach dem Nachziehen nicht v2: '
        + JSON.stringify(zweites.schritte[0]));

    // Jetzt gibt es keinen neueren Tag — also auch keinen Knopf.
    const detailNach = await ruf(gebaut, '/board/station?station=start');
    pruefe(detailNach.status === 200,
      'GET /board/station antwortet nach dem Nachziehen ' + detailNach.status);
    pruefe(detailNach.daten.fassung === 'v2',
      'Das Detail nennt nach dem Nachziehen nicht v2: '
        + JSON.stringify(detailNach.daten.fassung));
    pruefe(detailNach.daten.nachziehen == null,
      'Das Detail bietet ohne neueren Tag ein Nachziehen an: '
        + JSON.stringify(detailNach.daten.nachziehen));
    console.log('ok Nachziehen: v2 steht im Workflow und in der Komposition');

    // (c) Eine fehlende Fassung fällt auf den aktuellen Stand zurück.
    const roh = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
    roh.stationen[0].fassung = FEHLT;
    schreibeJson(join(WORKFLOW, 'workflow.json'), roh);
    fasse(WORKFLOW, 'Fassung ' + FEHLT + ' eingetragen');

    const drittes = bild();
    pruefe(drittes.schritte[0].name === V2_NAME,
      'Die fehlende Fassung liest nicht den aktuellen Stand: '
        + JSON.stringify(drittes.schritte[0].name));
    pruefe(drittes.schritte[0].fassung === FEHLT,
      'Der Schritt trägt nicht die eingetragene, fehlende Fassung: '
        + JSON.stringify(drittes.schritte[0].fassung));
    pruefe(drittes.schritte[0].fassungFehlt === true,
      'Der fehlende Stand ist nicht als Lücke markiert: '
        + JSON.stringify(drittes.schritte[0].fassungFehlt));
    pruefe((drittes.stationen || [])[0].fassungFehlt === true,
      'Die Karte meldet die fehlende Fassung nicht');
    const hinweis = (drittes.luecken || []).find((eintrag) => eintrag.art === 'station-fassung');
    pruefe(hinweis, 'Die Lücke der fehlenden Fassung fehlt: '
      + JSON.stringify(drittes.luecken));
    pruefe(hinweis.grund === 'Fassung ' + FEHLT + ' fehlt; aktueller Stand gelesen',
      'Der Hinweis nennt nicht die fehlende Fassung: ' + JSON.stringify(hinweis.grund));

    // Eine unbekannte, ausdrücklich genannte Fassung wird abgewiesen.
    const kopfVorFalsch = git(WORKFLOW, ['rev-parse', 'HEAD']);
    const falsch = await ruf(gebaut, '/board/workflow/nachziehen', {
      station: 'start', fassung: 'gibt-es-nicht',
    });
    pruefe(falsch.status === 409,
      'Eine unbekannte Fassung antwortet ' + falsch.status + ' statt 409: '
        + JSON.stringify(falsch.daten));
    pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) === kopfVorFalsch,
      'Eine unbekannte Fassung hat den Workflow trotzdem gefasst');

    // Ohne Angabe gilt der neueste Tag — hier v2.
    const zurueck = await ruf(gebaut, '/board/workflow/nachziehen', { station: 'start' });
    pruefe(zurueck.status === 200,
      'Das Nachziehen ohne Fassung antwortet ' + zurueck.status + ': '
        + JSON.stringify(zurueck.daten));
    const nachFehlt = JSON.parse(readFileSync(join(WORKFLOW, 'workflow.json'), 'utf8'));
    pruefe(nachFehlt.stationen[0].fassung === 'v2',
      'Ohne Angabe wurde nicht v2 eingetragen: '
        + JSON.stringify(nachFehlt.stationen[0].fassung));
    console.log('ok Fassung: v1 bleibt, nachziehen zeigt v2, fehlende Fassung');

    // (d) Ohne Schreibrecht: 403, nichts wird geschrieben.
    git(BOARD, ['remote', 'add', 'origin',
      'https://github.com/fremd/board-markt31.git']);
    rmSync(GITHUB, { force: true });
    const kopfVor403 = git(WORKFLOW, ['rev-parse', 'HEAD']);
    const dateiVor403 = readFileSync(join(WORKFLOW, 'workflow.json'));
    const ohneRecht = await ruf(gebaut, '/board/workflow/nachziehen', {
      station: 'start', fassung: 'v1',
    });
    pruefe(ohneRecht.status === 403,
      'Ohne Schreibrecht antwortet die Route ' + ohneRecht.status
        + ' statt 403: ' + JSON.stringify(ohneRecht.daten));
    pruefe(String((ohneRecht.daten && ohneRecht.daten.error) || '').length > 0,
      'Die 403-Antwort nennt keinen Grund');
    pruefe(git(WORKFLOW, ['rev-parse', 'HEAD']) === kopfVor403,
      'Ohne Schreibrecht hat das Nachziehen eine Fassung angelegt');
    pruefe(Buffer.compare(dateiVor403, readFileSync(join(WORKFLOW, 'workflow.json'))) === 0,
      'Ohne Schreibrecht hat das Nachziehen workflow.json geändert');
    pruefe(git(WORKFLOW, ['status', '--porcelain']) === '',
      'Ohne Schreibrecht bleibt im Workflow etwas Uncommittetes');
    git(BOARD, ['remote', 'remove', 'origin']);
    console.log('ok ohne Schreibrecht: 403 mit Grund, nichts geschrieben');

    console.log('ok Fassung: gelesen auf v1, nachgezogen als Handlung, Lücke benannt');
  } finally {
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
  console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
}

await offlineLauf();
