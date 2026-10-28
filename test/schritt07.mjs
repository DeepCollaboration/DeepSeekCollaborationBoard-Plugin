/**
 * Prüfung Schritt 07 — ein fremdes Vorhaben steht auf meinem Board und lässt
 * sich lesen.
 *
 * Kopiert die Ablage nach /tmp und lädt das Modul mit der Kopie als `repo`.
 * Die echte Ablage bekommt keine zweite Person und kein fremdes Vorhaben;
 * beides lebt ausschließlich in der Prüfkopie.
 *
 * Geprüft wird:
 *
 *   1. das fremde Vorhaben steht an seiner Station im Workflow von `p2`, mit
 *      `verantwortet: "Zweite Person"` und der Farbe aus `p2.json`; ein eigenes
 *      Vorhaben behält seine Farbe, eines ohne eigene Farbe bekommt die der
 *      verantwortlichen Person;
 *   2. `GET /board/dateien` zeigt, was im Ordner liegt — `idee.md`, die
 *      `vorhaben.json` und `transkripte/`, aber kein erfundenes `pruefung.md`;
 *      die tiefe Ebene `transkripte/` ist lesbar;
 *   3. `GET /board/doc` liefert den Text von `idee.md`;
 *   4. `POST /board/doc/schreiben` auf das fremde Vorhaben antwortet 403; die
 *      Datei bleibt byte-gleich, und auch eine neue Datei entsteht nicht;
 *      dasselbe gilt für `/board/skill/lauf` (Transkript in den Ordner);
 *   5. das eigene Vorhaben bleibt schreibbar (Gegenprobe);
 *   6. ein Speichern des eigenen Standes fasst die fremde `vorhaben.json`
 *      nicht an;
 *   7. die Seite öffnet ein fremdes Vorhaben und seine Dateien, zeigt den Text
 *      ohne Bearbeitungsfeld und bietet Schreiben/Starten nur bei
 *      `darf.aendern` an (Quelltext, kein Browserbild);
 *   8. die echte Ablage ist unverändert: kein `p2`, kein `von-p2`.
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
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt07-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const P2_PERSON = {
  id: 'p2',
  name: 'Zweite Person',
  farbe: '#8b5cf6',
};

// Zwei Stationen im Workflow der zweiten Person. `pruefung.md` ist ihre
// Ausgabe — sie liegt nicht im Ordner und darf deshalb auch nicht in der
// Dateiliste stehen.
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

const IDEE = '# Idee\n\nDie zweite Person hat diese Idee.\n';
const TRANSKRIPT = [
  '---',
  'art: gespraech',
  'schritt: Prüfen',
  'skill: pruefen',
  'sitzung: session-p2',
  'stand: 2026-10-26',
  'fragen: 1',
  '---',
  '',
  'Frage: Was ist die Idee?',
  '',
  'Antwort: Genau diese.',
  '',
].join('\n');

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
  // 1. Ablage und Produkt als Kopien; die echte Ablage bleibt unberührt.
  cpSync(ABLAGE, ablage, { recursive: true });
  // Die Kopie trägt den echten Remote mit. Sie darf nie dorthin schreiben.
  spawnSync('git', ['-C', ablage, 'remote', 'remove', 'origin']);
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });

  // Ein Vorhaben ohne eigene Farbe. Die echte Ablage hat es beim Aufräumen
  // verloren; die Prüfung legt es sich selbst an.
  const ohneFarbePfad = join(ablage, 'vorgaenge', 'test', 'vorhaben.json');
  if (!existsSync(ohneFarbePfad)) {
    mkdirSync(dirname(ohneFarbePfad), { recursive: true });
    schreibeJson(ohneFarbePfad, {
      id: 'test', name: 'Test', position: 'idee',
      verantwortliche: { idee: ['p1'] }, regel: 'einer', rueckkehr: [], laeufe: [],
    });
  }

  // Die zweite Person samt Workflow und einem fremden Vorhaben — nur hier.
  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  schreibeJson(join(ablage, 'workflows', 'p2.json'), P2_WORKFLOW);
  const fremdOrdner = join(ablage, 'vorgaenge', 'von-p2');
  mkdirSync(join(fremdOrdner, 'transkripte'), { recursive: true });
  writeFileSync(join(fremdOrdner, 'idee.md'), IDEE, 'utf8');
  writeFileSync(join(fremdOrdner, 'transkripte', 'pruefen-2026-10-26-120000.md'),
    TRANSKRIPT, 'utf8');
  const fremdPfad = join(fremdOrdner, 'vorhaben.json');
  schreibeJson(fremdPfad, FREMDES);
  const ideePfad = join(fremdOrdner, 'idee.md');

  process.env.DSH_HOME = home;
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

  // 2. Das fremde Vorhaben steht an seiner Station, nennt seinen
  //    Verantwortlichen und trägt dessen Farbe.
  const daten = alsJson(get('/board/data'), '/board/data');
  const fremd = daten.vorgaenge.find((v) => v.id === 'von-p2');
  pruefe(!!fremd, 'Das fremde Vorhaben von-p2 fehlt in /board/data');
  const p2Flaeche = daten.workflows.find((p) => p.id === 'p2');
  pruefe(!!p2Flaeche, 'Die Fläche von p2 fehlt in /board/data');
  const p2Workflow = p2Flaeche.workflows && p2Flaeche.workflows[0];
  pruefe(!!p2Workflow, 'p2 hat keinen Workflow in /board/data');
  const stelle = (p2Workflow.positionen || []).find((p) => p.id === fremd.position);
  pruefe(!!stelle, 'Das fremde Vorhaben steht an „' + fremd.position
    + '“ — diese Station gibt es im Workflow von p2 nicht');
  const fremderSchritt = (p2Workflow.schritte || []).find((s) => s.id === stelle.schritt);
  pruefe(!!fremderSchritt, 'Die Station „' + stelle.id + '“ zeigt auf keinen Schritt');
  pruefe(fremd.verantwortet === 'Zweite Person',
    'Das fremde Vorhaben verantwortet „' + fremd.verantwortet
      + '“ statt „Zweite Person“');
  pruefe(fremd.farbe === P2_PERSON.farbe,
    'Das fremde Vorhaben trägt die Farbe ' + JSON.stringify(fremd.farbe)
      + ' statt ' + P2_PERSON.farbe);
  pruefe(fremd.darf.aendern === false && fremd.darf.verschieben === false
    && fremd.darf.weitergeben === false && fremd.darf.zurueckschicken === false,
  'Für das fremde Vorhaben stehen Handlungen offen: ' + JSON.stringify(fremd.darf));
  console.log('ok fremdes Vorhaben: an „' + fremderSchritt.name + '“ im Workflow von p2, '
    + 'verantwortet von „Zweite Person“, Farbe ' + fremd.farbe);

  // Die Farbe wird abgeleitet, nicht gespeichert: ein eigenes Vorhaben behält
  // seine eigene, eines ohne eigene bekommt die seiner Person.
  const eigen = daten.vorgaenge.find((v) => v.id === 'board-gesamtkonzept');
  pruefe(!!eigen && eigen.farbe === '#60a5fa',
    'Das eigene Vorhaben hat seine Farbe verloren: ' + JSON.stringify(eigen && eigen.farbe));
  const ohneFarbe = daten.vorgaenge.find((v) => v.id === 'test');
  pruefe(!!ohneFarbe && ohneFarbe.farbe === '#fbbf24',
    'Das Vorhaben ohne eigene Farbe trägt ' + JSON.stringify(ohneFarbe && ohneFarbe.farbe)
      + ' statt der Farbe von p1 (#fbbf24)');
  console.log('ok Farbe: eigene bleibt (#60a5fa), ohne eigene gilt die Person (#fbbf24)');

  // 3. Die Dateiliste zeigt den Ordner, wie er ist — mit transkripte/.
  const liste = alsJson(get('/board/dateien?vorhaben=von-p2'), '/board/dateien');
  const namen = (liste.eintraege || []).map((e) => e.name);
  pruefe(namen.join(',') === 'transkripte,idee.md,vorhaben.json',
    'Die Dateiliste ist „' + namen.join(', ') + '“ statt '
      + '„transkripte, idee.md, vorhaben.json“');
  pruefe(!namen.includes('pruefung.md'),
    'Die Dateiliste erfindet „pruefung.md“ — die Datei liegt nicht im Ordner');
  for (const e of liste.eintraege) {
    pruefe(existsSync(join(fremdOrdner, e.name)),
      'Die Dateiliste nennt „' + e.name + '“, der Ordner hat sie nicht');
  }
  const tief = alsJson(get('/board/dateien?vorhaben=von-p2&pfad=transkripte'),
    '/board/dateien?pfad=transkripte');
  pruefe((tief.eintraege || []).some((e) => e.name === 'pruefen-2026-10-26-120000.md'),
    'Die tiefe Ebene transkripte/ zeigt das Transkript nicht');
  const tiefDoc = alsJson(get('/board/datei?vorhaben=von-p2&pfad='
    + encodeURIComponent('transkripte/pruefen-2026-10-26-120000.md')), '/board/datei');
  pruefe(tiefDoc.exists === true && tiefDoc.text === TRANSKRIPT,
    'Das Transkript in transkripte/ lässt sich nicht lesen');
  console.log('ok /board/dateien: ' + namen.join(', ') + ' — nichts Erfundenes');

  // 4. Der Text ist lesbar.
  const doc = alsJson(get('/board/doc?vorhaben=von-p2&datei=idee.md'), '/board/doc');
  pruefe(doc.exists === true, '„idee.md“ gilt als nicht vorhanden');
  pruefe(doc.text === IDEE, '„idee.md“ kommt mit einem anderen Text zurück');
  console.log('ok /board/doc: idee.md, ' + doc.text.length + ' Zeichen');

  // 5. Schreiben ohne Berechtigung: 403, bevor etwas entsteht.
  const vorherIdee = readFileSync(ideePfad);
  const vorherFremd = readFileSync(fremdPfad);
  const transkripteVorher = readdirSync(join(fremdOrdner, 'transkripte')).length;

  const resSchreib = await posting('/board/doc/schreiben', {
    vorhaben: 'von-p2',
    datei: 'idee.md',
    text: 'Überschrieben.\n',
  });
  pruefe(resSchreib.status === 403,
    '/board/doc/schreiben auf idee.md antwortet ' + resSchreib.status
      + ' statt 403: ' + resSchreib.text);
  pruefe(Buffer.compare(vorherIdee, readFileSync(ideePfad)) === 0,
    'Die fremde idee.md hat sich beim abgelehnten Schreiben geändert');

  const resNeu = await posting('/board/doc/schreiben', {
    vorhaben: 'von-p2',
    datei: 'neu.md',
    text: 'Neu.\n',
  });
  pruefe(resNeu.status === 403,
    '/board/doc/schreiben auf eine neue Datei antwortet ' + resNeu.status + ' statt 403');
  pruefe(!existsSync(join(fremdOrdner, 'neu.md')),
    'Trotz 403 wurde „neu.md“ im fremden Ordner angelegt');

  // Ein Transkript ist auch ein Schreiben in den Vorhabenordner.
  const resLauf = await posting('/board/skill/lauf', {
    vorhaben: 'von-p2',
    position: 'pruefen',
  });
  pruefe(resLauf.status === 403,
    '/board/skill/lauf auf das fremde Vorhaben antwortet ' + resLauf.status
      + ' statt 403: ' + resLauf.text);
  pruefe(readdirSync(join(fremdOrdner, 'transkripte')).length === transkripteVorher,
    'Trotz 403 entstand ein Transkript im fremden Ordner');
  pruefe(Buffer.compare(vorherFremd, readFileSync(fremdPfad)) === 0,
    'Die fremde vorhaben.json hat sich bei den abgelehnten Schreibversuchen geändert');
  console.log('ok 403: doc/schreiben und skill/lauf — idee.md bleibt byte-gleich, '
    + 'neu.md und ein Transkript entstehen nicht');

  // 6. Gegenprobe: das eigene Vorhaben bleibt schreibbar.
  const eigenName = 'notiz-schritt07.md';
  const resEigen = await posting('/board/doc/schreiben', {
    vorhaben: 'board-gesamtkonzept',
    datei: eigenName,
    text: 'Ein eigener Satz.\n',
  });
  pruefe(resEigen.status === 200,
    '/board/doc/schreiben auf das eigene Vorhaben antwortet ' + resEigen.status
      + ': ' + resEigen.text);
  const eigenPfad = join(ablage, 'vorgaenge', 'board-gesamtkonzept', eigenName);
  pruefe(readFileSync(eigenPfad, 'utf8') === 'Ein eigener Satz.\n',
    'Die eigene Datei liegt nicht mit dem geschriebenen Text im Ordner');
  console.log('ok eigenes Vorhaben bleibt schreibbar: ' + eigenName);

  // 7. Auch ein Speichern des ganzen eigenen Standes fasst fremde Dateien
  //    nicht an.
  const resNeuVorhaben = await posting('/board/vorhaben', { name: 'Eigenes nach dem Lesen' });
  pruefe(resNeuVorhaben.status === 200,
    '/board/vorhaben antwortet ' + resNeuVorhaben.status + ': ' + resNeuVorhaben.text);
  const nachSpeichern = alsJson(resNeuVorhaben, '/board/vorhaben');
  pruefe((nachSpeichern.vorgaenge || []).some((v) => v.id === 'von-p2'),
    'Das fremde Vorhaben fehlt nach dem Speichern des eigenen Standes');
  pruefe(Buffer.compare(vorherFremd, readFileSync(fremdPfad)) === 0,
    'Die fremde vorhaben.json wurde beim Speichern des eigenen Standes angefasst');
  pruefe(Buffer.compare(vorherIdee, readFileSync(ideePfad)) === 0,
    'Die fremde idee.md wurde beim Speichern des eigenen Standes angefasst');
  pruefe(!existsSync(join(fremdOrdner, 'neu.md')),
    'Beim Speichern des eigenen Standes entstand „neu.md“ im fremden Ordner');
  console.log('ok eigener Stand gespeichert, fremde Dateien byte-gleich');

  // 8. Die Seite: ein fremdes Vorhaben lässt sich öffnen und lesen; der Leser
  //    hat kein Bearbeitungsfeld. Das Bild im Browser bräuchte einen Neustart
  //    und wird hier nicht geprüft.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes('fremdesVorhabenOeffnen'),
    'Die Seite öffnet ein fremdes Vorhaben nicht');
  pruefe(client.includes('Vorhaben öffnen und seine Dateien lesen'),
    'Der Knopf am fremden Vorhaben öffnet seine Dateien nicht');
  pruefe(client.includes("'Die Dateien dieses Vorhabens ansehen'"),
    'Am ausgewählten fremden Vorhaben fehlt der Weg zu den Dateien');
  pruefe(client.includes('leserDarfAendern'),
    'Der Leser unterscheidet fremde und eigene Vorhaben nicht');
  const aendernPruefungen = (client.match(
    /gewaehltesVorhaben\.darf && gewaehltesVorhaben\.darf\.aendern/g,
  ) || []).length;
  pruefe(aendernPruefungen >= 3,
    'Schreiben und Starten hängen nicht an darf.aendern (nur '
      + aendernPruefungen + ' Prüfungen)');
  console.log('ok Seite: fremdes Vorhaben öffnen und Dateien lesen; Leser ohne '
    + 'Bearbeiten; Schreiben und Starten nur bei darf.aendern');

  // 9. Die echte Ablage: kein p2, kein fremdes Vorhaben, keine Prüfdatei.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'von-p2')),
    'Das fremde Vorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'board-gesamtkonzept', eigenName)),
    'Die Prüfdatei liegt in der echten Ablage');
  const echt = JSON.parse(readFileSync(
    join(ABLAGE, 'vorgaenge', 'board-gesamtkonzept', 'vorhaben.json'), 'utf8'));
  pruefe(echt.position === 'umsetzen' && JSON.stringify(echt.verantwortliche.umsetzen)
    === '["p1"]', 'Die echte Ablage wurde verändert: '
    + JSON.stringify(echt.verantwortliche) + ' an ' + echt.position);
  console.log('ok echte Ablage unverändert: kein p2, kein von-p2');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
