/**
 * Prüfung Schritt 12 — entschieden wird nicht mehr in der alten Ablage.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bekommt weder
 * eine zweite Person noch einen Beitrag. Im copy legt das Skript ein eigenes
 * Vorhaben mit `vision.md`, `a.md` und `b.md` an, dazu ein fremdes Vorhaben
 * einer zweiten Person. Das Modul läuft als `p1`.
 *
 * Geprüft wird:
 *
 *   1. `/board/beitrag` und `/board/beitrag/entscheiden` antworten 404; es
 *      entsteht kein `beitraege/`-Ordner und keine Fassung;
 *   2. ein alter Beitrag in der Ablage bleibt über `/board/data` lesbar —
 *      Kennung, Notiz, Dateinamen und `entschieden`;
 *   3. der alte Entscheid antwortet 404 und lässt Beitrag und vorgeschlagene
 *      Fassung byte-gleich;
 *   4. die Seite entscheidet nicht mehr im Board und führt zum Pull Request
 *      über `/board/github/beitrag` (Quelltext, kein Browserbild);
 *   5. `darf.entscheiden` gilt am eigenen Vorhaben, nicht am fremden;
 *   6. nur die eigene Personendatei wird geschrieben und nur sie lässt sich
 *      über `/board/person/aendern` ändern.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt12-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const EIGENES = {
  id: 'eigenes-12',
  name: 'Eigenes Vorhaben für den Entscheid',
  position: 'umsetzen',
  verantwortliche: { umsetzen: ['p1'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const FREMDES = {
  id: 'fremd-12',
  name: 'Fremdes Vorhaben für den Entscheid',
  position: 'umsetzen',
  verantwortliche: { umsetzen: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const VISION_ALT = [
  '# Vision',
  '',
  'Die alte Fassung der Vision.',
  '',
].join('\n');

const VISION_NEU = [
  '# Vision',
  '',
  'Die neue Fassung der Vision, vorgeschlagen von Thomas Heinrich.',
  'Der zweite Satz trägt den Vorschlag.',
  '',
].join('\n');

const A_ALT = [
  '# A',
  '',
  'Die alte Fassung von a.md.',
  '',
].join('\n');

const A_NEU = [
  '# A',
  '',
  'Die vorgeschlagene Fassung von a.md.',
  '',
].join('\n');

const A_TEIL = [
  '# A',
  '',
  'Nur a.md aus dem Teil-Beitrag nach der Basisprüfung.',
  '',
].join('\n');

const B_ALT = [
  '# B',
  '',
  'Die alte Fassung von b.md bleibt.',
  '',
].join('\n');

const B_NEU = [
  '# B',
  '',
  'Diese Fassung von b.md soll nicht übernommen werden.',
  '',
].join('\n');

const VISION_ABGELEHNT = [
  '# Vision',
  '',
  'Diese Fassung wird abgelehnt und darf nirgends landen.',
  '',
].join('\n');

const FREMD_NEU = [
  '# Vision',
  '',
  'Diese Fassung gehört zur zweiten Person und wird nicht entschieden.',
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
  //    bleibt ohne zweite Person, ohne Beitrag und ohne diese Vorhaben.
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
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-12')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'fremd-12')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');

  // Die fremde Personendatei trägt ein Feld, das nur ihr gehört. Ein Speichern
  // der eigenen Person darf es nicht wegschreiben.
  schreibeJson(join(ablage, 'personen', 'p2.json'), {
    id: 'p2', name: 'Zweite Person', farbe: '#8b5cf6', notiz: 'gehört p2',
  });
  const p2Vorher = readFileSync(join(ablage, 'personen', 'p2.json'));
  const eigenOrdner = join(ablage, 'vorgaenge', 'eigenes-12');
  mkdirSync(eigenOrdner, { recursive: true });
  schreibeJson(join(eigenOrdner, 'vorhaben.json'), EIGENES);
  writeFileSync(join(eigenOrdner, 'vision.md'), VISION_ALT, 'utf8');
  writeFileSync(join(eigenOrdner, 'a.md'), A_ALT, 'utf8');
  writeFileSync(join(eigenOrdner, 'b.md'), B_ALT, 'utf8');

  const fremdOrdner = join(ablage, 'vorgaenge', 'fremd-12');
  mkdirSync(fremdOrdner, { recursive: true });
  schreibeJson(join(fremdOrdner, 'vorhaben.json'), FREMDES);
  writeFileSync(join(fremdOrdner, 'vision.md'), VISION_ALT, 'utf8');

  // Die Prüfvorhaben als eigene Fassung, damit die Entscheid-Fassungen allein
  // die Änderungen dieses Schritts tragen.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m',
    'Prüfung: Vorhaben in der Kopie']);
  pruefe(probeFassung.ok,
    'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);
  const kopfProbe = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  pruefe(/^[0-9a-f]{40}$/.test(kopfProbe), 'Keine Basis-Fassung in der Kopie');

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
    const r = gebaut.routen.get(pfad);
    if (!r) {
      res.status = 404;
      res.text = JSON.stringify({ error: 'Nicht gefunden' });
      return res;
    }
    await r.handler(anfrage(pfad, koerper), res);
    return res;
  }

  async function beitragAnlegen(vorhaben, schritt, notiz, dateien) {
    return alsJson(await posting('/board/beitrag', {
      vorhaben, schritt, notiz, dateien,
    }), '/board/beitrag').beitrag;
  }

  // 2. Eigene und fremde Zuständigkeit: `entscheiden` steht in `darf`, gilt
  //    aber nur für das eigene Vorhaben.
  const vorher = alsJson(get('/board/data'), '/board/data');
  const eigen = (vorher.vorgaenge || []).find((v) => v.id === 'eigenes-12');
  const fremd = (vorher.vorgaenge || []).find((v) => v.id === 'fremd-12');
  pruefe(!!eigen && !!fremd, 'Die Prüfvorhaben fehlen in /board/data');
  pruefe(eigen.darf && eigen.darf.entscheiden === true,
    'darf.entscheiden fehlt am eigenen Vorhaben: ' + JSON.stringify(eigen.darf));
  pruefe(fremd.darf && fremd.darf.entscheiden === false,
    'darf.entscheiden ist am fremden Vorhaben wahr: ' + JSON.stringify(fremd.darf));
  console.log('ok Zuständigkeit: darf.entscheiden beim eigenen Vorhaben wahr, '
    + 'beim fremden falsch');

  const versionenVorher = alsJson(get('/board/versionen?vorhaben=eigenes-12'
    + '&datei=vision.md'), '/board/versionen').versionen;
  pruefe(versionenVorher.length === 1,
    'Der Ausgangsverlauf hat ' + versionenVorher.length + ' Fassungen statt 1');

  // 3. Die alten Beitragswege sind entfernt: 404 und nichts geschrieben.
  const kopfVorAlt = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const resNeu = await posting('/board/beitrag', {
    vorhaben: 'eigenes-12',
    schritt: 'umsetzen',
    notiz: 'Ein neuer lokaler Vorschlag.',
    dateien: [{ name: 'vision.md', text: VISION_NEU }],
  });
  pruefe(resNeu.status === 404, 'POST /board/beitrag antwortet '
    + resNeu.status + ' statt 404: ' + resNeu.text);
  const resEntscheid = await posting('/board/beitrag/entscheiden', {
    beitrag: 'irgendwas', art: 'annehmen',
  });
  pruefe(resEntscheid.status === 404,
    'POST /board/beitrag/entscheiden antwortet ' + resEntscheid.status
      + ' statt 404: ' + resEntscheid.text);
  pruefe(!existsSync(join(ablage, 'beitraege')),
    'Der alte Weg hat einen beitraege/-Ordner angelegt');
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorAlt,
    'Der alte Weg hat eine Fassung angelegt');
  console.log('ok alte Wege: 404, kein beitraege/-Ordner, keine Fassung');

  // 4. Ein alter Beitrag bleibt lesbar; entschieden wird er nicht mehr im
  //    Board. Der Beitrag und seine Fassung bleiben byte-gleich.
  const altId = 'alt-1';
  const altOrdner = join(ablage, 'beitraege', 'eigenes-12', altId);
  mkdirSync(altOrdner, { recursive: true });
  schreibeJson(join(ablage, 'beitraege', 'eigenes-12', altId + '.json'), {
    id: altId,
    vorhaben: 'eigenes-12',
    schritt: 'umsetzen',
    von: 'Thomas Heinrich',
    seit: '2026-01-02T03:04:05.000Z',
    basis: null,
    notiz: 'Dieser alte Vorschlag bleibt lesbar.',
    dateien: [{
      name: 'vision.md',
      datei: 'beitraege/eigenes-12/' + altId + '/vision.md',
    }],
    entschieden: null,
  });
  writeFileSync(join(altOrdner, 'vision.md'), VISION_NEU, 'utf8');

  const datenAlt = alsJson(get('/board/data'), '/board/data');
  pruefe(datenAlt.beitraege.length === 1,
    '/board/data zeigt ' + datenAlt.beitraege.length + ' alte Beiträge statt 1');
  const gezeigtAlt = datenAlt.beitraege[0];
  pruefe(gezeigtAlt.id === altId
    && gezeigtAlt.notiz === 'Dieser alte Vorschlag bleibt lesbar.',
  'Der alte Beitrag steht nicht mit Notiz in /board/data: '
    + JSON.stringify(gezeigtAlt));
  pruefe(JSON.stringify(gezeigtAlt.dateien) === JSON.stringify(['vision.md']),
    'Die vorgeschlagene Fassung fehlt in /board/data');
  pruefe(gezeigtAlt.entschieden === null,
    'Der alte Beitrag gilt in /board/data als entschieden');

  const altJson = readFileSync(join(ablage, 'beitraege', 'eigenes-12',
    altId + '.json'));
  const altVision = readFileSync(join(altOrdner, 'vision.md'));
  const kopfVorAltEntscheid = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const resAltEntscheid = await posting('/board/beitrag/entscheiden', {
    beitrag: altId, art: 'annehmen',
  });
  pruefe(resAltEntscheid.status === 404, 'Der alte Entscheid antwortet '
    + resAltEntscheid.status + ' statt 404: ' + resAltEntscheid.text);
  pruefe(Buffer.compare(altJson, readFileSync(join(ablage, 'beitraege',
    'eigenes-12', altId + '.json'))) === 0,
  'Der alte Entscheid hat den Beitrag geändert');
  pruefe(Buffer.compare(altVision, readFileSync(join(altOrdner, 'vision.md'))) === 0,
    'Der alte Entscheid hat die vorgeschlagene Fassung geändert');
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorAltEntscheid,
    'Der alte Entscheid hat eine Fassung angelegt');
  console.log('ok alte Daten: /board/data nennt Beitrag, Notiz und Fassung; '
    + 'kein Entscheid im Board');

  // 11. Nur die eigene Person: die fremde Personendatei bleibt unberührt, und
  //     /board/person/aendern weist eine fremde Kennung mit 403 ab.
  const p2Pfad = join(ablage, 'personen', 'p2.json');
  const resFremdPerson = await posting('/board/person/aendern', {
    id: 'p2', name: 'Übernommen',
  });
  pruefe(resFremdPerson.status === 403,
    'person/aendern auf p2 antwortet ' + resFremdPerson.status
      + ' statt 403: ' + resFremdPerson.text);
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'Die fremde Personendatei hat sich beim abgelehnten Ändern geändert');
  const resEigenPerson = await posting('/board/person/aendern', {
    id: 'p1', name: 'Thomas Heinrich',
  });
  pruefe(resEigenPerson.status === 200,
    'person/aendern auf die eigene Person antwortet ' + resEigenPerson.status
      + ': ' + resEigenPerson.text);
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'Ein Speichern der eigenen Person hat personen/p2.json überschrieben');
  console.log('ok eigene Person: p2 bleibt byte-gleich, fremde Kennung 403');

  // 12. Die Seite entscheidet nicht mehr im Board; sie führt zum Pull Request.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(!client.includes("poste('/board/beitrag/entscheiden'"),
    'Die Seite ruft noch /board/beitrag/entscheiden auf');
  pruefe(!client.includes("'/board/beitrag'"),
    'Die Seite ruft noch den alten Weg /board/beitrag auf');
  pruefe(client.includes("fetch('/board/github/beitrag'"),
    'Die Seite spricht nicht mit /board/github/beitrag');
  pruefe(client.includes('entschieden.teile'),
    'Die Seite zeigt die übernommenen Teile nicht');
  pruefe(client.includes('Angenommen') && client.includes('Abgelehnt'),
    'Die Seite zeigt den alten Entscheid nicht an');
  console.log('ok Seite: Entscheid nur noch lesbar, Beitrag als Pull Request');

  // 11. Die echte Ablage bleibt ohne p2, ohne Prüfvorhaben und ohne Beitrag.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-12')),
    'Das eigene Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'fremd-12')),
    'Das fremde Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'beitraege')),
    'Ein Beitragsordner liegt in der echten Ablage');
  console.log('ok echte Ablage unberührt: kein Beitrag, keine zweite Person');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
