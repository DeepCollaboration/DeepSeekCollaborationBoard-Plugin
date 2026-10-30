/**
 * Prüfung Schritt 18 — die vier Formate lesen.
 *
 * Legt unter /tmp/board-scheibe1 fünf lokale Repositories an: die Stationen
 * „Idee“ und „Umsetzen“, den Workflow, das Vorhaben „Board Gesamtkonzept“ und
 * das Testboard. Gelesen wird ohne Git und ohne Remote.
 *
 * Geprüft wird:
 *
 *   1. repos.js erkennt jede Art an ihrer Ankerdatei und listet die Dateien.
 *   2. Die Station „Umsetzen“ trägt Host p1, Eingang bauplan.md, Ausgang
 *      produkt/ und umsetzung.md und die Aktion skill.
 *   3. Der Workflow verweist auf beide Stationen und trägt die Positionen
 *      „idee“ (50/80) und „umsetzen“ (2960/380).
 *   4. Das Vorhaben steht an „idee“ und verweist auf den Workflow.
 *   5. Das Board ist ein Team-Board mit Person p1, Workflow, Vorhaben und
 *      beiden Stationsverweisen.
 *   6. Eine fehlende Formatdatei ist ein Fehler.
 *   7. Die Prüfablage ist danach wieder entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { erkenneRepo, liesRepo } from '../repos.js';
import { liesStation } from '../formate/station.js';
import { liesWorkflow } from '../formate/workflow.js';
import { liesVorhaben } from '../formate/vorhaben.js';
import { liesBoard } from '../formate/board.js';

// Ein eigener Ordner unter der gemeinsamen Prüffläche: Schritt 18 und 19
// laufen im selben `node --test` nebeneinander und dürfen sich nicht die
// Ablage wegziehen.
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt18');
const VORLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const STATION_IDEE = join(ABLAGE, 'station-idee');
const STATION_UMSETZEN = join(ABLAGE, 'station-umsetzen');
const WORKFLOW = join(ABLAGE, 'workflow');
const VORHABEN = join(ABLAGE, 'vorhaben');
const BOARD = join(ABLAGE, 'board');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function erwarteFehler(fn, teil) {
  let fehler = null;
  try {
    fn();
  } catch (e) {
    fehler = e;
  }
  pruefe(fehler, 'Erwartet: ein Fehler, der „' + teil + '“ nennt');
  pruefe(String(fehler.message).includes(teil),
    'Der Fehler nennt „' + teil + '“ nicht: ' + fehler.message);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function schreibeText(pfad, text) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, text, 'utf8');
}

function anlegen(idee) {
  // Die Station „Idee“: der Text ist die Aktion, kein Eingang, kein Ausgang.
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

  // Die Station „Umsetzen“: ein Skill mit fester Aktionsdatei.
  schreibeJson(join(STATION_UMSETZEN, 'station.json'), {
    format: 2,
    id: 'umsetzen',
    name: 'Umsetzen',
    beschreibung: 'Setzt den Bauplan um: ein Schritt je Runde, ein Arbeiter je Schritt, ein frischer Prüfer je Schritt.',
    host: 'p1',
    eingang: ['bauplan.md'],
    ausgabe: ['produkt/', 'umsetzung.md'],
    aktion: {
      art: 'skill',
      datei: 'SKILL.md',
      wert: 'p1-umsetzen',
    },
    beispiele: [],
    reife: 'erprobt',
    lizenz: 'MIT',
    tags: ['umsetzen', 'bau'],
  });
  schreibeText(join(STATION_UMSETZEN, 'SKILL.md'), '# Umsetzen\n');
  schreibeText(join(STATION_UMSETZEN, 'README.md'), '# Umsetzen\n');
  schreibeText(join(STATION_UMSETZEN, 'CHANGELOG.md'), '# Änderungen\n');

  // Der Workflow: zwei Verweise, zwei Positionen, eine Kante.
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
  schreibeText(join(WORKFLOW, 'README.md'), '# Standard-Workflow\n');

  // Das Vorhaben: an „idee“, mit dem Workflow als feste Fassung.
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

  // Das Testboard: ein Team-Board mit allen drei Verweisarten.
  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'testboard',
    name: 'Testboard',
    art: 'team',
    personen: [
      { login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' },
    ],
    workflows: [{ repo: WORKFLOW, fassung: 'v1' }],
    vorhaben: [{ repo: VORHABEN }],
    stationen: [{ repo: STATION_IDEE }, { repo: STATION_UMSETZEN }],
    einstellungen: {},
    layout: {},
  });
  schreibeText(join(BOARD, 'README.md'), '# Testboard\n');
}

rmSync(ABLAGE, { recursive: true, force: true });
const idee = readFileSync(join(VORLAGE, 'vorgaenge', 'board-gesamtkonzept', 'idee.md'), 'utf8');

let bestanden = false;

try {
  anlegen(idee);

  // 1. repos.js: Art und Dateien, ohne Git.
  const anker = {
    station: 'station.json',
    workflow: 'workflow.json',
    vorhaben: 'vorhaben.json',
    board: 'board.json',
  };
  const orte = [
    [STATION_IDEE, 'station'],
    [STATION_UMSETZEN, 'station'],
    [WORKFLOW, 'workflow'],
    [VORHABEN, 'vorhaben'],
    [BOARD, 'board'],
  ];
  for (const [pfad, art] of orte) {
    const repo = liesRepo(pfad);
    pruefe(repo.pfad === pfad, 'Der Pfad ist nicht ' + pfad + ': ' + repo.pfad);
    pruefe(repo.art === art, pfad + ' ist nicht als ' + art + ' erkannt');
    pruefe(repo.dateien.includes(anker[art]), 'Die Ankerdatei fehlt in den Dateien: ' + pfad);
  }
  const umsetzenRepo = liesRepo(STATION_UMSETZEN);
  pruefe(umsetzenRepo.dateien.includes('SKILL.md'), 'SKILL.md fehlt in den Dateien');
  pruefe(umsetzenRepo.dateien.includes('README.md'), 'README.md fehlt in den Dateien');
  pruefe(erkenneRepo(join(ABLAGE, 'gibt-es-nicht')) === null,
    'Ein fehlender Ordner gilt als Repository');
  erwarteFehler(() => liesRepo(join(ABLAGE, 'gibt-es-nicht')), 'Kein Repository');
  console.log('ok Repositories: fünf Ordner, vier Formate, ihre Dateien gelesen');

  // 2. Die Station „Umsetzen“.
  const umsetzen = liesStation(STATION_UMSETZEN);
  pruefe(umsetzen.format === 2, 'Die Station hat nicht Format 2');
  pruefe(umsetzen.id === 'umsetzen', 'Die Kennung ist nicht umsetzen');
  pruefe(umsetzen.name === 'Umsetzen', 'Der Name ist nicht Umsetzen');
  pruefe(umsetzen.host === 'p1', 'Der Host ist nicht p1');
  pruefe(umsetzen.eingang.length === 1 && umsetzen.eingang[0] === 'bauplan.md',
    'Der Eingang ist nicht bauplan.md');
  pruefe(umsetzen.ausgabe.length === 2
    && umsetzen.ausgabe[0] === 'produkt/'
    && umsetzen.ausgabe[1] === 'umsetzung.md',
  'Der Ausgang ist nicht produkt/ und umsetzung.md');
  pruefe(umsetzen.aktion.art === 'skill', 'Die Aktion ist nicht skill');
  pruefe(umsetzen.aktion.datei === 'SKILL.md', 'Die Aktionsdatei ist nicht SKILL.md');
  pruefe(umsetzen.reife === 'erprobt', 'Die Reife ist nicht erprobt');
  pruefe(umsetzen.lizenz === 'MIT', 'Die Lizenz ist nicht MIT');
  pruefe(umsetzen.tags.includes('umsetzen'), 'Der Tag umsetzen fehlt');
  pruefe(Array.isArray(umsetzen.beispiele), 'Die Beispiele sind keine Liste');

  const ideeStation = liesStation(STATION_IDEE);
  pruefe(ideeStation.id === 'idee' && ideeStation.name === 'Idee',
    'Die Station Idee ist nicht gelesen');
  pruefe(ideeStation.aktion.art === 'textfeld', 'Die Aktion der Idee ist nicht textfeld');
  pruefe(typeof ideeStation.aktion.wert === 'string' && ideeStation.aktion.wert.length > 0,
    'Der Text der Idee fehlt');
  console.log('ok Station: Umsetzen mit bauplan.md, produkt/, umsetzung.md und skill gelesen');

  // 3. Der Workflow.
  const workflow = liesWorkflow(WORKFLOW);
  pruefe(workflow.format === 2, 'Der Workflow hat nicht Format 2');
  pruefe(workflow.stationen.length === 2, 'Der Workflow hat nicht zwei Verweise');
  const verweise = workflow.stationen.map((s) => s.repo);
  pruefe(verweise.includes(STATION_IDEE) && verweise.includes(STATION_UMSETZEN),
    'Die Stationsverweise sind nicht die beiden Stationen');
  pruefe(workflow.stationen.every((s) => s.fassung === 'v1'),
    'Die Stationsverweise tragen nicht die Fassung v1');
  const positionen = new Map(workflow.positionen.map((p) => [p.id, p]));
  pruefe(positionen.size === 2, 'Der Workflow hat nicht zwei Positionen');
  const anIdee = positionen.get('idee');
  const anUmsetzen = positionen.get('umsetzen');
  pruefe(anIdee && anIdee.station === 'idee' && anIdee.x === 50 && anIdee.y === 80,
    'Die Position idee steht nicht auf 50/80');
  pruefe(anUmsetzen && anUmsetzen.station === 'umsetzen'
    && anUmsetzen.x === 2960 && anUmsetzen.y === 380,
  'Die Position umsetzen steht nicht auf 2960/380');
  pruefe(workflow.kanten.length === 1
    && workflow.kanten[0].von === 'idee'
    && workflow.kanten[0].nach === 'umsetzen',
  'Die Kante von idee nach umsetzen fehlt');
  pruefe(workflow.layout === 'auto', 'Das Layout ist nicht auto');
  console.log('ok Workflow: zwei Verweise, Positionen 50/80 und 2960/380 gelesen');

  // 4. Das Vorhaben.
  const vorhaben = liesVorhaben(VORHABEN);
  pruefe(vorhaben.format === 2, 'Das Vorhaben hat nicht Format 2');
  pruefe(vorhaben.id === 'board-gesamtkonzept', 'Die Kennung ist nicht board-gesamtkonzept');
  pruefe(vorhaben.position === 'idee', 'Das Vorhaben steht nicht an idee');
  pruefe(vorhaben.workflow.repo === WORKFLOW, 'Der Workflow-Verweis ist nicht der Workflow');
  pruefe(vorhaben.workflow.fassung === 'v1', 'Der Workflow-Verweis trägt nicht v1');
  pruefe(vorhaben.verantwortliche.idee.includes('p1'), 'p1 ist nicht verantwortlich');
  pruefe(Array.isArray(vorhaben.laeufe), 'Die Läufe sind keine Liste');
  console.log('ok Vorhaben: an idee, mit Workflow v1 und p1 als Verantwortlichem');

  // 5. Das Board.
  const board = liesBoard(BOARD);
  pruefe(board.format === 2, 'Das Board hat nicht Format 2');
  pruefe(board.id === 'testboard', 'Die Kennung ist nicht testboard');
  pruefe(board.art === 'team', 'Die Art ist nicht team');
  pruefe(board.personen.length === 1, 'Das Board hat nicht eine Person');
  pruefe(board.personen[0].login === 'p1', 'Die Person ist nicht p1');
  pruefe(board.personen[0].name === 'Thomas Heinrich', 'Der Name ist nicht Thomas Heinrich');
  pruefe(board.personen[0].farbe === '#fbbf24', 'Die Farbe ist nicht #fbbf24');
  pruefe(board.workflows.length === 1
    && board.workflows[0].repo === WORKFLOW
    && board.workflows[0].fassung === 'v1',
  'Der Workflow-Verweis des Boards stimmt nicht');
  pruefe(board.vorhaben.length === 1 && board.vorhaben[0].repo === VORHABEN,
    'Der Vorhaben-Verweis des Boards stimmt nicht');
  pruefe(board.stationen.length === 2, 'Das Board hat nicht zwei Stationsverweise');
  const boardStationen = board.stationen.map((s) => s.repo);
  pruefe(boardStationen.includes(STATION_IDEE) && boardStationen.includes(STATION_UMSETZEN),
    'Die Stationsverweise des Boards sind nicht die beiden Stationen');
  pruefe(liesRepo(board.workflows[0].repo).art === 'workflow',
    'Der Workflow-Verweis des Boards führt nicht zu einem Workflow');
  console.log('ok Board: team, Person p1, Workflow, Vorhaben und zwei Stationen');

  // 6. Eine fehlende Formatdatei ist ein Fehler.
  erwarteFehler(() => liesStation(WORKFLOW), 'station.json');
  erwarteFehler(() => liesWorkflow(BOARD), 'workflow.json');
  erwarteFehler(() => liesVorhaben(STATION_IDEE), 'vorhaben.json');
  erwarteFehler(() => liesBoard(VORHABEN), 'board.json');
  console.log('ok Fehlende Datei: jedes Format nennt seine fehlende Datei');

  bestanden = true;
} finally {
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Die Prüfablage wurde nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* Schritt 19 läuft noch */ }
console.log('ok Prüfablage aufgeräumt: ' + ABLAGE);
