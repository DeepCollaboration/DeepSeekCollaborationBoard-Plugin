/**
 * Prüfung Schritt 15 — Speichern auf einem überholten Stand schreibt nicht.
 *
 * Kopiert die Ablage und das Produkt nach /tmp. Die echte Ablage bekommt
 * keinen überholten Stand, keinen Beitrag und keine zweite Person; alles
 * spielt sich in der Kopie ab.
 *
 * Geprüft wird:
 *
 *   1. `/board/doc` liefert zu einer Datei ihre `basis` — den Commit, der sie
 *      zuletzt geändert hat. Ein Commit anderswo im Repository ändert sie
 *      nicht; eine noch nicht gefasste Datei trägt `null`;
 *   2. Speichern mit richtiger `basis` geht durch, die Datei ist geändert,
 *      es gibt eine neue Fassung, die neue `basis` ist eine andere;
 *   3. eine Änderung von außen (anderer Urheber, festgeschrieben) macht die
 *      alte `basis` überholt: Speichern antwortet 409 mit dem neuen Text und
 *      der neuen `basis`, die Datei bleibt byte-gleich, es entsteht keine
 *      Fassung;
 *   4. der alte Weg `/board/beitrag` ist entfernt: er antwortet 404, legt
 *      keinen `beitraege/`-Ordner an und lässt die Datei im Vorhaben stehen;
 *      der Beitrag geht als Pull Request über `/board/github/beitrag`;
 *   5. mit der neuen `basis` geht das Speichern durch; zwei Schreibvorgänge
 *      auf denselben Stand — der zweite mit der alten `basis` — antworten 409;
 *   6. eine vorhandene, gefasste Datei ohne `basis` wird nicht geschrieben:
 *      409 mit der aktuellen Basis und dem neuen Text; eine neue, noch nicht
 *      gefasste Datei darf ohne Basis angelegt werden;
 *   7. die Seite hält bei 409 den eigenen Text, nennt den neuen Stand und
 *      bietet ihn als Beitrag an;
 *   8. die echte Ablage bleibt ohne Prüfvorhaben, alten Beitrag und zweite
 *      Person.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt15-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const VORHABEN = {
  id: 'eigenes-15',
  name: 'Eigenes Vorhaben für den überholten Stand',
  position: 'umsetzung',
  verantwortliche: { umsetzung: ['p1'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

const ANFANG = [
  '# Notiz',
  '',
  'Der erste Stand.',
  '',
].join('\n');

const ZWEITER = [
  '# Notiz',
  '',
  'Der zweite Stand aus dem Editor.',
  '',
].join('\n');

const VON_AUSSEN = [
  '# Notiz',
  '',
  'Von außen geändert und festgeschrieben.',
  '',
].join('\n');

const EIGENER = [
  '# Notiz',
  '',
  'Mein eigener Text auf dem überholten Stand.',
  '',
].join('\n');

const DANACH = [
  '# Notiz',
  '',
  'Der eigene Text nach dem Beitrag.',
  '',
].join('\n');

const SCHREIBEN_A = '# A\n\nDer erste von zwei Schreibvorgängen.\n';
const SCHREIBEN_B = '# B\n\nDer zweite von zwei Schreibvorgängen.\n';
const OHNE_BASIS = '# Ohne Basis\n\nDieser Text darf nicht ankommen.\n';
const FRISCH_NEU = '# Frisch\n\nJetzt gefasst.\n';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function git(args) {
  const lauf = spawnSync('git', args, { encoding: 'utf8' });
  return {
    ok: lauf.status === 0,
    out: String(lauf.stdout || '').trim(),
    fehler: String(lauf.stderr || '').trim(),
  };
}

function gitCommit(nachricht, autor) {
  git(['-C', ablage, 'add', '-A']);
  const lauf = git([
    '-C', ablage,
    '-c', 'user.name=' + autor[0], '-c', 'user.email=' + autor[1],
    'commit', '-m', nachricht,
  ]);
  pruefe(lauf.ok, 'Die Fassung „' + nachricht + '“ wurde nicht angelegt: ' + lauf.fehler);
  return lauf;
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
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
  git(['-C', ablage, 'remote', 'remove', 'origin']);

  const echtKopfVorher = git(['-C', ABLAGE, 'rev-parse', 'HEAD']).out;
  const echtBaumVorher = baum(ABLAGE);
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-15')),
    'Das Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'beitraege', 'eigenes-15')),
    'Ein Prüfbeitrag liegt in der echten Ablage');

  // 2. Ein eigenes Vorhaben mit einer gefassten Datei — nur in der Kopie.
  const eigenOrdner = join(ablage, 'vorgaenge', 'eigenes-15');
  mkdirSync(eigenOrdner, { recursive: true });
  schreibeJson(join(eigenOrdner, 'vorhaben.json'), VORHABEN);
  const dateiPfad = join(eigenOrdner, 'notiz.md');
  writeFileSync(dateiPfad, ANFANG, 'utf8');
  gitCommit('Prüfung: Vorhaben in der Kopie', ['Thomas Heinrich', 'thomas.heinrich@board']);

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
    const r = gebaut.routen.get(String(pfad).split('?')[0]);
    if (!r) {
      res.status = 404;
      res.text = JSON.stringify({ error: 'Nicht gefunden' });
      return res;
    }
    await r.handler(anfrage(pfad, koerper), res);
    return res;
  }

  function doc(datei) {
    return alsJson(get('/board/doc?vorhaben=eigenes-15&datei='
      + encodeURIComponent(datei)), '/board/doc');
  }

  function basisVon(datei) {
    return git(['-C', ablage, 'log', '-1', '--format=%H', '--',
      'vorgaenge/eigenes-15/' + datei]).out;
  }

  // 3. Die Basis beim Öffnen ist die Fassung dieser Datei.
  const basis1 = basisVon('notiz.md');
  pruefe(/^[0-9a-f]{40}$/.test(basis1), 'Die Ausgangsdatei ist nicht gefasst');
  const doc1 = doc('notiz.md');
  pruefe(doc1.exists === true, '/board/doc findet notiz.md nicht');
  pruefe(doc1.text === ANFANG, '/board/doc liefert nicht den Ausgangstext');
  pruefe(doc1.basis === basis1,
    'Die Basis ist „' + doc1.basis + '“ statt „' + basis1 + '“');
  const fehlt = doc('gibt-es-nicht.md');
  pruefe(fehlt.exists === false && fehlt.basis === null,
    'Eine fehlende Datei trägt keine leere Basis: ' + JSON.stringify(fehlt));
  console.log('ok Basis beim Öffnen: ' + basis1.slice(0, 7)
    + ', fehlende Datei null');

  // 4. Ein Commit anderswo ändert die Basis dieser Datei nicht.
  writeFileSync(join(eigenOrdner, 'anderes.md'), '# Anderes\n\nNur daneben.\n', 'utf8');
  gitCommit('Prüfung: andere Datei geändert', ['Thomas Heinrich', 'thomas.heinrich@board']);
  const nachAnderem = doc('notiz.md');
  pruefe(nachAnderem.basis === basis1,
    'Ein Commit anderswo hat die Basis geändert: „' + nachAnderem.basis + '“');
  console.log('ok Basis bleibt: ein Commit an anderer Stelle ändert sie nicht');

  // 5. Mit richtiger Basis speichern: neue Fassung, neue Basis.
  const antwort1 = alsJson(await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: ZWEITER, basis: basis1,
  }), '/board/doc/schreiben');
  pruefe(antwort1.ok === true, 'Das Speichern mit richtiger Basis scheiterte');
  pruefe(typeof antwort1.basis === 'string' && /^[0-9a-f]{40}$/.test(antwort1.basis),
    'Die Antwort trägt keine neue Basis: ' + JSON.stringify(antwort1));
  pruefe(antwort1.basis !== basis1,
    'Die Basis blieb nach dem Speichern gleich: ' + basis1);
  pruefe(antwort1.fassung === antwort1.basis,
    'Fassung und Basis der Antwort sind nicht dieselbe');
  pruefe(readFileSync(dateiPfad, 'utf8') === ZWEITER,
    'Die Datei trägt nach dem Speichern nicht den neuen Text');
  const basis2 = antwort1.basis;
  pruefe(basisVon('notiz.md') === basis2,
    'Die neue Basis ist nicht die Fassung der Datei');
  pruefe(doc('notiz.md').basis === basis2,
    '/board/doc liefert nach dem Speichern die alte Basis');
  const kopf1 = git(['-C', ablage, 'log', '-1', '--format=%an%x1f%s']).out;
  pruefe(/^Thomas Heinrich\x1f/.test(kopf1) && /gespeichert/.test(kopf1),
    'Die Fassung des Speicherns heißt „' + kopf1 + '“');
  console.log('ok Speichern mit Basis: Datei geändert, neue Fassung '
    + basis2.slice(0, 7) + ', neue Basis verschieden');

  // 6. Die Datei von außen ändern und festschreiben — ein anderer Urheber.
  writeFileSync(dateiPfad, VON_AUSSEN, 'utf8');
  gitCommit('Von außen geändert', ['Zweite Person', 'zweite.person@board']);
  const basisExtern = basisVon('notiz.md');
  pruefe(basisExtern !== basis2, 'Die äußere Fassung ändert die Basis nicht');
  const docExtern = doc('notiz.md');
  pruefe(docExtern.text === VON_AUSSEN && docExtern.basis === basisExtern,
    '/board/doc zeigt den äußeren Stand nicht');
  const kopfVor409 = git(['-C', ablage, 'log', '-1', '--format=%H']).out;
  const bytesVor409 = readFileSync(dateiPfad);

  // 7. Mit der alten Basis speichern: 409, nichts geschrieben.
  const alt = await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: EIGENER, basis: basis2,
  });
  pruefe(alt.status === 409,
    'Das Speichern auf dem überholten Stand antwortet ' + alt.status
      + ' statt 409: ' + alt.text);
  const altWert = ausText(alt, '409');
  pruefe(altWert.ok === false, 'Die 409-Antwort ist nicht als Fehler markiert');
  pruefe(altWert.neu && altWert.neu.text === VON_AUSSEN,
    'Die 409-Antwort trägt nicht den neuen Text: '
      + JSON.stringify((altWert.neu || {}).text));
  pruefe(altWert.neu && altWert.neu.basis === basisExtern,
    'Die 409-Antwort trägt nicht die neue Basis');
  pruefe(Buffer.compare(bytesVor409, readFileSync(dateiPfad)) === 0,
    'Das Speichern auf dem überholten Stand hat die Datei geändert');
  pruefe(git(['-C', ablage, 'log', '-1', '--format=%H']).out === kopfVor409,
    'Das Speichern auf dem überholten Stand hat eine Fassung angelegt');
  console.log('ok 409: neuer Text „' + altWert.neu.text.split('\n')[2]
    + '“, neue Basis ' + basisExtern.slice(0, 7) + ', Datei byte-gleich');

  // 8. Der alte Weg zum Beitrag ist entfernt: er antwortet 404 und schreibt
  //    nichts. Der eigene Text geht als Pull Request; die Datei im Vorhaben
  //    bleibt unverändert.
  const kopfVorAlt = git(['-C', ablage, 'log', '-1', '--format=%H']).out;
  const resAlt = await posting('/board/beitrag', {
    vorhaben: 'eigenes-15',
    schritt: 'umsetzung',
    notiz: 'Mein Text zum überholten Stand.',
    dateien: [{ name: 'notiz.md', text: EIGENER }],
    basis: basisExtern,
  });
  pruefe(resAlt.status === 404,
    'Der alte Beitragsweg antwortet ' + resAlt.status + ' statt 404: ' + resAlt.text);
  pruefe(!existsSync(join(ablage, 'beitraege')),
    'Der alte Beitragsweg hat einen beitraege/-Ordner angelegt');
  pruefe(Buffer.compare(bytesVor409, readFileSync(dateiPfad)) === 0,
    'Der alte Beitragsweg hat die Datei im Vorhaben geändert');
  pruefe(git(['-C', ablage, 'log', '-1', '--format=%H']).out === kopfVorAlt,
    'Der alte Beitragsweg hat eine Fassung angelegt');
  console.log('ok alter Beitragsweg: 404, kein beitraege/-Ordner, '
    + 'Datei unverändert');

  // 9. Mit der neuen Basis geht das Speichern durch — obwohl inzwischen der
  //    Beitrag als Fassung dazukam; die Datei selbst hat sich nicht geändert.
  const antwort2 = alsJson(await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: DANACH, basis: basisExtern,
  }), '/board/doc/schreiben');
  pruefe(antwort2.ok === true && antwort2.basis !== basisExtern,
    'Das Speichern mit der neuen Basis scheiterte: ' + JSON.stringify(antwort2));
  pruefe(readFileSync(dateiPfad, 'utf8') === DANACH,
    'Die Datei trägt nach dem zweiten Speichern nicht den neuen Text');
  const basis3 = antwort2.basis;
  console.log('ok neue Basis: Speichern geht durch, neue Basis '
    + basis3.slice(0, 7));

  // 10. Zwei Schreibvorgänge auf denselben Stand: der zweite mit der alten
  //     Basis antwortet 409 und schreibt nicht.
  const a = alsJson(await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: SCHREIBEN_A, basis: basis3,
  }), '/board/doc/schreiben');
  const basis4 = a.basis;
  const b = await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: SCHREIBEN_B, basis: basis3,
  });
  pruefe(b.status === 409,
    'Der zweite Schreibvorgang auf denselben Stand antwortet ' + b.status
      + ' statt 409: ' + b.text);
  const bWert = ausText(b, '409');
  pruefe(bWert.neu && bWert.neu.text === SCHREIBEN_A,
    'Der 409 trägt nicht den ersten Schreibvorgang');
  pruefe(bWert.neu && bWert.neu.basis === basis4,
    'Der 409 trägt nicht die Basis des ersten Schreibvorgangs');
  pruefe(readFileSync(dateiPfad, 'utf8') === SCHREIBEN_A,
    'Der zweite Schreibvorgang hat die Datei überschrieben');
  console.log('ok zwei Schreibvorgänge: der zweite mit alter Basis bekommt 409; '
    + 'die Datei bleibt beim ersten');

  // 11. Eine vorhandene, gefasste Datei verlangt die Basis. Fehlt sie, wird
  //     nicht geschrieben: 409 mit dem neuen Text und der aktuellen Basis.
  const kopfVorOhne = git(['-C', ablage, 'log', '-1', '--format=%H']).out;
  const bytesVorOhne = readFileSync(dateiPfad);
  const ohne = await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'notiz.md', text: OHNE_BASIS,
  });
  pruefe(ohne.status === 409,
    'Das Speichern ohne Basis antwortet ' + ohne.status + ' statt 409: ' + ohne.text);
  const ohneWert = ausText(ohne, '409');
  pruefe(ohneWert.ok === false, 'Die 409-Antwort ist nicht als Fehler markiert');
  pruefe(ohneWert.neu && ohneWert.neu.text === SCHREIBEN_A,
    'Der 409 ohne Basis trägt nicht den neuen Text: '
      + JSON.stringify((ohneWert.neu || {}).text));
  pruefe(ohneWert.neu && ohneWert.neu.basis === basis4,
    'Der 409 ohne Basis trägt nicht die aktuelle Basis');
  pruefe(Buffer.compare(bytesVorOhne, readFileSync(dateiPfad)) === 0,
    'Das Speichern ohne Basis hat die Datei geändert');
  pruefe(git(['-C', ablage, 'log', '-1', '--format=%H']).out === kopfVorOhne,
    'Das Speichern ohne Basis hat eine Fassung angelegt');
  console.log('ok ohne Basis: 409 mit dem neuen Text und der Basis '
    + basis4.slice(0, 7) + ', Datei byte-gleich');

  // 12. Eine neue, noch nicht gefasste Datei darf ohne Basis angelegt werden;
  //     danach trägt sie eine Basis.
  const frischAntwort = alsJson(await posting('/board/doc/schreiben', {
    vorhaben: 'eigenes-15', datei: 'frisch.md', text: FRISCH_NEU,
  }), '/board/doc/schreiben');
  pruefe(frischAntwort.ok === true && typeof frischAntwort.basis === 'string',
    'Das Speichern einer neuen Datei ohne Basis scheiterte');
  pruefe(readFileSync(join(eigenOrdner, 'frisch.md'), 'utf8') === FRISCH_NEU,
    'Die neue Datei trägt nicht den geschriebenen Text');
  const frischDoc = doc('frisch.md');
  pruefe(frischDoc.exists === true && frischDoc.basis === frischAntwort.basis,
    'Die neue Datei ist nicht gefasst: ' + JSON.stringify(frischDoc));
  console.log('ok neue Datei: ohne Basis angelegt, danach gefasst');

  // 13. Die Seite: eigener Text bleibt, neuer Stand wird genannt, eigener Text
  //     lässt sich als Beitrag mit der neuen Basis anlegen.
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  pruefe(client.includes('basis: d.basis'),
    'Die Seite nimmt die Basis beim Öffnen nicht mit');
  pruefe(client.includes('basis: leser.basis'),
    'Die Seite schickt die Basis beim Speichern nicht mit');
  pruefe(client.includes('e.status === 409') && client.includes('e.wert.neu'),
    'Die Seite erkennt den 409 und den neuen Stand nicht');
  pruefe(client.includes('eigener: text'),
    'Die Seite behält den eigenen Text bei 409 nicht');
  pruefe(client.includes('Der Stand ist neuer'),
    'Die Seite sagt bei 409 nicht, dass der Stand neuer ist');
  pruefe(client.includes('Eigenen Text als Beitrag anlegen'),
    'Die Seite bietet den eigenen Text nicht als Beitrag an');
  pruefe(client.includes('basis: konflikt.basis'),
    'Der Beitrag aus dem 409 bekommt die neue Basis nicht');
  console.log('ok Seite: eigener Text bleibt, neuer Stand, Weg als Beitrag');

  // 14. Die echte Ablage bleibt ohne Prüfvorhaben, Beitrag und zweite Person.
  pruefe(!existsSync(join(ABLAGE, 'vorgaenge', 'eigenes-15')),
    'Das Prüfvorhaben liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'beitraege', 'eigenes-15')),
    'Ein Prüfbeitrag liegt in der echten Ablage');
  pruefe(git(['-C', ABLAGE, 'rev-parse', 'HEAD']).out === echtKopfVorher,
    'Die echte Ablage hat eine Fassung bekommen');
  gleicherBaum(echtBaumVorher, baum(ABLAGE), 'Die echte Ablage');
  console.log('ok echte Ablage unberührt: kein Prüfvorhaben, kein Beitrag, '
    + 'keine Fassung');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
