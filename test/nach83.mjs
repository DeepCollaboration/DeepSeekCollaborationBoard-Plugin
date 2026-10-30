/**
 * Prüfung Schritt 83 — Die offene Station steht rechts.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. `S.dockRechts` steht im Stilblock: min(380 px, `100vw - 133px`), volle
 *      Höhe, Spalte, Rand links, Hintergrund `bg-layer-1`, ohne `position`,
 *      `margin` und Radius; `S.dock` trägt dieselbe Begrenzung mit 360 px.
 *   2. Das Dock rendert nur bei `auswahl.art === 'schritt'` und steht im
 *      Körper als Geschwister nach dem `raum`.
 *   3. Karte und Dock bauen ihren Inhalt über dieselbe Funktion
 *      `stationsInhalt(p, imDock)`: die Karte ruft ohne `true` und bekommt
 *      nur den Basisinhalt, das Dock ruft mit `true`; der Inhalt der Karte
 *      wird nicht ein zweites Mal gebaut.
 *   4. Die offene Karte rechnet nicht mehr mit `KARTE_GROSS`/`KARTE_GROSS_HOEHE`:
 *      Breite, Höhe, Fläche und „Alles zeigen“ benutzen die kleinen Maße.
 *   5. `schrittPanel` und `S.detail` sind fort; der Hinweis für eine Station
 *      ohne Karte steht im Dock über dem Formular.
 *   6. Escape schließt über `Panel`, der Fokus kehrt auf `[data-karten-name]`
 *      zurück; der Sprung fokussiert die `section` des Docks über
 *      `closest('section')`, und es ist immer nur ein Seitenpanel offen —
 *      die Leiste schließt nur `art === 'schritt'`, kein Vorhaben.
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

// 1. Das rechte Dock und seine Maße.
const dockLinks = stilBlock('dock');
pruefe(dockLinks.includes("width: 'min(360px, calc(100vw - 124px))'"),
  'Das linke Dock ist nicht 360 px breit und bei schmalem Fenster begrenzt');
const dock = stilBlock('dockRechts');
pruefe(dock.includes("width: 'min(380px, calc(100vw - 133px))'"),
  'Das rechte Dock ist nicht 380 px breit und lässt Platz für den 9-px-Griff');
pruefe(dock.includes("flex: 'none'") && dock.includes('minHeight: 0'),
  'Das rechte Dock kann schrumpfen oder wachsen wie die Fläche');
pruefe(dock.includes("display: 'flex'")
  && dock.includes("flexDirection: 'column'"),
'Das rechte Dock ist keine Spalte');
pruefe(dock.includes("borderLeft: '1px solid var(--dsw-alias-border-l1)'"),
  'Dem rechten Dock fehlt die Trennlinie nach links');
pruefe(dock.includes("background: 'var(--dsw-alias-bg-layer-1)'"),
  'Das rechte Dock trägt nicht den Hintergrund der Panels');
pruefe(!dock.includes('position:'),
  'Das rechte Dock positioniert sich selbst');
pruefe(!/margin/.test(dock),
  'Das rechte Dock trägt einen Außenabstand');
pruefe(!dock.includes('borderRadius'),
  'Das rechte Dock ist abgerundet statt über die Kante getrennt');

// 2. Das eine rechte Dock hängt an Station oder Gespräch und steht als
//    Geschwister nach dem `raum` im Körper. Die Stationsseite baut
//    `stationDockTeile`.
const teileStart = quelle.indexOf('function stationDockTeile()');
pruefe(teileStart >= 0, 'Die Teile des Stationsreiters `stationDockTeile` fehlen');
const teileEnde = quelle.indexOf('\n      // --- Chat', teileStart);
pruefe(teileEnde > teileStart, 'Die Teile des Stationsreiters enden nicht');
const teileBlock = quelle.slice(teileStart, teileEnde);
pruefe(quelle.includes("const stationImDock = !!(auswahl && auswahl.art === 'schritt' && gewaehlt)"),
  'Das rechte Dock hängt nicht an `auswahl.art === \'schritt\'`');
const dockStart = quelle.indexOf('const rechtsDock =');
pruefe(dockStart >= 0, 'Das rechte Dock `rechtsDock` fehlt');
const dockEnde = quelle.indexOf('const formatWarnung =', dockStart);
pruefe(dockEnde > dockStart, 'Das rechte Dock endet nicht');
const dockBlock = quelle.slice(dockStart, dockEnde);
pruefe(dockBlock.includes('h(Panel') && dockBlock.includes('seiteStil: S.dockRechts'),
  'Das rechte Dock ist kein Panel im Stil `S.dockRechts`');
pruefe(dockBlock.includes('fokus: true')
  && dockBlock.includes('onSchliessen: rechtsSchliessen'),
'Das rechte Dock holt den Fokus nicht oder schließt nicht den aktiven Reiter');
pruefe(teileBlock.includes('const bearbeiten = (offeneStelle && !stationEdit'),
  '„Bearbeiten“ erscheint auch ohne Station auf der Fläche oder beim Bearbeiten');

const koerperStart = quelle.indexOf("h('div', { style: S.koerper },");
pruefe(koerperStart >= 0, 'Der Körper der Seite fehlt');
const raumStart = quelle.indexOf("h('div', {\n            ref: raumRef,", koerperStart);
pruefe(raumStart > koerperStart, 'Der `raum` fehlt im Körper');
const raumEnde = aufrufEnde(raumStart);
const raumBlock = quelle.slice(raumStart, raumEnde);
pruefe(!raumBlock.includes('rechtsDock') && !raumBlock.includes('S.dockBreiteGriff'),
  'Das rechte Dock oder sein Griff steht noch als Geschwister im `raum`');
const dockStelle = quelle.indexOf('\n          rechtsDock));', koerperStart);
pruefe(dockStelle > raumEnde,
  'Das rechte Dock steht nicht nach dem `raum` im Körper');
pruefe(!/\n\s*schrittPanel,/.test(quelle),
  'Das alte `schrittPanel` steht noch im Körper');

// 2b. Ein Seitenpanel zur Zeit: die Station schließt die Leiste, die Leiste
//     das rechte Dock — Station und Gespräch.
const waehlen = stueck('function schrittWaehlen(id, oeffnen) {', '\n      }',
  '`schrittWaehlen`');
pruefe(waehlen.includes('setLeiste(null)'),
  'Das Öffnen einer Station schließt die linke Leiste nicht');
const nurStation = "setAuswahl((alt) => (alt && alt.art === 'schritt' ? null : alt))";
const leiste = stueck('function leisteOeffnen() {', '\n      }',
  'Das Öffnen der Leiste');
pruefe(leiste.includes(nurStation) && !leiste.includes('setAuswahl(null)'),
'Das Öffnen der linken Leiste schließt die offene Station nicht — oder löscht auch ein Vorhaben');
pruefe(leiste.includes('setGespraech(null)') && leiste.includes('setGespraechZu('),
  'Das Öffnen der linken Leiste nimmt das Gespräch nicht aus der Ansicht');
const schieneBlock = stueck('const schienenKnopf =', 'const schiene =',
  'Der Schienenknopf');
pruefe(schieneBlock.includes('leisteOeffnen()')
  && !schieneBlock.includes('setAuswahl(null)'),
'Das Öffnen der linken Leiste schließt das rechte Dock nicht');
const katalog = stueck('function katalogZeigen(name) {', '\n      }',
  '`katalogZeigen`');
pruefe(katalog.includes('leisteOeffnen()') && !katalog.includes('setAuswahl(null)'),
  'Der Katalog schließt das rechte Dock nicht — oder löscht auch ein Vorhaben');

// 3. Ein Bau für Karte und Dock.
pruefe((quelle.match(/function stationsInhalt\(p, imDock\)/g) || []).length === 1,
  '`stationsInhalt(p, imDock)` ist nicht genau einmal definiert');
const aufrufe = quelle.match(/stationsInhalt\(/g) || [];
pruefe(aufrufe.length === 3,
  '`stationsInhalt` wird ' + (aufrufe.length - 1) + '× statt zweimal aufgerufen');
const inhaltBau = quelle.match(/const inhalt = \[/g) || [];
pruefe(inhaltBau.length === 1,
  'Der Inhalt der Station wird an ' + inhaltBau.length + ' Stellen gebaut');
const inhaltStart = quelle.indexOf('function stationsInhalt(p, imDock)');
const inhaltEnde = quelle.indexOf('\n      // Der Name, den die Karte zeigt', inhaltStart);
pruefe(inhaltEnde > inhaltStart, '`stationsInhalt` endet nicht');
const stationsInhalt = quelle.slice(inhaltStart, inhaltEnde);
for (const teil of ['stationAnzeige()', 'stationFormular(false)', 'S.anzeigeFuss', 'hier.map(chipFuer)']) {
  pruefe(stationsInhalt.includes(teil),
    '`stationsInhalt` baut „' + teil + '“ nicht');
}
pruefe(stationsInhalt.includes("auswahlId === p.schritt"),
  '`stationsInhalt` unterscheidet offen und geschlossen nicht');
pruefe(stationsInhalt.includes('if (imDock !== true) return inhalt;'),
  '`stationsInhalt` baut den Dock-Inhalt auch ohne `imDock === true`');
pruefe(stationsInhalt.indexOf('if (imDock !== true) return inhalt;')
  < stationsInhalt.indexOf('return [stationAnzeige(), inhalt, fuss];'),
'Der frühe Rückfall auf den Basisinhalt steht nicht vor der Dock-Anzeige');
const kartenMap = stueck('karten.map((p) => {', '\n      }));',
  'Die Karten der Fläche');
pruefe(kartenMap.includes('stationsInhalt(p)'),
  'Die Karte auf der Fläche baut ihren Inhalt nicht über `stationsInhalt`');
pruefe(!kartenMap.includes('stationsInhalt(p, true)'),
  'Die Karte ruft `stationsInhalt` mit `imDock === true` — sie doppelt den Dock-Inhalt');
pruefe(!kartenMap.includes('stationAnzeige()') && !kartenMap.includes('const inhalt = ['),
  'Die Karte baut den Inhalt ein zweites Mal');
pruefe((quelle.match(/stationFormular\(false\)/g) || []).length === 1,
  'Das Formular wird an mehr als einer Stelle gebaut — die Feld-IDs wären doppelt');
pruefe(teileBlock.includes('stationsInhalt(offeneStelle, true)'),
  'Der Stationsreiter baut seinen Inhalt nicht über `stationsInhalt(offeneStelle, true)`');

// 4. Die offene Karte bleibt klein — kein großes Maß mehr.
pruefe(!quelle.includes('KARTE_GROSS'),
  '`KARTE_GROSS` oder `KARTE_GROSS_HOEHE` steht noch im Client');
const breite = stueck('const breiteFuer =', ';', 'Die Breite der Karten');
pruefe(breite.includes('KARTEN_BREITE'),
  'Die Breite einer Karte hängt nicht mehr an `KARTEN_BREITE`');
const hoehe = stueck('const flaechenHoehe =', ';', 'Die Höhe der Fläche');
pruefe(hoehe.includes('KARTEN_HOEHE + 60') && !hoehe.includes('p.schritt ==='),
  'Die Fläche rechnet die offene Karte noch groß');
const zeigen = stueck('function allesZeigen() {', '\n      }', '„Alles zeigen“');
pruefe(zeigen.includes('breiteFuer(p)') && zeigen.includes('KARTEN_HOEHE'),
  '„Alles zeigen“ rechnet nicht mit den kleinen Maßen');
pruefe(!zeigen.includes('eine ?'),
  '„Alles zeigen“ unterscheidet noch eine große Einzelkarte');

// 5. Altes Panel fort, der Hinweis steht im Dock.
pruefe(!quelle.includes('schrittPanel'),
  '`schrittPanel` steht noch im Client');
pruefe(!/\bS\.detail\b/.test(quelle) && !quelle.includes('detailKopf'),
  'Die alten Detail-Stile `S.detail` stehen noch im Client');
pruefe(teileBlock.includes("uebersetze('Noch nicht auf der Fläche — zieh sie dorthin, dann öffnet sie sich dort.')"),
  'Der Hinweis für eine Station ohne Karte steht nicht im Dock');
pruefe(teileBlock.includes('stationFormular(true)'),
  'Das Formular für eine Station ohne Karte steht nicht im Dock');
const hinweisStelle = teileBlock.indexOf("uebersetze('Noch nicht auf der Fläche");
const formularStelle = teileBlock.indexOf('stationFormular(true)');
pruefe(hinweisStelle >= 0 && formularStelle > hinweisStelle,
  'Der Hinweis steht nicht über dem Formular');

// 6. Escape und Fokus.
const schliessen = stueck('function stationSchliessen() {', '\n      }',
  'Das Schließen des Stationsdocks');
pruefe(schliessen.includes('setAuswahl(null)'),
  'Das Schließen des Stationsdocks lässt die Auswahl stehen');
pruefe(schliessen.includes("querySelectorAll('[data-karten-name]')")
  && schliessen.includes('.focus()'),
'Das Schließen gibt den Fokus nicht auf den Namen der Karte zurück');
pruefe(dockBlock.includes('onSchliessen: rechtsSchliessen'),
  'Der Schließer des Panels ist nicht `rechtsSchliessen` (aktiver Reiter)');
const rechtsSchliessen = stueck('function rechtsSchliessen() {', '\n      }',
  '`rechtsSchliessen`');
pruefe(rechtsSchliessen.includes("rechtsAktiv === 'station'")
  && rechtsSchliessen.includes('stationSchliessen()')
  && rechtsSchliessen.includes("rechtsAktiv === 'gespraech'")
  && rechtsSchliessen.includes('gespraechSchliessen()'),
'Das Schließen des Docks wählt nicht den aktiven Reiter');
// Die Karte behält ihre eigene Tastatur (Schritt 61).
const karte = stueck("'data-schritt': p.id", "setAuswahl(null);",
  'Die Karte');
pruefe(karte.includes("ev.key !== 'Escape'")
  && karte.includes("querySelector('[data-karten-name]')")
  && karte.includes('name.focus()'),
'Die geöffnete Karte schließt nicht per Escape oder gibt den Fokus nicht zurück');
pruefe(quelle.includes("'data-karten-name': p.id"),
  'Der Name der Karte ist für den Fokus nicht gezeichnet');
// Der Sprung auf die schon offene Station setzt den Fokus selbst ins Dock;
// beim Aufbau erledigt das `Panel`.
const sprung = stueck('function springeZuStation(p) {', '\n      }',
  'Der Sprung zur Station');
pruefe(sprung.includes("getElementById('board-station')")
  && sprung.includes("kopf.closest('section')")
  && sprung.includes('dock.focus()')
  && !sprung.includes("getElementById('board-station').focus()"),
'Der Sprung fokussiert die h2 statt der umschließenden section des Stationsdocks');

// Die Wörterbücher tragen mit den neun Sätzen des Servers 614 Schlüssel.
const schluessel = new Set(texteSchluessel(quelle));
const { alle: serverSaetze } = await rechteTexte();
for (const satz of serverSaetze) schluessel.add(satz);
pruefe(schluessel.size === 614,
  'Client und Server tragen ' + schluessel.size + ' Schlüssel statt 614');

console.log('ok Offene Station: rechtes Dock min(380px, …) nach dem raum, '
  + 'Karte nur Basisinhalt, Dock mit stationsInhalt(…, true), ein Seitenpanel, '
  + 'schrittPanel und S.detail fort, Hinweis im Dock, Escape/Fokus über Panel '
  + 'und [data-karten-name], Sprung fokussiert #board-station');
