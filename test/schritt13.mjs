/**
 * Prüfung Schritt 13 — Zweig und Fork tragen ihre Herkunft.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bekommt weder
 * eine zweite Person noch einen Fork noch den Prüfzweig. Im copy legt das
 * Skript ein eigenes Vorhaben zum Abzweigen an und ein fremdes Vorhaben `von-p2`
 * einer zweiten Person mit `idee.md` und einem Lauf.
 *
 * Geprüft wird:
 *
 *   1. Abzweigen schreibt am neuen Vorhaben `zweig_von` mit Ursprung, Station
 *      und Datum; der Ursprung bleibt in Dateien, Station und Zeitstempel
 *      unverändert, der Zweig trägt seine Dateien;
 *   2. Forken legt auch für ein fremdes Vorhaben ein eigenes an: eigener
 *      Ordner mit den kopierten Dateien, `fork_von` auf den Ursprung, dessen
 *      Station und die eigene Person als Verantwortliche; die Läufe des
 *      Ursprungs kommen nicht mit; der fremde Ordner bleibt byte-gleich und
 *      wird nicht angefasst;
 *   3. `/board/data` nennt je Vorhaben die Herkunft samt Namen der Ursprünge;
 *   4. die Seite zeigt „Zweig von“ und „Fork von“ und macht die Herkunft nur
 *      bei sichtbarem Ursprung anklickbar (Quelltext, kein Browserbild);
 *   5. die zwei vorhandenen Zweige der echten Ablage bleiben unverändert.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt13-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const EIGENES = {
  id: 'eigenes-13',
  name: 'Eigenes Vorhaben für die Herkunft',
  position: 'umsetzung',
  verantwortliche: { umsetzung: ['p1'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const FREMDES = {
  id: 'von-p2',
  name: 'Fremdes Vorhaben von p2',
  position: 'idee',
  verantwortliche: { idee: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [{
    position: 'idee',
    skill: 'grillme-vision',
    datei: 'transkripte/vision-2026-10-20-101010.md',
    sitzung: 'session-fremd-13',
    datum: '2026-10-20',
  }],
  fork_von: null,
  zweig_von: null,
};

const VISION = [
  '# Vision',
  '',
  'Die Vision des eigenen Vorhabens bleibt beim Ursprung.',
  '',
].join('\n');

const BAUPPLAN = [
  '# Bauplan',
  '',
  'Der Bauplan geht als Datei in den Zweig mit.',
  '',
].join('\n');

const IDEE_FREMD = [
  '# Idee',
  '',
  'Die Idee der zweiten Person. Der Fork liest sie nur.',
  '',
].join('\n');

const TRANSKRIPT_FREMD = [
  '# Transkript',
  '',
  'Dieser Lauf gehört zum Ursprung und nicht zum Fork.',
  '',
].join('\n');

/** Die zwei Zweige, die in der echten Ablage schon liegen. */
const ECHTE_ZWEIGE = [
  'board-gesamtkonzept-idee-zu-produkt',
  'board-gesamtkonzept-vidionpruefen',
];

const ALT = new Date('2020-01-02T03:04:05Z');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function git(args) {
  const lauf = spawnSync('git', args, { encoding: 'utf8' });
  return {
    ok: lauf.status === 0,
    out: String(lauf.stdout || '').trim(),
    fehler: String(lauf.stderr || '').trim(),
  };
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

/**
 * Alle Dateien eines Ordners als Pfad → Inhalt. Zwei gleiche Karten heißen:
 * derselbe Baum, byte für byte, samt Namen.
 */
function baum(pfad) {
  const karte = new Map();
  const lauf = (ordner) => {
    let eintraege;
    try {
      eintraege = readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (e.name === '.git') continue;
      const ziel = join(ordner, e.name);
      if (e.isDirectory()) { lauf(ziel); continue; }
      karte.set(relative(pfad, ziel), readFileSync(ziel));
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
    pruefe(Buffer.compare(a.get(name), b.get(name)) === 0,
      was + ': ' + name + ' ist nicht byte-gleich');
  }
}

function mtime(pfad) {
  return statSync(pfad).mtimeMs;
}

function altMachen(pfade) {
  for (const pfad of pfade) utimesSync(pfad, ALT, ALT);
}

/** Ein minimaler ctx: Handler sammeln, Effekte ausführen, Dienste ersetzen. */
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

function alsJson(res, was) {
  pruefe(res.status === 200, was + ' antwortet ' + res.status + ': ' + res.text);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(was + ' liefert kein JSON: ' + res.text.slice(0, 200));
  }
}

let gebaut = null;

try {
  // 1. Nur Kopien: Ablage, Produkt und ein eigenes DSH_HOME. Die echte Ablage
  //    bleibt ohne zweite Person, ohne Fork und ohne den Prüfzweig.
  cpSync(ABLAGE, ablage, { recursive: true });
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  process.env.DSH_HOME = home;
  // Kein Remote: der Abgleich nach einer Fassung soll nicht ins Netz greifen.
  git(['-C', ablage, 'remote', 'remove', 'origin']);

  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-13')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');
  for (const name of ECHTE_ZWEIGE) {
    pruefe(existsSync(join(ABLAGE, 'vorgaenge', name, 'vorhaben.json')),
      'Der vorhandene Zweig ' + name + ' fehlt in der echten Ablage');
  }
  const echteZweigeVorher = new Map(ECHTE_ZWEIGE.map((name) => [
    name, baum(join(ABLAGE, 'vorgaenge', name)),
  ]));

  // 2. Die zweite Person, das fremde Vorhaben mit seinem Lauf und das eigene
  //    Vorhaben, von dem abgezweigt wird.
  schreibeJson(join(ablage, 'personen', 'p2.json'), {
    id: 'p2', name: 'Zweite Person', farbe: '#8b5cf6',
  });
  const fremdOrdner = join(ablage, 'vorgaenge', 'von-p2');
  mkdirSync(join(fremdOrdner, 'transkripte'), { recursive: true });
  schreibeJson(join(fremdOrdner, 'vorhaben.json'), FREMDES);
  writeFileSync(join(fremdOrdner, 'idee.md'), IDEE_FREMD, 'utf8');
  writeFileSync(join(fremdOrdner, 'transkripte', 'vision-2026-10-20-101010.md'),
    TRANSKRIPT_FREMD, 'utf8');

  const eigenOrdner = join(ablage, 'vorgaenge', 'eigenes-13');
  mkdirSync(eigenOrdner, { recursive: true });
  schreibeJson(join(eigenOrdner, 'vorhaben.json'), EIGENES);
  writeFileSync(join(eigenOrdner, 'vision.md'), VISION, 'utf8');
  writeFileSync(join(eigenOrdner, 'bauplan.md'), BAUPPLAN, 'utf8');

  // Die Prüfvorhaben als eigene Fassung, damit die Fassungen dieses Schritts
  // allein seine Änderungen tragen.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m',
    'Prüfung: Vorhaben in der Kopie']);
  pruefe(probeFassung.ok,
    'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);

  // Der fremde Ordner und seine Dateien werden alt gemacht: so lässt sich
  // zeigen, dass der Fork sie nicht einmal anfasst.
  altMachen([
    fremdOrdner,
    join(fremdOrdner, 'vorhaben.json'),
    join(fremdOrdner, 'idee.md'),
    join(fremdOrdner, 'transkripte'),
    join(fremdOrdner, 'transkripte', 'vision-2026-10-20-101010.md'),
    join(ablage, 'personen', 'p2.json'),
  ]);
  const fremdZeiten = new Map([
    ['vorhaben.json', mtime(join(fremdOrdner, 'vorhaben.json'))],
    ['idee.md', mtime(join(fremdOrdner, 'idee.md'))],
    ['transkripte/vision-2026-10-20-101010.md',
      mtime(join(fremdOrdner, 'transkripte', 'vision-2026-10-20-101010.md'))],
  ]);
  const fremdBaumVorher = baum(fremdOrdner);
  const eigenBaumVorher = baum(eigenOrdner);
  const eigenJsonVorher = readFileSync(join(eigenOrdner, 'vorhaben.json'));
  const eigenZeitenVorher = new Map([
    ['vorhaben.json', mtime(join(eigenOrdner, 'vorhaben.json'))],
    ['vision.md', mtime(join(eigenOrdner, 'vision.md'))],
    ['bauplan.md', mtime(join(eigenOrdner, 'bauplan.md'))],
  ]);
  const p2Zeit = mtime(join(ablage, 'personen', 'p2.json'));

  gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  function route(pfad) {
    const r = gebaut.routen.get(pfad);
    pruefe(r && typeof r.handler === 'function', 'Die Route ' + pfad + ' fehlt');
    return r;
  }

  function get(pfad) {
    const res = antwort();
    route(pfad.split('?')[0]).handler(anfrage(pfad), res);
    return res;
  }

  async function posting(pfad, koerper) {
    const res = antwort();
    await route(pfad).handler(anfrage(pfad, koerper), res);
    return res;
  }

  // 3. Vor dem Abzweigen: die vorhandenen Zweige tragen ihre Herkunft samt
  //    Namen, die Prüfvorhaben noch keine.
  const vorher = alsJson(get('/board/data'), '/board/data');
  const zweigPaar = vorher.vorgaenge.find(
    (v) => v.id === 'board-gesamtkonzept-idee-zu-produkt');
  const zweigVidion = vorher.vorgaenge.find(
    (v) => v.id === 'board-gesamtkonzept-vidionpruefen');
  pruefe(zweigPaar && zweigPaar.herkunft && zweigPaar.herkunft.zweig,
    'Der vorhandene Zweig trägt in /board/data keine Herkunft');
  pruefe(zweigPaar.herkunft.zweig.name === 'Board Gesamtkonzept',
    'Der vorhandene Zweig nennt „' + zweigPaar.herkunft.zweig.name
      + '“ statt Board Gesamtkonzept');
  pruefe(zweigPaar.herkunft.zweig.stationName === 'Idee',
    'Die Station des vorhandenen Zweigs heißt „'
      + zweigPaar.herkunft.zweig.stationName + '“ statt Idee');
  pruefe(zweigVidion.herkunft.zweig.name === 'Board Gesamtkonzept',
    'Der zweite vorhandene Zweig nennt den falschen Ursprung');
  console.log('ok vorhandene Zweige: Herkunft samt Namen und Station in /board/data');

  const eigenVor = vorher.vorgaenge.find((v) => v.id === 'eigenes-13');
  const fremdVor = vorher.vorgaenge.find((v) => v.id === 'von-p2');
  pruefe(eigenVor && fremdVor, 'Die Prüfvorhaben fehlen in /board/data');
  pruefe(eigenVor.herkunft && eigenVor.herkunft.zweig === null
    && eigenVor.herkunft.fork === null, 'Das eigene Prüfvorhaben trägt schon eine Herkunft');
  pruefe(fremdVor.herkunft && fremdVor.herkunft.zweig === null
    && fremdVor.herkunft.fork === null, 'Das fremde Prüfvorhaben trägt schon eine Herkunft');
  pruefe(fremdVor.verantwortet === 'Zweite Person',
    'Das fremde Prüfvorhaben verantwortet „' + fremdVor.verantwortet + '“');

  // 4. Abzweigen: der Zweig trägt `zweig_von`, der Ursprung bleibt byte-gleich.
  const zweigAntwort = alsJson(await posting('/board/vorhaben/abzweigen', {
    id: 'eigenes-13',
    station: 'umsetzung',
    ziel: 'umsetzen',
    name: 'Zweig für die Herkunft',
  }), '/board/vorhaben/abzweigen');
  const zweigId = String(zweigAntwort.neu || '');
  pruefe(!!zweigId, 'Das Abzweigen nennt keine neue Kennung');
  const zweigOrdner = join(ablage, 'vorgaenge', zweigId);
  pruefe(existsSync(join(zweigOrdner, 'vorhaben.json')),
    'Der Zweig hat keine vorhaben.json');
  const zweigJson = liesJson(join(zweigOrdner, 'vorhaben.json'));
  pruefe(zweigJson.zweig_von && typeof zweigJson.zweig_von === 'object',
    'Der Zweig trägt kein zweig_von: ' + JSON.stringify(zweigJson.zweig_von));
  pruefe(zweigJson.zweig_von.von === 'eigenes-13',
    'Der Zweig nennt „' + zweigJson.zweig_von.von + '“ statt eigenes-13');
  pruefe(zweigJson.zweig_von.station === 'umsetzung',
    'Der Zweig nennt die Station „' + zweigJson.zweig_von.station + '“ statt umsetzung');
  pruefe(/^\d{4}-\d{2}-\d{2}$/.test(String(zweigJson.zweig_von.datum || '')),
    'Der Zweig trägt kein Datum: ' + zweigJson.zweig_von.datum);
  pruefe(zweigJson.fork_von === null, 'Der Zweig trägt ein fork_von');
  pruefe(zweigJson.position === 'umsetzen',
    'Der Zweig steht an „' + zweigJson.position + '“ statt umsetzen');
  pruefe(JSON.stringify((zweigJson.verantwortliche || {}).umsetzen) === JSON.stringify(['p1']),
    'Der Zweig verantwortet nicht p1 an seiner Station');

  // Der Ursprung: Dateien, Station und Zeitstempel unverändert.
  pruefe(Buffer.compare(eigenJsonVorher, readFileSync(join(eigenOrdner, 'vorhaben.json'))) === 0,
    'Die vorhaben.json des Ursprungs wurde verändert');
  gleicherBaum(eigenBaumVorher, baum(eigenOrdner), 'Der Ursprung');
  for (const [name, zeit] of eigenZeitenVorher) {
    pruefe(mtime(join(eigenOrdner, name)) === zeit,
      'Der Ursprung wurde geschrieben: ' + name);
  }
  const eigenJetzt = liesJson(join(eigenOrdner, 'vorhaben.json'));
  pruefe(eigenJetzt.position === 'umsetzung',
    'Der Ursprung steht nach dem Abzweigen an „' + eigenJetzt.position + '“');

  // Der Zweig trägt die Dateien des Ursprungs.
  for (const name of ['vision.md', 'bauplan.md']) {
    pruefe(existsSync(join(zweigOrdner, name)),
      'Dem Zweig fehlt ' + name);
    pruefe(Buffer.compare(readFileSync(join(eigenOrdner, name)),
      readFileSync(join(zweigOrdner, name))) === 0,
    'Der Zweig trägt ' + name + ' nicht byte-gleich');
  }
  const zweigFassung = git(['-C', ablage, 'log', '-1', '--format=%an %s']).out;
  pruefe(/^Thomas Heinrich /.test(zweigFassung) && /Zweig/.test(zweigFassung),
    'Die Fassung des Zweigs heißt „' + zweigFassung + '“');
  console.log('ok Zweig: zweig_von mit Ursprung, Station, Datum; Ursprung byte-gleich, '
    + 'Dateien kopiert');

  // 5. /board/data nennt den Namen des Ursprungs, ohne dass die Seite ihn holt.
  const nachZweig = alsJson(get('/board/data'), '/board/data');
  const gezeigtZweig = nachZweig.vorgaenge.find((v) => v.id === zweigId);
  pruefe(gezeigtZweig && gezeigtZweig.herkunft && gezeigtZweig.herkunft.zweig,
    '/board/data trägt am Zweig keine Herkunft');
  pruefe(gezeigtZweig.herkunft.zweig.name === EIGENES.name,
    '/board/data nennt am Zweig „' + gezeigtZweig.herkunft.zweig.name
      + '“ statt ' + EIGENES.name);
  pruefe(gezeigtZweig.herkunft.zweig.sichtbar === true,
    'Der Ursprung des Zweigs gilt in /board/data als nicht sichtbar');
  pruefe(gezeigtZweig.herkunft.zweig.stationName
    === 'Architektur zu Bauplan',
  '/board/data nennt am Zweig die Station „'
    + gezeigtZweig.herkunft.zweig.stationName + '“');
  console.log('ok /board/data (Zweig): Name und Station des Ursprungs stehen am Vorhaben');

  // 6. Forken: das fremde Vorhaben wird als eigenes angelegt, der Ursprung
  //    bleibt unangetastet.
  const forkAntwort = alsJson(await posting('/board/vorhaben/forken', {
    id: 'von-p2',
  }), '/board/vorhaben/forken');
  const forkId = String(forkAntwort.neu || '');
  pruefe(!!forkId, 'Das Forken nennt keine neue Kennung');
  const forkOrdner = join(ablage, 'vorgaenge', forkId);
  pruefe(existsSync(join(forkOrdner, 'vorhaben.json')),
    'Der Fork hat keine vorhaben.json');
  const forkJson = liesJson(join(forkOrdner, 'vorhaben.json'));
  pruefe(forkJson.fork_von === 'von-p2',
    'Der Fork nennt „' + forkJson.fork_von + '“ statt von-p2');
  pruefe(forkJson.zweig_von === null, 'Der Fork trägt ein zweig_von');
  pruefe(forkJson.position === 'idee',
    'Der Fork steht an „' + forkJson.position + '“ statt idee');
  pruefe(JSON.stringify((forkJson.verantwortliche || {}).idee) === JSON.stringify(['p1']),
    'Der Fork verantwortet nicht p1 an der Station: ' + JSON.stringify(forkJson.verantwortliche));
  pruefe(Array.isArray(forkJson.laeufe) && forkJson.laeufe.length === 0,
    'Der Fork trägt die Läufe des Ursprungs: ' + JSON.stringify(forkJson.laeufe));
  pruefe(existsSync(join(forkOrdner, 'idee.md')),
    'Dem Fork fehlt idee.md');
  pruefe(Buffer.compare(readFileSync(join(fremdOrdner, 'idee.md')),
    readFileSync(join(forkOrdner, 'idee.md'))) === 0,
  'Der Fork trägt idee.md nicht byte-gleich');
  pruefe(!existsSync(join(forkOrdner, 'transkripte')),
    'Der Fork trägt die Transkripte des Ursprungs');

  // Der Ursprung des Forks: byte-gleich und nicht einmal angefasst.
  gleicherBaum(fremdBaumVorher, baum(fremdOrdner), 'Der fremde Ursprung');
  for (const [name, zeit] of fremdZeiten) {
    pruefe(mtime(join(fremdOrdner, name)) === zeit,
      'Die fremde Datei wurde geschrieben: ' + name);
  }
  pruefe(mtime(join(ablage, 'personen', 'p2.json')) === p2Zeit,
    'Die Personendatei von p2 wurde geschrieben');
  const fremdStatus = git(['-C', ablage, 'status', '--porcelain',
    '--', 'vorgaenge/von-p2', 'personen/p2.json']).out;
  pruefe(!fremdStatus, 'Git sieht Änderungen am fremden Ordner: ' + fremdStatus);
  const forkFassung = git(['-C', ablage, 'log', '-1', '--format=%an %s']).out;
  pruefe(/^Thomas Heinrich /.test(forkFassung) && /Fork/.test(forkFassung),
    'Die Fassung des Forks heißt „' + forkFassung + '“');
  console.log('ok Fork: eigenes Vorhaben mit fork_von, eigener Person, kopierten Dateien; '
    + 'Läufe bleiben beim Ursprung');

  // 7. /board/data nennt auch beim Fork den Namen des Ursprungs.
  const nachFork = alsJson(get('/board/data'), '/board/data');
  const gezeigtFork = nachFork.vorgaenge.find((v) => v.id === forkId);
  pruefe(gezeigtFork && gezeigtFork.herkunft && gezeigtFork.herkunft.fork,
    '/board/data trägt am Fork keine Herkunft');
  pruefe(gezeigtFork.herkunft.fork.name === FREMDES.name,
    '/board/data nennt am Fork „' + gezeigtFork.herkunft.fork.name
      + '“ statt ' + FREMDES.name);
  pruefe(gezeigtFork.herkunft.fork.sichtbar === true,
    'Der Ursprung des Forks gilt in /board/data als nicht sichtbar');
  pruefe(gezeigtFork.fork_von === 'von-p2',
    '/board/data verliert am Fork das fork_von');
  console.log('ok /board/data (Fork): Name des fremden Ursprungs steht am Fork');

  // 8. Die Seite: „Zweig von“ und „Fork von“, die Herkunft nur bei sichtbarem
  //    Ursprung anklickbar; ein Forken an jedem Vorhaben.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes("'Zweig von '"),
    'Die Seite zeigt „Zweig von“ nicht');
  pruefe(client.includes("'Fork von '"),
    'Die Seite zeigt „Fork von“ nicht');
  pruefe(client.includes("' ab '"),
    'Die Seite nennt die Station des Zweigs nicht');
  pruefe(client.includes('zweigHerkunft.sichtbar')
    && client.includes('forkHerkunft.sichtbar'),
  'Die Seite macht die Herkunft nicht vom sichtbaren Ursprung abhängig');
  pruefe(client.includes('herkunftOeffnen'),
    'Die Seite hat keinen Weg zum Ursprung');
  pruefe(client.includes("'/board/vorhaben/forken'"),
    'Die Seite spricht nicht mit /board/vorhaben/forken');
  pruefe(client.includes('function forken'),
    'Die Seite hat keine Fork-Handlung');
  pruefe(client.includes("'Forken'"),
    'Die Seite bietet „Forken“ nicht an');
  console.log('ok Seite: „Zweig von“ und „Fork von“, Herkunft anklickbar, Forken an '
    + 'jedem Vorhaben');

  // 9. Die echte Ablage bleibt ohne p2, ohne Fork und ohne den Prüfzweig; die
  //    zwei vorhandenen Zweige sind unverändert.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-13')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  for (const name of ECHTE_ZWEIGE) {
    gleicherBaum(echteZweigeVorher.get(name), baum(join(ABLAGE, 'vorgaenge', name)),
      'Der vorhandene Zweig ' + name);
  }
  console.log('ok echte Ablage unberührt: kein Fork, keine zweite Person, '
    + 'die zwei Zweige unverändert');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
