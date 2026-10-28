/**
 * Prüfung Schritt 03 — die Ablage trägt Personen, Workflows und Vorhaben.
 *
 * Kopiert die Ablage nach /tmp, entfernt in der Kopie `board.json`, lädt das
 * Modul mit der Kopie als `repo` und ruft `/board/data` und `/board/doc` auf.
 * Verglichen wird mit dem Abzug der laufenden Seite (`/tmp/board-vorher.json`):
 * dieselben Vorhaben, dieselben Schritte je Vorhaben, dieselben Personen und
 * dieselben Positionen. Danach schreibt eine Route eine Datei — sie muss im
 * Prüf-Repository liegen, und die Fassung muss den Urheber nennen.
 *
 * Die echte Ablage wird nicht angefasst.
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
const NAME = 'Thomas Heinrich';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt03-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

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

function anfrage(pfad, koerper, methode) {
  return {
    method: methode || (koerper ? 'POST' : 'GET'),
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

function kennungen(liste) {
  return liste.map((v) => String(v.id)).sort();
}

function lage(positionen) {
  return positionen
    .map((p) => [p.id, p.schritt, p.x, p.y].join('|'))
    .sort();
}

try {
  // 1. Die Ablage als Kopie — ohne board.json. Das Produkt als Kopie mit
  //    eigener Konfiguration; die echte Ablage bleibt unberührt.
  cpSync(ABLAGE, ablage, { recursive: true });
  // Die Kopie trägt den echten Remote mit. Sie darf nie dorthin schreiben.
  spawnSync('git', ['-C', ablage, 'remote', 'remove', 'origin']);
  rmSync(join(ablage, 'board.json'), { force: true });
  pruefe(!existsSync(join(ablage, 'board.json')), 'board.json liegt noch in der Kopie');
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');

  // Der Vergleichsstand kommt aus derselben Ablage, nicht aus einem alten
  // Abzug: der wäre nach jeder Änderung am Board veraltet.
  const { liesAblage } = await import(pathToFileURL(join(kopie, 'ablage.js')).href);
  const vorher = liesAblage({ repo: ablage, person: 'p1', home });

  // Die persönlichen Seiten: Einstellungen und Gespräche stehen nicht in der
  // Ablage, gehören aber zum Abzug der Seite.
  mkdirSync(join(home, 'board'), { recursive: true });
  writeFileSync(join(home, 'board', 'einstellungen.json'),
    JSON.stringify(vorher.einstellungen || {}, null, 2) + '\n', 'utf8');
  const gespraeche = {};
  for (const v of vorher.vorgaenge || []) {
    if (Array.isArray(v.gespraeche) && v.gespraeche.length) gespraeche[v.id] = v.gespraeche;
  }
  writeFileSync(join(home, 'board', 'gespraeche.json'),
    JSON.stringify(gespraeche, null, 2) + '\n', 'utf8');

  process.env.DSH_HOME = home;
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  // 2. /board/data gegen den Abzug der laufenden Seite.
  const datenRoute = gebaut.routen.get('/board/data');
  pruefe(datenRoute && typeof datenRoute.handler === 'function', 'Die Route /board/data fehlt');
  const resDaten = antwort();
  datenRoute.handler(anfrage('/board/data'), resDaten);
  const nachher = alsJson(resDaten, '/board/data');

  pruefe(Object.keys(nachher).sort().join(',')
    === 'aktiv,beitraege,boards,einstellungen,format,formatAblage,hauptboard,identitaet,'
      + 'person,personen,repo,stand,vorgaenge,workflows',
  'Die Form von /board/data ist nicht { person, repo, format, formatAblage, workflows, '
    + 'vorgaenge, beitraege, personen, einstellungen, stand, identitaet, boards }: '
    + Object.keys(nachher).sort().join(', '));
  // Die beiden Werte kommen aus der Konfiguration.
  pruefe(nachher.person === 'p1' && nachher.repo === ablage,
    '/board/data nennt nicht die eigene Person und den Ablageort: '
      + JSON.stringify({ person: nachher.person, repo: nachher.repo }));

  // 2b. /board/konfiguration: wer bin ich, wo liegt was.
  const konfigRoute = gebaut.routen.get('/board/konfiguration');
  pruefe(konfigRoute && typeof konfigRoute.handler === 'function',
    'Die Route /board/konfiguration fehlt');
  const resKonfig = antwort();
  await konfigRoute.handler(anfrage('/board/konfiguration'), resKonfig);
  const konfig = alsJson(resKonfig, '/board/konfiguration');
  pruefe(Object.keys(konfig).sort().join(',') === 'format,person,remote,repo',
    'Die Form von /board/konfiguration ist nicht { person, repo, remote, format }: '
      + Object.keys(konfig).sort().join(', '));
  pruefe(konfig.person === 'p1' && konfig.repo === ablage && konfig.format === 1,
    '/board/konfiguration nennt nicht Person, Ablage und Format: ' + JSON.stringify(konfig));
  pruefe(konfig.remote === null || typeof konfig.remote === 'string',
    'Der Remote ist weder Zeichenkette noch null: ' + JSON.stringify(konfig.remote));

  // Eine Fläche je Person, die eigene zuerst. Der eigene Workflow steht als
  // erster Workflow der eigenen Person darin — die alten Schlüssel `workflow`
  // und `schritte` gibt es nicht mehr.
  pruefe(Array.isArray(nachher.workflows) && nachher.workflows.length > 0,
    '/board/data liefert keine workflows');
  const eigene = nachher.workflows[0];
  pruefe(eigene && eigene.ich === true, 'Die eigene Person steht nicht zuerst');
  pruefe(nachher.workflows.filter((p) => p.ich).length === 1,
    '`ich` steht nicht genau einmal in workflows');
  pruefe(typeof eigene.name === 'string' && /^#[0-9a-f]{6}$/i.test(eigene.farbe || ''),
    'Die eigene Fläche trägt keinen Namen oder keine Farbe');
  const eigenerWorkflow = eigene.workflows && eigene.workflows[0];
  pruefe(!!eigenerWorkflow, 'Die eigene Person hat keinen Workflow');

  pruefe(nachher.vorgaenge.length === vorher.vorgaenge.length,
    'Zahl der Vorhaben: ' + nachher.vorgaenge.length + ' statt ' + vorher.vorgaenge.length);
  pruefe(kennungen(nachher.vorgaenge).join(',') === kennungen(vorher.vorgaenge).join(','),
    'Vorhaben-Kennungen: ' + kennungen(nachher.vorgaenge).join(', '));

  const vorherPositionen = new Map((vorher.workflow.positionen || []).map((p) => [p.id, p]));
  for (const p of eigenerWorkflow.positionen || []) {
    const alt = vorherPositionen.get(p.id);
    pruefe(!!alt, 'Position fehlt im Abzug: ' + p.id);
    pruefe(p.schritt === alt.schritt, 'Position „' + p.id + '“ verweist auf '
      + p.schritt + ' statt auf ' + alt.schritt);
    pruefe(p.x === alt.x && p.y === alt.y, 'Position „' + p.id + '“ liegt bei '
      + p.x + '/' + p.y + ' statt bei ' + alt.x + '/' + alt.y);
  }
  pruefe((eigenerWorkflow.positionen || []).length === (vorher.workflow.positionen || []).length,
    'Zahl der Positionen: ' + (eigenerWorkflow.positionen || []).length
      + ' statt ' + (vorher.workflow.positionen || []).length);
  pruefe(lage(eigenerWorkflow.positionen || []).join(',')
    === lage(vorher.workflow.positionen || []).join(','),
  'Die Positionen sind nicht dieselben');

  pruefe(kennungen(eigenerWorkflow.schritte || []).join(',')
    === kennungen(vorher.schritte || []).join(','),
  'Schrittkennungen: ' + kennungen(eigenerWorkflow.schritte || []).join(', '));

  // Je Vorhaben: die Kennung des Schritts, an dem es steht.
  const vorherVorhaben = new Map((vorher.vorgaenge || []).map((v) => [v.id, v]));
  for (const v of nachher.vorgaenge) {
    const alt = vorherVorhaben.get(v.id);
    pruefe(!!alt, 'Vorhaben fehlt im Abzug: ' + v.id);
    pruefe(v.position === alt.position, 'Vorhaben „' + v.name + '“ steht an '
      + v.position + ' statt an ' + alt.position);
    const p = (eigenerWorkflow.positionen || []).find((x) => x.id === v.position);
    const altP = (vorher.workflow.positionen || []).find((x) => x.id === alt.position);
    pruefe(!!p && !!altP && p.schritt === altP.schritt,
      'Vorhaben „' + v.name + '“ zeigt auf einen anderen Schritt');
  }

  // Personen mit `ich` aus der Konfiguration.
  const personen = nachher.personen.map((p) => [p.id, p.name, p.farbe, p.ich].join('|')).sort();
  const altPersonen = vorher.personen.map((p) => [p.id, p.name, p.farbe, p.ich].join('|')).sort();
  pruefe(personen.join(',') === altPersonen.join(','),
    'Personen: ' + personen.join(', ') + ' statt ' + altPersonen.join(', '));

  pruefe(JSON.stringify(nachher.einstellungen) === JSON.stringify(vorher.einstellungen),
    'Einstellungen: ' + JSON.stringify(nachher.einstellungen));

  // 3. /board/doc liest eine Datei aus demselben Vorhaben.
  const docRoute = gebaut.routen.get('/board/doc');
  pruefe(docRoute && typeof docRoute.handler === 'function', 'Die Route /board/doc fehlt');
  const resDoc = antwort();
  docRoute.handler(anfrage('/board/doc?vorhaben=board-gesamtkonzept&datei=architektur.md'), resDoc);
  const doc = alsJson(resDoc, '/board/doc');
  const original = readFileSync(join(ABLAGE, 'vorgaenge', 'board-gesamtkonzept', 'architektur.md'), 'utf8');
  pruefe(doc.exists === true && doc.text === original,
    '/board/doc liefert nicht architektur.md aus dem Vorhaben');

  // 4. Eine Datei über die Route ändern: sie liegt im Prüf-Repository, und die
  //    Fassung nennt den Urheber.
  const schreiben = gebaut.routen.get('/board/doc/schreiben');
  pruefe(schreiben && typeof schreiben.handler === 'function',
    'Die Route /board/doc/schreiben fehlt');
  const resSchreiben = antwort();
  await schreiben.handler(anfrage('/board/doc/schreiben', {
    vorhaben: 'board-gesamtkonzept',
    datei: 'notiz-umzug.md',
    text: 'Ein Satz aus der Prüfung.\n',
  }), resSchreiben);
  pruefe(resSchreiben.status === 200,
    '/board/doc/schreiben antwortet ' + resSchreiben.status + ': ' + resSchreiben.text);
  const geschrieben = readFileSync(
    join(ablage, 'vorgaenge', 'board-gesamtkonzept', 'notiz-umzug.md'), 'utf8');
  pruefe(geschrieben === 'Ein Satz aus der Prüfung.\n',
    'Die geschriebene Datei ist nicht im Prüf-Repository');
  const autor = git(['-C', ablage, 'log', '-1', '--format=%an']).out;
  const nachricht = git(['-C', ablage, 'log', '-1', '--format=%s']).out;
  pruefe(autor === NAME, 'Die Fassung nennt „' + autor + '“ statt „' + NAME + '“');

  gebaut.aufraeumen.forEach((ende) => ende());

  console.log('ok Kopie: ' + ablage + ' (ohne board.json)');
  console.log('ok /board/data: ' + nachher.vorgaenge.length + ' Vorhaben, '
    + (eigenerWorkflow.positionen || []).length + ' Positionen, '
    + (eigenerWorkflow.schritte || []).length + ' Schritte, ' + nachher.personen.length + ' Person');
  console.log('ok workflows: ' + nachher.workflows.length + ' Fläche(n), eigene zuerst: '
    + nachher.workflows.map((p) => p.id + (p.ich ? '*' : '')).join(', '));
  console.log('ok Vorhaben: ' + kennungen(nachher.vorgaenge).join(', '));
  console.log('ok Positionen: ' + lage(eigenerWorkflow.positionen || []).join('; '));
  console.log('ok Personen: ' + personen.join(', '));
  console.log('ok /board/doc: architektur.md, ' + doc.text.length + ' Zeichen');
  console.log('ok Route schreibt: vorgaenge/board-gesamtkonzept/notiz-umzug.md');
  console.log('ok Fassung: ' + autor + ' — ' + nachricht);
  rmSync(stamm, { recursive: true, force: true });
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
