/**
 * Prüfung Schritt 64b — Sprung zur Station.
 *
 * `client.js` und die Wörterbücher werden als Text gelesen, ohne Browser.
 * Geprüft wird:
 *
 *   1. das Suchfeld steht als `Feld` mit `label` und Platzhalter im Client,
 *      das Label ist für Vorleser da (versteckt), und der Platzhalter steht
 *      in allen sieben Wörterbüchern (`ar, en, es, fr, ja, ru, zh`);
 *   2. die Trefferliste ist auf sechs Namen begrenzt und nimmt keinen Namen
 *      doppelt auf; ohne Treffer sagt sie „Keine Station gefunden“;
 *   3. der Sprung öffnet die Karte (`schrittWaehlen`), benutzt dieselbe
 *      Rechnung wie „Alles zeigen“ (`scrollLeft`/`scrollTop`); den Fokus holt
 *      seit Schritt 83 das rechte Stationsdock, nicht mehr der Kartenname;
 *   4. Pfeiltasten, Enter und Escape sind behandelt;
 *   5. die Suite selbst ist der fünfte Punkt der Prüfung im Schritt; sie
 *      läuft über `node --test test/*.mjs` und wird von dieser Datei nicht
 *      aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const SPRACHEN = ['ar', 'en', 'es', 'fr', 'ja', 'ru', 'zh'];
const FINDEN = 'Station finden';
const LEER = 'Keine Station gefunden';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
const schluessel = new Set(texteSchluessel(quelle));

// 1. Das Suchfeld: ein `Feld` mit Label und Platzhalter, nur mit Stationen.
const feldStart = quelle.indexOf('const stationsFeld =');
pruefe(feldStart >= 0, 'Das Suchfeld `stationsFeld` fehlt');
const feldEnde = quelle.indexOf(': null;', feldStart);
pruefe(feldEnde > feldStart, 'Das Suchfeld endet nicht mit seinem leeren Fall');
const feldBlock = quelle.slice(feldStart, feldEnde);
pruefe(feldBlock.includes('karten.length'),
  'Das Suchfeld erscheint nicht erst, wenn das Board eine Station hat');
pruefe(feldBlock.includes('h(Feld'),
  'Das Suchfeld ist kein `Feld`');
pruefe(feldBlock.includes("label: '" + FINDEN + "'"),
  'Das Suchfeld trägt kein `label`');
pruefe(feldBlock.includes('labelStil: S.nurVorleser'),
  'Das Label des Suchfelds wird nicht für Vorleser versteckt');
pruefe(feldBlock.includes("placeholder: uebersetze('" + FINDEN + "')"),
  'Das Suchfeld trägt nicht den übersetzten Platzhalter „' + FINDEN + '“');
pruefe(/stil:\s*\{\s*width:\s*'140px'/.test(feldBlock),
  'Das Suchfeld ist nicht schmal (rund 140 px)');
pruefe(schluessel.has(FINDEN),
  'Das Übersetzungswerkzeug findet „' + FINDEN + '“ nicht');

const vorleserStart = quelle.indexOf('nurVorleser: {');
pruefe(vorleserStart >= 0, 'Der Stil `nurVorleser` fehlt');
const vorleserEnde = quelle.indexOf('},', vorleserStart);
const vorleser = quelle.slice(vorleserStart, vorleserEnde);
pruefe(vorleser.includes("position: 'absolute'"),
  'Das versteckte Label nimmt noch Platz in der Leiste');
pruefe(vorleser.includes('clip:'),
  'Das versteckte Label ist nicht unsichtbar, aber für Vorleser da');

// 1b. Platzhalter und Leersatz stehen in allen sieben Wörterbüchern.
pruefe(schluessel.has(LEER),
  'Das Übersetzungswerkzeug findet „' + LEER + '“ nicht');
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'));
  for (const text of [FINDEN, LEER]) {
    pruefe(Object.prototype.hasOwnProperty.call(inhalt, text),
      'texte/' + sprache + '.json fehlt „' + text + '“');
    pruefe(String(inhalt[text] == null ? '' : inhalt[text]).trim().length > 0,
      'texte/' + sprache + '.json hat „' + text + '“ leer');
  }
}

// 2. Höchstens sechs Treffer, jeder Name einmal; ohne Treffer der Leersatz.
const trefferStart = quelle.indexOf('const stationsTreffer =');
pruefe(trefferStart >= 0, 'Die Trefferliste `stationsTreffer` fehlt');
const trefferEnde = quelle.indexOf('const stationsTrefferListe', trefferStart);
pruefe(trefferEnde > trefferStart, 'Die Trefferliste endet nicht');
const trefferBlock = quelle.slice(trefferStart, trefferEnde);
pruefe(/\.slice\(0,\s*6\)/.test(trefferBlock),
  'Die Trefferliste ist nicht auf sechs Treffer begrenzt');
pruefe(trefferBlock.includes('gesehen.has('),
  'Die Trefferliste lässt doppelte Namen zu');
const listenStart = quelle.indexOf('const stationsTrefferListe =');
const listenEnde = quelle.indexOf('const stationsFeld =', listenStart);
pruefe(listenEnde > listenStart, 'Die Trefferliste endet nicht');
const listenBlock = quelle.slice(listenStart, listenEnde);
pruefe(listenBlock.includes("uebersetze('" + LEER + "')"),
  'Ohne Treffer sagt die Liste nicht „' + LEER + '“');
pruefe(listenBlock.includes('springeZuStation(p)'),
  'Ein Klick auf einen Treffer springt nicht zur Station');

// 3. Der Sprung: dieselbe Rechnung wie „Alles zeigen“ und Öffnen; den Fokus
//    holt seit Schritt 83 das rechte Stationsdock.
const sprungStart = quelle.indexOf('function springeZuStation(');
pruefe(sprungStart >= 0, 'Die Funktion `springeZuStation` fehlt');
const sprungEnde = quelle.indexOf('\n      }', sprungStart);
pruefe(sprungEnde > sprungStart, 'Die Funktion `springeZuStation` endet nicht');
const sprung = quelle.slice(sprungStart, sprungEnde);
pruefe(sprung.includes('schrittWaehlen('),
  'Der Sprung öffnet die Karte nicht über `schrittWaehlen`');
pruefe(sprung.includes('allesZeigen([p])'),
  'Der Sprung benutzt nicht die Rechnung von „Alles zeigen“ für eine Karte');
pruefe(sprung.includes("getElementById('board-station')")
  && sprung.includes("kopf.closest('section')")
  && sprung.includes('dock.focus()'),
'Der Sprung setzt den Fokus nicht in die section des Stationsdocks');
pruefe(sprung.includes("setStationsSuche('')"),
  'Der Sprung leert das Suchfeld nicht');

const zeigStart = quelle.indexOf('function allesZeigen()');
pruefe(zeigStart >= 0, 'Die Funktion `allesZeigen` fehlt');
const zeigEnde = quelle.indexOf('\n      }', zeigStart);
pruefe(zeigEnde > zeigStart, 'Die Funktion `allesZeigen` endet nicht');
const zeigen = quelle.slice(zeigStart, zeigEnde);
pruefe(zeigen.includes('karten.map'),
  '„Alles zeigen“ rechnet nicht aus den Kartenpositionen');
pruefe(zeigen.includes('breiteFuer(p)'),
  '„Alles zeigen“ kennt die Breite einer Karte nicht');
pruefe(zeigen.includes('KARTEN_HOEHE'),
  '„Alles zeigen“ kennt die Höhe einer Karte nicht');
pruefe(!zeigen.includes('KARTE_GROSS'),
  '„Alles zeigen“ rechnet noch mit der großen Form einer einzelnen Karte');
pruefe(/raum\.scrollLeft\s*=\s*Math\.max\(0,\s*Math\.min\(/.test(zeigen),
  '„Alles zeigen“ setzt `scrollLeft` nicht begrenzt');
pruefe(/raum\.scrollTop\s*=\s*Math\.max\(0,\s*Math\.min\(/.test(zeigen),
  '„Alles zeigen“ setzt `scrollTop` nicht begrenzt');

// 4. Pfeiltasten, Enter und Escape sind im Feld und in der Liste behandelt.
const bedienStart = quelle.indexOf('const stationsFeld =');
const bedienEnde = quelle.indexOf('const allesZeigenKnopf', bedienStart);
const bedien = quelle.slice(bedienStart, bedienEnde);
for (const taste of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
  pruefe(bedien.includes("'" + taste + "'"),
    'Die Taste `' + taste + '` ist in der Suche nicht behandelt');
}
pruefe(bedien.includes('stationsListeRef.current')
  && bedien.includes('.focus()'),
'Die Pfeiltasten bewegen den Fokus nicht in die Trefferliste');

console.log('ok Suche: Feld mit verstecktem Label, sechs Treffer ohne Doppel, '
  + 'Sprung über die Rechnung von „Alles zeigen“ und schrittWaehlen, Fokus '
  + 'im Stationsdock, Pfeiltasten/Enter/Escape');
