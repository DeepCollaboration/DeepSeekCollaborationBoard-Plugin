/**
 * Prüfung Schritt 05 — fremde Workflows stehen auf meinem Board.
 *
 * Kopiert die Ablage nach /tmp und lädt das Modul mit der Kopie als `repo`.
 * Zuerst gibt es nur die eigene Person; danach kommt die zweite Person `p2`
 * samt zwei Schritten dazu, und der eigene Workflow bekommt einen Verweis auf
 * einen dieser Schritte.
 *
 * Geprüft wird:
 *
 *   1. ohne die p2-Dateien hat `workflows` genau einen Eintrag — die eigene
 *      Person, zuerst und mit `ich`;
 *   2. mit p2 stehen zwei Flächen da, die eigene zuerst, `ich` nur bei ihr;
 *   3. die zwei fremden Schritte tragen `host: "p2"` und sind als fremd
 *      markiert;
 *   4. der Verweis erscheint aufgelöst mit Name, Host, Eingang und Ausgang —
 *      als Verweis, nicht als kopierter Schritt;
 *   5. `workflows/p1.json` und `workflows/p2.json` sind vor und nach dem Lesen
 *      byte-gleich.
 *
 * Die echte Ablage wird nicht angefasst; die zweite Person lebt nur in der
 * Prüfkopie.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt05-'));
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
  pruefe(datenRoute && typeof datenRoute.handler === 'function', 'Die Route /board/data fehlt');

  function datenHolen() {
    const res = antwort();
    datenRoute.handler(anfrage('/board/data'), res);
    return alsJson(res, '/board/data');
  }

  const p1Pfad = join(ablage, 'workflows', 'p1.json');
  const p2Pfad = join(ablage, 'workflows', 'p2.json');

  // 2. Ohne die zweite Person: genau die eigene Fläche, zuerst und mit `ich`.
  pruefe(!existsSync(join(ablage, 'personen', 'p2.json')), 'p2 liegt schon in der Kopie');
  pruefe(!existsSync(p2Pfad), 'workflows/p2.json liegt schon in der Kopie');
  const p1Vorher = readFileSync(p1Pfad);
  const allein = datenHolen();

  pruefe(Object.keys(allein).sort().join(',')
    === 'aktiv,beitraege,boards,einstellungen,format,formatAblage,hauptboard,identitaet,'
      + 'person,personen,repo,stand,vorgaenge,workflows',
  'Die Form von /board/data ist nicht { person, repo, format, formatAblage, workflows, '
    + 'vorgaenge, beitraege, personen, einstellungen, stand, identitaet, boards }: '
    + Object.keys(allein).sort().join(', '));
  pruefe(!('workflow' in allein) && !('schritte' in allein),
    '/board/data trägt noch die alten Schlüssel workflow/schritte');
  pruefe(Array.isArray(allein.workflows) && allein.workflows.length === 1,
    'Ohne p2 hat workflows ' + (Array.isArray(allein.workflows)
      ? allein.workflows.length : 'keine') + ' Einträge statt 1');
  pruefe(allein.workflows[0].id === 'p1' && allein.workflows[0].ich === true,
    'Ohne p2 steht die eigene Person nicht zuerst');
  pruefe(allein.workflows[0].workflows.length === 1,
    'Die eigene Fläche hat nicht genau einen Workflow');
  pruefe(Buffer.compare(p1Vorher, readFileSync(p1Pfad)) === 0,
    'workflows/p1.json hat sich beim Lesen geändert');
  const eigeneSchritteVorher = allein.workflows[0].workflows[0].schritte.length;
  console.log('ok ohne p2: workflows hat 1 Eintrag, die eigene Person zuerst');

  // 3. Die zweite Person samt zwei Schritten; der eigene Workflow bekommt
  //    einen Verweis auf einen p2-Schritt — als Verweis, nicht als Kopie.
  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  schreibeJson(p2Pfad, P2_WORKFLOW);

  const eigeneDatei = JSON.parse(readFileSync(p1Pfad, 'utf8'));
  const eigenerWorkflow = eigeneDatei.workflows[0];
  eigenerWorkflow.schritte.push({ ref: 'p2/standard/pruefen' });
  schreibeJson(p1Pfad, eigeneDatei);

  const p1MitVerweis = readFileSync(p1Pfad);
  const p2Vorher = readFileSync(p2Pfad);
  const mitP2 = datenHolen();

  // 4. Zwei Flächen, die eigene zuerst, `ich` nur bei ihr.
  pruefe(mitP2.workflows.length === 2,
    'Mit p2 hat workflows ' + mitP2.workflows.length + ' Einträge statt 2');
  const eigene = mitP2.workflows[0];
  const fremde = mitP2.workflows[1];
  pruefe(eigene.id === 'p1' && eigene.ich === true,
    'Die eigene Person steht nicht zuerst: ' + eigene.id + '/' + eigene.ich);
  pruefe(fremde.id === 'p2' && fremde.ich === false,
    'Die zweite Person steht falsch: ' + fremde.id + '/' + fremde.ich);
  pruefe(mitP2.workflows.filter((p) => p.ich).length === 1,
    '`ich` steht nicht genau einmal in workflows');
  pruefe(fremde.name === 'Zweite Person' && fremde.farbe === '#8b5cf6',
    'Die fremde Fläche nennt nicht Namen und Farbe: '
      + fremde.name + '/' + fremde.farbe);

  // 5. Die zwei fremden Schritte tragen Host p2 und sind als fremd markiert.
  const fremdeSchritte = fremde.workflows[0].schritte;
  pruefe(fremdeSchritte.length === 2,
    'Die fremde Fläche hat ' + fremdeSchritte.length + ' Schritte statt 2');
  for (const schritt of fremdeSchritte) {
    pruefe(schritt.host === 'p2',
      'Fremder Schritt „' + schritt.name + '“ trägt host ' + JSON.stringify(schritt.host));
    pruefe(schritt.fremd === true,
      'Fremder Schritt „' + schritt.name + '“ ist nicht als fremd markiert');
  }
  pruefe(fremdeSchritte.map((s) => s.name).join(',') === 'Prüfen,Freigeben',
    'Die fremden Schritte heißen ' + fremdeSchritte.map((s) => s.name).join(', '));
  console.log('ok mit p2: 2 Flächen, eigene zuerst; 2 fremde Schritte mit host p2 und fremd');

  // 6. Der Verweis steht aufgelöst in der eigenen Fläche — Name, Host,
  //    Eingang und Ausgang kommen aus der p2-Datei, ohne sie zu verändern.
  const eigeneSchritte = eigene.workflows[0].schritte;
  pruefe(eigeneSchritte.length === eigeneSchritteVorher + 1,
    'Der Verweis fehlt in der eigenen Fläche: ' + eigeneSchritte.length
      + ' statt ' + (eigeneSchritteVorher + 1));
  const verweis = eigeneSchritte.find((s) => s.ref === 'p2/standard/pruefen');
  pruefe(!!verweis, 'Der Verweis auf p2/standard/pruefen fehlt');
  pruefe(verweis.name === 'Prüfen',
    'Der Verweis ist nicht aufgelöst: Name „' + verweis.name + '“');
  pruefe(verweis.host === 'p2',
    'Der aufgelöste Verweis nennt host ' + JSON.stringify(verweis.host));
  pruefe(verweis.fremd === true, 'Der aufgelöste Verweis ist nicht als fremd markiert');
  pruefe((verweis.eingang || []).join(',') === 'idee.md'
    && (verweis.ausgabe || []).join(',') === 'pruefung.md',
  'Der aufgelöste Verweis trägt nicht Ein- und Ausgang des Ziels: '
    + JSON.stringify(verweis.eingang) + ' → ' + JSON.stringify(verweis.ausgabe));

  // Der Schritt wird gezeigt, nicht kopiert: in der p1-Datei steht weiter nur
  // der Verweis, kein zweiter „Prüfen“-Schritt.
  const p1Jetzt = JSON.parse(readFileSync(p1Pfad, 'utf8'));
  const refInDatei = p1Jetzt.workflows[0].schritte
    .filter((s) => s && s.ref === 'p2/standard/pruefen');
  pruefe(refInDatei.length === 1, 'Der Verweis steht nicht in der p1-Datei');
  pruefe(!p1Jetzt.workflows[0].schritte.some((s) => s && s.name === 'Prüfen'),
    'Der fremde Schritt wurde in die p1-Datei kopiert');

  // 7. Lesen verändert keine Datei: p1 und p2 sind byte-gleich geblieben.
  pruefe(Buffer.compare(p1MitVerweis, readFileSync(p1Pfad)) === 0,
    'workflows/p1.json hat sich beim Lesen des Verweises geändert');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Lesen geändert');
  console.log('ok Verweis: aufgelöst als Prüfen (host p2), p2-Datei unverändert');

  // Die eigenen Schritte bleiben eigene Schritte.
  const eigeneNormal = eigeneSchritte.filter((s) => !s.ref);
  pruefe(eigeneNormal.length === eigeneSchritteVorher,
    'Die Zahl der eigenen Schritte hat sich geändert');
  pruefe(eigeneNormal.every((s) => s.fremd !== true),
    'Ein eigener Schritt ist als fremd markiert');

  // 8. Eine Speicherung im eigenen Workflow lässt den Verweis stehen: er wird
  //    nicht als kopierter Schritt geschrieben, und p2 bleibt unverändert.
  const platzieren = gebaut.routen.get('/board/position/platzieren');
  pruefe(platzieren && typeof platzieren.handler === 'function',
    'Die Route /board/position/platzieren fehlt');
  const stelle = p1Jetzt.workflows[0].positionen[0];
  const resPlatz = antwort();
  await platzieren.handler(anfrage('/board/position/platzieren', {
    id: stelle.id,
    x: (stelle.x || 0) + 20,
    y: (stelle.y || 0) + 20,
  }), resPlatz);
  pruefe(resPlatz.status === 200,
    'Speichern antwortet ' + resPlatz.status + ': ' + resPlatz.text);
  const p1NachSpeichern = JSON.parse(readFileSync(p1Pfad, 'utf8'));
  const refNachSpeichern = p1NachSpeichern.workflows[0].schritte
    .filter((s) => s && s.ref === 'p2/standard/pruefen');
  pruefe(refNachSpeichern.length === 1,
    'Der Verweis ist beim Speichern aus der p1-Datei verschwunden');
  pruefe(!p1NachSpeichern.workflows[0].schritte.some((s) => s && s.name === 'Prüfen'),
    'Beim Speichern wurde der fremde Schritt in die p1-Datei kopiert');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Speichern geändert');
  console.log('ok Speichern: Verweis bleibt Verweis, p2 unverändert');

  gebaut.aufraeumen.forEach((ende) => ende());
  console.log('ok p1.json und p2.json: vor und nach dem Lesen byte-gleich');
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
