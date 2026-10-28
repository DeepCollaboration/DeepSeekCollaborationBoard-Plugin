/**
 * Prüfung Schritt 04 — der Abgleich holt und gibt.
 *
 * In /tmp entsteht ein nacktes Repository als `origin` und daneben zwei Klone.
 * Das Modul läuft mit dem ersten Klon und einer eigenen board.config.json.
 * Geprüft wird:
 *
 *   1. eine Änderung aus dem zweiten Klon kommt über POST /board/sync an;
 *   2. eine Speicherung über eine schreibende Route liegt nach dem Abgleich
 *      im nackten origin;
 *   3. /board/data holt vor dem Lesen (ohne eigenen POST);
 *   4. ohne `origin` antwortet /board/data weiter und sagt „kein remote“.
 *
 * Die echte Ablage wird nicht angefasst; alles spielt in /tmp.
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
const NAME = 'Thomas Heinrich';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt04-'));
const origin = join(stamm, 'origin.git');
const saat = join(stamm, 'saat');
const klon1 = join(stamm, 'klon-1');
const klon2 = join(stamm, 'klon-2');
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

function gitIn(repo, args) {
  return git(['-C', repo, ...args]);
}

function adresse(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@board';
}

/** Einen Stand mit einem bestimmten Urheber festschreiben. */
function festschreiben(repo, autor, nachricht) {
  const add = gitIn(repo, ['add', '-A']);
  pruefe(add.ok, 'git add in ' + repo + ' scheitert: ' + add.fehler);
  const commit = gitIn(repo, [
    '-c', 'user.name=' + autor, '-c', 'user.email=' + adresse(autor),
    'commit', '-m', nachricht,
  ]);
  pruefe(commit.ok, 'git commit in ' + repo + ' scheitert: ' + commit.fehler);
  return commit;
}

function schieben(repo) {
  const push = gitIn(repo, ['push', 'origin', 'main']);
  pruefe(push.ok, 'git push aus ' + repo + ' scheitert: ' + push.fehler);
  return push;
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
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

/** Das Produkt als Kopie mit eigener Konfiguration laden. */
async function modulMit(repo, name) {
  const kopie = join(stamm, name);
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo,
  }, null, 2) + '\n', 'utf8');
  const gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);
  return gebaut;
}

function datenHolen(gebaut) {
  const route = gebaut.routen.get('/board/data');
  pruefe(route && typeof route.handler === 'function', 'Die Route /board/data fehlt');
  const res = antwort();
  route.handler(anfrage('/board/data'), res);
  return alsJson(res, '/board/data');
}

async function syncRufen(gebaut) {
  const route = gebaut.routen.get('/board/sync');
  pruefe(route && typeof route.handler === 'function', 'Die Route /board/sync fehlt');
  const res = antwort();
  await route.handler(anfrage('/board/sync', {}), res);
  return alsJson(res, '/board/sync');
}

async function schreibenRufen(gebaut, koerper) {
  const route = gebaut.routen.get('/board/doc/schreiben');
  pruefe(route && typeof route.handler === 'function',
    'Die Route /board/doc/schreiben fehlt');
  const res = antwort();
  await route.handler(anfrage('/board/doc/schreiben', koerper), res);
  pruefe(res.status === 200, 'Speichern antwortet ' + res.status + ': ' + res.text);
  return res;
}

function standPruefen(daten, was) {
  pruefe(daten.stand && typeof daten.stand === 'object', was + ': stand fehlt');
  const zeit = daten.stand.zeit;
  pruefe(typeof zeit === 'string' && !Number.isNaN(Date.parse(zeit)),
    was + ': stand.zeit ist nicht gesetzt (' + JSON.stringify(zeit) + ')');
  pruefe(daten.stand.nur_lokal === 0,
    was + ': nur_lokal ist ' + daten.stand.nur_lokal + ' statt 0');
  pruefe(daten.stand.remote === origin,
    was + ': stand.remote ist ' + JSON.stringify(daten.stand.remote)
      + ' statt ' + JSON.stringify(origin));
  pruefe(daten.stand.lage === 'abgeglichen',
    was + ': stand.lage ist ' + JSON.stringify(daten.stand.lage));
}

let gebaut1 = null;
let gebaut2 = null;

try {
  // 1. Das nackte Repository als origin und ein erster Stand darin.
  pruefe(git(['init', '--bare', origin]).ok, 'Das nackte Repository entsteht nicht');
  pruefe(gitIn(origin, ['symbolic-ref', 'HEAD', 'refs/heads/main']).ok,
    'Der nackte origin steht nicht auf main');

  mkdirSync(saat, { recursive: true });
  writeFileSync(join(saat, 'format'), '1\n', 'utf8');
  schreibeJson(join(saat, 'personen', 'p1.json'), {
    id: 'p1', name: NAME, farbe: '#fbbf24',
  });
  schreibeJson(join(saat, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'standard',
      titel: 'Abgleich',
      schritte: [{
        id: 'notiz',
        name: 'Notiz',
        host: 'p1',
        eingang: [],
        ausgabe: ['notiz.md'],
        wie: { art: 'textfeld', wert: '' },
        skill: null,
      }],
      positionen: [{ id: 'pos1', schritt: 'notiz', x: 50, y: 80 }],
      kanten: [],
      layout: 'auto',
    }],
  });
  schreibeJson(join(saat, 'vorgaenge', 'probe', 'vorhaben.json'), {
    id: 'probe',
    name: 'Probe',
    position: 'pos1',
    // Schreiben verlangt seit Schritt 06/07 einen Verantwortlichen an der
    // Station; der Prüf-Klon gehört p1.
    verantwortliche: { pos1: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [],
    fork_von: null,
    zweig_von: null,
  });

  pruefe(git(['init', saat]).ok, 'Das Ausgangs-Repository entsteht nicht');
  pruefe(gitIn(saat, ['symbolic-ref', 'HEAD', 'refs/heads/main']).ok,
    'Das Ausgangs-Repository steht nicht auf main');
  festschreiben(saat, NAME, 'Erste Fassung der Probe');
  pruefe(gitIn(saat, ['remote', 'add', 'origin', origin]).ok,
    'origin lässt sich nicht eintragen');
  schieben(saat);

  // 2. Zweimal klonen: der eine Klon ist die Ablage, der andere die Person
  //    daneben.
  const k1 = git(['clone', origin, klon1]);
  pruefe(k1.ok, 'Der erste Klon scheitert: ' + k1.fehler);
  const k2 = git(['clone', origin, klon2]);
  pruefe(k2.ok, 'Der zweite Klon scheitert: ' + k2.fehler);
  pruefe(gitIn(klon1, ['rev-parse', '--abbrev-ref', 'HEAD']).out === 'main',
    'Der erste Klon steht nicht auf main');

  process.env.DSH_HOME = home;
  gebaut1 = await modulMit(klon1, 'produkt-1');
  pruefe(gebaut1.routen.has('/board/sync'), 'Die Route /board/sync fehlt');

  // 3. Die andere Person ändert eine Datei, schreibt fest und schiebt. Der
  //    Abgleich im Modul holt sie in den ersten Klon.
  const vonAnderer = 'Von der anderen Person.\n';
  writeFileSync(join(klon2, 'vorgaenge', 'probe', 'von-anderer.md'), vonAnderer, 'utf8');
  festschreiben(klon2, 'Andere Person', 'Notiz der anderen Person');
  schieben(klon2);

  const sync1 = await syncRufen(gebaut1);
  pruefe(sync1.geholt === true && sync1.gegeben === true,
    'POST /board/sync meldet geholt=' + sync1.geholt + ', gegeben=' + sync1.gegeben);
  pruefe(sync1.lage === 'abgeglichen', 'POST /board/sync meldet ' + sync1.lage);
  const geholt = readFileSync(join(klon1, 'vorgaenge', 'probe', 'von-anderer.md'), 'utf8');
  pruefe(geholt === vonAnderer, 'Die Änderung aus dem zweiten Klon fehlt im ersten');

  const daten1 = datenHolen(gebaut1);
  standPruefen(daten1, '/board/data nach dem Holen');
  // Die neue Form: eine Fläche je Person. Die alten Schlüssel der Antwort
  // (`workflow`, `schritte`) gibt es nicht mehr.
  pruefe(Array.isArray(daten1.workflows) && daten1.workflows.length === 1,
    '/board/data liefert nicht genau eine Fläche: '
      + (Array.isArray(daten1.workflows) ? daten1.workflows.length : 'keine'));
  pruefe(daten1.workflows[0].ich === true
    && daten1.workflows[0].workflows.length === 1,
  'Die eigene Fläche fehlt in /board/data');
  pruefe(!('workflow' in daten1) && !('schritte' in daten1),
    '/board/data trägt noch die alten Schlüssel workflow/schritte');
  console.log('ok POST /board/sync holt: von-anderer.md, lage abgeglichen');
  console.log('ok stand: zeit gesetzt, nur_lokal 0, remote ' + origin);

  // 4. Über eine schreibende Route speichern und abgleichen: die Fassung
  //    liegt im nackten origin.
  const gespeichert = 'Ein Satz aus dem Board.\n';
  await schreibenRufen(gebaut1, {
    vorhaben: 'probe',
    datei: 'notiz.md',
    text: gespeichert,
  });
  pruefe(readFileSync(join(klon1, 'vorgaenge', 'probe', 'notiz.md'), 'utf8') === gespeichert,
    'Die Speicherung liegt nicht im ersten Klon');

  const sync2 = await syncRufen(gebaut1);
  pruefe(sync2.lage === 'abgeglichen', 'Der Abgleich nach dem Speichern meldet ' + sync2.lage);
  const imOrigin = gitIn(origin, ['show', 'main:vorgaenge/probe/notiz.md']);
  pruefe(imOrigin.ok, 'Die Fassung liegt nicht im nackten origin: ' + imOrigin.fehler);
  pruefe(imOrigin.out === 'Ein Satz aus dem Board.',
    'Im origin steht ' + JSON.stringify(imOrigin.out));
  const verlauf = gitIn(origin, ['log', '--format=%s', 'main']);
  pruefe(verlauf.out.split('\n').includes('„notiz.md“ gespeichert'),
    'Im origin fehlt die Fassung „notiz.md gespeichert“: ' + verlauf.out);
  standPruefen(datenHolen(gebaut1), '/board/data nach dem Geben');
  console.log('ok Speichern + POST /board/sync: notiz.md liegt im nackten origin');

  // 5. Vor dem Lesen: ein zweiter, frischer Modullauf holt die nächste
  //    Änderung ohne eigenen POST /board/sync.
  const nachziehen = gitIn(klon2, ['pull', '--rebase']);
  pruefe(nachziehen.ok, 'Der zweite Klon kommt nicht auf den neuen Stand: '
    + nachziehen.fehler);
  const beimLesen = 'Beim Lesen geholt.\n';
  writeFileSync(join(klon2, 'vorgaenge', 'probe', 'vor-dem-lesen.md'), beimLesen, 'utf8');
  festschreiben(klon2, 'Andere Person', 'Beim Lesen geholt');
  schieben(klon2);
  pruefe(!existsSync(join(klon1, 'vorgaenge', 'probe', 'vor-dem-lesen.md')),
    'Die Änderung war vor dem Lesen schon im ersten Klon');

  gebaut2 = await modulMit(klon1, 'produkt-2');
  const daten2 = datenHolen(gebaut2);
  pruefe(existsSync(join(klon1, 'vorgaenge', 'probe', 'vor-dem-lesen.md')),
    '/board/data hat vor dem Lesen nicht geholt');
  standPruefen(daten2, '/board/data vor dem Lesen');
  console.log('ok /board/data holt vor dem Lesen: vor-dem-lesen.md ist da');

  // 6. Ohne origin öffnet das Board weiter und sagt „kein remote“.
  const weg = gitIn(klon1, ['remote', 'remove', 'origin']);
  pruefe(weg.ok, 'origin lässt sich nicht entfernen: ' + weg.fehler);
  const daten3 = datenHolen(gebaut2);
  pruefe(Array.isArray(daten3.vorgaenge) && daten3.vorgaenge.length === 1,
    '/board/data liefert ohne Remote nicht mehr das Vorhaben');
  pruefe(daten3.stand.lage === 'kein remote',
    'stand.lage ist ohne Remote ' + JSON.stringify(daten3.stand.lage));
  pruefe(daten3.stand.remote === null,
    'stand.remote ist ohne Remote ' + JSON.stringify(daten3.stand.remote));
  const syncOhne = await syncRufen(gebaut2);
  pruefe(syncOhne.lage === 'kein remote' && syncOhne.geholt === false
    && syncOhne.gegeben === false,
  'POST /board/sync ohne Remote meldet ' + JSON.stringify(syncOhne));
  console.log('ok ohne remote: /board/data antwortet, lage kein remote, remote null');

  gebaut1.aufraeumen.forEach((ende) => ende());
  gebaut2.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut1) gebaut1.aufraeumen.forEach((ende) => ende());
  if (gebaut2) gebaut2.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
