/**
 * Prüfung Schritt 25 — die Bibliothek: Stationen, Workflows, Vorhaben.
 *
 * Die fünf Repositories des Testboards liegen in einer eigenen Prüffläche
 * unter `/tmp/board-scheibe1/schritt25`, daneben ein eigenes `DSH_HOME`. Der
 * Server läuft in-process, ohne Netz.
 *
 * Geprüft wird `GET /board/data`:
 *
 *   1. Die Stationen (`schritte`) tragen `host` und `fassung`; die Namen der
 *      Personen stehen daneben in `personen`.
 *   2. Die Workflows tragen `titel`, `autor` und `fassung`, dazu ihren
 *      Repository-Pfad und ihre Stationen.
 *   3. Das Vorhaben trägt `workflow.fassung` und `verantwortet`.
 *   4. Aus denselben Daten lassen sich die drei Arten der Bibliothek bilden —
 *      jede mit Host beziehungsweise Fassung.
 *
 * Danach sind Server, Ablage und Home entfernt.
 */
import {
  existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt25');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');

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

function anfrage(pfad) {
  return {
    method: 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() {},
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

async function ruf(gebaut, pfad) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0]).handler(anfrage(pfad), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

let gebaut = null;
let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  const flaeche = legePruefflaeche({ wurzel: ABLAGE });
  pruefe(existsSync(join(flaeche.board, 'board.json')),
    'Die Prüffläche meldet keinen Board-Ordner: ' + flaeche.board);

  schreibeJson(REGISTER, {
    format: 1,
    aktiv: 'testboard',
    boards: [{
      id: 'testboard',
      name: 'Testboard',
      format: 2,
      art: 'team',
      repo: flaeche.board,
      remote: null,
      person: 'p1',
    }],
  });
  schreibeJson(join(HOME, 'board', 'identitaet.json'), {
    name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
  });

  gebaut = await starten();
  const antwort25 = await ruf(gebaut, '/board/data');
  pruefe(antwort25.status === 200, 'GET /board/data antwortet ' + antwort25.status
    + ': ' + JSON.stringify(antwort25.daten));
  const daten = antwort25.daten || {};
  pruefe(daten.format === 2,
    'GET /board/data nennt nicht Fassung 2: ' + JSON.stringify(daten.format));

  // 1. Stationen: jede mit Host und Fassung.
  const stationen = Array.isArray(daten.schritte) ? daten.schritte : [];
  pruefe(stationen.length === 2,
    'Die Stationen sind nicht vollständig: ' + JSON.stringify(stationen.map((s) => s.name)));
  pruefe(stationen.map((s) => s.name).join(',') === 'Idee,Umsetzen',
    'Die Stationen heißen nicht Idee und Umsetzen: '
      + JSON.stringify(stationen.map((s) => s.name)));
  for (const station of stationen) {
    pruefe(typeof station.host === 'string' && station.host.length > 0,
      'Station „' + station.id + '“ trägt keinen Host: ' + JSON.stringify(station.host));
    pruefe(typeof station.fassung === 'string' && station.fassung.length > 0,
      'Station „' + station.id + '“ trägt keine Fassung: ' + JSON.stringify(station.fassung));
    pruefe(station.fassung === 'v1',
      'Station „' + station.id + '“ trägt nicht die Fassung v1: '
        + JSON.stringify(station.fassung));
  }
  const personen = Array.isArray(daten.personen) ? daten.personen : [];
  const p1 = personen.find((p) => p && p.id === 'p1');
  pruefe(p1 && p1.name === 'Thomas Heinrich',
    'Die Person p1 fehlt oder ist nicht benannt: ' + JSON.stringify(personen));

  // 2. Workflows: Titel, Autor, Fassung — aus den Flächen der Personen.
  const flaechen = Array.isArray(daten.workflows) ? daten.workflows : [];
  const workflows = [];
  for (const person of flaechen) {
    for (const workflow of (person.workflows || [])) {
      workflows.push({ person, workflow });
    }
  }
  pruefe(workflows.length === 1,
    'Es sind nicht genau ein Workflow: ' + JSON.stringify(workflows.map((w) => w.workflow.id)));
  const workflow = workflows[0].workflow;
  pruefe(workflow.titel === 'Standard-Workflow',
    'Der Workflow trägt nicht seinen Titel: ' + JSON.stringify(workflow.titel));
  pruefe(workflow.autor === 'p1',
    'Der Workflow trägt nicht seinen Autor: ' + JSON.stringify(workflow.autor));
  pruefe(workflow.fassung === 'v1',
    'Der Workflow trägt nicht seine Fassung: ' + JSON.stringify(workflow.fassung));
  pruefe(typeof workflow.repo === 'string' && workflow.repo.endsWith('/workflow'),
    'Dem Workflow fehlt der Repository-Pfad: ' + JSON.stringify(workflow.repo));
  pruefe(Array.isArray(workflow.schritte) && workflow.schritte.length === 2,
    'Der Workflow nennt nicht seine zwei Stationen: '
      + JSON.stringify((workflow.schritte || []).map((s) => s.name)));

  // 3. Vorhaben: Workflow-Fassung und Verantwortliche.
  const vorgaenge = Array.isArray(daten.vorgaenge) ? daten.vorgaenge : [];
  pruefe(vorgaenge.length === 1,
    'Es ist nicht genau ein Vorhaben: ' + JSON.stringify(vorgaenge.map((v) => v.id)));
  const vorgang = vorgaenge[0];
  pruefe(vorgang.name === 'Board Gesamtkonzept',
    'Das Vorhaben trägt nicht seinen Namen: ' + JSON.stringify(vorgang.name));
  pruefe(vorgang.workflow && vorgang.workflow.fassung === 'v1',
    'Das Vorhaben trägt nicht die Fassung seines Workflows: '
      + JSON.stringify(vorgang.workflow));
  pruefe(vorgang.workflow && typeof vorgang.workflow.repo === 'string'
    && vorgang.workflow.repo.endsWith('/workflow'),
  'Das Vorhaben trägt nicht den Verweis auf seinen Workflow: '
    + JSON.stringify(vorgang.workflow));
  pruefe(vorgang.verantwortet === 'Thomas Heinrich',
    'Das Vorhaben trägt nicht seine Verantwortliche: '
      + JSON.stringify(vorgang.verantwortet));
  pruefe(typeof vorgang.repo === 'string' && vorgang.repo.endsWith('/vorhaben'),
    'Dem Vorhaben fehlt der Repository-Pfad: ' + JSON.stringify(vorgang.repo));
  pruefe(Array.isArray(vorgang.dateien)
    && vorgang.dateien.includes('vorhaben.json') && vorgang.dateien.includes('idee.md'),
  'Dem Vorhaben fehlen seine Dateien: ' + JSON.stringify(vorgang.dateien));

  // 4. Die drei Arten sind aus denselben Daten bildbar — jede mit Host
  // beziehungsweise Fassung, die Einzelheit mit ihrem Repository-Pfad.
  const dreiArten = {
    stationen: stationen.map((station) => ({
      name: station.name,
      host: station.host,
      fassung: station.fassung,
    })),
    workflows: workflows.map((eintrag) => {
      const w = eintrag.workflow;
      return {
        titel: w.titel,
        autor: w.autor,
        fassung: w.fassung,
        stationen: (w.schritte || []).length,
        repo: w.repo,
      };
    }),
    vorhaben: vorgaenge.map((v) => ({
      name: v.name,
      station: v.position,
      verantwortet: v.verantwortet,
      fassung: v.workflow && v.workflow.fassung,
      repo: v.repo,
      dateien: v.dateien,
    })),
  };
  pruefe(dreiArten.stationen.length && dreiArten.workflows.length
    && dreiArten.vorhaben.length,
  'Die drei Arten sind nicht aus den Daten bildbar: ' + JSON.stringify(dreiArten));
  pruefe(dreiArten.stationen.every((s) => s.host && s.fassung),
    'Einer Stationskarte fehlt Host oder Fassung: ' + JSON.stringify(dreiArten.stationen));
  pruefe(dreiArten.workflows.every((w) => w.titel && w.autor && w.fassung),
    'Einer Workflowkarte fehlt Titel, Autor oder Fassung: '
      + JSON.stringify(dreiArten.workflows));
  pruefe(dreiArten.vorhaben.every((v) => v.name && v.verantwortet && v.fassung),
    'Einer Vorhabenkarte fehlt Name, Verantwortliche oder Fassung: '
      + JSON.stringify(dreiArten.vorhaben));

  console.log('ok Bibliothek: Stationen „Idee“ und „Umsetzen“ (Host p1, Fassung v1); '
    + 'Workflow „Standard-Workflow“ (Autor p1, Fassung v1, 2 Stationen); '
    + 'Vorhaben „Board Gesamtkonzept“ (Fassung v1, verantwortet von Thomas Heinrich)');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage und Home aufgeräumt: ' + ABLAGE);
