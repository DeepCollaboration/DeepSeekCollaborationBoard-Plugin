/**
 * Host-Hälfte des Board-Plugins.
 *
 * Routen:
 *   GET  /board/data          — Board mit abgeleiteten Feldern und dem Stand als JSON
 *   GET  /board/konfiguration — wer bin ich, wo liegt was { person, repo, remote, format }
 *   GET  /board/boards      — die Boards dieses Menschen und das offene
 *   POST /board/boards      — ein Board verbinden oder anlegen { name, adresse }
 *   POST /board/boards/wechsel — das offene Board wechseln { id }
 *   POST /board/boards/entfernen — aus der Liste nehmen { id }
 *   GET  /board/identitaet  — die eigene Identität { name, github, farbe }
 *   POST /board/identitaet  — die Identität setzen { name, github, farbe }
 *   POST /board/sync          — mit dem Remote abgleichen {} → { geholt, gegeben, lage }
 *   GET  /board/doc           — eine Datei ?vorhaben=<id>&datei=<name>
 *   POST /board/doc/schreiben — eine Datei speichern { vorhaben, datei, text, basis }
 *   POST /board/beitrag       — einen Beitrag anlegen { vorhaben, schritt, notiz, dateien }
 *   GET  /board/beitrag       — einen Beitrag lesen ?vorhaben=<id>&beitrag=<id>
 *   POST /board/beitrag/entscheiden — über einen Beitrag entscheiden { beitrag, art, teile? }
 *   GET  /board/dateien       — ?vorhaben=<id>&pfad=<pfad>, was in einem Ordner liegt
 *   GET  /board/datei         — ?vorhaben=<id>&pfad=<pfad>, eine Datei tief im Vorhaben
 *   POST /board/korrigieren   — Rechtschreibung korrigieren { text }
 *   POST /board/ueberarbeiten — einen Text nach einer Anweisung überarbeiten { text, anweisung }
 *   GET  /board/versionen     — ?vorhaben=<id>&datei=<name>, die Fassungen einer Datei
 *   GET  /board/version       — ?vorhaben=<id>&datei=<name>&hash=<id>, zwei Fassungen zum Vergleich
 *   GET  /board/verlauf       — ?vorhaben=<id>, die Schritte bis zur aktuellen Position
 *   POST /board/positions     — Position einfügen { schritt, x, y, nach? }
 *   POST /board/fremd/anstellen — einen fremden Schritt als Verweis in den eigenen Workflow stellen { ref, x?, y? }
 *   POST /board/fremd/entfernen — den Verweis samt seinen Positionen wieder herausnehmen { ref }
 *   POST /board/layout        — Anordnung der Fläche { modus: 'frei' | 'auto' }
 *   POST /board/einstellung   — eine Einstellung am Board { name, wert }
 *   POST /board/vorhaben      — Vorhaben anlegen { name }
 *   POST /board/vorhaben/aendern — Vorhaben umbenennen { id, name }
 *   POST /board/vorhaben/abzweigen — einen Zweig anlegen { id, station, ziel, name }
 *   POST /board/vorhaben/forken  — eine eigene Kopie eines Vorhabens anlegen { id, name? }
 *   GET  /board/skills        — die Anweisungen der Schritte aus der Ablage
 *   POST /board/skill/eintragen — eine Anweisung aus der Ablage an einer Station eintragen { schritt, skill }
 *   POST /board/skill/lauf    — Sitzung als Transkript zu einem Schritt festhalten
 *   GET  /board/transkript    — ?vorhaben=<id>&position=<id>, die Transkripte eines Schritts
 *   POST /board/gespraech/senden — Anweisung einsetzen, Sitzung anlegen (beim ersten Mal) und eine Nachricht schicken
 *   GET  /board/gespraech/stand  — ?vorhaben=<id>&position=<id>, das Gespräch eines Schritts
 *   POST /board/gespraech/stopp  — die Sitzung beenden und ihre Anweisung wegnehmen
 *   POST /board/werkstatt/senden — das Gespräch einer Station (ihr Skill entsteht darin)
 *   GET  /board/werkstatt/stand  — ?schritt=<id>, der Stand dieses Gesprächs
 *   POST /board/werkstatt/stopp  — den laufenden Zug abbrechen
 *   POST /board/werkstatt/verwerfen — die Sitzung ins Archiv legen
 *
 * Ein Vorhaben ist ein benannter Arbeitsgegenstand, der an genau einer
 * Position steht. Seine Dateien liegen in einem eigenen Ordner, damit zwei
 * Vorhaben im selben Workflow nicht dieselbe Datei überschreiben.
 *
 * Dateinamen: Ist am Schritt nichts eingetragen, gilt der Name als Vorgabe.
 * Bei „A → B" zählt B. Ein Schritt liest, was der Schritt davor erzeugt.
 * Nichts davon wird gespeichert — die Ableitung entsteht bei jedem Lesen neu.
 */
import {
  readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, existsSync, statSync,
  appendFileSync, copyFileSync, rmSync,
} from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import {
  FORMAT, liesFormat, pruefeFormat,
  liesAblage, schreibeAblage, liesBeitraege, schreibeBeitrag, schreibeEntscheid,
  liesPersonen,
} from './ablage.js';
import {
  HAUPTBOARD, ladeRegister, ladeIdentitaet, schreibeIdentitaet,
  verbindeBoard, entferneBoard, schreibeRegister,
} from './boards.js';

/**
 * Die Ablage und die eigene Person stehen in der Konfiguration des Plugins.
 * Sie liegt neben dem Modul: eine Kopie des Produkts liest ihre eigene
 * Konfiguration, nicht die des Originals. Fehlt sie, läuft das Plugin weiter
 * und sagt im Protokoll, dass keine Ablage da ist — es stürzt nicht ab.
 */
function liesKonfiguration() {
  const datei = new URL('./board.config.json', import.meta.url);
  try {
    const roh = JSON.parse(readFileSync(datei, 'utf8'));
    const person = String(roh && roh.person != null ? roh.person : '').trim();
    const repo = String(roh && roh.repo != null ? roh.repo : '').trim();
    if (!person || !repo) throw new Error('person oder repo fehlt');
    return { person, repo: resolve(repo) };
  } catch (fehler) {
    // Eine frische Installation hat keine Konfiguration — das ist kein Fehler.
    if (!fehler || fehler.code !== 'ENOENT') {
      console.warn('Board: keine Konfiguration gelesen (' + datei.pathname + '): '
        + String((fehler && fehler.message) || fehler));
    }
    return { person: '', repo: '' };
  }
}

const HOME = process.env.DSH_HOME || '/dsh-home';

/**
 * Identität und Board-Register liegen außerhalb des Produkts, in
 * `$DSH_HOME/board/`. Beim Start wird die alte Einzelkonfiguration
 * (`board.config.json`) einmal übernommen; danach zählt nur das Register.
 */
const REGISTER = ladeRegister(HOME, liesKonfiguration());
let IDENTITAET = ladeIdentitaet(HOME, REGISTER);
let AKTIV = REGISTER.boards.find((b) => b.id === REGISTER.aktiv) || null;
let PERSON_ID = AKTIV ? AKTIV.person : '';
let REPO = AKTIV ? AKTIV.repo : '';
let VORGANG_DIR = REPO ? join(REPO, 'vorgaenge') : '';
const ABLAGE_HOME = join(HOME, 'board');
const SKILL_DIR = HOME + '/skills';
const SESSION_DIR = HOME + '/sessions';
const MAX_KOERPER = 20000;
const MAX_INHALT = 4000;
// Die kräftigen Töne der Palette: sie tragen Titelzeile, Ports und Schnüre.
const PERSON_FARBEN = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6',
  '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#f43f5e',
];

/** Die eigene Person, so wie sie in ihrer Datei steht. */
function eigenePerson() {
  try {
    const person = JSON.parse(readFileSync(join(REPO, 'personen', PERSON_ID + '.json'), 'utf8'));
    if (person && person.id) return person;
  } catch {
    /* ohne Datei bleibt die Kennung */
  }
  return { id: PERSON_ID, name: '' };
}

/** Die Adresse im Urheber einer Fassung — nur aus dem Namen abgeleitet. */
function autorAdresse(name) {
  const kennung = String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return (kennung || 'person') + '@board';
}

/** Wer schreibt: die eigene Person mit ihrem Namen. */
function autorMensch() {
  const person = eigenePerson();
  const name = String(person.name || '').trim() || person.id || 'Unbekannt';
  return [name, autorAdresse(name)];
}

/** Ein Modelllauf in ihrem Auftrag: „Modell (<Name>)“. */
function autorModell() {
  const person = eigenePerson();
  const name = String(person.name || '').trim() || person.id || 'Unbekannt';
  return ['Modell (' + name + ')', autorAdresse(name)];
}

const WIE_ARTEN = new Set(['skill', 'skript', 'textfeld', 'chat', 'datei']);
const WEITER_ARTEN = new Set(['freigabe', 'automatisch']);

/**
 * Die Handlungen am Vorhaben. Über alle entscheidet heute dieselbe
 * Zugehörigkeit; getrennt sind sie schon, damit später eine einzelne Handlung
 * eine eigene Bedingung bekommen kann. `entscheiden` gilt für einen Beitrag,
 * der zu diesem Vorhaben gehört.
 */
const AKTIONEN = ['aendern', 'verschieben', 'weitergeben', 'zurueckschicken', 'entscheiden'];

/**
 * Rechtschreibung. Kein Umformulieren, kein Kürzen, kein Ton — was er
 * geschrieben hat, bleibt.
 */
const KORREKTUR = [
  'Du korrigierst ausschließlich Rechtschreibung, Zeichensetzung und offensichtliche',
  'Tippfehler in einem deutschen Text. Du änderst keine Wörter, keine Reihenfolge,',
  'keinen Ton und keine Aussage. Du kürzt nichts, ergänzt nichts und formulierst',
  'nicht um. Antworte nur mit dem korrigierten Text, ohne Anführungszeichen, ohne',
  'Kommentar.',
].join(' ');

/**
 * Überarbeiten: die Aussage bleibt seine, nur die Form ändert sich nach dem,
 * was er verlangt. Was der Auftrag nicht berührt, bleibt wörtlich stehen —
 * sonst wäre der Vorschlag ein neuer Text, den er nicht geschrieben hat.
 */
const UEBERARBEITUNG = [
  'Du überarbeitest einen deutschen Text nach einer Anweisung. Die Anweisung',
  'hat Vorrang: wenn sie Länge, Form, Reihenfolge oder Ton vorgibt, hältst du',
  'dich genau daran. Du antwortest ausschließlich mit dem vollständigen neuen',
  'Text — ohne Einleitung, ohne Erklärung, ohne Anführungszeichen und ohne',
  'Codeblock. Was die Anweisung nicht ändert, bleibt stehen. Du erfindest keine',
  'Inhalte, keine Beispiele und keine Zahlen dazu. Du schreibst klar und ohne',
  'Fachjargon.',
].join(' ');

function liesBoard() {
  if (!REPO) throw fehlerMit('Noch kein Board verbunden', 409);
  const board = liesAblage({ repo: REPO, person: PERSON_ID, home: HOME });
  // Was diese Person beim Lesen verantwortet, wird beim Speichern geschrieben;
  // ein fremdes Vorhaben wird nicht angefasst — auch nicht als Nebenwirkung
  // eines anderen Speicherns. Der Vermerk steht weder in der Datei noch in der
  // Antwort an die Seite.
  (board.vorgaenge || []).forEach((v) => {
    Object.defineProperty(v, 'schreibbar', {
      value: darf(v, 'aendern', PERSON_ID),
      enumerable: false,
    });
  });
  // Alte Vorhaben tragen ein einzelnes Gespräch; gelesen wird immer die Liste.
  (board.vorgaenge || []).forEach((v) => { gespraecheVon(v); });
  schritteVon(board);
  personenVon(board);
  kantenVon(board);
  return board;
}

/** Das Board, wenn noch keines verbunden ist: leer, aber vollständig. */
function leeresBoard() {
  return {
    workflow: { id: 'standard', titel: '', positionen: [], kanten: [], layout: 'auto' },
    schritte: [],
    workflows: [],
    vorgaenge: [],
    beitraege: [],
    personen: [],
    einstellungen: {},
    stand: { zeit: null, nur_lokal: 0, remote: null, lage: 'kein board' },
  };
}

/** Das offene Board wechseln: die Ablage, die Person und der Abgleich. */
function setzeAktiv(id) {
  const board = id ? REGISTER.boards.find((b) => b.id === id) || null : null;
  REGISTER.aktiv = board ? board.id : null;
  AKTIV = board;
  PERSON_ID = board ? board.person : '';
  REPO = board ? board.repo : '';
  VORGANG_DIR = REPO ? join(REPO, 'vorgaenge') : '';
  letzterAbgleich = null;
  letzterErfolg = false;
  letzterVersuch = 0;
  schreibeRegister(HOME, REGISTER);
}

/** Das Register in der Form, die die Seite für Wechsel und Liste braucht. */
function registerFuerSeite() {
  return {
    aktiv: REGISTER.aktiv,
    boards: REGISTER.boards.map((b) => ({
      id: b.id,
      name: b.name,
      art: b.art,
      remote: b.remote,
      person: b.person,
      aktiv: b.id === REGISTER.aktiv,
    })),
  };
}

/**
 * Wer ist am Board? Jeder Mensch hat einen Namen und eine Farbe; seine
 * Stationen tragen diese Farbe. Ein Board ohne Eintrag gehört dem, der es
 * benutzt — der Eintrag entsteht beim ersten Lesen.
 */
function personenVon(board) {
  if (!Array.isArray(board.personen) || !board.personen.length) {
    board.personen = [{ id: 'p1', name: '', farbe: PERSON_FARBEN[0], ich: true }];
  }
  board.personen.forEach((p, i) => {
    if (!p.id) p.id = 'p' + (i + 1);
    if (typeof p.name !== 'string') p.name = '';
    if (typeof p.farbe !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.farbe)) {
      p.farbe = PERSON_FARBEN[i % PERSON_FARBEN.length];
    }
    if (typeof p.ich !== 'boolean') p.ich = false;
  });
  if (!board.personen.some((p) => p.ich)) board.personen[0].ich = true;
  // Jede Station hat einen Host. Fehlt er, ist es der, der am Board ist. Ein
  // Verweis behält seinen Host: er gehört der Person, bei der das Ziel liegt,
  // auch wenn deren Datei hier (noch) fehlt.
  const ich = board.personen.find((p) => p.ich) || board.personen[0];
  (board.schritte || []).forEach((schritt) => {
    if (schritt.ref) return;
    if (!schritt.host || !board.personen.some((p) => p.id === schritt.host)) {
      schritt.host = ich.id;
    }
  });
  return board.personen;
}

/**
 * Die Verbindungen sind die Reihenfolge: eine Kante führt vom Ausgang eines
 * Schritts zum Eingang des nächsten. Alte Workflows hatten eine Liste — sie
 * wird beim ersten Lesen zu einer Kette. Jede Position trägt ihre Lage auf
 * der Fläche.
 */
function kantenVon(board) {
  if (!board.workflow || !Array.isArray(board.workflow.positionen)) return [];
  const liste = board.workflow.positionen;
  if (!Array.isArray(board.workflow.kanten)) {
    board.workflow.kanten = [];
    for (let i = 1; i < liste.length; i += 1) {
      board.workflow.kanten.push({ von: liste[i - 1].id, nach: liste[i].id });
    }
  }
  const ids = new Set(liste.map((p) => p.id));
  board.workflow.kanten = board.workflow.kanten.filter(
    (k) => k && ids.has(k.von) && ids.has(k.nach) && k.von !== k.nach,
  );
  liste.forEach((p, i) => {
    if (typeof p.x !== 'number' || !Number.isFinite(p.x)) p.x = 40 + i * 300;
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) p.y = 80;
  });
  return board.workflow.kanten;
}

/** Führt eine neue Kante zu einem Kreis? Dann wird sie nicht eingetragen. */
function kreist(von, nach, kanten) {
  const weiter = new Map();
  kanten.forEach((k) => {
    if (!weiter.has(k.von)) weiter.set(k.von, []);
    weiter.get(k.von).push(k.nach);
  });
  const stapel = [nach];
  const gesehen = new Set();
  while (stapel.length) {
    const id = stapel.pop();
    if (id === von) return true;
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    (weiter.get(id) || []).forEach((n) => stapel.push(n));
  }
  return false;
}

/**
 * Schritte sind eigene Dinge, nicht Eigenschaften einer Spalte: ein Schritt
 * kann an mehreren Stellen im Workflow stehen, und eine Änderung gilt überall.
 * Alte Workflows tragen den Schritt noch in der Position — er wandert beim
 * ersten Lesen in die Liste, die Position merkt sich nur seine Kennung.
 */
function schritteVon(board) {
  board.schritte = Array.isArray(board.schritte) ? board.schritte : [];
  const vorhanden = new Set(board.schritte.map((s) => s.id));
  const liste = (board.workflow && board.workflow.positionen) || [];
  liste.forEach((p) => {
    if (p.schritt && vorhanden.has(p.schritt)) {
      delete p.name; delete p.inhalt; delete p.wie; delete p.ausgabe; delete p.eingang;
      return;
    }
    const id = kennung(String(p.name || p.id || 'schritt'), vorhanden);
    const schritt = { id, name: String(p.name || p.id || 'Schritt') };
    if (p.inhalt) schritt.inhalt = p.inhalt;
    if (p.wie) schritt.wie = p.wie;
    if (Array.isArray(p.ausgabe) && p.ausgabe.length) schritt.ausgabe = p.ausgabe;
    board.schritte.push(schritt);
    vorhanden.add(id);
    p.schritt = id;
    delete p.name; delete p.inhalt; delete p.wie; delete p.ausgabe; delete p.eingang;
  });
  // „Wie: von Hand“ heißt seit dem Umbau „Aktion: Textfeld“.
  board.schritte.forEach((schritt) => {
    if (schritt.wie && schritt.wie.art === 'manuell') {
      schritt.wie = { art: 'textfeld', wert: '' };
    }
  });
  return board.schritte;
}

/**
 * Die Fassung der Ablage, so wie sie gerade dasteht. `null` heißt: sie lässt
 * sich nicht lesen. Die Seite bleibt dann benutzbar; schreiben kann sie ohnehin
 * nicht, weil die Prüfung vor jedem Schreiben denselben Fehler findet.
 */
function formatDerAblage() {
  if (!REPO) return null;
  try {
    return liesFormat(REPO);
  } catch {
    return null;
  }
}

/**
 * Die Prüfung vor jedem Schreiben: Das Programm kennt `FORMAT`; nennt die
 * Ablage eine andere Zahl, wird nichts geschrieben. Der Fehler trägt 409 und
 * den Text mit der Zahl der Ablage — die Route gibt ihn unverändert weiter.
 */
function pruefeFormatVorSchreiben() {
  if (!REPO) return;
  pruefeFormat(REPO);
}

/**
 * Schreibt den Stand je betroffener Datei: Personen, der eigene Workflow und
 * die Vorhaben. `board.json` kommt hier nicht mehr vor.
 */
function schreibeBoard(daten) {
  if (!REPO) throw fehlerMit('Noch kein Board verbunden', 409);
  try {
    schreibeAblage(daten, { repo: REPO, person: PERSON_ID, home: HOME });
  } catch (fehler) {
    // Die Formatprüfung trägt 409; sie soll nicht als allgemeiner Lesefehler
    // 500 werden, wenn eine Route sie doch einmal durchreicht.
    throw fehlerMit(String((fehler && fehler.message) || fehler),
      (fehler && fehler.status) || 500);
  }
}

/** Kurzes Protokoll der Modellaufrufe — nur, um Hänger später zu sehen. */
function protokolliere(text, stufe, ms, lage, fehler) {
  try {
    const zeile = [
      new Date().toISOString(),
      'zeichen=' + text.length,
      'stufe=' + (stufe || 'vorgabe'),
      'ms=' + ms,
      'lage=' + lage,
      fehler ? 'fehler=' + fehler.slice(0, 300) : '',
    ].filter(Boolean).join(' ');
    appendFileSync('/tmp/board-korrektur.log', zeile + '\n', 'utf8');
  } catch {
    /* Protokoll ist Beiwerk */
  }
}

/**
 * Die Versionierung: ein lokales Git-Repository, die Ablage. Jede Änderung
 * wird festgehalten, mit dem, der sie gemacht hat — er über das Board, das
 * Modell über seine Läufe. Nichts verlässt den Rechner.
 */
function git(args, autor, grenzeMs) {
  if (!REPO) return { ok: false, out: '', fehler: 'Keine Ablage konfiguriert' };
  const satz = [
    '-C', REPO,
    ...(autor ? ['-c', 'user.name=' + autor[0], '-c', 'user.email=' + autor[1]] : []),
    ...args,
  ];
  const ssh = join(HOME, '.ssh', 'config');
  try {
    const lauf = spawnSync('git', satz, {
      encoding: 'utf8',
      timeout: grenzeMs || 20000,
      // Der Host kann nicht antworten: lieber scheitern als auf eine Eingabe
      // warten, die niemand sieht. Ein eigener SSH-Zugang liegt in
      // `$DSH_HOME/.ssh/config`; ohne ihn gilt der des Systems.
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        ...(existsSync(ssh) ? { GIT_SSH_COMMAND: 'ssh -F ' + ssh } : {}),
      },
    });
    return {
      ok: lauf.status === 0,
      out: String(lauf.stdout || ''),
      fehler: String(lauf.stderr || ''),
    };
  } catch (fehler) {
    return { ok: false, out: '', fehler: String((fehler && fehler.message) || fehler) };
  }
}

/** Hält den Stand fest, wenn sich etwas geändert hat — nie einen leeren Commit. */
function festhalten(nachricht, autor) {
  // Auch das Festschreiben ist ein Schreiben: Verlangt die Ablage eine andere
  // Fassung, entsteht keine Fassung. Der Zeitgeber für Änderungen außerhalb des
  // Boards läuft dadurch leer, statt gegen die Ablage zu schreiben.
  try {
    pruefeFormatVorSchreiben();
  } catch {
    return false;
  }
  const lage = git(['status', '--porcelain']);
  if (!lage.ok || !lage.out.trim()) return false;
  git(['add', '-A']);
  const c = git(['commit', '-m', nachricht], autor);
  if (!c.ok) {
    try {
      appendFileSync('/tmp/board-git.log',
        new Date().toISOString() + ' ' + nachricht + ' ' + c.fehler.trim() + '\n', 'utf8');
    } catch { /* Protokoll ist Beiwerk */ }
  } else {
    // Nach dem Schreiben weitergeben. Scheitert es, bleibt die Fassung lokal
    // liegen; der nächste Abgleich holt sie nach.
    gibWeiter();
  }
  return c.ok;
}

/* --- Der Abgleich mit dem Remote ---------------------------------------
 *
 * Die Ablage ist ein Git-Repository; `origin` steht in `.git/config` oder
 * eben nicht. Ohne Remote wird nichts versucht und die Seite sagt „kein
 * remote“. Der Zeitpunkt des letzten erfolgreichen Abgleichs lebt im
 * Speicher: nach einem Neustart ist er null, bis wieder abgeglichen wurde.
 */

const ABGLEICH_BREMSE_MS = 60 * 1000;
const NETZ_MS = 10000;
let letzterAbgleich = null;
let letzterErfolg = false;
let letzterVersuch = 0;

/** Die Adresse von `origin` oder `null`, wenn es keinen gibt. */
function remoteAdresse() {
  const r = git(['remote', 'get-url', 'origin']);
  const adresse = r.ok ? r.out.trim() : '';
  return adresse || null;
}

/** Der Zweig, auf dem die Ablage liegt. Ohne Namen gilt `main`. */
function zweigName() {
  const r = git(['symbolic-ref', '--short', 'HEAD']);
  const name = r.ok ? r.out.trim() : '';
  return name || 'main';
}

/** Wie viele Fassungen im Remote noch fehlen. Ohne Remote: keine Zählung. */
function nurLokal() {
  const r = git(['rev-list', '--count', 'origin/' + zweigName() + '..HEAD']);
  if (!r.ok) return 0;
  const zahl = Number(r.out.trim());
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

/** Der Stand, den die Seite in der Kopfzeile zeigt. */
function standWert() {
  const remote = remoteAdresse();
  if (!remote) {
    return { zeit: letzterAbgleich, nur_lokal: 0, remote: null, lage: 'kein remote' };
  }
  const offen = nurLokal();
  return {
    zeit: letzterAbgleich,
    nur_lokal: offen,
    remote,
    lage: letzterErfolg && offen === 0 ? 'abgeglichen' : 'nicht abgeglichen',
  };
}

/**
 * Ein Abgleich: holen, die eigenen Fassungen darauf legen, weitergeben.
 * Scheitert etwas, bleibt der lokale Stand stehen und der nächste Versuch
 * holt es nach. Der Aufruf wirft nicht.
 */
function abgleichen() {
  const remote = remoteAdresse();
  if (!remote) {
    letzterErfolg = false;
    return { geholt: false, gegeben: false, lage: 'kein remote' };
  }
  letzterVersuch = Date.now();
  const zweig = zweigName();
  const autor = autorMensch();

  const fetch = git(['fetch', '--prune', 'origin'], autor, NETZ_MS);
  if (!fetch.ok) {
    letzterErfolg = false;
    return { geholt: false, gegeben: false, lage: 'nicht abgeglichen' };
  }

  // Beim ersten Mal gibt es den fremden Zweig noch nicht: dann ist nichts
  // zu holen, und der eigene Stand wird gleich geschrieben.
  let geholt = true;
  if (git(['rev-parse', '--verify', '--quiet', 'origin/' + zweig]).ok) {
    const pull = git(['pull', '--rebase', 'origin', zweig], autor, NETZ_MS);
    geholt = pull.ok;
    if (!pull.ok) {
      // Kein halber Rebase bleibt liegen: der lokale Stand gilt weiter.
      git(['rebase', '--abort']);
      letzterErfolg = false;
      return { geholt: false, gegeben: false, lage: 'nicht abgeglichen' };
    }
  }

  const push = git(['push', 'origin', zweig], autor, NETZ_MS);
  if (!push.ok) {
    letzterErfolg = false;
    return { geholt, gegeben: false, lage: 'nicht abgeglichen' };
  }

  letzterAbgleich = new Date().toISOString();
  letzterErfolg = true;
  return { geholt, gegeben: true, lage: 'abgeglichen' };
}

/**
 * Den eigenen Stand weitergeben, ohne zu werfen. Wird nach jeder Speicherung
 * versucht; scheitert es, bleibt der Commit lokal und `nur_lokal` zählt ihn.
 */
function gibWeiter() {
  if (!REPO || !remoteAdresse()) return false;
  const push = git(['push', 'origin', zweigName()], autorMensch(), NETZ_MS);
  if (!push.ok) {
    try {
      appendFileSync('/tmp/board-git.log',
        new Date().toISOString() + ' weitergeben: ' + push.fehler.trim() + '\n', 'utf8');
    } catch { /* Protokoll ist Beiwerk */ }
  }
  return push.ok;
}

/**
 * Vor dem Lesen: höchstens einmal je Minute abgleichen. Die Seite fragt oft;
 * ohne Bremse ginge fast jede Anfrage ins Netz. Ein Fehler blockiert die
 * Antwort nicht und lässt den lokalen Stand stehen.
 */
function abgleichVorDemLesen() {
  if (!REPO) return;
  if (!remoteAdresse()) return;
  if (Date.now() - letzterVersuch < ABGLEICH_BREMSE_MS) return;
  try {
    abgleichen();
  } catch (fehler) {
    letzterErfolg = false;
    try {
      appendFileSync('/tmp/board-git.log',
        new Date().toISOString() + ' Abgleich: '
        + String((fehler && fehler.message) || fehler) + '\n', 'utf8');
    } catch { /* Protokoll ist Beiwerk */ }
  }
}

function fehlerMit(nachricht, status) {
  const fehler = new Error(nachricht);
  fehler.status = status;
  return fehler;
}

/**
 * Die einzige Stelle, an der das Board ein Modell bemüht. `stufen` ist die
 * Reihenfolge der Denkstufen, die für die Aufgabe reicht: die erste, die das
 * Modell kennt, wird genommen. Ohne passende Angabe gilt die Vorgabe des
 * Anbieters, und die kann lang sein.
 */
async function modellText(ctx, { system, nachricht, stufen, temperatur, maxTokens, grenzeMs, art }) {
  const llm = ctx.get('llm');
  const modell = ctx.get('agentDefaultModel');
  if (!llm || !modell) throw fehlerMit('Kein Modell im Host', 503);
  const wahl = modell.currentSelection();
  if (!wahl || !wahl.provider || !wahl.model) throw fehlerMit('Kein Modell gewählt', 503);

  let stufe;
  try {
    const info = await llm.resolveModelInfo(wahl.provider, wahl.model);
    const da = ((info && info.reasoning && info.reasoning.efforts) || []).map((e) => e.id);
    stufe = (stufen || []).find((s) => da.includes(s));
  } catch { /* ohne Angabe */ }

  const grenze = AbortSignal.timeout(grenzeMs);
  const beginn = Date.now();
  protokolliere(nachricht, stufe, 0, art + '/start', '');
  let ergebnis = '';
  let ende = '';
  try {
    for await (const stueck of llm.stream({
      provider: wahl.provider,
      model: wahl.model,
      ...(stufe ? { reasoningEffort: stufe } : {}),
      system,
      ...(temperatur === undefined ? {} : { temperature: temperatur }),
      maxTokens,
      signal: grenze,
      messages: [{ role: 'user', content: [{ type: 'text', text: nachricht }] }],
    })) {
      if (stueck.type === 'text-delta') ergebnis += stueck.text;
      if (stueck.type === 'finish' && stueck.reason) {
        ende = stueck.reason.kind || 'unbekannt';
        if (stueck.reason.kind === 'error') {
          throw new Error((stueck.reason.failure && stueck.reason.failure.message) || 'Modellfehler');
        }
        if (stueck.reason.kind === 'aborted') throw new Error('abgebrochen');
      }
    }
  } catch (fehler) {
    const roh = String((fehler && fehler.message) || fehler);
    protokolliere(nachricht, stufe, Date.now() - beginn, art + '/fehler', roh);
    throw fehlerMit(grenze.aborted ? 'Zeitüberschreitung' : roh, grenze.aborted ? 504 : 500);
  }

  const sauber = ergebnis.trim();
  protokolliere(nachricht, stufe, Date.now() - beginn, art + '/' + (sauber ? 'ok' : 'leer'),
    sauber ? '' : 'ende=' + ende);
  if (!sauber) throw fehlerMit('Leere Antwort', 502);
  return sauber;
}

function sende(res, status, wert) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(wert));
}

function slug(text) {
  return String(text).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function kennung(text, vorhandene) {
  const basis = slug(text) || 'eintrag';
  if (!vorhandene.has(basis)) return basis;
  let nummer = 2;
  while (vorhandene.has(basis + '-' + nummer)) nummer += 1;
  return basis + '-' + nummer;
}

/**
 * Macht aus einer Eingabe einen sicheren Dateinamen: keine Pfade, keine
 * Sonderzeichen, und ohne Endung wird .md ergänzt. Ein Schrägstrich am Ende
 * kennzeichnet einen Ordner — der behält ihn, damit ein Ausgang wie
 * `produkt/` nicht zu einer Datei `produkt.md` wird. Leer heißt ungültig.
 */
function dateiName(text) {
  const ganz = String(text == null ? '' : text).trim();
  const ordner = /[\\/]$/.test(ganz);
  const roh = ganz.split(/[\\/]/).filter(Boolean).pop() || '';
  let sauber = roh.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '').replace(/[-.]+$/, '');
  if (!sauber) return '';
  if (!ordner && (!/\.[A-Za-z0-9]+$/.test(sauber) || sauber.endsWith('.'))) sauber += '.md';
  if (sauber.length > 120) return '';
  return ordner ? sauber + '/' : sauber;
}

/** Nimmt eine Liste oder einen Text mit Komma, Semikolon oder Zeilenumbruch. */
function listeDateien(wert) {
  const teile = Array.isArray(wert)
    ? wert
    : String(wert == null ? '' : wert).split(/[,;\n]/);
  const gesehen = new Set();
  const ergebnis = [];
  for (const teil of teile) {
    const name = dateiName(teil);
    if (name && !gesehen.has(name)) {
      gesehen.add(name);
      ergebnis.push(name);
    }
  }
  return ergebnis;
}

function leseWie(wert) {
  const roh = wert && typeof wert === 'object' ? String(wert.art || '') : '';
  // Alte Stationen sagten „manuell“ — gemeint war das Textfeld.
  const art = WIE_ARTEN.has(roh) ? roh : (roh === 'manuell' ? 'textfeld' : 'textfeld');
  if (art === 'textfeld' || art === 'chat' || art === 'datei') return { art, wert: '' };
  const name = String((wert && wert.wert) == null ? '' : wert.wert).trim().slice(0, 200);
  return name ? { art, wert: name } : { art: 'textfeld', wert: '' };
}

/**
 * Der Vorgabename einer Ausgabe folgt dem Namen des Schritts.
 * Bei „A → B" zählt B — der Pfeil trennt, was hineingeht, von dem,
 * was herauskommt. Bei einem Namen ohne Pfeil zählt der ganze Name.
 */
function vorgabeDatei(name) {
  const teile = String(name == null ? '' : name).split(/→|->|=>/);
  const ziel = teile.length > 1 ? teile[teile.length - 1] : name;
  return (slug(ziel) || slug(name) || 'position') + '.md';
}

/**
 * Ergänzt jede Position um die tatsächlich geltenden Dateien und die
 * tatsächlich geltende Ausführungsart. Eingetragenes steht vor Ableitung.
 * Der Eingang ist, was der Schritt davor erzeugt.
 */
function mitAbleitung(board) {
  const schritte = new Map((board.schritte || []).map((s) => [s.id, s]));
  const liste = (board.workflow && board.workflow.positionen) || [];
  const kanten = (board.workflow && board.workflow.kanten) || [];

  const vorgaengerVon = new Map();
  const nachfolgerVon = new Map();
  kanten.forEach((k) => {
    if (!vorgaengerVon.has(k.nach)) vorgaengerVon.set(k.nach, []);
    vorgaengerVon.get(k.nach).push(k.von);
    if (!nachfolgerVon.has(k.von)) nachfolgerVon.set(k.von, []);
    nachfolgerVon.get(k.von).push(k.nach);
  });

  // Erst die Ausgänge, dann die Eingänge: der Eingang ist, was die Vorgänger
  // erzeugen. Bei mehreren Vorgängern ist es die Summe ihrer Ausgänge.
  const ausgabeVon = new Map();
  const basis = liste.map((p) => {
    const schritt = schritte.get(p.schritt) || { id: '', name: 'Schritt' };
    const eigeneAusgabe = listeDateien(schritt.ausgabe);
    const ausgabe = eigeneAusgabe.length ? eigeneAusgabe : [vorgabeDatei(schritt.name)];
    ausgabeVon.set(p.id, ausgabe);
    return { p, schritt, ausgabe, eigeneAusgabe, wie: leseWie(schritt.wie) };
  });

  const positionen = basis.map(({ p, schritt, ausgabe, eigeneAusgabe, wie }) => {
    const von = vorgaengerVon.get(p.id) || [];
    return {
      ...p,
      name: schritt.name,
      schritt: schritt.id || '',
      fehlt: schritt.fehlt === true,
      abgeleitet: {
        eingang: von.reduce((alle, id) => alle.concat(ausgabeVon.get(id) || []), []),
        ausgabe,
        eingangEigener: false,
        ausgabeEigene: eigeneAusgabe.length > 0,
        wie,
        vorgaenger: von.slice(),
        nachfolger: (nachfolgerVon.get(p.id) || []).slice(),
      },
    };
  });
  return { ...board, workflow: { ...(board.workflow || {}), positionen } };
}

function ordnerVon(vorgang) {
  const ordner = String((vorgang && vorgang.ordner) || '');
  if (!VORGANG_DIR || !ordner || !/^[a-z0-9][a-z0-9-]*$/.test(ordner)) return '';
  return join(VORGANG_DIR, ordner);
}

/**
 * Was an einer Stelle liegt: der Text einer Datei oder — bei einem Namen mit
 * Schrägstrich am Ende — der Ordner mit der Zahl seiner Einträge. Ein Ordner
 * ist ein Ergebnis wie eine Datei; sein Inhalt steht erst fest, wenn er da ist.
 */
function dateiInhalt(ordner, name) {
  if (String(name).endsWith('/')) {
    const pfad = join(ordner, String(name).slice(0, -1));
    try {
      return {
        name, art: 'ordner', exists: true, anzahl: readdirSync(pfad).length,
      };
    } catch {
      return { name, art: 'ordner', exists: false, anzahl: 0 };
    }
  }
  try {
    return { name, exists: true, text: readFileSync(join(ordner, name), 'utf8') };
  } catch {
    return { name, exists: false, text: '' };
  }
}

/**
 * Die Fassung, die diese Datei zuletzt geändert hat: der Commit, der sie
 * zuletzt berührt hat. `null` heißt: die Datei ist noch nicht gefasst — sie
 * liegt unversioniert da oder gibt es noch nicht. Ein Commit anderswo im
 * Repository ändert die Basis nicht; nur eine Änderung an dieser Datei tut es.
 */
function dateiBasis(ordner, name) {
  if (!REPO || !ordner || String(name).endsWith('/')) return null;
  const pfad = relative(REPO, join(ordner, name)).split(sep).join('/');
  if (!pfad || pfad.startsWith('../')) return null;
  const log = git(['log', '-1', '--format=%H', '--', pfad]);
  const hash = log.ok ? log.out.trim() : '';
  return /^[0-9a-f]{40}$/.test(hash) ? hash : null;
}

/**
 * Ist die Datei seit dieser Fassung unverändert? Ein Beitrag trägt die Fassung,
 * auf der er aufsitzt; sie muss nicht die letzte sein, die diese eine Datei
 * geändert hat. Geändert werden darf nichts.
 */
function dateiUnveraendertSeit(ordner, name, basis) {
  if (!REPO || !ordner || String(name).endsWith('/')) return false;
  if (!/^[0-9a-f]{7,40}$/.test(String(basis || ''))) return false;
  const pfad = relative(REPO, join(ordner, name)).split(sep).join('/');
  if (!pfad || pfad.startsWith('../')) return false;
  return git(['diff', '--quiet', String(basis), '--', pfad]).ok;
}

/**
 * Ein Pfad innerhalb des Vorhaben-Ordners. Leer ist der Ordner selbst.
 * `null` heißt: der Pfad führt woandershin oder ist unsauber.
 */
function pfadImOrdner(ordner, pfad) {
  const teile = String(pfad == null ? '' : pfad).split('/').filter((t) => t !== '');
  if (teile.some((t) => t === '.' || t === '..' || /[\0\\]/.test(t))) return null;
  const ziel = resolve(ordner, ...teile);
  if (ziel !== ordner && !ziel.startsWith(ordner + sep)) return null;
  return ziel;
}

/**
 * Kopiert einen Ordner samt Inhalt. Grenzen, damit ein Zweig nicht das halbe
 * Laufwerk mitnimmt: nicht mehr als 4000 Dateien und 200 MB. `auslassen` nennt
 * Namen auf der obersten Ebene, die nicht mitkommen — beim Fork sind das die
 * Transkripte: die Läufe bleiben beim Ursprung.
 */
function kopiereOrdner(von, nach, masse, auslassen) {
  const zaehler = masse || { dateien: 0, bytes: 0, voll: false };
  let eintraege;
  try {
    eintraege = readdirSync(von, { withFileTypes: true });
  } catch {
    return zaehler;
  }
  mkdirSync(nach, { recursive: true });
  for (const e of eintraege) {
    if (zaehler.voll) return zaehler;
    if (e.name === '.git') continue;
    if (auslassen && auslassen.has(e.name)) continue;
    const quelle = join(von, e.name);
    const ziel = join(nach, e.name);
    if (e.isDirectory()) {
      kopiereOrdner(quelle, ziel, zaehler);
      continue;
    }
    if (!e.isFile()) continue;
    try {
      const groesse = statSync(quelle).size;
      if (zaehler.dateien >= 4000 || zaehler.bytes + groesse > 200 * 1024 * 1024) {
        zaehler.voll = true;
        return zaehler;
      }
      copyFileSync(quelle, ziel);
      zaehler.dateien += 1;
      zaehler.bytes += groesse;
    } catch {
      /* was sich nicht kopieren lässt, bleibt liegen */
    }
  }
  return zaehler;
}

/**
 * Die Stationen von einem Anfang bis zu dieser Position: sie selbst und alles,
 * was über die Schnüre hineinführt. Das ist der Stand, von dem ein Zweig
 * abgeht — weiter zurück liegt mehr, weiter vorn noch nichts.
 */
function stationenBis(positionen, ziel) {
  const nach = new Map(positionen.map((p) => [p.id, p]));
  const gesehen = new Set();
  const offen = [ziel];
  while (offen.length) {
    const id = offen.pop();
    if (!id || gesehen.has(id) || !nach.has(id)) continue;
    gesehen.add(id);
    ((nach.get(id).abgeleitet || {}).vorgaenger || []).forEach((v) => offen.push(v));
  }
  return positionen.filter((p) => gesehen.has(p.id));
}

/** Die Schritte von Anfang bis zur Position des Vorhabens, mit ihren Dateien. */
function verlaufVon(board, vorgang) {
  const positionen = board.workflow.positionen;
  const ordner = ordnerVon(vorgang);
  const laeufe = Array.isArray(vorgang.laeufe) ? vorgang.laeufe : [];
  return positionen.map((p) => ({
    positionId: p.id,
    name: p.name,
    aktuell: p.id === vorgang.position,
    dateien: ordner
      ? (p.abgeleitet.ausgabe || []).map((name) => dateiInhalt(ordner, name))
      : (p.abgeleitet.ausgabe || []).map((name) => ({ name, exists: false, text: '' })),
    transkripte: ordner
      ? laeufe
        .filter((l) => l && l.position === p.id)
        .filter((l) => /^transkripte\/[a-z0-9-]+\.md$/.test(String(l.datei || '')))
        .filter((l) => existsSync(join(ordner, l.datei)))
        .map((l) => ({ datei: l.datei, datum: l.datum, sitzung: l.sitzung }))
      : [],
  }));
}

function kopfFeld(kopf, feld) {
  const m = kopf.match(new RegExp('^' + feld + ':\\s*(.+)$', 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Die Kennung, unter der ein Schritt seine Anweisung trägt: sein Host und seine
 * eigene Kennung. Bei einem Verweis zählt das Ziel — Host und Schritt aus dem
 * Verweis, nicht die lokale Kennung, unter der er in dieser Fläche steht. Sonst
 * hieße der Lauf eines Verweises nach einem Namensstreit der eigenen Fläche.
 * Was keinen sicheren Ordnernamen ergibt, gilt als nicht vorhanden.
 */
function schrittKennung(schritt) {
  const sicher = (wert) => /^[a-z0-9][a-z0-9._-]*$/.test(wert) && !wert.includes('..');
  const ref = String((schritt && schritt.ref) || '');
  const teile = ref.split('/');
  if (teile.length === 3) {
    const host = String((schritt && schritt.host) || teile[0]);
    const id = teile[2];
    if (sicher(host) && sicher(id)) return { host, schritt: id };
  }
  const host = String((schritt && schritt.host) || '');
  const id = String((schritt && schritt.id) || '');
  return sicher(host) && sicher(id) ? { host, schritt: id } : null;
}

/**
 * Die Anweisung eines Schritts liegt in der Ablage: `skills/<host>/<schritt>.md`.
 * Der Name, unter dem sie beim Lauf im Harness steht, ist `<host>-<schritt>`.
 * Alte Stände trugen im Feld `skill` noch den Namen einer global installierten
 * Anweisung; dann gilt der Ort nach dieser Regel.
 */
function schrittSkillPfad(schritt) {
  const pfad = String((schritt && schritt.skill) || '');
  if (/^skills\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.md$/.test(pfad)) return pfad;
  const kennung = schrittKennung(schritt);
  return kennung ? 'skills/' + kennung.host + '/' + kennung.schritt + '.md' : '';
}

/** Der Name des Laufs: sein Host und die Kennung des Schritts. */
function laufNameVon(schritt) {
  const kennung = schrittKennung(schritt);
  return kennung ? kennung.host + '-' + kennung.schritt : '';
}

/**
 * Die Schritte mit ihrer Anweisung, so wie sie in der Ablage liegen. Gezeigt
 * werden die Schritte, nicht die Ordner unter `$DSH_HOME/skills` — dort liegt
 * nur, was gerade für einen Lauf eingesetzt ist.
 */
function leseSchrittSkills(board) {
  const eintraege = [];
  const gesehen = new Set();
  for (const flaeche of Array.isArray(board && board.workflows) ? board.workflows : []) {
    for (const workflow of Array.isArray(flaeche.workflows) ? flaeche.workflows : []) {
      for (const schritt of Array.isArray(workflow.schritte) ? workflow.schritte : []) {
        if (!schritt || !schritt.id || schritt.fehlt) continue;
        const pfad = schrittSkillPfad(schritt);
        const name = laufNameVon(schritt);
        if (!pfad || !name || gesehen.has(name)) continue;
        let text;
        try {
          text = readFileSync(join(REPO, pfad), 'utf8');
        } catch {
          continue;
        }
        gesehen.add(name);
        const kopf = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
        eintraege.push({
          name,
          schritt: String(schritt.id),
          titel: String(schritt.name || ''),
          beschreibung: kopfFeld(kopf, 'description'),
          whenToUse: kopfFeld(kopf, 'whenToUse'),
          datei: pfad,
          entwurf: /^entwurf/i.test(kopfFeld(kopf, 'description')),
        });
      }
    }
  }
  return eintraege;
}

/** Die Anweisung an einer Stelle des eigenen Workflows, wenn es sie gibt. */
function schrittAnweisung(board, positionId) {
  const stelle = (mitAbleitung(board).workflow.positionen || [])
    .find((p) => p.id === String(positionId || ''));
  if (!stelle) return null;
  const schritt = (board.schritte || []).find((s) => s.id === stelle.schritt);
  if (!schritt) return null;
  const pfad = schrittSkillPfad(schritt);
  const name = laufNameVon(schritt);
  if (!pfad || !name) return null;
  const datei = join(REPO, pfad);
  if (!existsSync(datei)) return null;
  return { name, pfad, datei, schritt };
}

/**
 * Ein Verweis `<person>/<workflow>/<schritt>`: das Ziel in der Fläche seiner
 * Person. Nur ein wirklicher Schritt lässt sich anstellen — kein eigener, kein
 * anderer Verweis und kein Ziel, das fehlt. Gelesen wird die fremde Datei;
 * geschrieben wird sie nie.
 */
function zielVonRef(board, ref) {
  const teile = String(ref == null ? '' : ref).trim().split('/');
  if (teile.length !== 3 || teile.some((teil) => !teil)) return null;
  const [person, workflowId, schrittId] = teile;
  if (person === PERSON_ID) return null;
  const flaeche = (board.workflows || []).find((p) => p && p.id === person);
  const workflow = flaeche && (flaeche.workflows || [])
    .find((w) => w && w.id === workflowId);
  const schritt = workflow && (workflow.schritte || [])
    .find((s) => s && s.id === schrittId);
  if (!schritt || schritt.fehlt === true || typeof schritt.ref === 'string') return null;
  // Fremd heißt: sein Host ist nicht die eigene Person. Ein eigener Schritt in
  // einer fremden Datei lässt sich ebenso wenig als Verweis anstellen.
  if (String(schritt.host || person) === String(PERSON_ID)) return null;
  return { ref: [person, workflowId, schrittId].join('/'), person, workflow, schritt };
}

/**
 * Die Kennung, unter der ein Verweis in der eigenen Fläche erscheint. Sie wird
 * beim Anstellen in die eigene Datei geschrieben, damit die Positionen gültig
 * bleiben, auch wenn das Ziel später verschwindet.
 */
function refKennung(board, ref, zielId) {
  const belegt = new Set((board.schritte || [])
    .filter((s) => s && s.id)
    .map((s) => String(s.id)));
  return belegt.has(String(zielId)) ? 'ref:' + ref : String(zielId);
}

/** Setzt den Namen in die Kopfzeile — der Harness findet den Skill so. */
function mitSkillNamen(text, name) {
  const roh = String(text == null ? '' : text);
  const treffer = roh.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!treffer) {
    return '---\nname: ' + name + '\ndescription: ' + name
      + '\nwhenToUse: Wenn ein Vorhaben an diesem Schritt steht.\n---\n\n' + roh;
  }
  let kopf = treffer[1];
  if (/^name:\s*.*$/m.test(kopf)) {
    kopf = kopf.replace(/^name:\s*.*$/m, 'name: ' + name);
  } else {
    kopf = 'name: ' + name + '\n' + kopf;
  }
  return roh.replace(treffer[0], '---\n' + kopf + '\n---');
}

/**
 * Legt die Anweisung unter ihrem Laufnamen ab. Sie bleibt dort, solange die
 * Sitzung läuft; ein Rest aus einem früheren Lauf am selben Schritt wird dabei
 * ersetzt.
 */
function setzeSchrittSkillEin(eintrag) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(eintrag.name)) {
    throw fehlerMit('Der Laufname taugt nicht als Ordnername: ' + eintrag.name, 400);
  }
  const text = readFileSync(eintrag.datei, 'utf8');
  const inhalt = mitSkillNamen(text, eintrag.name);
  const ordner = join(SKILL_DIR, eintrag.name);
  rmSync(ordner, { recursive: true, force: true });
  mkdirSync(ordner, { recursive: true });
  try {
    writeFileSync(join(ordner, 'SKILL.md'), inhalt, 'utf8');
  } catch (fehler) {
    rmSync(ordner, { recursive: true, force: true });
    throw fehler;
  }
  return eintrag.name;
}

/**
 * Nimmt den Einsatz wieder weg; `$DSH_HOME/skills` selbst bleibt stehen.
 * Entfernt wird nur ein unmittelbarer Ordner unter `$DSH_HOME/skills` — der
 * gemerkte Name kommt aus der eigenen Ablage, trotzdem wird er geprüft.
 */
function nehmeSchrittSkillWeg(name) {
  const kennung = String(name == null ? '' : name);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(kennung)) return;
  try {
    rmSync(join(SKILL_DIR, kennung), { recursive: true, force: true });
  } catch {
    /* mehr als liegen bleiben kann nicht passieren */
  }
}

/* --- Transkripte --------------------------------------------------------
 *
 * Der Verlauf einer Sitzung liegt im Harness unter sessions/. Daraus wird ein
 * Transkript: nur, was gesagt wurde — Fragen und Antworten, ohne Werkzeuge,
 * ohne Recherche. Welche Sitzung zu welchem Schritt gehört, wird nicht geraten:
 * der Skill trägt seine Sitzung am Ende selbst ein (POST /board/skill/lauf).
 */

function zeitStempel() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

/**
 * Der Anfang eines Transkript-Dateinamens: die Kennung der Position, soweit sie
 * in einen Dateinamen passt. Die Kennung eines Verweises trägt bei einem
 * Namensstreit Doppelpunkt und Schrägstriche; die Datei liegt trotzdem flach
 * unter `transkripte/`.
 */
function transkriptStamm(positionId) {
  const roh = String(positionId || '').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return roh || 'schritt';
}

function sitzungsDateien() {
  const ergebnis = [];
  let gruppen = [];
  try {
    gruppen = readdirSync(SESSION_DIR, { withFileTypes: true });
  } catch {
    return ergebnis;
  }
  for (const gruppe of gruppen) {
    if (!gruppe.isDirectory()) continue;
    const ordner = join(SESSION_DIR, gruppe.name);
    let sitzungen = [];
    try {
      sitzungen = readdirSync(ordner, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sitzung of sitzungen) {
      if (!sitzung.isDirectory() || !/^session-[a-z0-9-]+$/.test(sitzung.name)) continue;
      const innen = join(ordner, sitzung.name);
      let dateien = [];
      try {
        dateien = readdirSync(innen).filter((n) => /^session\.v\d+\.jsonl\.zstd$/.test(n));
      } catch {
        continue;
      }
      for (const datei of dateien) {
        const pfad = join(innen, datei);
        try {
          ergebnis.push({ id: sitzung.name, pfad, mtime: statSync(pfad).mtimeMs });
        } catch {
          /* nichts */
        }
      }
    }
  }
  ergebnis.sort((a, b) => b.mtime - a.mtime);
  return ergebnis;
}

function leseEreignisse(pfad) {
  const roh = zstdDecompressSync(readFileSync(pfad));
  return roh.toString('utf8').split('\n')
    .filter((z) => z.trim())
    .map((z) => { try { return JSON.parse(z); } catch { return null; } })
    .filter(Boolean);
}

function skillVon(ereignis) {
  if (!ereignis || ereignis.type !== 'tool/call') return '';
  const d = ereignis.data || {};
  if (d.name !== 'skill') return '';
  try {
    return String(JSON.parse(d.arguments).name || '');
  } catch {
    return '';
  }
}

function textVon(ereignis) {
  if (!ereignis) return '';
  const d = ereignis.data || {};
  if (ereignis.type === 'assistant/message') {
    const inhalt = d.message && d.message.content;
    if (!Array.isArray(inhalt)) return '';
    return inhalt.filter((b) => b && b.type === 'text' && b.text)
      .map((b) => String(b.text)).join('\n\n').trim();
  }
  if (ereignis.type === 'user/message') {
    if (!d.source || d.source.kind !== 'user') return '';
    if (!Array.isArray(d.content)) return typeof d.content === 'string' ? d.content.trim() : '';
    return d.content.filter((b) => b && b.type === 'text' && b.text)
      .map((b) => String(b.text)).join('\n\n').trim();
  }
  return '';
}

/**
 * Schneidet aus den Ereignissen einer Sitzung das Gespräch heraus, in dem der
 * Skill aufgerufen wurde: vom Aufruf bis zum nächsten Skill-Aufruf. Die
 * Nutzernachricht davor gehört dazu — sie ist der Auftrag.
 *
 * Ohne Skill-Namen wird das ganze Gespräch genommen. So liest das Board das
 * laufende Gespräch, und es ist dasselbe, was später im Transkript steht.
 */
function gespraechAus(ereignisse, skill) {
  let von = 0;
  let ende = ereignisse.length;

  if (skill) {
    const aufruf = ereignisse.findIndex((e) => skillVon(e) === skill);
    if (aufruf < 0) return null;

    for (let i = aufruf + 1; i < ereignisse.length; i += 1) {
      if (skillVon(ereignisse[i])) { ende = i; break; }
    }

    von = aufruf;
    for (let i = aufruf - 1; i >= 0; i -= 1) {
      if (ereignisse[i].type === 'user/message' && textVon(ereignisse[i])) { von = i; break; }
      if (ereignisse[i].type === 'assistant/message' && textVon(ereignisse[i])) break;
    }
  }

  const bloecke = [];
  for (let i = von; i < ende; i += 1) {
    const text = textVon(ereignisse[i]);
    if (!text) continue;
    const rolle = ereignisse[i].type === 'user/message' ? 'user' : 'assistant';
    const letzte = bloecke[bloecke.length - 1];
    if (letzte && letzte.rolle === rolle) letzte.text += '\n\n' + text;
    else bloecke.push({ rolle, text });
  }
  return bloecke.length ? bloecke : null;
}

function transkriptText({ bloecke, skill, schritt, sitzung }) {
  let nummer = 0;
  const koerper = [];
  let i = 0;

  if (bloecke[0] && bloecke[0].rolle === 'user') {
    koerper.push('### Auftrag', '', bloecke[0].text, '');
    i = 1;
  }
  for (; i < bloecke.length; i += 1) {
    const block = bloecke[i];
    if (block.rolle === 'assistant') {
      nummer += 1;
      koerper.push('### Frage ' + nummer, '', block.text, '');
    } else {
      koerper.push('### Antwort ' + nummer, '', block.text, '');
    }
  }

  return [
    '---',
    'art: Transkript',
    'schritt: ' + schritt,
    'skill: ' + skill,
    'sitzung: ' + sitzung,
    'stand: ' + new Date().toLocaleDateString('sv-SE'),
    'fragen: ' + nummer,
    '---',
    '',
    '# ' + schritt,
    '',
    'Fragen und Antworten aus der Sitzung. Werkzeuge, Recherche und Zwischenschritte '
      + 'sind weggelassen.',
    '',
    ...koerper,
  ].join('\n');
}

/** Das Gespräch, das ein Vorhaben gerade im Board führt. */
/**
 * Gespräche hängen am Schritt, nicht am Vorhaben: jeder Schritt hat seine
 * eigene Sitzung. Ältere Vorhaben tragen noch ein einzelnes `gespraech` —
 * das wandert beim ersten Lesen in die Liste.
 */
function gespraecheVon(vorgang) {
  if (!vorgang || typeof vorgang !== 'object') return [];
  if (!Array.isArray(vorgang.gespraeche)) {
    const alt = vorgang.gespraech;
    vorgang.gespraeche = alt && typeof alt === 'object' && alt.session ? [alt] : [];
  }
  delete vorgang.gespraech;
  vorgang.gespraeche = vorgang.gespraeche.filter(
    (g) => g && typeof g === 'object' && /^session-[a-z0-9-]+$/.test(String(g.session || '')),
  );
  return vorgang.gespraeche;
}

function gespraechVon(vorgang, position) {
  const gesucht = String(position || '');
  if (!gesucht) return null;
  return gespraecheVon(vorgang).find((g) => g.position === gesucht) || null;
}

/**
 * Warum der letzte Zug geendet hat. Ein Fehler bleibt stehen, bis ein neuer
 * Zug läuft; „abgebrochen" ist eine Auskunft, kein Fehler.
 */
function fehlerAus(ereignisse) {
  for (let i = ereignisse.length - 1; i >= 0; i -= 1) {
    const ereignis = ereignisse[i];
    if (!ereignis || ereignis.type !== 'turn/end') continue;
    const grund = (ereignis.data && ereignis.data.reason) || {};
    if (grund.kind === 'error') {
      return String((grund.error && grund.error.message) || 'Der Lauf ist gescheitert.');
    }
    if (grund.kind === 'aborted') return 'Abgebrochen.';
    return '';
  }
  return '';
}

/**
 * Wo die Sitzung zu Hause ist: im Arbeitsbereich, in dem das Board liegt.
 * Ohne Eintrag bleibt der Ordner, in dem der Host läuft.
 */
function arbeitsplatz(ctx) {
  const wurzel = (() => {
    const ordner = ctx.get('workingDirectory');
    return (ordner && ordner.defaultDirectory) || process.cwd();
  })();
  const register = ctx.get('workspaceRegistry');
  if (!register || typeof register.resolveByPath !== 'function') return { cwd: wurzel };
  return register.resolveByPath(wurzel).then(
    (bereich) => (bereich && bereich.id ? { workspaceId: bereich.id } : { cwd: wurzel }),
    () => ({ cwd: wurzel }),
  );
}

function sitzungPfad(sitzung) {
  if (!/^session-[a-z0-9-]+$/.test(sitzung)) return '';
  const treffer = sitzungsDateien().find((s) => s.id === sitzung);
  return treffer ? treffer.pfad : '';
}

async function leseKoerper(req) {
  let text = '';
  for await (const teil of req) {
    text += teil;
    if (text.length > MAX_KOERPER) throw new Error('zu groß');
  }
  return text.length ? JSON.parse(text) : {};
}

/**
 * Die eine Stelle, an der über Handlungen am Vorhaben entschieden wird.
 * Verantwortlich ist, wer an der Station eingetragen ist, an der das Vorhaben
 * gerade steht. Bei mehreren gilt `regel`: `einer` heißt, ein Eingetragener
 * genügt; `alle` heißt, keiner allein — dafür müsste erst die Zustimmung aller
 * zusammenkommen, und diese Stelle gibt es noch nicht. Solange gilt `alle` nur,
 * wenn genau diese eine Person eingetragen ist. Was später dazukommt (annehmen,
 * Rücksprung, Beiträge), fragt dieselbe Stelle.
 */
function darf(vorhaben, aktion, person) {
  if (!vorhaben || !person) return false;
  if (!AKTIONEN.includes(String(aktion))) return false;
  const liste = verantwortlicheVon(vorhaben);
  if (!liste.includes(String(person))) return false;
  if (vorhaben.regel === 'alle' && liste.length > 1) return false;
  return true;
}

/** Die Verantwortlichen an der jetzigen Station, als Liste von Kennungen. */
function verantwortlicheVon(vorhaben) {
  const feld = vorhaben && vorhaben.verantwortliche;
  if (!feld || typeof feld !== 'object' || Array.isArray(feld)) return [];
  const liste = feld[String(vorhaben.position || '')];
  return Array.isArray(liste) ? liste.map((id) => String(id)).filter(Boolean) : [];
}

/** Die vier Antworten für die eigene Person — die Form in `/board/data`. */
function darfVon(vorhaben) {
  return AKTIONEN.reduce((alle, aktion) => {
    alle[aktion] = darf(vorhaben, aktion, PERSON_ID);
    return alle;
  }, {});
}

/** Die Namen der Verantwortlichen; fehlt eine Personendatei, steht ihre Kennung. */
function verantwortetVon(vorhaben, personen) {
  const namen = verantwortlicheVon(vorhaben).map((id) => {
    const person = (personen || []).find((p) => p && String(p.id) === id);
    const name = person && String(person.name || '').trim();
    return name || id;
  });
  return namen.join(', ');
}

/** Die Kennungen und Namen der Stationen über alle Flächen. */
function stationenVon(board) {
  const namen = new Map();
  for (const flaeche of Array.isArray(board && board.workflows) ? board.workflows : []) {
    for (const workflow of Array.isArray(flaeche.workflows) ? flaeche.workflows : []) {
      const schritte = new Map((Array.isArray(workflow.schritte) ? workflow.schritte : [])
        .map((s) => [String(s.id), s]));
      for (const position of Array.isArray(workflow.positionen) ? workflow.positionen : []) {
        const id = String(position.id || '');
        if (!id || namen.has(id)) continue;
        const schritt = schritte.get(String(position.schritt || ''));
        namen.set(id, schritt && schritt.name ? String(schritt.name) : id);
      }
    }
  }
  return namen;
}

/**
 * Die vorgeschlagenen Dateien einer Anfrage: je Eintrag ein Name und sein Text.
 * `null` heißt: die Liste ist unbrauchbar — dann wird nichts angelegt. Ein
 * fehlender Text ist ein leerer Vorschlag, aber ein leerer Name ist keiner.
 */
function beitragDateien(wert) {
  const liste = Array.isArray(wert) ? wert : [];
  const gesehen = new Set();
  const ergebnis = [];
  if (liste.length > 20) return null;
  for (const eintrag of liste) {
    if (!eintrag || typeof eintrag !== 'object') return null;
    const name = dateiName(eintrag.name);
    if (!name || name.endsWith('/') || gesehen.has(name)) return null;
    if (typeof eintrag.text !== 'string' && typeof eintrag.inhalt !== 'string') return null;
    const text = typeof eintrag.text === 'string' ? eintrag.text : eintrag.inhalt;
    gesehen.add(name);
    ergebnis.push({ name, text: text.slice(0, MAX_INHALT * 50) });
  }
  return ergebnis;
}

/** Eine Kennung für einen Beitrag, die noch nicht in der Ablage liegt. */
function beitragKennung(vorhandene) {
  const basis = zeitStempel();
  if (!vorhandene.has(basis)) return basis;
  let nummer = 2;
  while (vorhandene.has(basis + '-' + nummer)) nummer += 1;
  return basis + '-' + nummer;
}


/**
 * Die Form, die die Seite liest: eine Fläche je Person, die eigene zuerst.
 * `workflow` und `schritte` der alten Antwort entfallen; die eigene Fläche
 * steht als erster Workflow der eigenen Person darin.
 */
function datenAntwort(board) {
  const personen = Array.isArray(board.personen) ? board.personen : [];
  const bekannt = new Map(personen.map((p) => [p.id, p]));
  const farbeFuer = (wert, i) => (/^#[0-9a-f]{6}$/i.test(String(wert || ''))
    ? wert
    : PERSON_FARBEN[i % PERSON_FARBEN.length]);
  let workflows = (Array.isArray(board.workflows) ? board.workflows : []).map((p, i) => {
    const person = bekannt.get(p.id) || p;
    return {
      id: p.id,
      name: person.name || '',
      farbe: farbeFuer(person.farbe, i),
      ich: !!person.ich,
      workflows: Array.isArray(p.workflows) ? p.workflows : [],
    };
  });
  // Eine Ablage ohne Personen- und Workflow-Dateien bekommt trotzdem die
  // eigene Fläche: sie ist, was die Seite ohne Eintrag schon immer zeigte.
  if (!workflows.length) {
    workflows = personen.map((p, i) => ({
      id: p.id,
      name: p.name || '',
      farbe: farbeFuer(p.farbe, i),
      ich: !!p.ich,
      workflows: p.ich
        ? [{ ...(board.workflow || {}), schritte: board.schritte || [] }]
        : [],
    }));
  }
  const eigene = workflows.find((p) => p.ich);
  if (eigene && board.workflow) {
    eigene.workflows = [
      { ...board.workflow, schritte: board.schritte || [] },
      ...eigene.workflows.slice(1),
    ];
  }
  const stelle = workflows.findIndex((p) => p.ich);
  if (stelle > 0) workflows.unshift(...workflows.splice(stelle, 1));

  // Je Vorhaben: wer gerade verantwortet und was die eigene Person darf. Beides
  // wird bei jedem Lesen aus `verantwortliche` und der Station abgeleitet und
  // nicht gespeichert. Die Farbe fehlt nur, wenn das Vorhaben keine eigene
  // trägt — dann gilt die seiner verantwortlichen Person.
  const farbeVonVerantwortlichen = (vorgang) => {
    const id = verantwortlicheVon(vorgang)[0];
    if (!id) return '';
    const person = bekannt.get(id);
    const farbe = person && String(person.farbe || '');
    return /^#[0-9a-f]{6}$/i.test(farbe) ? farbe : '';
  };
  // Die Herkunft wird für die Anzeige angereichert: Name und Station des
  // Ursprungs stehen daneben, damit die Seite nichts nachschlagen muss.
  // `sichtbar` sagt, ob der Ursprung in dieser Ablage liegt — nur dann ist
  // seine Herkunft anklickbar.
  const stationen = stationenVon({ ...board, workflows });
  const vorhabenNamen = new Map((Array.isArray(board.vorgaenge) ? board.vorgaenge : [])
    .map((v) => [String(v.id), String(v.name || '')]));
  const herkunftVon = (vorgang) => {
    const zweig = vorgang.zweig_von && typeof vorgang.zweig_von === 'object'
      && !Array.isArray(vorgang.zweig_von) && vorgang.zweig_von.von
      ? vorgang.zweig_von : null;
    const fork = typeof vorgang.fork_von === 'string' ? vorgang.fork_von : '';
    return {
      zweig: zweig ? {
        von: String(zweig.von),
        name: vorhabenNamen.get(String(zweig.von)) || String(zweig.von),
        station: String(zweig.station || ''),
        stationName: stationen.get(String(zweig.station || ''))
          || String(zweig.station || ''),
        datum: String(zweig.datum || ''),
        sichtbar: vorhabenNamen.has(String(zweig.von)),
      } : null,
      fork: fork ? {
        von: fork,
        name: vorhabenNamen.get(fork) || fork,
        sichtbar: vorhabenNamen.has(fork),
      } : null,
    };
  };
  // Ein Rücksprung ist ein Vermerk am Vorhaben; `erledigt` sagt, ob das
  // Vorhaben wieder an seinem Ziel vorbei ist. Für die Anzeige bekommt jeder
  // Eintrag die Namen seiner beiden Stationen — die Datei bleibt die schmale
  // Form aus Schritt 03, geschrieben wird hier nichts.
  const rueckkehrVon = (vorgang) => {
    const liste = Array.isArray(vorgang.rueckkehr) ? vorgang.rueckkehr : [];
    return liste
      .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
      .map((r) => {
        const von = String(r.von || '');
        const nach = String(r.nach || '');
        return {
          ...r,
          von,
          nach,
          grund: String(r.grund || ''),
          seit: String(r.seit || ''),
          erledigt: r.erledigt === true,
          vonName: stationen.get(von) || von,
          nachName: stationen.get(nach) || nach,
        };
      });
  };
  const vorgaenge = (Array.isArray(board.vorgaenge) ? board.vorgaenge : []).map((v) => {
    const verantwortliche = v.verantwortliche && typeof v.verantwortliche === 'object'
      && !Array.isArray(v.verantwortliche) ? v.verantwortliche : {};
    const vorgang = {
      ...v,
      verantwortliche,
      regel: v.regel === 'alle' ? 'alle' : 'einer',
    };
    if (!/^#[0-9a-f]{6}$/i.test(String(vorgang.farbe || ''))) {
      const farbe = farbeVonVerantwortlichen(vorgang);
      if (farbe) vorgang.farbe = farbe;
    }
    vorgang.verantwortet = verantwortetVon(vorgang, personen);
    vorgang.darf = darfVon(vorgang);
    vorgang.herkunft = herkunftVon(v);
    vorgang.rueckkehr = rueckkehrVon(v);
    return vorgang;
  });

  // Ein Beitrag nennt seinen Ort: das Vorhaben und die Station, an der er
  // hängt, dazu den Namen des Beitragenden und die Namen der vorgeschlagenen
  // Dateien. Die Fassungen selbst werden erst beim Öffnen gelesen.
  const beitraege = (Array.isArray(board.beitraege) ? board.beitraege : []).map((b) => {
    const vorgang = vorgaenge.find((v) => v.id === b.vorhaben) || null;
    return {
      id: b.id,
      vorhaben: b.vorhaben,
      vorhabenName: vorgang ? vorgang.name : b.vorhaben,
      schritt: b.schritt,
      station: stationen.get(b.schritt) || b.schritt,
      von: b.von,
      seit: b.seit,
      notiz: b.notiz,
      dateien: (b.dateien || []).map((d) => d.name),
      entschieden: b.entschieden,
    };
  }).sort((a, b) => String(b.seit).localeCompare(String(a.seit)));

  return {
    // Wer hier sitzt und wo die Ablage liegt — beides aus der Konfiguration.
    person: PERSON_ID,
    repo: REPO,
    // Beide Fassungen: die dieses Programms und die der Ablage. Die Seite
    // sagt damit, ob sie schreiben darf; geschrieben wird trotzdem erst nach
    // der Prüfung vor der jeweiligen Route.
    format: FORMAT,
    formatAblage: formatDerAblage(),
    workflows,
    vorgaenge,
    beitraege,
    personen,
    einstellungen: board.einstellungen || {},
    stand: board.stand || standWert(),
    // Wer ich bin und welche Boards ich benutze. Beides gilt für die Seite,
    // nicht für die Ablage.
    identitaet: IDENTITAET,
    hauptboard: HAUPTBOARD,
    ...registerFuerSeite(),
  };
}

export const inject = ['webServer'];

export function apply(ctx) {
  // Lesen bleibt immer möglich. Ein Schreiben geht durch dieselbe Prüfung:
  // Nennt die Ablage eine andere Fassung als dieses Programm, antwortet die
  // Route mit 409 und rührt keine Datei an. Ausgenommen sind nur Wege, die
  // keine Ablagedateien schreiben — der Abgleich, die beiden Modellwege und
  // das Abbrechen eines laufenden Zuges.
  const OHNE_ABLAGE_SCHREIBEN = new Set([
    '/board/sync',
    '/board/korrigieren',
    '/board/ueberarbeiten',
    '/board/gespraech/stopp',
    '/board/werkstatt/stopp',
    '/board/boards',
    '/board/boards/wechsel',
    '/board/boards/entfernen',
    '/board/identitaet',
  ]);

  function registriere(route) {
    const bearbeite = route.handler;
    return ctx.webServer.register({
      ...route,
      handler(req, res) {
        if (req.method !== 'GET' && !OHNE_ABLAGE_SCHREIBEN.has(route.path)) {
          try {
            pruefeFormatVorSchreiben();
          } catch (fehler) {
            sende(res, (fehler && fehler.status) || 500, {
              error: String((fehler && fehler.message) || fehler),
            });
            return undefined;
          }
        }
        return bearbeite(req, res);
      },
    });
  }

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/data',
    handler: (req, res) => {
      try {
        if (!REPO) {
          const leer = datenAntwort(leeresBoard());
          leer.leer = true;
          sende(res, 200, leer);
          return;
        }
        // Vor dem Lesen holen — höchstens einmal je Minute, und ein
        // gescheiterter Abgleich lässt den lokalen Stand stehen.
        abgleichVorDemLesen();
        const board = mitAbleitung(liesBoard());
        board.vorgaenge = Array.isArray(board.vorgaenge) ? board.vorgaenge : [];
        board.stand = standWert();
        sende(res, 200, datenAntwort(board));
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Wer bin ich, wo liegt was: die eigene Kennung, der Ablageort, der Remote
  // und die Fassung dieses Programms.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/konfiguration',
    handler: (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        sende(res, 200, {
          person: PERSON_ID,
          repo: REPO,
          remote: remoteAdresse(),
          format: FORMAT,
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Der Abgleich von Hand: holen, die eigenen Fassungen darauf legen und
  // weitergeben. Die Antwort sagt, was davon gelungen ist.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/sync',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        sende(res, 200, abgleichen());
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Boards, die dieser Mensch benutzt: lesen, verbinden, wechseln,
  // aus der Liste nehmen. Die Ablage eines Boards bleibt liegen, auch wenn
  // es nicht mehr im Register steht.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/boards',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        sende(res, 200, { ...registerFuerSeite(), identitaet: IDENTITAET });
        return;
      }
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur GET oder POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        if (!IDENTITAET || !IDENTITAET.name) {
          sende(res, 400, { error: 'Bitte zuerst den eigenen Namen eintragen' });
          return;
        }
        const name = String(koerper.name == null ? '' : koerper.name).trim().slice(0, 60);
        const adresse = String(koerper.adresse == null ? '' : koerper.adresse).trim();
        const { board, register } = verbindeBoard({
          home: HOME, name, adresse, identitaet: IDENTITAET,
        });
        REGISTER.boards = register.boards;
        REGISTER.aktiv = register.aktiv;
        setzeAktiv(board.id);
        sende(res, 200, { ok: true, board: board.id, ...registerFuerSeite() });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/boards/wechsel',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id == null ? '' : koerper.id);
        const board = REGISTER.boards.find((b) => b.id === id);
        if (!board) { sende(res, 404, { error: 'Dieses Board steht nicht im Register' }); return; }
        if (!existsSync(join(board.repo, 'format'))) {
          sende(res, 409, { error: 'Der Ordner dieses Boards fehlt: ' + board.repo });
          return;
        }
        setzeAktiv(board.id);
        sende(res, 200, { ok: true, ...registerFuerSeite() });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/boards/entfernen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id == null ? '' : koerper.id);
        const register = entferneBoard(HOME, id);
        if (!register) { sende(res, 404, { error: 'Es gibt noch kein Register' }); return; }
        REGISTER.boards = register.boards;
        REGISTER.aktiv = register.aktiv;
        setzeAktiv(register.aktiv);
        sende(res, 200, { ok: true, ...registerFuerSeite() });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die eigene Identität: Name, GitHub-Name und Farbe. Sie gilt für alle
  // Boards; auf jedem Board steht sie in der eigenen Personendatei.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/identitaet',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        sende(res, 200, { identitaet: IDENTITAET });
        return;
      }
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur GET oder POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const name = String(koerper.name == null ? '' : koerper.name).trim().slice(0, 40);
        const github = String(koerper.github == null ? '' : koerper.github).trim().slice(0, 39);
        const farbe = String(koerper.farbe == null ? '' : koerper.farbe);
        if (!name) { sende(res, 400, { error: 'Der Name fehlt' }); return; }
        if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github)) {
          sende(res, 400, { error: 'Der GitHub-Name ist ungültig' });
          return;
        }
        if (!/^#[0-9a-f]{6}$/i.test(farbe)) {
          sende(res, 400, { error: 'Die Farbe fehlt' });
          return;
        }
        IDENTITAET = { name, github, farbe };
        schreibeIdentitaet(HOME, IDENTITAET);
        if (REPO) {
          try {
            const board = liesBoard();
            const ich = (board.personen || []).find((p) => p.ich);
            if (ich) {
              ich.name = name;
              ich.farbe = farbe;
              ich.github = github;
              schreibeBoard(board);
              festhalten('Identität geändert', autorMensch());
            }
          } catch { /* Die Identität gilt auch ohne eigene Personendatei. */ }
        }
        sende(res, 200, { ok: true, identitaet: IDENTITAET, ...registerFuerSeite() });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/doc',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { exists: false, error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerVon(vorgang);
        if (!ordner) { sende(res, 404, { exists: false, error: 'Kein Ordner' }); return; }
        const name = dateiName(frage.get('datei') || '');
        if (!name) { sende(res, 400, { exists: false, error: 'Ungültiger Dateiname' }); return; }
        const inhalt = dateiInhalt(ordner, name);
        // Eine Datei trägt die Fassung mit, auf der sie beim Öffnen steht:
        // den Commit, der sie zuletzt geändert hat. Ein Ordner und eine noch
        // nicht gefasste Datei tragen `null`.
        sende(res, 200, {
          ...inhalt,
          basis: inhalt.art === 'ordner' ? null : dateiBasis(ordner, name),
        });
      } catch (error) {
        sende(res, 500, { exists: false, error: String((error && error.message) || error) });
      }
    },
  }));

  // Ein Ordner im Vorhaben: was unmittelbar darin liegt. Gelesen wird nur,
  // was da ist — und je Ebene, damit ein großes Produkt nicht in einem Zug
  // durch den Baum läuft.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/dateien',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerVon(vorgang);
        if (!ordner) { sende(res, 404, { error: 'Kein Ordner' }); return; }
        const pfad = String(frage.get('pfad') || '');
        const ziel = pfadImOrdner(ordner, pfad);
        if (!ziel) { sende(res, 400, { error: 'Ungültiger Pfad' }); return; }
        let roh;
        try {
          roh = readdirSync(ziel, { withFileTypes: true });
        } catch {
          sende(res, 404, { error: 'Ordner gibt es nicht' });
          return;
        }
        const sortiert = roh
          .filter((e) => e.name !== '.git')
          .sort((a, b) => (a.isDirectory() === b.isDirectory()
            ? a.name.localeCompare(b.name, 'de')
            : (a.isDirectory() ? -1 : 1)));
        const eintraege = [];
        let mehr = 0;
        for (const e of sortiert) {
          if (!e.isDirectory() && !e.isFile()) continue;
          if (eintraege.length >= 400) { mehr += 1; continue; }
          const eintrag = { name: e.name, art: e.isDirectory() ? 'ordner' : 'datei' };
          try {
            if (e.isDirectory()) {
              eintrag.anzahl = readdirSync(join(ziel, e.name)).length;
            } else {
              const masse = statSync(join(ziel, e.name));
              eintrag.groesse = masse.size;
              eintrag.datum = masse.mtime.toISOString();
            }
          } catch {
            /* was sich nicht lesen lässt, steht ohne Zahl da */
          }
          eintraege.push(eintrag);
        }
        sende(res, 200, { pfad, eintraege, ...(mehr ? { mehr } : {}) });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Eine Datei tief im Vorhaben — für alles, was nicht im Wurzelordner liegt.
  // Text wird gezeigt, alles andere als solches benannt; geraten wird nicht.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/datei',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { exists: false, error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerVon(vorgang);
        if (!ordner) { sende(res, 404, { exists: false, error: 'Kein Ordner' }); return; }
        const pfad = String(frage.get('pfad') || '');
        const ziel = pfadImOrdner(ordner, pfad);
        if (!ziel || !pfad) { sende(res, 400, { exists: false, error: 'Ungültiger Pfad' }); return; }
        let masse;
        try {
          masse = statSync(ziel);
        } catch {
          sende(res, 200, { exists: false, text: '' });
          return;
        }
        if (!masse.isFile()) { sende(res, 400, { exists: false, error: 'Kein Dokument' }); return; }
        // Über zwei Megabyte wird nicht geöffnet: das ist kein Text zum Lesen.
        if (masse.size > 2 * 1024 * 1024) {
          sende(res, 200, { exists: true, binaer: true, zuGross: true, groesse: masse.size });
          return;
        }
        const puffer = readFileSync(ziel);
        if (puffer.subarray(0, 8000).includes(0)) {
          sende(res, 200, { exists: true, binaer: true, groesse: masse.size });
          return;
        }
        sende(res, 200, {
          exists: true, text: puffer.toString('utf8'), groesse: masse.size,
        });
      } catch (error) {
        sende(res, 500, { exists: false, error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/doc/schreiben',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === koerper.vorhaben);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        // In ein fremdes Vorhaben wird nicht geschrieben. Die Prüfung steht vor
        // jedem Anlegen und Schreiben — dieselbe Stelle wie bei den Handlungen.
        if (!darf(vorgang, 'aendern', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }
        const ordner = ordnerVon(vorgang);
        if (!ordner) { sende(res, 400, { error: 'Kein Ordner' }); return; }
        const name = dateiName(koerper.datei || '');
        if (!name) { sende(res, 400, { error: 'Ungültiger Dateiname' }); return; }
        // In einen Ordner wird nicht geschrieben — sein Inhalt entsteht dort,
        // wo gearbeitet wird, nicht im Editor.
        if (name.endsWith('/')) { sende(res, 400, { error: 'Ein Ordner ist keine Datei' }); return; }
        const text = String(koerper.text == null ? '' : koerper.text).slice(0, MAX_INHALT * 50);

        // Die Basisprüfung: Wer eine Datei auf einem überholten Stand
        // speichert, überschreibt nichts. Sein Text bleibt bei ihm; er bekommt
        // den neuen Stand zurück und kann ihn als Beitrag anbieten. Eine
        // vorhandene, gefasste Datei verlangt die Basis; eine neue, noch nicht
        // gefasste darf ohne sie angelegt werden.
        const aktuelleBasis = dateiBasis(ordner, name);
        const hatBasis = Object.prototype.hasOwnProperty.call(koerper, 'basis');
        const rohBasis = hatBasis ? koerper.basis : null;
        const gewuenschteBasis = rohBasis == null ? null : String(rohBasis).trim() || null;
        const basisGueltig = gewuenschteBasis === null
          || /^[0-9a-f]{7,40}$/.test(gewuenschteBasis);
        const basisFehlt = !hatBasis && aktuelleBasis !== null;
        if (basisFehlt || (hatBasis && (!basisGueltig || gewuenschteBasis !== aktuelleBasis))) {
          let neuerText = '';
          try {
            neuerText = readFileSync(join(ordner, name), 'utf8');
          } catch {
            /* Eine noch nicht angelegte Datei hat keinen Text. */
          }
          sende(res, 409, {
            ok: false,
            error: basisFehlt
              ? 'Die Basis fehlt — der Stand ist neuer. Nichts wurde geschrieben.'
              : 'Der Stand ist neuer. Nichts wurde geschrieben.',
            neu: { text: neuerText, basis: aktuelleBasis },
          });
          return;
        }

        mkdirSync(ordner, { recursive: true });
        const datei = join(ordner, name);
        writeFileSync(datei + '.tmp', text, 'utf8');
        renameSync(datei + '.tmp', datei);
        festhalten('„' + name + '“ gespeichert'
          + (koerper.herkunft === 'modell' ? ' (Fassung vom Modell)'
            : koerper.herkunft === 'zurueck' ? ' (zurück auf eine frühere Fassung)' : ''),
          autorMensch());
        // Nach der Fassung ist die neue Basis die dieser Datei. Sie geht mit
        // zurück, damit der Editor beim nächsten Speichern nicht auf seinem
        // eigenen alten Stand sitzen bleibt.
        const neueBasis = dateiBasis(ordner, name);
        sende(res, 200, {
          ok: true, name, laenge: text.length, basis: neueBasis, fassung: neueBasis,
        });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Ein Beitrag ist ein Vorschlag, keine Änderung: geschrieben wird unter
  // `beitraege/`, die Datei im Vorhaben bleibt unberührt. Wer das Board sieht,
  // darf beitragen — unabhängig von `darf.aendern`.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/beitrag',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        try {
          const frage = new URL(req.url, 'http://localhost').searchParams;
          const id = String(frage.get('beitrag') || '');
          if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
            sende(res, 400, { error: 'Ungültige Beitrags-Kennung' }); return;
          }
          const beitrag = liesBeitraege(REPO).find((b) => b.id === id
            && (!frage.get('vorhaben') || b.vorhaben === frage.get('vorhaben')));
          if (!beitrag) { sende(res, 404, { error: 'Diesen Beitrag gibt es nicht' }); return; }

          const board = liesBoard();
          const vorgang = (board.vorgaenge || []).find((v) => v.id === beitrag.vorhaben);
          const stationen = stationenVon(board);
          const dateien = (beitrag.dateien || []).map((d) => {
            const sicher = /^beitraege\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
            if (!sicher.test(d.datei)) {
              return { name: d.name, datei: d.datei, exists: false, text: '' };
            }
            try {
              return {
                name: d.name,
                datei: d.datei,
                exists: true,
                text: readFileSync(join(REPO, d.datei), 'utf8'),
              };
            } catch {
              return { name: d.name, datei: d.datei, exists: false, text: '' };
            }
          });
          sende(res, 200, {
            beitrag: {
              ...beitrag,
              vorhabenName: vorgang ? vorgang.name : beitrag.vorhaben,
              station: stationen.get(beitrag.schritt) || beitrag.schritt,
              dateien: (beitrag.dateien || []).map((d) => d.name),
            },
            dateien,
          });
        } catch (error) {
          sende(res, 500, { error: String((error && error.message) || error) });
        }
        return;
      }
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }

      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find(
          (v) => v.id === String(koerper.vorhaben || ''),
        );
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

        const stationen = stationenVon(board);
        const schritt = String(koerper.schritt || vorgang.position || '').trim();
        if (!stationen.has(schritt)) {
          sende(res, 400, { error: 'Station nicht gefunden: ' + schritt }); return;
        }

        const dateien = beitragDateien(koerper.dateien);
        if (dateien === null) {
          sende(res, 400, {
            error: 'Jede vorgeschlagene Datei braucht einen gültigen Namen und ihren Text.',
          });
          return;
        }
        const notiz = String(koerper.notiz == null ? '' : koerper.notiz)
          .trim().slice(0, MAX_INHALT);
        if (!notiz && !dateien.length) {
          sende(res, 400, {
            error: 'Ein Beitrag braucht eine Notiz oder eine vorgeschlagene Datei.',
          });
          return;
        }

        // Die Basis eines Beitrags ist die Fassung, auf der sein Vorschlag
        // aufsitzt. Die Seite gibt bei einem überholten Stand die neue Basis
        // der Datei mit; ohne Angabe gilt wie bisher der Stand von HEAD.
        const hatBasis = Object.prototype.hasOwnProperty.call(koerper, 'basis');
        let basis;
        if (hatBasis) {
          basis = koerper.basis == null ? null : String(koerper.basis).trim() || null;
          if (basis !== null && !/^[0-9a-f]{7,40}$/.test(basis)) {
            sende(res, 400, { error: 'Ungültige Basis' });
            return;
          }
        } else {
          const kopf = git(['rev-parse', 'HEAD']);
          const hash = kopf.ok ? kopf.out.trim() : '';
          basis = /^[0-9a-f]{40}$/.test(hash) ? hash : null;
        }
        const beitrag = {
          id: beitragKennung(new Set(liesBeitraege(REPO).map((b) => b.id))),
          vorhaben: String(vorgang.id),
          schritt,
          von: String(eigenePerson().name || '').trim() || PERSON_ID,
          seit: new Date().toISOString(),
          basis,
          notiz,
          dateien: [],
          entschieden: null,
        };

        let geschrieben;
        try {
          geschrieben = schreibeBeitrag(REPO, beitrag, dateien);
        } catch (fehler) {
          sende(res, 400, { error: String((fehler && fehler.message) || fehler) });
          return;
        }
        // Jeder Beitrag ist eine eigene Fassung; der Urheber ist, wer ihn
        // schreibt — nicht der, dem das Vorhaben gehört.
        festhalten('Beitrag zu „' + (vorgang.name || vorgang.id) + '“ an „'
          + (stationen.get(schritt) || schritt) + '“'
          + (dateien.length ? ' mit ' + dateien.length
            + (dateien.length === 1 ? ' vorgeschlagenen Datei' : ' vorgeschlagenen Dateien') : ''),
        autorMensch());

        sende(res, 200, { ok: true, beitrag: geschrieben });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Über einen Beitrag entscheidet der Verantwortliche des Vorhabens: ganz,
  // in Teilen oder ablehnend. Erst der Entscheid ändert den Stand des
  // Vorhabens; der Beitrag bleibt mit Notiz, Fassungen und Vermerk liegen.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/beitrag/entscheiden',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.beitrag || '');
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
          sende(res, 400, { error: 'Ungültige Beitrags-Kennung' }); return;
        }
        const beitrag = liesBeitraege(REPO).find((b) => b.id === id);
        if (!beitrag) { sende(res, 404, { error: 'Diesen Beitrag gibt es nicht' }); return; }

        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === beitrag.vorhaben);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

        // Zuerst die Zuständigkeit: nur wer das Vorhaben verantwortet,
        // entscheidet über seinen Beitrag.
        if (!darf(vorgang, 'entscheiden', PERSON_ID)) {
          sende(res, 403, { error: 'Über dieses Vorhaben entscheidet jemand anderes.' });
          return;
        }
        if (beitrag.entschieden) {
          sende(res, 409, { error: 'Dieser Beitrag ist schon entschieden.' });
          return;
        }

        const art = String(koerper.art || '');
        if (art !== 'annehmen' && art !== 'ablehnen') {
          sende(res, 400, { error: 'Der Entscheid ist „annehmen“ oder „ablehnen“.' });
          return;
        }

        // Die Kennungen kommen aus der Ablage; geprüft wird trotzdem, weil ein
        // Entscheid in Dateien schreibt, die nicht aus dem Beitrag stammen.
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(beitrag.vorhaben))
          || String(beitrag.vorhaben).includes('..')) {
          sende(res, 400, { error: 'Ungültige Vorhaben-Kennung' }); return;
        }
        const vorgeschlagen = (beitrag.dateien || []).map((d) => d.name);
        let teile;
        if (art === 'ablehnen') {
          // Ablehnen nimmt nichts; der Stand des Vorhabens bleibt unverändert.
          teile = [];
        } else if (koerper.teile == null) {
          // Ohne Angabe werden alle vorgeschlagenen Dateien übernommen.
          teile = vorgeschlagen.slice();
        } else {
          if (!Array.isArray(koerper.teile)) {
            sende(res, 400, { error: 'teile ist eine Liste von Dateinamen.' }); return;
          }
          teile = [];
          for (const wert of koerper.teile) {
            const name = String(wert == null ? '' : wert);
            if (!vorgeschlagen.includes(name)) {
              sende(res, 400, { error: 'Diese Datei liegt nicht im Beitrag: ' + name });
              return;
            }
            if (!teile.includes(name)) teile.push(name);
          }
        }

        if (art === 'annehmen' && teile.length) {
          const ordner = ordnerVon(vorgang);
          if (!ordner) { sende(res, 400, { error: 'Kein Ordner' }); return; }
          // Erst alle vorgeschlagenen Fassungen lesen. Fehlt eine, wird weder
          // geschrieben noch entschieden — es bleibt kein halber Stand.
          const vorbereitet = [];
          for (const name of teile) {
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(name) || name.includes('..')) {
              sende(res, 400, { error: 'Ungültiger Dateiname im Beitrag: ' + name });
              return;
            }
            const quelle = join(REPO, 'beitraege', beitrag.vorhaben, beitrag.id, name);
            let text;
            try {
              text = readFileSync(quelle, 'utf8');
            } catch {
              sende(res, 400, { error: 'Die vorgeschlagene Datei fehlt: ' + name });
              return;
            }
            vorbereitet.push({ name, text });
          }

          // Die Basis des Beitrags gilt je übernommener Datei. Wer eine davon
          // inzwischen geändert hat, bekommt 409 mit den neuen Basen; dann wird
          // weder eine Datei geschrieben noch der Beitrag entschieden. `teile`
          // grenzt die Prüfung auf das ein, was wirklich übernommen wird. Die
          // Fassung des Beitrags muss nicht die letzte sein, die diese Datei
          // geändert hat — sie muss nur seitdem unverändert sein.
          const basen = {};
          const abweichend = [];
          for (const { name } of vorbereitet) {
            const aktuelle = dateiBasis(ordner, name);
            basen[name] = aktuelle;
            // Eine noch nicht gefasste Datei hat keinen neueren Stand. Sonst
            // muss die Datei seit der Basis des Beitrags unverändert sein.
            if (aktuelle !== null && !dateiUnveraendertSeit(ordner, name, beitrag.basis)) {
              abweichend.push(name);
            }
          }
          if (abweichend.length) {
            sende(res, 409, {
              ok: false,
              error: 'Der Stand ist neuer — nichts wurde übernommen.'
                + ' Die neuen Basen stehen in `neu`.',
              neu: basen,
            });
            return;
          }

          mkdirSync(ordner, { recursive: true });
          const sicherungen = [];
          try {
            for (const { name, text } of vorbereitet) {
              const ziel = join(ordner, name);
              let alt = null;
              try { alt = readFileSync(ziel); } catch { /* die Datei ist neu */ }
              writeFileSync(ziel + '.tmp', text, 'utf8');
              renameSync(ziel + '.tmp', ziel);
              sicherungen.push({ ziel, alt });
            }
          } catch (fehler) {
            // Ganz oder gar nicht: was schon geschrieben wurde, kommt zurück.
            for (const { ziel, alt } of sicherungen.reverse()) {
              try {
                if (alt == null) rmSync(ziel, { force: true });
                else writeFileSync(ziel, alt);
              } catch { /* mehr lässt sich nicht zurücknehmen */ }
            }
            throw fehler;
          }
        }

        const entschieden = {
          von: PERSON_ID,
          am: new Date().toISOString(),
          art: art === 'annehmen' ? 'angenommen' : 'abgelehnt',
          teile,
        };
        let geschrieben;
        try {
          geschrieben = schreibeEntscheid(REPO, beitrag.vorhaben, beitrag.id, entschieden);
        } catch (fehler) {
          sende(res, 400, { error: String((fehler && fehler.message) || fehler) });
          return;
        }

        // Annehmen schreibt die übernommenen Dateien als neue Fassung; in
        // beiden Fällen hält der Entscheid den Beitrag mit dem eigenen
        // Urheber fest — abgelehnt wird ebenso verbindlich wie angenommen.
        festhalten('Beitrag zu „' + (vorgang.name || vorgang.id) + '“ '
          + (entschieden.art === 'angenommen' ? 'angenommen' : 'abgelehnt')
          + (entschieden.art === 'angenommen' && teile.length
            ? ' (' + teile.join(', ') + ')' : ''),
        autorMensch());

        sende(res, 200, { ok: true, beitrag: geschrieben });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Fassungen einer Datei. Gelesen wird nur das Repository; geschrieben
  // wird beim Speichern — die Geschichte ist keine zweite Datenhaltung.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/versionen',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerVon(vorgang);
        const name = dateiName(frage.get('datei') || '');
        if (!ordner || !name || !ordner.startsWith(REPO + '/')) {
          sende(res, 400, { error: 'Ungültiger Dateiname' }); return;
        }
        const pfad = ordner.slice(REPO.length + 1) + '/' + name;
        const log = git(['log', '--max-count=60', '--format=%H%x1f%an%x1f%aI%x1f%s', '--', pfad]);
        // Ein leerer Verlauf und ein kaputter Verlauf sind nicht dasselbe:
        // ohne Repository sagt die Ansicht, dass sie nicht laden konnte.
        if (!log.ok) {
          sende(res, 503, { error: 'Der Verlauf ist nicht erreichbar' });
          return;
        }
        const versionen = log.out.split('\n').filter(Boolean).map((zeile) => {
          const [hash, autor, datum, ...rest] = zeile.split('\x1f');
          return { hash, autor, datum, nachricht: rest.join(' ') };
        });
        sende(res, 200, { datei: name, versionen });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Fassungen des Boards selbst: jede Speicherung legt einen Commit an.
  // Gezeigt wird die Reihenfolge mit dem, was sich geändert hat; der Vergleich
  // zweier Stände gehört zu den Dateien, hier zählt der Verlauf.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/fassungen',
    handler: (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const log = git(['log', '--max-count=60', '--format=%H%x1f%an%x1f%aI%x1f%s']);
        if (!log.ok) { sende(res, 503, { error: 'Der Verlauf ist nicht erreichbar' }); return; }
        const fassungen = log.out.split('\n').filter(Boolean).map((zeile) => {
          const [hash, autor, datum, ...rest] = zeile.split('\x1f');
          return { hash, autor, datum, nachricht: rest.join(' ') };
        });
        sende(res, 200, { fassungen });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Zwei Fassungen zum Vergleich: der Stand davor und der Stand danach.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/version',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const hash = String(frage.get('hash') || '');
        if (!/^[0-9a-f]{7,40}$/.test(hash)) { sende(res, 400, { error: 'Ungültige Fassung' }); return; }
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerVon(vorgang);
        const name = dateiName(frage.get('datei') || '');
        if (!ordner || !name || !ordner.startsWith(REPO + '/')) {
          sende(res, 400, { error: 'Ungültiger Dateiname' }); return;
        }
        const pfad = ordner.slice(REPO.length + 1) + '/' + name;

        const kopf = git(['show', '-s', '--format=%an%x1f%aI%x1f%s', hash]);
        if (!kopf.ok) { sende(res, 404, { error: 'Diese Fassung gibt es nicht' }); return; }
        const [autor = '', datum = '', ...rest] = kopf.out.trim().split('\x1f');
        const neu = git(['show', hash + ':' + pfad]);
        if (!neu.ok) { sende(res, 404, { error: 'In dieser Fassung gab es die Datei nicht' }); return; }
        const alt = git(['show', hash + '^:' + pfad]);
        sende(res, 200, {
          datei: name,
          hash,
          autor,
          datum,
          nachricht: rest.join(' '),
          alt: alt.ok ? alt.out : '',
          neu: neu.out,
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/korrigieren',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const text = String(koerper.text == null ? '' : koerper.text);
        if (!text.trim()) { sende(res, 400, { error: 'Nichts zu korrigieren' }); return; }
        if (text.length > MAX_INHALT * 4) { sende(res, 400, { error: 'Zu lang' }); return; }

        // Rechtschreibung braucht kein Nachdenken: die kleinste Denkstufe,
        // die das Modell kennt, hält den Aufruf kurz.
        const sauber = await modellText(ctx, {
          system: KORREKTUR,
          nachricht: text,
          stufen: ['off', 'low'],
          temperatur: 0,
          maxTokens: Math.min(4000, Math.ceil(text.length / 3) + 400),
          grenzeMs: 30000,
          art: 'korrektur',
        });
        sende(res, 200, { text: sauber });
      } catch (error) {
        const status = (error && error.status) || 500;
        sende(res, status, {
          error: status === 504
            ? 'Die Korrektur hat zu lange gedauert.'
            : String((error && error.message) || error),
        });
      }
    },
  }));

  // Überarbeiten speichert nichts. Das Modell liefert eine neue Fassung, der
  // Leser zeigt sie im Editor, und gespeichert wird erst mit „Speichern" —
  // ein Vorschlag, den er annehmen oder verwerfen kann.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/ueberarbeiten',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const text = String(koerper.text == null ? '' : koerper.text);
        const anweisung = String(koerper.anweisung == null ? '' : koerper.anweisung).trim().slice(0, 1000);
        if (!text.trim()) { sende(res, 400, { error: 'Nichts zu überarbeiten' }); return; }
        if (!anweisung) { sende(res, 400, { error: 'Es fehlt, was anders werden soll' }); return; }
        if (text.length > MAX_INHALT * 4) {
          sende(res, 400, { error: 'Der Text ist länger als ' + MAX_INHALT * 4 + ' Zeichen.' });
          return;
        }

        // Der Statuskopf am Anfang ist Buchhaltung, nicht Text. Er geht
        // unverändert zurück, damit das Modell ihn nicht umschreibt oder
        // verliert — gearbeitet wird am Rumpf.
        const kopf = text.match(/^---\n[\s\S]*?\n---\n(?:[ \t]*\n)?/);
        const rumpf = kopf ? text.slice(kopf[0].length) : text;
        if (!rumpf.trim()) { sende(res, 400, { error: 'Nichts zu überarbeiten' }); return; }

        // Denken ja, aber nicht lange: er wartet vor dem Editor.
        let neu = await modellText(ctx, {
          system: UEBERARBEITUNG,
          nachricht: 'Anweisung: ' + anweisung + '\n\nText:\n' + rumpf,
          stufen: ['low', 'off'],
          temperatur: 0.2,
          maxTokens: Math.min(8000, Math.ceil(rumpf.length / 2) + 4000),
          grenzeMs: 60000,
          art: 'ueberarbeitung',
        });
        // Liefert das Modell trotz Anweisung einen Codeblock, wird er
        // ausgepackt — im Editor soll Text stehen, kein Zaun.
        const zaun = neu.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
        if (zaun) neu = zaun[1].trim();
        sende(res, 200, { text: (kopf ? kopf[0] : '') + neu });
      } catch (error) {
        const status = (error && error.status) || 500;
        sende(res, status, {
          error: status === 504
            ? 'Das Überarbeiten hat zu lange gedauert.'
            : String((error && error.message) || error),
        });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/verlauf',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = mitAbleitung(liesBoard());
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        sende(res, 200, { vorhaben: vorgang, schritte: verlaufVon(board, vorgang) });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/positions',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const schrittId = String(koerper.schritt || '');
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === schrittId);
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        if (!board.workflow || !Array.isArray(board.workflow.positionen)) {
          sende(res, 500, { error: 'Kein Workflow in der Datei' }); return;
        }

        // Der Schritt selbst bleibt, wo er ist — die Position ist nur der Ort
        // im Workflow. Denselben Schritt zweimal einzusetzen ist erlaubt.
        const liste = board.workflow.positionen;
        const vorhandene = new Set(liste.map((p) => p.id));
        const neu = { id: kennung(schritt.name, vorhandene), schritt: schritt.id };
        if (Number.isFinite(Number(koerper.x))) neu.x = Math.round(Number(koerper.x));
        if (Number.isFinite(Number(koerper.y))) neu.y = Math.round(Number(koerper.y));

        const vor = koerper.before;
        const stelle = vor ? liste.findIndex((p) => p.id === vor) : -1;
        if (stelle >= 0) liste.splice(stelle, 0, neu);
        else liste.push(neu);

        // Fällt der Schritt auf eine Station, kommt er gleich danach: eine
        // Verbindung von dort zum neuen Punkt. Ein Kreis ist ausgeschlossen —
        // der neue Punkt steht noch in keiner Verbindung.
        const nach = String(koerper.nach || '');
        let gehaengt = false;
        if (nach && liste.some((p) => p.id === nach)) {
          const kanten = board.workflow.kanten || (board.workflow.kanten = []);
          if (!kanten.some((k) => k.von === nach && k.nach === neu.id)) {
            kanten.push({ von: nach, nach: neu.id });
            gehaengt = true;
          }
        }

        schreibeBoard(board);
        festhalten('Station „' + schritt.name + '“ in den Workflow gesetzt'
          + (gehaengt ? ' und angeschlossen' : ''), autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Einen fremden Schritt als Verweis in den eigenen Workflow stellen. Die
  // fremde Datei wird nur gelesen: in der eigenen steht danach `{ ref, id }`.
  // Die Kennung bleibt stehen, damit die Position auch dann gültig bleibt,
  // wenn das Ziel später aus der Ablage verschwindet.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/fremd/anstellen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const ref = String(koerper.ref || '').trim();
        const board = liesBoard();
        const ziel = zielVonRef(board, ref);
        if (!ziel) {
          sende(res, 404, {
            error: 'Diesen fremden Schritt gibt es nicht: ' + ref,
          });
          return;
        }
        if ((board.schritte || []).some((s) => s && s.ref === ziel.ref)) {
          sende(res, 409, { error: 'Dieser Schritt steht schon in deinem Workflow' });
          return;
        }
        if (!board.workflow || !Array.isArray(board.workflow.positionen)) {
          sende(res, 500, { error: 'Kein Workflow in der Datei' });
          return;
        }

        const id = refKennung(board, ziel.ref, ziel.schritt.id);
        // Der Verweis liegt in der Liste der eigenen Schritte; geschrieben wird
        // nur `{ ref, id }`, nie der Inhalt des fremden Schritts.
        board.schritte = Array.isArray(board.schritte) ? board.schritte : [];
        board.schritte.push({
          ...ziel.schritt,
          id,
          ref: ziel.ref,
          fremd: true,
        });

        const liste = board.workflow.positionen;
        const vorhandene = new Set(liste.map((p) => p.id));
        const neu = { id: kennung(ziel.schritt.name, vorhandene), schritt: id };
        const breiteste = liste.reduce((groesste, p) => (
          Number.isFinite(Number(p.x)) ? Math.max(groesste, Number(p.x)) : groesste
        ), 0);
        neu.x = Number.isFinite(Number(koerper.x))
          ? Math.round(Number(koerper.x))
          : breiteste + 320;
        neu.y = Number.isFinite(Number(koerper.y))
          ? Math.round(Number(koerper.y))
          : 80;
        liste.push(neu);

        schreibeBoard(board);
        // Die Antwort wird neu gelesen: so steht dort genau das, was auch der
        // nächste Aufruf der Seite lesen würde.
        const nachher = liesBoard();
        festhalten('Fremden Schritt „' + ziel.schritt.name + '“ von „'
          + ziel.person + '“ als Verweis angestellt', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(nachher)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Den Verweis wieder herausnehmen. Die fremde Datei bleibt unberührt; das
  // Ziel verschwindet nicht. Stehen noch Vorhaben an seinen Positionen, wird
  // zuerst nicht gelöscht.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/fremd/entfernen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const ref = String(koerper.ref || '').trim();
        const board = liesBoard();
        const eintrag = (board.schritte || []).find((s) => s
          && typeof s.ref === 'string' && s.ref === ref);
        if (!eintrag) { sende(res, 404, { error: 'Dieser Verweis steht nicht hier' }); return; }

        const betroffen = ((board.workflow && board.workflow.positionen) || [])
          .filter((p) => p.schritt === eintrag.id)
          .map((p) => p.id);
        const besetzt = (board.vorgaenge || []).filter((v) => betroffen.includes(v.position));
        if (besetzt.length) {
          sende(res, 409, {
            error: 'Dort stehen noch Vorhaben: ' + besetzt.map((v) => v.name).join(', '),
          });
          return;
        }

        board.workflow.positionen = (board.workflow.positionen || [])
          .filter((p) => !betroffen.includes(p.id));
        board.workflow.kanten = (board.workflow.kanten || [])
          .filter((k) => !betroffen.includes(k.von) && !betroffen.includes(k.nach));
        board.schritte = board.schritte.filter((s) => !(s
          && typeof s.ref === 'string' && s.ref === eintrag.ref));

        schreibeBoard(board);
        const nachher = liesBoard();
        festhalten('Verweis auf „' + eintrag.ref + '“ herausgenommen', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(nachher)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));


  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/schritt',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const name = String(koerper.name || '').trim().slice(0, 80);
        if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }

        const board = liesBoard();
        const vorhandene = new Set((board.schritte || []).map((x) => x.id));
        const ich = (board.personen || []).find((p) => p.ich);
        board.schritte.push({ id: kennung(name, vorhandene), name, host: ich ? ich.id : '' });
        schreibeBoard(board);
        festhalten('Station „' + name + '“ angelegt', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Welche Dateien ein Schritt anlegt, steht in seiner Anweisung. Die erste
  // genannte ist sein Ergebnis; die Station trägt sie als Ausgang ein.
  // Gelesen wird die Datei in der Ablage — nicht ein installierter Skill.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/skill/dateien',
    handler: (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const name = String(frage.get('name') || '');
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
          sende(res, 400, { dateien: [], error: 'Kein Skill-Name' });
          return;
        }
        const eintrag = leseSchrittSkills(liesBoard()).find((s) => s.name === name);
        if (!eintrag) {
          sende(res, 404, { dateien: [], error: 'Diese Anweisung gibt es nicht: ' + name });
          return;
        }
        const text = readFileSync(join(REPO, eintrag.datei), 'utf8');
        const gesehen = new Set();
        const dateien = [];
        for (const treffer of text.matchAll(/[A-Za-z0-9_.-]+\.md\b/g)) {
          const datei = treffer[0];
          if (datei === 'SKILL.md' || gesehen.has(datei)) continue;
          gesehen.add(datei);
          dateien.push(datei);
          if (dateien.length >= 5) break;
        }
        sende(res, 200, { dateien });
      } catch (error) {
        sende(res, 404, { dateien: [], error: String((error && error.message) || error) });
      }
    },
  }));

  // Der eigene Name und die eigene Farbe. Die Farbe tragen alle Stationen,
  // deren Host dieser Mensch ist.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/person/aendern',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        // Geändert wird nur die eigene Person. Eine fremde Personendatei
        // gehört ihr; diese Route schreibt sie nicht.
        if (String(koerper.id || '') !== String(PERSON_ID)) {
          sende(res, 403, { error: 'Nur die eigene Person lässt sich ändern.' });
          return;
        }
        const board = liesBoard();
        const person = (board.personen || []).find((p) => p.id === String(koerper.id || ''));
        if (!person) { sende(res, 404, { error: 'Diese Person steht nicht im Board' }); return; }
        if (typeof koerper.name === 'string') person.name = koerper.name.trim().slice(0, 40);
        if (typeof koerper.github === 'string') {
          const github = koerper.github.trim().slice(0, 39);
          if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github)) {
            sende(res, 400, { error: 'Der GitHub-Name ist ungültig' });
            return;
          }
          person.github = github;
        }
        if (typeof koerper.farbe === 'string') {
          if (!/^#[0-9a-f]{6}$/i.test(koerper.farbe)) {
            sende(res, 400, { error: 'Die Farbe fehlt' });
            return;
          }
          person.farbe = koerper.farbe;
        }
        schreibeBoard(board);
        // Name, GitHub-Name und Farbe sind die eine Identität über alle
        // Boards. Ändert er sie hier, gilt sie auch beim nächsten Board.
        IDENTITAET = {
          name: String(person.name || '').trim(),
          github: String(person.github || '').trim(),
          farbe: String(person.farbe || '#fbbf24'),
        };
        schreibeIdentitaet(HOME, IDENTITAET);
        festhalten('Person „' + (person.name || person.id) + '“ geändert', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/schritt/aendern',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === String(koerper.id || ''));
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        if (schritt.fremd) {
          sende(res, 403, {
            error: 'Fremder Schritt — geändert wird er in der Workflow-Datei seines Hosts',
          });
          return;
        }

        const vorherName = String(schritt.name || '');
        const neuerName = 'name' in koerper ? String(koerper.name || '').trim().slice(0, 80) : '';
        const alteAusgabe = listeDateien(schritt.ausgabe);

        if ('name' in koerper) {
          const name = String(koerper.name || '').trim().slice(0, 80);
          if (name) schritt.name = name;
        }
        if ('inhalt' in koerper) {
          schritt.inhalt = String(koerper.inhalt == null ? '' : koerper.inhalt).slice(0, MAX_INHALT);
        }
        if ('eingang' in koerper) {
          const eingang = listeDateien(koerper.eingang);
          if (eingang.length) schritt.eingang = eingang; else delete schritt.eingang;
        }
        if ('ausgabe' in koerper) {
          const ausgabe = listeDateien(koerper.ausgabe);
          if (ausgabe.length) schritt.ausgabe = ausgabe; else delete schritt.ausgabe;
        }
        // Der Name ist die Beschriftung; die Datei bleibt, wie sie heißt. Wer
        // umbenennt, ohne einen Ausgang zu nennen, behält den bisherigen —
        // sonst verlöre die Station ihr Dokument an den neuen Namen.
        if (neuerName && neuerName !== vorherName && !listeDateien(schritt.ausgabe).length) {
          schritt.ausgabe = alteAusgabe.length ? alteAusgabe : [vorgabeDatei(vorherName)];
        }
        if ('wie' in koerper) {
          schritt.wie = leseWie(koerper.wie);
          // Der Name des Laufs steht in `wie`, die Datei in der Ablage in
          // `skill`. Beides wird zusammen gesetzt oder zusammen geleert.
          if (schritt.wie.art === 'skill') {
            const eintrag = leseSchrittSkills(board).find((s) => s.name === schritt.wie.wert);
            if (eintrag) schritt.skill = eintrag.datei; else delete schritt.skill;
          } else {
            delete schritt.skill;
          }
        }
        if ('weiter' in koerper) {
          const weiter = String(koerper.weiter || '');
          if (!WEITER_ARTEN.has(weiter)) {
            sende(res, 400, { error: 'Unbekannte Weiterreichung' });
            return;
          }
          if (weiter === 'freigabe') delete schritt.weiter; else schritt.weiter = weiter;
        }

        schreibeBoard(board);
        festhalten(
          neuerName && neuerName !== vorherName
            ? 'Station „' + vorherName + '“ heißt jetzt „' + neuerName + '“'
            : 'Station „' + schritt.name + '“ geändert',
          autorMensch(),
        );
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/schritt/loeschen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === id);
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        // Ein fremder Schritt gehört seinem Host; gelöscht wird er dort. Hier
        // lässt sich nur der Verweis herausnehmen (/board/fremd/entfernen).
        if (schritt.fremd) {
          sende(res, 403, {
            error: 'Fremder Schritt — gelöscht wird er in der Workflow-Datei seines Hosts',
          });
          return;
        }
        const stellen = ((board.workflow && board.workflow.positionen) || [])
          .filter((p) => p.schritt === id).length;
        if (stellen) {
          sende(res, 409, {
            error: 'Die Station steckt an ' + stellen + ' Stelle' + (stellen > 1 ? 'n' : '')
              + ' im Workflow. Nimm ihn dort zuerst heraus.',
          });
          return;
        }
        board.schritte = board.schritte.filter((x) => x.id !== id);
        schreibeBoard(board);
        festhalten('Station „' + schritt.name + '“ gelöscht', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Schritte mit ihrer Anweisung aus der Ablage. Was unter
  // `$DSH_HOME/skills` liegt, ist nur der Einsatz eines Laufs und wird hier
  // nicht angeboten.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/skills',
    handler: (req, res) => {
      try {
        sende(res, 200, { skills: leseSchrittSkills(liesBoard()) });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Eine Anweisung aus der Ablage an eine Station stellen. Die Werkstatt
  // (unten) schreibt sie dorthin; hier wird sie eingetragen, damit niemand sie
  // im Feld suchen muss. Ein fremder Schritt bleibt unverändert.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/skill/eintragen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === String(koerper.schritt || ''));
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        if (schritt.fremd) {
          sende(res, 403, {
            error: 'Fremder Schritt — seine Anweisung liegt bei seinem Host in der Ablage',
          });
          return;
        }

        const name = String(koerper.skill || '').trim();
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
          sende(res, 400, { error: 'Das ist kein Laufname' }); return;
        }
        const eintrag = leseSchrittSkills(board).find((s) => s.name === name);
        if (!eintrag) {
          sende(res, 404, { error: 'Diese Anweisung liegt nicht in der Ablage: ' + name }); return;
        }

        schritt.wie = { art: 'skill', wert: eintrag.name };
        schritt.skill = eintrag.datei;
        schreibeBoard(board);
        festhalten('Anweisung „' + eintrag.schritt + '“ an Station „' + schritt.name
          + '“ eingetragen', autorMensch());
        sende(res, 200, {
          ok: true, skill: eintrag.name, datei: eintrag.datei, ...mitAbleitung(board),
        });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/skill/lauf',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const roh = liesBoard();
        const abgeleitet = mitAbleitung(roh);
        const vorgang = (roh.vorgaenge || []).find((v) => v.id === String(koerper.vorhaben || ''));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        // Auch ein Transkript ist ein Schreiben in den Vorhabenordner: ohne
        // Berechtigung entsteht keine Datei und kein Eintrag.
        if (!darf(vorgang, 'aendern', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }
        const ordner = ordnerVon(vorgang);
        if (!ordner) { sende(res, 400, { error: 'Kein Ordner' }); return; }

        const positionId = String(koerper.position || '');
        const schritt = (abgeleitet.workflow.positionen || []).find((p) => p.id === positionId);
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        const wie = (schritt.abgeleitet && schritt.abgeleitet.wie) || {};
        const skill = wie.art === 'skill' ? wie.wert : '';
        if (!skill) { sende(res, 400, { error: 'An dieser Station steht kein Skill' }); return; }

        const sitzung = String(koerper.session || '').trim()
          || ((sitzungsDateien()[0] || {}).id || '');
        const pfad = sitzungPfad(sitzung);
        if (!pfad) { sende(res, 404, { error: 'Sitzung nicht gefunden' }); return; }

        const bloecke = gespraechAus(leseEreignisse(pfad), skill);
        if (!bloecke) {
          sende(res, 422, {
            error: 'In dieser Sitzung wurde „' + skill + '“ nicht aufgerufen.',
          });
          return;
        }

        const text = transkriptText({
          bloecke, skill, schritt: schritt.name, sitzung,
        });
        const datei = 'transkripte/' + transkriptStamm(positionId) + '-' + zeitStempel() + '.md';
        mkdirSync(join(ordner, 'transkripte'), { recursive: true });
        const ziel = join(ordner, datei);
        writeFileSync(ziel + '.tmp', text, 'utf8');
        renameSync(ziel + '.tmp', ziel);

        vorgang.laeufe = Array.isArray(vorgang.laeufe) ? vorgang.laeufe : [];
        vorgang.laeufe.push({
          position: positionId,
          skill,
          datei,
          sitzung,
          datum: new Date().toLocaleDateString('sv-SE'),
        });
        schreibeBoard(roh);
        festhalten('Skill ' + skill + ' an der Station „' + schritt.name + '“', autorModell());

        sende(res, 200, {
          ok: true,
          datei,
          fragen: bloecke.filter((b) => b.rolle === 'assistant').length,
        });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/transkript',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const positionId = String(frage.get('position') || '');
        const ordner = ordnerVon(vorgang);

        const laeufe = (Array.isArray(vorgang.laeufe) ? vorgang.laeufe : [])
          .filter((l) => l && l.position === positionId)
          .map((l) => {
            const name = String(l.datei || '');
            const kopf = { datei: name, sitzung: l.sitzung, datum: l.datum, skill: l.skill };
            if (!ordner || !/^transkripte\/[a-z0-9-]+\.md$/.test(name)) {
              return { ...kopf, text: '', fehlt: true };
            }
            try {
              return { ...kopf, text: readFileSync(join(ordner, name), 'utf8') };
            } catch {
              return { ...kopf, text: '', fehlt: true };
            }
          })
          .reverse();

        sende(res, 200, { laeufe });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Verbindungen sind die Reihenfolge. Eine Kante führt vom Ausgang eines
  // Schritts zum Eingang des nächsten; Kreise werden abgewiesen.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/kante',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const von = String(koerper.von || '');
        const nach = String(koerper.nach || '');
        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        if (!liste.some((p) => p.id === von) || !liste.some((p) => p.id === nach)) {
          sende(res, 404, { error: 'Station nicht gefunden' }); return;
        }
        if (von === nach) {
          sende(res, 400, { error: 'Eine Station kann nicht auf sich selbst zeigen' }); return;
        }
        const kanten = board.workflow.kanten;
        if (kanten.some((k) => k.von === von && k.nach === nach)) {
          sende(res, 409, { error: 'Diese Verbindung gibt es schon' }); return;
        }
        if (kreist(von, nach, kanten)) {
          sende(res, 409, { error: 'Das ergäbe einen Kreis' }); return;
        }
        kanten.push({ von, nach });
        schreibeBoard(board);
        festhalten('Verbindung gelegt', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/kante/loeschen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const von = String(koerper.von || '');
        const nach = String(koerper.nach || '');
        const board = liesBoard();
        const vorher = (board.workflow.kanten || []).length;
        board.workflow.kanten = (board.workflow.kanten || [])
          .filter((k) => !(k.von === von && k.nach === nach));
        if (board.workflow.kanten.length === vorher) {
          sende(res, 404, { error: 'Diese Verbindung gibt es nicht' }); return;
        }
        schreibeBoard(board);
        festhalten('Verbindung gelöst', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Wie die Fläche angeordnet ist: von Hand gelegt oder vom Board gerechnet.
  // Die Lagen selbst bleiben unberührt — das Umschalten schreibt nur den Modus.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/layout',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const modus = String(koerper.modus || '');
        if (modus !== 'frei' && modus !== 'auto') {
          sende(res, 400, { error: 'Unbekannte Anordnung' }); return;
        }
        const board = liesBoard();
        board.workflow = board.workflow || {};
        board.workflow.layout = modus;
        schreibeBoard(board);
        festhalten(modus === 'auto' ? 'Anordnung: automatisch' : 'Anordnung: frei', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Einstellungen, die nicht zum Workflow gehören, aber zum Board: wie das
  // Mausrad schiebt. Sie stehen im Board, damit sie einen Neustart überleben.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/einstellung',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const name = String(koerper.name || '');
        const wert = String(koerper.wert || '');
        if (name !== 'mausrad' || (wert !== 'seitwaerts' && wert !== 'auf-ab')) {
          sende(res, 400, { error: 'Unbekannte Einstellung' }); return;
        }
        const board = liesBoard();
        board.einstellungen = { ...(board.einstellungen || {}), [name]: wert };
        schreibeBoard(board);
        festhalten(wert === 'seitwaerts' ? 'Mausrad: seitwärts' : 'Mausrad: auf und ab', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/position/platzieren',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        const p = liste.find((x) => x.id === String(koerper.id || ''));
        if (!p) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        const x = Math.round(Number(koerper.x));
        const y = Math.round(Number(koerper.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          sende(res, 400, { error: 'Ungültige Lage' }); return;
        }
        p.x = x;
        p.y = y;
        schreibeBoard(board);
        festhalten('Anordnung geändert', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/position/loeschen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        const stelle = liste.findIndex((p) => p.id === id);
        if (stelle < 0) { sende(res, 404, { error: 'Position nicht gefunden' }); return; }

        const besetzt = (board.vorgaenge || []).filter((v) => v.position === id);
        if (besetzt.length) {
          sende(res, 409, {
            error: 'Dort stehen noch Vorhaben: ' + besetzt.map((v) => v.name).join(', '),
          });
          return;
        }

        const entfernteStelle = liste[stelle];
        liste.splice(stelle, 1);
        board.workflow.kanten = (board.workflow.kanten || [])
          .filter((k) => k.von !== id && k.nach !== id);
        // Ein Verweis ist nur seine Stelle im eigenen Workflow. Ohne Stelle
        // verschwindet auch der Verweis; der fremde Schritt bleibt.
        const entfernt = (board.schritte || []).find(
          (s) => s && typeof s.ref === 'string' && s.id === entfernteStelle.schritt,
        );
        if (entfernt && !(board.workflow.positionen || [])
          .some((p) => p.schritt === entfernt.id)) {
          board.schritte = board.schritte.filter((s) => !(s
            && typeof s.ref === 'string' && s.ref === entfernt.ref));
        }
        schreibeBoard(board);
        festhalten('Station aus dem Workflow genommen', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const name = String(koerper.name || '').trim().slice(0, 120);
        if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }

        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        if (!liste.length) { sende(res, 400, { error: 'Kein Workflow' }); return; }
        board.vorgaenge = Array.isArray(board.vorgaenge) ? board.vorgaenge : [];
        const vorhandene = new Set(board.vorgaenge.map((v) => v.id));
        const id = kennung(name, vorhandene);

        // Ein neues Vorhaben beginnt dort, wo nichts hineinführt.
        const kanten = board.workflow.kanten || [];
        const anfang = liste.find((p) => !kanten.some((k) => k.nach === p.id)) || liste[0];

        mkdirSync(join(VORGANG_DIR, id), { recursive: true });
        // Wer anlegt, verantwortet die erste Station — bis er das Vorhaben
        // weiterreicht.
        board.vorgaenge.push({
          id,
          name,
          position: anfang.id,
          ordner: id,
          verantwortliche: { [anfang.id]: [PERSON_ID] },
          regel: 'einer',
        });

        schreibeBoard(board);
        festhalten('Vorhaben „' + name + '“ angelegt', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben/aendern',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const name = String(koerper.name || '').trim().slice(0, 120);
        if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }

        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === id);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        if (!darf(vorgang, 'aendern', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }
        vorgang.name = name;
        if (koerper.farbe !== undefined) {
          if (typeof koerper.farbe !== 'string' || !/^#[0-9a-f]{6}$/i.test(koerper.farbe)) {
            sende(res, 400, { error: 'Die Farbe fehlt' });
            return;
          }
          vorgang.farbe = koerper.farbe;
        }

        schreibeBoard(board);
        festhalten('Vorhaben „' + name + '“ geändert', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Ein Zweig: dasselbe Vorhaben noch einmal, aber von einer Station aus einen
  // anderen Weg. Er nimmt mit, was bis dahin entstanden ist — die Dateien der
  // Stationen von Anfang bis hierher, nicht die Transkripte: die gehören zu
  // den Gesprächen des Originals. Alles Weitere entsteht im neuen Vorhaben.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben/abzweigen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const station = String(koerper.station || '');
        const ziel = String(koerper.ziel || '');
        const name = String(koerper.name || '').trim().slice(0, 120);
        if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }

        const board = liesBoard();
        const liste = mitAbleitung(board).workflow.positionen || [];
        const von = liste.find((p) => p.id === station);
        const nach = liste.find((p) => p.id === ziel);
        if (!von) { sende(res, 400, { error: 'Station gibt es nicht' }); return; }
        if (!nach) { sende(res, 400, { error: 'Zielstation gibt es nicht' }); return; }
        if (!(von.abgeleitet.nachfolger || []).includes(ziel)) {
          sende(res, 400, {
            error: 'Von „' + von.name + '“ führt kein Weg nach „' + nach.name + '“',
          });
          return;
        }
        const quelle = (board.vorgaenge || []).find((v) => v.id === id);
        if (!quelle) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        // Ein Zweig nimmt Dateien aus dem Quellvorhaben mit; das darf nur, wer
        // es gerade verantwortet.
        if (!darf(quelle, 'aendern', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }

        board.vorgaenge = Array.isArray(board.vorgaenge) ? board.vorgaenge : [];
        const neueId = kennung(name, new Set(board.vorgaenge.map((v) => v.id)));
        const neu = {
          id: neueId,
          name,
          position: ziel,
          ordner: neueId,
          // Der Zweig beginnt an seiner Zielstation; wer ihn anlegt, bleibt
          // dort der Verantwortliche.
          verantwortliche: { [ziel]: [PERSON_ID] },
          regel: 'einer',
        };
        if (quelle.farbe) neu.farbe = quelle.farbe;
        // Die Herkunft steht am Zweig, nicht am Ursprung: der bleibt, wie er
        // war. `station` ist die Station, von der abgezweigt wurde.
        neu.zweig_von = {
          von: quelle.id,
          station,
          datum: new Date().toLocaleDateString('sv-SE'),
        };

        const zielOrdner = join(VORGANG_DIR, neueId);
        mkdirSync(zielOrdner, { recursive: true });
        const altOrdner = ordnerVon(quelle);
        const mit = [];
        if (altOrdner) {
          stationenBis(liste, station).forEach((p) => {
            (p.abgeleitet.ausgabe || []).forEach((datei) => {
              // Ein Ordner geht mit, wie er dasteht — mit allem, was darin liegt.
              if (String(datei).endsWith('/')) {
                if (mit.includes(datei)) return;
                const ordnerQuelle = join(altOrdner, String(datei).slice(0, -1));
                if (!existsSync(ordnerQuelle)) return;
                kopiereOrdner(ordnerQuelle, join(zielOrdner, String(datei).slice(0, -1)));
                mit.push(datei);
                return;
              }
              // Die Notizen einer Station gehören zu ihrer Datei.
              [datei, datei.replace(/\.md$/, '-notizen.md')].forEach((d) => {
                if (mit.includes(d)) return;
                const aus = join(altOrdner, d);
                if (!existsSync(aus)) return;
                copyFileSync(aus, join(zielOrdner, d));
                mit.push(d);
              });
            });
          });
        }

        board.vorgaenge.push(neu);
        schreibeBoard(board);
        festhalten('Zweig „' + name + '“ von „' + quelle.name + '“ ab „' + von.name
          + '“ angelegt', autorMensch());
        sende(res, 200, { ...datenAntwort(mitAbleitung(board)), neu: neueId, mit });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Ein Fork: eine eigene Kopie eines Vorhabens, auch eines fremden. Er
  // übernimmt die Dateien im augenblicklichen Stand und die Station, aber
  // nicht die Läufe: Transkripte und `laeufe` bleiben beim Ursprung. Der
  // fremde Ordner und seine Dateien werden nur gelesen, nie geschrieben.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben/forken',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const board = liesBoard();
        const quelle = (board.vorgaenge || []).find((v) => v.id === id);
        if (!quelle) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const name = String(koerper.name || '').trim().slice(0, 120)
          || (String(quelle.name || 'Vorhaben') + ' — Fork').slice(0, 120);

        board.vorgaenge = Array.isArray(board.vorgaenge) ? board.vorgaenge : [];
        const neueId = kennung(name, new Set(board.vorgaenge.map((v) => v.id)));
        const station = String(quelle.position || '');
        const neu = {
          id: neueId,
          name,
          position: station,
          ordner: neueId,
          // Die eigene Person verantwortet den Fork an der übernommenen Station.
          verantwortliche: { [station]: [PERSON_ID] },
          regel: 'einer',
          rueckkehr: [],
          // Ein Fork beginnt ohne die Läufe des Ursprungs.
          laeufe: [],
          fork_von: quelle.id,
          zweig_von: null,
        };
        if (quelle.farbe) neu.farbe = quelle.farbe;

        const zielOrdner = join(VORGANG_DIR, neueId);
        mkdirSync(zielOrdner, { recursive: true });
        const altOrdner = ordnerVon(quelle);
        const kopiert = altOrdner
          ? kopiereOrdner(altOrdner, zielOrdner, null,
            // Die Läufe bleiben beim Ursprung; die neue vorhaben.json schreibt
            // gleich `schreibeBoard` — die des Ursprungs wird nicht kopiert.
            new Set(['transkripte', 'vorhaben.json']))
          : { dateien: 0, bytes: 0, voll: false };

        board.vorgaenge.push(neu);
        schreibeBoard(board);
        festhalten('Fork „' + name + '“ von „' + quelle.name + '“ angelegt',
          autorMensch());
        sende(res, 200, {
          ...datenAntwort(mitAbleitung(board)),
          neu: neueId,
          dateien: kopiert.dateien,
        });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben/verschieben',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const ziel = String(koerper.position || '');
        // Mit einer nächsten verantwortlichen Person ist das ein Weitergeben,
        // ohne eine ein Verschieben. Beide fragen `darf`.
        const person = String(koerper.person == null ? '' : koerper.person).trim();
        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        const vorgang = (board.vorgaenge || []).find((v) => v.id === id);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        if (!darf(vorgang, person ? 'weitergeben' : 'verschieben', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }
        if (person && !(board.personen || []).some((p) => String(p.id) === person)) {
          sende(res, 400, { error: 'Diese Person gibt es nicht' }); return;
        }
        const zielIndex = liste.findIndex((p) => p.id === ziel);
        if (zielIndex < 0) {
          sende(res, 400, { error: 'Position gibt es nicht' }); return;
        }

        // Der Eintrag an der Zielstation: die genannte Person, sonst der
        // bisherige. Ohne Eintrag bleibt es beim Abgebenden.
        const bisher = verantwortlicheVon(vorgang);
        if (!vorgang.verantwortliche || typeof vorgang.verantwortliche !== 'object'
          || Array.isArray(vorgang.verantwortliche)) {
          vorgang.verantwortliche = {};
        }
        const eingetragen = vorgang.verantwortliche[ziel];
        if (person) {
          vorgang.verantwortliche[ziel] = [person];
        } else if (!Array.isArray(eingetragen) || !eingetragen.length) {
          if (bisher.length) vorgang.verantwortliche[ziel] = bisher.slice();
        }
        vorgang.position = ziel;

        // Ein Rücksprung ist erledigt, sobald das Vorhaben wieder daran vorbei ist.
        for (const r of (Array.isArray(vorgang.rueckkehr) ? vorgang.rueckkehr : [])) {
          if (r.erledigt) continue;
          const nachIndex = liste.findIndex((p) => p.id === r.nach);
          if (nachIndex >= 0 && zielIndex > nachIndex) r.erledigt = true;
        }

        schreibeBoard(board);
        festhalten(person
          ? 'Vorhaben „' + vorgang.name + '“ weitergegeben'
          : 'Vorhaben „' + vorgang.name + '“ verschoben', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben/zurueckschicken',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const id = String(koerper.id || '');
        const nach = String(koerper.nach || '');
        const grund = String(koerper.grund || '').trim().slice(0, 600);
        const board = liesBoard();
        const liste = (board.workflow && board.workflow.positionen) || [];
        const vorgang = (board.vorgaenge || []).find((v) => v.id === id);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        // Zurückschicken ist ein Weitergeben an eine frühere Station — dieselbe
        // Stelle entscheidet.
        if (!darf(vorgang, 'zurueckschicken', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }
        if (!liste.some((p) => p.id === nach)) {
          sende(res, 400, { error: 'Position gibt es nicht' }); return;
        }
        if (!grund) { sende(res, 400, { error: 'Grund fehlt' }); return; }

        // Wie beim Weitergeben: ohne Eintrag an der Zielstation bleibt es beim
        // Abgebenden.
        const von = String(vorgang.position || '');
        const bisher = verantwortlicheVon(vorgang);
        if (!vorgang.verantwortliche || typeof vorgang.verantwortliche !== 'object'
          || Array.isArray(vorgang.verantwortliche)) {
          vorgang.verantwortliche = {};
        }
        if (!Array.isArray(vorgang.verantwortliche[nach])
          || !vorgang.verantwortliche[nach].length) {
          if (bisher.length) vorgang.verantwortliche[nach] = bisher.slice();
        }

        vorgang.rueckkehr = Array.isArray(vorgang.rueckkehr) ? vorgang.rueckkehr : [];
        vorgang.rueckkehr.push({
          von,
          nach,
          grund,
          seit: new Date().toLocaleDateString('sv-SE'),
          erledigt: false,
        });
        vorgang.position = nach;

        schreibeBoard(board);
        festhalten('Vorhaben „' + vorgang.name + '“ zurückgeschickt', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // --- Das Gespräch im Board ------------------------------------------------
  //
  // Die Sitzung ist eine ganz normale Sitzung: sie steht in der Liste, läuft
  // über den Chat und schreibt ihr Transkript wie jede andere. Das Board führt
  // sie nicht selbst — es zeigt das Gespräch und gibt die Antworten weiter.
  //
  // Angelegt wird sie erst beim ersten Senden. Ein Vorhaben, dessen Gespräch
  // noch nicht begonnen hat, hat keine leere Sitzung in der Liste.

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/gespraech/senden',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        let text = String(koerper.text == null ? '' : koerper.text).trim().slice(0, MAX_INHALT * 6);
        if (!text) { sende(res, 400, { error: 'Nichts zu senden' }); return; }

        const steuerung = ctx.get('sessionController');
        if (!steuerung || typeof steuerung.create !== 'function') {
          sende(res, 503, { error: 'Der Host führt hier keine Sitzungen.' }); return;
        }

        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === koerper.vorhaben);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

        // Ein Lauf schreibt in den Vorhabenordner und in die eigene
        // Gesprächsliste. Ein fremdes Vorhaben beginnt hier nicht — auch nicht
        // an einem fremden Schritt, dessen Anweisung in meiner Ablage liegt.
        if (!darf(vorgang, 'aendern', PERSON_ID)) {
          sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
          return;
        }

        // Ein Gespräch gehört zu genau einem Schritt. An einem neuen Schritt
        // entsteht eine neue Sitzung — nicht die von vorhin weitergeführt.
        const position = String(koerper.position || '').trim();
        if (!position) { sende(res, 400, { error: 'Schritt fehlt' }); return; }
        let gespraech = gespraechVon(vorgang, position);
        let einsatz = null;
        if (!gespraech) {
          // Beim Start nimmt der Lauf seine Anweisung aus der Ablage. Sie
          // bleibt unter ihrem Laufnamen im Harness liegen, solange die
          // Sitzung läuft — der Katalog des Harness baut sich erst beim
          // `skill`-Aufruf, also nach dem Start. Erst mit dem Ende der Sitzung
          // (stopp, verwerfen) wird sie wieder weggenommen. Ein Start, der
          // scheitert, hinterlässt keinen Einsatz und kein Gespräch.
          const stelle = (mitAbleitung(board).workflow.positionen || [])
            .find((p) => p.id === position);
          const wie = (stelle && stelle.abgeleitet && stelle.abgeleitet.wie) || {};
          let anweisung = null;
          if (wie.art === 'skill') {
            anweisung = schrittAnweisung(board, position);
            if (!anweisung) {
              sende(res, 409, {
                error: 'An diesem Schritt fehlt die Anweisung in der Ablage.',
              });
              return;
            }
          }
          let angelegt = null;
          try {
            if (anweisung) {
              einsatz = setzeSchrittSkillEin(anweisung);
              // Die Sitzung beginnt mit diesem Namen; der Auftrag nennt ihn,
              // auch wenn der Aufrufer ihn nicht mitgeschickt hat.
              if (!text.includes(anweisung.name)) {
                text = 'Führe den Skill „' + anweisung.name + '“ aus.\n\n' + text;
              }
            }
            const ort = await arbeitsplatz(ctx);
            angelegt = await steuerung.create(ort);
            gespraech = {
              session: angelegt.sessionId,
              position,
              skill: anweisung ? anweisung.name : String(koerper.skill || ''),
              seit: new Date().toISOString(),
              // Der Einsatz wird am Gespräch gemerkt: nur so trifft das
              // Entfernen beim Ende der Sitzung den richtigen Ordner.
              ...(einsatz ? { einsatz } : {}),
            };
            gespraecheVon(vorgang).push(gespraech);
            schreibeBoard(board);
            // Ab hier gehört der Einsatz zur Sitzung und bleibt liegen.
            einsatz = null;
          } catch (fehler) {
            if (angelegt && typeof steuerung.cancel === 'function') {
              try {
                await steuerung.cancel({ sessionId: angelegt.sessionId });
              } catch {
                /* die Sitzung ist nicht mehr erreichbar */
              }
            }
            if (gespraech) {
              vorgang.gespraeche = gespraecheVon(vorgang).filter((g) => g !== gespraech);
              gespraech = null;
            }
            nehmeSchrittSkillWeg(einsatz);
            throw fehler;
          }
        }

        const kennung = 'board-' + Date.now().toString(36) + '-'
          + Math.random().toString(36).slice(2, 8);
        await steuerung.prompt({
          requestId: kennung,
          sessionId: gespraech.session,
          mode: 'queue',
          content: [{ type: 'text', text }],
        }, new AbortController().signal);

        sende(res, 200, { session: gespraech.session, position: gespraech.position });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/gespraech/stand',
    handler: async (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

        const gespraech = gespraechVon(vorgang, frage.get('position') || '');
        if (!gespraech) { sende(res, 200, { session: null }); return; }

        let ereignisse = [];
        const abfrage = ctx.get('sessionQuery');
        if (abfrage && typeof abfrage.readSession === 'function') {
          try {
            const stand = await abfrage.readSession(gespraech.session);
            ereignisse = (stand && stand.events) || [];
          } catch {
            // Die Sitzung ist gerade nicht lesbar; das ist kein Grund,
            // die Spalte zu leeren. Sie zeigt, was zuletzt bekannt ist.
          }
        }

        const dienst = ctx.get('agents');
        const agent = dienst && typeof dienst.get === 'function' ? dienst.get(gespraech.session) : undefined;

        sende(res, 200, {
          session: gespraech.session,
          position: gespraech.position,
          skill: gespraech.skill,
          laeuft: !!(agent && agent.status === 'running'),
          eintraege: gespraechAus(ereignisse) || [],
          fehler: fehlerAus(ereignisse),
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/gespraech/stopp',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === koerper.vorhaben);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const gespraech = gespraechVon(vorgang, koerper.position);
        if (!gespraech) { sende(res, 400, { error: 'Hier läuft kein Gespräch' }); return; }

        const steuerung = ctx.get('sessionController');
        if (!steuerung || typeof steuerung.cancel !== 'function') {
          sende(res, 503, { error: 'Der Host führt hier keine Sitzungen.' }); return;
        }
        const wert = await steuerung.cancel({ sessionId: gespraech.session });
        // Mit dem Ende der Sitzung geht auch ihre Anweisung: der gemerkte
        // Einsatz wird weggenommen, der Vermerk am Gespräch verschwindet.
        nehmeSchrittSkillWeg(gespraech.einsatz);
        delete gespraech.einsatz;
        try {
          schreibeBoard(board);
        } catch {
          // Das Entfernen ist geschehen; der Vermerk bleibt sonst eben stehen.
        }
        sende(res, 200, { gestoppt: !!(wert && wert.accepted) });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/gespraech/verwerfen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === koerper.vorhaben);
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

        const gespraech = gespraechVon(vorgang, koerper.position);
        if (!gespraech) { sende(res, 400, { error: 'Hier gibt es kein Gespräch' }); return; }
        // Verworfen heißt beendet: die eingesetzte Anweisung verschwindet mit
        // der Sitzung.
        nehmeSchrittSkillWeg(gespraech.einsatz);
        vorgang.gespraeche = gespraecheVon(vorgang).filter((g) => g !== gespraech);
        schreibeBoard(board);

        // Die Sitzung verschwindet nicht, sie wandert ins Archiv — dort ist
        // sie wieder zu holen. Ohne Archiv bleibt sie in der Chatliste.
        const bereiche = ctx.get('workspaceController');
        if (gespraech && bereiche && typeof bereiche.archiveSession === 'function') {
          try {
            await bereiche.archiveSession({ sessionId: gespraech.session, stopActivity: true });
          } catch {
            /* kein Archiv: dann bleibt die Sitzung eben in der Liste */
          }
        }

        // Das Board geht mit zurück: die Spalte soll nicht auf einem
        // Gespräch stehen bleiben, das es nicht mehr gibt.
        sende(res, 200, { ...mitAbleitung(board), ok: true, sitzung: gespraech.session });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // --- Die Werkstatt -------------------------------------------------------
  //
  // Ein Skill gehört zur Station, nicht zu einem Vorhaben. Deshalb hängt das
  // Gespräch, in dem er entsteht, am Schritt: `schritte[].werkstatt`. Es ist
  // eine ganz normale Sitzung wie jede andere — das Board zeigt es nur.
  //
  // Der Auftrag kommt vom Board und kennt die Station: ihre Dateien, ihre
  // Nachbarn, die Ablageorte. Er wird nicht hier gebaut, sondern im Board,
  // weil dort steht, was die Station gerade liest und schreibt.

  function werkstattVon(schritt) {
    const w = schritt && typeof schritt === 'object' ? schritt.werkstatt : null;
    if (!w || typeof w !== 'object') return null;
    if (!/^session-[a-z0-9-]+$/.test(String(w.session || ''))) return null;
    return w;
  }

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/werkstatt/senden',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const text = String(koerper.text == null ? '' : koerper.text).trim().slice(0, MAX_INHALT * 6);
        if (!text) { sende(res, 400, { error: 'Nichts zu senden' }); return; }

        const steuerung = ctx.get('sessionController');
        if (!steuerung || typeof steuerung.create !== 'function') {
          sende(res, 503, { error: 'Der Host führt hier keine Sitzungen.' }); return;
        }

        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === String(koerper.schritt || ''));
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }

        let werkstatt = werkstattVon(schritt);
        if (!werkstatt) {
          const ort = await arbeitsplatz(ctx);
          const angelegt = await steuerung.create(ort);
          werkstatt = { session: angelegt.sessionId, seit: new Date().toISOString() };
          schritt.werkstatt = werkstatt;
          schreibeBoard(board);
          festhalten('Werkstatt an Station „' + schritt.name + '“ begonnen', autorMensch());
        }

        const kennung = 'board-' + Date.now().toString(36) + '-'
          + Math.random().toString(36).slice(2, 8);
        await steuerung.prompt({
          requestId: kennung,
          sessionId: werkstatt.session,
          mode: 'queue',
          content: [{ type: 'text', text }],
        }, new AbortController().signal);

        // Die Werkstatt schreibt ihre Anweisung in die Ablage; der Host hält
        // den geänderten Stand als Fassung fest. Der Urheber ist das Modell —
        // es hat die Datei in dieser Sitzung geschrieben.
        festhalten('Anweisung an Station „' + schritt.name + '“ geändert', autorModell());

        sende(res, 200, { session: werkstatt.session, schritt: schritt.id });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/werkstatt/stand',
    handler: async (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === frage.get('schritt'));
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }

        const werkstatt = werkstattVon(schritt);
        if (!werkstatt) { sende(res, 200, { session: null }); return; }

        let ereignisse = [];
        const abfrage = ctx.get('sessionQuery');
        if (abfrage && typeof abfrage.readSession === 'function') {
          try {
            const stand = await abfrage.readSession(werkstatt.session);
            ereignisse = (stand && stand.events) || [];
          } catch {
            // Nicht lesbar ist kein Grund, die Spalte zu leeren.
          }
        }

        const dienst = ctx.get('agents');
        const agent = dienst && typeof dienst.get === 'function' ? dienst.get(werkstatt.session) : undefined;

        sende(res, 200, {
          session: werkstatt.session,
          schritt: schritt.id,
          laeuft: !!(agent && agent.status === 'running'),
          eintraege: gespraechAus(ereignisse) || [],
          fehler: fehlerAus(ereignisse),
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/werkstatt/stopp',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === String(koerper.schritt || ''));
        const werkstatt = werkstattVon(schritt);
        if (!werkstatt) { sende(res, 400, { error: 'Hier läuft kein Gespräch' }); return; }

        const steuerung = ctx.get('sessionController');
        if (!steuerung || typeof steuerung.cancel !== 'function') {
          sende(res, 503, { error: 'Der Host führt hier keine Sitzungen.' }); return;
        }
        const wert = await steuerung.cancel({ sessionId: werkstatt.session });
        sende(res, 200, { gestoppt: !!(wert && wert.accepted) });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/werkstatt/verwerfen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const board = liesBoard();
        const schritt = (board.schritte || []).find((x) => x.id === String(koerper.schritt || ''));
        if (!schritt) { sende(res, 404, { error: 'Station nicht gefunden' }); return; }
        const werkstatt = werkstattVon(schritt);
        if (!werkstatt) { sende(res, 400, { error: 'Hier gibt es kein Gespräch' }); return; }

        delete schritt.werkstatt;
        schreibeBoard(board);
        festhalten('Werkstatt an Station „' + schritt.name + '“ verworfen', autorMensch());

        const bereiche = ctx.get('workspaceController');
        if (bereiche && typeof bereiche.archiveSession === 'function') {
          try {
            await bereiche.archiveSession({ sessionId: werkstatt.session, stopActivity: true });
          } catch {
            /* kein Archiv: dann bleibt die Sitzung in der Liste */
          }
        }

        sende(res, 200, { ...mitAbleitung(board), ok: true, sitzung: werkstatt.session });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Was außerhalb des Boards geschrieben wird — in einer Sitzung, durch ein
  // Werkzeug —, wird spätestens nach einer Minute festgehalten. So bleibt kein
  // Stand ohne Fassung; das Modell ist dann der Urheber.
  ctx.effect(() => {
    const uhr = setInterval(() => {
      festhalten('Änderung außerhalb des Boards', autorModell());
    }, 60000);
    return () => clearInterval(uhr);
  });
}
