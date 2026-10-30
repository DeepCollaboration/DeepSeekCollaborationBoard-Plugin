/**
 * Prüfung Schritt 30 — der Umzug von der Ablage der Fassung 1 auf getrennte
 * Repositories der Fassung 2.
 *
 * Die echte alte Ablage wird nur gelesen und nach
 * `/tmp/board-scheibe1/schritt30/quelle` kopiert. In der Kopie wird der
 * Arbeitsbaum einmal gefasst, damit sie sauber ist; der Umzug läuft
 * ausschließlich auf der Kopie. Die echte Ablage wird nie geschrieben.
 *
 * Geprüft wird:
 *
 *   1. Der Umzug endet mit 0 und meldet 11 Stationen, 1 Workflow, 4 Vorhaben
 *      und 2 Boards. Jedes Ding liegt in einem eigenen Repository mit Branch
 *      `main` und einer Fassung; Stationen und Workflow tragen den Tag `v1`.
 *   2. Alle Repositories sind mit den Formatlesern lesbar: Kennungen, Namen,
 *      Host, Aktionen samt kopierter Anweisung, Positionen, Kanten, Verweise,
 *      Verantwortliche, Läufe, Zweige und Farben stehen wie in der alten
 *      Ablage. Die Dateien und `transkripte/` der Vorhaben sind mitgekommen.
 *   3. Hauptboard und Team-Board verweisen auf die richtigen Dinge, die
 *      Personen tragen den GitHub-Namen, und `sichtbarkeit.json` trennt
 *      öffentlich und privat.
 *   4. Der Bericht nennt Datum, Quelle, Ziel, Host und je Art die Zahl.
 *   5. Die Kopie der Quelle trägt danach denselben `HEAD`, ist sauber, und
 *      auch die echte Ablage ist unverändert.
 *   6. Kleine Fehlerfälle einer winzigen Ablage brechen mit Exit 1 ab, bevor
 *      etwas geschrieben wird: ohne `--host`, `--quelle` oder `--ziel`, bei
 *      einem nicht leeren Ziel und bei falscher oder fehlender Fassung.
 *   7. Die Prüfablage ist danach entfernt.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liesStation } from '../formate/station.js';
import { liesWorkflow } from '../formate/workflow.js';
import { liesVorhaben } from '../formate/vorhaben.js';
import { liesBoard } from '../formate/board.js';
import { komponiere } from '../komposition.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRODUKT = dirname(HIER);
const WURZEL = '/tmp/board-scheibe1';
const ABLAGE = join(WURZEL, 'schritt30');
const ECHT = process.env.BOARD_ABLAGE || '/workspace/projekte/board';
const QUELLE = join(ABLAGE, 'quelle');
const ZIEL = join(ABLAGE, 'ziel');
const BERICHT = join(ABLAGE, 'bericht.md');
const HOST = 'thomas-heinrich';

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(text);
}

function gleich(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function liesJson(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  pruefe(lauf.status === 0, 'git ' + args.join(' ') + ' in ' + ordner + ': '
    + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  return String(lauf.stdout || '').trim();
}

/** Den Umzug als eigenen Prozess mit den übergebenen Argumenten starten. */
function umzug(args) {
  const lauf = spawnSync(process.execPath,
    [join(PRODUKT, 'werkzeuge', 'umzug2.mjs'), ...args], {
      cwd: PRODUKT,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  return {
    status: lauf.status,
    stdout: String(lauf.stdout || ''),
    stderr: String(lauf.stderr || ''),
  };
}

/** Alle Dateien unterhalb eines Ordners, relativ, `.git` bleibt draußen. */
function dateienVon(ordner, basis = ordner) {
  const ergebnis = [];
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (eintrag.name === '.git') continue;
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      ergebnis.push(...dateienVon(pfad, basis));
    } else if (eintrag.isFile()) {
      ergebnis.push(relative(basis, pfad).split(sep).join('/'));
    }
  }
  return ergebnis.sort();
}

/** Die Altdaten, die der Umzug liest: Person, Workflow und Vorhaben. */
function alteDaten() {
  const personen = liesJson(join(QUELLE, 'personen', 'p1.json'));
  const namen = readdirSync(join(QUELLE, 'workflows'))
    .filter((name) => name.endsWith('.json')).sort();
  pruefe(namen.length === 1, 'Die alte Ablage trägt nicht genau eine Workflow-Datei: '
    + JSON.stringify(namen));
  const roh = liesJson(join(QUELLE, 'workflows', namen[0]));
  const workflow = Array.isArray(roh.workflows) ? roh.workflows[0] : null;
  pruefe(workflow, 'Die alte Workflow-Datei trägt keinen Workflow');
  const vorgaenge = readdirSync(join(QUELLE, 'vorgaenge'), { withFileTypes: true })
    .filter((eintrag) => eintrag.isDirectory())
    .map((eintrag) => eintrag.name)
    .sort();
  return { personen, workflow, vorgaenge };
}

/** Die Anweisung eines alten Schritts: erst der genannte Pfad, dann die Regel. */
function skillDatei(schritt) {
  const angegeben = String(schritt.skill || '').trim();
  if (angegeben && existsSync(join(QUELLE, angegeben))) return join(QUELLE, angegeben);
  const person = String(schritt.host || 'p1');
  const pfad = join(QUELLE, 'skills', person, String(schritt.id) + '.md');
  return existsSync(pfad) ? pfad : null;
}

/** Eine winzige alte Ablage für die Fehlerfälle. */
function kleinerSpeicher(ordner, format) {
  mkdirSync(join(ordner, 'personen'), { recursive: true });
  mkdirSync(join(ordner, 'workflows'), { recursive: true });
  if (format != null) writeFileSync(join(ordner, 'format'), format + '\n', 'utf8');
  schreibeJson(join(ordner, 'personen', 'p1.json'), {
    id: 'p1', name: 'Kleine Person', farbe: '#fbbf24',
  });
  schreibeJson(join(ordner, 'workflows', 'p1.json'), {
    person: 'p1', workflows: [],
  });
}

let bestanden = false;

rmSync(ABLAGE, { recursive: true, force: true });

try {
  mkdirSync(ABLAGE, { recursive: true });

  // Der Stand der echten Ablage, bevor irgendetwas gelesen wird.
  const echtKopfVorher = git(ECHT, ['rev-parse', 'HEAD']);
  const echtStatusVorher = git(ECHT, ['status', '--porcelain']);

  // 0. Die Kopie der alten Ablage; sie wird sauber gefasst.
  cpSync(ECHT, QUELLE, { recursive: true });
  git(QUELLE, ['add', '-A']);
  git(QUELLE, [
    '-c', 'user.name=Prüfung',
    '-c', 'user.email=pruefung@board',
    'commit', '-q', '--allow-empty', '-m', 'Kopie der Ablage der Fassung 1',
  ]);
  const kopfVorher = git(QUELLE, ['rev-parse', 'HEAD']);
  pruefe(git(QUELLE, ['status', '--porcelain']) === '',
    'Die Kopie der alten Ablage ist vor dem Umzug nicht sauber');

  const alt = alteDaten();
  const altSchritte = Array.isArray(alt.workflow.schritte) ? alt.workflow.schritte : [];
  const altPositionen = Array.isArray(alt.workflow.positionen) ? alt.workflow.positionen : [];
  const altKanten = Array.isArray(alt.workflow.kanten) ? alt.workflow.kanten : [];
  pruefe(altSchritte.length === 11,
    'Die alte Ablage trägt ' + altSchritte.length + ' Schritte statt elf');
  pruefe(alt.vorgaenge.length === 4,
    'Die alte Ablage trägt ' + alt.vorgaenge.length + ' Vorhaben statt vier');

  // 1. Der Umzug auf der Kopie.
  const lauf = umzug([
    '--quelle', QUELLE, '--ziel', ZIEL, '--host', HOST, '--bericht', BERICHT,
  ]);
  pruefe(lauf.status === 0, 'Der Umzug endet mit ' + lauf.status + ': '
    + lauf.stderr + lauf.stdout);
  pruefe(lauf.stdout.includes('11 Stationen'),
    'Der Umzug meldet nicht elf Stationen: ' + JSON.stringify(lauf.stdout));

  const eintraege = readdirSync(ZIEL).sort();
  const stationen = eintraege.filter((name) => name.startsWith('station-'));
  const workflows = eintraege.filter((name) => name.startsWith('workflow-'));
  const vorhaben = eintraege.filter((name) => name.startsWith('vorhaben-'));
  const boards = eintraege.filter((name) => name.startsWith('board-'));
  pruefe(stationen.length === 11,
    'Im Ziel liegen ' + stationen.length + ' Stationen statt elf: '
      + JSON.stringify(stationen));
  pruefe(workflows.length === 1,
    'Im Ziel liegen ' + workflows.length + ' Workflows statt einem: '
      + JSON.stringify(workflows));
  pruefe(vorhaben.length === 4,
    'Im Ziel liegen ' + vorhaben.length + ' Vorhaben statt vier: '
      + JSON.stringify(vorhaben));
  pruefe(gleich(boards, ['board-hauptboard', 'board-team']),
    'Im Ziel liegen nicht die beiden Boards: ' + JSON.stringify(boards));

  // 2. Die Stationen mit den Formatlesern lesen.
  const stationSoll = altSchritte.map((schritt) => 'station-' + String(schritt.id));
  pruefe(gleich(stationen, stationSoll.slice().sort()),
    'Die Stationen tragen nicht die Kennungen der alten Schritte: '
      + JSON.stringify(stationen) + ' statt ' + JSON.stringify(stationSoll));

  for (const schritt of altSchritte) {
    const id = String(schritt.id);
    const ordner = join(ZIEL, 'station-' + id);
    const station = liesStation(ordner);
    const inhalt = String(schritt.inhalt || '');
    pruefe(station.id === id, 'Die Station „' + id + '“ trägt eine andere Kennung: '
      + JSON.stringify(station.id));
    pruefe(station.name === String(schritt.name),
      'Die Station „' + id + '“ heißt anders: ' + JSON.stringify(station.name));
    pruefe(station.host === HOST,
      'Die Station „' + id + '“ gehört nicht dem Host: ' + JSON.stringify(station.host));
    pruefe(station.beschreibung === inhalt,
      'Die Beschreibung der Station „' + id + '“ weicht ab: '
        + JSON.stringify(station.beschreibung));
    pruefe(gleich(station.eingang, schritt.eingang || []),
      'Der Eingang der Station „' + id + '“ weicht ab: '
        + JSON.stringify(station.eingang));
    pruefe(gleich(station.ausgabe, schritt.ausgabe || []),
      'Die Ausgabe der Station „' + id + '“ weicht ab: '
        + JSON.stringify(station.ausgabe));
    pruefe(gleich(station.beispiele, []), 'Die Station „' + id + '“ erfindet Beispiele');
    pruefe(station.reife === 'erprobt', 'Die Station „' + id + '“ trägt nicht „erprobt“');
    pruefe(station.lizenz === 'nicht angegeben',
      'Die Station „' + id + '“ nennt eine Lizenz: ' + JSON.stringify(station.lizenz));
    pruefe(gleich(station.tags, []), 'Die Station „' + id + '“ erfindet Schlagworte');

    const wie = schritt.wie && typeof schritt.wie === 'object' ? schritt.wie : {};
    const art = String(wie.art || '');
    if (art === 'skill') {
      const datei = skillDatei(schritt);
      pruefe(datei, 'Zur Skill-Station „' + id + '“ fehlt die alte Anweisung');
      pruefe(station.aktion.art === 'skill' && station.aktion.datei === 'SKILL.md',
        'Die Station „' + id + '“ ist keine Skill-Station: '
          + JSON.stringify(station.aktion));
      const kopie = join(ordner, 'SKILL.md');
      pruefe(existsSync(kopie), 'Der Station „' + id + '“ fehlt SKILL.md');
      pruefe(readFileSync(kopie).equals(readFileSync(datei)),
        'SKILL.md der Station „' + id + '“ ist nicht die alte Anweisung');
    } else if (art === 'datei') {
      pruefe(station.aktion.art === 'datei' && station.aktion.wert === inhalt,
        'Die Station „' + id + '“ trägt nicht die Datei-Aktion: '
          + JSON.stringify(station.aktion));
    } else {
      pruefe(station.aktion.art === 'textfeld' && station.aktion.wert === inhalt,
        'Die Station „' + id + '“ trägt nicht die Textfeld-Aktion: '
          + JSON.stringify(station.aktion));
    }

    const readme = readFileSync(join(ordner, 'README.md'), 'utf8');
    pruefe(readme.startsWith('# ' + String(schritt.name)),
      'Das README der Station „' + id + '“ beginnt nicht mit dem Namen');
    for (const stelle of ['Eingang', 'Ausgabe', 'Aktionsart']) {
      pruefe(readme.includes(stelle),
        'Dem README der Station „' + id + '“ fehlt „' + stelle + '“');
    }
    pruefe(readme.includes('station.json'),
      'Das README der Station „' + id + '“ nennt station.json nicht');
    const changelog = readFileSync(join(ordner, 'CHANGELOG.md'), 'utf8');
    pruefe(changelog.includes('v1'), 'Der Station „' + id + '“ fehlt der Eintrag v1');

    pruefe(git(ordner, ['rev-parse', '--abbrev-ref', 'HEAD']) === 'main',
      'Die Station „' + id + '“ liegt nicht auf main');
    pruefe(git(ordner, ['tag', '--list', 'v1']) === 'v1',
      'Der Station „' + id + '“ fehlt der Tag v1');
    pruefe(git(ordner, ['rev-list', '--count', 'HEAD']) === '1',
      'Die Station „' + id + '“ hat nicht genau eine Fassung');
  }

  // 3. Der Workflow mit dem Formatleser lesen.
  const workflow = liesWorkflow(join(ZIEL, 'workflow-standard'));
  pruefe(workflow.id === 'standard',
    'Der Workflow heißt nicht standard: ' + JSON.stringify(workflow.id));
  pruefe(workflow.titel === String(alt.workflow.titel),
    'Der Workflow trägt einen anderen Titel: ' + JSON.stringify(workflow.titel));
  pruefe(workflow.beschreibung === '',
    'Der Workflow erfindet eine Beschreibung: ' + JSON.stringify(workflow.beschreibung));
  pruefe(workflow.autor === HOST,
    'Der Workflow nennt nicht den Host als Autor: ' + JSON.stringify(workflow.autor));
  pruefe(workflow.layout === 'auto',
    'Der Workflow trägt nicht das alte Layout: ' + JSON.stringify(workflow.layout));
  pruefe(gleich(workflow.regeln, {}), 'Der Workflow erfindet Regeln');
  pruefe(workflow.stationen.length === 11,
    'Der Workflow verweist auf ' + workflow.stationen.length + ' Stationen statt elf');
  for (const schritt of altSchritte) {
    const verweis = workflow.stationen.find((eintrag) => eintrag.id === String(schritt.id));
    pruefe(verweis, 'Dem Workflow fehlt der Verweis auf „' + schritt.id + '“');
    pruefe(verweis.repo === 'station-' + String(schritt.id) && verweis.fassung === 'v1',
      'Der Verweis auf „' + schritt.id + '“ ist falsch: ' + JSON.stringify(verweis));
  }
  pruefe(workflow.positionen.length === altPositionen.length,
    'Der Workflow trägt ' + workflow.positionen.length + ' Positionen statt '
      + altPositionen.length);
  for (let i = 0; i < altPositionen.length; i += 1) {
    const altPosition = altPositionen[i];
    const position = workflow.positionen[i];
    pruefe(position.id === String(altPosition.id),
      'Die Position ' + i + ' heißt anders: ' + JSON.stringify(position.id));
    pruefe(position.station === String(altPosition.schritt),
      'Die Position „' + position.id + '“ verweist auf die falsche Station: '
        + JSON.stringify(position.station));
    pruefe(position.x === altPosition.x && position.y === altPosition.y,
      'Die Position „' + position.id + '“ liegt woanders');
    pruefe(gleich(position.bedingung, altPosition.bedingung || []),
      'Die Bedingung der Position „' + position.id + '“ weicht ab');
  }
  pruefe(gleich(workflow.kanten, altKanten),
    'Die Kanten des Workflows weichen ab: ' + JSON.stringify(workflow.kanten));

  const workflowOrdner = join(ZIEL, 'workflow-standard');
  const workflowReadme = readFileSync(join(workflowOrdner, 'README.md'), 'utf8');
  pruefe(workflowReadme.startsWith('# ' + String(alt.workflow.titel)),
    'Das Workflow-README beginnt nicht mit dem Titel');
  pruefe(workflowReadme.includes('workflow.json'),
    'Das Workflow-README nennt workflow.json nicht');
  pruefe(git(workflowOrdner, ['tag', '--list', 'v1']) === 'v1',
    'Dem Workflow fehlt der Tag v1');

  // 4. Die Vorhaben mit dem Formatleser lesen; Dateien und Transkripte prüfen.
  for (const ordner of alt.vorgaenge) {
    const altVorhaben = liesJson(join(QUELLE, 'vorgaenge', ordner, 'vorhaben.json'));
    const neu = join(ZIEL, 'vorhaben-' + ordner);
    const vorhabenWert = liesVorhaben(neu);
    pruefe(vorhabenWert.id === ordner,
      'Das Vorhaben „' + ordner + '“ trägt eine andere Kennung: '
        + JSON.stringify(vorhabenWert.id));
    pruefe(vorhabenWert.name === String(altVorhaben.name),
      'Das Vorhaben „' + ordner + '“ heißt anders: ' + JSON.stringify(vorhabenWert.name));
    pruefe(vorhabenWert.position === String(altVorhaben.position),
      'Das Vorhaben „' + ordner + '“ steht an einer anderen Position: '
        + JSON.stringify(vorhabenWert.position));
    pruefe(gleich(vorhabenWert.workflow,
      { repo: 'workflow-' + String(alt.workflow.id), fassung: 'v1' }),
    'Das Vorhaben „' + ordner + '“ verweist auf den falschen Workflow: '
      + JSON.stringify(vorhabenWert.workflow));

    const verantwortliche = {};
    for (const [stelle, logins] of Object.entries(altVorhaben.verantwortliche || {})) {
      verantwortliche[stelle] = logins
        .map((login) => (login === 'p1' ? HOST : login));
    }
    pruefe(gleich(vorhabenWert.verantwortliche, verantwortliche),
      'Die Verantwortlichen des Vorhabens „' + ordner + '“ weichen ab: '
        + JSON.stringify(vorhabenWert.verantwortliche));
    pruefe(gleich(vorhabenWert.laeufe, altVorhaben.laeufe || []),
      'Die Läufe des Vorhabens „' + ordner + '“ weichen ab');
    pruefe(vorhabenWert.fork_von === null,
      'Das Vorhaben „' + ordner + '“ erfindet einen Fork');
    const zweig = altVorhaben.zweig_von;
    const erwarteterZweig = zweig && typeof zweig === 'object' && zweig.von
      ? 'vorhaben-' + String(zweig.von) : null;
    pruefe(vorhabenWert.zweig_von === erwarteterZweig,
      'Der Zweig des Vorhabens „' + ordner + '“ ist falsch: '
        + JSON.stringify(vorhabenWert.zweig_von));
    pruefe(vorhabenWert.farbe === (altVorhaben.farbe || '#94a3b8'),
      'Die Farbe des Vorhabens „' + ordner + '“ ist falsch: '
        + JSON.stringify(vorhabenWert.farbe));

    const altOrdner = join(QUELLE, 'vorgaenge', ordner);
    const alteDateien = dateienVon(altOrdner).filter((name) => name !== 'vorhaben.json');
    const neueDateien = dateienVon(neu).filter((name) => name !== 'vorhaben.json');
    pruefe(gleich(alteDateien, neueDateien),
      'Dem Vorhaben „' + ordner + '“ fehlen Dateien: ' + JSON.stringify(neueDateien)
        + ' statt ' + JSON.stringify(alteDateien));
    for (const name of alteDateien) {
      pruefe(readFileSync(join(altOrdner, name)).equals(readFileSync(join(neu, name))),
        'Die Datei „' + name + '“ des Vorhabens „' + ordner + '“ weicht ab');
    }
    pruefe(git(neu, ['rev-list', '--count', 'HEAD']) === '1',
      'Das Vorhaben „' + ordner + '“ hat nicht genau eine Fassung');
  }

  // 5. Die beiden Boards und die Sichtbarkeit.
  const haupt = liesBoard(join(ZIEL, 'board-hauptboard'));
  pruefe(haupt.id === 'hauptboard' && haupt.art === 'hauptboard',
    'Das Hauptboard trägt nicht seine Art: ' + JSON.stringify([haupt.id, haupt.art]));
  pruefe(haupt.vorhaben.length === 0,
    'Das Hauptboard nennt Vorhaben: ' + JSON.stringify(haupt.vorhaben));
  pruefe(haupt.stationen.length === 11,
    'Das Hauptboard nennt ' + haupt.stationen.length + ' Stationen statt elf');
  pruefe(gleich(haupt.stationen, altSchritte.map((schritt) => ({
    repo: 'station-' + String(schritt.id),
  }))), 'Das Hauptboard nennt die falschen Stationen: ' + JSON.stringify(haupt.stationen));
  pruefe(gleich(haupt.workflows, [{ repo: 'workflow-standard', fassung: 'v1' }]),
    'Das Hauptboard nennt den falschen Workflow: ' + JSON.stringify(haupt.workflows));
  pruefe(gleich(haupt.personen, [{
    login: HOST, name: String(alt.personen.name), farbe: String(alt.personen.farbe),
  }]), 'Das Hauptboard nennt die falsche Person: ' + JSON.stringify(haupt.personen));
  pruefe(gleich(haupt.einstellungen, {}) && gleich(haupt.layout, {}),
    'Das Hauptboard erfindet Einstellungen oder ein Layout');

  const team = liesBoard(join(ZIEL, 'board-team'));
  pruefe(team.id === 'team' && team.art === 'team',
    'Das Team-Board trägt nicht seine Art: ' + JSON.stringify([team.id, team.art]));
  pruefe(gleich(team.vorhaben.map((eintrag) => eintrag.repo).sort(),
    alt.vorgaenge.map((ordner) => 'vorhaben-' + ordner).sort()),
  'Das Team-Board nennt nicht alle vier Vorhaben: ' + JSON.stringify(team.vorhaben));
  pruefe(team.stationen.length === 11 && team.workflows.length === 1,
    'Dem Team-Board fehlen Stationen oder Workflow');
  pruefe(gleich(team.personen, haupt.personen),
    'Das Team-Board nennt andere Personen als das Hauptboard');
  for (const ordner of ['board-hauptboard', 'board-team']) {
    const readme = readFileSync(join(ZIEL, ordner, 'README.md'), 'utf8');
    pruefe(readme.includes('board.json'),
      'Das README von „' + ordner + '“ nennt board.json nicht');
    pruefe(git(join(ZIEL, ordner), ['rev-list', '--count', 'HEAD']) === '1',
      'Das Board „' + ordner + '“ hat nicht genau eine Fassung');
  }

  // Die nackten Verweise der Repositories lösen sich als Geschwisterordner
  // auf: das Hauptboard findet elf Schritte, das Team-Board vier Vorhaben.
  const hauptBild = komponiere({ repo: join(ZIEL, 'board-hauptboard'), person: HOST });
  pruefe(hauptBild.schritte.length === 11 && hauptBild.stationen.length === 11,
    'Die Komposition des Hauptboards findet nicht elf Schritte und Stationen: '
      + JSON.stringify([hauptBild.schritte.length, hauptBild.stationen.length]));
  pruefe(hauptBild.vorgaenge.length === 0 && hauptBild.luecken.length === 0,
    'Das Hauptboard trägt Vorhaben oder Lücken: '
      + JSON.stringify([hauptBild.vorgaenge.length, hauptBild.luecken]));
  const teamBild = komponiere({ repo: join(ZIEL, 'board-team'), person: HOST });
  pruefe(teamBild.vorgaenge.length === 4 && teamBild.schritte.length === 11,
    'Die Komposition des Team-Boards findet nicht vier Vorhaben an elf Schritten: '
      + JSON.stringify([teamBild.vorgaenge.length, teamBild.schritte.length]));
  pruefe(teamBild.luecken.length === 0,
    'Das Team-Board trägt Lücken: ' + JSON.stringify(teamBild.luecken));

  const sichtbarkeit = liesJson(join(ZIEL, 'sichtbarkeit.json'));
  const werte = Object.values(sichtbarkeit);
  pruefe(Object.keys(sichtbarkeit).length === 18,
    'sichtbarkeit.json nennt ' + Object.keys(sichtbarkeit).length + ' Repositories statt 18');
  pruefe(werte.filter((wert) => wert === 'öffentlich').length === 13,
    'sichtbarkeit.json nennt nicht 13 öffentliche Repositories: ' + JSON.stringify(werte));
  pruefe(werte.filter((wert) => wert === 'privat').length === 5,
    'sichtbarkeit.json nennt nicht fünf private Repositories: ' + JSON.stringify(werte));
  for (const schritt of altSchritte) {
    pruefe(sichtbarkeit['station-' + String(schritt.id)] === 'öffentlich',
      'Die Station „' + schritt.id + '“ ist nicht öffentlich');
  }
  pruefe(sichtbarkeit['workflow-standard'] === 'öffentlich'
    && sichtbarkeit['board-hauptboard'] === 'öffentlich',
  'Workflow oder Hauptboard ist nicht öffentlich');
  pruefe(sichtbarkeit['board-team'] === 'privat',
    'Das Team-Board ist nicht privat');
  for (const ordner of alt.vorgaenge) {
    pruefe(sichtbarkeit['vorhaben-' + ordner] === 'privat',
      'Das Vorhaben „' + ordner + '“ ist nicht privat');
  }

  // 6. Der Bericht.
  const bericht = readFileSync(BERICHT, 'utf8');
  pruefe(/^# Umzug auf Fassung 2/m.test(bericht), 'Der Bericht hat keinen Titel');
  for (const stelle of ['Datum', 'Quelle', 'Ziel', 'Host']) {
    pruefe(bericht.includes('**' + stelle + ':**'),
      'Dem Bericht fehlt „' + stelle + '“');
  }
  pruefe(/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(bericht), 'Der Bericht nennt kein Datum');
  pruefe(bericht.includes(HOST) && bericht.includes(QUELLE) && bericht.includes(ZIEL),
    'Der Bericht nennt Quelle, Ziel oder Host nicht');
  for (const zeile of ['## Stationen (11)', '## Workflow (1)',
    '## Vorhaben (4)', '## Boards (2)']) {
    pruefe(bericht.includes(zeile), 'Dem Bericht fehlt „' + zeile + '“');
  }
  for (const repo of ['station-idee', 'workflow-standard',
    'vorhaben-board-gesamtkonzept', 'board-hauptboard']) {
    pruefe(bericht.includes(repo), 'Der Bericht nennt „' + repo + '“ nicht');
  }

  // 7. Die Quelle ist unverändert: gleicher HEAD, und nichts liegt darin.
  pruefe(git(QUELLE, ['rev-parse', 'HEAD']) === kopfVorher,
    'Die Kopie der Quelle hat nach dem Umzug einen anderen HEAD');
  pruefe(git(QUELLE, ['status', '--porcelain']) === '',
    'In der Kopie der Quelle liegt nach dem Umzug etwas Uncommittetes');
  pruefe(git(ECHT, ['rev-parse', 'HEAD']) === echtKopfVorher,
    'Die echte Ablage hat nach dem Umzug einen anderen HEAD');
  pruefe(git(ECHT, ['status', '--porcelain']) === echtStatusVorher,
    'Die echte Ablage ist nach dem Umzug nicht mehr im selben Stand');

  // 8. Kleine Fehlerfälle mit einer winzigen Ablage.
  const klein = join(ABLAGE, 'klein');
  const kleinFormat2 = join(ABLAGE, 'klein-format2');
  const kleinOhneFormat = join(ABLAGE, 'klein-ohne-format');
  kleinerSpeicher(klein, 1);
  kleinerSpeicher(kleinFormat2, 2);
  kleinerSpeicher(kleinOhneFormat, null);

  const ohneHost = umzug(['--quelle', klein, '--ziel', join(ABLAGE, 'ziel-ohne-host')]);
  pruefe(ohneHost.status === 1,
    'Ohne --host endet der Umzug mit ' + ohneHost.status + ' statt 1');
  pruefe(/--host/.test(ohneHost.stderr),
    'Ohne --host nennt die Meldung nicht das fehlende Argument: '
      + JSON.stringify(ohneHost.stderr));
  pruefe(!existsSync(join(ABLAGE, 'ziel-ohne-host')),
    'Ohne --host wurde das Ziel angelegt');

  const ohneQuelle = umzug([
    '--ziel', join(ABLAGE, 'ziel-ohne-quelle'), '--host', HOST,
  ]);
  pruefe(ohneQuelle.status === 1 && /--quelle/.test(ohneQuelle.stderr),
    'Ohne --quelle bricht der Umzug nicht mit der richtigen Meldung ab: '
      + ohneQuelle.status + ' ' + JSON.stringify(ohneQuelle.stderr));
  pruefe(!existsSync(join(ABLAGE, 'ziel-ohne-quelle')),
    'Ohne --quelle wurde das Ziel angelegt');

  const ohneZiel = umzug(['--quelle', klein, '--host', HOST]);
  pruefe(ohneZiel.status === 1 && /--ziel/.test(ohneZiel.stderr),
    'Ohne --ziel bricht der Umzug nicht mit der richtigen Meldung ab: '
      + ohneZiel.status + ' ' + JSON.stringify(ohneZiel.stderr));

  const zielVoll = join(ABLAGE, 'ziel-voll');
  mkdirSync(zielVoll, { recursive: true });
  writeFileSync(join(zielVoll, 'da.txt'), 'bleibt\n', 'utf8');
  const voll = umzug(['--quelle', klein, '--ziel', zielVoll, '--host', HOST]);
  pruefe(voll.status === 1 && /nicht leer/.test(voll.stderr),
    'Ein volles Ziel bricht den Umzug nicht ab: ' + voll.status + ' '
      + JSON.stringify(voll.stderr));
  pruefe(gleich(readdirSync(zielVoll), ['da.txt'])
    && readFileSync(join(zielVoll, 'da.txt'), 'utf8') === 'bleibt\n',
  'Ein volles Ziel wurde verändert: ' + JSON.stringify(readdirSync(zielVoll)));

  const zielFalschesFormat = join(ABLAGE, 'ziel-falsches-format');
  const falschesFormat = umzug([
    '--quelle', kleinFormat2, '--ziel', zielFalschesFormat, '--host', HOST,
  ]);
  pruefe(falschesFormat.status === 1 && /Fassung 1/.test(falschesFormat.stderr),
    'Format 2 bricht den Umzug nicht ab: ' + falschesFormat.status + ' '
      + JSON.stringify(falschesFormat.stderr));
  pruefe(!existsSync(zielFalschesFormat),
    'Bei Format 2 wurde das Ziel angelegt');

  const zielOhneFormat = join(ABLAGE, 'ziel-ohne-format');
  const ohneFormat = umzug([
    '--quelle', kleinOhneFormat, '--ziel', zielOhneFormat, '--host', HOST,
  ]);
  pruefe(ohneFormat.status === 1 && /Fassung 1/.test(ohneFormat.stderr),
    'Eine Quelle ohne format bricht den Umzug nicht ab: ' + ohneFormat.status + ' '
      + JSON.stringify(ohneFormat.stderr));
  pruefe(!existsSync(zielOhneFormat),
    'Bei fehlendem format wurde das Ziel angelegt');

  console.log('ok Umzug: 11 Stationen, 1 Workflow, 4 Vorhaben, 2 Boards; '
    + 'Quelle unverändert');
  bestanden = true;
} finally {
  rmSync(ABLAGE, { recursive: true, force: true });
}

pruefe(bestanden, 'Die Prüfung ist nicht durchgelaufen');
pruefe(!existsSync(ABLAGE), 'Die Prüfablage wurde nicht entfernt');
try { rmdirSync(WURZEL); } catch { /* die laufende Prüffläche liegt noch daneben */ }
console.log('ok Prüfablage aufgeräumt: ' + ABLAGE);
