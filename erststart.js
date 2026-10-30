/**
 * Der Erststart: das öffentliche Hauptboard kommt von selbst.
 *
 * Eine frische Installation hat weder Name noch Token noch ein Board. Sie
 * bekommt beim ersten Start das Hauptboard: es wird einmal in den Zwischenspeicher
 * unter `$DSH_HOME/board/cache/DeepCollaboration/board-hauptboard` geholt und
 * ins Register eingetragen. Danach werden seine nackten Verweise — Stationen,
 * Workflows, Vorhaben — aus derselben Organisation in den Zwischenspeicher
 * geholt, damit die Komposition sie dort findet. Ohne Netz bleibt der Eintrag
 * stehen und trägt `fehler: 'nicht geholt'`; die Seite zeigt dann „Hauptboard
 * nicht geholt“ und einen Knopf zum Wiederholen. Keiner dieser Wege verhindert
 * den Start.
 *
 * Ein vorhandenes Register mit anderen Boards bleibt unangetastet — auch das
 * alte Board der Fassung 1. Nur wenn noch kein Board da ist (oder der letzte
 * Versuch allein am Hauptboard scheiterte), wird gehandelt.
 */
import {
  existsSync, mkdirSync, readdirSync, rmSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  hauptboardAdresse, istHauptboard, liesRegister, schreibeRegister,
} from './boards.js';
import { liesBoard } from './formate/board.js';
import { liesVorhaben } from './formate/vorhaben.js';
import { liesWorkflow } from './formate/workflow.js';
import { CACHE_BASIS, CACHE_ORGANISATION, cachePfad } from './repos.js';

const KENNUNG = 'hauptboard';
const NAME = 'Hauptboard';
const FEHLER = 'nicht geholt';

/** Wo das Hauptboard im eigenen Zuhause liegt. */
export function zielPfad(home) {
  return join(home, 'board', 'cache', 'DeepCollaboration', 'board-hauptboard');
}

/** Ein Git-Aufruf ohne Rückfrage; ein Fehler ist ein Ergebnis, kein Wurf. */
function gitLauf(args, cwd, home, ms = 120000) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const ssh = home ? join(home, '.ssh', 'config') : '';
  if (ssh && existsSync(ssh)) env.GIT_SSH_COMMAND = 'ssh -F ' + ssh;
  try {
    const lauf = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: ms,
      env,
    });
    return { ok: lauf.status === 0, fehler: String(lauf.stderr || '').trim() };
  } catch (fehler) {
    return { ok: false, fehler: String((fehler && fehler.message) || fehler) };
  }
}

function zeitWert(jetzt) {
  if (jetzt instanceof Date) return jetzt.toISOString();
  const text = String(jetzt == null ? '' : jetzt).trim();
  return text || new Date().toISOString();
}

/**
 * Das Hauptboard holen und eintragen.
 *
 * Liegt am Ziel schon eine `board.json`, wird nur gelesen. Sonst wird geklont —
 * ohne `--depth`, damit ein lokales Prüf-Remote mit seinen Fassungen
 * funktioniert. Danach steht der Eintrag im Register und ist offen. Ein
 * Fehlschlag hinterlässt denselben Eintrag mit `fehler: 'nicht geholt'`.
 */
export function holeHauptboard({ home, url, jetzt } = {}) {
  const adresse = String(url == null ? '' : url).trim() || hauptboardAdresse();
  const ziel = zielPfad(home);
  const vorher = liesRegister(home);
  const alt = vorher ? vorher.boards.find(istHauptboard) : null;
  let name = alt && alt.name ? alt.name : NAME;
  let fehler = '';

  try {
    if (!existsSync(join(ziel, 'board.json'))) {
      mkdirSync(dirname(ziel), { recursive: true });
      const klon = gitLauf(['clone', adresse, ziel], home, home);
      if (!klon.ok) fehler = FEHLER;
    }
    if (!fehler) {
      const daten = liesBoard(ziel);
      if (daten && String(daten.name || '').trim()) name = String(daten.name).trim();
    }
  } catch {
    // Eine halbe Ablage oder eine unlesbare board.json ist kein Grund, den
    // Start scheitern zu lassen: der Eintrag sagt, dass nichts geholt wurde.
    fehler = FEHLER;
  }

  const eintrag = {
    id: KENNUNG,
    name,
    format: 2,
    art: 'hauptboard',
    repo: ziel,
    remote: adresse,
    person: null,
    sichtbarkeit: 'öffentlich',
    angelegt: (alt && alt.angelegt) || zeitWert(jetzt),
  };
  if (fehler) eintrag.fehler = fehler;

  const register = liesRegister(home) || { format: 1, aktiv: null, boards: [] };
  const stelle = register.boards.findIndex(istHauptboard);
  if (stelle >= 0) register.boards[stelle] = eintrag;
  else register.boards.push(eintrag);
  register.aktiv = KENNUNG;
  let zurueck = register;
  try {
    schreibeRegister(home, register);
    // Zurück kommt das Register so, wie es beim nächsten Start gelesen würde:
    // mit denselben normalisierten Feldern für alle Boards.
    zurueck = liesRegister(home) || register;
  } catch (schreibfehler) {
    // Ein nicht schreibbares Zuhause soll das Board nicht verhindern; die
    // Liste lebt dann nur, bis die Anwendung neu startet.
    console.warn('Board: Hauptboard nicht ins Register geschrieben: '
      + String((schreibfehler && schreibfehler.message) || schreibfehler));
  }
  const board = zurueck.boards.find(istHauptboard) || eintrag;
  return { board, fehler, register: zurueck };
}

/** Die erste Zeile einer Fehlermeldung, kurz genug für eine Sammlung. */
function kurz(fehler) {
  return String((fehler && fehler.message) || fehler).split('\n')[0].trim();
}

/** Eine Adresse ist kein Name; sie wird nicht in den Zwischenspeicher geholt. */
function istAdresse(text) {
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(text);
}

/**
 * Ein nackter Name ist ein Repository der Organisation — kein Pfad und keine
 * Adresse. `owner/name` und relative Pfade tragen einen Trenner und bleiben
 * draußen; ebenso absolute Pfade, die schon lokal liegen.
 */
function istNackterName(text) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text);
}

/** Die Quelle eines Repositories der Organisation. */
function cacheQuelle(name) {
  return String(CACHE_BASIS).replace(/\/+$/, '') + '/'
    + CACHE_ORGANISATION + '/' + name + '.git';
}

/**
 * Die nackten Verweise des Hauptboards aus der Organisation holen.
 *
 * Gelesen wird `board.json`; `workflows`, `vorhaben` und `stationen` werden
 * der Reihe nach angemeldet. Ein Verweis ohne Pfad und ohne Adresse ist ein
 * Name: er gehört nach `cachePfad(home, organisation, name)` und wird, wenn
 * dort nichts liegt, aus `<CACHE_BASIS>/<organisation>/<name>.git` geklont.
 * Ein Fehlschlag wird gesammelt und hält die übrigen Verweise nicht auf.
 *
 * Nach einem Workflow wird dessen `workflow.json` gelesen und seine Stationen
 * angemeldet; nach einem Vorhaben dessen `workflow.repo`. Das gilt auch für
 * ein Repository, das schon im Zwischenspeicher liegt — sonst bliebe ein
 * früher gescheiterter Verweis für immer liegen. Was schon angemeldet wurde,
 * kommt kein zweites Mal vor.
 *
 * Zurück kommt `{ geholt, fehler }`: die Namen, die neu im Zwischenspeicher
 * liegen, und je Fehlschlag Name, Quelle und Grund.
 */
export function holeVerweise({ boardRepo, home } = {}) {
  const ort = resolve(String(boardRepo == null ? '' : boardRepo));
  const board = liesBoard(ort);
  const gesehen = new Set();
  const warteschlange = [];
  const geholt = [];
  const fehler = [];

  function anmelden(verweis, art) {
    const text = String(verweis == null ? '' : verweis).trim();
    if (!text || istAdresse(text) || isAbsolute(text) || !istNackterName(text)) return;
    const ziel = cachePfad(home, CACHE_ORGANISATION, text);
    if (!ziel || gesehen.has(ziel)) return;
    gesehen.add(ziel);
    warteschlange.push({ name: text, art, ziel });
  }

  for (const verweis of board.workflows) anmelden(verweis.repo, 'workflow');
  for (const verweis of board.vorhaben) anmelden(verweis.repo, 'vorhaben');
  for (const verweis of board.stationen) anmelden(verweis.repo, 'station');

  while (warteschlange.length) {
    const eintrag = warteschlange.shift();
    const quelle = cacheQuelle(eintrag.name);
    let bereit = existsSync(eintrag.ziel);
    if (!bereit) {
      try {
        mkdirSync(dirname(eintrag.ziel), { recursive: true });
        const klon = gitLauf(['clone', quelle, eintrag.ziel], home, home, 30000);
        if (klon.ok) {
          bereit = true;
          geholt.push(eintrag.name);
        } else {
          fehler.push({
            name: eintrag.name,
            art: eintrag.art,
            repo: quelle,
            grund: kurz(klon.fehler) || 'git clone gescheitert',
          });
        }
      } catch (klonfehler) {
        fehler.push({
          name: eintrag.name,
          art: eintrag.art,
          repo: quelle,
          grund: kurz(klonfehler) || 'git clone gescheitert',
        });
      }
    }
    if (!bereit) continue;

    // Erst der Inhalt des Repositories sagt, was daran noch fehlt.
    if (eintrag.art === 'workflow') {
      try {
        for (const station of liesWorkflow(eintrag.ziel).stationen) {
          anmelden(station.repo, 'station');
        }
      } catch (lesefehler) {
        fehler.push({
          name: eintrag.name,
          art: eintrag.art,
          repo: eintrag.ziel,
          grund: kurz(lesefehler) || 'workflow.json nicht lesbar',
        });
      }
    } else if (eintrag.art === 'vorhaben') {
      try {
        anmelden(liesVorhaben(eintrag.ziel).workflow.repo, 'workflow');
      } catch (lesefehler) {
        fehler.push({
          name: eintrag.name,
          art: eintrag.art,
          repo: eintrag.ziel,
          grund: kurz(lesefehler) || 'vorhaben.json nicht lesbar',
        });
      }
    }
  }

  return { geholt, fehler };
}

/**
 * Beim Start: nur handeln, wenn noch kein Board da ist. Ein Register mit
 * anderen Boards bleibt, wie es ist; ein gescheiterter Erstversuch darf beim
 * nächsten Start ersetzt werden. Nach dem geholten Hauptboard kommen seine
 * nackten Verweise dazu; ein Fehlschlag dabei ändert den Eintrag nicht.
 */
export function sicherstellen({ home } = {}) {
  const register = liesRegister(home);
  if (register && register.boards.length) {
    const nurHauptboard = register.boards.length === 1
      && istHauptboard(register.boards[0]);
    const gescheitert = nurHauptboard && Boolean(register.boards[0].fehler);
    if (!gescheitert) return register;
  }
  try {
    const ergebnis = holeHauptboard({ home });
    if (!ergebnis.fehler) holeVerweiseNach({ ergebnis, home });
    return ergebnis.register;
  } catch {
    return liesRegister(home) || register
      || { format: 1, aktiv: null, boards: [] };
  }
}

/**
 * `holeVerweise` nach einem gelungenen Hauptboard-Clone. Ein unlesbares
 * `board.json` soll den Start nicht kippen; der Fehler bleibt dann eben dort.
 */
function holeVerweiseNach({ ergebnis, home }) {
  try {
    ergebnis.verweise = holeVerweise({ boardRepo: ergebnis.board.repo, home });
  } catch (fehler) {
    ergebnis.verweise = { geholt: [], fehler: [{ name: '', grund: kurz(fehler) }] };
  }
  return ergebnis.verweise;
}

/**
 * „Wiederholen“: einen leeren oder nur aus `.git` bestehenden Zielordner
 * entfernen und das Hauptboard erneut holen. Alles andere bleibt liegen —
 * eine vorhandene `board.json` wird ohnehin nur gelesen. Danach werden auch
 * seine nackten Verweise wieder geholt; ein Fehlschlag dort bleibt an seinem
 * Verweis.
 */
export function wiederholen({ home } = {}) {
  const ziel = zielPfad(home);
  try {
    if (existsSync(ziel)) {
      const eintraege = readdirSync(ziel);
      const unvollstaendig = eintraege.length === 0
        || (eintraege.length === 1 && eintraege[0] === '.git');
      if (unvollstaendig) rmSync(ziel, { recursive: true, force: true });
    }
  } catch {
    // Lässt sich der Ordner nicht räumen, entscheidet der Klonversuch.
  }
  const ergebnis = holeHauptboard({ home });
  if (!ergebnis.fehler) holeVerweiseNach({ ergebnis, home });
  return ergebnis;
}
