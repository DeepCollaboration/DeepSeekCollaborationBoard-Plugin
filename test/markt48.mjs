/**
 * Prüfung Schritt 48 — Die Texte des Boards je Sprache.
 *
 * Die Prüffläche liegt unter `/tmp/board-scheibe1/markt48`; der Server läuft
 * in-process, ohne Netz. Geprüft wird:
 *
 *   1. Ohne Angabe antwortet die Route mit Deutsch und den Texten aus
 *      `texte/de.json`.
 *   2. Eine unbekannte, aber gültige Sprache antwortet mit 200 und leeren
 *      Texten — der deutsche Ausgangstext bleibt dann stehen.
 *   3. Eine ungültige Kennung antwortet 400.
 *   4. POST antwortet 405.
 *   5. Jede ausgelieferte Sprache hat genau die Schlüssel, die im Client
 *      stehen (aus `uebersetze('…')` gelesen) und die neun Sätze des
 *      Servers — keine fehlenden, keine überzähligen. Deutsch selbst bleibt
 *      ohne Datei-Inhalt: der Schlüssel ist der deutsche Text.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { legePruefflaeche } from '../werkzeuge/pruefflaeche.mjs';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';
import { rechteTexte } from './rechte-texte.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = join('/tmp/board-scheibe1', 'markt48');
const HOME = join(ABLAGE, 'home');
const REGISTER = join(HOME, 'board', 'boards.json');
const BOARD = join(ABLAGE, 'board');

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

function anfrage(pfad, methode = 'GET') {
  return {
    method: methode,
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (methode === 'POST') yield Buffer.from('{}', 'utf8');
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

async function ruf(gebaut, pfad, methode = 'GET') {
  const res = antwort();
  await gebaut.routen.get('/board/sprache').handler(anfrage(pfad, methode), res);
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
        id: 'testboard', name: 'Testboard', format: 2, art: 'team',
        repo: BOARD, remote: null, person: 'p1',
      }],
    });
    schreibeJson(join(HOME, 'board', 'identitaet.json'), {
      name: 'Thomas Heinrich', github: '', farbe: '#fbbf24',
    });
    process.env.DSH_HOME = HOME;
    process.env.DSH_GITHUB_API = 'http://127.0.0.1:9';
    const gebaut = ctxBauen();
    const modul = await import(pathToFileURL(join(PRODUKT, 'index.js')).href);
    modul.apply(gebaut.ctx);

    const deutschDatei = join(PRODUKT, 'texte', 'de.json');
    pruefe(existsSync(deutschDatei), 'texte/de.json fehlt');
    const deutsch = JSON.parse(readFileSync(deutschDatei, 'utf8'));

    // Die Schlüssel stehen im Client: `uebersetze('…')` und die Beschriftungen,
    // die erst beim Zeichnen übersetzt werden. Dazu kommen die neun Sätze, die
    // der Server als Text mitschickt (`rechte.js`, `index.js`).
    const clientText = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
    const schluessel = new Set(texteSchluessel(clientText));
    const { alle: serverSaetze } = await rechteTexte();
    for (const satz of serverSaetze) schluessel.add(satz);
    pruefe(schluessel.size > 500,
      'Zu wenige Texte im Client: ' + schluessel.size + ' Schlüssel');

    // 1. Ohne Angabe: Deutsch.
    const ohne = await ruf(gebaut, '/board/sprache');
    pruefe(ohne.status === 200, 'GET /board/sprache antwortet ' + ohne.status);
    pruefe(ohne.daten.id === 'de', 'Ohne Angabe gilt nicht Deutsch: '
      + JSON.stringify(ohne.daten));
    pruefe(JSON.stringify(ohne.daten.texte) === JSON.stringify(deutsch),
      'Die Antwort trägt nicht die Texte aus texte/de.json');

    // 2. Unbekannte, gültige Sprache: 200 und leer.
    const fremd = await ruf(gebaut, '/board/sprache?id=xx');
    pruefe(fremd.status === 200, 'Unbekannte Sprache antwortet ' + fremd.status);
    pruefe(fremd.daten.id === 'xx' && Object.keys(fremd.daten.texte).length === 0,
      'Unbekannte Sprache liefert Texte: ' + JSON.stringify(fremd.daten));

    // 3. Ungültige Kennung: 400.
    const kaputt = await ruf(gebaut, '/board/sprache?id=../../etc/passwd');
    pruefe(kaputt.status === 400,
      'Eine ungültige Kennung antwortet ' + kaputt.status + ' statt 400');
    const leer = await ruf(gebaut, '/board/sprache?id=');
    pruefe(leer.status === 200 && leer.daten.id === 'de',
      'Eine leere Kennung fällt nicht auf Deutsch zurück: ' + JSON.stringify(leer.daten));

    // 4. POST: 405.
    const post = await ruf(gebaut, '/board/sprache', 'POST');
    pruefe(post.status === 405, 'POST antwortet ' + post.status + ' statt 405');

    // 5. Jede vorhandene Sprachdatei hat genau die Schlüssel des Clients.
    for (const name of readdirSync(join(PRODUKT, 'texte'))) {
      if (!name.endsWith('.json') || name === 'de.json') continue;
      const id = name.slice(0, -5);
      const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', name), 'utf8'));
      const fehlt = [...schluessel].filter((wort) => !(wort in inhalt));
      const zuviel = Object.keys(inhalt).filter((wort) => !schluessel.has(wort));
      pruefe(fehlt.length === 0,
        'texte/' + id + '.json fehlen ' + fehlt.length + ' Schlüssel, z. B. „'
          + fehlt[0] + '“');
      pruefe(zuviel.length === 0,
        'texte/' + id + '.json hat ' + zuviel.length + ' unbekannte Schlüssel, z. B. „'
          + zuviel[0] + '“');
      const stellen = (text) => [...text.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
      for (const wort of schluessel) {
        if (!(wort in inhalt)) continue;
        pruefe(String(inhalt[wort]).length > 0,
          'texte/' + id + '.json hat einen leeren Text zu „' + wort + '“');
        pruefe(stellen(inhalt[wort]) === stellen(wort),
          'Die Übersetzung „' + inhalt[wort] + '“ verliert die Werte von „' + wort + '“');
      }
    }

    console.log('ok Sprache: Deutsch als Ausgang, unbekannt leer, 400/405, '
      + 'Sprachdateien deckungsgleich');
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
