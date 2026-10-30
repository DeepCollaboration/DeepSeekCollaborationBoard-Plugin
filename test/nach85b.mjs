/**
 * Prüfung Schritt 85b — Feinschliff der Oberfläche.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. `AKZENT_STIL` trägt die neuen Regeln: Karte mit Übergang, Hover und
 *      Fokusring, Fokus für alle Bedienelemente, die drei Farbregeln des
 *      Schienenknopfs, den Balken des aktiven Knopfs, den Begleiter samt
 *      Blinzeln und `prefers-reduced-motion`. Jede neue Regel steht unter
 *      `.board-seite`; nur die bestehende Fläche ist die Ausnahme.
 *   2. Die Board-Wurzel heißt `board-seite`, die Kartenhülle `board-karte`
 *      (aktive Karte zusätzlich `board-karte-aktiv`), der Schienenknopf
 *      `board-schiene-knopf`.
 *   3. Der Begleiter steht unten in der Schiene, ist `aria-hidden`, nimmt
 *      keine Zeigerereignisse, trägt keinen Text und reagiert über `data-art`
 *      auf `status.art` — mit drei Mundformen für fertig, Fehler und Ruhe.
 *      Die Augen tragen ihre Klasse im CSS und im JSX, sonst blinzelt nichts.
 *   4. Keine Regel setzt `outline: none`; die neuen Regeln und der Stilblock
 *      `S` (auch `S.page`) benutzen keine harten Farben, sondern nur
 *      `var(--dsw-…)` und `var(--board-akzent)`. Der Schienenknopf trägt
 *      seine Farbe im CSS, nicht mehr als Inline-Stil: sonst gewinnt der
 *      Inline-Stil und der Hover-Wechsel bleibt wirkungslos.
 *   5. Die Maße in `S.page`, `S.koerper`, `S.karte`, `S.schiene`, `S.dock`
 *      und `S.dockRechts` sind zeichengleich zum Stand davor; auf der Karte
 *      kommt kein `transform` und keine Positions- oder Größenregel dazu.
 *   6. Die Schlüsselzahl bleibt 614; der Client trägt unverändert 605 eigene
 *      Schlüssel (614 minus die neun Sätze aus `rechte.js`).
 *
 * Die Suite selbst ist der letzte Punkt der Prüfung im Schritt; sie läuft
 * über `node --test test/*.mjs` und wird von dieser Datei nicht aufgerufen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ANZAHL = 614;

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

const quelle = readFileSync(join(PRODUKT, 'client.js'), 'utf8');

/** Der Stilblock eines Namens im Stilblock `S`, von `name: {` bis `},`. */
function stilBlock(name) {
  const start = quelle.indexOf('      ' + name + ': {');
  pruefe(start >= 0, 'Der Stil `' + name + '` fehlt');
  const ende = quelle.indexOf('\n      },', start);
  pruefe(ende > start, 'Der Stil `' + name + '` endet nicht');
  return quelle.slice(start, ende);
}

// Der ausgelieferte Stil: `const AKZENT_STIL = …;` bis zum nächsten Block.
const stilStart = quelle.indexOf('const AKZENT_STIL =');
pruefe(stilStart >= 0, '`AKZENT_STIL` fehlt');
const stilEnde = quelle.indexOf('\n\n    /** Der Akzent als React-Zustand', stilStart);
pruefe(stilEnde > stilStart, '`AKZENT_STIL` endet nicht');
const akzentStil = quelle.slice(stilStart, stilEnde);

/**
 * Der statische Teil von `AKZENT_STIL` als CSS. Er beginnt nach
 * `.join('\n')`; die Akzentregeln davor werden aus den Daten gebaut und
 * stehen deshalb nicht als ein Stück Quelltext da.
 */
function statischesCss(stil) {
  const joinStelle = stil.indexOf(".join('\\n')");
  pruefe(joinStelle >= 0, 'Der statische Teil von `AKZENT_STIL` fehlt');
  const suffix = stil.slice(
    joinStelle + ".join('\\n')".length,
    stil.lastIndexOf(';'),
  );
  const teile = [...suffix.matchAll(/'((?:\\.|[^'\\])*)'/g)].map((t) => t[1]);
  pruefe(teile.length > 0, 'Der statische Teil von `AKZENT_STIL` ist leer');
  return teile.join('').replace(/\\n/g, '\n').replace(/\\'/g, "'");
}

/**
 * Zerlegt CSS in seine obersten Regeln. `kopf` ist der Selektor (bei
 * `@media` die Medienabfrage), `rumpf` der Inhalt zwischen den Klammern.
 */
function cssRegeln(css) {
  const liste = [];
  let tiefe = 0;
  let start = 0;
  let rumpfStart = 0;
  let anfuehrung = null;
  let entkommen = false;
  for (let i = 0; i < css.length; i += 1) {
    const zeichen = css[i];
    if (anfuehrung) {
      if (entkommen) entkommen = false;
      else if (zeichen === '\\') entkommen = true;
      else if (zeichen === anfuehrung) anfuehrung = null;
      continue;
    }
    if (zeichen === '"' || zeichen === "'") { anfuehrung = zeichen; continue; }
    if (zeichen === '{') {
      if (tiefe === 0) {
        liste.push({ kopf: css.slice(start, i).trim(), rumpf: '' });
        rumpfStart = i + 1;
      }
      tiefe += 1;
    } else if (zeichen === '}') {
      tiefe -= 1;
      if (tiefe === 0) {
        liste[liste.length - 1].rumpf = css.slice(rumpfStart, i);
        start = i + 1;
      }
    }
  }
  return liste;
}

/** Zerlegt eine Selektorliste an den Kommas außerhalb von Klammern. */
function selektoren(kopf) {
  const liste = [];
  let tiefe = 0;
  let start = 0;
  let anfuehrung = null;
  let entkommen = false;
  for (let i = 0; i < kopf.length; i += 1) {
    const zeichen = kopf[i];
    if (anfuehrung) {
      if (entkommen) entkommen = false;
      else if (zeichen === '\\') entkommen = true;
      else if (zeichen === anfuehrung) anfuehrung = null;
      continue;
    }
    if (zeichen === '"' || zeichen === "'") { anfuehrung = zeichen; continue; }
    if (zeichen === '(') tiefe += 1;
    else if (zeichen === ')') tiefe -= 1;
    else if (zeichen === ',' && tiefe === 0) {
      liste.push(kopf.slice(start, i));
      start = i + 1;
    }
  }
  liste.push(kopf.slice(start));
  return liste;
}

const css = statischesCss(akzentStil);
const regelnCss = cssRegeln(css);

// 1. Die Regeln des Feinschliffs stehen im ausgelieferten Stil.
const regeln = [
  ['.board-seite .board-karte { transition: filter .14s ease; }',
    'Der Übergang der Karte fehlt'],
  ['.board-seite .board-karte:hover { filter: brightness(1.04); }',
    'Das Aufhellen der Karte beim Überfahren fehlt'],
  ['.board-seite .board-karte:focus-visible {',
    'Der Fokusring der Karte fehlt'],
  ['.board-seite :is(button, input, textarea, select, [tabindex]):focus-visible {',
    'Der Fokusring für die Bedienelemente fehlt'],
  ['.board-seite .board-schiene-knopf {',
    'Die Grundregel des Schienenknopfs fehlt'],
  ['position: relative; color: var(--dsw-alias-label-secondary); }',
    'Dem Schienenknopf fehlt die Grundfarbe im CSS'],
  ['.board-seite .board-schiene-knopf[aria-pressed="true"] {',
    'Der aktive Schienenknopf hat keine eigene Farbregel'],
  ['.board-seite .board-schiene-knopf:hover {',
    'Die Beschriftung des Schienenknopfs reagiert nicht auf den Zeiger'],
  ['color: var(--dsw-alias-label-primary); }',
    'Der Farbwechsel kommt nicht aus dem Token'],
  ['.board-seite .board-schiene-knopf[aria-pressed="true"]::before {',
    'Der Balken des aktiven Schienenknopfs fehlt'],
  ['content: ""; position: absolute; left: 0; top: 6px; bottom: 6px;',
    'Der Balken ist nicht links absolut gesetzt'],
  ['width: 2px; border-radius: 1px; background: var(--board-akzent);',
    'Der Balken ist nicht 2 px breit und im Akzent'],
  ['.board-seite .board-begleiter {', 'Die Regel des Begleiters fehlt'],
  ['.board-seite .board-begleiter-auge {', 'Die Regel der Augen fehlt'],
  ['@keyframes board-blinz {', 'Das Blinzeln der Augen fehlt'],
  ['animation: board-blinz 6s ease-in-out infinite;',
    'Die Augen blinzeln nicht etwa alle sechs Sekunden'],
  ['@media (prefers-reduced-motion: reduce) {',
    'Die Rücksicht auf reduzierte Bewegung fehlt'],
  ['transition: none !important; animation: none !important;',
    'Reduzierte Bewegung schaltet Übergänge und Animationen nicht ab'],
  ['.board-seite *, .board-seite *::before, .board-seite *::after {',
    'Die Abschaltung gilt nicht für die ganze Board-Seite'],
];
for (const [regel, fehlt] of regeln) {
  pruefe(akzentStil.includes(regel), fehlt + ': „' + regel + '“');
}
pruefe((akzentStil.match(/outline: 2px solid var\(--board-akzent\)/g) || []).length >= 2,
  'Karte und Bedienelemente tragen nicht beide den 2-px-Akzentring');
pruefe((akzentStil.match(/outline-offset: 2px/g) || []).length >= 2,
  'Dem Fokusring fehlt der Abstand von 2 px');

// Keine neue Regel steht global. Ausnahmen sind nur die bestehende Fläche
// und die (nicht scoped mögliche) Keyframe-Definition.
const unterSeite = (selektor) => /^\.board-seite(?=$|\s|:|\.|\[)/.test(selektor.trim());
let geprueft = 0;
for (const regel of regelnCss) {
  if (regel.kopf.startsWith('@keyframes ')) continue;
  if (regel.kopf.startsWith('@media ')) {
    const innen = cssRegeln(regel.rumpf);
    pruefe(innen.length === 1, 'Die Medienabfrage enthält nicht genau eine Regel');
    for (const teil of selektoren(innen[0].kopf)) {
      pruefe(unterSeite(teil),
        'Die Regel in der Medienabfrage steht nicht unter `.board-seite`: '
          + teil.trim());
      geprueft += 1;
    }
    continue;
  }
  for (const teil of selektoren(regel.kopf)) {
    const selektor = teil.trim();
    pruefe(unterSeite(selektor) || selektor === '.board-flaeche',
      'Eine Regel steht nicht unter `.board-seite`: ' + selektor);
    geprueft += 1;
  }
}
pruefe(geprueft >= 12, 'Es sind zu wenige Regeln geprüft');

// Die Farbe des Schienenknopfs steht im CSS, nicht im Inline-Stil; sonst
// gewinnt der Inline-Stil und der Hover-Wechsel ist wirkungslos.
for (const name of ['schienenKnopf', 'schienenKnopfAktiv']) {
  pruefe(!/color:/.test(stilBlock(name)),
    'S.' + name + ' setzt `color` noch inline; der Hover-Wechsel bleibt toter Code');
}
const basisRegeln = regelnCss.filter(
  (regel) => regel.kopf === '.board-seite .board-schiene-knopf',
);
pruefe(basisRegeln.length === 1,
  'Der Schienenknopf hat nicht genau eine Grundregel');
pruefe(/position:\s*relative/.test(basisRegeln[0].rumpf)
  && /color:\s*var\(--dsw-alias-label-secondary\)/.test(basisRegeln[0].rumpf),
'Position oder Grundfarbe fehlen in der Grundregel des Schienenknopfs');
const aktivRegel = regelnCss.find(
  (regel) => regel.kopf === '.board-seite .board-schiene-knopf[aria-pressed="true"]',
);
pruefe(aktivRegel
  && /color:\s*var\(--dsw-alias-label-primary\)/.test(aktivRegel.rumpf),
'Der aktive Schienenknopf hat keine eigene Farbregel');
const hoverRegel = regelnCss.find(
  (regel) => regel.kopf === '.board-seite .board-schiene-knopf:hover',
);
pruefe(hoverRegel
  && /color:\s*var\(--dsw-alias-label-primary\)/.test(hoverRegel.rumpf),
'Der Hover-Farbwechsel des Schienenknopfs fehlt');

// 2. Die Klassen an Wurzel, Karte und Schienenknopf.
pruefe((quelle.match(/className: 'board-seite'/g) || []).length === 1,
  'Die Board-Wurzel heißt nicht genau einmal `board-seite`');
const wurzel = quelle.indexOf("className: 'board-seite',");
const wurzelBlock = quelle.slice(wurzel - 160, wurzel + 160);
pruefe(wurzelBlock.includes('style: S.page')
  && wurzelBlock.includes("'data-board-akzent': akzent"),
'`board-seite` steht nicht an der Board-Seite mit `data-board-akzent`');
pruefe(quelle.includes("className: aktiv ? 'board-karte board-karte-aktiv' : 'board-karte'"),
  'Die Kartenhülle trägt nicht `board-karte` und bei Auswahl `board-karte-aktiv`');
const karteStelle = quelle.indexOf("className: aktiv ? 'board-karte");
pruefe(quelle.slice(karteStelle - 180, karteStelle).includes("'data-schritt': p.id"),
  '`board-karte` steht nicht an der Kartenhülle');
pruefe((quelle.match(/className: 'board-schiene-knopf'/g) || []).length === 1,
  'Der Schienenknopf heißt nicht genau einmal `board-schiene-knopf`');
const knopfStelle = quelle.indexOf("className: 'board-schiene-knopf'");
const knopfBlock = quelle.slice(knopfStelle - 220, knopfStelle + 220);
pruefe(knopfBlock.includes("'aria-pressed': leiste === wert"),
  '`board-schiene-knopf` hängt nicht am Schienenknopf mit `aria-pressed`');

// 3. Der Begleiter: unten in der Schiene, stumm, ohne Klickziel.
const begleiterStart = quelle.indexOf('const begleiterArt = status');
pruefe(begleiterStart >= 0, 'Die Art des Begleiters fehlt');
const begleiterEnde = quelle.indexOf('begleiterMund));', begleiterStart);
pruefe(begleiterEnde > begleiterStart, 'Der Begleiter endet nicht');
const begleiter = quelle.slice(begleiterStart, begleiterEnde + 'begleiterMund));'.length);
const begleiterKopf = begleiter.slice(
  begleiter.indexOf("const begleiter = h('div', {"),
  begleiter.indexOf("}, h('svg', {"),
);
pruefe(begleiterKopf.includes("'aria-hidden': 'true'"),
  'Der Begleiter ist nicht `aria-hidden`');
pruefe(begleiterKopf.includes("pointerEvents: 'none'"),
  'Der Begleiter nimmt Zeigerereignisse an');
pruefe(begleiterKopf.includes("marginTop: 'auto'"),
  'Der Begleiter sitzt nicht unten in der Schiene');
pruefe(begleiterKopf.includes("display: 'flex'")
  && begleiterKopf.includes("justifyContent: 'center'"),
'Der Begleiter ist nicht zentriert');
pruefe(begleiterKopf.includes("'data-art': begleiterArt"),
  'Dem Begleiter fehlt `data-art`');
pruefe(begleiter.includes("className: 'board-begleiter'"),
  'Der Begleiter trägt nicht seine Klasse');
pruefe((begleiter.match(/className: 'board-begleiter-auge'/g) || []).length === 2,
  'Die beiden Augen tragen nicht `board-begleiter-auge`; dann blinzelt nichts');
pruefe(begleiter.includes('width: 18') && begleiter.includes('height: 18')
  && begleiter.includes("viewBox: '0 0 18 18'"),
'Der Begleiter ist nicht 18 × 18');
pruefe(begleiter.includes('status.art')
  && begleiter.includes("status.art === 'fertig'")
  && begleiter.includes("status.art === 'fehler'"),
'Der Begleiter reagiert nicht auf `status.art`');
pruefe(begleiter.includes(": 'ruhe'")
  && begleiter.includes("? status.art")
  && begleiter.includes(": 'ruhe';"),
'Ohne fertig oder Fehler steht der Begleiter nicht in Ruhe');
pruefe(begleiter.includes('M5.6 11.1 Q9 13.9 12.4 11.1')
  && begleiter.includes('M9 10.6v1.6')
  && begleiter.includes('M6.2 12h5.6'),
'Dem Begleiter fehlen Lächeln, Ausrufezeichen und ruhiger Mund');
pruefe(!begleiter.includes('uebersetze(') && !begleiter.includes("h('text'")
  && !begleiter.includes('title:') && !begleiter.includes('children:'),
'Der Begleiter trägt Text');
pruefe(!begleiter.includes('onClick') && !begleiter.includes('onPointerDown'),
  'Der Begleiter ist ein Klickziel');
const schieneStart = quelle.indexOf("const schiene = h('nav'");
pruefe(schieneStart >= 0, 'Die Schiene fehlt');
const schieneEnde = quelle.indexOf('));', schieneStart);
const schieneBlock = quelle.slice(schieneStart, schieneEnde + 3);
pruefe(schieneBlock.includes('begleiter)'),
  'Der Begleiter steht nicht in der Schiene');
pruefe(schieneBlock.includes('style: S.schiene'),
  'Die Schiene benutzt nicht mehr `S.schiene`');

// 4. Kein `outline: none`, keine harten Farben in den neuen Regeln und im
//    Stilblock `S` (auch `S.page`).
pruefe(!/outline:\s*(none|0)\b/.test(quelle),
  'Eine Regel setzt `outline: none` oder `outline: 0`');
const feinStart = akzentStil.indexOf('.board-seite .board-karte');
pruefe(feinStart >= 0, 'Die neuen Regeln fehlen');
const feinschliff = akzentStil.slice(feinStart);
pruefe(!/#[0-9a-fA-F]{3,8}\b/.test(feinschliff),
  'Eine neue Regel trägt eine harte Hex-Farbe');
pruefe(!/\b(?:rgb|rgba|hsl|hsla)\(/i.test(feinschliff),
  'Eine neue Regel trägt eine harte rgb/hsl-Farbe');
const farben = [...feinschliff.matchAll(/var\((--[a-z0-9-]+)/gi)].map((t) => t[1]);
pruefe(farben.length >= 2, 'Die neuen Regeln benutzen keine Token');
for (const name of farben) {
  pruefe(name === '--board-akzent' || name.startsWith('--dsw-'),
    'Die neue Regel benutzt die fremde Variable ' + name);
}
const sStart = quelle.indexOf('    const S = {');
const sEnde = quelle.indexOf('\n    };', sStart);
pruefe(sStart >= 0 && sEnde > sStart, 'Der Stilblock `S` fehlt');
const sBlock = quelle.slice(sStart, sEnde);
pruefe(!/#[0-9a-fA-F]{3,8}\b/.test(sBlock),
  'Der Stilblock `S` trägt eine harte Hex-Farbe');
pruefe(!/\b(?:rgb|rgba|hsl|hsla)\(/i.test(sBlock),
  'Der Stilblock `S` trägt eine harte rgb/hsl-Farbe');
// Die Karte bekommt keinen `transform` und keine Position; sonst verschöben
// sich die Kanten, die mit den Kartenkanten rechnen.
const kartenRegeln = feinschliff.slice(0, feinschliff.indexOf('.board-seite :is('));
pruefe(!/transform/.test(kartenRegeln),
  'Eine Kartenregel setzt `transform`');
pruefe(!/(?:^|[^-])(?:margin|padding|width|height|top|left|right|bottom|position|display):/
  .test(kartenRegeln), 'Eine Kartenregel verschiebt das Layout');

// 5. Die vorhandenen Maße sind zeichengleich geblieben.
const page = stilBlock('page');
pruefe(page.includes("padding: '22px 26px'")
  && page.includes("height: '100%'")
  && page.includes("boxSizing: 'border-box'")
  && page.includes("display: 'flex'")
  && page.includes("flexDirection: 'column'"),
'S.page hat andere Maße oder eine andere Anordnung');
const koerper = stilBlock('koerper');
pruefe(koerper.includes("display: 'flex'")
  && koerper.includes("flex: 1")
  && koerper.includes("minHeight: 0"),
'S.koerper hat andere Maße');
const karte = stilBlock('karte');
pruefe(karte.includes("borderRadius: '12px'")
  && karte.includes("minHeight: '240px'")
  && karte.includes("border: '1px solid var(--dsw-alias-border-l1)'")
  && karte.includes("background: 'var(--dsw-alias-bg-layer-1)'")
  && karte.includes("boxShadow: 'var(--dsw-elevation-soft)'"),
'S.karte hat andere Maße, einen anderen Rand oder Schatten');
const schiene = stilBlock('schiene');
pruefe(schiene.includes("width: '72px'")
  && schiene.includes("flex: 'none'")
  && schiene.includes("boxSizing: 'border-box'")
  && schiene.includes("gap: '4px'")
  && schiene.includes("padding: '6px 4px'")
  && schiene.includes("flexDirection: 'column'")
  && schiene.includes("borderRight: '1px solid var(--dsw-alias-border-l1)'")
  && schiene.includes("background: 'var(--dsw-alias-bg-layer-1)'"),
'S.schiene hat andere Maße, Abstände oder Farben');
const dock = stilBlock('dock');
pruefe(dock.includes("width: 'min(360px, calc(100vw - 124px))'")
  && dock.includes("flex: 'none'")
  && dock.includes("minHeight: 0")
  && dock.includes("boxSizing: 'border-box'")
  && dock.includes("display: 'flex'")
  && dock.includes("flexDirection: 'column'")
  && dock.includes("padding: '10px 12px'")
  && dock.includes("borderRight: '1px solid var(--dsw-alias-border-l1)'")
  && dock.includes("background: 'var(--dsw-alias-bg-layer-1)'"),
'S.dock hat andere Maße, Abstände oder Farben');
const dockRechts = stilBlock('dockRechts');
pruefe(dockRechts.includes("width: 'min(380px, calc(100vw - 133px))'")
  && dockRechts.includes("flex: 'none'")
  && dockRechts.includes("minHeight: 0")
  && dockRechts.includes("boxSizing: 'border-box'")
  && dockRechts.includes("display: 'flex'")
  && dockRechts.includes("flexDirection: 'column'")
  && dockRechts.includes("padding: '10px 12px'")
  && dockRechts.includes("borderLeft: '1px solid var(--dsw-alias-border-l1)'")
  && dockRechts.includes("background: 'var(--dsw-alias-bg-layer-1)'"),
'S.dockRechts hat andere Maße, Abstände oder Farben');

// 6. Keine neuen sichtbaren Texte: die Schlüsselzahl bleibt 614.
const en = JSON.parse(readFileSync(join(PRODUKT, 'texte', 'en.json'), 'utf8'));
pruefe(Object.keys(en).length === ANZAHL,
  'texte/en.json trägt ' + Object.keys(en).length + ' statt ' + ANZAHL + ' Schlüssel');
const schluessel = texteSchluessel(quelle);
pruefe(schluessel.length === ANZAHL - 9,
  'Der Client trägt ' + schluessel.length + ' statt ' + (ANZAHL - 9)
    + ' eigene Schlüssel');

console.log('ok Feinschliff: Karten mit Hover und Fokusring, Schienenfarbe im '
  + 'CSS mit eigenem Hover und aktivem Balken, blinzelnder Begleiter mit drei '
  + 'Mündern, alle Regeln unter .board-seite, reduzierte Bewegung abgeschaltet, '
  + 'Maße inklusive Docks unverändert, 614 Schlüssel');
