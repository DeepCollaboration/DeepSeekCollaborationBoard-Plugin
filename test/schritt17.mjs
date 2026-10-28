/**
 * Prüfung Schritt 17 — Identität und mehrere Boards.
 *
 * Kopiert Ablage und Produkt nach /tmp; die echte Ablage bleibt unberührt.
 *
 * Geprüft wird:
 *
 *   1. Aus der alten Einzelkonfiguration entsteht beim ersten Start ein
 *      Register mit einem Board; die Identität kommt aus der eigenen Person.
 *   2. `/board/data` nennt Identität und Boards; die eigene Person bleibt p1.
 *   3. Eine geänderte Identität landet in `identitaet.json` und in der
 *      Personendatei des offenen Boards.
 *   4. Ein neues lokales Board entsteht mit Format, Person und einer
 *      Start-Station; es wird sofort das offene Board.
 *   5. Zurückwechseln zeigt wieder die alte Ablage; die alte Personendatei
 *      wurde nicht überschrieben.
 *   6. Ein Board lässt sich aus der Liste nehmen; die Dateien bleiben.
 *   7. Ohne Board und ohne Konfiguration liefert `/board/data` `leer: true`;
 *      Identität und erstes Board entstehen aus der Seite heraus.
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
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt17-'));
const home = join(stamm, 'home');
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home2 = join(stamm, 'home2');
const kopie2 = join(stamm, 'produkt2');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function git(args, inAblage) {
  const lauf = spawnSync('git', ['-C', inAblage, ...args], { encoding: 'utf8' });
  return {
    ok: lauf.status === 0,
    out: String(lauf.stdout || '').trim(),
    fehler: String(lauf.stderr || '').trim(),
  };
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

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

function starten(modulPfad, dshHome) {
  process.env.DSH_HOME = dshHome;
  const gebaut = ctxBauen();
  return import(pathToFileURL(modulPfad).href).then((modul) => {
    modul.apply(gebaut.ctx);
    return gebaut;
  });
}

function get(gebaut, pfad) {
  const res = antwort();
  gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad), res);
  pruefe(res.status === 200, 'GET ' + pfad + ' antwortet ' + res.status + ': ' + res.text);
  return JSON.parse(res.text);
}

async function posting(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(pfad).handler(anfrage(pfad, koerper), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

let gebaut = null;
let gebaut2 = null;

try {
  cpSync(ABLAGE, ablage, { recursive: true });
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  // Kein Remote in der Kopie: die Prüfung geht nicht ins Netz.
  git(['remote', 'remove', 'origin'], ablage);
  git(['add', '-A'], ablage);
  git(['-c', 'user.name=Prüfung', '-c', 'user.email=pruefung@board',
    'commit', '-m', 'Prüfstand'], ablage);

  // 1. Erster Start: Register und Identität entstehen aus dem Alten.
  gebaut = await starten(join(kopie, 'index.js'), home);
  const register = liesJson(join(home, 'board', 'boards.json'));
  pruefe(register.boards.length === 1, 'Das Register hat nicht ein Board');
  pruefe(register.boards[0].person === 'p1', 'Die Person des ersten Boards ist nicht p1');
  pruefe(register.aktiv === register.boards[0].id, 'Das erste Board ist nicht offen');
  const ident = liesJson(join(home, 'board', 'identitaet.json'));
  pruefe(ident.name === 'Thomas Heinrich', 'Die Identität hat nicht den Namen der Person: '
    + JSON.stringify(ident));
  pruefe(ident.farbe === '#fbbf24', 'Die Identität hat nicht die Farbe der Person');

  const daten = get(gebaut, '/board/data');
  pruefe(!daten.leer, 'Das Board gilt als leer');
  pruefe(daten.boards.length === 1 && daten.aktiv === register.aktiv,
    'Die Seite sieht nicht das eine Board');
  pruefe(daten.identitaet && daten.identitaet.name === 'Thomas Heinrich',
    'Die Seite sieht die Identität nicht');

  // 2. Identität ändern: Datei, Person und Fassung.
  const kopfVorher = git(['rev-parse', 'HEAD'], ablage).out;
  const geaendert = await posting(gebaut, '/board/identitaet', {
    name: 'Thomas H.', github: 'thomas-h', farbe: '#3b82f6',
  });
  pruefe(geaendert.status === 200, 'Identität ändern antwortet ' + geaendert.status);
  const personDatei = liesJson(join(ablage, 'personen', 'p1.json'));
  pruefe(personDatei.name === 'Thomas H.', 'Die Personendatei trägt den neuen Namen nicht');
  pruefe(personDatei.github === 'thomas-h', 'Die Personendatei trägt den GitHub-Namen nicht');
  pruefe(personDatei.farbe === '#3b82f6', 'Die Personendatei trägt die neue Farbe nicht');
  pruefe(liesJson(join(home, 'board', 'identitaet.json')).github === 'thomas-h',
    'Die Identitätsdatei trägt den GitHub-Namen nicht');
  pruefe(git(['rev-parse', 'HEAD'], ablage).out !== kopfVorher,
    'Die Identitätsänderung wurde nicht gefasst');

  // 3. Ein neues lokales Board.
  const neu = await posting(gebaut, '/board/boards', { name: 'Zweites Board', adresse: '' });
  pruefe(neu.status === 200, 'Board anlegen antwortet ' + neu.status + ': ' + JSON.stringify(neu.daten));
  const registerNach = liesJson(join(home, 'board', 'boards.json'));
  pruefe(registerNach.boards.length === 2, 'Das Register hat nicht zwei Boards');
  pruefe(registerNach.aktiv !== register.aktiv, 'Das neue Board ist nicht offen');
  const zweites = registerNach.boards.find((b) => b.id === registerNach.aktiv);
  pruefe(zweites && existsSync(join(zweites.repo, 'format')), 'Dem neuen Board fehlt das Format');
  pruefe(liesJson(join(zweites.repo, 'personen', zweites.person + '.json')).name === 'Thomas H.',
    'Das neue Board trägt nicht die Identität');
  const zweitDaten = get(gebaut, '/board/data');
  pruefe(zweitDaten.repo === zweites.repo, 'Die Seite liest nicht das neue Board');
  pruefe(zweitDaten.boards.length === 2, 'Die Seite sieht nicht beide Boards');
  pruefe(zweitDaten.workflows.length === 1 && zweitDaten.workflows[0].ich,
    'Das neue Board hat keinen eigenen Workflow');

  // 4. Zurückwechseln: die alte Ablage, unverändert an der Person.
  const zurueck = await posting(gebaut, '/board/boards/wechsel', { id: register.aktiv });
  pruefe(zurueck.status === 200, 'Wechseln antwortet ' + zurueck.status);
  const altDaten = get(gebaut, '/board/data');
  pruefe(altDaten.repo === ablage, 'Nach dem Wechsel ist nicht die alte Ablage offen');
  pruefe(altDaten.identitaet.github === 'thomas-h', 'Nach dem Wechsel fehlt der GitHub-Name');
  pruefe(liesJson(join(ablage, 'personen', 'p1.json')).name === 'Thomas H.',
    'Die alte Personendatei wurde beim Wechsel überschrieben');

  // 5. Aus der Liste nehmen: Dateien bleiben.
  const weg = await posting(gebaut, '/board/boards/entfernen', { id: zweites.id });
  pruefe(weg.status === 200, 'Entfernen antwortet ' + weg.status);
  const registerWeg = liesJson(join(home, 'board', 'boards.json'));
  pruefe(registerWeg.boards.length === 1, 'Das Board wurde nicht aus der Liste genommen');
  pruefe(existsSync(join(zweites.repo, 'format')), 'Die Dateien des entfernten Boards sind weg');

  // 6. Frische Installation: kein Board, keine Konfiguration.
  cpSync(PRODUKT, kopie2, { recursive: true });
  rmSync(join(kopie2, 'board.config.json'), { force: true });
  mkdirSync(home2, { recursive: true });
  gebaut2 = await starten(join(kopie2, 'index.js'), home2);
  const leer = get(gebaut2, '/board/data');
  pruefe(leer.leer === true, 'Ohne Board ist die Antwort nicht leer');
  pruefe(leer.boards.length === 0, 'Ohne Board gibt es schon Einträge');
  pruefe(leer.identitaet === null, 'Ohne Identität steht trotzdem eine da');
  const ohne = await posting(gebaut2, '/board/boards', {
    name: 'Erstes', adresse: '',
  });
  pruefe(ohne.status === 400, 'Board anlegen ohne Identität antwortet ' + ohne.status);
  const idNeu = await posting(gebaut2, '/board/identitaet', {
    name: 'Neue Person', github: 'neue-person', farbe: '#22c55e',
  });
  pruefe(idNeu.status === 200, 'Identität anlegen antwortet ' + idNeu.status);
  const erstes = await posting(gebaut2, '/board/boards', { name: 'Erstes', adresse: '' });
  pruefe(erstes.status === 200, 'Erstes Board antwortet ' + erstes.status + ': '
    + JSON.stringify(erstes.daten));
  const erstDaten = get(gebaut2, '/board/data');
  pruefe(!erstDaten.leer && erstDaten.repo, 'Das erste Board ist nicht offen');
  pruefe(erstDaten.identitaet.name === 'Neue Person', 'Die Identität fehlt am ersten Board');
  pruefe(liesJson(join(erstDaten.repo, 'personen', erstDaten.person + '.json')).github
    === 'neue-person', 'Das erste Board trägt den GitHub-Namen nicht');

  console.log('ok Register: aus der alten Konfiguration entsteht ein Board, die Identität aus der Person');
  console.log('ok Identität: Änderung liegt in der Datei, an der Person und als Fassung');
  console.log('ok Neues Board: Format, Person, Start-Station, sofort offen');
  console.log('ok Wechsel: die alte Ablage und ihre Person bleiben, wie sie waren');
  console.log('ok Entfernen: nur die Liste verliert das Board, die Dateien bleiben');
  console.log('ok Frische Installation: leer, Identität, erstes Board aus der Seite');
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} finally {
  for (const b of [gebaut, gebaut2]) {
    if (b) b.aufraeumen.forEach((ende) => ende());
  }
  rmSync(stamm, { recursive: true, force: true });
}
