/**
 * Prüfung Schritt 61 — Alle Panels auf ein Muster.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. `Panel` wird an mindestens fünf Stellen mit `fokus` und
 *      `onSchliessen` gerendert.
 *   2. Die Escape-Behandlung in `Panel` hängt nicht mehr an `dialog`; sie
 *      schließt jedes Panel mit `onSchliessen` und stoppt das Ereignis.
 *   3. `uebersetze('Schließen')` steht genau einmal im Client — im Panel
 *      selbst; keine Fläche baut ihren Schließen-Knopf noch von Hand.
 *   4. Die fünf Flächen Bibliothek, Katalog, Leser, rechtes Dock (Chat) und
 *      Board-Liste kommen je einmal als `Panel`-Aufruf vor; der Katalog liegt
 *      im Bibliothek-Panel (verschachtelt, damit der Fokus zurückfindet).
 *      Seit Schritt 84 ist der Chat ein Inhalt des rechten Docks.
 *      Die Bibliothek sitzt seit Schritt 81 im Dock neben der Schiene; ihre
 *      Hülle heißt `S.dock`, die Absicht dieses Schritts bleibt dieselbe.
 *   5. Die geöffnete Karte behält ihre Tastatur: Escape macht sie klein und
 *      gibt den Fokus auf ihren Namen zurück; sie trägt `aria-label`.
 *
 * Die Suite selbst ist der fünfte Punkt der Prüfung im Schritt; sie läuft
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

const panelAufrufe = aufrufe('Panel');

// 1. Mindestens fünf Panels holen den Fokus und haben einen Schließer.
const mitFokus = panelAufrufe.filter((aufruf) => /\bfokus\s*:/.test(aufruf)
  && /\bonSchliessen\s*:/.test(aufruf));
pruefe(mitFokus.length >= 5,
  'Nur ' + mitFokus.length + ' Panel-Aufrufe tragen `fokus` und `onSchliessen`');

// 2. Escape hängt nicht mehr an `dialog`; es schließt und stoppt.
const anfang = quelle.indexOf('function Panel(');
const ende = quelle.indexOf('function Meldung(', anfang);
pruefe(anfang >= 0 && ende > anfang, 'Die Definition von `Panel` fehlt');
const definition = quelle.slice(anfang, ende);

pruefe(definition.includes('titelStil'), '`Panel` kennt `titelStil` nicht');
pruefe(definition.includes('schliessenStil'), '`Panel` kennt `schliessenStil` nicht');
pruefe(definition.includes('fuss'), '`Panel` kennt `fuss` nicht');
pruefe(!/dialog\s*&&/.test(definition),
  'Die Escape-Behandlung hängt noch an `dialog`');
pruefe(definition.includes('...(onSchliessen'),
  'Escape wird nicht an `onSchliessen` gebunden, sondern an eine Rolle');

const handlerAnfang = definition.indexOf('onKeyDown:');
const handlerEnde = definition.indexOf('onSchliessen();', handlerAnfang);
pruefe(handlerAnfang >= 0 && handlerEnde > handlerAnfang,
  'Die Escape-Behandlung von `Panel` fehlt');
const handler = definition.slice(handlerAnfang, handlerEnde + 20);
pruefe(handler.includes("ev.key !== 'Escape'"),
  'Der Handler prüft die Escape-Taste nicht');
pruefe(handler.includes('stopPropagation'),
  'Der Handler stoppt das Ereignis nicht — ein inneres Panel schlösse das äußere');
pruefe(!handler.includes('dialog'),
  'Der Escape-Handler selbst nennt noch `dialog`');

// 3. Genau ein Schließen-Name, im Panel; keine Fläche baut ihn von Hand.
const schliessen = quelle.match(/uebersetze\('Schließen'\)/g) || [];
pruefe(schliessen.length === 1,
  '`uebersetze(\'Schließen\')` steht ' + schliessen.length + '× statt einmal');
pruefe(definition.includes("uebersetze('Schließen')"),
  'Der eine Schließen-Name steht nicht im Panel selbst');

// 4. Die fünf Flächen je einmal als Panel-Aufruf. Seit Schritt 84 ist der
//    Chat ein Inhalt des rechten Docks; sein Panel-Aufruf trägt die Kennung
//    `board-gespraech`, der Inhalt darunter `board-chat`.
const flaechen = [
  ['Bibliothek', 'board-bibliothek', ['seiteStil: S.dock', 'kopfStil: S.bibKopf']],
  ['Katalog', 'board-katalog', ['kopfStil: S.bibKopf', 'titelStil: S.bibAbschnittTitel']],
  ['Leser', 'board-leser', ['kopfStil: { ...S.leserKopf', 'titelStil: S.leserTitel']],
  ['Rechtes Dock (Chat)', 'board-gespraech', ['kopfStil: S.gespraechKopf', 'schliessenTitel:']],
  ['Board-Liste', 'board-liste', ['seiteStil: S.boardPanel', 'titelStil: S.boardAnzeigeTitel']],
];
for (const [name, kennung, stile] of flaechen) {
  const treffer = panelAufrufe.filter((aufruf) => aufruf.includes("id: '" + kennung + "'"));
  pruefe(treffer.length === 1,
    'Die Fläche ' + name + ' kommt ' + treffer.length + '× als Panel-Aufruf vor');
  const aufruf = treffer[0];
  pruefe(/\bfokus\s*:\s*true/.test(aufruf),
    'Die Fläche ' + name + ' holt den Fokus nicht');
  pruefe(/\bonSchliessen\s*:/.test(aufruf),
    'Die Fläche ' + name + ' hat keinen Schließer');
  for (const stil of stile) {
    pruefe(aufruf.includes(stil),
      'Die Fläche ' + name + ' gibt den vorhandenen Stil „' + stil + '“ nicht hinein');
  }
  pruefe(!aufruf.includes('style: S.schliessen')
    && !aufruf.includes("title: uebersetze('Schließen')"),
  'Die Fläche ' + name + ' baut ihren Schließen-Knopf noch von Hand');
}

const bibliothek = panelAufrufe.find((aufruf) => aufruf.includes("id: 'board-bibliothek'"));
pruefe(bibliothek && bibliothek.includes('katalogPanel'),
  'Der Katalog liegt nicht im Bibliothek-Panel');
pruefe(quelle.includes('const katalogPanel = h(Panel,'),
  'Der Katalog ist kein eigenes Panel');
pruefe(panelAufrufe.filter((aufruf) => aufruf.includes("id: 'board-katalog'")).length === 1,
  'Der Katalog kommt nicht genau einmal als Panel-Aufruf vor');

// Der Fokus geht beim Öffnen ins Panel und beim Schließen dorthin zurück.
pruefe(definition.includes('document.activeElement'),
  '`Panel` merkt sich nicht, wo der Fokus herkam');
pruefe(definition.includes('vorher.focus()'),
  '`Panel` gibt den Fokus nicht zurück');

// 5. Die geöffnete Karte: aria-label, Escape, Fokus auf den Namen.
const kartenStelle = quelle.indexOf("'data-schritt': p.id");
pruefe(kartenStelle >= 0, 'Die Karte trägt kein `data-schritt`');
const karte = quelle.slice(kartenStelle, kartenStelle + 1600);
pruefe(karte.includes("'aria-label': p.name"),
  'Die Karte trägt keinen `aria-label` mit dem Stationsnamen');
pruefe(!karte.includes("role: 'dialog'"),
  'Die Karte wird als Dialogfläche ausgegeben');
pruefe(karte.includes("ev.key !== 'Escape'")
  && karte.includes('querySelector(\'[data-karten-name]\')')
  && karte.includes('name.focus()')
  && karte.includes('setAuswahl(null)'),
'Die geöffnete Karte schließt nicht per Escape oder gibt den Fokus nicht zurück');
pruefe(quelle.includes("'data-karten-name': p.id"),
  'Der Name der Karte ist für den Fokus nicht gezeichnet');

console.log('ok Panels: fünf Flächen auf Panel mit Fokus und Schließer, '
  + 'Escape ohne Dialog, ein Schließen, Karte mit aria-label und Escape');
