/**
 * Prüfung Schritt 11 — am fremden Vorhaben speichert der Editor als Beitrag.
 *
 * Kopiert die Ablage und das Produkt nach /tmp und legt `p2` samt einem fremden
 * Vorhaben mit `vision.md` erst in der Kopie an. Die echte Ablage bekommt weder
 * eine zweite Person noch einen Beitrag.
 *
 * Geprüft wird:
 *
 *   1. ein Beitrag mit geänderter `vision.md` und Notiz entsteht als JSON mit
 *      allen Feldern und als vorgeschlagene Fassung unter `beitraege/…`;
 *   2. das Original und die fremde `vorhaben.json` bleiben byte-gleich, die
 *      Fassung trägt den Namen „Thomas Heinrich“;
 *   3. `/board/data` zeigt den Beitrag an Vorhaben und Station mit Name,
 *      Zeitpunkt, Notiz und Dateinamen; `GET /board/beitrag` liefert Notiz und
 *      vorgeschlagene Fassung zum Lesen;
 *   4. ein Beitrag nur mit Notiz wird angenommen, ein ganz leerer mit 400
 *      abgewiesen und hinterlässt keine Datei und keine Fassung;
 *   5. der Leser bietet „Bearbeiten“ auch für ein fremdes Vorhaben und
 *      speichert dort über „Als Beitrag speichern“ mit „Notiz zum Beitrag“
 *      (Quelltext, kein Browserbild).
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
    route(pfad.split('?')[0]).handler(anfrage(pfad), res);
    return res;
  }

  async function posting(pfad, koerper) {
    const res = antwort();
    await route(pfad).handler(anfrage(pfad, koerper), res);
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

  // 3. Der Beitrag mit geänderter vision.md und Notiz.
  const resBeitrag = await posting('/board/beitrag', {
    vorhaben: 'von-p2',
    schritt: 'pruefen',
    notiz: NOTIZ,
    dateien: [{ name: 'vision.md', text: VISION_NEU }],
  });
  const beitragAntwort = alsJson(resBeitrag, '/board/beitrag');
  pruefe(beitragAntwort.ok === true, 'Die Antwort meldet kein ok');
  const beitrag = beitragAntwort.beitrag;
  pruefe(!!beitrag && !!beitrag.id, 'Die Antwort trägt keinen Beitrag');
  pruefe(Object.keys(beitrag).sort().join(',')
    === 'basis,dateien,entschieden,id,notiz,schritt,seit,von,vorhaben',
  'Der Beitrag hat nicht die neun Felder: ' + Object.keys(beitrag).sort().join(', '));
  pruefe(beitrag.id === beitrag.id.toLowerCase()
    && /^[a-z0-9][a-z0-9-]*$/.test(beitrag.id),
  'Die Beitrags-Kennung taugt nicht als Ordnername: ' + beitrag.id);
  pruefe(beitrag.vorhaben === 'von-p2',
    'Der Beitrag gehört zu „' + beitrag.vorhaben + '“');
  pruefe(beitrag.schritt === 'pruefen',
    'Der Beitrag steht an „' + beitrag.schritt + '“');
  pruefe(beitrag.von === 'Thomas Heinrich',
    'Der Beitrag nennt „' + beitrag.von + '“ als Beitragenden');
  pruefe(!Number.isNaN(new Date(beitrag.seit).getTime()),
    'Der Zeitpunkt fehlt oder ist kein Datum: ' + beitrag.seit);
  pruefe(beitrag.basis === basisVorher,
    'Die Basis ist „' + beitrag.basis + '“ statt „' + basisVorher + '“');
  pruefe(beitrag.notiz === NOTIZ, 'Die Notiz wurde verändert');
  pruefe(Array.isArray(beitrag.dateien) && beitrag.dateien.length === 1,
    'Der Beitrag trägt nicht genau eine Datei: ' + JSON.stringify(beitrag.dateien));
  pruefe(beitrag.dateien[0].name === 'vision.md',
    'Die vorgeschlagene Datei heißt „' + beitrag.dateien[0].name + '“');
  const dateiPfad = 'beitraege/von-p2/' + beitrag.id + '/vision.md';
  pruefe(beitrag.dateien[0].datei === dateiPfad,
    'Die vorgeschlagene Fassung liegt nicht unter ' + dateiPfad);
  pruefe(beitrag.entschieden === null, 'Der Beitrag gilt schon als entschieden');

  // 4. Die Dateien liegen in der Ablage; das Original ist byte-gleich.
  const beitragJsonPfad = join(ablage, 'beitraege', 'von-p2', beitrag.id + '.json');
  pruefe(existsSync(beitragJsonPfad), 'Die Beitragsdatei fehlt: ' + beitragJsonPfad);
  const beitragJson = liesJson(beitragJsonPfad);
  pruefe(JSON.stringify(beitragJson) === JSON.stringify(beitrag),
    'Die Beitragsdatei weicht von der Antwort ab');
  const vorschlagPfad = join(ablage, dateiPfad);
  pruefe(existsSync(vorschlagPfad), 'Die vorgeschlagene Fassung fehlt: ' + vorschlagPfad);
  pruefe(readFileSync(vorschlagPfad, 'utf8') === VISION_NEU,
    'Die vorgeschlagene Fassung trägt nicht den neuen Text');
  pruefe(readFileSync(vorschlagPfad, 'utf8').includes('Thomas Heinrich'),
    'Die vorgeschlagene Fassung nennt Thomas Heinrich nicht');
  pruefe(Buffer.compare(visionVorher, readFileSync(join(fremdOrdner, 'vision.md'))) === 0,
    'Die Originaldatei vision.md wurde geschrieben');
  pruefe(Buffer.compare(vorhabenVorher, readFileSync(join(fremdOrdner, 'vorhaben.json'))) === 0,
    'Die fremde vorhaben.json wurde geschrieben');

  // 5. Jeder Beitrag ist eine Fassung mit dem Beitragenden als Urheber.
  const autor = git(['-C', ablage, 'log', '-1', '--format=%an']).out;
  const nachricht = git(['-C', ablage, 'log', '-1', '--format=%s']).out;
  const geaendert = git(['-C', ablage, 'show', '--name-only', '--format=', 'HEAD']).out;
  pruefe(autor === 'Thomas Heinrich',
    'Die Fassung nennt „' + autor + '“ statt Thomas Heinrich');
  pruefe(/Beitrag/.test(nachricht),
    'Die Fassung heißt „' + nachricht + '“ statt einer Beitrags-Fassung');
  pruefe(geaendert.includes('beitraege/von-p2/' + beitrag.id),
    'Die Fassung enthält den Beitrag nicht: ' + geaendert);
  pruefe(!geaendert.includes('vorgaenge/von-p2'),
    'Die Fassung hat das fremde Vorhaben angefasst: ' + geaendert);
  pruefe(git(['-C', ablage, 'status', '--porcelain']).out === '',
    'Nach dem Beitrag ist der Arbeitsbaum nicht ruhig: '
      + git(['-C', ablage, 'status', '--porcelain']).out);
  console.log('ok Beitrag: JSON mit allen Feldern, Fassung unter ' + dateiPfad
    + ', Urheber „' + autor + '“');

  // 6. /board/data zeigt ihn an Vorhaben und Station; das Original bleibt.
  const datenNachher = alsJson(get('/board/data'), '/board/data');
  pruefe(datenNachher.beitraege.length === 1,
    '/board/data zeigt ' + datenNachher.beitraege.length + ' Beiträge statt 1');
  const gezeigt = datenNachher.beitraege[0];
  pruefe(gezeigt.id === beitrag.id, 'Der falsche Beitrag steht in /board/data');
  pruefe(gezeigt.vorhaben === 'von-p2'
    && gezeigt.vorhabenName === 'Von der zweiten Person',
  'Der Ort des Beitrags fehlt: ' + JSON.stringify({
    vorhaben: gezeigt.vorhaben, name: gezeigt.vorhabenName,
  }));
  pruefe(gezeigt.schritt === 'pruefen' && gezeigt.station === 'Prüfen',
    'Die Station des Beitrags fehlt: ' + JSON.stringify({
      schritt: gezeigt.schritt, station: gezeigt.station,
    }));
  pruefe(gezeigt.von === 'Thomas Heinrich', 'Der Name des Beitragenden fehlt');
  pruefe(gezeigt.seit === beitrag.seit, 'Der Zeitpunkt weicht ab');
  pruefe(gezeigt.notiz === NOTIZ, 'Die Notiz fehlt in /board/data');
  pruefe(JSON.stringify(gezeigt.dateien) === JSON.stringify(['vision.md']),
    'Die Namen der vorgeschlagenen Dateien fehlen: ' + JSON.stringify(gezeigt.dateien));
  pruefe(gezeigt.entschieden === null, 'Der Beitrag gilt in /board/data als entschieden');
  console.log('ok /board/data: Beitrag an Vorhaben und Station, von Thomas Heinrich, '
    + 'Notiz und vision.md');

  // 7. Öffnen: Notiz und vorgeschlagene Fassung lesen.
  const geoeffnet = alsJson(get('/board/beitrag?vorhaben=von-p2&beitrag='
    + encodeURIComponent(beitrag.id)), 'GET /board/beitrag');
  pruefe(geoeffnet.beitrag.id === beitrag.id
    && geoeffnet.beitrag.notiz === NOTIZ,
  'Die Notiz des Beitrags fehlt beim Öffnen');
  pruefe(geoeffnet.beitrag.station === 'Prüfen'
    && geoeffnet.beitrag.vorhabenName === 'Von der zweiten Person',
  'Ort oder Vorhaben fehlen beim Öffnen');
  pruefe(Array.isArray(geoeffnet.dateien) && geoeffnet.dateien.length === 1,
    'Beim Öffnen fehlt die vorgeschlagene Fassung');
  pruefe(geoeffnet.dateien[0].name === 'vision.md'
    && geoeffnet.dateien[0].exists === true
    && geoeffnet.dateien[0].text === VISION_NEU,
  'Beim Öffnen ist die vorgeschlagene Fassung nicht lesbar');
  console.log('ok Öffnen: Notiz und vorgeschlagene vision.md lesbar');

  // 8. Ein Beitrag nur mit Notiz ist gültig; ein ganz leerer wird abgewiesen.
  const resNotiz = await posting('/board/beitrag', {
    vorhaben: 'von-p2',
    schritt: 'pruefen',
    notiz: 'Nur eine Notiz, keine Datei.',
    dateien: [],
  });
  const nurNotiz = alsJson(resNotiz, '/board/beitrag (nur Notiz)').beitrag;
  pruefe(nurNotiz.notiz === 'Nur eine Notiz, keine Datei.'
    && Array.isArray(nurNotiz.dateien) && nurNotiz.dateien.length === 0,
  'Der Beitrag nur mit Notiz wurde nicht richtig abgelegt');
  pruefe(existsSync(join(ablage, 'beitraege', 'von-p2', nurNotiz.id + '.json')),
    'Die Beitragsdatei der Notiz fehlt');
  pruefe(!existsSync(join(ablage, 'beitraege', 'von-p2', nurNotiz.id)),
    'Ein Beitrag nur mit Notiz hat einen Dateiordner bekommen');
  const anzahlVorLeer = beitragsDateien().length;
  const kopfVorLeer = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const resLeer = await posting('/board/beitrag', {
    vorhaben: 'von-p2',
    schritt: 'pruefen',
    notiz: '   ',
    dateien: [],
  });
  pruefe(resLeer.status === 400,
    'Ein leerer Beitrag antwortet ' + resLeer.status + ' statt 400: ' + resLeer.text);
  pruefe(beitragsDateien().length === anzahlVorLeer,
    'Der leere Beitrag hat eine Datei angelegt');
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorLeer,
    'Der leere Beitrag hat eine Fassung angelegt');
  console.log('ok Notiz ohne Datei angenommen, leerer Beitrag mit 400 abgewiesen');

  // 9. Die Seite: Bearbeiten am fremden Vorhaben führt zum Beitrag, nicht zum
  //    Schreiben in die Originaldatei (Quelltext, kein Browserbild).
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes("'Als Beitrag speichern'"),
    'Der Leser bietet „Als Beitrag speichern“ nicht an');
  pruefe(client.includes('Notiz zum Beitrag'),
    'Der Leser fragt beim fremden Vorhaben keine Notiz ab');
  pruefe(client.includes('function beitragSpeichern'),
    'Der Leser hat kein Speichern als Beitrag');
  pruefe(client.includes("poste('/board/beitrag'"),
    'Der Beitrag geht nicht an /board/beitrag');
  pruefe(client.includes("'Beitrag von '"),
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
