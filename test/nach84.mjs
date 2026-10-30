/**
 * Prüfung Schritt 84 — Das Gespräch als Reiter im rechten Dock.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Es gibt genau ein rechtes Dock. `gespraechPanel` und der Griff der
 *      alten Chatspalte sind fort; das Dock steht als Geschwister nach dem
 *      `raum` im Körper und trägt weiter `S.dockRechts`.
 *   2. Die Reiterleiste steht nur, wenn Station und Gespräch gleichzeitig
 *      offen sind: zwei Knöpfe mit den vorhandenen Wörtern „Station“ und
 *      „Gespräch“, `aria-selected`, der aktive Reiter hervorgehoben. Gebaut
 *      wird nur der aktive Inhalt.
 *   3. Der aktive Reiter bestimmt Titel, Untertitel und Schließen. Das
 *      Schließen der Station lässt das Gespräch stehen und umgekehrt; der
 *      Fokus geht auf den bleibenden Inhalt oder zurück auf die Karte.
 *   4. Das Gespräch nutzt dieselben Zustände und Handler wie zuvor
 *      (`gespraechSenden`, `gespraech.eintraege`, `feldHoehe`, `inhaltRef`,
 *      `amEnde`); die Kennung `board-chat` sitzt am Inhalt, und der Inhalt
 *      wird nur an einer Stelle gebaut.
 *   5. Escape schließt den aktiven Reiter; ein Reiterwechsel lässt den Fokus
 *      auf dem geklickten Reiter.
 *   6. `spaltenBreite` gilt für das ganze Dock, mit den Grenzen 300 und
 *      `min(window.innerWidth - 520, 100vw - 133px)` samt 9-px-Griff; der
 *      zweite Griff fehlt.
 *   7. Das Öffnen der linken Leiste schließt das rechte Dock; die Station
 *      schließt die Leiste. Die Wörterbücher tragen 614 Schlüssel.
 *
 * Die Suite selbst ist der letzte Punkt der Prüfung im Schritt; sie läuft
 * über `node --test test/*.mjs` und wird von dieser Datei nicht aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';
import { rechteTexte } from './rechte-texte.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');

/** Der Stilblock eines Namens im Stilblock `S`, von `name: {` bis `},`. */
function stilBlock(name) {
  const start = quelle.indexOf('      ' + name + ': {');
  pruefe(start >= 0, 'Der Stil `' + name + '` fehlt');
  const ende = quelle.indexOf('\n      },', start);
  pruefe(ende > start, 'Der Stil `' + name + '` endet nicht');
  return quelle.slice(start, ende);
}

/** Ein Quelltextstück von `von` bis zum ersten `bis` danach. */
function stueck(von, bis, was) {
  const start = quelle.indexOf(von);
  pruefe(start >= 0, was + ' fehlt');
  const ende = quelle.indexOf(bis, start);
  pruefe(ende > start, was + ' endet nicht');
  return quelle.slice(start, ende + bis.length);
}

/** Das schließende `)` eines Aufrufs, der bei `start` mit `h(` beginnt. */
function aufrufEnde(start) {
  let tiefe = 0;
  let inText = null;
  let entkommen = false;
  for (let i = start; i < quelle.length; i += 1) {
    const zeichen = quelle[i];
    if (inText) {
      if (entkommen) entkommen = false;
      else if (zeichen === '\\') entkommen = true;
      else if (zeichen === inText) inText = null;
      continue;
    }
    if (zeichen === "'" || zeichen === '"' || zeichen === '`') inText = zeichen;
    else if (zeichen === '(') tiefe += 1;
    else if (zeichen === ')') {
      tiefe -= 1;
      if (tiefe === 0) return i;
    }
  }
  throw new Error('Der Aufruf bei ' + start + ' endet nicht');
}

// Die Blöcke, um die es geht.
const koerperStart = quelle.indexOf("h('div', { style: S.koerper },");
pruefe(koerperStart >= 0, 'Der Körper der Seite fehlt');
const raumStart = quelle.indexOf("h('div', {\n            ref: raumRef,", koerperStart);
pruefe(raumStart > koerperStart, 'Der `raum` fehlt im Körper');
const raumEnde = aufrufEnde(raumStart);
const raumBlock = quelle.slice(raumStart, raumEnde);

const dockStart = quelle.indexOf('const rechtsDock =');
pruefe(dockStart >= 0, 'Das rechte Dock `rechtsDock` fehlt');
const dockEnde = quelle.indexOf('const formatWarnung =', dockStart);
pruefe(dockEnde > dockStart, 'Das rechte Dock endet nicht');
const dockBlock = quelle.slice(dockStart, dockEnde);

const teileStart = quelle.indexOf('function stationDockTeile()');
pruefe(teileStart >= 0, 'Die Teile des Stationsreiters `stationDockTeile` fehlen');
const teileEnde = quelle.indexOf('\n      // --- Chat', teileStart);
pruefe(teileEnde > teileStart, 'Die Teile des Stationsreiters enden nicht');
const teileBlock = quelle.slice(teileStart, teileEnde);

const chatStart = quelle.indexOf('function gespraechDockTeile()');
pruefe(chatStart >= 0, 'Die Teile des Gesprächs `gespraechDockTeile` fehlen');
const chatEnde = quelle.indexOf('\n      // Das eine rechte Dock', chatStart);
pruefe(chatEnde > chatStart, 'Die Teile des Gesprächs enden nicht');
const chatBlock = quelle.slice(chatStart, chatEnde);

// 1. Genau ein rechtes Dock, als Geschwister nach dem `raum`.
pruefe(!quelle.includes('const stationDock ='),
  'Das alte eigene Stationsdock `stationDock` steht noch im Client');
pruefe(!quelle.includes('gespraechPanel'),
  'Die alte Gesprächsspalte `gespraechPanel` steht noch im Client');
pruefe(!quelle.includes('gespraechBreiteGriff')
  && !quelle.includes('gespraechBreiteStrich'),
'Der Breitengriff der alten Chatspalte steht noch im Client');
pruefe((dockBlock.match(/h\(Panel,/g) || []).length === 1,
  'Das rechte Dock ist nicht genau ein Panel');
pruefe(dockBlock.includes('seiteStil: S.dockRechts')
  && dockBlock.includes('seiteEigenschaften: {')
  && dockBlock.includes("maxWidth: 'calc(100vw - 133px)'"),
'Das rechte Dock benutzt nicht mehr die Form aus Schritt 83');
pruefe((quelle.match(/seiteStil: S\.dockRechts/g) || []).length === 1,
  'Es gibt mehr als ein Dock im Stil `S.dockRechts`');
const dock = stilBlock('dockRechts');
pruefe(dock.includes("width: 'min(380px, calc(100vw - 133px))'")
  && dock.includes("borderLeft: '1px solid var(--dsw-alias-border-l1)'"),
'`S.dockRechts` ist nicht mehr die begrenzte Spalte aus Schritt 83');
// 72 + 9 + (100vw - 133) = 100vw - 52: Schiene, Griff und Dock enden genau
// vor dem rechten Seitenrand.
pruefe(dock.includes('72 + 9') && dock.includes('100vw - 133')
  && dock.includes('100vw - 52'),
'Die 133 px Reserve (72 Schiene + 9 Griff + 52 Rand) steht nicht im Stil');
pruefe(!raumBlock.includes('rechtsDock') && !raumBlock.includes('S.dockBreiteGriff'),
  'Das rechte Dock oder sein Griff steht noch als Geschwister im `raum`');
const dockStelle = quelle.indexOf('\n          rechtsDock));', koerperStart);
pruefe(dockStelle > raumEnde,
  'Das rechte Dock steht nicht als Geschwister nach dem `raum` im Körper');
pruefe((quelle.match(/\n          rechtsDock\)\);/g) || []).length === 1,
  'Das rechte Dock wird nicht genau einmal in den Körper gehängt');
const koerperEnde = quelle.indexOf('\n    }\n', koerperStart);
pruefe(koerperEnde > koerperStart, 'Der Körper der Seite endet nicht');
const koerperBlock = quelle.slice(koerperStart, koerperEnde);
pruefe((koerperBlock.match(/\brechtsDock\b/g) || []).length === 2,
  'Im Körper stehen mehr als ein rechtes Dock (Griff und Dock erwartet)');

// 2. Zwei Reiter nur, wenn beide offen sind; nur der aktive Inhalt wird gebaut.
pruefe(dockBlock.includes('const beide = stationImDock && gespraechImDock;'),
  'Das Dock prüft nicht, ob Station und Gespräch gleichzeitig offen sind');
pruefe(dockBlock.includes('const reiterLeiste = beide ? h(')
  && dockBlock.includes(') : null;'),
'Die Reiterleiste erscheint auch bei nur einem offenen Reiter');
const reiterStart = dockBlock.indexOf("role: 'tablist'");
pruefe(reiterStart >= 0, 'Die Reiterleiste fehlt');
const reiterEnde = dockBlock.indexOf(') : null;', reiterStart);
pruefe(reiterEnde > reiterStart, 'Die Reiterleiste endet nicht');
const reiterBlock = dockBlock.slice(reiterStart, reiterEnde);
pruefe(reiterBlock.includes("uebersetze('Station')")
  && reiterBlock.includes("uebersetze('Gespräch')"),
'Die Reiter tragen nicht die vorhandenen Wörter „Station“ und „Gespräch“');
pruefe((reiterBlock.match(/role: 'tab'/g) || []).length === 2,
  'Die Reiterleiste hat nicht genau zwei Reiter-Knöpfe');
pruefe((reiterBlock.match(/'aria-selected':/g) || []).length === 2,
  'Die Reiter melden ihren Zustand nicht über `aria-selected`');
pruefe(reiterBlock.includes("'aria-selected': rechtsAktiv === 'station'")
  && reiterBlock.includes("'aria-selected': rechtsAktiv === 'gespraech'"),
'`aria-selected` hängt nicht am aktiven Reiter');
pruefe(reiterBlock.includes('S.dockReiterAktiv'),
  'Der aktive Reiter ist nicht hervorgehoben');
pruefe(dockBlock.includes("const teile = rechtsAktiv === 'station' ? stationDockTeile() : gespraechDockTeile();"),
  'Das Dock baut Inhalt und Kopf nicht nur für den aktiven Reiter');
pruefe(dockBlock.includes('kinder: teile.kinder')
  && dockBlock.includes('fuss: teile.fuss || null'),
'Das Dock rendert nicht den Inhalt des aktiven Reiters');
pruefe(teileBlock.includes('stationsInhalt(offeneStelle, true)'),
  'Der Stationsreiter baut seinen Inhalt nicht über `stationsInhalt`');
// Der Rückfall beim Verschwinden eines Reiters steht in der Ableitung selbst.
const aktivStart = quelle.indexOf('const rechtsAktiv =');
pruefe(aktivStart >= 0, 'Die Ableitung `rechtsAktiv` fehlt');
const aktivEnde = quelle.indexOf(';', aktivStart);
pruefe(aktivEnde > aktivStart, '`rechtsAktiv` endet nicht');
const aktivBlock = quelle.slice(aktivStart, aktivEnde);
pruefe(/:\s*!stationImDock\s*\n\s*\?\s*'gespraech'/.test(aktivBlock),
  'Verschwindet die Station, wechselt `rechtsAktiv` nicht auf das Gespräch');
pruefe(/:\s*!gespraechImDock\s*\n\s*\?\s*'station'/.test(aktivBlock),
  'Verschwindet das Gespräch, wechselt `rechtsAktiv` nicht auf die Station');
pruefe(aktivBlock.includes('!stationImDock && !gespraechImDock')
  && aktivBlock.includes('? null'),
'Ohne beide Reiter wird das Dock nicht geschlossen');

// 3. Der aktive Reiter bestimmt Kopf und Schließen.
pruefe(dockBlock.includes('titel: teile.titel')
  && dockBlock.includes('untertitel: teile.untertitel')
  && dockBlock.includes('kopfRechts: teile.kopfRechts'),
'Der Kopf des Docks kommt nicht vom aktiven Reiter');
pruefe(dockBlock.includes('onSchliessen: rechtsSchliessen'),
  'Das Dock schließt nicht über den aktiven Reiter');
const rechtsSchliessen = stueck('function rechtsSchliessen() {', '\n      }',
  '`rechtsSchliessen`');
pruefe(rechtsSchliessen.includes("rechtsAktiv === 'station'")
  && rechtsSchliessen.includes('stationSchliessen()')
  && rechtsSchliessen.includes("rechtsAktiv === 'gespraech'")
  && rechtsSchliessen.includes('gespraechSchliessen()'),
'Das Schließen des Docks wählt nicht den aktiven Reiter');
// Genau ein Aufruf je Schließer, durch if/else getrennt: es läuft immer nur
// einer der beiden.
pruefe((rechtsSchliessen.match(/stationSchliessen\(\)/g) || []).length === 1
  && (rechtsSchliessen.match(/gespraechSchliessen\(\)/g) || []).length === 1,
'`rechtsSchliessen` ruft einen der Schließer mehr als einmal auf');
pruefe(rechtsSchliessen.includes("if (rechtsAktiv === 'station') stationSchliessen();")
  && rechtsSchliessen.includes("else if (rechtsAktiv === 'gespraech') gespraechSchliessen();"),
'`rechtsSchliessen` schließt nicht über if/else genau den aktiven Reiter');
const schliessen = stueck('function stationSchliessen() {', '\n      }',
  'Das Schließen der Station');
pruefe(schliessen.includes('setAuswahl(null)'),
  'Das Schließen der Station lässt die Auswahl stehen');
pruefe(schliessen.includes('if (gespraechImDock)')
  && schliessen.includes("setRechtsReiter('gespraech')")
  && schliessen.includes("fokusRechts('gespraech')"),
'Das Schließen der Station nimmt dem Gespräch nicht den Platz oder den Fokus');
pruefe(!schliessen.includes('setGespraech(')
  && !schliessen.includes('gespraechSchliessen'),
'Das Schließen der Station schließt auch das Gespräch');
pruefe(schliessen.includes("querySelectorAll('[data-karten-name]')")
  && schliessen.includes('.focus()'),
'Das Schließen der Station gibt den Fokus nicht auf den Namen der Karte zurück');
const gespraechSchliessen = stueck('function gespraechSchliessen() {', '\n      }',
  'Das Schließen des Gesprächs');
pruefe(gespraechSchliessen.includes('setGespraech(null)'),
  'Das Schließen des Gesprächs schließt es nicht');
pruefe(gespraechSchliessen.includes('setGespraechZu(')
  && gespraechSchliessen.includes('gespraech.session || true'),
'Das Schließen des Gesprächs merkt sich nicht, dass es zu ist');
pruefe(gespraechSchliessen.includes('if (stationImDock)')
  && gespraechSchliessen.includes("setRechtsReiter('station')")
  && gespraechSchliessen.includes("fokusRechts('station')"),
'Das Schließen des Gesprächs nimmt der Station nicht den Platz oder den Fokus');
pruefe(!gespraechSchliessen.includes('setAuswahl('),
  'Das Schließen des Gesprächs schließt auch die Station');
const fokusRechts = stueck('function fokusRechts(art) {', '\n      }',
  '`fokusRechts`');
pruefe(fokusRechts.includes("getElementById(art === 'station' ? 'board-station' : 'board-chat')")
  && fokusRechts.includes("knoten.closest('section')")
  && fokusRechts.includes('dock.focus()'),
'`fokusRechts` setzt den Fokus nicht in die `section` des Docks');
pruefe(schliessen.includes('nachRender(')
  && gespraechSchliessen.includes('nachRender('),
'Der Fokus nach dem Schließen wird nicht nach dem Rendern gesetzt');

// 4. Dasselbe Gespräch: dieselben Zustände, Handler und eine Fundstelle.
for (const teil of [
  'gespraechSenden', 'gespraech.eintraege', 'feldHoehe', 'inhaltRef', 'amEnde',
  "id: 'board-chat'", 'S.gespraechFeld', 'S.gespraechFuss', 'gespraechStoppen',
  'gespraechVerwerfen', 'skillEintragen', 'chatOeffnen', 'S.gespraechGriff',
]) {
  pruefe(chatBlock.includes(teil),
    'Dem Gespräch im Dock fehlt „' + teil + '“');
}
pruefe((quelle.match(/id: 'board-chat'/g) || []).length === 1,
  'Die Kennung `board-chat` steht nicht genau einmal im Client');
pruefe((quelle.match(/ref: inhaltRef/g) || []).length === 1,
  'Der Gesprächsinhalt hängt an mehr als einem `inhaltRef`');
pruefe((quelle.match(/gespraech\.eintraege\.map\(/g) || []).length === 1,
  'Die Einträge des Gesprächs werden an mehr als einer Stelle gebaut');
pruefe((quelle.match(/height: feldHoehe \+ 'px'/g) || []).length === 1,
  'Das Eingabefeld des Gesprächs wird an mehr als einer Stelle gebaut');
pruefe((quelle.match(/style: S\.gespraechFuss/g) || []).length === 1,
  'Der Fuß des Gesprächs wird an mehr als einer Stelle gebaut');
const gespraech = stilBlock('gespraech');
pruefe(gespraech.includes("display: 'flex'")
  && gespraech.includes("flexDirection: 'column'")
  && gespraech.includes('minHeight: 0'),
'`S.gespraech` ist kein Körper ohne eigene Höhe mehr');
pruefe(!/(^|\s)width:/.test(gespraech) && !/\bflex:/.test(gespraech)
  && !gespraech.includes('border'),
'`S.gespraech` trägt noch eigene Breite, `flex` oder einen Rand');
pruefe(!dockBlock.includes("id: 'board-chat'"),
  'Die Kennung `board-chat` sitzt noch am Panel statt am Inhalt');

// 4b. Das Gespräch kennt sein Vorhaben selbst — auch wenn die Auswahl
//     inzwischen eine Station ist. Sonst verlieren Senden und Polling ihr Ziel.
const ziel = stueck('function gespraechZiel(stand) {', '\n      }',
  '`gespraechZiel`');
pruefe(ziel.includes('stand.vorhaben')
  && ziel.includes('gewaehltesVorhaben')
  && !ziel.includes('if (!gewaehltesVorhaben) return null;'),
'`gespraechZiel` nimmt das Vorhaben nicht aus dem Gesprächszustand');
const beginnenStart = quelle.indexOf('async function gespraechBeginnen(');
pruefe(beginnenStart >= 0, '`gespraechBeginnen` fehlt');
const beginnenEnde = quelle.indexOf('\n      }', beginnenStart);
pruefe(beginnenEnde > beginnenStart, '`gespraechBeginnen` endet nicht');
const beginnenBlock = quelle.slice(beginnenStart, beginnenEnde);
pruefe((beginnenBlock.match(/vorhaben: gewaehltesVorhaben\.id/g) || []).length === 2,
  '`gespraechBeginnen` schreibt das Vorhaben nicht in beide Zweige');
const autoStart = quelle.indexOf("if (!auswahlId || art !== 'vorhaben') return;");
pruefe(autoStart >= 0, 'Der Wiedereinstieg in ein laufendes Gespräch fehlt');
const autoEnde = quelle.indexOf('}, [data, art, auswahlId, gespraechZu]);', autoStart);
pruefe(autoEnde > autoStart, 'Der Wiedereinstieg endet nicht');
const autoBlock = quelle.slice(autoStart, autoEnde);
pruefe(autoBlock.includes('vorhaben: v.id'),
  'Der Wiedereinstieg schreibt das Vorhaben nicht in den Gesprächszustand');
pruefe(autoBlock.includes('gespraechZu === true'),
  '`gespraechZu === true` gilt im Wiedereinstieg nicht als geschlossen');
const pollStart = quelle.indexOf('const sitzungAktiv =');
pruefe(pollStart >= 0, 'Der Polling-Effekt fehlt');
const pollEnde = quelle.indexOf('}, [sitzungAktiv, gespraechArt, gespraechOrt, gespraechVorhaben]);', pollStart);
pruefe(pollEnde > pollStart, 'Der Polling-Effekt endet nicht');
const pollBlock = quelle.slice(pollStart, pollEnde);
pruefe(pollBlock.includes('const gespraechVorhaben =')
  && pollBlock.includes('encodeURIComponent(gespraechVorhaben)')
  && pollBlock.includes('gespraech.vorhaben ||'),
'Das Polling fragt nicht das Vorhaben des Gesprächs ab');
const senden = stueck('async function sendenFuer(stand, text) {', '\n      }',
  '`sendenFuer`');
pruefe(senden.includes('if (!ziel)')
  && senden.includes('sendet: false'),
'`sendenFuer` lässt „sendet …“ ohne Ziel stehen');
const chatSenden = stueck('async function gespraechSenden() {', '\n      }',
  '`gespraechSenden`');
pruefe(chatSenden.includes('sendenFuer(gespraech, text)'),
  '`gespraechSenden` schickt nicht den Gesprächszustand mit dem Vorhaben');

// 5. Escape und Reiterwechsel.
const panel = stueck('function Panel(', 'function Meldung(', '`Panel`');
pruefe(panel.includes("ev.key !== 'Escape'")
  && panel.includes('onSchliessen();')
  && panel.includes('stopPropagation'),
'`Panel` schließt den aktiven Reiter nicht per Escape');
pruefe(panel.includes('oben'),
  '`Panel` kennt keinen Platz für die Reiterleiste');
pruefe(!reiterBlock.includes('fokusRechts') && !reiterBlock.includes('nachRender'),
  'Ein Reiterwechsel reißt den Fokus vom geklickten Reiter weg');
pruefe(reiterBlock.includes("onClick: () => setRechtsReiter('station')")
  && reiterBlock.includes("onClick: () => setRechtsReiter('gespraech')"),
'Die Reiter wechseln nicht über `rechtsReiter`');
const waehlen = stueck('function schrittWaehlen(id, oeffnen) {', '\n      }',
  '`schrittWaehlen`');
pruefe(waehlen.includes("setRechtsReiter('station')")
  && waehlen.includes("fokusRechts('station')")
  && waehlen.includes('nachRender('),
'Das Öffnen einer Station öffnet nicht ihren Reiter samt Fokus');
const sprung = stueck('function springeZuStation(p) {', '\n      }',
  'Der Sprung zur Station');
pruefe(sprung.includes("getElementById('board-station')")
  && sprung.includes("kopf.closest('section')")
  && sprung.includes('dock.focus()'),
'Der Sprung aus der Suche fokussiert nicht mehr die `section` des Docks');

// 6. Breite: `spaltenBreite` gilt für das Dock, ein Griff.
pruefe(quelle.includes('Math.max(300, Number(gemerkt.spaltenBreite) || 380)'),
  '`spaltenBreite` hat nicht die Vorgabe 380 und die Untergrenze 300');
pruefe(quelle.includes('spaltenBreite: 380,'),
  'Der gemerkte Stand startet nicht bei 380 px');
pruefe(dockBlock.includes("width: spaltenBreite + 'px'")
  && dockBlock.includes("maxWidth: 'calc(100vw - 133px)'"),
'Das Dock übernimmt `spaltenBreite` nicht und lässt keinen Platz für den Griff');
const griffStart = quelle.indexOf("rechtsDock ? h('div', {");
pruefe(griffStart >= 0, 'Der Breitengriff des Docks fehlt');
const griffEnde = quelle.indexOf("}, h('span', { style: S.dockBreiteStrich })) : null", griffStart);
pruefe(griffEnde > griffStart, 'Der Breitengriff des Docks endet nicht');
const griff = quelle.slice(griffStart, griffEnde);
pruefe(griff.includes('S.dockBreiteGriff'),
  'Der Breitengriff benutzt nicht den Dock-Stil');
pruefe(griff.includes('window.innerWidth - 520')
  && griff.includes('window.innerWidth - 133')
  && griff.includes('Math.max(300'),
'Der Breitengriff hält die Grenzen 300 und das Fenster samt 9-px-Griff nicht ein');
pruefe(griff.includes("zeigerFest('col-resize')"),
  'Der Breitengriff zeigt keinen Spalten-Zeiger');
pruefe((quelle.match(/style: S\.dockBreiteGriff/g) || []).length === 1,
  'Es gibt mehr als einen Dock-Breitengriff');
pruefe((quelle.match(/style: S\.dockBreiteStrich/g) || []).length === 1,
  'Es gibt mehr als einen Griffstrich');

// 7. Ein Seitenpanel zur Zeit und die 614 Schlüssel.
pruefe(waehlen.includes('setLeiste(null)'),
  'Das Öffnen einer Station schließt die linke Leiste nicht');
const leiste = stueck('function leisteOeffnen() {', '\n      }',
  'Das Öffnen der Leiste');
pruefe(leiste.includes("setAuswahl((alt) => (alt && alt.art === 'schritt' ? null : alt))")
  && !leiste.includes('setAuswahl(null)'),
'Das Öffnen der Leiste schließt die Station nicht oder auch ein Vorhaben');
pruefe(leiste.includes('setGespraech(null)')
  && leiste.includes('setGespraechZu('),
'Das Öffnen der Leiste nimmt das Gespräch nicht aus der Ansicht');
const schiene = stueck('const schienenKnopf =', 'const schiene =',
  'Der Schienenknopf');
pruefe(schiene.includes('leisteOeffnen()'),
  'Die Schiene schließt das rechte Dock nicht');
const katalog = stueck('function katalogZeigen(name) {', '\n      }',
  '`katalogZeigen`');
pruefe(katalog.includes('leisteOeffnen()'),
  'Der Katalog schließt das rechte Dock nicht');
const beginnen = stueck('async function gespraechBeginnen(', '\n      }',
  '`gespraechBeginnen`');
pruefe(beginnen.includes('setLeiste(null)')
  && beginnen.includes("setRechtsReiter('gespraech')")
  && beginnen.includes("fokusRechts('gespraech')"),
'Das Gespräch öffnet nicht seinen Reiter, den Fokus und den Leistenplatz');
const werkstatt = stueck('async function werkstattStarten() {', '\n      }',
  '`werkstattStarten`');
pruefe(werkstatt.includes('setLeiste(null)')
  && werkstatt.includes("setRechtsReiter('gespraech')"),
'Die Werkstatt öffnet nicht den Gesprächsreiter');

const schluessel = new Set(texteSchluessel(quelle));
const { alle: serverSaetze } = await rechteTexte();
for (const satz of serverSaetze) schluessel.add(satz);
pruefe(schluessel.size === 614,
  'Client und Server tragen ' + schluessel.size + ' Schlüssel statt 614');
pruefe(schluessel.has('Station') && schluessel.has('Gespräch'),
  'Die beiden vorhandenen Reiterwörter fehlen in den Schlüsseln');

console.log('ok Gespräch im rechten Dock: ein Dock nach dem raum, Reiter nur bei '
  + 'zwei offenen Flächen, aktiver Kopf und Schließer, dieselben Chat-Handler, '
  + 'Escape und Fokus, Dockbreite mit einem Griff, Leiste schließt das Dock, '
  + '614 Schlüssel');
