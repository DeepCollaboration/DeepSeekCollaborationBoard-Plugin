/**
 * Prüfung Schritt 12 — der Verantwortliche entscheidet über den Beitrag.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bekommt weder
 * eine zweite Person noch einen Beitrag. Im copy legt das Skript ein eigenes
 * Vorhaben mit `vision.md`, `a.md` und `b.md` an, dazu ein fremdes Vorhaben
 * einer zweiten Person. Das Modul läuft als `p1`.
 *
 * Geprüft wird:
 *
 *   1. Annehmen übernimmt die vorgeschlagene `vision.md`, trägt den Entscheid
 *      in die Beitragsdatei ein und hält ihn als Fassung von „Thomas Heinrich“
 *      fest; der Beitrag und seine Datei bleiben liegen;
 *   2. Teile übernehmen nur `a.md`, `b.md` bleibt unverändert;
 *   3. Ablehnen ändert keine Vorhabendatei und trägt `art: "abgelehnt"` ein;
 *   4. ein zweiter Entscheid antwortet 409, ein Entscheid auf das Vorhaben
 *      einer anderen Person 403; der Stand bleibt dabei unverändert;
 *   5. Annehmen prüft je übernommener Datei die Basis: ein überholter Stand
 *      antwortet 409 mit den neuen Basen und schreibt nichts; `teile` grenzt
 *      die Prüfung auf die übernommenen Dateien ein;
 *   6. `/board/data` liefert `entschieden` an jedem Beitrag, der Verlauf zeigt
 *      die neue Fassung, und die Seite bietet die Handlungen nur dem
 *      Verantwortlichen an (Quelltext, kein Browserbild);
 *   7. nur die eigene Personendatei wird geschrieben und nur sie lässt sich
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
    await route(pfad).handler(anfrage(pfad, koerper), res);
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

  // 3. Drei Beiträge am eigenen Vorhaben und einer am fremden.
  const beitragA = await beitragAnlegen('eigenes-12', 'umsetzen',
    'Bitte die Vision so übernehmen.', [{ name: 'vision.md', text: VISION_NEU }]);
  const beitragB = await beitragAnlegen('eigenes-12', 'umsetzen',
    'Nur a.md übernehmen, b.md bleibt.', [
      { name: 'a.md', text: A_NEU },
      { name: 'b.md', text: B_NEU },
    ]);
  const beitragC = await beitragAnlegen('eigenes-12', 'umsetzen',
    'Diesen Vorschlag bitte ablehnen.', [
      { name: 'vision.md', text: VISION_ABGELEHNT },
    ]);
  const beitragFremd = await beitragAnlegen('fremd-12', 'umsetzen',
    'Vorschlag an das fremde Vorhaben.', [
      { name: 'vision.md', text: FREMD_NEU },
    ]);
  for (const b of [beitragA, beitragB, beitragC, beitragFremd]) {
    pruefe(b && b.entschieden === null,
      'Ein neuer Beitrag gilt schon als entschieden: ' + JSON.stringify(b));
  }

  // 4. Annehmen: die vorgeschlagene Fassung wird zur Datei des Vorhabens,
  //    der Beitrag bleibt mit seinem Vermerk liegen.
  const antwortA = alsJson(await posting('/board/beitrag/entscheiden', {
    beitrag: beitragA.id,
    art: 'annehmen',
  }), '/board/beitrag/entscheiden (A)');
  pruefe(antwortA.ok === true && antwortA.beitrag && antwortA.beitrag.id === beitragA.id,
    'Die Antwort auf den Entscheid trägt den falschen Beitrag');
  const entschiedenA = antwortA.beitrag.entschieden;
  pruefe(entschiedenA && entschiedenA.art === 'angenommen',
    'A ist nicht angenommen: ' + JSON.stringify(entschiedenA));
  pruefe(entschiedenA.von === 'p1',
    'Der Entscheid nennt „' + entschiedenA.von + '“ statt p1');
  pruefe(!Number.isNaN(new Date(entschiedenA.am).getTime()),
    'Der Zeitpunkt des Entscheids ist kein Datum: ' + entschiedenA.am);
  pruefe(JSON.stringify(entschiedenA.teile) === JSON.stringify(['vision.md']),
    'A hat nicht genau vision.md übernommen: ' + JSON.stringify(entschiedenA.teile));
  pruefe(readFileSync(join(eigenOrdner, 'vision.md'), 'utf8') === VISION_NEU,
    'vision.md trägt nach dem Annehmen nicht den vorgeschlagenen Text');
  pruefe(existsSync(join(ablage, 'beitraege', 'eigenes-12', beitragA.id, 'vision.md')),
    'Die vorgeschlagene Fassung von A ist nach dem Annehmen verschwunden');
  pruefe(readFileSync(join(ablage, 'beitraege', 'eigenes-12', beitragA.id,
    'vision.md'), 'utf8') === VISION_NEU,
  'Die vorgeschlagene Fassung von A wurde verändert');
  const beitragAJson = liesJson(join(ablage, 'beitraege', 'eigenes-12',
    beitragA.id + '.json'));
  pruefe(JSON.stringify(beitragAJson.entschieden) === JSON.stringify(entschiedenA),
    'Die Beitragsdatei von A trägt einen anderen Entscheid');
  const autorA = git(['-C', ablage, 'log', '-1', '--format=%an']).out;
  const nachrichtA = git(['-C', ablage, 'log', '-1', '--format=%s']).out;
  const geaendertA = git(['-C', ablage, 'show', '--name-only', '--format=', 'HEAD']).out;
  pruefe(autorA === 'Thomas Heinrich',
    'Die Fassung nennt „' + autorA + '“ statt Thomas Heinrich');
  pruefe(/angenommen/.test(nachrichtA),
    'Die Fassung von A heißt „' + nachrichtA + '“');
  pruefe(geaendertA.includes('vorgaenge/eigenes-12/vision.md'),
    'Die Fassung von A enthält vision.md nicht: ' + geaendertA);
  pruefe(geaendertA.includes('beitraege/eigenes-12/' + beitragA.id),
    'Die Fassung von A enthält den Beitrag nicht: ' + geaendertA);
  console.log('ok A angenommen: vision.md übernommen, Beitrag liegt, '
    + 'Fassung von „' + autorA + '“');

  // 5. Teile: nur a.md wird übernommen, b.md bleibt byte-gleich.
  const antwortB = alsJson(await posting('/board/beitrag/entscheiden', {
    beitrag: beitragB.id,
    art: 'annehmen',
    teile: ['a.md'],
  }), '/board/beitrag/entscheiden (B)');
  const entschiedenB = antwortB.beitrag.entschieden;
  pruefe(entschiedenB && entschiedenB.art === 'angenommen',
    'B ist nicht angenommen: ' + JSON.stringify(entschiedenB));
  pruefe(JSON.stringify(entschiedenB.teile) === JSON.stringify(['a.md']),
    'B nennt nicht genau a.md als Teil: ' + JSON.stringify(entschiedenB.teile));
  pruefe(readFileSync(join(eigenOrdner, 'a.md'), 'utf8') === A_NEU,
    'a.md trägt nach dem Teil-Annehmen nicht den vorgeschlagenen Text');
  pruefe(readFileSync(join(eigenOrdner, 'b.md'), 'utf8') === B_ALT,
    'b.md wurde trotz Teile-Wahl geändert');
  console.log('ok B in Teilen: a.md übernommen, b.md unverändert, teile ["a.md"]');

  // 6. Ablehnen: keine Vorhabendatei ändert sich, der Vermerk steht im Beitrag.
  const vorC = {
    vision: readFileSync(join(eigenOrdner, 'vision.md')),
    a: readFileSync(join(eigenOrdner, 'a.md')),
    b: readFileSync(join(eigenOrdner, 'b.md')),
  };
  const antwortC = alsJson(await posting('/board/beitrag/entscheiden', {
    beitrag: beitragC.id,
    art: 'ablehnen',
  }), '/board/beitrag/entscheiden (C)');
  const entschiedenC = antwortC.beitrag.entschieden;
  pruefe(entschiedenC && entschiedenC.art === 'abgelehnt',
    'C ist nicht abgelehnt: ' + JSON.stringify(entschiedenC));
  pruefe(Array.isArray(entschiedenC.teile) && entschiedenC.teile.length === 0,
    'C nennt beim Ablehnen Teile: ' + JSON.stringify(entschiedenC.teile));
  for (const [name, alt] of [
    ['vision.md', vorC.vision], ['a.md', vorC.a], ['b.md', vorC.b],
  ]) {
    pruefe(Buffer.compare(alt, readFileSync(join(eigenOrdner, name))) === 0,
      name + ' wurde beim Ablehnen geändert');
  }
  const geaendertC = git(['-C', ablage, 'show', '--name-only', '--format=', 'HEAD']).out;
  pruefe(!geaendertC.includes('vorgaenge/eigenes-12'),
    'Die Ablehnungs-Fassung hat das Vorhaben angefasst: ' + geaendertC);
  console.log('ok C abgelehnt: keine Vorhabendatei geändert, art „abgelehnt“');

  // 7. Ein zweiter Entscheid auf A antwortet 409 und ändert nichts; auf das
  //    fremde Vorhaben antwortet 403 und lässt den Beitrag offen.
  const kopfVorDoppelt = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const aJsonVorDoppelt = readFileSync(join(ablage, 'beitraege', 'eigenes-12',
    beitragA.id + '.json'));
  const resDoppelt = await posting('/board/beitrag/entscheiden', {
    beitrag: beitragA.id,
    art: 'ablehnen',
  });
  pruefe(resDoppelt.status === 409,
    'Der zweite Entscheid auf A antwortet ' + resDoppelt.status + ' statt 409: '
      + resDoppelt.text);
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorDoppelt,
    'Der zweite Entscheid auf A hat eine Fassung angelegt');
  pruefe(Buffer.compare(aJsonVorDoppelt, readFileSync(join(ablage, 'beitraege',
    'eigenes-12', beitragA.id + '.json'))) === 0,
  'Der zweite Entscheid auf A hat den Beitrag geändert');

  const kopfVorFremd = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const fremdJsonVor = readFileSync(join(ablage, 'beitraege', 'fremd-12',
    beitragFremd.id + '.json'));
  const fremdVisionVor = readFileSync(join(fremdOrdner, 'vision.md'));
  const resFremd = await posting('/board/beitrag/entscheiden', {
    beitrag: beitragFremd.id,
    art: 'annehmen',
  });
  pruefe(resFremd.status === 403,
    'Der Entscheid auf das fremde Vorhaben antwortet ' + resFremd.status
      + ' statt 403: ' + resFremd.text);
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorFremd,
    'Der fremde Entscheid hat eine Fassung angelegt');
  pruefe(Buffer.compare(fremdJsonVor, readFileSync(join(ablage, 'beitraege',
    'fremd-12', beitragFremd.id + '.json'))) === 0,
  'Der fremde Entscheid hat den Beitrag geändert');
  pruefe(Buffer.compare(fremdVisionVor, readFileSync(join(fremdOrdner, 'vision.md'))) === 0,
    'Der fremde Entscheid hat vision.md geändert');
  console.log('ok 409 auf den zweiten Entscheid, 403 auf das fremde Vorhaben, '
    + 'nichts geändert');

  // 8. Der Verlauf des Vorhabens zeigt die neue Fassung von vision.md.
  const versionenNachher = alsJson(get('/board/versionen?vorhaben=eigenes-12'
    + '&datei=vision.md'), '/board/versionen').versionen;
  pruefe(versionenNachher.length === versionenVorher.length + 1,
    'Der Verlauf hat ' + versionenNachher.length + ' statt '
      + (versionenVorher.length + 1) + ' Fassungen');
  pruefe(versionenNachher[0].autor === 'Thomas Heinrich',
    'Die neue Fassung nennt „' + versionenNachher[0].autor + '“');
  pruefe(/angenommen/.test(versionenNachher[0].nachricht),
    'Die neue Fassung heißt „' + versionenNachher[0].nachricht + '“');
  console.log('ok Verlauf: neue Fassung von vision.md, Urheber Thomas Heinrich');

  // 9. `/board/data` trägt `entschieden` an jedem Beitrag.
  const nachher = alsJson(get('/board/data'), '/board/data');
  pruefe(nachher.beitraege.length === 4,
    '/board/data zeigt ' + nachher.beitraege.length + ' Beiträge statt 4');
  for (const b of nachher.beitraege) {
    pruefe(Object.prototype.hasOwnProperty.call(b, 'entschieden'),
      'Dem Beitrag ' + b.id + ' fehlt `entschieden`');
  }
  const gezeigtA = nachher.beitraege.find((b) => b.id === beitragA.id);
  const gezeigtB = nachher.beitraege.find((b) => b.id === beitragB.id);
  const gezeigtC = nachher.beitraege.find((b) => b.id === beitragC.id);
  const gezeigtFremd = nachher.beitraege.find((b) => b.id === beitragFremd.id);
  pruefe(gezeigtA.entschieden && gezeigtA.entschieden.art === 'angenommen'
    && gezeigtA.entschieden.von === 'p1',
  'A steht in /board/data ohne gültigen Entscheid');
  pruefe(gezeigtB.entschieden && JSON.stringify(gezeigtB.entschieden.teile)
    === JSON.stringify(['a.md']), 'B steht in /board/data ohne Teile');
  pruefe(gezeigtC.entschieden && gezeigtC.entschieden.art === 'abgelehnt',
    'C steht in /board/data ohne Ablehnung');
  pruefe(gezeigtFremd.entschieden === null,
    'Der fremde Beitrag gilt in /board/data als entschieden');
  console.log('ok /board/data: entschieden an jedem Beitrag — A, B, C, fremd');

  // 10. Annehmen prüft je übernommener Datei die Basis. Ein Beitrag, der auf
  //     einem überholten Stand sitzt, antwortet 409 mit den neuen Basen und
  //     schreibt nichts; `teile` prüft nur die übernommenen Dateien.
  const basisVon = (datei) => git([
    '-C', ablage, 'log', '-1', '--format=%H', '--',
    'vorgaenge/eigenes-12/' + datei,
  ]).out;
  const basisVision = basisVon('vision.md');
  const visionVorPruefung = readFileSync(join(eigenOrdner, 'vision.md'));
  const stale = alsJson(await posting('/board/beitrag', {
    vorhaben: 'eigenes-12',
    schritt: 'umsetzen',
    notiz: 'Dieser Vorschlag sitzt auf einem überholten Stand.',
    dateien: [{ name: 'vision.md', text: VISION_ABGELEHNT }],
    basis: kopfProbe,
  }), '/board/beitrag (überholt)').beitrag;
  const kopfVorStale = git(['-C', ablage, 'rev-parse', 'HEAD']).out;
  const resStale = await posting('/board/beitrag/entscheiden', {
    beitrag: stale.id,
    art: 'annehmen',
  });
  pruefe(resStale.status === 409,
    'Das Annehmen auf überholter Basis antwortet ' + resStale.status
      + ' statt 409: ' + resStale.text);
  const staleWert = JSON.parse(resStale.text);
  pruefe(staleWert.ok === false && /Stand ist neuer/.test(String(staleWert.error || '')),
    'Die 409-Antwort nennt den neueren Stand nicht: ' + resStale.text);
  pruefe(staleWert.neu && staleWert.neu['vision.md'] === basisVision,
    'Die 409-Antwort trägt nicht die neue Basis von vision.md: '
      + JSON.stringify(staleWert.neu));
  pruefe(Buffer.compare(visionVorPruefung, readFileSync(join(eigenOrdner, 'vision.md'))) === 0,
    'Das abgelehnte Annehmen hat vision.md geändert');
  pruefe(git(['-C', ablage, 'rev-parse', 'HEAD']).out === kopfVorStale,
    'Das abgelehnte Annehmen hat eine Fassung angelegt');
  const staleJson = liesJson(join(ablage, 'beitraege', 'eigenes-12', stale.id + '.json'));
  pruefe(staleJson.entschieden === null,
    'Der abgelehnte Beitrag gilt trotzdem als entschieden');
  console.log('ok Basis beim Annehmen: 409 mit neuer Basis, nichts geschrieben');

  const basisAktuellA = basisVon('a.md');
  const visionVorTeile = readFileSync(join(eigenOrdner, 'vision.md'));
  const teileBeitrag = alsJson(await posting('/board/beitrag', {
    vorhaben: 'eigenes-12',
    schritt: 'umsetzen',
    notiz: 'Nur a.md übernehmen; vision.md sitzt auf einem alten Stand.',
    dateien: [
      { name: 'a.md', text: A_TEIL },
      { name: 'vision.md', text: VISION_ABGELEHNT },
    ],
    basis: basisAktuellA,
  }), '/board/beitrag (Teile)').beitrag;
  const resTeile = alsJson(await posting('/board/beitrag/entscheiden', {
    beitrag: teileBeitrag.id,
    art: 'annehmen',
    teile: ['a.md'],
  }), '/board/beitrag/entscheiden (Teile)');
  pruefe(JSON.stringify(resTeile.beitrag.entschieden.teile) === JSON.stringify(['a.md']),
    'Die Teile-Prüfung hat nicht nur a.md übernommen');
  pruefe(readFileSync(join(eigenOrdner, 'a.md'), 'utf8') === A_TEIL,
    'a.md trägt nach dem Teil-Annehmen nicht den vorgeschlagenen Text');
  pruefe(Buffer.compare(visionVorTeile, readFileSync(join(eigenOrdner, 'vision.md'))) === 0,
    'vision.md wurde übernommen, obwohl es nicht in `teile` stand');
  console.log('ok teile: nur a.md geprüft und übernommen, vision.md bleibt');

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

  // 12. Die Seite: Entscheid sichtbar, Handlungen nur mit `darf.entscheiden`.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes('function beitragEntscheiden'),
    'Die Seite hat keine Entscheid-Handlung');
  pruefe(client.includes("poste('/board/beitrag/entscheiden'"),
    'Die Seite spricht nicht mit /board/beitrag/entscheiden');
  pruefe(client.includes('darf.entscheiden'),
    'Die Seite richtet die Handlungen nicht nach darf.entscheiden');
  pruefe(client.includes("'Annehmen'") && client.includes("'Ablehnen'"),
    'Die Seite bietet Annehmen und Ablehnen nicht an');
  pruefe(client.includes('entschieden.teile'),
    'Die Seite zeigt die übernommenen Teile nicht');
  pruefe(client.includes('Angenommen') && client.includes('Abgelehnt'),
    'Die Seite zeigt den Entscheid nicht an');
  console.log('ok Seite: Entscheid sichtbar, Annehmen/Ablehnen nur bei '
    + 'darf.entscheiden');

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
