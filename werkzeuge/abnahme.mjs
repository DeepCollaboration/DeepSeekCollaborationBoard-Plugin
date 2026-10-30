/**
 * Die Abnahme des Board-Gesamtkonzepts.
 *
 * Ein Lauf belegt den ganzen Weg: die Prüfungen der neuen Form (Schritt 29 bis
 * 40, soweit vorhanden), die ganze Suite, eine lesende Live-Probe gegen das
 * öffentliche Board-Repository, die beiden echten migrierten Boards, das
 * Register und die alte Ablage. Dazu ordnet er die sieben Wege des Konzepts
 * ihren Prüfungen zu.
 *
 * Aufruf:
 *   node werkzeuge/abnahme.mjs [--bericht <datei>]
 *
 * Ausgabe: Markdown-Tabellen und JSON auf stdout; mit `--bericht` zusätzlich
 * ein Bericht als Markdown-Datei. Exit 1, wenn eine Prüfung der neuen Form,
 * die Suite, ein echtes Board, das Register oder die alte Ablage fehlschlägt —
 * nicht, wenn die Live-Probe ohne Netz oder mit Grenze „live nicht geprüft“
 * ergibt und nicht, wenn kein GitHub-Token vorliegt.
 *
 * Gelesen werden die echten Repositories und `$DSH_HOME/board` nur. Die
 * Prüfungen der neuen Form arbeiten auf `/tmp/board-scheibe1`; die Live-Probe
 * bekommt ein eigenes, danach gelöschtes Home, damit sie den Stern-Zwischenspeicher
 * nicht in die echten Dateien schreibt.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { komponiere } from '../komposition.js';
import { erstelleClient } from '../github.js';

const PRODUKT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOS = process.env.DSH_BOARD_REPOS || '/workspace/projekte/board-repos';
const ALT = process.env.DSH_BOARD_ALT || '/workspace/projekte/board';
const HOME = process.env.DSH_HOME || '/dsh-home';
// Der Stand, gegen den die Board-Daten der alten Ablage verglichen werden.
// Ein Commit, der nur die Dokumente dieses Vorgangs festhält, verschiebt HEAD,
// ändert aber keine Board-Daten; maßgeblich ist deshalb der Datenvergleich,
// nicht die Gleichheit von HEAD.
const ALT_SOLL = 'ae905d8';
const LIVE = { owner: 'DeepCollaboration', name: 'DeepSeekCollaborationBoard' };
const ALT_DATEN = ['format', 'personen', 'workflows', 'skills', 'vorgaenge/*/vorhaben.json'];

/** Die sieben Wege und die Prüfung, die sie belegt. */
const WEGE = [
  {
    nr: 1,
    weg: 'Hauptboard ohne Einrichten',
    pruefungen: [33],
    beschreibung: 'frisches Home, kein Token, keine Identität; Hauptboard offen und fest',
  },
  {
    nr: 2,
    weg: 'Station prüfen und sternen',
    pruefungen: [27, 31],
    beschreibung: 'Vertrauensbild der Station; Sterne lesen und zeigen',
  },
  {
    nr: 3,
    weg: 'Probeprojekt übernehmen',
    pruefungen: [38],
    beschreibung: 'Katalog → eigenes Board; Kopie mit fork_von, Original unverändert',
  },
  {
    nr: 4,
    weg: 'Privates Team-Board',
    pruefungen: [30, 31, 32],
    beschreibung: 'vier private Vorhaben; Sichtbarkeit, Lesemodus, Schreibprüfung',
  },
  {
    nr: 5,
    weg: 'Beitrag als Pull Request',
    pruefungen: [35],
    beschreibung: 'ohne Token Verweis; mit Token anlegen, Stand zeigen, zusammenführen',
  },
  {
    nr: 6,
    weg: 'Fork',
    pruefungen: [37],
    beschreibung: 'Fork anlegen und verlinken; ohne Token Verweis',
  },
  {
    nr: 7,
    weg: 'Frage',
    pruefungen: [37],
    beschreibung: 'Issue anlegen, offen und geschlossen lesen; Pull Requests bleiben draußen',
  },
];

function kurz(wert, grenze = 160) {
  const text = String(wert == null ? '' : wert).replace(/\s+/g, ' ').trim();
  return text.length > grenze ? text.slice(0, grenze - 1) + '…' : text;
}

/** Eine Zelle für eine Markdown-Tabelle: keine Zeilenumbrüche, kein rohes `|`. */
function zelle(wert) {
  const text = String(wert == null ? '' : wert)
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
  return text || '—';
}

function tabelle(kopf, zeilen) {
  return [
    '| ' + kopf.map(zelle).join(' | ') + ' |',
    '| ' + kopf.map(() => '---').join(' | ') + ' |',
    ...zeilen.map((zeile) => '| ' + zeile.map(zelle).join(' | ') + ' |'),
  ].join('\n');
}

function gitAus(pfad, args) {
  const lauf = spawnSync('git', ['-C', pfad, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return {
    status: typeof lauf.status === 'number' ? lauf.status : 1,
    out: String(lauf.stdout || '').trim(),
    err: String(lauf.stderr || '').trim(),
  };
}

function liesArgumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    const treffer = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!treffer || treffer[1] !== 'bericht') {
      throw new Error('Unbekanntes Argument: ' + argv[i]);
    }
    const wert = treffer[2] == null ? argv[i + 1] : treffer[2];
    if (wert == null || wert === '') {
      throw new Error('--bericht braucht einen Wert');
    }
    werte.bericht = wert;
    if (treffer[2] == null) i += 1;
  }
  return werte;
}

/** Eine einzelne Prüfung der neuen Form: Exit, erste ok-Zeile, Dauer. */
function laufEine({ datei, nummer }) {
  const beginn = Date.now();
  const lauf = spawnSync(process.execPath, ['--test', datei], {
    cwd: PRODUKT,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const ausgabe = String(lauf.stdout || '') + '\n' + String(lauf.stderr || '');
  const okZeile = ausgabe
    .split('\n')
    .map((zeile) => zeile.trim())
    .find((zeile) => zeile.startsWith('ok ')) || '';
  const letzte = ausgabe.split('\n').map((zeile) => zeile.trim()).filter(Boolean).slice(-4);
  return {
    datei,
    nummer,
    exit: typeof lauf.status === 'number' ? lauf.status : 1,
    okZeile,
    fehler: lauf.status === 0 ? '' : kurz(letzte.join(' / '), 300),
    dauer: Date.now() - beginn,
  };
}

/** Die Prüfungen 29 bis 40, auch die Zwischenfassung 33b. */
function neueForm() {
  const gefunden = readdirSync(join(PRODUKT, 'test'))
    .map((name) => /^schritt(\d+)([a-z]?)\.mjs$/.exec(name))
    .filter(Boolean)
    .map((treffer) => ({
      datei: 'test/' + treffer[0],
      nummer: Number(treffer[1]),
      zusatz: treffer[2],
    }))
    .filter((eintrag) => eintrag.nummer >= 29 && eintrag.nummer <= 40)
    .sort((a, b) => a.nummer - b.nummer || a.zusatz.localeCompare(b.zusatz));
  const laeufe = gefunden.map(laufEine);
  const bestanden = laeufe.filter((lauf) => lauf.exit === 0).length;
  return {
    laeufe,
    gesamt: laeufe.length,
    bestanden,
    ok: laeufe.length > 0 && bestanden === laeufe.length,
  };
}

/** Die ganze Suite: Zahl bestanden/gesamt. */
function suite() {
  const beginn = Date.now();
  const lauf = spawnSync(process.execPath, ['--test'], {
    cwd: PRODUKT,
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const ausgabe = String(lauf.stdout || '') + '\n' + String(lauf.stderr || '');
  const zahl = (muster) => {
    const treffer = muster.exec(ausgabe);
    return treffer ? Number(treffer[1]) : 0;
  };
  const tests = zahl(/^ℹ tests (\d+)$/m);
  const pass = zahl(/^ℹ pass (\d+)$/m);
  const fail = zahl(/^ℹ fail (\d+)$/m);
  const exit = typeof lauf.status === 'number' ? lauf.status : 1;
  return {
    exit,
    tests,
    pass,
    fail,
    dauer: Date.now() - beginn,
    ok: exit === 0 && tests > 0 && fail === 0 && pass === tests,
  };
}

/**
 * Die Live-Probe: nur lesen, ohne Token, in einem eigenen Home. Ein Netz- oder
 * Grenzfehler ist kein Fehlschlag; er heißt „live nicht geprüft“.
 */
async function liveProbe() {
  const home = mkdtempSync(join(tmpdir(), 'board-abnahme-'));
  try {
    const client = erstelleClient({
      home,
      cacheTtl: 0,
      fetchImpl: (adresse, optionen = {}) => fetch(adresse, {
        ...optionen,
        signal: AbortSignal.timeout(15000),
      }),
    });
    const repo = await client.repo(LIVE.owner, LIVE.name);
    return {
      geprueft: true,
      repo: LIVE.owner + '/' + LIVE.name,
      sterne: repo.sterne,
      sichtbarkeit: repo.sichtbarkeit,
      standardZweig: repo.standardZweig,
      adresse: repo.adresse,
      grund: '',
    };
  } catch (fehler) {
    const status = fehler && fehler.status;
    return {
      geprueft: false,
      repo: LIVE.owner + '/' + LIVE.name,
      sterne: null,
      sichtbarkeit: '',
      standardZweig: '',
      adresse: '',
      grund: kurz((fehler && fehler.message) || fehler, 200)
        + (status ? ' (HTTP ' + status + ')' : ''),
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** Ein echtes Board zusammensetzen und mit der erwarteten Form vergleichen. */
function boardBild(name, ordner, soll) {
  const ergebnis = {
    name,
    ordner,
    schritte: 0,
    vorhaben: [],
    luecken: [],
    ok: false,
    hinweis: '',
  };
  try {
    const roh = JSON.parse(readFileSync(join(ordner, 'board.json'), 'utf8'));
    const person = Array.isArray(roh.personen) && roh.personen[0]
      ? String(roh.personen[0].login || '')
      : String(roh.id || '');
    const bild = komponiere({ repo: ordner, person, home: HOME });
    const schritte = Array.isArray(bild.schritte) ? bild.schritte : [];
    const vorhaben = Array.isArray(bild.vorgaenge) ? bild.vorgaenge : [];
    const luecken = Array.isArray(bild.luecken) ? bild.luecken : [];
    ergebnis.schritte = schritte.length;
    ergebnis.vorhaben = vorhaben.map((eintrag) => ({
      id: String(eintrag.id || ''),
      name: String(eintrag.name || ''),
      sichtbarkeit: String(eintrag.sichtbarkeit || ''),
    }));
    ergebnis.luecken = luecken.map((eintrag) => ({
      art: String(eintrag.art || ''),
      repo: String(eintrag.repo || ''),
      grund: String(eintrag.grund || ''),
    }));
    const ausnahme = soll.ausnahme ? new Set([soll.ausnahme]) : new Set();
    const weitere = vorhaben.filter((eintrag) => !ausnahme.has(String(eintrag.id)));
    const teile = [];
    if (schritte.length !== soll.schritte) {
      teile.push(schritte.length + ' statt ' + soll.schritte + ' Schritte');
    }
    if (weitere.length !== soll.vorhaben) {
      teile.push(weitere.length + ' statt ' + soll.vorhaben + ' Vorhaben');
    }
    if (luecken.length !== soll.luecken) {
      teile.push(luecken.length + ' statt ' + soll.luecken + ' Lücken');
    }
    ergebnis.ok = teile.length === 0;
    ergebnis.hinweis = teile.length ? teile.join('; ') : (soll.hinweis || '');
  } catch (fehler) {
    ergebnis.hinweis = kurz((fehler && fehler.message) || fehler, 200);
  }
  return ergebnis;
}

/** Das Register: drei Boards, aktiv `hauptboard-neu`. */
function register() {
  const pfad = join(HOME, 'board', 'boards.json');
  const ergebnis = { pfad, anzahl: 0, aktiv: '', ids: [], ok: false, beleg: '' };
  try {
    const roh = JSON.parse(readFileSync(pfad, 'utf8'));
    const boards = Array.isArray(roh.boards) ? roh.boards : [];
    ergebnis.anzahl = boards.length;
    ergebnis.aktiv = String(roh.aktiv || '');
    ergebnis.ids = boards.map((eintrag) => String(eintrag.id || ''));
    ergebnis.ok = boards.length === 3 && ergebnis.aktiv === 'hauptboard-neu'
      && ergebnis.ids.every(Boolean);
    ergebnis.beleg = boards.length + ' Boards: ' + ergebnis.ids.join(', ')
      + '; aktiv ' + (ergebnis.aktiv || '—');
  } catch (fehler) {
    ergebnis.beleg = 'Register nicht lesbar: ' + kurz((fehler && fehler.message) || fehler, 160);
  }
  return ergebnis;
}

/** Der Stand der alten Ablage; die Board-Daten werden nicht angefasst. */
function altStand() {
  const head = gitAus(ALT, ['rev-parse', '--short', 'HEAD']);
  const anzahl = gitAus(ALT, ['rev-list', '--count', 'HEAD']);
  const diff = gitAus(ALT, ['diff', '--stat', 'HEAD', '--', ...ALT_DATEN]);
  const seitSoll = gitAus(ALT, ['diff', '--stat', ALT_SOLL, '--', ...ALT_DATEN]);
  return {
    head: head.out,
    anzahl: Number(anzahl.out) || 0,
    datenGeaendert: diff.status !== 0 || Boolean(diff.out),
    datenSeitSoll: seitSoll.status !== 0 || Boolean(seitSoll.out),
    diff: diff.out,
    seitSoll: seitSoll.out,
  };
}

/** Kopf und offene Änderungen aller echten Repositories — vor und nach dem Lauf. */
function koepfe() {
  const liste = [];
  for (const name of readdirSync(REPOS).sort()) {
    const pfad = join(REPOS, name);
    if (!existsSync(join(pfad, '.git'))) continue;
    liste.push({
      name,
      head: gitAus(pfad, ['rev-parse', 'HEAD']).out,
      diff: gitAus(pfad, ['diff', '--stat', 'HEAD']).out,
    });
  }
  return liste;
}

/** Die sieben Wege: belegt, wenn jede genannte Prüfung bestanden ist. */
function wegeErgebnis(neue, suiteLauf) {
  const nachNummer = new Map();
  for (const lauf of neue.laeufe) {
    if (!nachNummer.has(lauf.nummer)) nachNummer.set(lauf.nummer, lauf);
  }
  return WEGE.map((weg) => {
    const teile = weg.pruefungen.map((nummer) => {
      const lauf = nachNummer.get(Number(nummer));
      if (lauf) {
        return { nummer, quelle: 'Lauf', ok: lauf.exit === 0, zeile: lauf.okZeile };
      }
      return { nummer, quelle: 'Suite', ok: suiteLauf.ok, zeile: '' };
    });
    const ok = teile.every((teil) => teil.ok);
    const laeufe = teile.filter((teil) => teil.quelle === 'Lauf');
    const ausSuite = teile.filter((teil) => teil.quelle === 'Suite');
    const beleg = [
      laeufe.length ? laeufe[0].zeile : '',
      laeufe.length > 1 ? '(+ ' + (laeufe.length - 1) + ' weitere Prüfungen)' : '',
      ausSuite.length
        ? 'schritt' + ausSuite[0].nummer + ' in der Suite '
          + suiteLauf.pass + '/' + suiteLauf.tests
        : '',
    ].filter(Boolean).join(' · ');
    return {
      ...weg,
      teile,
      ok,
      ergebnis: ok ? 'belegt' : 'nicht belegt',
      beleg: kurz(beleg, 200),
    };
  });
}

function entscheidendeZeile(ergebnis) {
  const neue = ergebnis.neueForm;
  const boards = ergebnis.boards.eintraege
    .map((eintrag) => eintrag.name + ' ' + eintrag.schritte + ' Schritte/'
      + eintrag.vorhaben.length + ' Vorhaben/' + eintrag.luecken.length + ' Lücken'
      + (eintrag.name === 'Hauptboard'
        ? ' (Vorgabe 0 Vorhaben durch Schritt 21 überholt)' : ''))
    .join(', ');
  const wege = ergebnis.wege.filter((weg) => weg.ok).length;
  const teile = [
    neue.bestanden + ' von ' + neue.gesamt + ' Prüfungen der neuen Form bestanden',
    'Suite ' + ergebnis.suite.pass + ' von ' + ergebnis.suite.tests,
    'sieben Wege ' + (wege === 7 ? 'belegt' : wege + ' von 7 belegt'),
    ergebnis.live.geprueft
      ? 'live geprüft (' + ergebnis.live.sterne + ' Sterne, ' + ergebnis.live.sichtbarkeit
        + ', ' + ergebnis.live.standardZweig + ')'
      : 'live nicht geprüft',
    boards,
    'Register ' + (ergebnis.register.ok ? '3 Boards, aktiv hauptboard-neu' : 'nicht wie erwartet'),
    'alte Ablage Daten ' + (ergebnis.alt.ok ? 'unverändert seit ' + ALT_SOLL : 'nicht bestätigt')
      + ' (HEAD ' + (ergebnis.alt.head || '—') + ')',
  ];
  return (ergebnis.bestanden ? 'Abnahme bestanden: ' : 'Abnahme nicht bestanden: ')
    + teile.join('; ') + '.';
}

/** Die Tabellen und Befunde, die im Bericht und auf stdout stehen. */
function markdown(ergebnis) {
  const zeilen = [];
  zeilen.push('## Die sieben Wege');
  zeilen.push('');
  zeilen.push(tabelle(
    ['#', 'Weg', 'Prüfung', 'Ergebnis', 'Beleg'],
    ergebnis.wege.map((weg) => [
      String(weg.nr),
      weg.weg,
      weg.pruefungen.map((nummer) => 'schritt' + nummer).join(', '),
      weg.ergebnis,
      weg.beleg,
    ]),
  ));
  zeilen.push('');
  zeilen.push('## Prüfungen der neuen Form (29 bis 40)');
  zeilen.push('');
  if (!ergebnis.neueForm.laeufe.length) {
    zeilen.push('Keine Prüfung der neuen Form gefunden.');
  } else {
    zeilen.push(tabelle(
      ['Prüfung', 'Exit', 'Dauer', 'Erste ok-Zeile'],
      ergebnis.neueForm.laeufe.map((lauf) => [
        lauf.datei,
        String(lauf.exit),
        lauf.dauer + ' ms',
        lauf.okZeile || lauf.fehler || '—',
      ]),
    ));
    zeilen.push('');
    zeilen.push('Bestanden: ' + ergebnis.neueForm.bestanden + ' von '
      + ergebnis.neueForm.gesamt + '.');
    if (!ergebnis.neueForm.laeufe.some((lauf) => lauf.nummer === 40)) {
      zeilen.push('');
      zeilen.push('`test/schritt40.mjs` gibt es nicht; die Reihe endet bei '
        + '`test/schritt39.mjs`, mit der Zwischenfassung `test/schritt33b.mjs`.');
    }
  }
  zeilen.push('');
  zeilen.push('## Die Suite');
  zeilen.push('');
  zeilen.push(tabelle(
    ['Lauf', 'Exit', 'Bestanden', 'Gesamt', 'Dauer'],
    [[
      'node --test',
      String(ergebnis.suite.exit),
      String(ergebnis.suite.pass),
      String(ergebnis.suite.tests),
      ergebnis.suite.dauer + ' ms',
    ]],
  ));
  zeilen.push('');
  zeilen.push('## Live-Probe (nur lesend, ohne Token)');
  zeilen.push('');
  zeilen.push(tabelle(
    ['Repository', 'Status', 'Sterne', 'Sichtbarkeit', 'Standardzweig', 'Hinweis'],
    [[
      ergebnis.live.repo,
      ergebnis.live.geprueft ? 'geprüft' : 'live nicht geprüft',
      ergebnis.live.geprueft ? String(ergebnis.live.sterne) : '—',
      ergebnis.live.geprueft ? ergebnis.live.sichtbarkeit : '—',
      ergebnis.live.geprueft ? ergebnis.live.standardZweig : '—',
      ergebnis.live.geprueft ? ergebnis.live.adresse : ergebnis.live.grund,
    ]],
  ));
  zeilen.push('');
  zeilen.push('## Die echten migrierten Boards');
  zeilen.push('');
  zeilen.push(tabelle(
    ['Board', 'Schritte', 'Vorhaben', 'Lücken', 'Ergebnis', 'Hinweis'],
    ergebnis.boards.eintraege.map((eintrag) => [
      eintrag.name,
      String(eintrag.schritte),
      eintrag.vorhaben.length
        ? eintrag.vorhaben.length + ' (' + eintrag.vorhaben
          .map((vorhaben) => vorhaben.name + (vorhaben.sichtbarkeit ? ', ' + vorhaben.sichtbarkeit : ''))
          .join('; ') + ')'
        : '0',
      String(eintrag.luecken.length),
      eintrag.ok ? 'bestanden' : 'nicht bestanden',
      eintrag.hinweis,
    ]),
  ));
  zeilen.push('');
  zeilen.push('Das Hauptboard trägt seit Schritt 21 das öffentliche Probeprojekt; '
    + 'ohne dieses Vorhaben sind es 0 Vorhaben. Die Vorgabe „0 Vorhaben“ in '
    + 'Schritt 23 stammt von vor Schritt 21. Das Team-Board führt seine vier '
    + 'Vorhaben privat und ohne Lücke.');
  zeilen.push('');
  zeilen.push('## Register und alte Ablage');
  zeilen.push('');
  zeilen.push(tabelle(
    ['Prüfung', 'Ergebnis', 'Beleg'],
    [
      ['Register', ergebnis.register.ok ? 'bestanden' : 'nicht bestanden', ergebnis.register.beleg],
      [
        'Alte Ablage',
        ergebnis.alt.ok ? 'bestanden' : 'nicht bestanden',
        'HEAD ' + (ergebnis.alt.head || '—') + ', ' + ergebnis.alt.anzahl
          + ' Fassungen, ' + (ergebnis.alt.datenGeaendert || ergebnis.alt.datenSeitSoll
            ? 'Board-Daten geändert' : 'Board-Daten unverändert seit ' + ALT_SOLL),
      ],
      [
        'Unverändert durch den Lauf',
        ergebnis.unveraendert ? 'bestanden' : 'nicht bestanden',
        ergebnis.repoAnzahl + ' echte Repositories und die alte Ablage vor und nach dem Lauf gleich',
      ],
    ],
  ));
  zeilen.push('');
  zeilen.push('## Grenzen');
  zeilen.push('');
  zeilen.push('- **Live geprüft ist nur das Lesen.** Sterne, Sichtbarkeit und '
    + 'Standardzweig kommen von `api.github.com`; Anlegen, Push, Pull Requests, '
    + 'Forks und Fragen laufen gegen einen nachgebildeten Server (schritt35, '
    + 'schritt37) und sind live ungeprüft.');
  zeilen.push('- **Die Abnahme durch den Auftraggeber steht aus.** Dieser Lauf '
    + 'belegt die Wege im Modul und an den echten Repositories; er ersetzt '
    + 'nicht den Blick auf das laufende Board im Browser. Der laufende '
    + 'Web-Prozess trägt bis zum Neustart den beim Start geladenen Stand.');
  zeilen.push('- **Die neuen Repositories sind lokal, ohne Remote und nicht '
    + 'veröffentlicht.** Die Live-Probe liest das alte öffentliche Repository '
    + '`DeepSeekCollaborationBoard`; der Erststart gegen das neue Hauptboard ist '
    + 'mit lokalen Bare-Repositories geprüft, nicht gegen GitHub.');
  zeilen.push('- **Probeprojekt und Katalog sind lokal, nicht veröffentlicht.** '
    + 'Sie liegen unter `/workspace/projekte/board-repos/`; es gab keinen Push.');
  zeilen.push('- **Ohne Token.** Die Live-Probe liest öffentlich und ohne '
    + 'Anmeldung; private Metadaten und Schreibwege bleiben ungeprüft.');
  zeilen.push('- **Die Prüfungen der neuen Form und die Suite schreiben nur '
    + 'unter `/tmp/board-scheibe1/`** und räumen dort selbst auf; die echten '
    + 'Repositories und `$DSH_HOME/board` werden nur gelesen.');
  return zeilen.join('\n');
}

function kopfText(ergebnis, befehl) {
  return [
    '# Abnahme — Board',
    '',
    '- **Datum:** ' + ergebnis.datum,
    '- **Befehl:** `' + befehl + '`',
    '- **Exit-Code:** ' + (ergebnis.bestanden ? '0' : '1'),
    '- **Entscheidende Zeile:** ' + ergebnis.entscheidendeZeile,
    '',
    'Der Lauf führt die Prüfungen der neuen Form, die Suite, die Live-Probe, die '
      + 'beiden echten Boards, das Register und die alte Ablage nacheinander aus '
      + 'und ordnet die sieben Wege ihren Prüfungen zu.',
    '',
  ].join('\n');
}

async function main() {
  const argumente = liesArgumente(process.argv.slice(2));
  const bericht = argumente.bericht ? resolve(argumente.bericht) : '';
  const datum = new Date().toISOString().slice(0, 10);
  const beginn = Date.now();
  const vorher = koepfe();
  const altVorher = altStand();
  const neue = neueForm();
  const suiteLauf = suite();
  const live = await liveProbe();
  const hauptboard = boardBild('Hauptboard', join(REPOS, 'board-hauptboard'), {
    schritte: 11,
    vorhaben: 0,
    luecken: 0,
    ausnahme: 'probeprojekt',
    hinweis: 'Vorgabe „0 Vorhaben“ durch Schritt 21 überholt: das Probeprojekt '
      + 'liegt öffentlich auf dem Hauptboard.',
  });
  const team = boardBild('Team', join(REPOS, 'board-team'), {
    schritte: 11,
    vorhaben: 4,
    luecken: 0,
    hinweis: 'vier private Vorhaben, elf Schritte, keine Lücke',
  });
  const registerStand = register();
  const altNachher = altStand();
  const nachher = koepfe();
  const unveraendert = JSON.stringify(vorher) === JSON.stringify(nachher)
    && altVorher.head === altNachher.head
    && altVorher.datenGeaendert === false
    && altNachher.datenGeaendert === false;
  const alt = {
    ...altNachher,
    ok: !altNachher.datenSeitSoll && !altNachher.datenGeaendert,
  };
  const wege = wegeErgebnis(neue, suiteLauf);
  const ergebnis = {
    datum,
    produkt: PRODUKT,
    neueForm: neue,
    suite: suiteLauf,
    live,
    boards: { eintraege: [hauptboard, team] },
    register: registerStand,
    alt,
    unveraendert,
    repoAnzahl: nachher.length,
    wege,
  };
  ergebnis.bestanden = neue.ok
    && suiteLauf.ok
    && hauptboard.ok
    && team.ok
    && registerStand.ok
    && alt.ok
    && unveraendert;
  ergebnis.dauer = Date.now() - beginn;
  ergebnis.entscheidendeZeile = entscheidendeZeile(ergebnis);

  const befehl = 'cd ' + PRODUKT + ' && node werkzeuge/abnahme.mjs'
    + (bericht ? ' --bericht ' + bericht : '');
  const text = kopfText(ergebnis, befehl) + '\n' + markdown(ergebnis);
  console.log(text);
  console.log('');
  console.log('```json');
  console.log(JSON.stringify(ergebnis, null, 2));
  console.log('```');

  if (bericht) {
    mkdirSync(dirname(bericht), { recursive: true });
    writeFileSync(bericht, text + '\n'
      + '\nDer vollständige Befund steht als JSON in der Ausgabe des Laufs.\n', 'utf8');
    console.log('ok Bericht: ' + bericht);
  }

  process.exitCode = ergebnis.bestanden ? 0 : 1;
}

try {
  await main();
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exitCode = 1;
}
