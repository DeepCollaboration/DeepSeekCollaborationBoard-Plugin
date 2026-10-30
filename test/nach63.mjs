/**
 * Prüfung Schritt 63 — Schrift und Radien auf einer Skala.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. jedes `fontSize` im Client ist `12px`, `13px`, `14px`, `18px` oder
 *      mindestens `20px` (Titel); nichts dazwischen, nichts darunter;
 *   2. `borderRadius` ist nur `6px`, `8px`, `12px`, `999px`, `50%` oder `0`;
 *   3. es gibt höchstens vier verschiedene Schriftgrößen unter `20px`;
 *   4. alle `fontSize` stehen als Zeichenkette da — kein Wert entkommt der
 *      Prüfung über eine Zahl oder eine Variable.
 *
 * Die Suite selbst ist der vierte Punkt der Prüfung im Schritt; sie läuft
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

// 1. Jede Schriftgröße liegt auf der Skala: 12 / 13 / 14 / 18 oder ≥ 20.
const schrift = [...quelle.matchAll(/fontSize:\s*'([^']+)'/g)]
  .map((treffer) => treffer[1]);
const schriftStellen = (quelle.match(/fontSize:/g) || []).length;
pruefe(schriftStellen === schrift.length,
  'Nur ' + schrift.length + ' von ' + schriftStellen
  + ' `fontSize`-Stellen stehen als Zeichenkette da');
pruefe(schrift.length >= 100,
  'Nur ' + schrift.length + ' `fontSize`-Stellen gefunden');

const erlaubt = new Set(['12px', '13px', '14px', '18px']);
for (const wert of schrift) {
  const px = Number.parseFloat(wert);
  pruefe(Number.isFinite(px), 'Keine Zahl als Schriftgröße: „' + wert + '“');
  pruefe(erlaubt.has(wert) || px >= 20,
    'Schriftgröße außerhalb der Skala: „' + wert + '“');
}

// 2. Jeder Radius ist 6 / 8 / 12, eine Pille (999px) oder ein Kreis (50%).
const radien = [...quelle.matchAll(/borderRadius:\s*'([^']+)'/g)]
  .map((treffer) => treffer[1]);
const radiusStellen = (quelle.match(/borderRadius:/g) || []).length;
pruefe(radiusStellen === radien.length,
  'Nur ' + radien.length + ' von ' + radiusStellen
  + ' `borderRadius`-Stellen stehen als Zeichenkette da');
pruefe(radien.length >= 60,
  'Nur ' + radien.length + ' `borderRadius`-Stellen gefunden');

const radErlaubt = new Set(['6px', '8px', '12px', '999px', '50%', '0']);
for (const wert of radien) {
  pruefe(radErlaubt.has(wert), 'Radius außerhalb der Skala: „' + wert + '“');
}

// 3. Unter 20px bleiben höchstens vier verschiedene Größen.
const klein = [...new Set(schrift.filter((wert) => Number.parseFloat(wert) < 20))];
pruefe(klein.length <= 4,
  'Mehr als vier Schriftgrößen unter 20px: ' + klein.join(', '));

console.log('ok Schrift und Radien: ' + klein.length + ' Schriftgrößen unter 20px ('
  + klein.join(', ') + '), ' + [...new Set(radien)].length + ' Radienwerte, '
  + schrift.length + ' Schrift- und ' + radien.length + ' Radiusstellen');
