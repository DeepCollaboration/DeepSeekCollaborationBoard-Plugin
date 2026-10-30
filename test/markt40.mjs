/**
 * Prüfung Schritt 40 — die alte Beitragsablage ist weg.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt40`. Eine alte Ablage
 * der Fassung 1 wird kopiert angelegt; der Server läuft in-process, ohne Netz.
 * Ein kleiner HTTP-Server auf `127.0.0.1` verteilt die angemeldeten Routen und
 * antwortet auf alles andere mit 404 — so wird der Weg geprüft, den auch ein
 * echter Aufruf nimmt.
 *
 * Geprüft wird:
 *
 *   1. `POST /board/beitrag` und `POST /board/beitrag/entscheiden` antworten
 *      404; es entsteht kein `beitraege/`-Ordner und keine Fassung.
 *   2. `POST /board/vorhaben/forken` antwortet 404; es entsteht kein lokaler
 *      Fork und keine Fassung.
 *   3. `/board/github/beitrag` und `/board/github/fork` bleiben erreichbar
 *      (kein 404).
 *   4. Alte Beitragsdaten bleiben lesbar: `/board/data` nennt den Beitrag mit
 *      Notiz und den Namen der vorgeschlagenen Fassung; die Datei bleibt
 *      unverändert.
 *   5. Die Seite ruft die alten Wege nicht mehr auf (Quelltext).
 */
import { createServer } from 'node:http';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'markt40');
const HOME = join(ABLAGE, 'home');
const KOPIE = join(ABLAGE, 'produkt');
const REPO = join(ABLAGE, 'board');
const VORHABEN = 'altes-vorhaben';
const BEITRAG = 'alt-1';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/**
 * Eine Ablage der Fassung 1 mit Person, Workflow und einem Vorhaben. Die alte
 * Beitragsablage fehlt zuerst bewusst: nach den alten Wegen darf sie nicht
 * entstanden sein.
 */
function legeAlteAblage() {
  mkdirSync(join(REPO, 'personen'), { recursive: true });
  mkdirSync(join(REPO, 'workflows'), { recursive: true });
  writeFileSync(join(REPO, 'format'), '1\n', 'utf8');
  schreibeJson(join(REPO, 'personen', 'p1.json'), {
    id: 'p1',
    name: 'Alte Hüterin',
    farbe: '#fbbf24',
  });
  schreibeJson(join(REPO, 'workflows', 'p1.json'), {
    person: 'p1',
    workflows: [{
      id: 'alt',
      titel: 'Alte Kette',
      layout: 'auto',
      schritte: [{
        id: 'start',
        name: 'Anfang',
        host: 'p1',
        eingang: [],
        ausgabe: ['idee.md'],
        wie: { art: 'textfeld', wert: '' },
        inhalt: 'Der Anfang.',
      }],
      positionen: [{ id: 'start', schritt: 'start', x: 40, y: 80 }],
      kanten: [],
    }],
  });
  const vorgang = join(REPO, 'vorgaenge', VORHABEN);
  mkdirSync(vorgang, { recursive: true });
  schreibeJson(join(vorgang, 'vorhaben.json'), {
    id: VORHABEN,
    name: 'Altes Vorhaben',
    position: 'start',
    verantwortliche: { start: ['p1'] },
    regel: 'einer',
    rueckkehr: [],
    laeufe: [],
    fork_von: null,
    zweig_von: null,
  });
  writeFileSync(join(vorgang, 'idee.md'), '# Idee\n\nDer alte Inhalt.\n', 'utf8');

  git(REPO, ['init', '-q', '-b', 'main']);
  git(REPO, ['add', '-A']);
  git(REPO, [
    '-c', 'user.name=Alte Ablage',
    '-c', 'user.email=alte-ablage@board',
    'commit', '-q', '-m', 'Alte Ablage',
  ]);
}

/** Die alten Beitragsdaten: eine Notiz und eine vorgeschlagene Fassung. */
function legeAltenBeitrag() {
  const ordner = join(REPO, 'beitraege', VORHABEN);
  schreibeJson(join(ordner, BEITRAG + '.json'), {
    id: BEITRAG,
    vorhaben: VORHABEN,
    schritt: 'start',
    von: 'Alte Hüterin',
    seit: '2026-01-02T03:04:05.000Z',
    basis: null,
    notiz: 'Dieser alte Vorschlag bleibt lesbar.',
    dateien: [{
      name: 'idee.md',
      datei: 'beitraege/' + VORHABEN + '/' + BEITRAG + '/idee.md',
    }],
    entschieden: null,
  });
  mkdirSync(join(ordner, BEITRAG), { recursive: true });
  writeFileSync(join(ordner, BEITRAG, 'idee.md'),
    '# Idee\n\nDer alte vorgeschlagene Inhalt.\n', 'utf8');
}

/* --- Der Server in-process ----------------------------------------------- */

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

let server = null;
let basis = '';
let gebaut = null;

function starteServer() {
  return new Promise((erfuellt, abgelehnt) => {
    const s = createServer(async (req, res) => {
      let roh = '';
      for await (const stueck of req) roh += stueck;
      const adresse = new URL(req.url, 'http://127.0.0.1');
      const route = gebaut.routen.get(adresse.pathname);
      const senden = (status, wert) => {
        const text = JSON.stringify(wert);
        res.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
      };
      if (!route) {
        senden(404, { error: 'Nicht gefunden' });
        return;
      }
      const anfrage = {
        method: req.method,
        url: req.url,
        async *[Symbol.asyncIterator]() {
          if (roh) yield Buffer.from(roh, 'utf8');
        },
      };
      const antwort = {
        status: 0,
        text: '',
        writeHead(status) { this.status = status; },
        end(text) { this.text = String(text == null ? '' : text); },
      };
      try {
        await route.handler(anfrage, antwort);
      } catch (fehler) {
        senden(500, { error: String((fehler && fehler.message) || fehler) });
        return;
      }
      senden(antwort.status || 200, antwort.text ? JSON.parse(antwort.text) : {});
    });
    s.once('error', abgelehnt);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      basis = 'http://127.0.0.1:' + s.address().port;
      erfuellt();
    });
  });
}

function stoppeServer() {
  return new Promise((fertig) => {
    if (!server) { fertig(); return; }
    const s = server;
    server = null;
    s.close(() => fertig());
    if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
  });
}

async function ruf(pfad, koerper) {
  const antwort = await fetch(basis + pfad, {
    method: koerper === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
  });
  const text = await antwort.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
  return { status: antwort.status, text, daten };
}

/* --- Die Prüfung --------------------------------------------------------- */

let bestanden = false;
rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });
  legeAlteAblage();

  cpSync(PRODUKT, KOPIE, { recursive: true });
  writeFileSync(join(KOPIE, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: REPO,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(HOME, { recursive: true });
  process.env.DSH_HOME = HOME;

  const modul = await import(pathToFileURL(join(KOPIE, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  gebaut = ctxBauen();
  modul.apply(gebaut.ctx);

  // Die alten Wege sind gar nicht mehr angemeldet.
  for (const pfad of ['/board/beitrag', '/board/beitrag/entscheiden',
    '/board/vorhaben/forken']) {
    pruefe(!gebaut.routen.has(pfad), 'Die alte Route ' + pfad + ' ist noch angemeldet');
  }

  await starteServer();

  const kopfVorher = git(REPO, ['rev-parse', 'HEAD']);
  const baumVorher = git(REPO, ['status', '--porcelain']);

  // 1. Der alte Beitragsweg: 404, kein Ordner, keine Fassung.
  const beitrag = await ruf('/board/beitrag', {
    vorhaben: VORHABEN,
    schritt: 'start',
    notiz: 'Ein neuer lokaler Vorschlag.',
    dateien: [{ name: 'idee.md', text: 'Neu.\n' }],
  });
  pruefe(beitrag.status === 404,
    'POST /board/beitrag antwortet ' + beitrag.status + ' statt 404: ' + beitrag.text);
  const beitragLesen = await ruf('/board/beitrag?vorhaben=' + VORHABEN
    + '&beitrag=irgendwas');
  pruefe(beitragLesen.status === 404,
    'GET /board/beitrag antwortet ' + beitragLesen.status + ' statt 404');
  const entscheid = await ruf('/board/beitrag/entscheiden', {
    beitrag: 'irgendwas', art: 'annehmen',
  });
  pruefe(entscheid.status === 404,
    'POST /board/beitrag/entscheiden antwortet ' + entscheid.status + ' statt 404');
  pruefe(!existsSync(join(REPO, 'beitraege')),
    'Durch den alten Weg ist ein beitraege/-Ordner entstanden');
  console.log('ok alter Beitragsweg: 404, kein beitraege-Ordner, keine Fassung');

  // 2. Der lokale Fork: 404, keine Kopie, keine Fassung.
  const fork = await ruf('/board/vorhaben/forken', { id: VORHABEN });
  pruefe(fork.status === 404,
    'POST /board/vorhaben/forken antwortet ' + fork.status + ' statt 404: ' + fork.text);
  const vorgaenge = readdirSync(join(REPO, 'vorgaenge')).sort();
  pruefe(vorgaenge.join(',') === [VORHABEN].sort().join(','),
    'Der alte Fork hat ein Vorhaben angelegt: ' + JSON.stringify(vorgaenge));
  pruefe(git(REPO, ['rev-parse', 'HEAD']) === kopfVorher,
    'Die alten Wege haben eine Fassung angelegt');
  pruefe(git(REPO, ['status', '--porcelain']) === baumVorher,
    'Die alten Wege haben den Arbeitsbaum verändert');
  console.log('ok alter Fork: 404, keine lokale Kopie, nichts geschrieben');

  // 3. Die GitHub-Wege bleiben erreichbar: sie antworten mit einem Fehler,
  //    aber nicht mit 404.
  for (const pfad of ['/board/github/beitrag', '/board/github/fork']) {
    const antwort = await ruf(pfad, {});
    pruefe(antwort.status !== 404,
      pfad + ' antwortet 404 — der GitHub-Weg fehlt');
    pruefe(antwort.status >= 400 && antwort.daten && antwort.daten.error,
      pfad + ' antwortet ohne Begründung: ' + antwort.status + ' ' + antwort.text);
    console.log('ok ' + pfad + ': erreichbar (' + antwort.status + ')');
  }

  // 4. Alte Beitragsdaten bleiben lesbar; kein alter Weg schreibt etwas.
  legeAltenBeitrag();
  const daten = await ruf('/board/data');
  pruefe(daten.status === 200, '/board/data antwortet ' + daten.status);
  const liste = Array.isArray(daten.daten.beitraege) ? daten.daten.beitraege : [];
  pruefe(liste.length === 1, '/board/data zeigt ' + liste.length
    + ' Beiträge statt 1');
  const alt = liste[0];
  pruefe(alt.id === BEITRAG, 'Der alte Beitrag hat die falsche Kennung: ' + alt.id);
  pruefe(alt.notiz === 'Dieser alte Vorschlag bleibt lesbar.',
    'Die Notiz des alten Beitrags fehlt: ' + JSON.stringify(alt.notiz));
  pruefe(JSON.stringify(alt.dateien) === JSON.stringify(['idee.md']),
    'Die vorgeschlagene Fassung fehlt in /board/data: ' + JSON.stringify(alt.dateien));
  pruefe(alt.vorhabenName === 'Altes Vorhaben',
    'Der Vorhaben-Name des alten Beitrags fehlt: ' + JSON.stringify(alt.vorhabenName));
  const vorschlag = join(REPO, 'beitraege', VORHABEN, BEITRAG, 'idee.md');
  pruefe(readFileSync(vorschlag, 'utf8')
    === '# Idee\n\nDer alte vorgeschlagene Inhalt.\n',
  'Die alte vorgeschlagene Fassung wurde verändert');
  pruefe(git(REPO, ['rev-parse', 'HEAD']) === kopfVorher,
    'Das Lesen der alten Daten hat eine Fassung angelegt');
  console.log('ok alte Daten: /board/data nennt Beitrag, Notiz und Fassung');

  // 5. Die Seite ruft die alten Wege nicht mehr auf.
  const client = readFileSync(join(KOPIE, 'client.js'), 'utf8');
  for (const altPfad of ["'/board/beitrag'", "'/board/beitrag/entscheiden'",
    "'/board/vorhaben/forken'"]) {
    pruefe(!client.includes(altPfad),
      'client.js ruft noch den alten Weg ' + altPfad + ' auf');
  }
  pruefe(client.includes("fetch('/board/github/beitrag'"),
    'client.js spricht nicht mit /board/github/beitrag');
  pruefe(client.includes("fetch('/board/github/fork'"),
    'client.js spricht nicht mit /board/github/fork');
  console.log('ok Seite: alte Wege weg, GitHub-Wege da');

  bestanden = true;
} finally {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  await stoppeServer();
  delete process.env.DSH_HOME;
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Ablage und Home wurden nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Alte Wege weg, GitHub-Wege da, nichts geschrieben');
