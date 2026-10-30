/**
 * Prüfung Schritt 19 — das Board aus den Repositories zusammensetzen.
 *
 * Legt unter /tmp/board-scheibe1/schritt19/ fünf lokale Repositories an — die
 * Stationen „Idee“ und „Umsetzen“, den Workflow, das Vorhaben „Board
 * Gesamtkonzept“ und das Testboard — und dazu ein eigenes DSH_HOME. Das
 * Testboard wird über `boards.js` aufgenommen und ist danach das offene Board.
 * Gelesen wird der Server in-process, ohne Netz und ohne Git.
 *
 * Geprüft wird:
 *
 *   1. `boards.js` nimmt ein Board der Fassung 2 mit Pfad, Format, Name und
 *      Art auf; es ist das aktive Board im Register.
 *   2. `/board/data` liefert `aktiv` = testboard und die Felder, die die Seite
 *      schon liest: `workflow`, `schritte`, `workflows` mit `schritte`,
 *      `vorgaenge`, `personen`, `boards`.
 *   3. Ein Vorhaben heißt „Board Gesamtkonzept“ und steht an „idee“.
 *   4. Der Workflow hat die Schritte „Idee“ und „Umsetzen“; sie tragen Namen,
 *      Host, Aktion und Reife aus ihren Station-Repositories.
 *   5. p1 ist als Thomas Heinrich mit #fbbf24 dabei.
 *   6. Fehlt ein Repository, steht eine Lücke da — kein erfundener Name.
 *   7. Ablage und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verbindeBoard } from '../boards.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const VORLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
// Ein eigener Ordner unter der gemeinsamen Prüffläche: Schritt 18 prüft
// daneben und darf diese Ablage nicht wegziehen.
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt19');
const HOME = join(ABLAGE, 'home');
const STATION_IDEE = join(ABLAGE, 'station-idee');
const STATION_UMSETZEN = join(ABLAGE, 'station-umsetzen');
const WORKFLOW = join(ABLAGE, 'workflow');
const VORHABEN = join(ABLAGE, 'vorhaben');
const BOARD = join(ABLAGE, 'board');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function schreibeText(pfad, text) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, text, 'utf8');
}

/** Die fünf Repositories aus Schritt 01, mit denselben Inhalten. */
function anlegen(idee) {
  schreibeJson(join(STATION_IDEE, 'station.json'), {
    format: 2,
    id: 'idee',
    name: 'Idee',
    beschreibung: 'Thema in einem Satz festhalten. Noch keine Struktur, keine Technik.',
    host: 'p1',
    eingang: [],
    ausgabe: [],
    aktion: {
      art: 'textfeld',
      wert: 'Thema in einem Satz festhalten. Noch keine Struktur, keine Technik.',
    },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['idee', 'start'],
  });
  schreibeText(join(STATION_IDEE, 'README.md'), '# Idee\n');

  schreibeJson(join(STATION_UMSETZEN, 'station.json'), {
    format: 2,
    id: 'umsetzen',
    name: 'Umsetzen',
    beschreibung: 'Setzt den Bauplan um: ein Schritt je Runde, ein Arbeiter je Schritt, ein frischer Prüfer je Schritt.',
    host: 'p1',
    eingang: ['bauplan.md'],
    ausgabe: ['produkt/', 'umsetzung.md'],
    aktion: { art: 'skill', datei: 'SKILL.md', wert: 'p1-umsetzen' },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['umsetzen', 'bau'],
  });
  schreibeText(join(STATION_UMSETZEN, 'SKILL.md'), '# Umsetzen\n');
  schreibeText(join(STATION_UMSETZEN, 'README.md'), '# Umsetzen\n');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zum Produkt.',
    autor: 'p1',
    stationen: [
      { repo: STATION_IDEE, fassung: 'v1', id: 'idee' },
      { repo: STATION_UMSETZEN, fassung: 'v1', id: 'umsetzen' },
    ],
    positionen: [
      { id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] },
      { id: 'umsetzen', station: 'umsetzen', x: 2960, y: 380, bedingung: [] },
    ],
    kanten: [{ von: 'idee', nach: 'umsetzen' }],
    layout: 'auto',
    regeln: {},
  });

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'board-gesamtkonzept',
    name: 'Board Gesamtkonzept',
    workflow: { repo: WORKFLOW, fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    fork_von: null,
    zweig_von: null,
    farbe: '#60a5fa',
  });
  schreibeText(join(VORHABEN, 'idee.md'), idee);

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION_IDEE }, { repo: STATION_UMSETZEN }],
    einstellungen: {},
    layout: {},
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

function anfrage(pfad) {
  return {
    method: 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() { /* kein Körper */ },
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

async function starten(modulPfad) {
  process.env.DSH_HOME = HOME;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(modulPfad).href);
  modul.apply(gebaut.ctx);
  return gebaut;
}

function get(gebaut, pfad) {
  const res = antwort();
  gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad), res);
  pruefe(res.status === 200, 'GET ' + pfad + ' antwortet ' + res.status + ': ' + res.text);
  return JSON.parse(res.text);
}

rmSync(ABLAGE, { recursive: true, force: true });
const idee = readFileSync(join(VORLAGE, 'vorgaenge', 'board-gesamtkonzept', 'idee.md'), 'utf8');

let gebaut = null;
let bestanden = false;

try {
  anlegen(idee);

  // 1. Ein bisheriges Board bleibt, das Testboard der Fassung 2 kommt dazu.
  const altboard = join(ABLAGE, 'altboard');
  schreibeText(join(altboard, 'format'), '1\n');
  mkdirSync(join(HOME, 'board'), { recursive: true });
  writeFileSync(join(HOME, 'board', 'boards.json'), JSON.stringify({
    format: 1,
    aktiv: 'altboard',
    boards: [{
      id: 'altboard', name: 'Altes Board', art: 'ordner',
      repo: altboard, person: 'p1',
    }],
  }, null, 2) + '\n', 'utf8');

  const aufgenommen = verbindeBoard({
    home: HOME, name: '', adresse: BOARD, identitaet: { name: 'Thomas Heinrich' },
  });
  const register = liesJson(join(HOME, 'board', 'boards.json'));
  const eintrag = register.boards.find((b) => b.id === 'testboard') || null;
  pruefe(register.boards.length === 2, 'Das bisherige Board ist nicht geblieben');
  pruefe(register.boards.some((b) => b.id === 'altboard' && b.format === 1),
    'Das alte Board steht nicht mehr im Register');
  pruefe(register.aktiv === 'testboard', 'Das Testboard ist im Register nicht aktiv');
  pruefe(eintrag, 'Das Testboard steht nicht im Register');
  pruefe(eintrag.format === 2, 'Der Eintrag trägt nicht Format 2');
  pruefe(eintrag.repo === BOARD, 'Der Eintrag trägt nicht den Pfad des Boards');
  pruefe(eintrag.name === 'Testboard', 'Der Eintrag trägt nicht den Namen des Boards');
  pruefe(eintrag.art === 'team', 'Der Eintrag trägt nicht die Art des Boards');
  pruefe(eintrag.person === 'p1', 'Der Eintrag trägt nicht die lesende Person');
  pruefe(aufgenommen.board.id === 'testboard', 'Aufgenommen wurde ein anderes Board');
  console.log('ok Board: Testboard mit Pfad, Format 2, Name und Art aufgenommen, aktiv');

  // 2. Der Server liest das aktive Board über die Komposition.
  gebaut = await starten(join(PRODUKT, 'index.js'));
  const daten = get(gebaut, '/board/data');

  pruefe(daten.aktiv === 'testboard', 'Aktiv ist nicht testboard: ' + daten.aktiv);
  pruefe(daten.boards.length === 2, 'Die Board-Liste zeigt nicht beide Boards');
  pruefe(daten.boards.some((b) => b.id === 'testboard' && b.aktiv === true),
    'Die Board-Liste zeigt das Testboard nicht als offen');
  pruefe(daten.boards.some((b) => b.id === 'altboard' && b.aktiv === false),
    'Die Board-Liste zeigt das alte Board nicht');
  pruefe(daten.format === 2 && daten.formatAblage === 2,
    'Die Antwort nennt nicht Format 2');
  pruefe(Array.isArray(daten.workflows) && daten.workflows.length === 1,
    'Die Antwort hat keine Fläche');
  pruefe(daten.workflow && Array.isArray(daten.schritte),
    'Die alten Felder workflow/schritte fehlen');

  // 3. Das Vorhaben.
  pruefe(daten.vorgaenge.length === 1, 'Das Board zeigt nicht genau ein Vorhaben');
  const vorhaben = daten.vorgaenge[0];
  pruefe(vorhaben.name === 'Board Gesamtkonzept',
    'Das Vorhaben heißt nicht Board Gesamtkonzept: ' + vorhaben.name);
  pruefe(vorhaben.position === 'idee', 'Das Vorhaben steht nicht an idee: ' + vorhaben.position);
  pruefe(vorhaben.farbe === '#60a5fa', 'Die Farbe des Vorhabens fehlt');
  pruefe(vorhaben.verantwortet === 'Thomas Heinrich',
    'Das Vorhaben verantwortet nicht Thomas Heinrich: ' + vorhaben.verantwortet);
  pruefe(vorhaben.darf && vorhaben.darf.aendern === true,
    'p1 darf das Vorhaben nicht ändern');
  pruefe(Array.isArray(vorhaben.dateien) && vorhaben.dateien.includes('idee.md'),
    'Die Dateien des Vorhabens fehlen');

  // 4. Der Workflow und seine Schritte.
  const flaeche = daten.workflows.find((w) => w.ich) || null;
  pruefe(flaeche && flaeche.id === 'p1', 'Die eigene Fläche ist nicht p1');
  const workflow = flaeche.workflows[0];
  pruefe(workflow && workflow.id === 'standard', 'Der Workflow ist nicht der Standard-Workflow');
  const namen = (workflow.schritte || []).map((s) => s.name);
  pruefe(namen.length === 2 && namen[0] === 'Idee' && namen[1] === 'Umsetzen',
    'Die Schritte heißen nicht Idee und Umsetzen: ' + JSON.stringify(namen));
  const positionen = new Map(workflow.positionen.map((p) => [p.id, p]));
  pruefe(positionen.get('idee') && positionen.get('idee').schritt === 'idee',
    'Die Position idee zeigt nicht auf die Station idee');
  pruefe(positionen.get('idee').x === 50 && positionen.get('idee').y === 80,
    'Die Position idee steht nicht auf 50/80');
  pruefe(workflow.kanten.length === 1
    && workflow.kanten[0].von === 'idee' && workflow.kanten[0].nach === 'umsetzen',
  'Die Kante von idee nach umsetzen fehlt');

  const ideeSchritt = workflow.schritte[0];
  const umsetzenSchritt = workflow.schritte[1];
  pruefe(ideeSchritt.host === 'p1' && umsetzenSchritt.host === 'p1',
    'Die Stationen tragen nicht den Host p1');
  pruefe(umsetzenSchritt.aktion && umsetzenSchritt.aktion.art === 'skill',
    'Die Aktion der Station Umsetzen ist nicht skill');
  pruefe(umsetzenSchritt.aktion.datei === 'SKILL.md',
    'Die Aktionsdatei der Station Umsetzen ist nicht SKILL.md');
  pruefe(umsetzenSchritt.reife === 'erprobt', 'Die Reife der Station Umsetzen ist nicht erprobt');
  pruefe(umsetzenSchritt.ausgabe.includes('produkt/')
    && umsetzenSchritt.ausgabe.includes('umsetzung.md'),
  'Der Ausgang der Station Umsetzen fehlt');
  pruefe(ideeSchritt.aktion.art === 'textfeld', 'Die Aktion der Station Idee ist nicht textfeld');

  // 5. Die Personen und ihre Farben.
  const p1 = daten.personen.find((p) => p.id === 'p1') || null;
  pruefe(p1, 'p1 fehlt in den Personen');
  pruefe(p1.name === 'Thomas Heinrich', 'p1 heißt nicht Thomas Heinrich');
  pruefe(p1.farbe === '#fbbf24', 'p1 trägt nicht die Farbe #fbbf24');
  pruefe(p1.ich === true, 'p1 ist nicht die eigene Person');
  console.log('ok Testboard: „Board Gesamtkonzept“ steht an „idee“; der Workflow trägt „Idee“ und „Umsetzen“');

  // 6. Fehlt ein Repository, steht eine Lücke da — kein Name wird erfunden.
  rmSync(STATION_UMSETZEN, { recursive: true, force: true });
  const ohneStation = get(gebaut, '/board/data');
  const flaecheOhne = ohneStation.workflows.find((w) => w.ich);
  const schrittOhne = flaecheOhne.workflows[0].schritte.find((s) => s.id === 'umsetzen');
  pruefe(schrittOhne && schrittOhne.fehlt === true, 'Die fehlende Station ist keine Lücke');
  pruefe(schrittOhne.name === '', 'Für die fehlende Station wurde ein Name erfunden');
  pruefe((ohneStation.luecken || []).some((l) => l.art === 'station'
    && String(l.repo).includes('station-umsetzen')),
  'Die Lücke der fehlenden Station wird nicht benannt');

  rmSync(VORHABEN, { recursive: true, force: true });
  const ohneVorhaben = get(gebaut, '/board/data');
  pruefe(ohneVorhaben.vorgaenge.length === 0,
    'Ein fehlendes Vorhaben-Repository erscheint trotzdem als Karte');
  pruefe((ohneVorhaben.luecken || []).some((l) => l.art === 'vorhaben'
    && String(l.repo).includes('vorhaben')),
  'Die Lücke des fehlenden Vorhabens wird nicht benannt');
  console.log('ok Lücken: fehlende Repositories stehen als Lücke da, ohne erfundene Namen');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* Schritt 18 läuft noch */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
