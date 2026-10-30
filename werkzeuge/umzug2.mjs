/**
 * Umzug: aus einer Ablage der Fassung 1 werden getrennte Repositories der
 * Fassung 2.
 *
 * Jedes Ding bekommt einen eigenen Ordner mit eigener Geschichte: je Schritt
 * des Workflows eine Station, je Workflow ein Workflow, je Vorhaben ein
 * Vorhaben, dazu ein Hauptboard und ein Team-Board. Die Quelle wird nur
 * gelesen; geschrieben wird ausschließlich unter dem Ziel. Ist das Ziel nicht
 * leer, wird nichts überschrieben.
 *
 * Aufruf:
 *   node werkzeuge/umzug2.mjs --quelle <alter-ordner> --ziel <neuer-ordner> \
 *     --host <github-login> [--bericht <datei>]
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ARGUMENTE = ['quelle', 'ziel', 'host', 'bericht'];
const AKTIONSDATEI = 'SKILL.md';
const STANDARDFARBE = '#94a3b8';

/** Ein Abbruch mit Exit 1 und einer Meldung, die den Grund nennt. */
function abbruch(text) {
  throw new Error(text);
}

function text(wert) {
  return typeof wert === 'string' ? wert : '';
}

function liste(wert) {
  return Array.isArray(wert) ? wert : [];
}

function zahl(wert, feld) {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    abbruch('„' + feld + '“ fehlt oder ist keine Zahl');
  }
  return wert;
}

function farbeOder(wert, vorgabe) {
  return /^#[0-9a-f]{6}$/i.test(wert) ? wert : vorgabe;
}

/** Liegt `pfad` in `basis` (auch gleich)? */
function innen(basis, pfad) {
  const ab = relative(basis, pfad);
  return ab === '' || (ab !== '..' && !ab.startsWith('..' + sep) && !ab.startsWith(sep));
}

function liesArgumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    const treffer = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!treffer || !ARGUMENTE.includes(treffer[1])) {
      abbruch('Unbekanntes Argument: ' + argv[i]);
    }
    let wert = treffer[2];
    if (wert == null) {
      wert = argv[i + 1];
      if (wert == null || wert.startsWith('--')) {
        abbruch('--' + treffer[1] + ' braucht einen Wert');
      }
      i += 1;
    }
    werte[treffer[1]] = wert;
  }
  return werte;
}

function liesJson(pfad) {
  let rohText;
  try {
    rohText = readFileSync(pfad, 'utf8');
  } catch {
    abbruch('Die Datei fehlt oder ist nicht lesbar: ' + pfad);
  }
  let roh;
  try {
    roh = JSON.parse(rohText);
  } catch {
    abbruch('Die Datei ist kein gültiges JSON: ' + pfad);
  }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    abbruch('Die Datei ist kein Objekt: ' + pfad);
  }
  return roh;
}

function schreibeJson(pfad, wert) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(wert, null, 2) + '\n', 'utf8');
}

function schreibeText(pfad, inhalt) {
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, inhalt, 'utf8');
}

/** Ein `git`-Befehl in einem der neuen Repositories; Fehler tragen den Ort. */
function git(ordner, args) {
  const lauf = spawnSync('git', args, {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (lauf.status !== 0) {
    abbruch('git ' + args.join(' ') + ' in ' + ordner + ': '
      + String(lauf.stderr || lauf.stdout || 'unbekannter Fehler').trim());
  }
  return String(lauf.stdout || '').trim();
}

/** Branch `main`, eine Fassung, auf Wunsch ein Tag. */
function festschreiben(ordner, nachricht, tag) {
  git(ordner, ['init', '-q', '-b', 'main']);
  git(ordner, ['add', '-A']);
  git(ordner, [
    '-c', 'user.name=Umzug',
    '-c', 'user.email=umzug@board',
    'commit', '-q', '-m', nachricht,
  ]);
  if (tag) git(ordner, ['tag', tag]);
}

function liesPersonen(quelle) {
  const ordner = join(quelle, 'personen');
  const personen = new Map();
  let dateien = [];
  try {
    dateien = readdirSync(ordner).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return personen;
  }
  for (const name of dateien) {
    let roh;
    try {
      roh = liesJson(join(ordner, name));
    } catch {
      continue;
    }
    if (typeof roh.id !== 'string' || !roh.id) continue;
    personen.set(roh.id, {
      id: roh.id,
      name: text(roh.name),
      farbe: farbeOder(text(roh.farbe), STANDARDFARBE),
    });
  }
  return personen;
}

function liesWorkflows(quelle) {
  const ordner = join(quelle, 'workflows');
  const workflows = [];
  let dateien = [];
  try {
    dateien = readdirSync(ordner).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return workflows;
  }
  for (const name of dateien) {
    const roh = liesJson(join(ordner, name));
    const person = text(roh.person) || name.slice(0, -'.json'.length);
    for (const workflow of liste(roh.workflows)) {
      if (!workflow || typeof workflow !== 'object') continue;
      const id = text(workflow.id).trim();
      if (!id) continue;
      workflows.push({ roh: workflow, id, person });
    }
  }
  return workflows;
}

function liesVorgaenge(quelle) {
  const ordner = join(quelle, 'vorgaenge');
  const vorgaenge = [];
  let eintraege = [];
  try {
    eintraege = readdirSync(ordner, { withFileTypes: true })
      .filter((eintrag) => eintrag.isDirectory())
      .map((eintrag) => eintrag.name)
      .sort();
  } catch {
    return vorgaenge;
  }
  for (const name of eintraege) {
    const pfad = join(ordner, name, 'vorhaben.json');
    if (!existsSync(pfad)) {
      abbruch('Vorhaben ohne vorhaben.json: ' + join(ordner, name));
    }
    const roh = liesJson(pfad);
    if (typeof roh.id !== 'string' || !roh.id) {
      abbruch('Vorhaben ohne Kennung: ' + pfad);
    }
    vorgaenge.push({ ordner: name, roh });
  }
  return vorgaenge;
}

/**
 * Die Skilldatei eines Schritts. Genannt ist `skills/<person>/<wert>.md`;
 * ältere Stände tragen den wahren Pfad im Feld `skill`, und die Regel des
 * Produkts ist `skills/<person>/<schritt-id>.md`. Gesucht wird in dieser
 * Reihenfolge; fehlt alles, bleibt die Station ein Textfeld.
 */
function skillQuelle(quelle, workflow, schritt, id) {
  const person = text(schritt.host) || workflow.person;
  const wie = schritt.wie && typeof schritt.wie === 'object' ? schritt.wie : {};
  const kandidaten = [];
  const wert = text(wie.wert).trim();
  if (wert) kandidaten.push(join(quelle, 'skills', person, wert + '.md'));
  const angegeben = text(schritt.skill).trim();
  if (/^skills\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.md$/.test(angegeben)) {
    kandidaten.push(join(quelle, angegeben));
  }
  kandidaten.push(join(quelle, 'skills', person, id + '.md'));
  for (const pfad of kandidaten) {
    if (existsSync(pfad) && statSync(pfad).isFile()) return pfad;
  }
  return null;
}

/** Die Aktion einer Station aus dem alten `wie` und die Skilldatei dazu. */
function aktionPlan(quelle, workflow, schritt, id) {
  const inhalt = text(schritt.inhalt);
  const wie = schritt.wie && typeof schritt.wie === 'object' ? schritt.wie : {};
  const art = text(wie.art);
  if (art === 'skill') {
    const pfad = skillQuelle(quelle, workflow, schritt, id);
    if (pfad) {
      return { aktion: { art: 'skill', datei: AKTIONSDATEI }, skillQuelle: pfad };
    }
    return { aktion: { art: 'textfeld', wert: inhalt }, skillQuelle: null };
  }
  if (art === 'datei') {
    return { aktion: { art: 'datei', wert: inhalt }, skillQuelle: null };
  }
  return { aktion: { art: 'textfeld', wert: inhalt }, skillQuelle: null };
}

function stationPlan(quelle, workflow, schritt, id, host) {
  const { aktion, skillQuelle: pfad } = aktionPlan(quelle, workflow, schritt, id);
  const inhalt = text(schritt.inhalt);
  return {
    id,
    skillQuelle: pfad,
    json: {
      format: 2,
      id,
      name: text(schritt.name) || id,
      beschreibung: inhalt,
      host,
      eingang: liste(schritt.eingang).map((eintrag) => String(eintrag)).filter(Boolean),
      ausgabe: liste(schritt.ausgabe).map((eintrag) => String(eintrag)).filter(Boolean),
      aktion,
      beispiele: [],
      reife: 'erprobt',
      lizenz: 'nicht angegeben',
      tags: [],
    },
  };
}

function workflowPlan(workflow, host) {
  const roh = workflow.roh;
  const schritte = liste(roh.schritte).filter((schritt) => schritt
    && typeof schritt === 'object' && text(schritt.id).trim());
  const ids = [];
  for (const schritt of schritte) {
    const id = text(schritt.id).trim();
    if (!ids.includes(id)) ids.push(id);
  }
  const stationen = new Set(ids);

  const positionen = liste(roh.positionen).map((position) => {
    if (!position || typeof position !== 'object') {
      abbruch('Position ohne Objekt im Workflow „' + workflow.id + '“');
    }
    const id = text(position.id).trim();
    const station = text(position.schritt).trim();
    if (!id) abbruch('Position ohne Kennung im Workflow „' + workflow.id + '“');
    if (!stationen.has(station)) {
      abbruch('Position „' + id + '“ im Workflow „' + workflow.id
        + '“ verweist auf keinen Schritt: ' + JSON.stringify(station));
    }
    return {
      id,
      station,
      x: zahl(position.x, 'positionen[].x'),
      y: zahl(position.y, 'positionen[].y'),
      bedingung: liste(position.bedingung).map((eintrag) => String(eintrag)),
    };
  });
  const positionsIds = new Set();
  for (const position of positionen) {
    if (positionsIds.has(position.id)) {
      abbruch('Die Position „' + position.id + '“ steht im Workflow „'
        + workflow.id + '“ doppelt');
    }
    positionsIds.add(position.id);
  }

  const kanten = liste(roh.kanten).map((kante) => {
    const von = text(kante && kante.von).trim();
    const nach = text(kante && kante.nach).trim();
    if (!positionsIds.has(von) || !positionsIds.has(nach)) {
      abbruch('Die Kante ' + JSON.stringify([von, nach]) + ' im Workflow „'
        + workflow.id + '“ verbindet keine zwei Positionen');
    }
    return { von, nach };
  });

  return {
    id: workflow.id,
    titel: text(roh.titel) || workflow.id,
    schritte,
    json: {
      format: 2,
      id: workflow.id,
      titel: text(roh.titel) || workflow.id,
      beschreibung: '',
      autor: host,
      stationen: ids.map((id) => ({ repo: 'station-' + id, fassung: 'v1', id })),
      positionen,
      kanten,
      layout: roh.layout === 'frei' ? 'frei' : 'auto',
      regeln: {},
    },
  };
}

/** Der Repo-Name des alten Zweigs: `vorhaben-<von>`, sonst `null`. */
function zweigName(zweig) {
  if (!zweig || typeof zweig !== 'object' || Array.isArray(zweig)) return null;
  const von = text(zweig.von).trim();
  return von ? 'vorhaben-' + von : null;
}

function vorhabenPlan(vorgang, workflows, host) {
  const roh = vorgang.roh;
  const position = text(roh.position).trim();
  if (!position) abbruch('Vorhaben „' + vorgang.ordner + '“ nennt keine Position');
  const workflow = workflows.find((eintrag) => liste(eintrag.roh.positionen)
    .some((eintragPosition) => eintragPosition
      && text(eintragPosition.id).trim() === position)) || workflows[0];

  const verantwortliche = {};
  const alt = roh.verantwortliche;
  if (alt && typeof alt === 'object' && !Array.isArray(alt)) {
    for (const [stelle, logins] of Object.entries(alt)) {
      verantwortliche[stelle] = liste(logins)
        .map((login) => (login === 'p1' ? host : String(login)));
    }
  }

  return {
    ordner: vorgang.ordner,
    json: {
      format: 2,
      id: vorgang.ordner,
      name: text(roh.name) || vorgang.ordner,
      workflow: { repo: 'workflow-' + workflow.id, fassung: 'v1' },
      position,
      verantwortliche,
      laeufe: liste(roh.laeufe),
      fork_von: null,
      zweig_von: zweigName(roh.zweig_von),
      farbe: farbeOder(text(roh.farbe), STANDARDFARBE),
    },
  };
}

function boardPlan({ id, name, art, personen, workflows, vorhaben, stationen }) {
  return {
    id,
    name,
    art,
    repo: 'board-' + id,
    sichtbar: art === 'hauptboard' ? 'öffentlich' : 'privat',
    json: {
      format: 2,
      id,
      name,
      art,
      personen,
      workflows: workflows.map((workflow) => ({
        repo: 'workflow-' + workflow.id,
        fassung: 'v1',
      })),
      vorhaben: vorhaben.map((vorhabenEintrag) => ({
        repo: 'vorhaben-' + vorhabenEintrag.ordner,
      })),
      stationen: stationen.map((station) => ({ repo: 'station-' + station.id })),
      einstellungen: {},
      layout: {},
    },
  };
}

function ersterSatz(wert) {
  const sauber = text(wert).trim().replace(/\s+/g, ' ');
  const treffer = /^.*?[.!?](?=\s|$)/.exec(sauber);
  return treffer ? treffer[0] : sauber;
}

function aufzaehlung(werte) {
  return werte.length ? werte.map((wert) => '`' + wert + '`').join(', ') : '—';
}

function aktionsName(aktion) {
  if (aktion.art === 'skill') return 'Skill (`' + AKTIONSDATEI + '`)';
  if (aktion.art === 'datei') return 'Datei';
  return 'Textfeld';
}

function stationReadme(station) {
  const json = station.json;
  const zeilen = ['# ' + json.name, ''];
  if (json.beschreibung) zeilen.push(ersterSatz(json.beschreibung), '');
  zeilen.push('- **Eingang:** ' + aufzaehlung(json.eingang));
  zeilen.push('- **Ausgabe:** ' + aufzaehlung(json.ausgabe));
  zeilen.push('- **Aktionsart:** ' + aktionsName(json.aktion));
  zeilen.push('');
  zeilen.push('Die Angaben dieser Station stehen in `station.json`.');
  if (json.aktion.art === 'skill') zeilen.push('Die Anweisung liegt in `' + AKTIONSDATEI + '`.');
  zeilen.push('');
  return zeilen.join('\n');
}

function workflowReadme(workflow) {
  const json = workflow.json;
  const zeilen = ['# ' + json.titel, ''];
  zeilen.push('- **Autor:** ' + json.autor);
  zeilen.push('- **Layout:** ' + json.layout);
  zeilen.push('');
  zeilen.push('**Stationen (' + json.stationen.length + '):**');
  for (const verweis of json.stationen) {
    const schritt = workflow.schritte
      .find((eintrag) => text(eintrag.id).trim() === verweis.id);
    zeilen.push('- `' + verweis.id + '` — ' + (schritt ? text(schritt.name) : '')
      + ' (`' + verweis.repo + '`, `' + verweis.fassung + '`)');
  }
  zeilen.push('');
  zeilen.push('Die Angaben dieses Workflows stehen in `workflow.json`.');
  zeilen.push('');
  return zeilen.join('\n');
}

function boardReadme(board) {
  const json = board.json;
  const zeilen = ['# ' + json.name, ''];
  zeilen.push('- **Art:** ' + json.art);
  zeilen.push('- **Sichtbarkeit:** ' + board.sichtbar);
  zeilen.push('- **Personen:** ' + json.personen
    .map((person) => person.login + ' (' + person.name + ')').join(', '));
  zeilen.push('- **Stationen:** ' + json.stationen.length);
  zeilen.push('- **Workflows:** ' + aufzaehlung(json.workflows
    .map((workflow) => workflow.repo + ' (' + workflow.fassung + ')')));
  zeilen.push('- **Vorhaben:** ' + aufzaehlung(json.vorhaben
    .map((vorhaben) => vorhaben.repo)));
  zeilen.push('');
  zeilen.push('Die Angaben dieses Boards stehen in `board.json`.');
  zeilen.push('');
  return zeilen.join('\n');
}

function changelogText(datum) {
  return [
    '# Änderungen',
    '',
    '## v1 — ' + datum,
    '',
    'Aus der Ablage der Fassung 1 übernommen.',
    '',
  ].join('\n');
}

function berichtText({ datum, quelle, ziel, host, geschrieben }) {
  const zeilen = [
    '# Umzug auf Fassung 2',
    '',
    '- **Datum:** ' + datum,
    '- **Quelle:** ' + quelle,
    '- **Ziel:** ' + ziel,
    '- **Host:** ' + host,
    '',
  ];
  const arten = [
    ['Stationen', geschrieben.stationen],
    ['Workflow', geschrieben.workflows],
    ['Vorhaben', geschrieben.vorhaben],
    ['Boards', geschrieben.boards],
  ];
  for (const [titel, eintraege] of arten) {
    zeilen.push('## ' + titel + ' (' + eintraege.length + ')');
    for (const eintrag of eintraege) {
      zeilen.push('- `' + eintrag.repo + '` — ' + eintrag.name);
    }
    if (!eintraege.length) zeilen.push('- —');
    zeilen.push('');
  }
  return zeilen.join('\n');
}

/** Kopiert alle Dateien eines Ordners; `.git` bleibt draußen. */
function kopiereDateien(von, nach, ausnahme) {
  for (const eintrag of readdirSync(von, { withFileTypes: true })) {
    if (eintrag.name === '.git') continue;
    const quelle = join(von, eintrag.name);
    if (eintrag.isDirectory()) {
      kopiereDateien(quelle, join(nach, eintrag.name), new Set());
    } else if (eintrag.isFile()) {
      if (ausnahme && ausnahme.has(eintrag.name)) continue;
      mkdirSync(nach, { recursive: true });
      copyFileSync(quelle, join(nach, eintrag.name));
    }
  }
}

function pruefeArgumente(werte) {
  if (!werte.quelle) abbruch('Es fehlt --quelle (die Ablage der Fassung 1).');
  if (!werte.ziel) abbruch('Es fehlt --ziel (der Ordner für die neuen Repositories).');
  if (!werte.host) abbruch('Es fehlt --host (der GitHub-Name für die neuen Repositories).');
  const host = werte.host.trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(host)) {
    abbruch('--host ist kein GitHub-Name: ' + JSON.stringify(werte.host));
  }
  return host;
}

function main() {
  const werte = liesArgumente(process.argv.slice(2));
  const host = pruefeArgumente(werte);
  const quelle = resolve(werte.quelle);
  const ziel = resolve(werte.ziel);
  const bericht = werte.bericht ? resolve(werte.bericht) : join(ziel, 'umzug.md');

  if (!existsSync(quelle) || !statSync(quelle).isDirectory()) {
    abbruch('Die Quelle fehlt oder ist kein Ordner: ' + quelle);
  }
  const formatPfad = join(quelle, 'format');
  if (!existsSync(formatPfad)) {
    abbruch('Die Quelle ist keine Ablage der Fassung 1: ' + quelle
      + ' nennt kein „format“.');
  }
  const format = readFileSync(formatPfad, 'utf8').trim();
  if (format !== '1') {
    abbruch('Die Quelle ist keine Ablage der Fassung 1: ' + quelle
      + ' nennt Format „' + format + '“, erwartet „1“.');
  }

  if (innen(quelle, ziel)) {
    abbruch('Das Ziel liegt in der Quelle; die Quelle bleibt unverändert: ' + ziel);
  }
  if (innen(quelle, bericht)) {
    abbruch('Der Bericht läge in der Quelle: ' + bericht);
  }
  if (existsSync(ziel)) {
    if (!statSync(ziel).isDirectory()) abbruch('Das Ziel ist kein Ordner: ' + ziel);
    if (readdirSync(ziel).length > 0) {
      abbruch('Das Ziel ist nicht leer: ' + ziel + '. Es wird nichts überschrieben.');
    }
  }

  // Erst alles lesen und prüfen; geschrieben wird danach.
  const personen = liesPersonen(quelle);
  const workflows = liesWorkflows(quelle);
  if (!workflows.length) abbruch('Die Quelle enthält keinen Workflow.');
  const vorgaenge = liesVorgaenge(quelle);

  const person = personen.get('p1') || personen.values().next().value
    || { id: 'p1', name: '', farbe: STANDARDFARBE };

  const stationen = [];
  const gesehen = new Set();
  for (const workflow of workflows) {
    for (const schritt of liste(workflow.roh.schritte)) {
      if (!schritt || typeof schritt !== 'object') continue;
      const id = text(schritt.id).trim();
      if (!id) {
        abbruch('Schritt ohne Kennung im Workflow „' + workflow.id + '“');
      }
      if (gesehen.has(id)) continue;
      gesehen.add(id);
      stationen.push(stationPlan(quelle, workflow, schritt, id, host));
    }
  }
  if (!stationen.length) abbruch('Die Quelle enthält keinen Schritt.');

  const workflowsPlan = workflows.map((workflow) => workflowPlan(workflow, host));

  const vorhaben = vorgaenge.map((vorgang) => vorhabenPlan(vorgang, workflows, host));

  const personenEintrag = [{
    login: host,
    name: person.name || host,
    farbe: person.farbe,
  }];
  const hauptboard = boardPlan({
    id: 'hauptboard',
    name: 'Hauptboard',
    art: 'hauptboard',
    personen: personenEintrag,
    workflows: workflowsPlan,
    vorhaben: [],
    stationen,
  });
  const team = boardPlan({
    id: 'team',
    name: 'Team',
    art: 'team',
    personen: personenEintrag,
    workflows: workflowsPlan,
    vorhaben,
    stationen,
  });
  const boards = [hauptboard, team];

  // Schreiben.
  mkdirSync(ziel, { recursive: true });
  const datum = new Date().toISOString().slice(0, 10);
  const geschrieben = {
    stationen: [], workflows: [], vorhaben: [], boards: [], sichtbarkeit: {},
  };

  for (const station of stationen) {
    const repo = 'station-' + station.id;
    const ordner = join(ziel, repo);
    mkdirSync(ordner, { recursive: true });
    schreibeJson(join(ordner, 'station.json'), station.json);
    schreibeText(join(ordner, 'README.md'), stationReadme(station));
    if (station.skillQuelle) copyFileSync(station.skillQuelle, join(ordner, AKTIONSDATEI));
    schreibeText(join(ordner, 'CHANGELOG.md'), changelogText(datum));
    festschreiben(ordner, 'Station „' + station.json.name
      + '“ aus der Ablage der Fassung 1 übernommen', 'v1');
    geschrieben.stationen.push({ repo, name: station.json.name });
    geschrieben.sichtbarkeit[repo] = 'öffentlich';
  }

  for (const workflow of workflowsPlan) {
    const repo = 'workflow-' + workflow.id;
    const ordner = join(ziel, repo);
    mkdirSync(ordner, { recursive: true });
    schreibeJson(join(ordner, 'workflow.json'), workflow.json);
    schreibeText(join(ordner, 'README.md'), workflowReadme(workflow));
    festschreiben(ordner, 'Workflow „' + workflow.titel
      + '“ aus der Ablage der Fassung 1 übernommen', 'v1');
    geschrieben.workflows.push({ repo, name: workflow.titel });
    geschrieben.sichtbarkeit[repo] = 'öffentlich';
  }

  for (const eintrag of vorhaben) {
    const repo = 'vorhaben-' + eintrag.ordner;
    const ordner = join(ziel, repo);
    mkdirSync(ordner, { recursive: true });
    schreibeJson(join(ordner, 'vorhaben.json'), eintrag.json);
    kopiereDateien(join(quelle, 'vorgaenge', eintrag.ordner), ordner,
      new Set(['vorhaben.json']));
    festschreiben(ordner, 'Vorhaben „' + eintrag.json.name
      + '“ aus der Ablage der Fassung 1 übernommen');
    geschrieben.vorhaben.push({ repo, name: eintrag.json.name });
    geschrieben.sichtbarkeit[repo] = 'privat';
  }

  for (const board of boards) {
    const repo = board.repo;
    const ordner = join(ziel, repo);
    mkdirSync(ordner, { recursive: true });
    schreibeJson(join(ordner, 'board.json'), board.json);
    schreibeText(join(ordner, 'README.md'), boardReadme(board));
    festschreiben(ordner, 'Board „' + board.name
      + '“ aus der Ablage der Fassung 1 übernommen');
    geschrieben.boards.push({ repo, name: board.name });
    geschrieben.sichtbarkeit[repo] = board.sichtbar;
  }

  schreibeJson(join(ziel, 'sichtbarkeit.json'), geschrieben.sichtbarkeit);
  schreibeText(bericht, berichtText({ datum, quelle, ziel, host, geschrieben }));

  console.log('ok ' + geschrieben.stationen.length + ' Stationen, '
    + geschrieben.workflows.length + ' Workflow, '
    + geschrieben.vorhaben.length + ' Vorhaben, '
    + geschrieben.boards.length + ' Boards');
  console.log('ok Bericht: ' + bericht);
}

try {
  main();
} catch (fehler) {
  console.error('FEHLER: ' + String((fehler && fehler.message) || fehler));
  process.exit(1);
}
