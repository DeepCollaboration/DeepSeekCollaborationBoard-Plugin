/**
 * Prüfung Schritt 66 — Kein sichtbarer Text außerhalb der Übersetzung.
 *
 * `client.js` wird als Text gelesen, ohne Browser. Geprüft wird:
 *
 *   1. Jede Zeichenkette im Client, die deutsch aussieht (Umlaut oder ß,
 *      oder ein Satz aus mehreren Wörtern mit einem deutschen Funktionswort),
 *      steht als Argument in `uebersetze(…)` — oder sie steht mit einem Grund
 *      in der Ausnahmeliste.
 *   2. Die Ausnahmeliste ist vollständig: jede Ausnahme kommt im Client noch
 *      als Zeichenkette vor. Was übersetzt wurde, verschwindet aus der Liste.
 *   3. Die Gegenprobe: eine Kopie des Clients in `/tmp` mit einem
 *      eingeschlossenen `'Ziehen verschiebt die Station'` außerhalb von
 *      `uebersetze` wird gefunden — genau diese Stelle.
 *   4. Der arabische Befund aus Schritt 60 ist behoben: der Satz zu GitHub
 *      trägt keinen Artikel-Zugstrich vor `Board`.
 *   5. Client und die sieben Wörterbücher tragen dieselben Schlüssel;
 *      `de.json` bleibt leer. `test/markt48.mjs` prüft dieselbe Menge über
 *      die Route.
 *
 * Die Ausnahmen sind nach Grund geordnet. Technische Zeichenketten (CSS-Werte,
 * `data-`-Namen, Dateiendungen) werden vorab erkannt; reguläre Ausdrücke sind
 * gar keine Zeichenketten. Die Farbtabellen `FARB_NAMEN`/`FARB_STUFEN` sind
 * Schlüssel der Wörterbücher und fallen als solche heraus. Die Modellaufträge
 * werden im Chat als Nachricht des Nutzers sichtbar; sie bleiben deutsch, weil
 * sie das Verhalten steuern — die Ausnahme sagt das so.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { texteSchluessel } from '../werkzeuge/texte-schluessel.mjs';
import { rechteTexte } from './rechte-texte.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const CLIENT = join(PRODUKT, 'client.js');
// Ohne Argument prüft die Datei den Client des Produkts. Ein Pfad als erstes
// Argument prüft eine Kopie — so lässt sich die Gegenprobe von außen führen.
const QUELLE_DATEI = process.argv[2] || CLIENT;
const SPRACHEN = ['en', 'es', 'fr', 'ja', 'ru', 'ar', 'zh'];

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

// --- Die Ausnahmen ---------------------------------------------------------

/**
 * Zeichenketten, die nicht durch `uebersetze` gehen und trotzdem in Ordnung
 * sind. Der Grund steht jeweils daneben.
 *
 * Die Farbtabellen `FARB_NAMEN`/`FARB_STUFEN` stehen nicht in dieser Liste:
 * ihre Werte sind Schlüssel der Wörterbücher und werden in `farbName()`
 * durch `uebersetze` geführt. `finde` erkennt sie an ihrer Lage im Quelltext.
 */
const MODELLAUFTRAG = 'Modellauftrag; im Chat als Nachricht sichtbar; bleibt deutsch, weil er das Verhalten steuert';

const AUSNAHMEN = new Map([
  // Auswahltexte: sie stehen in den Datenfeldern WIE/WEITER und werden erst
  // beim Zeichnen (Knopf, `aktionText`, Anzeige) durch `uebersetze` geführt.
  ['Datei öffnen',
    'Auswahltext der Aktionsliste (WIE); wird beim Zeichnen und in aktionText() übersetzt'],
  ['Automatisch, wenn die Ausgabedatei erzeugt ist',
    'Auswahltext der Weiterreichung (WEITER); wird beim Zeichnen und in der Anzeige übersetzt'],

  // Modellaufträge: sie werden im Chat als Nachricht des Nutzers sichtbar,
  // bleiben aber deutsch, weil sie das Verhalten steuern.
  ['Führe den Skill „', MODELLAUFTRAG],
  ['" für das Vorhaben „', MODELLAUFTRAG],
  ['Lies die Anleitung des Skills und beginne mit dem Gespräch.', MODELLAUFTRAG],
  ['Wir stehen im Board an der Station „', MODELLAUFTRAG],
  ['Ich möchte dafür einen Skill bauen, und ich will ihn mit dir zusammen entwickeln.', MODELLAUFTRAG],
  ['erzeugt hat, und legt ihre eigene Ausgabedatei im Ordner des Vorhabens ab', MODELLAUFTRAG],
  ['(/workspace/projekte/board/vorgaenge/<vorhaben>/). Ein Skill ist die Anleitung für', MODELLAUFTRAG],
  ['noch keiner eingetragen — dann gilt die Regel des', MODELLAUFTRAG],
  ['automatisch, wenn die Ausgabedatei erzeugt ist', MODELLAUFTRAG],
  ['Ihre Kopfzeile trägt name (', MODELLAUFTRAG],
  ['Schau bei Bedarf in eine davon hinein — sie zeigen den Ton und den Aufbau.', MODELLAUFTRAG],
  ['Aufgerufen wird die Anweisung, wenn ein Vorhaben an dieser Station steht. Sie führt', MODELLAUFTRAG],
  ['dann das Gespräch mit mir und legt die Ausgabedatei an. Die Dateien der Station', MODELLAUFTRAG],
  ['Aufgabe: Erarbeite mit mir die Anweisung für diese Station. Frag mich, was hier', MODELLAUFTRAG],
  ['entstehen soll, woran ich merke, dass der Schritt fertig ist, was der Skill selbst', MODELLAUFTRAG],
  ['entscheiden darf und was er fragen muss, und was dabei schon schiefgegangen ist.', MODELLAUFTRAG],
  ['Eine Frage pro Zug, in meiner Sprache, ohne Fachjargon. Wenn wir einig sind, schreib', MODELLAUFTRAG],
  ['. Am Board änderst du', MODELLAUFTRAG],
  ['nichts — ich trage sie danach an der Station ein.', MODELLAUFTRAG],
  ['Sag mir zum Schluss, was die Anweisung tut.', MODELLAUFTRAG],

  // Fehlertexte, die nie auf der Fläche stehen: der Aufrufer fängt sie ab und
  // zeigt einen eigenen Satz (`Kopieren nicht möglich.` bzw. die Adresse).
  ['Kopieren nicht möglich', 'interner Fehlertext; die Aufrufer zeigen ihn nicht an'],

  // Bausteine, die ihre Übersetzung im Bauteil erfahren.
  ['Schließen', 'Symbol des Knopfs; Knopf() führt `symbol` durch uebersetze'],
  ['Token (nur zum Schreiben nötig)', 'Beschriftung eines Felds; Feld() führt `label` durch uebersetze'],

  // Nur für die Konsole.
  ['[board] Ansicht abgestürzt:', 'nur für die Konsole; nicht im Board sichtbar'],
]);

// --- Der Lexer -------------------------------------------------------------

const REGEX_VOR = new Set(['(', '{', '[', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '%', '^', '~', '<', '>', '/']);
const SCHLUESSELWORT = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'instanceof', 'do', 'else', 'yield', 'await']);

/**
 * Zerlegt `quelle` in Zeichenketten, Kommentare und reguläre Ausdrücke.
 * `strings` trägt Anfang, Ende und den entpackten Wert mit den Positionen
 * im Original; Kommentare und Ausdrücke brauchen nur ihre Spannen.
 */
function zerlege(quelle) {
  const n = quelle.length;
  const strings = [];
  const spannen = [];
  let i = 0;
  let letztes = '';

  function string(start, sammeln) {
    const quote = quelle[start];
    let wert = '';
    i = start + 1;
    while (i < n) {
      const c = quelle[i];
      if (c === '\\') {
        wert += c;
        if (i + 1 < n) { wert += quelle[i + 1]; i += 2; } else i += 1;
        continue;
      }
      if (c === quote) { i += 1; break; }
      if (quote === '`' && c === '$' && quelle[i + 1] === '{') {
        i += 2;
        let tiefe = 1;
        while (i < n && tiefe > 0) {
          const d = quelle[i];
          if (d === '{') { tiefe += 1; i += 1; continue; }
          if (d === '}') { tiefe -= 1; i += 1; continue; }
          if (d === '"' || d === "'" || d === '`') { string(i, true); continue; }
          if (d === '/' && quelle[i + 1] === '/') {
            while (i < n && quelle[i] !== '\n') i += 1;
            continue;
          }
          if (d === '/' && quelle[i + 1] === '*') {
            i += 2;
            while (i < n && !(quelle[i] === '*' && quelle[i + 1] === '/')) i += 1;
            i += 2;
            continue;
          }
          i += 1;
        }
        wert += '${…}';
        continue;
      }
      wert += c;
      i += 1;
    }
    if (sammeln) strings.push({ start, end: i, wert });
    letztes = '"';
    return i;
  }

  while (i < n) {
    const c = quelle[i];
    if (c === '/' && quelle[i + 1] === '/') {
      const start = i;
      while (i < n && quelle[i] !== '\n') i += 1;
      spannen.push([start, i]);
      continue;
    }
    if (c === '/' && quelle[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(quelle[i] === '*' && quelle[i + 1] === '/')) i += 1;
      i += 2;
      spannen.push([start, i]);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { string(i, true); continue; }
    if (c === '/' && (letztes === '' || REGEX_VOR.has(letztes) || SCHLUESSELWORT.has(letztes))) {
      const start = i;
      i += 1;
      let klasse = false;
      while (i < n) {
        const d = quelle[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') klasse = true;
        else if (d === ']') klasse = false;
        else if (d === '/' && !klasse) { i += 1; break; }
        else if (d === '\n') break;
        i += 1;
      }
      while (i < n && /[a-z]/.test(quelle[i])) i += 1;
      spannen.push([start, i]);
      letztes = 'regex';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(quelle[i])) i += 1;
      letztes = quelle.slice(start, i);
      continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }
    letztes = c;
    i += 1;
  }

  return { strings, spannen };
}

function entpacke(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** Die Bereiche aller `uebersetze(…)`-Aufrufe im Quelltext. */
function uebersetzteBereiche(quelle, strings, spannen) {
  const n = quelle.length;
  const sprung = new Map();
  for (const s of strings) sprung.set(s.start, s.end);
  for (const [a, b] of spannen) sprung.set(a, b);

  // In einer Maske sind Kommentare und Zeichenketten leer: `uebersetze` wird
  // nur als echter Aufruf gefunden, nicht in einem Kommentar oder Text.
  const maske = quelle.split('');
  for (const [a, b] of spannen) {
    for (let k = a; k < b; k += 1) if (maske[k] !== '\n') maske[k] = ' ';
  }
  for (const s of strings) {
    for (let k = s.start; k < s.end; k += 1) if (maske[k] !== '\n') maske[k] = ' ';
  }

  const bereiche = [];
  for (const treffer of maske.join('').matchAll(/\buebersetze\s*\(/g)) {
    let k = treffer.index + treffer[0].length;
    let tiefe = 1;
    while (k < n && tiefe > 0) {
      const ende = sprung.get(k);
      if (ende) { k = ende; continue; }
      const c = quelle[k];
      if (c === '(') tiefe += 1;
      else if (c === ')') tiefe -= 1;
      k += 1;
    }
    bereiche.push([treffer.index, k]);
  }
  return bereiche;
}

function zeileVon(quelle, stelle) {
  return quelle.slice(0, stelle).split('\n').length;
}

// --- Die Regeln ------------------------------------------------------------

const STOPP = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer',
  'eines', 'einem', 'einen', 'und', 'oder', 'aber', 'mit', 'für', 'von', 'zu', 'zum', 'zur',
  'im', 'am', 'an', 'auf', 'aus', 'bei', 'ist', 'sind', 'wird', 'werden', 'wurde', 'nicht',
  'kein', 'keine', 'keinem', 'keinen', 'dieser', 'diese', 'dieses', 'dein', 'deine',
  'deinem', 'deinen', 'mein', 'meine', 'was', 'wer', 'wie', 'wo', 'wenn', 'dann', 'als',
  'sich', 'auch', 'noch', 'nur', 'schon', 'hier', 'dort', 'ohne', 'unter', 'über', 'vor',
  'nach', 'durch', 'gegen', 'um']);

/**
 * Sieht die Zeichenkette wie ein deutscher Satz aus? Das ist die zweite Spur
 * neben Umlaut und ß: „Ziehen verschiebt die Station“ trägt keinen Umlaut und
 * muss trotzdem auffallen. Verlangt werden mindestens drei Wörter, nur
 * Schrift und Satzzeichen und ein deutsches Funktionswort.
 */
function satzartig(text) {
  if (text !== text.trim()) return false;
  if (!/[A-Za-zÄÖÜäöüß]/.test(text)) return false;
  if (/[0-9(){}[\];:=<>*/\\%#@&|+_$]/.test(text)) return false;
  const woerter = text.split(/\s+/);
  if (woerter.length < 3) return false;
  if (!woerter.every((wort) => /^[A-Za-zÄÖÜäöüß„“"'’.,!?…—–-]+$/.test(wort))) return false;
  return woerter.some((wort) => STOPP.has(wort.toLowerCase().replace(/[^a-zäöüß]/g, '')));
}

/** CSS-Werte, `data-`-Namen, Dateiendungen und Ausdrücke: kein Flächentext. */
function istTechnisch(text) {
  if (/^(?:color-mix|var|rgba?|hsla?|oklab|lab|lch|linear-gradient|radial-gradient|conic-gradient)\(/.test(text)) return true;
  if (/^(?:ui-monospace|SFMono-Regular|Menlo|Consolas|monospace)\b/.test(text)) return true;
  if (/^data-[a-z0-9-]+$/i.test(text)) return true;
  if (/^path\[data-/.test(text)) return true;
  if (/^\.[a-z0-9]{1,8}$/i.test(text) || /\.(?:mjs|js|json|md|svg|css|html|txt|ya?ml)$/i.test(text)) return true;
  if (/^[/^].*[/$]$/.test(text)) return true;
  return false;
}

/**
 * Die Spannen der Farbtabellen `FARB_NAMEN` und `FARB_STUFEN`. Ihre Werte
 * sind Schlüssel der Wörterbücher; `farbName()` führt beide Teile durch
 * `uebersetze`. Sie sind damit keine sichtbaren Texte außerhalb der
 * Übersetzung, sondern der Ausgangstext der Wörterbücher.
 */
function farbSchluesselBereiche(quelle) {
  const bereiche = [];
  for (const name of ['FARB_NAMEN', 'FARB_STUFEN']) {
    const treffer = new RegExp('const ' + name + ' = \\[[\\s\\S]*?\\];').exec(quelle);
    if (treffer) bereiche.push([treffer.index, treffer.index + treffer[0].length]);
  }
  return bereiche;
}

/** Alle Stellen, die die Prüfung meldet. `null`-Ausnahmen sind nicht erlaubt. */
function finde(quelle) {
  const { strings, spannen } = zerlege(quelle);
  const bereiche = uebersetzteBereiche(quelle, strings, spannen);
  const farbBereiche = farbSchluesselBereiche(quelle);
  const inUebersetzt = (stelle) => bereiche.some(([a, b]) => stelle >= a && stelle < b);
  const inFarbTabelle = (stelle) => farbBereiche.some(([a, b]) => stelle >= a && stelle < b);

  const funde = [];
  for (const s of strings) {
    if (inUebersetzt(s.start)) continue;
    if (inFarbTabelle(s.start)) continue;
    const text = entpacke(s.wert);
    if (istTechnisch(text)) continue;
    if (!/[äöüÄÖÜß]/.test(text) && !satzartig(text)) continue;
    if (AUSNAHMEN.has(text)) continue;
    funde.push({ zeile: zeileVon(quelle, s.start), text });
  }
  return funde;
}

// --- 1. Der Client ---------------------------------------------------------

const quelle = readFileSync(QUELLE_DATEI, 'utf8');
const funde = finde(quelle);
pruefe(funde.length === 0,
  'Sichtbarer Text außerhalb der Übersetzung:\n'
    + funde.map((f) => '  Zeile ' + f.zeile + ': „' + f.text + '“').join('\n'));

// --- 2. Die Ausnahmen sind nicht veraltet --------------------------------

const { strings } = zerlege(quelle);
const vorhanden = new Set(strings.map((s) => entpacke(s.wert)));
for (const text of AUSNAHMEN.keys()) {
  pruefe(vorhanden.has(text),
    'Die Ausnahme steht nicht mehr im Client und ist veraltet: „' + text + '“');
}

// --- 3. Die Gegenprobe in /tmp --------------------------------------------

const gegenProbe = quelle + (quelle.endsWith('\n') ? '' : '\n')
  + "const s66Gegenprobe = 'Ziehen verschiebt die Station';\n";
const ordner = mkdtempSync(join(tmpdir(), 'board-nach66-'));
let probeFunde;
try {
  const probePfad = join(ordner, 'client.js');
  writeFileSync(probePfad, gegenProbe, 'utf8');
  pruefe(existsSync(probePfad), 'Die Gegenprobe wurde nicht geschrieben');
  probeFunde = finde(readFileSync(probePfad, 'utf8'));
} finally {
  rmSync(ordner, { recursive: true, force: true });
}
const erwarteteZeile = gegenProbe.split('\n')
  .findIndex((zeile) => zeile.includes('s66Gegenprobe')) + 1;
pruefe(probeFunde.length === 1,
  'Die Gegenprobe findet ' + probeFunde.length + ' Stellen statt genau einer');
pruefe(probeFunde[0].text === 'Ziehen verschiebt die Station',
  'Die Gegenprobe findet den falschen Text: „' + probeFunde[0].text + '“');
pruefe(probeFunde[0].zeile === erwarteteZeile,
  'Die Gegenprobe nennt Zeile ' + probeFunde[0].zeile + ' statt ' + erwarteteZeile);

// --- 4. Der arabische Befund aus Schritt 60 -------------------------------

const arabisch = JSON.parse(readFileSync(join(PRODUKT, 'texte', 'ar.json'), 'utf8'));
const githubSatz = 'Dieses Board liegt auf GitHub. Ohne Token bleibt es beim Lesen; dein Token bleibt auf diesem Rechner.';
const richtigerSatz = 'هذا Board على GitHub. بدون رمز تبقى القراءة فقط؛ يبقى رمزك على هذا الجهاز.';
pruefe(arabisch[githubSatz] === richtigerSatz,
  'Der arabische GitHub-Satz weicht ab: ' + JSON.stringify(arabisch[githubSatz]));

// --- 5. Client, Server und Wörterbücher, gleiche Schlüssel -----------------

const schluessel = new Set(texteSchluessel(quelle));
const { alle: serverSaetze } = await rechteTexte();
for (const satz of serverSaetze) schluessel.add(satz);
const deutsch = JSON.parse(readFileSync(join(PRODUKT, 'texte', 'de.json'), 'utf8'));
pruefe(Object.keys(deutsch).length === 0, 'texte/de.json ist nicht leer');

const stellen = (text) => [...String(text).matchAll(/\{(\d+)\}/g)]
  .map((m) => m[1]).sort().join(',');
for (const sprache of SPRACHEN) {
  const datei = join(PRODUKT, 'texte', sprache + '.json');
  pruefe(existsSync(datei), 'texte/' + sprache + '.json fehlt');
  const inhalt = JSON.parse(readFileSync(datei, 'utf8'));
  const fehlt = [...schluessel].filter((wort) => !(wort in inhalt));
  const zuviel = Object.keys(inhalt).filter((wort) => !schluessel.has(wort));
  pruefe(fehlt.length === 0,
    'texte/' + sprache + '.json fehlen ' + fehlt.length + ' Schlüssel, z. B. „' + fehlt[0] + '“');
  pruefe(zuviel.length === 0,
    'texte/' + sprache + '.json hat ' + zuviel.length + ' unbekannte Schlüssel, z. B. „' + zuviel[0] + '“');
  for (const wort of schluessel) {
    const wert = String(inhalt[wort] == null ? '' : inhalt[wort]);
    pruefe(wert.trim().length > 0,
      'texte/' + sprache + '.json hat einen leeren Text zu „' + wort + '“');
    pruefe(stellen(wert) === stellen(wort),
      'Die Übersetzung „' + wert + '“ verliert die Werte von „' + wort + '“');
  }
}

// Die Anzahl ist nur dann gleich, wenn die Mengen gleich sind — das prüft die
// Schleife oben. Zur Meldung wird sie mitgenannt.
const anzahl = new Set(readdirSync(join(PRODUKT, 'texte'))
  .filter((name) => name.endsWith('.json') && name !== 'de.json')
  .map((name) => Object.keys(JSON.parse(readFileSync(join(PRODUKT, 'texte', name), 'utf8'))).length));
pruefe(anzahl.size === 1 && [...anzahl][0] === schluessel.size,
  'Die Wörterbücher tragen nicht ' + schluessel.size + ' Schlüssel');

console.log('ok Texte: 0 Stellen außerhalb der Übersetzung, '
  + AUSNAHMEN.size + ' Ausnahmen mit Grund, Gegenprobe findet '
  + '„Ziehen verschiebt die Station“ in Zeile ' + erwarteteZeile + ', '
  + schluessel.size + ' Schlüssel in sieben Wörterbüchern, de.json leer');
