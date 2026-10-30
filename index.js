/**
 * Host-Hälfte des Board-Plugins.
 *
 * Routen: die vollständige Liste steht in `docs/routen.md`. Hier nur die
 * Gruppen — Fläche und Board, Workflow und Stationen, Vorhaben und Dateien,
 * GitHub (Token, Beiträge, Fragen, Teams), Gespräch und Werkstatt, Sprache und
 * Darstellung. Eine Liste im Kopf wurde bewusst entfernt: sie hielt mit den
 * `registriere`-Aufrufen unten nicht Schritt. Maßgeblich ist der Code.
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
import { fileURLToPath } from 'node:url';
import {
  join, relative, resolve, sep, basename, dirname, isAbsolute,
} from 'node:path';
import {
  FORMAT, liesFormat, pruefeFormat,
  liesAblage, schreibeAblage, liesPersonen, liesWorkflows,
} from './ablage.js';
import {
  hauptboardAdresse, istHauptboard, ladeRegister, ladeIdentitaet, schreibeIdentitaet,
  verbindeBoard, entferneBoard, kennzahlenVon, schreibeRegister, nimmBoardAuf,
  AKZENTE, liesDarstellung, schreibeDarstellung,
} from './boards.js';
import { sicherstellen, wiederholen } from './erststart.js';
import {
  erstelleClient, liesToken, schreibeToken, loescheToken, liesLogin,
} from './github.js';
import { komponiere, liesStationAufFassung } from './komposition.js';
import { sammleKatalog, sucheKatalog, stationZahlen } from './katalog.js';
import { gleicheAlleAb, zusammenfassen } from './abgleich.js';
import { liesBoard as liesBoardFassung2, schreibeBoard as schreibeBoardFassung2 } from './formate/board.js';
import { liesStation } from './formate/station.js';
import { liesWorkflow, schreibeFassung, schreibeWorkflow } from './formate/workflow.js';
import { liesVorhaben, schreibeVorhaben } from './formate/vorhaben.js';
import { cachePfad, liesRepo } from './repos.js';
import {
  ORGANISATION, darfSchreiben, schreibrecht, istVerantwortlich, pruefeVerweise,
  sichtbarkeitVon, GRUND_OHNE_TOKEN, HINWEIS_OHNE_TOKEN, GRUND_NICHT_PRUEFBAR,
  HINWEIS_NICHT_PRUEFBAR,
} from './rechte.js';

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

/**
 * Wer in ein Repository der Fassung 2 schreibt: die eigene Identität. Sie
 * liegt außerhalb der Ablage; fehlt ihr Name, gilt der bisherige Weg.
 */
function autorFassung2() {
  const name = String((IDENTITAET && IDENTITAET.name) || '').trim();
  return name ? [name, autorAdresse(name)] : autorMensch();
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
      // Ein Archiv der Fassung 1 heißt „Archiv“; sein gespeicherter Name
      // steht als `nameAlt` daneben. Die Seite erkennt daran den Lesemodus.
      ...(b.archiv ? { archiv: true, nameAlt: b.nameAlt } : null),
      art: b.art,
      format: b.format,
      remote: b.remote,
      person: b.person,
      // Jedes Board trägt seine Sichtbarkeit; sie kommt aus seiner Umgebung.
      // Das Hauptboard trägt sie im Register, weil sein Ordner fehlen kann.
      sichtbarkeit: b.sichtbarkeit || sichtbarkeitVon(HOME, b.repo),
      // Ein gescheiterter Erstversuch bleibt so lange sichtbar, bis er
      // gelungen ist.
      ...(b.fehler ? { fehler: b.fehler } : null),
      aktiv: b.id === REGISTER.aktiv,
    })),
  };
}

/**
 * Das Hauptboard für den Katalog. Neben dem alten Board der Fassung 1 kann ein
 * Eintrag mit derselben Art liegen; gemeint ist das Board der Fassung 2, nicht
 * der ältere Eintrag mit der Kennung „hauptboard“.
 */
function hauptboardFuerKatalog() {
  const boards = Array.isArray(REGISTER.boards) ? REGISTER.boards : [];
  return boards.find((b) => b && b.art === 'hauptboard' && b.format === 2)
    || boards.find((b) => b && b.id === 'hauptboard' && b.format === 2)
    || null;
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
 * Ist das offene Board ein Archiv? Eine Ablage der Fassung 1 kann im Register
 * `archiv: true` tragen. Dann bleibt sie lesbar; alle schreibenden Wege werden
 * abgewiesen, bevor die Ablage angefasst wird. `BOARD_ARCHIV=1` erzwingt
 * dasselbe für jede Fassung-1-Ablage, damit die Abweisung schon vor der
 * Markierung des echten Archivs geprüft werden kann. Fassung 2 bleibt
 * unberührt: ihr `archiv` gilt nicht.
 */
function istArchiv(board) {
  if (!board || board.format !== 1) return false;
  return board.archiv === true
    || ['1', 'true', 'ja'].includes(String(process.env.BOARD_ARCHIV || '').toLowerCase());
}

/**
 * Die Prüfung vor jedem Schreiben: Das Programm kennt `FORMAT`; nennt die
 * Ablage eine andere Zahl, wird nichts geschrieben. Der Fehler trägt 409 und
 * den Text mit der Zahl der Ablage — die Route gibt ihn unverändert weiter.
 */
function pruefeFormatVorSchreiben() {
  if (!REPO) return;
  // Ein Board der Fassung 2 hat keine `format`-Datei: seine Fassung steht in
  // jeder Formatdatei selbst und wird beim Lesen und beim Schreiben geprüft.
  if (AKTIV && AKTIV.format === 2) return;
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
 *
 * `ordner` ist das Repository, in dem der Befehl läuft; ohne Angabe die Ablage.
 * Ein Vorhaben der Fassung 2 führt sein eigenes Repository.
 */
function git(args, autor, grenzeMs, ordner) {
  const ziel = ordner || REPO;
  if (!ziel) return { ok: false, out: '', fehler: 'Keine Ablage konfiguriert' };
  const satz = [
    '-C', ziel,
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
 * Das Board für die Lese-Routen: Fassung 1 kommt wie bisher aus der Ablage,
 * Fassung 2 aus der Komposition über ihre Repositories.
 */
function boardFuerDateien() {
  if (AKTIV && AKTIV.format === 2) {
    return komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
  }
  return liesBoard();
}

/**
 * Der Ordner eines Vorhabens. In Fassung 1 ist das ein Name unter
 * `vorgaenge/`, in Fassung 2 der absolute Pfad seines Repositories aus der
 * Komposition. Fehlt der Verweis, bleibt der Ordner leer.
 */
function ordnerFuerVorgang(vorgang) {
  if (AKTIV && AKTIV.format === 2) {
    const ordner = String((vorgang && vorgang.ordner) || '').trim();
    return ordner ? resolve(ordner) : '';
  }
  return ordnerVon(vorgang);
}

/**
 * Das Repository, in dem die Dateien eines Vorhabens gefasst werden. In der
 * alten Ablage ist das das Board-Repository; in Fassung 2 führt jedes Vorhaben
 * sein eigenes.
 */
function repoFuerVorgang(ordner) {
  return AKTIV && AKTIV.format === 2 ? ordner : REPO;
}

/**
 * Ein lokaler Verweis aus einem Repository. Eine Adresse bleibt ohne Pfad:
 * sie liegt nicht auf diesem Rechner. Ein leerer Verweis ebenso. Ein nackter
 * Name meint den Geschwisterordner; `owner/name` wird über den
 * Zwischenspeicher dieses Eigentümers aufgelöst — so liest eine Route auch
 * den Verweis, den sie selbst als `owner/name` schreibt.
 */
function ortImRepo(verweis, basis) {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text || /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(text)) return '';
  const direkt = resolve(basis, text);
  if (existsSync(direkt)) return direkt;
  if (!text.includes('/') && !text.includes('\\')) {
    const neben = resolve(dirname(basis), text);
    if (existsSync(neben)) return neben;
  }
  const teile = text.split('/');
  if (teile.length === 2 && teile[0].trim() && teile[1].trim()) {
    const zwischen = cachePfad(HOME, teile[0].trim(), teile[1].trim());
    if (zwischen && existsSync(zwischen)) return zwischen;
  }
  return direkt;
}

/* --- Beiträge: das Repository hinter einem Ding ------------------------- */

/** Ein GitHub-Remote oder eine GitHub-Adresse als `{ owner, name }`. */
const GITHUB_REMOTE_MUSTER = /github\.com[:/]+([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/i;
/** Ein bloßes `owner/name`. */
const REPO_KURZ_MUSTER = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

function githubAdresse(owner, name) {
  return 'https://github.com/' + owner + '/' + name;
}

/**
 * Liegt dieses Repository bei GitHub? Ein anderer Remote — eine Prüffläche,
 * ein eigener Server — macht es nicht zu einem Repository mit Identität.
 */
function hatGithubRemote(pfad) {
  const lauf = git(['remote', 'get-url', 'origin'], null, 5000, pfad);
  return lauf.ok && GITHUB_REMOTE_MUSTER.test(String(lauf.out).trim());
}

/**
 * Das GitHub-Repository hinter einem Verweis. Verstanden werden `owner/name`,
 * eine GitHub-Adresse und ein lokaler Ordner mit GitHub-Remote. `pfad` steht
 * nur da, wenn der Ordner hier liegt — er trägt das Schreibrecht.
 */
function githubZielAus(verweis) {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text) return { fehler: 'Das Repository fehlt' };
  // Ein vorhandener Ordner hat Vorrang: sein Name kann wie `owner/name`
  // aussehen, gemeint ist dann trotzdem der lokale Ort.
  const direkt = resolve(text);
  if (existsSync(direkt) && statSync(direkt).isDirectory()) {
    const lauf = git(['remote', 'get-url', 'origin'], null, 5000, direkt);
    const fern = lauf.ok ? String(lauf.out).trim() : '';
    const treffer = fern.match(GITHUB_REMOTE_MUSTER);
    if (!treffer) {
      return { fehler: 'Dieses Repository hat keinen GitHub-Remote: ' + direkt };
    }
    return { owner: treffer[1], name: treffer[2], pfad: direkt };
  }
  const adresse = text.match(GITHUB_REMOTE_MUSTER);
  if (adresse) return { owner: adresse[1], name: adresse[2], pfad: '' };
  const kurz = text.match(REPO_KURZ_MUSTER);
  if (kurz) return { owner: kurz[1], name: kurz[2], pfad: '' };
  return { fehler: 'Bitte das Repository als owner/name angeben' };
}

/**
 * Der Verweis, den ein neues Schreiben für ein lokales Repository einträgt:
 * `owner/name`, wenn ein GitHub-Remote vorhanden ist; sonst der Ordnername.
 * Ein absoluter Pfad wird so nie geschrieben, und ein Eigentümer wird nicht
 * erfunden — ohne Remote gibt es keine Adresse, die auf einem anderen Rechner
 * gälte.
 */
function verweisFuerRepo(pfad) {
  const text = String(pfad == null ? '' : pfad).trim();
  if (!text) return '';
  const ziel = githubZielAus(text);
  if (ziel && ziel.owner && ziel.name) return ziel.owner + '/' + ziel.name;
  return basename(resolve(text));
}

/**
 * Die Repositories des offenen Boards mit ihrem GitHub-Ziel. Nur diese
 * dürfen beschrieben werden: das Board nennt sie in `board.json`, in einem
 * Workflow oder in einem Vorhaben. Ein lokaler Ordner allein sagt nichts
 * über seine Zugehörigkeit — auch nicht, wenn sein Remote passt.
 */
function boardRepos() {
  if (!REPO || !AKTIV || AKTIV.format !== 2) return [];
  let board;
  try {
    board = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
  } catch {
    return [];
  }
  const liste = [];
  for (const stand of (Array.isArray(board.staende) ? board.staende : [])) {
    const pfad = String((stand && stand.pfad) || '');
    if (!pfad || !existsSync(pfad)) continue;
    const lauf = git(['remote', 'get-url', 'origin'], null, 5000, pfad);
    const treffer = lauf.ok ? String(lauf.out).trim().match(GITHUB_REMOTE_MUSTER) : null;
    if (!treffer) continue;
    liste.push({ pfad: resolve(pfad), owner: treffer[1], name: treffer[2] });
  }
  return liste;
}

/**
 * Der Ordner im offenen Board zu einem Verweis. Nennt das Board das
 * Repository nicht, bleibt das Ergebnis leer — und die Route schreibt nicht.
 * Ein genannter Ordner zählt nur an seinem eigenen Pfad, nicht als Kopie.
 */
function boardPfadFuer(ziel) {
  const alle = boardRepos();
  if (ziel && ziel.pfad) {
    const ort = resolve(ziel.pfad);
    const treffer = alle.find((eintrag) => eintrag.pfad === ort);
    return treffer ? treffer.pfad : '';
  }
  if (!ziel || !ziel.owner || !ziel.name) return '';
  const gesucht = (ziel.owner + '/' + ziel.name).toLowerCase();
  const treffer = alle.find(
    (eintrag) => (eintrag.owner + '/' + eintrag.name).toLowerCase() === gesucht,
  );
  return treffer ? treffer.pfad : '';
}

/** Die erste Zeile einer Meldung — die Antwort soll kurz bleiben. */
function kurzZeile(fehler) {
  return String((fehler && fehler.message) || fehler).split('\n')[0].trim();
}

/**
 * Die Fassung eines Repositories: sein letzter Tag, sonst der Stand von HEAD.
 * Eine Station ohne Fassung bekommt keinen erfundenen Namen; die Route weist
 * sie ab, bevor sie den Workflow schreibt. Für einen Workflow gilt dasselbe:
 * der letzte Tag oder HEAD wird zu seiner festen Fassung im Board.
 */
function fassungDesRepos(ordner) {
  const tag = git(['describe', '--tags', '--abbrev=0'], null, undefined, ordner);
  if (tag.ok && tag.out.trim()) return tag.out.trim();
  const kopf = git(['rev-parse', 'HEAD'], null, undefined, ordner);
  return kopf.ok ? kopf.out.trim() : '';
}

/** Trägt diese Fassung eine `station.json`? Nur dann ist sie für den Workflow eine. */
function fassungMitStation(ordner, fassung) {
  const wert = String(fassung == null ? '' : fassung).trim();
  if (!wert || wert.startsWith('-')) return false;
  return git(['rev-parse', '--verify', '--quiet', wert + ':station.json'],
    null, 5000, ordner).ok;
}

/**
 * Die Fassung einer Station, die ein Workflow fortschreibt: der letzte Tag,
 * wenn er eine `station.json` trägt; sonst der kurze HEAD. Der volle
 * 40-Zeichen-Hash wird nie geschrieben — ein Tag wird nicht erfunden.
 */
function fassungZumFestschreiben(ordner) {
  const tag = git(['describe', '--tags', '--abbrev=0'], null, undefined, ordner);
  const fassung = tag.ok ? tag.out.trim() : '';
  if (fassung && fassungMitStation(ordner, fassung)) return fassung;
  const kopf = git(['rev-parse', '--short', 'HEAD'], null, undefined, ordner);
  return kopf.ok ? kopf.out.trim() : '';
}

/**
 * Die Fassung, die ein Nachziehen nimmt, wenn keine genannt ist: der neueste
 * Tag, wenn er eine `station.json` trägt; sonst der kurze HEAD. Ein Tag wird
 * nicht erfunden — steht in der Station nichts, was als Fassung taugt, bleibt
 * das Ergebnis leer.
 */
function fassungFuerStation(ordner) {
  const tag = git(['describe', '--tags', '--abbrev=0'], null, undefined, ordner);
  const kandidat = tag.ok ? tag.out.trim() : '';
  if (kandidat && fassungMitStation(ordner, kandidat)) return kandidat;
  const kopf = git(['rev-parse', '--short', 'HEAD'], null, undefined, ordner);
  return kopf.ok ? kopf.out.trim() : '';
}

/**
 * Der neueste Tag, wenn er hinter der eingetragenen Fassung liegt; sonst
 * leer. Nur dann bietet die Seite „Fassung nachziehen“ an — ein Tag auf einem
 * anderen Zweig ist nicht neuer, sondern ein anderer.
 */
function neuereFassung(ordner, eingetragen) {
  const alt = String(eingetragen == null ? '' : eingetragen).trim();
  if (!alt || alt.startsWith('-')) return '';
  const tag = git(['describe', '--tags', '--abbrev=0'], null, undefined, ordner);
  const neuester = tag.ok ? tag.out.trim() : '';
  if (!neuester || neuester === alt) return '';
  if (!fassungMitStation(ordner, neuester)) return '';
  if (!git(['rev-parse', '--verify', '--quiet', alt + '^{commit}'],
    null, undefined, ordner).ok) {
    // Die eingetragene Fassung gibt es nicht: der neueste Tag ist der Weg
    // zurück auf einen Stand, den das Repository kennt.
    return neuester;
  }
  if (!git(['merge-base', '--is-ancestor', alt, neuester], null, undefined, ordner).ok) {
    return '';
  }
  return neuester;
}

/**
 * Das Vertrauensbild einer Station: was in ihrem Repository steht, welche
 * Fassung gilt und welche Workflows des Boards sie nennen. Sterne, Releases,
 * Fragen und Beiträge kommen aus dem Katalog-Zwischenspeicher und von GitHub;
 * sie werden in der Route ergänzt.
 */
function stationBild(board, boardOrt, ort, station) {
  // Ohne README bleibt `readme` null; die Seite sagt dann „kein README“.
  let readme = null;
  try {
    readme = readFileSync(join(ort, 'README.md'), 'utf8');
  } catch {
    /* kein README */
  }

  // Die Beispiele: die Dateien unter `examples/` und `beispiele/`, dazu die
  // Namen aus `station.json`, die noch nicht als Datei dastehen.
  const beispiele = [];
  for (const ordnerName of ['examples', 'beispiele']) {
    try {
      const dateien = readdirSync(join(ort, ordnerName), { withFileTypes: true })
        .filter((eintrag) => eintrag.isFile())
        .map((eintrag) => eintrag.name)
        .sort((a, b) => a.localeCompare(b, 'de'));
      for (const name of dateien) {
        if (!beispiele.includes(name)) beispiele.push(name);
      }
    } catch {
      /* kein solcher Ordner */
    }
  }
  for (const eintrag of station.beispiele) {
    const name = typeof eintrag === 'string'
      ? eintrag.trim()
      : (eintrag && typeof eintrag === 'object'
        ? String(eintrag.name || eintrag.datei || '').trim()
        : '');
    if (name && !beispiele.includes(name)) beispiele.push(name);
  }

  // Die Verwendung: jeder Workflow des Boards, der auf dieses Repository
  // verweist — mit Titel und der Fassung, die dort festgelegt ist.
  const verwendung = [];
  let fassung = '';
  for (const verweis of board.workflows) {
    const workflowOrt = ortImRepo(verweis.repo, boardOrt);
    if (!workflowOrt) continue;
    let workflow;
    try {
      workflow = liesWorkflow(workflowOrt);
    } catch {
      continue;
    }
    const treffer = workflow.stationen.find(
      (eintrag) => ortImRepo(eintrag.repo, workflowOrt) === ort,
    );
    if (!treffer) continue;
    verwendung.push({
      id: workflow.id,
      titel: workflow.titel,
      fassung: treffer.fassung,
      repo: workflowOrt,
    });
    if (!fassung) fassung = treffer.fassung;
  }
  // Ohne Workflow-Verweis gilt der letzte Tag, sonst der Stand von HEAD.
  if (!fassung) fassung = fassungDesRepos(ort);

  // Gezeigt wird die Station so, wie sie auf der genannten Fassung steht —
  // dieselben Regeln wie in der Komposition. Fehlt die Fassung oder ihre
  // `station.json`, gilt der aktuelle Stand; `fassungFehlt` sagt es.
  let gezeigt = station;
  let fassungFehlt = false;
  if (fassung) {
    const aufFassung = liesStationAufFassung(ort, fassung);
    if (aufFassung.station) gezeigt = aufFassung.station;
    else fassungFehlt = true;
  }

  return {
    format: 2,
    id: gezeigt.id,
    name: gezeigt.name,
    beschreibung: gezeigt.beschreibung || null,
    host: gezeigt.host,
    aktion: { ...gezeigt.aktion },
    reife: gezeigt.reife,
    lizenz: gezeigt.lizenz,
    tags: gezeigt.tags,
    fassung: fassung || null,
    fassungFehlt,
    // Ein neuerer Tag als die eingetragene Fassung: erst dann lässt sie sich
    // nachziehen. Sonst bleibt der Knopf weg.
    nachziehen: fassung ? (neuereFassung(ort, fassung) || null) : null,
    beispiele,
    verwendung,
    repo: ort,
    readme,
  };
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
 * `repo` ist das Repository, in dem gefasst wird: ohne Angabe die Ablage, in
 * Fassung 2 das eigene Repository des Vorhabens.
 */
function dateiBasis(ordner, name, repo = REPO) {
  if (!repo || !ordner || String(name).endsWith('/')) return null;
  const pfad = relative(repo, join(ordner, name)).split(sep).join('/');
  if (!pfad || pfad.startsWith('../')) return null;
  const log = git(['log', '-1', '--format=%H', '--', pfad], null, undefined, repo);
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
 * Eine Datei im Vorhaben: der Name, den `dateiName` aus der Eingabe macht, und
 * der aufgelöste Pfad. Ein absoluter Pfad, ein `..` im Weg oder ein Ausbruch
 * aus dem Ordner ist ein Fehler — auch dann, wenn `dateiName` daraus einen
 * harmlosen Namen machen würde. Ein Ordner ist keine Datei.
 * Zurück kommt `{ name, ziel }` oder `{ fehler }`.
 */
function dateiImVorhaben(ordner, eingabe) {
  const roh = String(eingabe == null ? '' : eingabe).trim();
  const teile = roh.split(/[\\/]/);
  if (!roh || roh.startsWith('/') || roh.startsWith('\\')
    || /^[A-Za-z]:/.test(roh) || teile.includes('..')) {
    return { fehler: 'Ungültiger Dateiname' };
  }
  const name = dateiName(roh);
  if (!name) return { fehler: 'Ungültiger Dateiname' };
  if (name.endsWith('/')) return { fehler: 'Ein Ordner ist keine Datei' };
  const ziel = pfadImOrdner(ordner, name);
  if (!ziel) return { fehler: 'Ungültiger Dateiname' };
  try {
    if (statSync(ziel).isDirectory()) return { fehler: 'Ein Ordner ist keine Datei' };
  } catch {
    /* Die Datei gibt es noch nicht — das ist der Normalfall beim Anlegen. */
  }
  return { name, ziel };
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
 * Wo ein Verweis eines Repositories liegt: ein Pfad relativ zu seinem Ordner,
 * ein nackter Name zuerst als Geschwisterordner. Eine Adresse bleibt leer.
 */
function lokalerOrt(verweis, basis) {
  const text = String(verweis == null ? '' : verweis).trim();
  if (!text || /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/i.test(text)) return '';
  const direkt = resolve(basis, text);
  if (existsSync(direkt)) return direkt;
  if (!text.includes('/') && !text.includes('\\')) {
    const neben = resolve(dirname(basis), text);
    if (existsSync(neben)) return neben;
  }
  return direkt;
}

/** Ein neues Repository anlegen und seinen ganzen Inhalt festschreiben. */
function legeRepoAn(ordner, nachricht, autor) {
  const init = git(['init', '-b', 'main'], null, 20000, ordner);
  if (!init.ok) {
    throw fehlerMit('Das Repository ließ sich nicht anlegen: '
      + kurzZeile(init.fehler), 500);
  }
  const add = git(['add', '-A'], null, 20000, ordner);
  if (!add.ok) {
    throw fehlerMit('Die Dateien ließen sich nicht aufnehmen: '
      + kurzZeile(add.fehler), 500);
  }
  const commit = git(['commit', '-m', nachricht], autor, 20000, ordner);
  if (!commit.ok) {
    throw fehlerMit('Die Fassung ließ sich nicht festschreiben: '
      + kurzZeile(commit.fehler), 500);
  }
}

/** Eine freie Kennung für ein neues Board unter den Ablagen. */
function freieBoardKennung(name) {
  const basis = slug(name) || 'board';
  const besetzt = new Set((REGISTER.boards || []).map((b) => b.id));
  let id = basis;
  let nummer = 2;
  while (besetzt.has(id) || existsSync(join(HOME, 'board', 'ablagen', id))) {
    id = basis + '-' + nummer;
    nummer += 1;
  }
  return id;
}

/** Das Probeprojekt des Hauptboards, wenn keines genannt ist. */
function probeprojektDesHauptboards() {
  const haupt = hauptboardFuerKatalog();
  if (!haupt) return null;
  let board;
  try {
    board = liesBoardFassung2(haupt.repo);
  } catch {
    return null;
  }
  for (const verweis of board.vorhaben) {
    const ort = lokalerOrt(verweis.repo, haupt.repo);
    if (!ort || !existsSync(join(ort, 'vorhaben.json'))) continue;
    if (basename(ort) === 'vorhaben-probeprojekt') return ort;
    try {
      if (liesVorhaben(ort).id === 'probeprojekt') return ort;
    } catch { /* der nächste Verweis */ }
  }
  return null;
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

/* --- Teams ---------------------------------------------------------------- */

/** Das kurze Gedächtnis der Teams, wie beim Katalog: zehn Minuten je Organisation. */
const TEAM_ZWISCHENSPEICHER = new Map();

function teamCacheTtl() {
  const text = String(process.env.DSH_BOARD_CACHE_TTL || '').trim();
  if (!text) return 10 * 60 * 1000;
  const zahl = Number(text);
  return Number.isFinite(zahl) && zahl >= 0 ? zahl : 10 * 60 * 1000;
}

/**
 * Die Teams einer Organisation mit ihren Mitgliedern. Ohne Token gibt es
 * keine Teams: `{kann:false, hinweis:'Teams nur mit Token'}`. Mit Token wird
 * je Team die Mitgliederliste geholt; das Ergebnis gilt zehn Minuten,
 * `DSH_BOARD_CACHE_TTL` überschreibt die Zeit, `frisch` umgeht sie. Ist
 * GitHub nicht erreichbar, kommt der letzte Stand mit einem Hinweis.
 */
async function holeTeams(org = ORGANISATION, { frisch = false } = {}) {
  const ziel = String(org == null ? '' : org).trim() || ORGANISATION;
  const token = liesToken(HOME);
  if (!token) {
    return { kann: false, teams: [], hinweis: 'Teams nur mit Token' };
  }
  const jetzt = Date.now();
  const treffer = TEAM_ZWISCHENSPEICHER.get(ziel) || null;
  if (!frisch && treffer && jetzt - treffer.am < teamCacheTtl()) {
    return { kann: true, teams: treffer.teams, hinweis: '' };
  }

  const client = erstelleClient({ home: HOME, token });
  try {
    const roh = await client.teams(ziel, { frisch });
    const teams = [];
    for (const team of roh) {
      let mitglieder = [];
      try {
        mitglieder = (await client.teamMitglieder(ziel, team.slug, { frisch }))
          .map((eintrag) => String((eintrag && eintrag.login) || ''))
          .filter(Boolean);
      } catch {
        // Ein Team, dessen Mitglieder nicht lesbar sind, bleibt ohne sie.
      }
      teams.push({
        name: team.name || team.slug,
        // Der Schlüssel heißt bei GitHub `slug`; die Seite liest `schluessel`,
        // `key` bleibt für ältere Aufrufer stehen.
        key: team.slug,
        schluessel: team.slug,
        beschreibung: team.beschreibung || '',
        sichtbarkeit: team.sichtbarkeit || '',
        mitglieder,
      });
    }
    TEAM_ZWISCHENSPEICHER.set(ziel, { am: jetzt, teams });
    return { kann: true, teams, hinweis: '' };
  } catch (fehler) {
    if (treffer) {
      return {
        kann: true,
        teams: treffer.teams,
        hinweis: 'GitHub nicht erreichbar; letzter Stand',
      };
    }
    return {
      kann: true,
      teams: [],
      hinweis: 'Teams nicht gelesen: ' + kurzZeile(fehler),
    };
  }
}

/**
 * Verantwortet die eigene Identität das Vorhaben an dieser Stelle? Zuerst
 * entscheidet die Eintragung, dann — nur mit Remote — das Team. Die Teams
 * werden erst geholt, wenn die Eintragung nicht reicht.
 */
async function verantwortetVorhaben(vorgang, position, ordner) {
  const lokal = !hatGithubRemote(ordner);
  const basis = {
    vorhaben: vorgang,
    position: String(position == null ? '' : position),
    identitaet: IDENTITAET,
    teams: null,
    org: ORGANISATION,
    lokal,
  };
  if (istVerantwortlich(basis)) return true;
  if (lokal) return false;
  const geholt = await holeTeams(ORGANISATION);
  return istVerantwortlich({ ...basis, teams: geholt.teams });
}

/**
 * Darf die eigene Identität diese Station in den Workflow stellen? Host der
 * Station, Autor des Workflows oder — nur mit Remote — das Team `workflows`.
 */
async function verantwortetStation({ station, workflow, lokal }) {
  const stelle = String((station && station.id) || 'station');
  const liste = [station && station.host, workflow && workflow.autor]
    .map((eintrag) => String(eintrag == null ? '' : eintrag).trim())
    .filter(Boolean);
  const basis = {
    vorhaben: { verantwortliche: { [stelle]: liste } },
    position: stelle,
    identitaet: IDENTITAET,
    teams: null,
    org: ORGANISATION,
    lokal: Boolean(lokal),
    art: 'workflow',
  };
  if (istVerantwortlich(basis)) return true;
  if (basis.lokal) return false;
  const geholt = await holeTeams(ORGANISATION);
  return istVerantwortlich({ ...basis, teams: geholt.teams });
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
 * Die Form, die die Seite liest: eine Fläche je Person, die eigene zuerst.
 * `workflow` und `schritte` der alten Antwort entfallen; die eigene Fläche
 * steht als erster Workflow der eigenen Person darin.
 */
function datenAntwort(board) {
  // Ein Archiv ist lesbar, aber nicht beschreibbar. Die Seite sieht denselben
  // Schalter wie bei fehlendem Schreibrecht: `darf: false` nimmt ihre
  // Schreibknöpfe weg, ohne die Dateien und Vorhaben zu verbergen.
  const archiv = istArchiv(AKTIV);
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
    if (archiv) {
      // Im Archiv gibt es keine Handlung am Vorhaben — auch dann nicht, wenn
      // die eigene Person sie sonst verantwortet. Der Host weist ohnehin ab.
      vorgang.darf = { aendern: false, verschieben: false, weitergeben: false,
        zurueckschicken: false, entscheiden: false };
    }
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
    ...(archiv ? { archiv: true, darf: false } : null),
    workflows,
    // Alle Stationen, auf die ein Board der Fassung 2 verweist — auch die,
    // die noch in keinem Workflow stehen. Fassung 1 kennt das Feld nicht.
    ...(Array.isArray(board.stationen) ? { stationen: board.stationen } : null),
    vorgaenge,
    beitraege,
    personen,
    einstellungen: board.einstellungen || {},
    stand: board.stand || standWert(),
    // Ein Board der Fassung 2 besteht aus vielen Repositories; jedes trägt
    // seinen eigenen Stand. Fassung 1 kennt das Feld nicht.
    ...(Array.isArray(board.staende) ? { staende: board.staende } : null),
    // Wer ich bin und welche Boards ich benutze. Beides gilt für die Seite,
    // nicht für die Ablage.
    identitaet: IDENTITAET,
    hauptboard: hauptboardAdresse(),
    ...registerFuerSeite(),
  };
}

/**
 * Das neu zusammengesetzte Board der Fassung 2 in der Form von `/board/data`.
 * Die Routen, die ein Repository dieser Fassung beschreiben, antworten mit
 * demselben Bild — so sieht die Seite danach genau das, was der nächste
 * Leseaufruf brächte.
 *
 * `darf` sagt, ob in dieses Board geschrieben werden darf. Ohne Schreibrecht
 * bleibt es beim Lesen: jede Handlung am Vorhaben ist dann gesperrt, und die
 * Seite bietet keine Schreibknöpfe an. `darfGrund` und `darfHinweis` nennen
 * den Grund und den Weg — aber nur, wenn `darf` falsch ist.
 */
async function schreibrechtFuerBoard() {
  try {
    return await schreibrecht({
      pfad: REPO,
      home: HOME,
      client: erstelleClient({ home: HOME }),
    });
  } catch {
    // Ein Fehler ist kein Schreibrecht; das Board bleibt lesbar.
    return {
      darf: false,
      grund: GRUND_NICHT_PRUEFBAR,
      hinweis: HINWEIS_NICHT_PRUEFBAR,
    };
  }
}

/** Dieselbe Frage als kurze Antwort für die schreibenden Wege. */
async function darfFuerBoard() {
  return (await schreibrechtFuerBoard()).darf === true;
}

/**
 * Das Schreibrecht, soweit es ohne Netz zu wissen ist: lokal ohne Remote ja,
 * mit Remote und ohne Token nein samt Grund, `null` wenn der Token befragt
 * werden muss. Damit antwortet `/board/data` in den einfachen Fällen sofort
 * und nur im dritten Fall nach der Rückfrage.
 */
function darfSchnell() {
  if (!remoteAdresse()) return { darf: true };
  if (!liesToken(HOME)) {
    return { darf: false, grund: GRUND_OHNE_TOKEN, hinweis: HINWEIS_OHNE_TOKEN };
  }
  return null;
}

/** Der Hinweis, wenn ohne Anmeldung nichts Neues entstehen kann. */
const ANLEGEN_HINWEIS = 'Melde dich in den Einstellungen unter GitHub mit einem '
  + 'Token an; danach entstehen neue Stationen und Vorhaben unter dem Eigentümer.';

/**
 * Neue Dinge entstehen unter dem Eigentümer und brauchen eine Anmeldung.
 * Ohne Token nennt die Antwort den Weg; mit Token sagt sie ja — ob die Anlage
 * wirklich gelingt, prüft erst der Weg, der sie unternimmt.
 */
function anlegenBild() {
  if (!liesToken(HOME)) {
    return { darf: false, grund: GRUND_OHNE_TOKEN, hinweis: ANLEGEN_HINWEIS };
  }
  return { darf: true };
}

/**
 * Das Bild der Fassung 2 mit Schreibrecht, Grund und der Antwort fürs
 * Anlegen. `recht` ist die Antwort aus `schreibrecht(...)`; ein einfacher
 * Wahrheitswert gilt als „ja“ oder als „nein“ ohne näheren Grund.
 */
function fassung2Bild(board, recht = { darf: false }) {
  const bild = mitAbleitung(board);
  bild.vorgaenge = Array.isArray(bild.vorgaenge) ? bild.vorgaenge : [];
  // Die alte Anzeige liest weiter eine Zusammenfassung; die Seite zeigt
  // daneben die Zeile je Repository.
  bild.stand = Array.isArray(bild.staende) && bild.staende.length
    ? zusammenfassen(bild.staende)
    : standWert();
  const antwort = datenAntwort(bild);
  antwort.format = AKTIV.format;
  antwort.formatAblage = AKTIV.format;
  // Die alten Felder bleiben auch hier lesbar; die Seite nimmt zuerst die
  // Fläche je Person.
  antwort.workflow = bild.workflow;
  antwort.schritte = bild.schritte;
  antwort.luecken = Array.isArray(bild.luecken) ? bild.luecken : [];
  // Die Sichtbarkeit des offenen Boards und das Schreibrecht. Die Lücken der
  // Verweisprüfung stehen in `luecken`, nicht in einer eigenen Liste.
  antwort.sichtbarkeit = bild.sichtbarkeit || sichtbarkeitVon(HOME, REPO);
  const wert = recht && typeof recht === 'object' ? recht : { darf: recht === true };
  antwort.darf = wert.darf === true;
  // Neue Dinge unter dem Eigentümer: ohne Anmeldung nicht, mit Token ja.
  antwort.anlegen = anlegenBild();
  if (!antwort.darf) {
    const grund = String(wert.grund || '').trim();
    const hinweis = String(wert.hinweis || '').trim();
    antwort.darfGrund = grund || 'Kein Schreibrecht für dieses Board.';
    if (hinweis) antwort.darfHinweis = hinweis;
    // Kein Schreibrecht: auch die Handlungen am Vorhaben sind gesperrt, damit
    // die Seite ihre Knöpfe nicht anbietet.
    for (const vorgang of antwort.vorgaenge) {
      vorgang.darf = {
        aendern: false,
        verschieben: false,
        weitergeben: false,
        zurueckschicken: false,
        entscheiden: false,
      };
    }
  }
  return antwort;
}

async function fassung2Antwort() {
  const board = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
  return fassung2Bild(board, await schreibrechtFuerBoard());
}

/**
 * Darf in das offene Board geschrieben werden — und wenn nicht, warum? Es gilt
 * dieselbe Einordnung wie in `/board/data`: ein Archiv bleibt lesbar, ein Board
 * der Fassung 2 ohne Schreibrecht antwortet mit dem Grund. Ein Board der
 * Fassung 1 schreibt lokal; dafür braucht es keine Anmeldung.
 */
async function rechtDesOffenenBoards() {
  if (!AKTIV) return { darf: false, grund: 'Noch kein Board verbunden' };
  if (istArchiv(AKTIV)) return { darf: false, grund: 'Die alte Ablage ist Archiv' };
  if (AKTIV.format !== 2) return { darf: true };
  if (!existsSync(join(AKTIV.repo, 'board.json'))) {
    return {
      darf: false,
      grund: String(AKTIV.fehler || '').trim()
        || 'Der Ordner dieses Boards fehlt: ' + AKTIV.repo,
    };
  }
  const schnell = darfSchnell();
  const recht = schnell === null ? await schreibrechtFuerBoard() : schnell;
  if (recht.darf === true) return { darf: true };
  return {
    darf: false,
    grund: String(recht.grund || '').trim() || 'Kein Schreibrecht für dieses Board.',
    ...(recht.hinweis ? { hinweis: String(recht.hinweis) } : null),
  };
}

/**
 * Das offene Board für `GET /board/board`: Registereintrag, Format, Art,
 * Sichtbarkeit und Schreibrecht. Die Verweise der Fassung 2 stehen daneben,
 * die Fläche selbst — Workflows, Stationen, Vorhaben — bleibt weg.
 */
async function offenesBoardBild() {
  const eintrag = registerFuerSeite().boards.find((b) => b.aktiv) || null;
  const board = { ...(eintrag || {}), repo: AKTIV.repo };
  let fehler = String(AKTIV.fehler || '').trim();
  const bild = {
    board,
    format: AKTIV.format,
    art: AKTIV.art,
    sichtbarkeit: board.sichtbarkeit || sichtbarkeitVon(HOME, AKTIV.repo),
  };
  if (AKTIV.format === 2) {
    try {
      const daten = liesBoardFassung2(AKTIV.repo);
      bild.verweise = {
        workflows: daten.workflows,
        vorhaben: daten.vorhaben,
        stationen: daten.stationen,
      };
    } catch (error) {
      fehler = fehler || String((error && error.message) || error);
    }
  }
  if (fehler) bild.fehler = fehler;
  const recht = fehler ? { darf: false, grund: fehler } : await rechtDesOffenenBoards();
  bild.darf = recht.darf === true;
  bild.darfGrund = bild.darf
    ? ''
    : String(recht.grund || 'Kein Schreibrecht für dieses Board.');
  if (!bild.darf && recht.hinweis) bild.darfHinweis = String(recht.hinweis);
  return bild;
}

/** Das Bild des offenen Boards in der Form von `GET /board/data`. */
async function bildDesOffenenBoards() {
  if (AKTIV && AKTIV.format === 2) return await fassung2Antwort();
  const board = mitAbleitung(liesBoard());
  board.vorgaenge = Array.isArray(board.vorgaenge) ? board.vorgaenge : [];
  board.stand = standWert();
  return datenAntwort(board);
}

/**
 * Der Workflow des offenen Boards für `GET /board/workflow`. Gelesen wird der
 * erste Workflow, den das Board nennt — derselbe, den `/board/data` als
 * `workflow` zeigt. Fassung 1 legt ihre Workflows je Person ab; dort steht
 * der eigene. Fehlt ein Workflow oder ist er nicht lesbar, kommt der Grund
 * zurück und die Route antwortet mit 409.
 */
function workflowDesOffenenBoards() {
  const kopf = {
    board: {
      id: AKTIV.id,
      name: AKTIV.name,
      repo: AKTIV.repo,
      art: AKTIV.art,
      format: AKTIV.format,
    },
    format: AKTIV.format,
  };
  if (AKTIV.format !== 2) {
    const eigene = liesWorkflows(REPO, PERSON_ID).find((p) => p.ich) || null;
    const workflow = eigene && eigene.workflows[0] ? eigene.workflows[0] : null;
    if (!workflow) {
      return { status: 409, daten: { ...kopf, error: 'Dieses Board hat keinen Workflow.' } };
    }
    const { schritte, ...rest } = workflow;
    return {
      status: 200,
      daten: {
        ...kopf,
        verweis: 'workflows/' + eigene.id + '.json',
        ort: join(REPO, 'workflows', eigene.id + '.json'),
        // Fassung 1 kennt keine Fassungen eines Workflows.
        fassung: '',
        ...rest,
        stationen: schritte,
      },
    };
  }

  let board;
  try {
    board = liesBoardFassung2(REPO);
  } catch (error) {
    return {
      status: 409,
      daten: {
        ...kopf,
        error: 'Das Board lässt sich nicht lesen: '
          + String((error && error.message) || error),
      },
    };
  }
  const verweis = board.workflows[0] || null;
  if (!verweis) {
    return { status: 409, daten: { ...kopf, error: 'Dieses Board hat keinen Workflow.' } };
  }

  // Der Verweis wird gegen das Board aufgelöst — wie in der Komposition, ohne
  // Netz: ein Verweis auf eine Adresse bleibt ohne Ort und damit unlesbar.
  const ort = ortImRepo(verweis.repo, REPO);
  const kennungDesVerweises = {
    verweis: String(verweis.repo),
    fassung: verweis.fassung,
    ort: ort || '',
  };
  let gelesen = null;
  let grund = '';
  try {
    if (!ort || !existsSync(ort)) {
      grund = 'Der Ordner des Workflows fehlt: ' + String(verweis.repo);
    } else if (liesRepo(ort).art !== 'workflow') {
      grund = 'Der Ordner ist kein Workflow: ' + ort;
    } else {
      gelesen = liesWorkflow(ort);
    }
  } catch (error) {
    grund = String((error && error.message) || error);
  }
  if (!gelesen) {
    return {
      status: 409,
      daten: { ...kopf, ...kennungDesVerweises, error: 'Der Workflow ist nicht lesbar: ' + grund },
    };
  }

  // Die Stationen so weit lesen, wie sie lokal liegen: fehlt eine, bleibt ihr
  // Verweis stehen und `fehlt` sagt es. Gelesen wird die genannte Fassung.
  const stationen = gelesen.stationen.map((eintrag) => {
    const stationsOrt = ortImRepo(eintrag.repo, ort);
    let station = null;
    let fassungFehlt = false;
    let stationsGrund = '';
    if (!stationsOrt || !existsSync(stationsOrt)) {
      stationsGrund = 'Der Ordner der Station fehlt: ' + String(eintrag.repo);
    } else {
      try {
        if (liesRepo(stationsOrt).art !== 'station') {
          stationsGrund = 'Der Ordner ist keine Station: ' + stationsOrt;
        } else {
          const gelesenStation = liesStationAufFassung(stationsOrt, eintrag.fassung);
          fassungFehlt = gelesenStation.fassungFehlt;
          station = gelesenStation.station || liesStation(stationsOrt);
        }
      } catch (error) {
        stationsGrund = String((error && error.message) || error);
      }
    }
    return {
      ...eintrag,
      ort: stationsOrt || '',
      name: station ? station.name : '',
      host: station ? station.host : '',
      fehlt: !station,
      fassungFehlt,
      ...(stationsGrund ? { grund: stationsGrund } : null),
    };
  });

  return {
    status: 200,
    daten: {
      ...kopf,
      ...kennungDesVerweises,
      id: gelesen.id,
      titel: gelesen.titel,
      beschreibung: gelesen.beschreibung,
      autor: gelesen.autor,
      stationen,
      positionen: gelesen.positionen,
      kanten: gelesen.kanten,
      layout: gelesen.layout,
      regeln: gelesen.regeln,
    },
  };
}

/**
 * Der Eigentümer eines Boards: ein GitHub-Login oder eine Organisation, unter
 * der neue Repositories entstehen. Kein Board-Typ und keine Board-Kennung
 * bringt einen eigenen Namen mit — die Auflösung gilt für jedes Board gleich.
 */
const EIGENTUEMER_MUSTER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Der deutsche Hinweis, wenn weder Eintrag noch Anmeldung einen Namen geben. */
const EIGENTUEMER_HINWEIS = 'Noch kein Eigentümer bekannt. Melde dich mit einem '
  + 'GitHub-Token an; die Anmeldung trägt deinen Login ein. Alternativ lässt sich '
  + 'ein GitHub-Login oder eine Organisation eintragen.';

/** Der gesetzte Eigentümer aus `einstellungen.eigentuemer`, getrimmt. */
function gesetzterEigentuemer(board) {
  const einstellungen = board && board.einstellungen;
  if (!einstellungen || typeof einstellungen !== 'object'
    || Array.isArray(einstellungen)) {
    return '';
  }
  return String(einstellungen.eigentuemer == null
    ? '' : einstellungen.eigentuemer).trim();
}

/**
 * Die Auflösung ohne Netz: gesetzter Eintrag, kein Token oder ein schon
 * gemerkter Login antworten sofort. `null` heißt, der Login müsste erst bei
 * GitHub erfragt werden.
 */
function eigentuemerBildSchnell(board) {
  const gesetzt = gesetzterEigentuemer(board);
  if (gesetzt) {
    return { eigentuemer: gesetzt, eigentuemerQuelle: 'gesetzt' };
  }
  const token = liesToken(HOME);
  if (!token) {
    return {
      eigentuemer: '',
      eigentuemerQuelle: 'leer',
      eigentuemerHinweis: EIGENTUEMER_HINWEIS,
    };
  }
  const login = liesLogin(HOME);
  if (!login) return null;
  return { eigentuemer: login, eigentuemerQuelle: 'angemeldet' };
}

/**
 * Woher der Eigentümer kommt und wie er heißt. Ist im Board einer gesetzt,
 * gilt er. Sonst gilt der zum gespeicherten Token bekannte Login; fehlt er,
 * wird er höchstens einmal bei GitHub erfragt. Ohne Netz bleibt es bei `leer`
 * samt Hinweis — ein Lesen des Boards scheitert daran nicht.
 */
async function eigentuemerBild(board) {
  const schnell = eigentuemerBildSchnell(board);
  if (schnell) return schnell;
  const token = liesToken(HOME);
  let login = '';
  try {
    const ich = await erstelleClient({ home: HOME, token }).ich();
    login = String((ich && ich.login) || '').trim();
  } catch {
    login = '';
  }
  if (!login) {
    return {
      eigentuemer: '',
      eigentuemerQuelle: 'leer',
      eigentuemerHinweis: EIGENTUEMER_HINWEIS,
    };
  }
  return { eigentuemer: login, eigentuemerQuelle: 'angemeldet' };
}

/**
 * Eine Einstellung in `board.json` der Fassung 2 setzen oder — bei leerem
 * Wert — entfernen. Geschrieben wird die Datei roh, damit alle anderen
 * Angaben des Boards unverändert bleiben.
 */
function schreibeFassung2Einstellung(name, wert) {
  const datei = join(REPO, 'board.json');
  let roh;
  try {
    roh = JSON.parse(readFileSync(datei, 'utf8'));
  } catch {
    throw fehlerMit('board.json lässt sich nicht lesen', 409);
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw fehlerMit('board.json ist kein Board', 409);
  }
  const bisher = roh.einstellungen && typeof roh.einstellungen === 'object'
    && !Array.isArray(roh.einstellungen) ? { ...roh.einstellungen } : {};
  if (wert) bisher[name] = wert;
  else delete bisher[name];
  roh.einstellungen = bisher;
  writeFileSync(datei + '.tmp', JSON.stringify(roh, null, 2) + '\n', 'utf8');
  renameSync(datei + '.tmp', datei);
}

/* --- Eine Station anlegen -----------------------------------------------
 *
 * Eine Station ist ein eigenes, öffentliches Repository unter dem Eigentümer:
 * `station-<slug>` mit `station.json`, `README.md` und einer Fassung. Gebaut
 * wird zuerst im Zwischenspeicher (`$DSH_HOME/board/cache/<owner>/<repo>`),
 * damit der Ordner ohne Netz lesbar ist.
 *
 * Der Weg dorthin ist eine Schnittstelle mit zwei Umsetzungen: `selbst` prüft
 * bei GitHub und legt das Repository dort an; `attrappe` prüft nur den
 * Zwischenspeicher, schickt nichts und meldet Erfolg. Die Wahl steht in
 * `einstellungen.anlegeweg`; die Vorgabe ist `selbst`. `attrappe` ist nur über
 * die Einstellung erreichbar, nie in der Oberfläche.
 *
 * Beide Wege kennen `pruefen` (`{ frei }`) und `anlegen`
 * (`{ owner, repo, beschreibung, themen, dateien }` → `{ owner, repo, remote }`).
 * Ein Fehler trägt eine deutsche Meldung und einen Code (`belegt`,
 * `nicht-pruefbar`, `github`); die Route macht daraus den HTTP-Status.
 */

/** Das Thema, das jede Station bei GitHub trägt. */
const STATION_THEMA = 'dsh-board-station';

/** Die Namen der beiden Anlegewege. */
const ANLEGEWEGE = new Set(['selbst', 'attrappe']);

function anlegeFehler(meldung, code) {
  const fehler = new Error(meldung);
  fehler.code = code;
  return fehler;
}

/**
 * Wie ein Anlegeweg das Ding nennt, das entstehen soll. Die Vorgabe ist eine
 * Station; ein Vorhaben sagt es mit, damit eine Fehlermeldung nicht das
 * falsche Ding nennt.
 */
function anlegeWort(art) {
  return art === 'vorhaben'
    ? { ein: 'Ein Vorhaben', das: 'Das Vorhaben' }
    : { ein: 'Eine Station', das: 'Die Station' };
}

/**
 * GitHub verweigert das Anlegen. Der Grund ist fast immer der Eigentümer: der
 * Token gehört zu einem anderen Konto und darf in einer Organisation keine
 * Repositories anlegen. Die Meldung nennt beides — Eigentümer und Anmeldung —,
 * damit der Weg klar ist: Konto als Eigentümer oder Token mit Recht auf die
 * Organisation.
 */
function verweigerungText(wort, owner, login) {
  const angemeldet = String(login || '').trim();
  if (angemeldet && angemeldet.toLowerCase() !== String(owner).toLowerCase()) {
    return wort.das + ' ließ sich bei GitHub nicht anlegen: GitHub verweigert '
      + 'das Anlegen unter „' + owner + '“. Der Token gehört zu „' + angemeldet
      + '“ und darf dort keine Repositories anlegen. Setze den Eigentümer in '
      + 'den Einstellungen auf dein Konto oder nimm einen Token mit Recht auf '
      + 'die Organisation.';
  }
  return wort.das + ' ließ sich bei GitHub nicht anlegen: GitHub verweigert '
    + 'das Anlegen unter „' + owner + '“. Der Token gehört zu „'
    + (angemeldet || 'deinem Konto') + '“ und hat dort kein Recht, Repositories '
    + 'anzulegen. Prüfe die Rechte des Tokens: er braucht das Recht, '
    + 'Repositories anzulegen.';
}

/**
 * Der gewählte Anlegeweg aus dem Board. Ein fehlender oder leerer Wert
 * bedeutet `selbst`; ein gesetzter, unbekannter Wert ist ein Fehler mit 409
 * und wird nicht still zu `selbst`.
 */
function anlegewegName(board) {
  const einstellungen = board && board.einstellungen;
  const wert = einstellungen && typeof einstellungen === 'object'
    && !Array.isArray(einstellungen) && einstellungen.anlegeweg != null
    ? String(einstellungen.anlegeweg).trim()
    : '';
  if (!wert) return 'selbst';
  if (ANLEGEWEGE.has(wert)) return wert;
  throw fehlerMit(
    'Unbekannter Anlegeweg: „' + wert + '“ ist weder „selbst“ noch „attrappe“.',
    409,
  );
}

/**
 * Der Weg über GitHub. `pruefen` fragt das Repository ab: 404 heißt frei,
 * 200 heißt belegt, jeder andere Fehler ist keine Antwort und wird zu 502.
 * `anlegen` legt das öffentliche Repository an, setzt das Thema und schreibt
 * die beiden Dateien über die Inhalts-API. Ein `git push` findet nicht statt.
 */
function anlegewegSelbst(client) {
  return {
    name: 'selbst',
    async pruefen({ owner, repo, art = 'station' }) {
      try {
        await client.repo(owner, repo);
      } catch (fehler) {
        if (Number(fehler && fehler.status) === 404) return { frei: true };
        throw anlegeFehler(
          'Der Name lässt sich bei GitHub nicht prüfen: ' + kurzZeile(fehler),
          'nicht-pruefbar',
        );
      }
      return {
        frei: false,
        meldung: anlegeWort(art).ein + ' mit diesem Namen gibt es schon',
        code: 'belegt',
      };
    },
    async anlegen({ owner, repo, beschreibung, themen, dateien, art = 'station' }) {
      // Ist der Eigentümer der angemeldete Login, entsteht das Repository
      // unter `/user/repos`; sonst unter der Organisation.
      let eigenes = false;
      let angemeldet = '';
      try {
        const ich = await client.ich();
        angemeldet = String((ich && ich.login) || '').trim();
        eigenes = angemeldet.toLowerCase()
          === String(owner).trim().toLowerCase();
      } catch (fehler) {
        throw anlegeFehler(
          'Die Anmeldung ließ sich nicht prüfen: ' + kurzZeile(fehler),
          'nicht-pruefbar',
        );
      }

      let angelegt = null;
      try {
        angelegt = await client.erstelleRepo(owner, {
          name: repo,
          privat: false,
          beschreibung,
          themen,
          eigenes,
        });
      } catch (fehler) {
        // Ein „Nein“ von GitHub wird übersetzt: der Eigentümer und die
        // Anmeldung stehen in der Meldung, nicht nur der Statuscode.
        if (Number(fehler && fehler.status) === 403) {
          throw anlegeFehler(
            verweigerungText(anlegeWort(art), owner, angemeldet), 'verweigert',
          );
        }
        throw anlegeFehler(
          anlegeWort(art).das + ' ließ sich bei GitHub nicht anlegen: '
            + kurzZeile(fehler),
          'github',
        );
      }
      // Erst danach die Dateien: scheitert das Schreiben, entsteht keine
      // Meldung „ließ sich nicht anlegen“, denn das Repository steht schon.
      try {
        for (const datei of dateien) {
          await client.setzeInhalt(owner, repo, datei.pfad, datei.inhalt,
            datei.nachricht || '');
        }
      } catch (fehler) {
        throw anlegeFehler(
          'Das Repository ' + owner + '/' + repo + ' wurde angelegt, aber die '
            + 'Dateien ließen sich nicht schreiben: ' + kurzZeile(fehler)
            + '. Das Repository bleibt bei GitHub; lösche es dort, wenn es '
            + 'nicht bleiben soll.',
          'github',
        );
      }
      return {
        owner,
        repo,
        remote: String((angelegt && angelegt.adresse) || '')
          || githubAdresse(owner, repo),
      };
    },
  };
}

/**
 * Der Weg ohne Netz. `pruefen` sieht nur in den Zwischenspeicher; `anlegen`
 * schickt nichts und meldet Erfolg. Der nachgebildete GitHub-Server sieht bei
 * ihm keinen einzigen Aufruf.
 */
function anlegewegAttrappe() {
  return {
    name: 'attrappe',
    async pruefen({ owner, repo, art = 'station' }) {
      const pfad = cachePfad(HOME, owner, repo);
      if (pfad && existsSync(pfad)) {
        return {
          frei: false,
          meldung: anlegeWort(art).ein + ' mit diesem Namen gibt es schon',
          code: 'belegt',
        };
      }
      return { frei: true };
    },
    async anlegen({ owner, repo }) {
      return { owner, repo, remote: '' };
    },
  };
}

/**
 * Der Weg zum Anlegen. Ein gesetzter, aber unbekannter Wert bricht hier mit
 * 409 ab — vor jedem GitHub-Aufruf und ohne stillen Rückfall auf `selbst`.
 */
function anlegewegFuer(board) {
  if (anlegewegName(board) === 'attrappe') return anlegewegAttrappe();
  return anlegewegSelbst(erstelleClient({ home: HOME }));
}

/** Was eine Station in ihren beiden Dateien sagt. */
function stationInhalt({
  slugName, name, beschreibung, owner,
}) {
  const station = {
    format: 2,
    id: slugName,
    name,
    beschreibung,
    host: owner,
    eingang: [],
    ausgabe: [],
    aktion: { art: 'textfeld', wert: beschreibung },
    beispiele: [],
    reife: 'entwurf',
    lizenz: 'nicht angegeben',
    tags: [],
  };
  const inhalt = JSON.stringify(station, null, 2) + '\n';
  const readme = '# ' + name + '\n\n'
    + (beschreibung || 'Eine Station des Collaboration Boards.')
    + '\n\nThema: ' + STATION_THEMA + '\n';
  return {
    station,
    readme,
    dateien: [
      {
        pfad: 'station.json',
        inhalt,
        nachricht: 'Station „' + name + '“ angelegt',
      },
      {
        pfad: 'README.md',
        inhalt: readme,
        nachricht: 'README der Station „' + name + '“',
      },
    ],
  };
}

/**
 * Das lokale Repository: Ordner, `station.json`, `README.md`, `git init -b
 * main`, `add`, `commit`. Ein Remote wird nicht gesetzt; so gerät kein Token
 * in `.git/config`, in Argumente oder in eine Adresse.
 */
function baueStation({
  owner, repo, station, readme, nachricht, autor,
}) {
  const pfad = cachePfad(HOME, owner, repo);
  if (!pfad) throw fehlerMit('Ohne Zuhause gibt es keinen Zwischenspeicher', 500);
  if (existsSync(pfad)) {
    throw fehlerMit('Eine Station mit diesem Namen gibt es schon', 409);
  }
  mkdirSync(pfad, { recursive: true });
  writeFileSync(join(pfad, 'station.json'),
    JSON.stringify(station, null, 2) + '\n', 'utf8');
  writeFileSync(join(pfad, 'README.md'), readme, 'utf8');
  legeRepoAn(pfad, nachricht, autor);
  return pfad;
}

/**
 * Den Verweis `owner/repo` in eine der Listen des Boards aufnehmen; doppelt
 * steht er einmal da. Geschrieben wird die Datei roh, damit alle anderen
 * Angaben des Boards unverändert bleiben. Zurück kommt `true`, wenn der
 * Verweis neu ist.
 */
function schreibeFassung2Verweis(feld, verweis) {
  const datei = join(REPO, 'board.json');
  let roh;
  try {
    roh = JSON.parse(readFileSync(datei, 'utf8'));
  } catch {
    throw fehlerMit('board.json lässt sich nicht lesen', 409);
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw fehlerMit('board.json ist kein Board', 409);
  }
  const liste = Array.isArray(roh[feld]) ? roh[feld] : [];
  const gesucht = String(verweis).trim().toLowerCase();
  if (liste.some((eintrag) => String(eintrag && eintrag.repo == null
    ? '' : eintrag.repo).trim().toLowerCase() === gesucht)) {
    return false;
  }
  liste.push({ repo: verweis });
  roh[feld] = liste;
  writeFileSync(datei + '.tmp', JSON.stringify(roh, null, 2) + '\n', 'utf8');
  renameSync(datei + '.tmp', datei);
  return true;
}

function schreibeFassung2Station(verweis) {
  return schreibeFassung2Verweis('stationen', verweis);
}

function schreibeFassung2Vorhaben(verweis) {
  return schreibeFassung2Verweis('vorhaben', verweis);
}

/** Das Thema, das jedes Vorhaben bei GitHub trägt. */
const VORHABEN_THEMA = 'dsh-board-vorhaben';

/** Die Meldung, wenn der Name im Zwischenspeicher oder bei GitHub belegt ist. */
const VORHABEN_BELEGT = 'Ein Vorhaben mit diesem Namen gibt es schon';

/** Die Farbe, wenn das Board keine für die handelnde Person nennt. */
const VORHABEN_FARBE = '#fbbf24';

/**
 * Die Farbe der handelnden Person aus dem Board: zuerst der Eintrag, dessen
 * Login zur Anmeldung gehört, sonst die eigene Kennung. Gibt es keinen,
 * bleibt es bei der Vorgabefarbe.
 */
function farbeDerHandelnden(board, login) {
  const personen = board && Array.isArray(board.personen) ? board.personen : [];
  const suche = (wert) => String(wert == null ? '' : wert).trim().toLowerCase();
  const kandidaten = [suche(login), suche(PERSON_ID)].filter(Boolean);
  for (const gesucht of kandidaten) {
    const person = personen.find((eintrag) => eintrag
      && suche(eintrag.login) === gesucht);
    const farbe = String((person && person.farbe) || '');
    if (/^#[0-9a-f]{6}$/i.test(farbe)) return farbe;
  }
  return VORHABEN_FARBE;
}

/**
 * Was ein Vorhaben in seinen beiden Dateien sagt. Der Verweis auf den Workflow
 * behält die Angabe aus dem Board samt Fassung; die verantwortliche Person
 * ist der angemeldete Login. Ist keiner bekannt, bleibt die Liste leer.
 */
function vorhabenInhalt({
  slugName, name, station, stationName, workflow, login, farbe,
}) {
  const vorhaben = {
    format: 2,
    id: slugName,
    name,
    workflow: { repo: workflow.repo, fassung: workflow.fassung },
    position: station,
    verantwortliche: { [station]: login ? [login] : [] },
    laeufe: [],
    farbe,
  };
  const inhalt = JSON.stringify(vorhaben, null, 2) + '\n';
  const readme = '# ' + name + '\n\n'
    + 'Vorhaben an der Station „' + (stationName || station) + '“ ('
    + station + ') des Workflows „' + workflow.repo + '“ (Fassung '
    + workflow.fassung + ').\n\nThema: ' + VORHABEN_THEMA + '\n';
  return {
    vorhaben,
    readme,
    dateien: [
      {
        pfad: 'vorhaben.json',
        inhalt,
        nachricht: 'Vorhaben „' + name + '“ angelegt',
      },
      {
        pfad: 'README.md',
        inhalt: readme,
        nachricht: 'README des Vorhabens „' + name + '“',
      },
    ],
  };
}

/**
 * Das lokale Repository eines Vorhabens: Ordner, `vorhaben.json`,
 * `README.md`, `git init -b main`, `add`, `commit`. Kein Remote; so gerät kein
 * Token in `.git/config`, in Argumente oder in eine Adresse.
 */
function baueVorhaben({
  owner, repo, vorhaben, readme, nachricht, autor,
}) {
  const pfad = cachePfad(HOME, owner, repo);
  if (!pfad) throw fehlerMit('Ohne Zuhause gibt es keinen Zwischenspeicher', 500);
  if (existsSync(pfad)) {
    throw fehlerMit('Ein Vorhaben mit diesem Namen gibt es schon', 409);
  }
  mkdirSync(pfad, { recursive: true });
  writeFileSync(join(pfad, 'vorhaben.json'),
    JSON.stringify(vorhaben, null, 2) + '\n', 'utf8');
  writeFileSync(join(pfad, 'README.md'), readme, 'utf8');
  legeRepoAn(pfad, nachricht, autor);
  return pfad;
}

/** Der HTTP-Status zu einem Fehler des Anlegewegs. */
function anlegeStatus(fehler) {
  const code = String((fehler && fehler.code) || '');
  if (code === 'belegt') return 409;
  // Ein „Nein“ von GitHub wegen fehlenden Rechts ist ein Recht, kein
  // Serverfehler: die Seite zeigt ihn wie andere Verbote.
  if (code === 'verweigert') return 403;
  if (code === 'nicht-pruefbar' || code === 'github') return 502;
  return Number(fehler && fehler.status) || 500;
}

/**
 * Eine Datei in einem Vorhaben der Fassung 2 speichern. Sie liegt im eigenen
 * Repository des Vorhabens; gefasst wird dort, nicht im Board. Geprüft wird in
 * dieser Reihenfolge: Board (409), Vorhaben (404), Ordner (409), Recht (403),
 * Pfad (400), Basis (409) — erst danach wird geschrieben.
 *
 * Die Basisprüfung ist dieselbe wie in der alten Ablage: ein überholter Stand
 * überschreibt nichts, der neue Text und die neue Basis gehen zurück. Ein
 * Push folgt nicht; der gehört zum Abgleich (Schritt 39).
 */
async function speichereImVorhaben(koerper, res) {
  try {
    if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }
    // Erst lesen, dann entscheiden: ein unlesbares Board ist keine Grundlage.
    try {
      liesBoardFassung2(REPO);
    } catch (fehler) {
      sende(res, 409, { error: 'Das Board ist nicht lesbar: ' + kurzZeile(fehler) });
      return;
    }

    let zusammengesetzt;
    try {
      zusammengesetzt = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
    } catch (fehler) {
      sende(res, 409, {
        error: 'Das Board lässt sich nicht lesen: ' + kurzZeile(fehler),
      });
      return;
    }
    const eintrag = (zusammengesetzt.vorgaenge || [])
      .find((v) => v.id === koerper.vorhaben);
    if (!eintrag) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }

    const ordner = String(eintrag.ordner || '').trim();
    let istOrdner = false;
    try {
      istOrdner = Boolean(ordner) && statSync(ordner).isDirectory();
    } catch {
      istOrdner = false;
    }
    if (!istOrdner) {
      sende(res, 409, {
        error: 'Der Ordner des Vorhabens fehlt: '
          + String(eintrag.name || eintrag.id),
      });
      return;
    }

    // Das Recht steht im Bild der Fläche: die handelnde Person am Vorhaben und
    // das Schreibrecht des Boards. Danach das Recht am Repository selbst —
    // ein Vorhaben mit Remote ohne Token bleibt gesperrt.
    const bild = fassung2Bild(zusammengesetzt, await schreibrechtFuerBoard());
    if (bild.darf !== true) {
      sende(res, 403, {
        error: String(bild.darfGrund || 'Kein Schreibrecht für dieses Board.'),
        ...(bild.darfHinweis ? { hinweis: bild.darfHinweis } : null),
      });
      return;
    }
    const vorgang = (bild.vorgaenge || []).find((v) => v.id === eintrag.id);
    if (!vorgang || !vorgang.darf || vorgang.darf.aendern !== true) {
      sende(res, 403, { error: 'Dieses Vorhaben verantwortet jemand anderes.' });
      return;
    }
    const recht = await schreibrecht({ pfad: ordner, home: HOME });
    if (recht.darf !== true) {
      sende(res, 403, {
        error: String(recht.grund || 'Kein Schreibrecht für dieses Vorhaben.'),
        ...(recht.hinweis ? { hinweis: recht.hinweis } : null),
      });
      return;
    }

    const datei = dateiImVorhaben(ordner, koerper.datei);
    if (datei.fehler) { sende(res, 400, { error: datei.fehler }); return; }
    const { name, ziel } = datei;

    const text = String(koerper.text == null ? '' : koerper.text)
      .slice(0, MAX_INHALT * 50);

    // Dieselbe Basisprüfung wie in der alten Ablage, nur im Repository des
    // Vorhabens: eine vorhandene, gefasste Datei verlangt die Basis; eine
    // neue, noch nicht gefasste darf ohne sie angelegt werden.
    const aktuelleBasis = dateiBasis(ordner, name, ordner);
    const hatBasis = Object.prototype.hasOwnProperty.call(koerper, 'basis');
    const rohBasis = hatBasis ? koerper.basis : null;
    const gewuenschteBasis = rohBasis == null ? null : String(rohBasis).trim() || null;
    const basisGueltig = gewuenschteBasis === null
      || /^[0-9a-f]{7,40}$/.test(gewuenschteBasis);
    const basisFehlt = !hatBasis && aktuelleBasis !== null;
    if (basisFehlt || (hatBasis && (!basisGueltig || gewuenschteBasis !== aktuelleBasis))) {
      let neuerText = '';
      try {
        neuerText = readFileSync(ziel, 'utf8');
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

    // Atomar: erst daneben schreiben, dann den Namen umhängen.
    writeFileSync(ziel + '.tmp', text, 'utf8');
    renameSync(ziel + '.tmp', ziel);

    // Gefasst wird im Vorhaben-Repository, mit der handelnden Person als
    // Autor. Das Board-Repository bleibt unberührt. Ist der Text unverändert,
    // gibt es nichts zu fassen — dann bleibt die alte Basis stehen.
    const autor = autorFassung2();
    const nachricht = '„' + name + '“ gespeichert'
      + (koerper.herkunft === 'modell' ? ' (Fassung vom Modell)'
        : koerper.herkunft === 'zurueck' ? ' (zurück auf eine frühere Fassung)' : '');
    const lage = git(['status', '--porcelain', '--', name], autor, undefined, ordner);
    if (!lage.ok) {
      throw fehlerMit('Das Vorhaben-Repository antwortet nicht: '
        + kurzZeile(lage.fehler), 500);
    }
    if (lage.out.trim()) {
      const add = git(['add', '--', name], autor, undefined, ordner);
      if (!add.ok) {
        throw fehlerMit('Die Datei ließ sich nicht vormerken: '
          + kurzZeile(add.fehler), 500);
      }
      const commit = git(['commit', '-m', nachricht, '--', name],
        autor, undefined, ordner);
      if (!commit.ok) {
        throw fehlerMit('Die Datei ließ sich nicht fassen: '
          + kurzZeile(commit.fehler), 500);
      }
    }

    // Die neue Basis ist die Fassung dieser Datei; sie geht mit zurück.
    const neueBasis = dateiBasis(ordner, name, ordner);
    sende(res, 200, {
      ok: true, name, laenge: text.length, basis: neueBasis, fassung: neueBasis,
    });
  } catch (fehler) {
    sende(res, (fehler && fehler.status) || 500, {
      error: String((fehler && fehler.message) || fehler),
    });
  }
}

/* --- Der Umzug aus der alten Ablage --------------------------------------- */

/** Ein GitHub-Name: Buchstabe oder Ziffer am Rand, dazwischen Bindestriche. */
function istGithubName(wert) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
    String(wert == null ? '' : wert).trim(),
  );
}

/**
 * Die alte Ablage: das offene Board, wenn es selbst die Fassung 1 ist, sonst
 * das erste Board der Fassung 1 im Register. Sie wird nur gelesen.
 */
function umzugQuelle() {
  const alte = REGISTER.boards.filter((board) => board && board.format === 1
    && board.repo && existsSync(board.repo));
  if (AKTIV && AKTIV.format === 1) {
    const offen = alte.find((board) => board.id === AKTIV.id);
    if (offen) return offen;
  }
  return alte.find((board) => istHauptboard(board)) || alte[0] || null;
}

/**
 * Die vorhandene Zuordnung alte Kennung → GitHub-Name. Genommen wird zuerst
 * der GitHub-Name aus `identitaet.json` (wenn er zu einer Person passt), dann
 * einer an der Person selbst, zuletzt der Name, unter dem die Boards der
 * Fassung 2 im Register stehen. So braucht der Umzug ohne Angabe keine
 * Eingabe, solange die alte Person irgendwo einen GitHub-Namen hat.
 */
function zuordnungAusBestand(board) {
  const ident = IDENTITAET && typeof IDENTITAET === 'object' ? IDENTITAET : {};
  const besitzer = REGISTER.boards
    .filter((eintrag) => eintrag && eintrag.format === 2 && istGithubName(eintrag.person))
    .map((eintrag) => String(eintrag.person).trim())
    .find(Boolean) || '';
  let personen = [];
  try {
    personen = liesPersonen(board.repo, board.person);
  } catch {
    // Eine Ablage ohne lesbare Personendatei bleibt lesbar.
  }
  if (!personen.length) {
    personen = [{ id: String(board.person || 'p1'), name: String(ident.name || '') }];
  }
  const namen = {};
  for (const person of personen) {
    const id = String(person.id || '').trim();
    if (!id) continue;
    const eigener = String(person.github || '').trim();
    const gleichnamig = Boolean(ident.name && person.name)
      && String(person.name).trim().toLowerCase()
        === String(ident.name).trim().toLowerCase();
    let name = '';
    if (gleichnamig && istGithubName(ident.github)) name = String(ident.github).trim();
    else if (istGithubName(eigener)) name = eigener;
    else if (personen.length === 1 && istGithubName(ident.github)) {
      name = String(ident.github).trim();
    }
    if (!name && besitzer && besitzer !== id) name = besitzer;
    if (name) namen[id] = name;
  }
  return namen;
}

/** Die übergebene Zuordnung prüfen; `null` heißt: es gab keine Angabe. */
function pruefeZuordnung(wert) {
  if (wert == null) return { ok: true, zuordnung: null };
  if (typeof wert !== 'object' || Array.isArray(wert)) {
    return {
      ok: false,
      fehler: 'Die Zuordnung ist eine Abbildung von Kennung auf GitHub-Name',
    };
  }
  const eintraege = Object.entries(wert);
  if (!eintraege.length) return { ok: true, zuordnung: null };
  const zuordnung = {};
  for (const [kennung, name] of eintraege) {
    const id = String(kennung == null ? '' : kennung).trim();
    if (!id) return { ok: false, fehler: 'Die Zuordnung nennt eine leere Kennung' };
    if (!istGithubName(name)) {
      return {
        ok: false,
        fehler: 'Kein GitHub-Name für die Kennung „' + id + '“: '
          + JSON.stringify(name == null ? '' : name),
      };
    }
    zuordnung[id] = String(name).trim();
  }
  return { ok: true, zuordnung };
}

/** Der GitHub-Name für die Person der alten Ablage; ohne ihn kein Lauf. */
function hostAusZuordnung(zuordnung, board) {
  const id = String((board && board.person) || 'p1').trim() || 'p1';
  if (zuordnung[id]) return zuordnung[id];
  const werte = Object.values(zuordnung);
  if (werte.length === 1) {
    zuordnung[id] = werte[0];
    return werte[0];
  }
  return '';
}

/** Ein neuer, noch nicht vorhandener Zielordner unter `$DSH_HOME/board/umzug`. */
function umzugZielVorgabe() {
  const basis = join(HOME, 'board', 'umzug');
  const stempel = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let ziel = join(basis, 'umzug-' + stempel);
  let nummer = 2;
  while (existsSync(ziel)) {
    ziel = join(basis, 'umzug-' + stempel + '-' + nummer);
    nummer += 1;
  }
  return ziel;
}

/** Das Ziel aus der Angabe; ohne Angabe ein neuer Ordner unter dem Home. */
function pruefeUmzugZiel(wert) {
  if (wert == null) return { ok: true, ziel: umzugZielVorgabe() };
  const text = typeof wert === 'string' ? wert.trim() : '';
  if (!text) {
    return {
      ok: false,
      fehler: 'Das Ziel fehlt: gib den Ordner für die neuen Repositories an '
        + 'oder lass ihn weg für einen neuen unter $DSH_HOME/board/umzug',
    };
  }
  const ziel = resolve(text);
  if (existsSync(ziel) && !statSync(ziel).isDirectory()) {
    return { ok: false, fehler: 'Das Ziel ist kein Ordner: ' + ziel };
  }
  return { ok: true, ziel };
}

/** Liegt `pfad` in `basis` (auch gleich)? */
function liegtInnen(basis, pfad) {
  const ab = relative(basis, pfad);
  return ab === '' || (ab !== '..' && !ab.startsWith('..' + sep) && !ab.startsWith(sep));
}

/** Die Reihenfolge der Arten in Bericht und Antwort. */
const UMZUG_ARTEN = ['station', 'workflow', 'vorhaben', 'board'];

const UMZUG_ANKER = {
  station: 'station.json',
  workflow: 'workflow.json',
  vorhaben: 'vorhaben.json',
  board: 'board.json',
};

/** Der GitHub-Name, den die Ankerdatei selbst nennt; sonst der des Laufs. */
function githubAusAnker(art, json, host) {
  if (art === 'station' && json.host) return String(json.host);
  if (art === 'workflow' && json.autor) return String(json.autor);
  if (art === 'board' && Array.isArray(json.personen) && json.personen.length) {
    const namen = json.personen
      .map((person) => String((person && person.login) || '')).filter(Boolean);
    if (namen.length) return namen.join(', ');
  }
  if (art === 'vorhaben' && json.verantwortliche
    && typeof json.verantwortliche === 'object') {
    const namen = new Set();
    for (const liste of Object.values(json.verantwortliche)) {
      for (const wert of Array.isArray(liste) ? liste : []) {
        const name = String(wert == null ? '' : wert).trim();
        if (name) namen.add(name);
      }
    }
    if (namen.size) return Array.from(namen).join(', ');
  }
  return host;
}

/**
 * Ein Repository im Ziel, wie der Bericht es nennt: Art und Name aus seiner
 * Ankerdatei, GitHub-Name und Sichtbarkeit. Die Sichtbarkeit kommt aus der
 * Karte, die der Umzug neben die Repositories legt.
 */
function umzugRepoBild(ordner, host) {
  const repo = basename(ordner);
  for (const art of UMZUG_ARTEN) {
    const pfad = join(ordner, UMZUG_ANKER[art]);
    if (!existsSync(pfad)) continue;
    try {
      const json = JSON.parse(readFileSync(pfad, 'utf8'));
      const name = art === 'workflow'
        ? String(json.titel || '')
        : String(json.name || '');
      return {
        repo,
        pfad: ordner,
        art,
        name,
        github: githubAusAnker(art, json, host),
        sichtbarkeit: sichtbarkeitVon(HOME, ordner),
        stand: '',
        fehler: '',
      };
    } catch (fehler) {
      return {
        repo,
        pfad: ordner,
        art,
        name: '',
        github: host,
        sichtbarkeit: sichtbarkeitVon(HOME, ordner),
        stand: '',
        fehler: kurzZeile(fehler),
      };
    }
  }
  return {
    repo,
    pfad: ordner,
    art: '',
    name: '',
    github: host,
    sichtbarkeit: sichtbarkeitVon(HOME, ordner),
    stand: '',
    fehler: 'Keine Ankerdatei',
  };
}

/** Alle Repositories eines Ziels: Station, Workflow, Vorhaben, Board. */
function umzugRepositories(ziel, host) {
  let ordner = [];
  try {
    ordner = readdirSync(ziel, { withFileTypes: true })
      .filter((eintrag) => eintrag.isDirectory())
      .map((eintrag) => join(ziel, eintrag.name));
  } catch {
    return [];
  }
  const rang = (art) => (UMZUG_ARTEN.includes(art)
    ? UMZUG_ARTEN.indexOf(art)
    : UMZUG_ARTEN.length);
  return ordner
    .map((pfad) => umzugRepoBild(pfad, host))
    .sort((a, b) => rang(a.art) - rang(b.art) || a.repo.localeCompare(b.repo, 'de'));
}

/** Die Zuordnung und die Repositories an den Bericht des Umzugs hängen. */
function ergaenzeUmzugBericht(pfad, { zuordnung, repositories }) {
  const zeilen = ['', '## Zuordnung', ''];
  for (const [kennung, name] of Object.entries(zuordnung)) {
    zeilen.push('- `' + kennung + '` → `' + name + '`');
  }
  zeilen.push('', '## Repositories (' + repositories.length + ')', '');
  for (const eintrag of repositories) {
    const teile = [
      '`' + eintrag.repo + '`',
      eintrag.name || eintrag.repo,
      '`' + eintrag.github + '`',
      eintrag.sichtbarkeit || 'unbekannt',
      eintrag.stand,
    ];
    if (eintrag.fehler) teile.push('Fehler: ' + eintrag.fehler);
    zeilen.push('- ' + teile.join(' — '));
  }
  zeilen.push('');
  appendFileSync(pfad, zeilen.join('\n'), 'utf8');
}

export const inject = ['webServer'];

export function apply(ctx) {
  // Eine frische Installation bekommt ihr Hauptboard, bevor die Routen
  // dienen. Ein vorhandenes Register mit anderen Boards bleibt unangetastet;
  // ein gescheiterter Versuch darf beim nächsten Start ersetzt werden. Der
  // Zustand wird übernommen, damit die Seite ihn schon beim ersten Lesen sieht.
  try {
    const register = sicherstellen({ home: HOME });
    REGISTER.boards = register.boards;
    REGISTER.aktiv = register.aktiv;
    const offen = REGISTER.boards.find((b) => b.id === REGISTER.aktiv) || null;
    AKTIV = offen;
    PERSON_ID = offen ? offen.person : '';
    REPO = offen ? offen.repo : '';
    VORGANG_DIR = REPO ? join(REPO, 'vorgaenge') : '';
  } catch (fehler) {
    console.warn('Board: Hauptboard beim Start nicht eingerichtet: '
      + String((fehler && fehler.message) || fehler));
  }
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
    // Ein Board ins Register legen und öffnen schreibt keine Ablagedatei des
    // offenen Boards — auch dann nicht, wenn dieses ein Archiv ist.
    '/board/board/verbinden',
    '/board/hauptboard/holen',
    // Ein eigenes Board entsteht außerhalb der offenen Ablage; die Prüfung
    // des offenen Boards gilt für seine Dateien nicht.
    '/board/uebernehmen',
    // Der Umzug schreibt die getrennten Repositories unter ein Ziel außerhalb
    // der alten Ablage; er fasst keine Ablagedatei des offenen Boards an.
    '/board/umzug',
    '/board/identitaet',
    '/board/darstellung',
    '/board/github/token',
    // Ein Beitrag ist ein Pull Request, kein Schreiben in die Ablage.
    '/board/github/beitrag',
    // Fork und Frage sind Handlungen bei GitHub, keine Ablagedateien.
    '/board/github/fork',
    '/board/github/frage',
  ]);

  // Im Archiv bleibt nur, was kein Schreiben in die alte Ablage ist: der
  // Wechsel auf ein anderes Board (Lesen), das Entfernen aus dem Register und
  // die Identität, die außerhalb der Ablage liegt. Alles andere antwortet mit
  // 403, bevor der Handler die Ablage anfasst.
  const ARCHIV_ERLAUBT = new Set([
    '/board/boards/wechsel',
    '/board/boards/entfernen',
    '/board/board/verbinden',
    '/board/identitaet',
    '/board/darstellung',
    // Der Umzug liest das Archiv und schreibt daneben; das Archiv selbst
    // bleibt unverändert.
    '/board/umzug',
  ]);

  function registriere(route) {
    const bearbeite = route.handler;
    return ctx.webServer.register({
      ...route,
      handler(req, res) {
        if (req.method !== 'GET' && istArchiv(AKTIV)
          && !ARCHIV_ERLAUBT.has(route.path)) {
          sende(res, 403, { error: 'Die alte Ablage ist Archiv' });
          return undefined;
        }
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
    handler: async (req, res) => {
      try {
        // Das Hauptboard steht im Register, sein Ordner kann aber fehlen:
        // ohne Netz wurde nichts geholt. Die Seite bleibt bedienbar und sieht
        // ein leeres Board mit dem Grund; sie stürzt nicht ab.
        const hauptboardFehlt = Boolean(AKTIV && AKTIV.format === 2
          && istHauptboard(AKTIV) && !existsSync(join(REPO, 'board.json')));
        if (!REPO || hauptboardFehlt) {
          const leer = datenAntwort(leeresBoard());
          leer.leer = !AKTIV;
          if (hauptboardFehlt) {
            leer.fehler = AKTIV.fehler || 'nicht geholt';
            leer.format = 2;
            leer.formatAblage = 2;
            leer.sichtbarkeit = AKTIV.sichtbarkeit || sichtbarkeitVon(HOME, REPO);
          }
          sende(res, 200, leer);
          return;
        }
        // Ein Board der Fassung 2 liegt als viele Repositories da; sein Bild
        // entsteht in der Komposition, samt dem Stand je Repository. Hier wird
        // nichts geholt: der Abgleich läuft auf Anstoß über /board/sync.
        if (AKTIV && AKTIV.format === 2) {
          const board = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
          const schnell = darfSchnell();
          // Der einfache Fall antwortet sofort: kein Netz für das Schreibrecht
          // und keines für den Eigentümer nötig.
          const eigentuemer = eigentuemerBildSchnell(board);
          if (schnell !== null && eigentuemer) {
            sende(res, 200, { ...fassung2Bild(board, schnell), ...eigentuemer });
            return;
          }
          // Mit Remote und Token entscheidet die Berechtigung bei GitHub; ein
          // fehlender Login wird dort einmal erfragt.
          const recht = schnell === null ? await schreibrechtFuerBoard() : schnell;
          const antwort = fassung2Bild(board, recht);
          // Der Eigentümer gehört zum Bild: gesetzt aus `board.json`, sonst
          // die Anmeldung, sonst leer mit Hinweis.
          Object.assign(antwort, eigentuemer || await eigentuemerBild(board));
          sende(res, 200, antwort);
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
  // weitergeben. Die Antwort sagt, was davon gelungen ist. Ein Board der
  // Fassung 2 hat viele Repositories: jedes wird für sich abgeglichen, ein
  // Fehler bleibt an seinem Repository, und die Antwort bleibt eine Karte.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/sync',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        if (AKTIV && AKTIV.format === 2) {
          const board = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
          const staende = gleicheAlleAb(board.staende, {
            home: HOME,
            autor: autorFassung2(),
          });
          const lage = zusammenfassen(staende).lage;
          sende(res, 200, {
            // Für die alte Form: ob mindestens ein Repository geholt und
            // wieder geschickt wurde. Der Stand je Repository steht daneben.
            geholt: staende.some((eintrag) => eintrag.lage === 'abgeglichen'),
            gegeben: staende.some((eintrag) => eintrag.lage === 'abgeglichen'),
            lage,
            staende,
          });
          return;
        }
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
        // Die Anzeige braucht mehr als den Namen: Besitzer, Verweise und den
        // Stand. Gelesen wird je Board einmal; die Schreibwege antworten
        // weiter mit der schlanken Liste aus `registerFuerSeite`.
        const seite = registerFuerSeite();
        seite.boards = seite.boards.map((eintrag) => {
          const board = REGISTER.boards.find((b) => b.id === eintrag.id);
          if (!board) return { ...eintrag, repo: '' };
          const kennzahlen = kennzahlenVon(board, HOME);
          return {
            ...eintrag,
            repo: board.repo,
            // Die Sichtbarkeit steht an jedem Board: öffentlich oder privat.
            // Das Hauptboard trägt sie im Register, weil sein Ordner fehlen
            // kann; sonst wird sie aus seiner Umgebung gelesen.
            sichtbarkeit: board.sichtbarkeit || sichtbarkeitVon(HOME, board.repo),
            ...kennzahlen,
            // „nicht geholt“ bleibt der Grund, auch wenn der Ordner fehlt.
            ...(board.fehler ? { fehler: board.fehler } : null),
          };
        });
        sende(res, 200, { ...seite, identitaet: IDENTITAET });
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

  // Das Hauptboard erneut holen. Der Weg räumt nur einen leeren oder halb
  // geklonten Zielordner; danach steht der Eintrag neu im Register. Ein
  // Fehlschlag antwortet weiter mit 200 und nennt den Grund — die Seite bleibt
  // bedienbar und kann es später erneut versuchen.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/hauptboard/holen',
    handler: (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const { board, fehler, register, verweise } = wiederholen({ home: HOME });
        if (register) {
          REGISTER.boards = register.boards;
          REGISTER.aktiv = register.aktiv;
          setzeAktiv(register.aktiv);
        }
        sende(res, 200, {
          board: board || null,
          fehler: fehler || '',
          ...(verweise ? { verweise } : null),
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Der Katalog des Hauptboards: die kuratierten öffentlichen Dinge und die
  // gefundenen Stationen mit Sternen, Fassung, Host und Verweis. `kuratiert`
  // und `gefunden` sind die beiden Teile, `eintraege` die zusammengeführte
  // Liste. Gelesen wird aus dem Hauptboard im Register, nicht aus dem offenen
  // Board; ohne Hauptboard bleibt die Antwort leer und sagt warum.
  // `frisch=1` umgeht den Zwischenspeicher und erzwingt die Suche.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/katalog',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const suche = String(frage.get('suche') == null ? '' : frage.get('suche'));
        const frisch = ['1', 'true', 'ja'].includes(
          String(frage.get('frisch') == null ? '' : frage.get('frisch')).toLowerCase(),
        );
        const haupt = hauptboardFuerKatalog();
        if (!haupt) {
          sende(res, 200, {
            eintraege: [], kuratiert: [], gefunden: [], hinweis: 'Kein Hauptboard',
            stand: null, standGefunden: null,
          });
          return;
        }
        const gesammelt = await sammleKatalog({
          hauptboard: haupt.repo,
          home: HOME,
          client: erstelleClient({ home: HOME }),
          frisch,
        });
        sende(res, 200, {
          eintraege: sucheKatalog(gesammelt.eintraege, suche),
          kuratiert: sucheKatalog(gesammelt.kuratiert, suche),
          gefunden: sucheKatalog(gesammelt.gefunden, suche),
          hinweis: gesammelt.hinweis || '',
          stand: gesammelt.stand || null,
          standGefunden: gesammelt.standGefunden || null,
          luecken: Array.isArray(gesammelt.luecken) ? gesammelt.luecken : [],
        });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Das Probeprojekt in ein eigenes Board übernehmen. Das Original wird nur
  // gelesen; Board und Kopie entstehen als eigene Repositories unter den
  // Ablagen, werden aufgenommen und geöffnet. Ohne eigenen Namen gibt es kein
  // Ziel — die Antwort nennt, was fehlt.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/uebernehmen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const wer = IDENTITAET || {};
        const name = String(
          koerper.name != null && String(koerper.name).trim()
            ? koerper.name
            : (wer.name || ''),
        ).trim().slice(0, 40);
        if (!name) { sende(res, 409, { fehlt: 'name' }); return; }

        const haupt = hauptboardFuerKatalog();
        if (!haupt) {
          sende(res, 409, { error: 'Es gibt kein Hauptboard im Register' });
          return;
        }
        let hauptboard;
        try {
          hauptboard = liesBoardFassung2(haupt.repo);
        } catch (fehler) {
          sende(res, 409, {
            error: 'Das Hauptboard ist nicht lesbar: ' + kurzZeile(fehler),
          });
          return;
        }

        const genannt = String(koerper.repo == null ? '' : koerper.repo).trim();
        const quelle = genannt ? resolve(genannt) : probeprojektDesHauptboards();
        if (!quelle) {
          sende(res, 404, {
            error: 'Das Probeprojekt des Hauptboards wurde nicht gefunden',
          });
          return;
        }
        if (!existsSync(join(quelle, 'vorhaben.json'))) {
          sende(res, 400, { error: 'Der Ordner ist kein Vorhaben: ' + quelle });
          return;
        }
        let roh;
        let vorhaben;
        try {
          roh = JSON.parse(readFileSync(join(quelle, 'vorhaben.json'), 'utf8'));
          vorhaben = liesVorhaben(quelle);
        } catch (fehler) {
          sende(res, 400, {
            error: 'Das Vorhaben ist nicht lesbar: ' + kurzZeile(fehler),
          });
          return;
        }

        // Der Workflow der Kopie zeigt auf das Original, nicht in die Kopie.
        // Liegt er als `owner/name` im Zwischenspeicher, gilt dieser Ort.
        const workflowPfad = lokalerOrt(vorhaben.workflow.repo, quelle);
        const workflowOrt = workflowPfad && existsSync(workflowPfad)
          ? workflowPfad
          : ortImRepo(vorhaben.workflow.repo, quelle);
        if (!workflowOrt || !existsSync(workflowOrt)) {
          sende(res, 409, {
            error: 'Der Workflow des Vorhabens liegt nicht lokal: '
              + vorhaben.workflow.repo,
          });
          return;
        }

        const boardName = String(koerper.boardName == null ? '' : koerper.boardName)
          .trim().slice(0, 60) || (name + 's Board');
        const boardId = freieBoardKennung(boardName);
        const boardOrdner = join(HOME, 'board', 'ablagen', boardId);

        // Die eigene Person auf dem neuen Board: der Login, wenn es einen
        // gibt; sonst die Kennung, unter der das Board liegt.
        const login = String(wer.github || '').trim() || boardId;
        const personFarbe = /^#[0-9a-f]{6}$/i.test(String(wer.farbe || ''))
          ? String(wer.farbe) : '#fbbf24';

        const kopieId = vorhaben.id + '-kopie';
        const kopieOrdner = join(boardOrdner, 'vorhaben-' + kopieId);
        mkdirSync(boardOrdner, { recursive: true });
        kopiereOrdner(quelle, kopieOrdner, null, new Set(['vorhaben.json']));

        // Der Stand des Originals; ein Tag benennt die Fassung, sonst bleibt
        // sie leer, statt eine Zahl zu erfinden.
        const marke = git(['describe', '--tags', '--abbrev=0'], null, 5000, quelle);
        const quellFassung = marke.ok && marke.out.trim() ? marke.out.trim() : '';

        // Ein Verweis im neuen Board: `owner/name`, wenn das Repository einen
        // GitHub-Remote hat; sonst der Ordnername. Was sich hier nicht
        // auflösen lässt, bleibt, wie es ist — nur ein toter, absoluter Pfad
        // wird zum Ordnernamen, damit kein neuer Verweis einen Pfad trägt.
        const alsVerweis = (wert, basis) => {
          const text = String(wert == null ? '' : wert).trim();
          if (!text) return '';
          const ort = lokalerOrt(text, basis);
          if (ort && existsSync(ort)) return verweisFuerRepo(ort);
          const zwischen = ortImRepo(text, basis);
          if (zwischen && existsSync(zwischen)) return verweisFuerRepo(zwischen);
          return text.startsWith('/') ? basename(text) : text;
        };

        const kopie = {
          ...roh,
          id: kopieId,
          name: vorhaben.name,
          workflow: { ...roh.workflow, repo: verweisFuerRepo(workflowOrt) },
          verantwortliche: Object.fromEntries(
            Object.keys(vorhaben.verantwortliche).map((stelle) => [stelle, [login]]),
          ),
          fork_von: {
            repo: basename(quelle),
            ...(quellFassung ? { fassung: quellFassung } : null),
          },
        };
        writeFileSync(join(kopieOrdner, 'vorhaben.json'),
          JSON.stringify(kopie, null, 2) + '\n', 'utf8');

        // Das Board: eigene Kennung, eigene Person. Workflows und Stationen
        // bleiben Verweise auf die Repositories des Hauptboards; geschrieben
        // werden sie als `owner/name`, wo ein GitHub-Remote bekannt ist.
        const boardDaten = {
          format: 2,
          id: boardId,
          name: boardName,
          art: 'lokal',
          personen: [{ login, name, farbe: personFarbe }],
          workflows: hauptboard.workflows.map((verweis) => ({
            repo: alsVerweis(verweis.repo, haupt.repo),
            fassung: verweis.fassung,
          })),
          vorhaben: [{ repo: verweisFuerRepo(kopieOrdner) }],
          stationen: hauptboard.stationen.map((verweis) => ({
            repo: alsVerweis(verweis.repo, haupt.repo),
          })),
          einstellungen: {},
          layout: {},
        };
        writeFileSync(join(boardOrdner, 'board.json'),
          JSON.stringify(boardDaten, null, 2) + '\n', 'utf8');
        // Die Kopie ist ein eigenes Repository; im Board-Repository steht nur
        // der Verweis, nicht ihre Geschichte. Das hält beide getrennt.
        writeFileSync(join(boardOrdner, '.gitignore'), 'vorhaben-*/\n', 'utf8');

        const autor = [
          name,
          wer.github ? wer.github + '@users.noreply.github.com' : 'board@local',
        ];
        legeRepoAn(boardOrdner, 'Board „' + boardName + '“ angelegt', autor);
        legeRepoAn(kopieOrdner, 'Vorhaben „' + vorhaben.name + '“ übernommen', autor);

        const aufgenommen = nimmBoardAuf(HOME, {
          pfad: boardOrdner,
          person: login,
        });
        REGISTER.boards = aufgenommen.register.boards;
        REGISTER.aktiv = aufgenommen.register.aktiv;
        setzeAktiv(aufgenommen.register.aktiv);

        sende(res, 200, {
          board: aufgenommen.board,
          vorhaben: { ...kopie, repo: kopieOrdner },
        });
      } catch (error) {
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
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
        // Ein Board der Fassung 1 trägt seine Fassung in der Datei „format“;
        // ein Board der Fassung 2 trägt sie in `board.json`. Fehlt die Datei,
        // ist der Ordner nicht (mehr) da — der Wechsel rührt nichts an.
        const marke = board.format === 2 ? 'board.json' : 'format';
        if (!existsSync(join(board.repo, marke))) {
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
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
      }
    },
  }));

  // Das offene Board selbst: Registereintrag, Format, Art, Sichtbarkeit und
  // Schreibrecht. Die Fläche bleibt weg — wer sie braucht, liest `/board/data`.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/board',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      if (!AKTIV || !REPO) { sende(res, 404, { error: 'Noch kein Board verbunden' }); return; }
      try {
        sende(res, 200, await offenesBoardBild());
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Ein Board ins Register legen und sofort öffnen — derselbe Weg wie
  // `/board/boards`, mit `repo` als zweitem Namen für den Ordner. Die Antwort
  // ist das Bild des offenen Boards, wie es `/board/data` liest.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/board/verbinden',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const wunschRepo = String(koerper.repo == null ? '' : koerper.repo).trim();
        const adresse = String(koerper.adresse == null ? '' : koerper.adresse).trim();
        const wert = wunschRepo || adresse;
        if (!wert) {
          sende(res, 400, { error: 'Es fehlt „repo“ oder „adresse“' });
          return;
        }
        if (!IDENTITAET || !IDENTITAET.name) {
          sende(res, 400, { error: 'Bitte zuerst den eigenen Namen eintragen' });
          return;
        }
        // Ein unbekannter Ordner wird nicht angelegt: dieser Weg verbindet,
        // was schon da ist. Ein vorhandener, leerer Ordner darf ein neues
        // Board bekommen — wie bei `/board/boards`.
        const istAdresse = /^(https?:\/\/|file:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(wert);
        if (!istAdresse) {
          const ort = resolve(wert);
          if (!existsSync(ort)) {
            sende(res, 404, { error: 'Diesen Ordner gibt es nicht: ' + ort });
            return;
          }
          const eintraege = readdirSync(ort).filter((name) => name !== '.git');
          const alsBoard2 = existsSync(join(ort, 'board.json'));
          const alsBoard1 = existsSync(join(ort, 'format'));
          if (!alsBoard2 && !alsBoard1 && eintraege.length) {
            sende(res, 409, { error: 'Dieser Ordner ist kein Board: ' + ort });
            return;
          }
        }
        const { board, register } = verbindeBoard({
          home: HOME,
          name: String(koerper.name == null ? '' : koerper.name),
          adresse: wert,
          identitaet: IDENTITAET,
        });
        REGISTER.boards = register.boards;
        REGISTER.aktiv = register.aktiv;
        setzeAktiv(board.id);
        sende(res, 200, await bildDesOffenenBoards());
      } catch (error) {
        const text = String((error && error.message) || error);
        // Eine Adresse, die sich nicht holen lässt, ist nicht gefunden; ein
        // Ordner, der nicht zum Board taugt, ist ein Widerspruch.
        const status = Number(error && error.status)
          || (/ließ sich nicht holen|nicht erreichbar|Adresse/i.test(text) ? 404 : 409);
        sende(res, status, { error: text });
      }
    },
  }));

  // Der Workflow des offenen Boards: Verweis, Fassung, Stationen und
  // Positionen, soweit lesbar. Ohne Workflow antwortet der Weg 409 mit Grund.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/workflow',
    handler: (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      if (!AKTIV || !REPO) { sende(res, 404, { error: 'Noch kein Board verbunden' }); return; }
      try {
        const { status, daten } = workflowDesOffenenBoards();
        sende(res, status, daten);
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Der Umzug aus der alten Ablage: Sie wird nur gelesen; geschrieben wird
  // unter dem Ziel. Ohne Ziel entsteht ein neuer Ordner unter
  // `$DSH_HOME/board/umzug`. Ein Ziel, das schon etwas enthält, wird nicht
  // überschrieben — die Antwort nennt, was dort liegt.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/umzug',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        // Der Umzug schreibt außerhalb der offenen Ablage; das Schreibrecht
        // des offenen Boards entscheidet trotzdem, ob geschrieben werden darf.
        const recht = await schreibrechtFuerBoard();
        if (recht.darf !== true) {
          sende(res, 403, {
            error: String(recht.grund || 'Kein Schreibrecht für dieses Board.'),
            ...(recht.hinweis ? { hinweis: recht.hinweis } : null),
          });
          return;
        }
        const board = umzugQuelle();
        if (!board) {
          sende(res, 400, {
            error: 'Keine alte Ablage im Register: es gibt kein Board der Fassung 1.',
          });
          return;
        }
        const quelle = resolve(board.repo);
        try {
          if (readFileSync(join(quelle, 'format'), 'utf8').trim() !== '1') {
            sende(res, 400, { error: 'Die alte Ablage nennt nicht Format 1: ' + quelle });
            return;
          }
        } catch (fehler) {
          sende(res, 400, {
            error: 'Die alte Ablage ist nicht lesbar: ' + kurzZeile(fehler),
          });
          return;
        }

        const koerper = await leseKoerper(req);
        const bestand = pruefeZuordnung(koerper.zuordnung);
        if (!bestand.ok) { sende(res, 400, { error: bestand.fehler }); return; }
        // Ohne Angabe gilt die vorhandene Abbildung; sie steht in der Antwort,
        // bevor der Lauf beginnt.
        const zuordnung = bestand.zuordnung || zuordnungAusBestand(board);
        const host = hostAusZuordnung(zuordnung, board);
        if (!host) {
          sende(res, 400, {
            error: 'Für die Kennung „' + String(board.person || 'p1')
              + '“ fehlt der GitHub-Name; gib die Zuordnung mit.',
            zuordnung,
          });
          return;
        }

        const zielWahl = pruefeUmzugZiel(koerper.ziel);
        if (!zielWahl.ok) {
          sende(res, 400, { error: zielWahl.fehler, zuordnung });
          return;
        }
        const ziel = zielWahl.ziel;
        if (liegtInnen(quelle, ziel)) {
          sende(res, 400, {
            error: 'Das Ziel liegt in der alten Ablage; die bleibt unverändert: ' + ziel,
            zuordnung,
          });
          return;
        }
        if (liegtInnen(ziel, quelle)) {
          sende(res, 400, {
            error: 'Die alte Ablage liegt im Ziel: ' + ziel,
            zuordnung,
          });
          return;
        }

        const quelleBild = { id: board.id, name: board.name, repo: quelle };
        // Erst sehen, was im Ziel liegt: Ein vorhandenes, nicht leeres Ziel
        // wird nicht überschrieben. Die Antwort nennt die vorhandenen.
        let vorhanden = [];
        try {
          if (existsSync(ziel)) vorhanden = readdirSync(ziel);
        } catch (fehler) {
          sende(res, 400, {
            error: 'Das Ziel ist nicht lesbar: ' + kurzZeile(fehler),
            zuordnung,
          });
          return;
        }
        if (vorhanden.length) {
          const repositories = umzugRepositories(ziel, host)
            .map((eintrag) => ({ ...eintrag, stand: 'übersprungen' }));
          const bericht = join(ziel, 'umzug.md');
          sende(res, 200, {
            ok: true,
            quelle: quelleBild,
            ziel,
            zuordnung,
            host,
            bericht: existsSync(bericht) ? bericht : '',
            hinweis: 'Das Ziel ist nicht leer; es wird nichts überschrieben.',
            anzahl: {
              repositories: repositories.length,
              angelegt: 0,
              uebersprungen: repositories.length,
              fehler: repositories.filter((eintrag) => eintrag.fehler).length,
            },
            repositories,
          });
          return;
        }

        // Der vorhandene Umzug als eigener Prozess: Er liest die alte Ablage
        // und schreibt ausschließlich unter das Ziel.
        const werkzeug = join(dirname(fileURLToPath(import.meta.url)),
          'werkzeuge', 'umzug2.mjs');
        if (!existsSync(werkzeug)) {
          sende(res, 500, { error: 'Das Umzugswerkzeug fehlt: ' + werkzeug });
          return;
        }
        const bericht = join(ziel, 'umzug.md');
        const lauf = spawnSync(process.execPath, [
          werkzeug,
          '--quelle', quelle,
          '--ziel', ziel,
          '--host', host,
          '--bericht', bericht,
        ], {
          cwd: dirname(werkzeug),
          encoding: 'utf8',
          timeout: 300000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        if (lauf.status !== 0) {
          const grund = String(lauf.stderr || lauf.stdout || '').trim()
            .split('\n').map((zeile) => zeile.trim()).filter(Boolean).pop()
            || 'unbekannter Fehler';
          const repositories = umzugRepositories(ziel, host)
            .map((eintrag) => ({ ...eintrag, stand: 'angelegt' }));
          sende(res, 500, {
            error: 'Der Umzug ist gescheitert: ' + grund,
            quelle: quelleBild,
            ziel,
            zuordnung,
            host,
            repositories,
          });
          return;
        }

        const repositories = umzugRepositories(ziel, host)
          .map((eintrag) => ({ ...eintrag, stand: 'angelegt' }));
        let hinweis = '';
        try {
          ergaenzeUmzugBericht(bericht, { zuordnung, repositories });
        } catch (fehler) {
          // Der Umzug ist gelaufen; der Bericht bleibt, wie das Werkzeug ihn
          // schrieb. Der Hinweis sagt, dass die Zuordnung dort fehlt.
          hinweis = 'Der Bericht ließ sich nicht ergänzen: ' + kurzZeile(fehler);
        }
        sende(res, 200, {
          ok: true,
          quelle: quelleBild,
          ziel,
          zuordnung,
          host,
          bericht,
          hinweis,
          anzahl: {
            repositories: repositories.length,
            angelegt: repositories.length,
            uebersprungen: 0,
            fehler: repositories.filter((eintrag) => eintrag.fehler).length,
          },
          repositories,
        });
      } catch (fehler) {
        sende(res, (fehler && fehler.status) || 500, {
          error: String((fehler && fehler.message) || fehler),
        });
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
        // Die Identität gilt auch im Archiv, liegt aber außerhalb der Ablage.
        // In ein Archiv wird ihre Personendatei nicht geschrieben.
        if (REPO && !istArchiv(AKTIV)) {
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

  // Die Texte des Boards: je Sprache eine Datei neben dem Plugin. Fehlt eine
  // Sprache, bleibt der deutsche Ausgangstext stehen — die Seite zeigt nie
  // leere Stellen. Die Sprache selbst wählt das Dashboard.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/sprache',
    handler: (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const roh = String(frage.get('id') == null ? '' : frage.get('id'))
          .trim().toLowerCase();
        const id = roh || 'de';
        if (!/^[a-z]{2}(-[a-z0-9]+)?$/.test(id)) {
          sende(res, 400, { error: 'Unbekannte Sprache: ' + (id || 'leer') });
          return;
        }
        let texte = {};
        try {
          texte = JSON.parse(readFileSync(
            new URL('./texte/' + id + '.json', import.meta.url), 'utf8',
          ));
        } catch {
          // Kein Wörterbuch für diese Sprache: der Ausgangstext gilt.
          texte = {};
        }
        sende(res, 200, { id, texte });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // Die Darstellung: die Akzentfarbe des Boards. Sie ist persönlich und gilt
  // für alle Boards; sie liegt neben der Identität, nicht in `board.json`.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/darstellung',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        sende(res, 200, { darstellung: liesDarstellung(HOME), akzente: AKZENTE });
        return;
      }
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur GET oder POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const akzent = String(koerper.akzent == null ? '' : koerper.akzent).trim();
        if (!AKZENTE.includes(akzent)) {
          sende(res, 400, {
            error: 'Unbekannter Akzent: ' + (akzent || 'leer') + '. Erlaubt: '
              + AKZENTE.join(', '),
          });
          return;
        }
        const wert = schreibeDarstellung(HOME, { akzent });
        sende(res, 200, { ok: true, darstellung: wert, akzente: AKZENTE });
      } catch (error) {
        sende(res, 400, { error: String((error && error.message) || error) });
      }
    },
  }));

  // GitHub: der Stand der Verbindung und die Metadaten eines Repositories.
  // Lesen geht ohne Token; der Token wird erst nach `GET /user` gespeichert.
  // Fehler bleiben in der Antwort stehen, statt die Route abzubrechen.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/stand',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const token = liesToken(HOME);
        const client = erstelleClient({ home: HOME, token });
        const repoFrage = String(frage.get('repo') || '').trim();

        if (!repoFrage) {
          const bekannt = liesLogin(HOME);
          const stand = { verbunden: false, login: token ? (bekannt || null) : null, grenze: null };
          if (!token) { sende(res, 200, stand); return; }
          try {
            const ich = await client.ich();
            stand.verbunden = true;
            stand.login = ich.login || bekannt || null;
            // Fehlt der Login neben einem vorhandenen Token, wird er hier
            // nachgetragen — danach braucht `/board/data` kein Netz mehr.
            if (ich.login && ich.login !== bekannt) {
              try { schreibeToken(HOME, token, ich.login); } catch { /* Der Token bleibt. */ }
            }
            try { stand.grenze = await client.rateGrenze(); } catch { /* weich */ }
          } catch (fehler) {
            stand.fehler = String((fehler && fehler.message) || fehler);
          }
          sende(res, 200, stand);
          return;
        }

        const treffer = repoFrage.match(
          /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/,
        );
        if (!treffer) {
          sende(res, 400, { error: 'Bitte das Repository als owner/name angeben' });
          return;
        }
        const [, owner, name] = treffer;
        const antwort = {
          verbunden: Boolean(token),
          repo: null,
          sterne: null,
          fassung: null,
          freigaben: [],
          fehler: null,
        };
        try {
          const daten = await client.repo(owner, name);
          antwort.repo = daten;
          antwort.sterne = daten.sterne;
          try {
            const freigaben = await client.releases(owner, name);
            antwort.freigaben = freigaben;
            antwort.fassung = freigaben.length ? freigaben[0].tag : null;
          } catch (fehler) {
            antwort.fehler = String((fehler && fehler.message) || fehler);
          }
        } catch (fehler) {
          antwort.fehler = String((fehler && fehler.message) || fehler);
        }
        sende(res, 200, antwort);
      } catch (fehler) {
        sende(res, 500, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));

  // Die Teams der Organisation: Name, Schlüssel und Mitglieder. Ohne Token
  // gibt es keine Teams — der Hinweis sagt, warum. Gelesen wird je Team die
  // Mitgliederliste; das Ergebnis gilt zehn Minuten (wie der Katalog).
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/teams',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const org = String(frage.get('org') || ORGANISATION).trim() || ORGANISATION;
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(org)) {
          sende(res, 400, { error: 'Die Organisation ist ungültig' });
          return;
        }
        const frisch = frage.get('frisch') === '1';
        const antwort = await holeTeams(org, { frisch });
        sende(res, 200, { org, ...antwort });
      } catch (fehler) {
        sende(res, 500, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));

  // Den Token prüfen und speichern — oder löschen. Ein ungültiger Token wird
  // nicht abgelegt; die Antwort enthält ihn nie.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/token',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        if (koerper.loeschen === true) {
          loescheToken(HOME);
          sende(res, 200, { verbunden: false, login: null });
          return;
        }
        const token = String(koerper.token == null ? '' : koerper.token).trim();
        if (!token) { sende(res, 400, { error: 'Der Token fehlt' }); return; }
        const client = erstelleClient({ home: HOME, token });
        let ich = null;
        try {
          ich = await client.ich();
        } catch (fehler) {
          if (fehler && fehler.status === 401) {
            sende(res, 401, { error: 'Token ungültig oder abgelaufen' });
            return;
          }
          sende(res, 502, {
            error: String((fehler && fehler.message) || 'GitHub nicht erreichbar'),
          });
          return;
        }
        schreibeToken(HOME, token, ich && ich.login);
        sende(res, 200, { verbunden: true, login: (ich && ich.login) || null });
      } catch (fehler) {
        sende(res, (fehler && fehler.status) || 400, {
          error: String((fehler && fehler.message) || fehler),
        });
      }
    },
  }));

  // Die Beiträge eines Dings sind die Pull Requests an seinem Repository.
  // Gelesen wird ohne Token, solange GitHub das Repository hergibt — bei
  // einem privaten antwortet es mit 404, und die Antwort bleibt der Verweis
  // auf GitHub. `kann` sagt, ob ein Token vorliegt und ein Pull Request von
  // hier aus möglich ist.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/beitraege',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const ziel = githubZielAus(frage.get('repo'));
        if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
        const repo = ziel.owner + '/' + ziel.name;
        const adresse = githubAdresse(ziel.owner, ziel.name);
        const token = liesToken(HOME);
        const client = erstelleClient({ home: HOME, token });
        let beitraege;
        try {
          beitraege = await client.beitraege(ziel.owner, ziel.name, {
            state: 'all', frisch: true,
          });
        } catch (fehler) {
          const status = Number(fehler && fehler.status) || 0;
          if (status === 404) {
            // Ohne Token ist ein privates Repository nicht zu sehen. Der Weg
            // über GitHub bleibt: die Adresse steht in der Antwort.
            sende(res, 200, {
              repo,
              adresse,
              kann: false,
              beitraege: [],
              hinweis: 'Nicht lesbar ohne Zugang — auf GitHub öffnen',
            });
            return;
          }
          sende(res, status === 401 || status === 403 ? status : 502, {
            error: repo + ': ' + kurzZeile(fehler),
            repo,
            adresse,
          });
          return;
        }
        sende(res, 200, {
          repo,
          adresse,
          kann: Boolean(token),
          beitraege,
          hinweis: '',
        });
      } catch (fehler) {
        sende(res, 500, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));

  // Ein Beitrag ist ein Pull Request bei GitHub — kein Commit in der Ablage.
  // Gelesen wird immer frisch: ein gerade zusammengeführter Pull Request
  // zeigt beim nächsten Öffnen „zusammengeführt“. Anlegen geht nur für ein
  // Repository, das das offene Board nennt, und nur mit Token und
  // Schreibrecht; `head` und `base` sind Pflicht, der Zweig wird vorher per
  // Git geschickt. Ohne Token bleibt der Weg über GitHub.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/beitrag',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        try {
          const frage = new URL(req.url, 'http://localhost').searchParams;
          const ziel = githubZielAus(frage.get('repo'));
          if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
          const nummer = Number(frage.get('nummer'));
          if (!Number.isInteger(nummer) || nummer <= 0) {
            sende(res, 400, { error: 'Die Nummer des Beitrags fehlt' });
            return;
          }
          const repo = ziel.owner + '/' + ziel.name;
          const adresse = githubAdresse(ziel.owner, ziel.name);
          const token = liesToken(HOME);
          const client = erstelleClient({ home: HOME, token });
          try {
            const beitrag = await client.pull(ziel.owner, ziel.name, nummer);
            sende(res, 200, { repo, adresse, kann: Boolean(token), beitrag });
          } catch (fehler) {
            const status = Number(fehler && fehler.status) || 0;
            if (status === 404) {
              sende(res, 404, {
                error: 'Beitrag #' + nummer + ' nicht gefunden: ' + repo,
                repo,
                adresse,
                kann: Boolean(token),
              });
              return;
            }
            sende(res, status === 401 || status === 403 ? status : 502, {
              error: repo + ': ' + kurzZeile(fehler),
              repo,
              adresse,
            });
          }
        } catch (fehler) {
          sende(res, 500, { error: String((fehler && fehler.message) || fehler) });
        }
        return;
      }
      if (req.method !== 'POST') {
        sende(res, 405, { error: 'Nur GET oder POST' });
        return;
      }
      try {
        const koerper = await leseKoerper(req);
        const ziel = githubZielAus(koerper.repo);
        if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
        const repo = ziel.owner + '/' + ziel.name;
        const adresse = githubAdresse(ziel.owner, ziel.name);
        // Beschrieben werden nur Repositories, die das offene Board nennt —
        // in `board.json`, in einem Workflow oder in einem Vorhaben. Ein
        // lokaler Ordner allein sagt nichts über seine Zugehörigkeit. Die
        // Prüfung steht vor jedem Aufruf bei GitHub.
        const pfad = boardPfadFuer(ziel);
        if (!pfad) {
          sende(res, 403, { error: 'Repository ' + repo + ' steht nicht im Board' });
          return;
        }
        const token = liesToken(HOME);
        if (!token) {
          sende(res, 409, {
            kann: false,
            repo,
            adresse,
            hinweis: 'Pull Request auf GitHub öffnen',
          });
          return;
        }
        const titel = String(koerper.titel == null ? '' : koerper.titel).trim();
        const head = String(koerper.head == null ? '' : koerper.head).trim();
        const base = String(koerper.base == null ? '' : koerper.base).trim();
        const text = String(koerper.text == null ? '' : koerper.text);
        if (!titel) { sende(res, 400, { error: 'Der Titel fehlt' }); return; }
        if (!head || !base) {
          sende(res, 400, { error: 'Quellzweig und Zielzweig sind Pflicht' });
          return;
        }
        const client = erstelleClient({ home: HOME, token });
        let recht = false;
        try {
          recht = await darfSchreiben({ pfad, home: HOME, client });
        } catch {
          recht = false;
        }
        if (!recht) {
          sende(res, 403, { error: 'Kein Schreibrecht an ' + repo });
          return;
        }
        try {
          const beitrag = await client.erstellePull(ziel.owner, ziel.name, {
            titel, text, head, base,
          });
          // Kein `festhalten`: der Beitrag ist bei GitHub, nicht in der
          // Ablage. Die Antwort nennt Nummer und Adresse.
          sende(res, 200, {
            nummer: beitrag.nummer,
            adresse: beitrag.adresse,
          });
        } catch (fehler) {
          const status = Number(fehler && fehler.status) || 0;
          sende(res, [401, 403, 422].includes(status) ? status : 502, {
            error: 'Pull Request für ' + repo + ' nicht angelegt: ' + kurzZeile(fehler),
            repo,
            adresse,
          });
        }
      } catch (fehler) {
        sende(res, 400, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));


  // Die Fragen eines Dings sind die Issues an seinem Repository — ohne Pull
  // Requests. Gelesen wird ohne Token, solange GitHub das Repository hergibt;
  // bei einem privaten antwortet es mit 404, und der Verweis bleibt.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/fragen',
    handler: async (req, res) => {
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const ziel = githubZielAus(frage.get('repo'));
        if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
        const repo = ziel.owner + '/' + ziel.name;
        const adresse = githubAdresse(ziel.owner, ziel.name);
        const token = liesToken(HOME);
        const client = erstelleClient({ home: HOME, token });
        try {
          const fragen = await client.fragen(ziel.owner, ziel.name, {
            state: 'all', frisch: true,
          });
          sende(res, 200, {
            repo,
            adresse,
            kann: Boolean(token),
            fragen,
            hinweis: '',
          });
        } catch (fehler) {
          const status = Number(fehler && fehler.status) || 0;
          if (!token && status === 404) {
            // Ohne Token ist ein privates Repository nicht zu sehen. Der Weg
            // über GitHub bleibt: die Adresse steht in der Antwort.
            sende(res, 200, {
              repo,
              adresse,
              kann: false,
              fragen: [],
              hinweis: 'Nicht lesbar ohne Zugang — auf GitHub öffnen',
            });
            return;
          }
          sende(res, status === 401 || status === 403 ? status : 502, {
            error: repo + ': ' + kurzZeile(fehler),
            repo,
            adresse,
          });
        }
      } catch (fehler) {
        sende(res, 500, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));

  // Eine Frage ist ein Issue bei GitHub — kein Commit in der Ablage. Anlegen
  // geht nur für ein Repository, das das offene Board nennt, und nur mit
  // Token; ohne Token bleibt der Weg über GitHub.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/frage',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const ziel = githubZielAus(koerper.repo);
        if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
        const repo = ziel.owner + '/' + ziel.name;
        const adresse = githubAdresse(ziel.owner, ziel.name);
        // Nur Repositories, die das offene Board nennt — geprüft vor jedem
        // Aufruf bei GitHub.
        const pfad = boardPfadFuer(ziel);
        if (!pfad) {
          sende(res, 403, { error: 'Repository ' + repo + ' steht nicht im Board' });
          return;
        }
        const token = liesToken(HOME);
        if (!token) {
          sende(res, 409, {
            kann: false,
            repo,
            adresse,
            hinweis: 'Frage auf GitHub stellen',
          });
          return;
        }
        const titel = String(koerper.titel == null ? '' : koerper.titel).trim();
        const text = String(koerper.text == null ? '' : koerper.text);
        if (!titel) { sende(res, 400, { error: 'Der Titel fehlt' }); return; }
        const client = erstelleClient({ home: HOME, token });
        try {
          const frage = await client.erstelleFrage(ziel.owner, ziel.name, {
            titel, text,
          });
          sende(res, 200, { nummer: frage.nummer, adresse: frage.adresse });
        } catch (fehler) {
          const status = Number(fehler && fehler.status) || 0;
          sende(res, [401, 403, 422].includes(status) ? status : 502, {
            error: 'Frage für ' + repo + ' nicht angelegt: ' + kurzZeile(fehler),
            repo,
            adresse,
          });
        }
      } catch (fehler) {
        sende(res, 400, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));

  // Ein Fork ist eine Kopie des Repositories bei GitHub — kein lokaler Klon.
  // Angelegt wird nur für ein Repository, das das offene Board nennt; ohne
  // Token bleibt der Weg über GitHub.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/fork',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const ziel = githubZielAus(koerper.repo);
        if (ziel.fehler) { sende(res, 400, { error: ziel.fehler }); return; }
        const repo = ziel.owner + '/' + ziel.name;
        const adresse = githubAdresse(ziel.owner, ziel.name);
        const pfad = boardPfadFuer(ziel);
        if (!pfad) {
          sende(res, 403, { error: 'Repository ' + repo + ' steht nicht im Board' });
          return;
        }
        const token = liesToken(HOME);
        if (!token) {
          sende(res, 409, {
            kann: false,
            repo,
            adresse,
            hinweis: 'Auf GitHub forken',
          });
          return;
        }
        const client = erstelleClient({ home: HOME, token });
        try {
          const fork = await client.erstelleFork(ziel.owner, ziel.name);
          sende(res, 200, { fork });
        } catch (fehler) {
          const status = Number(fehler && fehler.status) || 0;
          sende(res, [401, 403, 422].includes(status) ? status : 502, {
            error: 'Fork für ' + repo + ' nicht angelegt: ' + kurzZeile(fehler),
            repo,
            adresse,
          });
        }
      } catch (fehler) {
        sende(res, 400, { error: String((fehler && fehler.message) || fehler) });
      }
    },
  }));


  /**
   * Gehört dieses Repository zum Board? Die Repositories der Fassung 2 liegen
   * in der Ablage des Boards: das Board selbst, ein Ordner darunter oder ein
   * Geschwister neben ihm. Dazu gehört der Zwischenspeicher des Zuhauses unter
   * `$DSH_HOME/board/cache`. Alles andere ist fremd — es wird beim
   * Veröffentlichen weder angelegt noch umgehängt.
   */
  function gehoertZumBoard(pfad, boardOrt, home = HOME) {
    const ort = resolve(String(pfad == null ? '' : pfad));
    const board = resolve(String(boardOrt == null ? '' : boardOrt));
    if (!ort || !board) return false;
    // `unter` ist wahr für den Ordner selbst und alles darunter; ein Pfad
    // außerhalb beginnt mit „..“.
    const unter = (ordner) => {
      const wo = resolve(String(ordner == null ? '' : ordner));
      if (!wo) return false;
      const rest = relative(wo, ort);
      return rest === ''
        || (rest !== '..' && !rest.startsWith('..' + sep) && !isAbsolute(rest));
    };
    if (unter(board)) return true;
    if (unter(dirname(board))) return true;
    const zwischen = String(home == null ? '' : home).trim();
    return Boolean(zwischen) && unter(join(zwischen, 'board', 'cache'));
  }

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/github/veroeffentlichen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const wunsch = String(koerper.board == null ? '' : koerper.board).trim();
        const eintrag = wunsch
          ? REGISTER.boards.find((b) => b.id === wunsch) || null
          : REGISTER.boards.find((b) => b.id === REGISTER.aktiv) || null;
        if (!eintrag) {
          sende(res, 404, { error: 'Board nicht gefunden: ' + (wunsch || 'offen') });
          return;
        }
        if (eintrag.format !== 2) {
          sende(res, 409, {
            error: 'Nur ein Board der Fassung 2 lässt sich veröffentlichen',
          });
          return;
        }
        const boardOrt = resolve(eintrag.repo);
        if (!existsSync(boardOrt)) {
          sende(res, 409, { error: 'Der Board-Ordner fehlt: ' + boardOrt });
          return;
        }

        // Vor dem ersten Schreiben: ein öffentliches Ding darf nur auf
        // öffentliche verweisen. Eine Lücke bricht ab, bevor ein Remote
        // entsteht oder ein Repository angelegt wird.
        const verweise = pruefeVerweise(boardOrt, { home: HOME });
        if (verweise.luecken.length) {
          sende(res, 409, {
            error: 'Öffentlich verweist nur auf Öffentliches',
            organisation: ORGANISATION,
            luecken: verweise.luecken,
          });
          return;
        }

        const board = komponiere({
          repo: boardOrt, person: eintrag.person, home: HOME,
        });
        // Je Verweis wird geprüft, ob das Repository zum Board gehört. Nur
        // die eigenen werden veröffentlicht; ein fremdes wird ausgelassen,
        // nicht angelegt und nicht umgehängt.
        const eigene = [];
        const ausgelassen = [];
        const gesehen = new Set();
        for (const stand of Array.isArray(board.staende) ? board.staende : []) {
          const pfad = String(stand.pfad || '');
          if (!pfad || gesehen.has(pfad)) continue;
          gesehen.add(pfad);
          if (!existsSync(pfad)) {
            sende(res, 409, { error: 'Repository fehlt: ' + pfad });
            return;
          }
          const repo = {
            pfad,
            name: basename(pfad),
            art: String(stand.art || ''),
            sichtbarkeit: sichtbarkeitVon(HOME, pfad),
          };
          if (!gehoertZumBoard(pfad, boardOrt)) {
            ausgelassen.push({
              repo: repo.name,
              pfad,
              art: repo.art,
              grund: 'gehört nicht zu diesem Board',
            });
            continue;
          }
          eigene.push(repo);
        }
        if (!eigene.length) {
          sende(res, 409, {
            error: 'Dieses Board hat keine eigenen Repositories',
            organisation: ORGANISATION,
            ausgelassen,
          });
          return;
        }

        // Der Anfang jeder Remote-Adresse. In Prüfungen ersetzt
        // `DSH_GIT_REMOTE_BASIS` den Anfang `git@github.com:`; die
        // Organisation und der Repository-Name bleiben danach stehen.
        let basis = String(process.env.DSH_GIT_REMOTE_BASIS || 'git@github.com:').trim();
        if (!basis) basis = 'git@github.com:';
        if (!/[:/]$/.test(basis)) basis += '/';
        const adresse = (name) => basis + ORGANISATION + '/' + name + '.git';

        const token = liesToken(HOME);
        if (!token) {
          // Ohne Token wird nichts geschrieben: die Befehle legen die Remotes
          // von Hand an, die Sichtbarkeit setzt danach GitHub.
          const befehle = [];
          for (const repo of eigene) {
            befehle.push('git -C ' + repo.pfad + ' remote add origin '
              + adresse(repo.name));
            befehle.push('git -C ' + repo.pfad + ' push -u origin main --tags');
          }
          sende(res, 409, {
            error: 'Ohne Token keine Veröffentlichung — die Befehle legen die '
              + 'Remotes von Hand an',
            organisation: ORGANISATION,
            befehle,
            ausgelassen,
            repositories: eigene.map((repo) => ({
              repo: repo.name,
              pfad: repo.pfad,
              sichtbarkeit: repo.sichtbarkeit,
              remote: adresse(repo.name),
            })),
          });
          return;
        }

        const client = erstelleClient({ home: HOME, token });
        const veroeffentlicht = [];
        let fehler = '';
        for (const repo of eigene) {
          const ziel = ORGANISATION + '/' + repo.name;
          const privat = repo.sichtbarkeit === 'privat';
          try {
            let angelegt = false;
            try {
              // Gibt es das Repository schon, wird es verbunden; sonst wird
              // es angelegt.
              await client.repo(ORGANISATION, repo.name);
            } catch (f) {
              if (!f || f.status !== 404) throw f;
              await client.erstelleRepo(ORGANISATION, {
                name: repo.name,
                privat,
                beschreibung: repo.art === 'board' ? 'Board' : '',
              });
              angelegt = true;
            }

            const url = adresse(repo.name);
            const vorhanden = git(['remote', 'get-url', 'origin'],
              null, undefined, repo.pfad);
            if (vorhanden.ok && vorhanden.out.trim()) {
              if (vorhanden.out.trim() !== url) {
                const gesetzt = git(['remote', 'set-url', 'origin', url],
                  null, undefined, repo.pfad);
                if (!gesetzt.ok) {
                  throw new Error('Remote ließ sich nicht setzen: '
                    + String(gesetzt.fehler || '').trim());
                }
              }
            } else {
              const hinzu = git(['remote', 'add', 'origin', url],
                null, undefined, repo.pfad);
              if (!hinzu.ok) {
                throw new Error('Remote ließ sich nicht anlegen: '
                  + String(hinzu.fehler || '').trim());
              }
            }

            const push = git(['push', '-u', 'origin', 'main', '--tags'],
              null, 120000, repo.pfad);
            if (!push.ok) {
              throw new Error('Push scheiterte: '
                + String(push.fehler || push.out || '').trim());
            }

            await client.setzeSichtbarkeit(ORGANISATION, repo.name, privat);
            veroeffentlicht.push({
              repo: repo.name,
              pfad: repo.pfad,
              remote: url,
              sichtbarkeit: repo.sichtbarkeit,
              angelegt,
            });
          } catch (f) {
            const grund = String((f && f.message) || f)
              .split('\n').map((z) => z.trim()).find(Boolean) || 'unbekannt';
            // Ein Fehler nennt sein Repository und hält an; die bisher
            // veröffentlichten stehen in der Antwort.
            fehler = ziel + ': ' + grund;
            break;
          }
        }
        if (fehler) {
          sende(res, 502, {
            error: 'Veröffentlichen hielt an: ' + fehler,
            organisation: ORGANISATION,
            veroeffentlicht,
            ausgelassen,
            fehler,
          });
          return;
        }
        sende(res, 200, {
          ok: true,
          organisation: ORGANISATION,
          veroeffentlicht,
          ausgelassen,
          fehler: null,
        });
      } catch (fehler) {
        sende(res, (fehler && fehler.status) || 400, {
          error: String((fehler && fehler.message) || fehler),
        });
      }
    },
  }));

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/doc',
    handler: (req, res) => {
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const board = boardFuerDateien();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { exists: false, error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerFuerVorgang(vorgang);
        if (!ordner) { sende(res, 404, { exists: false, error: 'Kein Ordner' }); return; }
        const name = dateiName(frage.get('datei') || '');
        if (!name) { sende(res, 400, { exists: false, error: 'Ungültiger Dateiname' }); return; }
        // Auch ein Dateiname bleibt im Vorhaben-Repository; der Ordner selbst
        // wird über `pfadImOrdner` geprüft.
        if (!pfadImOrdner(ordner, name.replace(/\/$/, ''))) {
          sende(res, 400, { exists: false, error: 'Ungültiger Dateiname' });
          return;
        }
        const inhalt = dateiInhalt(ordner, name);
        // Eine Datei trägt die Fassung mit, auf der sie beim Öffnen steht:
        // den Commit, der sie zuletzt geändert hat. Ein Ordner und eine noch
        // nicht gefasste Datei tragen `null`.
        sende(res, 200, {
          ...inhalt,
          basis: inhalt.art === 'ordner'
            ? null
            : dateiBasis(ordner, name, repoFuerVorgang(ordner)),
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
        const board = boardFuerDateien();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerFuerVorgang(vorgang);
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
        const board = boardFuerDateien();
        const vorgang = (board.vorgaenge || []).find((v) => v.id === frage.get('vorhaben'));
        if (!vorgang) { sende(res, 404, { exists: false, error: 'Vorhaben nicht gefunden' }); return; }
        const ordner = ordnerFuerVorgang(vorgang);
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
        // Fassung 2 schreibt in das eigene Repository des Vorhabens; die alte
        // Ablage bleibt unverändert.
        if (AKTIV && AKTIV.format === 2) {
          await speichereImVorhaben(koerper, res);
          return;
        }
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

  // Eine Station, die das Board schon kennt, als Verweis in seinen Workflow
  // stellen. Geschrieben wird nur `workflow.json` im Workflow-Repository;
  // Station, Vorhaben und Board bleiben unberührt. Kein Push — weitergegeben
  // wird beim Abgleich.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/workflow/station',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      if (!AKTIV || AKTIV.format !== 2) {
        sende(res, 409, {
          error: 'Eine Station kommt nur in einem Board der Fassung 2 in den Workflow',
        });
        return;
      }
      try {
        // Ohne Schreibrecht bleibt das Board im Lesemodus.
        if (!(await darfFuerBoard())) {
          sende(res, 403, { error: 'Nur lesen: für dieses Board fehlt das Schreibrecht.' });
          return;
        }
        const koerper = await leseKoerper(req);
        const wunschStation = String(koerper.station == null ? '' : koerper.station).trim();
        const wunschRepo = String(koerper.repo == null ? '' : koerper.repo).trim();
        if (!wunschStation && !wunschRepo) {
          sende(res, 400, { error: 'Station fehlt' }); return;
        }
        if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }

        const board = liesBoardFassung2(REPO);

        // Das Workflow-Repository des offenen Boards. Ohne eines gibt es
        // nichts zu schreiben.
        let workflowOrt = '';
        for (const verweis of board.workflows) {
          const ort = ortImRepo(verweis.repo, REPO);
          if (!ort) continue;
          try {
            if (liesRepo(ort).art === 'workflow') { workflowOrt = ort; break; }
          } catch {
            /* Der Verweis führt zu keinem lesbaren Workflow. */
          }
        }
        if (!workflowOrt) {
          sende(res, 409, { error: 'Das Board hat kein Workflow-Repository' }); return;
        }
        let workflow;
        try {
          workflow = liesWorkflow(workflowOrt);
        } catch (fehler) {
          sende(res, 409, {
            error: 'Der Workflow lässt sich nicht lesen: '
              + String((fehler && fehler.message) || fehler),
          });
          return;
        }

        // Die Station im Board suchen — über ihre Kennung oder ihren Pfad.
        let treffer = null;
        for (const verweis of board.stationen) {
          const ort = ortImRepo(verweis.repo, REPO);
          if (!ort) continue;
          if (wunschRepo) {
            if (resolve(REPO, wunschRepo) === ort) { treffer = { ort }; break; }
            continue;
          }
          try {
            const repo = liesRepo(ort);
            if (repo.art !== 'station') continue;
            const gelesen = liesStation(ort);
            if (gelesen.id === wunschStation) { treffer = { ort }; break; }
          } catch {
            /* Ein unlesbarer Verweis ist kein Treffer. */
          }
        }
        if (!treffer) {
          sende(res, 404, {
            error: 'Diese Station steht nicht im Board: ' + (wunschStation || wunschRepo),
          });
          return;
        }

        // Liegt das Repository da? Ohne Stationsdatei wird nichts geschrieben.
        let station;
        try {
          const repo = liesRepo(treffer.ort);
          if (repo.art !== 'station') throw new Error('Der Ordner ist keine Station');
          station = liesStation(treffer.ort);
        } catch {
          sende(res, 404, {
            error: 'Das Stations-Repository fehlt oder ist keine Station: ' + treffer.ort,
          });
          return;
        }

        // Wer diese Station in den Workflow stellt, muss sie verantworten:
        // ihr Host, der Autor des Workflows oder das Team `workflows`. Die
        // Prüfung steht vor jedem Schreiben.
        if (!(await verantwortetStation({
          station,
          workflow,
          lokal: !hatGithubRemote(workflowOrt),
        }))) {
          sende(res, 403, { error: 'Nicht verantwortlich für diese Station' });
          return;
        }

        // Ein öffentlicher Workflow darf nur auf öffentliche Stationen
        // verweisen. Die Prüfung steht vor dem Schreiben: kein Commit.
        if (sichtbarkeitVon(HOME, workflowOrt) === 'öffentlich'
          && sichtbarkeitVon(HOME, treffer.ort) === 'privat') {
          sende(res, 409, { error: 'Öffentlich verweist nur auf Öffentliches' });
          return;
        }

        // Den Verweis im Workflow suchen. Fehlt er, kommt er mit einer festen
        // Fassung hinein; eine leere oder fehlende Fassung wird zum kurzen
        // HEAD, kein Tag wird erfunden. Ist der Verweis schon da, bleibt seine
        // Fassung, wie sie ist — nachgezogen wird als eigene Handlung.
        let stationRef = workflow.stationen.find(
          (eintrag) => ortImRepo(eintrag.repo, workflowOrt) === treffer.ort,
        ) || null;
        let neuerStation = null;
        if (!stationRef) {
          const fassung = fassungZumFestschreiben(treffer.ort);
          if (!fassung) {
            sende(res, 409, { error: 'Die Station hat keine Fassung: ' + treffer.ort });
            return;
          }
          const vorhandene = new Set(workflow.stationen.map((eintrag) => eintrag.id));
          neuerStation = {
            repo: verweisFuerRepo(treffer.ort),
            fassung,
            id: kennung(station.id, vorhandene),
          };
          stationRef = neuerStation;
        }

        // Eine neue Position, auch wenn dieselbe Station schon eine hat: die
        // zweite Stelle ist erlaubt. Die Kennung folgt `<station>`, dann
        // `<station>-2`, `<station>-3` …
        const positionsBelegt = new Set(workflow.positionen.map((eintrag) => eintrag.id));
        let positionsId = stationRef.id;
        if (positionsBelegt.has(positionsId)) {
          let nummer = 2;
          while (positionsBelegt.has(stationRef.id + '-' + nummer)) nummer += 1;
          positionsId = stationRef.id + '-' + nummer;
        }

        // Die neue Position steht hinter der letzten und möglichst frei.
        const letzte = workflow.positionen.length
          ? workflow.positionen[workflow.positionen.length - 1] : null;
        let x = 40;
        let y = 80;
        if (letzte) {
          x = (Number.isFinite(letzte.x) ? letzte.x : 40) + 320;
          y = Number.isFinite(letzte.y) ? letzte.y : 80;
        }
        const lagen = new Set(workflow.positionen.map((eintrag) => eintrag.x + ':' + eintrag.y));
        while (lagen.has(x + ':' + y)) x += 320;

        const neuePosition = {
          id: positionsId,
          station: stationRef.id,
          x,
          y,
          bedingung: [],
        };
        // Hat die letzte Position keine ausgehende Kante, wird die neue
        // angeschlossen. Sonst bleibt der Workflow, wie er ist.
        const kante = letzte && !workflow.kanten.some((eintrag) => eintrag.von === letzte.id)
          ? { von: letzte.id, nach: positionsId }
          : null;

        // Erst prüfen, dann schreiben: ohne Fassungsablage entsteht keine
        // halbe Änderung.
        if (!git(['rev-parse', '--git-dir'], null, undefined, workflowOrt).ok) {
          sende(res, 409, {
            error: 'Das Workflow-Repository ist keine Fassungsablage: ' + workflowOrt,
          });
          return;
        }

        schreibeWorkflow(workflowOrt, {
          station: neuerStation,
          position: neuePosition,
          kante,
        });

        const autor = autorFassung2();
        const nachricht = 'Station „' + station.name + '“ in den Workflow gestellt';
        const lage = git(['status', '--porcelain', '--', 'workflow.json'],
          autor, undefined, workflowOrt);
        if (!lage.ok) {
          throw fehlerMit('Das Workflow-Repository antwortet nicht: '
            + String(lage.fehler || '').trim(), 500);
        }
        if (lage.out.trim()) {
          const add = git(['add', '--', 'workflow.json'], autor, undefined, workflowOrt);
          if (!add.ok) {
            throw fehlerMit('workflow.json ließ sich nicht vormerken: '
              + String(add.fehler || '').trim(), 500);
          }
          const commit = git(['commit', '-m', nachricht, '--', 'workflow.json'],
            autor, undefined, workflowOrt);
          if (!commit.ok) {
            throw fehlerMit('workflow.json ließ sich nicht fassen: '
              + String(commit.fehler || '').trim(), 500);
          }
        }

        // Die Antwort ist das Board, wie es jetzt dasteht.
        sende(res, 200, await fassung2Antwort());
      } catch (error) {
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
      }
    },
  }));

  // Eine Station im Workflow auf eine andere Fassung ziehen — als eigene
  // Handlung. Eine neue Fassung an der Station ändert den Workflow nicht; erst
  // dieser Weg schreibt den einen Verweis um und fasst ihn. Geschrieben wird
  // nur `workflow.json` im Workflow-Repository, kein Push.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/workflow/nachziehen',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      if (!AKTIV || AKTIV.format !== 2) {
        sende(res, 409, {
          error: 'Eine Fassung wird nur in einem Board der Fassung 2 nachgezogen',
        });
        return;
      }
      if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }
      try {
        // Ohne Schreibrecht bleibt das Board im Lesemodus.
        if (!(await darfFuerBoard())) {
          sende(res, 403, { error: 'Nur lesen: für dieses Board fehlt das Schreibrecht.' });
          return;
        }
        const koerper = await leseKoerper(req);
        const wunschStation = String(koerper.station == null ? '' : koerper.station).trim();
        const wunschFassung = String(koerper.fassung == null ? '' : koerper.fassung).trim();
        if (!wunschStation) { sende(res, 400, { error: 'Station fehlt' }); return; }

        const board = liesBoardFassung2(REPO);

        // Das Workflow-Repository des offenen Boards — dasselbe wie beim
        // Einstellen einer Station. Ohne eines gibt es nichts nachzuziehen.
        let workflowOrt = '';
        for (const verweis of board.workflows) {
          const ort = ortImRepo(verweis.repo, REPO);
          if (!ort) continue;
          try {
            if (liesRepo(ort).art === 'workflow') { workflowOrt = ort; break; }
          } catch {
            /* Der Verweis führt zu keinem lesbaren Workflow. */
          }
        }
        if (!workflowOrt) {
          sende(res, 409, { error: 'Das Board hat kein Workflow-Repository' }); return;
        }
        let workflow;
        try {
          workflow = liesWorkflow(workflowOrt);
        } catch (fehler) {
          sende(res, 409, {
            error: 'Der Workflow lässt sich nicht lesen: '
              + String((fehler && fehler.message) || fehler),
          });
          return;
        }

        // Die Station muss in diesem Workflow stehen: nachgezogen wird ein
        // vorhandener Verweis, nicht ein erfundener.
        const eintrag = workflow.stationen.find((station) => station.id === wunschStation);
        if (!eintrag) {
          sende(res, 404, {
            error: 'Diese Station steht nicht im Workflow: ' + wunschStation,
          });
          return;
        }
        const ort = ortImRepo(eintrag.repo, workflowOrt);
        if (!ort) {
          sende(res, 404, {
            error: 'Das Stations-Repository liegt nicht lokal: ' + String(eintrag.repo),
          });
          return;
        }
        try {
          if (liesRepo(ort).art !== 'station') throw new Error('keine Station');
        } catch {
          sende(res, 404, { error: 'Das Stations-Repository fehlt: ' + ort });
          return;
        }

        // Ohne Angabe gilt der neueste Tag, sonst der kurze HEAD. Ein Tag wird
        // nicht erfunden; die genannte Fassung muss ihre `station.json`
        // tragen, sonst wäre sie für den Workflow keine.
        const ziel = wunschFassung || fassungFuerStation(ort);
        if (!ziel) {
          sende(res, 409, { error: 'Die Station hat keine Fassung: ' + ort });
          return;
        }
        if (!fassungMitStation(ort, ziel)) {
          sende(res, 409, {
            error: 'Die Fassung „' + ziel + '“ fehlt in ' + ort,
          });
          return;
        }

        // Schon auf dieser Fassung: die Antwort ist das Bild, gefasst wird
        // nichts — ein leerer Commit entsteht nicht.
        if (ziel === eintrag.fassung) {
          sende(res, 200, await fassung2Antwort());
          return;
        }

        // Erst prüfen, dann schreiben: ohne Fassungsablage entsteht keine
        // halbe Änderung.
        if (!git(['rev-parse', '--git-dir'], null, undefined, workflowOrt).ok) {
          sende(res, 409, {
            error: 'Das Workflow-Repository ist keine Fassungsablage: ' + workflowOrt,
          });
          return;
        }

        schreibeFassung(workflowOrt, eintrag.id, ziel);

        // Die Meldung nennt den Namen von der Fassung, auf die gezogen wird;
        // ohne lesbaren Namen trägt die Kennung sie.
        let name = eintrag.id;
        const aufFassung = liesStationAufFassung(ort, ziel);
        if (aufFassung.station) {
          name = aufFassung.station.name || eintrag.id;
        } else {
          try {
            name = liesStation(ort).name || eintrag.id;
          } catch {
            /* Die Kennung trägt die Meldung auch ohne Namen. */
          }
        }
        const autor = autorFassung2();
        const nachricht = 'Station „' + name + '“ auf Fassung ' + ziel + ' nachgezogen';
        const lage = git(['status', '--porcelain', '--', 'workflow.json'],
          autor, undefined, workflowOrt);
        if (!lage.ok) {
          throw fehlerMit('Das Workflow-Repository antwortet nicht: '
            + String(lage.fehler || '').trim(), 500);
        }
        if (lage.out.trim()) {
          const add = git(['add', '--', 'workflow.json'], autor, undefined, workflowOrt);
          if (!add.ok) {
            throw fehlerMit('workflow.json ließ sich nicht vormerken: '
              + String(add.fehler || '').trim(), 500);
          }
          const commit = git(['commit', '-m', nachricht, '--', 'workflow.json'],
            autor, undefined, workflowOrt);
          if (!commit.ok) {
            throw fehlerMit('workflow.json ließ sich nicht fassen: '
              + String(commit.fehler || '').trim(), 500);
          }
        }

        // Die Antwort ist das Board, wie es jetzt dasteht.
        sende(res, 200, await fassung2Antwort());
      } catch (error) {
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
      }
    },
  }));

  // Einen Workflow als Verweis in das Board aufnehmen. Geschrieben wird nur
  // `board.json` im Board-Repository; Workflow, Stationen und Vorhaben bleiben
  // unberührt, und nichts wird weitergegeben — der Abgleich holt das nach.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/workflow/verbinden',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      if (!AKTIV || AKTIV.format !== 2) {
        sende(res, 409, {
          error: 'Ein Workflow kommt nur in einem Board der Fassung 2 ins Board',
        });
        return;
      }
      if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }
      try {
        // Ohne Schreibrecht bleibt das Board im Lesemodus.
        if (!(await darfFuerBoard())) {
          sende(res, 403, { error: 'Nur lesen: für dieses Board fehlt das Schreibrecht.' });
          return;
        }
        const koerper = await leseKoerper(req);
        const wunsch = String(koerper.repo == null ? '' : koerper.repo).trim();
        if (!wunsch) { sende(res, 400, { error: 'Ordner oder Adresse fehlt' }); return; }

        // Der Ordner gilt gegen das Board-Repository. Eine Adresse liegt
        // nicht auf diesem Rechner; geklont wird hier nicht.
        const ort = ortImRepo(wunsch, REPO);
        if (!ort) {
          sende(res, 404, {
            error: 'Das Workflow-Repository liegt nicht lokal: ' + wunsch,
          });
          return;
        }

        // Ein Workflow-Ordner ist ein Repository mit lesbarer `workflow.json`.
        let gelesen;
        try {
          const repo = liesRepo(ort);
          if (repo.art !== 'workflow') {
            throw new Error('Der Ordner ist kein Workflow: ' + ort);
          }
          gelesen = liesWorkflow(ort);
        } catch (fehler) {
          sende(res, 404, {
            error: 'Kein Workflow-Ordner: ' + String((fehler && fehler.message) || fehler),
          });
          return;
        }

        // Steht er schon im Board, bleibt alles, wie es ist.
        const board = liesBoardFassung2(REPO);
        const schonDa = board.workflows.some(
          (eintrag) => ortImRepo(eintrag.repo, REPO) === ort,
        );
        if (schonDa) {
          sende(res, 409, { error: 'Dieser Workflow steht schon im Board' });
          return;
        }

        // Ein öffentliches Board darf nur öffentliche Workflows aufnehmen.
        // Die Prüfung steht vor dem Schreiben: kein Commit.
        if (sichtbarkeitVon(HOME, REPO) === 'öffentlich'
          && sichtbarkeitVon(HOME, ort) === 'privat') {
          sende(res, 409, { error: 'Öffentlich verweist nur auf Öffentliches' });
          return;
        }

        // Die feste Fassung: der letzte Tag, sonst der Stand von HEAD.
        const fassung = fassungDesRepos(ort);
        if (!fassung) {
          sende(res, 409, { error: 'Der Workflow hat keine Fassung: ' + ort });
          return;
        }

        // Erst prüfen, dann schreiben: ohne Fassungsablage entsteht keine
        // halbe Änderung.
        if (!git(['rev-parse', '--git-dir'], null, undefined, REPO).ok) {
          sende(res, 409, {
            error: 'Das Board-Repository ist keine Fassungsablage: ' + REPO,
          });
          return;
        }

        const hinzugefuegt = schreibeBoardFassung2(REPO, {
          workflow: { repo: verweisFuerRepo(ort), fassung },
        });
        if (!hinzugefuegt) {
          sende(res, 409, { error: 'Dieser Workflow steht schon im Board' });
          return;
        }

        // Gefasst wird nur `board.json`; ein Push gehört zum Abgleich.
        const autor = autorFassung2();
        const nachricht = 'Workflow „' + gelesen.titel + '“ ins Board aufgenommen';
        const lage = git(['status', '--porcelain', '--', 'board.json'],
          autor, undefined, REPO);
        if (!lage.ok) {
          throw fehlerMit('Das Board-Repository antwortet nicht: '
            + String(lage.fehler || '').trim(), 500);
        }
        if (lage.out.trim()) {
          const add = git(['add', '--', 'board.json'], autor, undefined, REPO);
          if (!add.ok) {
            throw fehlerMit('board.json ließ sich nicht vormerken: '
              + String(add.fehler || '').trim(), 500);
          }
          const commit = git(['commit', '-m', nachricht, '--', 'board.json'],
            autor, undefined, REPO);
          if (!commit.ok) {
            throw fehlerMit('board.json ließ sich nicht fassen: '
              + String(commit.fehler || '').trim(), 500);
          }
        }

        // Die Antwort ist das Board, wie es jetzt dasteht.
        sende(res, 200, await fassung2Antwort());
      } catch (error) {
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
      }
    },
  }));

  // Stationen: das Vertrauensbild lesen (`GET`) und eine Station anlegen
  // (`POST`). Beide Wege liegen unter demselben Pfad.
  /**
   * Eine Station anlegen: `{ name, beschreibung? }`. Nur Fassung 2; ohne
   * Eigentümer (Schritt 25) oder ohne Recht am Anlegen (Schritt 26) antwortet
   * die Route 403 mit Grund und Hinweis. Nach Erfolg steht der Verweis in
   * `board.stationen`, `board.json` ist gefasst, und die Antwort ist das neue
   * Bild samt `station`.
   */
  async function legeStationAn(req, res) {
    try {
      const koerper = await leseKoerper(req);
      if (!AKTIV || AKTIV.format !== 2) {
        sende(res, 409, {
          error: 'Eine Station lässt sich nur in einem Board der Fassung 2 anlegen',
        });
        return;
      }
      if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }

      const name = String(koerper.name == null ? '' : koerper.name).trim();
      if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }
      if (name.length > 80) {
        sende(res, 400, { error: 'Der Name ist zu lang: höchstens 80 Zeichen' });
        return;
      }
      const beschreibung = String(koerper.beschreibung == null
        ? '' : koerper.beschreibung).trim();
      const kurzName = slug(name);
      if (!kurzName) {
        sende(res, 400, {
          error: 'Der Name enthält keine Buchstaben oder Ziffern für die Repo-Kennung',
        });
        return;
      }

      const board = liesBoardFassung2(REPO);
      if (!git(['rev-parse', '--git-dir'], null, undefined, REPO).ok) {
        sende(res, 409, {
          error: 'Das Board-Repository ist keine Fassungsablage: ' + REPO,
        });
        return;
      }

      // Der Eigentümer: ein Eintrag im Board, sonst die Anmeldung. Ohne ihn
      // entsteht kein Repository — die Antwort nennt den Grund und den Weg.
      const eigentuemer = await eigentuemerBild(board);
      if (!eigentuemer.eigentuemer) {
        sende(res, 403, {
          error: 'Ohne Eigentümer entsteht keine Station: es ist nicht bekannt, '
            + 'unter wem sie liegen soll.',
          grund: 'Der Eigentümer des Boards ist leer.',
          hinweis: String(eigentuemer.eigentuemerHinweis || EIGENTUEMER_HINWEIS),
        });
        return;
      }
      const owner = eigentuemer.eigentuemer;
      if (!EIGENTUEMER_MUSTER.test(owner)) {
        sende(res, 400, { error: 'Der Eigentümer ist ungültig: ' + owner });
        return;
      }

      // Neue Dinge entstehen nur mit Anmeldung. Der Grund und der Hinweis
      // kommen aus derselben Antwort, die `/board/data` zeigt.
      const anlegen = anlegenBild();
      if (anlegen.darf !== true) {
        sende(res, 403, {
          error: anlegen.grund || 'Neue Dinge brauchen eine Anmeldung.',
          ...(anlegen.hinweis ? { hinweis: anlegen.hinweis } : null),
        });
        return;
      }

      const repo = 'station-' + kurzName;
      const pfad = cachePfad(HOME, owner, repo);
      if (!pfad) {
        sende(res, 500, { error: 'Ohne Zuhause gibt es keinen Zwischenspeicher' });
        return;
      }
      // Der Name kann im Zwischenspeicher belegt sein, auch wenn GitHub ihn
      // nicht kennt: dann steht dort schon eine Station.
      if (existsSync(pfad)) {
        sende(res, 409, { error: 'Eine Station mit diesem Namen gibt es schon' });
        return;
      }

      // Die Naht: `selbst` fragt GitHub, `attrappe` sieht nur in den
      // Zwischenspeicher. Die Wahl steht in `einstellungen.anlegeweg`.
      const weg = anlegewegFuer(board);
      let pruefung;
      try {
        pruefung = await weg.pruefen({ owner, repo });
      } catch (fehler) {
        sende(res, anlegeStatus(fehler), { error: kurzZeile(fehler) });
        return;
      }
      if (!pruefung || pruefung.frei !== true) {
        sende(res, 409, {
          error: (pruefung && pruefung.meldung)
            || 'Eine Station mit diesem Namen gibt es schon',
        });
        return;
      }

      const { station, readme, dateien } = stationInhalt({
        slugName: kurzName, name, beschreibung, owner,
      });
      const nachricht = 'Station „' + name + '“ angelegt';
      const autor = autorFassung2();

      // Erst bauen, dann schicken: der Ordner im Zwischenspeicher ist ohne
      // Netz lesbar und trägt dieselben zwei Dateien.
      let angelegtPfad;
      try {
        angelegtPfad = baueStation({
          owner, repo, station, readme, nachricht, autor,
        });
      } catch (fehler) {
        sende(res, Number(fehler && fehler.status) || 500, {
          error: kurzZeile(fehler),
        });
        return;
      }

      // Danach der Weg: `selbst` legt das öffentliche Repository an und
      // schreibt die Dateien über die Inhalts-API; `attrappe` schickt nichts.
      try {
        await weg.anlegen({
          owner, repo, beschreibung, themen: [STATION_THEMA], dateien,
        });
      } catch (fehler) {
        // Der halbe Weg bleibt nicht liegen: der lokale Ordner gehört zu
        // diesem Versuch. Ein Repository bei GitHub wird nicht angefasst.
        try { rmSync(angelegtPfad, { recursive: true, force: true }); } catch {
          /* Aufräumen ist nicht wichtiger als der Fehler. */
        }
        sende(res, anlegeStatus(fehler), { error: kurzZeile(fehler) });
        return;
      }

      // Der Verweis ins Board, nicht doppelt. Gefasst wird nur `board.json`;
      // ein Push gehört zum Abgleich.
      schreibeFassung2Station(owner + '/' + repo);
      const lage = git(['status', '--porcelain', '--', 'board.json'],
        autor, undefined, REPO);
      if (!lage.ok) {
        throw fehlerMit('Das Board-Repository antwortet nicht: '
          + String(lage.fehler || '').trim(), 500);
      }
      if (lage.out.trim()) {
        const add = git(['add', '--', 'board.json'], autor, undefined, REPO);
        if (!add.ok) {
          throw fehlerMit('board.json ließ sich nicht vormerken: '
            + String(add.fehler || '').trim(), 500);
        }
        const commit = git(['commit', '-m', nachricht, '--', 'board.json'],
          autor, undefined, REPO);
        if (!commit.ok) {
          throw fehlerMit('board.json ließ sich nicht fassen: '
            + String(commit.fehler || '').trim(), 500);
        }
      }

      // Das neue Bild in der Form von `/board/data`, dazu der neue Eintrag.
      const antwort = await fassung2Antwort();
      antwort.station = { owner, repo, pfad: angelegtPfad, name };
      sende(res, 200, antwort);
    } catch (error) {
      sende(res, (error && error.status) || 500, {
        error: String((error && error.message) || error),
      });
    }
  }

  // Das Vertrauensbild einer Station (Fassung 2): Name, Host, Fassung,
  // Reife, Lizenz, Beschreibung, Beispiele, Verwendung und Repository.
  // Gelesen wird aus dem Repository der Station; fehlt es oder seine Datei,
  // steht der Grund in der Antwort. Fassung 1 bleibt bei seiner Anzeige.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/station',
    handler: async (req, res) => {
      if (req.method === 'POST') { await legeStationAn(req, res); return; }
      if (req.method !== 'GET') { sende(res, 405, { error: 'Nur GET' }); return; }
      if (!AKTIV || AKTIV.format !== 2) {
        sende(res, 409, {
          error: 'Das Vertrauensbild einer Station gibt es nur in einem Board der Fassung 2',
        });
        return;
      }
      if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }
      try {
        const frage = new URL(req.url, 'http://localhost').searchParams;
        const gesucht = String(frage.get('station') == null ? '' : frage.get('station')).trim();
        if (!gesucht) { sende(res, 400, { error: 'Station fehlt' }); return; }

        const board = liesBoardFassung2(REPO);
        let ort = '';
        let station = null;
        const unlesbar = [];
        for (const verweis of board.stationen) {
          const ziel = ortImRepo(verweis.repo, REPO);
          if (!ziel) {
            unlesbar.push({
              ort: String(verweis.repo == null ? '' : verweis.repo),
              grund: 'Das Repository liegt nicht lokal',
            });
            continue;
          }
          try {
            if (liesRepo(ziel).art !== 'station') {
              throw new Error('Der Ordner ist keine Station');
            }
            const gelesen = liesStation(ziel);
            if (gelesen.id !== gesucht) continue;
            ort = ziel;
            station = gelesen;
            break;
          } catch (fehler) {
            unlesbar.push({
              ort: ziel,
              grund: String((fehler && fehler.message) || fehler).split('\n')[0].trim(),
            });
          }
        }
        if (!station) {
          // Ist genau ein Verweis unlesbar, ist das der Grund — sonst bleibt
          // nur, dass keine Station des Boards diese Kennung trägt.
          const grund = unlesbar.length === 1
            ? 'Die Station „' + gesucht + '“ lässt sich nicht lesen: ' + unlesbar[0].grund
            : 'Diese Station steht nicht im Board: ' + gesucht;
          sende(res, 404, { error: grund });
          return;
        }

        const bild = stationBild(board, REPO, ort, station);
        // Die Zahlen des Vertrauensbilds: zuerst der Katalog-Zwischenspeicher,
        // dann der frische Blick zu GitHub. Ohne Netz bleibt der letzte Stand
        // mit einem Hinweis stehen; die Seite selbst bleibt lesbar.
        const haupt = hauptboardFuerKatalog();
        let zahlen;
        try {
          zahlen = await stationZahlen({
            repo: ort,
            hauptboard: haupt ? haupt.repo : '',
            home: HOME,
          });
        } catch (fehler) {
          zahlen = {
            sterne: null,
            freigaben: null,
            fragen: null,
            beitraege: null,
            adresse: '',
            geprueft: null,
            hinweis: 'GitHub: ' + kurzZeile(fehler),
          };
        }
        sende(res, 200, { ...bild, ...zahlen });
      } catch (error) {
        sende(res, 500, { error: String((error && error.message) || error) });
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

  // Einstellungen, die nicht zum Workflow gehören, aber zum Board: der
  // Eigentümer neuer Repositories und wie das Mausrad schiebt. Sie stehen im
  // Board, damit sie einen Neustart überleben.
  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/einstellung',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        const name = String(koerper.name || '');
        const rohWert = String(koerper.wert == null ? '' : koerper.wert);

        // Der Eigentümer steht in `board.json` der Fassung 2. Er gilt für
        // jedes Board gleich; kein Board-Typ bringt einen eigenen Namen mit.
        if (name === 'eigentuemer') {
          if (!AKTIV || AKTIV.format !== 2) {
            sende(res, 409, {
              error: 'Der Eigentümer wird nur in einem Board der Fassung 2 gespeichert',
            });
            return;
          }
          if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }
          // Ohne Schreibrecht bleibt das Board im Lesemodus.
          if (!(await darfFuerBoard())) {
            sende(res, 403, { error: 'Nur lesen: für dieses Board fehlt das Schreibrecht.' });
            return;
          }
          const wert = rohWert.trim();
          if (wert && !EIGENTUEMER_MUSTER.test(wert)) {
            sende(res, 400, {
              error: 'Der Eigentümer ist ungültig: erlaubt sind GitHub-Logins und '
                + 'Organisationsnamen mit Buchstaben, Ziffern und Bindestrichen',
            });
            return;
          }
          // Erst prüfen, dann schreiben: eine unlesbare Datei bleibt liegen.
          try {
            liesBoardFassung2(REPO);
          } catch (fehler) {
            sende(res, 409, {
              error: 'Das Board lässt sich nicht lesen: '
                + String((fehler && fehler.message) || fehler),
            });
            return;
          }
          if (!git(['rev-parse', '--git-dir'], null, undefined, REPO).ok) {
            sende(res, 409, {
              error: 'Das Board-Repository ist keine Fassungsablage: ' + REPO,
            });
            return;
          }

          schreibeFassung2Einstellung('eigentuemer', wert);

          // Gefasst wird nur `board.json`; ein Push gehört zum Abgleich.
          const autor = autorFassung2();
          const nachricht = wert
            ? 'Eigentümer „' + wert + '“ gesetzt'
            : 'Eigentümer gelöscht';
          const lage = git(['status', '--porcelain', '--', 'board.json'],
            autor, undefined, REPO);
          if (!lage.ok) {
            throw fehlerMit('Das Board-Repository antwortet nicht: '
              + String(lage.fehler || '').trim(), 500);
          }
          if (lage.out.trim()) {
            const add = git(['add', '--', 'board.json'], autor, undefined, REPO);
            if (!add.ok) {
              throw fehlerMit('board.json ließ sich nicht vormerken: '
                + String(add.fehler || '').trim(), 500);
            }
            const commit = git(['commit', '-m', nachricht, '--', 'board.json'],
              autor, undefined, REPO);
            if (!commit.ok) {
              throw fehlerMit('board.json ließ sich nicht fassen: '
                + String(commit.fehler || '').trim(), 500);
            }
          }

          // Die Antwort ist das Board, wie es jetzt dasteht.
          sende(res, 200, await fassung2Antwort());
          return;
        }

        const wert = rohWert;
        if (name !== 'mausrad' || (wert !== 'seitwaerts' && wert !== 'auf-ab')) {
          sende(res, 400, { error: 'Unbekannte Einstellung' }); return;
        }
        const board = liesBoard();
        board.einstellungen = { ...(board.einstellungen || {}), [name]: wert };
        schreibeBoard(board);
        festhalten(wert === 'seitwaerts' ? 'Mausrad: seitwärts' : 'Mausrad: auf und ab', autorMensch());
        sende(res, 200, datenAntwort(mitAbleitung(board)));
      } catch (error) {
        sende(res, (error && error.status) || 400, {
          error: String((error && error.message) || error),
        });
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

  /**
   * Ein Vorhaben anlegen: `{ name, station }`. Nur Fassung 2; ohne Eigentümer
   * (Schritt 25) oder ohne Recht am Anlegen (Schritt 26) antwortet die Route
   * 403 mit Grund. Das Vorhaben hängt am ersten Workflow des Boards und steht
   * an der genannten Station. Gebaut wird lokal im Zwischenspeicher, geschickt
   * über denselben Anlegeweg wie eine Station, der Verweis landet in
   * `board.vorhaben`.
   */
  async function legeVorhabenAn(req, res, koerper) {
    try {
      const name = String(koerper.name == null ? '' : koerper.name).trim();
      if (!name) { sende(res, 400, { error: 'Name fehlt' }); return; }
      if (name.length > 120) {
        sende(res, 400, { error: 'Der Name ist zu lang: höchstens 120 Zeichen' });
        return;
      }
      const station = String(koerper.station == null ? '' : koerper.station).trim();
      if (!station) { sende(res, 400, { error: 'Station fehlt' }); return; }
      if (!REPO) { sende(res, 409, { error: 'Noch kein Board verbunden' }); return; }

      let board;
      try {
        board = liesBoardFassung2(REPO);
      } catch (fehler) {
        sende(res, 409, {
          error: 'Das Board ist nicht lesbar: ' + kurzZeile(fehler),
        });
        return;
      }

      // Der Eigentümer und das Recht: dieselbe Prüfung wie bei einer Station.
      const eigentuemer = await eigentuemerBild(board);
      if (!eigentuemer.eigentuemer) {
        sende(res, 403, {
          error: 'Ohne Eigentümer entsteht kein Vorhaben: es ist nicht bekannt, '
            + 'unter wem es liegen soll.',
          grund: 'Der Eigentümer des Boards ist leer.',
          hinweis: String(eigentuemer.eigentuemerHinweis || EIGENTUEMER_HINWEIS),
        });
        return;
      }
      const owner = eigentuemer.eigentuemer;
      if (!EIGENTUEMER_MUSTER.test(owner)) {
        sende(res, 400, { error: 'Der Eigentümer ist ungültig: ' + owner });
        return;
      }
      const anlegen = anlegenBild();
      if (anlegen.darf !== true) {
        sende(res, 403, {
          error: anlegen.grund || 'Neue Dinge brauchen eine Anmeldung.',
          ...(anlegen.hinweis ? { hinweis: anlegen.hinweis } : null),
        });
        return;
      }

      // Der erste Workflow des Boards, mit seiner festen Fassung.
      const workflow = (board.workflows || [])[0];
      if (!workflow || !String(workflow.repo || '').trim()
        || !String(workflow.fassung || '').trim()) {
        sende(res, 409, {
          error: 'Ein Vorhaben braucht den ersten Workflow des Boards mit seiner '
            + 'Fassung.',
        });
        return;
      }

      // Die Station ist eine Position im Workflow, nicht irgendein Name.
      const zusammengesetzt = komponiere({
        repo: REPO, person: PERSON_ID, home: HOME,
      });
      const position = (zusammengesetzt.workflow.positionen || [])
        .find((eintrag) => eintrag.id === station);
      if (!position) {
        sende(res, 400, {
          error: 'Diese Station steht nicht im Workflow: ' + station,
        });
        return;
      }
      // Der Name der Station, nicht ihre Kennung: er steht im README und in
      // der Beschreibung, mit der das Repository angelegt wird.
      const schritt = (zusammengesetzt.schritte || [])
        .find((eintrag) => eintrag.id === position.schritt);
      const stationName = (schritt && schritt.name) || position.name || station;

      const kurzName = slug(name);
      if (!kurzName) {
        sende(res, 400, {
          error: 'Der Name enthält keine Buchstaben oder Ziffern für die Repo-Kennung',
        });
        return;
      }
      const repo = 'vorhaben-' + kurzName;
      const pfad = cachePfad(HOME, owner, repo);
      if (!pfad) {
        sende(res, 500, { error: 'Ohne Zuhause gibt es keinen Zwischenspeicher' });
        return;
      }
      if (existsSync(pfad)) {
        sende(res, 409, { error: VORHABEN_BELEGT });
        return;
      }

      // Vor dem Anlegen fragt derselbe Weg wie bei einer Station.
      const weg = anlegewegFuer(board);
      let pruefung;
      try {
        pruefung = await weg.pruefen({ owner, repo, art: 'vorhaben' });
      } catch (fehler) {
        sende(res, anlegeStatus(fehler), { error: kurzZeile(fehler) });
        return;
      }
      if (!pruefung || pruefung.frei !== true) {
        sende(res, 409, { error: VORHABEN_BELEGT });
        return;
      }

      const login = String(liesLogin(HOME) || '').trim();
      const farbe = farbeDerHandelnden(board, login);
      const { vorhaben, readme, dateien } = vorhabenInhalt({
        slugName: kurzName,
        name,
        station,
        stationName,
        workflow,
        login,
        farbe,
      });
      const nachricht = 'Vorhaben „' + name + '“ angelegt';
      const autor = autorFassung2();
      let angelegtPfad;
      try {
        angelegtPfad = baueVorhaben({
          owner, repo, vorhaben, readme, nachricht, autor,
        });
      } catch (fehler) {
        sende(res, Number(fehler && fehler.status) || 500, {
          error: kurzZeile(fehler),
        });
        return;
      }

      // Danach der Weg: `selbst` legt das öffentliche Repository an und
      // schreibt die Dateien über die Inhalts-API; `attrappe` schickt nichts.
      try {
        await weg.anlegen({
          owner,
          repo,
          beschreibung: 'Vorhaben „' + name + '“ an der Station „'
            + stationName + '“',
          themen: [VORHABEN_THEMA],
          dateien,
          art: 'vorhaben',
        });
      } catch (fehler) {
        // Der halbe Weg bleibt nicht liegen: der lokale Ordner gehört zu
        // diesem Versuch. Ein Repository bei GitHub wird nicht angefasst.
        try { rmSync(angelegtPfad, { recursive: true, force: true }); } catch {
          /* Aufräumen ist nicht wichtiger als der Fehler. */
        }
        sende(res, anlegeStatus(fehler), { error: kurzZeile(fehler) });
        return;
      }

      // Der Verweis ins Board, nicht doppelt. Gefasst wird nur `board.json`;
      // ein Push gehört zum Abgleich.
      schreibeFassung2Vorhaben(owner + '/' + repo);
      const lage = git(['status', '--porcelain', '--', 'board.json'],
        autor, undefined, REPO);
      if (!lage.ok) {
        throw fehlerMit('Das Board-Repository antwortet nicht: '
          + String(lage.fehler || '').trim(), 500);
      }
      if (lage.out.trim()) {
        const add = git(['add', '--', 'board.json'], autor, undefined, REPO);
        if (!add.ok) {
          throw fehlerMit('board.json ließ sich nicht vormerken: '
            + String(add.fehler || '').trim(), 500);
        }
        const commit = git(['commit', '-m', nachricht, '--', 'board.json'],
          autor, undefined, REPO);
        if (!commit.ok) {
          throw fehlerMit('board.json ließ sich nicht fassen: '
            + String(commit.fehler || '').trim(), 500);
        }
      }

      // Das neue Bild in der Form von `/board/data`, dazu der neue Eintrag.
      const antwort = await fassung2Antwort();
      antwort.vorhaben = {
        owner, repo, id: kurzName, name, position: station,
      };
      sende(res, 200, antwort);
    } catch (error) {
      sende(res, (error && error.status) || 500, {
        error: String((error && error.message) || error),
      });
    }
  }

  ctx.effect(() => registriere({
    kind: 'exact',
    path: '/board/vorhaben',
    handler: async (req, res) => {
      if (req.method !== 'POST') { sende(res, 405, { error: 'Nur POST' }); return; }
      try {
        const koerper = await leseKoerper(req);
        // Fassung 2 legt ein eigenes Repository an; die alte Ablage bleibt
        // unverändert.
        if (AKTIV && AKTIV.format === 2) {
          await legeVorhabenAn(req, res, koerper);
          return;
        }
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

        // Fassung 2: Das Vorhaben liegt in seinem eigenen Repository. Geschrieben
        // und gefasst wird nur `vorhaben.json`; Station, Workflow und Board
        // bleiben unberührt. Geschickt wird beim Abgleich über /board/sync.
        if (AKTIV && AKTIV.format === 2) {
          // Ohne Schreibrecht bleibt das Board im Lesemodus: auch das
          // Verschieben eines Vorhabens schreibt in sein Repository.
          if (!(await darfFuerBoard())) {
            sende(res, 403, {
              error: 'Nur lesen: für dieses Board fehlt das Schreibrecht.',
            });
            return;
          }
          const board = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
          const liste = (board.workflow && board.workflow.positionen) || [];
          const vorgang = (board.vorgaenge || []).find((v) => v.id === id);
          if (!vorgang) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
          const ordner = ordnerFuerVorgang(vorgang);
          if (!ordner) { sende(res, 404, { error: 'Vorhaben nicht gefunden' }); return; }
          // Bevor geschrieben wird: Wer hier steht, muss die Station
          // verantworten — über die Eintragung, das Team oder als lokaler
          // Besitzer. Die Git-Rechteprüfung oben bleibt davor.
          if (!(await verantwortetVorhaben(vorgang, vorgang.position, ordner))) {
            sende(res, 403, { error: 'Nicht verantwortlich für diese Station' });
            return;
          }
          if (person && !(board.personen || []).some((p) => String(p.id) === person)) {
            sende(res, 400, { error: 'Diese Person gibt es nicht' }); return;
          }
          const zielIndex = liste.findIndex((p) => p.id === ziel);
          if (zielIndex < 0) {
            sende(res, 400, { error: 'Position gibt es nicht' }); return;
          }

          // Wie bei Fassung 1: die genannte Person, sonst der bisherige, wenn
          // an der Zielstation noch niemand steht.
          const bisher = verantwortlicheVon(vorgang);
          const verantwortliche = vorgang.verantwortliche
            && typeof vorgang.verantwortliche === 'object'
            && !Array.isArray(vorgang.verantwortliche)
            ? { ...vorgang.verantwortliche }
            : {};
          const eingetragen = verantwortliche[ziel];
          if (person) {
            verantwortliche[ziel] = [person];
          } else if (!Array.isArray(eingetragen) || !eingetragen.length) {
            if (bisher.length) verantwortliche[ziel] = bisher.slice();
          }

          schreibeVorhaben(ordner, { position: ziel, verantwortliche });

          const autor = autorFassung2();
          const nachricht = 'Vorhaben „' + vorgang.name + '“ '
            + (person ? 'weitergegeben' : 'verschoben');
          const lage = git(['status', '--porcelain', '--', 'vorhaben.json'],
            autor, undefined, ordner);
          if (!lage.ok) {
            throw fehlerMit('Das Vorhaben-Repository antwortet nicht: '
              + String(lage.fehler || '').trim(), 500);
          }
          if (lage.out.trim()) {
            const add = git(['add', '--', 'vorhaben.json'], autor, undefined, ordner);
            if (!add.ok) {
              throw fehlerMit('vorhaben.json ließ sich nicht vormerken: '
                + String(add.fehler || '').trim(), 500);
            }
            const commit = git(['commit', '-m', nachricht, '--', 'vorhaben.json'],
              autor, undefined, ordner);
            if (!commit.ok) {
              throw fehlerMit('vorhaben.json ließ sich nicht fassen: '
                + String(commit.fehler || '').trim(), 500);
            }
          }

          // Die Antwort ist das Board, wie es jetzt dasteht: die Seite setzt
          // die Karte damit an die neue Station.
          const nachher = komponiere({ repo: REPO, person: PERSON_ID, home: HOME });
          sende(res, 200, fassung2Bild(nachher, true));
          return;
        }

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
