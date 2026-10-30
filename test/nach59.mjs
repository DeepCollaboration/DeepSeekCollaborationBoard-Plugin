/**
 * Prüfung Schritt 59 — Gliederung und Kommentare im Client.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Jeder Schlüssel im Stilblock `S` kommt irgendwo als `S.<schlüssel>`
 *      vor — ein toter Stil fällt mit seinem Namen auf.
 *   2. Jedes `S.<schlüssel>` im Text hat einen Eintrag im Stilblock; dasselbe
 *      für `E`.
 *   3. Die Abschnitte der Gliederung stehen als Köpfe in der Datei.
 *   4. Die berechnete, nie gelesene Variable `spalten` gibt es nicht mehr.
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
const zeilen = quelle.split('\n');

/** Die Zeilen eines Stilblocks `const S = {` bis zur schließenden Klammer. */
function stilBlock(name) {
  const start = zeilen.findIndex((zeile) => zeile === `    const ${name} = {`);
  pruefe(start >= 0, 'Der Stilblock ' + name + ' = { fehlt');
  let tiefe = 0;
  for (let i = start; i < zeilen.length; i += 1) {
    for (const zeichen of zeilen[i]) {
      if (zeichen === '{') tiefe += 1;
      else if (zeichen === '}') tiefe -= 1;
    }
    if (i > start && tiefe === 0) return zeilen.slice(start, i + 1);
  }
  throw new Error('Der Stilblock ' + name + ' endet nicht');
}

/** Die Schlüssel der obersten Ebene eines Stilblocks. */
function schluessel(block) {
  const namen = [];
  for (const zeile of block) {
    const treffer = zeile.match(/^      ([A-Za-z_$][\w$]*):/);
    if (treffer) namen.push(treffer[1]);
  }
  return namen;
}

/** Zählt `S.<schlüssel>` im ganzen Text. */
function benutzt(name, schluesselName) {
  const muster = new RegExp('\\b' + name + '\\.' + schluesselName + '\\b', 'g');
  return (quelle.match(muster) || []).length;
}

for (const name of ['S', 'E']) {
  const block = stilBlock(name);
  const namen = schluessel(block);
  pruefe(namen.length > 0, 'Der Stilblock ' + name + ' hat keine Schlüssel');

  for (const schluesselName of namen) {
    pruefe(benutzt(name, schluesselName) > 0,
      'Toter Stil: ' + name + '.' + schluesselName + ' wird nirgends benutzt');
  }

  const vorhanden = new Set(namen);
  for (const treffer of quelle.matchAll(new RegExp('\\b' + name + '\\.([A-Za-z_$][\\w$]*)', 'g'))) {
    pruefe(vorhanden.has(treffer[1]),
      name + '.' + treffer[1] + ' wird benutzt, steht aber nicht im Stilblock');
  }
}

// Die Abschnitte, die die Gliederung trägt.
const abschnitte = [
  'Übersetzung und Sprache',
  'Theme und Akzent',
  'Stile',
  'Bausteine',
  'Einstellungen',
  'Konto und GitHub',
  'BoardPage',
  'Zustand und Laden',
  'Fläche und Karten',
  'Kanten',
  'Bibliothek',
  'Katalog',
  'Leser',
  'Chat',
  'Beiträge',
  'Fragen',
  'Startseite',
  'Slots und apply',
];
for (const abschnitt of abschnitte) {
  const muster = new RegExp('^\\s*// --- ' + abschnitt + ' ', 'm');
  pruefe(muster.test(quelle), 'Der Abschnittskopf „' + abschnitt + '“ fehlt');
}

// Die tote Variable aus dem alten Spaltenmodell.
pruefe(!/\bconst\s+spalten\b/.test(quelle),
  'Die unbenutzte Variable `spalten` steht noch in client.js');
pruefe(!/\bspalten\.[A-Za-z_$]/.test(quelle) && !/\bspalten\s*\[/.test(quelle),
  '`spalten` wird noch als Wert gelesen');

console.log('ok Gliederung: Stilblöcke S und E ohne tote Schlüssel, '
  + abschnitte.length + ' Abschnitte, keine Variable `spalten`');
