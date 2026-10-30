/**
 * Prüfung Schritt 06 — jedes Vorhaben nennt seinen Verantwortlichen.
 *
 * Kopiert die Ablage nach /tmp und lädt das Modul mit der Kopie als `repo`.
 * Die echte Ablage bekommt nur die fünf Verantwortlichen-Einträge; die zweite
 * Person, ihr Workflow und ein fremdes Vorhaben leben ausschließlich in der
 * Prüfkopie.
 *
 * Geprüft wird:
 *
 *   1. das eigene Vorhaben: `verantwortet: "Thomas Heinrich"` und
 *      `darf.weitergeben: true`; `verantwortliche` und `regel` stehen daneben;
 *   2. ein fremdes Vorhaben (Verantwortliche `p2`, Station in p2s Workflow):
 *      `verantwortet: "Zweite Person"` und `darf.weitergeben: false`;
 *   3. `POST /board/vorhaben/verschieben` auf das fremde Vorhaben antwortet 403;
 *      ebenso `aendern`, `abzweigen` und `zurueckschicken` — dieselbe Stelle;
 *   4. Weitergeben des eigenen Vorhabens an eine Zielstation mit `p2` schreibt
 *      `verantwortliche[<zielstation>] = ["p2"]`, verschiebt es, und danach ist
 *      `darf.weitergeben` für `p1` falsch;
 *   5. ein neu angelegtes Vorhaben trägt den Anlegenden an seiner Station;
 *   6. die Seite trägt „verantwortet von“ und bietet „Weitergeben“ nur bei
 *      `darf.weitergeben` an (Quelltext, kein Browserbild);
 *   7. die echte Ablage ist unverändert: kein fremdes Vorhaben, die fünf
 *      Einträge stehen an ihrer Station.
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
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt06-'));
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

// Ein fremdes Vorhaben: es steht an einer Station im Workflow von p2.
const FREMDES = {
  id: 'fremdes-vorhaben',
  name: 'Fremdes Vorhaben',
  position: 'pruefen',
  verantwortliche: { pruefen: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
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

  // Die zweite Person samt Workflow und einem fremden Vorhaben — nur hier.
  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  schreibeJson(join(ablage, 'workflows', 'p2.json'), P2_WORKFLOW);
  const fremdPfad = join(ablage, 'vorgaenge', 'fremdes-vorhaben', 'vorhaben.json');
  schreibeJson(fremdPfad, FREMDES);

  process.env.DSH_HOME = home;
  gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  const datenRoute = gebaut.routen.get('/board/data');
  pruefe(datenRoute && typeof datenRoute.handler === 'function', 'Die Route /board/data fehlt');
  const verschiebenRoute = gebaut.routen.get('/board/vorhaben/verschieben');
  pruefe(verschiebenRoute && typeof verschiebenRoute.handler === 'function',
    'Die Route /board/vorhaben/verschieben fehlt');
  const anlegenRoute = gebaut.routen.get('/board/vorhaben');
  pruefe(anlegenRoute && typeof anlegenRoute.handler === 'function',
    'Die Route /board/vorhaben fehlt');

  function datenHolen() {
    const res = antwort();
    datenRoute.handler(anfrage('/board/data'), res);
    return alsJson(res, '/board/data');
  }

  function posting(pfad, koerper) {
    const route = gebaut.routen.get(pfad);
    pruefe(route && typeof route.handler === 'function', 'Die Route ' + pfad + ' fehlt');
    const res = antwort();
    return route.handler(anfrage(pfad, koerper), res).then(() => res);
  }

  // 2. Das eigene Vorhaben nennt seinen Verantwortlichen und darf weitergeben.
  const vorher = datenHolen();
  const eigen = vorher.vorgaenge.find((v) => v.id === 'board-gesamtkonzept');
  pruefe(!!eigen, 'Das eigene Vorhaben board-gesamtkonzept fehlt in /board/data');
  pruefe(eigen.verantwortet === 'Thomas Heinrich',
    'Das eigene Vorhaben verantwortet „' + eigen.verantwortet + '“ statt „Thomas Heinrich“');
  pruefe(eigen.regel === 'einer', 'regel steht auf ' + JSON.stringify(eigen.regel));
  pruefe(JSON.stringify(eigen.verantwortliche) === '{"umsetzen":["p1"]}',
    'verantwortliche ist ' + JSON.stringify(eigen.verantwortliche));
  pruefe(Object.keys(eigen.darf).join(',')
    === 'aendern,verschieben,weitergeben,zurueckschicken,entscheiden',
  'darf hat nicht die fünf Aktionen: ' + Object.keys(eigen.darf).join(', '));
  pruefe(eigen.darf.aendern === true && eigen.darf.verschieben === true
    && eigen.darf.weitergeben === true && eigen.darf.zurueckschicken === true,
  'Die eigene Person darf ihr Vorhaben nicht: ' + JSON.stringify(eigen.darf));
  console.log('ok eigenes Vorhaben: verantwortet von „Thomas Heinrich“, '
    + 'darf.weitergeben true');

  // 3. Das fremde Vorhaben: Name der Verantwortlichen, keine Handlung für p1.
  const fremd = vorher.vorgaenge.find((v) => v.id === 'fremdes-vorhaben');
  pruefe(!!fremd, 'Das fremde Vorhaben fehlt in /board/data');
  pruefe(fremd.verantwortet === 'Zweite Person',
    'Das fremde Vorhaben verantwortet „' + fremd.verantwortet + '“ statt „Zweite Person“');
  pruefe(fremd.darf.weitergeben === false,
    'darf.weitergeben ist für das fremde Vorhaben ' + JSON.stringify(fremd.darf.weitergeben));
  pruefe(fremd.darf.aendern === false && fremd.darf.verschieben === false
    && fremd.darf.zurueckschicken === false,
  'Für das fremde Vorhaben stehen noch Handlungen offen: ' + JSON.stringify(fremd.darf));
  console.log('ok fremdes Vorhaben: verantwortet von „Zweite Person“ an „pruefen“, '
    + 'darf.weitergeben false');

  // 4. Fremde Handlungen: 403, und keine Datei wird angefasst.
  const vorFremd = readFileSync(fremdPfad);
  const resFremd = await posting('/board/vorhaben/verschieben', {
    id: 'fremdes-vorhaben',
    position: 'vision',
  });
  pruefe(resFremd.status === 403,
    'verschieben auf das fremde Vorhaben antwortet ' + resFremd.status
      + ' statt 403: ' + resFremd.text);
  console.log('ok 403: POST /board/vorhaben/verschieben auf das fremde Vorhaben');

  for (const [pfad, koerper] of [
    ['/board/vorhaben/aendern', { id: 'fremdes-vorhaben', name: 'Fremd umbenannt' }],
    ['/board/vorhaben/abzweigen', {
      id: 'fremdes-vorhaben', station: 'idee', ziel: 'vision', name: 'Fremder Zweig',
    }],
    ['/board/vorhaben/zurueckschicken', {
      id: 'fremdes-vorhaben', nach: 'idee', grund: 'offen',
    }],
  ]) {
    const res = await posting(pfad, koerper);
    pruefe(res.status === 403,
      pfad + ' auf das fremde Vorhaben antwortet ' + res.status
        + ' statt 403: ' + res.text);
  }
  pruefe(Buffer.compare(vorFremd, readFileSync(fremdPfad)) === 0,
    'Die fremde vorhaben.json hat sich bei den abgelehnten Handlungen geändert');
  console.log('ok 403: aendern, abzweigen und zurueckschicken ebenso — dieselbe Stelle');

  // 5. Weitergeben: Eintrag an der Zielstation, Vorhaben wandert dorthin.
  const resWeiter = await posting('/board/vorhaben/verschieben', {
    id: 'board-gesamtkonzept',
    position: 'vision',
    person: 'p2',
  });
  pruefe(resWeiter.status === 200,
    'Weitergeben antwortet ' + resWeiter.status + ': ' + resWeiter.text);
  const eigeneDatei = JSON.parse(readFileSync(
    join(ablage, 'vorgaenge', 'board-gesamtkonzept', 'vorhaben.json'), 'utf8'));
  pruefe(eigeneDatei.position === 'vision',
    'Das weitergegebene Vorhaben steht an ' + eigeneDatei.position + ' statt an vision');
  pruefe(JSON.stringify(eigeneDatei.verantwortliche.vision) === '["p2"]',
    'verantwortliche.vision ist ' + JSON.stringify(eigeneDatei.verantwortliche.vision));
  pruefe(JSON.stringify(eigeneDatei.verantwortliche.umsetzen) === '["p1"]',
    'Der Eintrag der alten Station ging verloren: '
      + JSON.stringify(eigeneDatei.verantwortliche.umsetzen));

  const nachWeitergabe = datenHolen();
  const eigenJetzt = nachWeitergabe.vorgaenge.find((v) => v.id === 'board-gesamtkonzept');
  pruefe(eigenJetzt.verantwortet === 'Zweite Person',
    'Nach dem Weitergeben verantwortet „' + eigenJetzt.verantwortet
      + '“ statt „Zweite Person“');
  pruefe(eigenJetzt.darf.weitergeben === false,
    'Nach dem Weitergeben darf p1 noch weitergeben: ' + JSON.stringify(eigenJetzt.darf));
  console.log('ok Weitergeben: verantwortliche.vision = [p2], position vision, '
    + 'darf.weitergeben für p1 falsch');

  // 6. Anlegen: der Anlegende ist an der ersten Station verantwortlich.
  const resNeu = await posting('/board/vorhaben', { name: 'Frisches Vorhaben' });
  const nachAnlegen = alsJson(resNeu, '/board/vorhaben');
  const frisch = nachAnlegen.vorgaenge.find((v) => v.name === 'Frisches Vorhaben');
  pruefe(!!frisch, 'Das neu angelegte Vorhaben fehlt in der Antwort');
  pruefe(frisch.position === 'idee',
    'Das neue Vorhaben beginnt an ' + frisch.position + ' statt an idee');
  pruefe(JSON.stringify(frisch.verantwortliche.idee) === '["p1"]',
    'verantwortliche.idee ist ' + JSON.stringify(frisch.verantwortliche.idee));
  pruefe(frisch.verantwortet === 'Thomas Heinrich',
    'Das neue Vorhaben verantwortet „' + frisch.verantwortet + '“');
  pruefe(frisch.darf.weitergeben === true,
    'Der Anlegende darf sein neues Vorhaben nicht weitergeben: ' + JSON.stringify(frisch.darf));
  console.log('ok Anlegen: „Frisches Vorhaben“ an „idee“, verantwortet von '
    + '„Thomas Heinrich“');

  // 7. Die Seite: Anzeige und Handlung stehen im Client. Das Bild im Browser
  //    braucht einen Neustart und wird hier nicht geprüft.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes("uebersetze('verantwortet von {0}',"),
    'Die Seite zeigt „verantwortet von“ nicht');
  pruefe(client.includes("uebersetze('Weitergeben')"),
    'Die Seite hat die Handlung „Weitergeben“ nicht');
  pruefe(client.includes('darf.weitergeben'),
    'Die Seite richtet „Weitergeben“ nicht nach darf.weitergeben');
  console.log('ok Seite: „verantwortet von“ steht am Vorhaben, „Weitergeben“ nur bei '
    + 'darf.weitergeben');

  // 8. Die echte Ablage: fünf Einträge, kein fremdes Vorhaben.
  const echt = JSON.parse(readFileSync(
    join(ABLAGE, 'vorgaenge', 'board-gesamtkonzept', 'vorhaben.json'), 'utf8'));
  pruefe(echt.position === 'umsetzen' && JSON.stringify(echt.verantwortliche.umsetzen)
    === '["p1"]', 'Die echte Ablage wurde verändert: '
    + JSON.stringify(echt.verantwortliche) + ' an ' + echt.position);
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'fremdes-vorhaben')),
    'Das fremde Vorhaben liegt in der echten Ablage');
  console.log('ok echte Ablage unverändert: fünf Einträge, kein fremdes Vorhaben');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
