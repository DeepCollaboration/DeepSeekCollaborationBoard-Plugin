/**
 * Umzug von `board.json` auf die Dateien, die zwischen zwei Installationen
 * gelten: `format`, `personen/`, `workflows/` und `vorgaenge/<ordner>/vorhaben.json`.
 *
 * Das Skript läuft einmal und ist wiederholbar: Vorhandene neue Dateien werden
 * nicht überschrieben, `board.json` wird nicht gelöscht. Es legt außerdem die
 * persönlichen Einstellungen und die Gespräche unter `$DSH_HOME/board/` ab —
 * beides gehört nicht in die geteilte Ablage.
 *
 * Aufruf:
 *   node produkt/werkzeuge/umzug.mjs [--repo=<pfad>] [--home=<pfad>]
 */
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { baueDateien, FORMAT } from '../ablage.js';

function konfiguration() {
  try {
    return JSON.parse(readFileSync(new URL('../board.config.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
}

const KONFIGURATION = konfiguration();
const ARGUMENTE = process.argv.slice(2);
function argument(name, vorgabe) {
  const treffer = ARGUMENTE.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!treffer) return vorgabe;
  return treffer.includes('=') ? treffer.slice(treffer.indexOf('=') + 1) : '';
}

const REPO = resolve(argument('repo', KONFIGURATION.repo || '/workspace/projekte/board'));
const HOME = resolve(argument('home', process.env.DSH_HOME || '/dsh-home'));
const ALT = join(REPO, 'board.json');

function liesAlt() {
  try {
    return JSON.parse(readFileSync(ALT, 'utf8'));
  } catch (fehler) {
    console.error('FEHLER: board.json nicht lesbar: ' + String((fehler && fehler.message) || fehler));
    process.exit(1);
  }
}

function main() {
  if (!existsSync(REPO)) {
    console.error('FEHLER: Ablage fehlt: ' + REPO);
    process.exit(1);
  }
  if (!existsSync(ALT)) {
    console.error('FEHLER: board.json fehlt: ' + ALT);
    process.exit(1);
  }

  // Das Format zuerst. Eine vorhandene, abweichende Nummer wird nicht überschrieben.
  const formatPfad = join(REPO, 'format');
  if (existsSync(formatPfad)) {
    const vorhanden = readFileSync(formatPfad, 'utf8').trim();
    if (vorhanden !== String(FORMAT)) {
      console.error('FEHLER: Ablage nennt Format „' + vorhanden + '“, erwartet ' + FORMAT);
      process.exit(1);
    }
  } else {
    writeFileSync(formatPfad, FORMAT + '\n', 'utf8');
    console.log('ok format: ' + FORMAT);
  }

  const alt = liesAlt();
  const personen = Array.isArray(alt.personen) ? alt.personen : [];
  const eigene = personen.find((p) => p && p.ich) || personen[0] || {};
  const person = String(eigene.id || KONFIGURATION.person || 'p1');

  const board = {
    workflow: alt.workflow && typeof alt.workflow === 'object' ? alt.workflow : {},
    schritte: Array.isArray(alt.schritte) ? alt.schritte : [],
    vorgaenge: (Array.isArray(alt.vorgaenge) ? alt.vorgaenge : []).map((v) => ({
      ...v,
      ordner: String(v.ordner || v.id || ''),
      verantwortliche: v.verantwortliche && typeof v.verantwortliche === 'object'
        ? v.verantwortliche : {},
      regel: v.regel === 'alle' ? 'alle' : 'einer',
      rueckkehr: Array.isArray(v.rueckkehr) ? v.rueckkehr : [],
      laeufe: Array.isArray(v.laeufe) ? v.laeufe : [],
      fork_von: v.fork_von == null ? null : v.fork_von,
      zweig_von: v.abzweig || v.zweig_von || null,
    })),
    personen,
  };

  const dateien = baueDateien(board, person);
  let neu = 0;
  let da = 0;
  for (const [relativ, inhalt] of dateien) {
    const ziel = join(REPO, relativ);
    if (existsSync(ziel)) { da += 1; continue; }
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, inhalt, 'utf8');
    neu += 1;
    console.log('neu ' + relativ);
  }

  // Einstellungen und Gespräche sind persönlich — nicht im Repository.
  // Liegt HOME außerhalb der Schreibgrenze dieser Sitzung, bleiben die Dateien
  // als Ersatz unter /tmp liegen; das Protokoll nennt den Ort.
  const seite = join(HOME, 'board');
  const ersatz = '/tmp/board-umzug-seiten';
  const einstellungenWert = alt.einstellungen && typeof alt.einstellungen === 'object'
    ? alt.einstellungen : {};
  const gespraechWert = {};
  for (const v of board.vorgaenge) {
    if (!v || !v.id) continue;
    const eigeneGesraeche = Array.isArray(v.gespraeche) ? v.gespraeche : [];
    if (eigeneGesraeche.length) gespraechWert[v.id] = eigeneGesraeche;
  }
  try {
    mkdirSync(seite, { recursive: true });
    const einstellungen = join(seite, 'einstellungen.json');
    if (!existsSync(einstellungen)) {
      writeFileSync(einstellungen, JSON.stringify(einstellungenWert, null, 2) + '\n', 'utf8');
      console.log('neu ' + einstellungen);
    }
    const gespraeche = join(seite, 'gespraeche.json');
    if (!existsSync(gespraeche)) {
      writeFileSync(gespraeche, JSON.stringify(gespraechWert, null, 2) + '\n', 'utf8');
      console.log('neu ' + gespraeche);
    }
  } catch (fehler) {
    console.warn('warn Persönliche Seiten nicht schreibbar (' + seite + '): '
      + String((fehler && fehler.message) || fehler));
    mkdirSync(ersatz, { recursive: true });
    writeFileSync(join(ersatz, 'einstellungen.json'),
      JSON.stringify(einstellungenWert, null, 2) + '\n', 'utf8');
    writeFileSync(join(ersatz, 'gespraeche.json'),
      JSON.stringify(gespraechWert, null, 2) + '\n', 'utf8');
    console.warn('warn Ersatz liegt unter ' + ersatz);
  }

  console.log('ok ' + neu + ' Dateien angelegt, ' + da + ' waren schon da; board.json bleibt liegen');
  // Kurz prüfen, dass die neuen Dateien lesbar sind.
  const vorhanden = readdirSync(join(REPO, 'vorgaenge'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(REPO, 'vorgaenge', e.name, 'vorhaben.json'))).length;
  console.log('ok ' + vorhanden + ' Vorhaben mit vorhaben.json');
}

main();
