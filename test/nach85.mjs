/**
 * Prüfung Schritt 85 — Übersetzungen schließen.
 *
 * Die Gründe und Hinweise des Servers (`rechte.js`) und die Vorgabe in
 * `index.js` erscheinen in der Sprache des Dashboards. Geprüft wird:
 *
 *   1. Die acht Konstanten aus `rechte.js` und die Vorgabe aus `index.js`
 *      werden gelesen; es sind genau neun verschiedene Sätze.
 *   2. Jeder dieser Sätze steht zeichengleich in allen sieben Wörterbüchern,
 *      hat einen nicht-leeren Wert, ist übersetzt und trägt dieselben
 *      Platzhalter wie der deutsche Schlüssel. `de.json` bleibt leer.
 *   3. Gegenprobe: Wird ein Satz aus `en` entfernt, wird die Prüfung rot.
 *   4. `darfHinweis` geht im Client durch `uebersetze`; eine rohe Ausgabe
 *      des Hinweises gibt es nicht mehr. Der Grund in den Einstellungen
 *      (`daten.darfGrund`) geht ebenfalls durch `uebersetze`.
 *
 * Die Qualität einer Übersetzung kann kein Test messen — nur ihre
 * Vollständigkeit und ihre Form.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';
import { rechteTexte } from './rechte-texte.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const SPRACHEN = ['en', 'es', 'fr', 'ru', 'ja', 'ar', 'zh'];
const ANZAHL = 614;

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');

/** Die Platzhalter eines Textes als sortierte Folge, z. B. `0,2`. */
function stellen(text) {
  return [...String(text).matchAll(/\{(\d+)\}/g)]
    .map((treffer) => treffer[1])
    .sort()
    .join(',');
}

/** Ein Wörterbuch gegen die neun Sätze prüfen; wirft beim ersten Fehler. */
function pruefeWoerterbuch(sprache, inhalt, saetze) {
  for (const satz of saetze) {
    pruefe(Object.prototype.hasOwnProperty.call(inhalt, satz),
      'texte/' + sprache + '.json fehlt der Satz „' + satz + '“');
    const wert = String(inhalt[satz] == null ? '' : inhalt[satz]);
    pruefe(wert.trim().length > 0,
      'texte/' + sprache + '.json hat einen leeren Text zu „' + satz + '“');
    pruefe(wert.trim() !== satz.trim(),
      'texte/' + sprache + '.json lässt „' + satz + '“ deutsch stehen');
    pruefe(stellen(wert) === stellen(satz),
      'Die Übersetzung „' + wert + '“ verliert die Werte von „' + satz + '“');
  }
}

// 1. Die neun Sätze aus den Quellen des Servers.
const { alle, vorgabe, gruende } = await rechteTexte();
pruefe(gruende.length === 8, 'rechte.js trägt ' + gruende.length + ' statt acht Sätze');
pruefe(alle.length === 9, 'Es sind ' + alle.length + ' statt neun Sätze');
pruefe(new Set(alle).size === 9, 'Die neun Sätze sind nicht alle verschieden');
pruefe(vorgabe === 'Kein Schreibrecht für dieses Board.',
  'index.js: die Vorgabe lautet „' + vorgabe + '“');

// 2. Jedes Wörterbuch trägt die neun Sätze; de.json bleibt leer.
const deutsch = JSON.parse(readFileSync(join(PRODUKT, 'texte', 'de.json'), 'utf8'));
pruefe(Object.keys(deutsch).length === 0, 'texte/de.json ist nicht leer');

const clientSchluessel = new Set(texteSchluessel(quelle));
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(
    readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'),
  );
  pruefeWoerterbuch(sprache, inhalt, alle);
  pruefe(Object.keys(inhalt).length === ANZAHL,
    'texte/' + sprache + '.json trägt ' + Object.keys(inhalt).length
      + ' statt ' + ANZAHL + ' Schlüssel');
  pruefe(Object.keys(inhalt).length === clientSchluessel.size + alle.length,
    'texte/' + sprache + '.json deckt die Schlüssel des Clients und die neun Sätze nicht');
}

// 3. Gegenprobe: einen Satz aus `en` entfernen → rot.
const en = JSON.parse(readFileSync(join(PRODUKT, 'texte', 'en.json'), 'utf8'));
const ohneSatz = { ...en };
delete ohneSatz[alle[0]];
let rot = false;
try {
  pruefeWoerterbuch('en (Gegenprobe)', ohneSatz, alle);
} catch {
  rot = true;
}
pruefe(rot, 'Die Gegenprobe bleibt grün: ein fehlender Satz wird nicht bemerkt');

// 4. Der Hinweis geht durch `uebersetze`, nirgends roh; der Grund in den
//    Einstellungen ebenfalls.
const hinweis = quelle.indexOf('darfHinweis\n');
pruefe(hinweis >= 0, 'Die Hinweiszeile des Clients fehlt');
const hinweisBlock = quelle.slice(hinweis, quelle.indexOf(': null)', hinweis));
pruefe(hinweisBlock.includes('uebersetze(darfHinweis)'),
  'darfHinweis geht nicht durch uebersetze');
pruefe(!/,\s*darfHinweis\s*\)/.test(quelle),
  'darfHinweis wird an einer Stelle noch roh übergeben');
pruefe(quelle.includes('uebersetze(darfGrund)'),
  'darfGrund geht nicht mehr durch uebersetze');
pruefe(/uebersetze\(String\(daten\.darfGrund\s*\|\|\s*'Für dieses Board fehlt das Schreibrecht\.'\)\)/.test(quelle),
  'Der Grund in den Einstellungen geht nicht durch uebersetze');

console.log('ok Übersetzungen: ' + alle.length + ' Sätze des Servers in sieben '
  + 'Wörterbüchern, ' + ANZAHL + ' Schlüssel je Wörterbuch, de.json leer, '
  + 'darfHinweis durch uebersetze, Gegenprobe rot');
