/**
 * Prüfung Schritt 33 — der Erststart bringt das Hauptboard von selbst.
 *
 * Unter `/tmp/board-scheibe1/schritt33` entstehen eine Station, ein Workflow
 * und das Board der Fassung 2; das Board wird als lokales Bare-Repository
 * bereitgelegt. Zwei eigene Homes, zwei Starts:
 *
 *   1. Frisches Home, `DSH_BOARD_HAUPTBOARD` zeigt auf das Bare-Repository:
 *      Das Hauptboard wird ohne Name, Token oder Verbinden geholt, steht im
 *      Register, ist offen und fest; `/board/data` liefert seine Stationen;
 *      eine Identität wird nicht verlangt; Entfernen antwortet 409.
 *   2. Frisches Home, die Adresse ist unerreichbar: der Eintrag steht mit
 *      `fehler: 'nicht geholt'`, `/board/data` bleibt 200, die Board-Liste
 *      nennt Fehler und Sichtbarkeit. Nach dem Geraderücken der Adresse holt
 *      „Wiederholen“ das Board, danach sind seine Stationen da.
 *
 * Kein echter GitHub-Aufruf; Home und Ablage werden danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt33');
const KOPIE = join(ABLAGE, 'produkt');
const HOME = join(ABLAGE, 'home');
const HOME2 = join(ABLAGE, 'home2');
const FLAECHE = join(ABLAGE, 'flaeche');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const QUELLE = join(FLAECHE, 'board-hauptboard');
const REMOTE = join(ABLAGE, 'remote', 'board-hauptboard.git');
const UNERREICHBAR = 'file://' + join(ABLAGE, 'fehlt', 'board-hauptboard.git');
const ZIEL = join(HOME, 'board', 'cache', 'DeepCollaboration', 'board-hauptboard');
const ZIEL2 = join(HOME2, 'board', 'cache', 'DeepCollaboration', 'board-hauptboard');

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
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

function festschreiben(ordner, nachricht) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Prüffläche',
    '-c', 'user.email=pruefflaeche@board',
    'commit', '-q', '-m', nachricht,
  ]);
  git(ordner, ['tag', 'v1']);
}

/** Station, Workflow, Board — die Verweise nennen absolute Ordner. */
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
    tags: ['prüfung'],
  });
  writeFileSync(join(STATION, 'README.md'), '# Idee\n', 'utf8');
  festschreiben(STATION, 'Station Idee');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: STATION, fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'Workflow Standard');

  schreibeJson(join(QUELLE, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [],
    stationen: [{ repo: STATION }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(QUELLE, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(QUELLE, 'Hauptboard');

  mkdirSync(dirname(REMOTE), { recursive: true });
  git(FLAECHE, ['clone', '--bare', '--quiet', QUELLE, REMOTE]);
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
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
}

async function starten(home, adresse, kennzeichen) {
  process.env.DSH_HOME = home;
  process.env.DSH_BOARD_HAUPTBOARD = adresse;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(KOPIE, 'index.js')).href
    + '?fall=' + kennzeichen);
  modul.apply(gebaut.ctx);
  return gebaut;
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let gebaut2 = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeFlaeche();
  // Das Produkt als Kopie ohne alte Einzelkonfiguration: nur so ist das Home
  // wirklich frisch, ohne die Ablage dieses Arbeitsbereichs zu berühren.
  cpSync(PRODUKT, KOPIE, { recursive: true });
  rmSync(join(KOPIE, 'board.config.json'), { force: true });
  mkdirSync(HOME, { recursive: true });
  mkdirSync(HOME2, { recursive: true });

  // 1. Frisches Home, erreichbare Adresse: das Hauptboard kommt von selbst.
  gebaut = await starten(HOME, 'file://' + REMOTE, 'a');
  pruefe(!existsSync(join(HOME, 'board', 'identitaet.json')),
    'Der Erststart hat nach einer Identität verlangt');
  const register = liesJson(join(HOME, 'board', 'boards.json'));
  pruefe(register.aktiv === 'hauptboard', 'Das Hauptboard ist nicht offen');
  pruefe(register.boards.length === 1 && register.boards[0].id === 'hauptboard',
    'Das Hauptboard steht nicht allein im Register: ' + JSON.stringify(register.boards));
  const eintrag = register.boards[0];
  pruefe(eintrag.art === 'hauptboard' && eintrag.format === 2,
    'Der Eintrag ist kein Hauptboard der Fassung 2: ' + JSON.stringify(eintrag));
  pruefe(eintrag.repo === ZIEL, 'Der Eintrag zeigt nicht in den Zwischenspeicher: '
    + eintrag.repo);
  pruefe(eintrag.remote === 'file://' + REMOTE,
    'Der Eintrag trägt nicht die Adresse: ' + eintrag.remote);
  pruefe(eintrag.person === null, 'Der Eintrag verlangt eine Person: '
    + JSON.stringify(eintrag.person));
  pruefe(eintrag.sichtbarkeit === 'öffentlich',
    'Das Hauptboard ist nicht öffentlich: ' + JSON.stringify(eintrag.sichtbarkeit));
  pruefe(!eintrag.fehler, 'Das geholte Hauptboard trägt einen Fehler: ' + eintrag.fehler);
  pruefe(existsSync(join(ZIEL, 'board.json')), 'Das Hauptboard wurde nicht geklont');

  const liste = await ruf(gebaut, '/board/boards');
  pruefe(liste.status === 200, 'GET /board/boards antwortet ' + liste.status);
  const haupt = liste.daten.boards.find((b) => b.id === 'hauptboard');
  pruefe(haupt && haupt.hauptboard === true && haupt.aktiv === true,
    'Die Liste zeigt das Hauptboard nicht als offen und fest: '
      + JSON.stringify(liste.daten.boards));
  pruefe(haupt.sichtbarkeit === 'öffentlich' && !haupt.fehler,
    'Die Liste nennt Sichtbarkeit oder Fehler falsch: ' + JSON.stringify(haupt));

  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status
    + ': ' + daten.text);
  pruefe(daten.daten.identitaet === null,
    'Ohne Identität steht trotzdem eine da: ' + JSON.stringify(daten.daten.identitaet));
  pruefe(!daten.daten.leer, 'Das Hauptboard gilt als leer');
  const stationen = daten.daten.stationen || [];
  pruefe(stationen.some((s) => s.id === 'idee' && s.name === 'Idee'),
    'Die Stationen des Hauptboards fehlen: ' + JSON.stringify(stationen));
  const flaeche = (daten.daten.workflows || [])[0];
  const schritte = flaeche && flaeche.workflows && flaeche.workflows[0]
    ? flaeche.workflows[0].schritte : [];
  pruefe(schritte.some((s) => s.name === 'Idee'),
    'Der Workflow des Hauptboards fehlt: ' + JSON.stringify(schritte));

  const weg = await ruf(gebaut, '/board/boards/entfernen', { id: 'hauptboard' });
  pruefe(weg.status === 409, 'Entfernen antwortet ' + weg.status + ' statt 409: '
    + weg.text);
  pruefe(String(weg.daten.error).includes('Hauptboard bleibt'),
    'Die 409-Antwort nennt das Hauptboard nicht: ' + weg.text);

  // 2. Frisches Home, unerreichbare Adresse: der Start gelingt trotzdem.
  gebaut2 = await starten(HOME2, UNERREICHBAR, 'b');
  const register2 = liesJson(join(HOME2, 'board', 'boards.json'));
  pruefe(register2.aktiv === 'hauptboard', 'Das ungeholte Hauptboard ist nicht offen');
  pruefe(register2.boards.length === 1
    && register2.boards[0].id === 'hauptboard'
    && register2.boards[0].fehler === 'nicht geholt',
  'Der gescheiterte Erstversuch steht nicht mit „nicht geholt“ im Register: '
    + JSON.stringify(register2.boards));

  const liste2 = await ruf(gebaut2, '/board/boards');
  pruefe(liste2.status === 200, 'GET /board/boards (nicht geholt) antwortet '
    + liste2.status + ': ' + liste2.text);
  const haupt2 = liste2.daten.boards[0];
  pruefe(haupt2.hauptboard === true && haupt2.aktiv === true,
    'Die Liste zeigt das ungeholte Hauptboard nicht als offen und fest');
  pruefe(haupt2.fehler === 'nicht geholt',
    'Die Liste nennt den Fehler nicht: ' + JSON.stringify(haupt2));
  pruefe(haupt2.sichtbarkeit === 'öffentlich',
    'Die Liste nennt die Sichtbarkeit nicht: ' + JSON.stringify(haupt2));

  const daten2 = await ruf(gebaut2, '/board/data');
  pruefe(daten2.status === 200, 'GET /board/data bleibt bei „nicht geholt“ nicht 200: '
    + daten2.status + ': ' + daten2.text);
  pruefe(daten2.daten.fehler === 'nicht geholt',
    'Die Daten nennen den Grund nicht: ' + JSON.stringify(daten2.daten.fehler));
  pruefe(daten2.daten.format === 2 && daten2.daten.sichtbarkeit === 'öffentlich',
    'Das leere Hauptboard trägt nicht Fassung und Sichtbarkeit: '
      + JSON.stringify({ format: daten2.daten.format, sichtbarkeit: daten2.daten.sichtbarkeit }));
  pruefe(Array.isArray(daten2.daten.vorgaenge) && daten2.daten.vorgaenge.length === 0
    && Array.isArray(daten2.daten.workflows) && daten2.daten.workflows.length === 0,
  'Das ungeholte Hauptboard ist nicht leer: ' + daten2.text);
  pruefe(!daten2.daten.leer, 'Das ungeholte Hauptboard wird als „kein Board“ gezeigt');

  // Ein zweiter Versuch an derselben Adresse ändert nichts am Fehler.
  const nochmal = await ruf(gebaut2, '/board/hauptboard/holen', {});
  pruefe(nochmal.status === 200 && nochmal.daten.fehler === 'nicht geholt',
    'Der Retry an der unerreichbaren Adresse antwortet falsch: '
      + nochmal.status + ': ' + nochmal.text);
  pruefe(!existsSync(join(ZIEL2, 'board.json')), 'Der Retry hat trotz Fehler etwas geholt');

  // Adresse gerade gerückt: „Wiederholen“ holt das Hauptboard.
  process.env.DSH_BOARD_HAUPTBOARD = 'file://' + REMOTE;
  const geholt = await ruf(gebaut2, '/board/hauptboard/holen', {});
  pruefe(geholt.status === 200, 'Wiederholen antwortet ' + geholt.status
    + ': ' + geholt.text);
  pruefe(!geholt.daten.fehler, 'Wiederholen meldet weiter einen Fehler: ' + geholt.text);
  pruefe(geholt.daten.board && geholt.daten.board.id === 'hauptboard'
    && geholt.daten.board.fehler == null,
  'Wiederholen gibt kein geholtes Hauptboard zurück: ' + geholt.text);
  pruefe(existsSync(join(ZIEL2, 'board.json')), 'Das Hauptboard wurde nicht geholt');
  const registerNach = liesJson(join(HOME2, 'board', 'boards.json'));
  pruefe(registerNach.boards[0].fehler == null,
    'Der Fehler ist nach dem Holen nicht verschwunden: '
      + JSON.stringify(registerNach.boards[0]));

  const datenNach = await ruf(gebaut2, '/board/data');
  pruefe(datenNach.status === 200 && !datenNach.daten.fehler,
    'GET /board/data nach dem Holen antwortet falsch: '
      + datenNach.status + ': ' + datenNach.text);
  pruefe((datenNach.daten.stationen || []).some((s) => s.id === 'idee'),
    'Nach dem Wiederholen fehlen die Stationen: '
      + JSON.stringify(datenNach.daten.stationen));

  bestanden = true;
} finally {
  for (const b of [gebaut, gebaut2]) {
    if (b) b.aufraeumen.forEach((ende) => ende());
  }
  delete process.env.DSH_BOARD_HAUPTBOARD;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Erststart: Hauptboard von selbst, fest, ohne Identität; '
  + 'nicht geholt mit Wiederholen; danach da');
