/**
 * Prüfung Schritt 33b — die nackten Verweise des Hauptboards kommen mit.
 *
 * Unter `/tmp/board-scheibe1/schritt33b` entstehen eine Station, ein Workflow,
 * ein Vorhaben und das Hauptboard der Fassung 2. Das Hauptboard nennt seine
 * Verweise als nackte Namen (`station-idee`, `workflow-standard`,
 * `vorhaben-probeprojekt`); jedes Repository liegt als lokales Bare-Repository
 * unter `.../remotes/DeepCollaboration/`. `DSH_BOARD_HAUPTBOARD` und
 * `DSH_BOARD_REMOTE_BASIS` zeigen dorthin, das Home ist frisch, der Server
 * läuft in-process.
 *
 * Geprüft wird:
 *
 *   1. Das Hauptboard wird geholt und steht als einziges Board im Register.
 *   2. Seine Verweise landen im Zwischenspeicher: `workflow-standard`,
 *      `station-idee` und das Vorhaben; die Station kommt über den Workflow,
 *      das Vorhaben bringt seinen Workflow mit.
 *   3. `/board/data` zeigt die Station „Idee“ und den Schritt im Workflow.
 *   4. Fehlt der Stations-Remote, bleibt `/board/data` 200 und die Lücke nennt
 *      das Repository; `/board/boards` bleibt ebenfalls bedienbar.
 *   5. Wird der Remote nachgelegt, holt „Wiederholen“ die Station nach.
 *   6. Das echte `$DSH_HOME` bleibt unangetastet.
 *
 * Kein echter GitHub-Aufruf; Ablage und Home werden danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt33b');
const KOPIE = join(ABLAGE, 'produkt');
const FLAECHE = join(ABLAGE, 'flaeche');
const BOARD = join(FLAECHE, 'board-hauptboard');
const STATION = join(FLAECHE, 'station-idee');
const WORKFLOW = join(FLAECHE, 'workflow-standard');
const VORHABEN = join(FLAECHE, 'vorhaben-probeprojekt');
const REMOTES = join(ABLAGE, 'remotes');
const ORGANISATION = 'DeepCollaboration';
const REMOTE_BOARD = join(REMOTES, ORGANISATION, 'board-hauptboard.git');
const REMOTE_STATION = join(REMOTES, ORGANISATION, 'station-idee.git');
const REMOTE_WORKFLOW = join(REMOTES, ORGANISATION, 'workflow-standard.git');
const REMOTE_VORHABEN = join(REMOTES, ORGANISATION, 'vorhaben-probeprojekt.git');
const HOME = join(ABLAGE, 'home');
const HOME2 = join(ABLAGE, 'home2');
const CACHE = join(HOME, 'board', 'cache', ORGANISATION);
const CACHE2 = join(HOME2, 'board', 'cache', ORGANISATION);
const ZIEL_BOARD = join(CACHE, 'board-hauptboard');
const ZIEL_BOARD2 = join(CACHE2, 'board-hauptboard');
const ECHT_HOME = process.env.DSH_HOME || '';

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

/**
 * Station, Workflow, Vorhaben und Board. Die Verweise sind nackte Namen —
 * so, wie sie in der Organisation heißen.
 */
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
  festschreiben(STATION, 'station-idee');

  schreibeJson(join(WORKFLOW, 'workflow.json'), {
    format: 2,
    id: 'standard',
    titel: 'Standard-Workflow',
    beschreibung: 'Vom Thema zum Produkt.',
    autor: 'p1',
    stationen: [{ repo: 'station-idee', fassung: 'v1', id: 'idee' }],
    positionen: [{ id: 'idee', station: 'idee', x: 50, y: 80, bedingung: [] }],
    kanten: [],
    layout: 'auto',
    regeln: {},
  });
  festschreiben(WORKFLOW, 'workflow-standard');

  schreibeJson(join(VORHABEN, 'vorhaben.json'), {
    format: 2,
    id: 'probeprojekt',
    name: 'Probeprojekt',
    workflow: { repo: 'workflow-standard', fassung: 'v1' },
    position: 'idee',
    verantwortliche: { idee: ['p1'] },
    laeufe: [],
    farbe: '#8b5cf6',
  });
  writeFileSync(join(VORHABEN, 'README.md'), '# Probeprojekt\n', 'utf8');
  festschreiben(VORHABEN, 'vorhaben-probeprojekt');

  schreibeJson(join(BOARD, 'board.json'), {
    format: 2,
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: [{ login: 'p1', name: 'Thomas Heinrich', farbe: '#fbbf24' }],
    workflows: [{ repo: 'workflow-standard', fassung: 'v1' }],
    vorhaben: [{ repo: 'vorhaben-probeprojekt' }],
    stationen: [{ repo: 'station-idee' }],
    einstellungen: {},
    layout: {},
  });
  writeFileSync(join(BOARD, 'README.md'), '# Hauptboard\n', 'utf8');
  festschreiben(BOARD, 'board-hauptboard');

  for (const [quelle, ziel] of [
    [BOARD, REMOTE_BOARD],
    [STATION, REMOTE_STATION],
    [WORKFLOW, REMOTE_WORKFLOW],
    [VORHABEN, REMOTE_VORHABEN],
  ]) {
    mkdirSync(dirname(ziel), { recursive: true });
    git(FLAECHE, ['clone', '--bare', '--quiet', quelle, ziel]);
  }
}

/** Ein Fingerabdruck eines Ordners: Pfad → Größe und Änderungszeit. */
function baum(pfad) {
  const karte = new Map();
  const lauf = (ordner) => {
    let eintraege;
    try {
      eintraege = readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const eintrag of eintraege) {
      const ziel = join(ordner, eintrag.name);
      if (eintrag.isDirectory()) { lauf(ziel); continue; }
      try {
        const stand = statSync(ziel);
        karte.set(relative(pfad, ziel), stand.size + ':' + stand.mtimeMs);
      } catch {
        karte.set(relative(pfad, ziel), 'nicht lesbar');
      }
    }
  };
  lauf(pfad);
  return karte;
}

function gleicherBaum(a, b, was) {
  const namenA = [...a.keys()].sort();
  const namenB = [...b.keys()].sort();
  pruefe(JSON.stringify(namenA) === JSON.stringify(namenB),
    was + ': andere Dateien — ' + JSON.stringify(namenA) + ' statt '
      + JSON.stringify(namenB));
  for (const name of namenA) {
    pruefe(a.get(name) === b.get(name),
      was + ': ' + name + ' hat sich geändert — ' + a.get(name) + ' statt ' + b.get(name));
  }
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

async function starten(home, kennzeichen) {
  process.env.DSH_HOME = home;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(KOPIE, 'index.js')).href
    + '?fall=' + kennzeichen);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);
  return gebaut;
}

/* --- Die Prüfung --------------------------------------------------------- */

let gebaut = null;
let gebaut2 = null;
let bestanden = false;
let echtVorher = null;

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
  // Das Vorhaben heißt „vorhaben-…“ und gilt nach seinem Namen als privat;
  // für die Prüffläche ist es öffentlich. Ohne diese Karte meldete die
  // Komposition zu Recht eine Sichtbarkeitslücke.
  for (const [zuhause, ort] of [[HOME, CACHE], [HOME2, CACHE2]]) {
    schreibeJson(join(zuhause, 'board', 'sichtbarkeit.json'), {
      [join(ort, 'vorhaben-probeprojekt')]: 'öffentlich',
    });
  }

  // Der echte Home-Stand vor dem Lauf: er darf sich nicht ändern.
  if (ECHT_HOME) echtVorher = baum(join(ECHT_HOME, 'board'));

  process.env.DSH_GITHUB_ORG = ORGANISATION;
  process.env.DSH_BOARD_HAUPTBOARD = 'file://' + REMOTE_BOARD;
  process.env.DSH_BOARD_REMOTE_BASIS = 'file://' + REMOTES;

  // 1. Frisches Home: das Hauptboard und seine nackten Verweise kommen.
  gebaut = await starten(HOME, 'a');
  const register = liesJson(join(HOME, 'board', 'boards.json'));
  pruefe(register.aktiv === 'hauptboard', 'Das Hauptboard ist nicht offen: '
    + JSON.stringify(register.aktiv));
  pruefe(register.boards.length === 1 && register.boards[0].id === 'hauptboard',
    'Das Hauptboard steht nicht allein im Register: ' + JSON.stringify(register.boards));
  const eintrag = register.boards[0];
  pruefe(eintrag.repo === ZIEL_BOARD, 'Der Eintrag zeigt nicht in den Zwischenspeicher: '
    + eintrag.repo);
  pruefe(!eintrag.fehler, 'Das geholte Hauptboard trägt einen Fehler: ' + eintrag.fehler);
  pruefe(existsSync(join(ZIEL_BOARD, 'board.json')), 'Das Hauptboard wurde nicht geklont');
  console.log('ok Hauptboard: geholt und allein im Register');

  for (const [name, datei] of [
    ['workflow-standard', 'workflow.json'],
    ['station-idee', 'station.json'],
    ['vorhaben-probeprojekt', 'vorhaben.json'],
  ]) {
    pruefe(existsSync(join(CACHE, name, datei)),
      'Im Zwischenspeicher fehlt „' + name + '“ samt ' + datei);
  }
  console.log('ok Zwischenspeicher: workflow-standard, station-idee und '
    + 'vorhaben-probeprojekt liegen unter ' + CACHE);

  const daten = await ruf(gebaut, '/board/data');
  pruefe(daten.status === 200, 'GET /board/data antwortet ' + daten.status
    + ': ' + daten.text);
  const stationen = daten.daten.stationen || [];
  pruefe(stationen.some((s) => s.id === 'idee' && s.name === 'Idee'),
    'Die Station „Idee“ fehlt im Board: ' + JSON.stringify(stationen));
  const flaeche = (daten.daten.workflows || [])[0];
  const schritte = flaeche && flaeche.workflows && flaeche.workflows[0]
    ? flaeche.workflows[0].schritte : [];
  pruefe(schritte.some((s) => s.id === 'idee' && s.name === 'Idee'),
    'Der Schritt „Idee“ fehlt im Workflow: ' + JSON.stringify(schritte));
  const vorgaenge = daten.daten.vorgaenge || [];
  pruefe(vorgaenge.some((v) => v.id === 'probeprojekt' && v.name === 'Probeprojekt'),
    'Das Vorhaben „Probeprojekt“ fehlt im Board: ' + JSON.stringify(vorgaenge));
  pruefe(Array.isArray(daten.daten.luecken) && daten.daten.luecken.length === 0,
    'Das vollständige Board trägt Lücken: ' + JSON.stringify(daten.daten.luecken));
  console.log('ok Board: Station „Idee“, der Schritt und das Vorhaben stehen im Bild');

  const liste = await ruf(gebaut, '/board/boards');
  pruefe(liste.status === 200, 'GET /board/boards antwortet ' + liste.status
    + ': ' + liste.text);
  const haupt = liste.daten.boards.find((b) => b.id === 'hauptboard');
  pruefe(haupt && haupt.hauptboard === true && haupt.aktiv === true,
    'Die Liste zeigt das Hauptboard nicht als offen und fest: '
      + JSON.stringify(liste.daten.boards));

  // 2. Ohne den Stations-Remote: die Lücke bleibt, das Board bleibt bedienbar.
  rmSync(REMOTE_STATION, { recursive: true, force: true });
  gebaut2 = await starten(HOME2, 'b');
  const register2 = liesJson(join(HOME2, 'board', 'boards.json'));
  pruefe(register2.aktiv === 'hauptboard' && !register2.boards[0].fehler,
    'Der zweite Erststart holt das Hauptboard nicht: ' + JSON.stringify(register2.boards));
  pruefe(existsSync(join(ZIEL_BOARD2, 'board.json')), 'Das Hauptboard wurde nicht geholt');
  pruefe(existsSync(join(CACHE2, 'workflow-standard', 'workflow.json')),
    'Der Workflow wurde ohne die Station nicht geholt');
  pruefe(!existsSync(join(CACHE2, 'station-idee')),
    'Die Station wurde ohne ihren Remote trotzdem geholt');

  const daten2 = await ruf(gebaut2, '/board/data');
  pruefe(daten2.status === 200, 'GET /board/data bleibt ohne Station nicht 200: '
    + daten2.status + ': ' + daten2.text);
  const luecken = daten2.daten.luecken || [];
  pruefe(luecken.some((l) => l.art === 'station'
    && String(l.repo).includes('station-idee')),
  'Die Lücke der fehlenden Station nennt das Repository nicht: '
    + JSON.stringify(luecken));
  const schrittFehlt = ((daten2.daten.workflows || [])[0]?.workflows?.[0]?.schritte || [])
    .find((s) => s.id === 'idee');
  pruefe(schrittFehlt && schrittFehlt.fehlt === true,
    'Der Schritt ohne Station ist keine Lücke: ' + JSON.stringify(schrittFehlt));
  const liste2 = await ruf(gebaut2, '/board/boards');
  pruefe(liste2.status === 200, 'GET /board/boards bleibt ohne Station nicht 200: '
    + liste2.status + ': ' + liste2.text);
  console.log('ok fehlender Remote: /board/data und /board/boards bleiben 200, '
    + 'die Lücke nennt station-idee');

  // 3. Remote nachgelegt: „Wiederholen“ holt die Station nach.
  mkdirSync(dirname(REMOTE_STATION), { recursive: true });
  git(FLAECHE, ['clone', '--bare', '--quiet', STATION, REMOTE_STATION]);
  const wieder = await ruf(gebaut2, '/board/hauptboard/holen', {});
  pruefe(wieder.status === 200, 'POST /board/hauptboard/holen antwortet '
    + wieder.status + ': ' + wieder.text);
  pruefe(!wieder.daten.fehler, 'Wiederholen meldet einen Fehler: ' + wieder.text);
  pruefe(Array.isArray(wieder.daten.verweise?.geholt)
    && wieder.daten.verweise.geholt.includes('station-idee'),
  'Wiederholen holt die Station nicht nach: ' + wieder.text);
  pruefe(existsSync(join(CACHE2, 'station-idee', 'station.json')),
    'Die Station liegt nach dem Wiederholen nicht im Zwischenspeicher');
  const datenNach = await ruf(gebaut2, '/board/data');
  pruefe(datenNach.status === 200
    && (datenNach.daten.stationen || []).some((s) => s.id === 'idee'),
  'Nach dem Wiederholen fehlt die Station „Idee“: '
    + JSON.stringify(datenNach.daten.stationen));
  pruefe(!(datenNach.daten.luecken || []).some((l) => l.art === 'station'),
    'Nach dem Wiederholen steht die Stationslücke noch da: '
      + JSON.stringify(datenNach.daten.luecken));
  console.log('ok Wiederholen: die Station wird nachgeholt, die Lücke verschwindet');

  // 4. Das echte Home bleibt, wie es war.
  if (ECHT_HOME) {
    const echtNachher = baum(join(ECHT_HOME, 'board'));
    gleicherBaum(echtVorher, echtNachher, 'Das echte $DSH_HOME');
    console.log('ok echtes $DSH_HOME: ' + join(ECHT_HOME, 'board') + ' unberührt');
  } else {
    console.log('ok echtes $DSH_HOME: keines gesetzt');
  }

  bestanden = true;
} finally {
  for (const b of [gebaut, gebaut2]) {
    if (b) b.aufraeumen.forEach((ende) => ende());
  }
  delete process.env.DSH_BOARD_HAUPTBOARD;
  delete process.env.DSH_BOARD_REMOTE_BASIS;
  delete process.env.DSH_GITHUB_ORG;
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
console.log('ok Verweise: Hauptboard, Station und Workflow im Zwischenspeicher; '
  + 'Station „Idee“ im Board; fehlender Remote als Lücke');
