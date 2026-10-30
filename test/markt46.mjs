/**
 * Prüfung Schritt 46 — Die Darstellung: die Akzentfarbe des Boards.
 *
 * Die Prüffläche liegt in einer eigenen Fläche unter
 * `/tmp/board-scheibe1/markt46`, daneben ein eigenes `DSH_HOME`. Der Server
 * läuft in-process; es gibt kein Netz.
 *
 * Geprüft wird:
 *
 *   1. Ohne Datei gilt `marke` (die Farbe des Dashboards); die Antwort nennt
 *      die erlaubten Akzente.
 *   2. Ein erlaubter Akzent wird gespeichert: Antwort 200, Datei
 *      `$DSH_HOME/board/darstellung.json` trägt ihn, ein zweites GET liest ihn.
 *   3. Ein unbekannter oder leerer Akzent antwortet 400 und ändert nichts.
 *   4. Die Route schreibt keine Ablagedatei des Boards; sie wirkt auch in
 *      einem Board der Fassung 1.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = join('/tmp/board-scheibe1', 'markt46');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const DARSTELLUNG = join(HOME, 'board', 'darstellung.json');
const BOARD = join(ABLAGE, 'board');

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

function git(ordner, args) {
  const lauf = spawnSync('git', ['-C', ordner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
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
    method: koerper === undefined ? 'GET' : 'POST',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper !== undefined) yield Buffer.from(JSON.stringify(koerper), 'utf8');
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

async function ruf(gebaut, pfad, koerper) {
  const res = antwort();
  await gebaut.routen.get(String(pfad).split('?')[0])
    .handler(anfrage(pfad, koerper), res);
  return { status: res.status, daten: res.text ? JSON.parse(res.text) : null };
}

async function lauf() {
  rmSync(ABLAGE, { recursive: true, force: true });
  try {
    const flaeche = legePruefflaeche({ wurzel: ABLAGE });
    pruefe(flaeche.board === BOARD, 'Die Prüffläche meldet einen anderen Ordner');
    schreibeJson(REGISTER, {
      format: 1,
      aktiv: 'testboard',
      boards: [{
        id: 'testboard',
        name: 'Testboard',
        format: 2,
        art: 'team',
        repo: BOARD,
        remote: null,
        person: 'p1',
      }],
    });
    schreibeJson(join(HOME, 'board', 'identitaet.json'), {
      name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
    });

    const port = 0;
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:' + port;
    const gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    // 1. Vorgabe: die Farbe des Dashboards.
    const erst = await ruf(gebaut, '/board/darstellung');
    pruefe(erst.status === 200, 'GET /board/darstellung antwortet ' + erst.status);
    pruefe(erst.daten.darstellung.akzent === 'marke',
      'Ohne Datei gilt nicht „marke“: ' + JSON.stringify(erst.daten));
    pruefe(Array.isArray(erst.daten.akzente)
      && erst.daten.akzente.includes('violett')
      && erst.daten.akzente.includes('marke'),
    'Die Antwort nennt die erlaubten Akzente nicht: ' + JSON.stringify(erst.daten.akzente));

    // 2. Speichern und wieder lesen.
    const gesetzt = await ruf(gebaut, '/board/darstellung', { akzent: 'violett' });
    pruefe(gesetzt.status === 200,
      'POST /board/darstellung antwortet ' + gesetzt.status + ': '
        + JSON.stringify(gesetzt.daten));
    pruefe(gesetzt.daten.darstellung.akzent === 'violett',
      'Die Antwort trägt nicht den neuen Akzent: ' + JSON.stringify(gesetzt.daten));
    pruefe(existsSync(DARSTELLUNG), 'Die Datei fehlt: ' + DARSTELLUNG);
    pruefe(liesJson(DARSTELLUNG).akzent === 'violett',
      'Die Datei trägt nicht den Akzent: ' + readFileSync(DARSTELLUNG, 'utf8'));
    const zweit = await ruf(gebaut, '/board/darstellung');
    pruefe(zweit.daten.darstellung.akzent === 'violett',
      'Ein zweites GET liest nicht den gespeicherten Akzent: '
        + JSON.stringify(zweit.daten));

    // 3. Unbekannt und leer: 400, nichts geändert.
    const DateiVorher = readFileSync(DARSTELLUNG, 'utf8');
    const unbekannt = await ruf(gebaut, '/board/darstellung', { akzent: 'pink' });
    pruefe(unbekannt.status === 400,
      'Ein unbekannter Akzent antwortet ' + unbekannt.status + ' statt 400: '
        + JSON.stringify(unbekannt.daten));
    pruefe(String(unbekannt.daten.error || '').includes('Erlaubt:'),
      'Die Meldung nennt die erlaubten Akzente nicht: ' + unbekannt.daten.error);
    const leer = await ruf(gebaut, '/board/darstellung', {});
    pruefe(leer.status === 400, 'Ein leerer Akzent antwortet ' + leer.status);
    pruefe(readFileSync(DARSTELLUNG, 'utf8') === DateiVorher,
      'Ein abgelehnter Akzent hat die Datei verändert');

    // 4. Auch in einem Board der Fassung 1 wirkt die Route; das Board-Format
    //    prüft sie nicht, weil sie keine Ablagedatei schreibt.
    schreibeJson(REGISTER, {
      format: 1,
      aktiv: 'alt',
      boards: [{
        id: 'alt',
        name: 'Altes Board',
        format: 1,
        art: 'ordner',
        repo: BOARD,
        remote: null,
        person: 'p1',
      }],
    });
    const alt = await ruf(gebaut, '/board/darstellung', { akzent: 'tuerkis' });
    pruefe(alt.status === 200,
      'POST /board/darstellung im Board der Fassung 1 antwortet ' + alt.status
        + ': ' + JSON.stringify(alt.daten));

    console.log('ok Darstellung: Vorgabe marke, speichern, ablehnen, Format 1');
  } finally {
    rmSync(ABLAGE, { recursive: true, force: true });
    try { rmSync('/tmp/board-scheibe1', { recursive: false, force: true }); } catch {
      /* Die laufende Prüffläche liegt noch daneben. */
    }
  }
}

try {
  await lauf();
  process.exit(0);
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
