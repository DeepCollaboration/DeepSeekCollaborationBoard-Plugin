/**
 * Prüfung Schritt 32 — Verweise als `owner/repo`.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt32`, daneben ein
 * eigenes `DSH_HOME`. Die Repositories tragen einen GitHub-Remote als
 * Adresse (`https://github.com/testkonto/...`); ein Netz wird nicht benutzt,
 * `DSH_GITHUB_API` zeigt auf einen Port, auf dem nichts lauscht. Damit die
 * Komposition die neuen `owner/name`-Verweise auflösen kann, liegen die
 * gelesenen Repositories zusätzlich unter
 * `$DSH_HOME/board/cache/<owner>/<name>`.
 *
 * Geprüft wird:
 *
 *   (a) `POST /board/workflow/station` schreibt den Stationsverweis als
 *       `testkonto/station-start` in `workflow.json`; Kennung und Fassung
 *       bleiben. `board.json` bleibt unverändert, die alten Verweise (nackter
 *       Name, absoluter Pfad) werden weiter gelesen.
 *   (b) `POST /board/workflow/verbinden` schreibt den Workflowverweis als
 *       `testkonto/workflow-zwei` in `board.json`; der alte Verweis bleibt
 *       stehen. Ein zweiter Aufruf antwortet 409 ohne neue Fassung.
 *   (c) `POST /board/uebernehmen` schreibt die Verweise des übernommenen
 *       Boards (Workflow, Stationen, Vorhaben) über denselben Helfer: die
 *       Repositories mit Remote als `owner/name`, die Kopie ohne Remote als
 *       Ordnernamen.
 *   (d) In keiner der neu geschriebenen Dateien steht `/workspace`.
 *   (e) Ein Board mit alter Form — nackter Name und absoluter Pfad — wird
 *       weiter zusammengesetzt und dabei nicht umgeschrieben.
 *   (f) Ein Verweis ohne GitHub-Remote bleibt der Ordnername; ein Eigentümer
 *       wird nicht erfunden, und kein neuer Verweis nennt einen absoluten
 *       Pfad.
 *   (g) Ein öffentliches Board verweist als `owner/name` auf eine private
 *       Station im Zwischenspeicher: die Komposition zeigt die Station, und
 *       `luecken` nennt sie als private Lücke.
 */
import { createServer } from 'node:http';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { komponiere } from '../komposition.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt32');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const GITHUB = join(HOME, 'board', 'github.json');
const CACHE = join(HOME, 'board', 'cache');
const BOARD = join(ABLAGE, 'board');
const STATION = join(ABLAGE, 'station-start');
const WORKFLOW = join(ABLAGE, 'workflow-standard');
const WORKFLOW_ZWEI = join(ABLAGE, 'workflow-zwei');
const WORKFLOW_LOKAL = join(ABLAGE, 'workflow-ohne-remote');
const PROBE = join(ABLAGE, 'vorhaben-probeprojekt');
const ALT_BOARD = join(ABLAGE, 'board-alt');
const ALT_WORKFLOW = join(ABLAGE, 'alt-workflow');
const ALT_STATION = join(ABLAGE, 'alt-station');
const OEFFENTLICH_BOARD = join(ABLAGE, 'board-oeffentlich');
const EIGENTUEMER = 'testkonto';
const GEHEIME_STATION = join(CACHE, EIGENTUEMER, 'station-geheim');

const OWNER_STATION = 'testkonto/station-start';
const OWNER_WORKFLOW = 'testkonto/workflow-standard';
const OWNER_ZWEI = 'testkonto/workflow-zwei';

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

function mitRemote(ordner, adresse) {
  git(ordner, ['remote', 'add', 'origin', adresse]);
}

/** `station.json` mit den Feldern, die das Format verlangt. */
function stationJson(id, name, host) {
  return {
    format: 2,
    id,
    name,
    beschreibung: 'Beschreibung von ' + name + '.',
    host,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: 'Beschreibung von ' + name + '.' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['start'],
  };
}

/** `workflow.json` ohne Stationen — die Route stellt die erste hinein. */
function workflowJson(id, titel, autor) {
  return {
    format: 2,
    id,
    titel,
    beschreibung: 'Ein Workflow der Prüffläche.',
    autor,
    stationen: [],
    positionen: [],
    kanten: [],
    layout: 'auto',
    regeln: {},
  };
}

/**
 * Die Fläche: Station, zwei Workflows mit GitHub-Remote, ein dritter ohne
 * Remote, das Probeprojekt und ein Board, das die alten Formen nutzt. Dazu
 * ein zweites Board, das nur alte Formen trägt (nackter Name und absoluter
 * Pfad), und die Kopien im Zwischenspeicher, damit `owner/name` auflöst.
 */
function legeFlaeche() {
  schreibeJson(join(STATION, 'station.json'),
    stationJson('start', 'Start', EIGENTUEMER));
  writeFileSync(join(STATION, 'README.md'), '# Start\n', 'utf8');
  festschreiben(STATION, 'Erster Stand');
  git(STATION, ['tag', 'v1']);
  mitRemote(STATION, 'https://github.com/testkonto/station-start.git');

  schreibeJson(join(WORKFLOW, 'workflow.json'),
    workflowJson('standard', 'Standard-Workflow', EIGENTUEMER));
  festschreiben(WORKFLOW, 'Ausgangsstand');
  git(WORKFLOW, ['tag', 'v1']);
  mitRemote(WORKFLOW, 'https://github.com/testkonto/workflow-standard.git');

  schreibeJson(join(WORKFLOW_ZWEI, 'workflow.json'),
    workflowJson('zwei', 'Zweiter Workflow', EIGENTUEMER));
  festschreiben(WORKFLOW_ZWEI, 'Ausgangsstand');
  git(WORKFLOW_ZWEI, ['tag', 'v1']);
  mitRemote(WORKFLOW_ZWEI, 'https://github.com/testkonto/workflow-zwei.git');

  // Dieses Repository hat keinen Remote: sein Verweis bleibt der lokale Ordner.
  schreibeJson(join(WORKFLOW_LOKAL, 'workflow.json'),
    workflowJson('lokal', 'Lokaler Workflow', EIGENTUEMER));
  festschreiben(WORKFLOW_LOKAL, 'Ausgangsstand');
  git(WORKFLOW_LOKAL, ['tag', 'v1']);

  schreibeJson(join(PROBE, 'vorhaben.json'), {
    format: 2,
    id: 'probeprojekt',
    name: 'Probeprojekt',
    workflow: { repo: 'workflow-standard', fassung: 'v1' },
    position: 'start',
    verantwortliche: { start: [EIGENTUEMER] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#38bdf8',
  });
  writeFileSync(join(PROBE, 'idee.md'), '# Probeprojekt\n', 'utf8');
  festschreiben(PROBE, 'Ausgangsstand');

  // Das Board nutzt die alten Formen: nackter Name und absoluter Pfad.
  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'hauptboard',
    personen: [{ login: EIGENTUEMER, name: 'Testperson', farbe: '#8b5cf6' }],
    workflows: [{ repo: 'workflow-standard', fassung: 'v1' }],
    vorhaben: [{ repo: PROBE }],
    stationen: [{ repo: 'station-start' }],
    einstellungen: {},
    layout: {},
  });
  festschreiben(BOARD, 'Ausgangsstand');

  // Ein eigenes Board, das nur alte Formen trägt: der Workflow absolut, die
  // Station als nackter Name. Es wird gelesen und nicht umgeschrieben.
  schreibeJson(join(ALT_STATION, 'station.json'),
    stationJson('altstart', 'Altstand', 'p1'));
  writeFileSync(join(ALT_STATION, 'README.md'), '# Altstand\n', 'utf8');
  festschreiben(ALT_STATION, 'Ausgangsstand');
  const altFassung = git(ALT_STATION, ['rev-parse', '--short', 'HEAD']);
  schreibeJson(join(ALT_WORKFLOW, 'workflow.json'), {
    ...workflowJson('alt', 'Alter Workflow', 'p1'),
    stationen: [{ repo: 'alt-station', fassung: altFassung, id: 'altstart' }],
    positionen: [{ id: 'altstart', station: 'altstart', x: 40, y: 60, bedingung: [] }],
  });
  festschreiben(ALT_WORKFLOW, 'Ausgangsstand');
  schreibeJson(join(ALT_BOARD, 'board.json'), {
    format: 2,
    id: 'altboard',
    name: 'Altes Board',
    art: 'team',
    personen: [{ login: 'p1', name: 'Altperson', farbe: '#fbbf24' }],
    workflows: [{ repo: ALT_WORKFLOW, fassung: altFassung }],
    vorhaben: [],
    stationen: [{ repo: 'alt-station' }],
    einstellungen: {},
    layout: {},
  });
  festschreiben(ALT_BOARD, 'Ausgangsstand');

  // Die gelesenen Repositories liegen zusätzlich im Zwischenspeicher des
  // Eigentümers. Nur so löst die Komposition `testkonto/...` auf.
  inCache('station-start', STATION);
  inCache('workflow-standard', WORKFLOW);
  inCache('workflow-zwei', WORKFLOW_ZWEI);

  // Eine private Station im Zwischenspeicher: ihr Ordnername allein wäre
  // öffentlich, erst die Karte im Home sagt „privat“.
  schreibeJson(join(GEHEIME_STATION, 'station.json'),
    stationJson('geheim', 'Geheime Station', EIGENTUEMER));
  writeFileSync(join(GEHEIME_STATION, 'README.md'), '# Geheime Station\n', 'utf8');
  festschreiben(GEHEIME_STATION, 'Erster Stand');
  schreibeJson(join(HOME, 'board', 'sichtbarkeit.json'), {
    [basename(GEHEIME_STATION)]: 'privat',
  });

  // Ein öffentliches Board, das die private Station als `owner/name` nennt.
  schreibeJson(join(OEFFENTLICH_BOARD, 'board.json'), {
    format: 2,
    id: 'oeffentlich',
    name: 'Öffentliches Board',
    art: 'hauptboard',
    personen: [{ login: EIGENTUEMER, name: 'Testperson', farbe: '#8b5cf6' }],
    workflows: [],
    vorhaben: [],
    stationen: [{ repo: EIGENTUEMER + '/station-geheim' }],
    einstellungen: {},
    layout: {},
  });
}

/** Ein Repository in den Zwischenspeicher des Eigentümers legen. */
function inCache(name, quelle) {
  const ziel = join(CACHE, EIGENTUEMER, name);
  rmSync(ziel, { recursive: true, force: true });
  mkdirSync(dirname(ziel), { recursive: true });
  cpSync(quelle, ziel, { recursive: true });
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
function bild(repo, person) {
  return komponiere({ repo, person, home: HOME });
}

/** Der Text einer Datei und die Prüfung, dass kein absoluter Pfad darin steht. */
function ohneAbsolutenPfad(pfad) {
  const text = readFileSync(pfad, 'utf8');
  pruefe(!text.includes('/workspace'),
    pfad + ' nennt /workspace: ' + text);
  return text;
}

/** Alle Dateien unterhalb eines Ordners, ohne die Geschichte (`.git`). */
function dateienUnter(ordner, liste = []) {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (eintrag.name === '.git') continue;
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) dateienUnter(pfad, liste);
    else if (eintrag.isFile()) liste.push(pfad);
  }
  return liste;
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
        art: 'hauptboard',
        repo: BOARD,
        remote: null,
        person: EIGENTUEMER,
      }],
    });
    schreibeJson(join(HOME, 'board', 'identitaet.json'), {
      name: 'Testperson', github: EIGENTUEMER, farbe: '#8b5cf6',
    });
    // Kein Token: lokal ist Schreiben erlaubt, und kein GitHub-Aufruf entsteht.
    rmSync(GITHUB, { force: true });

    const port = await reservierePort();
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    const boardVorher = readFileSync(join(BOARD, 'board.json'));

    // (a) Eine Station in den Workflow stellen: der Verweis ist `owner/name`.
    const gestellt = await ruf(gebaut, '/board/workflow/station', { station: 'start' });
    pruefe(gestellt.status === 200,
      'POST /board/workflow/station antwortet ' + gestellt.status + ': '
        + JSON.stringify(gestellt.daten));
    const workflowDatei = join(WORKFLOW, 'workflow.json');
    const workflowNachher = liesJson(workflowDatei);
    const startVerweis = workflowNachher.stationen
      .find((eintrag) => eintrag && eintrag.id === 'start');
    pruefe(startVerweis, 'workflow.json trägt keinen Verweis auf die Station start: '
      + JSON.stringify(workflowNachher.stationen));
    pruefe(startVerweis.repo === OWNER_STATION,
      'Der Stationsverweis ist nicht owner/name: ' + JSON.stringify(startVerweis.repo));
    pruefe(startVerweis.fassung === 'v1',
      'Die Fassung der Station ist nicht geblieben: '
        + JSON.stringify(startVerweis.fassung));
    pruefe(workflowNachher.positionen.length === 1
      && workflowNachher.positionen[0].station === 'start',
    'Die neue Position fehlt: ' + JSON.stringify(workflowNachher.positionen));
    ohneAbsolutenPfad(workflowDatei);
    pruefe(Buffer.compare(boardVorher, readFileSync(join(BOARD, 'board.json'))) === 0,
      'board.json wurde beim Einstellen einer Station umgeschrieben');
    const nachStellen = bild(BOARD, EIGENTUEMER);
    pruefe((nachStellen.schritte || [])[0]
      && nachStellen.schritte[0].name === 'Start',
    'Die Komposition liest den neuen Verweis nicht: '
      + JSON.stringify((nachStellen.schritte || [])[0]));
    // Der Zwischenspeicher trägt jetzt denselben Stand: die Station steht im
    // Workflow. Sonst läse das später übernommene Board eine leere Kopie.
    inCache('workflow-standard', WORKFLOW);
    console.log('ok Station: workflow.json trägt ' + OWNER_STATION
      + ', board.json bleibt bei den alten Formen');

    // (b) Einen Workflow ins Board aufnehmen: der Verweis ist `owner/name`.
    const verbunden = await ruf(gebaut, '/board/workflow/verbinden', {
      repo: WORKFLOW_ZWEI,
    });
    pruefe(verbunden.status === 200,
      'POST /board/workflow/verbinden antwortet ' + verbunden.status + ': '
        + JSON.stringify(verbunden.daten));
    const boardNachher = liesJson(join(BOARD, 'board.json'));
    const zweiterVerweis = boardNachher.workflows
      .find((eintrag) => eintrag && eintrag.repo === OWNER_ZWEI);
    pruefe(zweiterVerweis,
      'board.json trägt den Workflow nicht als owner/name: '
        + JSON.stringify(boardNachher.workflows));
    pruefe(zweiterVerweis.fassung === 'v1',
      'Der Workflowverweis trägt nicht die Fassung v1: '
        + JSON.stringify(zweiterVerweis.fassung));
    pruefe(boardNachher.workflows[0].repo === 'workflow-standard',
      'Der alte Verweis wurde umgeschrieben: '
        + JSON.stringify(boardNachher.workflows[0]));
    ohneAbsolutenPfad(join(BOARD, 'board.json'));
    const nachVerbinden = bild(BOARD, EIGENTUEMER);
    const flaechen = (nachVerbinden.workflows || [])[0] || { workflows: [] };
    pruefe((flaechen.workflows || []).length === 2,
      'Die Komposition zeigt nicht zwei Workflows: '
        + JSON.stringify((flaechen.workflows || []).map((e) => e.id)));

    // Ein zweiter Aufruf legt keine neue Fassung an.
    const kopfVorDoppelt = git(BOARD, ['rev-parse', 'HEAD']);
    const doppelt = await ruf(gebaut, '/board/workflow/verbinden', {
      repo: WORKFLOW_ZWEI,
    });
    pruefe(doppelt.status === 409,
      'Ein zweiter Aufruf antwortet ' + doppelt.status + ' statt 409: '
        + JSON.stringify(doppelt.daten));
    pruefe(git(BOARD, ['rev-parse', 'HEAD']) === kopfVorDoppelt,
      'Der zweite Aufruf hat trotzdem eine Fassung angelegt');
    console.log('ok Workflow: board.json trägt ' + OWNER_ZWEI
      + ', der alte Verweis bleibt');

    // (f) Ohne GitHub-Remote bleibt der Ordnername — kein erfundener Name
    // und kein absoluter Pfad.
    const ohneRemote = await ruf(gebaut, '/board/workflow/verbinden', {
      repo: WORKFLOW_LOKAL,
    });
    pruefe(ohneRemote.status === 200,
      'POST /board/workflow/verbinden ohne Remote antwortet ' + ohneRemote.status
        + ': ' + JSON.stringify(ohneRemote.daten));
    const boardOhneRemote = liesJson(join(BOARD, 'board.json'));
    const lokalerVerweis = boardOhneRemote.workflows
      .find((eintrag) => eintrag && eintrag.repo === basename(WORKFLOW_LOKAL));
    pruefe(lokalerVerweis,
      'Der Workflow ohne Remote steht nicht als Ordnername im Board: '
        + JSON.stringify(boardOhneRemote.workflows));
    pruefe(!lokalerVerweis.repo.startsWith('/')
      && !lokalerVerweis.repo.includes('/'),
    'Der Verweis ohne Remote nennt einen Pfad statt des Ordnernamens: '
      + JSON.stringify(lokalerVerweis.repo));
    pruefe(resolve(dirname(BOARD), lokalerVerweis.repo) === resolve(WORKFLOW_LOKAL),
      'Der Ordnername zeigt nicht auf das richtige Repository: '
        + JSON.stringify(lokalerVerweis.repo));
    console.log('ok ohne Remote: der Ordnername bleibt, kein owner/name '
      + 'und kein absoluter Pfad');

    // (c) Ein Board übernehmen: Workflow, Stationen und Vorhaben.
    const uebernommen = await ruf(gebaut, '/board/uebernehmen', {
      name: 'Anna', boardName: 'Annas Board',
    });
    pruefe(uebernommen.status === 200,
      'POST /board/uebernehmen antwortet ' + uebernommen.status + ': '
        + JSON.stringify(uebernommen.daten));
    const boardOrdner = join(HOME, 'board', 'ablagen', 'annas-board');
    const neuesBoardDatei = join(boardOrdner, 'board.json');
    const neuesBoard = liesJson(neuesBoardDatei);
    const neuerWorkflow = neuesBoard.workflows
      .find((eintrag) => eintrag && eintrag.repo === OWNER_WORKFLOW);
    pruefe(neuerWorkflow,
      'Das neue Board nennt den Workflow nicht als owner/name: '
        + JSON.stringify(neuesBoard.workflows));
    pruefe(neuerWorkflow.fassung === 'v1',
      'Der Workflow des neuen Boards trägt nicht die Fassung: '
        + JSON.stringify(neuerWorkflow.fassung));
    pruefe(neuesBoard.stationen.length === 1
      && neuesBoard.stationen[0].repo === OWNER_STATION,
    'Das neue Board nennt die Station nicht als owner/name: '
      + JSON.stringify(neuesBoard.stationen));
    const kopieOrdner = join(boardOrdner, 'vorhaben-probeprojekt-kopie');
    pruefe(neuesBoard.vorhaben.length === 1
      && neuesBoard.vorhaben[0].repo === basename(kopieOrdner)
      && resolve(boardOrdner, neuesBoard.vorhaben[0].repo) === kopieOrdner,
    'Das neue Board nennt die Kopie nicht als Ordnernamen: '
      + JSON.stringify(neuesBoard.vorhaben));
    const kopieDatei = join(kopieOrdner, 'vorhaben.json');
    const kopie = liesJson(kopieDatei);
    pruefe(kopie.workflow.repo === OWNER_WORKFLOW,
      'Die Kopie des Vorhabens verweist nicht als owner/name auf den Workflow: '
        + JSON.stringify(kopie.workflow.repo));
    ohneAbsolutenPfad(neuesBoardDatei);
    ohneAbsolutenPfad(kopieDatei);

    const neuesBild = bild(boardOrdner, EIGENTUEMER);
    const neuerVorgang = (neuesBild.vorgaenge || [])
      .find((eintrag) => eintrag && eintrag.id === 'probeprojekt-kopie');
    pruefe(neuerVorgang,
      'Die Komposition des neuen Boards zeigt die Kopie nicht: '
        + JSON.stringify((neuesBild.luecken || [])));
    pruefe((neuesBild.schritte || [])[0]
      && neuesBild.schritte[0].name === 'Start',
    'Die Komposition des neuen Boards liest den owner/name-Verweis nicht: '
      + JSON.stringify({
        schritte: neuesBild.schritte,
        luecken: neuesBild.luecken,
        board: neuesBoard.workflows,
      }));
    console.log('ok Übernehmen: Workflow und Station als ' + OWNER_WORKFLOW
      + ' / ' + OWNER_STATION + ', Kopie als Ordnername');

    // (e) Alte Formen bleiben lesbar und werden nicht umgeschrieben.
    const altVorher = readFileSync(join(ALT_BOARD, 'board.json'));
    const altBild = bild(ALT_BOARD, 'p1');
    const altSchritt = (altBild.schritte || [])[0];
    pruefe(altSchritt && altSchritt.name === 'Altstand',
      'Das Board mit alter Form wird nicht zusammengesetzt: '
        + JSON.stringify(altSchritt));
    pruefe((altBild.stationen || []).some((eintrag) => eintrag
      && eintrag.id === 'altstart' && eintrag.name === 'Altstand'),
    'Die Station als nackter Name bleibt nicht lesbar: '
      + JSON.stringify(altBild.stationen));
    pruefe(Buffer.compare(altVorher, readFileSync(join(ALT_BOARD, 'board.json'))) === 0,
      'Das alte Board wurde beim Lesen umgeschrieben');
    console.log('ok alte Form: nackter Name und absoluter Pfad bleiben lesbar');

    // (g) Ein öffentliches Board nennt eine private Station als `owner/name`
    // im Zwischenspeicher: die Komposition zeigt sie, `luecken` muss die
    // private Station nennen.
    const offenesBoard = bild(OEFFENTLICH_BOARD, EIGENTUEMER);
    const geseheneStation = (offenesBoard.stationen || [])
      .find((eintrag) => eintrag && eintrag.name === 'Geheime Station');
    pruefe(geseheneStation,
      'Die Komposition zeigt die private Station nicht: '
        + JSON.stringify(offenesBoard.stationen));
    const luecke = (offenesBoard.luecken || []).find((eintrag) => eintrag
      && eintrag.art === 'sichtbarkeit'
      && eintrag.auf && eintrag.auf.name === 'Geheime Station');
    pruefe(luecke,
      'pruefeVerweise meldet die private Station nicht als Lücke: '
        + JSON.stringify(offenesBoard.luecken));
    pruefe(resolve(luecke.auf.pfad) === resolve(GEHEIME_STATION),
      'Die Lücke nennt nicht den Zwischenspeicher der privaten Station: '
        + JSON.stringify(luecke));
    console.log('ok öffentlich/privat: owner/repo im Zwischenspeicher, Lücke genannt');

    // Kein neuer Verweis nennt einen absoluten Pfad — mit und ohne Remote.
    const neueVerweise = [
      ['Station im Workflow', startVerweis.repo],
      ['Workflow im Board', zweiterVerweis.repo],
      ['Workflow ohne Remote', lokalerVerweis.repo],
      ...neuesBoard.workflows.map((eintrag) => ['Workflow im neuen Board', eintrag.repo]),
      ...neuesBoard.stationen.map((eintrag) => ['Station im neuen Board', eintrag.repo]),
      ...neuesBoard.vorhaben.map((eintrag) => ['Vorhaben im neuen Board', eintrag.repo]),
      ['Workflow der Kopie', kopie.workflow.repo],
    ];
    for (const [was, wert] of neueVerweise) {
      const text = String(wert);
      pruefe(!text.startsWith('/') && !text.includes(ABLAGE),
        was + ' nennt einen absoluten Pfad: ' + JSON.stringify(wert));
    }
    console.log('ok kein absoluter Pfad in den neuen Verweisen');

    // (d) Keine der neu geschriebenen Dateien nennt /workspace — auch nicht
    // versteckt in den Dateien des übernommenen Boards.
    for (const pfad of [
      join(WORKFLOW, 'workflow.json'),
      join(BOARD, 'board.json'),
      neuesBoardDatei,
      kopieDatei,
      join(ALT_BOARD, 'board.json'),
      ...dateienUnter(boardOrdner),
    ]) {
      ohneAbsolutenPfad(pfad);
    }
    console.log('ok kein /workspace in den neuen Dateien');

    // Nichts bleibt uncommittet.
    pruefe(git(WORKFLOW, ['status', '--porcelain']) === '',
      'Im Workflow-Repository bleibt etwas Uncommittetes liegen');
    pruefe(git(BOARD, ['status', '--porcelain']) === '',
      'Im Board-Repository bleibt etwas Uncommittetes liegen');

    console.log('ok Verweise: owner/repo an drei Stellen, alte Form lesbar');
  } finally {
    if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
    rmSync(ABLAGE, { recursive: true, force: true });
  }

  pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
  try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
  console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
}

await offlineLauf();
