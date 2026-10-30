/**
 * Prüfung Schritt 60 — Die erste Sitzung führt zum Schreiben.
 *
 * `client.js` und die Wörterbücher werden als Text gelesen, ohne Browser.
 * Geprüft wird:
 *
 *   1. Die vier neuen Texte stehen als `uebersetze('…')` im Client.
 *   2. Jeder der vier steht in allen sieben Wörterbüchern
 *      (`ar, en, es, fr, ja, ru, zh`) — nicht leer und ohne Platzhalter.
 *   3. Der Hinweis wird nur gezeigt, wenn `darf` falsch ist: die Bedingung
 *      nennt `data.leer` und `data.darf === false`, und der Hinweis hängt an
 *      ihr; es gibt keinen Merker für ihn.
 *   4. `Speichern` ruft `POST /board/github/token` mit `{ token }`, lädt die
 *      Daten neu und meldet `Gespeichert.`.
 *   5. Das Feld ist ein `Feld` mit `type="password"`, `autoComplete="off"`
 *      und `spellCheck: false`.
 *
 * Die Suite selbst ist der fünfte Punkt der Prüfung im Schritt; sie läuft
 * über `node --test test/*.mjs` und wird von dieser Datei nicht aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const TEXTE = [
  'Du liest mit',
  'Dieses Board liegt auf GitHub. Ohne Token bleibt es beim Lesen; dein Token bleibt auf diesem Rechner.',
  'Token eintragen',
  'Eigenes Board',
];
const SPRACHEN = ['ar', 'en', 'es', 'fr', 'ja', 'ru', 'zh'];

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');

// 1. Die vier Texte stehen als `uebersetze('…')` im Client.
const schluessel = new Set(texteSchluessel(quelle));
for (const wort of TEXTE) {
  pruefe(quelle.includes("uebersetze('" + wort + "')"),
    'Der Text steht nicht als uebersetze(...) im Client: „' + wort + '“');
  pruefe(schluessel.has(wort),
    'Das Übersetzungswerkzeug findet den Text nicht: „' + wort + '“');
}

// 2. Jeder Text steht in allen sieben Wörterbüchern.
const stellen = (text) => [...String(text).matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
for (const sprache of SPRACHEN) {
  const inhalt = JSON.parse(readFileSync(join(PRODUKT, 'texte', sprache + '.json'), 'utf8'));
  for (const wort of TEXTE) {
    pruefe(Object.prototype.hasOwnProperty.call(inhalt, wort),
      'texte/' + sprache + '.json fehlt „' + wort + '“');
    const wert = String(inhalt[wort] == null ? '' : inhalt[wort]);
    pruefe(wert.trim().length > 0,
      'texte/' + sprache + '.json hat einen leeren Text zu „' + wort + '“');
    pruefe(stellen(wert) === stellen(wort),
      'Die Übersetzung zu „' + wort + '“ verliert die Werte');
  }
}

// 3. Die Bedingung des Hinweises: Board offen und `darf` falsch — kein Merker.
const bedingung = quelle.split('\n')
  .find((zeile) => zeile.includes('const ersteSitzung ='));
pruefe(bedingung, 'Die Bedingung `const ersteSitzung = …` fehlt');
pruefe(bedingung.includes('!data.leer'),
  'Die Bedingung nennt `data.leer` nicht: ' + bedingung.trim());
pruefe(bedingung.includes('data.darf === false'),
  'Die Bedingung nennt `darf` nicht: ' + bedingung.trim());
pruefe(quelle.includes('const ersteSitzungHinweis = !ersteSitzung ? null :'),
  'Der Hinweis hängt nicht an der Bedingung');
pruefe(/\bersteSitzungHinweis,/.test(quelle),
  'Der Hinweis wird im Baum der Seite nicht gezeigt');
pruefe(!quelle.includes('gemerkt.tokenWeg') && !quelle.includes('gemerkt.ersteSitzung'),
  'Der Hinweis oder der Token bekommt einen Merker');

// 4. Der Token geht über die vorhandene Route, danach wird neu geladen.
const start = quelle.indexOf('async function tokenSpeichern()');
pruefe(start >= 0, 'Die Funktion tokenSpeichern fehlt');
const ende = quelle.indexOf('async function boardEntfernen', start);
pruefe(ende > start, 'Nach tokenSpeichern fehlt der nächste Abschnitt');
const handler = quelle.slice(start, ende);
pruefe(handler.includes("poste('/board/github/token', { token })"),
  'tokenSpeichern ruft POST /board/github/token nicht mit { token }');
pruefe(handler.includes('await ladeBoard()'),
  'Nach dem Speichern werden die Daten nicht neu geladen');
pruefe(handler.includes("melde(uebersetze('Gespeichert.'))"),
  'Der Erfolg meldet nicht „Gespeichert.“');
pruefe(quelle.includes("h(Meldung, { zustand: 'fehler', text: tokenWeg.fehler })"),
  'Der Fehler steht nicht als Meldung mit zustand „fehler“');

// 5. Das Feld ist ein Feld mit Passwort, ohne Autovervollständigung.
const feldStelle = quelle.indexOf("id: 'board-token-erste-sitzung'");
pruefe(feldStelle >= 0, 'Das Feld der ersten Sitzung fehlt');
const feld = quelle.slice(feldStelle, feldStelle + 700);
pruefe(feld.includes('type: \'password\''), 'Das Feld ist kein Passwortfeld');
pruefe(feld.includes("autoComplete: 'off'"), 'Das Feld schaltet autoComplete nicht ab');
pruefe(feld.includes('spellCheck: false'), 'Das Feld schaltet spellCheck nicht ab');
pruefe(feld.includes("label: 'Token (nur zum Schreiben nötig)'"),
  'Das Feld trägt nicht die vorhandene Beschriftung');

console.log('ok Erste Sitzung: vier Texte in sieben Sprachen, Hinweis an `darf` '
  + 'und `leer` gebunden, Token über POST /board/github/token');
