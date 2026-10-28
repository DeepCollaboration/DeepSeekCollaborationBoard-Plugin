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
import { FORMAT, liesFormat, liesPersonen } from './ablage.js';

/** Das öffentliche Hauptboard. Wer neu dazukommt, verbindet es zuerst. */
export const HAUPTBOARD = 'https://github.com/DeepCollaboration/DeepSeekCollaborationBoard.git';

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

function normalisiereBoard(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const id = String(roh.id || '').trim();
  const repo = String(roh.repo || '').trim();
  if (!KENNUNG.test(id) || !repo) return null;
  return {
    id,
    name: String(roh.name || '').trim() || id,
    art: roh.art === 'ordner' ? 'ordner' : 'github',
    repo,
    remote: typeof roh.remote === 'string' && roh.remote ? roh.remote : null,
    person: String(roh.person || 'p1'),
    angelegt: typeof roh.angelegt === 'string' ? roh.angelegt : null,
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
 * wird nur verbunden, nicht umgeschrieben.
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

/** Ein Board aus dem Register nehmen. Die Dateien bleiben, wo sie liegen. */
export function entferneBoard(home, id) {
  const register = liesRegister(home);
  if (!register) return null;
  register.boards = register.boards.filter((b) => b.id !== id);
  if (register.aktiv === id) {
    register.aktiv = register.boards[0] ? register.boards[0].id : null;
  }
  schreibeRegister(home, register);
  return register;
}
