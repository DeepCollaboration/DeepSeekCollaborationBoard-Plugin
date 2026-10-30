/**
 * Prüfung Schritt 62 — Der Zustand einer Meldung ist explizit.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. `setMeldung` und `meldungZustand` kommen im Client nicht mehr vor.
 *   2. `Meldung` wird mit `zustand: status.art` und `text: status.text`
 *      gerendert — der Zustand steht im Zustand, nicht in der Zeichensetzung.
 *   3. Keine `fehler(…)`-Stelle trägt einen Text, der mit `Gespeichert`,
 *      `Fertig`, `Erledigt` oder `Übernommen` beginnt.
 *   4. Jede `melde(…)`-Stelle beginnt nicht mit `Nicht` oder `Konnte`.
 *   5. Es gibt mindestens 120 Aufrufe von `melde`, `fehler`, `laeuft` oder
 *      `statusWeg` — die Zahl der Meldungsstellen ist nicht kleiner geworden.
 *
 * Die Suite selbst ist der sechste Punkt der Prüfung im Schritt; sie läuft
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

/**
 * Alle Aufrufe `h(<name>, …)` als Textstück — mit Klammerzählung, damit auch
 * verschachtelte Aufrufe und mehrzeilige Eigenschaften vollständig bleiben.
 */
function aufrufe(name) {
  const stelle = [];
  const muster = 'h(' + name + ',';
  let start = quelle.indexOf(muster);
  while (start >= 0) {
    let tiefe = 0;
    let i = start + 1;
    let inText = null;
    let entkommen = false;
    for (; i < quelle.length; i += 1) {
      const zeichen = quelle[i];
      if (inText) {
        if (entkommen) entkommen = false;
        else if (zeichen === '\\') entkommen = true;
        else if (zeichen === inText) inText = null;
        continue;
      }
      if (zeichen === "'" || zeichen === '"' || zeichen === '`') {
        inText = zeichen;
      } else if (zeichen === '(') {
        tiefe += 1;
      } else if (zeichen === ')') {
        tiefe -= 1;
        if (tiefe === 0) break;
      }
    }
    stelle.push(quelle.slice(start, i + 1));
    start = quelle.indexOf(muster, i + 1);
  }
  return stelle;
}

/** Alle Aufrufe `<name>(…)` als Textstück, ohne Eigenschaften wie `.name(`. */
function meldungsStellen(name) {
  const stelle = [];
  const muster = new RegExp('(?<![.\\w])' + name + '\\(', 'g');
  let treffer;
  while ((treffer = muster.exec(quelle)) !== null) {
    const start = treffer.index;
    const öffnen = start + name.length;
    let tiefe = 0;
    let i = öffnen;
    let inText = null;
    let entkommen = false;
    for (; i < quelle.length; i += 1) {
      const zeichen = quelle[i];
      if (inText) {
        if (entkommen) entkommen = false;
        else if (zeichen === '\\') entkommen = true;
        else if (zeichen === inText) inText = null;
        continue;
      }
      if (zeichen === "'" || zeichen === '"' || zeichen === '`') {
        inText = zeichen;
      } else if (zeichen === '(') {
        tiefe += 1;
      } else if (zeichen === ')') {
        tiefe -= 1;
        if (tiefe === 0) break;
      }
    }
    stelle.push(quelle.slice(start, i + 1));
    muster.lastIndex = i + 1;
  }
  return stelle;
}

/** Die übersetzten Texte einer Meldungsstelle; ohne Text bleibt die Liste leer. */
function texteIn(stelle) {
  return [...stelle.matchAll(/uebersetze\(\s*'((?:[^'\\]|\\.)*)'/g)]
    .map((treffer) => treffer[1]);
}

// 1. Die alten Namen sind weg — auch der Helfer, der den Zustand riet.
pruefe(!quelle.includes('setMeldung'),
  '`setMeldung` steht noch im Client');
pruefe(!quelle.includes('meldungZustand'),
  '`meldungZustand` steht noch im Client');

// 2. Der Zustand kommt aus `status.art`, der Text aus `status.text`.
const meldungsKnoten = aufrufe('Meldung');
const ausStatus = meldungsKnoten.filter((aufruf) => /\bzustand\s*:\s*status\.art\b/.test(aufruf)
  && /\btext\s*:\s*status\.text\b/.test(aufruf));
pruefe(ausStatus.length >= 2,
  'Nur ' + ausStatus.length + ' `Meldung`-Stellen nehmen `zustand` aus `status.art` '
  + 'und `text` aus `status.text`');

// 3. Eine Fehlermeldung beginnt nicht mit einem Erfolgswort.
const erfolgsWort = /^(Gespeichert|Fertig|Erledigt|Übernommen)\b/;
const fehlerStellen = meldungsStellen('fehler');
pruefe(fehlerStellen.length >= 30,
  'Nur ' + fehlerStellen.length + ' `fehler(…)`-Stellen gefunden');
for (const stelle of fehlerStellen) {
  for (const text of texteIn(stelle)) {
    pruefe(!erfolgsWort.test(text),
      'Eine `fehler(…)`-Stelle trägt einen Erfolgstext: „' + text + '“');
  }
}

// 4. Eine Erfolgsmeldung beginnt nicht mit einem Fehlerwort und enthält
//    keine Verneinung — „nicht“, „kein“ oder „fehlt“ macht die Meldung zum
//    Fehler, auch wenn sie mit einem anderen Wort beginnt.
const fehlerWort = /^(Nicht|Konnte)\b/;
const verneinung = /(nicht|kein|fehlt)/i;
const meldeStellen = meldungsStellen('melde');
pruefe(meldeStellen.length >= 30,
  'Nur ' + meldeStellen.length + ' `melde(…)`-Stellen gefunden');
for (const stelle of meldeStellen) {
  for (const text of texteIn(stelle)) {
    pruefe(!fehlerWort.test(text),
      'Eine `melde(…)`-Stelle trägt einen Fehlertext: „' + text + '“');
    pruefe(!verneinung.test(text),
      'Eine `melde(…)`-Stelle trägt eine verneinte Meldung: „' + text + '“');
  }
}

// 5. Die Zahl der Meldungsstellen ist nicht kleiner geworden.
const zahl = (quelle.match(/(?<![.\w])(?:melde|fehler|laeuft|statusWeg)\(/g) || []).length;
pruefe(zahl >= 120,
  'Nur ' + zahl + ' Meldungsstellen statt mindestens 120');

console.log('ok Meldungszustand: kein Text-Raten mehr, '
  + meldungsKnoten.length + ' Meldung-Stellen, ' + zahl + ' Meldungsstellen');
