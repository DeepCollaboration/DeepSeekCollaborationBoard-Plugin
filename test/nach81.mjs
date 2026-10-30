/**
 * Prüfung Schritt 81 — Rahmen: Leiste links, Panel daneben.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. `S.schiene` und `S.dock` stehen im Stilblock; das Dock ist 360 px
 *      breit, volle Höhe, ohne `position`, `margin` und Radius.
 *   2. Der Körper rendert Schiene, Dock und `raum` in dieser Reihenfolge;
 *      der Bibliotheksinhalt und der Verlauf stehen im Dock, nicht mehr
 *      über der Fläche.
 *   3. Die Schiene trägt zwei Knöpfe mit `aria-pressed`; der offene Ort
 *      meldet `true` und ist abgesetzt, der geschlossene bleibt zurück.
 *   4. „Bibliothek“ und „Verlauf“ sind keine Reiter der oberen Leiste mehr:
 *      die Reiter-Funktion und ihre beiden Aufrufe fehlen; Suchfeld und
 *      „Alles zeigen“ stehen in der Kopfzeile (seit Schritt 82).
 *   5. Die Fläche steht auch bei offenem Dock im Baum: keine `display:none`,
 *      keine feste Höhe, ihr `ref` und ihre Mindestbreite bleiben.
 *   6. Beide Orte im Dock tragen einen eigenen Schlüssel und einen eigenen
 *      Schließer: der Wechsel baut das Panel neu auf.
 *   7. `Panel` gibt den Fokus nur zurück, wenn er noch in ihm steht — sonst
 *      springt er beim Wechsel zum zuerst geöffneten Ort zurück.
 *
 * Die Suite selbst ist der letzte Punkt der Prüfung im Schritt; sie läuft
 * über `node --test test/*.mjs` und wird von dieser Datei nicht aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 1. Die beiden neuen Stile und ihre Lage.
const schiene = stilBlock('schiene');
pruefe(schiene.includes("width: '72px'"),
  'Die Schiene ist nicht 72 px breit');
pruefe(schiene.includes("borderRight: '1px solid var(--dsw-alias-border-l1)'"),
  'Der Schiene fehlt die Kante zur Fläche');
pruefe(schiene.includes('var(--dsw-alias-bg-layer-1)'),
  'Die Schiene hat nicht den Hintergrund der Leiste');
pruefe(schiene.includes("flexDirection: 'column'"),
  'Die Schiene legt die Knöpfe nicht untereinander');

const dock = stilBlock('dock');
pruefe(dock.includes("width: 'min(360px, calc(100vw - 124px))'"),
  'Das Dock ist nicht 360 px breit und bei schmalem Fenster begrenzt');
pruefe(dock.includes("flexDirection: 'column'")
  && dock.includes("display: 'flex'"),
'Das Dock ist keine Spalte');
pruefe(dock.includes("borderRight: '1px solid var(--dsw-alias-border-l1)'"),
  'Dem Dock fehlt die Kante zur Fläche');
pruefe(dock.includes('var(--dsw-alias-bg-layer-1)'),
  'Das Dock hat nicht den Hintergrund der Leiste');
pruefe(dock.includes('minHeight: 0'),
  'Das Dock kann nicht unter seinen Inhalt schrumpfen');
pruefe(!dock.includes('position:'),
  'Das Dock schwebt noch über der Fläche (position)');
pruefe(!/margin/.test(dock),
  'Das Dock trägt einen Außenabstand (margin)');
pruefe(!dock.includes('borderRadius'),
  'Das Dock hat einen Radius; die Kante soll trennen');
pruefe(!dock.includes('maxHeight') && !/\bheight:/.test(dock),
  'Das Dock hat eine feste Höhe statt der Höhe des Körpers');

// 2. Der Körper: Schiene, Dock, Fläche — in dieser Reihenfolge. Der `raum`
//    behält seinen `ref`; das Dock steht davor und ist nicht Teil von ihm.
const koerperStelle = quelle.indexOf("h('div', { style: S.koerper },");
pruefe(koerperStelle >= 0, 'Der Körper `S.koerper` wird nicht gerendert');
const koerper = quelle.slice(koerperStelle, koerperStelle + 260);
pruefe(/\n\s*schiene,\s*\n\s*dock,\s*\n\s*h\('div', \{\s*\n\s*ref: raumRef,/.test(koerper),
  'Der Körper rendert nicht Schiene, Dock und danach den `raum` mit `ref`');

const raumStelle = quelle.indexOf('ref: raumRef', koerperStelle);
pruefe(raumStelle > koerperStelle, 'Der `raum` steht nicht hinter dem Dock');
const raum = quelle.slice(raumStelle, raumStelle + 360);
pruefe(/flex:\s*1/.test(raum),
  'Der `raum` füllt die restliche Breite nicht');
pruefe(/minWidth:\s*0/.test(raum),
  'Der `raum` kann nicht unter seine Mindestbreite schrumpfen');
pruefe(/minHeight:\s*0/.test(raum),
  'Der `raum` kann nicht unter seine Mindesthöhe schrumpfen');
pruefe(!/display:\s*'none'/.test(raum),
  'Der `raum` wird bei offenem Dock versteckt');
pruefe(!/\bheight:/.test(raum) && !raum.includes('maxHeight:'),
  'Der `raum` bekommt eine feste Höhe, die das Dock verdrängt');

// Der Bibliotheksinhalt liegt im Dock; der Verlauf ebenso, mit Kopf und ✕.
const bibliothek = stueck('const bibliothekPanel = h(Panel, {', '\n      });',
  'Der Bibliothek-Panel-Aufruf');
pruefe(bibliothek.includes('seiteStil: S.dock'),
  'Die Bibliothek sitzt nicht im Dock');
pruefe(bibliothek.includes("kinder: h('div', { style: S.bibInhalt }"),
  'Der Bibliotheksinhalt liegt nicht im rollenden Teil des Docks');

const verlauf = stueck('const verlaufPanel = h(Panel, {', '\n      });',
  'Der Verlauf-Panel-Aufruf');
pruefe(verlauf.includes('seiteStil: S.dock'),
  'Der Verlauf sitzt nicht im Dock');
pruefe(verlauf.includes("kinder: h('div', { style: S.bibInhalt }, verlaufFlaeche)"),
  'Der Verlauf liegt nicht im rollenden Teil des Docks');
pruefe(verlauf.includes('fokus: true')
  && verlauf.includes("onSchliessen: () => setLeiste(null)"),
'Der Verlauf holt den Fokus nicht oder schließt das Dock nicht');
pruefe(bibliothek.includes('fokus: true')
  && bibliothek.includes("onSchliessen: () => setLeiste(null)"),
'Die Bibliothek holt den Fokus nicht oder schließt das Dock nicht');

// 6. Beim Wechsel zwischen zwei Orten wird das Dock neu aufgebaut: beide
//    Flächen tragen einen eigenen Schlüssel, sonst bleibt das alte Panel
//    stehen, der Fokus bleibt auf dem Knopf und Escape erreicht nichts.
const schluesselBib = /\bkey:\s*'([^']+)'/.exec(bibliothek);
const schluesselVerlauf = /\bkey:\s*'([^']+)'/.exec(verlauf);
pruefe(schluesselBib && schluesselVerlauf
  && schluesselBib[1] !== schluesselVerlauf[1],
'Bibliothek und Verlauf tragen keinen eigenen Schlüssel; beim Wechsel bleibt das alte Panel stehen');

// 7. `Panel` gibt den Fokus nur zurück, wenn er noch in ihm steht. Sonst
//    reißt ein Wechsel den Fokus auf den zuerst geöffneten Ort zurück.
const panel = stueck('function Panel({', '    /**\n     * Eine Meldung', 'Panel');
pruefe(panel.includes('const knoten = flaeche.current'),
  'Panel merkt sich seinen Knoten nicht für die Fokus-Rückgabe');
pruefe(panel.includes('knoten.contains(jetzt)'),
  'Panel reißt den Fokus beim Schließen zurück, auch wenn er längst woanders steht');

const wahl = stueck("const dock = leiste === 'bibliothek'", ';', 'Die Dock-Wahl');
pruefe(wahl.includes('bibliothekPanel') && wahl.includes('verlaufPanel'),
  'Das Dock wählt nicht zwischen Bibliothek und Verlauf');

// Die alte Leistenfläche über der Fläche ist fort.
pruefe(!quelle.includes('S.leistenFlaeche'),
  'Die alte Leistenfläche `S.leistenFlaeche` wird noch benutzt');

const bibInhalt = stilBlock('bibInhalt');
pruefe(bibInhalt.includes("overflow: 'auto'") && bibInhalt.includes('flex: 1'),
  'Der Inhalt des Docks rollt nicht in der restlichen Höhe');

// 3. Zwei Knöpfe in der Schiene, je mit Zustand.
const schieneStelle = quelle.indexOf("const schiene = h('nav'");
pruefe(schieneStelle >= 0, 'Die Schiene wird nicht gerendert');
const schieneInhalt = quelle.slice(schieneStelle, quelle.indexOf('));', schieneStelle));
const knopfAufrufe = [...schieneInhalt.matchAll(/schienenKnopf\(\s*'([^']+)'/g)]
  .map((treffer) => treffer[1]);
pruefe(knopfAufrufe.length === 2 && knopfAufrufe[0] === 'bibliothek'
  && knopfAufrufe[1] === 'verlauf',
'Die Schiene trägt nicht genau die zwei Knöpfe Bibliothek und Verlauf');
pruefe(schieneInhalt.includes("uebersetze('Bibliothek')")
  && schieneInhalt.includes("uebersetze('Verlauf')"),
'Die Schienenknöpfe tragen nicht ihre beiden vorhandenen Titel');

const knopf = stueck('const schienenKnopf =', "schienenBild(wert), h('span'",
  'Der Schienenknopf');
pruefe(knopf.includes("'aria-pressed': leiste === wert"),
  'Der Schienenknopf meldet seinen Zustand nicht über `aria-pressed`');
pruefe(knopf.includes('S.schienenKnopfAktiv'),
  'Der offene Ort ist nicht abgesetzt');
pruefe(knopf.includes('const oeffnen = leiste !== wert')
  && knopf.includes('setLeiste(oeffnen ? wert : null)'),
  'Ein zweiter Klick schließt das Dock nicht');
// Seit Schritt 84 teilen sich Leiste und rechtes Dock den einen
// Seitenpanel-Platz: die Leiste schließt die Station und nimmt das Gespräch
// aus der Ansicht; das Vorhaben bleibt gewählt.
pruefe(knopf.includes('leisteOeffnen()') && !knopf.includes('setAuswahl(null)'),
  'Das Öffnen der Leiste schließt das rechte Dock nicht');
const leisteOeffnen = stueck('function leisteOeffnen() {', '\n      }',
  'Das Öffnen der Leiste');
pruefe(leisteOeffnen.includes("setAuswahl((alt) => (alt && alt.art === 'schritt' ? null : alt))")
  && !leisteOeffnen.includes('setAuswahl(null)'),
'Das Öffnen der Leiste schließt die offene Station nicht — oder löscht auch ein Vorhaben');
pruefe(leisteOeffnen.includes('setGespraech(null)')
  && leisteOeffnen.includes('setGespraechZu('),
'Das Öffnen der Leiste nimmt ein laufendes Gespräch nicht aus der Ansicht');
pruefe(knopf.includes('title:'),
  'Dem Schienenknopf fehlt der Titel');

const aktiv = stilBlock('schienenKnopfAktiv');
pruefe(aktiv.includes('var(--dsw-alias-label-primary)'),
  'Der offene Ort trägt nicht die Farbe der Hauptschrift');
pruefe(aktiv.includes('background:') && aktiv.includes('var(--dsw-alias-'),
  'Der offene Ort ist nicht hinterlegt');

const bild = stueck('const schienenBild =', "'aria-hidden': 'true'",
  'Das Symbol der Schiene');
pruefe(bild.includes('width: 20, height: 20'),
  'Das Symbol ist nicht 20 × 20');
pruefe(bild.includes("stroke: 'currentColor'") && bild.includes("fill: 'none'"),
  'Das Symbol zeichnet nicht mit der Schriftfarbe und ohne Füllung');

// 4. Die obere Leiste trägt keine Reiter mehr.
pruefe(!quelle.includes('const reiter ='),
  'Die Reiter-Funktion der oberen Leiste steht noch im Client');
pruefe(!quelle.includes("reiter('bibliothek'")
  && !quelle.includes("reiter('verlauf'"),
'„Bibliothek“ und „Verlauf“ sind noch Reiter der oberen Leiste');
pruefe(!quelle.includes('S.reiterOffen') && !quelle.includes('S.reiterPfeil'),
  'Die Stile der alten Reiter stehen noch im Client');

const oben = stueck("h('div', { style: S.kopfZeile },", "h('div', { style: S.koerper },",
  'Die Kopfzeile');
pruefe(oben.includes('stationsFeld') && oben.includes('allesZeigenKnopf'),
  'Suchfeld oder „Alles zeigen“ fehlen in der Kopfzeile');
pruefe(!oben.includes("uebersetze('Bibliothek')")
  && !oben.includes("uebersetze('Verlauf')"),
'Die Kopfzeile baut noch die beiden alten Reiter');
pruefe(quelle.includes('style: S.reiter'),
  '„Alles zeigen“ hat seinen Knopfstil verloren');

// 5. Die Fläche hängt nicht am Dock: der Körper gibt ihr die Höhe, das Dock
//    nimmt nur Breite. `S.koerper` bleibt eine Zeile mit `flex: 1`.
const koerperStil = stilBlock('koerper');
pruefe(koerperStil.includes("display: 'flex'")
  && koerperStil.includes('flex: 1')
  && koerperStil.includes('minHeight: 0'),
'Der Körper gibt der Fläche keine feste Höhe');
pruefe(!koerperStil.includes('height:'),
  'Der Körper trägt eine feste Höhe');

console.log('ok Rahmen: Schiene mit zwei Knöpfen, Dock mit Bibliothek und '
  + 'Verlauf, Fläche unverändert daneben');
