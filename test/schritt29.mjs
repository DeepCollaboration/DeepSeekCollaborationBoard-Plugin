/**
 * Prüfung Schritt 29 — die alte Ablage lesen.
 *
 * Unter `/tmp/board-scheibe1/schritt29` entstehen zwei Ablagen:
 *
 *   - `alt` ist eine Ablage der Fassung 1 mit einer Person, einem Workflow
 *     mit zwei Schritten und zwei Vorhaben. Das erste Vorhaben trägt eine
 *     Datei (`idee.md`) und ein Transkript unter `transkripte/`.
 *   - `flaeche` ist die Prüffläche der Fassung 2 aus `legePruefflaeche`.
 *
 * Ein eigenes `DSH_HOME` und ein Register führen beide Boards; offen ist
 * zuerst die alte Ablage. Der Server läuft in-process, ohne Netz.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/data` für das alte Board liefert beide Vorhaben, den
 *      Workflow mit zwei Schritten, die Person und an der Station die
 *      abgeleiteten Dateinamen; das erste Vorhaben nennt seinen Ordner und
 *      sein Transkript in `laeufe`.
 *   2. `GET /board/dateien` zeigt den Vorhaben-Ordner mit `transkripte/`,
 *      `idee.md` und `vorhaben.json`; `GET /board/datei` liest `idee.md` und
 *      das Transkript; `GET /board/doc` liest `idee.md` samt Basis.
 *   3. Der alte Ablage-Ordner trägt vor und nach allen Lesezugriffen denselben
 *      `HEAD`, dieselbe Zahl von Fassungen und keinen Eintrag in
 *      `git status --porcelain`.
 *   4. Nach `POST /board/boards/wechsel` auf das Testboard liefert
 *      `GET /board/data` die zusammengesetzte Form: das Vorhaben an seiner
 *      Station `idee`, die Stationen „Idee“ und „Umsetzen“ aus ihren
 *      Repositories, dazu die Dateien des Vorhabens.
 *   5. Server, Ablagen und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt29');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const ALT = join(ABLAGE, 'alt');
const FLAECHE = join(ABLAGE, 'flaeche');
const TESTBOARD = join(FLAECHE, 'board');
const TRANSKRIPT = 'transkripte/start-2026-10-20-120000.md';

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

/**
 * Die alte Ablage: eine Person, ein Workflow mit zwei Schritten, zwei
 * Vorhaben. Das erste trägt eine Datei und ein Transkript; das zweite nur
 * seine `vorhaben.json`.
 */
function legeAlteAblage() {
  mkdirSync(join(ALT, 'personen'), { recursive: true });
  mkdirSync(join(ALT, 'workflows'), { recursive: true });
  writeFileSync(join(ALT, 'format'), '1\n', 'utf8');

  schreibeJson(join(ALT, 'personen', 'p1.json'), {
    id: 'p1',
    name: 'Alte Hüterin',
    farbe: '#fbbf24',
  });

  schreibeJson(join(ALT, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'alt',
      titel: 'Alte Kette',
      layout: 'auto',
      schritte: [
        {
          id: 'start',
          name: 'Anfang',
          host: 'p1',
          eingang: [],
          ausgabe: ['idee.md'],
          wie: { art: 'textfeld', wert: '' },
          inhalt: 'Der Anfang.',
        },
        {
          id: 'pruefen',
          name: 'Prüfen',
          host: 'p1',
          eingang: ['idee.md'],
          ausgabe: ['pruefung.md'],
          wie: { art: 'textfeld', wert: '' },
          inhalt: 'Die Prüfung.',
        },
      ],
      positionen: [
        { id: 'start', schritt: 'start', x: 40, y: 80 },
        { id: 'pruefen', schritt: 'pruefen', x: 340, y: 80 },
      ],
      kanten: [{ von: 'start', nach: 'pruefen' }],
    }],
  });

  const erstes = join(ALT, 'vorgaenge', 'altes-vorhaben');
  mkdirSync(join(erstes, 'transkripte'), { recursive: true });
  schreibeJson(join(erstes, 'vorhaben.json'), {
    id: 'altes-vorhaben',
    name: 'Altes Vorhaben',
    position: 'start',
    verantwortliche: { start: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [{
      position: 'start',
      skill: 'alt-start',
      datei: TRANSKRIPT,
      sitzung: 'session-alt-1',
      datum: '2026-10-20',
    }],
    fork_von: null,
    zweig_von: null,
    farbe: '#60a5fa',
  });
  writeFileSync(join(erstes, 'idee.md'), '# Idee\n\nDer alte Inhalt.\n', 'utf8');
  writeFileSync(join(erstes, TRANSKRIPT), [
    '---',
    'art: Transkript',
    'schritt: Anfang',
    'skill: alt-start',
    'sitzung: session-alt-1',
    'stand: 2026-10-20',
    '---',
    '',
    '# Anfang',
    '',
    'Ein alter Lauf.',
    '',
  ].join('\n'), 'utf8');

  const zweites = join(ALT, 'vorgaenge', 'zweites-vorhaben');
  mkdirSync(zweites, { recursive: true });
  schreibeJson(join(zweites, 'vorhaben.json'), {
    id: 'zweites-vorhaben',
    name: 'Zweites Vorhaben',
    position: 'pruefen',
    verantwortliche: { pruefen: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#f59e0b',
  });

  git(ALT, ['init', '-q', '-b', 'main']);
  git(ALT, ['add', '-A']);
  git(ALT, [
    '-c', 'user.name=Alte Ablage',
    '-c', 'user.email=alte-ablage@board',
    'commit', '-q', '-m', 'Alte Ablage',
  ]);
}

/** Alle Workflows einer `/board/data`-Antwort, flach über die Flächen. */
function workflowsVon(daten) {
  const flaechen = Array.isArray(daten && daten.workflows) ? daten.workflows : [];
  const liste = [];
  for (const person of flaechen) {
    for (const workflow of ((person && person.workflows) || [])) {
      liste.push(workflow || {});
    }
  }
  return liste;
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

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  legeAlteAblage();

  const flaeche = legePruefflaeche({ wurzel: FLAECHE });
  pruefe(flaeche.board === TESTBOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'alt',
    boards: [
      {
        id: 'alt', name: 'Alte Ablage', format: 1, art: 'ordner',
        repo: ALT, remote: null, person: 'p1',
      },
      {
        id: 'testboard', name: 'Testboard', format: 2, art: 'team',
        repo: TESTBOARD, remote: null, person: 'p1',
      },
    ],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  // Der Stand der alten Ablage vor dem ersten Lesezugriff. `HEAD` und die
  // Zahl der Fassungen sagen, ob ein Lesezugriff einen Commit angelegt hat.
  const kopfVorher = git(ALT, ['rev-parse', 'HEAD']);
  const zaehlerVorher = git(ALT, ['rev-list', '--count', 'HEAD']);

  // 1. Das alte Board in `/board/data`.
  const alteDaten = await ruf(gebaut, '/board/data');
  pruefe(alteDaten.status === 200,
    'GET /board/data (alt) antwortet ' + alteDaten.status + ': '
      + JSON.stringify(alteDaten.daten));
  pruefe(alteDaten.daten.aktiv === 'alt',
    'GET /board/data nennt nicht die alte Ablage als offen: '
      + JSON.stringify(alteDaten.daten.aktiv));
  pruefe(alteDaten.daten.format === 1 && alteDaten.daten.formatAblage === 1,
    'GET /board/data nennt nicht Fassung 1: '
      + JSON.stringify([alteDaten.daten.format, alteDaten.daten.formatAblage]));

  const vorgaenge = Array.isArray(alteDaten.daten.vorgaenge)
    ? alteDaten.daten.vorgaenge : [];
  pruefe(vorgaenge.length === 2,
    'GET /board/data liefert ' + vorgaenge.length + ' Vorhaben statt zwei: '
      + JSON.stringify(vorgaenge.map((v) => v.id)));
  const altes = vorgaenge.find((v) => v.id === 'altes-vorhaben');
  const zweites = vorgaenge.find((v) => v.id === 'zweites-vorhaben');
  pruefe(altes && altes.name === 'Altes Vorhaben',
    'Das erste Vorhaben fehlt oder heißt anders: ' + JSON.stringify(altes));
  pruefe(zweites && zweites.name === 'Zweites Vorhaben',
    'Das zweite Vorhaben fehlt oder heißt anders: ' + JSON.stringify(zweites));
  pruefe(altes.ordner === 'altes-vorhaben',
    'Das erste Vorhaben nennt nicht seinen Ordner: ' + JSON.stringify(altes.ordner));
  pruefe(Array.isArray(altes.laeufe)
    && altes.laeufe.some((lauf) => lauf && lauf.datei === TRANSKRIPT),
  'Dem ersten Vorhaben fehlt sein Transkript in `laeufe`: '
    + JSON.stringify(altes.laeufe));

  const alteFlows = workflowsVon(alteDaten.daten);
  pruefe(alteFlows.length === 1,
    'GET /board/data zeigt ' + alteFlows.length + ' Workflows statt einem');
  const alteKette = alteFlows[0];
  pruefe(alteKette.id === 'alt' && alteKette.titel === 'Alte Kette',
    'Der Workflow fehlt oder heißt anders: ' + JSON.stringify(alteKette));
  const alteSchritte = Array.isArray(alteKette.schritte) ? alteKette.schritte : [];
  pruefe(alteSchritte.length === 2,
    'Der Workflow zeigt ' + alteSchritte.length + ' Schritte statt zwei: '
      + JSON.stringify(alteSchritte.map((s) => s.name)));
  pruefe(alteSchritte.some((s) => s.name === 'Anfang')
    && alteSchritte.some((s) => s.name === 'Prüfen'),
  'Dem Workflow fehlen die Schritte Anfang und Prüfen: '
    + JSON.stringify(alteSchritte.map((s) => s.name)));
  // Die Dateien des Vorhabens stecken in der Ableitung: die Position „start“
  // erzeugt `idee.md`, die Position „pruefen“ `pruefung.md`.
  const startPosition = (alteKette.positionen || []).find((p) => p.id === 'start');
  pruefe(startPosition && startPosition.abgeleitet
    && Array.isArray(startPosition.abgeleitet.ausgabe)
    && startPosition.abgeleitet.ausgabe.includes('idee.md'),
  'An der Station „start“ fehlt die abgeleitete Datei idee.md: '
    + JSON.stringify(startPosition && startPosition.abgeleitet));

  const personen = Array.isArray(alteDaten.daten.personen) ? alteDaten.daten.personen : [];
  pruefe(personen.length === 1 && personen[0].id === 'p1',
    'GET /board/data liefert nicht die eine Person p1: ' + JSON.stringify(personen));
  pruefe(personen[0].name === 'Alte Hüterin',
    'Die Person trägt nicht ihren Namen: ' + JSON.stringify(personen[0].name));

  console.log('ok Alte Ablage: 2 Vorhaben (altes-vorhaben mit idee.md und '
    + 'Transkript, zweites-vorhaben), Workflow „Alte Kette“ mit den Schritten '
    + 'Anfang und Prüfen, Person „Alte Hüterin“; an „start“ liegt die Datei idee.md');

  // 2. Die Dateien des ersten Vorhabens über die Wege der Fassung 1 lesen.
  const ordner = await ruf(gebaut, '/board/dateien?vorhaben=altes-vorhaben');
  pruefe(ordner.status === 200,
    'GET /board/dateien antwortet ' + ordner.status + ': ' + JSON.stringify(ordner.daten));
  const eintraege = Array.isArray(ordner.daten.eintraege) ? ordner.daten.eintraege : [];
  const namen = eintraege.map((eintrag) => eintrag.name);
  for (const name of ['transkripte', 'idee.md', 'vorhaben.json']) {
    pruefe(namen.includes(name),
      'GET /board/dateien zeigt „' + name + '“ nicht: ' + JSON.stringify(namen));
  }
  const transkriptOrdner = eintraege.find((eintrag) => eintrag.name === 'transkripte');
  pruefe(transkriptOrdner && transkriptOrdner.art === 'ordner',
    '„transkripte“ steht nicht als Ordner da: ' + JSON.stringify(transkriptOrdner));

  const datei = await ruf(gebaut, '/board/datei?vorhaben=altes-vorhaben&pfad=idee.md');
  pruefe(datei.status === 200 && datei.daten.exists === true,
    'GET /board/datei liest idee.md nicht: ' + JSON.stringify(datei.daten));
  pruefe(String(datei.daten.text || '').includes('Der alte Inhalt'),
    'GET /board/datei liefert nicht den Inhalt von idee.md: '
      + JSON.stringify(datei.daten.text));

  const transkript = await ruf(gebaut,
    '/board/datei?vorhaben=altes-vorhaben&pfad=' + encodeURIComponent(TRANSKRIPT));
  pruefe(transkript.status === 200 && transkript.daten.exists === true,
    'GET /board/datei liest das Transkript nicht: ' + JSON.stringify(transkript.daten));
  pruefe(String(transkript.daten.text || '').includes('Ein alter Lauf'),
    'GET /board/datei liefert nicht den Inhalt des Transkripts: '
      + JSON.stringify(transkript.daten.text));

  // Der Weg für eine Datei im Wurzelordner: `GET /board/doc` samt Basis.
  const doc = await ruf(gebaut, '/board/doc?vorhaben=altes-vorhaben&datei=idee.md');
  pruefe(doc.status === 200 && doc.daten.exists === true,
    'GET /board/doc liest idee.md nicht: ' + JSON.stringify(doc.daten));
  pruefe(String(doc.daten.text || '').includes('Der alte Inhalt'),
    'GET /board/doc liefert nicht den Inhalt von idee.md: '
      + JSON.stringify(doc.daten.text));
  pruefe(/^[0-9a-f]{40}$/.test(String(doc.daten.basis || '')),
    'GET /board/doc nennt keine Basis für idee.md: ' + JSON.stringify(doc.daten.basis));

  console.log('ok Dateien: /board/dateien zeigt transkripte, idee.md und '
    + 'vorhaben.json; /board/datei liest idee.md und das Transkript; '
    + '/board/doc liest idee.md mit ihrer Basis');

  // 3. Die alte Ablage ist nach den Lesezugriffen unverändert.
  pruefe(git(ALT, ['rev-parse', 'HEAD']) === kopfVorher,
    'Die alte Ablage hat nach den Lesezugriffen einen anderen HEAD');
  pruefe(git(ALT, ['rev-list', '--count', 'HEAD']) === zaehlerVorher,
    'Die alte Ablage hat nach den Lesezugriffen eine neue Fassung');
  pruefe(git(ALT, ['status', '--porcelain']) === '',
    'In der alten Ablage liegt nach den Lesezugriffen etwas Uncommittetes');
  console.log('ok Unverändert: HEAD ' + kopfVorher.slice(0, 7)
    + ' vor und nach den Lesezugriffen, git status leer');

  // 4. Auf das Board der Fassung 2 wechseln; `/board/data` setzt es zusammen.
  const wechsel = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(wechsel.status === 200 && wechsel.daten.aktiv === 'testboard',
    'Der Wechsel auf das Testboard scheitert: ' + wechsel.status + ' '
      + JSON.stringify(wechsel.daten));

  const neueDaten = await ruf(gebaut, '/board/data');
  pruefe(neueDaten.status === 200,
    'GET /board/data (Testboard) antwortet ' + neueDaten.status + ': '
      + JSON.stringify(neueDaten.daten));
  pruefe(neueDaten.daten.aktiv === 'testboard',
    'GET /board/data nennt nicht das Testboard als offen: '
      + JSON.stringify(neueDaten.daten.aktiv));
  pruefe(neueDaten.daten.format === 2 && neueDaten.daten.formatAblage === 2,
    'GET /board/data nennt nicht Fassung 2: '
      + JSON.stringify([neueDaten.daten.format, neueDaten.daten.formatAblage]));

  const neueVorgaenge = Array.isArray(neueDaten.daten.vorgaenge)
    ? neueDaten.daten.vorgaenge : [];
  pruefe(neueVorgaenge.length === 1,
    'GET /board/data zeigt ' + neueVorgaenge.length + ' Vorhaben statt einem: '
      + JSON.stringify(neueVorgaenge.map((v) => v.id)));
  const neues = neueVorgaenge[0];
  pruefe(neues.id === 'board-gesamtkonzept' && neues.position === 'idee',
    'Das Vorhaben steht nicht an seiner Station: ' + JSON.stringify(neues));
  pruefe(Array.isArray(neues.dateien)
    && neues.dateien.includes('idee.md') && neues.dateien.includes('vorhaben.json'),
  'Die Dateien des Vorhabens fehlen in der zusammengesetzten Form: '
    + JSON.stringify(neues.dateien));

  const neueFlows = workflowsVon(neueDaten.daten);
  pruefe(neueFlows.length === 1,
    'GET /board/data zeigt ' + neueFlows.length + ' Workflows statt einem: '
      + JSON.stringify(neueFlows.map((w) => w.id)));
  const standard = neueFlows[0];
  pruefe(standard.id === 'standard',
    'Der Workflow heißt nicht standard: ' + JSON.stringify(standard.id));
  const neueSchritte = Array.isArray(standard.schritte) ? standard.schritte : [];
  pruefe(neueSchritte.length === 2,
    'Der Workflow zeigt ' + neueSchritte.length + ' Stationen statt zwei: '
      + JSON.stringify(neueSchritte.map((s) => s.name)));
  for (const name of ['Idee', 'Umsetzen']) {
    pruefe(neueSchritte.some((s) => s.name === name),
      'Die Station „' + name + '“ fehlt in der zusammengesetzten Form: '
        + JSON.stringify(neueSchritte.map((s) => s.name)));
  }

  console.log('ok Fassung 2: Vorhaben „Board Gesamtkonzept“ an der Station idee; '
    + 'Workflow „Standard-Workflow“ mit den Stationen Idee und Umsetzen aus ihren '
    + 'Repositories; Dateien idee.md und vorhaben.json');

  // 5. Auch nach dem Wechsel und dem zweiten Lesen ist die alte Ablage
  // unverändert.
  pruefe(git(ALT, ['rev-parse', 'HEAD']) === kopfVorher,
    'Die alte Ablage hat nach allen Lesezugriffen einen anderen HEAD');
  pruefe(git(ALT, ['rev-list', '--count', 'HEAD']) === zaehlerVorher,
    'Die alte Ablage hat nach allen Lesezugriffen eine neue Fassung');
  pruefe(git(ALT, ['status', '--porcelain']) === '',
    'In der alten Ablage liegt nach allen Lesezugriffen etwas Uncommittetes');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
