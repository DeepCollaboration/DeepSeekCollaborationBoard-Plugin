/**
 * Prüfung Schritt 40 — die alte Ablage ist Archiv.
 *
 * Unter `/tmp/board-scheibe1/schritt40` entstehen zwei Ablagen der Fassung 1
 * (eine davon im Register als Archiv markiert) und die Prüffläche der
 * Fassung 2 aus `legePruefflaeche`. Das Home ist ein eigenes Register; der
 * Server läuft in-process, ohne Netz.
 *
 * Geprüft wird:
 *
 *   1. `GET /board/data` liest das Archiv mit seinem Vorhaben; Dateien und
 *      Vorhaben bleiben lesbar.
 *   2. `GET /board/boards` nennt das Board „Archiv“ mit `archiv: true` und dem
 *      gespeicherten Namen als `nameAlt`.
 *   3. Schreiben (`/board/doc/schreiben`) antwortet mit 403 „Die alte Ablage
 *      ist Archiv“ — ohne neue Fassung und ohne Änderung. Der alte
 *      Beitragsweg ist entfernt und antwortet auch im Archiv mit 404.
 *   4. Der Wechsel auf ein Board der Fassung 2 ist erlaubt; dort bleibt
 *      geschrieben werden möglich.
 *   5. Mit `BOARD_ARCHIV=1` wird auch ein nicht markiertes altes Board
 *      abgewiesen; eine Fassung-2-Ablage bleibt davon unberührt.
 *   6. Die Ablagen werden danach entfernt.
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
const ABLAGE = join(WURZEL, 'schritt40');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const ALT = join(ABLAGE, 'alt');
const ALT2 = join(ABLAGE, 'alt-unmarkiert');
const FLAECHE = join(ABLAGE, 'flaeche');
const TESTBOARD = join(FLAECHE, 'board');
const PROJEKT = join(FLAECHE, 'vorhaben');
const VORHABEN = 'board-gesamtkonzept';

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
 * Eine Ablage der Fassung 1 mit einer Person, einem Workflow mit zwei
 * Schritten und einem Vorhaben samt Datei.
 */
function legeAlteAblage(ordner, { vorhabenName }) {
  mkdirSync(join(ordner, 'personen'), { recursive: true });
  mkdirSync(join(ordner, 'workflows'), { recursive: true });
  writeFileSync(join(ordner, 'format'), '1\n', 'utf8');
  schreibeJson(join(ordner, 'personen', 'p1.json'), {
    id: 'p1',
    name: 'Alte Hüterin',
    farbe: '#fbbf24',
  });
  schreibeJson(join(ordner, 'workflows', 'p1.json'), {
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

  const vorgang = join(ordner, 'vorgaenge', 'altes-vorhaben');
  mkdirSync(vorgang, { recursive: true });
  schreibeJson(join(vorgang, 'vorhaben.json'), {
    id: 'altes-vorhaben',
    name: vorhabenName,
    position: 'start',
    verantwortliche: { start: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#60a5fa',
  });
  writeFileSync(join(vorgang, 'idee.md'), '# Idee\n\nDer alte Inhalt.\n', 'utf8');

  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Alte Ablage',
    '-c', 'user.email=alte-ablage@board',
    'commit', '-q', '-m', 'Alte Ablage',
  ]);
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
  if (!route) {
    return { status: 404, text: JSON.stringify({ error: 'Nicht gefunden' }),
      daten: { error: 'Nicht gefunden' } };
  }
  await route.handler(anfrage(pfad, koerper), res);
  for (let i = 0; i < 300 && res.status === 0; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 10));
  }
  return {
    status: res.status,
    text: res.text,
    daten: res.text ? JSON.parse(res.text) : null,
  };
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });
delete process.env.BOARD_ARCHIV;

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeAlteAblage(ALT, { vorhabenName: 'Altes Vorhaben' });
  legeAlteAblage(ALT2, { vorhabenName: 'Zweites altes Vorhaben' });
  const flaeche = legePruefflaeche({
    wurzel: FLAECHE,
    idee: '# Board Gesamtkonzept\n\nEine Prüffläche.\n',
  });
  pruefe(flaeche.board === TESTBOARD,
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'alt',
    boards: [
      {
        id: 'alt', name: 'Alte Ablage', format: 1, art: 'ordner',
        repo: ALT, remote: null, person: 'p1', archiv: true,
      },
      {
        id: 'alt-unmarkiert', name: 'Zweite alte Ablage', format: 1, art: 'ordner',
        repo: ALT2, remote: null, person: 'p1',
      },
      {
        id: 'testboard', name: 'Testboard', format: 2, art: 'team',
        repo: TESTBOARD, remote: null, person: 'p1',
      },
    ],
  });
  // Ohne GitHub-Namen gilt die eigene Person auf einem lokalen Board als
  // verantwortlich; so bleibt die Fassung 2 schreibbar.
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Anna', github: '', farbe: '#fbbf24',
  });

  process.env.DSH_HOME = HOME;
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href
    + '?fall=archiv');
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  // 1. Das Archiv ist lesbar: Vorhaben, Dateien, Board-Daten.
  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data (Archiv) antwortet '
    + daten.status + ': ' + daten.text);
  pruefe(daten.daten.aktiv === 'alt' && daten.daten.format === 1,
    'GET /board/data nennt nicht die alte Ablage: '
      + JSON.stringify([daten.daten.aktiv, daten.daten.format]));
  pruefe(daten.daten.darf === false,
    'Das Archiv meldet kein fehlendes Schreibrecht: '
      + JSON.stringify(daten.daten.darf));
  const vorhaben = (daten.daten.vorgaenge || [])
    .find((v) => v.id === 'altes-vorhaben');
  pruefe(vorhaben && vorhaben.name === 'Altes Vorhaben',
    'Das Vorhaben des Archivs fehlt: '
      + JSON.stringify((daten.daten.vorgaenge || []).map((v) => v.id)));

  const dateien = await ruf(gebaut, '/board/dateien?vorhaben=altes-vorhaben');
  pruefe(dateien.status === 200, 'GET /board/dateien (Archiv) antwortet '
    + dateien.status + ': ' + dateien.text);
  const namen = (dateien.daten.eintraege || []).map((eintrag) => eintrag.name);
  pruefe(namen.includes('idee.md') && namen.includes('vorhaben.json'),
    'Die Dateien des Archivs sind nicht lesbar: ' + JSON.stringify(namen));

  // 2. Das Register zeigt „Archiv“ samt gespeichertem Namen.
  const liste = await ruf(gebaut, '/board/boards');
  pruefe(liste.status === 200, 'GET /board/boards antwortet ' + liste.status
    + ': ' + liste.text);
  const altEintrag = (liste.daten.boards || []).find((b) => b.id === 'alt');
  pruefe(altEintrag && altEintrag.archiv === true,
    'Das Register markiert die alte Ablage nicht als Archiv: '
      + JSON.stringify(altEintrag));
  pruefe(altEintrag.name === 'Archiv',
    'Das Archiv heißt in der Anzeige nicht „Archiv“: ' + JSON.stringify(altEintrag.name));
  pruefe(altEintrag.nameAlt === 'Alte Ablage',
    'Der gespeicherte Name fehlt als `nameAlt`: ' + JSON.stringify(altEintrag.nameAlt));
  pruefe(altEintrag.aktiv === true,
    'Das Archiv ist nicht das offene Board: ' + JSON.stringify(altEintrag.aktiv));
  const testEintrag = (liste.daten.boards || []).find((b) => b.id === 'testboard');
  pruefe(testEintrag && testEintrag.archiv !== true,
    'Ein Board der Fassung 2 wird als Archiv geführt: ' + JSON.stringify(testEintrag));

  // 3. Schreiben wird abgewiesen, bevor die Ablage angefasst wird.
  const kopfVorher = git(ALT, ['rev-parse', 'HEAD']);
  const zaehlerVorher = git(ALT, ['rev-list', '--count', 'HEAD']);

  const schreiben = await ruf(gebaut, '/board/doc/schreiben', {
    vorhaben: 'altes-vorhaben', datei: 'idee.md', text: 'Neu.\n',
  });
  pruefe(schreiben.status === 403, 'Das Schreiben im Archiv antwortet '
    + schreiben.status + ': ' + schreiben.text);
  pruefe(schreiben.daten && schreiben.daten.error === 'Die alte Ablage ist Archiv',
    'Die Abweisung nennt nicht den Grund: ' + schreiben.text);

  const beitrag = await ruf(gebaut, '/board/beitrag', {
    vorhaben: 'altes-vorhaben',
    schritt: 'start',
    notiz: 'Ein Vorschlag.',
    dateien: [{ name: 'idee.md', text: 'Ein Vorschlag.\n' }],
  });
  pruefe(beitrag.status === 404, 'Der alte Beitragsweg antwortet auch im Archiv '
    + beitrag.status + ' statt 404: ' + beitrag.text);

  pruefe(git(ALT, ['rev-parse', 'HEAD']) === kopfVorher,
    'Das Archiv hat durch den Schreibversuch eine neue Fassung bekommen');
  pruefe(git(ALT, ['rev-list', '--count', 'HEAD']) === zaehlerVorher,
    'Das Archiv hat durch den Schreibversuch einen Commit bekommen');
  pruefe(git(ALT, ['status', '--porcelain']) === '',
    'Im Archiv liegt nach dem Schreibversuch etwas Uncommittetes');

  // 4. Mit BOARD_ARCHIV=1 wird auch ein nicht markiertes altes Board
  // abgewiesen; das ist der Schalter vor der Markierung.
  const wechselAlt2 = await ruf(gebaut, '/board/boards/wechsel',
    { id: 'alt-unmarkiert' });
  pruefe(wechselAlt2.status === 200 && wechselAlt2.daten.aktiv === 'alt-unmarkiert',
    'Der Wechsel auf das zweite alte Board scheitert: '
      + wechselAlt2.status + ' ' + wechselAlt2.text);

  const kopfAlt2 = git(ALT2, ['rev-parse', 'HEAD']);
  const zaehlerAlt2 = git(ALT2, ['rev-list', '--count', 'HEAD']);
  process.env.BOARD_ARCHIV = '1';
  const erzwungen = await ruf(gebaut, '/board/doc/schreiben', {
    vorhaben: 'altes-vorhaben', datei: 'idee.md', text: 'Neu.\n',
  });
  pruefe(erzwungen.status === 403, 'BOARD_ARCHIV=1 weist das nicht markierte '
    + 'Board nicht ab: ' + erzwungen.status + ' ' + erzwungen.text);
  pruefe(erzwungen.daten && erzwungen.daten.error === 'Die alte Ablage ist Archiv',
    'Die erzwungene Abweisung nennt nicht den Grund: ' + erzwungen.text);
  pruefe(git(ALT2, ['rev-parse', 'HEAD']) === kopfAlt2
    && git(ALT2, ['rev-list', '--count', 'HEAD']) === zaehlerAlt2,
  'Das nicht markierte Board hat durch den Schreibversuch eine Fassung bekommen');
  pruefe(git(ALT2, ['status', '--porcelain']) === '',
    'Im nicht markierten Board liegt etwas Uncommittetes');

  // 5. Der Wechsel auf ein Board der Fassung 2 ist erlaubt — auch mit dem
  // Schalter. Dort bleibt geschrieben werden möglich.
  const wechsel = await ruf(gebaut, '/board/boards/wechsel', { id: 'testboard' });
  pruefe(wechsel.status === 200 && wechsel.daten.aktiv === 'testboard',
    'Der Wechsel auf das Testboard scheitert: ' + wechsel.status + ' ' + wechsel.text);

  const neueDaten = await ruf(gebaut, '/board/data');
  pruefe(neueDaten.status === 200 && neueDaten.daten.aktiv === 'testboard',
    'GET /board/data (Fassung 2) antwortet nicht: '
      + neueDaten.status + ' ' + neueDaten.text);
  pruefe(neueDaten.daten.format === 2 && neueDaten.daten.darf === true,
    'Das Board der Fassung 2 meldet nicht Fassung 2 und Schreibrecht: '
      + JSON.stringify([neueDaten.daten.format, neueDaten.daten.darf]));

  const zaehlerProjekt = Number(git(PROJEKT, ['rev-list', '--count', 'HEAD']));
  const verschieben = await ruf(gebaut, '/board/vorhaben/verschieben', {
    id: VORHABEN, position: 'umsetzen',
  });
  pruefe(verschieben.status === 200, 'Das Verschieben im Board der Fassung 2 '
    + 'scheitert: ' + verschieben.status + ' ' + verschieben.text);

  const nachher = await ruf(gebaut, '/board/data');
  const verschoben = (nachher.daten.vorgaenge || []).find((v) => v.id === VORHABEN);
  pruefe(verschoben && verschoben.position === 'umsetzen',
    'Das Vorhaben steht nach dem Schreiben nicht an „umsetzen“: '
      + JSON.stringify(verschoben && verschoben.position));
  pruefe(Number(git(PROJEKT, ['rev-list', '--count', 'HEAD'])) === zaehlerProjekt + 1,
    'Das Schreiben im Board der Fassung 2 hat keine Fassung angelegt');
  pruefe(git(PROJEKT, ['status', '--porcelain']) === '',
    'Nach dem Schreiben liegt im Vorhaben der Fassung 2 etwas Uncommittetes');

  // 6. Zurück auf das Archiv: der Wechsel dorthin bleibt erlaubt.
  const zurueck = await ruf(gebaut, '/board/boards/wechsel', { id: 'alt' });
  pruefe(zurueck.status === 200 && zurueck.daten.aktiv === 'alt',
    'Der Wechsel zurück auf das Archiv scheitert: '
      + zurueck.status + ' ' + zurueck.text);
  const archivBild = await ruf(gebaut, '/board/data');
  pruefe(archivBild.status === 200
    && (archivBild.daten.vorgaenge || []).some((v) => v.id === 'altes-vorhaben'),
  'Das Archiv bleibt nach dem Wechsel nicht lesbar: '
    + archivBild.status + ' ' + archivBild.text);
  // Das Register behält die Markierung und den gespeicherten Namen auch nach
  // einem Wechsel.
  const listeZurueck = await ruf(gebaut, '/board/boards');
  const altZurueck = (listeZurueck.daten.boards || []).find((b) => b.id === 'alt');
  pruefe(altZurueck && altZurueck.archiv === true
    && altZurueck.name === 'Archiv' && altZurueck.nameAlt === 'Alte Ablage',
  'Der Wechsel hat die Archiv-Markierung verloren: ' + JSON.stringify(altZurueck));

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  delete process.env.BOARD_ARCHIV;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Archiv: lesbar, Schreiben 403 ohne Commit, Wechsel erlaubt, '
  + 'Fassung 2 schreibbar');
