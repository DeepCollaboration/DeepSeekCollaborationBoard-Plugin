/**
 * Prüfung Schritt 14 — der Rücksprung steht am Vorhaben.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bekommt
 * keinen Rücksprung und keine zweite Person; beides lebt nur in der Kopie.
 *
 * Geprüft wird:
 *
 *   1. Zurückschicken an eine frühere Station mit Grund: das Vorhaben steht
 *      dort, `rueckkehr` trägt `{ von, nach, grund, seit, erledigt: false }`,
 *      die Verantwortung an der Zielstation bleibt beim bisherigen
 *      Verantwortlichen; `/board/data` nennt Ziel und Grund samt Zielnamen;
 *   2. ohne Grund → 400, ohne vorhandene Zielstation → 400, nichts geändert;
 *   3. ein fremdes Vorhaben zurückschicken → 403, nichts geändert;
 *   4. Weiterziehen über die Zielstation hinaus → `erledigt: true` in der
 *      Datei, der Eintrag bleibt; die offene Anzeige ist leer;
 *   5. die Seite zeigt nur die offenen Rücksprünge mit Ziel und Grund;
 *   6. die echte Ablage bleibt ohne Prüfvorhaben und ohne Rücksprung.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt14-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const GRUND = 'Der Punkt aus der Vision ist noch offen.';

/** Ein eigenes Vorhaben an einer späteren Station: `umsetzung` → `vision`. */
const EIGENES = {
  id: 'eigenes-14',
  name: 'Eigenes Vorhaben für den Rücksprung',
  position: 'umsetzung',
  verantwortliche: { umsetzung: ['p1'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

/** Ein fremdes Vorhaben an einer Station im Workflow von p2. */
const FREMDES = {
  id: 'von-p2',
  name: 'Fremdes Vorhaben von p2',
  position: 'pruefen',
  verantwortliche: { pruefen: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const P2_WORKFLOW = {
  person: 'p2',
  workflows: [{
    id: 'standard',
    titel: 'Workflow der zweiten Person',
    schritte: [
      {
        id: 'pruefen',
        name: 'Prüfen',
        host: 'p2',
        eingang: ['idee.md'],
        ausgabe: ['pruefung.md'],
        wie: { art: 'textfeld', wert: '' },
        skill: null,
      },
      {
        id: 'freigeben',
        name: 'Freigeben',
        host: 'p2',
        eingang: ['pruefung.md'],
        ausgabe: ['freigabe.md'],
        wie: { art: 'skill', wert: 'freigeben' },
        skill: 'freigeben',
      },
    ],
    positionen: [
      { id: 'pruefen', schritt: 'pruefen', x: 60, y: 80 },
      { id: 'freigeben', schritt: 'freigeben', x: 360, y: 80 },
    ],
    kanten: [{ von: 'pruefen', nach: 'freigeben' }],
    layout: 'auto',
  }],
};

const BAUPPLAN = [
  '# Bauplan',
  '',
  'Die Datei bleibt beim Zurückschicken liegen.',
  '',
].join('\n');

const IDEE_FREMD = [
  '# Idee',
  '',
  'Die Idee der zweiten Person. Der fremde Ordner wird nicht angefasst.',
  '',
].join('\n');

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

/** Alle Dateien eines Ordners als Pfad → Inhalt, `.git` ausgenommen. */
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

/** Der Name einer Station aus dem Workflow der eigenen Person. */
function stationsName(positionId) {
  const datei = liesJson(join(ablage, 'workflows', 'p1.json'));
  for (const workflow of datei.workflows || []) {
    const position = (workflow.positionen || []).find((p) => p.id === positionId);
    if (!position) continue;
    const schritt = (workflow.schritte || []).find((s) => s.id === position.schritt);
    return schritt && schritt.name ? String(schritt.name) : positionId;
  }
  return positionId;
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
  // 1. Nur Kopien: Ablage, Produkt und ein eigenes DSH_HOME.
  cpSync(ABLAGE, ablage, { recursive: true });
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  process.env.DSH_HOME = home;
  // Kein Remote: die Fassungen nach den Handlungen sollen nicht ins Netz.
  git(['-C', ablage, 'remote', 'remove', 'origin']);

  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-14')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');

  // 2. Die zweite Person samt fremdem Vorhaben und das eigene Vorhaben an
  //    einer späteren Station — nur in der Kopie.
  schreibeJson(join(ablage, 'personen', 'p2.json'), {
    id: 'p2', name: 'Zweite Person', farbe: '#8b5cf6',
  });
  schreibeJson(join(ablage, 'workflows', 'p2.json'), P2_WORKFLOW);

  const fremdOrdner = join(ablage, 'vorgaenge', 'von-p2');
  mkdirSync(fremdOrdner, { recursive: true });
  schreibeJson(join(fremdOrdner, 'vorhaben.json'), FREMDES);
  writeFileSync(join(fremdOrdner, 'idee.md'), IDEE_FREMD, 'utf8');

  const eigenOrdner = join(ablage, 'vorgaenge', 'eigenes-14');
  mkdirSync(eigenOrdner, { recursive: true });
  schreibeJson(join(eigenOrdner, 'vorhaben.json'), EIGENES);
  writeFileSync(join(eigenOrdner, 'bauplan.md'), BAUPPLAN, 'utf8');

  // Die Prüfvorhaben als eigene Fassung, damit die Fassungen dieses Schritts
  // nur seine Änderungen tragen.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m',
    'Prüfung: Vorhaben in der Kopie']);
  pruefe(probeFassung.ok,
    'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);

  const eigenPfad = join(eigenOrdner, 'vorhaben.json');
  const fremdPfad = join(fremdOrdner, 'vorhaben.json');
  const fremdBaumVorher = baum(fremdOrdner);
  const fremdJsonVorher = readFileSync(fremdPfad);
  const fremdZeitVorher = mtime(fremdPfad);
  const p2ZeitVorher = mtime(join(ablage, 'personen', 'p2.json'));

  const ZIEL_NAME = stationsName('vision');
  const QUELL_NAME = stationsName('umsetzung');
  pruefe(ZIEL_NAME !== 'vision' && QUELL_NAME !== 'umsetzung',
    'Die Stationsnamen der eigenen Fläche fehlen: ' + ZIEL_NAME + ', ' + QUELL_NAME);

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
    route(pfad).handler(anfrage(pfad), res);
    return res;
  }

  async function posting(pfad, koerper) {
    const res = antwort();
    await route(pfad).handler(anfrage(pfad, koerper), res);
    return res;
  }

  // 3. Vor dem Zurückschicken: keine Rücksprünge, das eigene Vorhaben darf es.
  const vorher = alsJson(get('/board/data'), '/board/data');
  const eigenVor = vorher.vorgaenge.find((v) => v.id === 'eigenes-14');
  const fremdVor = vorher.vorgaenge.find((v) => v.id === 'von-p2');
  pruefe(eigenVor && fremdVor, 'Die Prüfvorhaben fehlen in /board/data');
  pruefe(eigenVor.position === 'umsetzung',
    'Das eigene Vorhaben steht an ' + eigenVor.position + ' statt an umsetzung');
  pruefe(Array.isArray(eigenVor.rueckkehr) && eigenVor.rueckkehr.length === 0,
    'Das eigene Vorhaben trägt schon einen Rücksprung');
  pruefe(eigenVor.darf.zurueckschicken === true,
    'Die eigene Person darf das Vorhaben nicht zurückschicken');
  pruefe(fremdVor.darf.zurueckschicken === false,
    'Die eigene Person darf das fremde Vorhaben zurückschicken');

  // 4. Zurückschicken mit Grund: das Vorhaben steht am Ziel, der Vermerk offen.
  const zurueckAntwort = alsJson(await posting('/board/vorhaben/zurueckschicken', {
    id: 'eigenes-14',
    nach: 'vision',
    grund: GRUND,
  }), '/board/vorhaben/zurueckschicken');
  const eigenAntwort = zurueckAntwort.vorgaenge.find((v) => v.id === 'eigenes-14');
  pruefe(eigenAntwort && eigenAntwort.rueckkehr.length === 1,
    'Die Antwort des Zurückschickens trägt keinen Rücksprung');
  pruefe(eigenAntwort.rueckkehr[0].nachName === ZIEL_NAME,
    'Die Antwort nennt als Ziel „' + eigenAntwort.rueckkehr[0].nachName
      + '“ statt „' + ZIEL_NAME + '“');

  const eigenDatei = liesJson(eigenPfad);
  pruefe(eigenDatei.position === 'vision',
    'Das Vorhaben steht nach dem Zurückschicken an „' + eigenDatei.position
      + '“ statt an vision');
  pruefe(Array.isArray(eigenDatei.rueckkehr) && eigenDatei.rueckkehr.length === 1,
    'Die Datei trägt nicht genau einen Rücksprung: '
      + JSON.stringify(eigenDatei.rueckkehr));
  const eintrag = eigenDatei.rueckkehr[0];
  pruefe(eintrag.von === 'umsetzung',
    'Der Rücksprung kommt von „' + eintrag.von + '“ statt von umsetzung');
  pruefe(eintrag.nach === 'vision',
    'Der Rücksprung geht nach „' + eintrag.nach + '“ statt nach vision');
  pruefe(eintrag.grund === GRUND,
    'Der Grund steht als „' + eintrag.grund + '“ in der Datei');
  pruefe(/^\d{4}-\d{2}-\d{2}$/.test(String(eintrag.seit || '')),
    'Der Rücksprung trägt kein Datum: ' + JSON.stringify(eintrag.seit));
  pruefe(eintrag.erledigt === false,
    'Der neue Rücksprung ist schon erledigt: ' + JSON.stringify(eintrag.erledigt));
  pruefe(JSON.stringify(eigenDatei.verantwortliche.vision) === JSON.stringify(['p1']),
    'Die Verantwortung an der Zielstation ist '
      + JSON.stringify(eigenDatei.verantwortliche.vision) + ' statt ["p1"]');
  pruefe(JSON.stringify(eigenDatei.verantwortliche.umsetzung) === JSON.stringify(['p1']),
    'Der Eintrag der verlassenen Station ging verloren: '
      + JSON.stringify(eigenDatei.verantwortliche.umsetzung));

  const nachZurueck = alsJson(get('/board/data'), '/board/data');
  const eigenJetzt = nachZurueck.vorgaenge.find((v) => v.id === 'eigenes-14');
  pruefe(eigenJetzt.position === 'vision',
    '/board/data zeigt das Vorhaben an „' + eigenJetzt.position + '“ statt an vision');
  const offenerEintrag = (eigenJetzt.rueckkehr || []).find((r) => r.nach === 'vision');
  pruefe(!!offenerEintrag, '/board/data trägt den Rücksprung nicht');
  pruefe(offenerEintrag.grund === GRUND,
    '/board/data verliert den Grund: ' + JSON.stringify(offenerEintrag.grund));
  pruefe(offenerEintrag.nachName === ZIEL_NAME,
    '/board/data nennt das Ziel „' + offenerEintrag.nachName + '“ statt „'
      + ZIEL_NAME + '“');
  pruefe(offenerEintrag.vonName === QUELL_NAME,
    '/board/data nennt die Herkunft „' + offenerEintrag.vonName + '“ statt „'
      + QUELL_NAME + '“');
  pruefe(offenerEintrag.erledigt === false,
    '/board/data markiert den Rücksprung als erledigt');
  pruefe(eigenJetzt.rueckkehr.filter((r) => !r.erledigt).length === 1,
    'Die offene Anzeige enthält nicht genau einen Rücksprung');
  const fassung = git(['-C', ablage, 'log', '-1', '--format=%an %s']).out;
  pruefe(/^Thomas Heinrich /.test(fassung) && /zurückgeschickt/.test(fassung),
    'Die Fassung des Rücksprungs heißt „' + fassung + '“');
  console.log('ok Rücksprung: Vorhaben an „' + ZIEL_NAME + '“, Vermerk mit von, nach, '
    + 'Grund, seit, erledigt false; Verantwortung bleibt bei p1');

  // 5. Ohne Grund und ohne vorhandene Zielstation: 400, nichts geändert.
  const eigenBytesVorFehler = readFileSync(eigenPfad);
  const eigenZeitVorFehler = mtime(eigenPfad);
  for (const [was, koerper] of [
    ['ohne Grund', { id: 'eigenes-14', nach: 'idee' }],
    ['mit leerem Grund', { id: 'eigenes-14', nach: 'idee', grund: '   ' }],
    ['ohne Zielstation', { id: 'eigenes-14', nach: 'gibt-es-nicht', grund: GRUND }],
  ]) {
    const res = await posting('/board/vorhaben/zurueckschicken', koerper);
    pruefe(res.status === 400,
      'Zurückschicken ' + was + ' antwortet ' + res.status + ' statt 400: ' + res.text);
    pruefe(Buffer.compare(eigenBytesVorFehler, readFileSync(eigenPfad)) === 0,
      'Zurückschicken ' + was + ' hat die Datei geändert');
    pruefe(mtime(eigenPfad) === eigenZeitVorFehler,
      'Zurückschicken ' + was + ' hat die Datei geschrieben');
  }
  console.log('ok 400: ohne Grund, mit leerem Grund und ohne vorhandene Zielstation — '
    + 'die Datei bleibt unverändert');

  // 6. Ein fremdes Vorhaben zurückschicken: 403, nichts geändert.
  const fremdRes = await posting('/board/vorhaben/zurueckschicken', {
    id: 'von-p2',
    nach: 'idee',
    grund: GRUND,
  });
  pruefe(fremdRes.status === 403,
    'Zurückschicken des fremden Vorhabens antwortet ' + fremdRes.status
      + ' statt 403: ' + fremdRes.text);
  pruefe(Buffer.compare(fremdJsonVorher, readFileSync(fremdPfad)) === 0,
    'Die fremde vorhaben.json hat sich geändert');
  pruefe(mtime(fremdPfad) === fremdZeitVorher,
    'Die fremde vorhaben.json wurde geschrieben');
  gleicherBaum(fremdBaumVorher, baum(fremdOrdner), 'Der fremde Ordner');
  pruefe(mtime(join(ablage, 'personen', 'p2.json')) === p2ZeitVorher,
    'Die Personendatei von p2 wurde geschrieben');
  const fremdStatus = git(['-C', ablage, 'status', '--porcelain',
    '--', 'vorgaenge/von-p2', 'personen/p2.json']).out;
  pruefe(!fremdStatus, 'Git sieht Änderungen am fremden Ordner: ' + fremdStatus);
  console.log('ok 403: fremdes Vorhaben — keine Änderung an Datei, Ordner oder Person');

  // 7. Weiterziehen über die Zielstation hinaus: erledigt, aber nicht gelöscht.
  const weiterRes = await posting('/board/vorhaben/verschieben', {
    id: 'eigenes-14',
    position: 'umsetzen',
  });
  pruefe(weiterRes.status === 200,
    'Weiterziehen antwortet ' + weiterRes.status + ': ' + weiterRes.text);
  const eigenDanach = liesJson(eigenPfad);
  pruefe(eigenDanach.position === 'umsetzen',
    'Das Vorhaben steht an „' + eigenDanach.position + '“ statt an umsetzen');
  pruefe(Array.isArray(eigenDanach.rueckkehr) && eigenDanach.rueckkehr.length === 1,
    'Der erledigte Rücksprung ist aus der Datei verschwunden: '
      + JSON.stringify(eigenDanach.rueckkehr));
  const erledigt = eigenDanach.rueckkehr[0];
  pruefe(erledigt.erledigt === true,
    'Der Rücksprung ist nach dem Weiterziehen nicht erledigt: '
      + JSON.stringify(erledigt.erledigt));
  pruefe(erledigt.von === 'umsetzung' && erledigt.nach === 'vision'
    && erledigt.grund === GRUND,
  'Der erledigte Rücksprung verliert seine Felder: ' + JSON.stringify(erledigt));

  const nachWeiter = alsJson(get('/board/data'), '/board/data');
  const eigenWeiter = nachWeiter.vorgaenge.find((v) => v.id === 'eigenes-14');
  pruefe(eigenWeiter.rueckkehr.length === 1,
    '/board/data verliert den erledigten Rücksprung');
  pruefe(eigenWeiter.rueckkehr[0].erledigt === true,
    '/board/data zeigt den erledigten Rücksprung als offen');
  pruefe(eigenWeiter.rueckkehr[0].nachName === ZIEL_NAME,
    '/board/data verliert den Zielnamen des erledigten Rücksprungs');
  pruefe(eigenWeiter.rueckkehr.filter((r) => !r.erledigt).length === 0,
    'Die offene Anzeige enthält noch einen erledigten Rücksprung');
  console.log('ok erledigt: Weiterziehen über „' + ZIEL_NAME + '“ setzt erledigt true; '
    + 'der Eintrag bleibt in der Datei, die offene Anzeige ist leer');

  // 8. Die Seite: nur offene Rücksprünge, mit Ziel und Grund.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes('rueckkehr'),
    'Die Seite liest die Rücksprünge nicht');
  pruefe(client.includes('!r.erledigt'),
    'Die Seite filtert die offenen Rücksprünge nicht über erledigt');
  pruefe(client.includes('r.nachName'),
    'Die Seite zeigt den Zielnamen des Rücksprungs nicht');
  pruefe(client.includes('r.grund'),
    'Die Seite zeigt den Grund des Rücksprungs nicht');
  pruefe(client.includes("'↩ zurück nach „'"),
    'Die Seite zeigt den Rücksprung nicht mit Ziel am Vorhaben');
  console.log('ok Seite: nur offene Rücksprünge, Ziel und Grund am Vorhaben');

  // 9. Die echte Ablage bleibt ohne Prüfvorhaben und ohne Rücksprung.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-14')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  const echtes = liesJson(join(ABLAGE, 'vorgaenge', 'board-gesamtkonzept', 'vorhaben.json'));
  pruefe(Array.isArray(echtes.rueckkehr) && echtes.rueckkehr.length === 0,
    'Die echte Ablage trägt einen Rücksprung: ' + JSON.stringify(echtes.rueckkehr));
  pruefe(echtes.position === 'umsetzen',
    'Das echte Vorhaben steht an „' + echtes.position + '“ statt an umsetzen');
  console.log('ok echte Ablage unberührt: kein Rücksprung, keine zweite Person, '
    + 'kein Prüfvorhaben');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
