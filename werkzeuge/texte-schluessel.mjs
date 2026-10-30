/**
 * Die Texte, die im Client übersetzt werden: das erste Argument von
 * `uebersetze(...)` und die Beschriftungen, die erst beim Zeichnen durch
 * `uebersetze(...)` gehen (Aktionen, Weiterreichung, Farbnamen).
 *
 * Ein Werkzeug für die Prüfung und für das Erzeugen der Übersetzungslisten:
 * beide lesen dieselbe Quelle.
 */

function entpacke(text) {
  return text.replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
}

/** Die Schlüssel aus dem Quelltext von `client.js`. */
export function texteSchluessel(quelle) {
  const schluessel = new Set();

  for (const treffer of quelle.matchAll(/uebersetze\('((?:\\.|[^'\\])*)'/g)) {
    schluessel.add(entpacke(treffer[1]));
  }

  // Die Beschriftungen der Auswahl stehen in Datenfeldern und werden erst
  // beim Zeichnen übersetzt.
  for (const block of quelle.matchAll(/const (WIE|WEITER) = \[([\s\S]*?)\n    \];/g)) {
    for (const text of block[2].matchAll(/text: '((?:\\.|[^'\\])*)'/g)) {
      schluessel.add(entpacke(text[1]));
    }
  }

  // Farbnamen und Stufen werden zusammengesetzt; beide Teile sind Texte.
  const farben = quelle.match(/const FARB_NAMEN = \[([\s\S]*?)\];/);
  if (farben) {
    for (const text of farben[1].matchAll(/'((?:\\.|[^'\\])*)'/g)) {
      schluessel.add(entpacke(text[1]));
    }
  }
  const stufen = quelle.match(/const FARB_STUFEN = \[([\s\S]*?)\];/);
  if (stufen) {
    for (const text of stufen[1].matchAll(/'((?:\\.|[^'\\])*)'/g)) {
      schluessel.add(entpacke(text[1]));
    }
  }

  return [...schluessel];
}
