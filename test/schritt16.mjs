/**
 * Prüfung Schritt 16 — zwei Programmfassungen schreiben nicht gegeneinander.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bleibt auf
 * Format 1; jede höhere oder niedrigere Zahl lebt nur in der Kopie.
 *
 * Geprüft wird:
 *
 *   1. `/board/data` liefert beide Fassungen: `format` (dieses Programm) und
 *      `formatAblage` (die Ablage);
 *   2. steht die Ablage auf 2, antwortet `/board/data` weiter mit `format: 1`
 *      und `formatAblage: 2`; ein Speichern und ein Verschieben antworten 409,
 *      nennen die 2, lassen Datei und Vorhaben byte-gleich und legen keine
 *      Fassung an; `git status` bleibt ruhig;
 *   3. mit `format` zurück auf 1 gehen dieselben Schreibvorgänge durch;
 *   4. steht die Ablage auf 0 (älter), wird das Schreiben abgewiesen und nennt
 *      den Umzug;
 *   5. die Seite zeigt bei ungleichen Fassungen einen Hinweis mit beiden Zahlen
 *      und dem Satz, dass dieses Board nicht schreibt, bis es aktualisiert ist.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt16-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');
const AUTOR = ['Thomas Heinrich', 'thomas.heinrich@board'];

const VORHABEN = {
  id: 'eigenes-16',
  name: 'Eigenes Vorhaben für zwei Fassungen',
  position: 'umsetzung',
  verantwortliche: { umsetzung: ['p1'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const ANFANG = '# Notiz\n\nDer Stand vor dem Formatwechsel.\n';
const NUMMER_2 = '# Notiz\n\nDieser Text darf bei Format 2 nicht ankommen.\n';
const NACH_1 = '# Notiz\n\nMit Format 1 geht derselbe Schreibvorgang durch.\n';
const NUMMER_0 = '# Notiz\n\nDieser Text darf bei Format 0 nicht ankommen.\n';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function git(args, inAblage) {
  const lauf = spawnSync('git', ['-C', inAblage || ablage, ...args], { encoding: 'utf8' });
  return {
    ok: lauf.status === 0,
    out: String(lauf.stdout || '').trim(),
    fehler: String(lauf.stderr || '').trim(),
  };
}

function gitCommit(nachricht, autor) {
  const wer = autor || AUTOR;
  git(['add', '-A']);
  const lauf = git([
    '-c', 'user.name=' + wer[0], '-c', 'user.email=' + wer[1],
    'commit', '-m', nachricht,
  ]);
  pruefe(lauf.ok, 'Die Fassung „' + nachricht + '“ wurde nicht angelegt: ' + lauf.fehler);
  return lauf;
}

function kopf() {
  return git(['rev-parse', 'HEAD']).out;
}

function statusSauber(was) {
  const stand = git(['status', '--porcelain']).out;
  pruefe(stand === '', was + ': git status ist nicht ruhig — ' + stand);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

function formatSetzen(zahl, was) {
  writeFileSync(join(ablage, 'format'), zahl + '\n', 'utf8');
  gitCommit('Prüfung: ' + was);
}

/** Alle Dateien eines Ordners als Pfad → Inhalt, `.git` ausgenommen. */
function baum(pfad) {
  const karte = new Map();
  const lauf = (ordner) => {
    let eintraege;
    try {
      eintraege = readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (e.name === '.git') continue;
      const ziel = join(ordner, e.name);
      if (e.isDirectory()) { lauf(ziel); continue; }
      karte.set(relative(pfad, ziel), readFileSync(ziel));
    }
  };
  lauf(pfad);
  return karte;
}

function gleicherBaum(a, b, was) {
  const namenA = [...a.keys()].sort();
  const namenB = [...b.keys()].sort();
  pruefe(JSON.stringify(namenA) === JSON.stringify(namenB),
    was + ': andere Dateien — ' + JSON.stringify(namenA) + ' statt '
      + JSON.stringify(namenB));
  for (const name of namenA) {
    pruefe(Buffer.compare(a.get(name), b.get(name)) === 0,
      was + ': ' + name + ' ist nicht byte-gleich');
  }
}

/** Ein minimaler ctx: Handler sammeln, Effekte ausführen, Dienste ersetzen. */
function ctxBauen() {
  const routen = new Map();
  const aufraeumen = [];
  return {
    routen,
    aufraeumen,
    ctx: {
      webServer: {
        register(route) {
          routen.set(route.path, route);
          return () => routen.delete(route.path);
        },
      },
      effect(fn) {
        const ende = fn();
        if (typeof ende === 'function') aufraeumen.push(ende);
      },
      get() { return undefined; },
    },
  };
}

function anfrage(pfad, koerper) {
  return {
    method: koerper ? 'POST' : 'GET',
    url: pfad,
    async *[Symbol.asyncIterator]() {
      if (koerper) yield Buffer.from(JSON.stringify(koerper), 'utf8');
    },
  };
}

function antwort() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status; },
    end(text) { this.text = String(text == null ? '' : text); },
  };
}

function alsJson(res, was) {
  pruefe(res.status === 200, was + ' antwortet ' + res.status + ': ' + res.text);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(was + ' liefert kein JSON: ' + res.text.slice(0, 200));
  }
}

function ausText(res, was) {
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(was + ' liefert kein JSON: ' + res.text.slice(0, 200));
  }
}

let gebaut = null;

try {
  // 1. Nur Kopien: Ablage, Produkt und ein eigenes DSH_HOME.
  cpSync(ABLAGE, ablage, { recursive: true });
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  process.env.DSH_HOME = home;
  // Kein Remote: die Fassungen nach den Handlungen sollen nicht ins Netz.
  git(['remote', 'remove', 'origin']);

  const echtKopfVorher = git(['rev-parse', 'HEAD'], ABLAGE).out;
  const echtBaumVorher = baum(ABLAGE);
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-16')),
    'Das Prüfvorhaben liegt in der echten Ablage');

  // 2. Ein eigenes Vorhaben mit einer gefassten Datei — nur in der Kopie.
  const eigenOrdner = join(ablage, 'vorgaenge', 'eigenes-16');
  mkdirSync(eigenOrdner, { recursive: true });
  schreibeJson(join(eigenOrdner, 'vorhaben.json'), VORHABEN);
  const dateiPfad = join(eigenOrdner, 'notiz.md');
  const vorhabenPfad = join(eigenOrdner, 'vorhaben.json');
  writeFileSync(dateiPfad, ANFANG, 'utf8');
  // Die Ablage der echten Seite trägt beim Kopieren den Arbeitsstand; damit
  // `git status` nach den Formatwechseln ruhig ist, wird er einmal gefasst.
  gitCommit('Prüfung: Vorhaben und Arbeitsstand in der Kopie');

  gebaut = ctxBauen();
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  function route(pfad) {
    const rein = String(pfad).split('?')[0];
    const r = gebaut.routen.get(rein);
    pruefe(r && typeof r.handler === 'function', 'Die Route ' + rein + ' fehlt');
    return r;
  }

  function get(pfad) {
    const res = antwort();
    route(pfad).handler(anfrage(pfad), res);
    return res;
  }

  async function posting(pfad, koerper) {
    const res = antwort();
    await route(pfad).handler(anfrage(pfad, koerper), res);
    return res;
  }

  function daten() {
    return alsJson(get('/board/data'), '/board/data');
  }

  // 3. Der Ausgangsstand: beide Fassungen sind 1.
  const start = daten();
  pruefe(start.format === 1,
    '/board/data nennt als eigene Fassung nicht 1: ' + JSON.stringify(start.format));
  pruefe(start.formatAblage === 1,
    '/board/data nennt als Fassung der Ablage nicht 1: '
      + JSON.stringify(start.formatAblage));
  console.log('ok Ausgang: /board/data nennt format 1 und formatAblage 1');

  // 4. Die Ablage auf 2: Lesen geht weiter, Schreiben nicht.
  formatSetzen(2, 'Ablage auf Format 2');
  const kopf2 = kopf();
  const dateiVor2 = readFileSync(dateiPfad);
  const vorhabenVor2 = readFileSync(vorhabenPfad);
  const daten2 = daten();
  pruefe(daten2.format === 1,
    'Bei Ablage 2 nennt /board/data nicht weiter format 1: '
      + JSON.stringify(daten2.format));
  pruefe(daten2.formatAblage === 2,
    'Bei Ablage 2 nennt /board/data nicht formatAblage 2: '
      + JSON.stringify(daten2.formatAblage));
  pruefe(daten2.vorgaenge.some((v) => v.id === 'eigenes-16'),
    'Bei Ablage 2 fehlt das Vorhaben in /board/data');
  console.log('ok Ablage 2: /board/data antwortet weiter, format 1, formatAblage 2');

  const schreiben2 = await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-16', datei: 'notiz.md', text: NUMMER_2,
  });
  pruefe(schreiben2.status === 409,
    'Das Speichern bei Ablage 2 antwortet ' + schreiben2.status + ' statt 409: '
      + schreiben2.text);
  const schreiben2Wert = ausText(schreiben2, '409 bei Ablage 2');
  const schreiben2Text = String(schreiben2Wert.error || '');
  pruefe(schreiben2Text.includes('Format 2'),
    'Der 409 nennt die Fassung 2 der Ablage nicht: ' + schreiben2Text);
  pruefe(schreiben2Text.includes('Format 1'),
    'Der 409 nennt die eigene Fassung 1 nicht: ' + schreiben2Text);
  pruefe(/schreibt nicht, bis es aktualisiert ist/.test(schreiben2Text),
    'Der 409 sagt nicht, dass das Board nicht schreibt: ' + schreiben2Text);
  pruefe(Buffer.compare(dateiVor2, readFileSync(dateiPfad)) === 0,
    'Das Speichern bei Ablage 2 hat die Datei geändert');
  console.log('ok Ablage 2, Speichern: 409 nennt Format 2 und Format 1, Datei byte-gleich');

  const verschieben2 = await posting('/board/vorhaben/verschieben', {
    id: 'eigenes-16', position: 'vision',
  });
  pruefe(verschieben2.status === 409,
    'Das Verschieben bei Ablage 2 antwortet ' + verschieben2.status + ' statt 409: '
      + verschieben2.text);
  const verschieben2Wert = ausText(verschieben2, '409 beim Verschieben');
  pruefe(String(verschieben2Wert.error || '').includes('Format 2'),
    'Der 409 des Verschiebens nennt die Fassung 2 nicht: '
      + String(verschieben2Wert.error || ''));
  pruefe(Buffer.compare(vorhabenVor2, readFileSync(vorhabenPfad)) === 0,
    'Das Verschieben bei Ablage 2 hat das Vorhaben geändert');
  console.log('ok Ablage 2, Verschieben: 409 nennt Format 2, vorhaben.json byte-gleich');

  pruefe(kopf() === kopf2,
    'Bei Ablage 2 ist eine Fassung entstanden: ' + kopf());
  statusSauber('Nach den abgewiesenen Schreibvorgängen bei Ablage 2');
  console.log('ok Ablage 2: keine neue Fassung, git status ruhig');

  // 5. Zurück auf 1: dieselben Schreibvorgänge gehen durch.
  formatSetzen(1, 'Ablage zurück auf Format 1');
  const kopf1 = kopf();
  const daten1 = daten();
  pruefe(daten1.formatAblage === 1,
    'Nach dem Zurückstellen nennt /board/data nicht formatAblage 1: '
      + JSON.stringify(daten1.formatAblage));
  // Die Datei ist gefasst; gespeichert wird auf ihrer Basis.
  const basisNotiz = git(['log', '-1', '--format=%H', '--',
    'vorgaenge/eigenes-16/notiz.md']).out;
  pruefe(/^[0-9a-f]{40}$/.test(basisNotiz),
    'Die Prüfdatei hat keine Basis: ' + JSON.stringify(basisNotiz));
  const schreiben1 = alsJson(await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-16', datei: 'notiz.md', text: NACH_1, basis: basisNotiz,
  }), 'Speichern bei Ablage 1');
  pruefe(schreiben1.ok === true, 'Das Speichern bei Ablage 1 scheiterte');
  pruefe(readFileSync(dateiPfad, 'utf8') === NACH_1,
    'Das Speichern bei Ablage 1 hat nicht geschrieben');
  pruefe(kopf() !== kopf1, 'Das Speichern bei Ablage 1 hat keine Fassung angelegt');
  const kopfNachSpeichern = kopf();
  const verschieben1 = alsJson(await posting('/board/vorhaben/verschieben', {
    id: 'eigenes-16', position: 'vision',
  }), 'Verschieben bei Ablage 1');
  pruefe(Array.isArray(verschieben1.vorgaenge)
    && verschieben1.vorgaenge.some((v) => v.id === 'eigenes-16' && v.position === 'vision'),
  'Das Verschieben bei Ablage 1 hat das Vorhaben nicht bewegt');
  pruefe(liesJson(vorhabenPfad).position === 'vision',
    'vorhaben.json steht nach dem Verschieben nicht auf vision');
  pruefe(kopf() !== kopfNachSpeichern,
    'Das Verschieben bei Ablage 1 hat keine Fassung angelegt');
  console.log('ok Ablage 1: Speichern und Verschieben gehen durch, je eine Fassung');

  // 6. Die Ablage auf 0 (älter): Schreiben wird abgewiesen, der Umzug genannt.
  formatSetzen(0, 'Ablage auf Format 0');
  const kopf0 = kopf();
  const dateiVor0 = readFileSync(dateiPfad);
  const vorhabenVor0 = readFileSync(vorhabenPfad);
  const schreiben0 = await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-16', datei: 'notiz.md', text: NUMMER_0,
  });
  pruefe(schreiben0.status === 409,
    'Das Speichern bei Ablage 0 antwortet ' + schreiben0.status + ' statt 409: '
      + schreiben0.text);
  const schreiben0Text = String(ausText(schreiben0, '409 bei Ablage 0').error || '');
  pruefe(schreiben0Text.includes('Format 0'),
    'Der 409 nennt die Fassung 0 der Ablage nicht: ' + schreiben0Text);
  pruefe(/Umzug/.test(schreiben0Text),
    'Der 409 sagt nicht, dass die Ablage den Umzug braucht: ' + schreiben0Text);
  pruefe(Buffer.compare(dateiVor0, readFileSync(dateiPfad)) === 0,
    'Das Speichern bei Ablage 0 hat die Datei geändert');

  const verschieben0 = await posting('/board/vorhaben/verschieben', {
    id: 'eigenes-16', position: 'idee',
  });
  pruefe(verschieben0.status === 409,
    'Das Verschieben bei Ablage 0 antwortet ' + verschieben0.status + ' statt 409: '
      + verschieben0.text);
  pruefe(/Umzug/.test(String(ausText(verschieben0, '409 bei Ablage 0').error || '')),
    'Der 409 des Verschiebens nennt den Umzug nicht');
  pruefe(Buffer.compare(vorhabenVor0, readFileSync(vorhabenPfad)) === 0,
    'Das Verschieben bei Ablage 0 hat das Vorhaben geändert');
  pruefe(kopf() === kopf0, 'Bei Ablage 0 ist eine Fassung entstanden');
  statusSauber('Nach den abgewiesenen Schreibvorgängen bei Ablage 0');
  console.log('ok Ablage 0: Schreiben abgewiesen, Umzug genannt, nichts geschrieben');

  // 7. Die Seite: Hinweis mit beiden Zahlen und dem Satz zum Nichtschreiben.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes('formatAblage'),
    'Die Seite liest die Fassung der Ablage nicht');
  pruefe(client.includes('Dieses Board schreibt nicht, bis es aktualisiert ist.'),
    'Die Seite sagt bei einer neueren Ablage nicht, dass sie nicht schreibt');
  pruefe(client.includes('Die Ablage braucht den Umzug.'),
    'Die Seite sagt bei einer älteren Ablage nicht, dass sie den Umzug braucht');
  console.log('ok Seite: Hinweis mit beiden Zahlen, Nichtschreiben, Umzug');

  // 8. Die echte Ablage bleibt auf Format 1 und ohne Prüfvorhaben.
  pruefe(readFileSync(join(ABLAGE, 'format'), 'utf8').trim() === '1',
    'Die echte Ablage steht nicht mehr auf Format 1');
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-16')),
    'Das Prüfvorhaben liegt in der echten Ablage');
  pruefe(git(['rev-parse', 'HEAD'], ABLAGE).out === echtKopfVorher,
    'Die echte Ablage hat eine Fassung bekommen');
  gleicherBaum(echtBaumVorher, baum(ABLAGE), 'Die echte Ablage');
  console.log('ok echte Ablage unberührt: format 1, kein Prüfvorhaben, keine Fassung');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
