/**
 * Prüfung Schritt 65 — Schmale Fenster und 200 %.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Die Hülle `Panel` begrenzt jede Fläche auf die Fensterbreite
 *      (`maxWidth: 'calc(100vw - 16px)'`) und rechnet Rahmen und Polster ein
 *      (`boxSizing: 'border-box'`).
 *   2. Die Kopfzeile gibt schmalem Platz nach: der Titel schrumpft mit
 *      Auslassung, die Chip-Reihe der Menschen kürzt sich, die Statuszeile
 *      stapelt ihre Zeilen und bricht den Text um; auch der Lesehinweis aus
 *      Schritt 60 bricht um, seine beiden Knöpfe bleiben zusammen in einer
 *      Gruppe.
 *   3. Das rechte Dock trägt die Breite des früheren Chats (`spaltenBreite`)
 *      und ist doch nie breiter als das Fenster (`100vw - 133px`); einen
 *      eigenen Chat-Breitengriff gibt es seit Schritt 84 nicht mehr.
 *   4. Keine Fläche im Stilblock `S` hat eine feste Breite über 360 px ohne
 *      eigenes `maxWidth` — Stichprobe der fünf breitesten Werte.
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
    if (i > start && tiefe === 0) return zeilen.slice(start + 1, i);
  }
  throw new Error('Der Stilblock ' + name + ' endet nicht');
}

/**
 * Die Einträge der obersten Ebene eines Stilblocks. Ein Eintrag beginnt mit
 * sechs Leerzeichen und einem Namen; alles bis zum nächsten solchen Anfang
 * gehört dazu. Verschachtelte Zeilen haben mehr Leerzeichen.
 */
function eintraege(block) {
  const liste = [];
  let aktuell = null;
  for (const zeile of block) {
    const treffer = zeile.match(/^      ([A-Za-z_$][\w$]*):/);
    if (treffer) {
      if (aktuell) liste.push(aktuell);
      aktuell = { name: treffer[1], text: zeile };
    } else if (aktuell) {
      aktuell.text += '\n' + zeile;
    }
  }
  if (aktuell) liste.push(aktuell);
  return liste;
}

/**
 * Ein einzelner Eintrag aus `client.js`: von `      name: {` bis zum Beginn
 * des nächsten Eintrags. Die schließende Zeile gehört dazu.
 */
function eintrag(name) {
  const start = quelle.indexOf('      ' + name + ': {');
  pruefe(start >= 0, 'Der Stil `' + name + '` fehlt');
  const rest = quelle.slice(start);
  const naechster = rest.match(/\n      (?=[A-Za-z_$])/);
  return naechster ? rest.slice(0, naechster.index) : rest;
}

// 1. Die Hülle: jede Fläche endet an der Fensterbreite, Rahmen eingerechnet.
const panelStart = quelle.indexOf('function Panel(');
const panelEnde = quelle.indexOf('function Meldung(', panelStart);
pruefe(panelStart >= 0 && panelEnde > panelStart,
  'Die Definition von `Panel` fehlt');
const panel = quelle.slice(panelStart, panelEnde);
pruefe(/maxWidth:\s*'calc\(100vw - 16px\)'/.test(panel),
  '`Panel` begrenzt seine Fläche nicht mit `maxWidth: \'calc(100vw - 16px)\'`');
pruefe(/boxSizing:\s*'border-box'/.test(panel),
  '`Panel` rechnet Rahmen und Polster nicht mit `boxSizing: border-box` ein');

// 2. Die Kopfzeile gibt schmalem Platz nach: eine Zeile, aber die Mitte
//    schrumpft mit Auslassung, die Chip-Reihe der Menschen und die Kopfzeile
//    brechen um, die Statuszeile bricht ihren Text um.
const kopfMitte = eintrag('kopfMitte');
pruefe(/flex:\s*('1|\b1\b)/.test(kopfMitte) && /minWidth:\s*0/.test(kopfMitte),
  'Die Titelgruppe der Kopfzeile kann nicht schrumpfen');
const kopfTitel = eintrag('kopfTitel');
pruefe(/textOverflow:\s*'ellipsis'/.test(kopfTitel)
  && /whiteSpace:\s*'nowrap'/.test(kopfTitel),
'Der Titel der Kopfzeile wird abgeschnitten statt mit Auslassung gekürzt');
const mitglieder = eintrag('mitglieder');
pruefe(/minWidth:\s*0/.test(mitglieder)
  && (/flexWrap:\s*'wrap'/.test(mitglieder) || /overflow:\s*'hidden'/.test(mitglieder)),
'Die Chip-Reihe der Menschen kann die Kopfzeile sprengen');
const statusZeile = eintrag('statusZeile');
pruefe(/flexDirection:\s*'column'/.test(statusZeile),
  'Die Statuszeile stapelt ihre Zeilen nicht; langer Text liefe seitlich weg');
const suche = quelle.indexOf("stil: { width: '140px', maxWidth: '100%', flex: '0 1 auto' }");
pruefe(suche >= 0, 'Das Suchfeld ist nicht schmal und schrumpfbar');

// 2b. Der Lesehinweis aus Schritt 60 bricht ebenso um; die beiden Knöpfe
// stehen in einer Gruppe, damit sie nicht auf zwei Zeilen getrennt werden.
const hinweisStart = quelle.indexOf('const ersteSitzungHinweis');
pruefe(hinweisStart >= 0, 'Der Lesehinweis `ersteSitzungHinweis` fehlt');
const hinweisEnde = quelle.indexOf('tokenWeg && tokenWeg.offen ? h(', hinweisStart);
pruefe(hinweisEnde > hinweisStart, 'Der Lesehinweis endet nicht');
const hinweis = quelle.slice(hinweisStart, hinweisEnde);
pruefe(/flexWrap:\s*'wrap'/.test(hinweis),
  'Der Lesehinweis bricht nicht um (`flexWrap: \'wrap\'` fehlt)');
const gruppe = hinweis.indexOf("style: { display: 'flex', gap: '8px', flex: 'none' }");
const tokenKnopf = hinweis.indexOf("uebersetze('Token eintragen')");
const eigenesBoard = hinweis.indexOf("uebersetze('Eigenes Board')");
pruefe(gruppe >= 0 && gruppe < tokenKnopf && tokenKnopf < eigenesBoard,
  'Die beiden Knöpfe des Lesehinweises stehen nicht zusammen in einer Gruppe');

// 3. Das rechte Dock: `spaltenBreite` gilt für das ganze Dock, das Fenster
//    ist die Grenze. Der Griff der alten Chatspalte ist fort.
const dockStart = quelle.indexOf('const rechtsDock =');
pruefe(dockStart >= 0, 'Das rechte Dock `rechtsDock` fehlt');
const dockEnde = quelle.indexOf('const formatWarnung =', dockStart);
pruefe(dockEnde > dockStart, 'Das rechte Dock endet nicht');
const dock = quelle.slice(dockStart, dockEnde);
pruefe(/maxWidth:\s*'calc\(100vw - 133px\)'/.test(dock),
  'Das rechte Dock ist nicht auf das Fenster begrenzt (`100vw - 133px`)');
pruefe(/width:\s*spaltenBreite\s*\+\s*'px'/.test(dock),
  'Das rechte Dock nimmt die Breite `spaltenBreite` nicht an');
pruefe(!quelle.includes('gespraechBreiteGriff')
  && !quelle.includes('gespraechBreiteStrich'),
'Der eigene Breitengriff der Chatspalte steht noch im Client');

// 4. Keine feste Breite über 360 px ohne eigenes Maximum. Stichprobe: die
// fünf breitesten Werte im Stilblock `S`.
const breiten = [];
for (const eintragStil of eintraege(stilBlock('S'))) {
  const hatMax = /maxWidth:\s*'/.test(eintragStil.text);
  for (const treffer of eintragStil.text.matchAll(/width:\s*'(\d+)px'/g)) {
    breiten.push({ name: eintragStil.name, breite: Number(treffer[1]), hatMax });
  }
}
pruefe(breiten.length >= 5,
  'Im Stilblock `S` stehen weniger als fünf feste Breiten');
breiten.sort((a, b) => b.breite - a.breite);
for (const { name, breite, hatMax } of breiten.slice(0, 5)) {
  pruefe(breite <= 360 || hatMax,
    'S.' + name + ' ist ' + breite + ' px breit und hat kein `maxWidth`');
}

// 5. Die Suite selbst läuft über `node --test test/*.mjs`.

console.log('ok Schmale Fenster: Panel mit maxWidth und border-box, Kopfzeile mit '
  + 'schrumpfender Mitte und Statuszeile, Lesehinweis bricht um (Knöpfe '
  + 'zusammen), rechtes Dock mit spaltenBreite und Fenstergrenze, kein '
  + 'Chat-Breitengriff, keine feste Breite über 360 px ohne Maximum');
