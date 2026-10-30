/**
 * Die neun deutschen Sätze, die der Server an die Seite gibt.
 *
 * `rechte.js` trägt vier Gründe und vier Hinweise; `index.js` die Vorgabe für
 * `darfGrund`. Beide Quellen werden gelesen, nicht abgeschrieben: ändert der
 * Server seinen Text, fehlt er im Wörterbuch und die Prüfung wird rot.
 *
 * Die Datei liegt bewusst als `.js` neben den Prüfungen: `node --test
 * test/*.mjs` führt sie nicht als eigene Prüfung aus, die `.mjs`-Dateien
 * importieren sie.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

/** Die acht Paare aus `rechte.js`, in der Reihenfolge ihrer Erklärung. */
const NAMEN = [
  'GRUND_OHNE_TOKEN',
  'HINWEIS_OHNE_TOKEN',
  'GRUND_OHNE_RECHT',
  'HINWEIS_OHNE_RECHT',
  'GRUND_NICHT_PRUEFBAR',
  'HINWEIS_NICHT_PRUEFBAR',
  'GRUND_ANMELDUNG_UNGUELTIG',
  'HINWEIS_ANMELDUNG_UNGUELTIG',
];

/** Die Vorgabe in `index.js`, wenn der Server keinen Grund mitschickt. */
function liesVorgabe(index) {
  const treffer = index.match(
    /antwort\.darfGrund\s*=\s*grund\s*\|\|\s*'((?:\\.|[^'\\])*)'/,
  );
  if (!treffer) throw new Error('index.js: die Vorgabe für darfGrund fehlt');
  return treffer[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/**
 * `{ gruende, vorgabe, alle }` — `gruende` trägt Name und Satz, `alle` die
 * neun Sätze in der Reihenfolge der Anzeige.
 */
export async function rechteTexte() {
  const modul = await import(pathToFileURL(join(PRODUKT, 'rechte.js')).href);
  const gefunden = Object.keys(modul)
    .filter((name) => /^(GRUND|HINWEIS)_/.test(name))
    .sort();
  const erwartet = [...NAMEN].sort();
  if (JSON.stringify(gefunden) !== JSON.stringify(erwartet)) {
    throw new Error('rechte.js: erwartet ' + erwartet.join(', ')
      + ', gefunden ' + gefunden.join(', '));
  }
  const gruende = NAMEN.map((name) => {
    const satz = modul[name];
    if (typeof satz !== 'string' || !satz.trim()) {
      throw new Error('rechte.js: ' + name + ' fehlt oder ist leer');
    }
    return { name, satz };
  });
  const vorgabe = liesVorgabe(readFileSync(join(PRODUKT, 'index.js'), 'utf8'));
  if (!vorgabe.trim()) throw new Error('index.js: die Vorgabe für darfGrund ist leer');
  return { gruende, vorgabe, alle: [...gruende.map(({ satz }) => satz), vorgabe] };
}
