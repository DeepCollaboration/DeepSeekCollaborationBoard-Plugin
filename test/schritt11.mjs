/**
 * Prüfung Schritt 11 — am fremden Vorhaben führt der Beitrag über GitHub.
 *
 * Kopiert die Ablage und das Produkt nach /tmp und legt `p2` samt einem fremden
 * Vorhaben mit `vision.md` erst in der Kopie an. Die echte Ablage bekommt weder
 * eine zweite Person noch einen Beitrag.
 *
 * Geprüft wird:
 *
 *   1. das fremde Vorhaben ist sichtbar, `darf.aendern` bleibt für die eigene
 *      Person falsch;
 *   2. der alte Weg (`POST`/`GET /board/beitrag`,
 *      `/board/beitrag/entscheiden`) antwortet 404; es entsteht kein
 *      `beitraege/`-Ordner und keine Fassung;
 *   3. das Original und die fremde `vorhaben.json` bleiben byte-gleich;
 *   4. `/board/data` behält seine Form und die lesbare Beitragsliste;
 *   5. der Leser bietet „Bearbeiten“ auch für ein fremdes Vorhaben und
 *      speichert dort über „Als Beitrag speichern“ mit „Notiz zum Beitrag“
 *      als Pull Request über `/board/github/beitrag` (Quelltext, kein
 *      Browserbild).
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt11-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const P2_PERSON = {
  id: 'p2',
  name: 'Zweite Person',
  farbe: '#8b5cf6',
};

// Der fremde Schritt liegt im Workflow von p2. Seine Kennung `pruefen` gibt es
// im eigenen Workflow nicht, also ist die Station eindeutig.
const P2_WORKFLOW = {
  person: 'p2',
  workflows: [{
    id: 'standard',
    titel: 'Workflow der zweiten Person',
    schritte: [{
      id: 'pruefen',
      name: 'Prüfen',
      host: 'p2',
      eingang: ['idee.md'],
      ausgabe: ['vision.md'],
      wie: { art: 'textfeld', wert: '' },
      skill: null,
    }],
    positionen: [{ id: 'pruefen', schritt: 'pruefen', x: 60, y: 80 }],
    kanten: [],
    layout: 'auto',
  }],
};

const FREMDES = {
  id: 'von-p2',
  name: 'Von der zweiten Person',
  position: 'pruefen',
  verantwortliche: { pruefen: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const VISION_ORIGINAL = [
  '# Vision',
  '',
  'Die Vision der zweiten Person. Sie bleibt, wie sie ist.',
  '',
].join('\n');

const VISION_NEU = [
  '# Vision',
  '',
  'Die Vision der zweiten Person, geschärft von Thomas Heinrich.',
  'Der erste Satz bleibt; der zweite nennt das Ziel genauer.',
  '',
].join('\n');

const NOTIZ = 'Bitte den zweiten Absatz so übernehmen — er trifft das Ziel genauer.';

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

function beitragsDateien() {
  const ordner = join(ablage, 'beitraege', 'von-p2');
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).filter((n) => n.endsWith('.json')).sort();
}

let gebaut = null;

try {
  // 1. Nur Kopien: Ablage, Produkt und ein eigenes DSH_HOME. Die echte Ablage
  //    bleibt ohne zweite Person und ohne Beitrag.
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
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Vorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'beitraege', 'von-p2')),
    'In der echten Ablage liegt ein Beitrag zu p2');

  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  schreibeJson(join(ablage, 'workflows', 'p2.json'), P2_WORKFLOW);
  const fremdOrdner = join(ablage, 'vorgaenge', 'von-p2');
  mkdirSync(fremdOrdner, { recursive: true });
  schreibeJson(join(fremdOrdner, 'vorhaben.json'), FREMDES);
  writeFileSync(join(fremdOrdner, 'vision.md'), VISION_ORIGINAL, 'utf8');

  // Die p2-Dateien als eigene Fassung, damit die Beitrags-Fassung allein die
  // Änderung dieses Schritts trägt.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m', 'Prüfung: p2 in der Kopie']);
  pruefe(probeFassung.ok, 'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);
  const basisVorher = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  pruefe(/^[0-9a-f]{40}$/.test(basisVorher), 'Keine Basis-Fassung in der Kopie');

  const visionVorher = readFileSync(join(fremdOrdner, 'vision.md'));
  const vorhabenVorher = readFileSync(join(fremdOrdner, 'vorhaben.json'));

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
    const r = gebaut.routen.get(pfad.split('?')[0]);
    if (!r) {
      res.status = 404;
      res.text = JSON.stringify({ error: 'Nicht gefunden' });
      return res;
    }
    r.handler(anfrage(pfad), res);
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

  // 2. Das fremde Vorhaben steht am Board, aber die eigene Person darf es nicht
  //    ändern. Genau darum geht es: der Beitrag hängt nicht an `darf.aendern`.
  const datenVorher = alsJson(get('/board/data'), '/board/data');
  pruefe(Object.keys(datenVorher).sort().join(',')
    === 'aktiv,beitraege,boards,einstellungen,format,formatAblage,hauptboard,identitaet,'
      + 'person,personen,repo,stand,vorgaenge,workflows',
  'Die Form von /board/data ist nicht { person, repo, format, formatAblage, workflows, '
    + 'vorgaenge, beitraege, personen, einstellungen, stand, identitaet, boards }: '
    + Object.keys(datenVorher).sort().join(', '));
  pruefe(Array.isArray(datenVorher.beitraege) && datenVorher.beitraege.length === 0,
    'Vor dem Beitrag stehen schon welche in /board/data');
  const fremd = (datenVorher.vorgaenge || []).find((v) => v.id === 'von-p2');
  pruefe(!!fremd, 'Das fremde Vorhaben fehlt in /board/data');
  pruefe(fremd.verantwortet === 'Zweite Person',
    'Das fremde Vorhaben verantwortet „' + fremd.verantwortet + '“');
  pruefe(fremd.darf && fremd.darf.aendern === false,
    'Die eigene Person darf das fremde Vorhaben ändern');
  console.log('ok fremdes Vorhaben: verantwortet von „Zweite Person“, darf.aendern falsch');

  // 3. Der alte Weg ist entfernt: 404, kein Beitrag, keine Fassung.
  const kopfVorAlt = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const baumVorAlt = git(['-C', ablage, 'status', '--porcelain']).out;
  const resBeitrag = await posting('/board/beitrag', {
    vorhaben: 'von-p2',
    schritt: 'pruefen',
    notiz: NOTIZ,
    dateien: [{ name: 'vision.md', text: VISION_NEU }],
  });
  pruefe(resBeitrag.status === 404, 'POST /board/beitrag antwortet '
    + resBeitrag.status + ' statt 404: ' + resBeitrag.text);
  const resLesen = get('/board/beitrag?vorhaben=von-p2&beitrag=irgendwas');
  pruefe(resLesen.status === 404, 'GET /board/beitrag antwortet '
    + resLesen.status + ' statt 404');
  const resEntscheid = await posting('/board/beitrag/entscheiden', {
    beitrag: 'irgendwas', art: 'annehmen',
  });
  pruefe(resEntscheid.status === 404, 'POST /board/beitrag/entscheiden antwortet '
    + resEntscheid.status + ' statt 404');

  // 4. Die fremden Dateien bleiben byte-gleich; es gibt keinen Beitragsordner
  //    und keine Fassung.
  pruefe(!existsSync(join(ablage, 'beitraege')),
    'Der alte Weg hat einen beitraege/-Ordner angelegt');
  pruefe(Buffer.compare(visionVorher, readFileSync(join(fremdOrdner, 'vision.md'))) === 0,
    'Der alte Weg hat vision.md geschrieben');
  pruefe(Buffer.compare(vorhabenVorher, readFileSync(join(fremdOrdner, 'vorhaben.json'))) === 0,
    'Der alte Weg hat die fremde vorhaben.json geschrieben');
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorAlt,
    'Der alte Weg hat eine Fassung angelegt');
  pruefe(git(['-C', ablage, 'status', '--porcelain']).out === baumVorAlt,
    'Der alte Weg hat den Arbeitsbaum verändert');
  console.log('ok alter Beitragsweg: 404, kein beitraege-Ordner, fremdes Vorhaben unberührt');

  // 5. /board/data bleibt lesbar; alte Beiträge gibt es hier keine, das Feld
  //    bleibt aber Teil der Antwort.
  const datenNachher = alsJson(get('/board/data'), '/board/data');
  pruefe(Array.isArray(datenNachher.beitraege) && datenNachher.beitraege.length === 0,
    '/board/data trägt nach dem alten Weg ' + (datenNachher.beitraege || []).length
      + ' Beiträge');
  console.log('ok /board/data: leere Beitragsliste bleibt lesbar');

  // 9. Die Seite: Bearbeiten am fremden Vorhaben führt zum Beitrag, nicht zum
  //    Schreiben in die Originaldatei (Quelltext, kein Browserbild).
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes("'Als Beitrag speichern'"),
    'Der Leser bietet „Als Beitrag speichern“ nicht an');
  pruefe(client.includes('Notiz zum Beitrag'),
    'Der Leser fragt beim fremden Vorhaben keine Notiz ab');
  pruefe(client.includes('function beitragSpeichern'),
    'Der Leser hat kein Speichern als Beitrag');
  pruefe(client.includes("fetch('/board/github/beitrag'"),
    'Der Beitrag geht nicht an /board/github/beitrag');
  pruefe(!client.includes("poste('/board/beitrag'"),
    'Der Leser ruft noch den alten Weg /board/beitrag auf');
  pruefe(client.includes("uebersetze('Beitrag von {0}"),
    'Die Seite zeigt den Namen des Beitragenden nicht');
  pruefe(client.includes('function beitragOeffnen'),
    'Die Seite kann einen Beitrag nicht öffnen');
  pruefe(!client.includes("leser.modus === 'bearbeiten' && !leserDarfAendern"),
    'Der Leser zwingt ein fremdes Vorhaben weiter auf „Lesen“');
  console.log('ok Seite: Bearbeiten am fremden Vorhaben, Speichern als Beitrag mit Notiz');

  // 10. Die echte Ablage bleibt ohne p2, ohne fremdes Vorhaben und ohne
  //     Beitrag; der Prüfordner verschwindet.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Vorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'beitraege', 'von-p2')),
    'Ein Beitrag zu p2 liegt in der echten Ablage');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
