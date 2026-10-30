/**
 * Prüfung Schritt 62b — Fortschritt bei den Wegen, die Netz brauchen.
 *
 * `client.js` und die Wörterbücher werden als Text gelesen, ohne Browser.
 * Geprüft wird:
 *
 *   1. `laeuft(` kommt mindestens achtmal im Client vor.
 *   2. Auf jede `laeuft(`-Stelle folgt innerhalb von 1500 Zeichen ein
 *      `melde(` oder `fehler(` — kein Fortschritt bleibt ohne Ende.
 *   3. Zwischen `laeuft(` und dem nächsten `melde(`/`fehler(` steht kein
 *      `statusWeg(` — der laufende Zustand wird ersetzt, nicht gelöscht.
 *   4. Jeder Text, den `laeuft(...)` zeigt, steht in allen sieben
 *      Wörterbüchern (`ar, en, es, fr, ja, ru, zh`); neu sind höchstens zwei.
 *   5. Die Suite selbst ist der fünfte Punkt der Prüfung im Schritt; sie
 *      läuft über `node --test test/*.mjs` und wird von dieser Datei nicht
 *      aufgerufen.
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
const SPRACHEN = ['ar', 'en', 'es', 'fr', 'ja', 'ru', 'zh'];
const VORHANDEN = new Set([
  'Wird geladen …',
  'Speichert …',
  'Wird gesendet …',
  'Lege an …',
  'Wird übernommen …',
  'Öffnet …',
]);

const zeile = (index) => quelle.slice(0, index).split('\n').length;

// 1. Mindestens acht Wege kündigen ihren Lauf an.
const laeuftStellen = [];
{
  const muster = /(?<![.\w])laeuft\(/g;
  let treffer;
  while ((treffer = muster.exec(quelle)) !== null) laeuftStellen.push(treffer.index);
}
pruefe(laeuftStellen.length >= 8,
  'Nur ' + laeuftStellen.length + ' `laeuft(...)`-Stellen statt mindestens acht');

// 2./3. Jede Stelle endet mit `melde` oder `fehler`, ohne `statusWeg` dazwischen.
for (const start of laeuftStellen) {
  const rest = quelle.slice(start);
  const ende = /(?<![.\w])(?:melde|fehler)\(/.exec(rest);
  pruefe(ende !== null,
    'Auf `laeuft(` in Zeile ' + zeile(start) + ' folgt kein `melde` oder `fehler`');
  pruefe(ende.index <= 1500,
    'Der Fortschritt in Zeile ' + zeile(start) + ' endet erst nach '
    + ende.index + ' Zeichen');
  const zwischen = rest.slice(0, ende.index);
  pruefe(!zwischen.includes('statusWeg('),
    'Zwischen `laeuft(` und seinem Ende in Zeile ' + zeile(start)
    + ' steht ein `statusWeg()` — der laufende Zustand würde gelöscht');
}

// 4. Die Texte des laufenden Zustands sind übersetzt.
const laufendeTexte = [...new Set(
  [...quelle.matchAll(/laeuft\(\s*uebersetze\(\s*'((?:[^'\\]|\\.)*)'/g)]
    .map((treffer) => treffer[1]),
)];
pruefe(laufendeTexte.length >= 1,
  'Kein `laeuft(...)` trägt einen übersetzten Text');
const neueTexte = laufendeTexte.filter((text) => !VORHANDEN.has(text));
pruefe(neueTexte.length <= 2,
  neueTexte.length + ' neue Texte für den laufenden Zustand statt höchstens zwei: '
  + neueTexte.join(' · '));

const stellen = (text) => [...String(text).matchAll(/\{(\d+)\}/g)]
  .map((treffer) => treffer[1]).sort().join(',');
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'));
  for (const text of laufendeTexte) {
    pruefe(Object.prototype.hasOwnProperty.call(inhalt, text),
      'texte/' + sprache + '.json fehlt „' + text + '“');
    const wert = String(inhalt[text] == null ? '' : inhalt[text]);
    pruefe(wert.trim().length > 0,
      'texte/' + sprache + '.json hat „' + text + '“ leer');
    pruefe(stellen(wert) === stellen(text),
      'texte/' + sprache + '.json verliert bei „' + text + '“ einen Platzhalter');
  }
}

console.log('ok Fortschritt: ' + laeuftStellen.length + ' Stellen an den acht Wegen, '
  + 'jede endet mit melde oder fehler, ' + laufendeTexte.length
  + ' laufende Texte in sieben Wörterbüchern');
