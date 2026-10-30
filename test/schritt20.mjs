/**
 * Prüfung Schritt 20 — die Lese-Routen finden die Dateien der Fassung 2.
 *
 * Die fünf Repositories liegen in einer eigenen Prüffläche unter
 * `/tmp/board-scheibe1/schritt20`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process, ohne Netz; das Testboard wird über `POST /board/boards`
 * mit seinem lokalen Ordner verbunden.
 *
 * Geprüft wird:
 *
 *   1. `/board/data` nennt das Testboard als aktiv und „Board Gesamtkonzept“
 *      an der Station „idee“.
 *   2. `/board/datei` und `/board/doc` liefern den Text von `idee.md`.
 *   3. `/board/dateien` listet `idee.md`.
 *   4. Ein fremdes Vorhaben antwortet 404.
 *   5. `../idee.md` verlässt das Vorhaben-Repository nicht und antwortet 400.
 *   6. Ablage und Home sind danach entfernt.
 */
import {
  existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const VORLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt20');
const HOME = join(ABLAGE, 'home');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
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

async function starten() {
  process.env.DSH_HOME = HOME;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
  modul.apply(gebaut.ctx);
  return gebaut;
}

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad, koerper), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

async function erwarte(gebaut, pfad, status) {
  const ergebnis = await ruf(gebaut, pfad);
  pruefe(ergebnis.status === status,
    'GET ' + pfad + ' antwortet ' + ergebnis.status + ' statt ' + status
      + ': ' + JSON.stringify(ergebnis.daten));
  return ergebnis.daten;
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(flaeche.board === join(ABLAGE, 'board'),
    'Die Prüffläche meldet nicht ihren Board-Ordner: ' + flaeche.board);
  pruefe(flaeche.vorhaben === 'board-gesamtkonzept',
    'Die Prüffläche meldet nicht die Kennung des Vorhabens: ' + flaeche.vorhaben);

  const idee = readFileSync(join(VORLAGE, 'vorgaenge', 'board-gesamtkonzept', 'idee.md'), 'utf8');
  pruefe(idee.trim().length > 0, 'Der Text des Vorhabens ist leer');

  // Ein leeres Register und eine Identität: der Server liest nichts von der
  // echten Ablage. Das Testboard kommt allein über die Route dazu.
  schreibeJson(join(HOME, 'board', 'boards.json'), {
    format: 1, aktiv: null, boards: [],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();

  // 1. Das Testboard über seinen lokalen Ordner verbinden.
  const verbunden = await ruf(gebaut, '/board/boards', { adresse: flaeche.board });
  pruefe(verbunden.status === 200,
    'POST /board/boards antwortet ' + verbunden.status + ': ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.board === 'testboard',
    'Verbunden wurde nicht das Testboard: ' + JSON.stringify(verbunden.daten));
  pruefe(verbunden.daten.aktiv === 'testboard', 'Das Testboard ist nicht aktiv');

  const daten = await erwarte(gebaut, '/board/data', 200);
  pruefe(daten.aktiv === 'testboard', 'Aktiv ist nicht testboard: ' + daten.aktiv);
  pruefe(daten.format === 2, 'Die Antwort nennt nicht Format 2: ' + daten.format);
  pruefe(daten.vorgaenge.length === 1, 'Das Board zeigt nicht genau ein Vorhaben');
  const vorhaben = daten.vorgaenge[0];
  pruefe(vorhaben.id === 'board-gesamtkonzept',
    'Die Kennung des Vorhabens ist nicht board-gesamtkonzept: ' + vorhaben.id);
  pruefe(vorhaben.position === 'idee', 'Das Vorhaben steht nicht an idee: ' + vorhaben.position);

  // 2. Die Datei über beide Lese-Routen.
  const datei = await erwarte(gebaut,
    '/board/datei?vorhaben=board-gesamtkonzept&pfad=idee.md', 200);
  pruefe(datei.exists === true, 'idee.md gilt über /board/datei als nicht vorhanden');
  pruefe(datei.text === idee, 'Der Text aus /board/datei ist nicht der von idee.md');

  const doc = await erwarte(gebaut,
    '/board/doc?vorhaben=board-gesamtkonzept&datei=idee.md', 200);
  pruefe(doc.exists === true, 'idee.md gilt über /board/doc als nicht vorhanden');
  pruefe(doc.text === idee, 'Der Text aus /board/doc ist nicht der von idee.md');
  console.log('ok Datei: „Board Gesamtkonzept“ öffnet idee.md über /board/datei und /board/doc');

  // 3. Der Ordner listet die Datei.
  const liste = await erwarte(gebaut,
    '/board/dateien?vorhaben=board-gesamtkonzept&pfad=', 200);
  const eintrag = (liste.eintraege || []).find((e) => e.name === 'idee.md') || null;
  pruefe(eintrag && eintrag.art === 'datei', '/board/dateien listet idee.md nicht');
  console.log('ok Ordner: /board/dateien listet idee.md im Vorhaben-Repository');

  // 4. Ein fremdes Vorhaben: 404.
  await erwarte(gebaut, '/board/datei?vorhaben=fremd&pfad=idee.md', 404);
  await erwarte(gebaut, '/board/doc?vorhaben=fremd&datei=idee.md', 404);
  await erwarte(gebaut, '/board/dateien?vorhaben=fremd&pfad=', 404);
  console.log('ok Fremdes Vorhaben: 404, kein Zugriff von außen');

  // 5. Ein Pfad aus dem Repository heraus: 400.
  await erwarte(gebaut, '/board/datei?vorhaben=board-gesamtkonzept&pfad=../idee.md', 400);
  console.log('ok Pfad: ../idee.md bleibt im Vorhaben-Repository und antwortet 400');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* eine andere Prüfung läuft noch */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
