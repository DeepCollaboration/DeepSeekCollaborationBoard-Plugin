/**
 * Prüfung Schritt 09 — ein fremder Schritt steht als Verweis im eigenen Workflow.
 *
 * Kopiert die Ablage nach /tmp und lädt das Modul mit der Kopie als `repo`.
 * Die zweite Person `p2` und ihr Workflow mit dem Schritt `pruefen` entstehen
 * erst in der Kopie; die echte Ablage bekommt keinen fremden Schritt.
 *
 * Geprüft wird:
 *
 *   1. der fremde Schritt lässt sich aus der fremden Fläche heraus anstellen:
 *      `workflows/p1.json` trägt danach `{ ref, id }` und eine Position,
 *      `workflows/p2.json` ist byte-gleich;
 *   2. `/board/data` löst den Verweis in der eigenen Fläche auf: Name „Prüfen“,
 *      `host: "p2"`, `fremd: true`, Ein- und Ausgang;
 *   3. ein Vorhaben lässt sich anlegen und auf die Verweis-Position
 *      verschieben; dort erscheint es mit `verantwortet: "Thomas Heinrich"`;
 *   4. `/board/schritt/aendern` und `/board/schritt/loeschen` antworten am
 *      fremden Schritt mit 403 — beide Dateien bleiben unverändert;
 *   5. verschwindet das Ziel, erscheint der Verweis als fehlend, und seine
 *      Position bleibt stehen;
 *   6. der Verweis lässt sich wieder herausnehmen; solange ein Vorhaben darauf
 *      steht, antwortet der Host 409; danach ist die eigene Datei wieder ohne
 *      ihn, die fremde Datei unverändert.
 *
 * Die echte Ablage wird nicht angefasst; die zweite Person lebt nur in der
 * Prüfkopie.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt09-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const P2_PERSON = {
  id: 'p2',
  name: 'Zweite Person',
  farbe: '#8b5cf6',
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
        wie: { art: 'textfeld', wert: '' },
        skill: null,
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

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

/** Ein minimaler ctx: Handler sammeln, Effekte ausführen, kein Dienst. */
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
      get() {
        return undefined;
      },
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

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

let gebaut = null;

try {
  // 1. Die Ablage als Kopie und das Produkt als Kopie mit eigener
  //    Konfiguration. Die echte Ablage bleibt unberührt.
  cpSync(ABLAGE, ablage, { recursive: true });
  // Die Kopie trägt den echten Remote mit. Sie darf nie dorthin schreiben.
  spawnSync('git', ['-C', ablage, 'remote', 'remove', 'origin']);
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });

  process.env.DSH_HOME = home;
  gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  const datenRoute = gebaut.routen.get('/board/data');
  pruefe(datenRoute && typeof datenRoute.handler === 'function',
    'Die Route /board/data fehlt');

  async function rufe(pfad, koerper) {
    const route = gebaut.routen.get(pfad);
    pruefe(route && typeof route.handler === 'function',
      'Die Route ' + pfad + ' fehlt');
    const res = antwort();
    await route.handler(anfrage(pfad, koerper), res);
    return res;
  }

  function datenHolen() {
    const res = antwort();
    datenRoute.handler(anfrage('/board/data'), res);
    return alsJson(res, '/board/data');
  }

  const p1Pfad = join(ablage, 'workflows', 'p1.json');
  const p2Pfad = join(ablage, 'workflows', 'p2.json');
  const p1Anfang = readFileSync(p1Pfad);
  const anfang = JSON.parse(p1Anfang.toString('utf8')).workflows[0];
  const positionenAnfang = anfang.positionen.length;
  const schritteAnfang = anfang.schritte.length;
  pruefe(!JSON.stringify(anfang.schritte).includes('"ref"'),
    'Die echte p1-Datei trägt schon einen Verweis');
  pruefe(!existsSync(join(ablage, 'personen', 'p2.json')), 'p2 liegt schon in der Kopie');

  // 2. Die zweite Person samt Workflow und Schritt `pruefen` — nur in der Kopie.
  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  schreibeJson(p2Pfad, P2_WORKFLOW);
  const p2Vorher = readFileSync(p2Pfad);
  console.log('ok p1 ohne Verweis, p2 in der Kopie angelegt');

  // 3. Aus der fremden Fläche heraus anstellen: der Host schreibt den Verweis
  //    in die eigene Datei; p2 bleibt byte-gleich.
  const resAnstellen = await rufe('/board/fremd/anstellen', { ref: 'p2/standard/pruefen' });
  const nachAnstellen = alsJson(resAnstellen, '/board/fremd/anstellen');

  const p1NachAnstellen = readFileSync(p1Pfad);
  const dateiNachAnstellen = JSON.parse(p1NachAnstellen.toString('utf8')).workflows[0];
  const refs = dateiNachAnstellen.schritte.filter((s) => s && s.ref);
  pruefe(refs.length === 1,
    'p1 trägt ' + refs.length + ' Verweise statt 1');
  pruefe(refs[0].ref === 'p2/standard/pruefen',
    'Der Verweis in p1 lautet ' + JSON.stringify(refs[0].ref));
  pruefe(typeof refs[0].id === 'string' && refs[0].id,
    'Der Verweis in p1 trägt keine Kennung: ' + JSON.stringify(refs[0]));
  pruefe(!dateiNachAnstellen.schritte.some((s) => s && s.name === 'Prüfen'),
    'Der fremde Schritt wurde in die p1-Datei kopiert');
  pruefe(dateiNachAnstellen.schritte.length === schritteAnfang + 1,
    'p1 hat ' + dateiNachAnstellen.schritte.length + ' Schritte statt '
      + (schritteAnfang + 1));
  pruefe(dateiNachAnstellen.positionen.length === positionenAnfang + 1,
    'p1 hat ' + dateiNachAnstellen.positionen.length + ' Positionen statt '
      + (positionenAnfang + 1));
  const neueStelle = dateiNachAnstellen.positionen
    .find((p) => p.schritt === refs[0].id);
  pruefe(!!neueStelle, 'Die Position des Verweises fehlt in der p1-Datei');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Anstellen geändert');
  console.log('ok angestellt: p1 trägt {ref, id} und eine Position, p2 byte-gleich');

  // 4. `/board/data` löst den Verweis in der eigenen Fläche auf — Name, Host,
  //    fremd, Ein- und Ausgang kommen aus der p2-Datei.
  const eigene = nachAnstellen.workflows.find((p) => p.ich);
  const verweis = (eigene.workflows[0].schritte || []).find((s) => s.ref === 'p2/standard/pruefen');
  pruefe(!!verweis, 'Der Verweis fehlt in der eigenen Fläche');
  pruefe(verweis.name === 'Prüfen',
    'Der Verweis ist nicht aufgelöst: Name „' + verweis.name + '“');
  pruefe(verweis.host === 'p2',
    'Der aufgelöste Verweis nennt host ' + JSON.stringify(verweis.host));
  pruefe(verweis.fremd === true, 'Der aufgelöste Verweis ist nicht als fremd markiert');
  pruefe((verweis.eingang || []).join(',') === 'idee.md'
    && (verweis.ausgabe || []).join(',') === 'pruefung.md',
  'Der Verweis trägt nicht Ein- und Ausgang des Ziels: '
    + JSON.stringify(verweis.eingang) + ' → ' + JSON.stringify(verweis.ausgabe));
  const verweisPosition = eigene.workflows[0].positionen
    .find((p) => p.id === neueStelle.id);
  pruefe(!!verweisPosition && verweisPosition.schritt === verweis.id,
    'Die Position des Verweises steht nicht in der eigenen Fläche');
  console.log('ok /board/data: Verweis als Prüfen (host p2, fremd) mit Ein- und Ausgang');

  // 5. Ein Vorhaben anlegen und auf die Verweis-Position stellen. Es bleibt
  //    ein Vorhaben der eigenen Person.
  const resNeu = await rufe('/board/vorhaben', { name: 'Fremder Schritt Probe' });
  const nachNeu = alsJson(resNeu, '/board/vorhaben');
  const neuesVorhaben = (nachNeu.vorgaenge || [])
    .find((v) => v.name === 'Fremder Schritt Probe');
  pruefe(!!neuesVorhaben, 'Das neue Vorhaben fehlt');

  const resWeg = await rufe('/board/vorhaben/verschieben', {
    id: neuesVorhaben.id,
    position: neueStelle.id,
  });
  const nachWeg = alsJson(resWeg, '/board/vorhaben/verschieben');
  const dort = (nachWeg.vorgaenge || []).find((v) => v.id === neuesVorhaben.id);
  pruefe(!!dort && dort.position === neueStelle.id,
    'Das Vorhaben steht nicht an der Verweis-Position: '
      + JSON.stringify(dort && dort.position));
  pruefe(dort.verantwortet === 'Thomas Heinrich',
    'Das Vorhaben an der Verweis-Position verantwortet „'
      + (dort && dort.verantwortet) + '“');
  pruefe(dort.darf && dort.darf.verschieben === true,
    'Die eigene Person darf das Vorhaben an der Verweis-Position nicht verschieben');
  console.log('ok Vorhaben auf der Verweis-Position: verantwortet Thomas Heinrich');

  // 6. Am fremden Schritt selbst ändert und löscht hier niemand — 403, und
  //    keine der beiden Dateien wird angefasst.
  const resAendern = await rufe('/board/schritt/aendern', {
    id: verweis.id, name: 'Anders',
  });
  pruefe(resAendern.status === 403,
    '/board/schritt/aendern antwortet ' + resAendern.status + ' statt 403: '
      + resAendern.text);
  const resLoeschen = await rufe('/board/schritt/loeschen', { id: verweis.id });
  pruefe(resLoeschen.status === 403,
    '/board/schritt/loeschen antwortet ' + resLoeschen.status + ' statt 403: '
      + resLoeschen.text);
  pruefe(Buffer.compare(p1NachAnstellen, readFileSync(p1Pfad)) === 0,
    'p1 hat sich beim versuchten Ändern/Löschen geändert');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'p2 hat sich beim versuchten Ändern/Löschen geändert');
  console.log('ok Ändern und Löschen am fremden Schritt: 403, beide Dateien unverändert');

  // 7. Das Ziel verschwindet: der Verweis steht als fehlend da, seine Position
  //    bleibt. Danach kommt die p2-Datei zurück.
  const p2Weg = p2Pfad + '.weg';
  renameSync(p2Pfad, p2Weg);
  const ohneZiel = datenHolen();
  const eigeneOhneZiel = ohneZiel.workflows.find((p) => p.ich);
  const verweisOhneZiel = (eigeneOhneZiel.workflows[0].schritte || [])
    .find((s) => s.ref === 'p2/standard/pruefen');
  pruefe(!!verweisOhneZiel, 'Der Verweis ist ohne Ziel ganz verschwunden');
  pruefe(verweisOhneZiel.fehlt === true,
    'Der Verweis ohne Ziel ist nicht als fehlend markiert');
  pruefe(verweisOhneZiel.name === '',
    'Der Verweis ohne Ziel hat einen geratenen Namen: „' + verweisOhneZiel.name + '“');
  pruefe(verweisOhneZiel.host === 'p2',
    'Der Verweis ohne Ziel verliert seinen Host: ' + JSON.stringify(verweisOhneZiel.host));
  pruefe((eigeneOhneZiel.workflows[0].positionen || [])
    .some((p) => p.id === neueStelle.id && p.schritt === verweis.id),
  'Die Position des Verweises ist ohne Ziel verschwunden');
  renameSync(p2Weg, p2Pfad);
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Fehlen geändert');
  console.log('ok Ziel weg: Verweis erscheint als fehlend, Position bleibt');

  // 8. Herausnehmen: solange das Vorhaben dort steht, 409; danach weg, die
  //    eigene Datei ist wieder ohne Verweis, p2 bleibt byte-gleich.
  const resZuFrueh = await rufe('/board/fremd/entfernen', { ref: 'p2/standard/pruefen' });
  pruefe(resZuFrueh.status === 409,
    'Das Herausnehmen mit Vorhaben antwortet ' + resZuFrueh.status + ' statt 409: '
      + resZuFrueh.text);

  const resZurueck = await rufe('/board/vorhaben/verschieben', {
    id: neuesVorhaben.id,
    position: anfang.positionen[0].id,
  });
  alsJson(resZurueck, '/board/vorhaben/verschieben');

  const resEntfernen = await rufe('/board/fremd/entfernen', { ref: 'p2/standard/pruefen' });
  const nachEntfernen = alsJson(resEntfernen, '/board/fremd/entfernen');
  const p1NachEntfernen = readFileSync(p1Pfad);
  const dateiNachEntfernen = JSON.parse(p1NachEntfernen.toString('utf8')).workflows[0];
  pruefe(!dateiNachEntfernen.schritte.some((s) => s && s.ref),
    'p1 trägt nach dem Herausnehmen noch einen Verweis');
  pruefe(dateiNachEntfernen.schritte.length === schritteAnfang,
    'p1 hat nach dem Herausnehmen ' + dateiNachEntfernen.schritte.length
      + ' Schritte statt ' + schritteAnfang);
  pruefe(dateiNachEntfernen.positionen.length === positionenAnfang,
    'p1 hat nach dem Herausnehmen ' + dateiNachEntfernen.positionen.length
      + ' Positionen statt ' + positionenAnfang);
  pruefe(!dateiNachEntfernen.positionen.some((p) => p.schritt === verweis.id),
    'Die Position des Verweises steht noch in der p1-Datei');
  pruefe(!dateiNachEntfernen.schritte.some((s) => s && s.name === 'Prüfen'),
    'Der fremde Schritt ist in die p1-Datei gewandert');
  pruefe(Buffer.compare(p1Anfang, p1NachEntfernen) === 0,
    'p1 ist nach dem Herausnehmen nicht wieder der Ausgangsstand');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Herausnehmen geändert');
  const eigeneNach = nachEntfernen.workflows.find((p) => p.ich);
  pruefe(!(eigeneNach.workflows[0].schritte || []).some((s) => s.ref),
    'Die eigene Fläche zeigt nach dem Herausnehmen noch einen Verweis');
  console.log('ok Herausnehmen mit Vorhaben: 409; danach weg: p1 wieder der Ausgangsstand, p2 byte-gleich');

  // 9. Die Seite bietet beides an: das Anstellen aus der fremden Fläche und
  //    das Herausnehmen des Verweises; der Host steht als „bei ‹Person›“ da.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes("'/board/fremd/anstellen'"),
    'Die Seite ruft /board/fremd/anstellen nicht auf');
  pruefe(client.includes("'/board/fremd/entfernen'"),
    'Die Seite ruft /board/fremd/entfernen nicht auf');
  pruefe(client.includes("'In meinen Workflow stellen'"),
    'Die fremde Fläche bietet das Anstellen nicht an');
  pruefe(client.includes("'Verweis herausnehmen'"),
    'Die eigene Fläche bietet das Herausnehmen des Verweises nicht an');
  pruefe(client.includes("uebersetze('bei {0}', [personName("),
    'Der Verweis nennt seinen Host nicht mit „bei ‹Person›“');
  console.log('ok Seite: anstellen, herausnehmen, „bei ‹Person›“');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
