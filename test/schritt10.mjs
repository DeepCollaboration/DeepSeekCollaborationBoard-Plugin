/**
 * Prüfung Schritt 10 — der Skill eines fremden Schritts läuft im eigenen Harness.
 *
 * Kopiert die Ablage und das Produkt nach /tmp, legt ein eigenes `$DSH_HOME` an
 * und schreibt `p2`, ihren Workflow und `skills/p2/pruefen.md` erst in die
 * Kopie. Der Sitzungsdienst ist ersetzt: `create` liest während des Starts die
 * eingesetzte Anweisung, notiert ihren Namen und den Arbeitsort; `prompt`
 * notiert den Startauftrag. Eine echte Sitzung und eine Modellanfrage gibt es
 * nicht.
 *
 * Geprüft wird:
 *
 *   1. ein eigenes Vorhaben steht auf der Verweis-Position zu `p2/standard/pruefen`;
 *      die Seite bietet dort den Start an (Quelltext, kein Browserbild);
 *   2. der Start setzt vor `create` `$DSH_HOME/skills/p2-pruefen/SKILL.md` ein —
 *      der Ersatz liest den Text (gleich der Anweisung aus der Ablage) —,
 *      nennt den Namen im Startauftrag und startet im eigenen Arbeitsbereich;
 *      der Einsatz bleibt nach dem Start liegen und wird erst mit
 *      `/board/gespraech/stopp` weggenommen;
 *   3. der Transkript-Aufruf legt die Datei unter `vorgaenge/<eigenes>/transkripte/`
 *      an; sie erscheint in `laeufe` und am Schritt, und die Fassung nennt
 *      „Thomas Heinrich“;
 *   4. `workflows/p2.json` und `skills/p2/pruefen.md` sind danach byte-gleich,
 *      ein fremdes Vorhaben gibt es nicht;
 *   5. ein Start an einem fremden Schritt auf einem fremden Vorhaben antwortet
 *      403 und legt keine Sitzung an;
 *   6. `/dsh-home/skills` der echten Installation bleibt unverändert und trägt
 *      kein `p2-*`; die echte Ablage bekommt keine zweite Person.
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
const stamm = mkdtempSync(join(tmpdir(), 'board-schritt10-'));
const ablage = join(stamm, 'ablage');
const kopie = join(stamm, 'produkt');
const home = join(stamm, 'home');

const P2_PERSON = {
  id: 'p2',
  name: 'Zweite Person',
  farbe: '#8b5cf6',
};

// Der fremde Schritt trägt seine Anweisung in der Ablage. Sein Host ist p2;
// `wie.wert` ist der Name, unter dem die Anweisung im Harness laufen soll.
const P2_WORKFLOW = {
  person: 'p2',
  workflows: [{
    id: 'standard',
    titel: 'Workflow der zweiten Person',
    schritte: [
      {
        id: 'pruefen',
        name: 'Prüfen',
        host: 'p2',
        eingang: ['idee.md'],
        ausgabe: ['pruefung.md'],
        wie: { art: 'skill', wert: 'p2-pruefen' },
        skill: 'skills/p2/pruefen.md',
      },
      {
        id: 'freigeben',
        name: 'Freigeben',
        host: 'p2',
        eingang: ['pruefung.md'],
        ausgabe: ['freigabe.md'],
        wie: { art: 'textfeld', wert: '' },
        skill: null,
      },
    ],
    positionen: [
      { id: 'pruefen', schritt: 'pruefen', x: 60, y: 80 },
      { id: 'freigeben', schritt: 'freigeben', x: 360, y: 80 },
    ],
    kanten: [{ von: 'pruefen', nach: 'freigeben' }],
    layout: 'auto',
  }],
};

// Die Anweisung, die p2 in der Ablage ablegt. Der Name ist schon der Laufname;
// so ist die eingesetzte Datei byte-gleich dieser Anweisung.
const P2_SKILL = [
  '---',
  'name: p2-pruefen',
  'description: Prüft ein Vorhaben anhand seiner Idee.',
  'whenToUse: Wenn ein Vorhaben an der Station „Prüfen“ steht.',
  '---',
  '',
  '# Prüfen',
  '',
  'Diese Anweisung kommt von p2 und liegt in der Ablage.',
  '',
  'Lies die Idee und schreibe die Prüfung.',
  '',
].join('\n');

const SITZUNG = 'session-p1-10';

// Die Sitzung, aus der das Transkript entsteht. Der Skill-Aufruf trägt den
// Laufnamen — nur so findet /board/skill/lauf das Gespräch wieder.
const EREIGNISSE = [
  {
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Führe den Skill „p2-pruefen“ aus.' }],
    },
  },
  {
    type: 'tool/call',
    data: { name: 'skill', arguments: JSON.stringify({ name: 'p2-pruefen' }) },
  },
  {
    type: 'assistant/message',
    data: {
      message: {
        content: [{ type: 'text', text: 'Die Idee ist geprüft.' }],
      },
    },
  },
];

const FREMDES = {
  id: 'von-p2',
  name: 'Von der zweiten Person',
  position: 'pruefen',
  verantwortliche: { pruefen: ['p2'] },
  regel: 'einer',
  rueckkehr: [],
  laeufe: [],
  fork_von: null,
  zweig_von: null,
};

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

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

/**
 * Der Sitzungsdienst, ersetzt. `create` liest während des Starts die
 * eingesetzten Anweisungen (`p2-*`) und notiert Namen, Text und Arbeitsort.
 * `prompt` notiert den Auftrag, mit dem die Sitzung beginnt.
 */
function sitzungsdienst() {
  const dienst = {
    gesehen: [],
    texte: [],
    orte: [],
    zaehler: 0,
    async create(ort) {
      dienst.zaehler += 1;
      dienst.orte.push(ort || {});
      const ordner = join(home, 'skills');
      for (const name of existsSync(ordner) ? readdirSync(ordner) : []) {
        if (!name.startsWith('p2-')) continue;
        const datei = join(ordner, name, 'SKILL.md');
        if (!existsSync(datei)) continue;
        const text = readFileSync(datei, 'utf8');
        const kopf = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
        const nameFeld = (kopf.match(/^name:\s*(.+)$/m) || [])[1];
        dienst.gesehen.push({ ordner: name, name: String(nameFeld || '').trim(), text });
      }
      return { sessionId: SITZUNG };
    },
    async prompt(req) {
      dienst.texte.push((req.content || []).map((teil) => String(teil.text || '')).join('\n'));
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
        if (name === 'sessionController') return dienst;
        if (name === 'workingDirectory') return { defaultDirectory: ablage };
        return undefined;
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

let gebaut = null;

try {
  // 1. Ablage, Produkt und Harness-Skills nur als Kopien. Die echte
  //    Installation und die echte Ablage bleiben unberührt.
  cpSync(ABLAGE, ablage, { recursive: true });
  // Die Kopie trägt den echten Remote mit. Sie darf nie dorthin schreiben.
  spawnSync('git', ['-C', ablage, 'remote', 'remove', 'origin']);
  cpSync(PRODUKT, kopie, { recursive: true });
  writeFileSync(join(kopie, 'board.config.json'), JSON.stringify({
    person: 'p1',
    repo: ablage,
  }, null, 2) + '\n', 'utf8');
  mkdirSync(home, { recursive: true });
  cpSync(ECHTE_SKILLS, join(home, 'skills'), { recursive: true });
  const grillmeVorher = readFileSync(join(home, 'skills', 'grillme-vision', 'SKILL.md'));
  const echteSkillsVorher = readdirSync(ECHTE_SKILLS).sort();

  // Die echte Ablage bekommt weder eine zweite Person noch einen fremden
  // Schritt; die zweite Person lebt nur in dieser Kopie.
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json')),
    'p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'workflows', 'p2.json')),
    'Der Workflow von p2 liegt in der echten Ablage');
  pruefe(!existsSync(join(ABLAGE, 'skills', 'p2')),
    'Die Anweisungen von p2 liegen in der echten Ablage');
  const echteSchritte = JSON.parse(
    readFileSync(join(ABLAGE, 'workflows', 'p1.json'), 'utf8')).workflows[0].schritte;
  pruefe(!echteSchritte.some((s) => s && s.ref),
    'Die echte Ablage trägt schon einen Verweis');
  pruefe(!echteSkillsVorher.some((n) => n.startsWith('p1-') || n.startsWith('p2-')),
    'Der echte Harness-Skillordner trägt schon einen Einsatz: '
      + echteSkillsVorher.filter((n) => n.startsWith('p1-') || n.startsWith('p2-')).join(', '));

  schreibeJson(join(ablage, 'personen', 'p2.json'), P2_PERSON);
  const p2Pfad = join(ablage, 'workflows', 'p2.json');
  schreibeJson(p2Pfad, P2_WORKFLOW);
  mkdirSync(join(ablage, 'skills', 'p2'), { recursive: true });
  const p2SkillPfad = join(ablage, 'skills', 'p2', 'pruefen.md');
  writeFileSync(p2SkillPfad, P2_SKILL, 'utf8');
  const p2Vorher = readFileSync(p2Pfad);
  const p2SkillVorher = readFileSync(p2SkillPfad);
  // Die p2-Dateien als eigene Fassung, damit die späteren Fassungen allein die
  // Änderung dieses Schritts tragen.
  git(['-C', ablage, 'add', '-A']);
  const probeFassung = git(['-C', ablage, '-c', 'user.name=Thomas Heinrich',
    '-c', 'user.email=thomas.heinrich@board', 'commit', '-m', 'Prüfung: p2 in der Kopie']);
  pruefe(probeFassung.ok, 'Die Prüf-Fassung wurde nicht angelegt: ' + probeFassung.fehler);
  console.log('ok p2 lebt nur in der Kopie: Person, Workflow und skills/p2/pruefen.md');

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

  // 2. Den fremden Schritt als Verweis in den eigenen Workflow stellen und ein
  //    eigenes Vorhaben auf die Verweis-Position setzen.
  const p1Pfad = join(ablage, 'workflows', 'p1.json');
  const resAnstellen = await posting('/board/fremd/anstellen', {
    ref: 'p2/standard/pruefen',
  });
  alsJson(resAnstellen, '/board/fremd/anstellen');
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Anstellen geändert');

  const daten = alsJson(get('/board/data'), '/board/data');
  const eigene = daten.workflows.find((p) => p.ich);
  pruefe(!!eigene && eigene.workflows && eigene.workflows[0],
    'Die eigene Fläche fehlt in /board/data');
  const verweis = (eigene.workflows[0].schritte || []).find((s) => s.ref);
  pruefe(!!verweis, 'Der Verweis fehlt in der eigenen Fläche');
  pruefe(verweis.ref === 'p2/standard/pruefen',
    'Der Verweis lautet „' + verweis.ref + '“');
  pruefe(verweis.name === 'Prüfen' && verweis.host === 'p2' && verweis.fremd === true,
    'Der Verweis ist nicht als „Prüfen“ von p2 aufgelöst: '
      + JSON.stringify({ name: verweis.name, host: verweis.host, fremd: verweis.fremd }));
  pruefe(verweis.wie && verweis.wie.art === 'skill' && verweis.wie.wert === 'p2-pruefen',
    'Der Verweis trägt nicht den Laufnamen p2-pruefen: '
      + JSON.stringify(verweis.wie));
  pruefe(verweis.skill === 'skills/p2/pruefen.md',
    'Der Verweis zeigt nicht auf skills/p2/pruefen.md, sondern auf '
      + JSON.stringify(verweis.skill));
  const verweisPosition = (eigene.workflows[0].positionen || [])
    .find((p) => p.schritt === verweis.id);
  pruefe(!!verweisPosition, 'Die Position des Verweises fehlt');

  const resNeu = await posting('/board/vorhaben', { name: 'Fremder Skill-Lauf Probe' });
  const nachNeu = alsJson(resNeu, '/board/vorhaben');
  const eigenes = (nachNeu.vorgaenge || []).find((v) => v.name === 'Fremder Skill-Lauf Probe');
  pruefe(!!eigenes, 'Das eigene Vorhaben fehlt');

  const resWeg = await posting('/board/vorhaben/verschieben', {
    id: eigenes.id,
    position: verweisPosition.id,
  });
  const nachWeg = alsJson(resWeg, '/board/vorhaben/verschieben');
  const dort = (nachWeg.vorgaenge || []).find((v) => v.id === eigenes.id);
  pruefe(!!dort && dort.position === verweisPosition.id,
    'Das Vorhaben steht nicht auf der Verweis-Position');
  pruefe(dort.verantwortet === 'Thomas Heinrich',
    'Das Vorhaben verantwortet „' + dort.verantwortet + '“');
  pruefe(dort.darf && dort.darf.aendern === true,
    'Die eigene Person darf an der Verweis-Position nicht schreiben');
  console.log('ok eigenes Vorhaben auf der Verweis-Position zu p2/standard/pruefen');

  // 3. Die Seite bietet den Start am Verweis-Schritt an: nur wenn das Vorhaben
  //    dort steht und die eigene Person es verantwortet — `fremd` schließt ihn
  //    nicht aus (Quelltext, kein Browserbild).
  const client = readFileSync(join(kopie, 'client.js'), 'utf8');
  const startStelle = client.indexOf('function startFuer(p)');
  pruefe(startStelle >= 0, 'Die Seite hat keinen Start am Schritt (startFuer fehlt)');
  const startEnde = client.indexOf('\n      function ', startStelle + 10);
  const startQuelle = client.slice(startStelle,
    startEnde > startStelle ? startEnde : startStelle + 1600);
  pruefe(startQuelle.includes('p.id !== gewaehltesVorhaben.position'),
    'Der Start hängt nicht an der Stelle des Vorhabens');
  pruefe(startQuelle.includes('darf && gewaehltesVorhaben.darf.aendern'),
    'Der Start hängt nicht an der Verantwortung');
  pruefe(startQuelle.includes("wie.art !== 'skill'"),
    'Der Start hängt nicht an einer Skill-Anweisung');
  pruefe(!/p\.fremd/.test(startQuelle),
    'Die Seite schließt den Verweis-Schritt vom Start aus');
  pruefe(startQuelle.includes('gespraechBeginnen(wie.wert, p.id)'),
    'Der Startknopf beginnt kein Gespräch');
  console.log('ok Seite: Start am Verweis-Schritt, wenn das eigene Vorhaben dort steht');

  // 4. Der Start an der Verweis-Position: die Anweisung kommt aus der Ablage
  //    des Hosts, wird vor dem Start eingesetzt und bleibt für die Dauer der
  //    Sitzung liegen. Erst der Stopp nimmt sie weg.
  const start = await posting('/board/gespraech/senden', {
    vorhaben: eigenes.id,
    position: verweisPosition.id,
    text: 'Bitte beginne.',
  });
  pruefe(start.status === 200, '/board/gespraech/senden antwortet '
    + start.status + ': ' + start.text);
  const startWert = JSON.parse(start.text);
  pruefe(startWert.session === SITZUNG,
    'Der Start meldet die Sitzung „' + startWert.session + '“');
  pruefe(dienst.gesehen.length === 1,
    'Der Sitzungsdienst sah ' + dienst.gesehen.length + ' eingesetzte Anweisungen statt 1');
  pruefe(dienst.gesehen[0].ordner === 'p2-pruefen',
    'Der Einsatz liegt im Ordner „' + dienst.gesehen[0].ordner + '“');
  pruefe(dienst.gesehen[0].name === 'p2-pruefen',
    'Die eingesetzte Anweisung nennt sich „' + dienst.gesehen[0].name + '“');
  pruefe(dienst.gesehen[0].text === P2_SKILL,
    'Die eingesetzte Anweisung ist nicht der Text aus skills/p2/pruefen.md');
  pruefe(dienst.orte.length === 1 && dienst.orte[0].cwd === ablage,
    'Die Sitzung startet nicht im eigenen Arbeitsbereich: '
      + JSON.stringify(dienst.orte));
  pruefe(dienst.texte.length === 1 && dienst.texte[0].includes('p2-pruefen'),
    'Der Startauftrag nennt den Laufnamen nicht: ' + JSON.stringify(dienst.texte[0]));
  const eingesetzt = join(home, 'skills', 'p2-pruefen', 'SKILL.md');
  pruefe(existsSync(eingesetzt),
    'Nach dem Start fehlt $DSH_HOME/skills/p2-pruefen/SKILL.md');
  pruefe(readFileSync(eingesetzt, 'utf8') === P2_SKILL,
    'Der liegen gebliebene Einsatz ist nicht der Text aus skills/p2/pruefen.md');
  console.log('ok Start: p2-pruefen/SKILL.md liegt nach dem Start, aus der Ablage');

  const stopp = await posting('/board/gespraech/stopp', {
    vorhaben: eigenes.id, position: verweisPosition.id,
  });
  pruefe(stopp.status === 200, '/board/gespraech/stopp antwortet '
    + stopp.status + ': ' + stopp.text);
  pruefe(!existsSync(join(home, 'skills', 'p2-pruefen')),
    'Nach /board/gespraech/stopp liegt $DSH_HOME/skills/p2-pruefen noch da');
  console.log('ok Stopp: p2-pruefen/SKILL.md ist weg');

  // Der Start schreibt nichts in die Ablage: das Gespräch liegt persönlich.
  pruefe(git(['-C', ablage, 'status', '--porcelain']).out === '',
    'Der Start hinterlässt einen offenen Stand in der Ablage: '
      + git(['-C', ablage, 'status', '--porcelain']).out);

  // 5. Das Transkript: dieselbe Sitzung als Datei im eigenen Vorhaben, mit
  //    Lauf und Fassung.
  const sitzungsOrdner = join(home, 'sessions', 'pruefung', SITZUNG);
  mkdirSync(sitzungsOrdner, { recursive: true });
  writeFileSync(join(sitzungsOrdner, 'session.v1.jsonl.zstd'),
    zstdCompressSync(Buffer.from(EREIGNISSE.map((e) => JSON.stringify(e)).join('\n') + '\n')));
  const lauf = await posting('/board/skill/lauf', {
    vorhaben: eigenes.id,
    position: verweisPosition.id,
    session: SITZUNG,
  });
  pruefe(lauf.status === 200, '/board/skill/lauf antwortet ' + lauf.status + ': ' + lauf.text);
  const laufWert = JSON.parse(lauf.text);
  pruefe(/^transkripte\/[a-z0-9-]+\.md$/.test(laufWert.datei),
    'Der Transkript-Name taugt nicht: ' + JSON.stringify(laufWert.datei));
  const transkriptPfad = join(ablage, 'vorgaenge', eigenes.ordner, laufWert.datei);
  pruefe(existsSync(transkriptPfad),
    'Das Transkript „' + laufWert.datei + '“ fehlt im eigenen Vorhaben');
  const transkript = readFileSync(transkriptPfad, 'utf8');
  pruefe(transkript.includes('skill: p2-pruefen'),
    'Das Transkript nennt den Laufnamen p2-pruefen nicht');
  pruefe(transkript.includes('schritt: Prüfen'),
    'Das Transkript nennt die Station nicht');
  pruefe(transkript.includes('Die Idee ist geprüft.'),
    'Das Transkript enthält die Antwort nicht');
  const vorgangDatei = JSON.parse(
    readFileSync(join(ablage, 'vorgaenge', eigenes.ordner, 'vorhaben.json'), 'utf8'));
  const eintrag = (vorgangDatei.laeufe || []).find((l) => l && l.datei === laufWert.datei);
  pruefe(!!eintrag && eintrag.position === verweisPosition.id
    && eintrag.skill === 'p2-pruefen',
  'Der Lauf steht nicht in `laeufe`: ' + JSON.stringify(vorgangDatei.laeufe));
  const verlauf = alsJson(get('/board/verlauf?vorhaben=' + encodeURIComponent(eigenes.id)),
    '/board/verlauf');
  const schrittVerlauf = (verlauf.schritte || []).find((s) => s.positionId === verweisPosition.id);
  pruefe(!!schrittVerlauf && (schrittVerlauf.transkripte || [])
    .some((t) => t.datei === laufWert.datei),
  'Das Transkript erscheint nicht am Verweis-Schritt');
  const autor = git(['-C', ablage, 'log', '-1', '--format=%an']).out;
  const nachricht = git(['-C', ablage, 'log', '-1', '--format=%s']).out;
  pruefe(autor.includes('Thomas Heinrich') && !autor.includes('Zweite Person'),
    'Die Fassung nennt „' + autor + '“ statt der eigenen Person');
  pruefe(/Skill p2-pruefen/.test(nachricht),
    'Die Fassung heißt „' + nachricht + '“');
  pruefe(git(['-C', ablage, 'status', '--porcelain']).out === '',
    'Nach der Transkript-Fassung ist der Arbeitsbaum nicht ruhig: '
      + git(['-C', ablage, 'status', '--porcelain']).out);
  console.log('ok Transkript: ' + laufWert.datei + ' unter transkripte/, in laeufe, '
    + 'Fassung „' + autor + '“');

  // 6. Die fremden Dateien sind unverändert, ein fremdes Vorhaben entstand
  //    nicht; die eigene Datei trägt weiter den Verweis.
  pruefe(Buffer.compare(p2Vorher, readFileSync(p2Pfad)) === 0,
    'workflows/p2.json hat sich beim Lauf geändert');
  pruefe(Buffer.compare(p2SkillVorher, readFileSync(p2SkillPfad)) === 0,
    'skills/p2/pruefen.md hat sich beim Lauf geändert');
  pruefe(!existsSync(join(ablage, 'vorgaenge', 'von-p2', 'vorhaben.json')),
    'Der Lauf hat ein fremdes Vorhaben angelegt');
  const eigeneDatei = JSON.parse(readFileSync(p1Pfad, 'utf8')).workflows[0];
  pruefe((eigeneDatei.schritte || []).some((s) => s && s.ref === 'p2/standard/pruefen'),
    'Der Verweis ist beim Lauf aus der eigenen Datei verschwunden');
  console.log('ok fremde Dateien: workflows/p2.json und skills/p2/pruefen.md byte-gleich, '
    + 'kein fremdes Vorhaben');

  // 7. Ein fremdes Vorhaben an einem fremden Schritt beginnt kein Gespräch.
  const fremdOrdner = join(ablage, 'vorgaenge', 'von-p2');
  mkdirSync(fremdOrdner, { recursive: true });
  const fremdPfad = join(fremdOrdner, 'vorhaben.json');
  schreibeJson(fremdPfad, FREMDES);
  const fremdVorher = readFileSync(fremdPfad);
  const resFremd = await posting('/board/gespraech/senden', {
    vorhaben: 'von-p2',
    position: verweisPosition.id,
    text: 'Bitte beginne.',
  });
  pruefe(resFremd.status === 403,
    '/board/gespraech/senden auf das fremde Vorhaben antwortet ' + resFremd.status
      + ' statt 403: ' + resFremd.text);
  pruefe(dienst.zaehler === 1,
    'Trotz 403 wurde eine Sitzung angelegt (' + dienst.zaehler + ')');
  pruefe(dienst.gesehen.length === 1,
    'Trotz 403 wurde eine Anweisung eingesetzt');
  pruefe(!existsSync(join(home, 'skills', 'p2-pruefen')),
    'Trotz 403 blieb ein Einsatz liegen');
  pruefe(Buffer.compare(fremdVorher, readFileSync(fremdPfad)) === 0,
    'Die fremde vorhaben.json hat sich beim abgelehnten Start geändert');
  console.log('ok fremdes Vorhaben am fremden Schritt: 403, keine Sitzung, kein Einsatz');

  // 8. Die echte Installation bleibt unverändert: die Kopie der Harness-Skills
  //    ist ohne `p2-*`, /dsh-home/skills trägt kein `p2-*`, die echte Ablage
  //    keine zweite Person.
  pruefe(Buffer.compare(grillmeVorher,
    readFileSync(join(home, 'skills', 'grillme-vision', 'SKILL.md'))) === 0,
  'grillme-vision/SKILL.md hat sich in der Kopie geändert');
  pruefe(!readdirSync(join(home, 'skills')).some((n) => n.startsWith('p2-')),
    'In der Kopie blieb ein p2-Einsatz liegen');
  const echteSkillsNachher = readdirSync(ECHTE_SKILLS).sort();
  pruefe(echteSkillsNachher.join(',') === echteSkillsVorher.join(','),
    '/dsh-home/skills hat sich geändert: ' + echteSkillsNachher.join(', '));
  pruefe(!echteSkillsNachher.some((n) => n.startsWith('p2-')),
    'Der echte Harness-Skillordner trägt ein p2-*');
  pruefe(!existsSync(join(ABLAGE, 'personen', 'p2.json'))
    && !existsSync(join(ABLAGE, 'workflows', 'p2.json'))
    && !existsSync(join(ABLAGE, 'skills', 'p2')),
  'Die echte Ablage hat eine zweite Person bekommen');
  console.log('ok echte Installation: /dsh-home/skills unverändert, kein p2-* in der Ablage');

  gebaut.aufraeumen.forEach((ende) => ende());
  rmSync(stamm, { recursive: true, force: true });
  console.log('ok Prüfordner aufgeräumt: ' + stamm);
} catch (fehler) {
  if (gebaut) gebaut.aufraeumen.forEach((ende) => ende());
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  console.error('Prüfordner bleibt liegen: ' + stamm);
  process.exit(1);
}
