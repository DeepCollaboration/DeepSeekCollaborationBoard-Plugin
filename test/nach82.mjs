/**
 * Prüfung Schritt 82 — Kopfzeile und Fläche.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Die Stile `S.kopfZeile`, `S.trenner` und `S.statusZeile` stehen im
 *      Stilblock und werden gerendert: eine Zeile mit 44 px, zwei Trenner und
 *      eine Statuszeile darunter.
 *   2. Die Kopfzeile trägt links die Boardwahl samt Liste, in der Mitte den
 *      Titel mit dem Dateien-Knopf am Gruppenende, rechts die Menschen als
 *      Chip-Reihe (ohne Überschrift, mit `aria-label`) und danach Suchfeld
 *      und „Alles zeigen“.
 *   3. Die lange Bedienanleitung hängt an `karten.length === 0`: bei einer
 *      Karte fehlt sie, ohne Karte steht sie.
 *   4. „Nur lesen: {0}“ steht in der Statuszeile, nicht mehr zwischen
 *      Kopfzeile und Fläche; der Grund bleibt im `title` des Chips.
 *   5. Die Fläche trägt einen eigenen Hintergrund aus einem `var(--dsw-…)`,
 *      die eigene und die fremden Personenflächen tragen Rand, 12 px Radius
 *      und den Hintergrund der Karten.
 *   6. Kein Text außerhalb der Übersetzung: die Ausnahmeliste in
 *      `test/nach66.mjs` bleibt bei 26 Einträgen, und die Schlüssel des
 *      Clients und die neun Sätze des Servers decken sich mit allen sieben
 *      Wörterbüchern.
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
const SPRACHEN = ['ar', 'en', 'es', 'fr', 'ja', 'ru', 'zh'];

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

// 1. Die drei neuen Stile und ihre Maße.
const kopfZeile = stilBlock('kopfZeile');
pruefe(kopfZeile.includes("display: 'flex'")
  && kopfZeile.includes("alignItems: 'center'"),
'Die Kopfzeile ist keine Zeile mit mittiger Ausrichtung');
pruefe(kopfZeile.includes("minHeight: '44px'"),
  'Die Kopfzeile ist nicht mindestens 44 px hoch');
pruefe(kopfZeile.includes("flexWrap: 'wrap'") && kopfZeile.includes('rowGap'),
  'Die Kopfzeile bricht bei schmalem Fenster nicht um');
pruefe(kopfZeile.includes("gap: '12px'"),
  'Die Kopfzeile hat nicht 12 px Abstand zwischen den Gruppen');
pruefe(kopfZeile.includes("borderBottom: '1px solid var(--dsw-alias-border-l1)'"),
  'Der Kopfzeile fehlt die Trennlinie nach unten');
pruefe(/boxSizing:\s*'border-box'/.test(kopfZeile),
  'Die Kopfzeile rechnet die Trennlinie nicht in ihre Höhe ein');

const trenner = stilBlock('trenner');
pruefe(trenner.includes("width: '1px'") && trenner.includes("height: '20px'"),
  'Der Trenner ist nicht 1 × 20 px');
pruefe(trenner.includes("background: 'var(--dsw-alias-border-l1)'"),
  'Der Trenner trägt nicht die Farbe der Trennlinie');

const statusZeile = stilBlock('statusZeile');
pruefe(statusZeile.includes("display: 'flex'")
  && statusZeile.includes("flexDirection: 'column'"),
'Die Statuszeile stapelt ihre Zeilen nicht');

// Alle drei werden auch gerendert, nicht nur definiert.
pruefe(quelle.includes("style: S.kopfZeile"),
  'Die Kopfzeile `S.kopfZeile` wird nicht gerendert');
pruefe((quelle.match(/style: S\.trenner/g) || []).length === 2,
  'Es stehen nicht genau zwei Trenner zwischen den drei Gruppen');
pruefe(quelle.includes("style: S.statusZeile"),
  'Die Statuszeile `S.statusZeile` wird nicht gerendert');

// 2. Die drei Gruppen der Kopfzeile, in ihrer Reihenfolge.
const kopf = stueck("h('div', { style: S.kopfZeile },", 'statusZeile,', 'Die Kopfzeile');
pruefe(kopf.includes('S.kopfLinks') && kopf.includes('S.boardLeiste')
  && kopf.includes('S.boardWahl'),
'Links fehlt die Boardwahl mit ihrer Liste');
pruefe(kopf.includes('S.kopfMitte') && kopf.includes('S.kopfTitel'),
  'In der Mitte fehlt der Titel');
pruefe(kopf.includes("(eigenerWorkflow(data) || {}).titel || PRODUKT_NAME"),
  'Die Mitte zeigt nicht den Titel des Workflows oder den Produktnamen');
pruefe(kopf.includes("uebersetze('Dateien')"),
  'Der Dateien-Knopf fehlt in der Titelgruppe');
pruefe(kopf.includes('S.kopfRechts') && kopf.includes('S.mitglieder'),
  'Rechts fehlt die Chip-Reihe der Menschen');
pruefe(kopf.includes("'aria-label': uebersetze('Am Board')"),
  'Die Gruppe der Menschen trägt nicht ihren Namen als `aria-label`');
pruefe(!kopf.includes('S.mitgliederTitel') && !kopf.includes('S.mitgliederReihe'),
  'Die alte Überschrift „Am Board“ steht noch in der Kopfzeile');
pruefe(kopf.includes('stationsFeld') && kopf.includes('allesZeigenKnopf'),
  'Suchfeld oder „Alles zeigen“ fehlt in der rechten Gruppe');

const stelleTitel = kopf.indexOf('S.kopfTitel');
const stelleMenschen = kopf.indexOf('S.mitglieder');
const stelleSuche = kopf.indexOf('stationsFeld');
const stelleZeigen = kopf.indexOf('allesZeigenKnopf');
pruefe(stelleTitel > 0 && stelleTitel < stelleMenschen
  && stelleMenschen < stelleSuche && stelleSuche < stelleZeigen,
'Die Reihenfolge Titel → Menschen → Suche → „Alles zeigen“ stimmt nicht');

const mitte = kopf.slice(kopf.indexOf('S.kopfMitte'), kopf.indexOf('S.trenner', kopf.indexOf('S.kopfMitte')));
pruefe(mitte.includes("uebersetze('Dateien')"),
  'Der Dateien-Knopf steht nicht am Ende der Titelgruppe');
pruefe(stilBlock('kopfTitel').includes("fontSize: '18px'"),
  'Der Titel der Kopfzeile ist nicht 18 px groß');

// Die alte Kopfzeilenform ist fort: keine zwei Spalten mit `kopfText`, keine
// eigene Überschrift und keine Leiste über der Fläche.
pruefe(!/\bS\.kopf\b/.test(quelle) && !/\bS\.kopfText\b/.test(quelle),
  'Die alte Kopfzeile (`S.kopf`/`S.kopfText`) steht noch im Client');
pruefe(!quelle.includes('const leistenReiter =') && !/\bS\.leiste\b/.test(quelle),
  'Die alte Leiste über der Fläche steht noch im Client');

// 3. Die lange Bedienanleitung hängt an der leeren Fläche.
const anleitung = quelle.indexOf("uebersetze('Klick auf ein Vorhaben");
pruefe(anleitung >= 0, 'Die lange Bedienanleitung fehlt');
pruefe(quelle.indexOf("uebersetze('Klick auf ein Vorhaben", anleitung + 1) < 0,
  'Die lange Bedienanleitung steht mehr als einmal im Client');
const vorDerAnleitung = quelle.slice(Math.max(0, anleitung - 400), anleitung);
pruefe(vorDerAnleitung.includes('karten.length === 0'),
  'Die lange Bedienanleitung hängt nicht an `karten.length === 0`');
const umDieAnleitung = quelle.slice(anleitung - 400, anleitung + 500);
pruefe(umDieAnleitung.includes("? h('p'") && /:\s*null\)/.test(umDieAnleitung),
  'Die lange Bedienanleitung steht nicht in einem bedingten Zweig');

// 4. „Nur lesen“ steht in der Statuszeile, der Grund bleibt am Chip.
const statusStart = quelle.indexOf('const statusZeile =');
const statusEnde = quelle.indexOf(': null;', statusStart);
pruefe(statusStart >= 0 && statusEnde > statusStart, 'Die Statuszeile fehlt');
const status = quelle.slice(statusStart, statusEnde);
pruefe(status.includes('S.statusZeile'),
  'Die Statuszeile rendert ihren eigenen Stil nicht');
pruefe(status.includes("uebersetze('Nur lesen: {0}', [darfGrund"),
  'Der Grund zu „Nur lesen“ steht nicht in der Statuszeile');
pruefe(status.includes('darfHinweis'),
  'Der Weg zu „Nur lesen“ steht nicht in der Statuszeile');
pruefe(status.includes('standZeile(data.stand)')
  && status.includes('repoStandZeile(eintrag)')
  && status.includes('formatWarnung')
  && status.includes('sichtbarkeitsZeile(eintrag)'),
'Warnungen oder Abgleichzeilen fehlen in der Statuszeile');
pruefe(status.includes('h(Meldung, {') && status.includes('status.text'),
  'Die Meldung steht nicht in der Statuszeile');
const ausserhalb = quelle.slice(0, statusStart) + quelle.slice(statusEnde);
pruefe(!ausserhalb.includes("uebersetze('Nur lesen: {0}'"),
  '„Nur lesen: {0}“ steht noch außerhalb der Statuszeile');
pruefe(kopf.includes('title: darfGrund ?'),
  'Der Grund fehlt im `title` des Nur-lesen-Chips');
pruefe(quelle.includes("uebersetze('Du liest mit')")
  && quelle.includes('ersteSitzungHinweis,'),
'Der Hinweis „Du liest mit“ mit dem Token-Knopf fehlt');

// 5. Fläche und Personenflächen.
const flaecheStart = quelle.indexOf("const flaeche = h('div', {");
pruefe(flaecheStart >= 0, 'Die Fläche wird nicht gebaut');
const flaeche = quelle.slice(flaecheStart, quelle.indexOf('onDragOver:', flaecheStart));
pruefe(flaeche.includes("className: 'board-flaeche'"),
  'Die Fläche trägt ihre Klasse für den Ton nicht');
pruefe(!/background:/.test(flaeche),
  'Die Fläche setzt ihren Ton noch als eigenen Stil statt über die Klasse');
// Im hellen Modus sind alle Schichttöne weiß: die Fläche braucht eine
// Mischung, die auch dort dunkler wird — und einen Rückfall ohne `color-mix`.
const ton = quelle.slice(quelle.indexOf('.board-flaeche'));
const tonRegel = ton.slice(0, ton.indexOf('}'));
pruefe(tonRegel.includes('background: var(--dsw-alias-bg-layer-2);'),
  'Dem Ton der Fläche fehlt der Rückfall ohne `color-mix`');
pruefe(tonRegel.includes('background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 94%,')
  && tonRegel.includes('var(--dsw-static-neutral-bluish-950) 6%)'),
'Der Ton der Fläche mischt nicht opak gegen einen dunklen Ton');
pruefe(flaeche.includes('radial-gradient'),
  'Die Fläche hat ihr Punktraster verloren');
pruefe(flaeche.includes("borderRadius: '8px'"),
  'Die Fläche ist nicht abgerundet');

for (const name of ['eigeneFlaeche', 'fremdFlaeche']) {
  const flaecheStil = stilBlock(name);
  pruefe(/borderRadius:\s*'12px'/.test(flaecheStil),
    'S.' + name + ' hat keinen 12-px-Radius');
  pruefe(/border:\s*'1px solid var\(--dsw-alias-border-l1\)'/.test(flaecheStil),
    'S.' + name + ' hat keinen Rand');
  pruefe(/background:\s*'var\(--dsw-alias-bg-layer-1\)'/.test(flaecheStil),
    'S.' + name + ' trägt nicht den Hintergrund der Karten');
}
pruefe(quelle.includes('style: S.eigeneFlaeche'),
  'Die eigene Person sitzt nicht in ihrer Karte');
pruefe(quelle.includes('...S.fremdFlaeche'),
  'Die fremden Personen sitzen nicht in ihren Karten');
pruefe(quelle.includes('eigenerKopf') && quelle.includes('S.flaechenKopf'),
  'Der Kopf der eigenen Fläche ist verloren');
const eigeneKarte = stueck("h('div', { style: S.eigeneFlaeche },", 'neuesVorhaben,',
  'Die eigene Karte');
pruefe(eigeneKarte.includes('eigenerKopf') && eigeneKarte.includes('flaeche'),
  'Die eigene Karte enthält nicht Kopf und Fläche');
pruefe(quelle.includes('style: S.fremdKopf'),
  'Der Kopf der fremden Flächen ist verloren');

// 6. Kein Text außerhalb der Übersetzung: die Ausnahmen bleiben, die
// Wörterbücher decken die Schlüssel des Clients.
const nach66 = readFileSync(join(HIER, 'nach66.mjs'), 'utf8');
const ausnahmenBlock = nach66.slice(
  nach66.indexOf('const AUSNAHMEN = new Map(['),
  nach66.indexOf('\n]);', nach66.indexOf('const AUSNAHMEN = new Map([')),
);
const ausnahmen = (ausnahmenBlock.match(/^  \['/gm) || []).length;
pruefe(ausnahmen === 26,
  'Die Ausnahmeliste in `test/nach66.mjs` hat ' + ausnahmen + ' statt 26 Einträge');

const schluessel = new Set(texteSchluessel(quelle));
const { alle: serverSaetze } = await rechteTexte();
for (const satz of serverSaetze) schluessel.add(satz);
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'));
  const fehlt = [...schluessel].filter((wort) => !(wort in inhalt));
  const zuviel = Object.keys(inhalt).filter((wort) => !schluessel.has(wort));
  pruefe(fehlt.length === 0,
    'texte/' + sprache + '.json fehlen ' + fehlt.length + ' Schlüssel, z. B. „'
      + fehlt[0] + '“');
  pruefe(zuviel.length === 0,
    'texte/' + sprache + '.json hat ' + zuviel.length + ' unbekannte Schlüssel, z. B. „'
      + zuviel[0] + '“');
}
pruefe(schluessel.size === 614,
  'Client und Server tragen ' + schluessel.size + ' Schlüssel statt 614');

// 7. Der Zeiger wird am Brett gemessen, nicht am Rollfeld: die Karte der
//    Person trägt Kopf und Polster, sonst landet eine abgelegte Station um
//    eine Kopfhöhe daneben und eine gezogene Schnur beginnt nicht am Port.
const ablegen = stueck('onDrop: (ev) => {', 'schrittEinfuegen(id, x, y);',
  'Das Ablegen auf der Fläche');
pruefe(ablegen.includes('ev.currentTarget.getBoundingClientRect()'),
  'Das Ablegen misst am Rollfeld statt am Brett');
pruefe(!ablegen.includes('flaecheRef.current'),
  'Das Ablegen rechnet weiter mit dem Rollfeld');

const kante = stueck('function kanteZiehen(p, ev) {', 'const strich =',
  'Das Ziehen einer Verbindung');
pruefe(kante.includes('bild.getBoundingClientRect()'),
  'Die gezogene Schnur beginnt nicht am Brett (Ursprung ist das Rollfeld)');

// 8. Die Statuszeile schweigt, solange es nichts zu sagen gibt: ein Board
//    ohne Remote bekommt keine Zeile je Repository, und „0 Fassungen nur
//    hier“ ist keine Nachricht.
const statusBlock = stueck('const statusLuecken = sichtbarkeitsLuecken(data);',
  'const statusZeile =', 'Die Statuszeile');
pruefe(statusBlock.includes('standSichtbar'), 'Der Abgleichstand wird ungefiltert gezeigt');
pruefe(statusBlock.includes('staendeSichtbar'), 'Die Zeilen je Repository werden ungefiltert gezeigt');
// Die Bedingungen werden an ihrer Anweisung geprüft, nicht irgendwo im Block:
// sonst bliebe ein `standSichtbar = Boolean(data.stand)` grün.
function anweisung(von) {
  const start = statusBlock.indexOf(von);
  pruefe(start >= 0, 'Die Anweisung „' + von + '“ fehlt');
  return statusBlock.slice(start, statusBlock.indexOf(';', start));
}
const standSatz = anweisung('const standSichtbar');
pruefe(standSatz.includes("'kein remote'") && standSatz.includes('nur_lokal'),
  'Der Abgleichstand „kein Remote“ wird ohne Aufgabe gezeigt');
const staendeSatz = anweisung('const staendeSichtbar');
pruefe(/\.filter\(/.test(staendeSatz)
  && staendeSatz.includes('eintrag.fehler')
  && staendeSatz.includes('nur_lokal')
  && staendeSatz.includes("!== 'abgeglichen'")
  && staendeSatz.includes("!== 'kein remote'"),
'Die Zeilen je Repository werden nicht nach Fehler, offenen Fassungen und Abgleich gefiltert');

const repoZeile = stueck('function repoStandZeile(eintrag) {', 'return zeile;',
  'Die Zeile je Repository');
pruefe(/if \(offen > 0\)/.test(repoZeile),
  'Die Zeile je Repository nennt auch „0 Fassungen nur hier“');
const standFunktion = stueck('function standZeile(stand) {', 'return teile.join',
  'Die Zusammenfassung des Abgleichs');
pruefe(/if \(offen > 0\)/.test(standFunktion),
  'Die Zusammenfassung nennt auch „0 Fassungen nur hier“');

// 9. Die Board-Liste sagt ihren Stand in Worten, die er versteht: kein
//    „Fehler“, wo nur der Abgleich fehlt, keine Kürzel „W 1 · V 4 · S 11“.
const standWort = stueck('const boardStandWort = (b) => {', '\n      };',
  'Das Standwort der Board-Liste');
pruefe(!standWort.includes("'Fehler'"),
  'Die Board-Liste nennt einen fehlenden Abgleich „Fehler“');
pruefe(!standWort.includes('nur lokal: '),
  'Die Board-Liste sagt „nur lokal: 3“ statt eines Satzes');
pruefe(/uebersetze\('1 Fassung nur hier'\)/.test(standWort)
  && /uebersetze\('\{0\} Fassungen nur hier'/.test(standWort),
'Die Board-Liste übersetzt ihre offenen Fassungen nicht');
pruefe(!quelle.includes('const boardVerweise'),
  'Die Board-Liste zeigt weiter die Kürzel W · V · S');
pruefe(quelle.includes('boardZeileText(b)'),
  'Die Board-Zeile setzt Besitzer und Stand nicht zusammen');
const zeileText = stueck('const boardZeileText = (b) =>', ';',
  'Die Zeile aus Besitzer und Stand');
pruefe(zeileText.includes('boardStandWort(b)') && zeileText.includes('besitzer'),
  'Die Board-Zeile nennt Besitzer und Stand nicht');
pruefe(!/boardForm\(b\)/.test(quelle),
  'Die Board-Zeile nennt weiter „Form 1“ oder „Form 2“');

console.log('ok Kopfzeile: drei Gruppen mit zwei Trennern, Titel 18 px, '
  + 'Menschen als Chips mit aria-label, Suche und „Alles zeigen“ rechts, '
  + 'Statuszeile mit „Nur lesen“; Fläche und Personenflächen abgesetzt; '
  + '26 Ausnahmen, 614 Schlüssel in sieben Wörterbüchern');
