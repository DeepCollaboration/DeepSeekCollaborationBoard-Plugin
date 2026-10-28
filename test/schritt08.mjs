/**
 * Prüfung Schritt 08 — der Skill eines Schritts liegt in der Ablage.
 *
 * Kopiert die Ablage und das Produkt nach /tmp und legt ein eigenes
 * `$DSH_HOME` an. Der Harness-Skillordner wird dorthin *kopiert*: die Prüfung
 * arbeitet nie mit `/dsh-home/skills`, und `grillme-vision/SKILL.md` muss in
 * der Kopie unverändert bleiben.
 *
 * Geprüft wird:
 *
 *   1. `skills/p1/` trägt fünf Anweisungen mit Frontmatter `name`,
 *      `description`, `whenToUse`; der Name ist `<host>-<schritt>`;
 *   2. `GET /board/skills` listet die fünf Schritte aus der Ablage (nicht die
 *      installierten Skills) und `GET /board/skill/dateien` liest die
 *      Anweisung von dort;
 *   3. `GET /board/data` zeigt an den Schritten `wie.wert: <host>-<schritt>`
 *      und `skill: skills/<host>/<schritt>.md`;
 *   4. ein Lauf an `idee-vision` (der Sitzungsdienst ist ersetzt) legt vor dem
 *      Start `$DSH_HOME/skills/p1-idee-vision/SKILL.md` an — der Ersatz liest
 *      die Datei und notiert ihren Namen —; der Einsatz bleibt nach dem Start
 *      liegen und wird erst mit `/board/gespraech/stopp` weggenommen; der
 *      Einsatz ist am Gespräch in `$DSH_HOME/board/gespraeche.json` gemerkt;
 *   5. das Transkript entsteht wie bisher unter `transkripte/` und erscheint
 *      am Schritt;
 *   6. ein gescheiterter Start hinterlässt keinen Ordner; Verwerfen nimmt den
 *      Einsatz samt Gespräch weg;
 *   7. die Werkstatt schreibt ihre Änderung nach `skills/p1/<schritt>.md`, und
 *      der Host hält sie als Fassung mit Urheber fest;
 *   8. die Kopie von `grillme-vision/SKILL.md` bleibt byte-gleich, und in der
 *      echten Ablage liegen fünf Anweisungen, aber kein `p1-*` im echten
 *      Harness-Skillordner.
 */
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { zstdCompressSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const ABLAGE = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const ECHTE_SKILLS = process.env.BOARD_SKILLS || '/dsh-home/skills';
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt08-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

// Die fünf Schritte in der Reihenfolge ihres Workflows.
const SCHRITTE = [
  { id: 'idee-vision', position: 'vision', titel: 'Idee → Vision' },
  { id: 'vision-fachkonzept', position: 'fachkonzept', titel: 'Vision → Fachkonzept' },
  { id: 'fachkonzept-architektur', position: 'architektur', titel: 'Fachkonzept → Architektur' },
  { id: 'architektur-umsetzung', position: 'umsetzung', titel: 'Architektur zu Bauplan' },
  { id: 'umsetzen', position: 'umsetzen', titel: 'Umsetzen' },
];

// Was die Werkstatt schreibt: dieselbe Datei, neuer Inhalt.
const NEUE_ANWEISUNG = [
  '---',
  'name: p1-idee-vision',
  'description: Fragt die Vision in einem Zug ab und schreibt vision.md.',
  'whenToUse: Wenn ein Vorhaben an der Position „Idee → Vision" steht.',
  '---',
  '',
  '# Idee → Vision',
  '',
  'Eine geänderte Anweisung aus der Werkstatt.',
  '',
].join('\n');

// Die Sitzung, aus der das Transkript entsteht. Der Skill-Aufruf trägt den
// Laufnamen — nur so findet /board/skill/lauf das Gespräch wieder.
const SITZUNG = 'session-p1-1';
const EREIGNISSE = [
  {
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Führe den Skill „p1-idee-vision“ aus.' }],
    },
  },
  {
    type: 'tool/call',
    data: { name: 'skill', arguments: JSON.stringify({ name: 'p1-idee-vision' }) },
  },
  {
    type: 'assistant/message',
    data: {
      message: {
        content: [{ type: 'text', text: 'Erzähl mir von deiner Idee.' }],
      },
    },
  },
];

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

/**
 * Der Sitzungsdienst, ersetzt. `create` liest während des Starts die
 * eingesetzte Anweisung und notiert ihren Namen; auf Wunsch scheitert der
 * Start. `prompt` schreibt — wie das Modell in der Werkstatt — die geänderte
 * Anweisung in die Ablage.
 */
function sitzungsdienst() {
  const dienst = {
    gesehen: [],
    texte: [],
    fehler: null,
    werkstattSchreiben: false,
    zaehler: 0,
    async create() {
      dienst.zaehler += 1;
      const ordner = join(home, 'skills');
      for (const name of existsSync(ordner) ? readdirSync(ordner) : []) {
        if (!name.startsWith('p1-')) continue;
        const datei = join(ordner, name, 'SKILL.md');
        if (!existsSync(datei)) continue;
        const text = readFileSync(datei, 'utf8');
        const kopf = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
        const nameFeld = (kopf.match(/^name:\s*(.+)$/m) || [])[1];
        dienst.gesehen.push({ ordner: name, name: String(nameFeld || '').trim(), text });
      }
      if (dienst.fehler) {
        const nachricht = dienst.fehler;
        dienst.fehler = null;
        throw new Error(nachricht);
      }
      return { sessionId: 'session-p1-' + dienst.zaehler };
    },
    async prompt(req) {
      dienst.texte.push((req.content || []).map((teil) => String(teil.text || '')).join('\n'));
      if (!dienst.werkstattSchreiben) return { accepted: true };
      dienst.werkstattSchreiben = false;
      writeFileSync(join(ablage, 'skills', 'p1', 'idee-vision.md'), NEUE_ANWEISUNG, 'utf8');
      return { accepted: true };
    },
    cancel() { return { accepted: true }; },
  };
  return dienst;
}

/** Ein minimaler ctx: Handler sammeln, Effekte ausführen, Dienste ersetzen. */
function ctxBauen(dienst) {
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
      get(name) {
        return name === 'sessionController' ? dienst : undefined;
      },
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

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function kopfVon(text) {
  const kopf = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
  return {
    name: (kopf.match(/^name:\s*(.+)$/m) || [])[1] || '',
    description: (kopf.match(/^description:\s*(.+)$/m) || [])[1] || '',
    whenToUse: (kopf.match(/^whenToUse:\s*(.+)$/m) || [])[1] || '',
  };
}

let gebaut = null;

try {
  // 1. Ablage, Produkt und der Harness-Skillordner als Kopien. Die echte
  //    Installation bleibt unberührt.
  cpSync(ABLAGE, ablage, { recursive: true });
  // Die Kopie trägt den echten Remote mit. Sie darf nie dorthin schreiben.
  spawnSync('git', ['-C', ablage, 'remote', 'remove', 'origin']);
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  // Das Vorhaben „test“ ist beim Aufräumen aus der echten Ablage
  // verschwunden; die Prüfung legt sich ihres selbst an.
  const testPfadVorab = join(ablage, 'vorgaenge', 'test', 'vorhaben.json');
  if (!existsSync(testPfadVorab)) {
    mkdirSync(dirname(testPfadVorab), { recursive: true });
    schreibeJson(testPfadVorab, {
      id: 'test', name: 'Test', position: 'idee',
      verantwortliche: { idee: ['p1'] }, regel: 'einer', rueckkehr: [], laeufe: [],
    });
  }

  cpSync(ECHTE_SKILLS, join(home, 'skills'), { recursive: true });
  const grillmeVorher = readFileSync(join(home, 'skills', 'grillme-vision', 'SKILL.md'));

  // Die fünf Anweisungen liegen in der Ablage, jede mit Name, Beschreibung
  // und whenToUse. Der Name ist der Laufname aus Host und Schritt.
  const ordnerSkills = join(ablage, 'skills', 'p1');
  const dateien = readdirSync(ordnerSkills).filter((n) => n.endsWith('.md')).sort();
  pruefe(dateien.join(',') === SCHRITTE.map((s) => s.id + '.md').sort().join(','),
    'skills/p1 trägt „' + dateien.join(', ') + '“ statt der fünf Anweisungen');
  for (const schritt of SCHRITTE) {
    const text = readFileSync(join(ordnerSkills, schritt.id + '.md'), 'utf8');
    const kopf = kopfVon(text);
    pruefe(kopf.name === 'p1-' + schritt.id,
      'Die Anweisung „' + schritt.id + '“ nennt sich „' + kopf.name
        + '“ statt „p1-' + schritt.id + '“');
    pruefe(kopf.description.length > 10 && kopf.whenToUse.length > 10,
      'Der Anweisung „' + schritt.id + '“ fehlt description oder whenToUse');
  }
  pruefe(readFileSync(join(ordnerSkills, 'idee-vision.md'), 'utf8').includes('# Grillme Vision'),
    'Die Anweisung „idee-vision“ ist nicht die übernommene Grillme-Vision');
  console.log('ok skills/p1: ' + dateien.length + ' Anweisungen, je Name, description, whenToUse');

  process.env.DSH_HOME = home;
  const dienst = sitzungsdienst();
  gebaut = ctxBauen(dienst);
  const modul = await import(pathToFileURL(join(kopie, 'index.js')).href);
  pruefe(typeof modul.apply === 'function', 'Das Modul exportiert apply nicht');
  modul.apply(gebaut.ctx);

  function route(pfad) {
    const r = gebaut.routen.get(pfad);
    pruefe(r && typeof r.handler === 'function', 'Die Route ' + pfad + ' fehlt');
    return r;
  }

  function get(pfad) {
    const res = antwort();
    route(pfad.split('?')[0]).handler(anfrage(pfad), res);
    return res;
  }

  async function posting(pfad, koerper) {
    const res = antwort();
    await route(pfad).handler(anfrage(pfad, koerper), res);
    return res;
  }

  // 2. /board/skills listet die Schritte aus der Ablage.
  const liste = alsJson(get('/board/skills'), '/board/skills');
  const eintraege = liste.skills || [];
  pruefe(eintraege.length === 5,
    '/board/skills liefert ' + eintraege.length + ' Einträge statt 5');
  for (const schritt of SCHRITTE) {
    const eintrag = eintraege.find((s) => s.name === 'p1-' + schritt.id);
    pruefe(!!eintrag, '/board/skills nennt „p1-' + schritt.id + '“ nicht');
    pruefe(eintrag.schritt === schritt.id,
      'Eintrag „' + eintrag.name + '“ nennt den Schritt „' + eintrag.schritt + '“');
    pruefe(eintrag.datei === 'skills/p1/' + schritt.id + '.md',
      'Eintrag „' + eintrag.name + '“ zeigt auf „' + eintrag.datei + '“');
    pruefe(existsSync(join(ablage, eintrag.datei)),
      'Die Anweisung „' + eintrag.datei + '“ liegt nicht in der Ablage');
    pruefe(eintrag.beschreibung.length > 10,
      'Eintrag „' + eintrag.name + '“ hat keine Beschreibung');
  }
  const fremde = eintraege.filter((s) => !s.name.startsWith('p1-'));
  pruefe(fremde.length === 0,
    '/board/skills nennt installierte Fremdskills: ' + fremde.map((s) => s.name).join(', '));
  console.log('ok /board/skills: ' + eintraege.map((s) => s.schritt).join(', '));

  // Die Anweisung wird als Datei gelesen, nicht aus dem Harness.
  const dateienAntwort = alsJson(get('/board/skill/dateien?name=p1-idee-vision'),
    '/board/skill/dateien');
  pruefe((dateienAntwort.dateien || []).includes('vision.md'),
    '/board/skill/dateien findet „vision.md“ nicht in der Ablage: '
      + JSON.stringify(dateienAntwort.dateien));
  console.log('ok /board/skill/dateien liest die Anweisung aus der Ablage');

  // /board/data zeigt Laufname und Ablagepfad am Schritt.
  const daten = alsJson(get('/board/data'), '/board/data');
  const eigene = daten.workflows.find((p) => p.ich);
  pruefe(!!eigene && eigene.workflows && eigene.workflows[0],
    'Die eigene Fläche fehlt in /board/data');
  const schritteFlaeche = eigene.workflows[0].schritte || [];
  for (const schritt of SCHRITTE) {
    const s = schritteFlaeche.find((x) => x.id === schritt.id);
    pruefe(!!s, 'Der Schritt „' + schritt.id + '“ fehlt in /board/data');
    pruefe(s.wie && s.wie.art === 'skill' && s.wie.wert === 'p1-' + schritt.id,
      'Der Schritt „' + schritt.id + '“ trägt den Laufnamen '
        + JSON.stringify(s.wie && s.wie.wert));
    pruefe(s.skill === 'skills/p1/' + schritt.id + '.md',
      'Der Schritt „' + schritt.id + '“ zeigt auf „' + s.skill + '“');
  }
  console.log('ok /board/data: fünf Schritte mit Laufname und Ablagepfad');

  // 3. Zwei Vorhaben an die Schritte stellen, an denen die Läufe beginnen.
  const testPfad = join(ablage, 'vorgaenge', 'test', 'vorhaben.json');
  const testVorhaben = JSON.parse(readFileSync(testPfad, 'utf8'));
  testVorhaben.position = 'vision';
  testVorhaben.verantwortliche = { vision: ['p1'] };
  schreibeJson(testPfad, testVorhaben);

  const zweitPfad = join(ablage, 'vorgaenge', 'second-brain-gesamtkonzept', 'vorhaben.json');
  const zweitVorhaben = JSON.parse(readFileSync(zweitPfad, 'utf8'));
  zweitVorhaben.position = 'fachkonzept';
  zweitVorhaben.verantwortliche = { fachkonzept: ['p1'] };
  schreibeJson(zweitPfad, zweitVorhaben);

  // Die verschobenen Vorhaben als eigene Fassung, damit die späteren
  // Werkstatt-Fassungen allein ihre Änderung tragen.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m', 'Prüfung: Vorhaben verschoben']);
  pruefe(probeFassung.ok, 'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);

  // 4. Ein Lauf an idee-vision: die Anweisung wird vor dem Start eingesetzt und
  //    bleibt für die Dauer der Sitzung liegen. Ein Rest am selben Schritt wird
  //    ersetzt. Erst /board/gespraech/stopp nimmt sie wieder weg.
  const alterEinsatz = join(home, 'skills', 'p1-idee-vision');
  mkdirSync(alterEinsatz, { recursive: true });
  writeFileSync(join(alterEinsatz, 'SKILL.md'), 'alter Rest\n', 'utf8');
  const start = await posting('/board/gespraech/senden', {
    vorhaben: 'test',
    position: 'vision',
    skill: 'p1-idee-vision',
    text: 'Bitte beginne.',
  });
  pruefe(start.status === 200, '/board/gespraech/senden antwortet '
    + start.status + ': ' + start.text);
  const startWert = JSON.parse(start.text);
  pruefe(startWert.session === SITZUNG,
    'Der Start meldet die Sitzung „' + startWert.session + '“');
  pruefe(dienst.texte.length === 1 && dienst.texte[0].includes('p1-idee-vision'),
    'Der Startauftrag nennt den Laufnamen nicht: ' + JSON.stringify(dienst.texte[0]));
  pruefe(dienst.gesehen.length === 1,
    'Der Sitzungsdienst sah ' + dienst.gesehen.length + ' eingesetzte Anweisungen statt 1');
  pruefe(dienst.gesehen[0].name === 'p1-idee-vision',
    'Die eingesetzte Anweisung nennt sich „' + dienst.gesehen[0].name + '“');
  pruefe(dienst.gesehen[0].ordner === 'p1-idee-vision',
    'Der Einsatz liegt im Ordner „' + dienst.gesehen[0].ordner + '“');
  pruefe(dienst.gesehen[0].text.includes('# Grillme Vision'),
    'Die eingesetzte Anweisung ist nicht der Text aus der Ablage');
  const eingesetzt = join(home, 'skills', 'p1-idee-vision', 'SKILL.md');
  pruefe(existsSync(eingesetzt),
    'Nach dem Start fehlt $DSH_HOME/skills/p1-idee-vision/SKILL.md');
  pruefe(readFileSync(eingesetzt, 'utf8').includes('# Grillme Vision')
    && !readFileSync(eingesetzt, 'utf8').includes('alter Rest'),
  'Der alte Einsatz am selben Schritt wurde nicht ersetzt');
  const gespraecheDatei = join(home, 'board', 'gespraeche.json');
  const gespraeche = JSON.parse(readFileSync(gespraecheDatei, 'utf8'));
  const gemerkt = (gespraeche.test || []).find((g) => g.session === SITZUNG);
  pruefe(gemerkt && gemerkt.einsatz === 'p1-idee-vision',
    'Der Einsatz ist nicht am Gespräch gemerkt: ' + JSON.stringify(gemerkt));
  console.log('ok Lauf: p1-idee-vision/SKILL.md liegt nach dem Start, Einsatz am Gespräch gemerkt');

  const stopp = await posting('/board/gespraech/stopp', {
    vorhaben: 'test', position: 'vision',
  });
  pruefe(stopp.status === 200, '/board/gespraech/stopp antwortet '
    + stopp.status + ': ' + stopp.text);
  pruefe(!existsSync(join(home, 'skills', 'p1-idee-vision')),
    'Nach /board/gespraech/stopp liegt $DSH_HOME/skills/p1-idee-vision noch da');
  const nachStopp = JSON.parse(readFileSync(gespraecheDatei, 'utf8'));
  const gemerktNach = (nachStopp.test || []).find((g) => g.session === SITZUNG);
  pruefe(gemerktNach && !('einsatz' in gemerktNach),
    'Nach dem Stopp steht der Einsatz noch am Gespräch: ' + JSON.stringify(gemerktNach));
  console.log('ok Stopp: p1-idee-vision/SKILL.md weg, Einsatz am Gespräch gelöscht');

  const stand = alsJson(get('/board/gespraech/stand?vorhaben=test&position=vision'),
    '/board/gespraech/stand');
  pruefe(stand.skill === 'p1-idee-vision',
    'Das Gespräch nennt den Skill „' + stand.skill + '“');

  // 5. Das Transkript: die Sitzung liegt im Harness, /board/skill/lauf macht
  //    daraus eine Datei im Vorhaben; sie erscheint am Schritt.
  const sitzungsOrdner = join(home, 'sessions', 'pruefung', SITZUNG);
  mkdirSync(sitzungsOrdner, { recursive: true });
  writeFileSync(join(sitzungsOrdner, 'session.v1.jsonl.zstd'),
    zstdCompressSync(Buffer.from(EREIGNISSE.map((e) => JSON.stringify(e)).join('\n') + '\n')));
  const lauf = await posting('/board/skill/lauf', {
    vorhaben: 'test',
    position: 'vision',
    session: SITZUNG,
  });
  pruefe(lauf.status === 200, '/board/skill/lauf antwortet ' + lauf.status + ': ' + lauf.text);
  const laufWert = JSON.parse(lauf.text);
  const transkriptPfad = join(ablage, 'vorgaenge', 'test', laufWert.datei);
  pruefe(existsSync(transkriptPfad), 'Das Transkript „' + laufWert.datei + '“ fehlt');
  const transkript = readFileSync(transkriptPfad, 'utf8');
  pruefe(transkript.includes('skill: p1-idee-vision'),
    'Das Transkript nennt den Skill nicht');
  pruefe(transkript.includes('Erzähl mir von deiner Idee.'),
    'Das Transkript enthält die Antwort nicht');
  const verlauf = alsJson(get('/board/verlauf?vorhaben=test'), '/board/verlauf');
  const schrittVerlauf = (verlauf.schritte || []).find((s) => s.positionId === 'vision');
  pruefe(!!schrittVerlauf && (schrittVerlauf.transkripte || [])
    .some((t) => t.datei === laufWert.datei),
  'Das Transkript erscheint nicht am Schritt „vision“');
  console.log('ok Transkript: ' + laufWert.datei + ' unter transkripte/, am Schritt sichtbar');

  // 6. Ein gescheiterter Start hinterlässt keinen Ordner. Der Ersatz sieht die
  //    Anweisung noch, dann scheitert er.
  dienst.fehler = 'Sitzung nicht möglich';
  const gescheitert = await posting('/board/gespraech/senden', {
    vorhaben: 'second-brain-gesamtkonzept',
    position: 'fachkonzept',
    skill: 'p1-vision-fachkonzept',
    text: 'Führe den Skill „p1-vision-fachkonzept“ aus.',
  });
  pruefe(gescheitert.status === 400,
    'Der gescheiterte Start antwortet ' + gescheitert.status + ' statt 400');
  const zweiterEinsatz = dienst.gesehen[1];
  pruefe(!!zweiterEinsatz && zweiterEinsatz.name === 'p1-vision-fachkonzept',
    'Der Ersatz sah die Anweisung vor dem Scheitern nicht');
  pruefe(!existsSync(join(home, 'skills', 'p1-vision-fachkonzept')),
    'Der gescheiterte Start hinterlässt $DSH_HOME/skills/p1-vision-fachkonzept');
  pruefe(!alsJson(get('/board/gespraech/stand?vorhaben=second-brain-gesamtkonzept'
    + '&position=fachkonzept'), '/board/gespraech/stand').session,
  'Trotz gescheitertem Start steht ein Gespräch im Vorhaben');
  console.log('ok gescheiterter Start: Ordner wieder weg, kein Gespräch eingetragen');

  // 6b. Auch das Verwerfen beendet die Sitzung: die Anweisung verschwindet mit
  //     ihr, und der Vermerk am Vorhaben geht weg.
  const zweiterStart = await posting('/board/gespraech/senden', {
    vorhaben: 'second-brain-gesamtkonzept',
    position: 'fachkonzept',
    skill: 'p1-vision-fachkonzept',
    text: 'Bitte beginne.',
  });
  pruefe(zweiterStart.status === 200, '/board/gespraech/senden (zweite Sitzung) antwortet '
    + zweiterStart.status + ': ' + zweiterStart.text);
  pruefe(existsSync(join(home, 'skills', 'p1-vision-fachkonzept', 'SKILL.md')),
    'Der zweite Start hat die Anweisung nicht eingesetzt');
  const verworfen = await posting('/board/gespraech/verwerfen', {
    vorhaben: 'second-brain-gesamtkonzept', position: 'fachkonzept',
  });
  pruefe(verworfen.status === 200, '/board/gespraech/verwerfen antwortet '
    + verworfen.status + ': ' + verworfen.text);
  pruefe(!existsSync(join(home, 'skills', 'p1-vision-fachkonzept')),
    'Nach /board/gespraech/verwerfen liegt p1-vision-fachkonzept noch da');
  pruefe(!alsJson(get('/board/gespraech/stand?vorhaben=second-brain-gesamtkonzept'
    + '&position=fachkonzept'), '/board/gespraech/stand').session,
  'Nach dem Verwerfen steht noch ein Gespräch im Vorhaben');
  console.log('ok Verwerfen: p1-vision-fachkonzept/SKILL.md weg, Gespräch entfernt');

  // 7. Die Werkstatt schreibt ihre Änderung in die Ablage; der Host hält sie
  //    als Fassung mit Urheber fest.
  dienst.werkstattSchreiben = true;
  const werkstatt = await posting('/board/werkstatt/senden', {
    schritt: 'idee-vision',
    text: 'Wir sind einig — schreib die Anweisung.',
  });
  pruefe(werkstatt.status === 200, '/board/werkstatt/senden antwortet '
    + werkstatt.status + ': ' + werkstatt.text);
  const geaendert = readFileSync(join(ablage, 'skills', 'p1', 'idee-vision.md'), 'utf8');
  pruefe(geaendert === NEUE_ANWEISUNG,
    'Die Werkstatt hat skills/p1/idee-vision.md nicht geschrieben');
  const autor = git(['-C', ablage, 'log', '-1', '--format=%an']).out;
  const nachricht = git(['-C', ablage, 'log', '-1', '--format=%s']).out;
  pruefe(autor === 'Modell (Thomas Heinrich)',
    'Die Fassung nennt „' + autor + '“ statt „Modell (Thomas Heinrich)“');
  pruefe(/Anweisung an Station/.test(nachricht),
    'Die Fassung heißt „' + nachricht + '“');
  pruefe(git(['-C', ablage, 'status', '--porcelain']).out === '',
    'Nach der Werkstatt-Fassung ist der Arbeitsbaum nicht ruhig: '
      + git(['-C', ablage, 'status', '--porcelain']).out);
  const nachherSkills = alsJson(get('/board/skills'), '/board/skills').skills || [];
  const geaenderterEintrag = nachherSkills.find((s) => s.schritt === 'idee-vision');
  pruefe(!!geaenderterEintrag
    && geaenderterEintrag.beschreibung === 'Fragt die Vision in einem Zug ab und schreibt vision.md.',
  'Die Anzeige folgt der geänderten Anweisung nicht: '
    + JSON.stringify(geaenderterEintrag && geaenderterEintrag.beschreibung));
  console.log('ok Werkstatt: skills/p1/idee-vision.md geändert, Fassung „'
    + autor + '“');

  // 8. Die Kopie des Harness-Skillordners bleibt unverändert; die echte
  //    Ablage trägt die fünf Anweisungen, der echte Harness kein `p1-*`.
  pruefe(Buffer.compare(grillmeVorher,
    readFileSync(join(home, 'skills', 'grillme-vision', 'SKILL.md'))) === 0,
  'grillme-vision/SKILL.md hat sich in der Kopie geändert');
  pruefe(!existsSync(join(home, 'skills', 'p1-idee-vision')), 'Ein Einsatz blieb liegen');
  for (const schritt of SCHRITTE) {
    pruefe(existsSync(join(ABLAGE, 'skills', 'p1', schritt.id + '.md')),
      'In der echten Ablage fehlt skills/p1/' + schritt.id + '.md');
  }
  const echte = readdirSync(ECHTE_SKILLS);
  pruefe(!echte.some((n) => n.startsWith('p1-')),
    'Der echte Harness-Skillordner trägt einen Einsatz: '
      + echte.filter((n) => n.startsWith('p1-')).join(', '));
  console.log('ok Harness-Skills: Kopie unverändert, echter Ordner ohne p1-*');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
