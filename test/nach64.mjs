/**
 * Prüfung Schritt 64 — Die Fläche erklärt sich.
 *
 * `client.js` und die Wörterbücher werden als Text gelesen, ohne Browser.
 * Geprüft wird:
 *
 *   1. der Satz für die leere Fläche steht als `uebersetze('…')` im Client
 *      und in allen sieben Wörterbüchern (`ar, en, es, fr, ja, ru, zh`) —
 *      nicht leer, und der vorhandene Weg (Bibliothek) wird benannt;
 *   2. das Bibliotheks-Panel sitzt im Dock (`S.dock`) und nimmt dessen volle
 *      Höhe; der Kopf bleibt stehen, weil nur der Inhalt in einem eigenen
 *      Rollfeld liegt;
 *   3. „Alles zeigen“ setzt `scrollLeft` und `scrollTop` aus den
 *      Kartenpositionen und begrenzt beide auf den scrollbaren Bereich;
 *      ohne Karten ist der Knopf nicht da;
 *   4. die Suite selbst ist der vierte Punkt der Prüfung im Schritt; sie
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
const LEER = 'Noch keine Station auf dieser Fläche: Stationen entstehen in der Bibliothek — öffne sie links in der Leiste und stelle sie von dort auf die Fläche.';
const ZEIGEN = 'Alles zeigen';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');
const schluessel = new Set(texteSchluessel(quelle));

// 1. Der Satz steht als übersetzter Text im Client und in sieben Sprachen.
pruefe(quelle.includes("uebersetze('" + LEER + "')"),
  'Der Satz für die leere Fläche steht nicht als uebersetze(...) im Client');
pruefe(schluessel.has(LEER),
  'Das Übersetzungswerkzeug findet den Satz für die leere Fläche nicht');
pruefe(schluessel.has(ZEIGEN),
  'Das Übersetzungswerkzeug findet „Alles zeigen“ nicht');

const satzStelle = quelle.indexOf("uebersetze('" + LEER + "')");
const umfeld = quelle.slice(Math.max(0, satzStelle - 300), satzStelle);
pruefe(umfeld.includes('!karten.length'),
  'Der Satz hängt nicht an der leeren Fläche (`!karten.length`)');
pruefe(umfeld.includes('S.leerFlaeche') && umfeld.includes('S.leerSatz'),
  'Der Satz steht nicht in der Mitte der Fläche (S.leerFlaeche/S.leerSatz)');
pruefe(!umfeld.includes("type: 'button'"),
  'Für die leere Fläche wird ein Knopf gebaut, der ins Leere führen könnte');

const stellen = (text) => [...String(text).matchAll(/\{(\d+)\}/g)]
  .map((treffer) => treffer[1]).sort().join(',');
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'));
  for (const text of [LEER, ZEIGEN]) {
    pruefe(Object.prototype.hasOwnProperty.call(inhalt, text),
      'texte/' + sprache + '.json fehlt „' + text + '“');
    const wert = String(inhalt[text] == null ? '' : inhalt[text]);
    pruefe(wert.trim().length > 0,
      'texte/' + sprache + '.json hat „' + text + '“ leer');
    pruefe(stellen(wert) === stellen(text),
      'texte/' + sprache + '.json verliert bei „' + text + '“ einen Platzhalter');
  }
}

// 2. Die Bibliothek bleibt im Bild: das Dock füllt die Höhe des Körpers, nur
//    der Inhalt rollt. Eine Höchsthöhe am Dock gibt es nicht mehr.
const panelStart = quelle.indexOf('const bibliothekPanel = h(Panel, {');
pruefe(panelStart >= 0, 'Der Bibliothek-Panel-Aufruf fehlt');
const panelEnde = quelle.indexOf('\n      });', panelStart);
pruefe(panelEnde > panelStart, 'Der Bibliothek-Panel-Aufruf endet nicht');
const panel = quelle.slice(panelStart, panelEnde);
pruefe(panel.includes('seiteStil: S.dock'),
  'Die Bibliothek gibt den Stil ihres Docks S.dock nicht hinein');
pruefe(panel.includes('style: S.bibInhalt'),
  'Der Inhalt der Bibliothek liegt nicht in einem eigenen Rollfeld');
pruefe(!panel.includes('S.leistenFlaeche'),
  'Die Bibliothek hängt noch an der alten Leistenfläche');

const koerperStart = quelle.indexOf('      koerper: {');
pruefe(koerperStart >= 0, 'Der Streifen `koerper` fehlt');
const koerperEnde = quelle.indexOf('\n      },', koerperStart);
pruefe(koerperEnde > koerperStart, 'Der Streifen `koerper` endet nicht');
const koerperStil = quelle.slice(koerperStart, koerperEnde);
pruefe(koerperStil.includes("display: 'flex'")
  && koerperStil.includes('flex: 1')
  && koerperStil.includes('minHeight: 0'),
'Der Körper gibt dem Dock keine feste Höhe (`flex: 1`, `minHeight: 0`)');

const dockStart = quelle.indexOf('      dock: {');
pruefe(dockStart >= 0, 'Der Stil `dock` fehlt');
const dockEnde = quelle.indexOf('\n      },', dockStart);
pruefe(dockEnde > dockStart, 'Der Stil `dock` endet nicht');
const dockStil = quelle.slice(dockStart, dockEnde);
pruefe(dockStil.includes("width: 'min(360px, calc(100vw - 124px))'"),
  'Das Dock ist nicht 360 px breit und bei schmalem Fenster begrenzt');
pruefe(dockStil.includes("display: 'flex'")
  && dockStil.includes("flexDirection: 'column'"),
'Das Dock ist keine Spalte — der Kopf könnte mitscrollen');
pruefe(dockStil.includes('borderRight:'),
  'Dem Dock fehlt die Kante zur Fläche');
pruefe(dockStil.includes('minHeight: 0'),
  'Das Dock kann nicht unter seinen Inhalt schrumpfen — es zwänge die Seite');
pruefe(!dockStil.includes('position:'),
  'Das Dock schwebt noch über der Fläche');
pruefe(!dockStil.includes('maxHeight'),
  'Das Dock begrenzt sich noch mit einer Höchsthöhe statt der Körperhöhe');

const inhaltStart = quelle.indexOf('bibInhalt: {');
pruefe(inhaltStart >= 0, 'Das Rollfeld `bibInhalt` fehlt');
const inhaltEnde = quelle.indexOf('}', inhaltStart);
const inhaltStil = quelle.slice(inhaltStart, inhaltEnde);
pruefe(inhaltStil.includes("overflow: 'auto'"),
  'Das Rollfeld der Bibliothek rollt nicht (`overflow: auto`)');
pruefe(inhaltStil.includes('minHeight: 0'),
  'Das Rollfeld der Bibliothek kann nicht unter seinen Inhalt schrumpfen');
pruefe(inhaltStil.includes('flex: 1'),
  'Das Rollfeld füllt die restliche Höhe des Docks nicht');

// 3. „Alles zeigen“: die Fläche rollt auf den Mittelpunkt der Karten.
const zeigStart = quelle.indexOf('function allesZeigen()');
pruefe(zeigStart >= 0, 'Die Funktion `allesZeigen` fehlt');
const zeigEnde = quelle.indexOf('\n      }', zeigStart);
pruefe(zeigEnde > zeigStart, 'Die Funktion `allesZeigen` endet nicht');
const zeigBlock = quelle.slice(zeigStart, zeigEnde);
pruefe(zeigBlock.includes('karten.map'),
  '„Alles zeigen“ rechnet nicht aus den Kartenpositionen');
pruefe(zeigBlock.includes('breiteFuer(p)'),
  '„Alles zeigen“ kennt die Breite einer geöffneten Karte nicht');
pruefe(zeigBlock.includes('raum.scrollWidth')
  && zeigBlock.includes('raum.clientWidth'),
'„Alles zeigen“ begrenzt nicht auf den waagerecht scrollbaren Bereich');
pruefe(zeigBlock.includes('raum.scrollHeight')
  && zeigBlock.includes('raum.clientHeight'),
'„Alles zeigen“ begrenzt nicht auf den senkrecht scrollbaren Bereich');
pruefe(/raum\.scrollLeft\s*=\s*Math\.max\(0,\s*Math\.min\(/.test(zeigBlock),
  '„Alles zeigen“ setzt `scrollLeft` nicht begrenzt');
pruefe(/raum\.scrollTop\s*=\s*Math\.max\(0,\s*Math\.min\(/.test(zeigBlock),
  '„Alles zeigen“ setzt `scrollTop` nicht begrenzt');

const knopfStart = quelle.indexOf('const allesZeigenKnopf =');
pruefe(knopfStart >= 0, 'Der Knopf `allesZeigenKnopf` fehlt');
const knopfEnde = quelle.indexOf(': null;', knopfStart);
pruefe(knopfEnde > knopfStart, 'Der Knopf `allesZeigenKnopf` endet nicht');
const knopf = quelle.slice(knopfStart, knopfEnde);
pruefe(knopf.includes('karten.length'),
  'Der Knopf „Alles zeigen“ hängt nicht an vorhandenen Karten');
pruefe(knopf.includes("uebersetze('" + ZEIGEN + "')"),
  'Der Knopf „Alles zeigen“ trägt nicht seinen übersetzten Text');
pruefe(quelle.includes('onClick: allesZeigen'),
  'Der Knopf „Alles zeigen“ ruft die Funktion nicht');
pruefe(/allesZeigenKnopf\s*[,)]/.test(quelle),
  'Der Knopf „Alles zeigen“ steht nicht in der Leiste');

console.log('ok Fläche: leerer Satz in sieben Sprachen, Bibliothek im Dock '
  + 'auf voller Höhe mit rollendem Inhalt, „Alles zeigen“ aus Kartenpositionen begrenzt');
