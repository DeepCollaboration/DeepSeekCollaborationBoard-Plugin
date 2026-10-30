/**
 * Identität und Board-Register.
 *
 * Beides liegt außerhalb des Produkts in `$DSH_HOME/board/`: eine neue Fassung
 * des Plugins überschreibt es nicht, und dieselbe Person findet ihre Boards in
 * jeder Installation wieder.
 *
 *   identitaet.json — wer ich bin: Name, GitHub-Name, Farbe
 *   boards.json     — welche Boards ich benutze und welches gerade offen ist
 *
 * Die Ablage selbst bleibt ein Git-Repository. Ein Board ist ein Eintrag im
 * Register mit dem Ort seiner Ablage; die Personenkennung gilt nur dort.
 */
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FORMAT, liesAblage, liesFormat, liesPersonen } from './ablage.js';
import { staendeFuer, zusammenfassen } from './abgleich.js';
import { liesBoard } from './formate/board.js';

/** Das öffentliche Hauptboard. Wer neu dazukommt, bekommt es beim Start. */
export const HAUPTBOARD = 'https://github.com/DeepCollaboration/board-hauptboard.git';

/**
 * Die Adresse des Hauptboards. `DSH_BOARD_HAUPTBOARD` überschreibt sie für
 * Prüfungen; gelesen wird bei jedem Aufruf, damit ein Lauf eine andere Adresse
 * bekommen kann, ohne das Modul neu zu laden.
 */
export function hauptboardAdresse() {
  const ausUmgebung = String(process.env.DSH_BOARD_HAUPTBOARD || '').trim();
  return ausUmgebung || HAUPTBOARD;
}

const REGISTER_FORMAT = 1;
const KENNUNG = /^[a-z0-9][a-z0-9._-]*$/;

function liesJson(pfad, vorgabe) {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'));
  } catch {
    return vorgabe;
  }
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  const text = JSON.stringify(wert, null, 2) + '\n';
  writeFileSync(pfad + '.tmp', text, 'utf8');
  renameSync(pfad + '.tmp', pfad);
  return text;
}

export function registerPfad(home) {
  return join(home, 'board', 'boards.json');
}

export function identitaetPfad(home) {
  return join(home, 'board', 'identitaet.json');
}

/**
 * Die Darstellung: persönliche Anzeige-Einstellungen, die nicht zum Board
 * gehören — heute die Akzentfarbe. Sie gilt für alle Boards und für das
 * ganze Programm, steht deshalb neben der Identität und nicht in `board.json`.
 */
export function darstellungPfad(home) {
  return join(home, 'board', 'darstellung.json');
}

/** Die erlaubten Akzente: `marke` ist die Farbe des Dashboards. */
export const AKZENTE = ['marke', 'violett', 'tuerkis', 'bernstein', 'rose', 'indigo'];

/** Die gespeicherte Darstellung; ohne Datei gilt die Dashboard-Farbe. */
export function liesDarstellung(home) {
  const roh = liesJson(darstellungPfad(home), null);
  const akzent = roh && AKZENTE.includes(roh.akzent) ? roh.akzent : 'marke';
  return { akzent };
}

export function schreibeDarstellung(home, darstellung) {
  const akzent = darstellung && AKZENTE.includes(darstellung.akzent)
    ? darstellung.akzent
    : 'marke';
  schreibeJson(darstellungPfad(home), { akzent });
  return { akzent };
}

/**
 * Ein Eintrag im Register. Die Fassung entscheidet, wie `/board/data` liest:
 * `1` über die alte Ablage, `2` über die Komposition. Ein Eintrag ohne
 * Fassung ist der alte Weg; die bisherigen Register bleiben damit gültig.
 * Die Art eines Boards der Fassung 2 kommt aus seiner `board.json`
 * (`hauptboard`, `team`, `lokal`); die eines alten Boards sagt, wie es
 * angebunden ist (`github`, `ordner`).
 */
function normalisiereBoard(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const id = String(roh.id || '').trim();
  const repo = String(roh.repo || '').trim();
  if (!KENNUNG.test(id) || !repo) return null;
  const format = roh.format === 2 ? 2 : 1;
  const arten = format === 2
    ? ['hauptboard', 'team', 'lokal']
    : ['github', 'ordner'];
  const gespeicherterName = String(roh.name || '').trim() || id;
  // Nur eine Ablage der Fassung 1 kann Archiv sein. Sie bleibt unter ihrem
  // gespeicherten Namen erhalten; angezeigt wird sie als „Archiv“.
  const archiv = format === 1 && roh.archiv === true;
  const nameAlt = archiv
    ? (String(roh.nameAlt || '').trim() || gespeicherterName)
    : null;
  return {
    id,
    name: archiv ? 'Archiv' : gespeicherterName,
    ...(archiv ? { archiv: true, nameAlt } : null),
    format,
    art: arten.includes(roh.art) ? roh.art : (format === 2 ? 'lokal' : 'github'),
    repo,
    remote: typeof roh.remote === 'string' && roh.remote ? roh.remote : null,
    person: String(roh.person || 'p1'),
    angelegt: typeof roh.angelegt === 'string' ? roh.angelegt : null,
    // Das Hauptboard trägt seinen Zustand im Register: ob es geholt wurde und
    // wie es sichtbar ist. Beides bleibt beim Lesen erhalten, damit die
    // Anzeige „nicht geholt“ sagen kann, ohne den Ordner zu befragen.
    ...(typeof roh.fehler === 'string' && roh.fehler ? { fehler: roh.fehler } : null),
    ...(roh.sichtbarkeit === 'privat' || roh.sichtbarkeit === 'öffentlich'
      ? { sichtbarkeit: roh.sichtbarkeit } : null),
  };
}

/** Das Register oder `null`, wenn es noch keines gibt. */
export function liesRegister(home) {
  const roh = liesJson(registerPfad(home), null);
  if (!roh || !Array.isArray(roh.boards)) return null;
  const boards = roh.boards.map(normalisiereBoard).filter(Boolean);
  const aktiv = boards.some((b) => b.id === roh.aktiv)
    ? roh.aktiv
    : (boards[0] ? boards[0].id : null);
  return { format: REGISTER_FORMAT, aktiv, boards };
}

export function schreibeRegister(home, register) {
  schreibeJson(registerPfad(home), {
    format: REGISTER_FORMAT,
    aktiv: register.aktiv || null,
    boards: register.boards,
  });
}

/**
 * Das Register beim Start. Fehlt es, wird die alte Einzelkonfiguration
 * (`board.config.json`) einmal übernommen — danach gilt nur noch das Register.
 */
export function ladeRegister(home, legacy) {
  const da = liesRegister(home);
  if (da) return da;
  const boards = [];
  if (legacy && legacy.repo && legacy.person && existsSync(legacy.repo)) {
    const remote = gitLauf(['remote', 'get-url', 'origin'], legacy.repo, home).out;
    boards.push({
      id: 'hauptboard',
      name: 'Hauptboard',
      art: remote ? 'github' : 'ordner',
      repo: resolve(legacy.repo),
      remote: remote || null,
      person: String(legacy.person),
      angelegt: new Date().toISOString(),
    });
  }
  const register = { format: REGISTER_FORMAT, aktiv: boards[0] ? boards[0].id : null, boards };
  if (boards.length) {
    try {
      schreibeRegister(home, register);
    } catch (fehler) {
      // Ein nicht schreibbares Zuhause soll das Board nicht verhindern; die
      // Liste lebt dann nur, bis die Anwendung neu startet.
      console.warn('Board: Register nicht geschrieben: '
        + String((fehler && fehler.message) || fehler));
    }
  }
  return register;
}

/** Die globale Identität oder `null`, solange niemand sie eingetragen hat. */
export function liesIdentitaet(home) {
  const roh = liesJson(identitaetPfad(home), null);
  if (!roh || typeof roh !== 'object') return null;
  return {
    name: String(roh.name || '').trim().slice(0, 40),
    github: String(roh.github || '').trim().slice(0, 39),
    farbe: /^#[0-9a-f]{6}$/i.test(String(roh.farbe || '')) ? String(roh.farbe) : '#fbbf24',
  };
}

export function schreibeIdentitaet(home, identitaet) {
  schreibeJson(identitaetPfad(home), {
    name: String(identitaet.name || '').trim().slice(0, 40),
    github: String(identitaet.github || '').trim().slice(0, 39),
    farbe: /^#[0-9a-f]{6}$/i.test(String(identitaet.farbe || ''))
      ? String(identitaet.farbe)
      : '#fbbf24',
  });
}

/**
 * Die Identität beim Start. Fehlt sie, wird sie aus der eigenen Person der
 * offenen Ablage übernommen; auf einer frischen Installation bleibt sie leer,
 * bis die Seite danach fragt.
 */
export function ladeIdentitaet(home, register) {
  const da = liesIdentitaet(home);
  if (da) return da;
  const aktiv = register && register.boards.find((b) => b.id === register.aktiv);
  if (!aktiv || !existsSync(join(aktiv.repo, 'personen'))) return null;
  const ich = liesPersonen(aktiv.repo, aktiv.person).find((p) => p.ich);
  if (!ich) return null;
  const identitaet = {
    name: ich.name || '',
    github: ich.github || '',
    farbe: ich.farbe || '#fbbf24',
  };
  if (!identitaet.name && !identitaet.github) return null;
  try {
    schreibeIdentitaet(home, identitaet);
  } catch (fehler) {
    console.warn('Board: Identität nicht geschrieben: '
      + String((fehler && fehler.message) || fehler));
  }
  return identitaet;
}

/** Ein Git-Lauf in einem Board, ohne auf eine Eingabe zu warten. */
function gitLauf(args, cwd, home, grenze) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const ssh = home ? join(home, '.ssh', 'config') : '';
  if (ssh && existsSync(ssh)) env.GIT_SSH_COMMAND = 'ssh -F ' + ssh;
  try {
    const lauf = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: grenze || 30000,
      env,
    });
    return {
      ok: lauf.status === 0,
      out: String(lauf.stdout || '').trim(),
      fehler: String(lauf.stderr || '').trim(),
    };
  } catch (fehler) {
    return { ok: false, out: '', fehler: String((fehler && fehler.message) || fehler) };
  }
}

function kurz(fehler) {
  return String(fehler || '').split('\n').map((z) => z.trim()).filter(Boolean).slice(-2).join(' ');
}

function basisKennung(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'board';
}

function freieKennung(home, register, name) {
  const besetzt = new Set(register.boards.map((b) => b.id));
  const basis = basisKennung(name);
  let id = basis;
  let nummer = 2;
  while (besetzt.has(id) || existsSync(join(home, 'board', 'ablagen', id))) {
    id = basis + '-' + nummer;
    nummer += 1;
  }
  return id;
}

function nameAusAdresse(adresse) {
  const text = String(adresse || '').replace(/\.git$/i, '').replace(/[/\\]+$/, '');
  const teil = text.split(/[/\\:]/).filter(Boolean).pop();
  return teil || 'Board';
}

function identitaetMitVorgabe(identitaet) {
  return {
    name: String((identitaet && identitaet.name) || '').trim().slice(0, 40),
    github: String((identitaet && identitaet.github) || '').trim().slice(0, 39),
    farbe: /^#[0-9a-f]{6}$/i.test(String((identitaet && identitaet.farbe) || ''))
      ? String(identitaet.farbe)
      : '#fbbf24',
  };
}

/**
 * Die eigene Kennung auf diesem Board: erst über den GitHub-Namen, dann über
 * den Namen. Gibt es beides nicht, entsteht ein neuer Eintrag — man ist hier
 * neu. Zurück kommen Kennung und die angelegte Datei (oder `null`).
 */
function personFuer(repo, identitaet) {
  const wer = identitaetMitVorgabe(identitaet);
  const personen = liesPersonen(repo, '');
  const github = wer.github.toLowerCase();
  const name = wer.name.toLowerCase();
  let treffer = null;
  if (github) {
    treffer = personen.find((p) => String(p.github || '').toLowerCase() === github);
  }
  if (!treffer && name) {
    treffer = personen.find((p) => String(p.name || '').trim().toLowerCase() === name);
  }
  if (treffer) return { id: treffer.id, datei: null };

  const besetzt = new Set(personen.map((p) => p.id));
  let nummer = 1;
  while (besetzt.has('p' + nummer)) nummer += 1;
  const id = 'p' + nummer;
  const eintrag = { id, name: wer.name };
  if (wer.farbe) eintrag.farbe = wer.farbe;
  if (wer.github) eintrag.github = wer.github;
  schreibeJson(join(repo, 'personen', id + '.json'), eintrag);
  return { id, datei: 'personen/' + id + '.json' };
}

/** Die kleinste Ablage: Format, eine Station, ein leerer Vorhaben-Ordner. */
function initialisiere(repo, person, name) {
  const dateien = [];
  const schreibe = (relativ, inhalt) => {
    const ziel = join(repo, relativ);
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, inhalt, 'utf8');
    dateien.push(relativ);
  };
  schreibe('format', String(FORMAT) + '\n');
  schreibe('vorgaenge/.gitkeep', '');
  const workflow = {
    id: 'standard',
    titel: String(name || 'Mein Board').trim().slice(0, 60) || 'Mein Board',
    schritte: [{
      id: 'start',
      name: 'Start',
      host: person,
      eingang: [],
      ausgabe: [],
      wie: { art: 'datei', wert: '' },
      skill: null,
      inhalt: 'Erste Station. Über + in der Kopfzeile kommen weitere dazu.',
    }],
    positionen: [{ id: 'start', schritt: 'start', x: 40, y: 80 }],
    kanten: [],
    layout: 'auto',
  };
  schreibe('workflows/' + person + '.json',
    JSON.stringify({ person, workflows: [workflow] }, null, 2) + '\n');
  return dateien;
}

/** Nach dem Klon: liegt der fremde Zweig schon im Arbeitsordner? */
function auspacken(repo, home) {
  if (existsSync(join(repo, 'format'))) return;
  for (const zweig of ['main', 'master']) {
    const da = gitLauf(['rev-parse', '--verify', '--quiet', 'origin/' + zweig], repo, home);
    if (!da.ok) continue;
    gitLauf(['checkout', '-B', zweig, 'origin/' + zweig], repo, home);
    if (existsSync(join(repo, 'format'))) return;
  }
}

function gitEinrichten(repo, home, frisch) {
  if (existsSync(join(repo, '.git'))) {
    // Ein leerer Klon hat noch keinen Zweig; der eigene Stand braucht einen
    // Namen. Ist schon ein Zweig da, bleibt er, wie er ist.
    const kopf = gitLauf(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo, home);
    if (frisch && (!kopf.ok || kopf.out !== 'main')) {
      gitLauf(['checkout', '-b', 'main'], repo, home);
    }
    return;
  }
  gitLauf(['init', '-b', 'main'], repo, home);
}

function festschreiben(repo, home, dateien, nachricht, identitaet) {
  if (!dateien.length) return false;
  const wer = identitaetMitVorgabe(identitaet);
  const autor = [
    '-c', 'user.name=' + (wer.name || 'Board'),
    '-c', 'user.email=' + (wer.github ? wer.github + '@users.noreply.github.com' : 'board@local'),
  ];
  const add = gitLauf(['add', '--', ...dateien], repo, home);
  if (!add.ok) return false;
  const commit = gitLauf([...autor, 'commit', '-m', nachricht], repo, home);
  return commit.ok;
}

/**
 * Ein Board verbinden oder anlegen.
 *
 * `adresse` ist eine GitHub-Adresse oder ein Ordner. Ist sie leer, entsteht
 * ein neues lokales Board unter `$DSH_HOME/board/ablagen/`. Ein leerer Klon
 * und ein leerer Ordner bekommen die kleinste Ablage; eine vorhandene Ablage
 * wird nur verbunden, nicht umgeschrieben. Ein Ordner mit `board.json` ist ein
 * Board der Fassung 2 und wird so aufgenommen, wie es daliegt.
 */
export function verbindeBoard({ home, name, adresse, identitaet }) {
  const register = liesRegister(home) || { format: REGISTER_FORMAT, aktiv: null, boards: [] };
  const text = String(adresse || '').trim();
  const istAdresse = /^(https?:\/\/|file:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(text);
  const boardName = String(name || '').trim()
    || (text ? nameAusAdresse(text) : 'Mein Board');
  const id = freieKennung(home, register, boardName);
  let repo;
  let remote = null;
  let frisch = false;

  if (text && !istAdresse) {
    repo = resolve(text);
    // Ein Board der Fassung 2 bringt seine Personen selbst mit; es wird
    // aufgenommen, ohne dass eine Personendatei daneben entsteht.
    if (existsSync(join(repo, 'board.json'))) {
      const daten = liesBoard(repo);
      const wer = identitaetMitVorgabe(identitaet);
      const person = daten.personen.find((p) => wer.github
        && String(p.login).toLowerCase() === wer.github.toLowerCase())
        || daten.personen.find((p) => wer.name
          && String(p.name).trim().toLowerCase() === wer.name.trim().toLowerCase())
        || daten.personen[0];
      return nimmBoardAuf(home, { pfad: repo, person: person ? person.login : '' });
    }
    // Ein leerer Klon bringt nur `.git` mit; der zählt nicht als Inhalt.
    const eintraege = existsSync(repo)
      ? readdirSync(repo).filter((n) => n !== '.git')
      : [];
    if (eintraege.length) {
      if (!existsSync(join(repo, 'format'))) {
        throw new Error('Dieser Ordner ist keine Ablage: die Datei „format“ fehlt.');
      }
      const format = liesFormat(repo);
      if (format !== FORMAT) {
        throw new Error('Dieses Board hat Format ' + format
          + ', diese Fassung schreibt Format ' + FORMAT + '.');
      }
    } else {
      mkdirSync(repo, { recursive: true });
      frisch = true;
    }
    // Ein lokaler Ordner kann trotzdem einen Remote tragen (eigener Klon).
    remote = gitLauf(['remote', 'get-url', 'origin'], repo, home).out || null;
  } else if (istAdresse) {
    repo = join(home, 'board', 'ablagen', id);
    remote = text;
    mkdirSync(dirname(repo), { recursive: true });
    const klon = gitLauf(['clone', text, repo], home, home, 120000);
    if (!klon.ok) {
      throw new Error('Das Board ließ sich nicht holen: ' + kurz(klon.fehler));
    }
    auspacken(repo, home);
    if (!existsSync(join(repo, 'format'))) {
      frisch = true;
    } else {
      const format = liesFormat(repo);
      if (format !== FORMAT) {
        throw new Error('Dieses Board hat Format ' + format
          + ', diese Fassung schreibt Format ' + FORMAT + '.');
      }
    }
  } else {
    repo = join(home, 'board', 'ablagen', id);
    mkdirSync(repo, { recursive: true });
    frisch = true;
  }

  const person = personFuer(repo, identitaet);
  const dateien = [];
  if (frisch) dateien.push(...initialisiere(repo, person.id, boardName));
  if (person.datei) dateien.push(person.datei);
  if (frisch || person.datei) {
    gitEinrichten(repo, home, frisch);
    festschreiben(repo, home, dateien, frisch ? 'Board angelegt' : 'Person eingetragen', identitaet);
    if (remote) gitLauf(['push', '-u', 'origin', 'main'], repo, home, 120000);
  }

  const board = {
    id,
    name: boardName,
    art: istAdresse || remote ? 'github' : 'ordner',
    repo,
    remote,
    person: person.id,
    angelegt: new Date().toISOString(),
  };
  register.boards.push(board);
  register.aktiv = id;
  schreibeRegister(home, register);
  return { board, register };
}

/**
 * Ein Board der Fassung 2 aufnehmen: es liegt als Ordner mit `board.json` da.
 * Aufgenommen wird sein Pfad, seine Fassung, sein Name und seine Art; es wird
 * das offene Board. Die bisherigen Boards bleiben, wie sie sind.
 *
 * Anders als `verbindeBoard` legt dieser Weg keine Personen- oder
 * Workflow-Dateien an: ein Board der Fassung 2 bringt beides in seinen
 * Repositories selbst mit.
 */
export function nimmBoardAuf(home, { pfad, person } = {}) {
  const ort = resolve(String(pfad == null ? '' : pfad));
  if (!existsSync(join(ort, 'board.json'))) {
    throw new Error('Kein Board der Fassung 2: board.json fehlt in ' + ort);
  }
  const board = liesBoard(ort);
  const register = liesRegister(home) || { format: REGISTER_FORMAT, aktiv: null, boards: [] };
  const alte = register.boards.find((b) => b.id === board.id);
  const id = alte && resolve(alte.repo) !== ort
    ? freieKennung(home, register, board.name)
    : board.id;
  const eintrag = {
    id,
    name: board.name,
    format: 2,
    art: board.art,
    repo: ort,
    remote: gitLauf(['remote', 'get-url', 'origin'], ort, home).out || null,
    person: String(person || (board.personen[0] && board.personen[0].login) || 'p1'),
    angelegt: new Date().toISOString(),
  };
  if (alte) Object.assign(alte, eintrag);
  else register.boards.push(eintrag);
  register.aktiv = eintrag.id;
  schreibeRegister(home, register);
  return { board: eintrag, register };
}

/**
 * Ist das das öffentliche Hauptboard? Es wird nie aus der Liste genommen —
 * weder über die Route noch über einen anderen Weg. Erkannt wird es an seiner
 * Art (Fassung 2) oder an seiner Kennung (die alte Ablage kennt die Art nicht).
 */
export function istHauptboard(board) {
  return Boolean(board) && (board.art === 'hauptboard' || board.id === 'hauptboard');
}

/**
 * Ein Board aus dem Register nehmen. Die Dateien bleiben, wo sie liegen. Das
 * Hauptboard bleibt immer; war das entfernte Board offen, ist danach das
 * Hauptboard offen.
 */
export function entferneBoard(home, id) {
  const register = liesRegister(home);
  if (!register) return null;
  const board = register.boards.find((b) => b.id === id);
  if (istHauptboard(board)) {
    const fehler = new Error('Das Hauptboard bleibt');
    fehler.status = 409;
    throw fehler;
  }
  const warAktiv = register.aktiv === id;
  register.boards = register.boards.filter((b) => b.id !== id);
  if (warAktiv) {
    const haupt = register.boards.find(istHauptboard) || register.boards[0] || null;
    register.aktiv = haupt ? haupt.id : null;
  }
  schreibeRegister(home, register);
  return register;
}

/** Der Inhaber eines Remotes: bei GitHub die Organisation oder Person. */
function inhaberVonRemote(remote) {
  const treffer = String(remote || '').match(/github\.com[:/]([^/\s]+)\//i);
  return treffer ? treffer[1] : '';
}

/**
 * Der Besitzer eines Boards: die Person aus dem Register, sonst eine Person
 * des Boards (bei Fassung 2 aus `board.json`, bei Fassung 1 aus ihren
 * Personendateien), sonst der Inhaber des Remotes.
 */
function besitzerVon(board, personen, remote) {
  const eigene = (personen || []).find((p) => String(p.id) === String(board.person));
  if (eigene && String(eigene.name || '').trim()) return String(eigene.name).trim();
  const ersterName = (personen || [])
    .map((p) => String(p.name || '').trim()).find(Boolean);
  if (ersterName) return ersterName;
  const ersterId = (personen || [])
    .map((p) => String(p.id || '').trim()).find(Boolean);
  if (ersterId) return ersterId;
  return inhaberVonRemote(remote);
}

/** Ein Verweis der Fassung 2 als Eintrag für den Stand; ein Remote zählt nicht. */
function repoEintrag(verweis, basis, art) {
  const text = String((verweis && verweis.repo) || '').trim();
  const istAdresse = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(text);
  return { pfad: !text || istAdresse ? '' : resolve(basis, text), art, name: '' };
}

/** Die Verweise einer Ablage der Fassung 1: Workflows, Vorhaben, Stationen. */
function verweiseFassung1(daten) {
  let workflows = 0;
  let stationen = 0;
  for (const person of daten.workflows || []) {
    for (const workflow of person.workflows || []) {
      workflows += 1;
      stationen += Array.isArray(workflow.schritte) ? workflow.schritte.length : 0;
    }
  }
  return {
    workflows,
    vorhaben: (daten.vorgaenge || []).length,
    stationen,
  };
}

/**
 * Die Kennzahlen eines Boards für die Anzeige: ob es das Hauptboard ist, wem
 * es gehört, wie viele Verweise es trägt, wie sein Stand ist und warum es
 * gegebenenfalls nicht lesbar war.
 *
 * Gelesen wird einmal je Board: die Formatdatei, die Personen und die Verweise
 * kommen aus demselben Lesevorgang; der Stand entsteht aus `abgleich.js`, für
 * jedes Repository ohne Netz. Ein Board, das sich nicht lesen lässt, bleibt in
 * der Liste und trägt den Grund in `fehler`.
 */
export function kennzahlenVon(board, home) {
  const kennzahlen = {
    hauptboard: istHauptboard(board),
    besitzer: '',
    verweise: { workflows: 0, vorhaben: 0, stationen: 0 },
    stand: zusammenfassen([]),
    fehler: '',
  };
  if (!board || !board.repo) {
    kennzahlen.fehler = 'Kein Ordner im Register';
    return kennzahlen;
  }
  if (!existsSync(board.repo)) {
    kennzahlen.fehler = 'Der Ordner fehlt: ' + board.repo;
    return kennzahlen;
  }

  let personen = [];
  let repos = [{ pfad: board.repo, art: 'board', name: board.name }];
  try {
    if (board.format === 2) {
      const daten = liesBoard(board.repo);
      personen = daten.personen.map((eintrag) => ({
        id: eintrag.login,
        name: eintrag.name,
      }));
      kennzahlen.verweise = {
        workflows: daten.workflows.length,
        vorhaben: daten.vorhaben.length,
        stationen: daten.stationen.length,
      };
      // Jeder Verweis zählt zu seinem Stand — auch einer, dessen Ordner
      // fehlt; `standFuer` nennt den Grund dann an seinem Eintrag.
      repos = [
        ...repos,
        ...daten.workflows.map((verweis) => repoEintrag(verweis, board.repo, 'workflow')),
        ...daten.stationen.map((verweis) => repoEintrag(verweis, board.repo, 'station')),
        ...daten.vorhaben.map((verweis) => repoEintrag(verweis, board.repo, 'vorhaben')),
      ];
    } else {
      // Die Ablage der Fassung 1 kennt kein `board.json`: Format, Personen,
      // Workflows und Vorhaben stehen in ihren Dateien. Einmal gelesen, zählen
      // alle Felder daraus.
      liesFormat(board.repo);
      const daten = liesAblage({ repo: board.repo, person: board.person, home });
      personen = daten.personen || [];
      kennzahlen.verweise = verweiseFassung1(daten);
    }
  } catch (fehler) {
    kennzahlen.fehler = kurz((fehler && fehler.message) || fehler);
  }

  kennzahlen.besitzer = besitzerVon(board, personen, board.remote);
  try {
    kennzahlen.stand = zusammenfassen(staendeFuer(repos));
  } catch (fehler) {
    if (!kennzahlen.fehler) {
      kennzahlen.fehler = kurz((fehler && fehler.message) || fehler);
    }
  }
  return kennzahlen;
}
